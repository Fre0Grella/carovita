/**
 * Genera `src/data/cities.json`: l'elenco completo dei comuni italiani con
 * una stima del canone di locazione al metro quadro.
 *
 * Unisce l'anagrafica ufficiale dei comuni (codice ISTAT, provincia, regione,
 * popolazione) con la baseline dei canoni. I comuni senza quotazione propria
 * ereditano quella del capoluogo di provincia, ridotta in base alla
 * popolazione, e vengono marcati `derived`: la UI lo segnala all'utente.
 *
 * Eseguire con `npx tsx scripts/build-cities.ts`.
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  BASELINE_NOTE,
  BASELINE_VINTAGE,
  RENT_BASELINE,
  populationFactor,
} from './rent-baseline.js';
import type { CityRentQuote } from '../src/core/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '../src/data/cities.json');

/**
 * Anagrafica dei comuni italiani. Dataset pubblico derivato dall'elenco
 * ufficiale ISTAT dei codici dei comuni.
 */
const COMUNI_URL =
  'https://raw.githubusercontent.com/matteocontrini/comuni-json/master/comuni.json';

interface Comune {
  nome: string;
  codice: string;
  regione: { nome: string };
  provincia: { nome: string };
  sigla: string;
  popolazione: number;
}

async function main(): Promise<void> {
  console.log(`Scarico l'anagrafica dei comuni da ${COMUNI_URL}`);
  const res = await fetch(COMUNI_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status} scaricando i comuni`);
  const comuni = (await res.json()) as Comune[];
  console.log(`  ${comuni.length} comuni`);

  const baselineByCode = new Map(RENT_BASELINE.map((r) => [r.code, r]));

  // Capoluogo di riferimento per ciascuna provincia: si usa il comune della
  // baseline con la popolazione maggiore in quella provincia.
  const refByProvincia = new Map<string, { row: (typeof RENT_BASELINE)[0]; pop: number }>();
  for (const c of comuni) {
    const row = baselineByCode.get(c.codice);
    if (!row) continue;
    const cur = refByProvincia.get(c.sigla);
    if (!cur || c.popolazione > cur.pop) {
      refByProvincia.set(c.sigla, { row, pop: c.popolazione });
    }
  }

  // Fallback regionale per le province senza alcun comune in baseline.
  const refByRegione = new Map<string, (typeof RENT_BASELINE)[0]>();
  for (const c of comuni) {
    const row = baselineByCode.get(c.codice);
    if (row && !refByRegione.has(c.regione.nome)) {
      refByRegione.set(c.regione.nome, row);
    }
  }

  const out: CityRentQuote[] = [];
  let exact = 0;
  let derived = 0;
  const missingProvinces = new Set<string>();

  for (const c of comuni) {
    const own = baselineByCode.get(c.codice);
    if (own) {
      out.push({
        istatCode: c.codice,
        comune: c.nome,
        provincia: c.provincia.nome,
        sigla: c.sigla,
        regione: c.regione.nome,
        population: c.popolazione,
        eurM2Month: {
          centro: own.q[0],
          semicentro: own.q[1],
          periferia: own.q[2],
        },
        vintage: BASELINE_VINTAGE,
        source: 'curated',
        note: BASELINE_NOTE,
      });
      exact++;
      continue;
    }

    const ref = refByProvincia.get(c.sigla)?.row ?? refByRegione.get(c.regione.nome);
    if (!ref) {
      missingProvinces.add(`${c.sigla} (${c.regione.nome})`);
      continue;
    }
    const f = populationFactor(c.popolazione);
    out.push({
      istatCode: c.codice,
      comune: c.nome,
      provincia: c.provincia.nome,
      sigla: c.sigla,
      regione: c.regione.nome,
      population: c.popolazione,
      eurM2Month: {
        centro: round1(ref.q[0] * f),
        semicentro: round1(ref.q[1] * f),
        periferia: round1(ref.q[2] * f),
      },
      vintage: BASELINE_VINTAGE,
      source: 'derived',
      note:
        `Stima ricavata da ${ref.name} applicando un fattore ${f.toFixed(2)} ` +
        `legato alla popolazione. Inserisci il tuo canone reale per un ` +
        `risultato accurato.`,
    });
    derived++;
  }

  out.sort((a, b) => b.population - a.population);

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(out), 'utf8');

  console.log(
    `Scritto ${OUT}: ${out.length} comuni ` +
      `(${exact} da baseline, ${derived} stimati).`,
  );
  if (missingProvinces.size > 0) {
    console.warn(
      `Province senza riferimento, comuni esclusi: ` +
        `${[...missingProvinces].join(', ')}`,
    );
  }
}

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

main().catch((err) => {
  console.error('build-cities fallito:', err);
  process.exit(1);
});
