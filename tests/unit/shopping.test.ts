import { describe, expect, it } from "vitest";
import { aggregateShopping } from "@/lib/shopping";
import { normalizeUnit, toBase, fromBase, unitKey, formatQuantity } from "@/lib/units";
import { normalizeName, resolveName, suggestMerges } from "@/lib/ingredients";
import type { Recipe } from "@/lib/types";

function recipe(id: string, base: number, ings: [string, number | null, string, string?][]): Recipe {
  return {
    id,
    trip_id: "t",
    name: id,
    base_servings: base,
    notes: null,
    version: 1,
    ingredients: ings.map(([name, quantity, unit, category], i) => ({
      id: `${id}-${i}`,
      name,
      quantity,
      unit,
      category: category ?? null,
      note: null,
    })),
  };
}

describe("Einheiten", () => {
  it("normalisiert Schreibweisen", () => {
    expect(normalizeUnit("Gramm")).toBe("g");
    expect(normalizeUnit("KG")).toBe("kg");
    expect(normalizeUnit("Liter")).toBe("l");
    expect(normalizeUnit("")).toBe("Stk");
    expect(normalizeUnit("Stück")).toBe("Stk");
  });
  it("rechnet nur kompatible Einheiten um", () => {
    expect(toBase(1.5, "kg")).toEqual({ value: 1500, base: "g" });
    expect(fromBase(1500, "g")).toEqual({ quantity: 1.5, unit: "kg" });
    expect(fromBase(1500, "ml")).toEqual({ quantity: 1.5, unit: "l" });
    expect(unitKey("kg")).toBe(unitKey("g"));
    expect(unitKey("Stk")).not.toBe(unitKey("kg"));
    expect(unitKey("EL")).not.toBe(unitKey("ml"));
  });
  it("formatiert deutsch", () => {
    expect(formatQuantity(1.5)).toBe("1,5");
    expect(formatQuantity(2)).toBe("2");
    expect(formatQuantity(0.3333333)).toBe("0,33");
  });
});

describe("Einkaufsliste", () => {
  it("addiert gleiche Zutaten über Gerichte (Beispiel aus der Spezifikation)", () => {
    const lines = aggregateShopping(
      [
        { id: "m1", day: "2027-01-16", dish: "A", recipe_id: "a", servings: 4 },
        { id: "m2", day: "2027-01-17", dish: "B", recipe_id: "b", servings: 4 },
      ],
      [recipe("a", 4, [["Kartoffeln", 2, "kg"]]), recipe("b", 4, [["Kartoffeln", 3, "kg"]])]
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ name: "Kartoffeln", quantity: 5, unit: "kg" });
    expect(lines[0].sources).toHaveLength(2);
  });

  it("rechnet 500 g + 1 kg = 1,5 kg und 1 l + 500 ml = 1,5 l", () => {
    const lines = aggregateShopping(
      [{ id: "m1", day: "2027-01-16", dish: "A", recipe_id: "a", servings: 2 }],
      [recipe("a", 2, [["Mehl", 500, "g"], ["mehl", 1, "kg"], ["Milch", 1, "l"], ["Milch", 500, "ml"]])]
    );
    expect(lines.find((l) => l.name === "Mehl")).toMatchObject({ quantity: 1.5, unit: "kg" });
    expect(lines.find((l) => l.name === "Milch")).toMatchObject({ quantity: 1.5, unit: "l" });
  });

  it("skaliert mit Portionen", () => {
    const lines = aggregateShopping(
      [{ id: "m1", day: "2027-01-16", dish: "A", recipe_id: "a", servings: 15 }],
      [recipe("a", 4, [["Nudeln", 400, "g"], ["Eier", 2, "Stk"]])]
    );
    expect(lines.find((l) => l.name === "Nudeln")).toMatchObject({ quantity: 1.5, unit: "kg" });
    expect(lines.find((l) => l.name === "Eier")).toMatchObject({ quantity: 7.5, unit: "Stk" });
  });

  it("addiert unverträgliche Einheiten nicht", () => {
    const lines = aggregateShopping(
      [{ id: "m1", day: "2027-01-16", dish: "A", recipe_id: "a", servings: 4 }],
      [recipe("a", 4, [["Zwiebeln", 3, "Stk"], ["Zwiebeln", 500, "g"]])]
    );
    expect(lines).toHaveLength(2);
    expect(lines.every((l) => l.unitConflict)).toBe(true);
  });

  it("nutzt nur bestätigte Aliase zur Zusammenführung", () => {
    const meals = [{ id: "m1", day: "2027-01-16", dish: "A", recipe_id: "a", servings: 4 }];
    const recipes = [recipe("a", 4, [["Kartoffeln", 2, "kg"], ["festkochende Kartoffeln", 1, "kg"]])];
    expect(aggregateShopping(meals, recipes)).toHaveLength(2);
    const merged = aggregateShopping(meals, recipes, new Map([["festkochende kartoffeln", "kartoffeln"]]));
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ quantity: 3, unit: "kg" });
  });

  it("übergeht Mahlzeiten ohne Rezept oder ohne Portionen und kennzeichnet 'nach Bedarf'", () => {
    const lines = aggregateShopping(
      [
        { id: "m1", day: "2027-01-16", dish: "A", recipe_id: "a", servings: 0 },
        { id: "m2", day: "2027-01-16", dish: "B", recipe_id: null, servings: 5 },
        { id: "m3", day: "2027-01-17", dish: "C", recipe_id: "c", servings: 5 },
      ],
      [recipe("a", 4, [["Reis", 1, "kg"]]), recipe("c", 5, [["Salz", null, "Prise"]])]
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ name: "Salz", quantity: null, hasUnquantified: true });
  });

  it("ist deterministisch bei unterschiedlicher Eingabereihenfolge", () => {
    const meals = [
      { id: "m1", day: "2027-01-16", dish: "A", recipe_id: "a", servings: 3 },
      { id: "m2", day: "2027-01-17", dish: "B", recipe_id: "b", servings: 7 },
    ];
    const recipes = [recipe("a", 4, [["Butter", 250, "g"]]), recipe("b", 2, [["Butter", 0.1, "kg"]])];
    expect(aggregateShopping(meals, recipes)).toEqual(aggregateShopping([...meals].reverse(), [...recipes].reverse()));
    expect(aggregateShopping(meals, recipes)[0]).toMatchObject({ quantity: 537.5, unit: "g" });
  });
});

describe("Zutaten-Vereinheitlichung", () => {
  it("normalisiert formal", () => {
    expect(normalizeName("  Kartoffeln,  ")).toBe("kartoffeln");
  });
  it("löst Alias-Ketten auf und ist zyklensicher", () => {
    expect(resolveName("A", new Map([["a", "b"], ["b", "c"]]))).toBe("c");
    expect(resolveName("A", new Map([["a", "b"], ["b", "a"]]))).toBeDefined();
  });
  it("schlägt Zusammenführungen vor, ohne sie anzuwenden", () => {
    const s = suggestMerges(["Kartoffeln", "festkochende Kartoffeln", "Kartoffel, festkochend", "Milch"]);
    const high = s.find((x) => x.confidence === "high");
    expect(high?.variants.length).toBe(1);
    expect([high!.canonical, ...high!.variants].sort()).toEqual(["festkochende kartoffeln", "kartoffel, festkochend"].sort());
    const medium = s.find((x) => x.confidence === "medium");
    expect(medium?.canonical).toBe("kartoffeln");
    expect(medium?.variants).toHaveLength(2);
    expect(s.some((x) => x.canonical === "milch" || x.variants.includes("milch"))).toBe(false);
  });
});
