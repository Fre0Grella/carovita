/**
 * Tipi di dominio di Carovita.
 *
 * Il modulo `core` è PURO: nessun accesso a rete, filesystem o DOM.
 * Prende in input uno snapshot di dati (già scaricato) e un profilo utente,
 * e restituisce una proiezione deterministica con attribuzione per categoria.
 */

// ---------------------------------------------------------------------------
// Serie storiche e snapshot dati
// ---------------------------------------------------------------------------

/** Categoria di spesa modellata. Mappa 1:1 su un indice di prezzo. */
export type CategoryId =
  | 'headline' // indice generale (usato come ancora)
  | 'food' // alimentari
  | 'rent' // affitti di mercato
  | 'utilities' // elettricità, gas, altri combustibili
  | 'water' // acqua e servizi relativi all'abitazione
  | 'maintenance' // manutenzione ordinaria abitazione
  | 'transport_fuel' // carburanti / esercizio mezzi propri
  | 'transport_public' // trasporto passeggeri
  | 'health'
  | 'education'
  | 'communications'
  | 'recreation'
  | 'restaurants'
  | 'clothing'
  | 'furnishings'
  | 'insurance'
  | 'misc';

/** Osservazione mensile di un indice di prezzo. `t` in formato `YYYY-MM`. */
export interface MonthlyObs {
  t: string;
  v: number;
}

/**
 * Serie di un indice di prezzo, con provenienza esplicita.
 * La provenienza è parte del dato: senza vintage una previsione non è
 * riproducibile né verificabile.
 */
export interface IndexSeries {
  category: CategoryId;
  /** Etichetta leggibile, in italiano. */
  label: string;
  /** Codice del dataset di origine (es. `prc_hicp_minr`). */
  datasetId: string;
  /** Codice della categoria nella classificazione di origine (es. `CP041`). */
  sourceCode: string;
  source: 'eurostat' | 'istat' | 'ecb' | 'curated';
  sourceUrl: string;
  /** Base dell'indice, es. `2025=100`. */
  base: string;
  /** Ultimo periodo disponibile nel dataset, es. `2026-08`. */
  vintage: string;
  /** Istante in cui il dato è stato scaricato (ISO 8601). */
  fetchedAt: string;
  /** Osservazioni mensili ordinate per `t` crescente. */
  obs: MonthlyObs[];
}

/** Costo medio di locazione per città, da OMI o da baseline curata. */
export interface CityRentQuote {
  /** Codice ISTAT del comune. */
  istatCode: string;
  comune: string;
  provincia: string;
  /** Sigla provincia, es. `MI`. */
  sigla: string;
  regione: string;
  population: number;
  /**
   * Canone di locazione in EUR/m²/mese per fascia di zona OMI.
   * `centro` = zona centrale, `semicentro` = semicentrale,
   * `periferia` = periferica.
   */
  eurM2Month: {
    centro: number;
    semicentro: number;
    periferia: number;
  };
  /** Periodo di riferimento della quotazione, es. `2025-S2`. */
  vintage: string;
  /**
   * `omi` = importato dal file ufficiale dell'Agenzia delle Entrate;
   * `curated` = baseline indicativa inclusa nel progetto;
   * `derived` = stimata dal capoluogo di provincia (comuni minori);
   * `user-import` = inserita dall'utente.
   */
  source: 'omi' | 'curated' | 'derived' | 'user-import';
  /** Note sulla derivazione del dato (obbligatorie per i dati non OMI). */
  note?: string;
}

/** Snapshot completo dei dati esterni su cui si basa la previsione. */
export interface DataSnapshot {
  /** Versione dello schema dello snapshot. */
  schemaVersion: number;
  /** Istante di generazione dello snapshot. */
  generatedAt: string;
  /**
   * `true` se almeno una fonte non ha risposto e si è usato il valore
   * precedente. La UI deve segnalarlo.
   */
  degraded: boolean;
  /** Messaggi diagnostici della pipeline (fonti fallite, fallback usati). */
  warnings: string[];
  series: Partial<Record<CategoryId, IndexSeries>>;
  /**
   * Indice FOI (ISTAT) usato per l'aggiornamento legale dei canoni di
   * locazione. Assente se ISTAT non ha risposto.
   */
  foi?: IndexSeries;
  cities: CityRentQuote[];
  /** Ancora di inflazione di lungo periodo (target BCE), in frazione. */
  longRunAnchor: number;
}

// ---------------------------------------------------------------------------
// Configurazione del profilo utente
// ---------------------------------------------------------------------------

/** Tipologia di contratto di locazione ad uso abitativo (L. 431/1998). */
export type ContractType =
  | 'libero_4_4' // canone libero 4+4
  | 'concordato_3_2' // canone concordato 3+2
  | 'transitorio' // transitorio (max 18 mesi)
  | 'studenti' // studenti universitari (6 mesi - 3 anni)
  | 'proprieta'; // casa di proprietà: nessun canone

export type ZoneTier = 'centro' | 'semicentro' | 'periferia';

/** Classe energetica dell'attestato di prestazione energetica (APE). */
export type EnergyClass = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';

/**
 * Coabitazione: come si ripartisce il canone fra coinquilini.
 *
 * In Italia la quota non si divide quasi mai in parti uguali: chi ha la
 * singola grande paga più di chi sta in una doppia. Il criterio che si usa
 * davvero, quando si tratta, è «la mia camera più la mia parte di spazi
 * comuni», ed è quello modellato qui.
 */
export interface SharingConfig {
  /**
   * Quale canone conosci.
   *
   * `room`: il canone della tua stanza, che è il caso tipico di chi affitta
   * una camera; è il dato su cui si confronta il prezzo con quello delle
   * stanze simili e si prevedono gli aumenti al rinnovo.
   *
   * `apartment`: il canone dell'intero appartamento, da ripartire fra
   * coinquilini secondo le metrature.
   */
  rentBasis: 'room' | 'apartment';
  /** Canone mensile della tua stanza, in EUR (solo con `rentBasis: 'room'`). */
  roomRent: number | null;
  /**
   * Il contratto riguarda solo la tua stanza oppure l'intero appartamento,
   * firmato insieme ai coinquilini. Cambia la base dell'imposta di registro
   * e il suo minimo, che vale per contratto.
   */
  contractScope: 'room' | 'apartment';
  /** Numero di bagni dell'appartamento, se lo conosci. */
  bathrooms: number | null;
  /** Classe energetica dell'appartamento, se la conosci. */
  energyClass: EnergyClass | null;
  /**
   * Quanto pagano in media stanze simili alla tua (stessa zona, metratura e
   * servizi), se lo sai: per esempio i coinquilini o i compagni di corso.
   * È il confronto più affidabile e sostituisce la stima automatica.
   */
  comparableRent: number | null;
  /**
   * Correzione della stima automatica per ciò che la media della città non
   * vede (classe energetica, bagni, stato della casa), in frazione. `null`
   * usa la correzione proposta dall'applicazione.
   */
  qualityAdjustment: number | null;
  /** Metratura della camera che occupi, in m². */
  roomSqm: number;
  /**
   * La camera è doppia: la metratura privata pro capite è la metà, perché
   * quello spazio lo dividi con un'altra persona.
   */
  roomShared: boolean;
  /**
   * Somma delle metrature di tutte le camere da letto, in m². Serve a
   * ricavare per differenza gli spazi comuni (cucina, bagni, corridoio).
   */
  bedroomsSqm: number;
  /** Numero totale di persone che vivono in casa. */
  occupants: number;
  /**
   * Sei intestatario o cointestatario del contratto. Se non lo sei (paghi a
   * un coinquilino che ha firmato), non ti spetta alcuna imposta di registro
   * né di bollo.
   */
  onContract: boolean;
}

export interface HousingConfig {
  contractType: ContractType;
  /** Codice ISTAT del comune di residenza. */
  istatCode: string;
  zone: ZoneTier;
  /** Superficie dell'intera abitazione, in m². */
  sqm: number;
  /**
   * Se valorizzato, l'abitazione è condivisa con altri e i costi del
   * contratto (canone, imposte, condominio) vengono ripartiti.
   * `null` significa che l'abitazione è tutta tua.
   */
  sharing: SharingConfig | null;
  /**
   * Canone mensile dell'**intera abitazione** in EUR, cioè la cifra che
   * risulta dal contratto. In coabitazione non è quanto paghi tu: la tua
   * quota viene calcolata da `sharing`. Se `null`, il canone viene stimato
   * da `eurM2Month[zone] * sqm` per il comune scelto.
   */
  monthlyRent: number | null;
  /**
   * Il locatore ha optato per la cedolare secca. In tal caso rinuncia
   * all'aggiornamento ISTAT del canone e non si paga imposta di registro
   * né imposta di bollo.
   */
  cedolareSecca: boolean;
  /**
   * Il contratto prevede l'aggiornamento ISTAT annuale del canone
   * (ignorato se `cedolareSecca` è true).
   */
  istatIndexation: boolean;
  /** Quota di imposta di registro a carico del conduttore (default 0.5). */
  registrationTaxShare: number;
  /**
   * Comune ad alta tensione abitativa: per il canone concordato la base
   * imponibile dell'imposta di registro è ridotta del 30%.
   */
  highTensionMunicipality: boolean;
  /** Spese condominiali mensili in EUR. */
  condoFees: number;
  /**
   * Mese di inizio del contratto attuale, `YYYY-MM`. Serve a sapere quando
   * cadono gli anniversari (scatto ISTAT, imposta di registro) e il prossimo
   * rinnovo. `null` significa che il contratto inizia adesso.
   */
  contractStart: string | null;
  /**
   * Durata di ciascun contratto in anni, per i tipi in cui la sceglie chi
   * firma: da sei mesi a tre anni per gli studenti, fino a diciotto mesi per
   * il transitorio. `null` usa il valore tipico.
   */
  contractYears: number | null;
  /**
   * Quota del divario rispetto al prezzo di mercato che il proprietario
   * recupera a ogni rinnovo, in frazione (0 = nessun aumento oltre
   * l'inflazione, 1 = subito al prezzo di mercato).
   */
  renewalCatchUp: number;
}

/**
 * Quando viene addebitata una voce di spesa.
 *
 * Non tutte le spese sono mensili, e trattarle come se lo fossero nasconde
 * proprio i mesi difficili: l'assicurazione dell'auto a marzo, la bolletta
 * bimestrale, le rate di un acquisto. Il calendario delle uscite conta quanto
 * il loro totale.
 */
export type ExpenseSchedule =
  /**
   * Addebito ricorrente ogni `everyMonths` mesi (1 = mensile, 12 = annuale).
   * `month` (1-12) è un mese in cui l'addebito avviene: fissa la fase, per
   * esempio marzo per un'assicurazione annuale. `everyMonths` deve dividere
   * 12, così la cadenza resta la stessa ogni anno.
   */
  | { kind: 'recurring'; everyMonths: number; month: number }
  /**
   * Pagamento a rate: `count` rate ogni `everyMonths` mesi a partire da
   * `firstMonth` (`YYYY-MM`). L'importo della rata è fisso in euro: una
   * rata concordata non segue l'inflazione.
   */
  | { kind: 'installments'; firstMonth: string; count: number; everyMonths: number }
  /**
   * Spesa una tantum nel mese `month` (`YYYY-MM`), espressa ai prezzi di oggi
   * e rivalutata con la categoria fino a quella data.
   */
  | { kind: 'once'; month: string };

/** Una voce di spesa configurabile dall'utente. */
export interface ExpenseItem {
  id: string;
  label: string;
  category: CategoryId;
  /**
   * Importo di ogni addebito in EUR, ai prezzi di oggi: al mese per una voce
   * mensile, a scadenza per le altre, a rata per i pagamenti rateali.
   */
  amount: number;
  schedule: ExpenseSchedule;
  /**
   * Tasso di crescita annuo imposto dall'utente, in frazione.
   *
   * `null` significa «usa la previsione del modello per questa
   * categoria», ed è il caso normale: l'energia viene proiettata con
   * la dinamica dell'energia, gli alimentari con quella degli alimentari.
   *
   * Un valore esplicito sostituisce quella previsione con la propria, quando
   * si sa già che quella voce seguirà una strada sua: un abbonamento
   * che scade, un figlio all'asilo, un'auto da mantenere.
   */
  growthOverride: number | null;
}

export interface IncomeConfig {
  /** Reddito netto mensile in EUR. */
  monthlyNet: number;
  /** Numero di mensilità (13 o 14 in Italia). */
  monthsPerYear: number;
  /**
   * Quota dell'inflazione recuperata dagli aumenti salariali, in frazione.
   * 1 = piena indicizzazione, 0 = salario nominale fermo.
   */
  inflationPassThrough: number;
  /** Crescita reale annua della retribuzione (carriera), in frazione. */
  realGrowth: number;
}

export interface Profile {
  id: string;
  name: string;
  /** Colore per i grafici di confronto. */
  color: string;
  housing: HousingConfig;
  /** Utenze e spese legate all'abitazione. */
  utilities: ExpenseItem[];
  /** Tutte le altre spese (alimentari, trasporti, ...). */
  expenses: ExpenseItem[];
  income: IncomeConfig;
  /** Patrimonio liquido iniziale in EUR. */
  initialSavings: number;
  /** Rendimento nominale annuo dei risparmi, in frazione. */
  savingsReturn: number;
}

// ---------------------------------------------------------------------------
// Parametri del modello e output
// ---------------------------------------------------------------------------

/**
 * Parametri stimati del modello di inflazione per una categoria.
 *
 * Modello sul gap di inflazione rispetto all'ancora:
 *   π(t+1) − μ = φ · (π(t) − μ) + ε
 * dove μ = ancora generale + spread di categoria.
 */
export interface CategoryModel {
  category: CategoryId;
  label: string;
  /** Persistenza AR(1) del gap di inflazione, in [0, 0.98]. */
  phi: number;
  /**
   * Differenziale strutturale di lungo periodo rispetto all'indice generale,
   * in frazione annua. L'ancora della categoria è `anchor + spread`.
   */
  spread: number;
  /** Inflazione annua osservata più recente, in frazione. */
  lastRate: number;
  /** Deviazione standard dei residui a 1 anno, in frazione. */
  sigma: number;
  /**
   * Incertezza sulla media di lungo periodo della categoria, in frazione
   * annua. Si accumula linearmente con l'orizzonte.
   */
  sigmaAnchor: number;
  /** Numero di osservazioni annue usate per la stima. */
  nObs: number;
  vintage: string;
  datasetId: string;
  sourceUrl: string;
}

/** Scomposizione della variazione di spesa, per spiegare il "perché". */
export interface Attribution {
  /** Spesa dell'anno base, in EUR. */
  base: number;
  /** Contributo dell'ancora di inflazione generale, in EUR. */
  fromAnchor: number;
  /** Contributo del differenziale di categoria, in EUR. */
  fromSpread: number;
  /** Contributo della persistenza (partenza da un gap non nullo), in EUR. */
  fromPersistence: number;
  /**
   * Contributo dell'ipotesi di crescita imposta dall'utente, in EUR.
   * Valorizzato solo quando la previsione del modello è stata sostituita.
   */
  fromOverride: number;
  /** Contributo di effetti contrattuali (scatti e reset del canone), in EUR. */
  fromContract: number;
  /**
   * Contributo del riallineamento al prezzo delle stanze simili ai rinnovi
   * del contratto, in EUR. Valorizzato solo per chi affitta una stanza.
   */
  fromMarketGap: number;
}

export interface CategoryYearProjection {
  category: CategoryId;
  label: string;
  year: number;
  /** Spesa annua nominale in EUR. */
  nominal: number;
  /** Spesa annua in EUR costanti dell'anno base. */
  real: number;
  /** Banda di incertezza (nominale) al livello di confidenza indicato. */
  lo: number;
  hi: number;
  attribution: Attribution;
  /** Tasso di inflazione applicato alla categoria in quell'anno, in frazione. */
  rate: number;
  /** Voce di spesa di origine; `null` per l'abitazione. */
  itemId: string | null;
  /** Cadenza degli addebiti; `null` per l'abitazione. */
  schedule: ExpenseSchedule | null;
  /**
   * Prezzo di un singolo addebito oggi e nel periodo, in EUR: la bolletta,
   * la rata, il premio annuale; per l'abitazione, il canone mensile a tuo
   * carico. È il modo più concreto di mostrare l'inflazione: la stessa
   * cosa, due prezzi.
   */
  unitBase: number;
  unitAmount: number;
}

export interface ProjectionEvent {
  year: number;
  /** Mese dell'evento, `YYYY-MM`, quando è noto. */
  month?: string;
  kind:
    | 'istat_step'
    | 'contract_renewal'
    | 'market_reset'
    | 'registration_tax'
    | 'note';
  /** Descrizione leggibile, in italiano, con i numeri già inseriti. */
  message: string;
  amount?: number;
}

/**
 * Un periodo di proiezione: dodici mesi a partire dal mese di riferimento,
 * non un anno solare.
 *
 * Partire da gennaio darebbe un conto sbagliato per chi apre l'applicazione a
 * settembre: verrebbe imputata una spesa annua intera a un anno di cui restano
 * tre mesi. I periodi scorrono quindi dal mese corrente, e l'ultimo può
 * essere parziale quando l'orizzonte non è un numero intero di anni.
 */
export interface Period {
  index: number;
  /** Primo mese del periodo, `YYYY-MM`. */
  startMonth: string;
  /** Ultimo mese compreso nel periodo, `YYYY-MM`. */
  endMonth: string;
  /** Anno solare in cui il periodo inizia. */
  year: number;
  /** Etichetta breve, es. `set 2026`. */
  label: string;
  /** Etichetta estesa, es. `set 2026 - ago 2027`. */
  labelLong: string;
  /** Quota di anno coperta: 1 per un periodo pieno, meno per l'ultimo. */
  fraction: number;
  /** Mesi effettivamente coperti. */
  months: number;
}

export interface YearProjection {
  year: number;
  /** Etichetta breve del periodo, per gli assi dei grafici. */
  label: string;
  /** Etichetta estesa del periodo, per i suggerimenti. */
  labelLong: string;
  /** Quota di anno coperta dal periodo (1 = dodici mesi). */
  fraction: number;
  /** Indice dei prezzi generale cumulato rispetto all'anno base (1 = base). */
  priceLevel: number;
  totalNominal: number;
  totalReal: number;
  totalLo: number;
  totalHi: number;
  incomeNominal: number;
  savingsNominal: number;
  /** Patrimonio cumulato a fine anno, in EUR nominali. */
  cumulativeWealth: number;
  /**
   * Patrimonio nello scenario di spesa alta e in quello di spesa bassa, in
   * EUR nominali.
   *
   * La banda sul patrimonio è molto più larga, in proporzione, di
   * quella sulla spesa: il risparmio è la differenza fra due numeri
   * grandi e simili, quindi un errore del 5% sulla spesa può spostare il
   * risparmio annuo di metà. È il motivo per cui va mostrata.
   */
  cumulativeWealthLo: number;
  cumulativeWealthHi: number;
  categories: CategoryYearProjection[];
  /** Eventi rilevanti dell'anno (scatti ISTAT, rinnovi, imposte). */
  events: ProjectionEvent[];
}

/**
 * Un mese della proiezione.
 *
 * I periodi annuali restano l'unità in cui vivono le regole (scatti ISTAT,
 * imposta di registro, stima dell'inflazione); i mesi ne sono la
 * scomposizione nel calendario. La somma dei mesi di un periodo coincide
 * esattamente con i totali del periodo.
 */
export interface MonthProjection {
  /** Mesi trascorsi dall'inizio della proiezione (0 = mese corrente). */
  index: number;
  /** Mese, `YYYY-MM`. */
  month: string;
  /** Indice del periodo annuale a cui appartiene. */
  period: number;
  /** Livello generale dei prezzi rispetto a oggi (1 = prezzi di oggi). */
  priceLevel: number;
  /** Uscite del mese, in EUR nominali. */
  spend: number;
  spendLo: number;
  spendHi: number;
  /** Entrate del mese, in EUR nominali (tredicesima e quattordicesima incluse). */
  income: number;
  /** Patrimonio a fine mese, in EUR nominali. */
  wealth: number;
  wealthLo: number;
  wealthHi: number;
  /**
   * Movimenti non mensili del mese: spese annuali, rate, una tantum e imposte
   * del contratto in uscita, tredicesima e quattordicesima in entrata (con
   * `income` vero). Spiegano i picchi del grafico.
   */
  charges: { label: string; amount: number; income?: boolean }[];
}

/**
 * Stima del prezzo di mercato di una stanza simile alla tua.
 *
 * Ogni passaggio della stima è esposto, con la sua natura: un dato
 * pubblicato, una derivazione da dati, oppure un'ipotesi dichiarata.
 */
export interface RoomBenchmark {
  /** Canone mensile stimato per una stanza come la tua, oggi, in EUR. */
  central: number;
  /** Intervallo plausibile della stima, in EUR. */
  lo: number;
  hi: number;
  /**
   * `dato`: media pubblicata per la città; `derivato`: ricavato dal canone
   * al metro quadro del comune; `tuo`: il canone di stanze simili inserito
   * da te.
   */
  basis: 'dato' | 'derivato' | 'tuo';
  steps: {
    label: string;
    /** Importo dopo il passaggio, in EUR. */
    value: number;
    kind: 'dato' | 'derivato' | 'ipotesi' | 'tuo';
    note?: string;
  }[];
  /** Fonte e periodo del dato di partenza. */
  source: string;
}

/** Un rinnovo del contratto e il canone previsto dopo. */
export interface RentRenewal {
  /** Mese del rinnovo, `YYYY-MM`. */
  month: string;
  /** Canone mensile a tuo carico prima del rinnovo, in EUR. */
  from: number;
  /** Canone previsto dopo il rinnovo, in EUR. */
  to: number;
  /** Se il proprietario non recupera nulla del divario. */
  toLo: number;
  /** Se il proprietario porta subito il canone al prezzo di mercato. */
  toHi: number;
  /** Prezzo di mercato stimato in quel momento, in EUR. */
  market: number | null;
}

/** Il tuo affitto rispetto al mercato, e gli aumenti attesi. */
export interface RentOutlook {
  basis: 'room' | 'apartment';
  /** Canone mensile a tuo carico oggi, in EUR. */
  currentRent: number;
  benchmark: RoomBenchmark | null;
  /** Scostamento del mercato dal tuo canone: 0,2 = il mercato chiede il 20% in più. */
  gap: number | null;
  catchUp: number;
  renewals: RentRenewal[];
}

export interface ProjectionResult {
  profileId: string;
  profileName: string;
  /** Il tuo affitto rispetto al mercato e i rinnovi attesi; `null` se non affitti. */
  rentOutlook: RentOutlook | null;
  /** Scomposizione mese per mese dei periodi. */
  months: MonthProjection[];
  /** Patrimonio di partenza, in EUR: il punto da cui parte la curva. */
  initialSavings: number;
  /** Mese di partenza della proiezione, `YYYY-MM`. */
  startMonth: string;
  /** Ultimo mese coperto dalla proiezione, `YYYY-MM`. */
  endMonth: string;
  /** Anno solare in cui la proiezione inizia. */
  baseYear: number;
  years: YearProjection[];
  models: CategoryModel[];
  /** Ancora di inflazione usata, in frazione. */
  anchor: number;
  /**
   * Correlazione media stimata fra le inflazioni delle categorie, usata per
   * aggregare le loro incertezze nel totale.
   */
  categoryCorrelation: number;
  /** Livello di confidenza delle bande (es. 0.8). */
  confidence: number;
  warnings: string[];
}

/** Impostazioni dello scenario di proiezione. */
export interface ScenarioSettings {
  /**
   * Mese di partenza della proiezione, `YYYY-MM`. Normalmente il mese
   * corrente: i conti partono da oggi, non dall'inizio dell'anno solare.
   */
  startMonth: string;
  /** Orizzonte in anni, anche frazionario (1.5 = diciotto mesi). */
  horizon: number;
  /**
   * Ancora di inflazione di lungo periodo, in frazione. Se `null` usa quella
   * dello snapshot (target BCE 2%).
   */
  anchorOverride: number | null;
  /** Livello di confidenza delle bande, in frazione (es. 0.8). */
  confidence: number;
}
