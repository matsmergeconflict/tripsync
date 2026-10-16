import "server-only";
import type { PoolClient } from "pg";
import { audit, diff, type Actor } from "./audit";
import { notifyTrip } from "./db";
import { HttpError } from "./http";
import { getParticipant, getTrip, listRegistrationParticipants, writeParticipantDetails, type Registration } from "./repo";
import { hashToken, newSecretToken } from "./tokens";
import { validateAgainstTrip, type ParticipantOrgInput, type PersonInput, type RegistrationInput } from "../validation";
import type { Approval, Participant } from "../types";

async function loadTrip(c: PoolClient, tripId: string) {
  const trip = await getTrip(c, tripId);
  if (!trip) throw new HttpError(404, "Reise nicht gefunden");
  return trip;
}

/** Prüft alle Personen gegen den Reisezeitraum; Feldfehler werden mit Personenindex zurückgegeben. */
function checkPersons(
  persons: PersonInput[],
  trip: { start_date: string; end_date: string; ski_enabled?: boolean; ski_categories?: { id: string }[] },
  strict = false
) {
  persons.forEach((p, i) => {
    const errors = validateAgainstTrip(p, trip);
    if (strict && trip.ski_enabled && p.ski_need === "yes" && (trip.ski_categories?.length ?? 0) > 0 && !p.ski_category)
      errors.ski_category = "Bitte die Passkategorie wählen";
    if (strict && p.ski_category && trip.ski_categories && !trip.ski_categories.some((c) => c.id === p.ski_category))
      errors.ski_category = "Unbekannte Passkategorie";
    if (Object.keys(errors).length) {
      const fields = Object.fromEntries(Object.entries(errors).map(([k, v]) => [persons.length > 1 ? `persons.${i}.${k}` : k, v]));
      const who = persons.length > 1 ? `${p.first_name}: ` : "";
      throw new HttpError(400, who + Object.values(errors)[0], { fields });
    }
  });
}

/** Für das Protokoll relevante Felder (sensible Inhalte werden in diff() maskiert). */
function auditView(p: Participant): Record<string, unknown> {
  const { id: _id, trip_id: _t, created_at: _c, updated_at: _u, version: _v, registration_id: _r, position: _p, ...rest } = p;
  return rest;
}

async function insertPerson(c: PoolClient, tripId: string, registrationId: string, position: number, p: PersonInput & { org_note?: string | null }, approval: Approval) {
  const { rows } = await c.query(
    `INSERT INTO participants (trip_id, registration_id, position, approval, first_name, last_name, org_note, status, phone, email, birth_date)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
    [tripId, registrationId, position, approval, p.first_name, p.last_name ?? "", p.org_note ?? null, p.status ?? "active", p.phone ?? null, p.email ?? null, p.birth_date ?? null]
  );
  const id = rows[0].id as string;
  await writeParticipantDetails(c, id, p);
  return id;
}

/**
 * Neue Anmeldung (eine oder mehrere Personen) mit gemeinsamem persönlichen Link.
 * Ohne Organisatorbeteiligung wartet sie auf Bestätigung, wenn die Reise das verlangt.
 */
export async function createRegistration(
  c: PoolClient,
  tripId: string,
  input: RegistrationInput & { persons: (PersonInput & { org_note?: string | null })[] },
  actor: Actor,
  opts: { byOrganizer: boolean }
): Promise<{ registrationId: string; ids: string[]; token: string; approval: Approval }> {
  const trip = await loadTrip(c, tripId);
  checkPersons(input.persons, trip, !opts.byOrganizer);
  const approval: Approval = opts.byOrganizer || !trip.require_approval ? "approved" : "pending";
  const token = newSecretToken();
  const { rows } = await c.query(`INSERT INTO registrations (trip_id, edit_token_hash, contact, comment) VALUES ($1,$2,$3,$4) RETURNING id`, [
    tripId,
    hashToken(token),
    input.contact ?? null,
    input.comment ?? null,
  ]);
  const registrationId = rows[0].id as string;
  const ids: string[] = [];
  for (const [i, p] of input.persons.entries()) {
    const id = await insertPerson(c, tripId, registrationId, i, { ...p, status: "active" }, approval);
    ids.push(id);
    const after = await getParticipant(c, id);
    await audit(c, tripId, actor, "participant", id, "create", diff(null, auditView(after!)));
  }
  await notifyTrip(c, tripId);
  return { registrationId, ids, token, approval };
}

/**
 * Teilnehmer bearbeitet seine gesamte Anmeldung über den persönlichen Link.
 * - Personen mit bekannter ID werden aktualisiert (nur Personen dieser Anmeldung!)
 * - Personen ohne ID werden ergänzt (warten ggf. auf Bestätigung)
 * - Personen, die fehlen, werden entfernt
 * Optimistische Sperre über die Version der Anmeldung.
 */
export async function updateRegistrationSelf(
  c: PoolClient,
  reg: Registration,
  expectedVersion: number,
  input: RegistrationInput,
  actor: Actor
): Promise<void> {
  const trip = await loadTrip(c, reg.trip_id);
  checkPersons(input.persons, trip, true);
  const res = await c.query(
    `UPDATE registrations SET contact=$3, comment=$4, version=version+1, updated_at=now() WHERE id=$1 AND version=$2`,
    [reg.id, expectedVersion, input.contact ?? null, input.comment ?? null]
  );
  if (!res.rowCount) {
    const current = (await listRegistrationParticipants(c, reg.id)).map(stripOrgFields);
    throw new HttpError(409, "Deine Anmeldung wurde zwischenzeitlich geändert. Bitte prüfe den aktuellen Stand.", { current: current[0] ?? null, participants: current });
  }
  if (reg.contact !== (input.contact ?? null) || reg.comment !== (input.comment ?? null))
    await audit(c, reg.trip_id, actor, "registration", reg.id, "update", diff({ contact: reg.contact, comment: reg.comment }, { contact: input.contact, comment: input.comment }));

  const existing = await listRegistrationParticipants(c, reg.id);
  const byId = new Map(existing.map((p) => [p.id, p]));
  const keep = new Set<string>();
  const newApproval: Approval = trip.require_approval ? "pending" : "approved";

  for (const [i, p] of input.persons.entries()) {
    if (p.id && !byId.has(p.id)) throw new HttpError(403, "Diese Person gehört nicht zu deiner Anmeldung");
    if (p.id) {
      const before = byId.get(p.id)!;
      keep.add(p.id);
      await c.query(
        `UPDATE participants SET first_name=$2, last_name=$3, status=$4, position=$5, phone=$6, email=$7, birth_date=$8,
                version=version+1, updated_at=now() WHERE id=$1`,
        [p.id, p.first_name, p.last_name, p.status ?? before.status, i, p.phone ?? null, p.email ?? null, p.birth_date ?? null]
      );
      await writeParticipantDetails(c, p.id, p);
      const after = (await getParticipant(c, p.id))!;
      const changes = diff(auditView(before), auditView(after));
      delete changes.org_note;
      await audit(c, reg.trip_id, actor, "participant", p.id, "update", changes);
    } else {
      const id = await insertPerson(c, reg.trip_id, reg.id, i, { ...p, status: "active" }, newApproval);
      keep.add(id);
      const after = await getParticipant(c, id);
      await audit(c, reg.trip_id, actor, "participant", id, "create", diff(null, auditView(after!)));
    }
  }
  for (const p of existing) {
    if (keep.has(p.id)) continue;
    await c.query(`DELETE FROM participants WHERE id = $1`, [p.id]);
    await audit(c, reg.trip_id, actor, "participant", p.id, "delete", { name: `${p.first_name} ${p.last_name}`.trim() });
  }
  if (keep.size === 0) throw new HttpError(400, "Mindestens eine Person muss angemeldet bleiben – zum Absagen bitte „Teilnahme zurückziehen“ nutzen");
  await notifyTrip(c, reg.trip_id);
}

/**
 * Organisator korrigiert eine einzelne Person (optimistische Sperre pro Person).
 * Kontakt und Kommentar gelten für die ganze Anmeldung.
 */
export async function updateParticipant(
  c: PoolClient,
  participantId: string,
  expectedVersion: number,
  input: ParticipantOrgInput,
  actor: Actor
): Promise<Participant> {
  const before = await getParticipant(c, participantId);
  if (!before) throw new HttpError(404, "Anmeldung nicht gefunden");
  const trip = await loadTrip(c, before.trip_id);
  checkPersons([input], trip);
  const { rowCount } = await c.query(
    `UPDATE participants SET first_name=$3, last_name=$4, org_note=$5, status=$6, phone=$7, email=$8, birth_date=$9,
            version=version+1, updated_at=now()
      WHERE id=$1 AND version=$2`,
    [participantId, expectedVersion, input.first_name, input.last_name ?? "", input.org_note ?? null, input.status ?? before.status, input.phone ?? null, input.email ?? null, input.birth_date ?? null]
  );
  if (!rowCount)
    throw new HttpError(409, "Diese Anmeldung wurde zwischenzeitlich geändert. Bitte prüfe den aktuellen Stand.", { current: before });
  // Version der Anmeldung erhöhen, damit gleichzeitiges Speichern über den persönlichen Link erkannt wird
  await c.query(`UPDATE registrations SET contact=$2, comment=$3, version=version+1, updated_at=now() WHERE id=$1`, [
    before.registration_id,
    input.contact ?? null,
    input.comment ?? null,
  ]);
  await writeParticipantDetails(c, participantId, input);
  const after = (await getParticipant(c, participantId))!;
  await audit(c, before.trip_id, actor, "participant", participantId, "update", diff(auditView(before), auditView(after)));
  await notifyTrip(c, before.trip_id);
  return after;
}

export async function setApproval(c: PoolClient, tripId: string, participantIds: string[], decision: Approval, actor: Actor): Promise<number> {
  const { rows } = await c.query(
    `UPDATE participants SET approval = $3, updated_at = now(), version = version + 1
      WHERE trip_id = $1 AND id = ANY($2::uuid[]) AND approval <> $3
      RETURNING id, first_name, last_name`,
    [tripId, participantIds, decision]
  );
  for (const r of rows)
    await audit(c, tripId, actor, "participant", r.id, decision === "approved" ? "approve" : decision === "rejected" ? "reject" : "unapprove", {
      name: `${r.first_name} ${r.last_name}`.trim(),
    });
  if (rows.length) await notifyTrip(c, tripId);
  return rows.length;
}

export function stripOrgFields(p: Participant): Omit<Participant, "org_note"> {
  const { org_note: _o, ...rest } = p;
  return rest;
}

/** Neuer persönlicher Link für die Anmeldung, zu der die Person gehört (alter Link wird ungültig). */
export async function resetEditToken(c: PoolClient, participantId: string): Promise<string> {
  const token = newSecretToken();
  await c.query(`UPDATE registrations SET edit_token_hash = $2 WHERE id = (SELECT registration_id FROM participants WHERE id = $1)`, [
    participantId,
    hashToken(token),
  ]);
  return token;
}
