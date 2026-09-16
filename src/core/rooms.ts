/**
 * Prezzo di mercato delle stanze in affitto.
 *
 * ## Da dove vengono i numeri
 *
 * Il dato di partenza è il **prezzo medio richiesto per una stanza singola**
 * negli annunci, pubblicato da Immobiliare.it Insights per le principali
 * città universitarie (agosto 2026, confronto su dodici mesi). È un dato di
 * annunci, non di contratti firmati: misura quanto chiede oggi il mercato a
 * chi cerca casa, che è proprio il livello verso cui un proprietario tende a
 * riportare il canone al rinnovo.
 *
 * Per gli altri comuni la media non esiste. La si ricava dal canone al metro
 * quadro del comune: nelle 21 città con entrambi i dati, una stanza singola
 * costa in media quanto **45 m²** di appartamento in zona semicentrale, con
 * una dispersione fra città di circa il 14%. È una regolarità misurata, non
 * un parametro scelto, e si riverifica nei test quando cambiano i dati.
 *
 * ## Cosa NON si sa, e come viene trattato
 *
 * Non esistono dati pubblici affidabili su prezzo dei posti letto in camera
 * doppia, effetto della classe energetica sui canoni delle stanze, numero di
 * bagni o metratura media delle stanze. Dove la stima ne tiene conto lo fa
 * con **ipotesi dichiarate**, marcate come tali in ogni passaggio mostrato
 * all'utente e sostituibili. La metratura della stanza non corregge la stima:
 * inventare la superficie di una «stanza media» per fare una proporzione
 * darebbe una precisione che i dati non hanno.
 *
 * Il confronto più affidabile resta quello che l'utente conosce: quanto
 * pagano stanze davvero simili, nella stessa zona, con gli stessi servizi.
 */

import type {
  EnergyClass,
  HousingConfig,
  RoomBenchmark,
  SharingConfig,
  ZoneTier,
} from './types.js';

export const ROOM_SOURCE = 'Immobiliare.it Insights, agosto 2026';

/** Prezzo medio nazionale di una stanza singola, EUR/mese. */
export const NATIONAL_SINGLE_ROOM = 575;

export interface RoomRentQuote {
  istatCode: string;
  comune: string;
  /** Prezzo medio richiesto per una stanza singola, EUR/mese. */
  single: number;
  /** Variazione sui dodici mesi precedenti, in frazione. */
  yoy: number | null;
  note?: string;
}

/**
 * Prezzi medi delle stanze singole, Immobiliare.it Insights (agosto 2026),
 * ripresi testualmente dal comunicato diffuso dalla stampa.
 */
export const ROOM_QUOTES: RoomRentQuote[] = [
  { istatCode: '015146', comune: 'Milano', single: 704, yoy: null },
  { istatCode: '048017', comune: 'Firenze', single: 627, yoy: null },
  { istatCode: '058091', comune: 'Roma', single: 615, yoy: null },
  { istatCode: '037006', comune: 'Bologna', single: 585, yoy: -0.075 },
  { istatCode: '016024', comune: 'Bergamo', single: 504, yoy: 0.083 },
  {
    istatCode: '028060',
    comune: 'Padova',
    single: 499,
    yoy: null,
    note: 'Il comunicato riporta «appena sotto i 500 euro/mese».',
  },
  { istatCode: '001272', comune: 'Torino', single: 479, yoy: null },
  { istatCode: '017029', comune: 'Brescia', single: 478, yoy: null },
  { istatCode: '023091', comune: 'Verona', single: 473, yoy: null },
  { istatCode: '027042', comune: 'Venezia', single: 456, yoy: null },
  { istatCode: '022205', comune: 'Trento', single: 444, yoy: -0.183 },
  { istatCode: '072006', comune: 'Bari', single: 426, yoy: 0.122 },
  { istatCode: '010025', comune: 'Genova', single: 408, yoy: 0.119 },
  { istatCode: '018110', comune: 'Pavia', single: 400, yoy: 0.102 },
  { istatCode: '068028', comune: 'Pescara', single: 388, yoy: 0.286 },
  { istatCode: '032006', comune: 'Trieste', single: 369, yoy: 0.167 },
  { istatCode: '050026', comune: 'Pisa', single: 364, yoy: 0.107 },
  { istatCode: '082053', comune: 'Palermo', single: 315, yoy: 0.136 },
  { istatCode: '071024', comune: 'Foggia', single: 259, yoy: null },
  { istatCode: '079023', comune: 'Catanzaro', single: 251, yoy: null },
  { istatCode: '069022', comune: 'Chieti', single: 240, yoy: null },
];

/**
 * Metri quadri di appartamento semicentrale che valgono una stanza singola:
 * mediana del rapporto fra prezzo della singola e canone al m² sulle 21 città
 * della tabella. Verificato in `tests/snapshot.test.ts`.
 */
export const ROOM_EQUIVALENT_SQM = 45;

/** Dispersione del rapporto fra città (deviazione standard del logaritmo). */
export const ROOM_RATIO_LOG_SD = 0.14;

/**
 * Dispersione dei prezzi fra quartieri della stessa città. A Milano i
 * quartieri vanno da 571 a 823 euro su una media di 704, a Roma da 447 a 733
 * su 615: presi come estremi a circa due deviazioni standard, danno una
 * dispersione dell'11%.
 */
export const NEIGHBOURHOOD_LOG_SD = 0.11;

/**
 * Correzione per zona, derivata dagli stessi quartieri: metà dello scarto fra
 * la media della città e i quartieri più cari (+17%, +19%) o più economici
 * (−19%, −27%) di Milano e Roma.
 */
export const ZONE_ROOM_FACTOR: Record<ZoneTier, number> = {
  centro: 1.08,
  semicentro: 1,
  periferia: 0.88,
};

/**
 * Posto letto in camera doppia rispetto a una singola. Ipotesi: non esiste
 * un dato pubblico affidabile e recente.
 */
export const DOUBLE_ROOM_FACTOR = 0.7;

/** Quantile normale all'80%, per l'intervallo della stima. */
const Z80 = 1.2816;

/**
 * Correzione proposta per ciò che la media della città non vede. Ipotesi
 * deliberatamente contenute (pochi punti percentuali): la direzione è nota,
 * l'entità sulle stanze no. Lo studio della Banca d'Italia sulle classi
 * energetiche (QEF n. 818, 2023) misura un premio sui prezzi di vendita, non
 * sui canoni delle stanze.
 */
export function proposedQualityAdjustment(sharing: SharingConfig): {
  value: number;
  reasons: string[];
} {
  let value = 0;
  const reasons: string[] = [];

  const good: EnergyClass[] = ['A', 'B'];
  const poor: EnergyClass[] = ['F', 'G'];
  if (sharing.energyClass && good.includes(sharing.energyClass)) {
    value += 0.03;
    reasons.push(`classe energetica ${sharing.energyClass}: +3%`);
  } else if (sharing.energyClass && poor.includes(sharing.energyClass)) {
    value -= 0.03;
    reasons.push(`classe energetica ${sharing.energyClass}: −3%`);
  }

  if (sharing.bathrooms && sharing.bathrooms > 0) {
    const perBath = Math.max(1, sharing.occupants) / sharing.bathrooms;
    const perBathText = perBath.toLocaleString('it-IT', { maximumFractionDigits: 1 });
    if (perBath <= 2) {
      value += 0.03;
      reasons.push(`${perBathText} persone per bagno: +3%`);
    } else if (perBath >= 4) {
      value -= 0.03;
      reasons.push(`${perBathText} persone per bagno: −3%`);
    }
  }

  return { value, reasons };
}

/**
 * Stima del canone di mercato di una stanza come la tua, oggi.
 *
 * Restituisce `null` se il canone non è quello di una stanza. `cityEurM2`
 * è il canone al metro quadro semicentrale del comune, se disponibile: serve
 * solo per i comuni senza media pubblicata.
 */
export function roomBenchmark(
  housing: HousingConfig,
  cityEurM2: number | null,
  cityName?: string,
): RoomBenchmark | null {
  const sharing = housing.sharing;
  if (!sharing || sharing.rentBasis !== 'room') return null;

  if (sharing.comparableRent !== null && sharing.comparableRent > 0) {
    const v = sharing.comparableRent;
    // Anche il dato personale ha un margine: «stanze simili» non sono mai
    // identiche, e una media fatta su pochi casi oscilla.
    return {
      central: v,
      lo: v * 0.9,
      hi: v * 1.1,
      basis: 'tuo',
      steps: [
        {
          label: 'Quanto pagano stanze simili alla tua',
          value: v,
          kind: 'tuo',
          note: 'Il dato che hai inserito: sostituisce la stima automatica.',
        },
      ],
      source: 'Dato inserito da te',
    };
  }

  const steps: RoomBenchmark['steps'] = [];
  const quote = ROOM_QUOTES.find((q) => q.istatCode === housing.istatCode);
  let value: number;
  let logSd: number;
  let basis: RoomBenchmark['basis'];

  if (quote) {
    value = quote.single;
    logSd = NEIGHBOURHOOD_LOG_SD;
    basis = 'dato';
    steps.push({
      label: `Stanza singola a ${quote.comune}, prezzo medio`,
      value,
      kind: 'dato',
      note: ROOM_SOURCE + (quote.note ? `. ${quote.note}` : ''),
    });
  } else if (cityEurM2 !== null && cityEurM2 > 0) {
    value = ROOM_EQUIVALENT_SQM * cityEurM2;
    logSd = Math.hypot(ROOM_RATIO_LOG_SD, NEIGHBOURHOOD_LOG_SD);
    basis = 'derivato';
    steps.push({
      label: `Stanza singola${cityName ? ` a ${cityName}` : ''}, stimata dal canone al m²`,
      value,
      kind: 'derivato',
      note:
        `${ROOM_EQUIVALENT_SQM} m² × ${cityEurM2.toLocaleString('it-IT')} €/m²: ` +
        'nelle città con entrambi i dati una singola costa quanto 45 m² ' +
        'di appartamento semicentrale.',
    });
  } else {
    value = NATIONAL_SINGLE_ROOM;
    logSd = 0.25;
    basis = 'derivato';
    steps.push({
      label: 'Stanza singola, media nazionale',
      value,
      kind: 'dato',
      note: `${ROOM_SOURCE}. Manca un dato per il comune: la stima è molto larga.`,
    });
  }

  const zone = ZONE_ROOM_FACTOR[housing.zone];
  if (zone !== 1) {
    value *= zone;
    steps.push({
      label: housing.zone === 'centro' ? 'Zona centrale' : 'Zona periferica',
      value,
      kind: 'derivato',
      note:
        'Metà dello scarto fra media della città e quartieri più cari o più ' +
        'economici, osservato a Milano e Roma.',
    });
  }

  if (sharing.roomShared) {
    value *= DOUBLE_ROOM_FACTOR;
    steps.push({
      label: 'Posto letto in camera doppia',
      value,
      kind: 'ipotesi',
      note: 'Circa il 70% di una singola: non ci sono dati pubblici affidabili.',
    });
  }

  const proposed = proposedQualityAdjustment(sharing);
  const adjustment = sharing.qualityAdjustment ?? proposed.value;
  if (Math.abs(adjustment) > 1e-9) {
    value *= 1 + adjustment;
    steps.push({
      label:
        sharing.qualityAdjustment === null
          ? 'Correzione per la qualità della casa'
          : 'Correzione scelta da te',
      value,
      kind: sharing.qualityAdjustment === null ? 'ipotesi' : 'tuo',
      note:
        sharing.qualityAdjustment === null
          ? proposed.reasons.join(', ')
          : undefined,
    });
  }

  return {
    central: value,
    lo: value * Math.exp(-Z80 * logSd),
    hi: value * Math.exp(Z80 * logSd),
    basis,
    steps,
    source: ROOM_SOURCE,
  };
}
