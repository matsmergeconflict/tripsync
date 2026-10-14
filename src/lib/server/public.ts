import "server-only";
import type { Db } from "./db";
import { HttpError } from "./http";
import { looksLikeCode } from "./tokens";

/** Öffentliche Reisedaten, die Teilnehmer bei der Anmeldung sehen dürfen. */
export const PUBLIC_TRIP_COLUMNS = `id, name, location, start_date, end_date, ski_enabled, ski_categories, ski_notes, public_enabled, public_code`;

export async function tripByInvite(db: Db, code: string) {
  if (!looksLikeCode(code)) throw new HttpError(404, "Einladungslink ungültig");
  const { rows } = await db.query(`SELECT ${PUBLIC_TRIP_COLUMNS}, invite_enabled FROM trips WHERE invite_code = $1`, [code]);
  const t = rows[0];
  if (!t) throw new HttpError(404, "Einladungslink ungültig oder abgelaufen");
  if (!t.invite_enabled) throw new HttpError(403, "Anmeldungen sind für diese Reise derzeit geschlossen");
  return t;
}

export async function tripByPublicCode(db: Db, code: string) {
  if (!looksLikeCode(code)) throw new HttpError(404, "Übersicht nicht gefunden");
  const { rows } = await db.query(`SELECT ${PUBLIC_TRIP_COLUMNS} FROM trips WHERE public_code = $1`, [code]);
  const t = rows[0];
  // Bei deaktivierter Freigabe dieselbe Antwort wie bei unbekanntem Code (kein Informationsleck)
  if (!t || !t.public_enabled) throw new HttpError(404, "Diese Übersicht ist nicht (mehr) freigegeben");
  return t;
}

export function publicTripView(t: Record<string, unknown>) {
  return {
    name: t.name,
    location: t.location,
    start_date: t.start_date,
    end_date: t.end_date,
    ski_enabled: t.ski_enabled,
    ski_categories: t.ski_categories,
    ski_notes: t.ski_notes,
  };
}
