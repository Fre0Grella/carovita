/**
 * Caricamento dei dati lato browser.
 *
 * Lo snapshot e l'elenco dei comuni sono file statici generati dalla pipeline
 * e serviti insieme al sito: nessuna chiamata a servizi esterni dal browser,
 * quindi nessun problema di CORS, nessuna chiave e nessuna dipendenza dalla
 * disponibilità di Eurostat o ISTAT nel momento in cui qualcuno apre la
 * pagina.
 */

import type { CityRentQuote, DataSnapshot } from '../core/types.js';

/**
 * Risolve un percorso rispetto alla base del sito. Su GitHub Pages il sito
 * vive in una sottocartella, quindi i percorsi assoluti non funzionano.
 */
function assetUrl(path: string): string {
  return `${import.meta.env.BASE_URL}${path}`.replace(/([^:])\/\/+/g, '$1/');
}

export async function loadSnapshot(): Promise<DataSnapshot> {
  const res = await fetch(assetUrl('data/snapshot.json'));
  if (!res.ok) {
    throw new Error(
      `Impossibile caricare i dati (HTTP ${res.status}). ` +
        'Se stai eseguendo il progetto in locale, lancia prima ' +
        '`npm run data:refresh`.',
    );
  }
  return (await res.json()) as DataSnapshot;
}

let citiesPromise: Promise<CityRentQuote[]> | null = null;

/**
 * Carica l'elenco dei comuni, una sola volta per sessione.
 *
 * Il file pesa circa 3 MB: si scarica solo quando serve davvero, cioè quando
 * l'utente apre il selettore della città, non all'avvio dell'applicazione.
 */
export function loadCities(): Promise<CityRentQuote[]> {
  if (!citiesPromise) {
    citiesPromise = fetch(assetUrl('data/cities.json'))
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<CityRentQuote[]>;
      })
      .catch((err) => {
        citiesPromise = null;
        throw err;
      });
  }
  return citiesPromise;
}
