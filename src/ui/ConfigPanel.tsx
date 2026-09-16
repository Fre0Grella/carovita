/**
 * Pannello di configurazione di un profilo.
 *
 * Le voci abitative sono separate dalle altre spese perché seguono regole
 * proprie (contratto, imposte, scatti ISTAT). Le spese condominiali stanno
 * solo qui, e non fra le utenze, per evitare di contarle due volte.
 */

import type {
  CategoryId,
  CityRentQuote,
  ContractType,
  EnergyClass,
  ExpenseItem,
  ExpenseSchedule,
  Profile,
  RentOutlook,
  SharingConfig,
  ZoneTier,
} from '../core/types.js';
import { computeShare, contractLabel, contractTerm } from '../core/rent.js';
import { proposedQualityAdjustment } from '../core/rooms.js';
import { monthIndex, monthLabel } from '../core/series.js';
import { BenchmarkSteps, RenewalTable, gapSentence } from './RentOutlook.js';
import {
  MONTHLY,
  MONTH_NAMES,
  describeSchedule,
  lastInstallment,
  monthlyEquivalent,
} from '../core/schedule.js';
import { CityPicker } from './CityPicker.js';
import { CATEGORY_LABELS, SELECTABLE_CATEGORIES, newSharing } from './defaults.js';
import { aMese, eur, pct, pctSigned } from './format.js';

interface Props {
  profile: Profile;
  onChange: (p: Profile) => void;
  /**
   * Crescita annua prevista dal modello per ciascuna categoria. Serve a
   * mostrare la previsione gia' pronta accanto a ogni voce, invece di
   * lasciare un campo vuoto che sembra dire «crescita zero».
   */
  forecastRates: Map<CategoryId, number>;
  /** Mese di partenza della proiezione, `YYYY-MM`: default per rate e date. */
  startMonth: string;
  /** Il tuo affitto rispetto al mercato, dalla proiezione del profilo. */
  rentOutlook: RentOutlook | null;
}

const CONTRACTS: ContractType[] = [
  'libero_4_4',
  'concordato_3_2',
  'transitorio',
  'studenti',
  'proprieta',
];

const ZONES: { id: ZoneTier; label: string }[] = [
  { id: 'centro', label: 'Centro' },
  { id: 'semicentro', label: 'Semicentro' },
  { id: 'periferia', label: 'Periferia' },
];

export function ConfigPanel({
  profile,
  onChange,
  forecastRates,
  startMonth,
  rentOutlook,
}: Props): JSX.Element {
  const h = profile.housing;
  const set = (patch: Partial<Profile>): void =>
    onChange({ ...profile, ...patch });
  const setHousing = (patch: Partial<Profile['housing']>): void =>
    onChange({ ...profile, housing: { ...h, ...patch } });

  const isRenting = h.contractType !== 'proprieta';
  const shared = h.sharing !== null;
  const roomBasis = h.sharing?.rentBasis === 'room';
  const breakdown = computeShare(h);
  const renewalAt = nextRenewal(h, startMonth);
  const term = contractTerm(h.contractType, h.contractYears);
  const cycleYears = term.first + term.renewal;

  const setSharing = (patch: Partial<SharingConfig>): void => {
    if (!h.sharing) return;
    setHousing({ sharing: { ...h.sharing, ...patch } });
  };

  return (
    <>
      <div className="card">
        <h2>Profilo</h2>
        <div className="grid">
          <div className="field">
            <label htmlFor="p-name">Nome del profilo</label>
            <input
              id="p-name"
              value={profile.name}
              onChange={(e) => set({ name: e.target.value })}
            />
            <span className="hint">
              Serve a distinguerlo nel confronto, ad esempio "Bologna 65 m²".
            </span>
          </div>
        </div>
      </div>

      {/* ---------------------------------------------------------------- */}
      <div className="card">
        <h2>Abitazione</h2>
        <div className="grid">
          <CityPicker
            value={h.istatCode}
            onChange={(c: CityRentQuote) =>
              setHousing({ istatCode: c.istatCode })
            }
          />

          <div className="field">
            <label htmlFor="h-contract">Tipo di contratto</label>
            <select
              id="h-contract"
              value={h.contractType}
              onChange={(e) =>
                setHousing({ contractType: e.target.value as ContractType })
              }
            >
              {CONTRACTS.map((c) => (
                <option key={c} value={c}>
                  {contractLabel(c)}
                </option>
              ))}
            </select>
            <span className="hint">
              Determina ogni quanto il canone torna ai prezzi di mercato.
            </span>
          </div>

          {isRenting && (
            <>
              <div className="field">
                <label htmlFor="h-zone">Zona</label>
                <select
                  id="h-zone"
                  value={h.zone}
                  onChange={(e) =>
                    setHousing({ zone: e.target.value as ZoneTier })
                  }
                >
                  {ZONES.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.label}
                    </option>
                  ))}
                </select>
                <span className="hint">
                  Usata solo se non indichi il canone.
                </span>
              </div>

              <div className="field">
                <label htmlFor="h-sqm">
                  Superficie dell{'’'}intera abitazione (m²)
                  {roomBasis ? ', facoltativa' : ''}
                </label>
                <input
                  id="h-sqm"
                  type="number"
                  min={10}
                  max={500}
                  value={h.sqm}
                  onChange={(e) => setHousing({ sqm: Number(e.target.value) })}
                />
                <span className="hint">
                  Tutto l{'’'}appartamento, non la tua camera.
                </span>
              </div>

              {!roomBasis && (
              <div className="field">
                <label htmlFor="h-rent">
                  {shared
                    ? 'Canone mensile dell’intero appartamento (€)'
                    : 'Canone mensile (€)'}
                </label>
                <input
                  id="h-rent"
                  type="number"
                  min={0}
                  step={10}
                  value={h.monthlyRent ?? ''}
                  placeholder="stima automatica"
                  onChange={(e) =>
                    setHousing({
                      monthlyRent:
                        e.target.value === '' ? null : Number(e.target.value),
                    })
                  }
                />
                <span className="hint">
                  {shared
                    ? 'La cifra che risulta dal contratto, non la tua quota: ' +
                      'quella la calcola l’applicazione dalle metrature.'
                    : 'Lascialo vuoto per stimarlo da zona e metratura. Il ' +
                      'canone che paghi davvero è sempre il dato più accurato.'}
                </span>
              </div>
              )}

              <div className="field">
                <label htmlFor="h-condo">
                  {shared
                    ? 'Spese condominiali dell’appartamento (€/mese)'
                    : 'Spese condominiali mensili (€)'}
                </label>
                <input
                  id="h-condo"
                  type="number"
                  min={0}
                  step={5}
                  value={h.condoFees}
                  onChange={(e) =>
                    setHousing({ condoFees: Number(e.target.value) })
                  }
                />
                <span className="hint">
                  Solo qui, non fra le utenze: altrimenti le conteresti due
                  volte.
                  {shared &&
                    ' Si dividono in parti uguali fra i conviventi.'}
                </span>
              </div>

              <div className="field">
                <label htmlFor="h-share">
                  Quota imposta di registro a tuo carico
                </label>
                <select
                  id="h-share"
                  value={h.registrationTaxShare}
                  onChange={(e) =>
                    setHousing({
                      registrationTaxShare: Number(e.target.value),
                    })
                  }
                >
                  <option value={0.5}>Metà (consuetudine)</option>
                  <option value={1}>Tutta a mio carico</option>
                  <option value={0}>Tutta a carico del locatore</option>
                </select>
              </div>

              <div className="field">
                <label>Inizio del contratto attuale</label>
                <div className="row" style={{ flexWrap: 'nowrap' }}>
                  <MonthPicker
                    label="Inizio del contratto"
                    value={h.contractStart ?? startMonth}
                    startMonth={startMonth}
                    pastYears={12}
                    onChange={(t) =>
                      setHousing({ contractStart: t === startMonth ? null : t })
                    }
                  />
                </div>
                <span className="hint">
                  Il canone si rinegozia ogni{' '}
                  {cycleYears.toLocaleString('it-IT')}{' '}
                  {cycleYears === 1 ? 'anno' : 'anni'}
                  {renewalAt ? `: prossimo rinnovo ${aMese(renewalAt)}.` : '.'}
                </span>
              </div>

              {(h.contractType === 'studenti' || h.contractType === 'transitorio') && (
                <div className="field">
                  <label htmlFor="h-years">Durata di ogni contratto</label>
                  <select
                    id="h-years"
                    value={term.first}
                    onChange={(e) =>
                      setHousing({ contractYears: Number(e.target.value) })
                    }
                  >
                    {(h.contractType === 'studenti'
                      ? [0.5, 1, 1.5, 2, 2.5, 3]
                      : [0.5, 1, 1.5]
                    ).map((y) => (
                      <option key={y} value={y}>
                        {y === 0.5
                          ? '6 mesi'
                          : y === 1.5
                            ? '18 mesi'
                            : `${y.toLocaleString('it-IT')} ${y === 1 ? 'anno' : 'anni'}`}
                      </option>
                    ))}
                  </select>
                  <span className="hint">
                    {h.contractType === 'studenti'
                      ? 'Da 6 mesi a 3 anni. Si rinnova una volta in automatico, quindi il canone può cambiare ogni due durate.'
                      : 'Al massimo 18 mesi, senza rinnovo automatico.'}
                  </span>
                </div>
              )}
            </>
          )}
        </div>

        {isRenting && (
          <div className="grid" style={{ marginTop: 12 }}>
            <div className="field checkbox">
              <input
                id="h-sharing"
                type="checkbox"
                checked={shared}
                onChange={(e) =>
                  setHousing({
                    sharing: e.target.checked
                      ? { ...newSharing('room'), bedroomsSqm: Math.round(h.sqm * 0.5) }
                      : null,
                  })
                }
              />
              <div>
                <label htmlFor="h-sharing">Divido casa con altre persone</label>
                <div className="hint">
                  Affitti una stanza, o dividi il canone con i coinquilini.
                </div>
              </div>
            </div>

            <div className="field checkbox">
              <input
                id="h-cedolare"
                type="checkbox"
                checked={h.cedolareSecca}
                onChange={(e) =>
                  setHousing({ cedolareSecca: e.target.checked })
                }
              />
              <div>
                <label htmlFor="h-cedolare">
                  Il locatore ha scelto la cedolare secca
                </label>
                <div className="hint">
                  Con la cedolare secca il locatore rinuncia per legge ad
                  aggiornare il canone: resta fermo in euro per tutta la durata
                  del contratto, e non si pagano imposta di registro né bollo.
                  È una delle scelte che pesano di più sul lungo periodo.
                </div>
              </div>
            </div>

            <div className="field checkbox">
              <input
                id="h-istat"
                type="checkbox"
                checked={h.istatIndexation}
                disabled={h.cedolareSecca}
                onChange={(e) =>
                  setHousing({ istatIndexation: e.target.checked })
                }
              />
              <div>
                <label htmlFor="h-istat">
                  Il contratto prevede l’aggiornamento ISTAT
                </label>
                <div className="hint">
                  {h.cedolareSecca
                    ? 'Escluso dalla cedolare secca.'
                    : 'Il canone sale ogni anno del 75% della variazione FOI.'}
                </div>
              </div>
            </div>

            <div className="field checkbox">
              <input
                id="h-tension"
                type="checkbox"
                checked={h.highTensionMunicipality}
                onChange={(e) =>
                  setHousing({ highTensionMunicipality: e.target.checked })
                }
              />
              <div>
                <label htmlFor="h-tension">
                  Comune ad alta tensione abitativa
                </label>
                <div className="hint">
                  Con il canone concordato riduce del 30% la base imponibile
                  dell’imposta di registro.
                </div>
              </div>
            </div>

            {shared && h.sharing && (
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <h3 style={{ margin: '4px 0 2px' }}>Coabitazione</h3>

                <div className="grid" style={{ marginTop: 6 }}>
                  <div className="field">
                    <label htmlFor="sh-basis">Quale canone conosci?</label>
                    <select
                      id="sh-basis"
                      value={h.sharing.rentBasis}
                      onChange={(e) =>
                        setSharing({
                          rentBasis: e.target.value as SharingConfig['rentBasis'],
                        })
                      }
                    >
                      <option value="room">Quello della mia stanza</option>
                      <option value="apartment">
                        Quello dell’intero appartamento
                      </option>
                    </select>
                    <span className="hint">
                      {roomBasis
                        ? 'Il caso tipico: confrontiamo il tuo canone con le stanze simili e prevediamo gli aumenti ai rinnovi.'
                        : 'La tua quota si ricava dalle metrature di camera e spazi comuni.'}
                    </span>
                  </div>

                  {roomBasis && (
                    <div className="field">
                      <label htmlFor="sh-roomrent">
                        Canone mensile della tua stanza (€)
                      </label>
                      <input
                        id="sh-roomrent"
                        type="number"
                        min={0}
                        step={5}
                        value={h.sharing.roomRent ?? ''}
                        placeholder="stima automatica"
                        onChange={(e) =>
                          setSharing({
                            roomRent:
                              e.target.value === '' ? null : Number(e.target.value),
                          })
                        }
                      />
                    </div>
                  )}

                  <div className="field">
                    <label htmlFor="sh-room">La tua camera (m²)</label>
                    <input
                      id="sh-room"
                      type="number"
                      min={1}
                      max={200}
                      value={h.sharing.roomSqm}
                      onChange={(e) =>
                        setSharing({ roomSqm: Number(e.target.value) })
                      }
                    />
                  </div>

                  {!roomBasis && (
                    <div className="field">
                      <label htmlFor="sh-bedrooms">
                        Totale di tutte le camere (m²)
                      </label>
                      <input
                        id="sh-bedrooms"
                        type="number"
                        min={1}
                        max={500}
                        value={h.sharing.bedroomsSqm}
                        onChange={(e) =>
                          setSharing({ bedroomsSqm: Number(e.target.value) })
                        }
                      />
                      <span className="hint">
                        Serve a ricavare per differenza gli spazi comuni.
                      </span>
                    </div>
                  )}

                  <div className="field">
                    <label htmlFor="sh-occ">Persone in casa</label>
                    <input
                      id="sh-occ"
                      type="number"
                      min={1}
                      max={12}
                      value={h.sharing.occupants}
                      onChange={(e) =>
                        setSharing({ occupants: Number(e.target.value) })
                      }
                    />
                  </div>

                  {roomBasis && (
                    <>
                      <div className="field">
                        <label htmlFor="sh-baths">Bagni (facoltativo)</label>
                        <input
                          id="sh-baths"
                          type="number"
                          min={1}
                          max={10}
                          value={h.sharing.bathrooms ?? ''}
                          placeholder="non so"
                          onChange={(e) =>
                            setSharing({
                              bathrooms:
                                e.target.value === '' ? null : Number(e.target.value),
                            })
                          }
                        />
                      </div>

                      <div className="field">
                        <label htmlFor="sh-energy">
                          Classe energetica (facoltativa)
                        </label>
                        <select
                          id="sh-energy"
                          value={h.sharing.energyClass ?? ''}
                          onChange={(e) =>
                            setSharing({
                              energyClass:
                                e.target.value === ''
                                  ? null
                                  : (e.target.value as EnergyClass),
                            })
                          }
                        >
                          <option value="">Non so</option>
                          {ENERGY_CLASSES.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="field">
                        <label htmlFor="sh-scope">Il contratto riguarda</label>
                        <select
                          id="sh-scope"
                          value={h.sharing.contractScope}
                          onChange={(e) =>
                            setSharing({
                              contractScope: e.target
                                .value as SharingConfig['contractScope'],
                            })
                          }
                        >
                          <option value="room">Solo la mia stanza</option>
                          <option value="apartment">
                            Tutto l’appartamento, con i coinquilini
                          </option>
                        </select>
                        <span className="hint">
                          Cambia la base dell’imposta di registro, se non c’è
                          la cedolare secca.
                        </span>
                      </div>

                      <div className="field">
                        <label htmlFor="sh-comparable">
                          Quanto pagano stanze simili (€/mese, se lo sai)
                        </label>
                        <input
                          id="sh-comparable"
                          type="number"
                          min={0}
                          step={5}
                          value={h.sharing.comparableRent ?? ''}
                          placeholder="stima automatica"
                          onChange={(e) =>
                            setSharing({
                              comparableRent:
                                e.target.value === '' ? null : Number(e.target.value),
                            })
                          }
                        />
                        <span className="hint">
                          Coinquilini, compagni di corso, annunci nella tua zona
                          con metratura e servizi simili: è il confronto più
                          affidabile e sostituisce la stima.
                        </span>
                      </div>
                    </>
                  )}
                </div>

                <div className="grid" style={{ marginTop: 10 }}>
                  <div className="field checkbox">
                    <input
                      id="sh-double"
                      type="checkbox"
                      checked={h.sharing.roomShared}
                      onChange={(e) =>
                        setSharing({ roomShared: e.target.checked })
                      }
                    />
                    <div>
                      <label htmlFor="sh-double">
                        È una camera doppia
                      </label>
                      <div className="hint">
                        {roomBasis
                          ? 'Paghi un posto letto: si confronta con i posti letto, non con le singole.'
                          : 'La dividi con un’altra persona, quindi conta per metà.'}
                      </div>
                    </div>
                  </div>

                  <div className="field checkbox">
                    <input
                      id="sh-contract"
                      type="checkbox"
                      checked={h.sharing.onContract}
                      onChange={(e) =>
                        setSharing({ onContract: e.target.checked })
                      }
                    />
                    <div>
                      <label htmlFor="sh-contract">
                        Sono intestatario del contratto
                      </label>
                      <div className="hint">
                        Se paghi l{'’'}affitto a un coinquilino che ha
                        firmato, togli la spunta: l{'’'}imposta di
                        registro non è a tuo carico.
                      </div>
                    </div>
                  </div>
                </div>

                {roomBasis ? (
                  <RoomMarketPanel
                    housing={h}
                    outlook={rentOutlook}
                    onSharing={setSharing}
                    onHousing={setHousing}
                  />
                ) : (
                  <div
                    className="notice info"
                    style={{ marginTop: 12, marginBottom: 0 }}
                  >
                    <strong>La tua quota: {pct(breakdown.rentShare, 1)}</strong>{' '}
                    del canone
                    {h.monthlyRent
                      ? ` — ${eur(h.monthlyRent * breakdown.rentShare)} al mese su ${eur(h.monthlyRent)}`
                      : ''}
                    .
                    <div className="small muted" style={{ marginTop: 4 }}>
                      {breakdown.privateSqm.toLocaleString('it-IT')} m² di camera
                      {h.sharing.roomShared ? ' (metà della doppia)' : ''} +{' '}
                      {breakdown.commonSqm.toLocaleString('it-IT', {
                        maximumFractionDigits: 1,
                      })}{' '}
                      m² di spazi comuni ={' '}
                      {breakdown.weightedSqm.toLocaleString('it-IT', {
                        maximumFractionDigits: 1,
                      })}{' '}
                      m² su {h.sqm} m² totali.
                    </div>
                    {breakdown.warnings.length > 0 && (
                      <ul className="small" style={{ marginBottom: 0 }}>
                        {breakdown.warnings.map((w, i) => (
                          <li key={i}>{w}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <div className="hint">
                Alla scadenza del contratto se ne firma uno nuovo: decadono sia
                il tetto del 75% sugli scatti ISTAT sia il blocco legato alla
                cedolare secca, che vale per quel contratto e non per sempre.
                {roomBasis
                  ? ' Per una stanza il canone si avvicina al prezzo delle stanze simili, di quanto indicato sopra.'
                  : ' Il canone torna ai prezzi di mercato: è il salto che chi affitta conosce bene, e il modello lo applica anche se resti nella stessa casa.'}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ---------------------------------------------------------------- */}
      <ExpenseList
        title="Utenze"
        description="Bollette e servizi legati alla casa."
        items={profile.utilities}
        forecastRates={forecastRates}
        startMonth={startMonth}
        onChange={(utilities) => set({ utilities })}
      />

      <ExpenseList
        title="Altre spese"
        description="Tutto il resto: alimentari, trasporti, tempo libero."
        items={profile.expenses}
        forecastRates={forecastRates}
        startMonth={startMonth}
        onChange={(expenses) => set({ expenses })}
      />

      {/* ---------------------------------------------------------------- */}
      <div className="card">
        <h2>Reddito e risparmi</h2>
        <div className="grid">
          <div className="field">
            <label htmlFor="i-net">Reddito netto mensile (€)</label>
            <input
              id="i-net"
              type="number"
              min={0}
              step={50}
              value={profile.income.monthlyNet}
              onChange={(e) =>
                set({
                  income: {
                    ...profile.income,
                    monthlyNet: Number(e.target.value),
                  },
                })
              }
            />
          </div>

          <div className="field">
            <label htmlFor="i-months">Mensilità</label>
            <select
              id="i-months"
              value={profile.income.monthsPerYear}
              onChange={(e) =>
                set({
                  income: {
                    ...profile.income,
                    monthsPerYear: Number(e.target.value),
                  },
                })
              }
            >
              <option value={12}>12</option>
              <option value={13}>13</option>
              <option value={14}>14</option>
            </select>
          </div>

          <div className="field">
            <label htmlFor="i-pass">
              Recupero dell’inflazione: {pct(profile.income.inflationPassThrough, 0)}
            </label>
            <input
              id="i-pass"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={profile.income.inflationPassThrough}
              onChange={(e) =>
                set({
                  income: {
                    ...profile.income,
                    inflationPassThrough: Number(e.target.value),
                  },
                })
              }
            />
            <span className="hint">
              Quanta parte dell’inflazione recuperi con gli aumenti. In Italia i
              rinnovi contrattuali ne recuperano storicamente solo una parte.
            </span>
          </div>

          <div className="field">
            <label htmlFor="i-real">
              Crescita reale annua: {pct(profile.income.realGrowth)}
            </label>
            <input
              id="i-real"
              type="range"
              min={-0.02}
              max={0.05}
              step={0.005}
              value={profile.income.realGrowth}
              onChange={(e) =>
                set({
                  income: {
                    ...profile.income,
                    realGrowth: Number(e.target.value),
                  },
                })
              }
            />
            <span className="hint">Avanzamenti di carriera, oltre l’inflazione.</span>
          </div>

          <div className="field">
            <label htmlFor="i-savings">Risparmi attuali (€)</label>
            <input
              id="i-savings"
              type="number"
              min={0}
              step={500}
              value={profile.initialSavings}
              onChange={(e) => set({ initialSavings: Number(e.target.value) })}
            />
          </div>

          <div className="field">
            <label htmlFor="i-return">
              Rendimento dei risparmi: {pct(profile.savingsReturn)}
            </label>
            <input
              id="i-return"
              type="range"
              min={0}
              max={0.08}
              step={0.005}
              value={profile.savingsReturn}
              onChange={(e) => set({ savingsReturn: Number(e.target.value) })}
            />
          </div>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------

interface ListProps {
  title: string;
  description: string;
  items: ExpenseItem[];
  forecastRates: Map<CategoryId, number>;
  startMonth: string;
  onChange: (items: ExpenseItem[]) => void;
}

function ExpenseList({
  title,
  description,
  items,
  forecastRates,
  startMonth,
  onChange,
}: ListProps): JSX.Element {
  const recurring = items.reduce((a, i) => a + monthlyEquivalent(i), 0);
  const others = items.filter((i) => i.schedule.kind !== 'recurring').length;

  const update = (id: string, patch: Partial<ExpenseItem>): void =>
    onChange(items.map((i) => (i.id === id ? { ...i, ...patch } : i)));

  return (
    <div className="card">
      <h2>{title}</h2>
      <p className="muted small" style={{ marginTop: -4 }}>
        {description} Voci ricorrenti: <strong>{eur(recurring)}</strong> al mese
        in media
        {others > 0 && (
          <>
            , più {others} {others === 1 ? 'spesa' : 'spese'} a rate o una
            tantum
          </>
        )}
        .
      </p>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Voce</th>
              <th>Categoria di prezzo</th>
              <th style={{ textAlign: 'left' }}>Quando</th>
              <th>Importo</th>
              <th>Crescita annua prevista</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id} style={{ verticalAlign: 'top' }}>
                <td>
                  <input
                    aria-label="Nome della voce"
                    value={i.label}
                    onChange={(e) => update(i.id, { label: e.target.value })}
                    style={{ width: 160 }}
                  />
                </td>
                <td>
                  <select
                    aria-label="Categoria di prezzo"
                    value={i.category}
                    onChange={(e) =>
                      update(i.id, { category: e.target.value as CategoryId })
                    }
                  >
                    {SELECTABLE_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {CATEGORY_LABELS[c]}
                      </option>
                    ))}
                  </select>
                </td>
                <ScheduleCell
                  item={i}
                  startMonth={startMonth}
                  onChange={(schedule) => update(i.id, { schedule })}
                />
                <td>
                  <input
                    aria-label={`Importo di ${i.label}`}
                    type="number"
                    min={0}
                    step={5}
                    value={i.amount}
                    onChange={(e) =>
                      update(i.id, { amount: Number(e.target.value) })
                    }
                    style={{ width: 90 }}
                  />
                  <span className="muted small"> € {amountSuffix(i.schedule)}</span>
                  <AmountHint item={i} />
                </td>
                {i.schedule.kind === 'installments' ? (
                  <td>
                    <div className="hint" style={{ whiteSpace: 'normal', maxWidth: 190 }}>
                      Rata fissa: un importo concordato non segue l’inflazione.
                    </div>
                  </td>
                ) : (
                  <GrowthCell
                    item={i}
                    predicted={forecastRates.get(i.category)}
                    onChange={(v) => update(i.id, { growthOverride: v })}
                  />
                )}
                <td>
                  <button
                    className="btn danger"
                    type="button"
                    aria-label={`Rimuovi ${i.label}`}
                    onClick={() => onChange(items.filter((x) => x.id !== i.id))}
                  >
                    Rimuovi
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="row" style={{ marginTop: 10 }}>
        <button
          className="btn"
          type="button"
          onClick={() =>
            onChange([
              ...items,
              {
                id: `v-${Date.now().toString(36)}`,
                label: 'Nuova voce',
                category: 'misc',
                amount: 0,
                schedule: MONTHLY,
                growthOverride: null,
              },
            ])
          }
        >
          Aggiungi voce
        </button>
      </div>
      <p className="hint" style={{ marginBottom: 0 }}>
        La categoria di prezzo decide quale indice di inflazione viene applicato
        alla voce: l’energia e gli alimentari si comportano in modo molto
        diverso dalla media. La crescita mostrata è già quella prevista
        dal modello per quella categoria: scrivi un valore solo se vuoi
        sostituirla con una tua ipotesi. Per le spese che non arrivano ogni
        mese scegli la cadenza in «Quando»: l’importo è quello di ogni
        addebito, e il grafico mensile lo mostra nel mese in cui lo paghi.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------

type Preset = 'm1' | 'm2' | 'm3' | 'm6' | 'm12' | 'rate' | 'once';

const PRESETS: { id: Preset; label: string }[] = [
  { id: 'm1', label: 'Ogni mese' },
  { id: 'm2', label: 'Ogni 2 mesi' },
  { id: 'm3', label: 'Ogni 3 mesi' },
  { id: 'm6', label: 'Ogni 6 mesi' },
  { id: 'm12', label: 'Una volta l’anno' },
  { id: 'rate', label: 'A rate' },
  { id: 'once', label: 'Una tantum' },
];

function presetOf(s: ExpenseSchedule): Preset {
  if (s.kind === 'installments') return 'rate';
  if (s.kind === 'once') return 'once';
  const n = s.everyMonths;
  return n === 12 ? 'm12' : n === 6 ? 'm6' : n === 3 || n === 4 ? 'm3' : n === 2 ? 'm2' : 'm1';
}

function amountSuffix(s: ExpenseSchedule): string {
  switch (presetOf(s)) {
    case 'm1':
      return 'al mese';
    case 'm12':
      return 'l’anno';
    case 'rate':
      return 'a rata';
    case 'once':
      return 'una volta';
    default:
      return 'ad addebito';
  }
}

function AmountHint({ item }: { item: ExpenseItem }): JSX.Element {
  const s = item.schedule;
  let text: string | null = null;
  if (s.kind === 'recurring' && s.everyMonths > 1) {
    text = `circa ${eur(monthlyEquivalent(item))} al mese`;
  } else if (s.kind === 'installments') {
    text = `totale ${eur(item.amount * s.count)}`;
  }
  if (!text) return <></>;
  return <div className="hint">{text}</div>;
}

/**
 * Cella della cadenza: un menu di preset e, sotto, solo i campi che servono
 * a quel preset (il mese dell'addebito annuale, numero e inizio delle rate,
 * la data della spesa una tantum).
 */
function ScheduleCell({
  item,
  startMonth,
  onChange,
}: {
  item: ExpenseItem;
  startMonth: string;
  onChange: (s: ExpenseSchedule) => void;
}): JSX.Element {
  const s = item.schedule;
  const preset = presetOf(s);
  const startCal = Number(startMonth.slice(5, 7));

  const choose = (p: Preset): void => {
    const month = s.kind === 'recurring' ? s.month : startCal;
    switch (p) {
      case 'rate':
        onChange({ kind: 'installments', firstMonth: startMonth, count: 12, everyMonths: 1 });
        return;
      case 'once':
        onChange({ kind: 'once', month: startMonth });
        return;
      default:
        onChange({ kind: 'recurring', everyMonths: Number(p.slice(1)), month });
    }
  };

  return (
    <td style={{ textAlign: 'left' }}>
      <select
        aria-label={`Cadenza di ${item.label}`}
        value={preset}
        onChange={(e) => choose(e.target.value as Preset)}
      >
        {PRESETS.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>

      {s.kind === 'recurring' && s.everyMonths > 1 && (
        <div className="row" style={{ marginTop: 4, flexWrap: 'nowrap' }}>
          <span className="small muted">{s.everyMonths === 12 ? 'a' : 'anche a'}</span>
          <select
            aria-label={`Mese di addebito di ${item.label}`}
            value={s.month}
            onChange={(e) => onChange({ ...s, month: Number(e.target.value) })}
          >
            {MONTH_NAMES.map((m, k) => (
              <option key={m} value={k + 1}>
                {m}
              </option>
            ))}
          </select>
        </div>
      )}

      {s.kind === 'installments' && (
        <div style={{ marginTop: 4 }}>
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <input
              aria-label={`Numero di rate di ${item.label}`}
              type="number"
              min={1}
              max={360}
              step={1}
              value={s.count}
              onChange={(e) =>
                onChange({ ...s, count: Math.max(1, Math.round(Number(e.target.value))) })
              }
              style={{ width: 64 }}
            />
            <select
              aria-label={`Frequenza delle rate di ${item.label}`}
              value={s.everyMonths}
              onChange={(e) => onChange({ ...s, everyMonths: Number(e.target.value) })}
            >
              <option value={1}>rate mensili</option>
              <option value={2}>rate bimestrali</option>
              <option value={3}>rate trimestrali</option>
              <option value={4}>rate quadrimestrali</option>
              <option value={6}>rate semestrali</option>
            </select>
          </div>
          <div className="row" style={{ marginTop: 4, flexWrap: 'nowrap' }}>
            <span className="small muted">prima rata</span>
            <MonthPicker
              label={`Prima rata di ${item.label}`}
              value={s.firstMonth}
              startMonth={startMonth}
              pastYears={5}
              onChange={(firstMonth) => onChange({ ...s, firstMonth })}
            />
          </div>
          <div className="hint">ultima rata {aMese(lastInstallment(s))}</div>
        </div>
      )}

      {s.kind === 'once' && (
        <div className="row" style={{ marginTop: 4, flexWrap: 'nowrap' }}>
          <span className="small muted">a</span>
          <MonthPicker
            label={`Mese di ${item.label}`}
            value={s.month}
            startMonth={startMonth}
            pastYears={0}
            onChange={(month) => onChange({ ...s, month })}
          />
        </div>
      )}

      {s.kind === 'recurring' && s.everyMonths > 1 && s.everyMonths < 12 && (
        <div className="hint">{describeSchedule(s)}</div>
      )}
    </td>
  );
}

/**
 * Scelta di un mese con due menu, mese e anno. `<input type="month">` non è
 * supportato da tutti i browser e altrove diventa un campo di testo libero.
 */
function MonthPicker({
  label,
  value,
  startMonth,
  pastYears,
  onChange,
}: {
  label: string;
  value: string;
  startMonth: string;
  pastYears: number;
  onChange: (t: string) => void;
}): JSX.Element {
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const first = Number(startMonth.slice(0, 4)) - pastYears;
  const years = Array.from({ length: pastYears + 31 }, (_, k) => first + k);
  if (!years.includes(year)) years.unshift(year);
  const emit = (y: number, m: number): void =>
    onChange(`${y}-${String(m).padStart(2, '0')}`);

  return (
    <>
      <select
        aria-label={`${label}: mese`}
        value={month}
        onChange={(e) => emit(year, Number(e.target.value))}
      >
        {MONTH_NAMES.map((m, k) => (
          <option key={m} value={k + 1}>
            {m.slice(0, 3)}
          </option>
        ))}
      </select>
      <select
        aria-label={`${label}: anno`}
        value={year}
        onChange={(e) => emit(Number(e.target.value), month)}
      >
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    </>
  );
}

/**
 * Cella della crescita annua.
 *
 * Mostra la previsione del modello come valore di partenza, così la stima
 * è visibile già in configurazione invece di restare nascosta nei
 * grafici. Scrivendo un numero la si sostituisce, e un pulsante riporta alla
 * previsione automatica.
 */
function GrowthCell({
  item,
  predicted,
  onChange,
}: {
  item: ExpenseItem;
  predicted: number | undefined;
  onChange: (v: number | null) => void;
}): JSX.Element {
  const overridden = item.growthOverride !== null;
  const shown = overridden ? item.growthOverride! : (predicted ?? 0);

  return (
    <td>
      <input
        aria-label={`Crescita annua per ${item.label}`}
        type="number"
        step={0.1}
        value={Number((shown * 100).toFixed(2))}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        style={{
          width: 72,
          borderStyle: overridden ? 'solid' : 'dashed',
          color: overridden ? 'var(--text-primary)' : 'var(--text-secondary)',
        }}
      />
      <span className="muted small"> %/anno</span>
      <div className="hint" style={{ whiteSpace: 'normal', maxWidth: 190 }}>
        {overridden ? (
          <>
            Ipotesi tua.{' '}
            <button
              type="button"
              className="btn"
              style={{ padding: '0 5px', fontSize: 11 }}
              onClick={() => onChange(null)}
            >
              usa la previsione
              {predicted !== undefined ? ` (${pct(predicted)})` : ''}
            </button>
          </>
        ) : (
          'Previsione del modello per questa categoria.'
        )}
      </div>
    </td>
  );
}

// ---------------------------------------------------------------------------

const ENERGY_CLASSES: EnergyClass[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];

/**
 * Confronto con il mercato per chi affitta una stanza: la stima del prezzo
 * delle stanze simili, le ipotesi modificabili e l'anteprima dei rinnovi.
 */
function RoomMarketPanel({
  housing,
  outlook,
  onSharing,
  onHousing,
}: {
  housing: Profile['housing'];
  outlook: RentOutlook | null;
  onSharing: (patch: Partial<SharingConfig>) => void;
  onHousing: (patch: Partial<Profile['housing']>) => void;
}): JSX.Element {
  const sharing = housing.sharing!;
  const proposed = proposedQualityAdjustment(sharing);
  const usingComparable = sharing.comparableRent !== null && sharing.comparableRent > 0;
  const adjustment = sharing.qualityAdjustment ?? proposed.value;

  return (
    <div className="notice info" style={{ marginTop: 12, marginBottom: 0 }}>
      {outlook?.benchmark ? (
        <>
          {gapSentence(outlook)}
          <BenchmarkSteps benchmark={outlook.benchmark} />
        </>
      ) : (
        <span className="muted">Calcolo il prezzo delle stanze simili…</span>
      )}

      <div className="grid" style={{ marginTop: 12 }}>
        {!usingComparable && (
          <div className="field">
            <label htmlFor="sh-quality">
              Correzione per la qualità della casa: {pctSigned(adjustment, 0)}
            </label>
            <input
              id="sh-quality"
              type="range"
              min={-0.2}
              max={0.2}
              step={0.01}
              value={adjustment}
              onChange={(e) =>
                onSharing({ qualityAdjustment: Number(e.target.value) })
              }
            />
            <span className="hint">
              {sharing.qualityAdjustment === null
                ? proposed.reasons.length > 0
                  ? `Proposta: ${proposed.reasons.join(', ')}. Ipotesi: nessun dato pubblico misura questi effetti sulle stanze.`
                  : 'Indica bagni e classe energetica per una proposta, o sposta tu il valore se la casa è migliore o peggiore della media.'
                : 'Valore scelto da te.'}{' '}
              {sharing.qualityAdjustment !== null && (
                <button
                  type="button"
                  className="btn"
                  style={{ padding: '0 5px', fontSize: 11 }}
                  onClick={() => onSharing({ qualityAdjustment: null })}
                >
                  usa la proposta ({pct(proposed.value, 0)})
                </button>
              )}
            </span>
          </div>
        )}

        <div className="field">
          <label htmlFor="sh-catchup">
            A ogni rinnovo il proprietario recupera il{' '}
            {pct(housing.renewalCatchUp, 0)} del divario
          </label>
          <input
            id="sh-catchup"
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={housing.renewalCatchUp}
            onChange={(e) => onHousing({ renewalCatchUp: Number(e.target.value) })}
          />
          <span className="hint">
            Ipotesi: non esistono dati su come si rinegozia con chi è già in
            casa. 0% = solo inflazione, 100% = subito al prezzo di mercato. Di
            solito si recupera un po’ alla volta, per non perdere un inquilino
            affidabile.
          </span>
        </div>
      </div>

      {outlook && (
        <div style={{ marginTop: 10 }}>
          <strong className="small">Prossimi rinnovi</strong>
          <RenewalTable outlook={outlook} limit={3} />
        </div>
      )}
    </div>
  );
}

/** Prossimo mese in cui il contratto si rinegozia, a partire da oggi. */
function nextRenewal(housing: Profile['housing'], startMonth: string): string | null {
  if (housing.contractType === 'proprieta') return null;
  const term = contractTerm(housing.contractType, housing.contractYears);
  const cycle = Math.max(1, Math.round((term.first + term.renewal) * 12));
  const start = monthIndex(housing.contractStart ?? startMonth);
  const now = monthIndex(startMonth);
  let k = 1;
  while (start + k * cycle <= now) k++;
  return monthLabel(start + k * cycle);
}
