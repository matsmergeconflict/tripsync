import type { NextRequest } from "next/server";
import { pool } from "@/lib/server/db";
import { handle } from "@/lib/server/http";
import { tripByPublicCode } from "@/lib/server/public";
import { sseResponse } from "@/lib/server/realtime";

export const GET = handle(async (req: NextRequest, ctx: RouteContext<"/api/public/[code]/events">) => {
  const { code } = await ctx.params;
  const trip = await tripByPublicCode(pool(), code);
  return sseResponse(trip.id, req.signal);
});
