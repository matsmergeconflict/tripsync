/**
 * Vereinheitlichung von Zutatennamen.
 *
 * 1. `normalizeName` ist eine rein formale, sichere Normalisierung (Groß-/Kleinschreibung,
 *    Leerzeichen, Satzzeichen am Rand). Sie wird immer angewendet.
 * 2. `suggestMerges` erkennt mögliche Synonyme heuristisch (z. B. "Kartoffeln",
 *    "Kartoffel, festkochend"). Diese Vorschläge werden NIE automatisch übernommen –
 *    ein Organisator muss sie bestätigen. Bestätigte Zuordnungen werden als Alias gespeichert.
 * 3. Die Mengenberechnung bleibt vollständig deterministisch (siehe shopping.ts).
 */

export function normalizeName(name: string): string {
  return name
    .normalize("NFC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/^[\s,.;:-]+|[\s,.;:-]+$/g, "")
    .trim();
}

/** Anzeigeform: erster Buchstabe groß. */
export function displayName(name: string): string {
  const n = name.trim().replace(/\s+/g, " ");
  return n.charAt(0).toUpperCase() + n.slice(1);
}

/** Löst einen Namen über bestätigte Aliase auf den kanonischen Namen auf. */
export function resolveName(name: string, aliases: Map<string, string>): string {
  const n = normalizeName(name);
  let current = n;
  const seen = new Set<string>();
  while (aliases.has(current) && !seen.has(current)) {
    seen.add(current);
    current = normalizeName(aliases.get(current)!);
  }
  return current;
}

function stem(token: string): string {
  let t = token;
  // einfache deutsche Plural-/Flexionsendungen
  for (const suf of ["innen", "en", "er", "es", "e", "n", "s"]) {
    if (t.length - suf.length >= 4 && t.endsWith(suf)) {
      t = t.slice(0, -suf.length);
      break;
    }
  }
  return t;
}

export function tokens(name: string): string[] {
  return normalizeName(name)
    .replace(/[(),;/]+/g, " ")
    .split(" ")
    .map((t) => t.replace(/[^\p{L}\p{N}-]/gu, ""))
    .filter((t) => t.length > 1)
    .map(stem);
}

export interface MergeSuggestion {
  canonical: string; // vorgeschlagener Zielname
  variants: string[]; // Namen, die darauf zusammengeführt würden
  confidence: "high" | "medium";
  reason: string;
}

/**
 * Schlägt Zusammenführungen vor.
 * - high: gleiche Wortstämme, nur Reihenfolge/Plural/Satzzeichen unterscheiden sich
 * - medium: ein Name ist eine nähere Bestimmung eines anderen (z. B. "festkochende Kartoffeln" ⊃ "Kartoffeln")
 */
export function suggestMerges(names: string[]): MergeSuggestion[] {
  const unique = [...new Set(names.map(normalizeName).filter(Boolean))];
  const keyOf = (n: string) => [...new Set(tokens(n))].sort().join(" ");
  const groups = new Map<string, string[]>();
  for (const n of unique) {
    const k = keyOf(n);
    if (!k) continue;
    groups.set(k, [...(groups.get(k) ?? []), n]);
  }
  const suggestions: MergeSuggestion[] = [];
  const pick = (list: string[]) => [...list].sort((a, b) => a.length - b.length || a.localeCompare(b))[0];

  for (const [, list] of groups) {
    if (list.length > 1) {
      const canonical = pick(list);
      suggestions.push({
        canonical,
        variants: list.filter((n) => n !== canonical),
        confidence: "high",
        reason: "Gleiche Wörter, nur Schreibweise, Plural oder Reihenfolge unterscheiden sich",
      });
    }
  }

  // Teilmengen-Beziehungen zwischen Gruppen (Repräsentanten)
  const reps = [...groups.entries()].map(([k, list]) => ({ set: new Set(k.split(" ")), name: pick(list), all: list }));
  for (const general of reps) {
    if (general.set.size !== 1) continue; // nur einfache Grundbegriffe als Ziel
    const specific = reps.filter(
      (r) => r !== general && r.set.size > general.set.size && [...general.set].every((t) => r.set.has(t))
    );
    if (specific.length) {
      suggestions.push({
        canonical: general.name,
        variants: specific.flatMap((s) => s.all),
        confidence: "medium",
        reason: "Nähere Bestimmung desselben Grundprodukts – bitte prüfen, ob die Sorte wichtig ist",
      });
    }
  }
  return suggestions;
}
