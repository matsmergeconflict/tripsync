import type { NextRequest } from "next/server";
import { pool, tx } from "@/lib/server/db";
import { baseUrl, clientIp, handle, json, rateLimit, readJson } from "@/lib/server/http";
import { createRegistration } from "@/lib/server/participants";
import { publicTripView, tripByInvite } from "@/lib/server/public";
import { selfRegistrationSchema } from "@/lib/validation";

type Ctx = RouteContext<"/api/join/[code]">;

/** Reiseinformationen für das Anmeldeformular. */
export const GET = handle(async (_req: NextRequest, ctx: Ctx) => {
  const { code } = await ctx.params;
  const trip = await tripByInvite(pool(), code);
  return json({ trip: publicTripView(trip) });
});

/**
 * Anmeldung ohne Benutzerkonto – eine Person oder mehrere (Familie) mit gemeinsamem Link.
 * Antwort enthält den persönlichen Bearbeitungslink und den Bestätigungsstatus.
 */
export const POST = handle(async (req: NextRequest, ctx: Ctx) => {
  const { code } = await ctx.params;
  rateLimit(`join:${clientIp(req)}`, 20, 60_000);
  const trip = await tripByInvite(pool(), code);
  const input = await readJson(req, selfRegistrationSchema);
  const first = input.persons[0];
  const label = `${first.first_name} ${first.last_name}`.trim() + (input.persons.length > 1 ? ` (+${input.persons.length - 1})` : "");
  const r = await tx((c) => createRegistration(c, trip.id, input, { type: "participant", id: null, label }, { byOrganizer: false }));
  const base = baseUrl(req);
  return json(
    {
      id: r.ids[0],
      ids: r.ids,
      registration_id: r.registrationId,
      approval: r.approval,
      edit_url: `${base}/edit/${r.token}`,
      public_url: trip.public_enabled ? `${base}/view/${trip.public_code}` : null,
    },
    201
  );
});
