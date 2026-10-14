import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Persönliche Bearbeitungs- und Organisator-Tokens:
 * 256 Bit aus dem kryptografisch sicheren Zufallsgenerator, base64url-kodiert.
 * Sie sind unabhängig von Namen, E-Mail oder IDs. In der Datenbank liegt nur der SHA-256-Hash.
 */
export function newSecretToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Kürzere, nicht erratbare Codes für Einladungs- und öffentliche Links (96 Bit). */
export function newShareCode(): string {
  return randomBytes(12).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function looksLikeToken(token: unknown): token is string {
  return typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token);
}

export function looksLikeCode(code: unknown): code is string {
  return typeof code === "string" && /^[A-Za-z0-9_-]{16}$/.test(code);
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
