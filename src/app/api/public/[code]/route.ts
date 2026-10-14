import type { NextRequest } from "next/server";
import { pool } from "@/lib/server/db";
import { handle, json } from "@/lib/server/http";
import { publicTripView, tripByPublicCode } from "@/lib/server/public";
import { listParticipants, toPublic } from "@/lib/server/repo";

/** Öffentliche Teilnehmerübersicht: nur Anzeigename und Aufenthaltszeitraum (Allowlist). */
export const GET = handle(async (_req: NextRequest, ctx: RouteContext<"/api/public/[code]">) => {
  const { code } = await ctx.params;
  const trip = await tripByPublicCode(pool(), code);
  const participants = toPublic(await listParticipants(pool(), trip.id));
  return json({ trip: publicTripView(trip), participants });
});
