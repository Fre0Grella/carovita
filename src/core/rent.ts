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

import { monthIndex, monthLabel } from './series.js';
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

  // Chi conosce il canone della propria stanza non deve ripartire nulla: la
  // quota serve solo quando il canone noto e' quello dell'intero appartamento.
  if (sharing.rentBasis === 'room') {
    const privateSqm = sharing.roomShared ? sharing.roomSqm / 2 : sharing.roomSqm;
    return {
      rentShare: 1,
      privateSqm,
      commonSqm: 0,
      weightedSqm: privateSqm,
      occupants,
      warnings,
    };
  }

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
 * Quota del divario rispetto al mercato che il proprietario recupera a ogni
 * rinnovo, in assenza di indicazioni dell'utente.
 *
 * **È un'ipotesi, non una misura.** Non esistono dati pubblici su come i
 * proprietari rinegoziano con inquilini già in casa. Il comportamento tipico è
 * graduale: un aumento pieno fino al prezzo di mercato rischia di far andare
 * via un inquilino affidabile e di lasciare la stanza vuota per mesi, quindi si
 * recupera una parte del divario a ogni rinnovo. Un terzo riproduce il caso
 * che ha motivato questo modello (210 euro, poi 220, poi 240, con stanze
 * simili intorno ai 280), ma resta una scelta modificabile.
 */
export const DEFAULT_RENEWAL_CATCH_UP = 1 / 3;

/**
 * I proprietari fissano canoni tondi: l'aumento al rinnovo si arrotonda ai
 * cinque euro, come negli esempi reali (+10, +20).
 */
export const RENT_ROUNDING = 5;

/**
 * Durata contrattuale in anni: periodo iniziale e rinnovo automatico. Alla
 * fine della somma dei due il contratto va rinegoziato, ed è lì che il
 * canone può cambiare oltre lo scatto ISTAT.
 *
 * Per studenti e transitori la durata la sceglie chi firma, entro i limiti di
 * legge (L. 431/1998, art. 5; D.M. 16 gennaio 2017).
 */
export function contractTerm(
  type: ContractType,
  years: number | null = null,
): {
  first: number;
  renewal: number;
} {
  switch (type) {
    case 'libero_4_4':
      return { first: 4, renewal: 4 };
    case 'concordato_3_2':
      return { first: 3, renewal: 2 };
    case 'transitorio': {
      // Massimo 18 mesi, senza rinnovo automatico.
      const y = clampYears(years ?? 1.5, 1 / 12, 1.5);
      return { first: y, renewal: 0 };
    }
    case 'studenti': {
      // Da sei mesi a tre anni, rinnovabile alla prima scadenza salvo
      // disdetta: il canone si rinegozia quindi ogni due durate. Un contratto
      // di un anno rinnovato una volta cambia prezzo ogni due anni.
      const y = clampYears(years ?? 1, 0.5, 3);
      return { first: y, renewal: y };
    }
    case 'proprieta':
      return { first: Infinity, renewal: 0 };
  }
}

function clampYears(y: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, y));
}

export interface RentMonth {
  /** Canone del mese a tuo carico, in EUR. */
  rent: number;
  /** Imposte del contratto pagate nel mese (registro e bollo), in EUR. */
  taxes: number;
  /** Spese condominiali del mese a tuo carico, in EUR. */
  condo: number;
}

export interface RentYear {
  /** Anno solare. */
  year: number;
  /** Canone mensile a tuo carico nel primo mese del periodo, in EUR. */
  monthlyRent: number;
  /** Canone mensile a tuo carico nell'ultimo mese del periodo, in EUR. */
  monthlyRentEnd: number;
  /** Canone annuo a tuo carico, in EUR. */
  annualRent: number;
  /**
   * Canone mensile del contratto nel primo mese del periodo: l'intero
   * appartamento, oppure la stanza se il canone che conosci è quello.
   */
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
  /** Il periodo mese per mese. */
  months: RentMonth[];
  /** Rinnovi del contratto che cadono nel periodo. */
  renewals: {
    month: string;
    from: number;
    to: number;
    market: number;
  }[];
}

export interface RentScheduleInput {
  /** Periodi di proiezione, dal mese corrente in avanti. */
  periods: Period[];
  housing: HousingConfig;
  /**
   * Canone mensile iniziale del contratto, in EUR: l'**intero** appartamento,
   * oppure la stanza se il canone che l'utente conosce è quello. La
   * ripartizione fra coinquilini avviene qui dentro, perche' alcune regole
   * (il minimo dell'imposta di registro) vivono a livello di contratto e
   * dividerle prima darebbe un risultato diverso.
   */
  initialMonthlyRent: number;
  /**
   * Indice cumulato del canone di mercato per periodo, con 1 al periodo
   * iniziale. Deriva dalla previsione della categoria `rent`.
   */
  marketIndex: number[];
  /**
   * Variazione FOI prevista per ciascun periodo, in frazione. L'indice 0 vale
   * per gli anniversari che cadono nei prossimi dodici mesi.
   */
  foiRates: number[];
  /**
   * Indice cumulato dei costi di manutenzione dell'abitazione per periodo.
   * Indicizza le spese condominiali, che non sono ferme in termini nominali:
   * seguono i prezzi di manutenzione, pulizie e servizi.
   */
  condoIndex: number[];
  /**
   * Canone di mercato oggi per la stessa unità affittata (la stanza), in
   * EUR. Se presente, ai rinnovi il canone si avvicina a questo valore invece
   * che al proprio canone rivalutato.
   */
  benchmark?: number | null;
  /** Sostituisce `housing.renewalCatchUp`, per costruire gli scenari. */
  catchUp?: number;
}

/**
 * Costruisce il profilo dei costi abitativi applicando le regole
 * contrattuali italiane, mese per mese.
 *
 * Gli eventi cadono nel mese in cui avvengono davvero, a partire dall'inizio
 * del contratto: lo scatto ISTAT e l'imposta di registro a ogni anniversario,
 * la rinegoziazione alla fine del ciclo contrattuale. Se il contratto inizia
 * adesso, gli anniversari coincidono con l'inizio dei periodi.
 */
export function buildRentSchedule(input: RentScheduleInput): RentYear[] {
  const { periods, housing, initialMonthlyRent, marketIndex, foiRates, condoIndex } =
    input;
  const out: RentYear[] = [];

  // Quota a tuo carico e numero di conviventi: le spese condominiali si
  // dividono invece in parti uguali, perche' cucina, pulizie e ascensore
  // non dipendono da quanto e' grande la tua camera.
  const { rentShare, occupants } = computeShare(housing);
  const roomBasis = housing.sharing?.rentBasis === 'room';
  const jointContract = roomBasis && housing.sharing?.contractScope === 'apartment';
  // Quanto del canone del contratto e' tuo, e quanto vale il contratto:
  // con un contratto unico per tutta la casa la base imponibile e' l'intero
  // canone, stimato come il tuo per il numero di persone.
  const myShare = roomBasis ? (jointContract ? 1 / occupants : 1) : rentShare;
  const contractMultiplier = jointContract ? occupants : 1;

  const startIdx = monthIndex(periods[0]!.startMonth);
  const condoAt = (h: number): number =>
    (housing.condoFees * (condoIndex[h] ?? 1)) / occupants;

  if (housing.contractType === 'proprieta') {
    for (const period of periods) {
      const h = period.index;
      const months = Array.from({ length: period.months }, () => ({
        rent: 0,
        taxes: 0,
        condo: condoAt(h),
      }));
      const condo = months.reduce((a, m) => a + m.condo, 0);
      out.push({
        year: period.year,
        monthlyRent: 0,
        monthlyRentEnd: 0,
        annualRent: 0,
        apartmentMonthlyRent: 0,
        registrationTax: 0,
        stampDuty: 0,
        condoFees: condo,
        total: condo,
        vsMarket: 0,
        events: [],
        months,
        renewals: [],
      });
    }
    return out;
  }

  const term = contractTerm(housing.contractType, housing.contractYears);
  const cycleMonths = Math.max(1, Math.round((term.first + term.renewal) * 12));
  const contractStart = housing.contractStart
    ? monthIndex(housing.contractStart)
    : startIdx;
  const catchUp = clampYears(input.catchUp ?? housing.renewalCatchUp, 0, 1);
  const benchmark =
    input.benchmark !== undefined && input.benchmark !== null && input.benchmark > 0
      ? input.benchmark
      : null;

  // La cedolare secca esclude per legge l'aggiornamento del canone.
  const indexationActive = housing.istatIndexation && !housing.cedolareSecca;

  /** Canone di mercato della stessa unita' nel periodo `h`. */
  const marketAt = (h: number): number => {
    const growth = (marketIndex[h] ?? marketIndex[marketIndex.length - 1]!) / marketIndex[0]!;
    return (benchmark ?? initialMonthlyRent) * growth;
  };

  let rent = initialMonthlyRent;
  let cedolareNoted = false;
  let offset = 0;

  for (const period of periods) {
    const h = period.index;
    const events: ProjectionEvent[] = [];
    const months: RentMonth[] = [];
    const renewals: RentYear['renewals'] = [];
    let registrationTax = 0;
    let stampDuty = 0;
    // Canone del primo mese del periodo, dopo gli eventi che cadono in quel
    // mese: uno scatto o un rinnovo all'inizio del periodo valgono gia' per esso.
    let firstRent = rent;

    for (let k = 0; k < period.months; k++) {
      const abs = startIdx + offset + k;
      const month = monthLabel(abs);
      const since = abs - contractStart;
      const anniversary = since >= 0 && since % 12 === 0;
      const renewal = since > 0 && since % cycleMonths === 0;

      if (renewal) {
        // Fine del ciclo contrattuale: si firma un contratto nuovo, quindi
        // il canone viene rinegoziato. Decadono sia il tetto del 75% sugli
        // scatti ISTAT sia il blocco della cedolare secca, che valgono per
        // quel contratto e non in perpetuo.
        const before = rent;
        const market = marketAt(h);
        if (benchmark !== null) {
          // Per una stanza il riferimento e' il prezzo delle stanze simili:
          // il proprietario ne recupera una parte, mai un ribasso.
          if (market > rent) {
            const target = rent + catchUp * (market - rent);
            rent = Math.max(rent, Math.round(target / RENT_ROUNDING) * RENT_ROUNDING);
          }
        } else {
          rent = market;
        }
        renewals.push({ month, from: before * myShare, to: rent * myShare, market: market * myShare });
        events.push(renewalEvent(housing, h, month, before * myShare, rent * myShare, market * myShare, benchmark !== null, catchUp));
      } else if (anniversary && since > 0) {
        if (indexationActive) {
          // Scatto ISTAT all'anniversario: al massimo il 75% della variazione FOI.
          const foi = foiRates[h] ?? 0;
          const step = ISTAT_INDEXATION_CAP * foi;
          if (Math.abs(step) > 1e-6) {
            const before = rent;
            rent *= 1 + step;
            events.push({
              year: period.year,
              month,
              kind: 'istat_step',
              message:
                `Aggiornamento ISTAT: +${fmtPct(step)} sul canone ` +
                `(75% della variazione FOI stimata del ${fmtPct(foi)}).`,
              amount: (rent - before) * myShare * 12,
            });
          }
        } else if (housing.cedolareSecca && !cedolareNoted) {
          // Una volta sola: ripeterlo a ogni anno seppellirebbe gli eventi
          // che contano davvero, come i rinnovi.
          cedolareNoted = true;
          events.push({
            year: period.year,
            month,
            kind: 'note',
            message:
              'Cedolare secca: per tutta la durata del contratto il canone ' +
              'resta fermo in euro, quindi ogni anno pesa un po’ meno ' +
              'in termini reali.',
          });
        }
      }

      // Imposta di registro a ogni annualita' del contratto, bollo alla firma
      // e a ogni rinnovo.
      let taxes = 0;
      if (anniversary) {
        const costs = registrationCosts({
          housing,
          annualRent: rent * contractMultiplier * 12,
          isFirstYear: since === 0,
          isRenewalYear: renewal,
          rentShare: myShare,
        });
        registrationTax += costs.registrationTax;
        stampDuty += costs.stampDuty;
        taxes = costs.registrationTax + costs.stampDuty;
      }

      if (k === 0) firstRent = rent;
      months.push({ rent: rent * myShare, taxes, condo: condoAt(h) });
    }

    offset += period.months;

    if (registrationTax > 0) {
      events.push({
        year: period.year,
        kind: 'registration_tax',
        message:
          `Imposta di registro a tuo carico: ${fmtEur(registrationTax)} ` +
          `(${fmtPct(REGISTRATION_TAX_RATE)} del canone annuo, quota ` +
          `${fmtPct(housing.registrationTaxShare)}).`,
        amount: registrationTax,
      });
    }

    const annualRent = months.reduce((a, m) => a + m.rent, 0);
    const condo = months.reduce((a, m) => a + m.condo, 0);
    const market = marketAt(h);

    out.push({
      year: period.year,
      monthlyRent: firstRent * myShare,
      monthlyRentEnd: rent * myShare,
      annualRent,
      apartmentMonthlyRent: firstRent,
      registrationTax,
      stampDuty,
      condoFees: condo,
      total: annualRent + registrationTax + stampDuty + condo,
      vsMarket: market > 0 ? firstRent / market - 1 : 0,
      events,
      months,
      renewals,
    });
  }

  return out;
}

function renewalEvent(
  housing: HousingConfig,
  h: number,
  month: string,
  from: number,
  to: number,
  market: number,
  room: boolean,
  catchUp: number,
): ProjectionEvent {
  const year = Number(month.slice(0, 4));
  const head = `Scadenza del contratto ${contractLabel(housing.contractType)}`;
  if (!room) {
    return {
      year,
      month,
      kind: 'market_reset',
      message:
        `${head}: si firma un contratto nuovo e il canone torna ai prezzi di ` +
        `mercato (${fmtPct(to / from - 1)} rispetto a quanto pagavi).`,
      amount: (to - from) * 12,
    };
  }
  if (to <= from + 0.5) {
    return {
      year,
      month,
      kind: 'contract_renewal',
      message:
        `${head}: il tuo canone (${fmtEur(from)}) è già in linea con le ` +
        `stanze simili, stimate intorno a ${fmtEur(market)}. Nessun aumento previsto.`,
      amount: 0,
    };
  }
  void h;
  return {
    year,
    month,
    kind: 'market_reset',
    message:
      `${head}: le stanze simili costano circa ${fmtEur(market)}, tu ne paghi ` +
      `${fmtEur(from)}. Recuperando ${fmtPct(catchUp)} del divario, il canone ` +
      `passa a circa ${fmtEur(to)} (+${fmtEur(to - from)} al mese).`,
    amount: (to - from) * 12,
  };
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
