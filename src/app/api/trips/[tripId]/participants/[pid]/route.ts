import type { NextRequest } from "next/server";
import { z } from "zod";
import { pool, tx, notifyTrip } from "@/lib/server/db";
import { audit } from "@/lib/server/audit";
import { assertUuid, handle, HttpError, json, readJson, requireOrganizer } from "@/lib/server/http";
import { updateParticipant } from "@/lib/server/participants";
import { getParticipant } from "@/lib/server/repo";
import { participantOrgSchema } from "@/lib/validation";

type Ctx = RouteContext<"/api/trips/[tripId]/participants/[pid]">;

async function load(tripId: string, pid: string) {
  assertUuid(pid, "Anmeldung");
  const p = await getParticipant(pool(), pid);
  if (!p || p.trip_id !== tripId) throw new HttpError(404, "Anmeldung nicht gefunden");
  return p;
}

export const GET = handle(async (req: NextRequest, ctx: Ctx) => {
  const { tripId, pid } = await ctx.params;
  await requireOrganizer(req, tripId);
  return json({ participant: await load(tripId, pid) });
});

const patchSchema = participantOrgSchema.extend({ version: z.number().int() });

/** Organisator korrigiert eine Anmeldung (wird protokolliert). */
export const PATCH = handle(async (req: NextRequest, ctx: Ctx) => {
  const { tripId, pid } = await ctx.params;
  const me = await requireOrganizer(req, tripId);
  await load(tripId, pid);
  const { version, ...input } = await readJson(req, patchSchema);
  const participant = await tx((c) => updateParticipant(c, pid, version, input, me.actor, { allowOrgFields: true }));
  return json({ participant });
});

/** Anmeldung endgültig löschen (z. B. auf Wunsch der Person, DSGVO). */
export const DELETE = handle(async (req: NextRequest, ctx: Ctx) => {
  const { tripId, pid } = await ctx.params;
  const me = await requireOrganizer(req, tripId);
  const p = await load(tripId, pid);
  await tx(async (c) => {
    await c.query(`DELETE FROM participants WHERE id = $1`, [pid]);
    await audit(c, tripId, me.actor, "participant", pid, "delete", { name: `${p.first_name} ${p.last_name}`.trim() });
    await notifyTrip(c, tripId);
  });
  return json({ ok: true });
});
