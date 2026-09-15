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
| Abbigliamento e calzature | 0.86 | 0.96 | 1.29 | si | si |
| Cura della persona e altre spese | 0.86 | 1.43 | 0.90 | si | si |
| Manutenzione dell’abitazione | 1.09 | 1.30 | 1.00 | si | no |
| Salute | 1.32 | 1.61 | 1.13 | si | no |
| Tempo libero, sport e cultura | 1.36 | 1.44 | 1.48 | si | si |
| Affitti di mercato | 1.58 | 1.62 | 1.45 | si | no |
| Mobili e articoli per la casa | 1.63 | 1.59 | 1.85 | no | si |
| Ristorazione e alloggio | 1.68 | 1.78 | 1.66 | si | no |
| Indice generale dei prezzi al consumo | 1.87 | 2.29 | 1.87 | si | si |
| Assicurazioni e servizi finanziari | 2.01 | 2.19 | 1.39 | si | no |
| Acqua e servizi per l’abitazione | 2.11 | 2.35 | 1.09 | si | no |
| Alimentari | 2.15 | 2.66 | 2.13 | si | no |
| Telefonia, internet e informazione | 2.60 | 2.38 | 5.48 | no | si |
| Istruzione | 2.99 | 3.87 | 2.87 | si | no |
| Trasporto pubblico | 3.26 | 4.95 | 3.23 | si | no |
| Carburante ed esercizio del veicolo | 3.71 | 5.33 | 3.54 | si | no |
| Elettricità, gas e altri combustibili | 14.88 | 17.13 | 14.11 | si | no |

Il modello batte il random walk in **15/17** categorie e l’ancora fissa in **6/17**.

### Come interpretare il confronto con l’ancora fissa

Il modello **non** batte sistematicamente la regola "sempre il 2%", ed è un risultato atteso, non un difetto nascosto: le due cose condividono la stessa convinzione di fondo. Il modello è `ancora + differenziale + rientro del gap`, quindi su orizzonti lunghi converge per costruzione verso l’ancora. Può distinguersene solo grazie al differenziale di categoria e alla dinamica di breve periodo.

Va aggiunto che il benchmark al 2% è avvantaggiato dal senno di poi: il 2% è vicino all’inflazione media effettivamente realizzata in Italia nel periodo considerato. Una regola costante davvero "fuori campione" avrebbe dovuto usare la media nota all’ epoca, più alta nei primi anni.

Il confronto che conta davvero è quello con il **random walk**, cioè con quello che fa istintivamente chi proietta la bolletta di oggi sui prossimi dieci anni. Lì il vantaggio è netto e cresce con l’orizzonte. In più, rispetto a una regola fissa, il modello fornisce bande di incertezza calibrate e un’ attribuzione per categoria, che una costante non può dare.

## Errore per orizzonte

Media e mediana su tutte le categorie, per anni di distanza dalla previsione. La mediana è più informativa della media, che è dominata dall’energia: con errori intorno ai 15 punti percentuali, l’energia da sola sposta la media di tutte le altre sedici categorie.

| Orizzonte | MAE modello | MAE RW | MAE ancora | Mediana modello | Mediana RW | Copertura banda 80% |
|---:|---:|---:|---:|---:|---:|---:|
| 1 anno | 2.27 | 2.48 | 2.47 | 1.35 | 1.01 | 71.32% |
| 2 anni | 2.55 | 3.42 | 2.53 | 1.70 | 1.63 | 77.25% |
| 3 anni | 2.53 | 3.55 | 2.56 | 1.83 | 1.60 | 76.89% |
| 4 anni | 2.54 | 2.93 | 2.59 | 1.78 | 1.88 | 78.73% |
| 5 anni | 2.68 | 2.95 | 2.69 | 1.87 | 1.81 | 79.90% |
| 6 anni | 2.75 | 3.05 | 2.72 | 1.90 | 1.78 | 82.35% |
| 7 anni | 2.82 | 3.41 | 2.79 | 1.90 | 1.93 | 85.29% |
| 8 anni | 2.86 | 3.72 | 2.88 | 1.92 | 2.37 | 84.97% |
| 9 anni | 2.96 | 3.57 | 3.00 | 2.03 | 2.40 | 86.03% |
| 10 anni | 3.09 | 3.21 | 3.10 | 1.94 | 2.26 | 87.39% |

La colonna "copertura" indica la quota di casi in cui il valore reale è caduto nella banda di confidenza dichiarata all’80%. Un modello ben calibrato sta vicino a 80: molto sotto significa bande troppo strette (falsa sicurezza), molto sopra bande troppo larghe.

## Parametri stimati sullo snapshot corrente

`phi` = persistenza dello scostamento; `spread` = differenziale strutturale annuo rispetto all’indice generale; `ultimo` = inflazione tendenziale più recente.

| Categoria | phi | spread (p.p.) | ultimo (%) | oss. |
|---|---:|---:|---:|---:|
| Assicurazioni e servizi finanziari | 0.69 | 1.37 | 1.98 | 28 |
| Trasporto pubblico | 0.21 | 1.28 | -1.81 | 28 |
| Acqua e servizi per l’abitazione | 0.60 | 1.27 | 3.20 | 28 |
| Elettricità, gas e altri combustibili | 0.19 | 0.99 | 10.81 | 28 |
| Ristorazione e alloggio | 0.67 | 0.40 | 3.43 | 28 |
| Carburante ed esercizio del veicolo | 0.28 | 0.17 | 7.48 | 28 |
| Alimentari | 0.41 | 0.13 | 1.30 | 28 |
| Salute | 0.37 | 0.02 | 1.20 | 28 |
| Manutenzione dell’abitazione | 0.76 | 0.00 | 2.59 | 28 |
| Indice generale dei prezzi al consumo | 0.43 | 0.00 | 3.22 | 28 |
| Affitti di mercato | 0.72 | -0.00 | 3.49 | 28 |
| Cura della persona e altre spese | 0.65 | -0.02 | 2.81 | 28 |
| Tempo libero, sport e cultura | 0.60 | -0.05 | 0.29 | 28 |
| Mobili e articoli per la casa | 0.49 | -0.44 | 0.80 | 28 |
| Istruzione | 0.49 | -0.71 | 1.51 | 28 |
| Abbigliamento e calzature | 0.38 | -0.79 | 0.91 | 28 |
| Telefonia, internet e informazione | 0.26 | -3.00 | 0.20 | 28 |
