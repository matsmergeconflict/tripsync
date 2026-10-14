import type { APIRequestContext } from "@playwright/test";

export const TRIP_START = "2027-01-16";
export const TRIP_END = "2027-01-23";

export interface CreatedTrip {
  tripId: string;
  orgToken: string;
  invite: string;
  publicCode: string;
}

export const org = (t: CreatedTrip) => ({ "x-organizer-token": t.orgToken });

/** Legt eine Reise über die API an und liefert Token und Codes zurück. */
export async function createTrip(request: APIRequestContext, name = "Testreise"): Promise<CreatedTrip> {
  const res = await request.post("/api/trips", {
    data: { name, location: "Hütte", start_date: TRIP_START, end_date: TRIP_END, organizer_name: "Orga" },
  });
  if (res.status() !== 201) throw new Error(`createTrip ${res.status()} ${await res.text()}`);
  const body = await res.json();
  const orgToken = body.organizer_url.split("/o/")[1];
  const full = await (await request.get(`/api/trips/${body.trip_id}`, { headers: { "x-organizer-token": orgToken } })).json();
  return {
    tripId: body.trip_id,
    orgToken,
    invite: full.links.invite.split("/join/")[1],
    publicCode: full.links.public.split("/view/")[1],
  };
}

export const basePerson = {
  first_name: "Anna",
  last_name: "Berger",
  contact: "anna@example.com",
  comment: "Komme mit dem Zug",
  arrival_date: "2027-01-16",
  departure_date: "2027-01-20",
  stay_status: "confirmed",
  ski_need: "yes",
  ski_days: ["2027-01-17", "2027-01-18"],
  ski_category: "adult",
  meal_mode: "all_present",
  diet: "vegetarian",
  allergies: "Haselnüsse",
  food_wishes: "Viel Käse",
};

export async function join(request: APIRequestContext, t: CreatedTrip, data: Record<string, unknown>) {
  const res = await request.post(`/api/join/${t.invite}`, { data });
  if (res.status() !== 201) throw new Error(`join ${res.status()} ${await res.text()}`);
  const body = await res.json();
  return { id: body.id as string, token: (body.edit_url as string).split("/edit/")[1], editUrl: body.edit_url as string };
}

export async function getTrip(request: APIRequestContext, t: CreatedTrip) {
  return (await request.get(`/api/trips/${t.tripId}`, { headers: org(t) })).json();
}
