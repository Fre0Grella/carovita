import { describe, expect, it } from 'vitest';

import { aMese, deficit, fraTempo, surplus } from '../src/ui/format.js';
import { buildTimeline, tickLabel } from '../src/ui/timeline.js';

describe('asse del tempo', () => {
  it('fino a tre anni traccia una linea per ogni mese', () => {
    const tl = buildTimeline('2026-09', 18);
    expect(tl.bucket).toBe(1);
    expect(tl.grid).toHaveLength(19);
    expect(tl.grid[1]! - tl.grid[0]!).toBe(1);
  });

  it('oltre i tre anni traccia una linea ogni sei mesi', () => {
    const tl = buildTimeline('2026-09', 15 * 12);
    expect(tl.bucket).toBe(6);
    expect(tl.grid).toHaveLength(31);
    expect(tl.grid.every((x) => x % 6 === 0)).toBe(true);
  });

  it('nella vista mensile etichetta i trimestri e scrive l’anno a gennaio', () => {
    const tl = buildTimeline('2026-09', 18);
    const labels = tl.grid.map((x) => tickLabel(tl, x)).filter(Boolean);
    expect(labels).toEqual(['ott 2026', 'gen 2027', 'apr', 'lug', 'ott', 'gen 2028']);
  });

  it('marca l’inizio di ogni anno solare', () => {
    const tl = buildTimeline('2026-09', 36);
    // Gennaio 2027, 2028 e 2029 cadono a 4, 16 e 28 mesi dall'inizio.
    expect(tl.yearStarts).toEqual([4, 16, 28]);
  });

  it('su orizzonti lunghi non affolla le etichette', () => {
    for (const years of [4, 10, 20, 30]) {
      const tl = buildTimeline('2026-09', years * 12);
      expect(tl.labelled.size).toBeLessThanOrEqual(8);
      expect(tl.labelled.size).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('risparmi e perdite', () => {
  it('un saldo positivo sono risparmi, e non ci sono perdite', () => {
    expect(surplus(600)).toBe(600);
    expect(deficit(600)).toBeNull();
  });

  it('un saldo negativo e’ una perdita positiva, e i risparmi spariscono', () => {
    expect(deficit(-50)).toBe(50);
    expect(surplus(-50)).toBeNull();
  });

  it('il pareggio si mostra come risparmio nullo, non come perdita', () => {
    expect(surplus(0)).toBe(0);
    expect(surplus(-0.3)).toBe(0);
    expect(deficit(-0.3)).toBeNull();
  });
});

describe('date e durate in italiano', () => {
  it('usa «ad» davanti ai mesi che iniziano per vocale', () => {
    expect(aMese('2041-08')).toBe('ad ago 2041');
    expect(aMese('2031-10')).toBe('ad ott 2031');
    expect(aMese('2028-03')).toBe('a mar 2028');
  });

  it('descrive l’orizzonte come lo direbbe una persona', () => {
    expect(fraTempo(18)).toBe('fra un anno e mezzo');
    expect(fraTempo(180)).toBe('fra 15 anni');
    expect(fraTempo(42)).toBe('fra 3 anni e mezzo');
    expect(fraTempo(12)).toBe('fra un anno');
  });
});
