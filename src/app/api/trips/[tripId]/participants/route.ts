import type { NextRequest } from "next/server";
import { tx } from "@/lib/server/db";
import { baseUrl, handle, json, readJson, requireOrganizer } from "@/lib/server/http";
import { createRegistration } from "@/lib/server/participants";
import { participantOrgSchema } from "@/lib/validation";

/** Organisator legt eine Person stellvertretend an (sofort bestätigt) und erhält den Bearbeitungslink zum Weitergeben. */
export const POST = handle(async (req: NextRequest, ctx: RouteContext<"/api/trips/[tripId]/participants">) => {
  const { tripId } = await ctx.params;
  const me = await requireOrganizer(req, tripId);
  const { contact, comment, ...person } = await readJson(req, participantOrgSchema);
  const r = await tx((c) => createRegistration(c, tripId, { contact, comment, persons: [person] }, me.actor, { byOrganizer: true }));
  return json({ id: r.ids[0], edit_url: `${baseUrl(req)}/edit/${r.token}` }, 201);
});
