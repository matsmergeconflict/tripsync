/**
 * Legt über die öffentliche HTTP-API eine Demo-Reise mit realistischen Daten an.
 * Aufruf: BASE_URL=http://localhost:3000 npx tsx scripts/seed-demo.ts
 */
const BASE = process.env.BASE_URL ?? "http://localhost:3000";

async function call<T>(path: string, init: { method?: string; body?: unknown; cookie?: string; token?: string } = {}): Promise<{ data: T; res: Response }> {
  const res = await fetch(BASE + path, {
    method: init.method ?? (init.body ? "POST" : "GET"),
    headers: {
      "content-type": "application/json",
      ...(init.cookie ? { cookie: init.cookie } : {}),
      ...(init.token ? { "x-organizer-token": init.token } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    redirect: "manual",
  });
  const data = (await res.json().catch(() => ({}))) as T;
  if (!res.ok) throw new Error(`${path}: ${res.status} ${JSON.stringify(data)}`);
  return { data, res };
}

const START = "2027-01-16";

const people: Record<string, unknown>[] = [
  { first_name: "Anna", last_name: "Berger", arrival_date: "2027-01-16", departure_date: "2027-01-20", ski_need: "yes", ski_days: ["2027-01-17", "2027-01-18", "2027-01-19"], ski_category: "adult", meal_mode: "all_present", diet: "vegetarian" },
  { first_name: "Max", last_name: "Huber", arrival_date: "2027-01-17", departure_date: "2027-01-23", arrival_time: "18:30", ski_need: "yes", ski_days: ["2027-01-18", "2027-01-19", "2027-01-20", "2027-01-21", "2027-01-22"], ski_category: "adult", meal_mode: "all_present", diet: "omnivore" },
  { first_name: "Lisa", last_name: "Koch", arrival_date: "2027-01-16", departure_date: "2027-01-17", ski_need: "no", meal_mode: "all_present", diet: "vegan", allergies: "Haselnüsse" },
  { first_name: "Tom", last_name: "Wagner", arrival_date: "2027-01-18", departure_date: "2027-01-21", stay_status: "tentative", ski_need: "yes", ski_days: ["2027-01-19", "2027-01-20"], ski_category: "youth", meal_mode: "all_present", diet: "omnivore" },
  { first_name: "Jonas", last_name: "Schmid", arrival_date: "2027-01-16", departure_date: "2027-01-23", ski_need: "yes", ski_days: ["2027-01-17", "2027-01-18", "2027-01-19", "2027-01-20", "2027-01-21", "2027-01-22"], ski_category: "adult", meal_mode: "all_present", diet: "omnivore" },
  { first_name: "Mia", last_name: "Fischer", arrival_date: "2027-01-19", departure_date: "2027-01-23", ski_need: "unknown", meal_mode: "custom", meal_days: ["2027-01-20", "2027-01-21", "2027-01-22"], diet: "pescetarian" },
  { first_name: "Paul", last_name: "Meyer", arrival_date: "2027-01-16", departure_date: null, ski_need: "yes", ski_days: [], meal_mode: "unknown" },
  { first_name: "Sophie", last_name: "Wolf", arrival_date: "2027-01-20", departure_date: "2027-01-23", ski_need: "yes", ski_days: ["2027-01-21", "2027-01-22"], ski_category: "child", meal_mode: "all_present", diet: "omnivore" },
  { first_name: "Felix", last_name: "Neumann", arrival_date: "2027-01-17", departure_date: "2027-01-22", ski_need: "no", meal_mode: "all_present", diet: "omnivore" },
  { first_name: "Lea", last_name: "Schwarz", arrival_date: null, departure_date: null, ski_need: "unknown", meal_mode: "unknown" },
  { first_name: "Emma", last_name: "Zimmermann", arrival_date: "2027-01-16", departure_date: "2027-01-19", ski_need: "yes", ski_days: ["2027-01-17", "2027-01-18"], ski_category: "senior", meal_mode: "all_present", diet: "vegetarian" },
  { first_name: "Noah", last_name: "Braun", arrival_date: "2027-01-21", departure_date: "2027-01-23", stay_status: "tentative", ski_need: "yes", ski_days: ["2027-01-22"], ski_category: "adult", meal_mode: "none" },
];

async function main() {
  const { data: created, res } = await call<{ trip_id: string; organizer_url: string }>("/api/trips", {
    body: { name: "Skiwoche Zillertal 2027", location: "Hütte am Penken", start_date: START, end_date: "2027-01-23", organizer_name: "Mats" },
  });
  const cookie = res.headers.get("set-cookie")!.split(";")[0];
  const tripId = created.trip_id;
  const { data: full } = await call<{ links: { invite: string; public: string }; trip: { version: number } }>(`/api/trips/${tripId}`, { cookie });
  const invite = full.links.invite.split("/").pop();
  for (const p of people) await call(`/api/join/${invite}`, { body: p });
  await call(`/api/trips/${tripId}`, {
    method: "PATCH",
    cookie,
    body: {
      version: full.trip.version,
      public_enabled: true,
      ski_categories: [
        { id: "adult", name: "Erwachsene", price: 62.5 },
        { id: "youth", name: "Jugendliche", price: 47 },
        { id: "child", name: "Kinder", price: 29 },
        { id: "senior", name: "Senioren", price: 56 },
      ],
    },
  });
  const { data: r1 } = await call<{ id: string }>(`/api/trips/${tripId}/recipes`, {
    cookie,
    body: {
      name: "Kässpätzle",
      base_servings: 4,
      ingredients: [
        { name: "Mehl", quantity: 400, unit: "g", category: "Trockenwaren & Konserven" },
        { name: "Eier", quantity: 4, unit: "Stk", category: "Milchprodukte & Eier" },
        { name: "Bergkäse", quantity: 300, unit: "g", category: "Milchprodukte & Eier" },
        { name: "Zwiebeln", quantity: 3, unit: "Stk", category: "Obst & Gemüse" },
        { name: "Salz", quantity: null, unit: "Prise", category: "Gewürze & Öle" },
      ],
    },
  });
  const { data: r2 } = await call<{ id: string }>(`/api/trips/${tripId}/recipes`, {
    cookie,
    body: {
      name: "Kartoffelgulasch",
      base_servings: 6,
      ingredients: [
        { name: "Kartoffeln", quantity: 1.5, unit: "kg", category: "Obst & Gemüse" },
        { name: "festkochende Kartoffeln", quantity: 500, unit: "g", category: "Obst & Gemüse" },
        { name: "Zwiebeln", quantity: 500, unit: "g", category: "Obst & Gemüse" },
        { name: "Paprikapulver", quantity: 2, unit: "EL", category: "Gewürze & Öle" },
        { name: "Gemüsebrühe", quantity: 1, unit: "l", category: "Trockenwaren & Konserven" },
      ],
    },
  });
  const { data: r3 } = await call<{ id: string }>(`/api/trips/${tripId}/recipes`, {
    cookie,
    body: {
      name: "Bergfrühstück",
      base_servings: 1,
      ingredients: [
        { name: "Brötchen", quantity: 2, unit: "Stk", category: "Brot & Backwaren" },
        { name: "Milch", quantity: 200, unit: "ml", category: "Milchprodukte & Eier" },
        { name: "Kartoffel, festkochend", quantity: 50, unit: "g", category: "Obst & Gemüse" },
      ],
    },
  });
  await call(`/api/trips/${tripId}/meals`, { cookie, body: { day: "2027-01-16", meal_type: "dinner", dish: "Kässpätzle", recipe_id: r1.id, kitchen_team: "Anna & Jonas" } });
  await call(`/api/trips/${tripId}/meals`, { cookie, body: { day: "2027-01-17", meal_type: "breakfast", dish: "Bergfrühstück", recipe_id: r3.id } });
  await call(`/api/trips/${tripId}/meals`, { cookie, body: { day: "2027-01-18", meal_type: "dinner", dish: "Kartoffelgulasch", recipe_id: r2.id, kitchen_team: "Max & Felix" } });
  await call(`/api/trips/${tripId}/meals`, { cookie, body: { day: "2027-01-20", meal_type: "dinner", dish: "Raclette", servings_override: 12, note: "Raclette-Geräte mitbringen" } });
  await call(`/api/trips/${tripId}/shopping/items`, { cookie, body: { name: "Spülmittel", quantity: 1, unit: "Flasche", category: "Haushalt", team: "Drogerie – Lisa" } });

  console.log(JSON.stringify({ tripId, organizer_url: created.organizer_url, invite: full.links.invite, public: full.links.public }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
