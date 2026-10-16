import { expect, request as pwRequest, test, type APIRequestContext } from "@playwright/test";
import { addPerson, basePerson, createTrip, getTrip, join, org, personal, type CreatedTrip } from "./helpers";

let anon: APIRequestContext;
test.beforeAll(async ({ baseURL }) => {
  // Kontext ohne Cookies: simuliert fremde Besucher
  anon = await pwRequest.newContext({ baseURL });
});
test.afterAll(() => anon.dispose());

test.describe("Reise und Organisatorzugang", () => {
  test("Reise anlegen liefert Organisatorlink und Einladungslink (AK 1)", async ({ request }) => {
    const t = await createTrip(request);
    expect(t.orgToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(t.invite).toMatch(/^[A-Za-z0-9_-]{16}$/);
    const join = await anon.get(`/api/join/${t.invite}`);
    expect(join.status()).toBe(200);
    expect((await join.json()).trip.name).toBe("Testreise");
  });

  test("Organisator-Link setzt Cookie und leitet weiter, ungültige Links nicht", async () => {
    const ctx = await pwRequest.newContext({ baseURL: test.info().project.use.baseURL });
    const t = await createTrip(anon);
    const res = await ctx.get(`/o/${t.orgToken}`, { maxRedirects: 0 });
    expect(res.status()).toBe(303);
    expect(res.headers()["location"]).toContain(`/trips/${t.tripId}`);
    expect(res.headers()["set-cookie"]).toMatch(/HttpOnly/i);
    expect((await ctx.get(`/api/trips/${t.tripId}`)).status()).toBe(200);
    const bad = await anon.get(`/o/${"x".repeat(43)}`, { maxRedirects: 0 });
    expect(bad.headers()["location"]).toContain("fehler=link");
    await ctx.dispose();
  });

  test("Organisatordaten nur mit gültigem Zugang", async ({ request }) => {
    const a = await createTrip(request, "Reise A");
    const b = await createTrip(request, "Reise B");
    expect((await anon.get(`/api/trips/${a.tripId}`)).status()).toBe(401);
    // Token von Reise B gilt nicht für Reise A
    expect((await anon.get(`/api/trips/${a.tripId}`, { headers: org(b) })).status()).toBe(403);
    expect((await anon.get(`/api/trips/${a.tripId}/export?type=participants`)).status()).toBe(401);
    expect((await anon.get(`/api/trips/not-a-uuid`)).status()).toBe(404);
  });

  test("Zustandsändernde Anfragen von fremder Herkunft werden abgelehnt", async ({ request }) => {
    const t = await createTrip(request);
    const trip = await getTrip(request, t);
    const res = await anon.patch(`/api/trips/${t.tripId}`, {
      headers: { ...org(t), origin: "https://evil.example" },
      data: { version: trip.trip.version, name: "gehackt" },
    });
    expect(res.status()).toBe(403);
  });

  test("Teil-Update der Einstellungen lässt andere Felder unverändert (Regression)", async ({ request }) => {
    const t = await createTrip(request);
    const before = await getTrip(request, t);
    const res = await anon.patch(`/api/trips/${t.tripId}`, { headers: org(t), data: { version: before.trip.version, public_enabled: true } });
    expect(res.status()).toBe(200);
    const after = await getTrip(request, t);
    expect(after.trip.location).toBe("Hütte");
    expect(after.trip.public_enabled).toBe(true);
  });

  test("Zeitraum kann nicht so verkürzt werden, dass Daten verwaisen", async ({ request }) => {
    const t = await createTrip(request);
    await join(anon, t, { ...basePerson, arrival_date: "2027-01-16", departure_date: "2027-01-22", ski_days: ["2027-01-22"] });
    const v = (await getTrip(request, t)).trip.version;
    const res = await anon.patch(`/api/trips/${t.tripId}`, { headers: org(t), data: { version: v, end_date: "2027-01-21" } });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toContain("1 Anmeldung");
    expect((await getTrip(request, t)).trip.end_date).toBe("2027-01-23");
    // Verlängern ist immer möglich
    expect((await anon.patch(`/api/trips/${t.tripId}`, { headers: org(t), data: { version: v, end_date: "2027-01-25" } })).status()).toBe(200);
  });

  test("Gleichzeitige Änderungen an der Reise werden erkannt (409)", async ({ request }) => {
    const t = await createTrip(request);
    const { trip } = await getTrip(request, t);
    expect((await anon.patch(`/api/trips/${t.tripId}`, { headers: org(t), data: { version: trip.version, name: "Erste" } })).status()).toBe(200);
    const stale = await anon.patch(`/api/trips/${t.tripId}`, { headers: org(t), data: { version: trip.version, name: "Zweite" } });
    expect(stale.status()).toBe(409);
    expect((await getTrip(request, t)).trip.name).toBe("Erste");
  });

  test("Mehrere Organisatoren: hinzufügen, eigener Zugang, entziehen", async ({ request }) => {
    const t = await createTrip(request);
    const add = await anon.post(`/api/trips/${t.tripId}/organizers`, { headers: org(t), data: { name: "Zweite Orga" } });
    expect(add.status()).toBe(201);
    const second = (await add.json()) as { id: string; url: string };
    const token2 = second.url.split("/o/")[1];
    expect((await anon.get(`/api/trips/${t.tripId}`, { headers: { "x-organizer-token": token2 } })).status()).toBe(200);
    expect((await anon.delete(`/api/trips/${t.tripId}/organizers/${second.id}`, { headers: org(t) })).status()).toBe(200);
    expect((await anon.get(`/api/trips/${t.tripId}`, { headers: { "x-organizer-token": token2 } })).status()).toBe(403);
    // letzter Organisator kann nicht entfernt werden
    const me = (await getTrip(request, t)).me.id;
    expect((await anon.delete(`/api/trips/${t.tripId}/organizers/${me}`, { headers: org(t) })).status()).toBe(400);
  });
});

test.describe("Anmeldung ohne Konto und persönlicher Link", () => {
  let t: CreatedTrip;
  test.beforeEach(async ({ request }) => {
    t = await createTrip(request);
  });

  test("Anmeldung erzeugt sicheren persönlichen Link (AK 2, 3)", async () => {
    const a = await join(anon, t, basePerson);
    expect(a.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a.token).not.toContain("Anna");
    const me = await anon.get("/api/me", { headers: { "x-edit-token": a.token } });
    expect(me.status()).toBe(200);
    const body = await me.json();
    expect(body.participant.first_name).toBe("Anna");
    expect(body.participant.ski_days).toEqual(["2027-01-17", "2027-01-18"]);
    expect(body.participant).not.toHaveProperty("org_note");
    expect(JSON.stringify(body)).not.toContain(a.token);
  });

  test("Teilnehmer ändert eigene Daten über persönlichen Link (AK 3)", async ({ request }) => {
    const a = await join(anon, t, basePerson);
    const me = (await (await anon.get("/api/me", { headers: { "x-edit-token": a.token } })).json()).participant;
    const res = await anon.patch("/api/me", {
      headers: { "x-edit-token": a.token },
      data: { ...basePerson, departure_date: "2027-01-22", ski_days: ["2027-01-19"], version: me.version },
    });
    expect(res.status()).toBe(200);
    const p = (await getTrip(request, t)).participants.find((x: { id: string }) => x.id === a.id);
    expect(p.departure_date).toBe("2027-01-22");
    expect(p.ski_days).toEqual(["2027-01-19"]);
  });

  test("Teilnehmer kann Anmeldungen anderer nicht bearbeiten (AK 6)", async ({ request }) => {
    const a = await join(anon, t, basePerson);
    const b = await join(anon, t, { ...basePerson, first_name: "Ben", allergies: null });
    // /api/me adressiert ausschließlich die zum Token gehörende Anmeldung – IDs im Body werden ignoriert
    const meA = (await (await anon.get("/api/me", { headers: { "x-edit-token": a.token } })).json()).participant;
    const hijack = await anon.patch("/api/me", { headers: { "x-edit-token": a.token }, data: { ...basePerson, id: b.id, first_name: "Anna2", version: meA.version } });
    expect(hijack.status()).toBe(403);
    const data = await getTrip(request, t);
    expect(data.participants.find((x: { id: string }) => x.id === b.id).first_name).toBe("Ben");
    expect(data.participants.find((x: { id: string }) => x.id === a.id).first_name).toBe("Anna");
    // Organisator-Endpunkte sind mit Teilnehmer-Token nicht erreichbar
    const viaOrg = await anon.patch(`/api/trips/${t.tripId}/participants/${b.id}`, {
      headers: { "x-edit-token": a.token, "x-organizer-token": a.token },
      data: { ...basePerson, first_name: "Hack", version: 1 },
    });
    expect([401, 403]).toContain(viaOrg.status());
    // gefälschte / fehlende Tokens
    expect((await anon.get("/api/me", { headers: { "x-edit-token": "A".repeat(43) } })).status()).toBe(401);
    expect((await anon.get("/api/me")).status()).toBe(401);
    expect((await anon.get("/api/me", { headers: { "x-edit-token": b.id } })).status()).toBe(401);
  });

  test("Link zurücksetzen macht alten Link ungültig", async () => {
    const a = await join(anon, t, basePerson);
    const res = await anon.post(`/api/trips/${t.tripId}/participants/${a.id}/reset-link`, { headers: org(t) });
    const fresh = (await res.json()).edit_url.split("/edit/")[1];
    expect((await anon.get("/api/me", { headers: { "x-edit-token": a.token } })).status()).toBe(401);
    expect((await anon.get("/api/me", { headers: { "x-edit-token": fresh } })).status()).toBe(200);
  });

  test("Teilnahme zurückziehen entfernt Person aus der Statistik", async ({ request }) => {
    const a = await join(anon, t, basePerson);
    const me = (await (await anon.get("/api/me", { headers: { "x-edit-token": a.token } })).json()).participant;
    await anon.patch("/api/me", { headers: { "x-edit-token": a.token }, data: { ...basePerson, status: "withdrawn", version: me.version } });
    const csv = await (await request.get(`/api/trips/${t.tripId}/export?type=days`, { headers: org(t) })).text();
    expect(csv).toContain("2027-01-17;0;0;0;0;0;0;0;0");
  });

  test("Datumsregeln werden serverseitig geprüft (Datumsgrenzen)", async () => {
    const before = await anon.post(`/api/join/${t.invite}`, { data: { ...basePerson, departure_date: "2027-01-15" } });
    expect(before.status()).toBe(400);
    expect((await before.json()).fields.departure_date).toBeTruthy();
    const outside = await anon.post(`/api/join/${t.invite}`, { data: { ...basePerson, arrival_date: "2027-01-10" } });
    expect(outside.status()).toBe(400);
    const skiOutside = await anon.post(`/api/join/${t.invite}`, { data: { ...basePerson, ski_days: ["2027-01-30"] } });
    expect(skiOutside.status()).toBe(400);
    const badDate = await anon.post(`/api/join/${t.invite}`, { data: { ...basePerson, arrival_date: "2027-02-30" } });
    expect(badDate.status()).toBe(400);
    // Grenzfälle: erster und letzter Reisetag, An- und Abreise am selben Tag
    expect((await anon.post(`/api/join/${t.invite}`, { data: { ...basePerson, arrival_date: "2027-01-16", departure_date: "2027-01-16", ski_need: "no", ski_days: [] } })).status()).toBe(201);
    expect((await anon.post(`/api/join/${t.invite}`, { data: { ...basePerson, arrival_date: "2027-01-23", departure_date: "2027-01-23", ski_need: "no", ski_days: [] } })).status()).toBe(201);
    // Skipass-Regeln: nicht am ersten Reisetag, nur innerhalb des eigenen Aufenthalts, letzter Tag (Abreise) erlaubt
    const firstDay = await anon.post(`/api/join/${t.invite}`, { data: { ...basePerson, ski_days: ["2027-01-16", "2027-01-17"] } });
    expect(firstDay.status()).toBe(400);
    expect((await firstDay.json()).error).toContain("zweiten Reisetag");
    expect((await anon.post(`/api/join/${t.invite}`, { data: { ...basePerson, arrival_date: "2027-01-18", ski_days: ["2027-01-17", "2027-01-18"] } })).status()).toBe(400);
    expect((await anon.post(`/api/join/${t.invite}`, { data: { ...basePerson, arrival_date: "2027-01-18", departure_date: "2027-01-20", ski_days: ["2027-01-18", "2027-01-19", "2027-01-20"] } })).status()).toBe(201);
    // Pflichtfelder der Selbstanmeldung
    for (const missing of ["phone", "email", "birth_date", "diet"]) {
      const r = await anon.post(`/api/join/${t.invite}`, { data: { ...basePerson, [missing]: null } });
      expect(r.status(), missing).toBe(400);
    }
    expect((await anon.post(`/api/join/${t.invite}`, { data: { ...basePerson, ski_need: "unknown" } })).status()).toBe(400);
    expect((await anon.post(`/api/join/${t.invite}`, { data: { ...basePerson, diet: "pescetarian" } })).status()).toBe(400);
    expect((await anon.post(`/api/join/${t.invite}`, { data: { ...basePerson, phone: "12" } })).status()).toBe(400);
    expect((await anon.post(`/api/join/${t.invite}`, { data: { ...basePerson, email: "kein-at" } })).status()).toBe(400);
    expect((await anon.post(`/api/join/${t.invite}`, { data: { ...basePerson, birth_date: "2999-01-01" } })).status()).toBe(400);
    expect((await anon.post(`/api/join/${t.invite}`, { data: { ...basePerson, ski_category: null } })).status()).toBe(400);
    // fehlende Daten sind erlaubt (werden als offen markiert, nicht erfunden)
    expect((await anon.post(`/api/join/${t.invite}`, { data: { ...basePerson, first_name: "Offen", arrival_date: null, departure_date: null, ski_need: "no", ski_days: [] } })).status()).toBe(201);
    expect((await anon.post(`/api/join/${t.invite}`, { data: { first_name: "" } })).status()).toBe(400);
  });

  test("Geschlossene Anmeldung und erneuerter Einladungslink", async ({ request }) => {
    const { trip } = await getTrip(request, t);
    await anon.patch(`/api/trips/${t.tripId}`, { headers: org(t), data: { version: trip.version, invite_enabled: false } });
    expect((await anon.post(`/api/join/${t.invite}`, { data: basePerson })).status()).toBe(403);
    const { trip: trip2 } = await getTrip(request, t);
    await anon.patch(`/api/trips/${t.tripId}`, { headers: org(t), data: { version: trip2.version, invite_enabled: true } });
    const res = await anon.post(`/api/trips/${t.tripId}/codes`, { headers: org(t), data: { which: "invite" } });
    const newCode = (await res.json()).url.split("/join/")[1];
    expect((await anon.get(`/api/join/${t.invite}`)).status()).toBe(404);
    expect((await anon.get(`/api/join/${newCode}`)).status()).toBe(200);
  });

  test("Konkurrierende Bearbeitung einer Anmeldung wird erkannt (409)", async () => {
    const a = await join(anon, t, basePerson);
    const me = (await (await anon.get("/api/me", { headers: { "x-edit-token": a.token } })).json()).participant;
    // Organisator ändert zuerst
    expect((await anon.patch(`/api/trips/${t.tripId}/participants/${a.id}`, { headers: org(t), data: { ...basePerson, org_note: "VIP", version: me.version } })).status()).toBe(200);
    // Teilnehmer speichert mit veralteter Version
    const res = await anon.patch("/api/me", { headers: { "x-edit-token": a.token }, data: { ...basePerson, first_name: "Spät", version: me.version } });
    expect(res.status()).toBe(409);
    const body = await res.json();
    expect(body.current.first_name).toBe("Anna");
    expect(body.current).not.toHaveProperty("org_note");
  });

  test("Organisatoränderungen werden protokolliert, Gesundheitsdaten maskiert", async () => {
    const a = await join(anon, t, basePerson);
    await anon.patch(`/api/trips/${t.tripId}/participants/${a.id}`, {
      headers: org(t),
      data: { ...basePerson, departure_date: "2027-01-21", allergies: "Laktose", version: 1 },
    });
    const log = (await (await anon.get(`/api/trips/${t.tripId}/audit?entity_id=${a.id}`, { headers: org(t) })).json()).entries;
    const upd = log.find((e: { action: string }) => e.action === "update");
    expect(upd.actor_type).toBe("organizer");
    expect(upd.changes.departure_date).toEqual({ from: "2027-01-20", to: "2027-01-21" });
    expect(JSON.stringify(log)).not.toContain("Laktose");
    expect(JSON.stringify(log)).not.toContain("Haselnüsse");
  });
});

test.describe("Bestätigung durch Organisatoren", () => {
  test("Neue Anmeldungen zählen erst nach Bestätigung, Ablehnung blendet aus", async ({ request }) => {
    const t = await createTrip(request, "Mit Bestätigung", { requireApproval: true });
    const a = await join(anon, t, basePerson);
    const res0 = await anon.get("/api/me", { headers: { "x-edit-token": a.token } });
    expect((await res0.json()).participants[0].approval).toBe("pending");
    const days = async () => (await (await request.get(`/api/trips/${t.tripId}/export?type=days`, { headers: org(t) })).text()).split("\r\n").find((l) => l.startsWith("2027-01-17"));
    expect(await days()).toMatch(/^2027-01-17;0;/);
    // öffentliche Übersicht zeigt unbestätigte Personen nicht
    const { trip } = await getTrip(request, t);
    await anon.patch(`/api/trips/${t.tripId}`, { headers: org(t), data: { version: trip.version, public_enabled: true } });
    expect((await (await anon.get(`/api/public/${t.publicCode}`)).json()).participants).toHaveLength(0);
    // Teilnehmer kann sich nicht selbst bestätigen
    expect((await anon.post(`/api/trips/${t.tripId}/approvals`, { data: { participant_ids: [a.id], decision: "approved" } })).status()).toBe(401);
    // Organisator bestätigt
    const ok = await anon.post(`/api/trips/${t.tripId}/approvals`, { headers: org(t), data: { participant_ids: [a.id], decision: "approved" } });
    expect((await ok.json()).changed).toBe(1);
    expect(await days()).toMatch(/^2027-01-17;1;/);
    expect((await (await anon.get(`/api/public/${t.publicCode}`)).json()).participants).toHaveLength(1);
    // Bestätigung bleibt beim Bearbeiten erhalten
    const me = await (await anon.get("/api/me", { headers: { "x-edit-token": a.token } })).json();
    await anon.patch("/api/me", { headers: { "x-edit-token": a.token }, data: { ...basePerson, departure_date: "2027-01-21", version: me.registration.version } });
    expect((await (await anon.get("/api/me", { headers: { "x-edit-token": a.token } })).json()).participants[0].approval).toBe("approved");
    // Ablehnen
    await anon.post(`/api/trips/${t.tripId}/approvals`, { headers: org(t), data: { participant_ids: [a.id], decision: "rejected" } });
    expect(await days()).toMatch(/^2027-01-17;0;/);
    // Fremde Reise: IDs werden ignoriert
    const other = await createTrip(request, "Andere", { requireApproval: true });
    const res = await anon.post(`/api/trips/${other.tripId}/approvals`, { headers: org(other), data: { participant_ids: [a.id], decision: "approved" } });
    expect((await res.json()).changed).toBe(0);
  });

  test("Vom Organisator angelegte Personen sind sofort bestätigt", async ({ request }) => {
    const t = await createTrip(request, "Org", { requireApproval: true });
    const r = await anon.post(`/api/trips/${t.tripId}/participants`, { headers: org(t), data: { ...basePerson } });
    expect(r.status()).toBe(201);
    const p = (await getTrip(request, t)).participants[0];
    expect(p.approval).toBe("approved");
  });
});

test.describe("Familien-/Gruppenanmeldung", () => {
  test("Mehrere Personen über einen Link, alle zählen, gemeinsamer Bearbeitungslink", async ({ request }) => {
    const t = await createTrip(request, "Familie");
    const shared = { ...personal, arrival_date: "2027-01-16", departure_date: "2027-01-20", ski_need: "yes", ski_days: ["2027-01-17", "2027-01-18"], diet: "omnivore" };
    const res = await anon.post(`/api/join/${t.invite}`, {
      data: {
        contact: "+49 170 1234567",
        comment: "Familie Berger",
        persons: [
          { ...shared, first_name: "Anna", last_name: "Berger", ski_category: "adult", diet: "vegetarian" },
          { ...shared, first_name: "Ben", last_name: "Berger", ski_category: "child", diet: "omnivore" },
          { ...shared, first_name: "Clara", last_name: "Berger", ski_need: "no", ski_days: [], diet: "omnivore", departure_date: "2027-01-18" },
        ],
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.ids).toHaveLength(3);
    const token = body.edit_url.split("/edit/")[1];

    const rows = (await (await request.get(`/api/trips/${t.tripId}/export?type=days`, { headers: org(t) })).text()).split("\r\n");
    expect(rows.find((l) => l.startsWith("2027-01-17"))).toMatch(/^2027-01-17;3;0;0;0;3;2;3;0$/);
    expect(rows.find((l) => l.startsWith("2027-01-19"))).toMatch(/^2027-01-19;2;/);

    // Gemeinsamer Link: alle drei sichtbar, Kontakt gilt für alle
    const me = await (await anon.get("/api/me", { headers: { "x-edit-token": token } })).json();
    expect(me.participants.map((p: { first_name: string }) => p.first_name)).toEqual(["Anna", "Ben", "Clara"]);
    expect(me.registration.contact).toBe("+49 170 1234567");
    const all = (await getTrip(request, t)).participants;
    expect(new Set(all.map((p: { registration_id: string }) => p.registration_id)).size).toBe(1);

    // Bearbeiten: Ben entfernen, David ergänzen, Clara zurückziehen
    const [anna, , clara] = me.participants;
    const patch = await anon.patch("/api/me", {
      headers: { "x-edit-token": token },
      data: {
        version: me.registration.version,
        contact: "+49 170 1234567",
        persons: [
          { ...shared, id: anna.id, first_name: "Anna", last_name: "Berger", ski_category: "adult" },
          { id: clara.id, first_name: "Clara", last_name: "Berger", status: "withdrawn", ski_need: "no", ski_days: [] },
          { ...shared, first_name: "David", last_name: "Berger", ski_category: "adult" },
        ],
      },
    });
    expect(patch.status()).toBe(200);
    const after = (await patch.json()).participants;
    expect(after.map((p: { first_name: string; status: string }) => `${p.first_name}:${p.status}`)).toEqual(["Anna:active", "Clara:withdrawn", "David:active"]);
    expect((await getTrip(request, t)).participants).toHaveLength(3);
  });

  test("Nachname ist Pflicht, maximal 12 Personen", async ({ request }) => {
    const t = await createTrip(request);
    expect((await anon.post(`/api/join/${t.invite}`, { data: { first_name: "Ohne" } })).status()).toBe(400);
    const many = Array.from({ length: 13 }, (_, i) => ({ first_name: `P${i}`, last_name: "X" }));
    expect((await anon.post(`/api/join/${t.invite}`, { data: { persons: many } })).status()).toBe(400);
  });
});

test.describe("Öffentliche Übersicht", () => {
  test("nur bei Freigabe und nur mit unkritischen Feldern (AK 5)", async ({ request }) => {
    const t = await createTrip(request);
    const a = await join(anon, t, basePerson);
    await join(anon, t, { ...basePerson, first_name: "Weg", allergies: null });
    // Zurückgezogene Person
    const w = (await getTrip(request, t)).participants.find((p: { first_name: string }) => p.first_name === "Weg");
    await anon.patch(`/api/trips/${t.tripId}/participants/${w.id}`, { headers: org(t), data: { ...basePerson, first_name: "Weg", status: "withdrawn", version: w.version } });

    expect((await anon.get(`/api/public/${t.publicCode}`)).status()).toBe(404);
    const { trip } = await getTrip(request, t);
    await anon.patch(`/api/trips/${t.tripId}`, { headers: org(t), data: { version: trip.version, public_enabled: true } });

    const res = await anon.get(`/api/public/${t.publicCode}`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.participants).toHaveLength(1);
    const p = body.participants[0];
    expect(Object.keys(p).sort()).toEqual(["arrival_date", "departure_date", "display_name", "id", "stay_status"].sort());
    expect(p.display_name).toBe("Anna Berger");
    const raw = JSON.stringify(body);
    for (const secret of ["anna@example.com", "Haselnüsse", "Komme mit dem Zug", "Viel Käse", a.token, "invite", t.invite])
      expect(raw).not.toContain(secret);

    // Skitage nur bei ausdrücklicher Freigabe
    const me = (await (await anon.get("/api/me", { headers: { "x-edit-token": a.token } })).json()).participant;
    await anon.patch("/api/me", { headers: { "x-edit-token": a.token }, data: { ...basePerson, share_ski_public: true, version: me.version } });
    const body2 = await (await anon.get(`/api/public/${t.publicCode}`)).json();
    expect(body2.participants[0].ski_days).toEqual(["2027-01-17", "2027-01-18"]);

    // Deaktivieren wirkt sofort
    const { trip: t2 } = await getTrip(request, t);
    await anon.patch(`/api/trips/${t.tripId}`, { headers: org(t), data: { version: t2.version, public_enabled: false } });
    expect((await anon.get(`/api/public/${t.publicCode}`)).status()).toBe(404);
    // Öffentlicher Code erlaubt keine Schreibzugriffe
    expect((await anon.post(`/api/public/${t.publicCode}`, { data: {} })).status()).toBe(405);
  });
});

test.describe("Berechnungen und Exporte", () => {
  test("Tagesstatistik: Anwesende, Anreisen, Abreisen, Skipässe (AK 7)", async ({ request }) => {
    const t = await createTrip(request);
    await addPerson(anon, t, { first_name: "Anna", last_name: "T", arrival_date: "2027-01-16", departure_date: "2027-01-20", ski_need: "yes", ski_days: ["2027-01-17"], ski_category: "adult", meal_mode: "all_present", diet: "omnivore" });
    await addPerson(anon, t, { first_name: "Max", last_name: "T", arrival_date: "2027-01-17", departure_date: "2027-01-23", ski_need: "no", meal_mode: "none" });
    await addPerson(anon, t, { first_name: "Lisa", last_name: "T", arrival_date: "2027-01-16", departure_date: "2027-01-17", ski_need: "unknown", meal_mode: "unknown" });
    await addPerson(anon, t, { first_name: "Tom", last_name: "T", arrival_date: "2027-01-18", departure_date: "2027-01-21", stay_status: "tentative", ski_need: "yes", ski_days: ["2027-01-19", "2027-01-20"], meal_mode: "custom", meal_days: ["2027-01-19"] });
    const csv = await (await request.get(`/api/trips/${t.tripId}/export?type=days`, { headers: org(t) })).text();
    const rows = Object.fromEntries(
      csv
        .replace("﻿", "")
        .trim()
        .split("\r\n")
        .slice(1)
        .map((l) => [l.split(";")[0], l.split(";").slice(1).map(Number)])
    );
    // Spalten: Anwesend, unbestätigt, An, Ab, Übernachtungen, Ski, Essen, Essen unklar
    expect(rows["2027-01-16"]).toEqual([2, 0, 2, 0, 2, 0, 1, 1]);
    expect(rows["2027-01-17"]).toEqual([3, 0, 1, 1, 2, 1, 1, 1]);
    expect(rows["2027-01-18"]).toEqual([3, 1, 1, 0, 3, 0, 1, 0]);
    expect(rows["2027-01-19"]).toEqual([3, 1, 0, 0, 3, 1, 2, 0]);
    expect(rows["2027-01-20"]).toEqual([3, 1, 0, 1, 2, 1, 1, 0]);
    expect(rows["2027-01-21"]).toEqual([2, 1, 0, 1, 1, 0, 0, 0]);
    expect(rows["2027-01-23"]).toEqual([1, 0, 0, 1, 0, 0, 0, 0]);
  });

  test("Exporte enthalten keine Tokens, Gesundheitsdaten nur im Küchenexport", async ({ request }) => {
    const t = await createTrip(request);
    const a = await join(anon, t, basePerson);
    const get = async (type: string) => (await request.get(`/api/trips/${t.tripId}/export?type=${type}`, { headers: org(t) })).text();
    for (const type of ["participants", "days", "ski", "meals", "shopping", "kitchen"]) {
      const csv = await get(type);
      expect(csv).not.toContain(a.token);
      expect(csv.startsWith("﻿")).toBe(true);
    }
    expect(await get("participants")).not.toContain("Haselnüsse");
    expect(await get("kitchen")).toContain("Haselnüsse");
    expect(await get("ski")).toContain("Erwachsene");
  });

  test("CSV entschärft Formel-Injektion", async ({ request }) => {
    const t = await createTrip(request);
    await join(anon, t, { ...basePerson, first_name: "=HYPERLINK(\"x\")", last_name: "Test" });
    const csv = await (await request.get(`/api/trips/${t.tripId}/export?type=participants`, { headers: org(t) })).text();
    expect(csv).toContain("'=HYPERLINK");
  });

  test("Einkaufsliste: Portionen, Skalierung, Einheiten und bestätigte Zusammenführung", async ({ request }) => {
    const t = await createTrip(request);
    for (const n of ["A", "B", "C", "D", "E", "F"]) await join(anon, t, { ...basePerson, first_name: n, last_name: "T", arrival_date: "2027-01-16", departure_date: "2027-01-18", ski_need: "no", ski_days: [], diet: "omnivore" });
    const h = { headers: org(t) };
    const r1 = await (await request.post(`/api/trips/${t.tripId}/recipes`, { ...h, data: { name: "A", base_servings: 4, ingredients: [{ name: "Kartoffeln", quantity: 2, unit: "kg" }, { name: "Milch", quantity: 500, unit: "ml" }] } })).json();
    const r2 = await (await request.post(`/api/trips/${t.tripId}/recipes`, { ...h, data: { name: "B", base_servings: 3, ingredients: [{ name: "festkochende Kartoffeln", quantity: 750, unit: "g" }, { name: "Milch", quantity: 1, unit: "l" }, { name: "Eier", quantity: 3, unit: "" }] } })).json();
    await request.post(`/api/trips/${t.tripId}/meals`, { ...h, data: { day: "2027-01-16", meal_type: "dinner", dish: "A", recipe_id: r1.id } }); // 6 Portionen
    await request.post(`/api/trips/${t.tripId}/meals`, { ...h, data: { day: "2027-01-17", meal_type: "dinner", dish: "B", recipe_id: r2.id, servings_override: 9 } });
    const lines = async () =>
      (await (await request.get(`/api/trips/${t.tripId}/export?type=shopping`, h)).text())
        .replace("﻿", "")
        .split("\r\n")
        .filter(Boolean)
        .map((l) => l.split(";"));
    let csv = await lines();
    const find = (rows: string[][], name: string) => rows.find((r) => r[2] === name);
    expect(find(csv, "Kartoffeln")?.slice(3, 5)).toEqual(["3", "kg"]); // 2 kg * 6/4
    expect(find(csv, "Festkochende Kartoffeln")?.slice(3, 5)).toEqual(["2,25", "kg"]); // 750 g * 9/3
    expect(find(csv, "Milch")?.slice(3, 5)).toEqual(["3,75", "l"]); // 0,75 l + 3 l
    expect(find(csv, "Eier")?.slice(3, 5)).toEqual(["9", "Stk"]);
    // Bestätigte Zusammenführung, danach exakt addiert
    expect((await request.post(`/api/trips/${t.tripId}/aliases`, { ...h, data: { canonical: "Kartoffeln", variants: ["festkochende Kartoffeln"] } })).status()).toBe(200);
    csv = await lines();
    expect(find(csv, "Kartoffeln")?.slice(3, 5)).toEqual(["5,25", "kg"]);
    expect(find(csv, "Festkochende Kartoffeln")).toBeUndefined();
    // Zusammenführung rückgängig
    await request.delete(`/api/trips/${t.tripId}/aliases?alias=${encodeURIComponent("festkochende kartoffeln")}`, h);
    csv = await lines();
    expect(find(csv, "Kartoffeln")?.slice(3, 5)).toEqual(["3", "kg"]);
  });
});

test.describe("Live-Aktualisierung", () => {
  test("Organisator erhält Ereignis, wenn sich jemand anmeldet (AK 8)", async ({ request, baseURL }) => {
    const t = await createTrip(request);
    const controller = new AbortController();
    const res = await fetch(`${baseURL}/api/trips/${t.tripId}/events`, { headers: org(t), signal: controller.signal });
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let buf = "";
    const waitFor = async (needle: string) => {
      const until = Date.now() + 10_000;
      while (!buf.includes(needle) && Date.now() < until) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value);
      }
      return buf.includes(needle);
    };
    expect(await waitFor("event: ready")).toBe(true);
    await join(anon, t, basePerson);
    expect(await waitFor("event: change")).toBe(true);
    controller.abort();
    // ohne Zugang kein Stream
    expect((await anon.get(`/api/trips/${t.tripId}/events`)).status()).toBe(401);
  });
});
