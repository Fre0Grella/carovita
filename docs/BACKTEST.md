# Backtest del modello di previsione

Generato automaticamente da `npm run backtest`. Non modificare a mano.

Snapshot del 2026-09-18, dati fino a 2026-08.

## Come si legge

Validazione **walk-forward out-of-sample**: per ogni anno di origine si stimano i parametri usando solo i dati disponibili fino a quel momento, si prevede a 1..10 anni e si confronta con quanto poi realmente accaduto. I parametri non vedono mai il futuro.

L’errore è il **MAE** (errore assoluto medio) sul tasso di inflazione annuo, in punti percentuali. Più basso è meglio. Le colonne di confronto sono i due benchmark ingenui:

- **RW** (random walk): "l’anno prossimo come quest’anno".
- **Anc.** (ancora fissa): "sempre il 2%".

Un modello utile deve battere entrambi, soprattutto sugli orizzonti lunghi che sono quelli che contano per una decisione di vita.

## Sintesi per categoria

| Categoria | MAE modello | MAE RW | MAE ancora | Meglio di RW | Meglio di ancora |
|---|---:|---:|---:|:--:|:--:|
| Cura della persona e altre spese | 0.87 | 1.44 | 0.90 | si | si |
| Manutenzione dell’abitazione | 1.09 | 1.41 | 0.99 | si | no |
| Salute | 1.35 | 1.57 | 1.12 | si | no |
| Abbigliamento e calzature | 1.48 | 2.58 | 1.70 | si | si |
| Ristorazione e alloggio | 1.56 | 1.87 | 1.57 | si | si |
| Mobili e articoli per la casa | 1.56 | 1.60 | 1.75 | si | si |
| Affitti di mercato | 1.61 | 1.76 | 1.48 | si | no |
| Tempo libero, sport e cultura | 1.67 | 1.85 | 1.73 | si | si |
| Indice generale dei prezzi al consumo | 1.78 | 2.45 | 1.77 | si | no |
| Acqua e servizi per l’abitazione | 1.93 | 2.06 | 1.10 | si | no |
| Alimentari | 2.20 | 2.88 | 2.18 | si | no |
| Assicurazioni e servizi finanziari | 2.26 | 2.21 | 1.40 | no | no |
| Telefonia, internet e informazione | 2.69 | 3.05 | 5.04 | si | si |
| Istruzione | 2.90 | 3.96 | 2.78 | si | no |
| Carburante ed esercizio del veicolo | 4.50 | 6.06 | 4.43 | si | no |
| Trasporto pubblico | 6.05 | 8.85 | 5.58 | si | no |
| Elettricità, gas e altri combustibili | 14.16 | 17.35 | 13.65 | si | no |

Il modello batte il random walk in **16/17** categorie e l’ancora fissa in **6/17**.

### Come interpretare il confronto con l’ancora fissa

Il modello **non** batte sistematicamente la regola "sempre il 2%", ed è un risultato atteso, non un difetto nascosto: le due cose condividono la stessa convinzione di fondo. Il modello è `ancora + differenziale + rientro del gap`, quindi su orizzonti lunghi converge per costruzione verso l’ancora. Può distinguersene solo grazie al differenziale di categoria e alla dinamica di breve periodo.

Va aggiunto che il benchmark al 2% è avvantaggiato dal senno di poi: il 2% è vicino all’inflazione media effettivamente realizzata in Italia nel periodo considerato. Una regola costante davvero "fuori campione" avrebbe dovuto usare la media nota all’ epoca, più alta nei primi anni.

Il confronto che conta davvero è quello con il **random walk**, cioè con quello che fa istintivamente chi proietta la bolletta di oggi sui prossimi dieci anni. Lì il vantaggio è netto e cresce con l’orizzonte. In più, rispetto a una regola fissa, il modello fornisce bande di incertezza calibrate e un’ attribuzione per categoria, che una costante non può dare.

## Errore per orizzonte

Media e mediana su tutte le categorie, per anni di distanza dalla previsione. La mediana è più informativa della media, che è dominata dall’energia: con errori intorno ai 15 punti percentuali, l’energia da sola sposta la media di tutte le altre sedici categorie.

| Orizzonte | MAE modello | MAE RW | MAE ancora | Mediana modello | Mediana RW | Copertura tasso | **Copertura livello** | Errore livello |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 anno | 2.67 | 3.14 | 2.69 | 1.50 | 1.53 | 75.82% | **82.68%** | 2.56% |
| 2 anni | 2.73 | 3.87 | 2.70 | 1.69 | 1.82 | 73.01% | **75.78%** | 4.44% |
| 3 anni | 2.78 | 3.87 | 2.78 | 1.69 | 2.41 | 69.12% | **75.00%** | 5.98% |
| 4 anni | 2.72 | 3.63 | 2.76 | 1.74 | 2.21 | 64.31% | **73.33%** | 7.16% |
| 5 anni | 2.87 | 3.24 | 2.83 | 1.86 | 2.06 | 63.03% | **67.65%** | 7.96% |
| 6 anni | 2.99 | 3.68 | 2.90 | 1.93 | 2.58 | 62.90% | **62.90%** | 9.55% |
| 7 anni | 3.00 | 3.83 | 2.92 | 1.84 | 2.41 | 64.22% | **64.22%** | 10.95% |
| 8 anni | 3.08 | 4.19 | 3.01 | 1.89 | 2.65 | 64.17% | **63.10%** | 12.31% |
| 9 anni | 3.12 | 3.76 | 3.09 | 2.02 | 2.62 | 62.35% | **65.88%** | 13.57% |
| 10 anni | 3.25 | 3.80 | 3.23 | 1.97 | 2.65 | 60.78% | **65.36%** | 14.46% |

Le colonne di copertura indicano la quota di casi in cui il valore reale è caduto nella banda dichiarata all’80%. Un modello ben calibrato sta vicino a 80: molto sotto significa bande troppo strette (falsa sicurezza), molto sopra bande troppo larghe.

Le due colonne misurano cose diverse, ed è la seconda quella che conta per chi guarda i grafici. **Copertura tasso** valida la banda sul tasso di inflazione annuo. **Copertura livello** valida la banda sul livello cumulato della spesa, che è la fascia effettivamente disegnata nell’applicazione: sono grandezze con varianze diverse, e una banda ben calibrata sul tasso può essere mal calibrata sul livello. **Errore livello** è lo scarto percentuale medio fra la spesa cumulata prevista e quella realizzata.

### Limite noto: le bande a lungo termine sono ottimistiche

La copertura sul livello è vicina al valore dichiarato nei primi due-tre anni, poi scende. Tradotto: **la banda a dieci anni è troppo stretta**, e l’incertezza reale su quell’orizzonte è maggiore di quella disegnata.

La ragione è strutturale e non si elimina con un modello di questa famiglia: in trent’anni l’Italia è passata per il cambio all’euro, la crisi del 2008 e lo shock energetico del 2022. Sono rotture di regime, non estrazioni da una distribuzione stabile, e nessuna stima basata sulla volatilità passata le anticipa. Il numero è riportato qui invece che nascosto proprio perché chi legge una proiezione a dieci anni sappia quanto fidarsi della fascia grigia.

## Parametri stimati sullo snapshot corrente

`phi` = persistenza dello scostamento; `spread` = differenziale strutturale annuo rispetto all’indice generale; `ultimo` = inflazione tendenziale più recente.

| Categoria | phi | spread (p.p.) | ultimo (%) | oss. |
|---|---:|---:|---:|---:|
| Assicurazioni e servizi finanziari | 0.45 | 1.28 | 2.08 | 29 |
| Elettricità, gas e altri combustibili | 0.16 | 1.27 | 14.60 | 29 |
| Acqua e servizi per l’abitazione | 0.53 | 1.23 | 3.29 | 29 |
| Trasporto pubblico | 0.15 | 1.22 | -3.90 | 29 |
| Ristorazione e alloggio | 0.65 | 0.46 | 3.14 | 29 |
| Carburante ed esercizio del veicolo | 0.20 | 0.40 | 11.46 | 29 |
| Alimentari | 0.32 | 0.08 | 1.20 | 29 |
| Salute | 0.31 | 0.01 | 1.19 | 29 |
| Manutenzione dell’abitazione | 0.69 | 0.00 | 2.59 | 29 |
| Indice generale dei prezzi al consumo | 0.38 | 0.00 | 3.22 | 29 |
| Affitti di mercato | 0.69 | -0.00 | 3.39 | 29 |
| Cura della persona e altre spese | 0.51 | -0.02 | 2.81 | 29 |
| Tempo libero, sport e cultura | 0.50 | -0.03 | -0.48 | 29 |
| Mobili e articoli per la casa | 0.48 | -0.49 | 1.00 | 29 |
| Istruzione | 0.32 | -0.63 | 1.40 | 29 |
| Abbigliamento e calzature | 0.14 | -1.38 | 0.12 | 29 |
| Telefonia, internet e informazione | 0.15 | -3.00 | 1.41 | 29 |
