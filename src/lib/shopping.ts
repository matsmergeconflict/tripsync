import { displayName, normalizeName, resolveName } from "./ingredients";
import { fromBase, round6, toBase, unitInfo, unitKey } from "./units";
import type { Meal, Recipe } from "./types";
import type { ISODate } from "./dates";

export interface ShoppingSource {
  mealId: string;
  day: ISODate;
  dish: string;
  servings: number;
  originalName: string;
  quantity: number | null; // skaliert, in Originaleinheit
  unit: string;
}

export interface ShoppingLine {
  key: string; // stabil: kanonischer Name + Einheitendimension
  name: string;
  quantity: number | null; // null = nur "nach Bedarf"
  unit: string;
  category: string | null;
  sources: ShoppingSource[];
  /** gleiche Zutat existiert zusätzlich in nicht umrechenbarer Einheit */
  unitConflict: boolean;
  /** einige Quellen haben keine Mengenangabe */
  hasUnquantified: boolean;
}

export interface MealWithServings extends Pick<Meal, "id" | "day" | "dish" | "recipe_id"> {
  servings: number;
}

/**
 * Aggregiert alle Zutaten deterministisch.
 * Mengen werden mit servings / base_servings skaliert und nur innerhalb
 * derselben Dimension (Masse, Volumen, identische sonstige Einheit) addiert.
 */
export function aggregateShopping(
  meals: MealWithServings[],
  recipes: Pick<Recipe, "id" | "base_servings" | "ingredients">[],
  aliasMap: Map<string, string> = new Map()
): ShoppingLine[] {
  const recipeById = new Map(recipes.map((r) => [r.id, r]));
  const lines = new Map<string, ShoppingLine & { baseValue: number; base: string; nameCounts: Map<string, number> }>();

  const sortedMeals = [...meals].sort((a, b) => a.day.localeCompare(b.day) || a.id.localeCompare(b.id));
  for (const meal of sortedMeals) {
    if (!meal.recipe_id || !(meal.servings > 0)) continue;
    const recipe = recipeById.get(meal.recipe_id);
    if (!recipe || !(recipe.base_servings > 0)) continue;
    const factor = meal.servings / recipe.base_servings;

    for (const ing of recipe.ingredients) {
      if (!normalizeName(ing.name)) continue;
      const canonical = resolveName(ing.name, aliasMap);
      const key = `${canonical}|${unitKey(ing.unit)}`;
      const scaled = ing.quantity === null || ing.quantity === undefined ? null : round6(ing.quantity * factor);
      let line = lines.get(key);
      if (!line) {
        const info = unitInfo(ing.unit);
        line = {
          key,
          name: canonical,
          quantity: null,
          unit: info.base,
          category: ing.category || null,
          sources: [],
          unitConflict: false,
          hasUnquantified: false,
          baseValue: 0,
          base: info.base,
          nameCounts: new Map(),
        };
        lines.set(key, line);
      }
      if (!line.category && ing.category) line.category = ing.category;
      line.nameCounts.set(ing.name.trim(), (line.nameCounts.get(ing.name.trim()) ?? 0) + 1);
      if (scaled === null) line.hasUnquantified = true;
      else line.baseValue = round6(line.baseValue + toBase(scaled, ing.unit).value);
      line.sources.push({
        mealId: meal.id,
        day: meal.day,
        dish: meal.dish,
        servings: meal.servings,
        originalName: ing.name,
        quantity: scaled,
        unit: ing.unit,
      });
    }
  }

  const result: ShoppingLine[] = [];
  const byName = new Map<string, number>();
  for (const l of lines.values()) byName.set(l.name, (byName.get(l.name) ?? 0) + 1);

  for (const l of lines.values()) {
    const hasQuantity = l.sources.some((s) => s.quantity !== null);
    const display = hasQuantity ? fromBase(l.baseValue, l.base) : { quantity: null, unit: l.base };
    // Anzeigename: kanonischer Name in schöner Schreibweise (häufigste Originalschreibweise, falls identisch normalisiert)
    let label = displayName(l.name);
    for (const [orig] of [...l.nameCounts.entries()].sort((a, b) => b[1] - a[1])) {
      if (normalizeName(orig) === l.name) {
        label = displayName(orig);
        break;
      }
    }
    result.push({
      key: l.key,
      name: label,
      quantity: display.quantity,
      unit: display.unit,
      category: l.category,
      sources: l.sources,
      unitConflict: (byName.get(l.name) ?? 0) > 1,
      hasUnquantified: l.hasUnquantified,
    });
  }
  return result.sort((a, b) => (a.category ?? "~").localeCompare(b.category ?? "~") || a.name.localeCompare(b.name));
}
