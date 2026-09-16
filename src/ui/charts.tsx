/**
 * Pezzi condivisi dai grafici: asse del tempo, selettore del periodo e
 * suggerimenti.
 *
 * Recharts vuole i propri componenti come figli diretti del grafico, quindi
 * l'asse non può essere un componente a sé: qui si costruiscono le sue
 * proprietà, e ogni grafico le applica.
 */

import type { YearProjection } from '../core/types.js';
import { eur, eurSigned } from './format.js';
import { tickLabel, type Timeline } from './timeline.js';

/** Proprietà dell'asse orizzontale in mesi, con una tacca per ogni linea. */
export function timeAxisProps(tl: Timeline) {
  return {
    type: 'number' as const,
    dataKey: 'x',
    domain: [0, tl.totalMonths] as [number, number],
    ticks: tl.grid,
    interval: 0 as const,
    tickFormatter: (v: number) => tickLabel(tl, v),
    tickSize: 4,
    // Taglia al bordo del grafico la barra dell'ultimo periodo quando dura
    // meno di un anno.
    allowDataOverflow: true,
    stroke: 'var(--text-muted)',
    tick: { fontSize: 11 },
    allowDecimals: false,
  };
}

/** Griglia con una linea verticale per ogni mese o semestre. */
export function timeGridProps(tl: Timeline) {
  return {
    stroke: 'var(--border)',
    strokeDasharray: '2 4',
    verticalValues: tl.grid,
  };
}

export const moneyAxisProps = {
  stroke: 'var(--text-muted)',
  tick: { fontSize: 12 },
  tickLine: false,
  axisLine: false,
  width: 80,
  tickFormatter: (v: number) => eur(v),
};

// ---------------------------------------------------------------------------

/**
 * Selettore del periodo annuale da esaminare.
 *
 * È lo stesso stato per la previsione e per il confronto: scelto un anno,
 * resta scelto passando da una scheda all'altra.
 */
export function YearSlider({
  years,
  selected,
  onSelect,
  id,
}: {
  years: YearProjection[];
  selected: number;
  onSelect: (h: number) => void;
  id: string;
}): JSX.Element {
  const y = years[selected]!;
  const last = years.length - 1;
  return (
    <div className="year-slider">
      <label htmlFor={id}>
        <span className="muted small">
          {selected === 0 ? 'Primo anno' : `Anno ${selected + 1} di ${years.length}`}
        </span>{' '}
        <strong>{y.labelLong}</strong>
      </label>
      <div className="row" style={{ flexWrap: 'nowrap' }}>
        <button
          className="btn"
          type="button"
          aria-label="Anno precedente"
          disabled={selected === 0}
          onClick={() => onSelect(Math.max(0, selected - 1))}
        >
          ‹
        </button>
        <input
          id={id}
          type="range"
          min={0}
          max={last}
          step={1}
          value={selected}
          disabled={last === 0}
          onChange={(e) => onSelect(Number(e.target.value))}
        />
        <button
          className="btn"
          type="button"
          aria-label="Anno successivo"
          disabled={selected === last}
          onClick={() => onSelect(Math.min(last, selected + 1))}
        >
          ›
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

export interface TooltipRow {
  name: string;
  value: number;
  color?: string;
  dashed?: boolean;
}

/** Suggerimento generico: titolo, righe con importo, note in coda. */
export function TooltipBox({
  title,
  rows,
  notes,
}: {
  title: string;
  rows: TooltipRow[];
  notes?: { label: string; amount: number; income?: boolean }[];
}): JSX.Element {
  return (
    <div className="tooltip">
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{title}</div>
      {rows.map((r, i) => (
        <div className="t-row" key={i}>
          <span>
            <span
              className="swatch"
              style={{
                background: r.dashed ? 'transparent' : (r.color ?? 'var(--text-muted)'),
                border: r.dashed ? `2px dashed ${r.color}` : undefined,
              }}
            />
            {r.name}
          </span>
          <strong>{eur(r.value)}</strong>
        </div>
      ))}
      {notes && notes.length > 0 && (
        <div
          style={{
            borderTop: '1px solid var(--border)',
            marginTop: 5,
            paddingTop: 4,
          }}
        >
          {notes.map((n, i) => (
            <div className="t-row muted" key={i}>
              <span>{n.label}</span>
              <span>{eurSigned(n.income ? n.amount : -n.amount)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
