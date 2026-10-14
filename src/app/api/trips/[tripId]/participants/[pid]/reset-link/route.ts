import type { NextRequest } from "next/server";
import { pool, tx } from "@/lib/server/db";
import { audit } from "@/lib/server/audit";
import { assertUuid, baseUrl, handle, HttpError, json, requireOrganizer } from "@/lib/server/http";
import { resetEditToken } from "@/lib/server/participants";
import { getParticipant } from "@/lib/server/repo";

/**
 * Neuen persönlichen Bearbeitungslink erzeugen. Der alte Link wird sofort ungültig.
 * (Links werden nur gehasht gespeichert und können daher nicht erneut angezeigt werden.)
 */
export const POST = handle(async (req: NextRequest, ctx: RouteContext<"/api/trips/[tripId]/participants/[pid]/reset-link">) => {
  const { tripId, pid } = await ctx.params;
  const me = await requireOrganizer(req, tripId);
  assertUuid(pid, "Anmeldung");
  const p = await getParticipant(pool(), pid);
  if (!p || p.trip_id !== tripId) throw new HttpError(404, "Anmeldung nicht gefunden");
  const token = await tx(async (c) => {
    const t = await resetEditToken(c, pid);
    await audit(c, tripId, me.actor, "participant", pid, "reset_edit_link");
    return t;
  });
  return json({ edit_url: `${baseUrl(req)}/edit/${token}` });
});
