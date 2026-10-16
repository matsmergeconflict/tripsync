import { expect, test } from "@playwright/test";
import { basePerson, createTrip, getTrip, join, org } from "./helpers";

/** Smartphone: kein horizontales Überlaufen der Seite, Zeitachse scrollbar, Namen bleiben sichtbar (AK 9). */
test("Zeitachse und Anmeldung auf dem Smartphone", async ({ page, request }) => {
  const t = await createTrip(request, "Mobil");
  const names = ["Anna", "Ben", "Clara", "David", "Eva", "Finn"];
  for (const [i, n] of names.entries())
    await join(request, t, { ...basePerson, first_name: n, arrival_date: `2027-01-1${6 + (i % 3)}`, departure_date: "2027-01-23", ski_need: "no", ski_days: [] });
  const { trip } = await getTrip(request, t);
  await request.patch(`/api/trips/${t.tripId}`, { headers: org(t), data: { version: trip.version, public_enabled: true } });

  for (const url of [`/o/${t.orgToken}`, `/trips/${t.tripId}/timeline`, `/view/${t.publicCode}`]) {
    await page.goto(url);
    await expect(page.getByTestId("gantt").or(page.getByRole("heading", { name: "Mobil" }))).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `Seite ${url} darf nicht horizontal überlaufen`).toBeLessThanOrEqual(1);
  }

  // Auf der Zeitachse horizontal scrollen: Namensspalte bleibt sichtbar
  await page.goto(`/trips/${t.tripId}/timeline`);
  const gantt = page.getByTestId("gantt");
  await expect(gantt).toBeVisible();
  const name = page.locator('[data-testid="gantt-row"][data-name="Anna Berger"]').getByRole("rowheader");
  const before = await name.boundingBox();
  const scrollable = await gantt.evaluate((el) => el.scrollWidth > el.clientWidth);
  expect(scrollable).toBe(true);
  await gantt.evaluate((el) => (el.scrollLeft = 400));
  const after = await name.boundingBox();
  expect(Math.abs((after?.x ?? 0) - (before?.x ?? 0))).toBeLessThan(2);
  await expect(name).toBeInViewport();

  // Navigation als Menü
  await page.getByRole("button", { name: "Menü öffnen" }).click();
  await page.getByRole("dialog", { name: "Menü" }).getByRole("link", { name: "Teilnehmer" }).click();
  await expect(page.getByRole("heading", { name: "Teilnehmer" })).toBeVisible();

  // Anmeldeformular mobil bedienbar
  await page.goto(`/join/${t.invite}`);
  await page.getByLabel("Vorname").fill("Handy");
  await page.getByLabel("Nachname").fill("Nutzer");
  await expect(page.getByLabel("Handynummer")).toHaveValue("+49 ");
  await page.getByLabel("Handynummer").fill("+49 151 2345678");
  await page.getByLabel("E-Mail").fill("handy@example.com");
  await page.getByLabel("Geburtstag").pressSequentially("01022010");
  await expect(page.getByLabel("Geburtstag")).toHaveValue("01.02.2010");
  await page.getByRole("button", { name: "Weiter", exact: true }).click();
  const range = page.getByRole("group", { name: "Anreise und Abreise wählen" });
  const day = range.locator('[data-day="2027-01-18"]');
  const box = await day.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(40); // große Touch-Ziele
  await day.click();
  await range.locator('[data-day="2027-01-19"]').click();
  await page.getByRole("button", { name: "Weiter", exact: true }).click();
  await page.getByRole("radiogroup", { name: "Skipass erforderlich" }).getByText("Nein").click();
  await page.getByRole("button", { name: "Weiter", exact: true }).click();
  await page.getByLabel("Ernährungsweise").selectOption("vegan");
  await expect(page.getByText("Vegan wird nicht extra gekocht")).toBeVisible();
  await page.getByRole("button", { name: "Weiter", exact: true }).click();
  await page.getByRole("button", { name: "Anmeldung absenden" }).click();
  await expect(page.getByTestId("join-done")).toBeVisible();
});
