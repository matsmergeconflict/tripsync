"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useTrip } from "../TripContext";
import { ParticipantSheet, personName } from "../ParticipantSheet";
import { Gantt, GanttLegend, type GanttRow, type StatKey } from "@/components/Gantt";
import { Badge, Button, Card, Input, Segmented, Select, cx } from "@/components/ui";
import { formatLong, formatShort, groupByWeek } from "@/lib/dates";
import { dayRole, eatsOn, isComplete, skisOn } from "@/lib/stats";
import type { Participant } from "@/lib/types";

type Filter = "all" | "confirmed" | "tentative" | "incomplete";
type View = "gantt" | "day" | "list";

export function TimelineView() {
  const { data, days, active, stats, issues } = useTrip();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [view, setView] = useState<View>("gantt");
  const [sort, setSort] = useState<"arrival" | "name">("arrival");
  const [week, setWeek] = useState<string>("all");
  const [showSki, setShowSki] = useState(data.trip.ski_enabled);
  const [day, setDay] = useState<string>(days.includes(new Date().toISOString().slice(0, 10)) ? new Date().toISOString().slice(0, 10) : days[0]);
  const [openId, setOpenId] = useState<string | null>(null);

  const weeks = groupByWeek(days);
  const visibleDays = week === "all" ? days : weeks.find((w) => String(w.week) === week)?.days ?? days;

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return active
      .filter((p) => !needle || personName(p).toLowerCase().includes(needle))
      .filter((p) => {
        if (filter === "confirmed") return p.stay_status === "confirmed";
        if (filter === "tentative") return p.stay_status === "tentative";
        if (filter === "incomplete") return !isComplete(issues.get(p.id) ?? []);
        return true;
      })
      .sort((a, b) =>
        sort === "name"
          ? personName(a).localeCompare(personName(b), "de")
          : (a.arrival_date ?? "9999").localeCompare(b.arrival_date ?? "9999") ||
            (a.departure_date ?? "9999").localeCompare(b.departure_date ?? "9999") ||
            personName(a).localeCompare(personName(b), "de")
      );
  }, [active, q, filter, sort, issues]);

  const rows: GanttRow[] = filtered.map((p) => ({
    id: p.id,
    name: personName(p),
    arrival: p.arrival_date,
    departure: p.departure_date,
    arrivalTime: p.arrival_time,
    departureTime: p.departure_time,
    status: p.stay_status,
    skiDays: p.ski_need === "yes" ? p.ski_days : [],
    issueCount: (issues.get(p.id) ?? []).length,
  }));

  const statKeys: StatKey[] = ["present", "arrivals", "departures", ...(data.trip.ski_enabled ? (["skiPasses"] as StatKey[]) : []), "mealParticipants"];

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Zeitachse</h1>
          <p className="text-sm text-muted">
            {active.length} Personen · {formatShort(data.trip.start_date)} – {formatShort(data.trip.end_date)}
          </p>
        </div>
        <Segmented
          label="Ansicht"
          value={view}
          onChange={setView}
          options={[
            { value: "gantt", label: "Gesamt" },
            { value: "day", label: "Tag" },
            { value: "list", label: "Liste" },
          ]}
        />
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-3 sm:flex-row sm:flex-wrap sm:items-center">
        <Input type="search" placeholder="Name suchen …" aria-label="Name suchen" value={q} onChange={(e) => setQ(e.target.value)} className="sm:w-56" />
        <Select aria-label="Filter" value={filter} onChange={(e) => setFilter(e.target.value as Filter)} className="sm:w-56">
          <option value="all">Alle Anmeldungen</option>
          <option value="confirmed">Nur bestätigte Angaben</option>
          <option value="tentative">Nur unbestätigte Angaben</option>
          <option value="incomplete">Angaben fehlen</option>
        </Select>
        {view !== "day" && (
          <Select aria-label="Sortierung" value={sort} onChange={(e) => setSort(e.target.value as "arrival" | "name")} className="sm:w-48">
            <option value="arrival">Nach Anreise</option>
            <option value="name">Nach Name</option>
          </Select>
        )}
        {view === "gantt" && weeks.length > 1 && (
          <Select aria-label="Zeitraum" value={week} onChange={(e) => setWeek(e.target.value)} className="sm:w-48">
            <option value="all">Gesamter Zeitraum</option>
            {weeks.map((w) => (
              <option key={w.week} value={String(w.week)}>
                KW {w.week}: {formatShort(w.days[0])} – {formatShort(w.days[w.days.length - 1])}
              </option>
            ))}
          </Select>
        )}
        {view === "gantt" && data.trip.ski_enabled && (
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" className="size-5 accent-pine-600" checked={showSki} onChange={(e) => setShowSki(e.target.checked)} />
            Skitage zeigen
          </label>
        )}
      </div>

      {view === "gantt" && (
        <>
          <Gantt
            days={visibleDays}
            rows={rows}
            stats={stats}
            statKeys={statKeys}
            showSki={showSki}
            onRowClick={(r) => setOpenId(r.id)}
            onBarClick={(r) => setOpenId(r.id)}
            onDayClick={(d) => {
              setDay(d);
              setView("day");
            }}
            emptyText={q || filter !== "all" ? "Keine Personen für diesen Filter." : "Noch keine Anmeldungen – teile den Einladungslink in den Einstellungen."}
          />
          <GanttLegend showSki={showSki} />
          <p className="text-xs text-muted">Tipp: Auf einen Tag in der Kopfzeile tippen für die Tagesansicht.</p>
        </>
      )}

      {view === "day" && <DayView day={day} setDay={setDay} people={filtered} onOpen={setOpenId} />}

      {view === "list" && (
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <ul className="divide-y divide-line">
            {filtered.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => setOpenId(p.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-sunken">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{personName(p)}</span>
                    <span className="block text-sm text-muted">
                      {formatShort(p.arrival_date)} – {formatShort(p.departure_date)}
                    </span>
                  </span>
                  {p.stay_status === "tentative" && <Badge tone="warn">? unbestätigt</Badge>}
                  {(issues.get(p.id) ?? []).length > 0 && <Badge tone="warn">! {(issues.get(p.id) ?? []).length}</Badge>}
                </button>
              </li>
            ))}
            {filtered.length === 0 && <li className="px-4 py-8 text-center text-sm text-muted">Keine Personen.</li>}
          </ul>
        </div>
      )}

      <ParticipantSheet id={openId} onClose={() => setOpenId(null)} />
    </>
  );
}

function DayView({ day, setDay, people, onOpen }: { day: string; setDay: (d: string) => void; people: Participant[]; onOpen: (id: string) => void }) {
  const { days, stats, data } = useTrip();
  const s = stats.find((x) => x.day === day)!;
  const idx = days.indexOf(day);
  const groups = {
    arrival: people.filter((p) => ["arrival", "arrival_departure"].includes(dayRole(p, day) ?? "")),
    stay: people.filter((p) => dayRole(p, day) === "stay"),
    departure: people.filter((p) => ["departure", "arrival_departure"].includes(dayRole(p, day) ?? "")),
  };
  const skiers = people.filter((p) => skisOn(p, day));
  const eaters = people.filter((p) => eatsOn(p, day) === true);
  const unknownMeal = people.filter((p) => eatsOn(p, day) === null && ["arrival", "departure", "stay", "arrival_departure"].includes(dayRole(p, day) ?? ""));

  return (
    <div className="flex flex-col gap-4" data-testid="day-view">
      <div className="flex items-center gap-2">
        <Button size="sm" disabled={idx <= 0} onClick={() => setDay(days[idx - 1])} aria-label="Vorheriger Tag">
          ←
        </Button>
        <Select aria-label="Tag wählen" value={day} onChange={(e) => setDay(e.target.value)} className="max-w-xs">
          {days.map((d) => (
            <option key={d} value={d}>
              {formatLong(d)}
            </option>
          ))}
        </Select>
        <Button size="sm" disabled={idx >= days.length - 1} onClick={() => setDay(days[idx + 1])} aria-label="Nächster Tag">
          →
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          ["Anwesend", s.present, s.presentTentative ? `${s.presentTentative} unbestätigt` : ""],
          ["Anreisen", s.arrivals, ""],
          ["Abreisen", s.departures, ""],
          ...(data.trip.ski_enabled ? [["Skipässe", s.skiPasses, ""]] : []),
          ["Essen", s.mealParticipants, s.mealUnknown ? `${s.mealUnknown} unklar` : ""],
        ].map(([l, v, sub]) => (
          <div key={l as string} className="rounded-xl border border-line bg-surface p-3">
            <div className="text-xs text-muted">{l}</div>
            <div className="text-2xl font-semibold tabular-nums">{v}</div>
            {sub && <div className="text-xs text-amber-ink">{sub}</div>}
          </div>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Card title={`Reisen an (${groups.arrival.length})`}>
          <PeopleChips onOpen={onOpen} items={groups.arrival} empty="Niemand." />
        </Card>
        <Card title={`Ganztägig da (${groups.stay.length})`}>
          <PeopleChips onOpen={onOpen} items={groups.stay} empty="Niemand." />
        </Card>
        <Card title={`Reisen ab (${groups.departure.length})`}>
          <PeopleChips onOpen={onOpen} items={groups.departure} empty="Niemand." />
        </Card>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {data.trip.ski_enabled && (
          <Card
            title={`Skipass (${skiers.length})`}
            actions={
              <Link href={`/trips/${data.trip.id}/ski`} className="text-sm font-medium text-pine-700">
                Skipass-Übersicht →
              </Link>
            }
          >
            <PeopleChips onOpen={onOpen} items={skiers} empty="Niemand fährt an diesem Tag." />
          </Card>
        )}
        <Card title={`Gemeinsames Essen (${eaters.length})`}>
          <PeopleChips onOpen={onOpen} items={eaters} empty="Niemand." />
          {unknownMeal.length > 0 && (
            <div className="mt-3">
              <div className="mb-1 text-xs font-medium text-amber-ink">Noch unklar ({unknownMeal.length})</div>
              <PeopleChips onOpen={onOpen} items={unknownMeal} empty="" />
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function PeopleChips({ items, empty, onOpen }: { items: Participant[]; empty: string; onOpen: (id: string) => void }) {
  if (!items.length) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((p) => (
        <li key={p.id}>
          <button
            type="button"
            onClick={() => onOpen(p.id)}
            className={cx("rounded-md border px-2 py-1 text-sm hover:bg-sunken", p.stay_status === "tentative" ? "border-dashed border-amber-line" : "border-line")}
          >
            {personName(p)}
            {p.stay_status === "tentative" && <span className="ml-1 text-amber-ink">?</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}
