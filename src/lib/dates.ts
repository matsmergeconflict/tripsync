/**
 * Datumslogik von TripSync.
 *
 * Semantik (siehe docs/DECISIONS.md):
 * - Alle Reisetage werden als Kalenderdatum "YYYY-MM-DD" ohne Uhrzeit/Zeitzone gespeichert
 *   (Postgres-Typ `date`). Es gibt dadurch keine Zeitzonenverschiebungen.
 * - Anreisetag und Abreisetag zählen beide als Anwesenheitstage (inklusive Intervall).
 * - Eine Übernachtung gilt für jeden Tag d mit arrival <= d < departure.
 * - Uhrzeiten (Ankunft/Abfahrt) sind rein informativ und verändern die Tageszählung nicht.
 */

export type ISODate = string; // YYYY-MM-DD

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isISODate(value: unknown): value is ISODate {
  if (typeof value !== "string" || !ISO_RE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function toUTC(date: ISODate): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUTC(ms: number): ISODate {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(date: ISODate, days: number): ISODate {
  return fromUTC(toUTC(date) + days * 86_400_000);
}

/** Anzahl Tage von a nach b (b - a). */
export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((toUTC(b) - toUTC(a)) / 86_400_000);
}

/** Alle Tage von start bis end inklusive. Leere Liste, wenn end < start. */
export function eachDay(start: ISODate, end: ISODate): ISODate[] {
  const n = diffDays(start, end);
  if (n < 0) return [];
  return Array.from({ length: n + 1 }, (_, i) => addDays(start, i));
}

export function isWithin(day: ISODate, start: ISODate, end: ISODate): boolean {
  return day >= start && day <= end; // ISO-Strings sind lexikografisch sortierbar
}

/** 0 = Montag … 6 = Sonntag */
export function weekdayIndex(date: ISODate): number {
  return (new Date(toUTC(date)).getUTCDay() + 6) % 7;
}

const WD_SHORT = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const WD_LONG = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];
const MONTHS = ["Jan.", "Feb.", "März", "Apr.", "Mai", "Juni", "Juli", "Aug.", "Sep.", "Okt.", "Nov.", "Dez."];

export function weekdayShort(date: ISODate): string {
  return WD_SHORT[weekdayIndex(date)];
}

export function dayOfMonth(date: ISODate): number {
  return Number(date.slice(8, 10));
}

/** z. B. "Sa 16.01." */
export function formatShort(date: ISODate | null | undefined): string {
  if (!date) return "–";
  return `${weekdayShort(date)} ${date.slice(8, 10)}.${date.slice(5, 7)}.`;
}

/** z. B. "Samstag, 16. Jan. 2027" */
export function formatLong(date: ISODate | null | undefined): string {
  if (!date) return "–";
  const m = Number(date.slice(5, 7)) - 1;
  return `${WD_LONG[weekdayIndex(date)]}, ${dayOfMonth(date)}. ${MONTHS[m]} ${date.slice(0, 4)}`;
}

/** ISO-Kalenderwoche */
export function isoWeek(date: ISODate): number {
  const t = new Date(toUTC(date));
  const day = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - day + 3);
  // t ist jetzt der Donnerstag dieser Woche; dessen Jahr bestimmt das Wochenjahr
  const jan1 = Date.UTC(t.getUTCFullYear(), 0, 1);
  return 1 + Math.floor((t.getTime() - jan1) / 604_800_000);
}

/** Gruppiert Tage in Kalenderwochen-Abschnitte (Mo–So). */
export function groupByWeek(days: ISODate[]): { week: number; days: ISODate[] }[] {
  const groups: { week: number; days: ISODate[] }[] = [];
  for (const d of days) {
    const w = isoWeek(d);
    const last = groups[groups.length - 1];
    if (last && last.week === w && diffDays(last.days[last.days.length - 1], d) === 1) last.days.push(d);
    else groups.push({ week: w, days: [d] });
  }
  return groups;
}

export function formatTime(t: string | null | undefined): string {
  if (!t) return "";
  return t.slice(0, 5);
}
