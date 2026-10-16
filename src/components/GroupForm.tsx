"use client";

import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Badge, Button, Field, Input, Notice, Segmented, Select, cx } from "./ui";
import { RangeCalendar } from "./TripCalendar";
import type { FormTrip } from "./ParticipantForm";
import { addDays, eachDay, formatLong, formatShort, type ISODate } from "@/lib/dates";
import { formTexts } from "@/lib/formTexts";
import { PHONE_DEFAULT, formatGermanDate, isPlausibleBirthDate, isValidEmail, isValidPhone, parseGermanDate } from "@/lib/person";
import { DIET_LABELS, SELF_DIETS, type Approval, type Diet, type Participant } from "@/lib/types";

/**
 * Anmeldeformular für eine oder mehrere Personen (z. B. Familie).
 * Aufenthalt und Skipass werden im "Kopf" einmal für alle gewählt; pro Person kann man abweichen.
 * Name, Kontakt, Geburtstag, Passkategorie, Ernährung und Allergien sind immer pro Person.
 * Essen: alle Anwesenden werden eingeplant (keine Abfrage mehr).
 */

export interface Shared {
  arrival_date: ISODate | null;
  departure_date: ISODate | null;
  ski_need: "yes" | "no" | "unknown";
  ski_from: ISODate | null;
  ski_to: ISODate | null;
}

export interface PersonState {
  key: string;
  id?: string;
  approval?: Approval;
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  birth_text: string; // TT.MM.JJJJ
  status: "active" | "withdrawn";
  ski_category: string;
  diet: Diet | "";
  allergies: string;
  own: { stay: boolean; ski: boolean };
  mine: Shared;
}

export interface GroupState {
  contact: string | null;
  comment: string | null;
  head: Shared;
  persons: PersonState[];
}

let keySeq = 0;
const newKey = () => `p${Date.now().toString(36)}${(keySeq++).toString(36)}`;

export function emptyShared(): Shared {
  return { arrival_date: null, departure_date: null, ski_need: "unknown", ski_from: null, ski_to: null };
}

export function emptyPerson(head?: Shared, lastName = ""): PersonState {
  return {
    key: newKey(),
    first_name: "",
    last_name: lastName,
    phone: PHONE_DEFAULT,
    email: "",
    birth_text: "",
    status: "active",
    ski_category: "",
    diet: "",
    allergies: "",
    own: { stay: false, ski: false },
    mine: { ...(head ?? emptyShared()) },
  };
}

export function emptyGroup(): GroupState {
  return { contact: null, comment: null, head: emptyShared(), persons: [emptyPerson()] };
}

type P = Omit<Participant, "org_note">;

function sharedOf(p: P): Shared {
  const days = p.ski_days ?? [];
  return {
    arrival_date: p.arrival_date,
    departure_date: p.departure_date,
    ski_need: p.ski_need,
    ski_from: days[0] ?? null,
    ski_to: days[days.length - 1] ?? null,
  };
}

const STAY_KEYS = ["arrival_date", "departure_date"] as const;
const SKI_KEYS = ["ski_need", "ski_from", "ski_to"] as const;
const same = (a: Shared, b: Shared, keys: readonly (keyof Shared)[]) => keys.every((k) => a[k] === b[k]);

/** Formularzustand aus gespeicherten Personen: Kopf = erste aktive Person, Abweichungen werden markiert. */
export function groupFromParticipants(ps: P[], reg: { contact: string | null; comment: string | null }): GroupState {
  const sorted = [...ps].sort((a, b) => a.position - b.position);
  const ref = sorted.find((p) => p.status === "active") ?? sorted[0];
  const head = ref ? sharedOf(ref) : emptyShared();
  return {
    contact: reg.contact,
    comment: reg.comment,
    head,
    persons: sorted.map((p) => {
      const mine = sharedOf(p);
      return {
        key: newKey(),
        id: p.id,
        approval: p.approval,
        first_name: p.first_name,
        last_name: p.last_name,
        phone: p.phone ?? PHONE_DEFAULT,
        email: p.email ?? "",
        birth_text: formatGermanDate(p.birth_date),
        status: p.status,
        ski_category: p.ski_category ?? "",
        diet: p.diet && SELF_DIETS.includes(p.diet) ? p.diet : "",
        allergies: p.allergies ?? "",
        own: { stay: !same(mine, head, STAY_KEYS), ski: !same(mine, head, SKI_KEYS) },
        mine,
      };
    }),
  };
}

/** Effektive Werte einer Person (Kopf oder eigene Abweichung). */
export function effective(g: GroupState, p: PersonState): Shared {
  const stay = p.own.stay ? p.mine : g.head;
  const ski = p.own.ski ? p.mine : g.head;
  return { arrival_date: stay.arrival_date, departure_date: stay.departure_date, ski_need: ski.ski_need, ski_from: ski.ski_from, ski_to: ski.ski_to };
}

/** Frühester/spätester möglicher Skitag: frühestens 2. Reisetag und Anreise, spätestens Abreise. */
export function skiBounds(trip: { start_date: ISODate; end_date: ISODate }, s: Pick<Shared, "arrival_date" | "departure_date">) {
  const second = addDays(trip.start_date, 1);
  const min = s.arrival_date && s.arrival_date > second ? s.arrival_date : second;
  const max = s.departure_date ?? trip.end_date;
  return { min, max };
}

/** Skitage einer Person: gewählter Zeitraum, auf ihren Aufenthalt zugeschnitten. */
export function skiDaysFor(trip: { start_date: ISODate; end_date: ISODate }, e: Shared): ISODate[] {
  if (e.ski_need !== "yes" || !e.ski_from || !e.ski_to) return [];
  const { min, max } = skiBounds(trip, e);
  const from = e.ski_from < min ? min : e.ski_from;
  const to = e.ski_to > max ? max : e.ski_to;
  return eachDay(from, to);
}

export function groupToPayload(g: GroupState, trip: { start_date: ISODate; end_date: ISODate; ski_enabled?: boolean }) {
  return {
    contact: g.contact,
    comment: g.comment,
    persons: g.persons.map((p) => {
      const e = effective(g, p);
      const skiDays = skiDaysFor(trip, e);
      return {
        ...(p.id ? { id: p.id } : {}),
        first_name: p.first_name.trim(),
        last_name: p.last_name.trim(),
        phone: p.phone,
        email: p.email.trim(),
        birth_date: parseGermanDate(p.birth_text),
        status: p.status,
        arrival_date: e.arrival_date,
        departure_date: e.departure_date,
        ski_need: trip.ski_enabled === false ? "no" : e.ski_need === "unknown" ? undefined : e.ski_need,
        ski_days: e.ski_need === "yes" ? skiDays : [],
        ski_category: e.ski_need === "yes" ? p.ski_category || null : null,
        share_ski_public: false,
        diet: p.diet || undefined,
        allergies: p.allergies.trim() || null,
      };
    }),
  };
}

type StepId = "persons" | "stay" | "ski" | "food" | "review";

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
  const T = useMemo(() => formTexts(trip.form_texts), [trip.form_texts]);
  const STEP_LABELS: Record<StepId, string> = { persons: T.persons_title, stay: T.stay_title, ski: T.ski_title, food: T.food_title, review: T.review_title };
  const steps: StepId[] = useMemo(() => ["persons", "stay", ...(trip.ski_enabled ? (["ski"] as StepId[]) : []), "food", "review"], [trip.ski_enabled]);
  const [stepIdx, setStepIdx] = useState(0);
  const current = steps[stepIdx];
  const multi = g.persons.length > 1;
  const hasCats = trip.ski_categories.length > 0;

  const clearErr = (prefix: string) => setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !k.startsWith(prefix))));
  const setHead = (patch: Partial<Shared>) => {
    setG((x) => ({ ...x, head: { ...x.head, ...patch } }));
    clearErr("head");
  };
  const setPerson = (key: string, patch: Partial<PersonState>) => {
    setG((x) => ({ ...x, persons: x.persons.map((p) => (p.key === key ? { ...p, ...patch } : p)) }));
    clearErr(key);
  };
  const setMine = (key: string, patch: Partial<Shared>) => {
    setG((x) => ({ ...x, persons: x.persons.map((p) => (p.key === key ? { ...p, mine: { ...p.mine, ...patch } } : p)) }));
    clearErr(key);
  };
  const toggleOwn = (key: string, area: "stay" | "ski", on: boolean) =>
    setG((x) => ({
      ...x,
      // Beim Einschalten nur die Felder dieses Bereichs aus dem Kopf übernehmen – andere Abweichungen bleiben erhalten
      persons: x.persons.map((p) => {
        if (p.key !== key) return p;
        const keys = area === "stay" ? STAY_KEYS : SKI_KEYS;
        const copied = on ? Object.fromEntries(keys.map((k) => [k, x.head[k]])) : {};
        return { ...p, own: { ...p.own, [area]: on }, mine: { ...p.mine, ...copied } };
      }),
    }));

  const nameOf = (p: PersonState, i: number) => (p.first_name.trim() ? p.first_name.trim() : `Person ${i + 1}`);
  const active = g.persons.filter((p) => p.status === "active");

  const validate = (only?: StepId): Record<string, string> => {
    const e: Record<string, string> = {};
    const check = (step: StepId) => !only || only === step;
    if (check("persons")) {
      g.persons.forEach((p) => {
        if (!p.first_name.trim()) e[`${p.key}.first_name`] = "Vorname fehlt";
        if (!p.last_name.trim()) e[`${p.key}.last_name`] = "Nachname fehlt";
        if (!isValidPhone(p.phone)) e[`${p.key}.phone`] = p.phone.replace(/[^\d]/g, "").length <= 2 ? "Handynummer fehlt" : "Bitte Handynummer prüfen, z. B. +49 170 1234567";
        if (!p.email.trim()) e[`${p.key}.email`] = "E-Mail fehlt";
        else if (!isValidEmail(p.email)) e[`${p.key}.email`] = "Bitte E-Mail-Adresse prüfen";
        const bd = parseGermanDate(p.birth_text);
        if (!p.birth_text.trim()) e[`${p.key}.birth`] = "Geburtstag fehlt";
        else if (!bd || !isPlausibleBirthDate(bd)) e[`${p.key}.birth`] = "Bitte als TT.MM.JJJJ eingeben, z. B. 24.12.1995";
      });
    }
    if (check("stay")) {
      const chk = (s: Shared, k: string) => {
        if (!s.arrival_date || !s.departure_date) e[k] = "Bitte Anreise und Abreise wählen.";
        else if (s.departure_date < s.arrival_date) e[k] = "Abreise darf nicht vor der Anreise liegen.";
      };
      if (active.some((p) => !p.own.stay)) chk(g.head, "head.stay");
      active.forEach((p) => p.own.stay && chk(p.mine, `${p.key}.stay`));
    }
    if (check("ski") && trip.ski_enabled) {
      if (active.some((p) => !p.own.ski) && g.head.ski_need === "unknown") e["head.ski"] = "Bitte Ja oder Nein wählen.";
      active.forEach((p, i) => {
        const eff = effective(g, p);
        if (p.own.ski && eff.ski_need === "unknown") e[`${p.key}.ski`] = "Bitte Ja oder Nein wählen.";
        if (eff.ski_need !== "yes") return;
        const src = p.own.ski ? `${p.key}.ski` : "head.ski";
        if (!eff.ski_from || !eff.ski_to) e[src] = "Bitte ersten und letzten Skitag wählen.";
        else if (!skiDaysFor(trip, eff).length) e[`${p.key}.ski`] = `Der Skizeitraum liegt außerhalb des Aufenthalts von ${nameOf(p, i)} – bitte für ${nameOf(p, i)} anpassen.`;
        if (hasCats && !p.ski_category) e[`${p.key}.cat`] = "Bitte Passkategorie wählen";
      });
    }
    if (check("food")) {
      active.forEach((p) => {
        if (!p.diet) e[`${p.key}.diet`] = "Bitte Ernährungsweise wählen";
      });
    }
    return e;
  };

  const stepOfError = (k: string): StepId =>
    /first_name|last_name|phone|email|birth/.test(k) ? "persons" : k.endsWith(".stay") ? "stay" : /\.(ski|cat)$/.test(k) ? "ski" : "food";

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
      if (mode === "wizard") setStepIdx(steps.indexOf(stepOfError(Object.keys(e)[0])));
      return;
    }
    await onSubmit(g);
  };

  /* ---------- Schritt 1: Personen ---------- */
  const personsSection = (
    <div className="flex flex-col gap-4">
      {T.persons_intro && <p className="whitespace-pre-line text-sm text-muted">{T.persons_intro}</p>}
      <ul className="flex flex-col gap-3" data-testid="person-list">
        {g.persons.map((p, i) => (
          <li key={p.key} className={cx("rounded-xl border border-line bg-surface p-3", p.status === "withdrawn" && "opacity-70")} data-testid="person-entry">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                {`${p.first_name} ${p.last_name}`.trim() || `Person ${i + 1}`}
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
              <Field label="Handynummer" error={errors[`${p.key}.phone`]}>
                {(f) => <Input {...f} type="tel" inputMode="tel" autoComplete={i === 0 ? "tel" : "off"} value={p.phone} onChange={(e) => setPerson(p.key, { phone: e.target.value })} maxLength={40} />}
              </Field>
              <Field label="E-Mail" error={errors[`${p.key}.email`]}>
                {(f) => <Input {...f} type="email" inputMode="email" autoComplete={i === 0 ? "email" : "off"} value={p.email} onChange={(e) => setPerson(p.key, { email: e.target.value })} maxLength={200} />}
              </Field>
              <Field label="Geburtstag" hint="TT.MM.JJJJ" error={errors[`${p.key}.birth`]}>
                {(f) => (
                  <Input
                    {...f}
                    inputMode="numeric"
                    autoComplete={i === 0 ? "bday" : "off"}
                    placeholder="z. B. 24.12.1995"
                    value={p.birth_text}
                    onChange={(e) => setPerson(p.key, { birth_text: autoDots(e.target.value, p.birth_text) })}
                    maxLength={10}
                  />
                )}
              </Field>
            </div>
            {mode === "full" && p.id && (
              <label className="mt-3 flex min-h-11 items-center gap-2 text-sm">
                <input type="checkbox" className="size-5 accent-pine-600" checked={p.status === "withdrawn"} onChange={(e) => setPerson(p.key, { status: e.target.checked ? "withdrawn" : "active" })} />
                {nameOf(p, i)} kommt doch nicht mit (Teilnahme zurückziehen)
              </label>
            )}
          </li>
        ))}
      </ul>
      {g.persons.length < 12 && (
        <div>
          <Button type="button" onClick={() => setG((x) => ({ ...x, persons: [...x.persons, emptyPerson(x.head, x.persons[0]?.last_name ?? "")] }))}>
            + Weitere Person anmelden
          </Button>
        </div>
      )}
    </div>
  );

  /* ---------- Schritt 2: Aufenthalt ---------- */
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
    </div>
  );

  const staySection = (
    <div className="flex flex-col gap-4">
      {T.stay_intro && <p className="whitespace-pre-line text-sm text-muted">{T.stay_intro}</p>}
      {multi && <HeadTitle>Für alle gemeinsam</HeadTitle>}
      {stayEditor(g.head, setHead, multi ? "Gemeinsame Anreise und Abreise für alle" : "Anreise und Abreise wählen", "head.stay")}
      {multi && (
        <div className="flex flex-col gap-3">
          <span className="text-sm font-medium">{T.stay_differs}</span>
          {g.persons.map((p, i) => (
            <Deviation key={p.key} area="stay" checked={p.own.stay} onToggle={(on) => toggleOwn(p.key, "stay", on)} title={`${nameOf(p, i)} reist anders an oder ab`}>
              {stayEditor(p.mine, (patch) => setMine(p.key, patch), `Anreise und Abreise für ${nameOf(p, i)}`, `${p.key}.stay`)}
            </Deviation>
          ))}
        </div>
      )}
    </div>
  );

  /* ---------- Schritt 3: Skipass ---------- */
  const skiEditor = (s: Shared, set: (patch: Partial<Shared>) => void, stay: Pick<Shared, "arrival_date" | "departure_date">, label: string, errKey: string) => {
    const { min, max } = skiBounds(trip, stay);
    return (
      <div className="flex flex-col gap-3">
        <Segmented
          label={label}
          value={s.ski_need === "unknown" ? ("" as "yes") : s.ski_need}
          onChange={(v) => set({ ski_need: v })}
          options={[
            { value: "yes", label: "Ja" },
            { value: "no", label: "Nein" },
          ]}
        />
        {s.ski_need === "yes" && (
          <>
            <RangeCalendar
              label={`${label}: Skitage`}
              start={trip.start_date}
              end={trip.end_date}
              from={s.ski_from}
              to={s.ski_to}
              min={min}
              max={max}
              words={{ from: "ersten Skitags", to: "letzten Skitags", fromShort: "1.", toShort: "Ende" }}
              onChange={(a, b) => set({ ski_from: a, ski_to: b })}
            />
            <div className="flex flex-wrap items-center gap-2">
              {min <= max && (
                <Button type="button" size="sm" onClick={() => set({ ski_from: min, ski_to: max })}>
                  Ganzer möglicher Zeitraum ({formatShort(min)} – {formatShort(max)})
                </Button>
              )}
            </div>
            <p className="text-sm text-muted" aria-live="polite" data-testid="ski-day-count">
              {s.ski_from && s.ski_to
                ? `Skipass von ${formatShort(s.ski_from)} bis ${formatShort(s.ski_to)} (${eachDay(s.ski_from, s.ski_to).length} Tage)`
                : "Noch kein Skizeitraum gewählt."}
            </p>
          </>
        )}
        {errors[errKey] && (
          <p role="alert" className="text-sm font-medium text-danger">
            {errors[errKey]}
          </p>
        )}
      </div>
    );
  };

  const skiSection = (
    <div className="flex flex-col gap-4">
      {T.ski_intro && <Notice>{T.ski_intro}</Notice>}
      {trip.ski_notes && <Notice>{trip.ski_notes}</Notice>}
      {multi && <HeadTitle>Für alle gemeinsam</HeadTitle>}
      <span className="text-sm font-medium">{T.ski_question}</span>
      {skiEditor(g.head, setHead, g.head, "Skipass erforderlich", "head.ski")}
      {multi && (
        <div className="flex flex-col gap-3">
          <span className="text-sm font-medium">{T.ski_differs}</span>
          {g.persons.map((p, i) => (
            <Deviation key={p.key} area="ski" checked={p.own.ski} onToggle={(on) => toggleOwn(p.key, "ski", on)} title={`Für ${nameOf(p, i)} anders`}>
              {skiEditor(p.mine, (patch) => setMine(p.key, patch), effective(g, p), `Skipass für ${nameOf(p, i)}`, `${p.key}.ski`)}
            </Deviation>
          ))}
          {g.persons.map((p) => (!p.own.ski && errors[`${p.key}.ski`] ? <p key={p.key} role="alert" className="text-sm font-medium text-danger">{errors[`${p.key}.ski`]}</p> : null))}
        </div>
      )}
      {!multi && g.persons[0] && errors[`${g.persons[0].key}.ski`] && (
        <p role="alert" className="text-sm font-medium text-danger">
          {errors[`${g.persons[0].key}.ski`]}
        </p>
      )}
      {hasCats && active.some((p) => effective(g, p).ski_need === "yes") && (
        <div className="flex flex-col gap-3">
          <span className="text-sm font-medium">{multi ? "Passkategorie pro Person" : "Passkategorie"}</span>
          {g.persons.map((p, i) => {
            const e = effective(g, p);
            if (e.ski_need !== "yes" || p.status === "withdrawn") return null;
            const bd = parseGermanDate(p.birth_text);
            return (
              <Field key={p.key} label={multi ? nameOf(p, i) : "Passkategorie"} hint={bd ? `Geburtsjahr ${bd.slice(0, 4)}` : undefined} error={errors[`${p.key}.cat`]}>
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
    </div>
  );

  /* ---------- Schritt 4: Essen ---------- */
  const foodSection = (
    <div className="flex flex-col gap-4">
      {T.food_intro && <p className="whitespace-pre-line text-sm text-muted">{T.food_intro}</p>}
      {g.persons.map((p, i) =>
        p.status === "withdrawn" ? null : (
          <div key={p.key} className={cx("flex flex-col gap-3", multi && "rounded-xl border border-line bg-surface p-3")}>
            {multi && <span className="text-sm font-semibold">{nameOf(p, i)}</span>}
            <Field label="Ernährungsweise" error={errors[`${p.key}.diet`]}>
              {(f) => (
                <Select {...f} value={p.diet} onChange={(ev) => setPerson(p.key, { diet: ev.target.value as Diet | "" })}>
                  <option value="">Bitte wählen …</option>
                  {SELF_DIETS.map((k) => (
                    <option key={k} value={k}>
                      {DIET_LABELS[k]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            {p.diet === "vegan" && T.vegan_hint && <Notice tone="warn">{T.vegan_hint}</Notice>}
            <Field label="Allergien oder Unverträglichkeiten" optional hint={i === 0 ? "Sehen ausschließlich die Organisatoren." : undefined}>
              {(f) => <Input {...f} value={p.allergies} onChange={(ev) => setPerson(p.key, { allergies: ev.target.value })} maxLength={1000} />}
            </Field>
          </div>
        )
      )}
    </div>
  );

  /* ---------- Schritt 5: Prüfen ---------- */
  const review = (
    <div className="flex flex-col gap-3" data-testid="review">
      {T.review_intro && <p className="whitespace-pre-line text-sm text-muted">{T.review_intro}</p>}
      {g.persons.map((p, i) => {
        const e = effective(g, p);
        const days = skiDaysFor(trip, e);
        const cat = trip.ski_categories.find((c) => c.id === p.ski_category)?.name;
        return (
          <dl key={p.key} className="rounded-xl border border-line bg-surface p-4 text-sm">
            <dt className="mb-2 text-base font-semibold">
              {`${p.first_name} ${p.last_name}`.trim() || `Person ${i + 1}`}
              {p.status === "withdrawn" && <span className="ml-2 text-sm font-normal text-muted">(zurückgezogen)</span>}
            </dt>
            <dd className="flex flex-col gap-1">
              <span className="text-muted">
                {p.phone} · {p.email} · geb. {p.birth_text}
              </span>
              <span>
                {e.arrival_date ? formatLong(e.arrival_date) : "Anreise offen"} – {e.departure_date ? formatLong(e.departure_date) : "Abreise offen"}
              </span>
              {trip.ski_enabled && (
                <span className="text-muted">
                  Skipass: {e.ski_need === "yes" ? (days.length ? `${formatShort(days[0])} – ${formatShort(days[days.length - 1])} (${days.length} Tage)` : "Zeitraum fehlt") : "nein"}
                  {e.ski_need === "yes" && cat ? `, ${cat}` : ""}
                </span>
              )}
              <span className="text-muted">
                Essen: {p.diet ? DIET_LABELS[p.diet] : "–"}
                {p.allergies ? `, Allergien: ${p.allergies}` : ""}
              </span>
            </dd>
          </dl>
        );
      })}
      {mode === "wizard" && (
        <div className="flex flex-wrap gap-2">
          {steps
            .filter((s) => s !== "review")
            .map((s) => (
              <Button key={s} type="button" size="sm" variant="ghost" onClick={() => setStepIdx(steps.indexOf(s))}>
                {STEP_LABELS[s]} ändern
              </Button>
            ))}
        </div>
      )}
    </div>
  );

  const sections: Record<StepId, ReactNode> = { persons: personsSection, stay: staySection, ski: skiSection, food: foodSection, review };

  if (mode === "full") {
    return (
      <form onSubmit={submit} className="flex flex-col gap-6" noValidate>
        {steps
          .filter((s) => s !== "review")
          .map((s) => (
            <section key={s} className="rounded-xl border border-line bg-surface p-4">
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
          <li key={s} className="flex min-w-0 flex-1 flex-col gap-1">
            <span className={cx("h-1.5 rounded-full", i <= stepIdx ? "bg-pine-500" : "bg-line")} />
            <span className={cx("truncate text-[11px]", i === stepIdx ? "font-semibold text-ink" : "text-faint")} aria-current={i === stepIdx ? "step" : undefined}>
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

/** Setzt beim Tippen automatisch Punkte: "24121995" → "24.12.1995". Löschen bleibt möglich. */
function autoDots(next: string, prev: string): string {
  if (next.length < prev.length) return next;
  const raw = next.replace(/[^\d.]/g, "");
  // Eigene Schreibweise (z. B. "1.2.1990") nicht verändern
  const manual = [...raw].some((c, i) => c === "." && i !== 2 && i !== 5);
  if (manual) return raw.slice(0, 10);
  if (raw.endsWith(".") && (raw.length === 3 || raw.length === 6)) return raw;
  const digits = next.replace(/[^\d]/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4)}`;
}

function Deviation({ area, checked, onToggle, title, children }: { area: string; checked: boolean; onToggle: (on: boolean) => void; title: string; children: ReactNode }) {
  return (
    <div className={cx("rounded-xl border bg-surface p-3", checked ? "border-pine-200" : "border-line")} data-testid={`own-${area}`}>
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
