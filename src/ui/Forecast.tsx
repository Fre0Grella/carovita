/**
 * Vista della previsione per un singolo profilo.
 *
 * L'obiettivo non è mostrare una curva: è rendere verificabile *perché* la
 * curva ha quella forma. Ogni categoria può essere aperta e mostra da dove
 * viene l'aumento, scomposto nei quattro effetti del modello, e ogni evento
 * contrattuale è raccontato con i numeri già applicati.
 */

import { useMemo, useState } from 'react';
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { summarize } from '../core/project.js';
import { shortMonthLabel } from '../core/series.js';
import type { ProjectionResult } from '../core/types.js';
import { eur, eurSigned, pct, pctSigned } from './format.js';

const SERIES = [
  'var(--series-1)',
  'var(--series-2)',
  'var(--series-3)',
  'var(--series-4)',
  'var(--series-5)',
  'var(--series-6)',
  'var(--series-7)',
  'var(--series-8)',
];

interface Props {
  result: ProjectionResult;
  /** Mostra gli importi in euro costanti dell'anno base. */
  real: boolean;
}

export function Forecast({ result, real }: Props): JSX.Element {
  const [openCategory, setOpenCategory] = useState<string | null>(null);

  /**
   * Importo annuo nella scala scelta (nominale o in euro costanti).
   *
   * L'ultimo periodo puo' coprire solo sei mesi: i flussi vanno riportati
   * all'anno, altrimenti la spesa sembrerebbe dimezzarsi alla fine.
   */
  const amount = (y: (typeof result.years)[number]): number =>
    (real ? y.totalReal : y.totalNominal) / y.fraction;
  const first = result.years[0]!;
  const last = result.years[result.years.length - 1]!;

  const wealthData = useMemo(
    () =>
      result.years.map((y) => {
        const k = real ? y.priceLevel : 1;
        const lo = y.cumulativeWealthLo / k;
        const hi = y.cumulativeWealthHi / k;
        return {
          anno: y.label,
          patrimonio: y.cumulativeWealth / k,
          bandaBase: lo,
          bandaAlt: hi - lo,
        };
      }),
    [result, real],
  );

  const chartData = useMemo(
    () =>
      result.years.map((y) => ({
        anno: y.label,
        spesa: (real ? y.totalReal : y.totalNominal) / y.fraction,
        // L'area della banda si disegna come [base, altezza]: Recharts
        // impila il secondo valore sul primo.
        bandaBase: (real ? y.totalLo / y.priceLevel : y.totalLo) / y.fraction,
        bandaAlt:
          (real
            ? (y.totalHi - y.totalLo) / y.priceLevel
            : y.totalHi - y.totalLo) / y.fraction,
        reddito:
          (real ? y.incomeNominal / y.priceLevel : y.incomeNominal) /
          y.fraction,
      })),
    [result, real],
  );

  // Le categorie dell'ultimo anno, ordinate per peso: sono quelle che
  // spiegano il grosso della spesa.
  const ranked = useMemo(
    () => [...last.categories].sort((a, b) => b.nominal - a.nominal),
    [last],
  );

  const growth = amount(first) > 0 ? amount(last) / amount(first) - 1 : 0;
  const nYears = result.years.length - 1;

  const sum = summarize(result);

  return (
    <>
      <div className="card">
        <h2>Con quanti soldi resti</h2>
        <p className="muted small" style={{ marginTop: -4 }}>
          Patrimonio accumulato anno per anno: quello che hai oggi, più tutto
          ciò che avanza o che ti manca, con gli interessi.{' '}
          {real ? 'In euro di oggi.' : 'In euro correnti.'}
        </p>

        <Verdict result={result} real={real} />

        <div className="legend" style={{ marginTop: 10 }}>
          <span>
            <span className="swatch" style={{ background: 'var(--series-1)' }} />
            Patrimonio
          </span>
          <span>
            <span
              className="swatch"
              style={{
                background: 'var(--series-1)',
                opacity: 0.25,
              }}
            />
            Se la spesa va peggio o meglio del previsto
          </span>
        </div>

        <div className="chart-box">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
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
                width={80}
                tickFormatter={(v: number) => eur(v)}
              />
              <Tooltip content={<MoneyTooltip />} />
              {/* Lo zero è la soglia che conta: sotto, i risparmi sono finiti. */}
              <ReferenceLine
                y={0}
                stroke="var(--critical)"
                strokeWidth={1.5}
                label={{
                  value: 'risparmi esauriti',
                  position: 'insideBottomLeft',
                  fontSize: 11,
                  fill: 'var(--critical)',
                }}
              />
              <Area
                dataKey="bandaBase"
                stackId="banda"
                stroke="none"
                fill="none"
                isAnimationActive={false}
                legendType="none"
              />
              <Area
                dataKey="bandaAlt"
                stackId="banda"
                stroke="none"
                fill="var(--series-1)"
                fillOpacity={0.16}
                isAnimationActive={false}
                legendType="none"
                name="Ampiezza banda"
              />
              <Line
                dataKey="patrimonio"
                stroke="var(--series-1)"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
                name="Patrimonio"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <p className="hint">
          La fascia è larga perché il risparmio è la differenza fra due numeri
          grandi e vicini: uno scarto del 5% sulla spesa può cambiare di molto
          quanto avanza a fine anno.
          {sum.depletionYear === null && sum.depletionYearLo !== null && (
            <>
              {' '}
              Nello scenario di spesa alta i risparmi finirebbero nel{' '}
              <strong>{sum.depletionYearLo}</strong>.
            </>
          )}
        </p>
      </div>

      <div className="card">
        <h2>
          Spesa {real ? 'in euro di oggi' : 'in euro correnti'}, da{' '}
          {shortMonthLabel(result.startMonth)} a{' '}
          {shortMonthLabel(result.endMonth)}
        </h2>
        <p className="muted small" style={{ marginTop: -4 }}>
          Da <strong>{eur(amount(first))}</strong> a{' '}
          <strong>{eur(amount(last))}</strong> all’anno ({pctSigned(growth)} in{' '}
          {nYears} anni). La fascia è l’intervallo di confidenza al{' '}
          {pct(result.confidence, 0)}.
        </p>

        <div className="legend">
          <span>
            <span
              className="swatch"
              style={{ background: 'var(--series-1)' }}
            />
            Spesa prevista
          </span>
          <span>
            <span
              className="swatch"
              style={{ background: 'var(--series-3)' }}
            />
            Reddito netto
          </span>
        </div>

        <div className="chart-box">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
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
              <Tooltip content={<MoneyTooltip />} />
              {/* La banda: base trasparente + altezza colorata. */}
              <Area
                dataKey="bandaBase"
                stackId="banda"
                stroke="none"
                fill="none"
                isAnimationActive={false}
                legendType="none"
              />
              <Area
                dataKey="bandaAlt"
                stackId="banda"
                stroke="none"
                fill="var(--series-1)"
                fillOpacity={0.14}
                isAnimationActive={false}
                legendType="none"
                name="Intervallo di confidenza"
              />
              <Line
                dataKey="spesa"
                stroke="var(--series-1)"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
                name="Spesa prevista"
              />
              <Line
                dataKey="reddito"
                stroke="var(--series-3)"
                strokeWidth={2}
                strokeDasharray="5 4"
                dot={false}
                isAnimationActive={false}
                name="Reddito netto"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <p className="hint">
          È la spiegazione del grafico precedente: la distanza fra le due linee
          è quanto metti da parte ogni anno. Dove la spesa supera il reddito,
          il patrimonio comincia a scendere.
        </p>
      </div>

      {/* ---------------------------------------------------------------- */}
      <div className="card">
        <h2>Da dove viene l’aumento</h2>
        <p className="muted small" style={{ marginTop: -4 }}>
          Spesa per categoria nell’ultimo periodo previsto ({last.label}), a
          confronto con i prossimi dodici mesi. Apri una categoria per vedere la scomposizione.
        </p>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Categoria</th>
                <th>{first.year}</th>
                <th>{last.year}</th>
                <th>Variazione</th>
                <th>Inflazione applicata</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {ranked.map((c, i) => {
                const base = first.categories.find(
                  (x) => x.label === c.label,
                );
                const from = base ? base.nominal : 0;
                const to = c.nominal / last.fraction;
                const delta = from > 0 ? to / from - 1 : 0;
                const isOpen = openCategory === c.label;
                return (
                  <tr key={c.label}>
                    <td>
                      <span
                        className="swatch"
                        style={{ background: SERIES[i % SERIES.length] }}
                      />
                      {c.label}
                    </td>
                    <td className="num">{eur(from)}</td>
                    <td className="num">{eur(to)}</td>
                    <td className="num">{pctSigned(delta)}</td>
                    <td className="num">{pctSigned(c.rate)}/anno</td>
                    <td>
                      <button
                        className="btn"
                        type="button"
                        aria-expanded={isOpen}
                        onClick={() =>
                          setOpenCategory(isOpen ? null : c.label)
                        }
                      >
                        {isOpen ? 'Chiudi' : 'Spiega'}
                      </button>
                    </td>
                  </tr>
                );
              })}
              <tr>
                <td>
                  <strong>Totale</strong>
                </td>
                <td className="num">
                  <strong>{eur(first.totalNominal)}</strong>
                </td>
                <td className="num">
                  <strong>{eur(last.totalNominal / last.fraction)}</strong>
                </td>
                <td className="num">
                  <strong>
                    {pctSigned(
                      last.totalNominal / last.fraction / first.totalNominal - 1,
                    )}
                  </strong>
                </td>
                <td colSpan={2} />
              </tr>
            </tbody>
          </table>
        </div>

        {openCategory && (
          <Attribution
            result={result}
            label={openCategory}
            onClose={() => setOpenCategory(null)}
          />
        )}
      </div>

      {/* ---------------------------------------------------------------- */}
      <Events result={result} />
    </>
  );
}

// ---------------------------------------------------------------------------

/**
 * Risposta in una frase alla domanda «con quanti soldi resto».
 *
 * Un grafico da solo non risponde: bisogna leggerlo. Qui la conclusione
 * è scritta, con il numero e l'anno già dentro, e cambia tono a
 * seconda che il patrimonio cresca, si assottigli o finisca.
 */
function Verdict({
  result,
  real,
}: {
  result: ProjectionResult;
  real: boolean;
}): JSX.Element {
  const s = summarize(result);
  const last = result.years[result.years.length - 1]!;
  const finalWealth = real ? s.finalWealthReal : s.finalWealth;
  const scale = real ? ' in euro di oggi' : '';

  if (s.depletionYear !== null) {
    const anni = s.depletionYear - result.baseYear;
    return (
      <div className="notice" style={{ borderLeftColor: 'var(--critical)' }}>
        <strong>
          I risparmi si esauriscono nel {s.depletionYear}
        </strong>
        , fra {anni} {anni === 1 ? 'anno' : 'anni'}. Da lì in poi la spesa
        prevista supera quello che hai messo da parte: nel {last.year} saresti
        a {eur(finalWealth)}
        {scale}.
      </div>
    );
  }

  if (s.savingsFirstYear < 0) {
    return (
      <div className="notice">
        <strong>Stai spendendo più di quanto incassi</strong> —{' '}
        {eur(-s.savingsFirstYear)} l’anno. Il patrimonio regge fino al{' '}
        {last.year}, chiudendo a {eur(finalWealth)}
        {scale}, ma la direzione è in discesa.
      </div>
    );
  }

  return (
    <div className="notice info">
      <strong>Nel {last.year} avresti {eur(finalWealth)}</strong>
      {scale}, partendo da {eur(result.years[0]!.cumulativeWealth)} e mettendo
      da parte {eur(s.savingsFirstYear)} nel primo anno.
      {s.depletionYearLo !== null && (
        <>
          {' '}
          Se però la spesa andasse come nello scenario peggiore, i
          risparmi finirebbero nel <strong>{s.depletionYearLo}</strong>.
        </>
      )}
    </div>
  );
}

/** Scomposizione a cascata dell'aumento di una categoria. */
function Attribution({
  result,
  label,
  onClose,
}: {
  result: ProjectionResult;
  label: string;
  onClose: () => void;
}): JSX.Element {
  const last = result.years[result.years.length - 1]!;
  const c = last.categories.find((x) => x.label === label);
  if (!c) return <></>;
  const a = c.attribution;

  const parts = [
    {
      key: 'base',
      label: `Spesa di partenza (${result.baseYear})`,
      value: a.base,
      color: 'var(--text-muted)',
      why: 'Quanto spendi oggi per questa voce, su base annua.',
    },
    {
      key: 'anchor',
      label: 'Inflazione generale',
      value: a.fromAnchor,
      color: 'var(--series-1)',
      why:
        `L’effetto dell’inflazione di fondo (${pct(result.anchor)} all’anno), ` +
        'che riguarda tutte le categorie allo stesso modo.',
    },
    {
      key: 'spread',
      label: 'Differenziale di categoria',
      value: a.fromSpread,
      color: 'var(--series-2)',
      why:
        'Quanto questa categoria cresce storicamente più o meno della media. ' +
        'È stimato dai dati e ridotto se il dato storico è troppo rumoroso ' +
        'per essere considerato strutturale.',
    },
    {
      key: 'persistence',
      label: 'Rientro dalla situazione attuale',
      value: a.fromPersistence,
      color: 'var(--series-4)',
      why:
        'Si parte dall’inflazione osservata oggi, non dalla media: se la ' +
        'categoria è fuori linea, il modello la fa rientrare gradualmente ' +
        'verso il suo valore di lungo periodo.',
    },
    {
      key: 'override',
      label: 'La tua ipotesi di crescita',
      value: a.fromOverride,
      color: 'var(--series-7)',
      why:
        'Per questa voce hai sostituito la previsione del modello con un ' +
        'tasso tuo, quindi l’aumento discende interamente da quella scelta.',
    },
    {
      key: 'contract',
      label: 'Regole del contratto',
      value: a.fromContract,
      color: 'var(--series-5)',
      why:
        'Lo scarto fra il canone di mercato e quello che paghi davvero, per ' +
        'effetto di scatti ISTAT, cedolare secca e riallineamenti a fine ' +
        'contratto.',
    },
  ].filter((p) => p.key === 'base' || Math.abs(p.value) > 0.5);

  return (
    <div
      style={{
        marginTop: 16,
        borderTop: '1px solid var(--border)',
        paddingTop: 14,
      }}
    >
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0 }}>{label} — perché arriva a {eur(c.nominal)}</h3>
        <button className="btn" type="button" onClick={onClose}>
          Chiudi
        </button>
      </div>

      <div className="chart-box" style={{ height: 240, marginTop: 10 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={parts.map((p) => ({ nome: p.label, valore: p.value }))}
            layout="vertical"
            margin={{ top: 4, right: 70, bottom: 4, left: 8 }}
          >
            <CartesianGrid
              stroke="var(--border)"
              strokeDasharray="2 4"
              horizontal={false}
            />
            <XAxis
              type="number"
              stroke="var(--text-muted)"
              tick={{ fontSize: 12 }}
              tickFormatter={(v: number) => eur(v)}
            />
            <YAxis
              type="category"
              dataKey="nome"
              stroke="var(--text-muted)"
              tick={{ fontSize: 12 }}
              width={190}
              tickLine={false}
              axisLine={false}
            />
            <ReferenceLine x={0} stroke="var(--border-strong)" />
            <Tooltip content={<MoneyTooltip />} />
            <Bar
              dataKey="valore"
              radius={[0, 4, 4, 0]}
              isAnimationActive={false}
              name="Contributo"
              label={{
                position: 'right',
                fontSize: 12,
                fill: 'var(--text-secondary)',
                formatter: (v: number) => eurSigned(v),
              }}
            >
              {parts.map((p) => (
                <Cell key={p.key} fill={p.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <dl style={{ margin: 0 }}>
        {parts.map((p) => (
          <div key={p.key} style={{ marginBottom: 8 }}>
            <dt style={{ fontWeight: 600, fontSize: 13 }}>
              <span className="swatch" style={{ background: p.color }} />
              {p.label}: {p.key === 'base' ? eur(p.value) : eurSigned(p.value)}
            </dt>
            <dd
              className="muted small"
              style={{ margin: '2px 0 0 16px' }}
            >
              {p.why}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Events({ result }: { result: ProjectionResult }): JSX.Element {
  const years = result.years.filter((y) => y.events.length > 0);
  if (years.length === 0) return <></>;

  return (
    <div className="card">
      <h2>Cosa succede, anno per anno</h2>
      <p className="muted small" style={{ marginTop: -4 }}>
        Gli eventi che il modello applica al tuo contratto.
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Anno</th>
              <th style={{ textAlign: 'left' }}>Evento</th>
              <th>Effetto annuo</th>
            </tr>
          </thead>
          <tbody>
            {years.flatMap((y) =>
              y.events.map((e, i) => (
                <tr key={`${y.year}-${i}`}>
                  <td className="num">{y.year}</td>
                  <td style={{ textAlign: 'left', whiteSpace: 'normal' }}>
                    {e.message}
                  </td>
                  <td className="num">
                    {e.amount === undefined ? '—' : eurSigned(e.amount)}
                  </td>
                </tr>
              )),
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

interface TooltipProps {
  active?: boolean;
  label?: string | number;
  payload?: { name?: string; value?: number; color?: string }[];
}

function MoneyTooltip({ active, label, payload }: TooltipProps): JSX.Element {
  if (!active || !payload || payload.length === 0) return <></>;
  return (
    <div className="tooltip">
      {label !== undefined && (
        <div style={{ fontWeight: 600, marginBottom: 4 }}>{label}</div>
      )}
      {payload
        .filter((p) => p.name !== 'bandaBase')
        .map((p, i) => (
          <div className="t-row" key={i}>
            <span>
              <span
                className="swatch"
                style={{ background: p.color ?? 'var(--text-muted)' }}
              />
              {p.name === 'bandaAlt' ? 'Ampiezza banda' : p.name}
            </span>
            <strong>{eur(p.value ?? 0)}</strong>
          </div>
        ))}
    </div>
  );
}
