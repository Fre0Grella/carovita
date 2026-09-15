/**
 * Motore di proiezione: da (profilo + snapshot dati) a previsione con
 * attribuzione per categoria. Funzione pura e deterministica.
 */

import {
  cumulativeIndex,
  estimateAllModels,
  estimateCategoryModel,
  forecastRate,
  modelFor,
  uncertaintyBand,
  type RateDecomposition,
} from './model.js';
import { buildRentSchedule, contractLabel } from './rent.js';
import type {
  Attribution,
  CategoryModel,
  CategoryYearProjection,
  DataSnapshot,
  ExpenseItem,
  Profile,
  ProjectionEvent,
  ProjectionResult,
  ScenarioSettings,
  YearProjection,
} from './types.js';

export const DEFAULT_SCENARIO: ScenarioSettings = {
  baseYear: new Date().getFullYear(),
  horizon: 15,
  anchorOverride: null,
  confidence: 0.8,
};

/**
 * Calcola la proiezione completa per un profilo.
 *
 * L'attribuzione si basa su una scomposizione controfattuale: si calcola la
 * spesa in scenari via via più ricchi e si attribuisce a ciascun fattore la
 * differenza che introduce.
 *
 *   1. `base`            spesa dell'anno base, ferma
 *   2. `+ anchor`        solo inflazione generale di lungo periodo
 *   3. `+ spread`        aggiunge il differenziale strutturale di categoria
 *   4. `+ persistence`   aggiunge il rientro dal livello corrente
 *   5. `+ realGrowth`    aggiunge la crescita reale scelta dall'utente
 *
 * Le differenze fra passi consecutivi sommano esattamente alla spesa finale,
 * quindi il grafico a cascata chiude sempre senza residui.
 */
export function project(
  profile: Profile,
  snapshot: DataSnapshot,
  settings: ScenarioSettings = DEFAULT_SCENARIO,
): ProjectionResult {
  const warnings: string[] = [...snapshot.warnings];
  const models = estimateAllModels(snapshot);
  const anchor = settings.anchorOverride ?? snapshot.longRunAnchor;
  const { baseYear, horizon, confidence } = settings;

  const headlineModel = modelFor(models, 'headline');
  if (!headlineModel) {
    throw new Error('Modello headline mancante: snapshot non valido.');
  }

  // Livello generale dei prezzi: serve per convertire nominale -> reale.
  const headlinePath = cumulativeIndex(headlineModel, anchor, horizon);

  // Indice del canone di mercato, per il riallineamento a fine contratto.
  const rentModel = modelFor(models, 'rent') ?? headlineModel;
  if (!modelFor(models, 'rent')) {
    warnings.push(
      'Serie affitti non disponibile: uso l’indice generale come ' +
        'approssimazione per il canone di mercato.',
    );
  }
  const rentPath = cumulativeIndex(rentModel, anchor, horizon);
  const marketIndex = rentPath.map((p) => p.level);

  // Aggiornamento ISTAT dei canoni: per legge si basa sul FOI (ISTAT). Se la
  // serie non e' disponibile si usa l'indice generale, segnalandolo.
  let foiModel: CategoryModel = headlineModel;
  if (snapshot.foi) {
    foiModel = estimateCategoryModel(snapshot.foi, snapshot.series.headline!);
  } else {
    warnings.push(
      'Indice FOI non disponibile: l’aggiornamento ISTAT del canone ' +
        'viene stimato sull’indice generale dei prezzi al consumo.',
    );
  }
  const foiRates: number[] = [0];
  for (let h = 1; h <= horizon; h++) {
    foiRates.push(forecastRate(foiModel, anchor, h).total);
  }

  // Le spese condominiali seguono i prezzi di manutenzione dell'abitazione,
  // non restano ferme in termini nominali.
  const condoModel = modelFor(models, 'maintenance') ?? headlineModel;
  const condoIndex = cumulativeIndex(condoModel, anchor, horizon).map(
    (p) => p.level,
  );

  // --- Abitazione -----------------------------------------------------------
  const initialRent = resolveInitialRent(profile, snapshot, warnings);
  const rentSchedule = buildRentSchedule({
    housing: profile.housing,
    initialMonthlyRent: initialRent,
    baseYear,
    horizon,
    marketIndex,
    foiRates,
    condoIndex,
  });

  // --- Voci di spesa ordinarie ---------------------------------------------
  const items: ExpenseItem[] = [...profile.utilities, ...profile.expenses];

  // L'indice cumulato dipende solo dalla categoria, non dall'anno: si calcola
  // una volta sola per categoria invece che a ogni iterazione del ciclo.
  const pathByCategory = new Map<string, ReturnType<typeof cumulativeIndex>>();
  for (const item of items) {
    if (pathByCategory.has(item.category)) continue;
    const model = modelFor(models, item.category) ?? headlineModel;
    if (!modelFor(models, item.category)) {
      const msg =
        `Serie non disponibile per la categoria "${item.category}": ` +
        'uso l’indice generale.';
      if (!warnings.includes(msg)) warnings.push(msg);
    }
    pathByCategory.set(item.category, cumulativeIndex(model, anchor, horizon));
  }

  const years: YearProjection[] = [];
  let wealth = profile.initialSavings;

  for (let h = 0; h <= horizon; h++) {
    const year = baseYear + h;
    const priceLevel = headlinePath[h]!.level;
    const categories: CategoryYearProjection[] = [];
    const events: ProjectionEvent[] = [...(rentSchedule[h]?.events ?? [])];

    // Voce abitazione, trattata a parte perche' segue le regole contrattuali.
    const rentYear = rentSchedule[h]!;
    if (rentYear.total > 0) {
      const contractual = rentYear.total;
      const base0 = rentSchedule[0]!;

      // Controfattuale: il solo canone segue il mercato, mentre le spese
      // accessorie (condominio, imposte) seguono le proprie regole. Mescolarle
      // attribuirebbe al "mercato degli affitti" anche la crescita delle
      // spese condominiali, falsando l'attribuzione.
      const naiveRent =
        h === 0
          ? base0.annualRent
          : (base0.annualRent * marketIndex[h]!) / marketIndex[0]!;
      const ancillary = rentYear.condoFees + rentYear.registrationTax + rentYear.stampDuty;
      const naive = naiveRent + ancillary;

      const rentBand = uncertaintyBand(rentModel, h, confidence);
      const rentDecomp = h === 0 ? zeroRate() : rentPath[h]!.rate;
      const split = splitAttribution(
        base0.annualRent + base0.condoFees + base0.registrationTax + base0.stampDuty,
        naive,
        rentDecomp,
        h,
        0,
      );
      // Lo scarto residuo fra canone di mercato e canone contrattuale e'
      // l'effetto delle regole del contratto.
      split.fromContract = contractual - naive;

      categories.push({
        category: 'rent',
        label: 'Abitazione (canone, imposte, condominio)',
        year,
        nominal: contractual,
        real: contractual / priceLevel,
        lo: contractual * rentBand.lo,
        hi: contractual * rentBand.hi,
        attribution: split,
        rate: rentDecomp.total,
      });
    }

    // Tutte le altre voci.
    for (const item of items) {
      const model = modelFor(models, item.category) ?? headlineModel;
      const path = pathByCategory.get(item.category)!;
      const base = item.monthlyAmount * 12;
      const realFactor = Math.pow(1 + item.realGrowth, h);
      const nominal = base * path[h]!.level * realFactor;
      const band = uncertaintyBand(model, h, confidence);
      const decomp = h === 0 ? zeroRate() : path[h]!.rate;

      categories.push({
        category: item.category,
        label: item.label,
        year,
        nominal,
        real: nominal / priceLevel,
        lo: nominal * band.lo,
        hi: nominal * band.hi,
        attribution: splitAttribution(base, nominal, decomp, h, item.realGrowth),
        rate: decomp.total,
      });
    }

    const totalNominal = categories.reduce((a, c) => a + c.nominal, 0);
    const totalLo = categories.reduce((a, c) => a + c.lo, 0);
    const totalHi = categories.reduce((a, c) => a + c.hi, 0);

    // Reddito: indicizzazione parziale all'inflazione + crescita reale.
    // Con pass-through 1 il salario segue interamente il livello dei prezzi,
    // con 0 resta fermo in termini nominali.
    const incomeInflation = Math.pow(
      priceLevel,
      profile.income.inflationPassThrough,
    );
    const incomeNominal =
      profile.income.monthlyNet *
      profile.income.monthsPerYear *
      incomeInflation *
      Math.pow(1 + profile.income.realGrowth, h);

    const savings = incomeNominal - totalNominal;
    if (h > 0) {
      wealth = wealth * (1 + profile.savingsReturn) + savings;
    } else {
      wealth = profile.initialSavings + savings;
    }

    years.push({
      year,
      priceLevel,
      totalNominal,
      totalReal: totalNominal / priceLevel,
      totalLo,
      totalHi,
      incomeNominal,
      savingsNominal: savings,
      cumulativeWealth: wealth,
      categories,
      events,
    });
  }

  return {
    profileId: profile.id,
    profileName: profile.name,
    baseYear,
    years,
    models,
    anchor,
    confidence,
    warnings,
  };
}

function zeroRate(): RateDecomposition {
  return { anchor: 0, spread: 0, persistence: 0, total: 0 };
}

/**
 * Attribuisce la differenza `final - base` ai fattori del modello, in
 * proporzione al loro contributo al tasso cumulato.
 *
 * Il tasso a orizzonte h e' `anchor + spread + persistence`; i contributi in
 * euro sono ripartiti proporzionalmente, cosi' la somma degli addendi
 * restituisce esattamente il totale.
 */
function splitAttribution(
  base: number,
  final: number,
  rate: RateDecomposition,
  h: number,
  realGrowth: number,
): Attribution {
  if (h === 0) {
    return {
      base,
      fromAnchor: 0,
      fromSpread: 0,
      fromPersistence: 0,
      fromRealGrowth: 0,
      fromContract: 0,
    };
  }

  const delta = final - base;
  // Quota della crescita reale sul totale della crescita composta.
  const priceComponent = rate.anchor + rate.spread + rate.persistence;
  const totalComponent = priceComponent + realGrowth;
  const realShare =
    Math.abs(totalComponent) < 1e-12 ? 0 : realGrowth / totalComponent;
  const fromRealGrowth = delta * realShare;
  const priceDelta = delta - fromRealGrowth;

  const denom = Math.abs(priceComponent) < 1e-12 ? 1 : priceComponent;
  return {
    base,
    fromAnchor: (priceDelta * rate.anchor) / denom,
    fromSpread: (priceDelta * rate.spread) / denom,
    fromPersistence: (priceDelta * rate.persistence) / denom,
    fromRealGrowth,
    fromContract: 0,
  };
}

/**
 * Determina il canone iniziale: se l'utente non lo specifica, lo stima dal
 * costo medio al metro quadro della citta' e della zona scelte.
 */
export function resolveInitialRent(
  profile: Profile,
  snapshot: DataSnapshot,
  warnings: string[],
): number {
  const h = profile.housing;
  if (h.contractType === 'proprieta') return 0;
  if (h.monthlyRent !== null && h.monthlyRent > 0) return h.monthlyRent;

  const city = snapshot.cities.find((c) => c.istatCode === h.istatCode);
  if (!city) {
    warnings.push(
      `Comune ${h.istatCode} non trovato nel dataset dei canoni: ` +
        'inserisci il canone manualmente.',
    );
    return 0;
  }
  const perM2 = city.eurM2Month[h.zone];
  return perM2 * h.sqm;
}

/** Riepilogo compatto di un profilo, per la tabella di confronto. */
export interface ProfileSummary {
  profileId: string;
  profileName: string;
  /** Spesa annua nell'anno base, in EUR. */
  baseSpend: number;
  /** Spesa annua nell'ultimo anno, in EUR nominali. */
  finalSpend: number;
  /** Spesa annua nell'ultimo anno, in EUR costanti dell'anno base. */
  finalSpendReal: number;
  /** Spesa totale cumulata sull'orizzonte, in EUR nominali. */
  cumulativeSpend: number;
  /** Risparmio cumulato a fine orizzonte, in EUR nominali. */
  finalWealth: number;
  /** Risparmio cumulato a fine orizzonte, in EUR costanti. */
  finalWealthReal: number;
  /** Tasso di crescita annuo composto della spesa, in frazione. */
  cagr: number;
}

export function summarize(result: ProjectionResult): ProfileSummary {
  const first = result.years[0]!;
  const last = result.years[result.years.length - 1]!;
  const n = result.years.length - 1;
  const cumulativeSpend = result.years.reduce((a, y) => a + y.totalNominal, 0);
  const cagr =
    n > 0 && first.totalNominal > 0
      ? Math.pow(last.totalNominal / first.totalNominal, 1 / n) - 1
      : 0;
  return {
    profileId: result.profileId,
    profileName: result.profileName,
    baseSpend: first.totalNominal,
    finalSpend: last.totalNominal,
    finalSpendReal: last.totalReal,
    cumulativeSpend,
    finalWealth: last.cumulativeWealth,
    finalWealthReal: last.cumulativeWealth / last.priceLevel,
    cagr,
  };
}

export { contractLabel };
