/** Formattatori condivisi, tutti in convenzione italiana. */

import { shortMonthLabel } from '../core/series.js';

const eur0 = new Intl.NumberFormat('it-IT', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

const eur2 = new Intl.NumberFormat('it-IT', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 2,
});

const num0 = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 0 });

export function eur(x: number): string {
  return eur0.format(Math.round(x));
}

export function eurPrecise(x: number): string {
  return eur2.format(x);
}

export function num(x: number): string {
  return num0.format(x);
}

/** Percentuale da frazione: 0.035 -> "3,5%". */
export function pct(x: number, digits = 1): string {
  return `${(x * 100).toLocaleString('it-IT', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}%`;
}

/** Percentuale con segno esplicito, per le variazioni. */
export function pctSigned(x: number, digits = 1): string {
  const s = pct(Math.abs(x), digits);
  if (x > 0) return `+${s}`;
  if (x < 0) return `−${s}`;
  return s;
}

/** Importo con segno esplicito. */
export function eurSigned(x: number): string {
  const s = eur(Math.abs(x));
  if (Math.round(x) > 0) return `+${s}`;
  if (Math.round(x) < 0) return `−${s}`;
  return s;
}

/** `2026-07` -> `luglio 2026`. */
export function monthName(t: string): string {
  const [y, m] = t.split('-');
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
}

/** Data ISO -> `15 settembre 2026`. */
export function isoDate(iso: string): string {
  return new Date(iso).toLocaleDateString('it-IT', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Risparmi e perdite come importi distinti e sempre positivi.
 *
 * Un saldo negativo non si mostra come «risparmi di −50 €»: diventa una
 * perdita di 50 €, e la voce dei risparmi sparisce. Sotto il mezzo euro il
 * saldo conta come pareggio, che si mostra come risparmio nullo.
 */
export function surplus(balance: number): number | null {
  return balance >= -0.5 ? Math.max(0, balance) : null;
}

export function deficit(balance: number): number | null {
  return balance < -0.5 ? -balance : null;
}

/** `2041-08` -> `ad ago 2041`: davanti a vocale la preposizione prende la «d». */
export function aMese(t: string): string {
  const label = shortMonthLabel(t);
  return (/^[aeiou]/.test(label) ? 'ad ' : 'a ') + label;
}

/** Durata in mesi -> `fra 15 anni`, `fra un anno e mezzo`, `fra 8 mesi`. */
export function fraTempo(months: number): string {
  if (months <= 0) return 'già questo mese';
  if (months < 12) return months === 1 ? 'fra un mese' : `fra ${months} mesi`;
  const y = Math.floor(months / 12);
  const r = months % 12;
  const anni = y === 1 ? 'un anno' : `${y} anni`;
  if (r === 0) return `fra ${anni}`;
  if (r === 6) return `fra ${anni} e mezzo`;
  return `fra ${anni} e ${r} ${r === 1 ? 'mese' : 'mesi'}`;
}

/** Come `fraTempo`, ma arrotondato ad anni oltre i due anni: è una stima. */
export function fraCirca(months: number): string {
  if (months < 24) return fraTempo(months);
  return `fra circa ${Math.round(months / 12)} anni`;
}
