/** Formattatori condivisi, tutti in convenzione italiana. */

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
 * Avanzo e disavanzo come importi distinti e sempre positivi.
 *
 * Un saldo negativo non si mostra come «avanzo di −50 €»: diventa un
 * disavanzo di 50 €, e l'avanzo sparisce. Sotto il mezzo euro il saldo conta
 * come pareggio, che si mostra come avanzo nullo.
 */
export function surplus(balance: number): number | null {
  return balance >= -0.5 ? Math.max(0, balance) : null;
}

export function deficit(balance: number): number | null {
  return balance < -0.5 ? -balance : null;
}
