import { computeDayStats, type DayStats } from "./stats";
import { aggregateShopping, type ShoppingLine } from "./shopping";
import type { Meal, Participant, Recipe, ShoppingManualItem, Trip } from "./types";
import { normalizeName } from "./ingredients";

export interface MealServings {
  derived: number; // aus Teilnehmerangaben berechnet
  unknown: number; // anwesend, aber Essensteilnahme unklar
  effective: number; // manuelle Korrektur oder abgeleiteter Wert
  overridden: boolean;
}

export function mealServings(meal: Pick<Meal, "day" | "servings_override">, dayStats: Map<string, DayStats>): MealServings {
  const s = dayStats.get(meal.day);
  const derived = s?.mealParticipants ?? 0;
  const overridden = meal.servings_override !== null && meal.servings_override !== undefined;
  return { derived, unknown: s?.mealUnknown ?? 0, effective: overridden ? meal.servings_override! : derived, overridden };
}

export interface TripData {
  trip: Pick<Trip, "start_date" | "end_date">;
  participants: Participant[];
  meals: Meal[];
  recipes: Recipe[];
  aliases: { alias: string; canonical: string }[];
  shopping: { items: ShoppingManualItem[]; state: { item_key: string; checked: boolean; team: string | null }[] };
}

export interface ShoppingRow extends ShoppingLine {
  manual: boolean;
  id?: string;
  checked: boolean;
  team: string | null;
}

export function buildShoppingList(data: TripData, dayStats?: DayStats[]): ShoppingRow[] {
  const stats = dayStats ?? computeDayStats(data.participants, data.trip.start_date, data.trip.end_date);
  const statMap = new Map(stats.map((s) => [s.day, s]));
  const aliasMap = new Map(data.aliases.map((a) => [normalizeName(a.alias), normalizeName(a.canonical)]));
  const meals = data.meals.map((m) => ({ id: m.id, day: m.day, dish: m.dish, recipe_id: m.recipe_id, servings: mealServings(m, statMap).effective }));
  const state = new Map(data.shopping.state.map((s) => [s.item_key, s]));
  const auto: ShoppingRow[] = aggregateShopping(meals, data.recipes, aliasMap).map((l) => ({
    ...l,
    manual: false,
    checked: state.get(l.key)?.checked ?? false,
    team: state.get(l.key)?.team ?? null,
  }));
  const manual: ShoppingRow[] = data.shopping.items.map((i) => ({
    key: `manual:${i.id}`,
    id: i.id,
    name: i.name,
    quantity: i.quantity,
    unit: i.unit,
    category: i.category,
    sources: [],
    unitConflict: false,
    hasUnquantified: i.quantity === null,
    manual: true,
    checked: i.checked,
    team: i.team,
  }));
  return [...auto, ...manual];
}
