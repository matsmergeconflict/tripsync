import { describe, expect, it } from "vitest";
import { addDays, diffDays, eachDay, formatShort, groupByWeek, isISODate, isoWeek, weekdayShort } from "@/lib/dates";

describe("dates", () => {
  it("validiert ISO-Daten inkl. Schaltjahr", () => {
    expect(isISODate("2027-01-16")).toBe(true);
    expect(isISODate("2028-02-29")).toBe(true);
    expect(isISODate("2027-02-29")).toBe(false);
    expect(isISODate("2027-13-01")).toBe(false);
    expect(isISODate("16.01.2027")).toBe(false);
    expect(isISODate(null)).toBe(false);
  });

  it("rechnet über Monats- und Jahresgrenzen", () => {
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(diffDays("2026-12-30", "2027-01-02")).toBe(3);
  });

  it("ist unabhängig von Sommerzeit-Umstellungen", () => {
    // Zeitumstellung in Europa: 29.03.2026 und 25.10.2026
    expect(eachDay("2026-03-28", "2026-03-30")).toEqual(["2026-03-28", "2026-03-29", "2026-03-30"]);
    expect(diffDays("2026-10-24", "2026-10-26")).toBe(2);
  });

  it("liefert inklusive Tageslisten", () => {
    expect(eachDay("2027-01-16", "2027-01-16")).toEqual(["2027-01-16"]);
    expect(eachDay("2027-01-16", "2027-01-15")).toEqual([]);
    expect(eachDay("2027-01-16", "2027-01-23")).toHaveLength(8);
  });

  it("formatiert Wochentage deutsch", () => {
    expect(weekdayShort("2027-01-16")).toBe("Sa");
    expect(formatShort("2027-01-18")).toBe("Mo 18.01.");
  });

  it("gruppiert nach ISO-Kalenderwochen", () => {
    expect(isoWeek("2027-01-04")).toBe(1);
    expect(isoWeek("2026-12-31")).toBe(53);
    const g = groupByWeek(eachDay("2027-01-16", "2027-01-26"));
    expect(g.map((x) => x.days.length)).toEqual([2, 7, 2]);
  });
});
