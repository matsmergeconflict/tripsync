import type { NextRequest } from "next/server";
import { z } from "zod";
import { pool, tx } from "@/lib/server/db";
import { baseUrl, handle, HttpError, json, readJson } from "@/lib/server/http";
import { stripOrgFields, updateParticipant } from "@/lib/server/participants";
import { publicTripView, PUBLIC_TRIP_COLUMNS } from "@/lib/server/public";
import { getParticipantByTokenHash } from "@/lib/server/repo";
import { hashToken, looksLikeToken } from "@/lib/server/tokens";
import { participantSelfSchema } from "@/lib/validation";

/**
 * Persönlicher Schreibzugriff: ausschließlich über den Bearbeitungstoken im Header
 * `x-edit-token`. Der Token identifiziert genau eine Anmeldung – andere Anmeldungen
 * sind über diesen Endpunkt technisch nicht erreichbar.
 */
async function self(req: NextRequest) {
  const token = req.headers.get("x-edit-token");
  if (!looksLikeToken(token)) throw new HttpError(401, "Persönlicher Link ungültig");
  const p = await getParticipantByTokenHash(pool(), hashToken(token));
  if (!p) throw new HttpError(401, "Persönlicher Link ungültig oder wurde zurückgesetzt");
  return p;
}

export const GET = handle(async (req: NextRequest) => {
  const p = await self(req);
  const { rows } = await pool().query(`SELECT ${PUBLIC_TRIP_COLUMNS} FROM trips WHERE id = $1`, [p.trip_id]);
  const trip = rows[0];
  return json({
    participant: stripOrgFields(p),
    trip: publicTripView(trip),
    public_url: trip.public_enabled ? `${baseUrl(req)}/view/${trip.public_code}` : null,
  });
});

const patchSchema = participantSelfSchema.extend({ version: z.number().int() });

export const PATCH = handle(async (req: NextRequest) => {
  const p = await self(req);
  const { version, ...input } = await readJson(req, patchSchema);
  const actor = { type: "participant" as const, id: p.id, label: `${p.first_name} ${p.last_name}`.trim() };
  const updated = await tx((c) => updateParticipant(c, p.id, version, { ...input, org_note: null }, actor, { allowOrgFields: false }));
  return json({ participant: stripOrgFields(updated) });
});
