/**
 * Provenienza dei dati e parametri del modello.
 *
 * Una previsione senza provenienza non è verificabile. Qui si vede da quale
 * dataset arriva ogni serie, a che data è ferma, e con quali parametri il
 * modello la proietta: chiunque può risalire alla fonte e rifare i conti.
 */

import type { DataSnapshot, ProjectionResult } from '../core/types.js';
import { isoDate, monthName, pct } from './format.js';

interface Props {
  snapshot: DataSnapshot;
  result: ProjectionResult;
}

export function DataPanel({ snapshot, result }: Props): JSX.Element {
  const series = Object.values(snapshot.series).filter(Boolean);

  return (
    <>
      <div className="card">
        <h2>Da dove vengono i dati</h2>
        <p className="muted small" style={{ marginTop: -4 }}>
          Snapshot generato il {isoDate(snapshot.generatedAt)}. I dati sono
          scaricati da una procedura automatica e serviti come file statici:
          il browser non interroga direttamente Eurostat o ISTAT.
        </p>

        {snapshot.degraded && (
          <div className="notice">
            <strong>Aggiornamento parziale.</strong> Alcune fonti non hanno
            risposto durante l’ultimo aggiornamento. Per non perdere i dati, la
            procedura ha riusato i valori validi precedenti.
            {snapshot.warnings.length > 0 && (
              <ul>
                {snapshot.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Serie</th>
                <th style={{ textAlign: 'left' }}>Fonte</th>
                <th style={{ textAlign: 'left' }}>Codice</th>
                <th>Aggiornata a</th>
                <th>Osservazioni</th>
              </tr>
            </thead>
            <tbody>
              {series.map((s) => (
                <tr key={`${s!.datasetId}-${s!.sourceCode}`}>
                  <td>{s!.label}</td>
                  <td style={{ textAlign: 'left' }}>
                    <a href={s!.sourceUrl} target="_blank" rel="noreferrer">
                      {s!.source === 'eurostat' ? 'Eurostat' : 'ISTAT'}
                    </a>{' '}
                    <span className="mono muted">{s!.datasetId}</span>
                  </td>
                  <td style={{ textAlign: 'left' }} className="mono">
                    {s!.sourceCode}
                  </td>
                  <td>{monthName(s!.vintage)}</td>
                  <td className="num">{s!.obs.length}</td>
                </tr>
              ))}
              {snapshot.foi && (
                <tr>
                  <td>{snapshot.foi.label}</td>
                  <td style={{ textAlign: 'left' }}>
                    <a
                      href={snapshot.foi.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      ISTAT
                    </a>{' '}
                    <span className="mono muted">SDMX</span>
                  </td>
                  <td style={{ textAlign: 'left' }} className="mono">
                    {snapshot.foi.sourceCode}
                  </td>
                  <td>{monthName(snapshot.foi.vintage)}</td>
                  <td className="num">{snapshot.foi.obs.length}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <details style={{ marginTop: 12 }}>
          <summary>Perché queste fonti e non altre</summary>
          <p className="small">
            Gli indici dei prezzi vengono da <strong>Eurostat</strong>{' '}
            (<span className="mono">prc_hicp_minr</span>), che pubblica l’indice
            armonizzato italiano per categoria di consumo con una storia
            mensile dal 1996. Dal febbraio 2026 Eurostat è passata alla
            classificazione ECOICOP 2: i dataset precedenti rispondono ancora,
            ma sono fermi a dicembre 2025, e usarli significherebbe costruire
            previsioni su dati congelati senza accorgersene.
          </p>
          <p className="small">
            L’indice <strong>FOI</strong> viene invece da{' '}
            <strong>ISTAT</strong>, perché è quello che la legge italiana usa
            per aggiornare i canoni di locazione: si usa la variante al netto
            dei tabacchi, ricostruita raccordando fra loro le quattro basi
            d’indice pubblicate dal 1996 a oggi.
          </p>
          <p className="small">
            I canoni al metro quadro per comune sono una{' '}
            <strong>baseline indicativa</strong>, non quotazioni OMI ufficiali:
            le quotazioni dell’Agenzia delle Entrate sono gratuite ma
            scaricabili solo dall’area riservata previo accesso con SPID, e non
            esistono come endpoint pubblico interrogabile. Il canone che paghi
            davvero resta sempre il dato più accurato: inseriscilo a mano.
          </p>
        </details>
      </div>

      {/* ---------------------------------------------------------------- */}
      <div className="card">
        <h2>Parametri del modello</h2>
        <p className="muted small" style={{ marginTop: -4 }}>
          Per ogni categoria: quanto persiste uno scostamento, di quanto la
          categoria cresce sopra o sotto la media, e da quale inflazione si
          parte.
        </p>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Categoria</th>
                <th>Persistenza</th>
                <th>Differenziale</th>
                <th>Inflazione attuale</th>
                <th>Ancora di lungo periodo</th>
              </tr>
            </thead>
            <tbody>
              {[...result.models]
                .sort((a, b) => b.spread - a.spread)
                .map((m) => (
                  <tr key={m.category}>
                    <td>{m.label}</td>
                    <td className="num">{m.phi.toFixed(2)}</td>
                    <td className="num">{pct(m.spread, 2)}</td>
                    <td className="num">{pct(m.lastRate, 1)}</td>
                    <td className="num">{pct(result.anchor + m.spread, 2)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        <details style={{ marginTop: 12 }}>
          <summary>Come funziona la previsione</summary>
          <p className="small">
            Il modello non proietta all’infinito l’inflazione di oggi: sarebbe
            l’errore più grosso possibile. Nel 2022 l’energia in Italia ha
            superato il +50% annuo; proiettarlo per dieci anni avrebbe previsto
            bollette cinquantasette volte più care. Nel 2025 l’energia era in
            calo.
          </p>
          <p className="small">
            Si parte invece dall’inflazione osservata e la si fa rientrare
            gradualmente verso un valore di lungo periodo, pari all’obiettivo
            della BCE più il differenziale storico della categoria. La velocità
            del rientro è la <em>persistenza</em>, stimata dai dati. Sia la
            persistenza sia il differenziale vengono ridotti verso il valore
            prudente quando il dato storico è troppo rumoroso per essere
            considerato strutturale.
          </p>
          <p className="small">
            Il modello è validato fuori campione: si tronca la storia a un certo
            anno, si stimano i parametri con i soli dati disponibili fino a
            quel punto e si confronta la previsione con quanto è poi realmente
            accaduto. I risultati, benchmark ingenui inclusi, sono nel file{' '}
            <span className="mono">docs/BACKTEST.md</span> della repository.
          </p>
          <p className="small">
            Le incertezze delle categorie non si sommano fra loro: verrebbe
            una banda molto più larga del vero, perché equivarrebbe a
            supporre che energia, alimentari e affitto sbaglino tutti nella
            stessa direzione e nello stesso momento. Si aggregano invece
            usando la correlazione media effettivamente osservata fra le
            categorie, che su questi dati vale{' '}
            <strong>{result.categoryCorrelation.toFixed(2)}</strong>. Sul
            patrimonio la differenza è vistosa, perché il risparmio è la
            differenza fra due numeri grandi e vicini.
          </p>
          <p className="small">
            <strong>Limite noto:</strong> le bande di incertezza sono ben
            calibrate a uno o due anni, ma diventano troppo strette sugli
            orizzonti lunghi. In trent’anni l’Italia è passata per il cambio
            all’euro, la crisi del 2008 e lo shock energetico del 2022: sono
            rotture di regime, che nessuna stima basata sulla volatilità
            passata riesce ad anticipare. Una proiezione a dieci anni va letta
            come ordine di grandezza, non come previsione puntuale.
          </p>
        </details>
      </div>

      {result.warnings.length > 0 && (
        <div className="card">
          <h2>Avvisi sulla proiezione</h2>
          <ul className="small">
            {result.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
