import { eachDay, isWithin, type ISODate } from "./dates";
import type { Diet, StatParticipant, Participant } from "./types";

/** Tagesrolle einer Person im Gantt / in der Statistik. */
export type DayRole = "arrival" | "departure" | "arrival_departure" | "stay" | null;

export function isActive(p: Pick<StatParticipant, "status">): boolean {
  return p.status === "active";
}

/** Hat die Person vollständige, plausible Aufenthaltsdaten? */
export function hasCompleteStay(p: Pick<StatParticipant, "arrival_date" | "departure_date">): boolean {
  return !!p.arrival_date && !!p.departure_date && p.arrival_date <= p.departure_date;
}

/**
 * Rolle der Person an einem Tag. Anreise- und Abreisetag zählen als anwesend.
 * Ohne vollständige Daten wird nichts erfunden: Rolle ist dann null
 * (Ausnahme: der bekannte Einzeltag wird als An- bzw. Abreise markiert).
 */
export function dayRole(p: Pick<StatParticipant, "arrival_date" | "departure_date">, day: ISODate): DayRole {
  const { arrival_date: a, departure_date: d } = p;
  if (a && d) {
    if (a > d) return null;
    if (day === a && day === d) return "arrival_departure";
    if (day === a) return "arrival";
    if (day === d) return "departure";
    if (isWithin(day, a, d)) return "stay";
    return null;
  }
  if (a && day === a) return "arrival";
  if (d && day === d) return "departure";
  return null;
}

export function isPresent(p: Pick<StatParticipant, "arrival_date" | "departure_date">, day: ISODate): boolean {
  return hasCompleteStay(p) && isWithin(day, p.arrival_date!, p.departure_date!);
}

/** Übernachtung in der Nacht von `day` auf den Folgetag. */
export function staysOvernight(p: Pick<StatParticipant, "arrival_date" | "departure_date">, day: ISODate): boolean {
  return hasCompleteStay(p) && day >= p.arrival_date! && day < p.departure_date!;
}

/** Bekommt die Person an diesem Tag gemeinsame Mahlzeiten? null = unbekannt. */
export function eatsOn(p: StatParticipant, day: ISODate): boolean | null {
  switch (p.meal_mode) {
    case "none":
      return false;
    case "custom":
      return (p.meal_days ?? []).includes(day);
    case "all_present":
      return hasCompleteStay(p) ? isPresent(p, day) : null;
    default:
      return null;
  }
}

/** Braucht die Person an diesem Tag einen Skipass? Nur bei ski_need = yes und gewähltem Tag. */
export function skisOn(p: StatParticipant, day: ISODate): boolean {
  return p.ski_need === "yes" && (p.ski_days ?? []).includes(day);
}

export interface DayStats {
  day: ISODate;
  present: number;
  presentTentative: number; // davon mit unbestätigten Angaben
  arrivals: number;
  departures: number;
  overnight: number;
  skiPasses: number;
  skiPassesTentative: number; // davon mit unbestätigtem Aufenthalt
  mealParticipants: number;
  mealUnknown: number; // anwesend, aber Essensteilnahme unbekannt
  dietCounts: Partial<Record<Diet | "unknown", number>>;
}

export function computeDayStats(participants: StatParticipant[], start: ISODate, end: ISODate): DayStats[] {
  const active = participants.filter(isActive);
  return eachDay(start, end).map((day) => {
    const s: DayStats = {
      day,
      present: 0,
      presentTentative: 0,
      arrivals: 0,
      departures: 0,
      overnight: 0,
      skiPasses: 0,
      skiPassesTentative: 0,
      mealParticipants: 0,
      mealUnknown: 0,
      dietCounts: {},
    };
    for (const p of active) {
      const present = isPresent(p, day);
      if (present) {
        s.present++;
        if (p.stay_status === "tentative") s.presentTentative++;
      }
      // An-/Abreise wird auch gezählt, wenn nur einer der beiden Termine bekannt ist.
      if (p.arrival_date === day) s.arrivals++;
      if (p.departure_date === day) s.departures++;
      if (staysOvernight(p, day)) s.overnight++;
      if (skisOn(p, day)) {
        s.skiPasses++;
        if (p.stay_status === "tentative") s.skiPassesTentative++;
      }
      const eats = eatsOn(p, day);
      if (eats === true) {
        s.mealParticipants++;
        const k = p.diet ?? "unknown";
        s.dietCounts[k] = (s.dietCounts[k] ?? 0) + 1;
      } else if (eats === null && present) {
        s.mealUnknown++;
      }
    }
    return s;
  });
}

export type IssueCode =
  | "missing_arrival"
  | "missing_departure"
  | "invalid_range"
  | "outside_trip"
  | "stay_tentative"
  | "ski_unknown"
  | "ski_no_days"
  | "ski_no_category"
  | "ski_outside_stay"
  | "meal_unknown"
  | "meal_outside_stay"
  | "diet_missing";

export const ISSUE_LABELS: Record<IssueCode, string> = {
  missing_arrival: "Anreise fehlt",
  missing_departure: "Abreise fehlt",
  invalid_range: "Abreise liegt vor Anreise",
  outside_trip: "Aufenthalt außerhalb des Reisezeitraums",
  stay_tentative: "Aufenthalt noch unbestätigt",
  ski_unknown: "Skipass noch unklar",
  ski_no_days: "Skipass gewünscht, aber keine Skitage",
  ski_no_category: "Passkategorie fehlt",
  ski_outside_stay: "Skitag außerhalb des Aufenthalts",
  meal_unknown: "Essensteilnahme unklar",
  meal_outside_stay: "Essenstag außerhalb des Aufenthalts",
  diet_missing: "Ernährungsweise fehlt",
};

/** Schwere: "missing" = Angabe fehlt, "warning" = unbestätigt/unplausibel */
export const ISSUE_SEVERITY: Record<IssueCode, "missing" | "warning"> = {
  missing_arrival: "missing",
  missing_departure: "missing",
  invalid_range: "warning",
  outside_trip: "warning",
  stay_tentative: "warning",
  ski_unknown: "missing",
  ski_no_days: "missing",
  ski_no_category: "missing",
  ski_outside_stay: "warning",
  meal_unknown: "missing",
  meal_outside_stay: "warning",
  diet_missing: "missing",
};

export function findIssues(
  p: Pick<
    Participant,
    | "arrival_date"
    | "departure_date"
    | "stay_status"
    | "ski_need"
    | "ski_days"
    | "ski_category"
    | "meal_mode"
    | "meal_days"
    | "diet"
  >,
  trip: { start_date: ISODate; end_date: ISODate; ski_enabled?: boolean; ski_categories?: unknown[] }
): IssueCode[] {
  const issues: IssueCode[] = [];
  if (!p.arrival_date) issues.push("missing_arrival");
  if (!p.departure_date) issues.push("missing_departure");
  if (p.arrival_date && p.departure_date && p.arrival_date > p.departure_date) issues.push("invalid_range");
  if (
    (p.arrival_date && !isWithin(p.arrival_date, trip.start_date, trip.end_date)) ||
    (p.departure_date && !isWithin(p.departure_date, trip.start_date, trip.end_date))
  )
    issues.push("outside_trip");
  if (p.stay_status === "tentative") issues.push("stay_tentative");

  if (trip.ski_enabled !== false) {
    if (p.ski_need === "unknown") issues.push("ski_unknown");
    if (p.ski_need === "yes") {
      if (!p.ski_days.length) issues.push("ski_no_days");
      if (!p.ski_category && (trip.ski_categories?.length ?? 0) > 0) issues.push("ski_no_category");
      if (hasCompleteStay(p) && p.ski_days.some((d) => !isWithin(d, p.arrival_date!, p.departure_date!)))
        issues.push("ski_outside_stay");
    }
  }

  if (p.meal_mode === "unknown") issues.push("meal_unknown");
  if (p.meal_mode === "custom" && hasCompleteStay(p) && p.meal_days.some((d) => !isWithin(d, p.arrival_date!, p.departure_date!)))
    issues.push("meal_outside_stay");
  if (p.meal_mode !== "none" && p.meal_mode !== "unknown" && !p.diet) issues.push("diet_missing");
  return issues;
}

/** Eine Anmeldung ist vollständig, wenn keine "missing"-Angaben offen sind. */
export function isComplete(issues: IssueCode[]): boolean {
  return !issues.some((i) => ISSUE_SEVERITY[i] === "missing");
}

export interface SkiSummary {
  perDay: { day: ISODate; total: number; tentative: number; byCategory: Record<string, number> }[];
  byCategoryDays: Record<string, number>; // Personentage je Kategorie
  byCategoryPeople: Record<string, number>; // Personen je Kategorie
  totalPersonDays: number;
  people: number;
  unknownPeople: number;
  incompletePeople: number;
}

export const NO_CATEGORY = "__none__";

export function computeSkiSummary(
  participants: StatParticipant[],
  start: ISODate,
  end: ISODate
): SkiSummary {
  const active = participants.filter(isActive);
  const perDay = eachDay(start, end).map((day) => {
    const byCategory: Record<string, number> = {};
    let total = 0;
    let tentative = 0;
    for (const p of active) {
      if (!skisOn(p, day)) continue;
      total++;
      if (p.stay_status === "tentative") tentative++;
      const c = p.ski_category ?? NO_CATEGORY;
      byCategory[c] = (byCategory[c] ?? 0) + 1;
    }
    return { day, total, tentative, byCategory };
  });
  const byCategoryDays: Record<string, number> = {};
  const byCategoryPeople: Record<string, number> = {};
  let people = 0;
  let unknownPeople = 0;
  let incompletePeople = 0;
  for (const p of active) {
    if (p.ski_need === "unknown") unknownPeople++;
    if (p.ski_need !== "yes") continue;
    const days = (p.ski_days ?? []).filter((d) => isWithin(d, start, end));
    if (!days.length || !p.ski_category) incompletePeople++;
    if (!days.length) continue;
    people++;
    const c = p.ski_category ?? NO_CATEGORY;
    byCategoryPeople[c] = (byCategoryPeople[c] ?? 0) + 1;
    byCategoryDays[c] = (byCategoryDays[c] ?? 0) + days.length;
  }
  const totalPersonDays = perDay.reduce((n, d) => n + d.total, 0);
  return { perDay, byCategoryDays, byCategoryPeople, totalPersonDays, people, unknownPeople, incompletePeople };
}
