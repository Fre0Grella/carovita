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
  Period,
  ProjectionEvent,
} from './types.js';

// ---------------------------------------------------------------------------
// Coabitazione
// ---------------------------------------------------------------------------

/** Ripartizione dei costi fra coinquilini. */
export interface ShareBreakdown {
  /** Quota del canone a tuo carico, in frazione (1 = abiti da solo). */
  rentShare: number;
  /** Metratura privata pro capite (metà camera se doppia), in m². */
  privateSqm: number;
  /** Metratura degli spazi comuni pro capite, in m². */
  commonSqm: number;
  /** Metratura equivalente complessiva su cui si calcola la quota, in m². */
  weightedSqm: number;
  /** Numero di persone in casa. */
  occupants: number;
  /** Problemi nei dati inseriti (metrature incoerenti). */
  warnings: string[];
}

/**
 * Calcola la quota di canone a carico di chi vive in coabitazione.
 *
 *     quota = (camera privata pro capite + spazi comuni pro capite) / m² totali
 *
 * Gli spazi comuni sono ricavati per differenza fra la metratura
 * dell'appartamento e la somma delle camere da letto, e divisi in parti
 * uguali: cucina e bagno li usano tutti allo stesso modo, la camera no.
 *
 * La costruzione garantisce che **le quote di tutti i coinquilini sommino
 * esattamente a 1**: le camere private sommano alla metratura complessiva
 * delle camere, gli spazi comuni pro capite moltiplicati per il numero di
 * persone restituiscono l'intera area comune. Nessun euro di canone sparisce
 * né viene contato due volte.
 */
export function computeShare(housing: HousingConfig): ShareBreakdown {
  const sharing = housing.sharing;
  if (!sharing) {
    return {
      rentShare: 1,
      privateSqm: housing.sqm,
      commonSqm: 0,
      weightedSqm: housing.sqm,
      occupants: 1,
      warnings: [],
    };
  }

  const warnings: string[] = [];
  const occupants = Math.max(1, Math.round(sharing.occupants));
  const total = Math.max(1, housing.sqm);

  let bedrooms = sharing.bedroomsSqm;
  if (bedrooms > total) {
    warnings.push(
      'La somma delle camere supera la metratura dell’appartamento: ' +
        'gli spazi comuni sono stati azzerati.',
    );
    bedrooms = total;
  }
  if (sharing.roomSqm > bedrooms) {
    warnings.push(
      'La tua camera risulta più grande della somma di tutte le camere: ' +
        'controlla le metrature.',
    );
  }

  const privateSqm = sharing.roomShared
    ? sharing.roomSqm / 2
    : sharing.roomSqm;
  const commonSqm = Math.max(0, total - bedrooms) / occupants;
  const weightedSqm = privateSqm + commonSqm;
  const rentShare = clampShare(weightedSqm / total, warnings);

  return { rentShare, privateSqm, commonSqm, weightedSqm, occupants, warnings };
}

function clampShare(x: number, warnings: string[]): number {
  if (!Number.isFinite(x) || x <= 0) {
    warnings.push(
      'Quota non calcolabile dalle metrature inserite: uso l’intero canone.',
    );
    return 1;
  }
  if (x > 1) {
    warnings.push('Quota superiore al 100%: limitata all’intero canone.');
    return 1;
  }
  return x;
}

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
  /** Canone mensile a tuo carico, in EUR (la tua quota se coabiti). */
  monthlyRent: number;
  /** Canone annuo a tuo carico, in EUR. */
  annualRent: number;
  /** Canone mensile dell'intera abitazione, in EUR. */
  apartmentMonthlyRent: number;
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
  /** Periodi di proiezione, dal mese corrente in avanti. */
  periods: Period[];
  housing: HousingConfig;
  /**
   * Canone mensile iniziale dell'**intera** abitazione, in EUR. La
   * ripartizione fra coinquilini avviene qui dentro, perche' alcune regole
   * (il minimo dell'imposta di registro) vivono a livello di contratto e
   * dividerle prima darebbe un risultato diverso.
   */
  initialMonthlyRent: number;
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
    periods,
    housing,
    initialMonthlyRent,
    marketIndex,
    foiRates,
    condoIndex,
  } = input;
  const horizon = periods.length - 1;
  const out: RentYear[] = [];

  // Quota a tuo carico e numero di conviventi: le spese condominiali si
  // dividono invece in parti uguali, perche' cucina, pulizie e ascensore
  // non dipendono da quanto e' grande la tua camera.
  const { rentShare, occupants } = computeShare(housing);

  if (housing.contractType === 'proprieta') {
    for (let h = 0; h <= horizon; h++) {
      const f = periods[h]!.fraction;
      const condo =
        (housing.condoFees * 12 * (condoIndex[h] ?? 1) * f) / occupants;
      out.push({
        year: periods[h]!.year,
        monthlyRent: 0,
        annualRent: 0,
        apartmentMonthlyRent: 0,
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
    const period = periods[h]!;
    const year = period.year;
    // Un periodo parziale costa in proporzione ai mesi che copre: senza
    // questo, un orizzonte di diciotto mesi imputerebbe due anni interi.
    const f = period.fraction;
    const events: ProjectionEvent[] = [];

    if (h > 0) {
      yearsInContract += 1;

      // Fine del ciclo contrattuale: si firma un contratto nuovo, quindi il
      // canone viene rinegoziato ai prezzi di mercato correnti.
      //
      // Il riallineamento avviene sia che si traslochi sia che si resti: alla
      // scadenza il contratto precedente non esiste piu', e con esso decadono
      // sia il tetto del 75% sugli scatti ISTAT sia il blocco del canone
      // legato alla cedolare secca, che vale per quel contratto e non in
      // perpetuo. Ipotizzare un canone fermo per decenni produrrebbe risparmi
      // che nella realta' nessuno ottiene.
      const cycleEnded = yearsInContract >= cycle;
      if (cycleEnded) {
        const marketRent = (initialMonthlyRent * marketIndex[h]!) / marketIndex[0]!;
        const jump = marketRent / monthlyRent - 1;
        if (Math.abs(jump) > 0.001) {
          events.push({
            year,
            kind: 'market_reset',
            message:
              `Scadenza del contratto ${contractLabel(housing.contractType)}: ` +
              `si firma un contratto nuovo e il canone torna ai prezzi di ` +
              `mercato (${fmtPct(jump)} rispetto a quanto pagavi).`,
            amount: (marketRent - monthlyRent) * 12,
          });
        }
        monthlyRent = marketRent;
        yearsInContract = 0;
      } else {
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

    // `monthlyRent` e' il canone dell'intera abitazione: da qui si ricavano
    // sia la base imponibile del contratto sia la quota a tuo carico.
    const apartmentAnnualRent = monthlyRent * 12;
    const myMonthlyRent = monthlyRent * rentShare;
    const annualRent = myMonthlyRent * 12 * f;
    const gross = registrationCosts({
      housing,
      annualRent: apartmentAnnualRent,
      isFirstYear: h === 0,
      isRenewalYear: h > 0 && yearsInContract === 0,
      rentShare,
    });
    const registrationTax = gross.registrationTax * f;
    const stampDuty = gross.stampDuty;

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

    const condo =
      (housing.condoFees * 12 * (condoIndex[h] ?? 1) * f) / occupants;
    const marketRent = (initialMonthlyRent * marketIndex[h]!) / marketIndex[0]!;

    out.push({
      year,
      monthlyRent: myMonthlyRent,
      annualRent,
      apartmentMonthlyRent: monthlyRent,
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
  /** Canone annuo dell'**intera** abitazione: è la base imponibile di legge. */
  annualRent: number;
  isFirstYear: boolean;
  isRenewalYear: boolean;
  /** Quota a tuo carico fra coinquilini (1 se abiti da solo). */
  rentShare?: number;
}): { registrationTax: number; stampDuty: number } {
  const { housing, annualRent, isFirstYear, isRenewalYear } = args;
  const rentShare = args.rentShare ?? 1;
  if (housing.cedolareSecca || housing.contractType === 'proprieta') {
    return { registrationTax: 0, stampDuty: 0 };
  }
  // Chi non ha firmato il contratto non deve nulla al fisco: paga l'affitto
  // al coinquilino intestatario, che e' l'unico obbligato.
  if (housing.sharing && !housing.sharing.onContract) {
    return { registrationTax: 0, stampDuty: 0 };
  }

  // Base imponibile ridotta del 30% per il concordato in comuni ad alta
  // tensione abitativa.
  const reduction =
    housing.contractType === 'concordato_3_2' && housing.highTensionMunicipality
      ? 1 - CONCORDATO_TAX_REDUCTION
      : 1;

  // Il minimo di legge vale per il **contratto**, non per persona: va quindi
  // applicato prima di ripartire fra coinquilini. Calcolarlo sulla singola
  // quota farebbe scattare i 67 euro a ognuno, gonfiando il conto di tutti.
  const gross = Math.max(
    annualRent * reduction * REGISTRATION_TAX_RATE,
    REGISTRATION_TAX_MIN,
  );
  const registrationTax = gross * housing.registrationTaxShare * rentShare;

  // Il bollo si paga alla stipula e a ogni rinnovo, non ogni anno, ed e'
  // anch'esso un costo del contratto da ripartire.
  const stampDuty =
    isFirstYear || isRenewalYear
      ? STAMP_DUTY_PER_COPY *
        STAMP_DUTY_COPIES *
        housing.registrationTaxShare *
        rentShare
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
