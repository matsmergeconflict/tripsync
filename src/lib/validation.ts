import { z } from "zod";
import { isISODate } from "./dates";

const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Maximal ${max} Zeichen`)
    .nullable()
    .optional()
    .transform((v) => (v ? v : null));

/** Wie optText, aber "nicht gesendet" bleibt undefined (für Teil-Updates). */
const patchText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Maximal ${max} Zeichen`)
    .nullable()
    .optional()
    .transform((v) => (v === undefined ? undefined : v ? v : null));

export const isoDate = z.string().refine(isISODate, "Ungültiges Datum");
const optDate = isoDate.nullable().optional().transform((v) => v ?? null);
const optTime = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, "Ungültige Uhrzeit")
  .nullable()
  .optional()
  .or(z.literal(""))
  .transform((v) => (v ? v.slice(0, 5) : null));
const dayList = z
  .array(isoDate)
  .max(130)
  .optional()
  .transform((v) => [...new Set(v ?? [])].sort());

/** Angaben zu einer Person (ohne gruppenweite Felder wie Kontakt). */
export const personSchema = z.object({
  id: z.string().uuid().optional(),
  first_name: z.string().trim().min(1, "Vorname fehlt").max(60),
  last_name: z.string().trim().min(1, "Nachname fehlt").max(60),
  arrival_date: optDate,
  arrival_time: optTime,
  departure_date: optDate,
  departure_time: optTime,
  stay_status: z.enum(["confirmed", "tentative"]).default("confirmed"),
  ski_need: z.enum(["yes", "no", "unknown"]).default("unknown"),
  ski_days: dayList,
  ski_category: optText(60),
  ski_discount: optText(200),
  share_ski_public: z.boolean().optional().default(false),
  meal_mode: z.enum(["all_present", "custom", "none", "unknown"]).default("unknown"),
  meal_days: dayList,
  diet: z.enum(["omnivore", "vegetarian", "vegan", "pescetarian", "other"]).nullable().optional().transform((v) => v ?? null),
  food_wishes: optText(1000),
  allergies: optText(1000),
  status: z.enum(["active", "withdrawn"]).optional(),
});
export type PersonInput = z.infer<typeof personSchema>;

const groupFields = {
  contact: optText(200),
  comment: optText(2000),
};

/**
 * Anmeldung über den Einladungslink: eine oder mehrere Personen (z. B. Familie).
 * Aus Kompatibilitätsgründen wird auch eine einzelne Person ohne `persons` akzeptiert.
 */
export const registrationSchema = z.preprocess(
  (raw) => {
    if (raw && typeof raw === "object" && !Array.isArray(raw) && !("persons" in raw)) {
      const { contact, comment, ...person } = raw as Record<string, unknown>;
      return { contact, comment, persons: [person] };
    }
    return raw;
  },
  z.object({
    ...groupFields,
    persons: z.array(personSchema).min(1, "Mindestens eine Person").max(12, "Maximal 12 Personen pro Anmeldung"),
  })
);
export type RegistrationInput = z.infer<typeof registrationSchema>;

/** Kompatibler Alias: einzelne Person inkl. Gruppenfeldern. */
export const participantSelfSchema = personSchema.extend(groupFields);
export type ParticipantSelfInput = z.infer<typeof participantSelfSchema>;

/** Organisatoren dürfen zusätzlich interne Notizen pflegen. */
export const participantOrgSchema = participantSelfSchema.extend({
  org_note: optText(2000),
});
export type ParticipantOrgInput = z.infer<typeof participantOrgSchema>;

/** Prüft die Daten gegen den Reisezeitraum. Gibt Fehlermeldungen je Feld zurück. */
export function validateAgainstTrip(
  p: Pick<PersonInput, "arrival_date" | "departure_date" | "ski_days" | "meal_days">,
  trip: { start_date: string; end_date: string }
): Record<string, string> {
  const errors: Record<string, string> = {};
  const inTrip = (d: string) => d >= trip.start_date && d <= trip.end_date;
  if (p.arrival_date && !inTrip(p.arrival_date)) errors.arrival_date = "Anreise liegt außerhalb des Reisezeitraums";
  if (p.departure_date && !inTrip(p.departure_date)) errors.departure_date = "Abreise liegt außerhalb des Reisezeitraums";
  if (p.arrival_date && p.departure_date && p.departure_date < p.arrival_date)
    errors.departure_date = "Abreise darf nicht vor der Anreise liegen";
  if (p.ski_days.some((d) => !inTrip(d))) errors.ski_days = "Skitage müssen im Reisezeitraum liegen";
  if (p.meal_days.some((d) => !inTrip(d))) errors.meal_days = "Essenstage müssen im Reisezeitraum liegen";
  return errors;
}

export const skiCategorySchema = z.object({
  id: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(60),
  price: z.number().min(0).max(10000).nullable().optional().transform((v) => v ?? null),
  note: z.string().trim().max(200).optional(),
});

export const tripCreateSchema = z
  .object({
    name: z.string().trim().min(1, "Name fehlt").max(120),
    location: optText(120),
    start_date: isoDate,
    end_date: isoDate,
    organizer_name: z.string().trim().min(1, "Dein Name fehlt").max(80),
  })
  .refine((t) => t.end_date >= t.start_date, { message: "Ende muss nach dem Beginn liegen", path: ["end_date"] });

export const tripUpdateSchema = z.object({
  version: z.number().int(),
  require_approval: z.boolean().optional(),
  name: z.string().trim().min(1).max(120).optional(),
  location: patchText(120),
  start_date: isoDate.optional(),
  end_date: isoDate.optional(),
  public_enabled: z.boolean().optional(),
  invite_enabled: z.boolean().optional(),
  ski_enabled: z.boolean().optional(),
  ski_categories: z.array(skiCategorySchema).max(20).optional(),
  ski_notes: patchText(2000),
});

export const mealSchema = z.object({
  day: isoDate,
  meal_type: z.enum(["breakfast", "lunch", "dinner", "snack"]),
  dish: z.string().trim().min(1, "Gericht fehlt").max(120),
  recipe_id: z.string().uuid().nullable().optional().transform((v) => v ?? null),
  servings_override: z.number().int().min(0).max(10000).nullable().optional().transform((v) => v ?? null),
  kitchen_team: optText(120),
  note: optText(1000),
});

export const ingredientSchema = z.object({
  name: z.string().trim().min(1).max(120),
  quantity: z.number().min(0).max(1_000_000).nullable().optional().transform((v) => v ?? null),
  unit: z.string().trim().max(20).default(""),
  category: optText(60),
  note: optText(200),
});

export const recipeSchema = z.object({
  name: z.string().trim().min(1, "Name fehlt").max(120),
  base_servings: z.number().positive().max(1000),
  notes: optText(4000),
  ingredients: z.array(ingredientSchema).max(200).default([]),
});

export const shoppingItemSchema = z.object({
  name: z.string().trim().min(1).max(120),
  quantity: z.number().min(0).max(1_000_000).nullable().optional().transform((v) => v ?? null),
  unit: z.string().trim().max(20).default(""),
  category: optText(60),
  team: optText(80),
  checked: z.boolean().optional().default(false),
});

/** Zod-Fehler in ein einfaches Feld→Meldung-Objekt umwandeln. */
export function fieldErrors(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join(".") || "_";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
