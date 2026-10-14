import { NextResponse, type NextRequest } from "next/server";
import { pool } from "@/lib/server/db";
import { baseUrl, setOrgCookie } from "@/lib/server/http";
import { hashToken, looksLikeToken } from "@/lib/server/tokens";

/**
 * Persönlicher Organisator-Link. Tauscht den Token gegen ein httpOnly-Cookie und
 * leitet in die Organisatorenansicht weiter, damit der Token nicht in der Adresszeile bleibt.
 */
export async function GET(req: NextRequest, ctx: RouteContext<"/o/[token]">) {
  const { token } = await ctx.params;
  const base = baseUrl(req);
  if (!looksLikeToken(token)) return NextResponse.redirect(`${base}/?fehler=link`, 303);
  const { rows } = await pool().query(`SELECT trip_id FROM organizers WHERE token_hash = $1 AND revoked_at IS NULL`, [hashToken(token)]);
  if (!rows[0]) return NextResponse.redirect(`${base}/?fehler=link`, 303);
  const res = NextResponse.redirect(`${base}/trips/${rows[0].trip_id}`, 303);
  setOrgCookie(req, res, rows[0].trip_id, token);
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("Referrer-Policy", "no-referrer");
  return res;
}
