import { describe, expect, it } from "vitest";
import { computeDayStats, computeSkiSummary, dayRole, eatsOn, findIssues, isComplete, isPresent } from "@/lib/stats";
import type { Participant, StatParticipant } from "@/lib/types";

const START = "2027-01-16"; // Sa
const END = "2027-01-22"; // Fr

function p(id: string, a: string | null, d: string | null, extra: Partial<StatParticipant> = {}): StatParticipant {
  return {
    id,
    arrival_date: a,
    departure_date: d,
    stay_status: "confirmed",
    status: "active",
    ski_need: "no",
    ski_days: [],
    ski_category: null,
    meal_mode: "all_present",
    meal_days: [],
    diet: "omnivore",
    ...extra,
  };
}

// Beispiel aus der Spezifikation (auf 2027 verschoben)
const anna = p("anna", "2027-01-16", "2027-01-20");
const max = p("max", "2027-01-17", "2027-01-22");
const lisa = p("lisa", "2027-01-16", "2027-01-17");
const tom = p("tom", "2027-01-18", "2027-01-21");

describe("Anwesenheit (An- und Abreisetag zählen als anwesend)", () => {
  it("bestimmt Tagesrollen korrekt", () => {
    expect(dayRole(max, "2027-01-16")).toBeNull();
    expect(dayRole(max, "2027-01-17")).toBe("arrival");
    expect(dayRole(max, "2027-01-19")).toBe("stay");
    expect(dayRole(max, "2027-01-22")).toBe("departure");
    expect(dayRole(p("x", "2027-01-18", "2027-01-18"), "2027-01-18")).toBe("arrival_departure");
  });

  it("zählt An- und Abreisetag als anwesend", () => {
    expect(isPresent(lisa, "2027-01-16")).toBe(true);
    expect(isPresent(lisa, "2027-01-17")).toBe(true);
    expect(isPresent(lisa, "2027-01-18")).toBe(false);
  });

  it("erfindet keine Anwesenheit bei fehlenden Daten", () => {
    const halb = p("h", "2027-01-17", null);
    expect(isPresent(halb, "2027-01-17")).toBe(false);
    expect(dayRole(halb, "2027-01-17")).toBe("arrival");
    expect(dayRole(halb, "2027-01-18")).toBeNull();
  });

  it("behandelt Abreise vor Anreise als ungültig", () => {
    const kaputt = p("k", "2027-01-20", "2027-01-18");
    expect(isPresent(kaputt, "2027-01-19")).toBe(false);
    expect(dayRole(kaputt, "2027-01-20")).toBeNull();
  });
});

describe("Tagesstatistik", () => {
  const stats = computeDayStats([anna, max, lisa, tom], START, END);
  const byDay = Object.fromEntries(stats.map((s) => [s.day, s]));

  it("liefert einen Eintrag pro Reisetag", () => {
    expect(stats).toHaveLength(7);
  });

  it("zählt Anwesende, Anreisen und Abreisen", () => {
    expect(byDay["2027-01-16"]).toMatchObject({ present: 2, arrivals: 2, departures: 0 });
    expect(byDay["2027-01-17"]).toMatchObject({ present: 3, arrivals: 1, departures: 1 });
    expect(byDay["2027-01-18"]).toMatchObject({ present: 3, arrivals: 1, departures: 0 });
    expect(byDay["2027-01-20"]).toMatchObject({ present: 3, arrivals: 0, departures: 1 });
    expect(byDay["2027-01-21"]).toMatchObject({ present: 2, arrivals: 0, departures: 1 });
    expect(byDay["2027-01-22"]).toMatchObject({ present: 1, arrivals: 0, departures: 1 });
  });

  it("zählt Übernachtungen ohne Abreisenacht", () => {
    expect(byDay["2027-01-17"].overnight).toBe(2); // Anna, Max (Lisa reist ab)
    expect(byDay["2027-01-22"].overnight).toBe(0);
  });

  it("ignoriert zurückgezogene Anmeldungen", () => {
    const s = computeDayStats([anna, { ...tom, status: "withdrawn" }], START, END);
    expect(s.find((x) => x.day === "2027-01-19")!.present).toBe(1);
  });

  it("zählt Abreisen auch, wenn die Anreise fehlt, aber keine Anwesenheit", () => {
    const s = computeDayStats([p("x", null, "2027-01-19")], START, END);
    const d = s.find((x) => x.day === "2027-01-19")!;
    expect(d.departures).toBe(1);
    expect(d.present).toBe(0);
  });

  it("weist unbestätigte Anwesenheiten separat aus", () => {
    const s = computeDayStats([anna, { ...tom, stay_status: "tentative" }], START, END);
    expect(s.find((x) => x.day === "2027-01-19")).toMatchObject({ present: 2, presentTentative: 1 });
  });
});

describe("Skipässe sind unabhängig vom Aufenthalt", () => {
  const skier = p("s", "2027-01-16", "2027-01-22", {
    ski_need: "yes",
    ski_days: ["2027-01-17", "2027-01-18", "2027-01-20"],
    ski_category: "adult",
  });
  const unklar = p("u", "2027-01-16", "2027-01-22", { ski_need: "unknown", ski_days: ["2027-01-17"] });
  const kein = p("n", "2027-01-16", "2027-01-22", { ski_need: "no", ski_days: ["2027-01-17"] });

  it("zählt nur ausgewählte Skitage bei ski_need=yes", () => {
    const s = computeDayStats([skier, unklar, kein], START, END);
    expect(s.map((d) => d.skiPasses)).toEqual([0, 1, 1, 0, 1, 0, 0]);
  });

  it("fasst Bedarf nach Kategorie zusammen", () => {
    const youth = p("y", "2027-01-17", "2027-01-19", { ski_need: "yes", ski_days: ["2027-01-18"], ski_category: "youth" });
    const sum = computeSkiSummary([skier, youth, unklar], START, END);
    expect(sum.totalPersonDays).toBe(4);
    expect(sum.byCategoryDays).toEqual({ adult: 3, youth: 1 });
    expect(sum.byCategoryPeople).toEqual({ adult: 1, youth: 1 });
    expect(sum.unknownPeople).toBe(1);
    expect(sum.perDay.find((d) => d.day === "2027-01-18")!.byCategory).toEqual({ adult: 1, youth: 1 });
  });
});

describe("Mahlzeiten", () => {
  it("leitet Essensteilnahme aus Anwesenheit oder Einzeltagen ab", () => {
    expect(eatsOn(anna, "2027-01-17")).toBe(true);
    expect(eatsOn(anna, "2027-01-21")).toBe(false);
    expect(eatsOn(p("c", "2027-01-16", "2027-01-22", { meal_mode: "custom", meal_days: ["2027-01-18"] }), "2027-01-18")).toBe(true);
    expect(eatsOn(p("c", "2027-01-16", "2027-01-22", { meal_mode: "custom", meal_days: ["2027-01-18"] }), "2027-01-19")).toBe(false);
    expect(eatsOn(p("u", "2027-01-16", "2027-01-22", { meal_mode: "unknown" }), "2027-01-18")).toBeNull();
    expect(eatsOn(p("u", null, null), "2027-01-18")).toBeNull();
  });

  it("zählt Ernährungsweisen pro Tag", () => {
    const v = p("v", "2027-01-16", "2027-01-18", { diet: "vegan" });
    const s = computeDayStats([anna, v, p("u", "2027-01-16", "2027-01-18", { meal_mode: "unknown" })], START, END);
    expect(s[0]).toMatchObject({ mealParticipants: 2, mealUnknown: 1, dietCounts: { omnivore: 1, vegan: 1 } });
  });
});

describe("Fehlende Angaben", () => {
  const trip = { start_date: START, end_date: END, ski_enabled: true, ski_categories: [{ id: "adult" }] };
  const base = { ...p("x", "2027-01-16", "2027-01-20"), ski_days: [], meal_days: [] } as unknown as Participant;

  it("meldet vollständige Anmeldung ohne Probleme", () => {
    expect(findIssues(base, trip)).toEqual([]);
    expect(isComplete([])).toBe(true);
  });

  it("erkennt fehlende und widersprüchliche Angaben", () => {
    const i = findIssues(
      { ...base, departure_date: null, stay_status: "tentative", ski_need: "yes", ski_days: [], ski_category: null, meal_mode: "unknown" },
      trip
    );
    expect(i).toEqual(expect.arrayContaining(["missing_departure", "stay_tentative", "ski_no_days", "ski_no_category", "meal_unknown"]));
    expect(isComplete(i)).toBe(false);
  });

  it("warnt bei Skitagen außerhalb des Aufenthalts und Zeitraum außerhalb der Reise", () => {
    const i = findIssues({ ...base, departure_date: "2027-01-25", ski_need: "yes", ski_category: "adult", ski_days: ["2027-01-26"] }, trip);
    expect(i).toContain("ski_outside_stay");
    expect(i).toContain("outside_trip");
    expect(isComplete(i)).toBe(true); // nur Warnungen
  });
});
