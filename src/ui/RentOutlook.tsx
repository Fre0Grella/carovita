/**
 * Il tuo affitto rispetto al mercato, e gli aumenti attesi ai rinnovi.
 *
 * Chi affitta una stanza sotto il prezzo di stanze simili può aspettarsi un
 * aumento al rinnovo: il proprietario tende a recuperare il divario, di solito
 * un po' alla volta. Qui quel ragionamento è reso esplicito: da dove viene il
 * prezzo di mercato, di quanto se ne discosta il tuo canone, e quanto potrebbe
 * salire a ogni scadenza.
 */

import { shortMonthLabel } from '../core/series.js';
import type { RentOutlook, RoomBenchmark } from '../core/types.js';
import { aMese, eur, pct } from './format.js';

const KIND_LABEL: Record<RoomBenchmark['steps'][number]['kind'], string> = {
  dato: 'dato',
  derivato: 'derivato dai dati',
  ipotesi: 'ipotesi',
  tuo: 'tuo dato',
};

/** Frase di sintesi sul divario fra il tuo canone e il mercato. */
export function gapSentence(o: RentOutlook): JSX.Element | null {
  const b = o.benchmark;
  if (!b || o.gap === null) return null;
  const range = `${eur(b.lo)} – ${eur(b.hi)}`;
  if (o.gap > 0.1) {
    return (
      <>
        <strong>
          Paghi {eur(o.currentRent)}, il {pct(1 - o.currentRent / b.central, 0)} meno
          delle stanze simili
        </strong>
        , stimate intorno a {eur(b.central)} ({range}). Quando il contratto si
        rinnova è probabile un aumento: il proprietario tende a recuperare il
        divario.
        {o.gap > 0.3 && b.basis !== 'tuo' && (
          <div style={{ marginTop: 6 }}>
            <strong>Attenzione:</strong> un divario così ampio spesso vuol dire
            che la media della città non è un buon termine di paragone per la
            tua stanza (più piccola, più persone per bagno, zona meno
            richiesta). Se sai quanto pagano stanze davvero simili, inseriscilo:
            la previsione degli aumenti diventa molto più affidabile.
          </div>
        )}
      </>
    );
  }
  if (o.gap < -0.1) {
    return (
      <>
        <strong>
          Paghi {eur(o.currentRent)}, più delle stanze simili
        </strong>{' '}
        (circa {eur(b.central)}, {range}). Al rinnovo difficilmente il canone
        salirà oltre l’inflazione, e hai margine per negoziare.
      </>
    );
  }
  return (
    <>
      <strong>Paghi {eur(o.currentRent)}, in linea con le stanze simili</strong>{' '}
      (circa {eur(b.central)}, {range}): ai rinnovi non ci sono divari da
      recuperare.
    </>
  );
}

/** Passaggi della stima del prezzo di mercato, ciascuno con la sua natura. */
export function BenchmarkSteps({ benchmark }: { benchmark: RoomBenchmark }): JSX.Element {
  return (
    <ol className="small" style={{ margin: '6px 0 0', paddingLeft: 18 }}>
      {benchmark.steps.map((s, i) => (
        <li key={i} style={{ marginBottom: 3 }}>
          {s.label}: <strong>{eur(s.value)}</strong>{' '}
          <span
            className="muted"
            style={{
              fontWeight: s.kind === 'ipotesi' ? 600 : undefined,
              color: s.kind === 'ipotesi' ? 'var(--text-secondary)' : undefined,
            }}
          >
            ({KIND_LABEL[s.kind]})
          </span>
          {s.note && <div className="muted">{s.note}</div>}
        </li>
      ))}
    </ol>
  );
}

/** Tabella dei rinnovi con il canone previsto e i suoi estremi. */
export function RenewalTable({
  outlook,
  limit,
}: {
  outlook: RentOutlook;
  limit?: number;
}): JSX.Element {
  const rows = limit ? outlook.renewals.slice(0, limit) : outlook.renewals;
  if (rows.length === 0) {
    return (
      <p className="muted small" style={{ margin: '6px 0 0' }}>
        Nessun rinnovo del contratto entro l’orizzonte scelto: fino ad allora il
        canone cambia solo con gli eventuali scatti ISTAT.
      </p>
    );
  }
  const room = outlook.basis === 'room';
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Rinnovo</th>
            <th>Paghi</th>
            <th>Dopo il rinnovo</th>
            <th>Aumento</th>
            {room && <th>Fra</th>}
            {room && <th>Stanze simili</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.month}>
              <td>{shortMonthLabel(r.month)}</td>
              <td className="num">{eur(r.from)}</td>
              <td className="num">
                <strong>{eur(r.to)}</strong>
              </td>
              <td className="num">
                {r.to - r.from >= 0.5 ? `+${eur(r.to - r.from)}` : 'nessuno'}
              </td>
              {room && (
                <td className="num">
                  {eur(r.toLo)} – {eur(r.toHi)}
                </td>
              )}
              {room && (
                <td className="num">{r.market !== null ? eur(r.market) : '—'}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Scheda completa, per la previsione. */
export function RentOutlookCard({ outlook }: { outlook: RentOutlook }): JSX.Element {
  const room = outlook.basis === 'room';
  const next = outlook.renewals[0];
  return (
    <div className="card">
      <h2>Il tuo affitto ai prossimi rinnovi</h2>
      <p className="muted small" style={{ marginTop: -4 }}>
        {room
          ? 'Durante il contratto il canone cambia al massimo con lo scatto ISTAT; a ogni rinnovo il proprietario può riportarlo verso il prezzo delle stanze simili.'
          : 'Durante il contratto il canone cambia al massimo con lo scatto ISTAT; alla scadenza si firma un contratto nuovo ai prezzi di mercato.'}
      </p>

      {room && outlook.benchmark && (
        <div className="notice info">
          {gapSentence(outlook)}
          {next && next.to > next.from + 0.5 && (
            <div style={{ marginTop: 6 }}>
              Primo rinnovo {aMese(next.month)}: da {eur(next.from)} a circa{' '}
              <strong>{eur(next.to)}</strong>, recuperando il{' '}
              {pct(outlook.catchUp, 0)} del divario (ipotesi modificabile in
              Configurazione). Fra {eur(next.toLo)} se il proprietario non
              recupera nulla e {eur(next.toHi)} se porta subito il canone al
              prezzo alto delle stanze simili.
            </div>
          )}
          <details style={{ marginTop: 8 }}>
            <summary>Come è stimato il prezzo delle stanze simili</summary>
            <BenchmarkSteps benchmark={outlook.benchmark} />
          </details>
        </div>
      )}

      <RenewalTable outlook={outlook} />
    </div>
  );
}
