/**
 * Baseline indicativa dei canoni di locazione per i capoluoghi italiani.
 *
 * ## Da dove vengono questi numeri, e cosa NON sono
 *
 * La fonte autorevole per i canoni di locazione in Italia sono le
 * **quotazioni OMI** dell'Agenzia delle Entrate: pubblicate ogni semestre,
 * per singola zona censuaria di ogni comune, distinte per tipologia e stato
 * di conservazione. Sono scaricabili **gratuitamente**, ma solo dall'area
 * riservata dell'Agenzia, previo accesso con SPID/CIE/Entratel. Non esiste
 * un endpoint pubblico interrogabile da una pipeline automatica, e il
 * servizio di consultazione non va interrogato da programma.
 *
 * Di conseguenza questi valori **non sono dati OMI**. Sono una baseline di
 * ordine di grandezza del mercato locativo residenziale, espressa in
 * EUR/m²/mese, pensata per dare all'applicazione un punto di partenza
 * sensato senza dover configurare tutto a mano.
 *
 * **Per avere numeri esatti** l'app offre due strade, entrambe migliori di
 * questa tabella:
 *
 *  1. inserire direttamente il proprio canone (è il dato più accurato in
 *     assoluto: è quello che si paga davvero);
 *  2. importare il CSV ufficiale delle quotazioni OMI, scaricato dall'area
 *     riservata dell'Agenzia delle Entrate.
 *
 * Citando i dati OMI va indicata la fonte: "Agenzia Entrate - OMI".
 *
 * Le tre fasce (`centro`, `semicentro`, `periferia`) ricalcano la
 * ripartizione OMI fra zona centrale, semicentrale e periferica.
 */

export interface RentBaselineRow {
  /** Codice ISTAT del comune. */
  code: string;
  /** Nome, solo per leggibilità della tabella. */
  name: string;
  /** EUR/m²/mese: zona centrale, semicentrale, periferica. */
  q: [number, number, number];
}

/**
 * Periodo di riferimento indicativo della baseline. Va aggiornato quando si
 * rivedono i valori.
 */
export const BASELINE_VINTAGE = '2025-S2';

export const BASELINE_NOTE =
  'Valore indicativo di mercato, non una quotazione OMI ufficiale. ' +
  'Per la massima accuratezza inserisci il tuo canone reale o importa il ' +
  'CSV delle quotazioni OMI dall’area riservata dell’Agenzia delle Entrate.';

/** Capoluoghi e principali città, ordinati per codice ISTAT. */
export const RENT_BASELINE: RentBaselineRow[] = [
  // --- Piemonte, Valle d'Aosta, Liguria ---
  { code: '001272', name: 'Torino', q: [12.0, 9.0, 7.0] },
  { code: '002003', name: 'Vercelli', q: [8.0, 6.5, 5.5] },
  { code: '003106', name: 'Novara', q: [9.5, 7.5, 6.5] },
  { code: '004078', name: 'Cuneo', q: [9.0, 7.5, 6.5] },
  { code: '005005', name: 'Asti', q: [8.5, 7.0, 6.0] },
  { code: '006003', name: 'Alessandria', q: [8.0, 6.5, 5.5] },
  { code: '096024', name: 'Biella', q: [7.5, 6.0, 5.0] },
  { code: '103065', name: 'Verbania', q: [9.0, 7.0, 6.0] },
  { code: '007003', name: 'Aosta', q: [10.0, 8.0, 6.5] },
  { code: '008004', name: 'Imperia', q: [10.5, 8.5, 7.0] },
  { code: '009056', name: 'Savona', q: [11.0, 9.0, 7.5] },
  { code: '010025', name: 'Genova', q: [10.0, 8.0, 6.5] },
  { code: '011015', name: 'La Spezia', q: [10.5, 8.5, 7.0] },

  // --- Lombardia ---
  { code: '012133', name: 'Varese', q: [11.0, 9.0, 7.5] },
  { code: '013075', name: 'Como', q: [13.0, 10.5, 9.0] },
  { code: '014061', name: 'Sondrio', q: [9.0, 7.5, 6.5] },
  { code: '015146', name: 'Milano', q: [27.0, 19.0, 14.0] },
  { code: '016024', name: 'Bergamo', q: [12.0, 9.5, 8.0] },
  { code: '017029', name: 'Brescia', q: [11.0, 9.0, 7.5] },
  { code: '018110', name: 'Pavia', q: [11.5, 9.0, 7.5] },
  { code: '019036', name: 'Cremona', q: [9.0, 7.0, 6.0] },
  { code: '020030', name: 'Mantova', q: [9.5, 7.5, 6.5] },
  { code: '097042', name: 'Lecco', q: [11.0, 9.0, 7.5] },
  { code: '098031', name: 'Lodi', q: [10.0, 8.0, 7.0] },
  { code: '108033', name: 'Monza', q: [13.0, 10.5, 9.0] },

  // --- Trentino-Alto Adige, Veneto, Friuli ---
  { code: '021008', name: 'Bolzano', q: [15.0, 12.0, 10.0] },
  { code: '022205', name: 'Trento', q: [13.0, 10.5, 9.0] },
  { code: '023091', name: 'Verona', q: [12.0, 9.5, 8.0] },
  { code: '024116', name: 'Vicenza', q: [10.5, 8.5, 7.0] },
  { code: '025006', name: 'Belluno', q: [9.0, 7.5, 6.5] },
  { code: '026086', name: 'Treviso', q: [11.0, 9.0, 7.5] },
  { code: '027042', name: 'Venezia', q: [16.0, 12.0, 9.0] },
  { code: '028060', name: 'Padova', q: [12.0, 9.5, 8.0] },
  { code: '029041', name: 'Rovigo', q: [8.5, 7.0, 6.0] },
  { code: '030129', name: 'Udine', q: [10.0, 8.0, 6.5] },
  { code: '031007', name: 'Gorizia', q: [8.5, 7.0, 6.0] },
  { code: '032006', name: 'Trieste', q: [11.0, 9.0, 7.0] },
  { code: '093033', name: 'Pordenone', q: [9.5, 7.5, 6.5] },

  // --- Emilia-Romagna ---
  { code: '033032', name: 'Piacenza', q: [10.0, 8.0, 6.5] },
  { code: '034027', name: 'Parma', q: [12.0, 9.5, 8.0] },
  { code: '035033', name: 'Reggio Emilia', q: [11.0, 9.0, 7.5] },
  { code: '036023', name: 'Modena', q: [11.5, 9.0, 7.5] },
  { code: '037006', name: 'Bologna', q: [17.0, 13.0, 10.5] },
  { code: '038008', name: 'Ferrara', q: [10.0, 8.0, 6.5] },
  { code: '039014', name: 'Ravenna', q: [10.5, 8.5, 7.0] },
  { code: '040012', name: 'Forlì', q: [10.0, 8.0, 6.5] },
  { code: '040007', name: 'Cesena', q: [10.0, 8.0, 6.5] },
  { code: '099014', name: 'Rimini', q: [13.0, 10.0, 8.0] },

  // --- Toscana, Umbria, Marche ---
  { code: '045012', name: 'Massa', q: [10.0, 8.0, 6.5] },
  { code: '046017', name: 'Lucca', q: [11.0, 9.0, 7.5] },
  { code: '047014', name: 'Pistoia', q: [10.0, 8.0, 6.5] },
  { code: '048017', name: 'Firenze', q: [19.0, 14.0, 11.0] },
  { code: '049021', name: 'Livorno', q: [10.0, 8.0, 6.5] },
  { code: '050026', name: 'Pisa', q: [14.0, 11.0, 9.0] },
  { code: '051002', name: 'Arezzo', q: [9.5, 7.5, 6.5] },
  { code: '052032', name: 'Siena', q: [13.0, 10.0, 8.5] },
  { code: '053011', name: 'Grosseto', q: [10.0, 8.0, 6.5] },
  { code: '100005', name: 'Prato', q: [11.0, 9.0, 7.5] },
  { code: '054039', name: 'Perugia', q: [9.5, 7.5, 6.5] },
  { code: '055032', name: 'Terni', q: [8.0, 6.5, 5.5] },
  { code: '041044', name: 'Pesaro', q: [10.0, 8.0, 6.5] },
  { code: '042002', name: 'Ancona', q: [9.5, 7.5, 6.5] },
  { code: '043023', name: 'Macerata', q: [8.5, 7.0, 6.0] },
  { code: '044007', name: 'Ascoli Piceno', q: [8.5, 7.0, 6.0] },
  { code: '109010', name: 'Fermo', q: [8.5, 7.0, 6.0] },

  // --- Lazio, Abruzzo, Molise ---
  { code: '056032', name: 'Viterbo', q: [8.0, 6.5, 5.5] },
  { code: '057059', name: 'Rieti', q: [8.0, 6.5, 5.5] },
  { code: '058091', name: 'Roma', q: [20.0, 14.0, 10.0] },
  { code: '059011', name: 'Latina', q: [9.5, 7.5, 6.5] },
  { code: '060039', name: 'Frosinone', q: [8.0, 6.5, 5.5] },
  { code: '066049', name: "L'Aquila", q: [8.5, 7.0, 6.0] },
  { code: '067041', name: 'Teramo', q: [8.5, 7.0, 6.0] },
  { code: '068028', name: 'Pescara', q: [10.5, 8.5, 7.0] },
  { code: '069022', name: 'Chieti', q: [8.5, 7.0, 6.0] },
  { code: '070006', name: 'Campobasso', q: [7.0, 5.5, 4.5] },
  { code: '094023', name: 'Isernia', q: [7.0, 5.5, 4.5] },

  // --- Campania, Puglia, Basilicata, Calabria ---
  { code: '061102', name: 'Caserta', q: [9.0, 7.0, 6.0] },
  { code: '062008', name: 'Benevento', q: [7.5, 6.0, 5.0] },
  { code: '063049', name: 'Napoli', q: [13.0, 10.0, 7.5] },
  { code: '064008', name: 'Avellino', q: [8.0, 6.5, 5.5] },
  { code: '065116', name: 'Salerno', q: [10.0, 8.0, 6.5] },
  { code: '071024', name: 'Foggia', q: [7.0, 5.5, 4.5] },
  { code: '072006', name: 'Bari', q: [11.0, 8.5, 7.0] },
  { code: '073027', name: 'Taranto', q: [7.5, 6.0, 5.0] },
  { code: '074001', name: 'Brindisi', q: [8.0, 6.5, 5.5] },
  { code: '075035', name: 'Lecce', q: [9.5, 7.5, 6.0] },
  { code: '110009', name: 'Barletta', q: [7.5, 6.0, 5.0] },
  { code: '076063', name: 'Potenza', q: [7.5, 6.0, 5.0] },
  { code: '077014', name: 'Matera', q: [8.5, 7.0, 6.0] },
  { code: '078045', name: 'Cosenza', q: [7.5, 6.0, 5.0] },
  { code: '079023', name: 'Catanzaro', q: [7.0, 5.5, 4.5] },
  { code: '080063', name: 'Reggio Calabria', q: [7.0, 5.5, 4.5] },
  { code: '101010', name: 'Crotone', q: [6.5, 5.0, 4.0] },
  { code: '102047', name: 'Vibo Valentia', q: [6.5, 5.0, 4.0] },

  // --- Sicilia, Sardegna ---
  { code: '081021', name: 'Trapani', q: [7.5, 6.0, 5.0] },
  { code: '082053', name: 'Palermo', q: [9.0, 7.0, 5.5] },
  { code: '083048', name: 'Messina', q: [8.0, 6.5, 5.0] },
  { code: '084001', name: 'Agrigento', q: [7.0, 5.5, 4.5] },
  { code: '085006', name: 'Caltanissetta', q: [6.5, 5.0, 4.5] },
  { code: '086009', name: 'Enna', q: [6.5, 5.0, 4.5] },
  { code: '087015', name: 'Catania', q: [9.0, 7.0, 5.5] },
  { code: '088009', name: 'Ragusa', q: [8.0, 6.5, 5.5] },
  { code: '089017', name: 'Siracusa', q: [8.5, 6.5, 5.5] },
  { code: '090064', name: 'Sassari', q: [9.0, 7.0, 6.0] },
  { code: '091051', name: 'Nuoro', q: [8.0, 6.5, 5.5] },
  { code: '092009', name: 'Cagliari', q: [11.0, 8.5, 7.0] },
  { code: '095038', name: 'Oristano', q: [8.0, 6.5, 5.5] },
];

/**
 * Fattore applicato ai comuni senza quotazione propria, in funzione della
 * popolazione, per stimarne il canone a partire dal capoluogo di provincia.
 *
 * I comuni minori hanno mediamente canoni più bassi del capoluogo, ma non
 * proporzionalmente alla popolazione: la relazione è fortemente compressa.
 * Si usa una scala a gradini, dichiarata e facile da correggere, invece di
 * una formula continua che darebbe una falsa impressione di precisione.
 */
export function populationFactor(population: number): number {
  if (population >= 100_000) return 0.95;
  if (population >= 50_000) return 0.9;
  if (population >= 20_000) return 0.85;
  if (population >= 10_000) return 0.8;
  if (population >= 5_000) return 0.75;
  return 0.7;
}
