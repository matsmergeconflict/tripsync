import type { NextRequest } from "next/server";
import { tx } from "@/lib/server/db";
import { baseUrl, handle, json, readJson, requireOrganizer } from "@/lib/server/http";
import { createParticipant } from "@/lib/server/participants";
import { participantOrgSchema } from "@/lib/validation";

/** Organisator legt eine Anmeldung stellvertretend an und erhält den Bearbeitungslink zum Weitergeben. */
export const POST = handle(async (req: NextRequest, ctx: RouteContext<"/api/trips/[tripId]/participants">) => {
  const { tripId } = await ctx.params;
  const me = await requireOrganizer(req, tripId);
  const input = await readJson(req, participantOrgSchema);
  const { id, token } = await tx((c) => createParticipant(c, tripId, input, me.actor));
  return json({ id, edit_url: `${baseUrl(req)}/edit/${token}` }, 201);
});
