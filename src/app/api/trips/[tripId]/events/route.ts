import type { NextRequest } from "next/server";
import { handle, requireOrganizer } from "@/lib/server/http";
import { sseResponse } from "@/lib/server/realtime";

/** Live-Ereignisse für Organisatoren (Server-Sent Events). */
export const GET = handle(async (req: NextRequest, ctx: RouteContext<"/api/trips/[tripId]/events">) => {
  const { tripId } = await ctx.params;
  await requireOrganizer(req, tripId);
  return sseResponse(tripId, req.signal);
});
