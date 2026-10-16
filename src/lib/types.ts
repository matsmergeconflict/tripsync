import type { ISODate } from "./dates";

export type StayStatus = "confirmed" | "tentative";
export type ParticipantStatus = "active" | "withdrawn";
export type Approval = "pending" | "approved" | "rejected";
export type SkiNeed = "yes" | "no" | "unknown";
export type MealMode = "all_present" | "custom" | "none" | "unknown";
export type Diet = "omnivore" | "vegetarian" | "vegan" | "pescetarian" | "other";
export type MealType = "breakfast" | "lunch" | "dinner" | "snack";

/** Im Anmeldeformular angebotene Ernährungsweisen */
export const SELF_DIETS: Diet[] = ["omnivore", "vegetarian", "vegan"];

export const DIET_LABELS: Record<Diet, string> = {
  omnivore: "Alles",
  vegetarian: "Vegetarisch",
  vegan: "Vegan",
  pescetarian: "Pescetarisch",
  other: "Sonstiges",
};

export const MEAL_TYPE_LABELS: Record<MealType, string> = {
  breakfast: "Frühstück",
  lunch: "Mittagessen",
  dinner: "Abendessen",
  snack: "Snack / Individuell",
};

export const MEAL_TYPE_ORDER: MealType[] = ["breakfast", "lunch", "dinner", "snack"];

export interface SkiCategory {
  id: string;
  name: string;
  price: number | null; // Preis pro Tag, optional, nur zur Planung
  note?: string;
}

export interface Trip {
  id: string;
  name: string;
  location: string | null;
  start_date: ISODate;
  end_date: ISODate;
  public_enabled: boolean;
  require_approval: boolean;
  ski_enabled: boolean;
  ski_categories: SkiCategory[];
  ski_notes: string | null;
  form_texts: Record<string, string>;
  version: number;
  created_at: string;
  updated_at: string;
}

/** Vollständige Teilnehmerdaten (nur für Organisatoren und den Teilnehmer selbst). */
export interface Participant {
  id: string;
  trip_id: string;
  registration_id: string;
  position: number;
  approval: Approval;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  birth_date: ISODate | null;
  contact: string | null; // gilt für die ganze Anmeldung (Gruppe)
  comment: string | null; // privat: an Organisatoren, gilt für die ganze Anmeldung
  org_note: string | null; // intern: nur Organisatoren
  arrival_date: ISODate | null;
  arrival_time: string | null;
  departure_date: ISODate | null;
  departure_time: string | null;
  stay_status: StayStatus;
  status: ParticipantStatus;
  ski_need: SkiNeed;
  ski_days: ISODate[];
  ski_category: string | null;
  ski_discount: string | null;
  meal_mode: MealMode;
  meal_days: ISODate[];
  diet: Diet | null;
  food_wishes: string | null;
  allergies: string | null; // Gesundheitsdaten: nie öffentlich
  share_ski_public: boolean;
  version: number;
  created_at: string;
  updated_at: string;
}

/** Minimaldaten für die öffentliche Ansicht. */
export interface PublicParticipant {
  id: string;
  display_name: string;
  arrival_date: ISODate | null;
  departure_date: ISODate | null;
  stay_status: StayStatus;
  ski_days?: ISODate[]; // nur wenn der Teilnehmer das freigibt
}

/** Kleinste Schnittmenge, die die Statistikfunktionen brauchen. */
export type StatParticipant = Pick<
  Participant,
  | "id"
  | "arrival_date"
  | "departure_date"
  | "stay_status"
  | "status"
> &
  Partial<Pick<Participant, "approval">> &
  Partial<Pick<Participant, "ski_need" | "ski_days" | "ski_category" | "meal_mode" | "meal_days" | "diet">>;

export interface Meal {
  id: string;
  trip_id: string;
  day: ISODate;
  meal_type: MealType;
  dish: string;
  recipe_id: string | null;
  servings_override: number | null;
  kitchen_team: string | null;
  note: string | null;
  version: number;
}

export interface Recipe {
  id: string;
  trip_id: string;
  name: string;
  base_servings: number;
  notes: string | null;
  ingredients: RecipeIngredient[];
  version: number;
}

export interface RecipeIngredient {
  id: string;
  name: string;
  quantity: number | null;
  unit: string;
  category: string | null;
  note: string | null;
}

export interface ShoppingManualItem {
  id: string;
  name: string;
  quantity: number | null;
  unit: string;
  category: string | null;
  team: string | null;
  checked: boolean;
}

export interface IngredientAlias {
  alias: string; // normalisierte Schreibweise
  canonical: string;
  confirmed: boolean;
}
