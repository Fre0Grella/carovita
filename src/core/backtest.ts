/**
 * Backtest del modello di previsione.
 *
 * Una previsione senza validazione è un'opinione. Qui si verifica il modello
 * con un **walk-forward out-of-sample**: si tronca la serie a un certo anno,
 * si stimano i parametri usando *solo* i dati fino a quel punto, si prevede a
 * 1..H anni e si confronta con quello che è poi realmente successo. I
 * parametri non vedono mai il futuro, quindi l'errore misurato è onesto.
 *
 * Il confronto è contro due riferimenti ("naive benchmark"):
 *
 *  - **random walk**: "l'inflazione del prossimo anno sarà uguale a quella di
 *    quest'anno". È il benchmark classico e, su orizzonti brevi, è
 *    sorprendentemente difficile da battere.
 *  - **ancora fissa**: "l'inflazione sarà sempre il 2%". Su orizzonti lunghi
 *    è forte, perché l'inflazione effettivamente ritorna verso il target.
 *
 * Il modello a ritorno verso la media dovrebbe stare vicino al random walk a
 * 1 anno e batterlo nettamente a 5-10 anni. Se non lo fa, il modello non
 * serve e va cambiato: per questo il backtest è eseguibile con `npm run
 * backtest` e i risultati sono committati in `docs/BACKTEST.md`.
 */

import { estimateCategoryModel } from './model.js';
import { annualInflation } from './series.js';
import type { CategoryId, IndexSeries } from './types.js';

export interface HorizonError {
  horizon: number;
  /** Errore assoluto medio del modello, in punti percentuali annui. */
  maeModel: number;
  /** Errore assoluto medio del random walk, in punti percentuali. */
  maeRandomWalk: number;
  /** Errore assoluto medio dell'ancora fissa, in punti percentuali. */
  maeAnchor: number;
  /** Errore medio con segno del modello: positivo = sovrastima. */
  biasModel: number;
  /** Numero di confronti effettuati. */
  n: number;
  /**
   * Quota di osservazioni cadute dentro la banda di confidenza dichiarata.
   * Con confidenza 0.8 un modello ben calibrato sta intorno a 0.8.
   */
  coverage: number;
}

export interface CategoryBacktest {
  category: CategoryId;
  label: string;
  horizons: HorizonError[];
  /** Media su tutti gli orizzonti dell'errore del modello. */
  meanMae: number;
  /** Media su tutti gli orizzonti dell'errore del random walk. */
  meanMaeRandomWalk: number;
  /** Media su tutti gli orizzonti dell'errore dell'ancora fissa. */
  meanMaeAnchor: number;
}

export interface BacktestOptions {
  /** Orizzonte massimo in anni. */
  maxHorizon: number;
  /** Anni minimi di storia richiesti per stimare i parametri. */
  minTrainYears: number;
  /** Ancora di lungo periodo usata dal modello e dal benchmark. */
  anchor: number;
  /** Livello di confidenza delle bande da validare. */
  confidence: number;
}

export const DEFAULT_BACKTEST: BacktestOptions = {
  maxHorizon: 10,
  minTrainYears: 12,
  anchor: 0.02,
  confidence: 0.8,
};

/** Tronca una serie mensile all'ultimo mese dell'anno indicato. */
function truncate(series: IndexSeries, lastYear: number): IndexSeries {
  return {
    ...series,
    obs: series.obs.filter((o) => Number(o.t.slice(0, 4)) <= lastYear),
  };
}

/**
 * Esegue il backtest walk-forward su una categoria.
 *
 * Per ogni anno di origine `T` (dopo `minTrainYears` di storia) e per ogni
 * orizzonte `h`, si confronta la previsione fatta in `T` per l'anno `T+h`
 * con l'inflazione effettivamente realizzata in `T+h`.
 */
export function backtestCategory(
  series: IndexSeries,
  headline: IndexSeries,
  opts: BacktestOptions = DEFAULT_BACKTEST,
): CategoryBacktest {
  const realized = annualInflation(series.obs);
  const years = [...realized.keys()].sort((a, b) => a - b);
  const firstYear = years[0];
  const lastYear = years[years.length - 1];

  const acc = new Map<
    number,
    { model: number[]; rw: number[]; anchor: number[]; inBand: number[] }
  >();
  for (let h = 1; h <= opts.maxHorizon; h++) {
    acc.set(h, { model: [], rw: [], anchor: [], inBand: [] });
  }

  if (firstYear === undefined || lastYear === undefined) {
    return emptyResult(series);
  }

  for (
    let origin = firstYear + opts.minTrainYears;
    origin <= lastYear;
    origin++
  ) {
    // Stima con i soli dati disponibili fino a `origin` compreso.
    const trainCat = truncate(series, origin);
    const trainHead = truncate(headline, origin);
    if (annualInflation(trainCat.obs).size < opts.minTrainYears) continue;

    const model = estimateCategoryModel(trainCat, trainHead);
    const lastObserved = annualInflation(trainCat.obs).get(origin);
    if (lastObserved === undefined) continue;

    const mu = opts.anchor + model.spread;

    for (let h = 1; h <= opts.maxHorizon; h++) {
      const target = realized.get(origin + h);
      if (target === undefined) continue;

      const predicted = mu + Math.pow(model.phi, h) * (lastObserved - mu);
      const bucket = acc.get(h)!;
      bucket.model.push(predicted - target);
      bucket.rw.push(lastObserved - target);
      bucket.anchor.push(opts.anchor - target);

      // Calibrazione: il tasso realizzato cade nella banda prevista?
      // La banda a h anni sul tasso annuo ha ampiezza sigma * z * sqrt(h)
      // sotto ipotesi di shock indipendenti.
      const z = 1.2815515655446004; // quantile 0.9 della normale standard
      const halfWidth = model.sigma * z * Math.sqrt(h);
      bucket.inBand.push(Math.abs(predicted - target) <= halfWidth ? 1 : 0);
    }
  }

  const horizons: HorizonError[] = [];
  for (let h = 1; h <= opts.maxHorizon; h++) {
    const b = acc.get(h)!;
    if (b.model.length === 0) continue;
    horizons.push({
      horizon: h,
      maeModel: mae(b.model),
      maeRandomWalk: mae(b.rw),
      maeAnchor: mae(b.anchor),
      biasModel: avg(b.model),
      n: b.model.length,
      coverage: avg(b.inBand),
    });
  }

  return {
    category: series.category,
    label: series.label,
    horizons,
    meanMae: avg(horizons.map((x) => x.maeModel)),
    meanMaeRandomWalk: avg(horizons.map((x) => x.maeRandomWalk)),
    meanMaeAnchor: avg(horizons.map((x) => x.maeAnchor)),
  };
}

function emptyResult(series: IndexSeries): CategoryBacktest {
  return {
    category: series.category,
    label: series.label,
    horizons: [],
    meanMae: NaN,
    meanMaeRandomWalk: NaN,
    meanMaeAnchor: NaN,
  };
}

function mae(xs: number[]): number {
  if (xs.length === 0) return NaN;
  return xs.reduce((a, b) => a + Math.abs(b), 0) / xs.length;
}

function avg(xs: number[]): number {
  if (xs.length === 0) return NaN;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** Esegue il backtest su tutte le categorie disponibili. */
export function backtestAll(
  seriesList: IndexSeries[],
  headline: IndexSeries,
  opts: BacktestOptions = DEFAULT_BACKTEST,
): CategoryBacktest[] {
  return seriesList
    .map((s) => backtestCategory(s, headline, opts))
    .filter((r) => r.horizons.length > 0);
}
