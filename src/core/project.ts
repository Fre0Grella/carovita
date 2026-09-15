/**
 * Motore di proiezione: da (profilo + snapshot dati) a previsione con
 * attribuzione per categoria. Funzione pura e deterministica.
 */

import {
  aggregateHalfWidths,
  averageCategoryCorrelation,
  cumulativeIndex,
  estimateAllModels,
  estimateCategoryModel,
  forecastRate,
  modelFor,
  uncertaintyBand,
  type RateDecomposition,
} from './model.js';
import { buildRentSchedule, computeShare, contractLabel } from './rent.js';
import { monthIndex, monthLabel, shortMonthLabel } from './series.js';
import type {
  Attribution,
  CategoryId,
  CategoryModel,
  CategoryYearProjection,
  DataSnapshot,
  ExpenseItem,
  Period,
  Profile,
  ProjectionEvent,
  ProjectionResult,
  ScenarioSettings,
  YearProjection,
} from './types.js';

/** Mese corrente in formato `YYYY-MM`. */
export function currentMonth(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export const DEFAULT_SCENARIO: ScenarioSettings = {
  startMonth: currentMonth(),
  horizon: 15,
  anchorOverride: null,
  confidence: 0.8,
};

/**
 * Costruisce i periodi di proiezione: finestre di dodici mesi a partire dal
 * mese indicato.
 *
 * Ancorare i periodi al mese corrente invece che all'anno solare evita
 * l'errore piu' vistoso per chi apre l'applicazione a meta' anno: imputare
 * una spesa annua intera a un anno di cui restano pochi mesi. L'ultimo
 * periodo puo' essere parziale, cosi' un orizzonte di un anno e mezzo copre
 * davvero diciotto mesi e non due anni.
 */
export function buildPeriods(startMonth: string, horizon: number): Period[] {
  const count = Math.max(1, Math.ceil(horizon - 1e-9));
  const start = monthIndex(startMonth);
  const periods: Period[] = [];

  for (let k = 0; k < count; k++) {
    const remaining = horizon - k;
    const fraction = Math.min(1, Math.max(0, remaining));
    const months = Math.max(1, Math.round(fraction * 12));
    const first = monthLabel(start + k * 12);
    const last = monthLabel(start + k * 12 + months - 1);
    const label = shortMonthLabel(first);
    periods.push({
      index: k,
      startMonth: first,
      endMonth: last,
      year: Number(first.slice(0, 4)),
      label,
      labelLong:
        months === 12
          ? `${label} - ${shortMonthLabel(last)}`
          : `${label} - ${shortMonthLabel(last)} (${months} mesi)`,
      fraction,
      months,
    });
  }
  return periods;
}

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
  const { startMonth, horizon, confidence } = settings;
  const periods = buildPeriods(startMonth, horizon);
  const baseYear = periods[0]!.year;

  // Correlazione media fra categorie: governa quanto le loro incertezze si
  // sommano invece di compensarsi.
  const rho = averageCategoryCorrelation(snapshot);

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
  // Le incoerenze nelle metrature della coabitazione vanno mostrate
  // all'utente, non assorbite in silenzio.
  for (const w of computeShare(profile.housing).warnings) {
    if (!warnings.includes(w)) warnings.push(w);
  }
  const initialRent = resolveInitialRent(profile, snapshot, warnings);
  const rentSchedule = buildRentSchedule({
    periods,
    housing: profile.housing,
    initialMonthlyRent: initialRent,
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

  /**
   * Percorso dei prezzi di una voce: la previsione del modello, oppure il
   * tasso costante scelto dall'utente se ha deciso di sostituirla.
   */
  const pathForItem = (
    item: ExpenseItem,
  ): ReturnType<typeof cumulativeIndex> => {
    if (item.growthOverride === null) return pathByCategory.get(item.category)!;
    const g = item.growthOverride;
    return Array.from({ length: horizon + 1 }, (_, k) => ({
      level: Math.pow(1 + g, k),
      rate: { anchor: 0, spread: 0, persistence: 0, total: k === 0 ? 0 : g },
    }));
  };

  const years: YearProjection[] = [];
  let wealth = profile.initialSavings;
  // Stesse ricorsioni sugli estremi della banda di spesa: spendendo di piu'
  // si accumula di meno, quindi la spesa alta genera il patrimonio basso.
  let wealthLo = profile.initialSavings;
  let wealthHi = profile.initialSavings;

  for (let h = 0; h < periods.length; h++) {
    const period = periods[h]!;
    const year = period.year;
    // Un periodo parziale vale in proporzione ai mesi che copre.
    const f = period.fraction;
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
      const overridden = item.growthOverride !== null;
      const path = pathForItem(item);
      const base = item.monthlyAmount * 12 * f;
      const nominal = base * path[h]!.level;
      // Con un tasso scelto dall'utente l'incertezza del modello non si
      // applica: l'ipotesi e' sua, e disegnarle intorno una banda statistica
      // suggerirebbe una precisione che non esiste.
      const band = overridden
        ? { lo: 1, hi: 1 }
        : uncertaintyBand(model, h, confidence);
      const decomp = h === 0 ? zeroRate() : path[h]!.rate;

      categories.push({
        category: item.category,
        label: item.label,
        year,
        nominal,
        real: nominal / priceLevel,
        lo: nominal * band.lo,
        hi: nominal * band.hi,
        attribution: splitAttribution(base, nominal, decomp, h, overridden),
        rate: decomp.total,
      });
    }

    const totalNominal = categories.reduce((a, c) => a + c.nominal, 0);
    // Le bande si aggregano secondo la correlazione stimata, non sommando gli
    // estremi: sommarli assumerebbe che tutte le categorie sbaglino insieme.
    const totalLo =
      totalNominal -
      aggregateHalfWidths(
        categories.map((c) => c.nominal - c.lo),
        rho,
      );
    const totalHi =
      totalNominal +
      aggregateHalfWidths(
        categories.map((c) => c.hi - c.nominal),
        rho,
      );

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
      Math.pow(1 + profile.income.realGrowth, h) *
      f;

    const savings = incomeNominal - totalNominal;
    const savingsLo = incomeNominal - totalHi;
    const savingsHi = incomeNominal - totalLo;
    if (h > 0) {
      const r = 1 + profile.savingsReturn;
      wealth = wealth * r + savings;
      wealthLo = wealthLo * r + savingsLo;
      wealthHi = wealthHi * r + savingsHi;
    } else {
      wealth = profile.initialSavings + savings;
      wealthLo = profile.initialSavings + savingsLo;
      wealthHi = profile.initialSavings + savingsHi;
    }

    years.push({
      year,
      label: period.label,
      labelLong: period.labelLong,
      fraction: f,
      priceLevel,
      totalNominal,
      totalReal: totalNominal / priceLevel,
      totalLo,
      totalHi,
      incomeNominal,
      savingsNominal: savings,
      cumulativeWealth: wealth,
      cumulativeWealthLo: wealthLo,
      cumulativeWealthHi: wealthHi,
      categories,
      events,
    });
  }

  return {
    profileId: profile.id,
    profileName: profile.name,
    startMonth: periods[0]!.startMonth,
    endMonth: periods[periods.length - 1]!.endMonth,
    baseYear,
    years,
    models,
    anchor,
    categoryCorrelation: rho,
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
  overridden = false,
): Attribution {
  const empty: Attribution = {
    base,
    fromAnchor: 0,
    fromSpread: 0,
    fromPersistence: 0,
    fromOverride: 0,
    fromContract: 0,
  };
  if (h === 0) return empty;

  const delta = final - base;

  // Se l'utente ha imposto il tasso non c'e' nulla da scomporre: l'intero
  // aumento discende dalla sua ipotesi, non dal modello.
  if (overridden) return { ...empty, fromOverride: delta };

  const priceComponent = rate.anchor + rate.spread + rate.persistence;
  const denom = Math.abs(priceComponent) < 1e-12 ? 1 : priceComponent;
  return {
    base,
    fromAnchor: (delta * rate.anchor) / denom,
    fromSpread: (delta * rate.spread) / denom,
    fromPersistence: (delta * rate.persistence) / denom,
    fromOverride: 0,
    fromContract: 0,
  };
}

/**
 * Determina il canone iniziale dell'**intera** abitazione: se l'utente non lo
 * specifica, lo stima dal costo medio al metro quadro della citta' e della
 * zona scelte. La ripartizione fra coinquilini avviene piu' a valle, in
 * `buildRentSchedule`, perche' alcune regole (il minimo dell'imposta di
 * registro) vivono a livello di contratto.
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

/**
 * Crescita annua media prevista dal modello per ciascuna categoria,
 * sull'orizzonte indicato.
 *
 * Il modello prevede un tasso diverso ogni anno, perche' lo scostamento
 * iniziale rientra gradualmente. Per mostrare all'utente un numero solo si
 * usa il tasso composto equivalente: quello che, applicato costante, porta
 * allo stesso livello finale. E' il valore che determina davvero la spesa a
 * fine orizzonte, ed e' quindi quello onesto da esporre.
 */
export function forecastRatesByCategory(
  models: CategoryModel[],
  anchor: number,
  horizon: number,
): Map<CategoryId, number> {
  const out = new Map<CategoryId, number>();
  if (horizon <= 0) return out;
  for (const m of models) {
    const path = cumulativeIndex(m, anchor, horizon);
    const level = path[horizon]!.level;
    out.set(m.category, Math.pow(level, 1 / horizon) - 1);
  }
  return out;
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
  /** Risparmio del primo anno, in EUR (negativo se si intacca il patrimonio). */
  savingsFirstYear: number;
  /**
   * Primo anno in cui il patrimonio scende sotto zero, oppure `null` se non
   * accade entro l'orizzonte. È la risposta alla domanda «fino a
   * quando reggo?».
   */
  depletionYear: number | null;
  /** Come sopra, ma nello scenario di spesa alta. */
  depletionYearLo: number | null;
}

export function summarize(result: ProjectionResult): ProfileSummary {
  const first = result.years[0]!;
  const last = result.years[result.years.length - 1]!;
  const n = result.years.length - 1;
  const cumulativeSpend = result.years.reduce((a, y) => a + y.totalNominal, 0);
  // Il tasso di crescita va calcolato su importi annualizzati: confrontare un
  // periodo pieno con uno parziale darebbe una crescita fittiziamente
  // negativa.
  const lastAnnualised = last.fraction > 0 ? last.totalNominal / last.fraction : 0;
  const cagr =
    n > 0 && first.totalNominal > 0
      ? Math.pow(lastAnnualised / first.totalNominal, 1 / n) - 1
      : 0;
  const firstNegative = (pick: (y: YearProjection) => number): number | null =>
    result.years.find((y) => pick(y) < 0)?.year ?? null;

  return {
    profileId: result.profileId,
    profileName: result.profileName,
    savingsFirstYear: first.savingsNominal,
    depletionYear: firstNegative((y) => y.cumulativeWealth),
    depletionYearLo: firstNegative((y) => y.cumulativeWealthLo),
    baseSpend: first.totalNominal,
    finalSpend: lastAnnualised,
    finalSpendReal: last.priceLevel > 0 ? lastAnnualised / last.priceLevel : 0,
    cumulativeSpend,
    finalWealth: last.cumulativeWealth,
    finalWealthReal: last.cumulativeWealth / last.priceLevel,
    cagr,
  };
}

export { contractLabel };
