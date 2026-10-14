import type { NextRequest } from "next/server";
import { z } from "zod";
import { tx } from "@/lib/server/db";
import { handle, json, readJson, requireOrganizer } from "@/lib/server/http";
import { setApproval } from "@/lib/server/participants";

const schema = z.object({
  participant_ids: z.array(z.string().uuid()).min(1).max(200),
  decision: z.enum(["approved", "rejected", "pending"]),
});

/** Anmeldungen bestätigen, ablehnen oder zurück auf „offen“ setzen (nur Personen dieser Reise). */
export const POST = handle(async (req: NextRequest, ctx: RouteContext<"/api/trips/[tripId]/approvals">) => {
  const { tripId } = await ctx.params;
  const me = await requireOrganizer(req, tripId);
  const { participant_ids, decision } = await readJson(req, schema);
  const changed = await tx((c) => setApproval(c, tripId, participant_ids, decision, me.actor));
  return json({ changed });
});
