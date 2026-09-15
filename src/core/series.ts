/**
 * Utilità sulle serie storiche mensili di indici di prezzo.
 * Modulo puro e senza dipendenze.
 */

import type { IndexSeries, MonthlyObs } from './types.js';

/** Converte `YYYY-MM` nel numero di mesi dall'anno 0. Utile per ordinare. */
export function monthIndex(t: string): number {
  const [y, m] = t.split('-');
  return Number(y) * 12 + (Number(m) - 1);
}

/** Inverso di `monthIndex`. */
export function monthLabel(idx: number): string {
  const y = Math.floor(idx / 12);
  const m = (idx % 12) + 1;
  return `${y}-${String(m).padStart(2, '0')}`;
}

export function yearOf(t: string): number {
  return Number(t.slice(0, 4));
}

/** Ordina le osservazioni per periodo crescente, rimuovendo i duplicati. */
export function normalizeObs(obs: MonthlyObs[]): MonthlyObs[] {
  const byT = new Map<string, number>();
  for (const o of obs) {
    if (Number.isFinite(o.v)) byT.set(o.t, o.v);
  }
  return [...byT.entries()]
    .map(([t, v]) => ({ t, v }))
    .sort((a, b) => monthIndex(a.t) - monthIndex(b.t));
}

/**
 * Variazione tendenziale annua (mese su stesso mese dell'anno precedente),
 * in frazione. Richiede che entrambi i mesi esistano nella serie.
 */
export function yoyRates(obs: MonthlyObs[]): MonthlyObs[] {
  const idx = new Map(obs.map((o) => [o.t, o.v]));
  const out: MonthlyObs[] = [];
  for (const o of obs) {
    const prevT = monthLabel(monthIndex(o.t) - 12);
    const prev = idx.get(prevT);
    if (prev !== undefined && prev > 0) {
      out.push({ t: o.t, v: o.v / prev - 1 });
    }
  }
  return out;
}

/**
 * Media annua dell'indice, per anno solare. Include solo gli anni con tutti
 * e 12 i mesi: un anno parziale produrrebbe una media distorta dalla
 * stagionalità e falserebbe la stima dei parametri.
 */
export function annualAverages(obs: MonthlyObs[]): Map<number, number> {
  const buckets = new Map<number, number[]>();
  for (const o of obs) {
    const y = yearOf(o.t);
    const arr = buckets.get(y);
    if (arr) arr.push(o.v);
    else buckets.set(y, [o.v]);
  }
  const out = new Map<number, number>();
  for (const [y, vals] of buckets) {
    if (vals.length === 12) {
      out.set(y, vals.reduce((a, b) => a + b, 0) / 12);
    }
  }
  return out;
}

/**
 * Inflazione media annua, in frazione, calcolata sulle medie annue
 * dell'indice. È la definizione usata da ISTAT per l'inflazione "media
 * annua", diversa dal tendenziale di dicembre.
 */
export function annualInflation(obs: MonthlyObs[]): Map<number, number> {
  const avg = annualAverages(obs);
  const out = new Map<number, number>();
  for (const [y, v] of avg) {
    const prev = avg.get(y - 1);
    if (prev !== undefined && prev > 0) out.set(y, v / prev - 1);
  }
  return out;
}

/**
 * Tendenziale annuo misurato sempre nello stesso mese dell'anno, per ogni
 * anno in cui è calcolabile.
 *
 * Il mese va fissato perché stima, innesco della previsione e validazione
 * devono lavorare tutti sulla stessa grandezza. La previsione parte
 * dall'ultimo tendenziale disponibile, che cade nel mese di aggiornamento
 * della serie: se i parametri fossero stimati su un mese diverso (o sulle
 * medie annue, più lisce) si validerebbe un modello che non è quello
 * spedito. Con categorie stagionali come l'energia lo scarto non è
 * accademico: fra agosto e il dicembre precedente può superare i 15 punti.
 *
 * `month` è 1-12.
 */
export function sameMonthInflation(
  obs: MonthlyObs[],
  month: number,
): Map<number, number> {
  const suffix = `-${String(month).padStart(2, '0')}`;
  const out = new Map<number, number>();
  for (const r of yoyRates(obs)) {
    if (r.t.endsWith(suffix)) out.set(yearOf(r.t), r.v);
  }
  return out;
}

/** Mese (1-12) dell'ultima osservazione: è il mese di riferimento del modello. */
export function referenceMonth(obs: MonthlyObs[]): number {
  const last = obs[obs.length - 1];
  return last ? Number(last.t.slice(5, 7)) : 12;
}

/** Scorciatoia storica: tendenziale di dicembre. */
export function decemberInflation(obs: MonthlyObs[]): Map<number, number> {
  return sameMonthInflation(obs, 12);
}

/** Ultimo tendenziale annuo disponibile, in frazione. */
export function latestYoY(obs: MonthlyObs[]): number | null {
  const rates = yoyRates(obs);
  const last = rates[rates.length - 1];
  return last ? last.v : null;
}

/** Ultimo periodo disponibile nella serie. */
export function latestMonth(series: IndexSeries): string | null {
  const last = series.obs[series.obs.length - 1];
  return last ? last.t : null;
}

/**
 * Valore dell'indice in un dato mese. Se il mese non esiste, usa
 * l'osservazione precedente più vicina (l'indice è una scala di livello,
 * quindi il carry-forward è l'approssimazione corretta).
 */
export function valueAt(obs: MonthlyObs[], t: string): number | null {
  const target = monthIndex(t);
  let best: number | null = null;
  for (const o of obs) {
    if (monthIndex(o.t) <= target) best = o.v;
    else break;
  }
  return best;
}

/** Media aritmetica. */
export function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** Deviazione standard campionaria. */
export function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const ss = xs.reduce((a, b) => a + (b - m) * (b - m), 0);
  return Math.sqrt(ss / (xs.length - 1));
}

/**
 * Regressione OLS senza intercetta di `y` su `x`: stima β in y = βx + ε.
 * Usata per la persistenza AR(1) sul gap (già centrato sull'ancora).
 */
export function olsSlopeNoIntercept(x: number[], y: number[]): number {
  let num = 0;
  let den = 0;
  const n = Math.min(x.length, y.length);
  for (let i = 0; i < n; i++) {
    const xi = x[i]!;
    const yi = y[i]!;
    num += xi * yi;
    den += xi * xi;
  }
  return den === 0 ? 0 : num / den;
}

/** Vincola un valore all'intervallo [lo, hi]. */
export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * Quantile della normale standard (inversa della CDF).
 * Algoritmo di Acklam, errore relativo < 1.15e-9: più che sufficiente per
 * le bande di confidenza e senza dipendenze esterne.
 */
export function normInv(p: number): number {
  if (p <= 0 || p >= 1) throw new RangeError(`normInv: p fuori range (${p})`);
  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
    1.38357751867269e2, -3.066479806614716e1, 2.506628277459239,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
    6.680131188771972e1, -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838,
    -2.549732539343734, 4.374664141464968, 2.938163982698783,
  ];
  const d = [
    7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996,
    3.754408661907416,
  ];
  const pLow = 0.02425;
  const pHigh = 1 - pLow;
  let q: number;
  let r: number;
  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) /
      ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1)
    );
  }
  if (p > pHigh) {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return (
      -(((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) /
      ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1)
    );
  }
  q = p - 0.5;
  r = q * q;
  return (
    ((((((a[0]! * r + a[1]!) * r + a[2]!) * r + a[3]!) * r + a[4]!) * r + a[5]!) *
      q) /
    (((((b[0]! * r + b[1]!) * r + b[2]!) * r + b[3]!) * r + b[4]!) * r + 1)
  );
}
