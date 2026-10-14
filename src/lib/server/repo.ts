import "server-only";
import type { Db } from "./db";
import type {
  Meal,
  Participant,
  PublicParticipant,
  Recipe,
  ShoppingManualItem,
  Trip,
} from "../types";
import type { ParticipantOrgInput } from "../validation";

export const TRIP_COLUMNS = `id, name, location, start_date, end_date, public_enabled, invite_enabled, require_approval, ski_enabled,
  ski_categories, ski_notes, version, created_at, updated_at`;

export type TripRow = Trip & { invite_enabled: boolean; invite_code?: string; public_code?: string };

export async function getTrip(db: Db, tripId: string, withCodes = false): Promise<TripRow | null> {
  const { rows } = await db.query(
    `SELECT ${TRIP_COLUMNS}${withCodes ? ", invite_code, public_code" : ""} FROM trips WHERE id = $1`,
    [tripId]
  );
  return rows[0] ?? null;
}

const PARTICIPANT_SELECT = `
  SELECT p.id, p.trip_id, p.registration_id, p.position, p.approval, p.first_name, p.last_name,
         r.contact, r.comment, p.org_note, p.status, p.version,
         p.created_at, p.updated_at,
         s.arrival_date, to_char(s.arrival_time, 'HH24:MI') AS arrival_time,
         s.departure_date, to_char(s.departure_time, 'HH24:MI') AS departure_time,
         COALESCE(s.stay_status, 'confirmed') AS stay_status,
         COALESCE(k.ski_need, 'unknown') AS ski_need, k.ski_category, k.ski_discount,
         COALESCE(k.share_public, false) AS share_ski_public,
         COALESCE((SELECT array_agg(d.day::text ORDER BY d.day) FROM ski_days d WHERE d.participant_id = p.id), '{}') AS ski_days,
         COALESCE(m.meal_mode, 'unknown') AS meal_mode, m.diet, m.food_wishes, m.allergies,
         COALESCE((SELECT array_agg(d.day::text ORDER BY d.day) FROM meal_days d WHERE d.participant_id = p.id), '{}') AS meal_days
    FROM participants p
    JOIN registrations r ON r.id = p.registration_id
    LEFT JOIN stays s ON s.participant_id = p.id
    LEFT JOIN ski_requests k ON k.participant_id = p.id
    LEFT JOIN meal_prefs m ON m.participant_id = p.id`;

export async function listParticipants(db: Db, tripId: string): Promise<Participant[]> {
  const { rows } = await db.query(`${PARTICIPANT_SELECT} WHERE p.trip_id = $1 ORDER BY lower(p.first_name), lower(p.last_name), p.created_at`, [tripId]);
  return rows;
}

export async function listRegistrationParticipants(db: Db, registrationId: string): Promise<Participant[]> {
  const { rows } = await db.query(`${PARTICIPANT_SELECT} WHERE p.registration_id = $1 ORDER BY p.position, p.created_at`, [registrationId]);
  return rows;
}

export async function getParticipant(db: Db, id: string): Promise<Participant | null> {
  const { rows } = await db.query(`${PARTICIPANT_SELECT} WHERE p.id = $1`, [id]);
  return rows[0] ?? null;
}

export interface Registration {
  id: string;
  trip_id: string;
  contact: string | null;
  comment: string | null;
  version: number;
}

export async function getRegistrationByTokenHash(db: Db, hash: string): Promise<Registration | null> {
  const { rows } = await db.query(`SELECT id, trip_id, contact, comment, version FROM registrations WHERE edit_token_hash = $1`, [hash]);
  return rows[0] ?? null;
}

/** Anzeigename in der Teilnehmerübersicht: voller Name (Vorgabe des Auftraggebers). */
export function displayName(p: Pick<Participant, "first_name" | "last_name">): string {
  return `${p.first_name} ${p.last_name}`.trim();
}

/** Reduziert Teilnehmer auf öffentlich erlaubte Felder (Allowlist, nicht Blocklist). Nur bestätigte, aktive Personen. */
export function toPublic(ps: Participant[]): PublicParticipant[] {
  const active = ps.filter((p) => p.status === "active" && p.approval === "approved");
  return active.map((p) => {
    const pub: PublicParticipant = {
      id: p.id,
      display_name: displayName(p),
      arrival_date: p.arrival_date,
      departure_date: p.departure_date,
      stay_status: p.stay_status,
    };
    if (p.share_ski_public && p.ski_need === "yes") pub.ski_days = p.ski_days;
    return pub;
  });
}

/** Schreibt alle Detailtabellen einer Anmeldung (Aufenthalt, Ski, Essen). */
export async function writeParticipantDetails(db: Db, participantId: string, p: Partial<ParticipantOrgInput>): Promise<void> {
  await db.query(
    `INSERT INTO stays (participant_id, arrival_date, arrival_time, departure_date, departure_time, stay_status)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (participant_id) DO UPDATE SET arrival_date=$2, arrival_time=$3, departure_date=$4, departure_time=$5, stay_status=$6`,
    [participantId, p.arrival_date ?? null, p.arrival_time ?? null, p.departure_date ?? null, p.departure_time ?? null, p.stay_status ?? "confirmed"]
  );
  await db.query(
    `INSERT INTO ski_requests (participant_id, ski_need, ski_category, ski_discount, share_public)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (participant_id) DO UPDATE SET ski_need=$2, ski_category=$3, ski_discount=$4, share_public=$5`,
    [participantId, p.ski_need ?? "unknown", p.ski_category ?? null, p.ski_discount ?? null, p.share_ski_public ?? false]
  );
  await db.query(`DELETE FROM ski_days WHERE participant_id = $1`, [participantId]);
  // Skitage nur speichern, wenn ein Skipass gewünscht/unklar ist; bei "nein" werden sie verworfen
  const skiDays = p.ski_need === "no" ? [] : p.ski_days ?? [];
  if (skiDays.length)
    await db.query(`INSERT INTO ski_days (participant_id, day) SELECT $1, unnest($2::date[])`, [participantId, skiDays]);

  await db.query(
    `INSERT INTO meal_prefs (participant_id, meal_mode, diet, food_wishes, allergies)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (participant_id) DO UPDATE SET meal_mode=$2, diet=$3, food_wishes=$4, allergies=$5`,
    [participantId, p.meal_mode ?? "unknown", p.diet ?? null, p.food_wishes ?? null, p.allergies ?? null]
  );
  await db.query(`DELETE FROM meal_days WHERE participant_id = $1`, [participantId]);
  const mealDays = p.meal_mode === "custom" ? p.meal_days ?? [] : [];
  if (mealDays.length)
    await db.query(`INSERT INTO meal_days (participant_id, day) SELECT $1, unnest($2::date[])`, [participantId, mealDays]);
}

export async function listMeals(db: Db, tripId: string): Promise<Meal[]> {
  const { rows } = await db.query(
    `SELECT id, trip_id, day, meal_type, dish, recipe_id, servings_override, kitchen_team, note, version
       FROM meals WHERE trip_id = $1
      ORDER BY day, array_position(ARRAY['breakfast','lunch','dinner','snack'], meal_type), created_at`,
    [tripId]
  );
  return rows;
}

export async function listRecipes(db: Db, tripId: string): Promise<Recipe[]> {
  const { rows } = await db.query(
    `SELECT r.id, r.trip_id, r.name, r.base_servings, r.notes, r.version,
            COALESCE((SELECT json_agg(json_build_object('id', i.id, 'name', i.name, 'quantity', i.quantity, 'unit', i.unit,
                                                        'category', i.category, 'note', i.note) ORDER BY i.position)
                        FROM recipe_ingredients i WHERE i.recipe_id = r.id), '[]'::json) AS ingredients
       FROM recipes r WHERE r.trip_id = $1 ORDER BY lower(r.name)`,
    [tripId]
  );
  return rows;
}

export async function listAliases(db: Db, tripId: string): Promise<{ alias: string; canonical: string }[]> {
  const { rows } = await db.query(`SELECT alias, canonical FROM ingredient_aliases WHERE trip_id = $1 ORDER BY canonical, alias`, [tripId]);
  return rows;
}

export async function listShoppingItems(db: Db, tripId: string): Promise<ShoppingManualItem[]> {
  const { rows } = await db.query(
    `SELECT id, name, quantity, unit, category, team, checked FROM shopping_items WHERE trip_id = $1 ORDER BY created_at`,
    [tripId]
  );
  return rows;
}

export async function listShoppingState(db: Db, tripId: string): Promise<{ item_key: string; checked: boolean; team: string | null }[]> {
  const { rows } = await db.query(`SELECT item_key, checked, team FROM shopping_state WHERE trip_id = $1`, [tripId]);
  return rows;
}
