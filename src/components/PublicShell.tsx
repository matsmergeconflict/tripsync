import type { ReactNode } from "react";
import { formatShort } from "@/lib/dates";

export function PublicShell({
  trip,
  children,
  wide,
}: {
  trip?: { name: string; location?: string | null; start_date: string; end_date: string } | null;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-line bg-surface">
        <div className={`mx-auto flex w-full items-center gap-3 px-4 py-3 ${wide ? "max-w-6xl" : "max-w-2xl"}`}>
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-pine-600 text-sm font-bold text-white" aria-hidden>
            TS
          </span>
          {trip ? (
            <div className="min-w-0">
              <div className="truncate font-semibold">{trip.name}</div>
              <div className="truncate text-xs text-muted">
                {formatShort(trip.start_date)} – {formatShort(trip.end_date)}
                {trip.location ? ` · ${trip.location}` : ""}
              </div>
            </div>
          ) : (
            <div className="font-semibold">TripSync</div>
          )}
        </div>
      </header>
      <main className={`mx-auto flex w-full flex-1 flex-col gap-5 px-4 py-6 ${wide ? "max-w-6xl" : "max-w-2xl"}`}>{children}</main>
    </div>
  );
}
