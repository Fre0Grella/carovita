/**
 * Backtest del modello di previsione.
 *
 * Una previsione senza validazione è un'opinione. Qui si verifica il modello
 * con un **walk-forward out-of-sample**: si tronca la serie a un certo anno,
 * si stimano i parametri usando *solo* i dati fino a quel punto, si prevede a
 * 1..H anni e si confronta con quello che è poi realmente successo. I
 * parametri non vedono mai il futuro, quindi l'errore misurato è onesto.
 *
 * ## Due regole che questo backtest rispetta, e che è facile violare
 *
 * 1. **Si parte dallo stesso numero della produzione.** Il modello in
 *    esercizio innesca la ricorsione con l'ultimo tendenziale disponibile
 *    (`latestYoY`), non con la media annua. Se il backtest partisse dalla
 *    media annua misurerebbe una configurazione diversa da quella spedita,
 *    proprio nel termine che domina a un anno.
 *
 * 2. **Si valida la grandezza che si mostra a schermo.** Il grafico non
 *    disegna il tasso annuo: disegna il *livello cumulato* della spesa con
 *    la sua banda. Sono due quantità con varianze diverse. Per questo qui si
 *    misurano entrambe le coperture, e nel rapporto compare anche quella sul
 *    livello, che è la sola che dica qualcosa sulle bande viste dall'utente.
 *
 * Il confronto è contro due riferimenti ("naive benchmark"):
 *
 *  - **random walk**: "l'inflazione del prossimo anno sarà uguale a quella di
 *    quest'anno". È il benchmark classico e, su orizzonti brevi, è
 *    sorprendentemente difficile da battere.
 *  - **ancora fissa**: "l'inflazione sarà sempre il 2%". Su orizzonti lunghi
 *    è forte, perché l'inflazione effettivamente ritorna verso il target.
 */

import { estimateCategoryModel, forecastRate, uncertaintyBand } from './model.js';
import { latestYoY, normInv, yoyRates } from './series.js';
import type { CategoryId, IndexSeries, MonthlyObs } from './types.js';

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
   * Quota di tassi annui realizzati caduti nella banda dichiarata.
   * Con confidenza 0.8 un modello ben calibrato sta intorno a 0.8.
   */
  coverageRate: number;
  /**
   * Quota di *livelli cumulati* realizzati caduti nella banda dichiarata.
   * È la copertura delle bande effettivamente disegnate nei grafici.
   */
  coverageLevel: number;
  /**
   * Errore assoluto medio sul livello cumulato a orizzonte h, in frazione
   * (0.05 = 5% di scarto sulla spesa cumulata prevista).
   */
  maeLevel: number;
}

export interface CategoryBacktest {
  category: CategoryId;
  label: string;
  horizons: HorizonError[];
  meanMae: number;
  meanMaeRandomWalk: number;
  meanMaeAnchor: number;
}

export interface BacktestOptions {
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

/** Valore dell'indice a dicembre dell'anno indicato, se presente. */
function december(obs: MonthlyObs[], year: number): number | undefined {
  return obs.find((o) => o.t === `${year}-12`)?.v;
}

/** Tendenziale annuo a dicembre dell'anno indicato, se calcolabile. */
function decemberYoY(obs: MonthlyObs[], year: number): number | undefined {
  return yoyRates(obs).find((o) => o.t === `${year}-12`)?.v;
}

/**
 * Esegue il backtest walk-forward su una categoria.
 *
 * Tutte le grandezze sono definite su base dicembre, coerentemente con il
 * fatto che la produzione innesca la previsione con l'ultimo tendenziale
 * disponibile.
 */
export function backtestCategory(
  series: IndexSeries,
  headline: IndexSeries,
  opts: BacktestOptions = DEFAULT_BACKTEST,
): CategoryBacktest {
  const years = [
    ...new Set(series.obs.map((o) => Number(o.t.slice(0, 4)))),
  ].sort((a, b) => a - b);
  const firstYear = years[0];
  const lastYear = years[years.length - 1];

  const acc = new Map<
    number,
    {
      model: number[];
      rw: number[];
      anchor: number[];
      inBandRate: number[];
      inBandLevel: number[];
      levelErr: number[];
    }
  >();
  for (let h = 1; h <= opts.maxHorizon; h++) {
    acc.set(h, {
      model: [],
      rw: [],
      anchor: [],
      inBandRate: [],
      inBandLevel: [],
      levelErr: [],
    });
  }

  if (firstYear === undefined || lastYear === undefined) {
    return emptyResult(series);
  }

  const z = normInv(0.5 + opts.confidence / 2);

  for (
    let origin = firstYear + opts.minTrainYears;
    origin <= lastYear;
    origin++
  ) {
    const trainCat = truncate(series, origin);
    const trainHead = truncate(headline, origin);

    // Stessa definizione della produzione: ultimo tendenziale disponibile.
    const lastObserved = latestYoY(trainCat.obs);
    const baseLevel = december(trainCat.obs, origin);
    if (lastObserved === null || baseLevel === undefined) continue;

    const model = {
      ...estimateCategoryModel(trainCat, trainHead),
      lastRate: lastObserved,
    };
    if (model.nObs < opts.minTrainYears - 2) continue;

    // Livello cumulato previsto, costruito esattamente come in produzione.
    let predictedLevel = 1;

    for (let h = 1; h <= opts.maxHorizon; h++) {
      const rate = forecastRate(model, opts.anchor, h).total;
      predictedLevel *= 1 + rate;

      const targetYear = origin + h;
      const realizedRate = decemberYoY(series.obs, targetYear);
      const targetLevel = december(series.obs, targetYear);
      if (realizedRate === undefined || targetLevel === undefined) continue;

      const bucket = acc.get(h)!;

      // --- errore sul tasso annuo ---
      bucket.model.push(rate - realizedRate);
      bucket.rw.push(lastObserved - realizedRate);
      bucket.anchor.push(opts.anchor - realizedRate);

      // Banda sul tasso: varianza h-passi di un AR(1) stazionario.
      const phi = model.phi;
      const rateSd =
        Math.abs(1 - phi * phi) < 1e-9
          ? model.sigma * Math.sqrt(h)
          : model.sigma *
            Math.sqrt((1 - Math.pow(phi, 2 * h)) / (1 - phi * phi));
      bucket.inBandRate.push(
        Math.abs(rate - realizedRate) <= rateSd * z ? 1 : 0,
      );

      // --- errore sul livello cumulato (la grandezza disegnata) ---
      const realizedLevel = targetLevel / baseLevel;
      const band = uncertaintyBand(model, h, opts.confidence);
      const lo = predictedLevel * band.lo;
      const hi = predictedLevel * band.hi;
      bucket.inBandLevel.push(
        realizedLevel >= lo && realizedLevel <= hi ? 1 : 0,
      );
      bucket.levelErr.push(Math.abs(predictedLevel / realizedLevel - 1));
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
      coverageRate: avg(b.inBandRate),
      coverageLevel: avg(b.inBandLevel),
      maeLevel: avg(b.levelErr),
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
