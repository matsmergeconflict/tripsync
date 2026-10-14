"use client";

import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Badge, Button, Field, Input, Notice, Segmented, Select, Textarea, cx } from "./ui";
import { MultiDayCalendar, RangeCalendar } from "./TripCalendar";
import { SkiRangeQuickPick, type FormTrip } from "./ParticipantForm";
import { eachDay, formatLong, formatShort, isWithin, type ISODate } from "@/lib/dates";
import { DIET_LABELS, type Approval, type Diet, type MealMode, type Participant, type SkiNeed, type StayStatus } from "@/lib/types";

/**
 * Anmeldeformular für eine oder mehrere Personen (z. B. Familie).
 * Aufenthalt, Skipass und Essen werden im "Kopf" einmal für alle gewählt;
 * pro Person kann man davon abweichen. Name, Passkategorie, Ernährung und Allergien
 * sind immer pro Person.
 */

export interface Shared {
  arrival_date: ISODate | null;
  arrival_time: string;
  departure_date: ISODate | null;
  departure_time: string;
  stay_status: StayStatus;
  ski_need: SkiNeed;
  ski_days: ISODate[];
  ski_discount: string;
  share_ski_public: boolean;
  meal_mode: MealMode;
  meal_days: ISODate[];
}

export interface PersonState {
  key: string;
  id?: string;
  approval?: Approval;
  first_name: string;
  last_name: string;
  status: "active" | "withdrawn";
  ski_category: string;
  diet: Diet | "";
  food_wishes: string;
  allergies: string;
  own: { stay: boolean; ski: boolean; meal: boolean };
  mine: Shared;
}

export interface GroupState {
  contact: string;
  comment: string;
  head: Shared;
  persons: PersonState[];
}

let keySeq = 0;
const newKey = () => `p${Date.now().toString(36)}${(keySeq++).toString(36)}`;

export function emptyShared(): Shared {
  return {
    arrival_date: null,
    arrival_time: "",
    departure_date: null,
    departure_time: "",
    stay_status: "confirmed",
    ski_need: "unknown",
    ski_days: [],
    ski_discount: "",
    share_ski_public: false,
    meal_mode: "all_present",
    meal_days: [],
  };
}

export function emptyPerson(head?: Shared): PersonState {
  return {
    key: newKey(),
    first_name: "",
    last_name: "",
    status: "active",
    ski_category: "",
    diet: "",
    food_wishes: "",
    allergies: "",
    own: { stay: false, ski: false, meal: false },
    mine: structuredClone(head ?? emptyShared()),
  };
}

export function emptyGroup(): GroupState {
  return { contact: "", comment: "", head: emptyShared(), persons: [emptyPerson()] };
}

type P = Omit<Participant, "org_note">;

function sharedOf(p: P): Shared {
  return {
    arrival_date: p.arrival_date,
    arrival_time: p.arrival_time ?? "",
    departure_date: p.departure_date,
    departure_time: p.departure_time ?? "",
    stay_status: p.stay_status,
    ski_need: p.ski_need,
    ski_days: p.ski_days ?? [],
    ski_discount: p.ski_discount ?? "",
    share_ski_public: p.share_ski_public,
    meal_mode: p.meal_mode,
    meal_days: p.meal_days ?? [],
  };
}

const STAY_KEYS = ["arrival_date", "arrival_time", "departure_date", "departure_time", "stay_status"] as const;
const SKI_KEYS = ["ski_need", "ski_days", "ski_discount", "share_ski_public"] as const;
const MEAL_KEYS = ["meal_mode", "meal_days"] as const;
const same = (a: Shared, b: Shared, keys: readonly (keyof Shared)[]) => keys.every((k) => JSON.stringify(a[k]) === JSON.stringify(b[k]));

/** Baut den Formularzustand aus gespeicherten Personen: Kopf = erste aktive Person, Abweichungen werden markiert. */
export function groupFromParticipants(ps: P[], reg: { contact: string | null; comment: string | null }): GroupState {
  const sorted = [...ps].sort((a, b) => a.position - b.position);
  const ref = sorted.find((p) => p.status === "active") ?? sorted[0];
  const head = ref ? sharedOf(ref) : emptyShared();
  return {
    contact: reg.contact ?? "",
    comment: reg.comment ?? "",
    head,
    persons: sorted.map((p) => {
      const mine = sharedOf(p);
      return {
        key: newKey(),
        id: p.id,
        approval: p.approval,
        first_name: p.first_name,
        last_name: p.last_name,
        status: p.status,
        ski_category: p.ski_category ?? "",
        diet: p.diet ?? "",
        food_wishes: p.food_wishes ?? "",
        allergies: p.allergies ?? "",
        own: { stay: !same(mine, head, STAY_KEYS), ski: !same(mine, head, SKI_KEYS), meal: !same(mine, head, MEAL_KEYS) },
        mine,
      };
    }),
  };
}

/** Effektive Werte einer Person (Kopf oder eigene Abweichung). */
export function effective(g: GroupState, p: PersonState): Shared {
  const pick = (own: boolean, keys: readonly (keyof Shared)[]) => Object.fromEntries(keys.map((k) => [k, (own ? p.mine : g.head)[k]]));
  return { ...pick(p.own.stay, STAY_KEYS), ...pick(p.own.ski, SKI_KEYS), ...pick(p.own.meal, MEAL_KEYS) } as unknown as Shared;
}

export function groupToPayload(g: GroupState) {
  return {
    contact: g.contact || null,
    comment: g.comment || null,
    persons: g.persons.map((p) => {
      const e = effective(g, p);
      return {
        ...(p.id ? { id: p.id } : {}),
        first_name: p.first_name,
        last_name: p.last_name,
        status: p.status,
        arrival_date: e.arrival_date,
        arrival_time: e.arrival_time || null,
        departure_date: e.departure_date,
        departure_time: e.departure_time || null,
        stay_status: e.stay_status,
        ski_need: e.ski_need,
        ski_days: e.ski_need === "no" ? [] : e.ski_days,
        ski_category: e.ski_need === "no" ? null : p.ski_category || null,
        ski_discount: e.ski_need === "no" ? null : e.ski_discount || null,
        share_ski_public: e.share_ski_public,
        meal_mode: e.meal_mode,
        meal_days: e.meal_mode === "custom" ? e.meal_days : [],
        diet: p.diet || null,
        food_wishes: p.food_wishes || null,
        allergies: p.allergies || null,
      };
    }),
  };
}

type StepId = "persons" | "stay" | "ski" | "food" | "review";
const STEP_LABELS: Record<StepId, string> = { persons: "Personen", stay: "Aufenthalt", ski: "Skipass", food: "Essen", review: "Prüfen" };

interface Props {
  trip: FormTrip;
  initial: GroupState;
  mode: "wizard" | "full";
  submitLabel: string;
  onSubmit: (g: GroupState) => Promise<void>;
  serverError?: string | null;
  busy?: boolean;
  footer?: ReactNode;
}

export function GroupForm({ trip, initial, mode, submitLabel, onSubmit, serverError, busy, footer }: Props) {
  const [g, setG] = useState<GroupState>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const steps: StepId[] = useMemo(() => ["persons", "stay", ...(trip.ski_enabled ? (["ski"] as StepId[]) : []), "food", "review"], [trip.ski_enabled]);
  const [stepIdx, setStepIdx] = useState(0);
  const current = steps[stepIdx];
  const multi = g.persons.length > 1;

  const setHead = (patch: Partial<Shared>) => setG((x) => ({ ...x, head: { ...x.head, ...patch } }));
  const setPerson = (key: string, patch: Partial<PersonState>) => setG((x) => ({ ...x, persons: x.persons.map((p) => (p.key === key ? { ...p, ...patch } : p)) }));
  const setMine = (key: string, patch: Partial<Shared>) => setG((x) => ({ ...x, persons: x.persons.map((p) => (p.key === key ? { ...p, mine: { ...p.mine, ...patch } } : p)) }));
  const toggleOwn = (key: string, area: "stay" | "ski" | "meal", on: boolean) =>
    setG((x) => ({
      ...x,
      // Beim Einschalten nur die Felder dieses Bereichs aus dem Kopf übernehmen – andere Abweichungen bleiben erhalten
      persons: x.persons.map((p) => {
        if (p.key !== key) return p;
        const keys = area === "stay" ? STAY_KEYS : area === "ski" ? SKI_KEYS : MEAL_KEYS;
        const copied = on ? Object.fromEntries(keys.map((k) => [k, structuredClone(x.head[k])])) : {};
        return { ...p, own: { ...p.own, [area]: on }, mine: { ...p.mine, ...copied } };
      }),
    }));

  const validate = (only?: StepId): Record<string, string> => {
    const e: Record<string, string> = {};
    if (!only || only === "persons") {
      g.persons.forEach((p) => {
        if (!p.first_name.trim()) e[`${p.key}.first_name`] = "Vorname fehlt";
        if (!p.last_name.trim()) e[`${p.key}.last_name`] = "Nachname fehlt";
      });
    }
    if (!only || only === "stay") {
      const check = (s: Shared, k: string) => {
        if (s.arrival_date && s.departure_date && s.departure_date < s.arrival_date) e[k] = "Abreise darf nicht vor der Anreise liegen.";
      };
      check(g.head, "head.stay");
      g.persons.forEach((p) => p.own.stay && check(p.mine, `${p.key}.stay`));
    }
    return e;
  };

  const firstErrorStep = (e: Record<string, string>): StepId => (Object.keys(e).some((k) => k.endsWith("name")) ? "persons" : "stay");

  const next = () => {
    const e = validate(current);
    setErrors(e);
    if (Object.keys(e).length) return;
    setStepIdx((i) => Math.min(i + 1, steps.length - 1));
    window.scrollTo({ top: 0 });
  };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (mode === "wizard" && current !== "review") return next();
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) {
      if (mode === "wizard") setStepIdx(steps.indexOf(firstErrorStep(e)));
      return;
    }
    await onSubmit(g);
  };

  const nameOf = (p: PersonState, i: number) => (p.first_name.trim() ? p.first_name.trim() : `Person ${i + 1}`);

  /* ---------- Abschnitte ---------- */

  const personsSection = (
    <div className="flex flex-col gap-4">
      {mode === "wizard" && (
        <p className="text-sm text-muted">Du kannst mehrere Personen auf einmal anmelden, z. B. deine Familie. Alle bekommen einen gemeinsamen Link zum Ändern.</p>
      )}
      <ul className="flex flex-col gap-3" data-testid="person-list">
        {g.persons.map((p, i) => (
          <li key={p.key} className={cx("rounded-xl border border-line bg-surface p-3", p.status === "withdrawn" && "opacity-70")} data-testid="person-entry">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-sm font-semibold">
                {multi || mode === "full" ? `Person ${i + 1}` : "Deine Angaben"}
                {p.approval === "pending" && <Badge tone="warn">wartet auf Bestätigung</Badge>}
                {p.approval === "approved" && p.status === "active" && <Badge tone="ok">bestätigt</Badge>}
                {p.approval === "rejected" && <Badge tone="bad">abgelehnt</Badge>}
                {p.status === "withdrawn" && <Badge>zurückgezogen</Badge>}
              </span>
              {g.persons.length > 1 && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    if (p.id && !confirm(`${nameOf(p, i)} wirklich aus der Anmeldung entfernen?`)) return;
                    setG((x) => ({ ...x, persons: x.persons.filter((y) => y.key !== p.key) }));
                  }}
                >
                  Entfernen
                </Button>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Vorname" error={errors[`${p.key}.first_name`]}>
                {(f) => <Input {...f} autoComplete={i === 0 ? "given-name" : "off"} value={p.first_name} onChange={(e) => setPerson(p.key, { first_name: e.target.value })} maxLength={60} />}
              </Field>
              <Field label="Nachname" error={errors[`${p.key}.last_name`]}>
                {(f) => <Input {...f} autoComplete={i === 0 ? "family-name" : "off"} value={p.last_name} onChange={(e) => setPerson(p.key, { last_name: e.target.value })} maxLength={60} />}
              </Field>
            </div>
            {mode === "full" && p.id && (
              <label className="mt-3 flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-5 accent-pine-600"
                  checked={p.status === "withdrawn"}
                  onChange={(e) => setPerson(p.key, { status: e.target.checked ? "withdrawn" : "active" })}
                />
                {nameOf(p, i)} kommt doch nicht mit (Teilnahme zurückziehen)
              </label>
            )}
          </li>
        ))}
      </ul>
      {g.persons.length < 12 && (
        <div>
          <Button
            type="button"
            onClick={() =>
              setG((x) => ({ ...x, persons: [...x.persons, { ...emptyPerson(x.head), last_name: x.persons[0]?.last_name ?? "" }] }))
            }
          >
            + Weitere Person anmelden
          </Button>
        </div>
      )}
      <Field label="Kontakt" optional hint="Telefon oder E-Mail – nur für die Organisatoren sichtbar.">
        {(f) => <Input {...f} autoComplete="tel" value={g.contact} onChange={(e) => setG({ ...g, contact: e.target.value })} maxLength={200} />}
      </Field>
      <Field label="Nachricht an die Organisatoren" optional hint="Nicht öffentlich sichtbar.">
        {(f) => <Textarea {...f} value={g.comment} onChange={(e) => setG({ ...g, comment: e.target.value })} maxLength={2000} />}
      </Field>
    </div>
  );

  const stayEditor = (s: Shared, set: (patch: Partial<Shared>) => void, label: string, errKey: string) => (
    <div className="flex flex-col gap-3">
      <RangeCalendar label={label} start={trip.start_date} end={trip.end_date} from={s.arrival_date} to={s.departure_date} onChange={(a, d) => set({ arrival_date: a, departure_date: d })} />
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-lg bg-sunken px-3 py-2">
          <div className="text-xs text-muted">Anreise</div>
          <div className="font-semibold" data-testid="arrival-display">
            {s.arrival_date ? formatShort(s.arrival_date) : "noch offen"}
          </div>
        </div>
        <div className={cx("rounded-lg px-3 py-2", errors[errKey] ? "bg-danger-soft" : "bg-sunken")}>
          <div className="text-xs text-muted">Abreise</div>
          <div className="font-semibold" data-testid="departure-display">
            {s.departure_date ? formatShort(s.departure_date) : "noch offen"}
          </div>
        </div>
      </div>
      {errors[errKey] && (
        <p role="alert" className="text-sm font-medium text-danger">
          {errors[errKey]}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Ankunftszeit" optional>
          {(f) => <Input {...f} type="time" value={s.arrival_time} onChange={(e) => set({ arrival_time: e.target.value })} />}
        </Field>
        <Field label="Abfahrtszeit" optional>
          {(f) => <Input {...f} type="time" value={s.departure_time} onChange={(e) => set({ departure_time: e.target.value })} />}
        </Field>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Wie sicher sind diese Angaben?</span>
        <Segmented
          label="Status der Angaben"
          value={s.stay_status}
          onChange={(v) => set({ stay_status: v })}
          options={[
            { value: "confirmed", label: "Bestätigt" },
            { value: "tentative", label: "Noch unklar" },
          ]}
        />
      </div>
    </div>
  );

  const stayDaysOf = (s: Shared) => (s.arrival_date && s.departure_date && s.arrival_date <= s.departure_date ? eachDay(s.arrival_date, s.departure_date) : []);

  const stayHeadLabel = multi ? "Gemeinsame Anreise und Abreise für alle" : "Anreise und Abreise wählen";
  const staySection = (
    <div className="flex flex-col gap-4">
      {multi && <HeadTitle>Für alle gemeinsam</HeadTitle>}
      {stayEditor(g.head, setHead, stayHeadLabel, "head.stay")}
      {multi && (
        <div className="flex flex-col gap-3">
          <span className="text-sm font-medium">Kommt jemand später oder fährt früher?</span>
          {g.persons.map((p, i) => (
            <Deviation key={p.key} area="stay" checked={p.own.stay} onToggle={(on) => toggleOwn(p.key, "stay", on)} title={`${nameOf(p, i)}: andere Daten`}>
              {stayEditor(p.mine, (patch) => setMine(p.key, patch), `Anreise und Abreise für ${nameOf(p, i)}`, `${p.key}.stay`)}
            </Deviation>
          ))}
        </div>
      )}
    </div>
  );

  const skiEditor = (s: Shared, set: (patch: Partial<Shared>) => void, stay: Shared, label: string) => {
    const days = stayDaysOf(stay);
    return (
      <div className="flex flex-col gap-3">
        <Segmented
          label={label}
          value={s.ski_need}
          onChange={(v) => set({ ski_need: v })}
          options={[
            { value: "yes", label: "Ja" },
            { value: "no", label: "Nein" },
            { value: "unknown", label: "Weiß noch nicht" },
          ]}
        />
        {s.ski_need !== "no" && (
          <>
            <span className="text-sm font-medium">An welchen Tagen?</span>
            <div className="flex flex-wrap gap-2">
              {days.length > 0 && (
                <Button type="button" size="sm" onClick={() => set({ ski_days: days })}>
                  Alle Aufenthaltstage
                </Button>
              )}
              {days.length > 2 && (
                <Button type="button" size="sm" onClick={() => set({ ski_days: days.slice(1, -1) })}>
                  Ohne An- und Abreisetag
                </Button>
              )}
              {s.ski_days.length > 0 && (
                <Button type="button" size="sm" variant="ghost" onClick={() => set({ ski_days: [] })}>
                  Keine
                </Button>
              )}
            </div>
            <SkiRangeQuickPick trip={trip} onApply={(d) => set({ ski_days: d })} />
            <MultiDayCalendar label={`${label}: Skitage`} start={trip.start_date} end={trip.end_date} value={s.ski_days} onChange={(d) => set({ ski_days: d })} context={{ from: stay.arrival_date, to: stay.departure_date }} />
            <p className="text-sm text-muted" aria-live="polite" data-testid="ski-day-count">
              {s.ski_days.length ? `${s.ski_days.length} Skitag${s.ski_days.length === 1 ? "" : "e"}: ${s.ski_days.map(formatShort).join(", ")}` : "Noch keine Skitage gewählt."}
            </p>
            {days.length > 0 && s.ski_days.some((d) => !isWithin(d, stay.arrival_date!, stay.departure_date!)) && (
              <Notice tone="warn">Mindestens ein Skitag liegt außerhalb des Aufenthalts.</Notice>
            )}
            <Field label="Ermäßigung" optional hint="z. B. Studierendenausweis, Saisonkarte vorhanden">
              {(f) => <Input {...f} value={s.ski_discount} onChange={(e) => set({ ski_discount: e.target.value })} maxLength={200} />}
            </Field>
            <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm">
              <input type="checkbox" className="mt-0.5 size-5 accent-pine-600" checked={s.share_ski_public} onChange={(e) => set({ share_ski_public: e.target.checked })} />
              <span>Skitage in der gemeinsamen Übersicht zeigen (damit andere sich anschließen können).</span>
            </label>
          </>
        )}
      </div>
    );
  };

  const skiSection = (
    <div className="flex flex-col gap-4">
      {trip.ski_notes && <Notice>{trip.ski_notes}</Notice>}
      {multi && <HeadTitle>Für alle gemeinsam</HeadTitle>}
      <span className="text-sm font-medium">{multi ? "Braucht ihr Skipässe?" : "Brauchst du einen Skipass?"}</span>
      {skiEditor(g.head, setHead, g.head, "Skipass erforderlich")}
      {trip.ski_categories.length > 0 && (
        <div className="flex flex-col gap-3">
          <span className="text-sm font-medium">{multi ? "Passkategorie pro Person" : "Passkategorie"}</span>
          {g.persons.map((p, i) => {
            const e = effective(g, p);
            if (e.ski_need === "no") return null;
            return (
              <Field key={p.key} label={multi ? nameOf(p, i) : "Passkategorie"} optional={e.ski_need === "unknown"}>
                {(f) => (
                  <Select {...f} value={p.ski_category} onChange={(ev) => setPerson(p.key, { ski_category: ev.target.value })}>
                    <option value="">Bitte wählen …</option>
                    {trip.ski_categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                        {c.note ? ` (${c.note})` : ""}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            );
          })}
        </div>
      )}
      {multi && (
        <div className="flex flex-col gap-3">
          <span className="text-sm font-medium">Fährt jemand nicht oder an anderen Tagen?</span>
          {g.persons.map((p, i) => (
            <Deviation key={p.key} area="ski" checked={p.own.ski} onToggle={(on) => toggleOwn(p.key, "ski", on)} title={`${nameOf(p, i)}: anderer Skipass-Wunsch`}>
              {skiEditor(p.mine, (patch) => setMine(p.key, patch), effective(g, p), `Skipass für ${nameOf(p, i)}`)}
            </Deviation>
          ))}
        </div>
      )}
    </div>
  );

  const mealEditor = (s: Shared, set: (patch: Partial<Shared>) => void, stay: Shared, label: string) => (
    <div className="flex flex-col gap-3">
      <Segmented
        label={label}
        value={s.meal_mode}
        onChange={(v) => set({ meal_mode: v })}
        options={[
          { value: "all_present", label: "Ja, an allen Tagen vor Ort" },
          { value: "custom", label: "Nur an bestimmten Tagen" },
          { value: "none", label: "Nein" },
          { value: "unknown", label: "Weiß noch nicht" },
        ]}
      />
      {s.meal_mode === "custom" && (
        <MultiDayCalendar label={`${label}: Essenstage`} start={trip.start_date} end={trip.end_date} value={s.meal_days} onChange={(d) => set({ meal_days: d })} context={{ from: stay.arrival_date, to: stay.departure_date }} />
      )}
    </div>
  );

  const foodSection = (
    <div className="flex flex-col gap-4">
      {multi && <HeadTitle>Für alle gemeinsam</HeadTitle>}
      <span className="text-sm font-medium">{multi ? "Esst ihr bei den gemeinsamen Mahlzeiten mit?" : "Isst du bei den gemeinsamen Mahlzeiten mit?"}</span>
      {mealEditor(g.head, setHead, g.head, "Teilnahme an gemeinsamen Mahlzeiten")}
      {multi && (
        <div className="flex flex-col gap-3">
          <span className="text-sm font-medium">Isst jemand anders mit?</span>
          {g.persons.map((p, i) => (
            <Deviation key={p.key} area="meal" checked={p.own.meal} onToggle={(on) => toggleOwn(p.key, "meal", on)} title={`${nameOf(p, i)}: andere Essenstage`}>
              {mealEditor(p.mine, (patch) => setMine(p.key, patch), effective(g, p), `Essen für ${nameOf(p, i)}`)}
            </Deviation>
          ))}
        </div>
      )}
      <div className="flex flex-col gap-3">
        {multi && <span className="text-sm font-medium">Ernährung pro Person</span>}
        {g.persons.map((p, i) => {
          const e = effective(g, p);
          return (
            <div key={p.key} className={cx("flex flex-col gap-3", multi && "rounded-xl border border-line bg-surface p-3")}>
              {multi && <span className="text-sm font-semibold">{nameOf(p, i)}</span>}
              {e.meal_mode !== "none" && (
                <Field label="Ernährungsweise">
                  {(f) => (
                    <Select {...f} value={p.diet} onChange={(ev) => setPerson(p.key, { diet: ev.target.value as Diet | "" })}>
                      <option value="">Bitte wählen …</option>
                      {Object.entries(DIET_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              )}
              <Field label="Essenswünsche" optional>
                {(f) => <Input {...f} value={p.food_wishes} onChange={(ev) => setPerson(p.key, { food_wishes: ev.target.value })} maxLength={1000} />}
              </Field>
              <Field label="Allergien oder Unverträglichkeiten" optional hint={i === 0 ? "Nur angeben, was fürs Kochen wichtig ist. Sehen ausschließlich die Organisatoren." : undefined}>
                {(f) => <Input {...f} value={p.allergies} onChange={(ev) => setPerson(p.key, { allergies: ev.target.value })} maxLength={1000} />}
              </Field>
            </div>
          );
        })}
      </div>
    </div>
  );

  const review = (
    <div className="flex flex-col gap-3" data-testid="review">
      {g.persons.map((p, i) => {
        const e = effective(g, p);
        const cat = trip.ski_categories.find((c) => c.id === p.ski_category)?.name;
        return (
          <dl key={p.key} className="rounded-xl border border-line bg-surface p-4 text-sm">
            <dt className="mb-2 text-base font-semibold">
              {`${p.first_name} ${p.last_name}`.trim() || `Person ${i + 1}`}
              {p.status === "withdrawn" && <span className="ml-2 text-sm font-normal text-muted">(zurückgezogen)</span>}
            </dt>
            <dd className="flex flex-col gap-1">
              <span>
                {e.arrival_date ? formatLong(e.arrival_date) : "Anreise offen"} – {e.departure_date ? formatLong(e.departure_date) : "Abreise offen"}
                {e.stay_status === "tentative" && <span className="text-amber-ink"> (noch unklar)</span>}
              </span>
              {trip.ski_enabled && (
                <span className="text-muted">
                  Skipass: {e.ski_need === "no" ? "nein" : `${e.ski_need === "yes" ? "ja" : "unklar"}${e.ski_days.length ? `, ${e.ski_days.length} Tage` : ""}${cat ? `, ${cat}` : ""}`}
                </span>
              )}
              <span className="text-muted">
                Essen: {{ all_present: "an allen Tagen vor Ort", custom: `an ${e.meal_days.length} Tagen`, none: "nein", unknown: "unklar" }[e.meal_mode]}
                {p.diet ? `, ${DIET_LABELS[p.diet]}` : ""}
                {p.allergies ? ", Allergien angegeben" : ""}
              </span>
            </dd>
          </dl>
        );
      })}
      <div className="flex flex-wrap gap-2">
        {steps
          .filter((s) => s !== "review")
          .map((s) => (
            <Button key={s} type="button" size="sm" variant="ghost" onClick={() => setStepIdx(steps.indexOf(s))}>
              {STEP_LABELS[s]} ändern
            </Button>
          ))}
      </div>
    </div>
  );

  const sections: Record<StepId, ReactNode> = { persons: personsSection, stay: staySection, ski: skiSection, food: foodSection, review };

  if (mode === "full") {
    return (
      <form onSubmit={submit} className="flex flex-col gap-6" noValidate>
        {steps
          .filter((s) => s !== "review")
          .map((s) => (
            <section key={s} className="rounded-xl border border-line bg-canvas/40 p-4 sm:bg-surface">
              <h2 className="mb-4 text-base font-semibold">{STEP_LABELS[s]}</h2>
              {sections[s]}
            </section>
          ))}
        {serverError && (
          <p role="alert" className="text-sm font-medium text-danger">
            {serverError}
          </p>
        )}
        {Object.keys(errors).length > 0 && <p className="text-sm font-medium text-danger">Bitte die markierten Angaben prüfen.</p>}
        <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-3 border-t border-line bg-canvas/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
          <Button type="submit" variant="primary" loading={busy}>
            {submitLabel}
          </Button>
          {footer}
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
      <ol className="flex gap-1" aria-label="Fortschritt">
        {steps.map((s, i) => (
          <li key={s} className="flex flex-1 flex-col gap-1">
            <span className={cx("h-1.5 rounded-full", i <= stepIdx ? "bg-pine-500" : "bg-line")} />
            <span className={cx("text-[11px]", i === stepIdx ? "font-semibold text-ink" : "text-faint")} aria-current={i === stepIdx ? "step" : undefined}>
              {STEP_LABELS[s]}
            </span>
          </li>
        ))}
      </ol>
      <h2 className="text-lg font-semibold">
        Schritt {stepIdx + 1} von {steps.length}: {STEP_LABELS[current]}
      </h2>
      {sections[current]}
      {serverError && (
        <p role="alert" className="text-sm font-medium text-danger">
          {serverError}
        </p>
      )}
      <div className="sticky bottom-0 -mx-4 flex gap-3 border-t border-line bg-canvas/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
        {stepIdx > 0 && (
          <Button type="button" onClick={() => setStepIdx((i) => i - 1)}>
            Zurück
          </Button>
        )}
        <Button type="submit" variant="primary" className="flex-1 sm:flex-none" loading={busy}>
          {current === "review" ? submitLabel : "Weiter"}
        </Button>
      </div>
    </form>
  );
}

function Deviation({ area, checked, onToggle, title, children }: { area: string; checked: boolean; onToggle: (on: boolean) => void; title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-3" data-testid={`own-${area}`}>
      <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium">
        <input type="checkbox" className="size-5 accent-pine-600" checked={checked} onChange={(e) => onToggle(e.target.checked)} />
        {title}
      </label>
      {checked && <div className="mt-3">{children}</div>}
    </div>
  );
}

function HeadTitle({ children }: { children: ReactNode }) {
  return <div className="rounded-lg bg-pine-50 px-3 py-2 text-sm font-semibold text-pine-800">{children}</div>;
}
