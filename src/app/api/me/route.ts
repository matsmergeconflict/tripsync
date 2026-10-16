import type { NextRequest } from "next/server";
import { z } from "zod";
import { pool, tx } from "@/lib/server/db";
import { baseUrl, handle, HttpError, json, readJson } from "@/lib/server/http";
import { stripOrgFields, updateRegistrationSelf } from "@/lib/server/participants";
import { publicTripView, PUBLIC_TRIP_COLUMNS } from "@/lib/server/public";
import { getRegistrationByTokenHash, listRegistrationParticipants } from "@/lib/server/repo";
import { hashToken, looksLikeToken } from "@/lib/server/tokens";
import { selfRegistrationSchema } from "@/lib/validation";

/**
 * Persönlicher Schreibzugriff: ausschließlich über den Bearbeitungstoken im Header
 * `x-edit-token`. Der Token identifiziert genau eine Anmeldung (ggf. mehrere Personen) –
 * andere Anmeldungen sind über diesen Endpunkt technisch nicht erreichbar.
 */
async function self(req: NextRequest) {
  const token = req.headers.get("x-edit-token");
  if (!looksLikeToken(token)) throw new HttpError(401, "Persönlicher Link ungültig");
  const reg = await getRegistrationByTokenHash(pool(), hashToken(token));
  if (!reg) throw new HttpError(401, "Persönlicher Link ungültig oder wurde zurückgesetzt");
  return reg;
}

export const GET = handle(async (req: NextRequest) => {
  const reg = await self(req);
  const db = pool();
  const [participants, tripRes] = await Promise.all([
    listRegistrationParticipants(db, reg.id),
    db.query(`SELECT ${PUBLIC_TRIP_COLUMNS} FROM trips WHERE id = $1`, [reg.trip_id]),
  ]);
  const trip = tripRes.rows[0];
  const p0 = participants[0];
  return json({
    registration: { id: reg.id, contact: reg.contact, comment: reg.comment, version: reg.version },
    participants: participants.map(stripOrgFields),
    // Kompatibilität: erste Person einzeln
    participant: p0 ? stripOrgFields(p0) : null,
    trip: publicTripView(trip),
    public_url: trip.public_enabled ? `${baseUrl(req)}/view/${trip.public_code}` : null,
  });
});

const patchSchema = z.preprocess(
  (raw) => raw,
  z.intersection(z.object({ version: z.number().int() }), selfRegistrationSchema)
);

export const PATCH = handle(async (req: NextRequest) => {
  const reg = await self(req);
  const { version, ...input } = await readJson(req, patchSchema);
  const current = await listRegistrationParticipants(pool(), reg.id);
  const first = current[0];
  const label = first ? `${first.first_name} ${first.last_name}`.trim() : "Teilnehmer";
  // Einzelperson ohne ID (alte Clients): auf die vorhandene Person abbilden
  if (input.persons.length === 1 && !input.persons[0].id && current.length === 1) input.persons[0].id = current[0].id;
  await tx((c) => updateRegistrationSelf(c, reg, version, input, { type: "participant", id: first?.id ?? null, label }));
  const participants = await listRegistrationParticipants(pool(), reg.id);
  const fresh = await getRegistrationByTokenHash(pool(), hashToken(req.headers.get("x-edit-token")!));
  return json({
    registration: { id: reg.id, contact: fresh?.contact ?? null, comment: fresh?.comment ?? null, version: fresh?.version ?? version + 1 },
    participants: participants.map(stripOrgFields),
    participant: participants[0] ? stripOrgFields(participants[0]) : null,
  });
});
