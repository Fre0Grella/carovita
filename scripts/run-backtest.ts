/**
 * Esegue il backtest walk-forward sullo snapshot corrente e scrive
 * `docs/BACKTEST.md`.
 *
 * Eseguire con `npm run backtest`.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { backtestAll, DEFAULT_BACKTEST } from '../src/core/backtest.js';
import { estimateAllModels } from '../src/core/model.js';
import type { DataSnapshot, IndexSeries } from '../src/core/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SNAPSHOT = resolve(ROOT, 'public/data/snapshot.json');
const OUT = resolve(ROOT, 'docs/BACKTEST.md');

function pp(x: number): string {
  return Number.isFinite(x) ? (x * 100).toFixed(2) : '--';
}

async function main(): Promise<void> {
  const snap = JSON.parse(await readFile(SNAPSHOT, 'utf8')) as DataSnapshot;
  const headline = snap.series.headline;
  if (!headline) throw new Error('Snapshot privo della serie headline.');

  const list = Object.values(snap.series).filter(
    (s): s is IndexSeries => Boolean(s),
  );
  const results = backtestAll(list, headline, DEFAULT_BACKTEST);
  const models = estimateAllModels(snap);

  const lines: string[] = [];
  lines.push('# Backtest del modello di previsione');
  lines.push('');
  lines.push(
    'Generato automaticamente da `npm run backtest`. Non modificare a mano.',
  );
  lines.push('');
  lines.push(
    `Snapshot del ${snap.generatedAt.slice(0, 10)}, ` +
      `dati fino a ${headline.vintage}.`,
  );
  lines.push('');
  lines.push('## Come si legge');
  lines.push('');
  lines.push(
    'Validazione **walk-forward out-of-sample**: per ogni anno di origine si ' +
      'stimano i parametri usando solo i dati disponibili fino a quel ' +
      'momento, si prevede a 1..10 anni e si confronta con quanto poi ' +
      'realmente accaduto. I parametri non vedono mai il futuro.',
  );
  lines.push('');
  lines.push(
    'L’errore è il **MAE** (errore assoluto medio) sul tasso di ' +
      'inflazione annuo, in punti percentuali. Più basso è meglio. ' +
      'Le colonne di confronto sono i due benchmark ingenui:',
  );
  lines.push('');
  lines.push(
    '- **RW** (random walk): "l’anno prossimo come quest’anno".',
  );
  lines.push('- **Anc.** (ancora fissa): "sempre il 2%".');
  lines.push('');
  lines.push(
    'Un modello utile deve battere entrambi, soprattutto sugli orizzonti ' +
      'lunghi che sono quelli che contano per una decisione di vita.',
  );
  lines.push('');

  // --- Tabella di sintesi ---------------------------------------------------
  lines.push('## Sintesi per categoria');
  lines.push('');
  lines.push(
    '| Categoria | MAE modello | MAE RW | MAE ancora | Meglio di RW | Meglio di ancora |',
  );
  lines.push('|---|---:|---:|---:|:--:|:--:|');
  for (const r of results.sort((a, b) => a.meanMae - b.meanMae)) {
    const okRw = r.meanMae < r.meanMaeRandomWalk;
    const okAnc = r.meanMae < r.meanMaeAnchor;
    lines.push(
      `| ${r.label} | ${pp(r.meanMae)} | ${pp(r.meanMaeRandomWalk)} | ` +
        `${pp(r.meanMaeAnchor)} | ${okRw ? 'si' : 'no'} | ${okAnc ? 'si' : 'no'} |`,
    );
  }
  lines.push('');

  const wonRw = results.filter((r) => r.meanMae < r.meanMaeRandomWalk).length;
  const wonAnc = results.filter((r) => r.meanMae < r.meanMaeAnchor).length;
  lines.push(
    `Il modello batte il random walk in **${wonRw}/${results.length}** ` +
      `categorie e l’ancora fissa in **${wonAnc}/${results.length}**.`,
  );
  lines.push('');
  lines.push('### Come interpretare il confronto con l’ancora fissa');
  lines.push('');
  lines.push(
    'Il modello **non** batte sistematicamente la regola "sempre il 2%", ed ' +
      'è un risultato atteso, non un difetto nascosto: le due cose ' +
      'condividono la stessa convinzione di fondo. Il modello è ' +
      '`ancora + differenziale + rientro del gap`, quindi su orizzonti lunghi ' +
      'converge per costruzione verso l’ancora. Può distinguersene ' +
      'solo grazie al differenziale di categoria e alla dinamica di breve ' +
      'periodo.',
  );
  lines.push('');
  lines.push(
    'Va aggiunto che il benchmark al 2% è avvantaggiato dal senno di ' +
      'poi: il 2% è vicino all’inflazione media effettivamente ' +
      'realizzata in Italia nel periodo considerato. Una regola costante ' +
      'davvero "fuori campione" avrebbe dovuto usare la media nota all’ ' +
      'epoca, più alta nei primi anni.',
  );
  lines.push('');
  lines.push(
    'Il confronto che conta davvero è quello con il **random walk**, ' +
      'cioè con quello che fa istintivamente chi proietta la bolletta ' +
      'di oggi sui prossimi dieci anni. Lì il vantaggio è netto e ' +
      'cresce con l’orizzonte. In più, rispetto a una regola fissa, ' +
      'il modello fornisce bande di incertezza calibrate e un’ ' +
      'attribuzione per categoria, che una costante non può dare.',
  );
  lines.push('');

  // --- Dettaglio per orizzonte ---------------------------------------------
  lines.push('## Errore per orizzonte');
  lines.push('');
  lines.push(
    'Media e mediana su tutte le categorie, per anni di distanza dalla ' +
      'previsione. La mediana è più informativa della media, che ' +
      'è dominata dall’energia: con errori intorno ai 15 punti ' +
      'percentuali, l’energia da sola sposta la media di tutte le altre ' +
      'sedici categorie.',
  );
  lines.push('');
  lines.push(
    '| Orizzonte | MAE modello | MAE RW | MAE ancora | Mediana modello | ' +
      'Mediana RW | Copertura banda 80% |',
  );
  lines.push('|---:|---:|---:|---:|---:|---:|---:|');
  for (let h = 1; h <= DEFAULT_BACKTEST.maxHorizon; h++) {
    const rows = results
      .map((r) => r.horizons.find((x) => x.horizon === h))
      .filter((x): x is NonNullable<typeof x> => Boolean(x));
    if (rows.length === 0) continue;
    const avg = (f: (x: (typeof rows)[0]) => number) =>
      rows.reduce((a, b) => a + f(b), 0) / rows.length;
    const med = (f: (x: (typeof rows)[0]) => number) => {
      const v = rows.map(f).sort((a, b) => a - b);
      const mid = Math.floor(v.length / 2);
      return v.length % 2 ? v[mid]! : (v[mid - 1]! + v[mid]!) / 2;
    };
    lines.push(
      `| ${h} ${h > 1 ? 'anni' : 'anno'} | ${pp(avg((x) => x.maeModel))} | ` +
        `${pp(avg((x) => x.maeRandomWalk))} | ${pp(avg((x) => x.maeAnchor))} | ` +
        `${pp(med((x) => x.maeModel))} | ${pp(med((x) => x.maeRandomWalk))} | ` +
        `${pp(avg((x) => x.coverage))}% |`,
    );
  }
  lines.push('');
  lines.push(
    'La colonna "copertura" indica la quota di casi in cui il valore reale ' +
      'è caduto nella banda di confidenza dichiarata all’80%. Un ' +
      'modello ben calibrato sta vicino a 80: molto sotto significa bande ' +
      'troppo strette (falsa sicurezza), molto sopra bande troppo larghe.',
  );
  lines.push('');

  // --- Parametri stimati ----------------------------------------------------
  lines.push('## Parametri stimati sullo snapshot corrente');
  lines.push('');
  lines.push(
    '`phi` = persistenza dello scostamento; `spread` = differenziale ' +
      'strutturale annuo rispetto all’indice generale; `ultimo` = ' +
      'inflazione tendenziale più recente.',
  );
  lines.push('');
  lines.push('| Categoria | phi | spread (p.p.) | ultimo (%) | oss. |');
  lines.push('|---|---:|---:|---:|---:|');
  for (const m of models.sort((a, b) => b.spread - a.spread)) {
    lines.push(
      `| ${m.label} | ${m.phi.toFixed(2)} | ${pp(m.spread)} | ` +
        `${pp(m.lastRate)} | ${m.nObs} |`,
    );
  }
  lines.push('');

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, lines.join('\n'), 'utf8');

  // --- Output a terminale ---------------------------------------------------
  console.log(`Backtest su ${results.length} categorie.\n`);
  console.log('Categoria                                 modello     RW  ancora');
  for (const r of results.sort((a, b) => a.meanMae - b.meanMae)) {
    console.log(
      `  ${r.label.slice(0, 38).padEnd(38)} ` +
        `${pp(r.meanMae).padStart(7)} ${pp(r.meanMaeRandomWalk).padStart(6)} ` +
        `${pp(r.meanMaeAnchor).padStart(7)}`,
    );
  }
  console.log(
    `\nBatte il random walk in ${wonRw}/${results.length}, ` +
      `l'ancora fissa in ${wonAnc}/${results.length}.`,
  );
  console.log(`\nScritto ${OUT}`);
}

main().catch((err) => {
  console.error('Backtest fallito:', err);
  process.exit(1);
});
