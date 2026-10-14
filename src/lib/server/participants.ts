import "server-only";
import type { PoolClient } from "pg";
import { audit, diff, type Actor } from "./audit";
import { notifyTrip } from "./db";
import { HttpError } from "./http";
import { getParticipant, getTrip, writeParticipantDetails } from "./repo";
import { hashToken, newSecretToken } from "./tokens";
import { validateAgainstTrip, type ParticipantOrgInput } from "../validation";
import type { Participant } from "../types";

function checkTripRange(c: PoolClient, tripId: string, input: ParticipantOrgInput) {
  return getTrip(c, tripId).then((trip) => {
    if (!trip) throw new HttpError(404, "Reise nicht gefunden");
    const errors = validateAgainstTrip(input, trip);
    if (Object.keys(errors).length) throw new HttpError(400, Object.values(errors)[0], { fields: errors });
    return trip;
  });
}

export async function createParticipant(
  c: PoolClient,
  tripId: string,
  input: ParticipantOrgInput,
  actor: Actor
): Promise<{ id: string; token: string }> {
  await checkTripRange(c, tripId, input);
  const token = newSecretToken();
  const { rows } = await c.query(
    `INSERT INTO participants (trip_id, first_name, last_name, contact, comment, org_note, status, edit_token_hash)
     VALUES ($1,$2,$3,$4,$5,$6,'active',$7) RETURNING id`,
    [tripId, input.first_name, input.last_name ?? "", input.contact, input.comment, input.org_note ?? null, hashToken(token)]
  );
  const id = rows[0].id as string;
  await writeParticipantDetails(c, id, input);
  const after = await getParticipant(c, id);
  await audit(c, tripId, actor, "participant", id, "create", diff(null, publicAuditView(after!)));
  await notifyTrip(c, tripId);
  return { id, token };
}

/** Für das Protokoll relevante Felder (sensible Inhalte werden in diff() maskiert). */
function publicAuditView(p: Participant): Record<string, unknown> {
  const {
    id: _id,
    trip_id: _t,
    created_at: _c,
    updated_at: _u,
    version: _v,
    ...rest
  } = p;
  return rest;
}

/**
 * Aktualisiert eine Anmeldung mit optimistischer Sperre.
 * Wurde der Datensatz seit dem Laden geändert (version weicht ab), wird 409 mit dem
 * aktuellen Stand geliefert – nichts wird stillschweigend überschrieben.
 */
export async function updateParticipant(
  c: PoolClient,
  participantId: string,
  expectedVersion: number,
  input: ParticipantOrgInput,
  actor: Actor,
  opts: { allowOrgFields: boolean }
): Promise<Participant> {
  const before = await getParticipant(c, participantId);
  if (!before) throw new HttpError(404, "Anmeldung nicht gefunden");
  await checkTripRange(c, before.trip_id, input);
  const { rowCount } = await c.query(
    `UPDATE participants SET first_name=$3, last_name=$4, contact=$5, comment=$6, org_note=$7, status=$8,
            version=version+1, updated_at=now()
      WHERE id=$1 AND version=$2`,
    [
      participantId,
      expectedVersion,
      input.first_name,
      input.last_name ?? "",
      input.contact,
      input.comment,
      opts.allowOrgFields ? input.org_note ?? null : before.org_note,
      input.status ?? before.status,
    ]
  );
  if (!rowCount)
    throw new HttpError(409, "Diese Anmeldung wurde zwischenzeitlich geändert. Bitte prüfe den aktuellen Stand.", {
      current: opts.allowOrgFields ? before : stripOrgFields(before),
    });
  await writeParticipantDetails(c, participantId, input);
  const after = (await getParticipant(c, participantId))!;
  const changes = diff(publicAuditView(before), publicAuditView(after));
  if (!opts.allowOrgFields) delete changes.org_note;
  await audit(c, before.trip_id, actor, "participant", participantId, "update", changes);
  await notifyTrip(c, before.trip_id);
  return after;
}

export function stripOrgFields(p: Participant): Omit<Participant, "org_note"> {
  const { org_note: _o, ...rest } = p;
  return rest;
}

export async function resetEditToken(c: PoolClient, participantId: string): Promise<string> {
  const token = newSecretToken();
  await c.query(`UPDATE participants SET edit_token_hash = $2 WHERE id = $1`, [participantId, hashToken(token)]);
  return token;
}
