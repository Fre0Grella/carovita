/**
 * Confronto fra profili.
 *
 * È il punto in cui l'applicazione risponde alla domanda che conta: fra due
 * modi di vivere, quale costa meno nell'arco dell'orizzonte, e di quanto?
 * Gli importi sono in euro correnti, con accanto il loro valore in euro di
 * oggi: l'inflazione gonfia allo stesso modo tutti gli scenari, e vederla
 * separata aiuta a leggere lo scarto reale.
 */

import { useMemo } from 'react';
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { summarize } from '../core/project.js';
import { shortMonthLabel } from '../core/series.js';
import type { ProjectionResult } from '../core/types.js';
import {
  TooltipBox,
  YearSlider,
  moneyAxisProps,
  timeAxisProps,
  timeGridProps,
} from './charts.js';
import {
  deficit,
  eur,
  eurSigned,
  pct,
  pctSigned,
  surplus,
} from './format.js';
import {
  buildTimeline,
  flowBuckets,
  periodAt,
  periodSpan,
} from './timeline.js';

interface Props {
  results: ProjectionResult[];
  colors: string[];
  selected: number;
  onSelect: (h: number) => void;
}

export function Compare({ results, colors, selected, onSelect }: Props): JSX.Element {
  const summaries = useMemo(() => results.map(summarize), [results]);
  const first = results[0];

  const tl = useMemo(
    () => (first ? buildTimeline(first.startMonth, first.months.length) : null),
    [first],
  );

  // Tutti i profili condividono mese di partenza e orizzonte, quindi anche
  // la stessa scansione del tempo: le righe si allineano per posizione.
  const spendData = useMemo(() => {
    if (!tl) return [];
    const perProfile = results.map((r) => flowBuckets(r, tl));
    return perProfile[0]!.map((b, bi) => {
      const row: Record<string, number | string> = { x: b.x, label: b.label };
      perProfile.forEach((buckets, ri) => {
        row[`p${ri}`] = buckets[bi]?.spend ?? 0;
      });
      return row;
    });
  }, [results, first, tl]);

  const wealthData = useMemo(() => {
    if (!tl) return [];
    const start: Record<string, number | string> = {
      x: 0,
      label: `Oggi, inizio ${shortMonthLabel(first!.startMonth)}`,
    };
    results.forEach((r, ri) => {
      start[`p${ri}`] = r.initialSavings;
    });
    const rows = [start];
    for (const fm of first!.months) {
      const row: Record<string, number | string> = {
        x: fm.index + 1,
        label: `Fine ${shortMonthLabel(fm.month)}`,
      };
      results.forEach((r, ri) => {
        const m = r.months[fm.index];
        if (m) row[`p${ri}`] = m.wealth;
      });
      rows.push(row);
    }
    return rows;
  }, [results, first, tl]);

  if (results.length < 2 || !first || !tl) {
    return (
      <div className="card">
        <h2>Confronto</h2>
        <p className="muted">
          Aggiungi almeno un secondo profilo con «Duplica per confrontare» per
          mettere a confronto due scenari.
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
  const span = periodSpan(first, selected);
  const names = summaries.map((s) => s.profileName);
  // Avanzo e disavanzo in colonne separate, ciascuna solo se almeno un
  // profilo ne ha uno nell'anno scelto.
  const balances = results.map((r) => r.years[selected]?.savingsNominal ?? 0);
  const anySurplus = balances.some((b) => surplus(b) !== null);
  const anyDeficit = balances.some((b) => deficit(b) !== null);
  const onClick = (state: { activeLabel?: string | number } | null) => {
    const x = Number(state?.activeLabel);
    if (Number.isFinite(x)) onSelect(periodAt(first, x));
  };

  return (
    <>
      <div className="card">
        <h2>Quale profilo conviene</h2>
        <p className="muted small" style={{ marginTop: -4 }}>
          Da {shortMonthLabel(first.startMonth)} a {shortMonthLabel(first.endMonth)}.
          Il riferimento è <strong>{ref.profileName}</strong>. Sotto ogni
          importo futuro, il suo valore in euro di oggi.
        </p>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Profilo</th>
                <th>Spesa nei prossimi 12 mesi</th>
                <th>Spesa negli ultimi 12 mesi</th>
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
                      <span className="swatch" style={{ background: colors[i] }} />
                      {s.profileName}
                      {s.profileId === best.profileId && (
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
                      {eur(s.finalSpend)}
                      <div className="muted small">{eur(s.finalSpendReal)} di oggi</div>
                    </td>
                    <td className="num">{pct(s.cagr)}</td>
                    <td className="num">{eur(s.cumulativeSpend)}</td>
                    <td className="num">{i === 0 ? '—' : eurSigned(diff)}</td>
                    <td className="num">
                      {eur(s.finalWealth)}
                      <div className="muted small">{eur(s.finalWealthReal)} di oggi</div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="hint">
          Scegliere <strong>{best.profileName}</strong> invece di{' '}
          <strong>{ref.profileName}</strong> cambia la spesa complessiva di{' '}
          <strong>{eurSigned(best.cumulativeSpend - ref.cumulativeSpend)}</strong>{' '}
          sull’intero orizzonte, pari a{' '}
          {pctSigned(
            ref.cumulativeSpend > 0
              ? best.cumulativeSpend / ref.cumulativeSpend - 1
              : 0,
          )}
          .
        </p>
      </div>

      <div className="card">
        <h2>Anno per anno</h2>
        <p className="muted small" style={{ marginTop: -4 }}>
          I profili nello stesso anno, fianco a fianco.
        </p>
        <YearSlider
          id="c-year"
          years={first.years}
          selected={selected}
          onSelect={onSelect}
        />
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table>
            <thead>
              <tr>
                <th>Profilo</th>
                <th>Reddito netto</th>
                <th>Spese</th>
                {anySurplus && <th>Avanzo</th>}
                {anyDeficit && (
                  <th style={{ color: 'var(--critical)' }}>Disavanzo</th>
                )}
                <th>Patrimonio a fine periodo</th>
                <th>Differenza di patrimonio</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r, i) => {
                const y = r.years[selected];
                if (!y) return null;
                const k = y.priceLevel;
                const refWealth = results[0]!.years[selected]!.cumulativeWealth;
                return (
                  <tr key={r.profileId}>
                    <td>
                      <span className="swatch" style={{ background: colors[i] }} />
                      {r.profileName}
                    </td>
                    {[
                      y.incomeNominal,
                      y.totalNominal,
                      ...(anySurplus ? [surplus(y.savingsNominal)] : []),
                      ...(anyDeficit ? [deficit(y.savingsNominal)] : []),
                      y.cumulativeWealth,
                    ].map((v, j) => (
                      <td className="num" key={j}>
                        {v === null ? (
                          '—'
                        ) : (
                          <>
                            {eur(v)}
                            <div className="muted small">{eur(v / k)} di oggi</div>
                          </>
                        )}
                      </td>
                    ))}
                    <td className="num">
                      {i === 0 ? '—' : eurSigned(y.cumulativeWealth - refWealth)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h2>Spesa a confronto</h2>
        <p className="muted small" style={{ marginTop: -4 }}>
          {tl.bucket === 1
            ? 'Uscite di ogni mese, in euro correnti.'
            : 'Uscite medie al mese di ciascun anno, in euro correnti.'}
        </p>
        <Legend names={names} colors={colors} />
        <div className="chart-box">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={spendData}
              margin={{ top: 8, right: 16, bottom: 4, left: 8 }}
              onClick={onClick}
            >
              <CartesianGrid {...timeGridProps(tl)} />
              <XAxis {...timeAxisProps(tl)} />
              <YAxis {...moneyAxisProps} />
              <Tooltip content={<CompareTooltip names={names} colors={colors} />} />
              <ReferenceArea
                x1={span.x1}
                x2={span.x2}
                fill="var(--series-1)"
                fillOpacity={0.07}
                stroke="none"
              />
              {tl.yearStarts.map((x) => (
                <ReferenceLine key={x} x={x} stroke="var(--border-strong)" />
              ))}
              {summaries.map((s, i) => (
                <Line
                  key={s.profileId}
                  dataKey={`p${i}`}
                  stroke={colors[i]}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card">
        <h2>Patrimonio accumulato</h2>
        <p className="muted small" style={{ marginTop: -4 }}>
          Risparmi cumulati, dato il reddito e il rendimento impostati. Sotto lo
          zero il profilo consuma più di quanto incassa.
        </p>
        <Legend names={names} colors={colors} />
        <div className="chart-box">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={wealthData}
              margin={{ top: 8, right: 16, bottom: 4, left: 8 }}
              onClick={onClick}
            >
              <CartesianGrid {...timeGridProps(tl)} />
              <XAxis {...timeAxisProps(tl)} />
              <YAxis {...moneyAxisProps} />
              <Tooltip content={<CompareTooltip names={names} colors={colors} />} />
              <ReferenceArea
                x1={span.x1}
                x2={span.x2}
                fill="var(--series-1)"
                fillOpacity={0.07}
                stroke="none"
              />
              {tl.yearStarts.map((x) => (
                <ReferenceLine key={x} x={x} stroke="var(--border-strong)" />
              ))}
              <ReferenceLine y={0} stroke="var(--critical)" strokeWidth={1.5} />
              {summaries.map((s, i) => (
                <Line
                  key={s.profileId}
                  dataKey={`p${i}`}
                  stroke={colors[i]}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </>
  );
}

function Legend({ names, colors }: { names: string[]; colors: string[] }): JSX.Element {
  return (
    <div className="legend">
      {names.map((n, i) => (
        <span key={i}>
          <span className="swatch" style={{ background: colors[i] }} />
          {n}
        </span>
      ))}
    </div>
  );
}

function CompareTooltip({
  active,
  payload,
  names,
  colors,
}: {
  active?: boolean;
  payload?: { payload: Record<string, number | string> }[];
  names: string[];
  colors: string[];
}): JSX.Element {
  const row = active ? payload?.[0]?.payload : undefined;
  if (!row) return <></>;
  return (
    <TooltipBox
      title={String(row.label)}
      rows={names.map((name, i) => ({
        name,
        value: Number(row[`p${i}`] ?? 0),
        color: colors[i],
      }))}
    />
  );
}
