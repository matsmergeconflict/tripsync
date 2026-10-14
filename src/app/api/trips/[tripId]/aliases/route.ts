import type { NextRequest } from "next/server";
import { z } from "zod";
import { tx, notifyTrip } from "@/lib/server/db";
import { audit } from "@/lib/server/audit";
import { handle, HttpError, json, readJson, requireOrganizer } from "@/lib/server/http";
import { normalizeName } from "@/lib/ingredients";

const postSchema = z.object({
  canonical: z.string().trim().min(1).max(120),
  variants: z.array(z.string().trim().min(1).max(120)).min(1).max(50),
});

/** Bestätigte Zusammenführung von Zutatennamen speichern (nachvollziehbar im Protokoll). */
export const POST = handle(async (req: NextRequest, ctx: RouteContext<"/api/trips/[tripId]/aliases">) => {
  const { tripId } = await ctx.params;
  const me = await requireOrganizer(req, tripId);
  const { canonical, variants } = await readJson(req, postSchema);
  const target = normalizeName(canonical);
  const sources = [...new Set(variants.map(normalizeName))].filter((v) => v && v !== target);
  if (!sources.length) throw new HttpError(400, "Keine zusammenzuführenden Varianten");
  await tx(async (c) => {
    // Ziel darf selbst kein Alias sein (verhindert Ketten/Zyklen); ggf. bestehende Aliase umbiegen
    await c.query(`DELETE FROM ingredient_aliases WHERE trip_id = $1 AND alias = $2`, [tripId, target]);
    for (const alias of sources) {
      await c.query(
        `INSERT INTO ingredient_aliases (trip_id, alias, canonical, created_by) VALUES ($1,$2,$3,$4)
         ON CONFLICT (trip_id, alias) DO UPDATE SET canonical = $3, created_by = $4, created_at = now()`,
        [tripId, alias, target, me.name]
      );
      await c.query(`UPDATE ingredient_aliases SET canonical = $3 WHERE trip_id = $1 AND canonical = $2`, [tripId, alias, target]);
    }
    await audit(c, tripId, me.actor, "ingredient_alias", null, "merge", { canonical: target, variants: sources });
    await notifyTrip(c, tripId);
  });
  return json({ ok: true });
});

/** Zusammenführung rückgängig machen. */
export const DELETE = handle(async (req: NextRequest, ctx: RouteContext<"/api/trips/[tripId]/aliases">) => {
  const { tripId } = await ctx.params;
  const me = await requireOrganizer(req, tripId);
  const alias = normalizeName(req.nextUrl.searchParams.get("alias") ?? "");
  await tx(async (c) => {
    const { rows } = await c.query(`DELETE FROM ingredient_aliases WHERE trip_id = $1 AND alias = $2 RETURNING canonical`, [tripId, alias]);
    if (!rows[0]) throw new HttpError(404, "Zuordnung nicht gefunden");
    await audit(c, tripId, me.actor, "ingredient_alias", null, "unmerge", { alias, canonical: rows[0].canonical });
    await notifyTrip(c, tripId);
  });
  return json({ ok: true });
});
