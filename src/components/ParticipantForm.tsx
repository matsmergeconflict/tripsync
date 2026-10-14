"use client";

import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Button, Field, Input, Notice, Segmented, Select, Textarea, cx } from "./ui";
import { MultiDayCalendar, RangeCalendar } from "./TripCalendar";
import { eachDay, formatLong, formatShort, isWithin, type ISODate } from "@/lib/dates";
import { DIET_LABELS, type Diet, type MealMode, type Participant, type SkiCategory, type SkiNeed, type StayStatus } from "@/lib/types";

export interface FormTrip {
  name: string;
  start_date: ISODate;
  end_date: ISODate;
  ski_enabled: boolean;
  ski_categories: SkiCategory[];
  ski_notes?: string | null;
}

export interface FormState {
  first_name: string;
  last_name: string;
  contact: string;
  comment: string;
  arrival_date: ISODate | null;
  arrival_time: string;
  departure_date: ISODate | null;
  departure_time: string;
  stay_status: StayStatus;
  ski_need: SkiNeed;
  ski_days: ISODate[];
  ski_category: string;
  ski_discount: string;
  share_ski_public: boolean;
  meal_mode: MealMode;
  meal_days: ISODate[];
  diet: Diet | "";
  food_wishes: string;
  allergies: string;
  org_note?: string;
  status?: "active" | "withdrawn";
}

export function emptyForm(): FormState {
  return {
    first_name: "",
    last_name: "",
    contact: "",
    comment: "",
    arrival_date: null,
    arrival_time: "",
    departure_date: null,
    departure_time: "",
    stay_status: "confirmed",
    ski_need: "unknown",
    ski_days: [],
    ski_category: "",
    ski_discount: "",
    share_ski_public: false,
    meal_mode: "all_present",
    meal_days: [],
    diet: "",
    food_wishes: "",
    allergies: "",
  };
}

export function formFromParticipant(p: Omit<Participant, "org_note"> & { org_note?: string | null }): FormState {
  return {
    first_name: p.first_name,
    last_name: p.last_name ?? "",
    contact: p.contact ?? "",
    comment: p.comment ?? "",
    arrival_date: p.arrival_date,
    arrival_time: p.arrival_time ?? "",
    departure_date: p.departure_date,
    departure_time: p.departure_time ?? "",
    stay_status: p.stay_status,
    ski_need: p.ski_need,
    ski_days: p.ski_days ?? [],
    ski_category: p.ski_category ?? "",
    ski_discount: p.ski_discount ?? "",
    share_ski_public: p.share_ski_public,
    meal_mode: p.meal_mode,
    meal_days: p.meal_days ?? [],
    diet: p.diet ?? "",
    food_wishes: p.food_wishes ?? "",
    allergies: p.allergies ?? "",
    org_note: p.org_note ?? "",
    status: p.status,
  };
}

/** Wandelt den Formularzustand in die API-Nutzlast um. */
export function toPayload(f: FormState, includeOrg = false) {
  return {
    first_name: f.first_name,
    last_name: f.last_name,
    contact: f.contact || null,
    comment: f.comment || null,
    arrival_date: f.arrival_date,
    arrival_time: f.arrival_time || null,
    departure_date: f.departure_date,
    departure_time: f.departure_time || null,
    stay_status: f.stay_status,
    ski_need: f.ski_need,
    ski_days: f.ski_need === "no" ? [] : f.ski_days,
    ski_category: f.ski_need === "no" ? null : f.ski_category || null,
    ski_discount: f.ski_need === "no" ? null : f.ski_discount || null,
    share_ski_public: f.share_ski_public,
    meal_mode: f.meal_mode,
    meal_days: f.meal_mode === "custom" ? f.meal_days : [],
    diet: f.meal_mode === "none" ? f.diet || null : f.diet || null,
    food_wishes: f.food_wishes || null,
    allergies: f.allergies || null,
    ...(f.status ? { status: f.status } : {}),
    ...(includeOrg ? { org_note: f.org_note || null } : {}),
  };
}

type StepId = "person" | "stay" | "ski" | "food" | "review";

const STEP_LABELS: Record<StepId, string> = {
  person: "Person",
  stay: "Aufenthalt",
  ski: "Skipass",
  food: "Essen",
  review: "Prüfen",
};

const FIELD_STEP: Record<string, StepId> = {
  first_name: "person",
  last_name: "person",
  contact: "person",
  comment: "person",
  arrival_date: "stay",
  departure_date: "stay",
  arrival_time: "stay",
  departure_time: "stay",
  ski_days: "ski",
  ski_category: "ski",
  meal_days: "food",
  diet: "food",
  allergies: "food",
};

interface Props {
  trip: FormTrip;
  initial: FormState;
  mode: "wizard" | "full";
  submitLabel: string;
  onSubmit: (f: FormState) => Promise<void>;
  serverErrors?: Record<string, string>;
  /** Zusatzfelder (z. B. interne Notiz für Organisatoren) */
  orgFields?: boolean;
  busy?: boolean;
  footer?: ReactNode;
}

export function ParticipantForm({ trip, initial, mode, submitLabel, onSubmit, serverErrors = {}, orgFields, busy, footer }: Props) {
  const [f, setF] = useState<FormState>(initial);
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});
  const steps: StepId[] = useMemo(() => ["person", "stay", ...(trip.ski_enabled ? (["ski"] as StepId[]) : []), "food", "review"], [trip.ski_enabled]);
  const [stepIdx, setStepIdx] = useState(0);
  const errors = { ...serverErrors, ...localErrors };
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setF((prev) => ({ ...prev, [k]: v }));
    setLocalErrors((e) => {
      const { [k as string]: _drop, ...rest } = e;
      return rest;
    });
  };

  const validate = (only?: StepId): Record<string, string> => {
    const e: Record<string, string> = {};
    if ((!only || only === "person") && !f.first_name.trim()) e.first_name = "Bitte gib deinen Vornamen an.";
    if (!only || only === "stay") {
      if (f.arrival_date && f.departure_date && f.departure_date < f.arrival_date) e.departure_date = "Abreise darf nicht vor der Anreise liegen.";
    }
    return e;
  };

  const current = steps[stepIdx];

  const next = () => {
    const e = validate(current);
    setLocalErrors(e);
    if (Object.keys(e).length) return;
    setStepIdx((i) => Math.min(i + 1, steps.length - 1));
    window.scrollTo({ top: 0 });
  };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (mode === "wizard" && current !== "review") return next();
    const e = validate();
    setLocalErrors(e);
    if (Object.keys(e).length) {
      if (mode === "wizard") setStepIdx(steps.indexOf(FIELD_STEP[Object.keys(e)[0]] ?? "person"));
      return;
    }
    await onSubmit(f);
  };

  // Bei Serverfehlern im Assistenten zum betroffenen Schritt springen
  const serverKey = Object.keys(serverErrors)[0];
  const [lastServerKey, setLastServerKey] = useState<string | undefined>(undefined);
  if (mode === "wizard" && serverKey && serverKey !== lastServerKey) {
    setLastServerKey(serverKey);
    const target = FIELD_STEP[serverKey];
    if (target && steps.includes(target)) setStepIdx(steps.indexOf(target));
  }

  const stayDays = f.arrival_date && f.departure_date && f.arrival_date <= f.departure_date ? eachDay(f.arrival_date, f.departure_date) : [];

  const sections: Record<StepId, ReactNode> = {
    person: (
      <div className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Vorname" error={errors.first_name}>
            {(p) => <Input {...p} autoComplete="given-name" value={f.first_name} onChange={(e) => set("first_name", e.target.value)} maxLength={60} required />}
          </Field>
          <Field label="Nachname" optional error={errors.last_name}>
            {(p) => <Input {...p} autoComplete="family-name" value={f.last_name} onChange={(e) => set("last_name", e.target.value)} maxLength={60} />}
          </Field>
        </div>
        <Field label="Kontakt" optional hint="Telefon oder E-Mail – nur für die Organisatoren sichtbar." error={errors.contact}>
          {(p) => <Input {...p} autoComplete="tel" value={f.contact} onChange={(e) => set("contact", e.target.value)} maxLength={200} />}
        </Field>
        <Field label="Nachricht an die Organisatoren" optional hint="Nicht öffentlich sichtbar." error={errors.comment}>
          {(p) => <Textarea {...p} value={f.comment} onChange={(e) => set("comment", e.target.value)} maxLength={2000} />}
        </Field>
      </div>
    ),
    stay: (
      <div className="flex flex-col gap-4">
        <RangeCalendar
          label="Anreise und Abreise wählen"
          start={trip.start_date}
          end={trip.end_date}
          from={f.arrival_date}
          to={f.departure_date}
          onChange={(a, d) => {
            set("arrival_date", a);
            set("departure_date", d);
          }}
        />
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg bg-sunken px-3 py-2">
            <div className="text-xs text-muted">Anreise</div>
            <div className="font-semibold" data-testid="arrival-display">{f.arrival_date ? formatShort(f.arrival_date) : "noch offen"}</div>
          </div>
          <div className={cx("rounded-lg px-3 py-2", errors.departure_date ? "bg-danger-soft" : "bg-sunken")}>
            <div className="text-xs text-muted">Abreise</div>
            <div className="font-semibold" data-testid="departure-display">{f.departure_date ? formatShort(f.departure_date) : "noch offen"}</div>
          </div>
        </div>
        {(errors.departure_date || errors.arrival_date) && (
          <p role="alert" className="text-sm font-medium text-danger">
            {errors.departure_date || errors.arrival_date}
          </p>
        )}
        {(f.arrival_date || f.departure_date) && (
          <div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                set("arrival_date", null);
                set("departure_date", null);
              }}
            >
              Daten zurücksetzen
            </Button>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Ankunftszeit" optional>
            {(p) => <Input {...p} type="time" value={f.arrival_time} onChange={(e) => set("arrival_time", e.target.value)} />}
          </Field>
          <Field label="Abfahrtszeit" optional>
            {(p) => <Input {...p} type="time" value={f.departure_time} onChange={(e) => set("departure_time", e.target.value)} />}
          </Field>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Wie sicher sind diese Angaben?</span>
          <Segmented
            label="Status der Angaben"
            value={f.stay_status}
            onChange={(v) => set("stay_status", v)}
            options={[
              { value: "confirmed", label: "Bestätigt" },
              { value: "tentative", label: "Noch unklar" },
            ]}
          />
        </div>
      </div>
    ),
    ski: (
      <div className="flex flex-col gap-4">
        {trip.ski_notes && <Notice>{trip.ski_notes}</Notice>}
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Brauchst du einen Skipass?</span>
          <Segmented
            label="Skipass erforderlich"
            value={f.ski_need}
            onChange={(v) => set("ski_need", v)}
            options={[
              { value: "yes", label: "Ja" },
              { value: "no", label: "Nein" },
              { value: "unknown", label: "Weiß noch nicht" },
            ]}
          />
        </div>
        {f.ski_need !== "no" && (
          <>
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">An welchen Tagen willst du Ski fahren?</span>
              <p className="text-xs text-muted">Tage antippen zum An- und Abwählen. Grau hinterlegt: Tage, an denen du vor Ort bist.</p>
              <div className="flex flex-wrap gap-2">
                {stayDays.length > 0 && (
                  <Button type="button" size="sm" onClick={() => set("ski_days", stayDays)}>
                    Alle Aufenthaltstage
                  </Button>
                )}
                {stayDays.length > 2 && (
                  <Button type="button" size="sm" onClick={() => set("ski_days", stayDays.slice(1, -1))}>
                    Ohne An- und Abreisetag
                  </Button>
                )}
                {f.ski_days.length > 0 && (
                  <Button type="button" size="sm" variant="ghost" onClick={() => set("ski_days", [])}>
                    Keine
                  </Button>
                )}
              </div>
              <SkiRangeQuickPick trip={trip} onApply={(days) => set("ski_days", days)} />
              <MultiDayCalendar
                label="Skitage"
                start={trip.start_date}
                end={trip.end_date}
                value={f.ski_days}
                onChange={(d) => set("ski_days", d)}
                context={{ from: f.arrival_date, to: f.departure_date }}
              />
              <p className="text-sm text-muted" aria-live="polite" data-testid="ski-day-count">
                {f.ski_days.length ? `${f.ski_days.length} Skitag${f.ski_days.length === 1 ? "" : "e"}: ${f.ski_days.map(formatShort).join(", ")}` : "Noch keine Skitage gewählt."}
              </p>
              {stayDays.length > 0 && f.ski_days.some((d) => !isWithin(d, f.arrival_date!, f.departure_date!)) && (
                <Notice tone="warn">Mindestens ein Skitag liegt außerhalb deines Aufenthalts.</Notice>
              )}
              {errors.ski_days && <p className="text-sm font-medium text-danger">{errors.ski_days}</p>}
            </div>
            {trip.ski_categories.length > 0 && (
              <Field label="Passkategorie" error={errors.ski_category} optional={f.ski_need === "unknown"}>
                {(p) => (
                  <Select {...p} value={f.ski_category} onChange={(e) => set("ski_category", e.target.value)}>
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
            )}
            <Field label="Ermäßigung" optional hint="z. B. Studierendenausweis, Saisonkarte vorhanden">
              {(p) => <Input {...p} value={f.ski_discount} onChange={(e) => set("ski_discount", e.target.value)} maxLength={200} />}
            </Field>
            <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 size-5 accent-pine-600"
                checked={f.share_ski_public}
                onChange={(e) => set("share_ski_public", e.target.checked)}
              />
              <span>Meine Skitage in der gemeinsamen Übersicht zeigen (damit andere sich anschließen können).</span>
            </label>
          </>
        )}
      </div>
    ),
    food: (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Isst du bei den gemeinsamen Mahlzeiten mit?</span>
          <Segmented
            label="Teilnahme an gemeinsamen Mahlzeiten"
            value={f.meal_mode}
            onChange={(v) => set("meal_mode", v)}
            options={[
              { value: "all_present", label: "Ja, an allen Tagen vor Ort" },
              { value: "custom", label: "Nur an bestimmten Tagen" },
              { value: "none", label: "Nein" },
              { value: "unknown", label: "Weiß noch nicht" },
            ]}
          />
        </div>
        {f.meal_mode === "custom" && (
          <div className="flex flex-col gap-2">
            <MultiDayCalendar
              label="Essenstage"
              start={trip.start_date}
              end={trip.end_date}
              value={f.meal_days}
              onChange={(d) => set("meal_days", d)}
              context={{ from: f.arrival_date, to: f.departure_date }}
            />
            {errors.meal_days && <p className="text-sm font-medium text-danger">{errors.meal_days}</p>}
          </div>
        )}
        {f.meal_mode !== "none" && (
          <Field label="Ernährungsweise" error={errors.diet}>
            {(p) => (
              <Select {...p} value={f.diet} onChange={(e) => set("diet", e.target.value as Diet | "")}>
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
        <Field label="Essenswünsche" optional hint="z. B. „Ich bringe Frühstücksmüsli mit“ oder Lieblingsgericht">
          {(p) => <Textarea {...p} value={f.food_wishes} onChange={(e) => set("food_wishes", e.target.value)} maxLength={1000} rows={2} />}
        </Field>
        <Field
          label="Allergien oder Unverträglichkeiten"
          optional
          hint="Nur angeben, was für das Kochen wichtig ist. Diese Angabe sehen ausschließlich die Organisatoren – nie die öffentliche Übersicht."
        >
          {(p) => <Textarea {...p} value={f.allergies} onChange={(e) => set("allergies", e.target.value)} maxLength={1000} rows={2} />}
        </Field>
      </div>
    ),
    review: <Review f={f} trip={trip} onEdit={(s) => setStepIdx(steps.indexOf(s))} />,
  };

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
        {orgFields && (
          <section className="rounded-xl border border-line bg-surface p-4">
            <h2 className="mb-4 text-base font-semibold">Intern (nur Organisatoren)</h2>
            <Field label="Interne Notiz" optional>
              {(p) => <Textarea {...p} value={f.org_note ?? ""} onChange={(e) => set("org_note", e.target.value)} maxLength={2000} />}
            </Field>
          </section>
        )}
        {serverErrors._ && <p className="text-sm font-medium text-danger">{serverErrors._}</p>}
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

function SkiRangeQuickPick({ trip, onApply }: { trip: FormTrip; onApply: (days: ISODate[]) => void }) {
  const days = eachDay(trip.start_date, trip.end_date);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  return (
    <details className="rounded-lg border border-line bg-surface px-3 py-2 text-sm">
      <summary className="cursor-pointer select-none font-medium">Zeitraum von – bis auswählen</summary>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Field label="Erster Skitag">
          {(p) => (
            <Select {...p} value={from} onChange={(e) => setFrom(e.target.value)}>
              <option value="">–</option>
              {days.map((d) => (
                <option key={d} value={d}>
                  {formatShort(d)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Letzter Skitag">
          {(p) => (
            <Select {...p} value={to} onChange={(e) => setTo(e.target.value)}>
              <option value="">–</option>
              {days.map((d) => (
                <option key={d} value={d}>
                  {formatShort(d)}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <Button type="button" size="sm" className="mt-3" disabled={!from || !to || to < from} onClick={() => onApply(eachDay(from, to))}>
        Übernehmen
      </Button>
    </details>
  );
}

function Review({ f, trip, onEdit }: { f: FormState; trip: FormTrip; onEdit: (s: StepId) => void }) {
  const cat = trip.ski_categories.find((c) => c.id === f.ski_category)?.name;
  const rows: { step: StepId; label: string; value: ReactNode }[] = [
    { step: "person", label: "Name", value: `${f.first_name} ${f.last_name}`.trim() },
    { step: "person", label: "Kontakt", value: f.contact || "–" },
    {
      step: "stay",
      label: "Aufenthalt",
      value: (
        <>
          {f.arrival_date ? formatLong(f.arrival_date) : "Anreise offen"}
          {f.arrival_time && `, ${f.arrival_time} Uhr`}
          <br />
          bis {f.departure_date ? formatLong(f.departure_date) : "Abreise offen"}
          {f.departure_time && `, ${f.departure_time} Uhr`}
          <br />
          <span className="text-muted">{f.stay_status === "tentative" ? "noch unklar" : "bestätigt"}</span>
        </>
      ),
    },
    ...(trip.ski_enabled
      ? [
          {
            step: "ski" as StepId,
            label: "Skipass",
            value:
              f.ski_need === "no"
                ? "Nein"
                : `${f.ski_need === "yes" ? "Ja" : "Noch unklar"}${f.ski_days.length ? ` · ${f.ski_days.length} Tage (${f.ski_days.map(formatShort).join(", ")})` : " · keine Tage gewählt"}${cat ? ` · ${cat}` : ""}`,
          },
        ]
      : []),
    {
      step: "food",
      label: "Essen",
      value: `${{ all_present: "an allen Tagen vor Ort", custom: `an ${f.meal_days.length} Tagen`, none: "nein", unknown: "noch unklar" }[f.meal_mode]}${f.diet ? ` · ${DIET_LABELS[f.diet]}` : ""}${f.allergies ? " · Allergien angegeben" : ""}`,
    },
  ];
  return (
    <dl className="divide-y divide-line rounded-xl border border-line bg-surface" data-testid="review">
      {rows.map((r) => (
        <div key={r.label} className="flex items-start justify-between gap-3 px-4 py-3">
          <div>
            <dt className="text-xs text-muted">{r.label}</dt>
            <dd className="text-sm">{r.value}</dd>
          </div>
          <Button type="button" size="sm" variant="ghost" onClick={() => onEdit(r.step)}>
            Ändern
          </Button>
        </div>
      ))}
    </dl>
  );
}
