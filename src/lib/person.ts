/** Hilfsfunktionen für Personenangaben (Telefon, E-Mail, Geburtstag). */

export const PHONE_DEFAULT = "+49 ";

/** Telefonnummer vereinheitlichen: Leerzeichen/Trennzeichen entfernen, 0049 → +49, 0171 → +49171. */
export function normalizePhone(raw: string): string {
  let s = raw.replace(/[\s\-/().]/g, "");
  if (s.startsWith("00")) s = "+" + s.slice(2);
  else if (/^0\d/.test(s)) s = "+49" + s.slice(1);
  return s;
}

export function isValidPhone(raw: string): boolean {
  return /^\+\d{8,15}$/.test(normalizePhone(raw));
}

export function isValidEmail(raw: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(raw.trim());
}

/** "24.12.1995" oder "24.12.95"? Nur vierstellige Jahre werden akzeptiert. Liefert ISO-Datum oder null. */
export function parseGermanDate(raw: string): string | null {
  const m = raw.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

export function formatGermanDate(iso: string | null | undefined): string {
  if (!iso) return "";
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
}

/** Geburtsdatum plausibel? (nach 1900, nicht in der Zukunft) */
export function isPlausibleBirthDate(iso: string, today = new Date().toISOString().slice(0, 10)): boolean {
  return iso >= "1900-01-01" && iso <= today;
}
