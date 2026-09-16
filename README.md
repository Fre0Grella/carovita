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
- **Spese non mensili**: bollette ogni 2, 3 o 6 mesi, premi annuali in un mese
  fisso, pagamenti a rate e spese una tantum future, ciascuna nel mese in cui
  la paghi.
- **Coabitazione**: parti dal canone della tua stanza (o da quello
  dell'intero appartamento, ripartito per metrature), con camera doppia e
  imposte a carico del solo intestatario.
- **Aumenti ai rinnovi**: il tuo canone confrontato con il prezzo delle stanze
  simili, e una previsione di quanto potrebbe salire a ogni scadenza del
  contratto.
- **Previsione** da un anno e mezzo a 30 anni per categoria, con bande di
  incertezza. Gli importi sono in euro correnti, con accanto il loro valore in
  euro di oggi: l'inflazione si vede, invece di stare dietro un interruttore.
- **Mese per mese**: entrate e uscite con una barra per mese e una linea per
  ogni mese fino a tre anni, una linea ogni sei mesi sugli orizzonti lunghi.
- **Anno per anno**: uno slider per mettere un anno futuro accanto al primo —
  reddito, spese, risparmi o perdite, patrimonio e il prezzo di ogni singola
  voce.
- **Patrimonio**: quanto ti resta mese per mese, con la soglia dello zero e
  il mese in cui i risparmi si esaurirebbero, anche nello scenario peggiore.
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
- alla scadenza si firma un contratto nuovo e il canone **salta** al livello
  di mercato corrente, recuperando di colpo tutto il divario accumulato. Il
  salto avviene anche restando nella stessa casa: con il vecchio contratto
  decadono sia il tetto del 75% sia il blocco della cedolare secca, che vale
  per quel contratto e non in perpetuo.

Il risultato è la tipica funzione a gradini che chi affitta conosce bene, e
modellarla come crescita liscia sottostima i costi di chi si sposta spesso.
Sono modellate anche l'imposta di registro (2%, minimo 67 €, ripartibile fra le
parti, ridotta del 30% per il concordato nei comuni ad alta tensione abitativa)
e l'imposta di bollo.

### La previsione è visibile dove si configura

Ogni voce di spesa mostra **già compilata** la crescita annua che il modello
prevede per quella categoria — l'energia al 3,4% l'anno, internet al −1%,
gli alimentari al 2%. Non è un campo vuoto da riempire a intuito: è la stima
che verrà davvero applicata, esposta dove si prendono le decisioni invece che
nascosta nei grafici.

Il numero mostrato è il **tasso composto equivalente** sull'orizzonte scelto:
il modello prevede un tasso diverso ogni anno, perché lo scostamento iniziale
rientra gradualmente, e quello è il valore costante che porta allo stesso
livello finale.

Chi ha informazioni che il modello non può avere — un abbonamento che scade,
un figlio all'asilo — può **sostituire la previsione** con la propria. In quel
caso l'aumento viene attribuito interamente a quell'ipotesi, e attorno alla
voce non viene disegnata alcuna banda di confidenza: l'incertezza misurata è
quella del modello, non quella di una scelta personale.

### Coabitazione

La quota di canone si calcola come **la tua camera più la tua parte di spazi
comuni**:

```
quota = (camera privata pro capite + (m² totali − m² camere) / persone) / m² totali
```

Una camera doppia conta per metà, perché quello spazio lo dividi. La
costruzione garantisce che le quote di tutti i coinquilini **sommino
esattamente a 1**: nessun euro di canone sparisce né viene contato due volte,
ed è verificato da un test.

Due dettagli che è facile sbagliare e che qui sono modellati:

- il **minimo di 67 €** dell'imposta di registro vale per il contratto, non
  per persona: si applica prima di ripartire, altrimenti ogni coinquilino
  pagherebbe l'intero minimo;
- chi **non è intestatario** del contratto non deve nulla al fisco — paga
  l'affitto al coinquilino che ha firmato, unico obbligato.

Le spese condominiali si dividono invece in parti uguali: cucina, pulizie e
ascensore non dipendono da quanto è grande la tua camera.

### Stanze: prezzo di mercato e aumenti ai rinnovi

Chi affitta una stanza sotto il prezzo di stanze simili se lo aspetta: prima o
poi, a un rinnovo, arriva l'aumento. Il modello rende quel ragionamento
esplicito.

**Il prezzo delle stanze simili** parte dal prezzo medio richiesto per una
stanza singola pubblicato da Immobiliare.it Insights (agosto 2026) per 21
città. Per gli altri comuni si ricava dal canone al metro quadro: nelle 21
città una singola costa in media quanto **45 m²** di appartamento
semicentrale, con una dispersione fra città del 14% (il test lo riverifica sui
dati). Poi, ciascuna marcata come dato, derivazione o ipotesi:

- la zona sposta la stima di metà dello scarto osservato fra quartieri a Milano
  e Roma;
- un posto letto in doppia vale circa il 70% di una singola (**ipotesi**: non ci
  sono dati pubblici affidabili);
- classe energetica e persone per bagno correggono di qualche punto
  (**ipotesi**, modificabile).

La metratura della stanza non corregge la stima: servirebbe la superficie di
una «stanza media», che nessuno pubblica. Il confronto più affidabile resta
quello che l'utente conosce, **quanto pagano stanze davvero simili**, che
sostituisce la stima.

**Quando**: il canone cambia solo quando il contratto si rinegozia. Un
contratto per studenti si rinnova una volta in automatico, quindi un contratto
di un anno cambia prezzo ogni due. Inserendo la data di inizio, l'aumento cade
nel mese giusto.

**Quanto**: a ogni rinnovo il proprietario recupera una parte del divario, mai
un ribasso, con importi arrotondati ai cinque euro. La quota recuperata è
un'**ipotesi dichiarata** (un terzo, modificabile): non esistono dati su come si
rinegozia con chi è già in casa. La banda della previsione va da «nessun
recupero» a «subito al prezzo alto delle stanze simili». Con stanze simili a
280 euro e un canone di 210, il modello prevede 235, poi 260, poi 280.

### I periodi partono da oggi, non da gennaio

Le proiezioni scorrono in finestre di dodici mesi **a partire dal mese
corrente**: aprendo l'applicazione a settembre il primo periodo è «set 2026 –
ago 2027», non l'anno solare 2026. Ancorare i conti all'anno solare
imputerebbe una spesa annua intera a un anno di cui restano tre mesi, e
falserebbe soprattutto il patrimonio, che parte da oggi.

L'orizzonte può essere frazionario: a un anno e mezzo l'ultimo periodo copre
sei mesi, invece di arrotondare a due anni interi. I tassi di crescita
confrontano i primi e gli ultimi dodici mesi, altrimenti un periodo pieno
messo accanto a uno dimezzato darebbe una crescita fittiziamente negativa.

### Ogni uscita nel suo mese

I periodi di dodici mesi restano l'unità in cui vivono le regole: la stima
dell'inflazione è annuale, e lo sono gli scatti ISTAT e l'imposta di registro.
Dentro ogni periodo la proiezione è però scomposta **mese per mese**, e la somma
dei mesi coincide esattamente con il totale del periodo (è verificato da un
test):

- le voci mensili costano ogni mese l'importo rivalutato al livello dei prezzi
  del periodo: i prezzi si aggiornano ogni dodici mesi, e le uscite salgono a
  gradini;
- le voci **ricorrenti non mensili** pesano tutte sul mese dell'addebito;
  un periodo parziale che non contiene quel mese non le conta, invece di
  imputarne una frazione;
- le **rate** sono un importo fisso concordato: non seguono l'inflazione e non
  hanno banda di incertezza;
- le spese **una tantum** future sono espresse ai prezzi di oggi e rivalutate
  con la loro categoria fino alla data;
- canone e condominio si pagano ogni mese, le imposte del contratto alla
  ricorrenza annuale;
- la **tredicesima** arriva a dicembre e la **quattordicesima** a luglio, e il
  rendimento dei risparmi si capitalizza mese per mese.

Il risultato è un patrimonio che può andare sotto zero a marzo, quando arriva
l'assicurazione, e tornare sopra a dicembre: un mese in rosso che un conto
annuale non vedrebbe.

### Le incertezze non si sommano

Le bande delle singole categorie **non** si sommano fra loro. Sommarle
equivarrebbe ad assumere che energia, alimentari, affitto e trasporti sbaglino
tutti nella stessa direzione nello stesso anno. Si aggregano invece con la
correlazione media osservata fra le categorie, che su questi dati vale **0,20**:

```
Var = (1 − ρ) · Σ hᵢ²  +  ρ · (Σ hᵢ)²
```

Con ρ = 1 si ritrova la somma lineare, con ρ = 0 la somma in quadratura. Sul
totale di spesa la differenza è visibile; sul patrimonio è vistosa, perché il
risparmio è la differenza fra due numeri grandi e vicini e ne eredita l'errore
amplificato. È anche il motivo per cui la banda sul patrimonio resta larga
anche dopo la correzione: quella larghezza è reale, non un artefatto.

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

La validazione usa lo stesso innesco della produzione: entrambe partono
dall'ultimo tendenziale disponibile, misurato nel mese di aggiornamento della
serie. Non è un dettaglio: fra il tendenziale di agosto e quello del dicembre
precedente, l'energia può differire di diciotto punti percentuali, e validare
un innesco diverso da quello spedito significherebbe dichiarare una
calibrazione mai misurata.

**Limite noto, misurato e dichiarato:** le bande di incertezza sono ben
calibrate a uno o due anni (copertura reale ~78% contro l'80% dichiarato), ma
diventano troppo strette sugli orizzonti lunghi (~66% a dieci anni). In
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
| Prezzo delle stanze singole | **Immobiliare.it Insights**, agosto 2026 | media degli annunci in 21 città, ripresa dal comunicato |

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
npm test          # 127 test: invarianti di dominio + integrazione sui dati veri
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
  rent.ts      regole contrattuali degli affitti, imposte e rinnovi, mese per mese
  rooms.ts     prezzo di mercato delle stanze e sua stima
  schedule.ts  calendario degli addebiti: cadenze, rate, spese una tantum
  project.ts   da (profilo + dati) a previsione mensile con attribuzione
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
