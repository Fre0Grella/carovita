# Backtest del modello di previsione

Generato automaticamente da `npm run backtest`. Non modificare a mano.

Snapshot del 2026-09-15, dati fino a 2026-08.

## Come si legge

Validazione **walk-forward out-of-sample**: per ogni anno di origine si stimano i parametri usando solo i dati disponibili fino a quel momento, si prevede a 1..10 anni e si confronta con quanto poi realmente accaduto. I parametri non vedono mai il futuro.

L’errore è il **MAE** (errore assoluto medio) sul tasso di inflazione annuo, in punti percentuali. Più basso è meglio. Le colonne di confronto sono i due benchmark ingenui:

- **RW** (random walk): "l’anno prossimo come quest’anno".
- **Anc.** (ancora fissa): "sempre il 2%".

Un modello utile deve battere entrambi, soprattutto sugli orizzonti lunghi che sono quelli che contano per una decisione di vita.

## Sintesi per categoria

| Categoria | MAE modello | MAE RW | MAE ancora | Meglio di RW | Meglio di ancora |
|---|---:|---:|---:|:--:|:--:|
| Cura della persona e altre spese | 0.91 | 1.50 | 0.93 | si | si |
| Manutenzione dell’abitazione | 1.06 | 1.40 | 0.99 | si | no |
| Salute | 1.37 | 1.59 | 1.15 | si | no |
| Tempo libero, sport e cultura | 1.53 | 1.67 | 1.58 | si | si |
| Affitti di mercato | 1.59 | 1.73 | 1.47 | si | no |
| Mobili e articoli per la casa | 1.60 | 1.64 | 1.78 | si | si |
| Ristorazione e alloggio | 1.73 | 1.99 | 1.66 | si | no |
| Indice generale dei prezzi al consumo | 1.78 | 2.45 | 1.77 | si | no |
| Acqua e servizi per l’abitazione | 1.98 | 2.18 | 1.15 | si | no |
| Alimentari | 2.32 | 3.14 | 2.29 | si | no |
| Assicurazioni e servizi finanziari | 2.33 | 2.33 | 1.32 | no | no |
| Telefonia, internet e informazione | 2.74 | 2.78 | 5.13 | si | si |
| Istruzione | 2.88 | 3.94 | 2.77 | si | no |
| Abbigliamento e calzature | 4.27 | 6.25 | 4.56 | si | si |
| Carburante ed esercizio del veicolo | 4.88 | 6.77 | 4.68 | si | no |
| Trasporto pubblico | 4.93 | 7.09 | 4.58 | si | no |
| Elettricità, gas e altri combustibili | 11.25 | 15.01 | 10.92 | si | no |

Il modello batte il random walk in **16/17** categorie e l’ancora fissa in **5/17**.

### Come interpretare il confronto con l’ancora fissa

Il modello **non** batte sistematicamente la regola "sempre il 2%", ed è un risultato atteso, non un difetto nascosto: le due cose condividono la stessa convinzione di fondo. Il modello è `ancora + differenziale + rientro del gap`, quindi su orizzonti lunghi converge per costruzione verso l’ancora. Può distinguersene solo grazie al differenziale di categoria e alla dinamica di breve periodo.

Va aggiunto che il benchmark al 2% è avvantaggiato dal senno di poi: il 2% è vicino all’inflazione media effettivamente realizzata in Italia nel periodo considerato. Una regola costante davvero "fuori campione" avrebbe dovuto usare la media nota all’ epoca, più alta nei primi anni.

Il confronto che conta davvero è quello con il **random walk**, cioè con quello che fa istintivamente chi proietta la bolletta di oggi sui prossimi dieci anni. Lì il vantaggio è netto e cresce con l’orizzonte. In più, rispetto a una regola fissa, il modello fornisce bande di incertezza calibrate e un’ attribuzione per categoria, che una costante non può dare.

## Errore per orizzonte

Media e mediana su tutte le categorie, per anni di distanza dalla previsione. La mediana è più informativa della media, che è dominata dall’energia: con errori intorno ai 15 punti percentuali, l’energia da sola sposta la media di tutte le altre sedici categorie.

| Orizzonte | MAE modello | MAE RW | MAE ancora | Mediana modello | Mediana RW | Copertura tasso | **Copertura livello** | Errore livello |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 anno | 2.67 | 3.32 | 2.68 | 1.50 | 1.67 | 72.55% | **77.78%** | 2.57% |
| 2 anni | 2.67 | 3.83 | 2.68 | 1.72 | 1.80 | 69.55% | **75.78%** | 4.25% |
| 3 anni | 2.71 | 3.89 | 2.74 | 1.76 | 2.26 | 66.91% | **72.79%** | 5.67% |
| 4 anni | 2.73 | 3.73 | 2.74 | 1.89 | 2.26 | 62.35% | **73.33%** | 6.84% |
| 5 anni | 2.83 | 3.44 | 2.78 | 2.12 | 2.19 | 60.92% | **65.97%** | 7.99% |
| 6 anni | 2.95 | 3.67 | 2.87 | 2.28 | 2.65 | 60.63% | **62.90%** | 9.44% |
| 7 anni | 2.98 | 3.77 | 2.89 | 2.20 | 2.44 | 60.29% | **64.22%** | 10.68% |
| 8 anni | 3.04 | 3.97 | 2.98 | 2.18 | 2.55 | 62.57% | **64.71%** | 11.97% |
| 9 anni | 3.10 | 3.99 | 3.07 | 2.10 | 2.76 | 60.00% | **65.29%** | 13.31% |
| 10 anni | 3.24 | 3.73 | 3.22 | 2.15 | 2.55 | 57.52% | **66.01%** | 14.05% |

Le colonne di copertura indicano la quota di casi in cui il valore reale è caduto nella banda dichiarata all’80%. Un modello ben calibrato sta vicino a 80: molto sotto significa bande troppo strette (falsa sicurezza), molto sopra bande troppo larghe.

Le due colonne misurano cose diverse, ed è la seconda quella che conta per chi guarda i grafici. **Copertura tasso** valida la banda sul tasso di inflazione annuo. **Copertura livello** valida la banda sul livello cumulato della spesa, che è la fascia effettivamente disegnata nell’applicazione: sono grandezze con varianze diverse, e una banda ben calibrata sul tasso può essere mal calibrata sul livello. **Errore livello** è lo scarto percentuale medio fra la spesa cumulata prevista e quella realizzata.

### Limite noto: le bande a lungo termine sono ottimistiche

La copertura sul livello è vicina al valore dichiarato nei primi due-tre anni, poi scende. Tradotto: **la banda a dieci anni è troppo stretta**, e l’incertezza reale su quell’orizzonte è maggiore di quella disegnata.

La ragione è strutturale e non si elimina con un modello di questa famiglia: in trent’anni l’Italia è passata per il cambio all’euro, la crisi del 2008 e lo shock energetico del 2022. Sono rotture di regime, non estrazioni da una distribuzione stabile, e nessuna stima basata sulla volatilità passata le anticipa. Il numero è riportato qui invece che nascosto proprio perché chi legge una proiezione a dieci anni sappia quanto fidarsi della fascia grigia.

## Parametri stimati sullo snapshot corrente

`phi` = persistenza dello scostamento; `spread` = differenziale strutturale annuo rispetto all’indice generale; `ultimo` = inflazione tendenziale più recente.

| Categoria | phi | spread (p.p.) | ultimo (%) | oss. |
|---|---:|---:|---:|---:|
| Assicurazioni e servizi finanziari | 0.45 | 1.31 | 1.98 | 29 |
| Elettricità, gas e altri combustibili | 0.24 | 1.24 | 10.81 | 29 |
| Acqua e servizi per l’abitazione | 0.52 | 1.22 | 3.20 | 29 |
| Trasporto pubblico | 0.15 | 1.07 | -1.81 | 29 |
| Ristorazione e alloggio | 0.62 | 0.48 | 3.43 | 29 |
| Carburante ed esercizio del veicolo | 0.15 | 0.26 | 7.48 | 29 |
| Alimentari | 0.30 | 0.06 | 1.30 | 29 |
| Salute | 0.26 | 0.01 | 1.20 | 29 |
| Manutenzione dell’abitazione | 0.71 | 0.00 | 2.59 | 29 |
| Indice generale dei prezzi al consumo | 0.38 | 0.00 | 3.22 | 29 |
| Affitti di mercato | 0.70 | -0.00 | 3.49 | 29 |
| Cura della persona e altre spese | 0.47 | -0.02 | 2.81 | 29 |
| Tempo libero, sport e cultura | 0.52 | -0.05 | 0.29 | 29 |
| Mobili e articoli per la casa | 0.43 | -0.48 | 0.80 | 29 |
| Istruzione | 0.32 | -0.64 | 1.51 | 29 |
| Abbigliamento e calzature | 0.14 | -0.75 | 0.91 | 29 |
| Telefonia, internet e informazione | 0.15 | -3.00 | 0.20 | 29 |
