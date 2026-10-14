import type { NextRequest } from "next/server";
import { tx, notifyTrip } from "@/lib/server/db";
import { audit } from "@/lib/server/audit";
import { assertUuid, baseUrl, handle, HttpError, json, requireOrganizer, setOrgCookie } from "@/lib/server/http";
import { hashToken, newSecretToken } from "@/lib/server/tokens";

type Ctx = RouteContext<"/api/trips/[tripId]/organizers/[oid]">;

/** Organisatorzugang entziehen. Der letzte aktive Organisator kann nicht entfernt werden. */
export const DELETE = handle(async (req: NextRequest, ctx: Ctx) => {
  const { tripId, oid } = await ctx.params;
  const me = await requireOrganizer(req, tripId);
  assertUuid(oid, "Organisator");
  await tx(async (c) => {
    const { rows } = await c.query(`SELECT id, name FROM organizers WHERE trip_id = $1 AND revoked_at IS NULL FOR UPDATE`, [tripId]);
    const target = rows.find((r) => r.id === oid);
    if (!target) throw new HttpError(404, "Organisator nicht gefunden");
    if (rows.length <= 1) throw new HttpError(400, "Der letzte Organisator kann nicht entfernt werden");
    await c.query(`UPDATE organizers SET revoked_at = now() WHERE id = $1`, [oid]);
    await audit(c, tripId, me.actor, "organizer", oid, "revoke", { name: target.name });
    await notifyTrip(c, tripId);
  });
  return json({ ok: true });
});

/** Neuen Link für einen Organisator erzeugen (alter Link wird ungültig). */
export const POST = handle(async (req: NextRequest, ctx: Ctx) => {
  const { tripId, oid } = await ctx.params;
  const me = await requireOrganizer(req, tripId);
  assertUuid(oid, "Organisator");
  const token = newSecretToken();
  await tx(async (c) => {
    const { rowCount } = await c.query(
      `UPDATE organizers SET token_hash = $3 WHERE id = $1 AND trip_id = $2 AND revoked_at IS NULL`,
      [oid, tripId, hashToken(token)]
    );
    if (!rowCount) throw new HttpError(404, "Organisator nicht gefunden");
    await audit(c, tripId, me.actor, "organizer", oid, "reset_link");
  });
  const res = json({ url: `${baseUrl(req)}/o/${token}` });
  if (oid === me.organizerId) setOrgCookie(req, res, tripId, token); // eigener Link: Sitzung behalten
  return res;
});
