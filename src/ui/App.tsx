/**
 * Guscio dell'applicazione: stato dei profili, impostazioni dello scenario
 * e navigazione fra le schede.
 *
 * Tutto il calcolo avviene nel browser, sui dati statici già scaricati.
 * Nessuna configurazione lascia il dispositivo.
 */

import { useEffect, useMemo, useState } from 'react';

import { project } from '../core/project.js';
import type { DataSnapshot, Profile, ProjectionResult } from '../core/types.js';
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
import { eur, isoDate, pct } from './format.js';

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
  const [horizon, setHorizon] = useState(stored?.horizon ?? 15);
  const [anchorOverride, setAnchorOverride] = useState<number | null>(
    stored?.anchorOverride ?? null,
  );
  const [confidence, setConfidence] = useState(stored?.confidence ?? 0.8);
  const [real, setReal] = useState(true);

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

  const baseYear = useMemo(() => new Date().getFullYear(), []);

  const results: ProjectionResult[] = useMemo(() => {
    if (!snapshot) return [];
    return profiles.map((p) =>
      project(p, snapshot, {
        baseYear,
        horizon,
        anchorOverride,
        confidence,
      }),
    );
  }, [snapshot, profiles, baseYear, horizon, anchorOverride, confidence]);

  const activeResult = results.find((r) => r.profileId === activeId) ?? results[0];

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
          Quanto ti costerà vivere fra {horizon} anni, e quale scelta ti fa
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
            <label htmlFor="s-horizon">Orizzonte: {horizon} anni</label>
            <input
              id="s-horizon"
              type="range"
              min={3}
              max={30}
              step={1}
              value={horizon}
              onChange={(e) => setHorizon(Number(e.target.value))}
            />
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

          <div className="field checkbox" style={{ alignSelf: 'end' }}>
            <input
              id="s-real"
              type="checkbox"
              checked={real}
              onChange={(e) => setReal(e.target.checked)}
            />
            <div>
              <label htmlFor="s-real">Mostra in euro di oggi</label>
              <div className="hint">
                Toglie l’effetto dell’inflazione, così i confronti fra anni
                diversi sono leggibili.
              </div>
            </div>
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
      {activeResult && <Summary result={activeResult} real={real} />}

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
        <ConfigPanel profile={active} onChange={updateActive} />
      )}
      {tab === 'previsione' && activeResult && (
        <Forecast result={activeResult} real={real} />
      )}
      {tab === 'confronto' && (
        <Compare
          results={results}
          colors={profiles.map(
            (_, i) => PROFILE_COLORS[i % PROFILE_COLORS.length]!,
          )}
          real={real}
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

function Summary({
  result,
  real,
}: {
  result: ProjectionResult;
  real: boolean;
}): JSX.Element {
  const first = result.years[0]!;
  const last = result.years[result.years.length - 1]!;
  const spendNow = first.totalNominal;
  const spendEnd = real ? last.totalReal : last.totalNominal;
  const savingNow = first.savingsNominal;
  const wealth = real
    ? last.cumulativeWealth / last.priceLevel
    : last.cumulativeWealth;

  const cells = [
    { label: `Spesa annua oggi`, value: eur(spendNow) },
    {
      label: `Spesa annua nel ${last.year}`,
      value: eur(spendEnd),
      hint: real ? 'in euro di oggi' : 'in euro correnti',
    },
    {
      label: 'Risparmio annuo oggi',
      value: eur(savingNow),
      hint: savingNow < 0 ? 'stai spendendo più di quanto incassi' : undefined,
    },
    {
      label: `Patrimonio nel ${last.year}`,
      value: eur(wealth),
      hint: real ? 'in euro di oggi' : 'in euro correnti',
    },
  ];

  return (
    <div className="card">
      <div className="grid">
        {cells.map((c) => (
          <div key={c.label}>
            <div className="small muted">{c.label}</div>
            <div
              style={{
                fontSize: 22,
                fontWeight: 600,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {c.value}
            </div>
            {c.hint && <div className="hint">{c.hint}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
