import type { NextRequest } from "next/server";
import { tx } from "@/lib/server/db";
import { audit } from "@/lib/server/audit";
import { baseUrl, clientIp, handle, json, rateLimit, readJson, setOrgCookie } from "@/lib/server/http";
import { hashToken, newSecretToken, newShareCode } from "@/lib/server/tokens";
import { tripCreateSchema } from "@/lib/validation";

const DEFAULT_SKI_CATEGORIES = [
  { id: "adult", name: "Erwachsene", price: null },
  { id: "youth", name: "Jugendliche", price: null },
  { id: "child", name: "Kinder", price: null },
  { id: "senior", name: "Senioren", price: null },
];

/** Neue Reise anlegen. Der Ersteller wird erster Organisator und erhält seinen Zugangslink. */
export const POST = handle(async (req: NextRequest) => {
  rateLimit(`create:${clientIp(req)}`, 10, 60_000);
  const input = await readJson(req, tripCreateSchema);
  const token = newSecretToken();
  const trip = await tx(async (c) => {
    const { rows } = await c.query(
      `INSERT INTO trips (name, location, start_date, end_date, invite_code, public_code, ski_categories)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [input.name, input.location, input.start_date, input.end_date, newShareCode(), newShareCode(), JSON.stringify(DEFAULT_SKI_CATEGORIES)]
    );
    const tripId = rows[0].id as string;
    const o = await c.query(`INSERT INTO organizers (trip_id, name, token_hash) VALUES ($1,$2,$3) RETURNING id`, [
      tripId,
      input.organizer_name,
      hashToken(token),
    ]);
    await audit(c, tripId, { type: "organizer", id: o.rows[0].id, label: input.organizer_name }, "trip", tripId, "create", {
      name: input.name,
      start_date: input.start_date,
      end_date: input.end_date,
    });
    return { id: tripId };
  });

  const res = json({ trip_id: trip.id, organizer_url: `${baseUrl(req)}/o/${token}` }, 201);
  setOrgCookie(req, res, trip.id, token);
  return res;
});
