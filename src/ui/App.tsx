/**
 * Guscio dell'applicazione: stato dei profili, impostazioni dello scenario
 * e navigazione fra le schede.
 *
 * Tutto il calcolo avviene nel browser, sui dati statici già scaricati.
 * Nessuna configurazione lascia il dispositivo.
 */

import { useEffect, useMemo, useState } from 'react';

import {
  currentMonth,
  forecastRatesByCategory,
  project,
  summarize,
} from '../core/project.js';
import type {
  CategoryId,
  DataSnapshot,
  Profile,
  ProjectionResult,
} from '../core/types.js';
import { loadSnapshot } from '../data/load.js';
import { Compare } from './Compare.js';
import { ConfigPanel } from './ConfigPanel.js';
import { DataPanel } from './DataPanel.js';
import { Forecast } from './Forecast.js';
import {
  PROFILE_COLORS,
  clearState,
  loadState,
  makeDefaultProfile,
  saveState,
} from './defaults.js';
import { monthIndex, shortMonthLabel } from '../core/series.js';
import {
  aMese,
  deficit,
  eur,
  eurSigned,
  fraCirca,
  fraTempo,
  isoDate,
  pct,
  pctSigned,
} from './format.js';

type Tab = 'config' | 'previsione' | 'confronto' | 'dati';

const TABS: { id: Tab; label: string }[] = [
  { id: 'config', label: 'Configurazione' },
  { id: 'previsione', label: 'Previsione' },
  { id: 'confronto', label: 'Confronto' },
  { id: 'dati', label: 'Dati e modello' },
];

export function App(): JSX.Element {
  const [snapshot, setSnapshot] = useState<DataSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('config');

  const stored = useMemo(() => loadState(), []);
  const [profiles, setProfiles] = useState<Profile[]>(
    () => stored?.profiles ?? [makeDefaultProfile(0)],
  );
  const [activeId, setActiveId] = useState<string>(
    () => (stored?.profiles ?? [makeDefaultProfile(0)])[0]!.id,
  );
  const [horizon, setHorizon] = useState(
    Math.min(30, Math.max(1.5, stored?.horizon ?? 15)),
  );
  const [anchorOverride, setAnchorOverride] = useState<number | null>(
    stored?.anchorOverride ?? null,
  );
  const [confidence, setConfidence] = useState(stored?.confidence ?? 0.8);
  // Anno esaminato con lo slider, condiviso fra previsione e confronto. Si
  // conserva il valore scelto e lo si limita al momento dell'uso: accorciando
  // e riallungando l'orizzonte la scelta non va persa. Di partenza, l'ultimo.
  const [selectedYear, setSelectedYear] = useState(Number.MAX_SAFE_INTEGER);

  useEffect(() => {
    loadSnapshot()
      .then(setSnapshot)
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    saveState({ profiles, horizon, anchorOverride, confidence });
  }, [profiles, horizon, anchorOverride, confidence]);

  const active =
    profiles.find((p) => p.id === activeId) ?? profiles[0] ?? null;

  // I conti partono dal mese corrente, non da gennaio: a settembre imputare
  // una spesa annua intera all'anno in corso sarebbe sbagliato di nove mesi.
  const startMonth = useMemo(() => currentMonth(), []);

  const results: ProjectionResult[] = useMemo(() => {
    if (!snapshot) return [];
    return profiles.map((p) =>
      project(p, snapshot, {
        startMonth,
        horizon,
        anchorOverride,
        confidence,
      }),
    );
  }, [snapshot, profiles, startMonth, horizon, anchorOverride, confidence]);

  const activeResult = results.find((r) => r.profileId === activeId) ?? results[0];
  const selected = Math.min(
    selectedYear,
    Math.max(0, (activeResult?.years.length ?? 1) - 1),
  );

  // Previsione per categoria, mostrata accanto a ogni voce di spesa: cosi'
  // la stima del modello e' visibile gia' in configurazione.
  const forecastRates = useMemo(
    () =>
      activeResult
        ? forecastRatesByCategory(activeResult.models, activeResult.anchor, horizon)
        : new Map<CategoryId, number>(),
    [activeResult, horizon],
  );

  if (error) {
    return (
      <div className="app">
        <h1>Carovita</h1>
        <div className="notice">
          <strong>Non riesco a caricare i dati.</strong>
          <p style={{ margin: '6px 0 0' }}>{error}</p>
        </div>
      </div>
    );
  }

  if (!snapshot || !active) {
    return (
      <div className="app">
        <h1>Carovita</h1>
        <p className="muted">Carico gli indici dei prezzi…</p>
      </div>
    );
  }

  const updateActive = (p: Profile): void =>
    setProfiles(profiles.map((x) => (x.id === p.id ? p : x)));

  const addProfile = (): void => {
    // Il nuovo profilo parte come copia di quello attivo: si confrontano
    // varianti di una stessa situazione, non configurazioni da zero.
    const copy: Profile = {
      ...structuredClone(active),
      id: `profilo-${Date.now().toString(36)}`,
      name: `${active.name} (variante)`,
      color: PROFILE_COLORS[profiles.length % PROFILE_COLORS.length]!,
    };
    setProfiles([...profiles, copy]);
    setActiveId(copy.id);
  };

  return (
    <div className="app">
      <header className="masthead">
        <h1 style={{ margin: 0 }}>Carovita</h1>
        <p>
          Quanto ti costerà vivere fra {horizon.toLocaleString('it-IT')} anni, e quale scelta ti fa
          risparmiare di più.
        </p>
      </header>

      {snapshot.degraded && (
        <div className="notice">
          Ultimo aggiornamento dati parziale: alcune fonti non hanno risposto e
          sono stati riusati i valori precedenti. Dettagli nella scheda{' '}
          <em>Dati e modello</em>.
        </div>
      )}

      {/* --- barra scenario ---------------------------------------------- */}
      <div className="card">
        <div className="grid">
          <div className="field">
            <label htmlFor="s-profile">Profilo attivo</label>
            <select
              id="s-profile"
              value={activeId}
              onChange={(e) => setActiveId(e.target.value)}
            >
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="s-horizon">
              Orizzonte:{' '}
              {horizon === 1.5
                ? 'un anno e mezzo'
                : `${horizon.toLocaleString('it-IT')} anni`}
            </label>
            <input
              id="s-horizon"
              type="range"
              min={1.5}
              max={30}
              step={0.5}
              value={horizon}
              onChange={(e) => setHorizon(Number(e.target.value))}
            />
            <span className="hint">
              Si parte da {activeResult ? shortMonthLabel(activeResult.startMonth) : 'oggi'}
              {activeResult ? ` e si arriva ${aMese(activeResult.endMonth)}` : ''}.
            </span>
          </div>

          <div className="field">
            <label htmlFor="s-anchor">
              Inflazione di lungo periodo:{' '}
              {pct(anchorOverride ?? snapshot.longRunAnchor)}
            </label>
            <input
              id="s-anchor"
              type="range"
              min={0}
              max={0.06}
              step={0.0025}
              value={anchorOverride ?? snapshot.longRunAnchor}
              onChange={(e) => setAnchorOverride(Number(e.target.value))}
            />
            <span className="hint">
              {anchorOverride === null
                ? 'Obiettivo BCE (2%).'
                : 'Valore personalizzato.'}{' '}
              {anchorOverride !== null && (
                <button
                  className="btn"
                  type="button"
                  style={{ padding: '1px 6px', fontSize: 11 }}
                  onClick={() => setAnchorOverride(null)}
                >
                  ripristina
                </button>
              )}
            </span>
          </div>

          <div className="field">
            <label htmlFor="s-conf">
              Confidenza delle bande: {pct(confidence, 0)}
            </label>
            <select
              id="s-conf"
              value={confidence}
              onChange={(e) => setConfidence(Number(e.target.value))}
            >
              <option value={0.5}>50%</option>
              <option value={0.8}>80%</option>
              <option value={0.9}>90%</option>
            </select>
          </div>
        </div>

        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn" type="button" onClick={addProfile}>
            Duplica per confrontare
          </button>
          {profiles.length > 1 && (
            <button
              className="btn danger"
              type="button"
              onClick={() => {
                const rest = profiles.filter((p) => p.id !== activeId);
                setProfiles(rest);
                setActiveId(rest[0]!.id);
              }}
            >
              Elimina profilo
            </button>
          )}
          <button
            className="btn"
            type="button"
            onClick={() => {
              if (
                confirm(
                  'Vuoi cancellare tutti i profili e ripartire dai valori di esempio?',
                )
              ) {
                clearState();
                const fresh = makeDefaultProfile(0);
                setProfiles([fresh]);
                setActiveId(fresh.id);
              }
            }}
          >
            Ricomincia da capo
          </button>
        </div>
      </div>

      {/* --- riepilogo --------------------------------------------------- */}
      {activeResult && <Summary result={activeResult} />}

      {/* --- schede ------------------------------------------------------ */}
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'config' && (
        <ConfigPanel
          profile={active}
          onChange={updateActive}
          forecastRates={forecastRates}
          startMonth={startMonth}
        />
      )}
      {tab === 'previsione' && activeResult && (
        <Forecast
          result={activeResult}
          selected={selected}
          onSelect={setSelectedYear}
        />
      )}
      {tab === 'confronto' && (
        <Compare
          results={results}
          colors={profiles.map(
            (_, i) => PROFILE_COLORS[i % PROFILE_COLORS.length]!,
          )}
          selected={selected}
          onSelect={setSelectedYear}
        />
      )}
      {tab === 'dati' && activeResult && (
        <DataPanel snapshot={snapshot} result={activeResult} />
      )}

      <footer className="muted small" style={{ marginTop: 28 }}>
        Dati Eurostat e ISTAT, aggiornati al {isoDate(snapshot.generatedAt)}. I
        canoni al metro quadro sono una stima indicativa, non quotazioni OMI
        ufficiali. Nessun dato inserito lascia il tuo dispositivo: la
        configurazione resta nel browser.
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------------------

/**
 * Barra di riepilogo: quattro numeri che si leggono senza grafici.
 *
 * Spese e risparmi sono al mese, perché è così che si ragiona su uno
 * stipendio; il totale dei dodici mesi sta sotto. «Oggi» è la media dei
 * prossimi dodici mesi, «fra N anni» quella degli ultimi dodici
 * dell'orizzonte. Il patrimonio, se va sotto zero, mostra quando ci va e
 * quanto manca a fine periodo, che è ciò che serve sapere in quel caso.
 */
function Summary({ result }: { result: ProjectionResult }): JSX.Element {
  const s = summarize(result);
  const future = fraTempo(result.months.length);
  const growth = s.baseSpend > 0 ? s.finalSpend / s.baseSpend - 1 : 0;
  const loss = deficit(s.savingsFirstYear);

  const cells: StatCell[] = [
    {
      label: 'Spesa oggi',
      value: eur(s.baseSpend / 12),
      unit: 'al mese',
      notes: [{ text: `${eur(s.baseSpend)} nei prossimi 12 mesi` }],
    },
    {
      label: `Spesa ${future}`,
      value: eur(s.finalSpend / 12),
      unit: 'al mese',
      notes: [
        { text: `${pctSigned(growth)} rispetto a oggi` },
        { text: `in euro di oggi: ${eur(s.finalSpendReal / 12)}` },
      ],
    },
    // Un saldo negativo non e' un «risparmio di −50 €»: diventa una perdita,
    // mostrata in positivo e in rosso, e la voce dei risparmi sparisce.
    loss === null
      ? {
          label: 'Risparmi oggi',
          value: eur(Math.max(0, s.savingsFirstYear) / 12),
          unit: 'al mese',
          notes: [{ text: `${eur(Math.max(0, s.savingsFirstYear))} nei prossimi 12 mesi` }],
        }
      : {
          label: 'Perdite oggi',
          value: eur(loss / 12),
          unit: 'al mese',
          loss: true,
          notes: [
            { text: `${eur(loss)} nei prossimi 12 mesi` },
            { text: 'spendi più di quanto incassi e attingi al patrimonio' },
          ],
        },
    wealthCell(result, s, future),
  ];

  return (
    <div className="card">
      <div className="grid">
        {cells.map((c) => (
          <div key={c.label}>
            <div
              className="small"
              style={{
                color: c.loss ? 'var(--critical)' : 'var(--text-muted)',
                fontWeight: c.loss ? 600 : undefined,
              }}
            >
              {c.label}
            </div>
            <div
              style={{
                fontSize: 22,
                fontWeight: 600,
                fontVariantNumeric: 'tabular-nums',
                color: c.loss ? 'var(--critical)' : undefined,
              }}
            >
              {c.value}
              {c.unit && (
                <span className="small muted" style={{ fontWeight: 400 }}>
                  {' '}
                  {c.unit}
                </span>
              )}
            </div>
            {c.notes.map((n, i) => (
              <div
                key={i}
                className="small"
                style={{
                  color: n.strong ? 'var(--text-primary)' : 'var(--text-muted)',
                  fontWeight: n.strong ? 600 : undefined,
                }}
              >
                {n.text}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

interface StatCell {
  label: string;
  value: string;
  unit?: string;
  loss?: boolean;
  notes: { text: string; strong?: boolean }[];
}

function wealthCell(
  result: ProjectionResult,
  s: ReturnType<typeof summarize>,
  future: string,
): StatCell {
  const end = shortMonthLabel(result.endMonth);

  // Il patrimonio finisce sotto zero: contano la data in cui ci arriva e
  // quanto manca alla fine, non un saldo negativo messo lì senza contesto.
  if (s.depletionMonth !== null && s.finalWealth < 0) {
    const after = monthIndex(s.depletionMonth) - monthIndex(result.startMonth);
    return {
      label: 'Patrimonio sotto zero',
      value: `da ${shortMonthLabel(s.depletionMonth)}`,
      loss: true,
      notes: [
        { text: `${fraCirca(after)}, data indicativa` },
        { text: `a fine periodo (${end}): ${eurSigned(s.finalWealth)}`, strong: true },
      ],
    };
  }

  const notes: StatCell['notes'] = [
    { text: `pari a ${eur(s.finalWealthReal)} di oggi` },
  ];
  // Sotto zero per qualche mese, poi di nuovo sopra: va detto, perché in
  // quei mesi il conto e' davvero in rosso.
  if (s.depletionMonth !== null) {
    const below = result.months.filter((m) => m.wealth < 0).length;
    notes.push({
      text: `sotto zero da ${shortMonthLabel(s.depletionMonth)}, ${below} ${below === 1 ? 'mese' : 'mesi'} in rosso in tutto, poi recupera`,
      strong: true,
    });
  }
  return {
    label: `Patrimonio ${future}`,
    value: eur(s.finalWealth),
    notes,
  };
}
