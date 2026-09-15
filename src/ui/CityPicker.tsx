/**
 * Selettore del comune.
 *
 * Copre tutti i 7.904 comuni italiani. L'elenco pesa qualche megabyte, quindi
 * viene scaricato alla prima interazione e non all'avvio: chi non tocca il
 * selettore non lo paga mai.
 *
 * La ricerca ordina per popolazione a parità di pertinenza, perché chi scrive
 * "san" cerca quasi sempre un comune grande, non il primo in ordine
 * alfabetico fra le centinaia che iniziano così.
 */

import { useEffect, useMemo, useRef, useState } from 'react';

import { loadCities } from '../data/load.js';
import type { CityRentQuote } from '../core/types.js';
import { num } from './format.js';

interface Props {
  value: string;
  onChange: (city: CityRentQuote) => void;
}

/** Normalizza per la ricerca: minuscole e senza accenti. */
function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

export function CityPicker({ value, onChange }: Props): JSX.Element {
  const [cities, setCities] = useState<CityRentQuote[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(
    () => cities?.find((c) => c.istatCode === value) ?? null,
    [cities, value],
  );

  // Carica l'elenco alla prima apertura del selettore.
  useEffect(() => {
    if (!open || cities || loading) return;
    setLoading(true);
    loadCities()
      .then(setCities)
      .catch(() =>
        setError('Non riesco a caricare l’elenco dei comuni.'),
      )
      .finally(() => setLoading(false));
  }, [open, cities, loading]);

  // Carica anche senza apertura, per poter mostrare il nome del comune
  // attualmente selezionato.
  useEffect(() => {
    if (cities || loading) return;
    setLoading(true);
    loadCities()
      .then(setCities)
      .catch(() => setError('Non riesco a caricare l’elenco dei comuni.'))
      .finally(() => setLoading(false));
    // Solo al montaggio.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function onClickAway(e: MouseEvent): void {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickAway);
    return () => document.removeEventListener('mousedown', onClickAway);
  }, []);

  const results = useMemo(() => {
    if (!cities) return [];
    const q = fold(query.trim());
    if (q.length === 0) {
      return [...cities].sort((a, b) => b.population - a.population).slice(0, 40);
    }
    const scored: { c: CityRentQuote; score: number }[] = [];
    for (const c of cities) {
      const name = fold(c.comune);
      let score: number;
      if (name === q) score = 0;
      else if (name.startsWith(q)) score = 1;
      else if (name.includes(q)) score = 2;
      else if (fold(c.sigla) === q || fold(c.provincia).startsWith(q)) score = 3;
      else continue;
      scored.push({ c, score });
    }
    scored.sort(
      (a, b) => a.score - b.score || b.c.population - a.c.population,
    );
    return scored.slice(0, 40).map((s) => s.c);
  }, [cities, query]);

  return (
    <div className="field" ref={boxRef} style={{ position: 'relative' }}>
      <label htmlFor="city-search">Comune di residenza</label>
      <input
        id="city-search"
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls="city-listbox"
        autoComplete="off"
        placeholder={
          selected ? `${selected.comune} (${selected.sigla})` : 'Cerca un comune…'
        }
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
      />
      {error && <span className="hint">{error}</span>}
      {!error && selected && !open && (
        <span className="hint">
          {selected.provincia}, {selected.regione} · {num(selected.population)}{' '}
          abitanti
        </span>
      )}

      {open && (
        <div
          id="city-listbox"
          role="listbox"
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 30,
            maxHeight: 280,
            overflowY: 'auto',
            background: 'var(--surface-1)',
            border: '1px solid var(--border-strong)',
            borderRadius: 6,
            marginTop: 2,
            boxShadow: '0 4px 16px rgb(0 0 0 / 0.15)',
          }}
        >
          {loading && <div style={{ padding: 10 }}>Carico i comuni…</div>}
          {!loading && results.length === 0 && (
            <div style={{ padding: 10 }} className="muted">
              Nessun comune trovato.
            </div>
          )}
          {results.map((c) => (
            <button
              key={c.istatCode}
              role="option"
              aria-selected={c.istatCode === value}
              type="button"
              onClick={() => {
                onChange(c);
                setQuery('');
                setOpen(false);
              }}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '7px 10px',
                border: 0,
                borderBottom: '1px solid var(--border)',
                background:
                  c.istatCode === value ? 'var(--surface-2)' : 'transparent',
                color: 'var(--text-primary)',
                font: 'inherit',
                cursor: 'pointer',
              }}
            >
              <strong>{c.comune}</strong>{' '}
              <span className="muted small">
                ({c.sigla}) · {c.eurM2Month.centro.toLocaleString('it-IT')}–
                {c.eurM2Month.periferia.toLocaleString('it-IT')} €/m²
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
