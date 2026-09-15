/**
 * Confronto fra profili.
 *
 * È il punto in cui l'applicazione risponde alla domanda che conta: fra due
 * modi di vivere, quale costa meno nell'arco di quindici anni, e di quanto?
 * Le differenze si leggono meglio in euro costanti, perché l'inflazione
 * gonfia allo stesso modo tutti gli scenari e nasconde lo scarto reale.
 */

import { useMemo } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { summarize } from '../core/project.js';
import type { ProjectionResult } from '../core/types.js';
import { eur, eurSigned, pct, pctSigned } from './format.js';

interface Props {
  results: ProjectionResult[];
  colors: string[];
  real: boolean;
}

export function Compare({ results, colors, real }: Props): JSX.Element {
  const summaries = useMemo(() => results.map(summarize), [results]);

  const chartData = useMemo(() => {
    const years = results[0]?.years.map((y) => y.year) ?? [];
    return years.map((year, i) => {
      const row: Record<string, number> = { anno: year };
      results.forEach((r, ri) => {
        const y = r.years[i];
        if (y) row[`p${ri}`] = real ? y.totalReal : y.totalNominal;
      });
      return row;
    });
  }, [results, real]);

  const wealthData = useMemo(() => {
    const years = results[0]?.years.map((y) => y.year) ?? [];
    return years.map((year, i) => {
      const row: Record<string, number> = { anno: year };
      results.forEach((r, ri) => {
        const y = r.years[i];
        if (y) {
          row[`p${ri}`] = real
            ? y.cumulativeWealth / y.priceLevel
            : y.cumulativeWealth;
        }
      });
      return row;
    });
  }, [results, real]);

  if (results.length < 2) {
    return (
      <div className="card">
        <h2>Confronto</h2>
        <p className="muted">
          Aggiungi almeno un secondo profilo dalla scheda Configurazione per
          confrontare due scenari.
        </p>
      </div>
    );
  }

  // Il profilo di riferimento è il primo: tutte le differenze sono rispetto
  // a lui, così la tabella si legge come "quanto risparmio cambiando".
  const ref = summaries[0]!;
  const best = [...summaries].sort(
    (a, b) => a.cumulativeSpend - b.cumulativeSpend,
  )[0]!;

  return (
    <>
      <div className="card">
        <h2>Quale profilo conviene</h2>
        <p className="muted small" style={{ marginTop: -4 }}>
          Su {results[0]!.years.length - 1} anni, in{' '}
          {real ? 'euro di oggi' : 'euro correnti'}. Il riferimento è{' '}
          <strong>{ref.profileName}</strong>.
        </p>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Profilo</th>
                <th>Spesa oggi</th>
                <th>Spesa finale</th>
                <th>Crescita annua</th>
                <th>Spesa cumulata</th>
                <th>Differenza</th>
                <th>Patrimonio finale</th>
              </tr>
            </thead>
            <tbody>
              {summaries.map((s, i) => {
                const diff = s.cumulativeSpend - ref.cumulativeSpend;
                return (
                  <tr key={s.profileId}>
                    <td>
                      <span
                        className="swatch"
                        style={{ background: colors[i] }}
                      />
                      {s.profileName}
                      {s.profileId === best.profileId &&
                        summaries.length > 1 && (
                          <span
                            className="small"
                            style={{ color: 'var(--good)', marginLeft: 6 }}
                          >
                            più economico
                          </span>
                        )}
                    </td>
                    <td className="num">{eur(s.baseSpend)}</td>
                    <td className="num">
                      {eur(real ? s.finalSpendReal : s.finalSpend)}
                    </td>
                    <td className="num">{pct(s.cagr)}</td>
                    <td className="num">{eur(s.cumulativeSpend)}</td>
                    <td className="num">
                      {i === 0 ? '—' : eurSigned(diff)}
                    </td>
                    <td className="num">
                      {eur(real ? s.finalWealthReal : s.finalWealth)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {summaries.length > 1 && (
          <p className="hint">
            Scegliere <strong>{best.profileName}</strong> invece di{' '}
            <strong>{ref.profileName}</strong> cambia la spesa complessiva di{' '}
            <strong>
              {eurSigned(best.cumulativeSpend - ref.cumulativeSpend)}
            </strong>{' '}
            sull’intero orizzonte, pari a{' '}
            {pctSigned(
              ref.cumulativeSpend > 0
                ? best.cumulativeSpend / ref.cumulativeSpend - 1
                : 0,
            )}
            .
          </p>
        )}
      </div>

      <div className="card">
        <h2>Spesa annua a confronto</h2>
        <div className="legend">
          {summaries.map((s, i) => (
            <span key={s.profileId}>
              <span className="swatch" style={{ background: colors[i] }} />
              {s.profileName}
            </span>
          ))}
        </div>
        <div className="chart-box">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              margin={{ top: 8, right: 16, bottom: 4, left: 8 }}
            >
              <CartesianGrid
                stroke="var(--border)"
                strokeDasharray="2 4"
                vertical={false}
              />
              <XAxis
                dataKey="anno"
                stroke="var(--text-muted)"
                tick={{ fontSize: 12 }}
                tickLine={false}
              />
              <YAxis
                stroke="var(--text-muted)"
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                width={72}
                tickFormatter={(v: number) => eur(v)}
              />
              <Tooltip content={<CompareTooltip names={summaries.map((s) => s.profileName)} />} />
              {summaries.map((s, i) => (
                <Line
                  key={s.profileId}
                  dataKey={`p${i}`}
                  name={s.profileName}
                  stroke={colors[i]}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card">
        <h2>Patrimonio accumulato</h2>
        <p className="muted small" style={{ marginTop: -4 }}>
          Risparmi cumulati, dato il reddito e il rendimento impostati. Sotto lo
          zero il profilo consuma più di quanto incassa.
        </p>
        <div className="legend">
          {summaries.map((s, i) => (
            <span key={s.profileId}>
              <span className="swatch" style={{ background: colors[i] }} />
              {s.profileName}
            </span>
          ))}
        </div>
        <div className="chart-box">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={wealthData}
              margin={{ top: 8, right: 16, bottom: 4, left: 8 }}
            >
              <CartesianGrid
                stroke="var(--border)"
                strokeDasharray="2 4"
                vertical={false}
              />
              <XAxis
                dataKey="anno"
                stroke="var(--text-muted)"
                tick={{ fontSize: 12 }}
                tickLine={false}
              />
              <YAxis
                stroke="var(--text-muted)"
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                width={78}
                tickFormatter={(v: number) => eur(v)}
              />
              <Tooltip content={<CompareTooltip names={summaries.map((s) => s.profileName)} />} />
              {summaries.map((s, i) => (
                <Line
                  key={s.profileId}
                  dataKey={`p${i}`}
                  name={s.profileName}
                  stroke={colors[i]}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </>
  );
}

interface TooltipProps {
  active?: boolean;
  label?: string | number;
  payload?: { name?: string; value?: number; color?: string }[];
  names: string[];
}

function CompareTooltip({ active, label, payload }: TooltipProps): JSX.Element {
  if (!active || !payload || payload.length === 0) return <></>;
  return (
    <div className="tooltip">
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{label}</div>
      {payload.map((p, i) => (
        <div className="t-row" key={i}>
          <span>
            <span
              className="swatch"
              style={{ background: p.color ?? 'var(--text-muted)' }}
            />
            {p.name}
          </span>
          <strong>{eur(p.value ?? 0)}</strong>
        </div>
      ))}
    </div>
  );
}
