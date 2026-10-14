import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodType } from "zod";
import { fieldErrors } from "../validation";
import { pool } from "./db";
import { hashToken, looksLikeToken } from "./tokens";
import type { Actor } from "./audit";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public extra: Record<string, unknown> = {}
  ) {
    super(message);
  }
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function assertUuid(id: string, what = "Eintrag"): void {
  if (!UUID_RE.test(id)) throw new HttpError(404, `${what} nicht gefunden`);
}

const NO_STORE = { "Cache-Control": "no-store" };

export function json(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status, headers: NO_STORE });
}

/** Einheitliche Fehlerbehandlung für Route Handler. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message, ...e.extra }, e.status);
      if (e instanceof ZodError) return json({ error: "Bitte Eingaben prüfen", fields: fieldErrors(e) }, 400);
      const pgCode = (e as { code?: string }).code;
      if (pgCode === "23514" || pgCode === "22P02" || pgCode === "22007" || pgCode === "22008")
        return json({ error: "Ungültige Eingabe" }, 400);
      console.error(e);
      return json({ error: "Interner Fehler – bitte später erneut versuchen" }, 500);
    }
  };
}

export async function readJson<T>(req: NextRequest, schema: ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new HttpError(400, "Ungültige Anfrage (kein JSON)");
  }
  return schema.parse(body);
}

/**
 * Schutz gegen Cross-Site-Requests bei Cookie-Authentifizierung:
 * zustandsändernde Anfragen müssen vom eigenen Origin kommen.
 */
export function assertSameOrigin(req: NextRequest): void {
  if (req.method === "GET" || req.method === "HEAD") return;
  const origin = req.headers.get("origin");
  if (!origin) return; // z. B. Server-zu-Server/Tests ohne Browser
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    if (new URL(origin).host !== host) throw new HttpError(403, "Anfrage von fremder Herkunft abgelehnt");
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(403, "Ungültige Herkunft");
  }
}

export function orgCookieName(tripId: string): string {
  return `ts_org_${tripId.replace(/-/g, "")}`;
}

export interface OrganizerCtx {
  organizerId: string;
  name: string;
  tripId: string;
  actor: Actor;
}

/** Organisator anhand des httpOnly-Cookies prüfen. Wirft 401/403. */
export async function requireOrganizer(req: NextRequest, tripId: string): Promise<OrganizerCtx> {
  assertUuid(tripId, "Reise");
  assertSameOrigin(req);
  const token = req.cookies.get(orgCookieName(tripId))?.value ?? req.headers.get("x-organizer-token");
  if (!looksLikeToken(token)) throw new HttpError(401, "Kein Organisatorzugang für diese Reise");
  const { rows } = await pool().query(
    `SELECT id, name, trip_id FROM organizers WHERE token_hash = $1 AND revoked_at IS NULL`,
    [hashToken(token)]
  );
  const o = rows[0];
  if (!o || o.trip_id !== tripId) throw new HttpError(403, "Kein Organisatorzugang für diese Reise");
  return { organizerId: o.id, name: o.name, tripId, actor: { type: "organizer", id: o.id, label: o.name } };
}

export function setOrgCookie(req: NextRequest, res: NextResponse, tripId: string, token: string): void {
  const https = (req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "")) === "https";
  res.cookies.set(orgCookieName(tripId), token, {
    httpOnly: true,
    sameSite: "lax",
    secure: https,
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export function baseUrl(req: NextRequest): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const proto = req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host;
  return `${proto}://${host}`;
}

/** Einfaches In-Memory-Rate-Limit pro Schlüssel (pro Serverprozess). */
const buckets = new Map<string, { count: number; reset: number }>();
export function rateLimit(key: string, limit: number, windowMs: number): void {
  if (process.env.TRIPSYNC_DISABLE_RATELIMIT === "1") return;
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    return;
  }
  b.count++;
  if (b.count > limit) throw new HttpError(429, "Zu viele Anfragen – bitte kurz warten");
}

export function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
}
