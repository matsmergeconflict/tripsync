"use client";

import { useState } from "react";
import Link from "next/link";
import { useTrip } from "./TripContext";
import { AddParticipantSheet, AuditList, ParticipantSheet, personName } from "./ParticipantSheet";
import { PendingApprovals } from "./Approvals";
import { Badge, Button, Card, CopyLink, Empty, Notice } from "@/components/ui";
import { formatLong, formatShort } from "@/lib/dates";
import { ISSUE_LABELS, ISSUE_SEVERITY, computeSkiSummary } from "@/lib/stats";

export function OverviewView() {
  const { data, active, pending, stats, issues, tripId } = useTrip();
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const t = data.trip;
  const base = `/trips/${tripId}`;

  const peak = stats.reduce((m, s) => (s.present > m.present ? s : m), stats[0]);
  const withIssues = active.filter((p) => (issues.get(p.id) ?? []).some((i) => ISSUE_SEVERITY[i] === "missing"));
  const tentative = active.filter((p) => p.stay_status === "tentative");
  const ski = computeSkiSummary(data.participants, t.start_date, t.end_date);
  const withdrawn = data.participants.filter((p) => p.status === "withdrawn").length;
  const totalMeals = data.meals.length;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t.name}</h1>
          <p className="text-sm text-muted">
            {formatLong(t.start_date)} – {formatLong(t.end_date)}
            {t.location ? ` · ${t.location}` : ""}
          </p>
        </div>
        <Button onClick={() => setAdding(true)}>+ Person hinzufügen</Button>
      </div>

      <PendingApprovals onOpen={setOpenId} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="overview-stats">
        <Stat
          label="Angemeldet"
          value={active.length}
          sub={[pending.length ? `${pending.length} warten auf Bestätigung` : "", withdrawn ? `${withdrawn} zurückgezogen` : ""].filter(Boolean).join(" · ") || undefined}
          href={`${base}/participants`}
        />
        <Stat label="Max. gleichzeitig" value={peak?.present ?? 0} sub={peak && peak.present ? `am ${formatShort(peak.day)}` : undefined} href={`${base}/timeline`} />
        <Stat label="Angaben fehlen" value={withIssues.length} tone={withIssues.length ? "warn" : "ok"} sub={tentative.length ? `${tentative.length} unbestätigt` : undefined} href={`${base}/participants?filter=incomplete`} />
        {t.ski_enabled ? (
          <Stat label="Skipass-Tage" value={ski.totalPersonDays} sub={`${ski.people} Personen`} href={`${base}/ski`} />
        ) : (
          <Stat label="Mahlzeiten geplant" value={totalMeals} href={`${base}/meals`} />
        )}
      </div>

      {data.participants.length === 0 && (
        <Card title="Los geht's: Einladung teilen">
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted">Schicke diesen Link in die Gruppe. Jede Person trägt sich selbst ein – ohne Konto.</p>
            <CopyLink url={data.links.invite} label="Einladungslink" />
            {!t.invite_enabled && <Notice tone="warn">Anmeldungen sind derzeit geschlossen (Einstellungen).</Notice>}
          </div>
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Card
          title="Anwesenheit pro Tag"
          actions={
            <Link href={`${base}/timeline`} className="text-sm font-medium text-pine-700">
              Zeitachse →
            </Link>
          }
        >
          <DayBars />
        </Card>
        <Card title={`Offene Punkte (${withIssues.length})`}>
          {withIssues.length === 0 ? (
            <p className="text-sm text-muted">{active.length ? "Alle Anmeldungen sind vollständig. 🎉" : "Noch keine Anmeldungen."}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {withIssues.slice(0, 8).map((p) => (
                <li key={p.id}>
                  <button type="button" className="flex w-full flex-col gap-1 py-2 text-left hover:bg-sunken" onClick={() => setOpenId(p.id)}>
                    <span className="font-medium">{personName(p)}</span>
                    <span className="flex flex-wrap gap-1">
                      {(issues.get(p.id) ?? [])
                        .filter((i) => ISSUE_SEVERITY[i] === "missing")
                        .map((i) => (
                          <Badge key={i} tone="warn">
                            {ISSUE_LABELS[i]}
                          </Badge>
                        ))}
                    </span>
                  </button>
                </li>
              ))}
              {withIssues.length > 8 && (
                <li className="pt-2">
                  <Link href={`${base}/participants?filter=incomplete`} className="text-sm font-medium text-pine-700">
                    Alle {withIssues.length} anzeigen →
                  </Link>
                </li>
              )}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Links">
          <div className="flex flex-col gap-4">
            <CopyLink url={data.links.invite} label="Einladungslink (zur Anmeldung)" />
            {t.public_enabled ? (
              <CopyLink url={data.links.public} label="Öffentliche Übersicht (nur lesen)" />
            ) : (
              <p className="text-sm text-muted">
                Die öffentliche Teilnehmerübersicht ist ausgeschaltet.{" "}
                <Link href={`${base}/settings`} className="font-medium text-pine-700">
                  In den Einstellungen aktivieren
                </Link>
              </p>
            )}
          </div>
        </Card>
        <Card title="Letzte Änderungen">
          <div className="max-h-80 overflow-y-auto">
            <AuditList />
          </div>
        </Card>
      </div>

      {data.participants.length === 0 && <Empty title="Noch keine Anmeldungen">Sobald sich jemand einträgt, erscheint er hier und in der Zeitachse – live.</Empty>}

      <ParticipantSheet id={openId} onClose={() => setOpenId(null)} />
      <AddParticipantSheet open={adding} onClose={() => setAdding(false)} />
    </>
  );
}

function Stat({ label, value, sub, tone, href }: { label: string; value: number; sub?: string; tone?: "warn" | "ok"; href: string }) {
  return (
    <Link href={href} className="rounded-xl border border-line bg-surface p-4 transition-colors hover:border-pine-200">
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className={`mt-1 text-3xl font-semibold tabular-nums ${tone === "warn" && value ? "text-amber-ink" : ""}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </Link>
  );
}

/** Kompaktes Säulendiagramm: Anwesende pro Tag (unbestätigte Anteile schraffiert). */
function DayBars() {
  const { stats } = useTrip();
  const max = Math.max(1, ...stats.map((s) => s.present));
  return (
    <div className="scroll-x">
      <div className="flex min-w-max items-end gap-1.5" role="list" aria-label="Anwesende pro Tag">
        {stats.map((s) => {
          const confirmed = s.present - s.presentTentative;
          return (
            <div key={s.day} role="listitem" className="flex w-9 flex-col items-center gap-1" aria-label={`${formatShort(s.day)}: ${s.present} anwesend${s.presentTentative ? `, davon ${s.presentTentative} unbestätigt` : ""}`}>
              <span className="text-xs font-semibold tabular-nums">{s.present}</span>
              <div className="flex h-28 w-6 flex-col justify-end overflow-hidden rounded-md bg-sunken">
                {s.presentTentative > 0 && <div className="bar-tentative w-full" style={{ height: `${(s.presentTentative / max) * 100}%` }} />}
                <div className="w-full bg-pine-500" style={{ height: `${(confirmed / max) * 100}%` }} />
              </div>
              <span className="text-[10px] leading-tight text-muted">{formatShort(s.day).split(" ")[0]}</span>
              <span className="text-[10px] leading-tight text-muted">{s.day.slice(8)}.</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
