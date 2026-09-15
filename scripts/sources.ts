/**
 * Definizione delle fonti dati esterne.
 *
 * ## Nota importante sul cambio di classificazione (febbraio 2026)
 *
 * Il 4 febbraio 2026 Eurostat è passata da ECOICOP ver.1 a **ECOICOP ver.2**.
 * I vecchi dataset (`prc_hicp_midx`, `prc_hicp_manr`) sono stati **congelati**
 * a dicembre 2025: continuano a rispondere con HTTP 200, ma non vengono più
 * aggiornati. Usarli significherebbe costruire previsioni su dati fermi senza
 * accorgersene.
 *
 * Il dataset vivo è `prc_hicp_minr`, che contiene sia gli indici sia i tassi
 * di variazione, con la dimensione `coicop18` (non più `coicop`) e la nuova
 * base `2025=100`.
 *
 * Per questo la pipeline controlla esplicitamente la freschezza di ogni serie
 * (`MAX_STALENESS_MONTHS`) e fallisce in modo rumoroso se una fonte si ferma:
 * un dato vecchio che sembra buono è peggio di un errore visibile.
 */

import type { CategoryId } from '../src/core/types.js';

export const EUROSTAT_BASE =
  'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data';

/** Dataset Eurostat vivo, in classificazione ECOICOP ver.2. */
export const HICP_DATASET = 'prc_hicp_minr';

/** Base dell'indice richiesta a Eurostat. */
export const HICP_UNIT = 'I25';

/**
 * Mesi oltre i quali una serie è considerata obsoleta. L'HICP esce circa a
 * metà del mese successivo, quindi con 4 mesi si tollera un ritardo di
 * pubblicazione senza lasciar passare un dataset congelato.
 */
export const MAX_STALENESS_MONTHS = 4;

export interface EurostatSourceDef {
  category: CategoryId;
  label: string;
  /** Codice ECOICOP ver.2. */
  code: string;
  /** Se `true`, l'assenza di questa serie fa fallire la pipeline. */
  required: boolean;
}

/**
 * Categorie scaricate da Eurostat. I codici sono stati verificati contro il
 * dataset reale: `coicop18` espone 555 voci, queste sono quelle che servono.
 */
export const EUROSTAT_SOURCES: EurostatSourceDef[] = [
  // In ECOICOP ver.2 l'indice generale si chiama `TOTAL`: il vecchio codice
  // `CP00` non esiste più e la query restituirebbe zero osservazioni.
  { category: 'headline', label: 'Indice generale dei prezzi al consumo', code: 'TOTAL', required: true },
  { category: 'food', label: 'Alimentari', code: 'CP011', required: true },
  { category: 'rent', label: 'Affitti di mercato', code: 'CP041', required: true },
  { category: 'utilities', label: 'Elettricità, gas e altri combustibili', code: 'CP045', required: true },
  { category: 'water', label: 'Acqua e servizi per l’abitazione', code: 'CP044', required: false },
  { category: 'maintenance', label: 'Manutenzione dell’abitazione', code: 'CP043', required: false },
  { category: 'transport_fuel', label: 'Carburante ed esercizio del veicolo', code: 'CP072', required: false },
  { category: 'transport_public', label: 'Trasporto pubblico', code: 'CP073', required: false },
  { category: 'health', label: 'Salute', code: 'CP06', required: false },
  { category: 'education', label: 'Istruzione', code: 'CP10', required: false },
  { category: 'communications', label: 'Telefonia, internet e informazione', code: 'CP08', required: false },
  { category: 'recreation', label: 'Tempo libero, sport e cultura', code: 'CP09', required: false },
  { category: 'restaurants', label: 'Ristorazione e alloggio', code: 'CP11', required: false },
  { category: 'clothing', label: 'Abbigliamento e calzature', code: 'CP03', required: false },
  { category: 'furnishings', label: 'Mobili e articoli per la casa', code: 'CP05', required: false },
  // In ECOICOP ver.2 la divisione 12 è "assicurazioni e servizi finanziari";
  // le spese varie e la cura della persona sono nella nuova divisione 13.
  { category: 'insurance', label: 'Assicurazioni e servizi finanziari', code: 'CP12', required: false },
  { category: 'misc', label: 'Cura della persona e altre spese', code: 'CP13', required: false },
];

// ---------------------------------------------------------------------------
// ISTAT - indice FOI
// ---------------------------------------------------------------------------

export const ISTAT_BASE = 'https://esploradati.istat.it/SDMXWS/rest';

/**
 * Dataflow FOI mensile, base 2025, in classificazione ECOICOP 2.
 * La variante `_2` contiene la ricostruzione storica 1996-2025 raccordata,
 * necessaria per stimare i parametri su una storia lunga.
 */
export const FOI_DATAFLOW_CURRENT = 'IT1,169_748_DF_DCSP_FOI1B2025_1,1.0';
export const FOI_DATAFLOW_HISTORIC = 'IT1,169_748_DF_DCSP_FOI1B2025_2,1.0';

/**
 * Ordine delle dimensioni della chiave FOI, verificato sulla DSD:
 *   FREQ . REF_AREA . DATA_TYPE . MEASURE . ECOICOP_2
 *
 * `TOTAL` non esiste in questo dataflow (restituisce NoRecordsFound):
 * l'indice generale è `00`, e la variante al netto dei tabacchi è `00ST`.
 */

/**
 * L'indice da usare per l'aggiornamento dei canoni di locazione è il FOI
 * **al netto dei tabacchi** (`00ST`): è quello che ISTAT pubblica
 * esplicitamente per la rivalutazione dei canoni e degli assegni.
 * `00` (indice generale, tabacchi inclusi) è la seconda scelta.
 */
export const FOI_ECOICOP_PRIMARY = '00ST';
export const FOI_ECOICOP_FALLBACK = '00';

/**
 * `DATA_TYPE` per base dell'indice, dal più recente al più vecchio.
 * Ogni base copre un periodo diverso e le serie vanno raccordate fra loro
 * per ottenere una storia continua:
 *   101 = base 2025=100 (dal 2026)
 *    55 = base 2015=100 (2016-2025)
 *    11 = base 2010=100 (2011-2015)
 *     4 = base 1995=100 (fino al 2010)
 */
export const FOI_BASES = [
  { dataType: '101', base: '2025=100' },
  { dataType: '55', base: '2015=100' },
  { dataType: '11', base: '2010=100' },
  { dataType: '4', base: '1995=100' },
] as const;

/** `MEASURE` corrispondente al numero indice (non alla variazione). */
export const FOI_MEASURE_INDEX = '4';

/** Ancora di lungo periodo: obiettivo di inflazione della BCE. */
export const LONG_RUN_ANCHOR = 0.02;
