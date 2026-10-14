import { expect, test, type Page } from "@playwright/test";

/** Kompletter Ablauf im Browser: Organisator legt Reise an, Teilnehmer meldet sich an und ändert Daten. */
test("End-to-End: Reise anlegen, anmelden, live sehen, ändern, öffentlich ansehen", async ({ browser }) => {
  const orgCtx = await browser.newContext();
  const orgPage = await orgCtx.newPage();

  // 1. Reise anlegen (AK 1)
  await orgPage.goto("/");
  await orgPage.getByLabel("Name der Reise").fill("Hüttenwoche E2E");
  await orgPage.getByLabel("Erster Tag").fill("2027-01-16");
  await orgPage.getByLabel("Letzter Tag").fill("2027-01-23");
  await orgPage.getByLabel("Dein Name").fill("Olga Orga");
  await orgPage.getByRole("button", { name: "Reise anlegen" }).click();
  await expect(orgPage.getByTestId("trip-created")).toBeVisible();
  const orgLink = await orgPage.getByTestId("copy-link-input").inputValue();
  expect(orgLink).toMatch(/\/o\/[A-Za-z0-9_-]{43}$/);
  await orgPage.getByRole("button", { name: "Zur Reise" }).click();
  await expect(orgPage.getByRole("heading", { name: "Hüttenwoche E2E" })).toBeVisible();

  // Einladungslink aus der Übersicht
  const invite = await orgPage.getByLabel("Einladungslink", { exact: true }).first().inputValue();
  expect(invite).toMatch(/\/join\/[A-Za-z0-9_-]{16}$/);

  // Öffentliche Ansicht aktivieren
  await orgPage.getByRole("link", { name: "Einstellungen" }).first().click();
  await orgPage.locator("label", { has: orgPage.getByTestId("public-toggle") }).click();
  await expect(orgPage.getByText("Link zur Übersicht (nur lesen)")).toBeVisible();
  const publicUrl = await orgPage.getByLabel("Link zur Übersicht (nur lesen)").inputValue();

  // Zeitachse offen lassen – sie soll sich live aktualisieren
  await orgPage.getByRole("link", { name: "Zeitachse" }).first().click();
  await expect(orgPage.getByTestId("gantt")).toBeVisible();
  await expect(orgPage.getByText("Live", { exact: true }).first()).toBeVisible();

  // 2. Teilnehmer meldet sich ohne Konto an (AK 2)
  const pCtx = await browser.newContext();
  const p = await pCtx.newPage();
  await p.goto(invite);
  await p.getByLabel("Vorname").fill("Mia");
  await p.getByLabel("Nachname").fill("Muster");
  await p.getByLabel("Kontakt").fill("mia@example.com");
  await p.getByRole("button", { name: "Weiter", exact: true }).click();
  const range = p.getByRole("group", { name: "Anreise und Abreise wählen" });
  await range.locator('[data-day="2027-01-17"]').click();
  await range.locator('[data-day="2027-01-20"]').click();
  await expect(p.getByTestId("arrival-display")).toHaveText("So 17.01.");
  await expect(p.getByTestId("departure-display")).toHaveText("Mi 20.01.");
  await p.getByRole("button", { name: "Weiter", exact: true }).click();
  await p.getByRole("radiogroup", { name: "Skipass erforderlich" }).getByText("Ja", { exact: true }).click();
  await p.getByRole("button", { name: "Ohne An- und Abreisetag" }).click();
  await expect(p.getByTestId("ski-day-count")).toContainText("2 Skitage");
  await p.getByLabel("Passkategorie").selectOption({ label: "Erwachsene" });
  await p.getByRole("button", { name: "Weiter", exact: true }).click();
  await p.getByLabel("Ernährungsweise").selectOption("vegetarian");
  await p.getByLabel(/Allergien/).fill("Sellerie");
  await p.getByRole("button", { name: "Weiter", exact: true }).click();
  await expect(p.getByTestId("review")).toContainText("Mia Muster");
  await p.getByRole("button", { name: "Anmeldung absenden" }).click();
  await expect(p.getByTestId("join-done")).toBeVisible();
  await expect(p.getByTestId("join-done")).toContainText("noch bestätigen");
  const editUrl = await p.getByTestId("copy-link-input").inputValue();
  expect(editUrl).toMatch(/\/edit\/[A-Za-z0-9_-]{43}$/);

  // 3a. Anmeldung erscheint live als "wartet auf Bestätigung" und zählt noch nicht
  await expect(orgPage.locator('[data-testid="gantt-row"][data-name="Mia Muster"]')).toHaveCount(0);
  await expect(orgPage.getByTestId("pending-badge")).toHaveText("1", { timeout: 10_000 });
  await orgPage.getByRole("link", { name: /Übersicht/ }).first().click();
  const pendingGroup = orgPage.getByTestId("pending-group");
  await expect(pendingGroup).toContainText("Mia Muster");
  await expect(pendingGroup).toContainText("mia@example.com");
  await pendingGroup.getByRole("button", { name: "Bestätigen" }).click();
  await expect(orgPage.getByTestId("notify-box")).toContainText("Mia");
  const wa = await orgPage.getByRole("link", { name: "Per WhatsApp benachrichtigen" }).getAttribute("href");
  expect(wa).toMatch(/^https:\/\/wa\.me\/\?text=.*best%C3%A4tigt/);
  await orgPage.getByRole("link", { name: "Zeitachse" }).first().click();

  // 3b. Nach Bestätigung in der Zeitachse (AK 4, AK 8)
  const row = orgPage.locator('[data-testid="gantt-row"][data-name="Mia Muster"]');
  await expect(row).toBeVisible({ timeout: 10_000 });
  const bar = row.getByTestId("gantt-bar");
  await expect(bar).toHaveAttribute("data-start", "2027-01-17");
  await expect(bar).toHaveAttribute("data-end", "2027-01-20");
  await expect(bar).toHaveAttribute("aria-label", /Anreise So 17\.01\..*Abreise Mi 20\.01\..*bestätigt/);
  await expect(row.getByTestId("ski-marker")).toHaveCount(2);
  await expect(orgPage.locator('[data-stat="present"][data-day="2027-01-17"]')).toContainText("1");
  await expect(orgPage.locator('[data-stat="present"][data-day="2027-01-21"]')).toContainText("0");
  await expect(orgPage.locator('[data-stat="arrivals"][data-day="2027-01-17"]')).toContainText("1");

  // 4. Teilnehmer ändert seine Daten über den persönlichen Link (AK 3)
  await p.goto(editUrl);
  await expect(p.getByRole("heading", { name: "Hallo Mia!" })).toBeVisible();
  const range2 = p.getByRole("group", { name: "Anreise und Abreise wählen" });
  await range2.locator('[data-day="2027-01-18"]').click();
  await range2.locator('[data-day="2027-01-21"]').click();
  await p.getByRole("radiogroup", { name: "Status der Angaben" }).getByText("Noch unklar").click();
  await p.getByRole("button", { name: "Änderungen speichern" }).click();
  await expect(p.getByRole("status").filter({ hasText: "Gespeichert" })).toBeVisible();

  // Organisator sieht die Änderung live
  await expect(bar).toHaveAttribute("data-start", "2027-01-18", { timeout: 10_000 });
  await expect(bar).toHaveAttribute("data-end", "2027-01-21");
  await expect(bar).toHaveAttribute("data-status", "tentative");
  await expect(orgPage.locator('[data-stat="present"][data-day="2027-01-17"]')).toContainText("0");

  // Detailansicht beim Klick auf den Namen inkl. vertraulicher Angaben für Organisatoren
  await row.getByRole("rowheader").getByRole("button").click();
  await expect(orgPage.getByTestId("participant-details")).toContainText("Sellerie");
  await orgPage.getByRole("tab", { name: "Verlauf" }).click();
  await expect(orgPage.getByRole("dialog").getByTestId("audit-list")).toContainText("Mo 18.01.");
  await orgPage.keyboard.press("Escape");

  // Tagesansicht
  await orgPage.getByRole("button", { name: /Mo 18\.01\. – Tagesansicht/ }).click();
  await expect(orgPage.getByTestId("day-view")).toContainText("Reisen an (1)");

  // 5. Öffentliche Übersicht ohne Konto (AK 5) – ohne private Angaben
  const vCtx = await browser.newContext();
  const v = await vCtx.newPage();
  await v.goto(publicUrl);
  const pubRow = v.locator('[data-testid="gantt-row"][data-name="Mia Muster"]');
  await expect(pubRow).toBeVisible();
  await expect(pubRow.getByTestId("gantt-bar")).toHaveAttribute("data-start", "2027-01-18");
  const html = await v.content();
  expect(html).not.toContain("Sellerie");
  expect(html).not.toContain("mia@example.com");
  expect(html).not.toContain(editUrl.split("/edit/")[1]);

  // 6. Zurückziehen über den persönlichen Link
  p.once("dialog", (d) => d.accept());
  await p.getByRole("button", { name: "Teilnahme zurückziehen" }).click();
  await expect(p.getByText("Deine Teilnahme wurde zurückgezogen.")).toBeVisible();
  await expect(pubRow).toHaveCount(0, { timeout: 10_000 });
  await expect(row).toHaveCount(0, { timeout: 10_000 });

  await Promise.all([orgCtx.close(), pCtx.close(), vCtx.close()]);
});

test("Organisator ohne Zugang sieht Hinweis statt Daten", async ({ page, request }) => {
  const res = await request.post("/api/trips", { data: { name: "Fremd", start_date: "2027-01-16", end_date: "2027-01-18", organizer_name: "X" } });
  const { trip_id } = await res.json();
  await page.goto(`/trips/${trip_id}`);
  await expect(page.getByText("Kein Organisatorzugang für diese Reise")).toBeVisible();
});

test("Essensplanung: Mahlzeit mit Rezept erzeugt Einkaufsliste", async ({ page }) => {
  await createViaUi(page, "Kochtest");
  // Person mit Essen über Organisator anlegen
  await page.getByRole("button", { name: "+ Person hinzufügen" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Vorname").fill("Koch");
  await dialog.getByLabel("Nachname").fill("Löffel");
  const range = dialog.getByRole("group", { name: "Anreise und Abreise wählen" });
  await range.locator('[data-day="2027-01-16"]').click();
  await range.locator('[data-day="2027-01-18"]').click();
  await dialog.getByLabel("Ernährungsweise").selectOption("omnivore");
  await dialog.getByRole("button", { name: "Anlegen" }).click();
  await expect(dialog.getByText("Person angelegt.")).toBeVisible();
  await dialog.getByRole("button", { name: "Fertig" }).click();

  await page.getByRole("link", { name: "Essensplanung" }).first().click();
  await page.getByRole("radiogroup", { name: "Bereich" }).getByText("Rezepte").click();
  await page.getByRole("button", { name: "+ Rezept anlegen" }).click();
  const rd = page.getByRole("dialog");
  await rd.getByLabel("Name", { exact: true }).fill("Nudeln");
  await rd.getByLabel("Für wie viele Portionen?").fill("2");
  await rd.getByRole("button", { name: "+ Zutat" }).click();
  const ing = rd.getByTestId("ingredient-row").first();
  await ing.getByLabel("Zutat", { exact: true }).fill("Spaghetti");
  await ing.getByLabel("Menge").fill("250");
  await ing.getByLabel("Einheit").fill("g");
  await rd.getByRole("button", { name: "Speichern" }).click();
  await expect(rd).toBeHidden();

  await page.getByRole("radiogroup", { name: "Bereich" }).getByText("Mahlzeiten").click();
  await page.getByRole("button", { name: "+ Mahlzeit" }).first().click();
  const md = page.getByRole("dialog");
  await md.getByLabel("Rezept").selectOption({ label: "Nudeln" });
  await md.getByText("Portionen manuell festlegen").click();
  await md.getByLabel("Portionen", { exact: true }).fill("10");
  await md.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByTestId("meal-servings").first()).toHaveText("10");

  await page.getByRole("link", { name: "Einkaufsliste" }).first().click();
  const item = page.locator('[data-testid="shopping-item"][data-name="Spaghetti"]');
  await expect(item.getByTestId("shopping-amount")).toHaveText("1,25 kg");
  await item.getByRole("checkbox").check();
  await expect(item.getByRole("checkbox")).toBeChecked();
  await page.reload();
  await expect(page.locator('[data-testid="shopping-item"][data-name="Spaghetti"]').getByRole("checkbox")).toBeChecked();
});

async function createViaUi(page: Page, name: string) {
  await page.goto("/");
  await page.getByLabel("Name der Reise").fill(name);
  await page.getByLabel("Erster Tag").fill("2027-01-16");
  await page.getByLabel("Letzter Tag").fill("2027-01-23");
  await page.getByLabel("Dein Name").fill("Orga");
  await page.getByRole("button", { name: "Reise anlegen" }).click();
  await page.getByRole("button", { name: "Zur Reise" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
}

test("Familienanmeldung: gemeinsamer Kopf, Abweichung pro Person, alle zählen", async ({ browser, request }) => {
  const res = await request.post("/api/trips", { data: { name: "Familientest", start_date: "2027-01-16", end_date: "2027-01-23", organizer_name: "Orga" } });
  const { trip_id, organizer_url } = await res.json();
  const orgToken = organizer_url.split("/o/")[1];
  const full = await (await request.get(`/api/trips/${trip_id}`, { headers: { "x-organizer-token": orgToken } })).json();
  const invite = full.links.invite;

  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await p.goto(invite);
  const persons = p.getByTestId("person-entry");
  await persons.nth(0).getByLabel("Vorname").fill("Eva");
  await persons.nth(0).getByLabel("Nachname").fill("Kraus");
  await p.getByRole("button", { name: "+ Weitere Person anmelden" }).click();
  await expect(persons.nth(1).getByLabel("Nachname")).toHaveValue("Kraus"); // Nachname wird übernommen
  await persons.nth(1).getByLabel("Vorname").fill("Finn");
  await p.getByRole("button", { name: "+ Weitere Person anmelden" }).click();
  await persons.nth(2).getByLabel("Vorname").fill("Greta");
  await p.getByRole("button", { name: "Weiter", exact: true }).click();

  // Kopf: gemeinsamer Zeitraum
  const head = p.getByRole("group", { name: "Gemeinsame Anreise und Abreise für alle" });
  await head.locator('[data-day="2027-01-16"]').click();
  await head.locator('[data-day="2027-01-22"]').click();
  // Greta reist früher ab
  await p.getByText("Greta: andere Daten").click();
  const greta = p.getByRole("group", { name: "Anreise und Abreise für Greta" });
  await greta.locator('[data-day="2027-01-16"]').click();
  await greta.locator('[data-day="2027-01-19"]').click();
  await p.getByRole("button", { name: "Weiter", exact: true }).click();

  // Ski: alle ja, Greta nicht
  await p.getByRole("radiogroup", { name: "Skipass erforderlich" }).getByText("Ja", { exact: true }).click();
  await p.getByRole("button", { name: "Ohne An- und Abreisetag" }).first().click();
  await p.getByText("Greta: anderer Skipass-Wunsch").click();
  await p.getByRole("radiogroup", { name: "Skipass für Greta" }).getByText("Nein", { exact: true }).click();
  await p.getByLabel("Eva", { exact: true }).selectOption({ label: "Erwachsene" });
  await p.getByLabel("Finn", { exact: true }).selectOption({ label: "Kinder" });
  await p.getByRole("button", { name: "Weiter", exact: true }).click();
  await p.getByRole("button", { name: "Weiter", exact: true }).click();
  const review = p.getByTestId("review");
  await expect(review).toContainText("Eva Kraus");
  await expect(review).toContainText("Greta Kraus");
  await p.getByRole("button", { name: "Anmeldung absenden" }).click();
  await expect(p.getByTestId("join-done")).toContainText("3 Personen");

  // Organisator bestätigt alle auf einmal
  const org = await browser.newContext();
  const o = await org.newPage();
  await o.goto(organizer_url);
  await o.getByTestId("pending-group").getByRole("button", { name: "Alle 3 bestätigen" }).click();
  await expect(o.getByTestId("notify-box")).toBeVisible();
  const days = await (await o.request.get(`/api/trips/${trip_id}/export?type=days`, { headers: { "x-organizer-token": orgToken } })).text();
  const line = (d: string) => days.split("\r\n").find((l) => l.startsWith(d))!.split(";").map(Number);
  expect(line("2027-01-17").slice(1, 2)).toEqual([3]); // anwesend
  expect(line("2027-01-17")[6]).toBe(2); // Skipässe (Greta nicht)
  expect(line("2027-01-20")[1]).toBe(2); // Greta schon abgereist

  // Bearbeitungslink zeigt alle drei als bestätigt
  const editUrl = await p.getByTestId("copy-link-input").inputValue();
  await p.goto(editUrl);
  await expect(p.getByTestId("approval-status")).toContainText("Greta Kraus");
  await expect(p.getByTestId("approval-status").getByText("✓ bestätigt")).toHaveCount(3);
  await Promise.all([ctx.close(), org.close()]);
});
