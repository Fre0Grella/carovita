/**
 * Modello del canone di locazione e dei costi di registrazione.
 *
 * ## Perché l'affitto non si modella come le altre spese
 *
 * Per tutte le altre categorie basta moltiplicare la spesa per un indice di
 * prezzo. Per l'affitto è sbagliato, e di parecchio.
 *
 * L'indice ISTAT/Eurostat degli affitti (`CP041`) misura il canone *medio di
 * mercato*. Ma un inquilino con un contratto in corso non paga il canone di
 * mercato: paga il canone pattuito, che durante il contratto può essere
 * aggiornato solo con lo scatto ISTAT annuale, ed è al massimo il **75% della
 * variazione FOI** (art. 32 L. 392/1978). Il canone reale è quindi una
 * **funzione a gradini**, non una curva liscia:
 *
 *  - durante il contratto cresce meno del mercato (75% del FOI < mercato);
 *  - alla scadenza, se l'inquilino trasloca o rinegozia, **salta** al livello
 *    di mercato corrente, recuperando di colpo tutto il divario accumulato.
 *
 * Questo produce il tipico profilo a dente di sega che chi affitta conosce
 * bene: anni di aumenti contenuti, poi un salto brusco al cambio casa.
 * Modellarlo come crescita liscia sottostima i costi di chi si sposta spesso
 * e sovrastima quelli di chi resta a lungo nello stesso appartamento.
 *
 * ## Cedolare secca
 *
 * Con l'opzione per la cedolare secca il locatore **rinuncia** per legge alla
 * facoltà di aggiornare il canone (art. 3 D.Lgs. 23/2011): il canone resta
 * nominalmente fermo per tutta la durata del contratto. In termini reali
 * l'inquilino ci guadagna ogni anno. Inoltre non sono dovute imposta di
 * registro né imposta di bollo. È una delle leve che più cambiano il
 * risultato a lungo termine, ed è per questo una voce di configurazione.
 */

import type {
  ContractType,
  HousingConfig,
  ProjectionEvent,
} from './types.js';

/** Aliquota dell'imposta di registro sulle locazioni abitative. */
export const REGISTRATION_TAX_RATE = 0.02;

/**
 * Imposta di registro minima dovuta per ciascuna annualità
 * (art. 5 Tariffa parte I, DPR 131/1986).
 */
export const REGISTRATION_TAX_MIN = 67;

/**
 * Riduzione della base imponibile per i contratti a canone concordato nei
 * comuni ad alta tensione abitativa (art. 8 L. 431/1998).
 */
export const CONCORDATO_TAX_REDUCTION = 0.3;

/**
 * Imposta di bollo: 16 euro ogni 4 facciate / 100 righe, per ogni copia.
 * Si assume un contratto standard in 2 copie, dovuto alla registrazione e a
 * ogni rinnovo (non annualmente).
 */
export const STAMP_DUTY_PER_COPY = 16;
export const STAMP_DUTY_COPIES = 2;

/** Quota massima della variazione FOI applicabile al canone (L. 392/1978). */
export const ISTAT_INDEXATION_CAP = 0.75;

/**
 * Durata contrattuale in anni: periodo iniziale e rinnovo automatico.
 * Alla fine della somma dei due il contratto va rinegoziato.
 */
export function contractTerm(type: ContractType): {
  first: number;
  renewal: number;
} {
  switch (type) {
    case 'libero_4_4':
      return { first: 4, renewal: 4 };
    case 'concordato_3_2':
      return { first: 3, renewal: 2 };
    case 'transitorio':
      // Massimo 18 mesi, senza rinnovo automatico.
      return { first: 1.5, renewal: 0 };
    case 'studenti':
      // Da 6 mesi a 3 anni, rinnovabile per pari durata.
      return { first: 3, renewal: 3 };
    case 'proprieta':
      return { first: Infinity, renewal: 0 };
  }
}

export interface RentYear {
  /** Anno solare. */
  year: number;
  /** Canone mensile medio pagato nell'anno, in EUR. */
  monthlyRent: number;
  /** Canone annuo complessivo, in EUR. */
  annualRent: number;
  /** Imposta di registro a carico dell'inquilino, in EUR. */
  registrationTax: number;
  /** Imposta di bollo a carico dell'inquilino, in EUR. */
  stampDuty: number;
  /** Spese condominiali annue, in EUR. */
  condoFees: number;
  /** Totale abitazione (canone + imposte + condominio), in EUR. */
  total: number;
  /** Quanto il canone pagato si discosta dal canone di mercato (frazione). */
  vsMarket: number;
  events: ProjectionEvent[];
}

export interface RentScheduleInput {
  housing: HousingConfig;
  /** Canone mensile iniziale effettivo, in EUR. */
  initialMonthlyRent: number;
  baseYear: number;
  horizon: number;
  /**
   * Indice cumulato del canone di mercato, lungo `horizon + 1`, con 1
   * all'anno base. Deriva dalla previsione della categoria `rent`.
   */
  marketIndex: number[];
  /**
   * Variazione FOI prevista per ciascun anno, in frazione, lungo
   * `horizon + 1` (l'indice 0, anno base, non viene usato).
   */
  foiRates: number[];
  /**
   * Indice cumulato dei costi di manutenzione dell'abitazione, lungo
   * `horizon + 1`. Indicizza le spese condominiali, che non sono ferme in
   * termini nominali: seguono i prezzi di manutenzione, pulizie e servizi.
   */
  condoIndex: number[];
}

/**
 * Costruisce il profilo annuale dei costi abitativi applicando le regole
 * contrattuali italiane.
 *
 * L'anno base (indice 0) rappresenta la situazione attuale: contiene il
 * canone corrente e l'imposta di registro dell'annualità in corso, ma non
 * lo scatto ISTAT (che scatta all'anniversario successivo).
 */
export function buildRentSchedule(input: RentScheduleInput): RentYear[] {
  const {
    housing,
    initialMonthlyRent,
    baseYear,
    horizon,
    marketIndex,
    foiRates,
    condoIndex,
  } = input;
  const out: RentYear[] = [];

  if (housing.contractType === 'proprieta') {
    for (let h = 0; h <= horizon; h++) {
      const condo = housing.condoFees * 12 * (condoIndex[h] ?? 1);
      out.push({
        year: baseYear + h,
        monthlyRent: 0,
        annualRent: 0,
        registrationTax: 0,
        stampDuty: 0,
        condoFees: condo,
        total: condo,
        vsMarket: 0,
        events: [],
      });
    }
    return out;
  }

  const term = contractTerm(housing.contractType);
  const cycle = term.first + term.renewal;

  // La cedolare secca esclude per legge l'aggiornamento del canone.
  const indexationActive = housing.istatIndexation && !housing.cedolareSecca;

  let monthlyRent = initialMonthlyRent;
  // Anni trascorsi dall'inizio del ciclo contrattuale corrente.
  let yearsInContract = 0;

  for (let h = 0; h <= horizon; h++) {
    const year = baseYear + h;
    const events: ProjectionEvent[] = [];

    if (h > 0) {
      yearsInContract += 1;

      // Fine ciclo contrattuale: rinegoziazione al canone di mercato.
      const cycleEnded = yearsInContract >= cycle;
      if (cycleEnded && housing.movesAtContractEnd) {
        const marketRent = (initialMonthlyRent * marketIndex[h]!) / marketIndex[0]!;
        const jump = marketRent / monthlyRent - 1;
        if (Math.abs(jump) > 0.001) {
          events.push({
            year,
            kind: 'market_reset',
            message:
              `Fine contratto ${contractLabel(housing.contractType)}: il canone si riallinea ` +
              `al mercato (${fmtPct(jump)} rispetto a quanto pagavi).`,
            amount: (marketRent - monthlyRent) * 12,
          });
        }
        monthlyRent = marketRent;
        yearsInContract = 0;
      } else {
        if (cycleEnded) {
          events.push({
            year,
            kind: 'contract_renewal',
            message:
              'Fine contratto: si ipotizza il rinnovo alle stesse condizioni, ' +
              'senza riallineamento al canone di mercato.',
          });
          yearsInContract = 0;
        }
        // Scatto ISTAT all'anniversario: al massimo il 75% della variazione FOI.
        if (indexationActive) {
          const foi = foiRates[h] ?? 0;
          const step = ISTAT_INDEXATION_CAP * foi;
          if (Math.abs(step) > 1e-6) {
            const before = monthlyRent;
            monthlyRent *= 1 + step;
            events.push({
              year,
              kind: 'istat_step',
              message:
                `Aggiornamento ISTAT: +${fmtPct(step)} sul canone ` +
                `(75% della variazione FOI stimata del ${fmtPct(foi)}).`,
              amount: (monthlyRent - before) * 12,
            });
          }
        } else if (housing.cedolareSecca && h === 1) {
          // Una volta sola: ripeterlo a ogni anno seppellirebbe gli eventi
          // che contano davvero, come il riallineamento a fine contratto.
          events.push({
            year,
            kind: 'note',
            message:
              'Cedolare secca: per tutta la durata del contratto il canone ' +
              'resta fermo in euro, quindi ogni anno pesa un po’ meno ' +
              'in termini reali.',
          });
        }
      }
    }

    const annualRent = monthlyRent * 12;
    const { registrationTax, stampDuty } = registrationCosts({
      housing,
      annualRent,
      isFirstYear: h === 0,
      isRenewalYear: h > 0 && yearsInContract === 0,
    });

    if (registrationTax > 0) {
      events.push({
        year,
        kind: 'registration_tax',
        message:
          `Imposta di registro a tuo carico: ${fmtEur(registrationTax)} ` +
          `(${fmtPct(REGISTRATION_TAX_RATE)} del canone annuo, quota ` +
          `${fmtPct(housing.registrationTaxShare)}).`,
        amount: registrationTax,
      });
    }

    const condo = housing.condoFees * 12 * (condoIndex[h] ?? 1);
    const marketRent = (initialMonthlyRent * marketIndex[h]!) / marketIndex[0]!;

    out.push({
      year,
      monthlyRent,
      annualRent,
      registrationTax,
      stampDuty,
      condoFees: condo,
      total: annualRent + registrationTax + stampDuty + condo,
      vsMarket: marketRent > 0 ? monthlyRent / marketRent - 1 : 0,
      events,
    });
  }

  return out;
}

/**
 * Imposta di registro e di bollo a carico dell'inquilino per una annualità.
 * Con la cedolare secca entrambe non sono dovute.
 */
export function registrationCosts(args: {
  housing: HousingConfig;
  annualRent: number;
  isFirstYear: boolean;
  isRenewalYear: boolean;
}): { registrationTax: number; stampDuty: number } {
  const { housing, annualRent, isFirstYear, isRenewalYear } = args;
  if (housing.cedolareSecca || housing.contractType === 'proprieta') {
    return { registrationTax: 0, stampDuty: 0 };
  }

  // Base imponibile ridotta del 30% per il concordato in comuni ad alta
  // tensione abitativa.
  const reduction =
    housing.contractType === 'concordato_3_2' && housing.highTensionMunicipality
      ? 1 - CONCORDATO_TAX_REDUCTION
      : 1;

  const gross = Math.max(
    annualRent * reduction * REGISTRATION_TAX_RATE,
    REGISTRATION_TAX_MIN,
  );
  const registrationTax = gross * housing.registrationTaxShare;

  // Il bollo si paga alla stipula e a ogni rinnovo, non ogni anno.
  const stampDuty =
    isFirstYear || isRenewalYear
      ? STAMP_DUTY_PER_COPY * STAMP_DUTY_COPIES * housing.registrationTaxShare
      : 0;

  return { registrationTax, stampDuty };
}

export function contractLabel(type: ContractType): string {
  switch (type) {
    case 'libero_4_4':
      return 'canone libero 4+4';
    case 'concordato_3_2':
      return 'canone concordato 3+2';
    case 'transitorio':
      return 'transitorio';
    case 'studenti':
      return 'studenti universitari';
    case 'proprieta':
      return 'casa di proprietà';
  }
}

function fmtPct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

function fmtEur(x: number): string {
  return `${x.toFixed(0)} €`;
}
