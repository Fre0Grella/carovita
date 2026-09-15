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

/**
 * Coabitazione: come si ripartisce il canone fra coinquilini.
 *
 * In Italia la quota non si divide quasi mai in parti uguali: chi ha la
 * singola grande paga più di chi sta in una doppia. Il criterio che si usa
 * davvero, quando si tratta, è «la mia camera più la mia parte di spazi
 * comuni», ed è quello modellato qui.
 */
export interface SharingConfig {
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
}

/** Una voce di spesa configurabile dall'utente. */
export interface ExpenseItem {
  id: string;
  label: string;
  category: CategoryId;
  /** Spesa mensile corrente in EUR (valore nominale di oggi). */
  monthlyAmount: number;
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
}

export interface ProjectionEvent {
  year: number;
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

export interface YearProjection {
  year: number;
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

export interface ProjectionResult {
  profileId: string;
  profileName: string;
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
  /** Anno base della proiezione. */
  baseYear: number;
  /** Orizzonte in anni. */
  horizon: number;
  /**
   * Ancora di inflazione di lungo periodo, in frazione. Se `null` usa quella
   * dello snapshot (target BCE 2%).
   */
  anchorOverride: number | null;
  /** Livello di confidenza delle bande, in frazione (es. 0.8). */
  confidence: number;
}
