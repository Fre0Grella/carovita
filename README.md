# Carovita

Budgeting e previsione del costo della vita in Italia. Configuri uno o più
profili di spesa, e l'applicazione proietta come evolvono nei prossimi anni
usando l'inflazione reale per categoria, spiegando voce per voce da dove viene
ogni aumento.

Serve a rispondere a domande che si decidono una volta e poi pesano per anni:
conviene un bilocale in centro o un trilocale in periferia? Quanto costa
davvero cambiare città? Quanto mi protegge la cedolare secca?

Applicazione statica, gira su GitHub Pages. Tutto il calcolo avviene nel
browser e nessuna configurazione lascia il dispositivo.

## Cosa fa

- **Configurazione** di affitto (contratto, imposte di registro e bollo,
  cedolare secca, condominio), utenze e spese, con selettore fra tutti i 7.904
  comuni italiani.
- **Previsione** a 3–30 anni per categoria, con bande di incertezza e valori
  sia in euro correnti sia in euro di oggi.
- **Spiegazione** di ogni categoria: quanta parte dell'aumento viene
  dall'inflazione generale, quanta dal differenziale della categoria, quanta
  dal rientro dalla situazione attuale, quanta dalle regole del contratto.
- **Confronto** fra più profili, con la differenza di spesa cumulata e di
  patrimonio finale.

## Come funziona la previsione

L'errore più comune è proiettare all'infinito l'inflazione di oggi. Nel 2022
l'energia in Italia ha superato il +50% annuo: proiettarlo per dieci anni
avrebbe previsto bollette cinquantasette volte più care. Nel 2025 l'energia era
in calo.

Il modello usa invece il classico **gap di inflazione con ritorno alla media**:

```
π(t+h) = μ + φ^h · (π(t) − μ)        μ = ancora + differenziale di categoria
```

Si parte dall'inflazione osservata e la si fa rientrare gradualmente verso un
valore di lungo periodo, pari all'obiettivo BCE più il differenziale storico
della categoria. La velocità del rientro (`φ`) è stimata dai dati.

Sia `φ` sia il differenziale vengono **ristretti verso il valore prudente** in
proporzione al loro rapporto segnale/rumore: dove il dato storico è ampio e
stabile (la telefonia, che cala da trent'anni) resta quasi intatto; dove è
piccolo rispetto alla sua variabilità viene azzerato, e la categoria torna a
seguire l'indice generale.

Ancorare al *differenziale* invece che a un valore assoluto tiene lo scenario
coerente: se sposti l'inflazione generale al 4%, tutte le categorie si muovono
insieme mantenendo i rapporti storici.

### L'affitto non segue l'inflazione degli affitti

Per tutte le altre voci basta moltiplicare per un indice di prezzo. Per
l'affitto sarebbe sbagliato. L'indice `CP041` misura il canone *medio di
mercato*, ma chi ha un contratto in corso non paga il canone di mercato:

- durante il contratto il canone può salire al massimo del **75% della
  variazione FOI** (art. 32 L. 392/1978), quindi cresce meno del mercato;
- con la **cedolare secca** il locatore rinuncia per legge ad aggiornarlo, e
  resta fermo in euro per tutta la durata;
- alla scadenza, se si cambia casa, **salta** al livello di mercato corrente,
  recuperando di colpo tutto il divario accumulato.

Il risultato è la tipica funzione a gradini che chi affitta conosce bene, e
modellarla come crescita liscia sottostima i costi di chi si sposta spesso.
Sono modellate anche l'imposta di registro (2%, minimo 67 €, ripartibile fra le
parti, ridotta del 30% per il concordato nei comuni ad alta tensione abitativa)
e l'imposta di bollo.

### Validazione

Il modello è validato **fuori campione** con un walk-forward: si tronca la
storia a un certo anno, si stimano i parametri con i soli dati disponibili fino
a quel punto, si prevede a 1–10 anni e si confronta con quanto è realmente
accaduto. I risultati completi, con due benchmark ingenui, sono in
[`docs/BACKTEST.md`](docs/BACKTEST.md) e vengono rigenerati a ogni
aggiornamento dei dati.

In sintesi: il modello batte nettamente il *random walk* ("l'anno prossimo come
quest'anno"), che è ciò che si fa istintivamente, ed è sostanzialmente alla pari
con la regola fissa "sempre il 2%" — risultato atteso, dato che entrambi
condividono la stessa ancora di lungo periodo.

**Limite noto, misurato e dichiarato:** le bande di incertezza sono ben
calibrate a uno o due anni (copertura reale ~80% contro l'80% dichiarato), ma
diventano troppo strette sugli orizzonti lunghi (~60% a dieci anni). In
trent'anni l'Italia è passata per il cambio all'euro, la crisi del 2008 e lo
shock energetico del 2022: sono rotture di regime, che nessuna stima basata
sulla volatilità passata riesce ad anticipare. Una proiezione a dieci anni va
letta come ordine di grandezza.

## Da dove vengono i dati

| Cosa | Fonte | Dettaglio |
|---|---|---|
| Indici dei prezzi per categoria | **Eurostat** | `prc_hicp_minr`, indice armonizzato italiano, ECOICOP 2, mensile dal 1996 |
| Indice FOI per i canoni | **ISTAT** | SDMX, FOI al netto dei tabacchi, raccordato sulle quattro basi d'indice dal 1996 |
| Anagrafica dei comuni | elenco ufficiale ISTAT dei codici dei comuni | 7.904 comuni |
| Canoni al metro quadro | baseline indicativa inclusa nel progetto | **non** quotazioni OMI ufficiali — vedi sotto |

> **Attenzione al cambio di classificazione.** Il 4 febbraio 2026 Eurostat è
> passata da ECOICOP 1 a ECOICOP 2. I vecchi dataset (`prc_hicp_midx`,
> `prc_hicp_manr`) rispondono ancora con HTTP 200 ma sono **congelati** a
> dicembre 2025. La pipeline usa il dataset vivo e controlla esplicitamente la
> freschezza di ogni serie, perché un dato vecchio che sembra buono è peggio di
> un errore visibile.

### Sui canoni di locazione

La fonte autorevole sono le **quotazioni OMI** dell'Agenzia delle Entrate,
pubblicate ogni semestre per singola zona censuaria. Sono scaricabili
gratuitamente, ma **solo dall'area riservata previo accesso con SPID/CIE/
Entratel**: non esiste un endpoint pubblico interrogabile da una procedura
automatica, e il servizio di consultazione non va interrogato da programma.

I canoni al metro quadro inclusi qui sono quindi una baseline indicativa per
107 capoluoghi, estesa agli altri comuni in base al capoluogo di provincia e
alla popolazione (marcati come stimati). Servono solo perché l'applicazione
mostri qualcosa di sensato al primo avvio.

**Il dato più accurato è il canone che paghi davvero: inseriscilo a mano.** Chi
cita dati OMI deve indicare la fonte: "Agenzia Entrate - OMI".

## Sviluppo

```bash
npm install
npm run data:refresh   # scarica gli indici da Eurostat e ISTAT
npm run dev            # http://localhost:5173/carovita/
```

Altri comandi:

```bash
npm test          # 45 test: invarianti di dominio + integrazione sui dati veri
npm run typecheck
npm run backtest  # rigenera docs/BACKTEST.md
npm run build
npx tsx scripts/build-cities.ts   # rigenera l'anagrafica dei comuni
```

### Struttura

```
src/core/      motore di calcolo, puro: niente rete, filesystem o DOM
  types.ts     tipi di dominio
  series.ts    utilità sulle serie storiche
  model.ts     stima e previsione dell'inflazione per categoria
  rent.ts      regole contrattuali degli affitti e imposte
  project.ts   da (profilo + dati) a previsione con attribuzione
  backtest.ts  validazione walk-forward fuori campione
src/ui/        interfaccia React
scripts/       pipeline dati, eseguita in CI
public/data/   snapshot generati e versionati
```

Il modulo `core` è deliberatamente privo di effetti collaterali: prende uno
snapshot già scaricato e restituisce un risultato deterministico. È questo che
rende il backtest possibile e i test veloci.

### Aggiornamento automatico

Il workflow `Aggiorna i dati` gira due volte al mese, riscarica gli indici,
rigenera il backtest e committa. Se una fonte non risponde, **riusa i valori
precedenti e marca la corsa come parziale** invece di fallire: uno snapshot un
po' vecchio ma segnalato resta utilizzabile, un errore al posto dei dati no.

## Pubblicazione su GitHub Pages

Il workflow `Pubblica su Pages` parte a ogni push su `main`. Va abilitato una
volta sola: **Settings → Pages → Source: GitHub Actions**.

Il progetto è configurato per essere servito da `/carovita/` (`base` in
`vite.config.ts`): se rinomini la repository, aggiorna anche quel valore.

## Licenza

MIT. I dati Eurostat e ISTAT restano soggetti alle rispettive condizioni d'uso.
