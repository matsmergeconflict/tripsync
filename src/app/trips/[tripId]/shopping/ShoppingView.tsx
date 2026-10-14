"use client";

import { useMemo, useState } from "react";
import { useTrip } from "../TripContext";
import { CATEGORIES } from "../meals/MealsView";
import { Badge, Button, Card, Empty, Field, Input, Notice, Select, cx } from "@/components/ui";
import { api, ApiError } from "@/lib/client/api";
import { formatShort } from "@/lib/dates";
import { displayName, normalizeName, suggestMerges } from "@/lib/ingredients";
import { buildShoppingList, type ShoppingRow } from "@/lib/plan";
import { COMMON_UNITS, formatAmount } from "@/lib/units";

export function ShoppingView() {
  const { data, tripId, stats, reload, toast } = useTrip();
  const [sort, setSort] = useState<"category" | "name">("category");
  const [team, setTeam] = useState<string>("all");
  const [hideChecked, setHideChecked] = useState(false);
  const rows = useMemo(() => buildShoppingList(data, stats), [data, stats]);
  const teams = [...new Set(rows.map((r) => r.team).filter(Boolean))] as string[];

  const visible = rows
    .filter((r) => team === "all" || (team === "none" ? !r.team : r.team === team))
    .filter((r) => !hideChecked || !r.checked)
    .sort((a, b) => (sort === "category" ? (a.category ?? "~").localeCompare(b.category ?? "~") : 0) || a.name.localeCompare(b.name, "de"));

  const groups = sort === "category" ? groupBy(visible, (r) => r.category || "Ohne Warengruppe") : [["Alle Artikel", visible] as const];
  const done = rows.filter((r) => r.checked).length;

  const setState = async (r: ShoppingRow, patch: { checked?: boolean; team?: string | null }) => {
    try {
      if (r.manual) {
        await api(`/api/trips/${tripId}/shopping/items/${r.id}`, {
          method: "PATCH",
          body: { name: r.name, quantity: r.quantity, unit: r.unit, category: r.category, team: r.team, checked: r.checked, ...patch },
        });
      } else {
        await api(`/api/trips/${tripId}/shopping/state`, { method: "PUT", body: { item_key: r.key, checked: r.checked, team: r.team, ...patch } });
      }
      reload();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Fehler", "error");
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Einkaufsliste</h1>
          <p className="text-sm text-muted">
            Automatisch aus allen geplanten Rezepten und Portionen · {done} von {rows.length} erledigt
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`/api/trips/${tripId}/export?type=shopping`} download>
            <Button>CSV-Export</Button>
          </a>
          <Button onClick={() => window.print()}>Drucken</Button>
        </div>
      </div>

      <MergeSuggestions />

      <div className="no-print flex flex-col gap-3 rounded-xl border border-line bg-surface p-3 sm:flex-row sm:flex-wrap sm:items-center">
        <Select aria-label="Sortierung" value={sort} onChange={(e) => setSort(e.target.value as "category" | "name")} className="sm:w-52">
          <option value="category">Nach Warengruppe</option>
          <option value="name">Alphabetisch</option>
        </Select>
        <Select aria-label="Team / Geschäft" value={team} onChange={(e) => setTeam(e.target.value)} className="sm:w-56">
          <option value="all">Alle Teams / Geschäfte</option>
          <option value="none">Noch nicht zugeteilt</option>
          {teams.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" className="size-5 accent-pine-600" checked={hideChecked} onChange={(e) => setHideChecked(e.target.checked)} />
          Erledigte ausblenden
        </label>
      </div>

      {rows.length === 0 ? (
        <Empty title="Die Einkaufsliste ist leer">Plane Mahlzeiten mit Rezepten – die Zutaten erscheinen hier automatisch. Einzelne Artikel kannst du unten manuell hinzufügen.</Empty>
      ) : (
        <div className="flex flex-col gap-4" data-testid="shopping-list">
          <datalist id="teams">
            {teams.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
          {groups.map(([g, items]) => (
            <section key={g} className="overflow-hidden rounded-xl border border-line bg-surface">
              <h2 className="border-b border-line bg-canvas px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted">{g}</h2>
              <ul className="divide-y divide-line">
                {items.map((r) => (
                  <ShoppingItem key={r.key} r={r} onState={(p) => setState(r, p)} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <AddItem />
    </>
  );
}

function ShoppingItem({ r, onState }: { r: ShoppingRow; onState: (p: { checked?: boolean; team?: string | null }) => void }) {
  const { tripId, reload, toast } = useTrip();
  const [teamDraft, setTeamDraft] = useState(r.team ?? "");
  const [open, setOpen] = useState(false);
  // Sofortige Rückmeldung beim Abhaken; der Serverstand gewinnt, sobald er eintrifft
  const [checked, setChecked] = useState(r.checked);
  const [synced, setSynced] = useState(r.checked);
  if (synced !== r.checked) {
    setSynced(r.checked);
    setChecked(r.checked);
  }
  return (
    <li className={cx("px-4 py-2.5", checked && "bg-sunken/60")} data-testid="shopping-item" data-name={r.name}>
      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          className="size-6 shrink-0 accent-pine-600"
          checked={checked}
          onChange={(e) => {
            setChecked(e.target.checked);
            onState({ checked: e.target.checked });
          }}
          aria-label={`${r.name} erledigt`}
        />
        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <span className={cx("block font-medium", checked && "text-muted line-through")}>{r.name}</span>
          <span className="flex flex-wrap gap-1 pt-0.5">
            {r.manual && <Badge>manuell</Badge>}
            {r.unitConflict && <Badge tone="warn">auch in anderer Einheit</Badge>}
            {r.hasUnquantified && r.quantity !== null && <Badge tone="warn">teilw. ohne Menge</Badge>}
            {r.team && <Badge tone="info">{r.team}</Badge>}
          </span>
        </button>
        <span className="shrink-0 text-right font-semibold tabular-nums" data-testid="shopping-amount">
          {formatAmount(r.quantity, r.unit)}
        </span>
      </div>
      {open && (
        <div className="mt-3 flex flex-col gap-3 pl-9 text-sm">
          {r.sources.length > 0 && (
            <ul className="flex flex-col gap-1 text-muted">
              {r.sources.map((s, i) => (
                <li key={i}>
                  {formatShort(s.day)} · {s.dish} ({s.servings} Port.): {s.originalName} {formatAmount(s.quantity, s.unit)}
                </li>
              ))}
            </ul>
          )}
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              onState({ team: teamDraft.trim() || null });
            }}
          >
            <Field label="Team / Geschäft">
              {(p) => <Input {...p} list="teams" value={teamDraft} onChange={(e) => setTeamDraft(e.target.value)} placeholder="z. B. Lidl – Tom" className="w-56" maxLength={80} />}
            </Field>
            <Button type="submit" size="sm">
              Zuordnen
            </Button>
            {r.manual && (
              <Button
                type="button"
                size="sm"
                variant="danger"
                onClick={async () => {
                  try {
                    await api(`/api/trips/${tripId}/shopping/items/${r.id}`, { method: "DELETE" });
                    reload();
                  } catch (e) {
                    toast(e instanceof ApiError ? e.message : "Fehler", "error");
                  }
                }}
              >
                Entfernen
              </Button>
            )}
          </form>
        </div>
      )}
    </li>
  );
}

function AddItem() {
  const { tripId, reload, toast } = useTrip();
  const [f, setF] = useState({ name: "", quantity: "", unit: "Stk", category: "", team: "" });
  const [busy, setBusy] = useState(false);
  return (
    <Card title="Artikel manuell hinzufügen" className="no-print">
      <form
        className="grid gap-3 sm:grid-cols-[1.5fr_90px_90px_1fr_1fr_auto] sm:items-end"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!f.name.trim()) return;
          const q = f.quantity.trim() ? Number(f.quantity.replace(",", ".")) : null;
          if (q !== null && !(q >= 0)) return toast("Ungültige Menge", "error");
          setBusy(true);
          try {
            await api(`/api/trips/${tripId}/shopping/items`, { body: { name: f.name, quantity: q, unit: f.unit, category: f.category || null, team: f.team || null } });
            setF({ ...f, name: "", quantity: "" });
            reload();
          } catch (err) {
            toast(err instanceof ApiError ? err.message : "Fehler", "error");
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Artikel">{(p) => <Input {...p} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="z. B. Spülmittel" maxLength={120} />}</Field>
        <Field label="Menge">{(p) => <Input {...p} inputMode="decimal" value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} />}</Field>
        <Field label="Einheit">
          {(p) => (
            <>
              <Input {...p} list="units-shop" value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} maxLength={20} />
              <datalist id="units-shop">
                {COMMON_UNITS.map((u) => (
                  <option key={u} value={u} />
                ))}
              </datalist>
            </>
          )}
        </Field>
        <Field label="Warengruppe">
          {(p) => (
            <Select {...p} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
              <option value="">–</option>
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Team / Geschäft">{(p) => <Input {...p} list="teams" value={f.team} onChange={(e) => setF({ ...f, team: e.target.value })} maxLength={80} />}</Field>
        <Button type="submit" variant="primary" loading={busy}>
          Hinzufügen
        </Button>
      </form>
    </Card>
  );
}

/**
 * Vereinheitlichungs-Vorschläge. Sie werden nur nach ausdrücklicher Bestätigung übernommen;
 * jede Zusammenführung ist sichtbar und kann rückgängig gemacht werden.
 */
function MergeSuggestions() {
  const { data, tripId, reload, toast } = useTrip();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [targets, setTargets] = useState<Record<string, string>>({});
  const aliasSet = new Set(data.aliases.map((a) => normalizeName(a.alias)));
  const names = data.recipes.flatMap((r) => r.ingredients.map((i) => i.name)).filter((n) => !aliasSet.has(normalizeName(n)));
  const suggestions = suggestMerges(names).filter((s) => !dismissed.has(s.canonical + s.variants.join("|")));

  if (!suggestions.length && !data.aliases.length) return null;

  return (
    <Card title="Zutaten vereinheitlichen" className="no-print">
      <div className="flex flex-col gap-4">
        {suggestions.length > 0 && (
          <>
            <Notice>
              Unterschiedliche Schreibweisen derselben Zutat werden erst nach deiner Bestätigung zusammengefasst. Die Mengen werden danach exakt (nicht geschätzt) addiert.
            </Notice>
            <ul className="flex flex-col gap-3" data-testid="merge-suggestions">
              {suggestions.map((s) => {
                const id = s.canonical + s.variants.join("|");
                const all = [s.canonical, ...s.variants];
                const target = targets[id] ?? s.canonical;
                return (
                  <li key={id} className="rounded-lg border border-line p-3 text-sm">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {all.map((n) => (
                        <Badge key={n}>{displayName(n)}</Badge>
                      ))}
                      <Badge tone={s.confidence === "high" ? "ok" : "warn"}>{s.confidence === "high" ? "sehr ähnlich" : "bitte prüfen"}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted">{s.reason}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Select aria-label="Zielname" value={target} onChange={(e) => setTargets({ ...targets, [id]: e.target.value })} className="w-auto">
                        {all.map((n) => (
                          <option key={n} value={n}>
                            als „{displayName(n)}“
                          </option>
                        ))}
                      </Select>
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={async () => {
                          try {
                            await api(`/api/trips/${tripId}/aliases`, { body: { canonical: target, variants: all.filter((n) => n !== target) } });
                            toast("Zusammengeführt");
                            reload();
                          } catch (e) {
                            toast(e instanceof ApiError ? e.message : "Fehler", "error");
                          }
                        }}
                      >
                        Zusammenführen
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setDismissed(new Set(dismissed).add(id))}>
                        Getrennt lassen
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
        {data.aliases.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer font-medium">Bestätigte Zusammenführungen ({data.aliases.length})</summary>
            <ul className="mt-2 flex flex-col gap-1">
              {data.aliases.map((a) => (
                <li key={a.alias} className="flex items-center justify-between gap-2">
                  <span>
                    {displayName(a.alias)} → <strong>{displayName(a.canonical)}</strong>
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      try {
                        await api(`/api/trips/${tripId}/aliases?alias=${encodeURIComponent(a.alias)}`, { method: "DELETE" });
                        reload();
                      } catch (e) {
                        toast(e instanceof ApiError ? e.message : "Fehler", "error");
                      }
                    }}
                  >
                    Aufheben
                  </Button>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </Card>
  );
}

function groupBy<T>(items: T[], key: (t: T) => string): (readonly [string, T[]])[] {
  const m = new Map<string, T[]>();
  for (const i of items) m.set(key(i), [...(m.get(key(i)) ?? []), i]);
  return [...m.entries()];
}
