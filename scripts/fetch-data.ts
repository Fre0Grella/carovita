/**
 * Pipeline di aggiornamento dati.
 *
 * Scarica gli indici di prezzo da Eurostat e ISTAT, li normalizza e scrive
 * `public/data/snapshot.json`.
 *
 * ## Regole di sicurezza della pipeline
 *
 * 1. **Non sovrascrivere mai un dato buono con un errore.** Se una fonte non
 *    risponde, si riusa la serie dello snapshot precedente e si marca la
 *    corsa come `degraded`. Un'app che mostra dati vecchi ma segnalati è
 *    utilizzabile; una che mostra un errore al posto dei dati no.
 * 2. **Fallire se il dato è stantio.** Una serie ferma da troppi mesi viene
 *    segnalata: è il sintomo di un dataset congelato (vedi la nota sul
 *    passaggio a ECOICOP 2 in `sources.ts`).
 * 3. **Registrare la provenienza.** Ogni serie porta con sé dataset, codice,
 *    URL, vintage e istante di download.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  EUROSTAT_BASE,
  EUROSTAT_SOURCES,
  FOI_BASES,
  FOI_DATAFLOW_CURRENT,
  FOI_DATAFLOW_HISTORIC,
  FOI_ECOICOP_FALLBACK,
  FOI_ECOICOP_PRIMARY,
  FOI_MEASURE_INDEX,
  HICP_DATASET,
  HICP_UNIT,
  ISTAT_BASE,
  LONG_RUN_ANCHOR,
  MAX_STALENESS_MONTHS,
} from './sources.js';
import { monthIndex, normalizeObs } from '../src/core/series.js';
import type {
  CategoryId,
  DataSnapshot,
  IndexSeries,
  MonthlyObs,
} from '../src/core/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const OUT_PATH = resolve(ROOT, 'public/data/snapshot.json');
const CITIES_SRC = resolve(ROOT, 'src/data/cities.json');
/**
 * I comuni viaggiano in un file separato: sono quasi 3 MB contro i ~250 KB
 * delle serie storiche, e servono solo quando l'utente apre il selettore
 * della citta'. Tenerli nello snapshot obbligherebbe a scaricarli all'avvio
 * per poi non usarli quasi mai.
 */
const CITIES_OUT = resolve(ROOT, 'public/data/cities.json');

const SCHEMA_VERSION = 1;

interface FetchOptions {
  timeoutMs: number;
  retries: number;
}

const DEFAULT_FETCH: FetchOptions = { timeoutMs: 120_000, retries: 3 };

async function fetchText(
  url: string,
  headers: Record<string, string> = {},
  opts: FetchOptions = DEFAULT_FETCH,
): Promise<string> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= opts.retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs);
    try {
      // `accept-language` esplicito: il web service SDMX di ISTAT risponde
      // HTTP 500 ("languageTag") se riceve l'header `accept-language: *` che
      // Node invia di default insieme a un `accept` personalizzato.
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: { 'accept-language': 'en', ...headers },
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }
      return await res.text();
    } catch (err) {
      lastErr = err;
      const wait = 2000 * attempt;
      console.warn(
        `  tentativo ${attempt}/${opts.retries} fallito (${String(err)}), ` +
          `riprovo fra ${wait}ms`,
      );
      if (attempt < opts.retries) await sleep(wait);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Eurostat
// ---------------------------------------------------------------------------

/** Risposta JSON-stat 2.0 di Eurostat, nei campi che ci servono. */
interface JsonStat {
  value: Record<string, number>;
  updated?: string;
  dimension: Record<
    string,
    { category: { index: Record<string, number>; label?: Record<string, string> } }
  >;
  id: string[];
  size: number[];
}

function eurostatUrl(code: string): string {
  const params = new URLSearchParams({
    format: 'JSON',
    lang: 'EN',
    geo: 'IT',
    unit: HICP_UNIT,
    coicop18: code,
    freq: 'M',
  });
  return `${EUROSTAT_BASE}/${HICP_DATASET}?${params.toString()}`;
}

/**
 * Estrae la serie mensile da una risposta JSON-stat.
 *
 * JSON-stat linearizza un ipercubo: l'indice piatto va decodificato con le
 * dimensioni in `size`. Qui tutte le dimensioni tranne `time` hanno un solo
 * valore, quindi l'indice piatto coincide con la posizione temporale, ma il
 * calcolo è fatto in modo generale per non rompersi se Eurostat aggiunge una
 * dimensione.
 */
function parseJsonStat(raw: string): { obs: MonthlyObs[]; updated?: string } {
  const data = JSON.parse(raw) as JsonStat & { error?: unknown };
  if (data.error) {
    throw new Error(`Eurostat: ${JSON.stringify(data.error).slice(0, 200)}`);
  }
  const timeDim = data.dimension['time'];
  if (!timeDim) throw new Error('Eurostat: dimensione time assente');

  const timeIdx = timeDim.category.index;
  const timePos = data.id.indexOf('time');
  if (timePos < 0) throw new Error('Eurostat: time non presente in id');

  // Passo dell'indice piatto lungo la dimensione temporale.
  let stride = 1;
  for (let i = timePos + 1; i < data.size.length; i++) {
    stride *= data.size[i]!;
  }
  // Offset delle altre dimensioni: tutte a indice 0 (una sola categoria).
  const byPos = new Map<number, string>();
  for (const [t, pos] of Object.entries(timeIdx)) byPos.set(pos, t);

  const obs: MonthlyObs[] = [];
  for (const [pos, t] of byPos) {
    const flat = pos * stride;
    const v = data.value[String(flat)];
    if (typeof v === 'number' && Number.isFinite(v)) obs.push({ t, v });
  }
  return { obs: normalizeObs(obs), updated: data.updated };
}

async function fetchEurostatSeries(def: {
  category: CategoryId;
  label: string;
  code: string;
}): Promise<IndexSeries> {
  const url = eurostatUrl(def.code);
  const raw = await fetchText(url);
  const { obs } = parseJsonStat(raw);
  if (obs.length === 0) {
    throw new Error(`Eurostat: nessuna osservazione per ${def.code}`);
  }
  return {
    category: def.category,
    label: def.label,
    datasetId: HICP_DATASET,
    sourceCode: def.code,
    source: 'eurostat',
    sourceUrl: url,
    base: '2025=100',
    vintage: obs[obs.length - 1]!.t,
    fetchedAt: new Date().toISOString(),
    obs,
  };
}

// ---------------------------------------------------------------------------
// ISTAT - FOI
// ---------------------------------------------------------------------------

/** Risposta SDMX-JSON 2.0, nei campi che ci servono. */
interface SdmxJson {
  data: {
    dataSets: { observations: Record<string, (string | number | null)[]> }[];
    structures: {
      dimensions: {
        observation: { id: string; values: { id: string; name?: string }[] }[];
      };
    }[];
  };
}

function istatUrl(dataflow: string, key: string): string {
  return (
    `${ISTAT_BASE}/data/${dataflow}/${key}/` +
    `?dimensionAtObservation=AllDimensions`
  );
}

/** Estrae le osservazioni mensili da una risposta SDMX-JSON. */
function parseSdmx(raw: string): MonthlyObs[] {
  const doc = JSON.parse(raw) as SdmxJson;
  const ds = doc.data.dataSets[0];
  const dims = doc.data.structures[0]?.dimensions.observation;
  if (!ds || !dims) return [];
  const timePos = dims.findIndex((d) => d.id === 'TIME_PERIOD');
  if (timePos < 0) return [];
  const timeValues = dims[timePos]!.values;

  const obs: MonthlyObs[] = [];
  for (const [key, arr] of Object.entries(ds.observations)) {
    const parts = key.split(':').map(Number);
    const t = timeValues[parts[timePos]!]?.id;
    const rawV = arr[0];
    const v = typeof rawV === 'string' ? Number(rawV) : rawV;
    if (t && typeof v === 'number' && Number.isFinite(v)) obs.push({ t, v });
  }
  return normalizeObs(obs);
}

/**
 * Raccorda due serie con basi diverse (chain-linking).
 *
 * ISTAT cambia la base dell'indice ogni pochi anni; ciascuna serie parte da
 * 100 nell'anno base, quindi concatenarle direttamente produrrebbe salti
 * artificiali enormi. Il raccordo riscala la serie vecchia con il rapporto
 * osservato nei mesi di sovrapposizione, preservando tutte le variazioni
 * percentuali: è la stessa procedura dei coefficienti di raccordo ISTAT.
 *
 * `recent` ha la precedenza dove le due si sovrappongono.
 */
export function chainLink(older: MonthlyObs[], recent: MonthlyObs[]): MonthlyObs[] {
  if (older.length === 0) return recent;
  if (recent.length === 0) return older;

  const recentByT = new Map(recent.map((o) => [o.t, o.v]));
  // Cerca i mesi presenti in entrambe per stimare il fattore di raccordo.
  const ratios: number[] = [];
  for (const o of older) {
    const r = recentByT.get(o.t);
    if (r !== undefined && o.v > 0) ratios.push(r / o.v);
  }

  let factor: number;
  if (ratios.length > 0) {
    factor = ratios.reduce((a, b) => a + b, 0) / ratios.length;
  } else {
    // Nessuna sovrapposizione: raccorda sul confine, assumendo continuità
    // fra l'ultimo mese della vecchia e il primo della nuova.
    const lastOld = older[older.length - 1]!;
    const firstNew = recent[0]!;
    if (monthIndex(firstNew.t) - monthIndex(lastOld.t) !== 1 || lastOld.v <= 0) {
      return recent;
    }
    factor = firstNew.v / lastOld.v;
  }

  const rescaled = older
    .filter((o) => !recentByT.has(o.t))
    .map((o) => ({ t: o.t, v: o.v * factor }));
  return normalizeObs([...rescaled, ...recent]);
}

/**
 * Costruisce la serie FOI completa, raccordando tutte le basi disponibili.
 * Prova prima l'indice al netto dei tabacchi, poi l'indice generale.
 */
async function fetchFoi(): Promise<IndexSeries> {
  const errors: string[] = [];

  for (const ecoicop of [FOI_ECOICOP_PRIMARY, FOI_ECOICOP_FALLBACK]) {
    const pieces: { base: string; obs: MonthlyObs[] }[] = [];

    for (const { dataType, base } of FOI_BASES) {
      // La base corrente sta nel dataflow "current", le storiche in quello
      // "historic".
      const dataflow =
        dataType === '101' ? FOI_DATAFLOW_CURRENT : FOI_DATAFLOW_HISTORIC;
      const key = `M.IT.${dataType}.${FOI_MEASURE_INDEX}.${ecoicop}`;
      const url = istatUrl(dataflow, key);
      try {
        const raw = await fetchText(
          url,
          { accept: 'application/vnd.sdmx.data+json;version=2.0.0' },
          { timeoutMs: 180_000, retries: 2 },
        );
        const obs = parseSdmx(raw);
        if (obs.length > 0) pieces.push({ base, obs });
      } catch (err) {
        errors.push(`${ecoicop}/${dataType}: ${String(err)}`);
      }
    }

    if (pieces.length === 0) continue;

    // Ordina dalla base più vecchia alla più recente e raccorda.
    pieces.sort(
      (a, b) => monthIndex(a.obs[0]!.t) - monthIndex(b.obs[0]!.t),
    );
    let merged: MonthlyObs[] = [];
    for (const p of pieces) merged = chainLink(merged, p.obs);

    const label =
      ecoicop === FOI_ECOICOP_PRIMARY
        ? 'FOI al netto dei tabacchi (ISTAT)'
        : 'FOI indice generale (ISTAT)';

    return {
      category: 'headline',
      label,
      datasetId: FOI_DATAFLOW_CURRENT,
      sourceCode: ecoicop,
      source: 'istat',
      sourceUrl: istatUrl(
        FOI_DATAFLOW_CURRENT,
        `M.IT.101.${FOI_MEASURE_INDEX}.${ecoicop}`,
      ),
      base: 'raccordata a 2025=100',
      vintage: merged[merged.length - 1]!.t,
      fetchedAt: new Date().toISOString(),
      obs: merged,
    };
  }

  throw new Error(`ISTAT FOI non disponibile. ${errors.join('; ')}`);
}

// ---------------------------------------------------------------------------
// Controllo di freschezza
// ---------------------------------------------------------------------------

function monthsSince(vintage: string): number {
  const now = new Date();
  const nowIdx = now.getFullYear() * 12 + now.getMonth();
  return nowIdx - monthIndex(vintage);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function loadPrevious(): Promise<DataSnapshot | null> {
  if (!existsSync(OUT_PATH)) return null;
  try {
    return JSON.parse(await readFile(OUT_PATH, 'utf8')) as DataSnapshot;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const previous = await loadPrevious();
  const warnings: string[] = [];
  let degraded = false;

  const series: Partial<Record<CategoryId, IndexSeries>> = {};

  console.log(`Eurostat: ${HICP_DATASET} (ECOICOP 2, base ${HICP_UNIT})`);
  for (const def of EUROSTAT_SOURCES) {
    try {
      const s = await fetchEurostatSeries(def);
      const stale = monthsSince(s.vintage);
      if (stale > MAX_STALENESS_MONTHS) {
        warnings.push(
          `La serie "${def.label}" (${def.code}) è ferma a ${s.vintage}: ` +
            `${stale} mesi di ritardo. Il dataset potrebbe essere stato ` +
            `sostituito da Eurostat.`,
        );
        degraded = true;
      }
      series[def.category] = s;
      console.log(
        `  ok  ${def.code.padEnd(6)} ${def.label.padEnd(44)} ` +
          `${s.obs.length} oss., fino a ${s.vintage}`,
      );
    } catch (err) {
      const prev = previous?.series?.[def.category];
      if (prev) {
        series[def.category] = prev;
        warnings.push(
          `Fonte non raggiungibile per "${def.label}": riuso lo snapshot ` +
            `precedente (vintage ${prev.vintage}).`,
        );
        degraded = true;
        console.warn(`  !!  ${def.code} fallita, riuso il dato precedente`);
      } else if (def.required) {
        throw new Error(
          `Serie obbligatoria "${def.label}" non disponibile e nessuno ` +
            `snapshot precedente: ${String(err)}`,
        );
      } else {
        warnings.push(`Serie "${def.label}" non disponibile: ${String(err)}`);
        degraded = true;
        console.warn(`  --  ${def.code} non disponibile, la salto`);
      }
    }
  }

  // FOI ISTAT: utile ma non bloccante. Senza, il modello usa l'indice
  // generale per l'aggiornamento dei canoni e lo dichiara.
  let foi: IndexSeries | undefined;
  console.log('ISTAT: indice FOI per la rivalutazione dei canoni');
  try {
    foi = await fetchFoi();
    console.log(
      `  ok  ${foi.sourceCode} ${foi.label} ` +
        `${foi.obs.length} oss., ${foi.obs[0]!.t} -> ${foi.vintage}`,
    );
  } catch (err) {
    foi = previous?.foi;
    if (foi) {
      warnings.push(`ISTAT non raggiungibile: riuso il FOI precedente.`);
      console.warn('  !!  ISTAT fallita, riuso il dato precedente');
    } else {
      warnings.push(
        `Indice FOI non disponibile (${String(err)}): l'aggiornamento ISTAT ` +
          `dei canoni verrà stimato sull'indice generale.`,
      );
      console.warn('  --  FOI non disponibile');
    }
    degraded = true;
  }

  const citiesRaw = await readFile(CITIES_SRC, 'utf8');
  const cities = JSON.parse(citiesRaw) as unknown[];

  const snapshot: DataSnapshot = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    degraded,
    warnings,
    series,
    ...(foi ? { foi } : {}),
    // Lo snapshot non porta i comuni: si caricano a parte, su richiesta.
    cities: [],
    longRunAnchor: LONG_RUN_ANCHOR,
  };

  await mkdir(dirname(OUT_PATH), { recursive: true });
  await writeFile(OUT_PATH, JSON.stringify(snapshot), 'utf8');
  await writeFile(CITIES_OUT, citiesRaw, 'utf8');

  const bytes = JSON.stringify(snapshot).length;
  console.log(
    `\nScritto ${OUT_PATH} (${(bytes / 1024).toFixed(0)} KB), ` +
      `${Object.keys(series).length} serie, ${cities.length} comuni.`,
  );
  if (warnings.length > 0) {
    console.log(`\n${warnings.length} avvisi:`);
    for (const w of warnings) console.log(`  - ${w}`);
  }
  if (degraded) {
    console.log(
      '\nCorsa DEGRADATA: alcune fonti non hanno risposto o sono obsolete.',
    );
  }
}

main().catch((err) => {
  console.error('\nPipeline fallita:', err);
  process.exit(1);
});
