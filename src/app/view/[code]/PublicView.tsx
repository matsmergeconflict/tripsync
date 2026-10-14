"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { PublicShell } from "@/components/PublicShell";
import { Gantt, GanttLegend, type GanttRow } from "@/components/Gantt";
import { ErrorBox, Input, Loading, Sheet } from "@/components/ui";
import { api, ApiError } from "@/lib/client/api";
import { useLive } from "@/lib/client/useLive";
import { eachDay, formatLong } from "@/lib/dates";
import { computeDayStats } from "@/lib/stats";
import type { PublicParticipant } from "@/lib/types";

interface Data {
  trip: { name: string; location: string | null; start_date: string; end_date: string; ski_enabled: boolean };
  participants: PublicParticipant[];
}

export function PublicView() {
  const { code } = useParams<{ code: string }>();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<GanttRow | null>(null);

  const load = useCallback(() => {
    api<Data>(`/api/public/${code}`)
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Fehler beim Laden"));
  }, [code]);
  useEffect(load, [load]);
  const live = useLive(data ? `/api/public/${code}/events` : null, load);

  const rows: GanttRow[] = useMemo(
    () =>
      (data?.participants ?? [])
        .filter((p) => p.display_name.toLowerCase().includes(q.trim().toLowerCase()))
        .sort((a, b) => (a.arrival_date ?? "9999").localeCompare(b.arrival_date ?? "9999") || a.display_name.localeCompare(b.display_name))
        .map((p) => ({ id: p.id, name: p.display_name, arrival: p.arrival_date, departure: p.departure_date, status: p.stay_status, skiDays: p.ski_days })),
    [data, q]
  );

  if (error && !data)
    return (
      <PublicShell>
        <ErrorBox onRetry={load}>{error}</ErrorBox>
      </PublicShell>
    );
  if (!data)
    return (
      <PublicShell>
        <Loading />
      </PublicShell>
    );

  const days = eachDay(data.trip.start_date, data.trip.end_date);
  const stats = computeDayStats(
    data.participants.map((p) => ({ ...p, status: "active" as const })),
    data.trip.start_date,
    data.trip.end_date
  );
  const anySki = data.participants.some((p) => p.ski_days?.length);

  return (
    <PublicShell trip={data.trip} wide>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Wer ist wann da?</h1>
          <p className="text-sm text-muted">
            {data.participants.length} Personen angemeldet ·{" "}
            <span className={live === "live" ? "text-pine-700" : ""}>{live === "live" ? "● aktualisiert sich automatisch" : "Verbindung wird hergestellt …"}</span>
          </p>
        </div>
        <div className="w-full sm:w-64">
          <Input type="search" placeholder="Name suchen …" aria-label="Name suchen" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      <Gantt days={days} rows={rows} stats={stats} statKeys={["present", "arrivals", "departures"]} showSki={anySki} onBarClick={setSelected} onRowClick={setSelected} emptyText={q ? "Niemand gefunden." : "Noch niemand angemeldet."} />
      <GanttLegend showSki={anySki} />
      <Sheet open={!!selected} onClose={() => setSelected(null)} title={selected?.name ?? ""}>
        {selected && (
          <dl className="flex flex-col gap-3 text-sm">
            <div>
              <dt className="text-muted">Anreise</dt>
              <dd className="font-medium">{selected.arrival ? formatLong(selected.arrival) : "noch nicht angegeben"}</dd>
            </div>
            <div>
              <dt className="text-muted">Abreise</dt>
              <dd className="font-medium">{selected.departure ? formatLong(selected.departure) : "noch nicht angegeben"}</dd>
            </div>
            <div>
              <dt className="text-muted">Status</dt>
              <dd className="font-medium">{selected.status === "tentative" ? "noch unbestätigt" : "bestätigt"}</dd>
            </div>
            {!!selected.skiDays?.length && (
              <div>
                <dt className="text-muted">Skitage</dt>
                <dd className="font-medium">{selected.skiDays.length} Tage</dd>
              </div>
            )}
          </dl>
        )}
      </Sheet>
    </PublicShell>
  );
}
