/**
 * Profili di partenza e persistenza della configurazione.
 *
 * I valori iniziali descrivono una situazione plausibile per chi affitta in
 * una città italiana di medie dimensioni: servono solo perché l'applicazione
 * mostri qualcosa di sensato al primo avvio, e vanno sostituiti con i propri.
 */

import type { CategoryId, ExpenseItem, Profile } from '../core/types.js';

/** Colori dei profili: slot categoriali 1-3, validati per daltonismo. */
export const PROFILE_COLORS = [
  'var(--series-1)',
  'var(--series-2)',
  'var(--series-3)',
];

/** Etichette leggibili delle categorie, per menu e grafici. */
export const CATEGORY_LABELS: Record<CategoryId, string> = {
  headline: 'Indice generale',
  food: 'Alimentari',
  rent: 'Affitto',
  utilities: 'Elettricità e gas',
  water: 'Acqua e servizi',
  maintenance: 'Manutenzione casa',
  transport_fuel: 'Carburante e auto',
  transport_public: 'Trasporto pubblico',
  health: 'Salute',
  education: 'Istruzione',
  communications: 'Telefono e internet',
  recreation: 'Tempo libero',
  restaurants: 'Ristoranti e bar',
  clothing: 'Abbigliamento',
  furnishings: 'Casa e arredamento',
  insurance: 'Assicurazioni',
  misc: 'Altre spese',
};

/** Categorie proponibili come voce di spesa (l'affitto è gestito a parte). */
export const SELECTABLE_CATEGORIES: CategoryId[] = [
  'food',
  'utilities',
  'water',
  'maintenance',
  'transport_fuel',
  'transport_public',
  'health',
  'education',
  'communications',
  'recreation',
  'restaurants',
  'clothing',
  'furnishings',
  'insurance',
  'misc',
];

function item(
  id: string,
  label: string,
  category: CategoryId,
  monthlyAmount: number,
): ExpenseItem {
  return { id, label, category, monthlyAmount, growthOverride: null };
}

export function makeDefaultProfile(index = 0): Profile {
  return {
    id: `profilo-${Date.now().toString(36)}-${index}`,
    name: index === 0 ? 'Situazione attuale' : `Alternativa ${index}`,
    color: PROFILE_COLORS[index % PROFILE_COLORS.length]!,
    housing: {
      contractType: 'libero_4_4',
      istatCode: '037006', // Bologna
      zone: 'semicentro',
      sqm: 65,
      monthlyRent: 800,
      cedolareSecca: true,
      istatIndexation: false,
      registrationTaxShare: 0.5,
      highTensionMunicipality: true,
      condoFees: 60,
      sharing: null,
    },
    utilities: [
      item('u-energia', 'Elettricità e gas', 'utilities', 110),
      item('u-acqua', 'Acqua', 'water', 25),
      item('u-internet', 'Internet e telefono', 'communications', 35),
    ],
    expenses: [
      item('e-spesa', 'Spesa alimentare', 'food', 300),
      item('e-fuori', 'Ristoranti e bar', 'restaurants', 120),
      item('e-trasporti', 'Trasporto pubblico', 'transport_public', 40),
      item('e-auto', 'Carburante e auto', 'transport_fuel', 90),
      item('e-tempo', 'Tempo libero', 'recreation', 80),
      item('e-salute', 'Salute', 'health', 40),
      item('e-varie', 'Altre spese', 'misc', 90),
    ],
    income: {
      monthlyNet: 1650,
      monthsPerYear: 13,
      inflationPassThrough: 0.7,
      realGrowth: 0.005,
    },
    initialSavings: 8000,
    savingsReturn: 0.02,
  };
}

// ---------------------------------------------------------------------------
// Persistenza locale
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'carovita:profili:v1';

export interface StoredState {
  profiles: Profile[];
  horizon: number;
  anchorOverride: number | null;
  confidence: number;
}

export function loadState(): StoredState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredState;
    if (!Array.isArray(parsed.profiles) || parsed.profiles.length === 0) {
      return null;
    }
    // Profili salvati prima che esistesse la coabitazione: si normalizzano
    // invece di scartarli, altrimenti l'utente perderebbe la configurazione
    // al primo aggiornamento dell'applicazione.
    for (const p of parsed.profiles) {
      if (p.housing && p.housing.sharing === undefined) p.housing.sharing = null;
      // `realGrowth` (crescita reale aggiuntiva) e' stato sostituito da un
      // override esplicito del tasso di crescita: i vecchi valori non hanno
      // un equivalente diretto, quindi si torna alla previsione del modello.
      for (const it of [...(p.utilities ?? []), ...(p.expenses ?? [])]) {
        const legacy = it as unknown as { realGrowth?: number };
        if (it.growthOverride === undefined) it.growthOverride = null;
        delete legacy.realGrowth;
      }
    }
    return parsed;
  } catch {
    // Finestra privata, storage disabilitato o dati corrotti: si riparte
    // dai valori di default invece di bloccare l'applicazione.
    return null;
  }
}

export function saveState(state: StoredState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Salvare è un optional: se non si può, l'app resta comunque usabile.
  }
}

export function clearState(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* vedi sopra */
  }
}
