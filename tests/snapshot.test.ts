/**
 * Test di integrazione sullo snapshot reale.
 *
 * I test in `core.test.ts` usano serie sintetiche per verificare gli
 * invarianti. Questi invece girano sui dati veri scaricati da Eurostat e
 * ISTAT: servono a intercettare i problemi che le serie finte non possono
 * mostrare, come un codice di categoria che cambia significato, un dataset
 * congelato o un raccordo fra basi d'indice andato storto.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { project, summarize } from '../src/core/project.js';
import {
  averageCategoryCorrelation,
  estimateAllModels,
} from '../src/core/model.js';
import { annualInflation, decemberInflation } from '../src/core/series.js';
import {
  ROOM_EQUIVALENT_SQM,
  ROOM_QUOTES,
  ROOM_RATIO_LOG_SD,
} from '../src/core/rooms.js';
import type { CityRentQuote, DataSnapshot } from '../src/core/types.js';
import { makeDefaultProfile } from '../src/ui/defaults.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_PATH = resolve(__dirname, '../public/data/snapshot.json');

const hasSnapshot = existsSync(SNAPSHOT_PATH);
const snapshot: DataSnapshot | null = hasSnapshot
  ? (JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8')) as DataSnapshot)
  : null;

// Senza snapshot (checkout pulito, prima di `npm run data:refresh`) i test
// si saltano invece di fallire.
const d = hasSnapshot ? describe : describe.skip;

d('snapshot reale', () => {
  it('contiene le serie indispensabili', () => {
    const s = snapshot!;
    expect(s.series.headline).toBeDefined();
    expect(s.series.rent).toBeDefined();
    expect(s.series.food).toBeDefined();
    expect(s.series.utilities).toBeDefined();
  });

  it('le serie hanno una storia lunga e ordinata', () => {
    for (const s of Object.values(snapshot!.series)) {
      if (!s) continue;
      expect(s.obs.length).toBeGreaterThan(200);
      for (let i = 1; i < s.obs.length; i++) {
        expect(s.obs[i]!.t > s.obs[i - 1]!.t).toBe(true);
      }
      // Un indice di prezzo e' sempre positivo.
      expect(s.obs.every((o) => o.v > 0)).toBe(true);
    }
  });

  it('i dati non sono fermi da troppo tempo', () => {
    // Intercetta il caso peggiore: un dataset sostituito a monte che continua
    // a rispondere ma non viene piu' aggiornato.
    const h = snapshot!.series.headline!;
    const [y, m] = h.vintage.split('-').map(Number);
    const vintageIdx = y! * 12 + (m! - 1);
    const now = new Date();
    const nowIdx = now.getFullYear() * 12 + now.getMonth();
    expect(nowIdx - vintageIdx).toBeLessThanOrEqual(8);
  });

  it('riproduce l’inflazione italiana nota degli anni recenti', () => {
    // Controllo contro la realta': il 2022 e' stato l'anno dello shock
    // energetico, con inflazione italiana intorno all'8%, il 2020 vicino a
    // zero. Se il parsing o il raccordo si rompono, questi valori saltano.
    const infl = annualInflation(snapshot!.series.headline!.obs);
    expect(infl.get(2022)!).toBeGreaterThan(0.06);
    expect(infl.get(2022)!).toBeLessThan(0.11);
    expect(Math.abs(infl.get(2020)!)).toBeLessThan(0.02);
  });

  it('l’indice FOI e’ raccordato senza salti artificiali', () => {
    const foi = snapshot!.foi;
    if (!foi) return;
    // Un raccordo sbagliato fra basi d'indice produce un salto enorme in un
    // singolo mese. Nessuna variazione mensile reale supera il 5%.
    for (let i = 1; i < foi.obs.length; i++) {
      const change = Math.abs(foi.obs[i]!.v / foi.obs[i - 1]!.v - 1);
      expect(change).toBeLessThan(0.05);
    }
    // E deve coprire tutte le basi, dal 1996 a oggi.
    expect(foi.obs.length).toBeGreaterThan(300);
  });

  it('il FOI concorda con l’inflazione ISTAT pubblicata', () => {
    const foi = snapshot!.foi;
    if (!foi) return;
    const infl = annualInflation(foi.obs);
    // Valori ufficiali ISTAT: 2022 +8,1%, 2023 +5,4%.
    expect(infl.get(2022)!).toBeGreaterThan(0.07);
    expect(infl.get(2022)!).toBeLessThan(0.09);
    expect(infl.get(2023)!).toBeGreaterThan(0.04);
    expect(infl.get(2023)!).toBeLessThan(0.065);
  });

  it('stima parametri plausibili per ogni categoria', () => {
    for (const m of estimateAllModels(snapshot!)) {
      expect(m.phi).toBeGreaterThanOrEqual(0);
      expect(m.phi).toBeLessThan(1); // altrimenti la previsione esplode
      expect(Math.abs(m.spread)).toBeLessThanOrEqual(0.03);
      expect(m.sigma).toBeGreaterThan(0);
      expect(Number.isFinite(m.sigmaAnchor)).toBe(true);
      expect(Number.isFinite(m.lastRate)).toBe(true);
    }
  });

  it('l’energia risulta piu’ volatile degli alimentari', () => {
    // Controllo di buon senso sul segnale: se si invertisse, avremmo
    // scambiato due categorie nel mapping dei codici.
    const models = estimateAllModels(snapshot!);
    const energy = models.find((m) => m.category === 'utilities')!;
    const food = models.find((m) => m.category === 'food')!;
    expect(energy.sigma).toBeGreaterThan(food.sigma);
  });

  it('produce una proiezione completa e finita sul profilo di esempio', () => {
    const res = project(makeDefaultProfile(0), snapshot!, {
      startMonth: '2026-01',
      horizon: 15,
      anchorOverride: null,
      confidence: 0.8,
    });
    // Orizzonte di 15 anni = 15 periodi da dodici mesi, non 16: il primo
    // parte dal mese corrente, non dal gennaio precedente.
    expect(res.years.length).toBe(15);
    for (const y of res.years) {
      expect(Number.isFinite(y.totalNominal)).toBe(true);
      expect(y.totalNominal).toBeGreaterThan(0);
      expect(y.totalLo).toBeLessThanOrEqual(y.totalNominal + 1e-6);
      expect(y.totalHi).toBeGreaterThanOrEqual(y.totalNominal - 1e-6);
      // L'attribuzione deve chiudere esattamente.
      for (const c of y.categories) {
        const a = c.attribution;
        const sum =
          a.base +
          a.fromAnchor +
          a.fromSpread +
          a.fromPersistence +
          a.fromOverride +
          a.fromContract;
        expect(sum).toBeCloseTo(c.nominal, 4);
      }
    }
  });

  it('la spesa cresce a un ritmo credibile, non esplosivo', () => {
    const res = project(makeDefaultProfile(0), snapshot!, {
      startMonth: '2026-01',
      horizon: 20,
      anchorOverride: null,
      confidence: 0.8,
    });
    const s = summarize(res);
    // Con un'ancora al 2% la crescita composta della spesa deve restare in
    // un intorno ragionevole: fra lo 0,5% e il 5% l'anno.
    expect(s.cagr).toBeGreaterThan(0.005);
    expect(s.cagr).toBeLessThan(0.05);
  });

  it('la cedolare secca conviene all’inquilino nel lungo periodo', () => {
    const base = makeDefaultProfile(0);
    const conIndicizzazione = project(
      {
        ...base,
        housing: {
          ...base.housing,
          cedolareSecca: false,
          istatIndexation: true,
        },
      },
      snapshot!,
    );
    const conCedolare = project(
      {
        ...base,
        housing: {
          ...base.housing,
          cedolareSecca: true,
        },
      },
      snapshot!,
    );
    const a = conIndicizzazione.years.reduce((s, y) => s + y.totalNominal, 0);
    const b = conCedolare.years.reduce((s, y) => s + y.totalNominal, 0);
    expect(b).toBeLessThan(a);
  });

  it('le categorie non sono perfettamente correlate', () => {
    // Se lo fossero, sommare gli estremi delle bande sarebbe corretto. Non lo
    // sono: energia, abbigliamento e telefonia seguono strade diverse.
    const rho = averageCategoryCorrelation(snapshot!);
    expect(rho).toBeGreaterThan(0);
    expect(rho).toBeLessThan(0.8);
  });

  it('la banda del totale e’ piu’ stretta della somma degli estremi', () => {
    // Sommare gli estremi assume che tutte le categorie sbaglino insieme:
    // sovrastima l’incertezza, e sul patrimonio l’errore si vede.
    const res = project(makeDefaultProfile(0), snapshot!, {
      startMonth: '2026-01',
      horizon: 15,
      anchorOverride: null,
      confidence: 0.8,
    });
    const y = res.years[res.years.length - 1]!;
    const sommaEstremi = y.categories.reduce((a, c) => a + c.lo, 0);
    expect(y.totalLo).toBeGreaterThan(sommaEstremi);
    expect(y.totalLo).toBeLessThan(y.totalNominal);
  });

  it('il patrimonio ha una banda coerente col segno della spesa', () => {
    const res = project(makeDefaultProfile(0), snapshot!, {
      startMonth: '2026-01',
      horizon: 15,
      anchorOverride: null,
      confidence: 0.8,
    });
    for (const y of res.years) {
      expect(y.cumulativeWealthLo).toBeLessThanOrEqual(y.cumulativeWealth + 1e-6);
      expect(y.cumulativeWealthHi).toBeGreaterThanOrEqual(y.cumulativeWealth - 1e-6);
    }
  });

  it('i tendenziali di dicembre coprono tutti gli anni recenti', () => {
    const dec = decemberInflation(snapshot!.series.headline!.obs);
    for (const y of [2019, 2020, 2021, 2022, 2023, 2024, 2025]) {
      expect(dec.has(y)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Prezzi delle stanze: coerenza fra i dati pubblicati e i canoni al m²
// ---------------------------------------------------------------------------

describe('prezzi delle stanze', () => {
  const citiesPath = resolve(__dirname, '../src/data/cities.json');

  it('il rapporto stanza / canone al m² usato per i comuni e’ quello misurato', () => {
    if (!existsSync(citiesPath)) return;
    const cities = JSON.parse(readFileSync(citiesPath, 'utf8')) as CityRentQuote[];
    const ratios: number[] = [];
    const logs: number[] = [];
    for (const q of ROOM_QUOTES) {
      const c = cities.find((x) => x.istatCode === q.istatCode);
      expect(c, `comune ${q.comune} nell'anagrafica`).toBeDefined();
      expect(c!.comune).toBe(q.comune);
      const r = q.single / c!.eurM2Month.semicentro;
      ratios.push(r);
      logs.push(Math.log(r));
    }
    ratios.sort((a, b) => a - b);
    const median = ratios[Math.floor(ratios.length / 2)]!;
    // Se cambiano i dati, la costante va riallineata: il test lo segnala.
    expect(Math.abs(median - ROOM_EQUIVALENT_SQM)).toBeLessThan(2);
    const mean = logs.reduce((a, b) => a + b, 0) / logs.length;
    const sd = Math.sqrt(
      logs.reduce((a, b) => a + (b - mean) ** 2, 0) / (logs.length - 1),
    );
    expect(Math.abs(sd - ROOM_RATIO_LOG_SD)).toBeLessThan(0.03);
  });
});
