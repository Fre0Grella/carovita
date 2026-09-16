/**
 * Vista della previsione per un singolo profilo.
 *
 * L'obiettivo non è mostrare una curva: è rendere verificabile *perché* la
 * curva ha quella forma. Ogni voce può essere aperta e mostra da dove viene
 * l'aumento, scomposto negli effetti del modello, e ogni evento contrattuale
 * è raccontato con i numeri già applicati.
 *
 * Gli importi sono sempre quelli che vedrai davvero sul conto, in euro
 * correnti; accanto, dove serve, lo stesso importo in euro di oggi. Mostrarli
 * insieme rende visibile l'inflazione invece di nasconderla dietro un
 * interruttore che cambia tutti i numeri.
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
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { summarize } from '../core/project.js';
import { describeSchedule } from '../core/schedule.js';
import { monthIndex, shortMonthLabel } from '../core/series.js';
import type {
  CategoryYearProjection,
  ProjectionResult,
  YearProjection,
} from '../core/types.js';
import {
  TooltipBox,
  YearSlider,
  moneyAxisProps,
  timeAxisProps,
  timeGridProps,
} from './charts.js';
import { eur, eurPrecise, eurSigned, pct, pctSigned } from './format.js';
import {
  buildTimeline,
  flowBuckets,
  periodAt,
  periodSpan,
  type Timeline,
} from './timeline.js';

interface Props {
  result: ProjectionResult;
  /** Periodo annuale scelto con lo slider. */
  selected: number;
  onSelect: (h: number) => void;
}

export function Forecast({ result, selected, onSelect }: Props): JSX.Element {
  const tl = useMemo(
    () => buildTimeline(result.startMonth, result.months.length),
    [result],
  );

  return (
    <>
      <WealthCard result={result} tl={tl} selected={selected} onSelect={onSelect} />
      <YearExplorer result={result} selected={selected} onSelect={onSelect} />
      <CashFlowCard result={result} tl={tl} selected={selected} onSelect={onSelect} />
      <Events result={result} />
    </>
  );
}

// ---------------------------------------------------------------------------

interface ChartProps {
  result: ProjectionResult;
  tl: Timeline;
  selected: number;
  onSelect: (h: number) => void;
}

/** Clic sul grafico: seleziona il periodo annuale sotto il cursore. */
function pickPeriod(
  result: ProjectionResult,
  onSelect: (h: number) => void,
) {
  return (state: { activeLabel?: string | number } | null) => {
    const x = Number(state?.activeLabel);
    if (Number.isFinite(x)) onSelect(periodAt(result, x));
  };
}

function WealthCard({ result, tl, selected, onSelect }: ChartProps): JSX.Element {
  const sum = summarize(result);
  const span = periodSpan(result, selected);

  const data = useMemo(() => {
    const start = result.initialSavings;
    const rows = [
      {
        x: 0,
        label: `Oggi, inizio ${shortMonthLabel(result.startMonth)}`,
        patrimonio: start,
        oggi: start,
        lo: start,
        hi: start,
        bandaBase: start,
        bandaAlt: 0,
      },
    ];
    // Un punto per mese anche sugli orizzonti lunghi: una linea regge
    // centinaia di punti, e campionarla ogni sei mesi la farebbe oscillare
    // secondo il mese in cui cade la tredicesima.
    for (const m of result.months) {
      rows.push({
        x: m.index + 1,
        label: `Fine ${shortMonthLabel(m.month)}`,
        patrimonio: m.wealth,
        oggi: m.wealth / m.priceLevel,
        lo: m.wealthLo,
        hi: m.wealthHi,
        bandaBase: m.wealthLo,
        bandaAlt: m.wealthHi - m.wealthLo,
      });
    }
    return rows;
  }, [result]);

  const erosion = sum.finalWealth > 0 ? sum.finalWealthReal / sum.finalWealth - 1 : 0;

  return (
    <div className="card">
      <h2>Con quanti soldi resti</h2>
      <p className="muted small" style={{ marginTop: -4 }}>
        Il patrimonio mese per mese: quello che hai oggi, più tutto ciò che
        avanza o che ti manca, con gli interessi. Clicca sul grafico per
        esaminare un anno.
      </p>

      <Verdict result={result} />

      <div className="legend" style={{ marginTop: 10 }}>
        <span>
          <span className="swatch" style={{ background: 'var(--series-1)' }} />
          Patrimonio, in euro correnti
        </span>
        <span>
          <span
            className="swatch"
            style={{ background: 'transparent', border: '2px dashed var(--series-2)' }}
          />
          Lo stesso patrimonio in euro di oggi
        </span>
        <span>
          <span className="swatch" style={{ background: 'var(--series-1)', opacity: 0.25 }} />
          Se la spesa va peggio o meglio del previsto
        </span>
      </div>

      <div className="chart-box">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ top: 8, right: 16, bottom: 4, left: 8 }}
            onClick={pickPeriod(result, onSelect)}
          >
            <CartesianGrid {...timeGridProps(tl)} />
            <XAxis {...timeAxisProps(tl)} />
            <YAxis {...moneyAxisProps} />
            <Tooltip content={<WealthTooltip />} />
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
            />
            <Line
              dataKey="patrimonio"
              stroke="var(--series-1)"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              dataKey="oggi"
              stroke="var(--series-2)"
              strokeWidth={2}
              strokeDasharray="6 4"
              dot={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <p className="hint">
        La distanza fra le due linee è quanto si mangia l’inflazione
        {sum.finalWealth > 0 ? (
          <>
            : a {shortMonthLabel(result.endMonth)} i tuoi {eur(sum.finalWealth)}{' '}
            compreranno quanto {eur(sum.finalWealthReal)} oggi ({pctSigned(erosion)})
          </>
        ) : (
          ' sui risparmi'
        )}
        . La fascia è larga
        perché il risparmio è la differenza fra due numeri grandi e vicini: uno
        scarto del 5% sulla spesa cambia di molto quanto avanza.
      </p>
    </div>
  );
}

interface RowTooltipProps<T> {
  active?: boolean;
  payload?: { payload: T }[];
}

function WealthTooltip({
  active,
  payload,
}: RowTooltipProps<{
  label: string;
  patrimonio: number;
  oggi: number;
  lo: number;
  hi: number;
}>): JSX.Element {
  const row = active ? payload?.[0]?.payload : undefined;
  if (!row) return <></>;
  return (
    <TooltipBox
      title={row.label}
      rows={[
        { name: 'Patrimonio', value: row.patrimonio, color: 'var(--series-1)' },
        { name: 'In euro di oggi', value: row.oggi, color: 'var(--series-2)', dashed: true },
        { name: 'Se la spesa va peggio', value: row.lo },
        { name: 'Se la spesa va meglio', value: row.hi },
      ]}
    />
  );
}

// ---------------------------------------------------------------------------

/**
 * Risposta in una frase alla domanda «con quanti soldi resto».
 *
 * Un grafico da solo non risponde: bisogna leggerlo. Qui la conclusione è
 * scritta, con il numero e la data già dentro, e cambia tono a seconda che
 * il patrimonio cresca, vada in rosso per qualche mese o finisca.
 */
function Verdict({ result }: { result: ProjectionResult }): JSX.Element {
  const s = summarize(result);
  const end = shortMonthLabel(result.endMonth);
  const months = result.months;
  const lastWealth = months[months.length - 1]?.wealth ?? 0;
  const inRed = months.filter((m) => m.wealth < 0).length;
  const fra = (t: string): string => {
    const n = monthIndex(t) - monthIndex(result.startMonth);
    if (n < 24) return `fra ${n} ${n === 1 ? 'mese' : 'mesi'}`;
    return `fra circa ${Math.round(n / 12)} anni`;
  };
  const inToday = (
    <>
      {' '}
      (pari a {eur(s.finalWealthReal)} di oggi)
    </>
  );

  if (s.depletionMonth !== null && lastWealth < 0) {
    return (
      <div className="notice" style={{ borderLeftColor: 'var(--critical)' }}>
        <strong>
          I risparmi finiscono a {shortMonthLabel(s.depletionMonth)}
        </strong>
        , {fra(s.depletionMonth)}. Da lì in poi la spesa supera quello che hai
        messo da parte: a {end} saresti a {eur(s.finalWealth)}.
      </div>
    );
  }

  if (s.depletionMonth !== null) {
    return (
      <div className="notice">
        <strong>
          A {shortMonthLabel(s.depletionMonth)} il conto va sotto zero
        </strong>{' '}
        e ci resta per {inRed} {inRed === 1 ? 'mese' : 'mesi'} in tutto, prima
        di recuperare: è il momento in cui una spesa concentrata arriva prima
        delle entrate. A {end} avresti {eur(s.finalWealth)}
        {inToday}.
      </div>
    );
  }

  if (s.savingsFirstYear < 0) {
    return (
      <div className="notice">
        <strong>Stai spendendo più di quanto incassi</strong> —{' '}
        {eur(-s.savingsFirstYear)} nei prossimi dodici mesi. Il patrimonio regge
        fino a {end}, chiudendo a {eur(s.finalWealth)}
        {inToday}, ma la direzione è in discesa.
      </div>
    );
  }

  return (
    <div className="notice info">
      <strong>
        A {end} avresti {eur(s.finalWealth)}
      </strong>
      {inToday}, partendo da {eur(result.initialSavings)} e mettendo da parte{' '}
      {eur(s.savingsFirstYear)} nei prossimi dodici mesi.
      {s.depletionMonthLo !== null && (
        <>
          {' '}
          Se però la spesa andasse come nello scenario peggiore, il conto
          andrebbe sotto zero a{' '}
          <strong>{shortMonthLabel(s.depletionMonthLo)}</strong>.
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

/**
 * Un anno alla volta, confrontato con il primo.
 *
 * Qui l'inflazione diventa concreta: lo stesso reddito, la stessa spesa, lo
 * stesso carrello, con il prezzo di oggi e quello dell'anno scelto uno
 * accanto all'altro.
 */
function YearExplorer({
  result,
  selected,
  onSelect,
}: {
  result: ProjectionResult;
  selected: number;
  onSelect: (h: number) => void;
}): JSX.Element {
  const [open, setOpen] = useState<string | null>(null);
  const y0 = result.years[0]!;
  const y = result.years[selected]!;
  const k = y.priceLevel;
  const months = (p: YearProjection) => Math.round(p.fraction * 12);

  /** Variazione del potere d'acquisto medio mensile rispetto al primo anno. */
  const realChange = (first: number, now: number, stock: boolean): string => {
    const a = stock ? first : first / months(y0);
    const b = stock ? now / k : now / k / months(y);
    if (a <= 0 || b < 0) return '—';
    return pctSigned(b / a - 1);
  };

  const rows = [
    { label: 'Reddito netto', first: y0.incomeNominal, now: y.incomeNominal, stock: false },
    { label: 'Spese', first: y0.totalNominal, now: y.totalNominal, stock: false },
    { label: 'Avanzo', first: y0.savingsNominal, now: y.savingsNominal, stock: false },
    {
      label: 'Patrimonio a fine periodo',
      first: y0.cumulativeWealth,
      now: y.cumulativeWealth,
      stock: true,
    },
  ];

  const payFirst = y0.incomeNominal / months(y0);
  const payNow = y.incomeNominal / months(y);
  const payGrowth = payFirst > 0 ? payNow / payFirst - 1 : 0;

  const items = [...y.categories].sort((a, b) => {
    const fa = y0.categories.find((c) => key(c) === key(a))?.nominal ?? 0;
    const fb = y0.categories.find((c) => key(c) === key(b))?.nominal ?? 0;
    return fb - fa;
  });
  const openItem = items.find((c) => key(c) === open);

  return (
    <div className="card">
      <h2>Anno per anno</h2>
      <p className="muted small" style={{ marginTop: -4 }}>
        Scegli un anno e confrontalo con i prossimi dodici mesi: gli importi in
        euro correnti sono quelli che vedrai sul conto, quelli in euro di oggi
        dicono quanto valgono davvero.
      </p>

      <YearSlider
        id="f-year"
        years={result.years}
        selected={selected}
        onSelect={(h) => {
          onSelect(h);
          setOpen(null);
        }}
      />

      <div className="table-wrap" style={{ marginTop: 12 }}>
        <table>
          <thead>
            <tr>
              <th />
              <th>
                Primo anno
                <div className="muted small">{y0.labelLong}</div>
              </th>
              <th>
                Anno scelto
                <div className="muted small">{y.labelLong}</div>
              </th>
              <th>
                In euro di oggi
                <div className="muted small">potere d’acquisto</div>
              </th>
              <th>
                Rispetto al primo anno
                <div className="muted small">al netto dell’inflazione</div>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <td>{r.label}</td>
                <td className="num">{eur(r.first)}</td>
                <td className="num">
                  <strong>{eur(r.now)}</strong>
                </td>
                <td className="num">{eur(r.now / k)}</td>
                <td className="num">
                  {selected === 0 ? '—' : realChange(r.first, r.now, r.stock)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {y.fraction < 1 && (
        <p className="hint">
          L’ultimo periodo dura {months(y)} mesi: reddito, spese e avanzo
          coprono solo quei mesi. Il confronto nell’ultima colonna usa la media
          mensile.
        </p>
      )}

      {selected > 0 ? (
        <div className="notice info" style={{ marginTop: 12 }}>
          In questo periodo i prezzi sono in media <strong>{pctSigned(k - 1)}</strong>{' '}
          rispetto a oggi: quello che oggi costa <strong>100 €</strong> costerà{' '}
          <strong>{eurPrecise(100 * k)}</strong>, e 100 € di allora comprano
          quanto {eurPrecise(100 / k)} di oggi. Il tuo reddito mensile medio
          passa da {eur(payFirst)} a {eur(payNow)} ({pctSigned(payGrowth)}):{' '}
          {payGrowth >= k - 1 - 0.0005
            ? 'tiene il passo con i prezzi.'
            : 'cresce meno dei prezzi, quindi con lo stesso stipendio compri meno cose.'}
        </div>
      ) : (
        <p className="hint">
          Sposta lo slider per vedere un anno futuro accanto al primo.
        </p>
      )}

      <h3 style={{ marginTop: 18 }}>Quanto costano le stesse cose</h3>
      <p className="muted small" style={{ marginTop: -4 }}>
        Il prezzo di ogni singolo addebito oggi e nell’anno scelto. Apri una
        voce per vedere da dove viene l’aumento.
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Voce</th>
              <th style={{ textAlign: 'left' }}>Quando</th>
              <th>Oggi</th>
              <th>{y.label}</th>
              <th>Variazione</th>
              <th>
                Totale nell’anno
                <div className="muted small">{y.labelLong}</div>
              </th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((c) => {
              const unit = unitPrices(c, y0, y);
              const isOpen = open === key(c);
              return (
                <tr key={key(c)}>
                  <td>{c.itemId === null ? 'Affitto e casa' : c.label}</td>
                  <td style={{ textAlign: 'left' }} className="muted small">
                    {c.schedule === null ? unit.note : describeSchedule(c.schedule)}
                    {c.schedule?.kind === 'installments' && ' · rata fissa'}
                  </td>
                  <td className="num">{eur(unit.base)}</td>
                  <td className="num">
                    <strong>{eur(unit.now)}</strong>
                  </td>
                  <td className="num">
                    {unit.base > 0 ? pctSigned(unit.now / unit.base - 1) : '—'}
                  </td>
                  <td className="num">{eur(c.nominal)}</td>
                  <td>
                    <button
                      className="btn"
                      type="button"
                      aria-expanded={isOpen}
                      disabled={c.nominal <= 0}
                      title={
                        c.nominal <= 0 ? 'Nessun addebito in questo periodo' : undefined
                      }
                      onClick={() => setOpen(isOpen ? null : key(c))}
                    >
                      {isOpen ? 'Chiudi' : 'Spiega'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {openItem && (
        <Attribution
          result={result}
          year={y}
          c={openItem}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}

function key(c: CategoryYearProjection): string {
  return c.itemId ?? `casa-${c.category}`;
}

/**
 * Prezzo unitario di una voce oggi e nell'anno scelto.
 *
 * Per l'affitto è il canone mensile a tuo carico. Per la casa di proprietà,
 * dove resta solo il condominio, si usa la media mensile del periodo.
 */
function unitPrices(
  c: CategoryYearProjection,
  y0: YearProjection,
  y: YearProjection,
): { base: number; now: number; note: string } {
  if (c.itemId !== null || c.unitBase > 0) {
    return {
      base: c.unitBase,
      now: c.unitAmount,
      note: 'canone mensile a tuo carico',
    };
  }
  const first = y0.categories.find((x) => key(x) === key(c));
  return {
    base: first ? first.nominal / Math.round(y0.fraction * 12) : 0,
    now: c.nominal / Math.round(y.fraction * 12),
    note: 'media al mese',
  };
}

/** Scomposizione a cascata dell'aumento di una voce nel periodo scelto. */
function Attribution({
  result,
  year,
  c,
  onClose,
}: {
  result: ProjectionResult;
  year: YearProjection;
  c: CategoryYearProjection;
  onClose: () => void;
}): JSX.Element {
  const a = c.attribution;

  const parts = [
    {
      key: 'base',
      label: 'Gli stessi addebiti ai prezzi di oggi',
      value: a.base,
      color: 'var(--text-muted)',
      why: 'Quanto costerebbero gli addebiti di quel periodo se i prezzi restassero quelli di oggi.',
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
        <h3 style={{ margin: 0 }}>
          {c.label}, {year.labelLong}: perché arriva a {eur(c.nominal)}
        </h3>
        <button className="btn" type="button" onClick={onClose}>
          Chiudi
        </button>
      </div>

      {c.schedule?.kind === 'installments' ? (
        <p className="muted small">
          Le rate sono un importo fisso concordato: non seguono l’inflazione,
          quindi non c’è nessun aumento da spiegare.
        </p>
      ) : (
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
              <Bar
                dataKey="valore"
                radius={[0, 4, 4, 0]}
                isAnimationActive={false}
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
      )}

      <dl style={{ margin: 0 }}>
        {parts.map((p) => (
          <div key={p.key} style={{ marginBottom: 8 }}>
            <dt style={{ fontWeight: 600, fontSize: 13 }}>
              <span className="swatch" style={{ background: p.color }} />
              {p.label}: {p.key === 'base' ? eur(p.value) : eurSigned(p.value)}
            </dt>
            <dd className="muted small" style={{ margin: '2px 0 0 16px' }}>
              {p.why}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

// ---------------------------------------------------------------------------

function CashFlowCard({ result, tl, selected, onSelect }: ChartProps): JSX.Element {
  const sum = summarize(result);
  const span = periodSpan(result, selected);
  const monthly = tl.bucket === 1;

  const data = useMemo(
    () =>
      flowBuckets(result, tl).map((b) => ({
        x: b.x,
        label: b.label,
        spesa: b.spend,
        reddito: b.income,
        charges: b.charges,
      })),
    [result, tl],
  );

  return (
    <div className="card">
      <h2>{monthly ? 'Entrate e uscite, mese per mese' : 'Entrate e uscite, anno per anno'}</h2>
      <p className="muted small" style={{ marginTop: -4 }}>
        {monthly
          ? 'Ogni barra è quanto esce in quel mese. '
          : 'Media al mese di ciascun anno, con una linea ogni sei mesi: su tanti anni i singoli mesi non si leggerebbero. '}
        Nei prossimi dodici mesi spendi <strong>{eur(sum.baseSpend)}</strong>,
        negli ultimi dodici <strong>{eur(sum.finalSpend)}</strong>
        {sum.cagr !== 0 && <> ({pctSigned(sum.cagr)} all’anno)</>}.
      </p>

      <div className="legend">
        <span>
          <span className="swatch" style={{ background: 'var(--series-1)' }} />
          Uscite
        </span>
        <span>
          <span className="swatch" style={{ background: 'var(--series-3)' }} />
          Entrate nette
        </span>
      </div>

      <div className="chart-box">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ top: 8, right: 16, bottom: 4, left: 8 }}
            barCategoryGap={monthly ? '18%' : '10%'}
            onClick={pickPeriod(result, onSelect)}
          >
            <CartesianGrid {...timeGridProps(tl)} />
            <XAxis {...timeAxisProps(tl)} />
            <YAxis {...moneyAxisProps} />
            <Tooltip
              content={<FlowTooltip monthly={monthly} />}
              cursor={{ fill: 'var(--surface-2)' }}
            />
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
            <Bar
              dataKey="spesa"
              fill="var(--series-1)"
              isAnimationActive={false}
            />
            <Line
              dataKey="reddito"
              stroke="var(--series-3)"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <p className="hint">
        {monthly
          ? 'I picchi di uscite sono le spese non mensili (premi annuali, rate, imposte del contratto); quelli di entrate la tredicesima e la quattordicesima. Le uscite salgono a gradini perché i prezzi vengono aggiornati ogni dodici mesi.'
          : 'Dove le barre superano la linea delle entrate, il patrimonio scende. Accorcia l’orizzonte a tre anni per vedere i singoli mesi.'}
      </p>
    </div>
  );
}

function FlowTooltip({
  active,
  payload,
  monthly,
}: RowTooltipProps<{
  label: string;
  spesa: number;
  reddito: number;
  charges: { label: string; amount: number }[];
}> & { monthly: boolean }): JSX.Element {
  const row = active ? payload?.[0]?.payload : undefined;
  if (!row) return <></>;
  const suffix = monthly ? '' : ', media al mese';
  return (
    <TooltipBox
      title={row.label}
      rows={[
        { name: `Uscite${suffix}`, value: row.spesa, color: 'var(--series-1)' },
        { name: `Entrate${suffix}`, value: row.reddito, color: 'var(--series-3)' },
        { name: 'Avanzo', value: row.reddito - row.spesa },
      ]}
      notes={row.charges}
    />
  );
}

// ---------------------------------------------------------------------------

function Events({ result }: { result: ProjectionResult }): JSX.Element {
  const years = result.years.filter((y) => y.events.length > 0);
  if (years.length === 0) return <></>;

  return (
    <div className="card">
      <h2>Cosa succede al contratto, anno per anno</h2>
      <p className="muted small" style={{ marginTop: -4 }}>
        Gli eventi che il modello applica al tuo contratto d’affitto.
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Periodo</th>
              <th style={{ textAlign: 'left' }}>Evento</th>
              <th>Effetto annuo</th>
            </tr>
          </thead>
          <tbody>
            {years.flatMap((y) =>
              y.events.map((e, i) => (
                <tr key={`${y.label}-${i}`}>
                  <td className="num">{y.labelLong}</td>
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
