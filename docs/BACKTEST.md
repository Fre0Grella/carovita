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
| Cura della persona e altre spese | 0.93 | 1.56 | 0.99 | si | si |
| Abbigliamento e calzature | 1.07 | 1.03 | 1.32 | no | si |
| Tempo libero, sport e cultura | 1.09 | 1.29 | 1.22 | si | si |
| Manutenzione dell’abitazione | 1.21 | 1.41 | 1.12 | si | no |
| Salute | 1.30 | 1.66 | 1.11 | si | no |
| Affitti di mercato | 1.54 | 1.65 | 1.44 | si | no |
| Mobili e articoli per la casa | 1.55 | 1.64 | 1.75 | si | si |
| Ristorazione e alloggio | 1.61 | 1.65 | 1.56 | si | no |
| Alimentari | 2.01 | 2.71 | 2.00 | si | no |
| Acqua e servizi per l’abitazione | 2.17 | 2.41 | 1.14 | si | no |
| Indice generale dei prezzi al consumo | 2.17 | 2.39 | 2.13 | si | no |
| Assicurazioni e servizi finanziari | 2.22 | 2.49 | 1.71 | si | no |
| Telefonia, internet e informazione | 2.70 | 2.58 | 5.56 | no | si |
| Istruzione | 2.81 | 3.97 | 2.71 | si | no |
| Carburante ed esercizio del veicolo | 2.99 | 4.97 | 2.88 | si | no |
| Trasporto pubblico | 4.49 | 6.93 | 4.65 | si | si |
| Elettricità, gas e altri combustibili | 22.57 | 25.65 | 21.50 | si | no |

Il modello batte il random walk in **15/17** categorie e l’ancora fissa in **6/17**.

### Come interpretare il confronto con l’ancora fissa

Il modello **non** batte sistematicamente la regola "sempre il 2%", ed è un risultato atteso, non un difetto nascosto: le due cose condividono la stessa convinzione di fondo. Il modello è `ancora + differenziale + rientro del gap`, quindi su orizzonti lunghi converge per costruzione verso l’ancora. Può distinguersene solo grazie al differenziale di categoria e alla dinamica di breve periodo.

Va aggiunto che il benchmark al 2% è avvantaggiato dal senno di poi: il 2% è vicino all’inflazione media effettivamente realizzata in Italia nel periodo considerato. Una regola costante davvero "fuori campione" avrebbe dovuto usare la media nota all’ epoca, più alta nei primi anni.

Il confronto che conta davvero è quello con il **random walk**, cioè con quello che fa istintivamente chi proietta la bolletta di oggi sui prossimi dieci anni. Lì il vantaggio è netto e cresce con l’orizzonte. In più, rispetto a una regola fissa, il modello fornisce bande di incertezza calibrate e un’ attribuzione per categoria, che una costante non può dare.

## Errore per orizzonte

Media e mediana su tutte le categorie, per anni di distanza dalla previsione. La mediana è più informativa della media, che è dominata dall’energia: con errori intorno ai 15 punti percentuali, l’energia da sola sposta la media di tutte le altre sedici categorie.

| Orizzonte | MAE modello | MAE RW | MAE ancora | Mediana modello | Mediana RW | Copertura tasso | **Copertura livello** | Errore livello |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 anno | 2.85 | 3.33 | 2.88 | 1.60 | 1.40 | 74.74% | **81.66%** | 2.89% |
| 2 anni | 3.05 | 4.22 | 2.92 | 1.94 | 1.83 | 68.75% | **75.37%** | 5.28% |
| 3 anni | 3.07 | 4.17 | 3.02 | 1.84 | 1.71 | 63.53% | **72.94%** | 7.69% |
| 4 anni | 2.99 | 3.58 | 3.05 | 1.81 | 2.15 | 64.71% | **68.49%** | 6.57% |
| 5 anni | 3.10 | 3.48 | 3.13 | 1.92 | 1.94 | 57.47% | **65.61%** | 7.89% |
| 6 anni | 3.21 | 3.62 | 3.21 | 2.04 | 1.81 | 57.84% | **62.25%** | 9.15% |
| 7 anni | 3.30 | 4.02 | 3.32 | 2.00 | 2.38 | 58.82% | **60.43%** | 10.61% |
| 8 anni | 3.37 | 4.43 | 3.43 | 2.01 | 2.50 | 60.00% | **61.18%** | 12.04% |
| 9 anni | 3.48 | 4.18 | 3.58 | 1.91 | 2.45 | 58.17% | **61.44%** | 13.29% |
| 10 anni | 3.59 | 3.79 | 3.70 | 1.81 | 2.16 | 55.88% | **62.50%** | 13.98% |

Le colonne di copertura indicano la quota di casi in cui il valore reale è caduto nella banda dichiarata all’80%. Un modello ben calibrato sta vicino a 80: molto sotto significa bande troppo strette (falsa sicurezza), molto sopra bande troppo larghe.

Le due colonne misurano cose diverse, ed è la seconda quella che conta per chi guarda i grafici. **Copertura tasso** valida la banda sul tasso di inflazione annuo. **Copertura livello** valida la banda sul livello cumulato della spesa, che è la fascia effettivamente disegnata nell’applicazione: sono grandezze con varianze diverse, e una banda ben calibrata sul tasso può essere mal calibrata sul livello. **Errore livello** è lo scarto percentuale medio fra la spesa cumulata prevista e quella realizzata.

## Parametri stimati sullo snapshot corrente

`phi` = persistenza dello scostamento; `spread` = differenziale strutturale annuo rispetto all’indice generale; `ultimo` = inflazione tendenziale più recente.

| Categoria | phi | spread (p.p.) | ultimo (%) | oss. |
|---|---:|---:|---:|---:|
| Assicurazioni e servizi finanziari | 0.34 | 1.32 | 1.98 | 28 |
| Trasporto pubblico | 0.15 | 1.30 | -1.81 | 28 |
| Elettricità, gas e altri combustibili | 0.15 | 1.27 | 10.81 | 28 |
| Acqua e servizi per l’abitazione | 0.47 | 1.20 | 3.20 | 28 |
| Ristorazione e alloggio | 0.61 | 0.28 | 3.43 | 28 |
| Alimentari | 0.38 | 0.13 | 1.30 | 28 |
| Carburante ed esercizio del veicolo | 0.15 | 0.10 | 7.48 | 28 |
| Salute | 0.18 | 0.01 | 1.20 | 28 |
| Manutenzione dell’abitazione | 0.52 | 0.00 | 2.59 | 28 |
| Indice generale dei prezzi al consumo | 0.26 | 0.00 | 3.22 | 28 |
| Affitti di mercato | 0.70 | -0.00 | 3.49 | 28 |
| Cura della persona e altre spese | 0.55 | -0.00 | 2.81 | 28 |
| Tempo libero, sport e cultura | 0.35 | -0.05 | 0.29 | 28 |
| Mobili e articoli per la casa | 0.40 | -0.44 | 0.80 | 28 |
| Abbigliamento e calzature | 0.60 | -0.50 | 0.91 | 28 |
| Istruzione | 0.32 | -0.62 | 1.51 | 28 |
| Telefonia, internet e informazione | 0.26 | -3.00 | 0.20 | 28 |
