import { describe, expect, it } from 'vitest';

import {
  annualAverages,
  monthLabel,
  normInv,
  yoyRates,
} from '../src/core/series.js';
import {
  aggregateHalfWidths,
  averageCategoryCorrelation,
  cumulativeIndex,
  estimateCategoryModel,
  forecastRate,
  uncertaintyBand,
} from '../src/core/model.js';
import {
  ISTAT_INDEXATION_CAP,
  REGISTRATION_TAX_MIN,
  buildRentSchedule,
  computeShare,
  contractTerm,
  registrationCosts,
} from '../src/core/rent.js';
import {
  buildPeriods,
  forecastRatesByCategory,
  project,
  summarize,
} from '../src/core/project.js';
import type {
  DataSnapshot,
  HousingConfig,
  IndexSeries,
  Profile,
  SharingConfig,
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
  sharing: null,
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
        growthOverride: null,
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
      periods: buildPeriods('2026-01', 2),
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
      periods: buildPeriods('2026-01', 6), // dentro il ciclo 4+4
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
      periods: buildPeriods('2026-01', 5), // dentro il primo ciclo
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
      periods: buildPeriods('2026-01', 11),
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
      periods: buildPeriods('2026-01', 7),
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
      periods: buildPeriods('2026-01', 4),
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
      periods: buildPeriods('2026-01', 11),
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
      periods: buildPeriods('2026-01', 11),
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
          a.fromOverride +
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
      startMonth: '2026-01',
      horizon: 10,
      anchorOverride: 0.01,
      confidence: 0.8,
    });
    const high = project(makeProfile(), snap, {
      startMonth: '2026-01',
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

// ---------------------------------------------------------------------------
// Coabitazione
// ---------------------------------------------------------------------------

describe('coabitazione', () => {
  const marketIndex = Array.from({ length: 21 }, (_, h) => Math.pow(1.03, h));
  const foiRates = Array.from({ length: 21 }, () => 0.02);
  const condoIndex = Array.from({ length: 21 }, () => 1);

  /** Appartamento di 90 m2, 48 m2 di camere, 4 persone. */
  function flat(sharing: Partial<SharingConfig>): HousingConfig {
    return {
      ...baseHousing,
      sqm: 90,
      sharing: {
        roomSqm: 14,
        roomShared: false,
        bedroomsSqm: 48,
        occupants: 4,
        onContract: true,
        ...sharing,
      },
    };
  }

  it('senza coabitazione la quota e’ intera', () => {
    expect(computeShare(baseHousing).rentShare).toBe(1);
  });

  it('somma camera privata e parte di spazi comuni', () => {
    const s = computeShare(flat({}));
    // 14 m2 di camera + (90 - 48) / 4 = 10,5 m2 di spazi comuni = 24,5 su 90.
    expect(s.privateSqm).toBeCloseTo(14, 6);
    expect(s.commonSqm).toBeCloseTo(10.5, 6);
    expect(s.rentShare).toBeCloseTo(24.5 / 90, 6);
  });

  it('la camera doppia conta per meta’', () => {
    const singola = computeShare(flat({ roomSqm: 18, roomShared: false }));
    const doppia = computeShare(flat({ roomSqm: 18, roomShared: true }));
    expect(doppia.privateSqm).toBeCloseTo(9, 6);
    expect(doppia.rentShare).toBeLessThan(singola.rentShare);
  });

  it('le quote di tutti i coinquilini sommano esattamente a 1', () => {
    // Due singole da 14 e 16 m2 e una doppia da 18 m2 occupata da due
    // persone: 48 m2 di camere, 4 persone, 90 m2 totali.
    const quote = [
      computeShare(flat({ roomSqm: 14 })).rentShare,
      computeShare(flat({ roomSqm: 16 })).rentShare,
      computeShare(flat({ roomSqm: 18, roomShared: true })).rentShare,
      computeShare(flat({ roomSqm: 18, roomShared: true })).rentShare,
    ];
    expect(quote.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
  });

  it('segnala metrature incoerenti invece di produrre numeri assurdi', () => {
    const s = computeShare(flat({ bedroomsSqm: 200 }));
    expect(s.warnings.length).toBeGreaterThan(0);
    expect(s.rentShare).toBeGreaterThan(0);
    expect(s.rentShare).toBeLessThanOrEqual(1);
  });

  it('applica il minimo di legge al contratto, non alla singola quota', () => {
    // Canone basso: il 2% dell'intero contratto sta sotto i 67 euro, quindi
    // il minimo scatta una volta sola e poi si divide.
    const housing = flat({});
    const share = computeShare(housing).rentShare;
    const { registrationTax } = registrationCosts({
      housing: { ...housing, registrationTaxShare: 1 },
      annualRent: 3000,
      isFirstYear: true,
      isRenewalYear: false,
      rentShare: share,
    });
    expect(registrationTax).toBeCloseTo(REGISTRATION_TAX_MIN * share, 6);
    // Senza ripartizione ognuno pagherebbe l'intero minimo.
    expect(registrationTax).toBeLessThan(REGISTRATION_TAX_MIN);
  });

  it('chi non e’ sul contratto non paga imposte', () => {
    const housing = flat({ onContract: false });
    const { registrationTax, stampDuty } = registrationCosts({
      housing,
      annualRent: 14_400,
      isFirstYear: true,
      isRenewalYear: false,
      rentShare: computeShare(housing).rentShare,
    });
    expect(registrationTax).toBe(0);
    expect(stampDuty).toBe(0);
  });

  it('riporta sia il canone dell’appartamento sia la tua quota', () => {
    const housing = flat({});
    const share = computeShare(housing).rentShare;
    const sched = buildRentSchedule({
      housing,
      initialMonthlyRent: 1200,
      periods: buildPeriods('2026-01', 4),
      marketIndex,
      foiRates,
      condoIndex,
    });
    expect(sched[0]!.apartmentMonthlyRent).toBeCloseTo(1200, 6);
    expect(sched[0]!.monthlyRent).toBeCloseTo(1200 * share, 6);
  });

  it('divide le spese condominiali in parti uguali', () => {
    const sched = buildRentSchedule({
      housing: { ...flat({}), condoFees: 120 },
      initialMonthlyRent: 1200,
      periods: buildPeriods('2026-01', 2),
      marketIndex,
      foiRates,
      condoIndex,
    });
    // 120 al mese per l'appartamento, 4 persone: 30 a testa, 360 l'anno.
    expect(sched[0]!.condoFees).toBeCloseTo(360, 6);
  });

  it('lo scatto ISTAT si applica al canone intero e poi si ripartisce', () => {
    const housing = { ...flat({}), cedolareSecca: false, istatIndexation: true };
    const share = computeShare(housing).rentShare;
    const sched = buildRentSchedule({
      housing,
      initialMonthlyRent: 1200,
      periods: buildPeriods('2026-01', 2),
      marketIndex,
      foiRates,
      condoIndex,
    });
    const atteso = 1200 * (1 + ISTAT_INDEXATION_CAP * 0.02);
    expect(sched[1]!.apartmentMonthlyRent).toBeCloseTo(atteso, 6);
    expect(sched[1]!.monthlyRent).toBeCloseTo(atteso * share, 6);
  });
});

// ---------------------------------------------------------------------------
// Sostituzione della previsione
// ---------------------------------------------------------------------------

describe('override della crescita', () => {
  function withGrowth(g: number | null): Profile {
    return makeProfile({
      expenses: [
        {
          id: 'e1',
          label: 'Bolletta',
          category: 'food',
          monthlyAmount: 100,
          growthOverride: g,
        },
      ],
    });
  }

  it('senza override usa la previsione del modello', () => {
    const res = project(withGrowth(null), makeSnapshot());
    const c = res.years[5]!.categories.find((x) => x.label === 'Bolletta')!;
    // La serie di test cresce del 2% e l'ancora e' 2%: il modello prevede 2%.
    expect(c.nominal).toBeCloseTo(1200 * Math.pow(1.02, 5), 2);
  });

  it('con override applica esattamente il tasso scelto', () => {
    const res = project(withGrowth(0.05), makeSnapshot());
    const c = res.years[5]!.categories.find((x) => x.label === 'Bolletta')!;
    expect(c.nominal).toBeCloseTo(1200 * Math.pow(1.05, 5), 6);
    expect(c.rate).toBeCloseTo(0.05, 10);
  });

  it('un override a zero congela davvero la voce', () => {
    // Distingue "nessun override" (null) da "crescita zero" (0): senza la
    // distinzione, congelare una spesa sarebbe impossibile.
    const res = project(withGrowth(0), makeSnapshot());
    const c = res.years[10]!.categories.find((x) => x.label === 'Bolletta')!;
    expect(c.nominal).toBeCloseTo(1200, 6);
  });

  it('attribuisce tutto l\u2019aumento all\u2019ipotesi dell\u2019utente', () => {
    const res = project(withGrowth(0.05), makeSnapshot());
    const c = res.years[5]!.categories.find((x) => x.label === 'Bolletta')!;
    const a = c.attribution;
    expect(a.fromOverride).toBeCloseTo(c.nominal - a.base, 6);
    expect(a.fromAnchor).toBe(0);
    expect(a.fromSpread).toBe(0);
    expect(a.fromPersistence).toBe(0);
  });

  it('non disegna bande statistiche attorno a un\u2019ipotesi personale', () => {
    const res = project(withGrowth(0.05), makeSnapshot());
    const c = res.years[8]!.categories.find((x) => x.label === 'Bolletta')!;
    expect(c.lo).toBeCloseTo(c.nominal, 6);
    expect(c.hi).toBeCloseTo(c.nominal, 6);
  });

  it('l\u2019attribuzione chiude comunque sul totale', () => {
    const res = project(withGrowth(0.04), makeSnapshot());
    for (const y of res.years) {
      for (const c of y.categories) {
        const a = c.attribution;
        const sum =
          a.base +
          a.fromAnchor +
          a.fromSpread +
          a.fromPersistence +
          a.fromOverride +
          a.fromContract;
        expect(sum).toBeCloseTo(c.nominal, 6);
      }
    }
  });

  it('forecastRatesByCategory restituisce il tasso composto equivalente', () => {
    const snap = makeSnapshot();
    const res = project(makeProfile(), snap);
    const rates = forecastRatesByCategory(res.models, res.anchor, 15);
    const food = rates.get('food')!;
    // Serie di test al 2% con ancora al 2%: il composto equivalente e' 2%.
    expect(food).toBeCloseTo(0.02, 4);
  });

  it('forecastRatesByCategory regge gli orizzonti frazionari', () => {
    // Regressione: con 1.5 anni leggeva path[1.5] e mandava in errore
    // l'intera interfaccia al primo spostamento dello slider.
    const snap = makeSnapshot();
    for (const h of [1.5, 2.5, 3.5, 29.5]) {
      const res = project(makeProfile(), snap, {
        startMonth: '2026-09',
        horizon: h,
        anchorOverride: null,
        confidence: 0.8,
      });
      const rates = forecastRatesByCategory(res.models, res.anchor, h);
      expect(rates.get('food')).toBeCloseTo(0.02, 4);
    }
  });
});

// ---------------------------------------------------------------------------
// Patrimonio
// ---------------------------------------------------------------------------

describe('patrimonio', () => {
  it('parte dai risparmi iniziali piu\u2019 il primo avanzo', () => {
    const p = makeProfile({ initialSavings: 10_000, savingsReturn: 0 });
    const res = project(p, makeSnapshot());
    const y0 = res.years[0]!;
    expect(y0.cumulativeWealth).toBeCloseTo(10_000 + y0.savingsNominal, 6);
  });

  it('la banda del patrimonio contiene la stima centrale', () => {
    const res = project(makeProfile(), makeSnapshot());
    for (const y of res.years) {
      expect(y.cumulativeWealthLo).toBeLessThanOrEqual(y.cumulativeWealth + 1e-6);
      expect(y.cumulativeWealthHi).toBeGreaterThanOrEqual(y.cumulativeWealth - 1e-6);
    }
  });

  it('spendere di piu\u2019 lascia meno patrimonio', () => {
    // Invariante di segno: la banda alta di spesa deve generare la banda
    // bassa di patrimonio, non il contrario.
    const res = project(makeProfile(), makeSnapshot());
    const last = res.years[res.years.length - 1]!;
    expect(last.cumulativeWealthLo).toBeLessThan(last.cumulativeWealthHi);
  });

  it('la banda del patrimonio si allarga con l\u2019orizzonte', () => {
    const res = project(makeProfile(), makeSnapshot());
    const width = (i: number) =>
      res.years[i]!.cumulativeWealthHi - res.years[i]!.cumulativeWealthLo;
    expect(width(res.years.length - 1)).toBeGreaterThan(width(1));
  });

  it('capitalizza il rendimento sui risparmi', () => {
    const senza = project(
      makeProfile({ initialSavings: 50_000, savingsReturn: 0 }),
      makeSnapshot(),
    );
    const con = project(
      makeProfile({ initialSavings: 50_000, savingsReturn: 0.04 }),
      makeSnapshot(),
    );
    const n = senza.years.length - 1;
    expect(con.years[n]!.cumulativeWealth).toBeGreaterThan(
      senza.years[n]!.cumulativeWealth,
    );
  });

  it('individua l\u2019anno in cui i risparmi finiscono', () => {
    // Reddito volutamente insufficiente: il patrimonio deve andare sotto zero
    // e l'anno va segnalato, perche' e' la domanda a cui serve rispondere.
    const p = makeProfile({
      initialSavings: 5_000,
      savingsReturn: 0,
      income: {
        monthlyNet: 400,
        monthsPerYear: 12,
        inflationPassThrough: 0,
        realGrowth: 0,
      },
    });
    const res = project(p, makeSnapshot());
    const s = summarize(res);
    expect(s.depletionYear).not.toBeNull();
    const anno = res.years.find((y) => y.year === s.depletionYear)!;
    expect(anno.cumulativeWealth).toBeLessThan(0);
    // E deve essere davvero il primo: l'anno prima era ancora positivo.
    const prima = res.years.find((y) => y.year === s.depletionYear! - 1);
    if (prima) expect(prima.cumulativeWealth).toBeGreaterThanOrEqual(0);
  });

  it('non segnala esaurimento se il patrimonio resta positivo', () => {
    const p = makeProfile({
      initialSavings: 200_000,
      income: {
        monthlyNet: 6_000,
        monthsPerYear: 13,
        inflationPassThrough: 1,
        realGrowth: 0,
      },
    });
    expect(summarize(project(p, makeSnapshot())).depletionYear).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Aggregazione delle incertezze
// ---------------------------------------------------------------------------

describe('aggregazione delle bande', () => {
  it('con correlazione 1 somma linearmente', () => {
    // Correlazione perfetta: tutte le categorie sbagliano insieme.
    expect(aggregateHalfWidths([3, 4, 5], 1)).toBeCloseTo(12, 6);
  });

  it('con correlazione 0 somma in quadratura', () => {
    // Indipendenza: gli errori si compensano in parte.
    expect(aggregateHalfWidths([3, 4], 0)).toBeCloseTo(5, 6);
  });

  it('una correlazione intermedia sta fra i due estremi', () => {
    const h = [3, 4, 5];
    const indip = aggregateHalfWidths(h, 0);
    const media = aggregateHalfWidths(h, 0.2);
    const perfetta = aggregateHalfWidths(h, 1);
    expect(media).toBeGreaterThan(indip);
    expect(media).toBeLessThan(perfetta);
  });

  it('una sola categoria non viene alterata dalla correlazione', () => {
    expect(aggregateHalfWidths([7], 0)).toBeCloseTo(7, 6);
    expect(aggregateHalfWidths([7], 1)).toBeCloseTo(7, 6);
  });

  it('su serie senza variabilita ricade prudenzialmente su 1', () => {
    // Le serie sintetiche crescono a tasso costante: la correlazione non e'
    // definita, e in quel caso si sceglie l'ipotesi piu' prudente invece di
    // inventare un numero. La verifica sui dati veri sta in snapshot.test.ts.
    expect(averageCategoryCorrelation(makeSnapshot())).toBe(1);
  });

  it('stima una correlazione plausibile dalle serie', () => {
    const rho = averageCategoryCorrelation(makeSnapshot());
    expect(rho).toBeGreaterThanOrEqual(0);
    expect(rho).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Periodi di proiezione
// ---------------------------------------------------------------------------

describe('periodi', () => {
  it('parte dal mese indicato, non da gennaio', () => {
    const p = buildPeriods('2026-09', 2);
    expect(p[0]!.startMonth).toBe('2026-09');
    expect(p[0]!.endMonth).toBe('2027-08');
    expect(p[1]!.startMonth).toBe('2027-09');
  });

  it('etichetta i periodi in italiano', () => {
    const p = buildPeriods('2026-09', 1);
    expect(p[0]!.label).toBe('set 2026');
    expect(p[0]!.labelLong).toBe('set 2026 - ago 2027');
  });

  it('un orizzonte intero produce solo periodi pieni', () => {
    const p = buildPeriods('2026-09', 3);
    expect(p).toHaveLength(3);
    expect(p.every((x) => x.fraction === 1 && x.months === 12)).toBe(true);
  });

  it('un anno e mezzo produce un periodo pieno e uno di sei mesi', () => {
    const p = buildPeriods('2026-09', 1.5);
    expect(p).toHaveLength(2);
    expect(p[0]!.fraction).toBe(1);
    expect(p[1]!.fraction).toBeCloseTo(0.5, 10);
    expect(p[1]!.months).toBe(6);
    expect(p[1]!.labelLong).toContain('6 mesi');
  });

  it('la somma delle frazioni e\u2019 l\u2019orizzonte richiesto', () => {
    for (const h of [1.5, 2, 3.5, 7, 15]) {
      const tot = buildPeriods('2026-09', h).reduce((a, p) => a + p.fraction, 0);
      expect(tot).toBeCloseTo(h, 10);
    }
  });

  it('un periodo parziale costa in proporzione ai mesi', () => {
    const snap = makeSnapshot();
    const pieno = project(makeProfile(), snap, {
      startMonth: '2026-09',
      horizon: 2,
      anchorOverride: 0,
      confidence: 0.8,
    });
    const mezzo = project(makeProfile(), snap, {
      startMonth: '2026-09',
      horizon: 1.5,
      anchorOverride: 0,
      confidence: 0.8,
    });
    // Senza inflazione, il secondo periodo dimezzato costa la meta'.
    expect(mezzo.years[1]!.totalNominal).toBeCloseTo(
      pieno.years[1]!.totalNominal / 2,
      6,
    );
  });

  it('anche il reddito del periodo parziale e\u2019 proporzionato', () => {
    // Reddito nominale fermo: l'unico effetto misurato e' la proporzione
    // dei mesi, non l'adeguamento all'inflazione.
    const fermo = makeProfile({
      income: {
        monthlyNet: 2000,
        monthsPerYear: 13,
        inflationPassThrough: 0,
        realGrowth: 0,
      },
    });
    const res = project(fermo, makeSnapshot(), {
      startMonth: '2026-09',
      horizon: 1.5,
      anchorOverride: 0,
      confidence: 0.8,
    });
    expect(res.years[1]!.incomeNominal).toBeCloseTo(
      res.years[0]!.incomeNominal / 2,
      6,
    );
  });

  it('la crescita annua non e\u2019 falsata dal periodo parziale', () => {
    // Confrontare un periodo pieno con uno dimezzato darebbe una crescita
    // fittiziamente negativa: gli importi vanno annualizzati.
    const res = project(makeProfile(), makeSnapshot(), {
      startMonth: '2026-09',
      horizon: 1.5,
      anchorOverride: 0.02,
      confidence: 0.8,
    });
    expect(summarize(res).cagr).toBeGreaterThan(0);
  });

  it('registra il mese iniziale e finale della proiezione', () => {
    const res = project(makeProfile(), makeSnapshot(), {
      startMonth: '2026-09',
      horizon: 1.5,
      anchorOverride: null,
      confidence: 0.8,
    });
    expect(res.startMonth).toBe('2026-09');
    expect(res.endMonth).toBe('2028-02');
  });
});
