"use client";

import { addDays, dayOfMonth, eachDay, formatShort, weekdayIndex, type ISODate } from "@/lib/dates";
import { cx } from "./ui";

const WD = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

/** Raster aller Wochen, die den Reisezeitraum berühren (Mo–So). Tage außerhalb sind deaktiviert. */
function weeksFor(start: ISODate, end: ISODate): ISODate[][] {
  const gridStart = addDays(start, -weekdayIndex(start));
  const gridEnd = addDays(end, 6 - weekdayIndex(end));
  const all = eachDay(gridStart, gridEnd);
  const weeks: ISODate[][] = [];
  for (let i = 0; i < all.length; i += 7) weeks.push(all.slice(i, i + 7));
  return weeks;
}

function monthLabel(start: ISODate, end: ISODate) {
  const m1 = Number(start.slice(5, 7)) - 1;
  const m2 = Number(end.slice(5, 7)) - 1;
  const y1 = start.slice(0, 4);
  const y2 = end.slice(0, 4);
  if (start.slice(0, 7) === end.slice(0, 7)) return `${MONTHS[m1]} ${y1}`;
  return `${MONTHS[m1]}${y1 !== y2 ? ` ${y1}` : ""} – ${MONTHS[m2]} ${y2}`;
}

interface BaseProps {
  start: ISODate;
  end: ISODate;
  /** Tage, die hervorgehoben werden (z. B. Aufenthalt bei Skitag-Auswahl) */
  context?: { from: ISODate | null; to: ISODate | null };
  label: string;
}

function Grid({
  start,
  end,
  label,
  renderState,
  onPick,
  edgeWords = { fromShort: "An", toShort: "Ab" },
}: {
  start: ISODate;
  end: ISODate;
  label: string;
  edgeWords?: { fromShort: string; toShort: string };
  renderState: (d: ISODate) => { selected: boolean; edge?: "start" | "end" | "single"; inRange?: boolean; context?: boolean; disabled?: boolean; ariaLabel: string };
  onPick: (d: ISODate) => void;
}) {
  const weeks = weeksFor(start, end);
  return (
    <div className="rounded-xl border border-line bg-surface p-2.5" role="group" aria-label={label}>
      <div className="mb-2 px-1 text-sm font-semibold">{monthLabel(start, end)}</div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-faint" aria-hidden>
        {WD.map((w) => (
          <div key={w}>{w}</div>
        ))}
      </div>
      <div className="mt-1 flex flex-col gap-1">
        {weeks.map((w) => (
          <div key={w[0]} className="grid grid-cols-7 gap-1">
            {w.map((d) => {
              const inTrip = d >= start && d <= end;
              if (!inTrip)
                return (
                  <div key={d} className="flex h-11 items-center justify-center text-sm text-line" aria-hidden>
                    {dayOfMonth(d)}
                  </div>
                );
              const st = renderState(d);
              if (st.disabled)
                return (
                  <div key={d} className="flex h-11 items-center justify-center rounded-lg text-sm text-faint line-through decoration-line" aria-label={`${st.ariaLabel}, nicht wählbar`} data-day={d} data-disabled="true">
                    {dayOfMonth(d)}
                  </div>
                );
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => onPick(d)}
                  aria-pressed={st.selected}
                  aria-label={st.ariaLabel}
                  data-day={d}
                  className={cx(
                    "relative flex h-11 flex-col items-center justify-center rounded-lg text-sm tabular-nums transition-colors",
                    st.selected
                      ? "bg-pine-600 font-semibold text-white"
                      : st.inRange
                        ? "bg-pine-100 text-pine-800"
                        : st.context
                          ? "bg-sunken text-ink hover:bg-pine-50"
                          : "text-ink hover:bg-sunken",
                    dayOfMonth(d) === 1 && "ring-1 ring-inset ring-line"
                  )}
                >
                  <span>{dayOfMonth(d)}</span>
                  {st.edge && (
                    <span className={cx("text-[9px] font-medium leading-none", st.selected ? "text-white/90" : "text-pine-700")}>
                      {st.edge === "start" ? edgeWords.fromShort : st.edge === "end" ? edgeWords.toShort : `${edgeWords.fromShort}/${edgeWords.toShort}`}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Auswahl eines Zeitraums: erster Tipp = Beginn, zweiter = Ende. Tage außerhalb von min/max sind gesperrt. */
export function RangeCalendar({
  start,
  end,
  from,
  to,
  onChange,
  label,
  min,
  max,
  words = { from: "Anreise", to: "Abreise", fromShort: "An", toShort: "Ab" },
}: BaseProps & {
  from: ISODate | null;
  to: ISODate | null;
  onChange: (from: ISODate | null, to: ISODate | null) => void;
  min?: ISODate | null;
  max?: ISODate | null;
  words?: { from: string; to: string; fromShort: string; toShort: string };
}) {
  const blocked = (d: ISODate) => (!!min && d < min) || (!!max && d > max);
  const pick = (d: ISODate) => {
    if (!from || (from && to)) return onChange(d, null);
    if (d < from) return onChange(d, from);
    onChange(from, d);
  };
  return (
    <div className="flex flex-col gap-2">
      <Grid
        start={start}
        end={end}
        label={label}
        onPick={pick}
        edgeWords={words}
        renderState={(d) => {
          const isFrom = d === from;
          const isTo = d === to;
          const inRange = !!from && !!to && d > from && d < to;
          return {
            selected: isFrom || isTo,
            inRange,
            disabled: blocked(d),
            edge: isFrom && isTo ? "single" : isFrom ? "start" : isTo ? "end" : undefined,
            ariaLabel: `${formatShort(d)}${isFrom ? `, ${words.from}` : ""}${isTo ? `, ${words.to}` : ""}`,
          };
        }}
      />
      <p className="text-xs text-muted" aria-live="polite">
        {!from ? `Tippe auf den Tag der ${words.from}.` : !to ? `Jetzt den Tag der ${words.to} antippen (gleicher Tag möglich).` : "Zum Ändern einfach neu auswählen."}
      </p>
    </div>
  );
}

/** Auswahl einzelner Tage (Skitage, Essenstage). */
export function MultiDayCalendar({
  start,
  end,
  value,
  onChange,
  context,
  label,
}: BaseProps & { value: ISODate[]; onChange: (days: ISODate[]) => void }) {
  const set = new Set(value);
  const toggle = (d: ISODate) => {
    const next = new Set(set);
    if (next.has(d)) next.delete(d);
    else next.add(d);
    onChange([...next].sort());
  };
  const inContext = (d: ISODate) => !!context?.from && !!context?.to && d >= context.from && d <= context.to;
  return (
    <Grid
      start={start}
      end={end}
      label={label}
      onPick={toggle}
      renderState={(d) => ({
        selected: set.has(d),
        context: inContext(d),
        ariaLabel: `${formatShort(d)}${set.has(d) ? ", ausgewählt" : ""}${inContext(d) ? ", vor Ort" : ""}`,
      })}
    />
  );
}
