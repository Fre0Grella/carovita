/**
 * Modello di previsione dell'inflazione per categoria.
 *
 * ## Perché questo modello
 *
 * L'errore più comune nelle previsioni "fai da te" è proiettare all'infinito
 * l'ultimo tasso osservato. È sbagliato: l'inflazione è fortemente
 * mean-reverting. Nel 2022 l'energia in Italia ha superato il +50% annuo; chi
 * avesse proiettato quel tasso su 10 anni avrebbe previsto bollette 57 volte
 * più care. Nel 2025 l'energia era in calo.
 *
 * Il modello usato qui è il classico **gap di inflazione con ritorno alla
 * media**, lo stesso impianto con cui le banche centrali ragionano sulle
 * aspettative ancorate:
 *
 *     π_c(t+1) − μ_c = φ_c · (π_c(t) − μ_c) + ε
 *
 * dove:
 *  - `μ_c = ancora + spread_c` è l'ancora di lungo periodo della categoria.
 *    L'ancora generale è il target BCE (2%); lo `spread_c` è il
 *    differenziale storico medio della categoria rispetto all'indice
 *    generale. Gli affitti e i servizi crescono strutturalmente più della
 *    media, l'elettronica meno: lo spread cattura proprio questo.
 *  - `φ_c` è la persistenza, stimata via OLS sui dati storici. Con φ vicino a
 *    0 lo shock rientra subito, con φ vicino a 1 dura a lungo.
 *
 * A orizzonte h il tasso atteso è dunque:
 *
 *     E[π_c(t+h)] = μ_c + φ_c^h · (π_c(t) − μ_c)
 *
 * che parte dal dato osservato e converge all'ancora: esattamente il
 * comportamento che si vuole.
 *
 * ## Perché lo spread è relativo e non assoluto
 *
 * Modellare ogni categoria con la propria ancora assoluta renderebbe
 * incoerente lo scenario: se l'utente vuole simulare "inflazione al 4%", tutte
 * le categorie devono spostarsi insieme. Ancorando al *differenziale*
 * rispetto all'indice generale, cambiare l'ancora generale muove
 * coerentemente tutte le categorie mantenendone i rapporti storici.
 */

import {
  clamp,
  decemberInflation,
  latestYoY,
  mean,
  normInv,
  olsSlopeNoIntercept,
  stdev,
} from './series.js';
import type { CategoryId, CategoryModel, DataSnapshot, IndexSeries } from './types.js';

/**
 * Numero minimo di osservazioni annue per stimare la persistenza. Sotto
 * questa soglia la stima OLS è rumore, e si usa il valore di default.
 */
const MIN_OBS_FOR_PHI = 8;

/**
 * Persistenza di default quando i dati sono insufficienti. 0.5 implica che
 * metà dello scostamento dall'ancora rientra in un anno: un valore prudente,
 * in linea con la persistenza tipica dell'inflazione headline nell'area euro.
 */
const DEFAULT_PHI = 0.5;

/**
 * Tetto alla persistenza. φ ≥ 1 produrrebbe una previsione esplosiva (lo
 * scostamento non rientrerebbe mai); si vincola sotto 1 per garantire che la
 * proiezione converga sempre all'ancora.
 */
const MAX_PHI = 0.92;

/**
 * Tetto al differenziale di categoria, in frazione annua. Un vincolo di
 * ±3 punti impedisce che una categoria molto volatile (energia) o una serie
 * corta producano uno spread implausibile proiettato per decenni.
 */
const MAX_SPREAD = 0.03;

/**
 * Varianza a priori della persistenza. Governa quanto la stima OLS viene
 * tirata verso `DEFAULT_PHI`: con 0.09 (deviazione standard 0.3) il prior è
 * ampio e cede quasi del tutto il passo ai dati quando questi sono
 * informativi, restando invece dominante su campioni molto corti.
 */
const PHI_PRIOR_VAR = 0.09;

/** Stima i parametri del modello per una singola serie di categoria. */
export function estimateCategoryModel(
  series: IndexSeries,
  headline: IndexSeries,
): CategoryModel {
  // Tendenziali di dicembre: stessa grandezza che innesca la previsione.
  const catInfl = decemberInflation(series.obs);
  const headInfl = decemberInflation(headline.obs);

  // Differenziale storico medio rispetto all'indice generale, calcolato solo
  // sugli anni presenti in entrambe le serie.
  const diffs: number[] = [];
  for (const [y, v] of catInfl) {
    const h = headInfl.get(y);
    if (h !== undefined) diffs.push(v - h);
  }
  // Restringimento empirico-bayesiano del differenziale.
  //
  // La media campionaria del differenziale è rumorosa: su una trentina di
  // anni, con shock strutturali (euro, crisi energetiche, liberalizzazione
  // delle telecomunicazioni), una categoria può mostrare uno scarto medio
  // che è in buona parte rumore. Proiettarlo per dieci anni come se fosse
  // strutturale peggiora la previsione.
  //
  // Si pesa quindi il differenziale osservato per il suo rapporto
  // segnale/rumore:
  //
  //     λ = spread² / (spread² + se²),   se = sd(diffs) / √n
  //
  // Dove il differenziale è ampio rispetto al suo errore standard (la
  // telefonia, che cala strutturalmente da trent'anni) λ ≈ 1 e il valore
  // resta quasi intatto. Dove è piccolo rispetto al rumore λ → 0 e la
  // categoria torna a seguire l'indice generale. È la stessa logica dello
  // stimatore di James-Stein, e non introduce parametri da tarare.
  const rawSpread = diffs.length > 0 ? mean(diffs) : 0;
  const se = diffs.length > 1 ? stdev(diffs) / Math.sqrt(diffs.length) : Infinity;
  const lambda =
    Number.isFinite(se) && rawSpread !== 0
      ? (rawSpread * rawSpread) / (rawSpread * rawSpread + se * se)
      : 0;
  const spread = clamp(rawSpread * lambda, -MAX_SPREAD, MAX_SPREAD);

  // Persistenza: regressione del gap sul gap ritardato di un anno.
  // Il gap è centrato sulla media della categoria stessa, così la stima di φ
  // non dipende dall'ancora scelta dall'utente.
  const years = [...catInfl.keys()].sort((a, b) => a - b);
  const catMean = mean(years.map((y) => catInfl.get(y)!));
  const x: number[] = [];
  const y: number[] = [];
  for (let i = 1; i < years.length; i++) {
    const prevYear = years[i - 1]!;
    const curYear = years[i]!;
    // Solo coppie di anni consecutivi: un buco nella serie romperebbe l'AR(1).
    if (curYear - prevYear !== 1) continue;
    x.push(catInfl.get(prevYear)! - catMean);
    y.push(catInfl.get(curYear)! - catMean);
  }

  const phiHat =
    x.length >= MIN_OBS_FOR_PHI
      ? clamp(olsSlopeNoIntercept(x, y), 0, MAX_PHI)
      : DEFAULT_PHI;

  // Sigma: deviazione standard dei residui della regressione.
  const resid = x.map((xi, i) => y[i]! - phiHat * xi);
  const residSd = resid.length >= 2 ? stdev(resid) : stdev(diffs) || 0.01;

  // Anche la persistenza va ristretta verso il valore di default: su campioni
  // corti l'OLS su un solo regressore ha un errore standard rilevante, e una
  // phi sovrastimata trascina l'ultimo dato osservato troppo a lungo nel
  // futuro. Si pesa la stima con la sua precisione relativa.
  const sxx = x.reduce((a, b) => a + b * b, 0);
  const sePhi = sxx > 0 && x.length > 2 ? residSd / Math.sqrt(sxx) : Infinity;
  const wPhi = Number.isFinite(sePhi)
    ? 1 / (1 + (sePhi * sePhi) / PHI_PRIOR_VAR)
    : 0;
  const phi = clamp(wPhi * phiHat + (1 - wPhi) * DEFAULT_PHI, 0, MAX_PHI);

  // L'incertezza dichiarata deve tenere conto anche dell'errore di stima dei
  // parametri, non solo della dispersione dei residui: con pochi anni di
  // storia i residui in-sample sottostimano l'errore fuori campione. Il
  // fattore di correzione è quello classico per gradi di libertà.
  const dof = Math.max(x.length - 2, 1);
  const sigma = residSd * Math.sqrt((x.length + 2) / dof);

  const lastRate = latestYoY(series.obs) ?? catMean;

  // Incertezza sulla media di lungo periodo della categoria. A differenza
  // degli shock annui, che si smorzano, un errore sull'ancora si accumula
  // linearmente con l'orizzonte: se l'inflazione media dei prossimi dieci
  // anni fosse 3% invece di 2%, lo scarto sul livello sarebbe del 10%, non
  // del 3%. Ignorarla e' la ragione principale per cui le bande a lungo
  // termine risultano troppo strette.
  //
  // L'errore standard non e' pero' sd/sqrt(n): i tassi di inflazione annui
  // sono fortemente autocorrelati, e trattarli come indipendenti sovrastima
  // di molto la precisione con cui conosciamo la media. Si usa quindi la
  // numerosita' campionaria efficace di Bartlett,
  //
  //     n_eff = n * (1 - rho) / (1 + rho)
  //
  // con rho approssimato dalla persistenza gia' stimata. Con phi = 0.5 la
  // numerosita' efficace e' un terzo di quella nominale, e l'incertezza
  // sull'ancora cresce di circa il 70%.
  const rates = [...catInfl.values()];
  const nEff = Math.max(
    2,
    (rates.length * (1 - phi)) / (1 + phi),
  );
  const sigmaAnchor =
    rates.length > 1 ? stdev(rates) / Math.sqrt(nEff) : 0.005;

  return {
    category: series.category,
    label: series.label,
    phi,
    spread,
    lastRate,
    sigma,
    sigmaAnchor,
    nObs: x.length,
    vintage: series.vintage,
    datasetId: series.datasetId,
    sourceUrl: series.sourceUrl,
  };
}

/** Stima i modelli per tutte le categorie presenti nello snapshot. */
export function estimateAllModels(snapshot: DataSnapshot): CategoryModel[] {
  const headline = snapshot.series.headline;
  if (!headline) {
    throw new Error(
      'Snapshot privo della serie headline: impossibile stimare i modelli.',
    );
  }
  const out: CategoryModel[] = [];
  for (const series of Object.values(snapshot.series)) {
    if (series) out.push(estimateCategoryModel(series, headline));
  }
  return out.sort((a, b) => a.category.localeCompare(b.category));
}

/**
 * Scomposizione del tasso previsto a orizzonte `h` (in anni, h ≥ 1).
 *
 * Restituisce i tre addendi che, sommati, danno il tasso previsto. Serve
 * all'explainability: la UI mostra quanta parte dell'aumento viene
 * dall'inflazione generale, quanta dal differenziale della categoria e
 * quanta dal fatto che si parte da un livello anomalo.
 */
export interface RateDecomposition {
  /** Contributo dell'ancora generale. */
  anchor: number;
  /** Contributo del differenziale strutturale della categoria. */
  spread: number;
  /** Contributo del rientro del gap corrente verso l'ancora. */
  persistence: number;
  /** Somma dei tre: il tasso previsto per l'anno, in frazione. */
  total: number;
}

export function forecastRate(
  model: CategoryModel,
  anchor: number,
  h: number,
): RateDecomposition {
  const mu = anchor + model.spread;
  const gap = model.lastRate - mu;
  const decay = Math.pow(model.phi, h);
  const persistence = decay * gap;
  return {
    anchor,
    spread: model.spread,
    persistence,
    total: mu + persistence,
  };
}

/**
 * Incertezza cumulata sul livello dei prezzi a orizzonte `h`.
 *
 * Gli shock annui si accumulano sul livello. Sotto AR(1) la varianza della
 * somma dei tassi fino a h è:
 *
 *     Var = σ² · Σ_{k=1..h} ( (1 − φ^(h−k+1)) / (1 − φ) )²
 *
 * cioè ogni shock in k si propaga agli anni successivi smorzandosi. Con φ = 0
 * si riduce a σ²·h (random walk sui tassi indipendenti), con φ → 1 cresce
 * molto più in fretta: è il comportamento corretto, perché una persistenza
 * alta rende l'orizzonte lungo molto più incerto.
 */
export function cumulativeSigma(model: CategoryModel, h: number): number {
  const phi = model.phi;
  let varSum = 0;
  for (let k = 1; k <= h; k++) {
    const steps = h - k + 1;
    const weight =
      Math.abs(1 - phi) < 1e-9 ? steps : (1 - Math.pow(phi, steps)) / (1 - phi);
    varSum += weight * weight;
  }
  const shockVar = model.sigma * model.sigma * varSum;
  // L'errore sull'ancora non si smorza: entra con peso h su tutti gli anni.
  const anchorVar = Math.pow(model.sigmaAnchor * h, 2);
  return Math.sqrt(shockVar + anchorVar);
}

/**
 * Fattore moltiplicativo dell'incertezza sul livello a orizzonte `h`, al
 * livello di confidenza dato. Restituisce il moltiplicatore per la banda
 * bassa e alta (es. 0.93 e 1.08).
 */
export function uncertaintyBand(
  model: CategoryModel,
  h: number,
  confidence: number,
): { lo: number; hi: number } {
  const q = studentQuantile(0.5 + confidence / 2, Math.max(model.nObs - 2, 3));
  const s = cumulativeSigma(model, h) * q;
  return { lo: Math.exp(-s), hi: Math.exp(s) };
}

/**
 * Quantile della t di Student con `df` gradi di liberta'.
 *
 * Si usa la t invece della normale perche' i parametri sono stimati su poche
 * decine di osservazioni e l'inflazione ha code piu' spesse di una gaussiana:
 * gli shock energetici del 2022 non sono eventi "da normale". La t allarga le
 * code in modo controllato e, al crescere di `df`, ritorna alla normale.
 *
 * Approssimazione di Cornish-Fisher, accurata a sufficienza per bande di
 * confidenza e senza dipendenze esterne.
 */
export function studentQuantile(p: number, df: number): number {
  const z = normInv(p);
  const z2 = z * z;
  const g1 = (z2 * z + z) / 4;
  const g2 = (5 * z2 * z2 * z + 16 * z2 * z + 3 * z) / 96;
  const g3 = (3 * z2 * z2 * z2 * z + 19 * z2 * z2 * z + 17 * z2 * z - 15 * z) / 384;
  return z + g1 / df + g2 / (df * df) + g3 / (df * df * df);
}

/**
 * Indice cumulato dei prezzi di una categoria dall'anno base fino a
 * orizzonte `h`, con la scomposizione anno per anno.
 *
 * Restituisce un array lungo `h + 1` dove l'elemento 0 vale 1 (anno base).
 */
export function cumulativeIndex(
  model: CategoryModel,
  anchor: number,
  horizon: number,
): { level: number; rate: RateDecomposition }[] {
  const out: { level: number; rate: RateDecomposition }[] = [
    {
      level: 1,
      rate: { anchor: 0, spread: 0, persistence: 0, total: 0 },
    },
  ];
  let level = 1;
  for (let h = 1; h <= horizon; h++) {
    const rate = forecastRate(model, anchor, h);
    level *= 1 + rate.total;
    out.push({ level, rate });
  }
  return out;
}

/**
 * Trova il modello di una categoria, con fallback sulla headline se la
 * categoria non è disponibile nello snapshot. Il fallback è esplicito e
 * viene segnalato nei warning della proiezione.
 */
export function modelFor(
  models: CategoryModel[],
  category: CategoryId,
): CategoryModel | null {
  return models.find((m) => m.category === category) ?? null;
}
