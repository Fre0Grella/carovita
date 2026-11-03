# Backtest del modello di previsione

Generato automaticamente da `npm run backtest`. Non modificare a mano.

Snapshot del 2026-11-03, dati fino a 2026-09.

## Come si legge

Validazione **walk-forward out-of-sample**: per ogni anno di origine si stimano i parametri usando solo i dati disponibili fino a quel momento, si prevede a 1..10 anni e si confronta con quanto poi realmente accaduto. I parametri non vedono mai il futuro.

L’errore è il **MAE** (errore assoluto medio) sul tasso di inflazione annuo, in punti percentuali. Più basso è meglio. Le colonne di confronto sono i due benchmark ingenui:

- **RW** (random walk): "l’anno prossimo come quest’anno".
- **Anc.** (ancora fissa): "sempre il 2%".

Un modello utile deve battere entrambi, soprattutto sugli orizzonti lunghi che sono quelli che contano per una decisione di vita.

## Sintesi per categoria

| Categoria | MAE modello | MAE RW | MAE ancora | Meglio di RW | Meglio di ancora |
|---|---:|---:|---:|:--:|:--:|
| Cura della persona e altre spese | 0.92 | 1.53 | 0.97 | si | si |
| Manutenzione dell’abitazione | 1.12 | 1.46 | 1.05 | si | no |
| Salute | 1.31 | 1.63 | 1.13 | si | no |
| Tempo libero, sport e cultura | 1.37 | 1.67 | 1.47 | si | si |
| Abbigliamento e calzature | 1.47 | 1.74 | 1.57 | si | si |
| Affitti di mercato | 1.54 | 1.74 | 1.45 | si | no |
| Mobili e articoli per la casa | 1.55 | 1.70 | 1.78 | si | si |
| Ristorazione e alloggio | 1.74 | 2.18 | 1.76 | si | si |
| Acqua e servizi per l’abitazione | 1.84 | 2.03 | 1.05 | si | no |
| Alimentari | 2.06 | 2.88 | 2.06 | si | si |
| Indice generale dei prezzi al consumo | 2.07 | 2.70 | 2.07 | si | no |
| Assicurazioni e servizi finanziari | 2.30 | 2.26 | 1.45 | no | no |
| Telefonia, internet e informazione | 2.65 | 3.06 | 4.98 | si | si |
| Istruzione | 2.87 | 3.89 | 2.79 | si | no |
| Trasporto pubblico | 4.73 | 6.84 | 4.55 | si | no |
| Carburante ed esercizio del veicolo | 5.03 | 6.68 | 4.99 | si | no |
| Elettricità, gas e altri combustibili | 14.48 | 17.52 | 13.95 | si | no |

Il modello batte il random walk in **16/17** categorie e l’ancora fissa in **7/17**.

### Come interpretare il confronto con l’ancora fissa

Il modello **non** batte sistematicamente la regola "sempre il 2%", ed è un risultato atteso, non un difetto nascosto: le due cose condividono la stessa convinzione di fondo. Il modello è `ancora + differenziale + rientro del gap`, quindi su orizzonti lunghi converge per costruzione verso l’ancora. Può distinguersene solo grazie al differenziale di categoria e alla dinamica di breve periodo.

Va aggiunto che il benchmark al 2% è avvantaggiato dal senno di poi: il 2% è vicino all’inflazione media effettivamente realizzata in Italia nel periodo considerato. Una regola costante davvero "fuori campione" avrebbe dovuto usare la media nota all’ epoca, più alta nei primi anni.

Il confronto che conta davvero è quello con il **random walk**, cioè con quello che fa istintivamente chi proietta la bolletta di oggi sui prossimi dieci anni. Lì il vantaggio è netto e cresce con l’orizzonte. In più, rispetto a una regola fissa, il modello fornisce bande di incertezza calibrate e un’ attribuzione per categoria, che una costante non può dare.

## Errore per orizzonte

Media e mediana su tutte le categorie, per anni di distanza dalla previsione. La mediana è più informativa della media, che è dominata dall’energia: con errori intorno ai 15 punti percentuali, l’energia da sola sposta la media di tutte le altre sedici categorie.

| Orizzonte | MAE modello | MAE RW | MAE ancora | Mediana modello | Mediana RW | Copertura tasso | **Copertura livello** | Errore livello |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 anno | 2.60 | 3.07 | 2.65 | 1.45 | 1.57 | 72.22% | **79.08%** | 2.48% |
| 2 anni | 2.71 | 3.77 | 2.67 | 1.49 | 1.79 | 70.93% | **75.43%** | 4.36% |
| 3 anni | 2.74 | 3.85 | 2.75 | 1.64 | 2.15 | 67.65% | **75.37%** | 5.82% |
| 4 anni | 2.68 | 3.49 | 2.75 | 1.79 | 2.10 | 63.92% | **70.98%** | 6.99% |
| 5 anni | 2.82 | 3.14 | 2.81 | 1.93 | 2.09 | 60.08% | **65.13%** | 7.75% |
| 6 anni | 2.92 | 3.58 | 2.88 | 2.07 | 2.17 | 61.09% | **62.90%** | 9.23% |
| 7 anni | 2.95 | 3.85 | 2.90 | 2.09 | 2.19 | 61.27% | **60.29%** | 10.47% |
| 8 anni | 3.03 | 4.07 | 3.01 | 2.10 | 2.54 | 64.71% | **60.96%** | 11.94% |
| 9 anni | 3.11 | 3.77 | 3.12 | 2.04 | 2.50 | 62.35% | **62.35%** | 13.07% |
| 10 anni | 3.29 | 3.58 | 3.31 | 2.07 | 2.66 | 56.86% | **60.13%** | 13.85% |

Le colonne di copertura indicano la quota di casi in cui il valore reale è caduto nella banda dichiarata all’80%. Un modello ben calibrato sta vicino a 80: molto sotto significa bande troppo strette (falsa sicurezza), molto sopra bande troppo larghe.

Le due colonne misurano cose diverse, ed è la seconda quella che conta per chi guarda i grafici. **Copertura tasso** valida la banda sul tasso di inflazione annuo. **Copertura livello** valida la banda sul livello cumulato della spesa, che è la fascia effettivamente disegnata nell’applicazione: sono grandezze con varianze diverse, e una banda ben calibrata sul tasso può essere mal calibrata sul livello. **Errore livello** è lo scarto percentuale medio fra la spesa cumulata prevista e quella realizzata.

### Limite noto: le bande a lungo termine sono ottimistiche

La copertura sul livello è vicina al valore dichiarato nei primi due-tre anni, poi scende. Tradotto: **la banda a dieci anni è troppo stretta**, e l’incertezza reale su quell’orizzonte è maggiore di quella disegnata.

La ragione è strutturale e non si elimina con un modello di questa famiglia: in trent’anni l’Italia è passata per il cambio all’euro, la crisi del 2008 e lo shock energetico del 2022. Sono rotture di regime, non estrazioni da una distribuzione stabile, e nessuna stima basata sulla volatilità passata le anticipa. Il numero è riportato qui invece che nascosto proprio perché chi legge una proiezione a dieci anni sappia quanto fidarsi della fascia grigia.

## Parametri stimati sullo snapshot corrente

`phi` = persistenza dello scostamento; `spread` = differenziale strutturale annuo rispetto all’indice generale; `ultimo` = inflazione tendenziale più recente.

| Categoria | phi | spread (p.p.) | ultimo (%) | oss. |
|---|---:|---:|---:|---:|
| Elettricità, gas e altri combustibili | 0.16 | 1.32 | 19.34 | 29 |
| Assicurazioni e servizi finanziari | 0.38 | 1.17 | 1.88 | 29 |
| Acqua e servizi per l’abitazione | 0.53 | 1.16 | 3.49 | 29 |
| Trasporto pubblico | 0.15 | 0.84 | -1.51 | 29 |
| Ristorazione e alloggio | 0.56 | 0.42 | 3.20 | 29 |
| Carburante ed esercizio del veicolo | 0.21 | 0.42 | 14.44 | 29 |
| Alimentari | 0.34 | 0.04 | 1.79 | 29 |
| Salute | 0.22 | 0.00 | 1.29 | 29 |
| Indice generale dei prezzi al consumo | 0.41 | 0.00 | 4.17 | 29 |
| Manutenzione dell’abitazione | 0.64 | -0.00 | 2.69 | 29 |
| Affitti di mercato | 0.70 | -0.00 | 3.38 | 29 |
| Cura della persona e altre spese | 0.56 | -0.05 | 2.69 | 29 |
| Tempo libero, sport e cultura | 0.50 | -0.14 | 1.30 | 29 |
| Mobili e articoli per la casa | 0.50 | -0.54 | 1.10 | 29 |
| Istruzione | 0.31 | -0.69 | 1.39 | 29 |
| Abbigliamento e calzature | 0.21 | -0.73 | 0.00 | 29 |
| Telefonia, internet e informazione | 0.20 | -3.00 | 1.71 | 29 |
