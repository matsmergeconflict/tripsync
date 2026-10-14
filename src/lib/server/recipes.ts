import "server-only";
import type { Db } from "./db";
import { normalizeUnit } from "../units";

export async function writeIngredients(
  db: Db,
  recipeId: string,
  ingredients: { name: string; quantity: number | null; unit: string; category: string | null; note: string | null }[]
): Promise<void> {
  await db.query(`DELETE FROM recipe_ingredients WHERE recipe_id = $1`, [recipeId]);
  for (const [i, ing] of ingredients.entries()) {
    await db.query(
      `INSERT INTO recipe_ingredients (recipe_id, position, name, quantity, unit, category, note) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [recipeId, i, ing.name, ing.quantity, normalizeUnit(ing.unit), ing.category, ing.note]
    );
  }
}
