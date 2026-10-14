"use client";

import { useState } from "react";
import { useTrip } from "../TripContext";
import { Badge, Button, Empty, Field, Input, Notice, Segmented, Select, Sheet, Textarea, cx } from "@/components/ui";
import { api, ApiError } from "@/lib/client/api";
import { formatLong, formatShort, weekdayIndex } from "@/lib/dates";
import { mealServings } from "@/lib/plan";
import { COMMON_UNITS, formatAmount, formatQuantity } from "@/lib/units";
import { DIET_LABELS, MEAL_TYPE_LABELS, MEAL_TYPE_ORDER, type Diet, type Meal, type MealType, type Recipe } from "@/lib/types";

export const CATEGORIES = ["Obst & Gemüse", "Brot & Backwaren", "Milchprodukte & Eier", "Fleisch & Fisch", "Trockenwaren & Konserven", "Gewürze & Öle", "Tiefkühl", "Getränke", "Haushalt", "Sonstiges"];

export function MealsView() {
  const [tab, setTab] = useState<"plan" | "recipes">("plan");
  const { tripId } = useTrip();
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Essensplanung</h1>
          <p className="text-sm text-muted">Portionen werden aus den Anmeldungen berechnet und können manuell korrigiert werden.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Segmented
            label="Bereich"
            value={tab}
            onChange={setTab}
            options={[
              { value: "plan", label: "Mahlzeiten" },
              { value: "recipes", label: "Rezepte" },
            ]}
          />
          <a href={`/api/trips/${tripId}/export?type=meals`} download>
            <Button>Plan exportieren</Button>
          </a>
          <a href={`/api/trips/${tripId}/export?type=kitchen`} download title="Enthält vertrauliche Gesundheitsangaben">
            <Button>Küchenliste (vertraulich)</Button>
          </a>
        </div>
      </div>
      {tab === "plan" ? <MealPlan /> : <Recipes />}
    </>
  );
}

function MealPlan() {
  const { data, days, stats, active } = useTrip();
  const [editing, setEditing] = useState<Partial<Meal> | null>(null);
  const statMap = new Map(stats.map((s) => [s.day, s]));
  const allergyCount = active.filter((p) => p.allergies && p.meal_mode !== "none").length;

  return (
    <>
      {allergyCount > 0 && (
        <Notice tone="warn">
          {allergyCount} Person{allergyCount > 1 ? "en haben" : " hat"} Allergien oder Unverträglichkeiten angegeben – siehe Küchenliste oder die jeweilige Anmeldung.
        </Notice>
      )}
      <div className="flex flex-col gap-4" data-testid="meal-plan">
        {days.map((d) => {
          const s = statMap.get(d)!;
          const meals = data.meals.filter((m) => m.day === d);
          return (
            <section key={d} className={cx("rounded-xl border border-line bg-surface", weekdayIndex(d) >= 5 && "border-pine-100")}>
              <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
                <div>
                  <h2 className="font-semibold">{formatLong(d)}</h2>
                  <p className="text-xs text-muted">
                    {s.mealParticipants} essen mit
                    {s.mealUnknown > 0 && <span className="text-amber-ink"> · {s.mealUnknown} unklar</span>}
                    {Object.entries(s.dietCounts)
                      .filter(([k]) => k !== "omnivore")
                      .map(([k, n]) => ` · ${n} ${k === "unknown" ? "ohne Angabe" : DIET_LABELS[k as Diet].toLowerCase()}`)
                      .join("")}
                  </p>
                </div>
                <Button size="sm" onClick={() => setEditing({ day: d, meal_type: nextType(meals), dish: "" })}>
                  + Mahlzeit
                </Button>
              </header>
              {meals.length === 0 ? (
                <p className="px-4 py-3 text-sm text-faint">Noch nichts geplant.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {meals.map((m) => {
                    const sv = mealServings(m, statMap);
                    const recipe = data.recipes.find((r) => r.id === m.recipe_id);
                    return (
                      <li key={m.id}>
                        <button type="button" onClick={() => setEditing(m)} className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left hover:bg-sunken" data-testid="meal-row">
                          <span className="w-28 shrink-0 text-xs font-medium uppercase tracking-wide text-muted">{MEAL_TYPE_LABELS[m.meal_type]}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block font-medium">{m.dish}</span>
                            <span className="block text-xs text-muted">
                              {recipe ? `Rezept: ${recipe.name}` : "ohne Rezept"}
                              {m.kitchen_team && ` · Küche: ${m.kitchen_team}`}
                              {m.note && ` · ${m.note}`}
                            </span>
                          </span>
                          <span className="text-right">
                            <span className="block text-lg font-semibold tabular-nums" data-testid="meal-servings">
                              {sv.effective}
                            </span>
                            <span className="block text-[11px] text-muted">{sv.overridden ? `manuell (berechnet ${sv.derived})` : portions(sv.effective)}</span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </div>
      {editing && <MealSheet meal={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function nextType(meals: Meal[]): MealType {
  return MEAL_TYPE_ORDER.find((t) => !meals.some((m) => m.meal_type === t)) ?? "snack";
}

function MealSheet({ meal, onClose }: { meal: Partial<Meal>; onClose: () => void }) {
  const { data, tripId, days, stats, reload, toast } = useTrip();
  const [f, setF] = useState({
    day: meal.day ?? days[0],
    meal_type: (meal.meal_type ?? "dinner") as MealType,
    dish: meal.dish ?? "",
    recipe_id: meal.recipe_id ?? "",
    override: meal.servings_override !== null && meal.servings_override !== undefined,
    servings_override: meal.servings_override ?? 0,
    kitchen_team: meal.kitchen_team ?? "",
    note: meal.note ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const statMap = new Map(stats.map((s) => [s.day, s]));
  const derived = mealServings({ day: f.day, servings_override: null }, statMap);
  const recipe = data.recipes.find((r) => r.id === f.recipe_id);
  const effective = f.override ? f.servings_override : derived.effective;

  const save = async () => {
    setBusy(true);
    setErrors({});
    const body = {
      day: f.day,
      meal_type: f.meal_type,
      dish: f.dish || recipe?.name || "",
      recipe_id: f.recipe_id || null,
      servings_override: f.override ? Number(f.servings_override) : null,
      kitchen_team: f.kitchen_team || null,
      note: f.note || null,
    };
    try {
      if (meal.id) await api(`/api/trips/${tripId}/meals/${meal.id}`, { method: "PATCH", body: { ...body, version: meal.version } });
      else await api(`/api/trips/${tripId}/meals`, { body });
      toast("Gespeichert");
      await reload();
      onClose();
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.status === 409) {
          await reload();
          setErrors({ _: "Diese Mahlzeit wurde gerade von jemand anderem geändert. Bitte schließen und erneut öffnen." });
        } else setErrors({ ...e.fields, _: e.message });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open onClose={onClose} title={meal.id ? "Mahlzeit bearbeiten" : "Mahlzeit planen"}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tag" error={errors.day}>
            {(p) => (
              <Select {...p} value={f.day} onChange={(e) => setF({ ...f, day: e.target.value })}>
                {days.map((d) => (
                  <option key={d} value={d}>
                    {formatShort(d)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Mahlzeit">
            {(p) => (
              <Select {...p} value={f.meal_type} onChange={(e) => setF({ ...f, meal_type: e.target.value as MealType })}>
                {MEAL_TYPE_ORDER.map((t) => (
                  <option key={t} value={t}>
                    {MEAL_TYPE_LABELS[t]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <Field label="Rezept" optional hint="Mit Rezept fließen die Zutaten automatisch in die Einkaufsliste.">
          {(p) => (
            <Select {...p} value={f.recipe_id} onChange={(e) => setF({ ...f, recipe_id: e.target.value, dish: f.dish || data.recipes.find((r) => r.id === e.target.value)?.name || "" })}>
              <option value="">– kein Rezept –</option>
              {data.recipes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Gericht" error={errors.dish}>
          {(p) => <Input {...p} value={f.dish} placeholder={recipe?.name ?? "z. B. Kässpätzle"} onChange={(e) => setF({ ...f, dish: e.target.value })} maxLength={120} />}
        </Field>
        <div className="rounded-xl border border-line p-3">
          <div className="text-sm">
            Berechnet: <strong className="tabular-nums">{derived.derived}</strong> {portions(derived.derived)}{" "}
            <span className="text-muted">({derived.derived === 1 ? "1 Person isst" : `${derived.derived} Personen essen`} an diesem Tag laut Anmeldungen mit)</span>
            {derived.unknown > 0 && <div className="text-xs text-amber-ink">{derived.unknown} anwesende Personen haben noch keine Angabe zum Essen gemacht.</div>}
          </div>
          <label className="mt-3 flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" className="size-5 accent-pine-600" checked={f.override} onChange={(e) => setF({ ...f, override: e.target.checked, servings_override: f.servings_override || derived.derived })} />
            Portionen manuell festlegen
          </label>
          {f.override && (
            <Field label="Portionen" error={errors.servings_override}>
              {(p) => <Input {...p} type="number" inputMode="numeric" min={0} max={10000} value={f.servings_override} onChange={(e) => setF({ ...f, servings_override: Number(e.target.value) })} />}
            </Field>
          )}
        </div>
        {recipe && (
          <details className="rounded-xl border border-line p-3 text-sm">
            <summary className="cursor-pointer font-medium">
              Zutaten für {effective} {portions(effective)}
            </summary>
            <p className="mt-1 text-xs text-muted">
              Das Rezept ist für {formatQuantity(recipe.base_servings)} {portions(recipe.base_servings)} angelegt. Die Mengen werden auf {effective} {portions(effective)} umgerechnet.
            </p>
            <ul className="mt-2 flex flex-col gap-1">
              {recipe.ingredients.map((i) => (
                <li key={i.id} className="flex justify-between gap-3">
                  <span>{i.name}</span>
                  <span className="text-right tabular-nums">
                    {formatAmount(i.quantity === null ? null : (i.quantity * effective) / recipe.base_servings, i.unit)}
                    {i.quantity !== null && (
                      <span className="block text-[11px] text-muted">
                        Rezept: {formatAmount(i.quantity, i.unit)} für {formatQuantity(recipe.base_servings)}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}
        <Field label="Küchenteam" optional>
          {(p) => <Input {...p} value={f.kitchen_team} placeholder="z. B. Anna & Max" onChange={(e) => setF({ ...f, kitchen_team: e.target.value })} maxLength={120} />}
        </Field>
        <Field label="Notiz" optional>
          {(p) => <Textarea {...p} rows={2} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} maxLength={1000} />}
        </Field>
        {errors._ && <p className="text-sm font-medium text-danger">{errors._}</p>}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="primary" loading={busy}>
            Speichern
          </Button>
          {meal.id && (
            <Button
              type="button"
              variant="danger"
              onClick={async () => {
                if (!confirm("Mahlzeit löschen?")) return;
                try {
                  await api(`/api/trips/${tripId}/meals/${meal.id}`, { method: "DELETE" });
                  toast("Gelöscht");
                  await reload();
                  onClose();
                } catch (e) {
                  toast(e instanceof ApiError ? e.message : "Fehler", "error");
                }
              }}
            >
              Löschen
            </Button>
          )}
        </div>
      </form>
    </Sheet>
  );
}

function Recipes() {
  const { data } = useTrip();
  const [editing, setEditing] = useState<Partial<Recipe> | null>(null);
  return (
    <>
      <div>
        <Button variant="primary" onClick={() => setEditing({ name: "", base_servings: 4, ingredients: [] })}>
          + Rezept anlegen
        </Button>
      </div>
      {data.recipes.length === 0 ? (
        <Empty title="Noch keine Rezepte">Lege Rezepte mit Zutaten an und verknüpfe sie mit Mahlzeiten – die Einkaufsliste rechnet die Mengen automatisch hoch.</Empty>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {data.recipes.map((r) => {
            const used = data.meals.filter((m) => m.recipe_id === r.id).length;
            return (
              <button key={r.id} type="button" onClick={() => setEditing(r)} className="flex flex-col gap-1 rounded-xl border border-line bg-surface p-4 text-left hover:border-pine-200">
                <span className="font-semibold">{r.name}</span>
                <span className="text-sm text-muted">
                  für {formatQuantity(r.base_servings)} {portions(r.base_servings)} · {r.ingredients.length} {r.ingredients.length === 1 ? "Zutat" : "Zutaten"}
                </span>
                <span>{used ? <Badge tone="ok">{used}× eingeplant</Badge> : <Badge>nicht eingeplant</Badge>}</span>
              </button>
            );
          })}
        </div>
      )}
      {editing && <RecipeSheet recipe={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

interface IngRow {
  key: number;
  name: string;
  quantity: string;
  unit: string;
  category: string;
  note: string;
}

function RecipeSheet({ recipe, onClose }: { recipe: Partial<Recipe>; onClose: () => void }) {
  const { tripId, reload, toast } = useTrip();
  const [name, setName] = useState(recipe.name ?? "");
  const [servings, setServings] = useState(String(recipe.base_servings ?? 4));
  const [notes, setNotes] = useState(recipe.notes ?? "");
  const [rows, setRows] = useState<IngRow[]>(
    (recipe.ingredients ?? []).map((i, k) => ({ key: k, name: i.name, quantity: i.quantity === null ? "" : String(i.quantity).replace(".", ","), unit: i.unit, category: i.category ?? "", note: i.note ?? "" }))
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const add = () => setRows((r) => [...r, { key: Date.now(), name: "", quantity: "", unit: "", category: "", note: "" }]);
  const upd = (key: number, patch: Partial<IngRow>) => setRows((r) => r.map((x) => (x.key === key ? { ...x, ...patch } : x)));

  const parseQty = (s: string): number | null | "invalid" => {
    const t = s.trim().replace(",", ".");
    if (!t) return null;
    const n = Number(t);
    return Number.isFinite(n) && n >= 0 ? n : "invalid";
  };

  const save = async () => {
    const ingredients = rows.filter((r) => r.name.trim());
    const bad = ingredients.find((r) => parseQty(r.quantity) === "invalid");
    if (bad) return setErrors({ _: `Ungültige Menge bei „${bad.name}“.` });
    const base = Number(servings.replace(",", "."));
    if (!(base > 0)) return setErrors({ base_servings: "Bitte eine Portionszahl größer 0 angeben." });
    setBusy(true);
    setErrors({});
    const body = {
      name,
      base_servings: base,
      notes: notes || null,
      ingredients: ingredients.map((r) => ({ name: r.name.trim(), quantity: parseQty(r.quantity) as number | null, unit: r.unit, category: r.category || null, note: r.note || null })),
    };
    try {
      if (recipe.id) await api(`/api/trips/${tripId}/recipes/${recipe.id}`, { method: "PATCH", body: { ...body, version: recipe.version } });
      else await api(`/api/trips/${tripId}/recipes`, { body });
      toast("Rezept gespeichert");
      await reload();
      onClose();
    } catch (e) {
      if (e instanceof ApiError) setErrors({ ...e.fields, _: e.status === 409 ? "Das Rezept wurde gerade von jemand anderem geändert. Bitte schließen und neu öffnen." : e.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open onClose={onClose} title={recipe.id ? "Rezept bearbeiten" : "Neues Rezept"} wide>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
          <Field label="Name" error={errors.name}>
            {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />}
          </Field>
          <Field label="Für wie viele Portionen?" hint="Die Zutatenmengen unten gelten für diese Anzahl." error={errors.base_servings}>
            {(p) => <Input {...p} inputMode="decimal" value={servings} onChange={(e) => setServings(e.target.value)} />}
          </Field>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Zutaten</span>
          <datalist id="units">
            {COMMON_UNITS.map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>
          <datalist id="categories">
            {CATEGORIES.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          {rows.length === 0 && <p className="text-sm text-muted">Noch keine Zutaten.</p>}
          <ul className="flex flex-col gap-3">
            {rows.map((r) => (
              <li key={r.key} className="grid grid-cols-[1fr_80px_80px_auto] gap-2 rounded-lg border border-line p-2 sm:grid-cols-[1.4fr_80px_80px_1fr_auto]" data-testid="ingredient-row">
                <Input aria-label="Zutat" placeholder="Zutat" value={r.name} onChange={(e) => upd(r.key, { name: e.target.value })} maxLength={120} />
                <Input aria-label="Menge" placeholder="Menge" inputMode="decimal" value={r.quantity} onChange={(e) => upd(r.key, { quantity: e.target.value })} />
                <Input aria-label="Einheit" placeholder="z. B. g, l, Stk" list="units" value={r.unit} onChange={(e) => upd(r.key, { unit: e.target.value })} maxLength={20} />
                <Input aria-label="Warengruppe" placeholder="Warengruppe" list="categories" value={r.category} onChange={(e) => upd(r.key, { category: e.target.value })} className="col-span-3 sm:col-span-1" maxLength={60} />
                <Button type="button" variant="ghost" size="sm" aria-label={`${r.name || "Zutat"} entfernen`} onClick={() => setRows((x) => x.filter((y) => y.key !== r.key))} className="row-start-1 col-start-4 sm:col-start-5">
                  ✕
                </Button>
              </li>
            ))}
          </ul>
          <div>
            <Button type="button" size="sm" onClick={add}>
              + Zutat
            </Button>
          </div>
          <p className="text-xs text-muted">Mengen gelten für die oben angegebene Portionszahl. Getränke in l oder ml, feste Zutaten in g/kg oder Stk. Ohne Einheit zählt die Menge als Stück. Menge leer lassen für „nach Bedarf“. Kompatible Einheiten (g/kg, ml/l) werden in der Einkaufsliste automatisch zusammengerechnet.</p>
        </div>
        <Field label="Zubereitung / Notizen" optional>
          {(p) => <Textarea {...p} rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={4000} />}
        </Field>
        {errors._ && <p className="text-sm font-medium text-danger">{errors._}</p>}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="primary" loading={busy}>
            Speichern
          </Button>
          {recipe.id && (
            <Button
              type="button"
              variant="danger"
              onClick={async () => {
                if (!confirm("Rezept löschen? Verknüpfte Mahlzeiten bleiben ohne Rezept erhalten.")) return;
                try {
                  await api(`/api/trips/${tripId}/recipes/${recipe.id}`, { method: "DELETE" });
                  toast("Rezept gelöscht");
                  await reload();
                  onClose();
                } catch (e) {
                  toast(e instanceof ApiError ? e.message : "Fehler", "error");
                }
              }}
            >
              Löschen
            </Button>
          )}
        </div>
      </form>
    </Sheet>
  );
}

function portions(n: number): string {
  return n === 1 ? "Portion" : "Portionen";
}
