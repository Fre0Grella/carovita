import { describe, expect, it } from 'vitest';

import { deficit, surplus } from '../src/ui/format.js';
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

describe('avanzo e disavanzo', () => {
  it('un saldo positivo e’ un avanzo, e non c’e’ disavanzo', () => {
    expect(surplus(600)).toBe(600);
    expect(deficit(600)).toBeNull();
  });

  it('un saldo negativo e’ un disavanzo positivo, e l’avanzo sparisce', () => {
    expect(deficit(-50)).toBe(50);
    expect(surplus(-50)).toBeNull();
  });

  it('il pareggio si mostra come avanzo nullo, non come disavanzo', () => {
    expect(surplus(0)).toBe(0);
    expect(surplus(-0.3)).toBe(0);
    expect(deficit(-0.3)).toBeNull();
  });
});
