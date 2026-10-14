import type { NextRequest } from "next/server";
import { pool, tx } from "@/lib/server/db";
import { baseUrl, clientIp, handle, json, rateLimit, readJson } from "@/lib/server/http";
import { createParticipant } from "@/lib/server/participants";
import { publicTripView, tripByInvite } from "@/lib/server/public";
import { participantSelfSchema } from "@/lib/validation";

type Ctx = RouteContext<"/api/join/[code]">;

/** Reiseinformationen für das Anmeldeformular. */
export const GET = handle(async (_req: NextRequest, ctx: Ctx) => {
  const { code } = await ctx.params;
  const trip = await tripByInvite(pool(), code);
  return json({ trip: publicTripView(trip) });
});

/** Anmeldung ohne Benutzerkonto. Antwort enthält den persönlichen Bearbeitungslink. */
export const POST = handle(async (req: NextRequest, ctx: Ctx) => {
  const { code } = await ctx.params;
  rateLimit(`join:${clientIp(req)}`, 20, 60_000);
  const trip = await tripByInvite(pool(), code);
  const input = await readJson(req, participantSelfSchema);
  const { id, token } = await tx((c) =>
    createParticipant(c, trip.id, { ...input, status: "active", org_note: null }, { type: "participant", id: null, label: `${input.first_name} ${input.last_name ?? ""}`.trim() })
  );
  const base = baseUrl(req);
  return json(
    {
      id,
      edit_url: `${base}/edit/${token}`,
      public_url: trip.public_enabled ? `${base}/view/${trip.public_code}` : null,
    },
    201
  );
});
