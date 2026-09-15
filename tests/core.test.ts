import { describe, expect, it } from 'vitest';

import {
  annualAverages,
  monthLabel,
  normInv,
  yoyRates,
} from '../src/core/series.js';
import {
  cumulativeIndex,
  estimateCategoryModel,
  forecastRate,
  uncertaintyBand,
} from '../src/core/model.js';
import {
  ISTAT_INDEXATION_CAP,
  REGISTRATION_TAX_MIN,
  buildRentSchedule,
  contractTerm,
  registrationCosts,
} from '../src/core/rent.js';
import { project } from '../src/core/project.js';
import type {
  DataSnapshot,
  HousingConfig,
  IndexSeries,
  Profile,
} from '../src/core/types.js';

// ---------------------------------------------------------------------------
// Costruttori di supporto
// ---------------------------------------------------------------------------

/** Costruisce una serie mensile che cresce a un tasso annuo costante. */
function constantGrowthSeries(
  category: IndexSeries['category'],
  annualRate: number,
  years: number,
  startYear = 1996,
): IndexSeries {
  const obs = [];
  const monthly = Math.pow(1 + annualRate, 1 / 12);
  let v = 100;
  for (let y = 0; y < years; y++) {
    for (let m = 1; m <= 12; m++) {
      obs.push({ t: `${startYear + y}-${String(m).padStart(2, '0')}`, v });
      v *= monthly;
    }
  }
  return {
    category,
    label: `test ${category}`,
    datasetId: 'test',
    sourceCode: 'TEST',
    source: 'eurostat',
    sourceUrl: 'https://example.invalid',
    base: '2025=100',
    vintage: obs[obs.length - 1]!.t,
    fetchedAt: new Date().toISOString(),
    obs,
  };
}

function makeSnapshot(overrides: Partial<DataSnapshot> = {}): DataSnapshot {
  const headline = constantGrowthSeries('headline', 0.02, 30);
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    degraded: false,
    warnings: [],
    series: {
      headline,
      rent: constantGrowthSeries('rent', 0.02, 30),
      food: constantGrowthSeries('food', 0.02, 30),
    },
    cities: [],
    longRunAnchor: 0.02,
    ...overrides,
  };
}

const baseHousing: HousingConfig = {
  contractType: 'libero_4_4',
  istatCode: '015146',
  zone: 'semicentro',
  sqm: 60,
  monthlyRent: 1000,
  cedolareSecca: false,
  istatIndexation: true,
  registrationTaxShare: 0.5,
  highTensionMunicipality: false,
  condoFees: 0,
};

function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'p1',
    name: 'Test',
    color: '#000',
    housing: { ...baseHousing },
    utilities: [],
    expenses: [
      {
        id: 'e1',
        label: 'Spesa alimentare',
        category: 'food',
        monthlyAmount: 300,
        realGrowth: 0,
      },
    ],
    income: {
      monthlyNet: 2000,
      monthsPerYear: 13,
      inflationPassThrough: 1,
      realGrowth: 0,
    },
    initialSavings: 0,
    savingsReturn: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Serie storiche
// ---------------------------------------------------------------------------

describe('series', () => {
  it('calcola il tendenziale annuo confrontando lo stesso mese', () => {
    const s = constantGrowthSeries('headline', 0.03, 3);
    const rates = yoyRates(s.obs);
    // Il primo anno non ha confronto: le variazioni partono dal 13esimo mese.
    expect(rates.length).toBe(s.obs.length - 12);
    for (const r of rates) expect(r.v).toBeCloseTo(0.03, 6);
  });

  it('include nelle medie annue solo gli anni completi', () => {
    const s = constantGrowthSeries('headline', 0.02, 3);
    // Rimuove un mese dall'ultimo anno: quell'anno non deve comparire.
    s.obs.pop();
    const avg = annualAverages(s.obs);
    expect(avg.has(1996)).toBe(true);
    expect(avg.has(1998)).toBe(false);
  });

  it('ignora i mesi mancanti invece di inventarli', () => {
    const s = constantGrowthSeries('headline', 0.02, 3);
    const filtered = s.obs.filter((o) => o.t !== '1997-06');
    const rates = yoyRates(filtered);
    expect(rates.some((r) => r.t === '1997-06')).toBe(false);
    expect(rates.some((r) => r.t === '1998-06')).toBe(false);
  });

  it('normInv restituisce i quantili noti della normale standard', () => {
    expect(normInv(0.5)).toBeCloseTo(0, 6);
    expect(normInv(0.975)).toBeCloseTo(1.959964, 4);
    expect(normInv(0.9)).toBeCloseTo(1.281552, 4);
  });

  it('monthLabel e monthIndex sono inversi', () => {
    expect(monthLabel(2026 * 12 + 0)).toBe('2026-01');
    expect(monthLabel(2026 * 12 + 11)).toBe('2026-12');
  });
});

// ---------------------------------------------------------------------------
// Modello
// ---------------------------------------------------------------------------

describe('model', () => {
  it('su una serie a crescita costante stima spread nullo', () => {
    const headline = constantGrowthSeries('headline', 0.02, 30);
    const cat = constantGrowthSeries('food', 0.02, 30);
    const m = estimateCategoryModel(cat, headline);
    expect(m.spread).toBeCloseTo(0, 6);
    expect(m.lastRate).toBeCloseTo(0.02, 4);
  });

  it('riconosce un differenziale strutturale ampio e persistente', () => {
    const headline = constantGrowthSeries('headline', 0.02, 30);
    // Categoria che cresce stabilmente 3 punti sopra l'indice generale.
    const cat = constantGrowthSeries('rent', 0.05, 30);
    const m = estimateCategoryModel(cat, headline);
    // Il differenziale e' reale e senza rumore: il restringimento non lo
    // deve annullare.
    expect(m.spread).toBeGreaterThan(0.025);
  });

  it('la previsione converge verso l’ancora al crescere dell’orizzonte', () => {
    const headline = constantGrowthSeries('headline', 0.02, 30);
    const cat = constantGrowthSeries('food', 0.02, 30);
    const m = { ...estimateCategoryModel(cat, headline), phi: 0.7, lastRate: 0.1 };
    const r1 = forecastRate(m, 0.02, 1);
    const r20 = forecastRate(m, 0.02, 20);
    expect(r1.total).toBeGreaterThan(r20.total);
    expect(r20.total).toBeCloseTo(0.02 + m.spread, 3);
  });

  it('la scomposizione del tasso somma sempre al totale', () => {
    const headline = constantGrowthSeries('headline', 0.02, 30);
    const cat = constantGrowthSeries('rent', 0.04, 30);
    const m = estimateCategoryModel(cat, headline);
    for (let h = 1; h <= 10; h++) {
      const r = forecastRate(m, 0.025, h);
      expect(r.anchor + r.spread + r.persistence).toBeCloseTo(r.total, 12);
    }
  });

  it('le bande di incertezza si allargano con l’orizzonte', () => {
    const headline = constantGrowthSeries('headline', 0.02, 30);
    const cat = constantGrowthSeries('food', 0.02, 30);
    const m = { ...estimateCategoryModel(cat, headline), sigma: 0.01 };
    const b1 = uncertaintyBand(m, 1, 0.8);
    const b10 = uncertaintyBand(m, 10, 0.8);
    expect(b10.hi).toBeGreaterThan(b1.hi);
    expect(b10.lo).toBeLessThan(b1.lo);
    expect(b1.lo).toBeLessThan(1);
    expect(b1.hi).toBeGreaterThan(1);
  });

  it('l’indice cumulato parte da 1 e cresce in modo composto', () => {
    const headline = constantGrowthSeries('headline', 0.02, 30);
    const cat = constantGrowthSeries('food', 0.02, 30);
    const m = { ...estimateCategoryModel(cat, headline), phi: 0, spread: 0, lastRate: 0.02 };
    const path = cumulativeIndex(m, 0.02, 3);
    expect(path[0]!.level).toBe(1);
    expect(path[3]!.level).toBeCloseTo(Math.pow(1.02, 3), 6);
  });

  it('un differenziale piccolo e rumoroso viene ristretto verso zero', () => {
    const headline = constantGrowthSeries('headline', 0.02, 30);
    // Categoria che oscilla forte attorno all'indice generale, con media
    // leggermente diversa: e' rumore, non struttura.
    const obs = headline.obs.map((o, i) => ({
      t: o.t,
      v: o.v * (1 + 0.05 * Math.sin(i / 3)),
    }));
    const noisy: IndexSeries = { ...headline, category: 'food', obs };
    const m = estimateCategoryModel(noisy, headline);
    expect(Math.abs(m.spread)).toBeLessThan(0.01);
  });
});

// ---------------------------------------------------------------------------
// Affitto e imposte
// ---------------------------------------------------------------------------

describe('rent', () => {
  const marketIndex = Array.from({ length: 21 }, (_, h) => Math.pow(1.03, h));
  const foiRates = Array.from({ length: 21 }, () => 0.02);
  const condoIndex = Array.from({ length: 21 }, () => 1);

  it('applica al massimo il 75% della variazione FOI', () => {
    const sched = buildRentSchedule({
      housing: { ...baseHousing },
      initialMonthlyRent: 1000,
      baseYear: 2026,
      horizon: 1,
      marketIndex,
      foiRates,
      condoIndex,
    });
    // 2% di FOI -> 1.5% di aumento del canone.
    const expected = 1000 * (1 + ISTAT_INDEXATION_CAP * 0.02);
    expect(sched[1]!.monthlyRent).toBeCloseTo(expected, 6);
  });

  it('con la cedolare secca il canone resta fermo per tutto il contratto', () => {
    const sched = buildRentSchedule({
      housing: { ...baseHousing, cedolareSecca: true },
      initialMonthlyRent: 1000,
      baseYear: 2026,
      horizon: 5, // dentro il ciclo 4+4, prima del rinnovo
      marketIndex,
      foiRates,
      condoIndex,
    });
    for (const y of sched) {
      expect(y.monthlyRent).toBeCloseTo(1000, 6);
      expect(y.registrationTax).toBe(0);
      expect(y.stampDuty).toBe(0);
    }
  });

  it('senza indicizzazione il canone nominale non cambia', () => {
    const sched = buildRentSchedule({
      housing: { ...baseHousing, istatIndexation: false },
      initialMonthlyRent: 900,
      baseYear: 2026,
      horizon: 4, // dentro il primo ciclo: nessun riallineamento di mercato
      marketIndex,
      foiRates,
      condoIndex,
    });
    expect(sched[4]!.monthlyRent).toBeCloseTo(900, 6);
  });

  it('a fine contratto 4+4 il canone si riallinea al mercato', () => {
    const sched = buildRentSchedule({
      housing: { ...baseHousing },
      initialMonthlyRent: 1000,
      baseYear: 2026,
      horizon: 10,
      marketIndex,
      foiRates,
      condoIndex,
    });
    // Il ciclo 4+4 dura 8 anni: il salto avviene all'ottavo.
    const jump = sched[8]!;
    expect(jump.monthlyRent).toBeCloseTo(1000 * Math.pow(1.03, 8), 6);
    expect(jump.events.some((e) => e.kind === 'market_reset')).toBe(true);
    // Prima del riallineamento il canone e' sotto mercato, perche' cresce
    // solo del 75% del FOI.
    expect(sched[7]!.vsMarket).toBeLessThan(0);
  });

  it('il canone indicizzato resta sotto il mercato durante il contratto', () => {
    const sched = buildRentSchedule({
      housing: { ...baseHousing },
      initialMonthlyRent: 1000,
      baseYear: 2026,
      horizon: 6,
      marketIndex,
      foiRates,
      condoIndex,
    });
    expect(sched[6]!.monthlyRent).toBeLessThan(1000 * Math.pow(1.03, 6));
    expect(sched[6]!.monthlyRent).toBeGreaterThan(1000);
  });

  it('rispetta il minimo di legge dell’imposta di registro', () => {
    const { registrationTax } = registrationCosts({
      housing: { ...baseHousing, registrationTaxShare: 1 },
      annualRent: 1200, // il 2% sarebbe 24 euro, sotto il minimo
      isFirstYear: true,
      isRenewalYear: false,
    });
    expect(registrationTax).toBeCloseTo(REGISTRATION_TAX_MIN, 6);
  });

  it('riduce del 30% la base imponibile per il concordato in comune ad alta tensione', () => {
    const args = {
      annualRent: 12_000,
      isFirstYear: true,
      isRenewalYear: false,
    };
    const normale = registrationCosts({
      housing: { ...baseHousing, contractType: 'concordato_3_2', registrationTaxShare: 1 },
      ...args,
    });
    const agevolato = registrationCosts({
      housing: {
        ...baseHousing,
        contractType: 'concordato_3_2',
        highTensionMunicipality: true,
        registrationTaxShare: 1,
      },
      ...args,
    });
    expect(agevolato.registrationTax).toBeCloseTo(normale.registrationTax * 0.7, 6);
  });

  it('divide l’imposta di registro secondo la quota configurata', () => {
    const meta = registrationCosts({
      housing: { ...baseHousing, registrationTaxShare: 0.5 },
      annualRent: 12_000,
      isFirstYear: true,
      isRenewalYear: false,
    });
    expect(meta.registrationTax).toBeCloseTo(12_000 * 0.02 * 0.5, 6);
  });

  it('per la casa di proprieta’ non calcola canone ne’ imposte', () => {
    const sched = buildRentSchedule({
      housing: { ...baseHousing, contractType: 'proprieta', condoFees: 100 },
      initialMonthlyRent: 0,
      baseYear: 2026,
      horizon: 3,
      marketIndex,
      foiRates,
      condoIndex,
    });
    expect(sched[3]!.annualRent).toBe(0);
    expect(sched[3]!.registrationTax).toBe(0);
    expect(sched[3]!.total).toBeCloseTo(1200, 6);
  });

  it('il blocco della cedolare secca non dura oltre il contratto', () => {
    // Il canone e' bloccato per quel contratto, non in perpetuo: alla
    // scadenza del ciclo 4+4 si rinegozia comunque al mercato.
    const sched = buildRentSchedule({
      housing: { ...baseHousing, cedolareSecca: true },
      initialMonthlyRent: 1000,
      baseYear: 2026,
      horizon: 10,
      marketIndex,
      foiRates,
      condoIndex,
    });
    expect(sched[7]!.monthlyRent).toBeCloseTo(1000, 6);
    expect(sched[8]!.monthlyRent).toBeCloseTo(1000 * Math.pow(1.03, 8), 6);
    expect(sched[8]!.events.some((e) => e.kind === 'market_reset')).toBe(true);
  });

  it('indicizza le spese condominiali invece di tenerle ferme', () => {
    const growing = Array.from({ length: 21 }, (_, h) => Math.pow(1.02, h));
    const sched = buildRentSchedule({
      housing: { ...baseHousing, condoFees: 100 },
      initialMonthlyRent: 1000,
      baseYear: 2026,
      horizon: 10,
      marketIndex,
      foiRates,
      condoIndex: growing,
    });
    expect(sched[0]!.condoFees).toBeCloseTo(1200, 6);
    expect(sched[10]!.condoFees).toBeCloseTo(1200 * Math.pow(1.02, 10), 6);
  });

  it('conosce la durata dei contratti tipici', () => {
    expect(contractTerm('libero_4_4')).toEqual({ first: 4, renewal: 4 });
    expect(contractTerm('concordato_3_2')).toEqual({ first: 3, renewal: 2 });
  });
});

// ---------------------------------------------------------------------------
// Proiezione completa
// ---------------------------------------------------------------------------

describe('project', () => {
  it('l’attribuzione somma esattamente alla spesa proiettata', () => {
    const res = project(makeProfile(), makeSnapshot());
    for (const y of res.years) {
      for (const c of y.categories) {
        const a = c.attribution;
        const sum =
          a.base +
          a.fromAnchor +
          a.fromSpread +
          a.fromPersistence +
          a.fromRealGrowth +
          a.fromContract;
        expect(sum).toBeCloseTo(c.nominal, 6);
      }
    }
  });

  it('il totale annuo e’ la somma delle categorie', () => {
    const res = project(makeProfile(), makeSnapshot());
    for (const y of res.years) {
      const sum = y.categories.reduce((a, c) => a + c.nominal, 0);
      expect(sum).toBeCloseTo(y.totalNominal, 6);
    }
  });

  it('anno base senza crescita: reale e nominale coincidono', () => {
    const res = project(makeProfile(), makeSnapshot());
    const y0 = res.years[0]!;
    expect(y0.priceLevel).toBe(1);
    expect(y0.totalReal).toBeCloseTo(y0.totalNominal, 6);
  });

  it('con inflazione positiva il valore reale cresce meno del nominale', () => {
    const res = project(makeProfile(), makeSnapshot());
    const last = res.years[res.years.length - 1]!;
    expect(last.totalNominal).toBeGreaterThan(last.totalReal);
  });

  it('un’ancora piu’ alta produce una spesa nominale maggiore', () => {
    const snap = makeSnapshot();
    const low = project(makeProfile(), snap, {
      baseYear: 2026,
      horizon: 10,
      anchorOverride: 0.01,
      confidence: 0.8,
    });
    const high = project(makeProfile(), snap, {
      baseYear: 2026,
      horizon: 10,
      anchorOverride: 0.05,
      confidence: 0.8,
    });
    const lowLast = low.years[low.years.length - 1]!.totalNominal;
    const highLast = high.years[high.years.length - 1]!.totalNominal;
    expect(highLast).toBeGreaterThan(lowLast);
  });

  it('la cedolare secca riduce la spesa abitativa complessiva', () => {
    const snap = makeSnapshot();
    const conIndicizzazione = project(makeProfile(), snap);
    const conCedolare = project(
      makeProfile({ housing: { ...baseHousing, cedolareSecca: true } }),
      snap,
    );
    const a = conIndicizzazione.years.reduce((s, y) => s + y.totalNominal, 0);
    const b = conCedolare.years.reduce((s, y) => s + y.totalNominal, 0);
    expect(b).toBeLessThan(a);
  });

  it('con reddito indicizzato il risparmio reale non si deteriora', () => {
    const res = project(
      makeProfile({
        income: {
          monthlyNet: 3000,
          monthsPerYear: 12,
          inflationPassThrough: 1,
          realGrowth: 0,
        },
      }),
      makeSnapshot(),
    );
    const first = res.years[0]!;
    const last = res.years[res.years.length - 1]!;
    expect(last.incomeNominal).toBeGreaterThan(first.incomeNominal);
  });

  it('segnala quando manca la serie di una categoria', () => {
    const snap = makeSnapshot({
      series: { headline: constantGrowthSeries('headline', 0.02, 30) },
    });
    const res = project(makeProfile(), snap);
    expect(res.warnings.length).toBeGreaterThan(0);
    expect(res.warnings.join(' ')).toMatch(/affitti|indice generale/i);
  });

  it('le bande di incertezza contengono la stima centrale', () => {
    const res = project(makeProfile(), makeSnapshot());
    for (const y of res.years) {
      expect(y.totalLo).toBeLessThanOrEqual(y.totalNominal + 1e-6);
      expect(y.totalHi).toBeGreaterThanOrEqual(y.totalNominal - 1e-6);
    }
  });

  it('stima il canone dal costo al metro quadro se non specificato', () => {
    const snap = makeSnapshot({
      cities: [
        {
          istatCode: '015146',
          comune: 'Milano',
          provincia: 'Milano',
          sigla: 'MI',
          regione: 'Lombardia',
          population: 1_400_000,
          eurM2Month: { centro: 27, semicentro: 19, periferia: 14 },
          vintage: '2025-S2',
          source: 'curated',
        },
      ],
    });
    const res = project(
      makeProfile({
        housing: { ...baseHousing, monthlyRent: null, sqm: 60, zone: 'semicentro' },
      }),
      snap,
    );
    const rent = res.years[0]!.categories.find((c) => c.category === 'rent');
    // 60 m2 * 19 EUR/m2 = 1140 al mese, piu' l'imposta di registro.
    expect(rent!.nominal).toBeGreaterThan(1140 * 12);
    expect(rent!.nominal).toBeLessThan(1140 * 12 * 1.1);
  });
});
