"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, ApiError } from "@/lib/client/api";
import { useLive } from "@/lib/client/useLive";
import { eachDay } from "@/lib/dates";
import { computeDayStats, findIssues, type DayStats, type IssueCode } from "@/lib/stats";
import type { Meal, Participant, Recipe, ShoppingManualItem, Trip } from "@/lib/types";

export interface TripPayload {
  trip: Trip & { invite_enabled: boolean };
  links: { invite: string; public: string };
  me: { id: string; name: string };
  organizers: { id: string; name: string; created_at: string }[];
  participants: Participant[];
  meals: Meal[];
  recipes: Recipe[];
  aliases: { alias: string; canonical: string }[];
  shopping: { items: ShoppingManualItem[]; state: { item_key: string; checked: boolean; team: string | null }[] };
}

interface Ctx {
  tripId: string;
  data: TripPayload;
  days: string[];
  active: Participant[];
  stats: DayStats[];
  issues: Map<string, IssueCode[]>;
  reload: () => Promise<void>;
  live: "live" | "connecting" | "offline";
  /** Kurzlebige Hinweise (z. B. "Gespeichert") */
  toast: (msg: string, tone?: "ok" | "error") => void;
}

const TripCtx = createContext<Ctx | null>(null);

export function useTrip(): Ctx {
  const c = useContext(TripCtx);
  if (!c) throw new Error("useTrip außerhalb des TripProviders");
  return c;
}

export function TripProvider({
  tripId,
  children,
  fallback,
  errorView,
}: {
  tripId: string;
  children: ReactNode;
  fallback: ReactNode;
  errorView: (msg: string, status: number, retry: () => void) => ReactNode;
}) {
  const [data, setData] = useState<TripPayload | null>(null);
  const [error, setError] = useState<{ msg: string; status: number } | null>(null);
  const [toasts, setToasts] = useState<{ id: number; msg: string; tone: "ok" | "error" }[]>([]);
  const [coalesce] = useState(createCoalescer);

  const reload = useCallback(
    () =>
      coalesce(async () => {
        try {
          const d = await api<TripPayload>(`/api/trips/${tripId}`);
          setData(d);
          setError(null);
        } catch (e) {
          if (e instanceof ApiError) setError({ msg: e.message, status: e.status });
        }
      }),
    [tripId, coalesce]
  );

  useEffect(() => {
    reload();
  }, [reload]);
  const live = useLive(data ? `/api/trips/${tripId}/events` : null, reload);

  const toast = useCallback((msg: string, tone: "ok" | "error" = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);

  const value = useMemo<Ctx | null>(() => {
    if (!data) return null;
    const active = data.participants.filter((p) => p.status === "active");
    return {
      tripId,
      data,
      days: eachDay(data.trip.start_date, data.trip.end_date),
      active,
      stats: computeDayStats(data.participants, data.trip.start_date, data.trip.end_date),
      issues: new Map(data.participants.map((p) => [p.id, findIssues(p, data.trip)])),
      reload,
      live,
      toast,
    };
  }, [data, tripId, reload, live, toast]);

  if (error && !data) return <>{errorView(error.msg, error.status, reload)}</>;
  if (!value) return <>{fallback}</>;
  return (
    <TripCtx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto rounded-lg px-4 py-2.5 text-sm font-medium shadow-lg ${t.tone === "ok" ? "bg-ink text-white" : "bg-danger text-white"}`}
          >
            {t.msg}
          </div>
        ))}
      </div>
    </TripCtx.Provider>
  );
}

/**
 * Fasst überlappende Ladevorgänge zusammen: Während ein Ladevorgang läuft, führen weitere
 * Aufrufe genau einen erneuten Ladevorgang danach aus (damit keine Änderung verloren geht).
 */
function createCoalescer() {
  let inflight: Promise<void> | null = null;
  let again = false;
  return (fn: () => Promise<void>): Promise<void> => {
    if (inflight) {
      again = true;
      return inflight;
    }
    inflight = (async () => {
      do {
        again = false;
        await fn();
      } while (again);
    })().finally(() => {
      inflight = null;
    });
    return inflight;
  };
}
