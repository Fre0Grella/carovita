/**
 * Asse del tempo condiviso dai grafici.
 *
 * I grafici lavorano in mesi trascorsi dall'inizio della proiezione. La
 * risoluzione si adatta all'orizzonte: fino a tre anni ogni barra è un mese e
 * c'è una linea per ogni mese; oltre, le linee cadono ogni semestre e le barre
 * mostrano la media mensile dell'anno. Trecentosessanta barre in un grafico
 * largo come uno schermo sarebbero illeggibili, e trecentosessanta linee un
 * tratteggio grigio.
 */

import { calendarMonth } from '../core/schedule.js';
import { monthIndex, monthLabel, shortMonthLabel } from '../core/series.js';
import type { MonthProjection, ProjectionResult } from '../core/types.js';

const MESI = [
  'gen', 'feb', 'mar', 'apr', 'mag', 'giu',
  'lug', 'ago', 'set', 'ott', 'nov', 'dic',
];

export interface Timeline {
  /** Indice assoluto del primo mese. */
  startIndex: number;
  totalMonths: number;
  /** Mesi raccolti in ogni barra o punto: 1 oppure 6. */
  bucket: number;
  /** Posizioni delle tacche e delle linee verticali, in mesi dall'inizio. */
  grid: number[];
  /** Posizioni con etichetta: un sottoinsieme di `grid`. */
  labelled: Set<number>;
  /** Inizi d'anno solare, marcati da una linea più visibile. */
  yearStarts: number[];
}

export function buildTimeline(startMonth: string, totalMonths: number): Timeline {
  const startIndex = monthIndex(startMonth);
  const bucket = totalMonths <= 36 ? 1 : 6;

  const grid: number[] = [];
  for (let x = 0; x <= totalMonths; x += bucket) grid.push(x);
  if (grid[grid.length - 1] !== totalMonths) grid.push(totalMonths);

  const labelled = new Set<number>();
  if (bucket === 1) {
    // Vista mensile: etichette sui trimestri o sui semestri di calendario,
    // che si leggono meglio di «ogni tre mesi da settembre».
    const every = totalMonths <= 18 ? 3 : 6;
    for (const x of grid) {
      if (x === totalMonths) continue;
      if ((calendarMonth(startIndex + x) - 1) % every === 0) labelled.add(x);
    }
  } else {
    const every =
      totalMonths <= 72 ? 12 : totalMonths <= 144 ? 24 : totalMonths <= 240 ? 48 : 60;
    for (const x of grid) if (x % every === 0) labelled.add(x);
  }

  const yearStarts = grid.filter(
    (x) => x > 0 && x < totalMonths && calendarMonth(startIndex + x) === 1,
  );

  return { startIndex, totalMonths, bucket, grid, labelled, yearStarts };
}

/** Etichetta di una tacca dell'asse; vuota per le tacche senza etichetta. */
export function tickLabel(tl: Timeline, x: number): string {
  if (!tl.labelled.has(x)) return '';
  const idx = tl.startIndex + x;
  if (tl.bucket === 6) return shortMonthLabel(monthLabel(idx));
  const m = calendarMonth(idx);
  // L'anno si scrive a gennaio e sulla prima etichetta, altrimenti basta il
  // mese: «ott 2026, gen 2027, apr, lug».
  const first = Math.min(...tl.labelled);
  return m === 1 || x === first
    ? `${MESI[m - 1]} ${Math.floor(idx / 12)}`
    : MESI[m - 1]!;
}

/** Periodo annuale che contiene la posizione `x` dell'asse. */
export function periodAt(result: ProjectionResult, x: number): number {
  const i = Math.min(
    result.months.length - 1,
    Math.max(0, Math.floor(x - 1e-9)),
  );
  return result.months[i]?.period ?? 0;
}

/** Estremi sull'asse del periodo annuale `h`. */
export function periodSpan(
  result: ProjectionResult,
  h: number,
): { x1: number; x2: number } {
  const ms = result.months.filter((m) => m.period === h);
  if (ms.length === 0) return { x1: 0, x2: 0 };
  return { x1: ms[0]!.index, x2: ms[ms.length - 1]!.index + 1 };
}

/**
 * Entrate e uscite medie al mese per ogni barra del grafico dei flussi.
 *
 * Nella vista mensile ogni barra è il suo mese. Nella vista lunga ogni barra
 * è un periodo annuale, con la sua media mensile, e le linee della griglia
 * restano ogni sei mesi. Una barra per semestre disegnerebbe un zig-zag,
 * perché la tredicesima cade in un semestre e non nell'altro, e non direbbe
 * nulla sulla tendenza, che è ciò che si guarda su tanti anni.
 *
 * La barra di un periodo è centrata come se il periodo durasse dodici mesi,
 * così tutte hanno la stessa larghezza; quella di un ultimo periodo più corto
 * viene tagliata al bordo del grafico e ne mostra la durata vera.
 */
export function flowBuckets(
  result: ProjectionResult,
  tl: Timeline,
): {
  x: number;
  label: string;
  spend: number;
  income: number;
  charges: MonthProjection['charges'];
}[] {
  const byPeriod = new Map<number, { spend: number; income: number; n: number }>();
  for (const m of result.months) {
    const acc = byPeriod.get(m.period) ?? { spend: 0, income: 0, n: 0 };
    acc.spend += m.spend;
    acc.income += m.income;
    acc.n += 1;
    byPeriod.set(m.period, acc);
  }

  if (tl.bucket === 1) {
    return result.months.map((m) => ({
      x: m.index + 0.5,
      label: shortMonthLabel(m.month),
      spend: m.spend,
      income: m.income,
      charges: m.charges,
    }));
  }

  return result.years.map((y, h) => {
    const first = result.months.find((m) => m.period === h)!;
    const p = byPeriod.get(h)!;
    if (p.n >= 12 || result.months.length < 12) {
      return {
        x: first.index + 6,
        label: y.labelLong,
        spend: p.spend / p.n,
        income: p.income / p.n,
        charges: [],
      };
    }
    // Un ultimo periodo di sei mesi può contenere la tredicesima o
    // saltarla, e la sua media farebbe un gradino che non esiste: si usano
    // gli ultimi dodici mesi, come per tutte le altre barre.
    const tail = result.months.slice(-12);
    return {
      x: first.index + 6,
      label: `${shortMonthLabel(tail[0]!.month)} - ${shortMonthLabel(tail[11]!.month)} (ultimi 12 mesi)`,
      spend: tail.reduce((a, m) => a + m.spend, 0) / 12,
      income: tail.reduce((a, m) => a + m.income, 0) / 12,
      charges: [],
    };
  });
}
