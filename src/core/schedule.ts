/**
 * Calendario degli addebiti delle voci di spesa.
 *
 * Tutte le funzioni lavorano su indici di mese assoluti (`monthIndex`), così
 * cadenze e scadenze restano corrette anche a cavallo d'anno.
 */

import { monthIndex, monthLabel, shortMonthLabel } from './series.js';
import type { ExpenseItem, ExpenseSchedule } from './types.js';

/** Cadenza mensile: il caso normale. */
export const MONTHLY: ExpenseSchedule = {
  kind: 'recurring',
  everyMonths: 1,
  month: 1,
};

/** Cadenze ammesse per le spese ricorrenti: tutte dividono l'anno. */
export const RECURRING_STEPS = [1, 2, 3, 4, 6, 12] as const;

export const MONTH_NAMES = [
  'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre',
];

/** Mese di calendario (1-12) di un indice assoluto. */
export function calendarMonth(idx: number): number {
  return (((idx % 12) + 12) % 12) + 1;
}

/**
 * Cadenza normalizzata: un valore che non divide 12 renderebbe il calendario
 * diverso da un anno all'altro, quindi si ripiega sul divisore più vicino
 * per difetto.
 */
function normalisedStep(n: number): number {
  const step = Math.max(1, Math.round(n));
  if (12 % step === 0) return step;
  return [...RECURRING_STEPS].reverse().find((s) => s <= step) ?? 1;
}

/** Vero se la voce viene addebitata nel mese assoluto `idx`. */
export function chargesAt(schedule: ExpenseSchedule, idx: number): boolean {
  switch (schedule.kind) {
    case 'recurring': {
      const step = normalisedStep(schedule.everyMonths);
      const diff = calendarMonth(idx) - schedule.month;
      return ((diff % step) + step) % step === 0;
    }
    case 'installments': {
      const first = monthIndex(schedule.firstMonth);
      const step = Math.max(1, Math.round(schedule.everyMonths));
      const k = idx - first;
      return k >= 0 && k % step === 0 && k / step < schedule.count;
    }
    case 'once':
      return idx === monthIndex(schedule.month);
  }
}

/**
 * Una rata concordata resta fissa in euro: non ha senso rivalutarla con
 * l'inflazione né disegnarle intorno una banda di incertezza.
 */
export function isFixedNominal(schedule: ExpenseSchedule): boolean {
  return schedule.kind === 'installments';
}

/**
 * Costo medio mensile di una voce ricorrente, ai prezzi di oggi. Per rate e
 * spese una tantum non esiste un equivalente mensile stabile: restituisce 0.
 */
export function monthlyEquivalent(item: ExpenseItem): number {
  if (item.schedule.kind !== 'recurring') return 0;
  return item.amount / normalisedStep(item.schedule.everyMonths);
}

/** Ultimo mese di un pagamento a rate, `YYYY-MM`. */
export function lastInstallment(
  schedule: Extract<ExpenseSchedule, { kind: 'installments' }>,
): string {
  const step = Math.max(1, Math.round(schedule.everyMonths));
  const count = Math.max(1, Math.round(schedule.count));
  return monthLabel(monthIndex(schedule.firstMonth) + (count - 1) * step);
}

/** Mesi di calendario in cui avviene un addebito ricorrente, in ordine. */
export function recurringMonths(
  schedule: Extract<ExpenseSchedule, { kind: 'recurring' }>,
): number[] {
  const step = normalisedStep(schedule.everyMonths);
  const out: number[] = [];
  for (let m = 1; m <= 12; m++) {
    if (((m - schedule.month) % step + step) % step === 0) out.push(m);
  }
  return out;
}

/** Descrizione leggibile della cadenza, per suggerimenti e tabelle. */
export function describeSchedule(schedule: ExpenseSchedule): string {
  switch (schedule.kind) {
    case 'recurring': {
      const step = normalisedStep(schedule.everyMonths);
      if (step === 1) return 'ogni mese';
      if (step === 12) return `ogni anno ${preposition(MONTH_NAMES[schedule.month - 1]!)}`;
      const months = recurringMonths(schedule)
        .map((m) => MONTH_NAMES[m - 1]!.slice(0, 3))
        .join(', ');
      return `ogni ${step} mesi (${months})`;
    }
    case 'installments':
      return (
        `${schedule.count} rate da ${shortMonthLabel(schedule.firstMonth)} ` +
        preposition(shortMonthLabel(lastInstallment(schedule)))
      );
    case 'once':
      return `una volta, ${preposition(shortMonthLabel(schedule.month))}`;
  }
}

/** `agosto` -> `ad agosto`, `marzo` -> `a marzo`: la «d» eufonica. */
function preposition(month: string): string {
  return (/^[aeiou]/.test(month) ? 'ad ' : 'a ') + month;
}
