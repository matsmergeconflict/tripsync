/**
 * Deterministische Einheitenlogik. Es werden nur physikalisch kompatible Einheiten
 * umgerechnet (Masse ↔ Masse, Volumen ↔ Volumen). Stück, Esslöffel, Packungen usw.
 * bleiben eigene Einheiten und werden niemals mit kg oder l verrechnet.
 */

export type Dimension = "mass" | "volume" | "other";

interface UnitDef {
  dimension: Dimension;
  factor: number; // in Basiseinheit (g bzw. ml)
  label: string;
}

const UNITS: Record<string, UnitDef> = {
  mg: { dimension: "mass", factor: 0.001, label: "mg" },
  g: { dimension: "mass", factor: 1, label: "g" },
  kg: { dimension: "mass", factor: 1000, label: "kg" },
  ml: { dimension: "volume", factor: 1, label: "ml" },
  cl: { dimension: "volume", factor: 10, label: "cl" },
  dl: { dimension: "volume", factor: 100, label: "dl" },
  l: { dimension: "volume", factor: 1000, label: "l" },
};

const ALIASES: Record<string, string> = {
  gramm: "g",
  gr: "g",
  kilo: "kg",
  kilogramm: "kg",
  milliliter: "ml",
  liter: "l",
  ltr: "l",
  stück: "Stk",
  stueck: "Stk",
  stk: "Stk",
  "stk.": "Stk",
  st: "Stk",
  "": "Stk",
  el: "EL",
  esslöffel: "EL",
  tl: "TL",
  teelöffel: "TL",
  prise: "Prise",
  prisen: "Prise",
  pck: "Pck",
  "pck.": "Pck",
  packung: "Pck",
  packungen: "Pck",
  dose: "Dose",
  dosen: "Dose",
  bund: "Bund",
  glas: "Glas",
  gläser: "Glas",
  becher: "Becher",
  flasche: "Flasche",
  flaschen: "Flasche",
  zehe: "Zehe",
  zehen: "Zehe",
  scheibe: "Scheibe",
  scheiben: "Scheibe",
};

export const COMMON_UNITS = ["g", "kg", "ml", "l", "Stk", "EL", "TL", "Prise", "Pck", "Dose", "Bund", "Glas", "Becher", "Flasche", "Zehe"];

/** Vereinheitlicht die Schreibweise einer Einheit (z. B. "Gramm" → "g", "" → "Stk"). */
export function normalizeUnit(raw: string | null | undefined): string {
  const u = (raw ?? "").trim();
  const lower = u.toLowerCase();
  if (UNITS[lower]) return UNITS[lower].label;
  if (lower in ALIASES) return ALIASES[lower];
  return u;
}

export function unitInfo(unit: string): { dimension: Dimension; factor: number; base: string } {
  const n = normalizeUnit(unit);
  const def = UNITS[n.toLowerCase()];
  if (def) return { dimension: def.dimension, factor: def.factor, base: def.dimension === "mass" ? "g" : "ml" };
  return { dimension: "other", factor: 1, base: n };
}

/** Schlüssel, unter dem Mengen addiert werden dürfen. */
export function unitKey(unit: string): string {
  const info = unitInfo(unit);
  return info.dimension === "other" ? `other:${info.base.toLowerCase()}` : info.dimension;
}

/** Rechnet eine Menge in die Basiseinheit (g, ml oder die Einheit selbst) um. */
export function toBase(quantity: number, unit: string): { value: number; base: string } {
  const info = unitInfo(unit);
  return { value: round6(quantity * info.factor), base: info.base };
}

/** Wählt eine gut lesbare Einheit für eine Menge in Basiseinheit. */
export function fromBase(value: number, base: string): { quantity: number; unit: string } {
  if (base === "g" && Math.abs(value) >= 1000) return { quantity: round6(value / 1000), unit: "kg" };
  if (base === "ml" && Math.abs(value) >= 1000) return { quantity: round6(value / 1000), unit: "l" };
  return { quantity: round6(value), unit: base };
}

export function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

/** Deutsche Zahlendarstellung mit max. 2 Nachkommastellen: 1.5 → "1,5" */
export function formatQuantity(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "";
  const r = Math.round(n * 100) / 100;
  return r.toLocaleString("de-DE", { maximumFractionDigits: 2 });
}

export function formatAmount(quantity: number | null, unit: string): string {
  if (quantity === null) return "nach Bedarf";
  return `${formatQuantity(quantity)} ${unit}`.trim();
}
