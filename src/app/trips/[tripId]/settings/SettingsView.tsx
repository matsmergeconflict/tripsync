"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTrip } from "../TripContext";
import { AuditList } from "../ParticipantSheet";
import { Badge, Button, Card, CopyLink, Field, Input, Notice, Textarea } from "@/components/ui";
import { api, ApiError } from "@/lib/client/api";
import type { SkiCategory } from "@/lib/types";

export function SettingsView() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Einstellungen</h1>
      <Sharing />
      <TripBasics />
      <SkiSettings />
      <Organizers />
      <Exports />
      <Card title="Änderungsprotokoll">
        <div className="max-h-[480px] overflow-y-auto">
          <AuditList />
        </div>
      </Card>
      <DangerZone />
    </>
  );
}

/** Speichert Reiseeinstellungen mit Versionsprüfung. */
function usePatchTrip() {
  const { data, tripId, reload, toast } = useTrip();
  return async (patch: Record<string, unknown>): Promise<boolean> => {
    try {
      await api(`/api/trips/${tripId}`, { method: "PATCH", body: { ...patch, version: data.trip.version } });
      toast("Gespeichert");
      await reload();
      return true;
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        await reload();
        toast("Jemand anderes hat die Einstellungen gerade geändert – bitte erneut versuchen.", "error");
      } else toast(e instanceof ApiError ? e.message : "Fehler", "error");
      return false;
    }
  };
}

function Toggle({ checked, onChange, label, description, testId }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string; testId?: string }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4">
      <span>
        <span className="block font-medium">{label}</span>
        {description && <span className="block text-sm text-muted">{description}</span>}
      </span>
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input type="checkbox" role="switch" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} data-testid={testId} />
        <span className="h-7 w-12 rounded-full bg-line transition-colors peer-checked:bg-pine-500 peer-focus-visible:outline-2 peer-focus-visible:outline-pine-500" />
        <span className="absolute left-1 top-1 size-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
      </span>
    </label>
  );
}

function Sharing() {
  const { data, tripId, reload, toast } = useTrip();
  const patch = usePatchTrip();
  const t = data.trip;
  const regen = async (which: "invite" | "public") => {
    if (!confirm(`Neuen ${which === "invite" ? "Einladungslink" : "öffentlichen Link"} erzeugen? Der bisherige Link funktioniert danach nicht mehr.`)) return;
    try {
      await api(`/api/trips/${tripId}/codes`, { body: { which } });
      toast("Neuer Link erzeugt");
      reload();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Fehler", "error");
    }
  };
  return (
    <Card title="Freigaben">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <Toggle checked={t.invite_enabled} onChange={(v) => patch({ invite_enabled: v })} label="Anmeldungen offen" description="Über den Einladungslink können sich neue Personen eintragen." />
          {t.invite_enabled && <CopyLink url={data.links.invite} label="Einladungslink" />}
          <div>
            <Button size="sm" variant="ghost" onClick={() => regen("invite")}>
              Einladungslink erneuern
            </Button>
          </div>
        </div>
        <div className="flex flex-col gap-3 border-t border-line pt-5">
          <Toggle
            testId="public-toggle"
            checked={t.public_enabled}
            onChange={(v) => patch({ public_enabled: v })}
            label="Öffentliche Teilnehmerübersicht"
            description="Jeder mit dem Link sieht Anzeigenamen und An-/Abreise. Keine Kontaktdaten, Allergien, Kommentare oder Notizen."
          />
          {t.public_enabled ? <CopyLink url={data.links.public} label="Link zur Übersicht (nur lesen)" /> : <Badge>Private Reise – nur Organisatoren sehen die Übersicht</Badge>}
          <div>
            <Button size="sm" variant="ghost" onClick={() => regen("public")}>
              Öffentlichen Link erneuern
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

function TripBasics() {
  const { data } = useTrip();
  const patch = usePatchTrip();
  const t = data.trip;
  const [f, setF] = useState({ name: t.name, location: t.location ?? "", start_date: t.start_date, end_date: t.end_date });
  const [busy, setBusy] = useState(false);
  const outside = data.participants.filter(
    (p) =>
      p.status === "active" &&
      ((p.arrival_date && (p.arrival_date < f.start_date || p.arrival_date > f.end_date)) || (p.departure_date && (p.departure_date < f.start_date || p.departure_date > f.end_date)))
  ).length;
  return (
    <Card title="Reise">
      <form
        className="flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (outside && !confirm(`${outside} Anmeldung(en) liegen dann teilweise außerhalb des Zeitraums und werden als „prüfen“ markiert. Trotzdem speichern?`)) return;
          setBusy(true);
          await patch({ ...f, location: f.location || null });
          setBusy(false);
        }}
      >
        <Field label="Name">{(p) => <Input {...p} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={120} />}</Field>
        <Field label="Ort / Unterkunft" optional>
          {(p) => <Input {...p} value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} maxLength={120} />}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Erster Tag">{(p) => <Input {...p} type="date" value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value })} />}</Field>
          <Field label="Letzter Tag">{(p) => <Input {...p} type="date" value={f.end_date} min={f.start_date} onChange={(e) => setF({ ...f, end_date: e.target.value })} />}</Field>
        </div>
        {outside > 0 && <Notice tone="warn">{outside} Anmeldung(en) liegen außerhalb dieses Zeitraums.</Notice>}
        <div>
          <Button type="submit" variant="primary" loading={busy}>
            Speichern
          </Button>
        </div>
      </form>
    </Card>
  );
}

function SkiSettings() {
  const { data } = useTrip();
  const patch = usePatchTrip();
  const t = data.trip;
  const [cats, setCats] = useState<(SkiCategory & { priceText: string })[]>(t.ski_categories.map((c) => ({ ...c, priceText: c.price === null ? "" : String(c.price).replace(".", ",") })));
  const [notes, setNotes] = useState(t.ski_notes ?? "");
  const [busy, setBusy] = useState(false);
  return (
    <Card title="Skipässe">
      <div className="flex flex-col gap-5">
        <Toggle checked={t.ski_enabled} onChange={(v) => patch({ ski_enabled: v })} label="Skipass-Planung" description="Fragt bei der Anmeldung nach Skitagen und Passkategorie." />
        {t.ski_enabled && (
          <form
            className="flex flex-col gap-4"
            onSubmit={async (e) => {
              e.preventDefault();
              const prepared = cats
                .filter((c) => c.name.trim())
                .map((c) => ({
                  id: c.id || c.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30) + "-" + Math.random().toString(36).slice(2, 6),
                  name: c.name.trim(),
                  price: c.priceText.trim() ? Number(c.priceText.replace(",", ".")) : null,
                  ...(c.note ? { note: c.note } : {}),
                }));
              if (prepared.some((c) => c.price !== null && !(c.price >= 0))) return alert("Bitte gültige Preise angeben.");
              setBusy(true);
              await patch({ ski_categories: prepared, ski_notes: notes || null });
              setBusy(false);
            }}
          >
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">Passkategorien und Tagespreise (optional, nur zur Planung)</span>
              {cats.map((c, i) => (
                <div key={i} className="grid grid-cols-[1fr_100px_auto] gap-2 sm:grid-cols-[1fr_1fr_110px_auto]">
                  <Input aria-label="Kategorie" value={c.name} placeholder="z. B. Erwachsene" onChange={(e) => setCats(cats.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                  <Input
                    aria-label="Hinweis"
                    value={c.note ?? ""}
                    placeholder="z. B. Jg. 2008–2011"
                    onChange={(e) => setCats(cats.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)))}
                    className="hidden sm:block"
                  />
                  <Input aria-label="Preis pro Tag in Euro" inputMode="decimal" value={c.priceText} placeholder="€/Tag" onChange={(e) => setCats(cats.map((x, j) => (j === i ? { ...x, priceText: e.target.value } : x)))} />
                  <Button type="button" variant="ghost" size="sm" aria-label="Kategorie entfernen" onClick={() => setCats(cats.filter((_, j) => j !== i))}>
                    ✕
                  </Button>
                </div>
              ))}
              <div>
                <Button type="button" size="sm" onClick={() => setCats([...cats, { id: "", name: "", price: null, priceText: "" }])}>
                  + Kategorie
                </Button>
              </div>
            </div>
            <Field label="Hinweis für Teilnehmer" optional hint="Wird im Anmeldeformular beim Skipass angezeigt, z. B. Gültigkeitsregeln.">
              {(p) => <Textarea {...p} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} />}
            </Field>
            <div>
              <Button type="submit" variant="primary" loading={busy}>
                Speichern
              </Button>
            </div>
          </form>
        )}
      </div>
    </Card>
  );
}

function Organizers() {
  const { data, tripId, reload, toast } = useTrip();
  const [name, setName] = useState("");
  const [newLink, setNewLink] = useState<{ name: string; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Card title="Organisatoren">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted">Alle Organisatoren können gleichzeitig arbeiten. Jede Person hat ihren eigenen geheimen Zugangslink.</p>
        <ul className="divide-y divide-line rounded-lg border border-line">
          {data.organizers.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
              <span className="font-medium">
                {o.name} {o.id === data.me.id && <Badge tone="ok">du</Badge>}
              </span>
              <span className="flex gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    if (!confirm(`Neuen Zugangslink für ${o.name} erzeugen? Der alte Link wird ungültig.`)) return;
                    try {
                      const r = await api<{ url: string }>(`/api/trips/${tripId}/organizers/${o.id}`, { method: "POST" });
                      setNewLink({ name: o.name, url: r.url });
                    } catch (e) {
                      toast(e instanceof ApiError ? e.message : "Fehler", "error");
                    }
                  }}
                >
                  Neuer Link
                </Button>
                {data.organizers.length > 1 && o.id !== data.me.id && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      if (!confirm(`${o.name} den Zugang entziehen?`)) return;
                      try {
                        await api(`/api/trips/${tripId}/organizers/${o.id}`, { method: "DELETE" });
                        toast("Zugang entzogen");
                        reload();
                      } catch (e) {
                        toast(e instanceof ApiError ? e.message : "Fehler", "error");
                      }
                    }}
                  >
                    Entfernen
                  </Button>
                )}
              </span>
            </li>
          ))}
        </ul>
        {newLink && (
          <div className="flex flex-col gap-2 rounded-lg bg-amber-soft/50 p-3" data-testid="new-organizer-link">
            <p className="text-sm">
              Zugangslink für <strong>{newLink.name}</strong> – wird nur jetzt angezeigt. Bitte sicher weitergeben:
            </p>
            <CopyLink url={newLink.url} secret />
          </div>
        )}
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!name.trim()) return;
            setBusy(true);
            try {
              const r = await api<{ url: string; name: string }>(`/api/trips/${tripId}/organizers`, { body: { name } });
              setNewLink({ name: r.name, url: r.url });
              setName("");
              reload();
            } catch (err) {
              toast(err instanceof ApiError ? err.message : "Fehler", "error");
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="Weitere Person als Organisator">{(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" maxLength={80} className="w-56" />}</Field>
          <Button type="submit" loading={busy}>
            Hinzufügen
          </Button>
        </form>
      </div>
    </Card>
  );
}

function Exports() {
  const { tripId } = useTrip();
  const items = [
    ["participants", "Teilnehmer", "Namen, Zeiträume, Status, Kontakt – ohne Gesundheitsdaten"],
    ["days", "Tagesübersicht", "Anwesende, An-/Abreisen, Skipässe, Essen pro Tag"],
    ["ski", "Skipässe", "Bedarf pro Tag und Kategorie, Liste der Personen"],
    ["meals", "Essensplan", "Mahlzeiten mit Portionen und Küchenteams"],
    ["shopping", "Einkaufsliste", "Aggregierte Zutaten und manuelle Artikel"],
    ["kitchen", "Küchenliste (vertraulich)", "Ernährung und Allergien – nur an die Küche weitergeben"],
  ];
  return (
    <Card title="Export (CSV)">
      <p className="mb-3 text-sm text-muted">Persönliche Bearbeitungslinks sind in keinem Export enthalten. Die Dateien öffnen sich in Excel, Numbers oder Google Sheets.</p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {items.map(([type, label, desc]) => (
          <li key={type}>
            <a href={`/api/trips/${tripId}/export?type=${type}`} download className="flex flex-col rounded-lg border border-line p-3 hover:bg-sunken">
              <span className="font-medium">{label} ↓</span>
              <span className="text-xs text-muted">{desc}</span>
            </a>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function DangerZone() {
  const { data, tripId } = useTrip();
  const router = useRouter();
  const [confirmName, setConfirmName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  return (
    <Card title="Reise löschen" className="border-danger/30">
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted">Löscht die Reise mit allen Anmeldungen, Plänen und Protokollen endgültig. Das kann nicht rückgängig gemacht werden.</p>
        <Field label={`Zur Bestätigung „${data.trip.name}“ eingeben`}>
          {(p) => <Input {...p} value={confirmName} onChange={(e) => setConfirmName(e.target.value)} />}
        </Field>
        {err && <p className="text-sm text-danger">{err}</p>}
        <div>
          <Button
            variant="danger"
            disabled={confirmName !== data.trip.name}
            onClick={async () => {
              try {
                await api(`/api/trips/${tripId}?confirm=${encodeURIComponent(confirmName)}`, { method: "DELETE" });
                router.push("/");
              } catch (e) {
                setErr(e instanceof ApiError ? e.message : "Fehler");
              }
            }}
          >
            Endgültig löschen
          </Button>
        </div>
      </div>
    </Card>
  );
}
