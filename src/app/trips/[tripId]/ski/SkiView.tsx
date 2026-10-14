"use client";

import { useState } from "react";
import Link from "next/link";
import { useTrip } from "../TripContext";
import { ParticipantSheet, personName } from "../ParticipantSheet";
import { Badge, Button, Card, Empty, Notice } from "@/components/ui";
import { formatShort, weekdayIndex } from "@/lib/dates";
import { computeSkiSummary, NO_CATEGORY } from "@/lib/stats";
import { formatQuantity } from "@/lib/units";

export function SkiView() {
  const { data, active, tripId } = useTrip();
  const [openId, setOpenId] = useState<string | null>(null);
  const t = data.trip;
  if (!t.ski_enabled)
    return (
      <Empty
        title="Skipass-Planung ist ausgeschaltet"
        action={
          <Link href={`/trips/${tripId}/settings`}>
            <Button>Zu den Einstellungen</Button>
          </Link>
        }
      />
    );

  const sum = computeSkiSummary(data.participants, t.start_date, t.end_date);
  const cats = [...t.ski_categories.map((c) => c.id), ...(Object.keys(sum.byCategoryDays).includes(NO_CATEGORY) ? [NO_CATEGORY] : [])];
  const extra = Object.keys(sum.byCategoryDays).filter((c) => !cats.includes(c)); // Kategorien, die nicht mehr konfiguriert sind
  const allCats = [...cats, ...extra];
  const catName = (id: string) => (id === NO_CATEGORY ? "ohne Kategorie" : t.ski_categories.find((c) => c.id === id)?.name ?? `${id} (gelöscht)`);
  const price = (id: string) => t.ski_categories.find((c) => c.id === id)?.price ?? null;
  const pricedTotal = allCats.reduce((s, c) => (price(c) !== null ? s + (sum.byCategoryDays[c] ?? 0) * price(c)! : s), 0);
  const hasPrices = allCats.some((c) => price(c) !== null && (sum.byCategoryDays[c] ?? 0) > 0);
  const unpriced = allCats.filter((c) => price(c) === null && (sum.byCategoryDays[c] ?? 0) > 0);

  const unknown = active.filter((p) => p.ski_need === "unknown");
  const incomplete = active.filter((p) => p.ski_need === "yes" && (!p.ski_days.length || (!p.ski_category && t.ski_categories.length > 0)));
  const tentative = active.filter((p) => p.ski_need === "yes" && p.stay_status === "tentative");
  const skiers = active.filter((p) => p.ski_need === "yes" && p.ski_days.length).sort((a, b) => personName(a).localeCompare(personName(b), "de"));

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Skipässe</h1>
          <p className="text-sm text-muted">Bedarfsplanung – es werden keine Käufe ausgelöst oder als erledigt markiert.</p>
        </div>
        <a href={`/api/trips/${tripId}/export?type=ski`} download>
          <Button>CSV-Export</Button>
        </a>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Personen mit Skipass" value={sum.people} />
        <Kpi label="Skipass-Tage gesamt" value={sum.totalPersonDays} />
        <Kpi label="Noch unklar" value={sum.unknownPeople} warn />
        <Kpi label="Angaben unvollständig" value={incomplete.length} warn />
      </div>

      <Card title="Bedarf pro Tag">
        <div className="scroll-x -mx-4 px-4">
          <table className="w-full min-w-max text-sm" data-testid="ski-table">
            <thead className="text-left text-xs text-muted">
              <tr className="border-b border-line">
                <th className="py-2 pr-4 font-medium">Tag</th>
                <th className="px-3 py-2 text-right font-medium">Gesamt</th>
                {allCats.map((c) => (
                  <th key={c} className="px-3 py-2 text-right font-medium">
                    {catName(c)}
                  </th>
                ))}
                <th className="px-3 py-2 text-right font-medium">davon unbestätigt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {sum.perDay.map((d) => (
                <tr key={d.day} className={weekdayIndex(d.day) >= 5 ? "bg-sunken/50" : ""}>
                  <td className="py-2 pr-4">{formatShort(d.day)}</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums" data-day={d.day}>
                    {d.total}
                  </td>
                  {allCats.map((c) => (
                    <td key={c} className="px-3 py-2 text-right tabular-nums">
                      {d.byCategory[c] ?? <span className="text-faint">·</span>}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right tabular-nums text-amber-ink">{d.tentative || ""}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-line font-semibold">
              <tr>
                <td className="py-2 pr-4">Summe (Personentage)</td>
                <td className="px-3 py-2 text-right tabular-nums">{sum.totalPersonDays}</td>
                {allCats.map((c) => (
                  <td key={c} className="px-3 py-2 text-right tabular-nums">
                    {sum.byCategoryDays[c] ?? 0}
                  </td>
                ))}
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
        {hasPrices && (
          <p className="mt-3 text-sm">
            Geschätzte Kosten (Tagespreis × Personentage): <strong>{formatQuantity(pricedTotal)} €</strong>
            {unpriced.length > 0 && <span className="text-muted"> – ohne {unpriced.map(catName).join(", ")} (kein Preis hinterlegt)</span>}
            <span className="block text-xs text-muted">Mehrtagespässe und Rabatte des Skigebiets sind nicht berücksichtigt.</span>
          </p>
        )}
      </Card>

      {(unknown.length > 0 || incomplete.length > 0 || tentative.length > 0) && (
        <div className="grid gap-4 md:grid-cols-3">
          <PeopleCard title="Skipass noch unklar" people={unknown} onOpen={setOpenId} />
          <PeopleCard title="Angaben unvollständig" people={incomplete} onOpen={setOpenId} hint="Ja, aber Tage oder Kategorie fehlen" />
          <PeopleCard title="Aufenthalt unbestätigt" people={tentative} onOpen={setOpenId} hint="Skipass ja, Termine noch offen" />
        </div>
      )}

      <Card title={`Personen (${skiers.length})`}>
        {skiers.length === 0 ? (
          <p className="text-sm text-muted">Noch niemand hat Skitage angegeben.</p>
        ) : (
          <ul className="divide-y divide-line">
            {skiers.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => setOpenId(p.id)} className="flex w-full flex-wrap items-center justify-between gap-2 py-2.5 text-left hover:bg-sunken">
                  <span className="font-medium">{personName(p)}</span>
                  <span className="flex flex-wrap items-center gap-1.5 text-sm">
                    <Badge tone="info">{p.ski_days.length} Tage</Badge>
                    {p.ski_category ? <Badge>{catName(p.ski_category)}</Badge> : <Badge tone="warn">Kategorie fehlt</Badge>}
                    {p.ski_discount && <Badge>{p.ski_discount}</Badge>}
                    <span className="text-muted">
                      {formatShort(p.ski_days[0])} – {formatShort(p.ski_days[p.ski_days.length - 1])}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {t.ski_categories.length === 0 && <Notice>Tipp: Lege in den Einstellungen Passkategorien und Preise für euer Skigebiet an.</Notice>}
      <ParticipantSheet id={openId} onClose={() => setOpenId(null)} />
    </>
  );
}

function Kpi({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className={`mt-1 text-3xl font-semibold tabular-nums ${warn && value ? "text-amber-ink" : ""}`}>{value}</div>
    </div>
  );
}

function PeopleCard({ title, people, onOpen, hint }: { title: string; people: { id: string; first_name: string; last_name: string }[]; onOpen: (id: string) => void; hint?: string }) {
  return (
    <Card title={`${title} (${people.length})`}>
      {hint && <p className="mb-2 text-xs text-muted">{hint}</p>}
      {people.length ? (
        <ul className="flex flex-wrap gap-1.5">
          {people.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => onOpen(p.id)} className="rounded-md border border-line px-2 py-1 text-sm hover:bg-sunken">
                {personName(p)}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">Niemand.</p>
      )}
    </Card>
  );
}
