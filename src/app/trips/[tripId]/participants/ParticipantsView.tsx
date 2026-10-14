"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTrip } from "../TripContext";
import { AddParticipantSheet, ParticipantSheet, personName } from "../ParticipantSheet";
import { Badge, Button, Input, Select, cx } from "@/components/ui";
import { formatShort } from "@/lib/dates";
import { ISSUE_LABELS, ISSUE_SEVERITY, isComplete, isPresent } from "@/lib/stats";
import type { Participant } from "@/lib/types";

type Filter = "all" | "incomplete" | "confirmed" | "tentative" | "ski" | "withdrawn" | "arrival" | "departure" | "present";
type SortKey = "name" | "arrival" | "departure" | "status";

export function ParticipantsView() {
  const { data, days, issues, tripId } = useTrip();
  const params = useSearchParams();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>((params.get("filter") as Filter) ?? "all");
  const [filterDay, setFilterDay] = useState(days[0]);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "arrival", dir: 1 });
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const needsDay = filter === "arrival" || filter === "departure" || filter === "present";

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rows = data.participants.filter((p) => {
      if (needle && !`${personName(p)} ${p.contact ?? ""}`.toLowerCase().includes(needle)) return false;
      if (filter === "withdrawn") return p.status === "withdrawn";
      if (p.status === "withdrawn" && filter !== "all") return false;
      switch (filter) {
        case "incomplete":
          return !isComplete(issues.get(p.id) ?? []);
        case "confirmed":
          return p.stay_status === "confirmed";
        case "tentative":
          return p.stay_status === "tentative";
        case "ski":
          return p.ski_need === "yes";
        case "arrival":
          return p.arrival_date === filterDay;
        case "departure":
          return p.departure_date === filterDay;
        case "present":
          return isPresent(p, filterDay);
        default:
          return true;
      }
    });
    const val = (p: Participant): string => {
      switch (sort.key) {
        case "name":
          return personName(p).toLowerCase();
        case "arrival":
          return p.arrival_date ?? "9999";
        case "departure":
          return p.departure_date ?? "9999";
        case "status":
          return `${p.status}${p.stay_status}`;
      }
    };
    return rows.sort((a, b) => val(a).localeCompare(val(b), "de") * sort.dir || personName(a).localeCompare(personName(b), "de"));
  }, [data.participants, q, filter, filterDay, sort, issues]);

  const skiLabel = (p: Participant) =>
    !data.trip.ski_enabled ? null : p.ski_need === "yes" && !p.ski_days.length ? (
      <Badge tone="warn">❄ Tage fehlen</Badge>
    ) : p.ski_need === "yes" ? (
      <Badge tone="info">❄ {p.ski_days.length} Tage</Badge>
    ) : p.ski_need === "no" ? (
      <Badge>kein Skipass</Badge>
    ) : (
      <Badge tone="warn">Skipass ?</Badge>
    );

  const completeness = (p: Participant) => {
    const iss = issues.get(p.id) ?? [];
    const missing = iss.filter((i) => ISSUE_SEVERITY[i] === "missing");
    if (!missing.length)
      return iss.length ? (
        <Badge tone="neutral" className="cursor-help" >
          <span title={iss.map((i) => ISSUE_LABELS[i]).join(", ")}>vollständig · {iss.length} Hinweis{iss.length > 1 ? "e" : ""}</span>
        </Badge>
      ) : (
        <Badge tone="ok">✓ vollständig</Badge>
      );
    return (
      <Badge tone="warn">
        <span title={missing.map((i) => ISSUE_LABELS[i]).join(", ")}>! {missing.length} fehlt</span>
      </Badge>
    );
  };

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Teilnehmer</h1>
          <p className="text-sm text-muted">
            {list.length} von {data.participants.length} Anmeldungen
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`/api/trips/${tripId}/export?type=participants`} download>
            <Button>CSV-Export</Button>
          </a>
          <Button variant="primary" onClick={() => setAdding(true)}>
            + Person hinzufügen
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-3 sm:flex-row sm:flex-wrap sm:items-center">
        <Input type="search" placeholder="Name oder Kontakt suchen …" aria-label="Suchen" value={q} onChange={(e) => setQ(e.target.value)} className="sm:w-64" />
        <Select aria-label="Filter" value={filter} onChange={(e) => setFilter(e.target.value as Filter)} className="sm:w-60">
          <option value="all">Alle</option>
          <option value="incomplete">Angaben fehlen</option>
          <option value="confirmed">Anmeldung bestätigt</option>
          <option value="tentative">Angaben unbestätigt</option>
          {data.trip.ski_enabled && <option value="ski">Skipass benötigt</option>}
          <option value="arrival">Anreise am …</option>
          <option value="departure">Abreise am …</option>
          <option value="present">Anwesend am …</option>
          <option value="withdrawn">Zurückgezogen</option>
        </Select>
        {needsDay && (
          <Select aria-label="Tag" value={filterDay} onChange={(e) => setFilterDay(e.target.value)} className="sm:w-44">
            {days.map((d) => (
              <option key={d} value={d}>
                {formatShort(d)}
              </option>
            ))}
          </Select>
        )}
      </div>

      {/* Desktop: Tabelle */}
      <div className="hidden overflow-x-auto rounded-xl border border-line bg-surface md:block">
        <table className="w-full text-sm" data-testid="participants-table">
          <thead className="border-b border-line bg-canvas text-left text-xs text-muted">
            <tr>
              <th className="px-4 py-2.5">
                <SortButton k="name" sort={sort} setSort={setSort}>Name</SortButton>
              </th>
              <th className="px-3 py-2.5">
                <SortButton k="arrival" sort={sort} setSort={setSort}>Anreise</SortButton>
              </th>
              <th className="px-3 py-2.5">
                <SortButton k="departure" sort={sort} setSort={setSort}>Abreise</SortButton>
              </th>
              <th className="px-3 py-2.5">
                <SortButton k="status" sort={sort} setSort={setSort}>Status</SortButton>
              </th>
              {data.trip.ski_enabled && <th className="px-3 py-2.5 font-medium">Skipass</th>}
              <th className="px-3 py-2.5 font-medium">Vollständigkeit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {list.map((p) => (
              <tr key={p.id} className={cx("cursor-pointer hover:bg-sunken", p.status === "withdrawn" && "text-faint")} onClick={() => setOpenId(p.id)}>
                <td className="px-4 py-2.5">
                  <button type="button" className="font-medium hover:underline" onClick={() => setOpenId(p.id)}>
                    {personName(p)}
                  </button>
                </td>
                <td className="px-3 py-2.5 tabular-nums">
                  {formatShort(p.arrival_date)}
                  {p.arrival_time && <span className="text-muted"> {p.arrival_time}</span>}
                </td>
                <td className="px-3 py-2.5 tabular-nums">
                  {formatShort(p.departure_date)}
                  {p.departure_time && <span className="text-muted"> {p.departure_time}</span>}
                </td>
                <td className="px-3 py-2.5">
                  {p.status === "withdrawn" ? (
                    <Badge>zurückgezogen</Badge>
                  ) : !p.arrival_date && !p.departure_date ? (
                    <Badge tone="warn">! keine Reisedaten</Badge>
                  ) : p.stay_status === "tentative" ? (
                    <Badge tone="warn">? unbestätigt</Badge>
                  ) : (
                    <Badge tone="ok">bestätigt</Badge>
                  )}
                </td>
                {data.trip.ski_enabled && <td className="px-3 py-2.5">{skiLabel(p)}</td>}
                <td className="px-3 py-2.5">{completeness(p)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.length === 0 && <p className="px-4 py-8 text-center text-sm text-muted">Keine Anmeldungen für diesen Filter.</p>}
      </div>

      {/* Mobil: Karten */}
      <ul className="flex flex-col gap-2 md:hidden">
        {list.map((p) => (
          <li key={p.id}>
            <button type="button" onClick={() => setOpenId(p.id)} className={cx("flex w-full flex-col gap-2 rounded-xl border border-line bg-surface p-3 text-left", p.status === "withdrawn" && "opacity-60")}>
              <span className="flex items-center justify-between gap-2">
                <span className="font-medium">{personName(p)}</span>
                {p.status === "withdrawn" ? <Badge>zurückgezogen</Badge> : p.stay_status === "tentative" ? <Badge tone="warn">? unbestätigt</Badge> : null}
              </span>
              <span className="text-sm tabular-nums text-muted">
                {formatShort(p.arrival_date)} – {formatShort(p.departure_date)}
              </span>
              <span className="flex flex-wrap gap-1.5">
                {skiLabel(p)}
                {completeness(p)}
              </span>
            </button>
          </li>
        ))}
        {list.length === 0 && <li className="py-8 text-center text-sm text-muted">Keine Anmeldungen für diesen Filter.</li>}
      </ul>

      <ParticipantSheet id={openId} onClose={() => setOpenId(null)} />
      <AddParticipantSheet open={adding} onClose={() => setAdding(false)} />
    </>
  );
}

type SortState = { key: SortKey; dir: 1 | -1 };

function SortButton({ k, sort, setSort, children }: { k: SortKey; sort: SortState; setSort: (f: (s: SortState) => SortState) => void; children: string }) {
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 font-medium hover:text-ink"
      onClick={() => setSort((s) => ({ key: k, dir: s.key === k ? ((-s.dir) as 1 | -1) : 1 }))}
      aria-label={`Nach ${children} sortieren`}
    >
      {children}
      {sort.key === k && <span aria-hidden>{sort.dir === 1 ? "↑" : "↓"}</span>}
    </button>
  );
}
