"use client";

import type { CSSProperties } from "react";
import { cx } from "./ui";
import { dayOfMonth, formatShort, groupByWeek, weekdayIndex, weekdayShort, type ISODate } from "@/lib/dates";
import type { DayStats } from "@/lib/stats";

export interface GanttRow {
  id: string;
  name: string;
  arrival: ISODate | null;
  departure: ISODate | null;
  arrivalTime?: string | null;
  departureTime?: string | null;
  status: "confirmed" | "tentative";
  skiDays?: ISODate[];
  issueCount?: number;
}

export type StatKey = "present" | "arrivals" | "departures" | "skiPasses" | "mealParticipants";

const STAT_LABELS: Record<StatKey, { label: string; short: string }> = {
  present: { label: "Anwesend", short: "Anw." },
  arrivals: { label: "Anreisen", short: "An" },
  departures: { label: "Abreisen", short: "Ab" },
  skiPasses: { label: "Skipässe", short: "Ski" },
  mealParticipants: { label: "Essen", short: "Essen" },
};

interface Props {
  days: ISODate[];
  rows: GanttRow[];
  stats?: DayStats[];
  statKeys?: StatKey[];
  showSki?: boolean;
  selectedDay?: ISODate | null;
  onDayClick?: (day: ISODate) => void;
  onRowClick?: (row: GanttRow) => void;
  onBarClick?: (row: GanttRow) => void;
  emptyText?: string;
}

function ArrivalIcon() {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5 shrink-0" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 8h8M7 5l3 3-3 3M13 3v10" />
    </svg>
  );
}

function DepartureIcon() {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5 shrink-0" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v10M6 8h8M11 5l3 3-3 3" />
    </svg>
  );
}

export function describeStay(r: Pick<GanttRow, "name" | "arrival" | "departure" | "status" | "arrivalTime" | "departureTime">): string {
  const parts = [r.name];
  parts.push(r.arrival ? `Anreise ${formatShort(r.arrival)}${r.arrivalTime ? ` ${r.arrivalTime}` : ""}` : "Anreise fehlt");
  parts.push(r.departure ? `Abreise ${formatShort(r.departure)}${r.departureTime ? ` ${r.departureTime}` : ""}` : "Abreise fehlt");
  parts.push(r.status === "tentative" ? "noch unbestätigt" : "bestätigt");
  return parts.join(", ");
}

/**
 * Gantt-Zeitachse: eine Zeile pro Person, ein zusammenhängender Balken pro Aufenthalt.
 * Anreise/Abreise, unbestätigte Zeiträume und fehlende Angaben werden durch Form, Muster,
 * Symbol UND Text unterschieden – nicht nur durch Farbe.
 */
export function Gantt({ days, rows, stats, statKeys = ["present", "arrivals", "departures"], showSki, selectedDay, onDayClick, onRowClick, onBarClick, emptyText }: Props) {
  const first = days[0];
  const last = days[days.length - 1];
  const col = (d: ISODate) => days.indexOf(d) + 2; // Spalte 1 = Namen
  const weeks = groupByWeek(days);
  const statMap = new Map((stats ?? []).map((s) => [s.day, s]));
  const headerRows = 2;
  const statRows = stats ? statKeys.length : 0;
  const firstDataRow = headerRows + statRows + 1;

  const gridStyle: CSSProperties = {
    gridTemplateColumns: `var(--name-w) repeat(${days.length}, var(--day-w))`,
  };

  const isWeekend = (d: ISODate) => weekdayIndex(d) >= 5;

  return (
    <div
      className="scroll-x relative rounded-xl border border-line bg-surface [--day-w:42px] [--name-w:118px] sm:max-h-[74vh] sm:overflow-y-auto sm:[--day-w:52px] sm:[--name-w:200px]"
      data-testid="gantt"
    >
      <div className="grid w-max min-w-full" style={gridStyle} role="table" aria-label="Zeitachse der Anwesenheiten" aria-rowcount={rows.length + 1}>
        {/* Wochenzeile */}
        <div role="row" className="contents">
          <div className="sticky left-0 top-0 z-30 h-[25px] border-b border-line bg-surface" style={{ gridColumn: 1, gridRow: 1 }} />
          {weeks.map((w) => (
            <div
              key={`w${w.days[0]}`}
              className="sticky top-0 z-20 h-[25px] truncate border-b border-l border-line bg-surface px-2 py-1 text-[11px] leading-[15px] font-medium uppercase tracking-wide text-faint"
              style={{ gridColumn: `${col(w.days[0])} / span ${w.days.length}`, gridRow: 1 }}
            >
              KW {w.week}
            </div>
          ))}
        </div>

        {/* Tageszeile */}
        <div role="row" className="contents">
          <div role="columnheader" className="sticky left-0 top-[25px] z-30 flex items-end border-b border-r border-line bg-surface px-3 pb-1.5 text-xs font-medium text-muted" style={{ gridColumn: 1, gridRow: 2 }}>
            Person
          </div>
          {days.map((d) => (
            <button
              key={d}
              type="button"
              onClick={onDayClick ? () => onDayClick(d) : undefined}
              disabled={!onDayClick}
              aria-pressed={selectedDay === d}
              aria-label={`${formatShort(d)}${onDayClick ? " – Tagesansicht öffnen" : ""}`}
              className={cx(
                "sticky top-[25px] z-20 flex flex-col items-center border-b border-l border-line py-1 leading-tight",
                isWeekend(d) ? "bg-sunken" : "bg-surface",
                selectedDay === d && "!bg-pine-100 text-pine-800",
                onDayClick && "cursor-pointer hover:bg-pine-50"
              )}
              style={{ gridColumn: col(d), gridRow: 2 }}
            >
              <span className="text-[11px] text-muted">{weekdayShort(d)}</span>
              <span className="text-sm font-semibold">{dayOfMonth(d)}.</span>
            </button>
          ))}
        </div>

        {/* Tagesauswertung */}
        {stats &&
          statKeys.map((key, i) => {
            const r = headerRows + i + 1;
            return (
              <div role="row" key={key} className="contents">
                <div
                  role="rowheader"
                  className={cx("sticky left-0 z-10 flex items-center border-r border-line bg-canvas px-3 text-xs font-medium text-muted", i === statKeys.length - 1 && "border-b")}
                  style={{ gridColumn: 1, gridRow: r }}
                >
                  <span className="hidden sm:inline">{STAT_LABELS[key].label}</span>
                  <span className="sm:hidden">{STAT_LABELS[key].short}</span>
                </div>
                {days.map((d) => {
                  const s = statMap.get(d);
                  const v = s ? (s[key] as number) : 0;
                  const tentative = key === "present" ? s?.presentTentative : key === "skiPasses" ? s?.skiPassesTentative : 0;
                  return (
                    <div
                      role="cell"
                      key={d}
                      data-stat={key}
                      data-day={d}
                      className={cx(
                        "flex h-7 items-center justify-center border-l border-line bg-canvas text-xs tabular-nums",
                        i === statKeys.length - 1 && "border-b",
                        key === "present" ? "font-semibold text-ink" : v ? "text-ink" : "text-faint",
                        selectedDay === d && "!bg-pine-100"
                      )}
                      style={{ gridColumn: col(d), gridRow: r }}
                      title={tentative ? `${v} (davon ${tentative} unbestätigt)` : undefined}
                    >
                      {v || (key === "present" ? "0" : "·")}
                      {!!tentative && <span className="ml-0.5 text-[10px] text-amber-ink">?</span>}
                    </div>
                  );
                })}
              </div>
            );
          })}

        {/* Personenzeilen */}
        {rows.map((row, i) => {
          const r = firstDataRow + i;
          const hasBoth = !!row.arrival && !!row.departure && row.arrival <= row.departure;
          const invalid = !!row.arrival && !!row.departure && row.arrival > row.departure;
          // Ausschnitt innerhalb des sichtbaren Zeitraums
          let barStart: ISODate | null = null;
          let barEnd: ISODate | null = null;
          let missing: "arrival" | "departure" | "both" | null = null;
          if (hasBoth) {
            barStart = row.arrival! < first ? first : row.arrival!;
            barEnd = row.departure! > last ? last : row.departure!;
            if (barStart > last || barEnd < first) barStart = barEnd = null;
          } else if (row.arrival && !row.departure && !invalid) {
            missing = "departure";
            barStart = row.arrival < first ? first : row.arrival;
            barEnd = barStart <= last ? barStart : null;
          } else if (!row.arrival && row.departure) {
            missing = "arrival";
            barEnd = row.departure > last ? last : row.departure;
            barStart = barEnd >= first ? barEnd : null;
          } else {
            missing = "both";
          }
          const clippedLeft = hasBoth && row.arrival! < first;
          const clippedRight = hasBoth && row.departure! > last;
          const label = describeStay(row);
          const tentative = row.status === "tentative";

          return (
            <div role="row" key={row.id} className="contents" data-testid="gantt-row" data-name={row.name}>
              <div
                role="rowheader"
                className="sticky left-0 z-10 flex h-12 items-center border-b border-r border-line bg-surface px-1.5"
                style={{ gridColumn: 1, gridRow: r }}
              >
                <button
                  type="button"
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  disabled={!onRowClick}
                  className={cx("flex w-full min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1.5 text-left text-sm", onRowClick && "hover:bg-sunken")}
                >
                  <span className="truncate font-medium">{row.name}</span>
                  {!!row.issueCount && (
                    <span className="ml-auto shrink-0 rounded bg-amber-soft px-1 text-[10px] font-semibold text-amber-ink" title={`${row.issueCount} offene Angaben`}>
                      !{row.issueCount}
                    </span>
                  )}
                </button>
              </div>
              {days.map((d) => (
                <div
                  key={d}
                  aria-hidden
                  className={cx("h-12 border-b border-l border-line", isWeekend(d) && "bg-sunken/60", selectedDay === d && "!bg-pine-50")}
                  style={{ gridColumn: col(d), gridRow: r }}
                />
              ))}
              {barStart && barEnd && !missing && (
                <button
                  type="button"
                  role="cell"
                  onClick={onBarClick ? () => onBarClick(row) : undefined}
                  aria-label={label}
                  title={label}
                  data-testid="gantt-bar"
                  data-start={barStart}
                  data-end={barEnd}
                  data-status={row.status}
                  className={cx(
                    "relative z-[5] mx-0.5 my-2.5 flex h-7 min-w-0 items-center justify-between gap-1 overflow-hidden px-1.5 text-[11px] font-semibold",
                    clippedLeft ? "rounded-l-none" : "rounded-l-full",
                    clippedRight ? "rounded-r-none" : "rounded-r-full",
                    tentative ? "bar-tentative border-2 border-dashed border-amber-line text-amber-ink" : "bg-pine-500 text-white hover:bg-pine-600",
                    showSki && row.skiDays?.length ? "mb-4 mt-1.5" : ""
                  )}
                  style={{ gridColumn: `${col(barStart)} / ${col(barEnd) + 1}`, gridRow: r }}
                >
                  <span className="flex items-center gap-0.5">
                    {clippedLeft ? <span aria-hidden>…</span> : <ArrivalIcon />}
                    {tentative && <span aria-hidden className="rounded-full bg-amber-line px-1 text-[10px] text-white">?</span>}
                  </span>
                  {tentative && barStart !== barEnd && <span className="hidden truncate sm:inline">unbestätigt</span>}
                  {(barStart !== barEnd || clippedRight) && (clippedRight ? <span aria-hidden>…</span> : <DepartureIcon />)}
                </button>
              )}
              {missing && missing !== "both" && barStart && (
                <button
                  type="button"
                  role="cell"
                  onClick={onBarClick ? () => onBarClick(row) : undefined}
                  aria-label={label}
                  title={label}
                  data-testid="gantt-bar"
                  data-missing={missing}
                  className={cx(
                    "relative z-[5] my-2.5 flex h-7 items-center gap-1 border-2 border-dashed border-faint bg-surface px-1.5 text-[11px] font-semibold text-muted",
                    missing === "departure" ? "ml-0.5 rounded-l-full rounded-r-none" : "mr-0.5 rounded-l-none rounded-r-full justify-end"
                  )}
                  style={{
                    gridColumn:
                      missing === "departure"
                        ? `${col(barStart)} / ${Math.min(col(barStart) + 2, days.length + 2)}`
                        : `${Math.max(col(barStart) - 1, 2)} / ${col(barStart) + 1}`,
                    gridRow: r,
                  }}
                >
                  {missing === "departure" ? <ArrivalIcon /> : null}
                  <span aria-hidden className="rounded-full bg-faint px-1 text-[10px] text-white">!</span>
                  <span className="truncate">{missing === "departure" ? "Abreise?" : "Anreise?"}</span>
                  {missing === "arrival" ? <DepartureIcon /> : null}
                </button>
              )}
              {(missing === "both" || invalid) && (
                <button
                  type="button"
                  role="cell"
                  onClick={onBarClick ? () => onBarClick(row) : undefined}
                  aria-label={invalid ? `${row.name}: Abreise liegt vor Anreise` : `${row.name}: keine Reisedaten angegeben`}
                  data-testid="gantt-bar"
                  data-missing="both"
                  className="bar-missing sticky left-[var(--name-w)] z-[5] mx-0.5 my-2.5 flex h-7 w-max items-center gap-1 rounded-md border border-dashed border-faint px-2 text-[11px] font-medium text-muted"
                  style={{ gridColumn: `2 / ${days.length + 2}`, gridRow: r }}
                >
                  <span aria-hidden className="rounded-full bg-faint px-1 text-[10px] text-white">!</span>
                  {invalid ? "Abreise vor Anreise – bitte prüfen" : "Reisedaten fehlen"}
                </button>
              )}
              {showSki &&
                row.skiDays
                  ?.filter((d) => d >= first && d <= last)
                  .map((d) => (
                    <span
                      key={`ski${d}`}
                      className="pointer-events-none z-[6] self-end justify-self-center pb-0.5 text-[11px] leading-none text-snow"
                      style={{ gridColumn: col(d), gridRow: r }}
                      title={`Skipass ${formatShort(d)}`}
                      data-testid="ski-marker"
                    >
                      <span aria-hidden>❄</span>
                      <span className="sr-only">Skipass {formatShort(d)}</span>
                    </span>
                  ))}
            </div>
          );
        })}
        {rows.length === 0 && (
          <div className="sticky left-0 col-span-full px-4 py-10 text-center text-sm text-muted" style={{ gridRow: firstDataRow }}>
            {emptyText ?? "Noch keine Personen."}
          </div>
        )}
      </div>
    </div>
  );
}

export function GanttLegend({ showSki }: { showSki?: boolean }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted" aria-label="Legende">
      <li className="flex items-center gap-1.5">
        <span className="flex h-4 w-10 items-center justify-between rounded-full bg-pine-500 px-1 text-white">
          <ArrivalIcon />
          <DepartureIcon />
        </span>
        Aufenthalt (An- &amp; Abreisetag zählen als anwesend)
      </li>
      <li className="flex items-center gap-1.5">
        <span className="bar-tentative flex h-4 w-10 items-center justify-center rounded-full border-2 border-dashed border-amber-line text-[10px] font-bold text-amber-ink">?</span>
        noch unbestätigt
      </li>
      <li className="flex items-center gap-1.5">
        <span className="flex h-4 w-10 items-center justify-center rounded-full border-2 border-dashed border-faint text-[10px] font-bold text-muted">!</span>
        Angabe fehlt
      </li>
      {showSki && (
        <li className="flex items-center gap-1.5">
          <span className="text-snow" aria-hidden>
            ❄
          </span>
          Skitag
        </li>
      )}
    </ul>
  );
}
