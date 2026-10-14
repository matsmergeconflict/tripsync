"use client";

import { useEffect, useState } from "react";
import { useTrip } from "./TripContext";
import { ParticipantForm, emptyForm, formFromParticipant, toPayload } from "@/components/ParticipantForm";
import { Badge, Button, CopyLink, Notice, Sheet } from "@/components/ui";
import { api, ApiError } from "@/lib/client/api";
import { formatLong, formatShort } from "@/lib/dates";
import { ISSUE_LABELS, ISSUE_SEVERITY } from "@/lib/stats";
import { DIET_LABELS, type Participant } from "@/lib/types";

export function personName(p: Pick<Participant, "first_name" | "last_name">) {
  return `${p.first_name} ${p.last_name}`.trim();
}

interface AuditEntry {
  id: number;
  actor_type: string;
  actor_label: string | null;
  action: string;
  changes: Record<string, { from: unknown; to: unknown }> | null;
  created_at: string;
}

const FIELD_LABELS: Record<string, string> = {
  first_name: "Vorname",
  last_name: "Nachname",
  contact: "Kontakt",
  comment: "Kommentar",
  org_note: "Interne Notiz",
  status: "Status",
  arrival_date: "Anreise",
  arrival_time: "Ankunftszeit",
  departure_date: "Abreise",
  departure_time: "Abfahrtszeit",
  stay_status: "Angaben",
  ski_need: "Skipass",
  ski_days: "Skitage",
  ski_category: "Passkategorie",
  ski_discount: "Ermäßigung",
  share_ski_public: "Skitage öffentlich",
  meal_mode: "Essen",
  meal_days: "Essenstage",
  diet: "Ernährung",
  food_wishes: "Essenswünsche",
  allergies: "Allergien",
};

function fmt(v: unknown): string {
  if (v === null || v === undefined || v === "") return "–";
  if (Array.isArray(v)) return v.length ? v.map((x) => (typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x) ? formatShort(x) : String(x))).join(", ") : "–";
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return formatShort(v);
  if (typeof v === "boolean") return v ? "ja" : "nein";
  return String(v);
}

export function AuditList({ entityId }: { entityId?: string }) {
  const { tripId, data } = useTrip();
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<{ entries: AuditEntry[] }>(`/api/trips/${tripId}/audit${entityId ? `?entity_id=${entityId}` : ""}`)
      .then((r) => setEntries(r.entries))
      .catch((e) => setError(e instanceof ApiError ? e.message : "Fehler"));
    // bei jeder Datenänderung neu laden
  }, [tripId, entityId, data]);
  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (!entries) return <p className="text-sm text-muted">Lädt …</p>;
  if (!entries.length) return <p className="text-sm text-muted">Noch keine Einträge.</p>;
  const ACTIONS: Record<string, string> = {
    create: "angelegt",
    update: "geändert",
    delete: "gelöscht",
    reset_edit_link: "Bearbeitungslink zurückgesetzt",
    reset_link: "Link zurückgesetzt",
    revoke: "Zugang entzogen",
    merge: "Zutaten zusammengeführt",
    unmerge: "Zusammenführung aufgehoben",
    reset_invite_link: "Einladungslink erneuert",
    reset_public_link: "Öffentlicher Link erneuert",
  };
  return (
    <ol className="flex flex-col gap-3" data-testid="audit-list">
      {entries.map((e) => (
        <li key={e.id} className="rounded-lg border border-line p-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              <strong>{e.actor_label ?? "System"}</strong>{" "}
              <span className="text-muted">({e.actor_type === "organizer" ? "Organisator" : e.actor_type === "participant" ? "Teilnehmer" : "System"})</span>
            </span>
            <time className="text-xs text-muted" dateTime={e.created_at}>
              {new Date(e.created_at).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" })}
            </time>
          </div>
          <div className="mt-1 text-muted">{ACTIONS[e.action] ?? e.action}</div>
          {e.changes && e.action === "update" && (
            <ul className="mt-2 flex flex-col gap-1 text-xs">
              {Object.entries(e.changes).map(([k, c]) => (
                <li key={k}>
                  <span className="font-medium">{FIELD_LABELS[k] ?? k}:</span> {fmt(c.from)} → {fmt(c.to)}
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ol>
  );
}

export function ParticipantSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data, tripId, issues, reload, toast } = useTrip();
  const p = data.participants.find((x) => x.id === id) ?? null;
  const [mode, setMode] = useState<"view" | "edit" | "history">("view");
  const [link, setLink] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [prevId, setPrevId] = useState(id);
  if (prevId !== id) {
    setPrevId(id);
    setMode("view");
    setLink(null);
    setErrors({});
  }

  if (!id) return null;
  if (!p)
    return (
      <Sheet open onClose={onClose} title="Anmeldung">
        <p className="text-sm text-muted">Diese Anmeldung existiert nicht mehr.</p>
      </Sheet>
    );

  const cat = data.trip.ski_categories.find((c) => c.id === p.ski_category)?.name ?? p.ski_category;
  const pIssues = issues.get(p.id) ?? [];

  return (
    <Sheet open onClose={onClose} title={personName(p)} wide={mode === "edit"}>
      <div className="mb-4 flex flex-wrap gap-2" role="tablist">
        {(["view", "edit", "history"] as const).map((m) => (
          <Button key={m} size="sm" variant={mode === m ? "primary" : "secondary"} role="tab" aria-selected={mode === m} onClick={() => setMode(m)}>
            {m === "view" ? "Details" : m === "edit" ? "Bearbeiten" : "Verlauf"}
          </Button>
        ))}
      </div>

      {mode === "view" && (
        <div className="flex flex-col gap-4 text-sm" data-testid="participant-details">
          {p.status === "withdrawn" && <Notice tone="warn">Teilnahme zurückgezogen – zählt in keiner Übersicht.</Notice>}
          {pIssues.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {pIssues.map((i) => (
                <Badge key={i} tone={ISSUE_SEVERITY[i] === "missing" ? "warn" : "neutral"}>
                  {ISSUE_LABELS[i]}
                </Badge>
              ))}
            </div>
          )}
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
            <dt className="text-muted">Anreise</dt>
            <dd>
              {p.arrival_date ? formatLong(p.arrival_date) : "–"}
              {p.arrival_time && `, ${p.arrival_time} Uhr`}
            </dd>
            <dt className="text-muted">Abreise</dt>
            <dd>
              {p.departure_date ? formatLong(p.departure_date) : "–"}
              {p.departure_time && `, ${p.departure_time} Uhr`}
            </dd>
            <dt className="text-muted">Angaben</dt>
            <dd>{p.stay_status === "tentative" ? "noch unklar" : "bestätigt"}</dd>
            {data.trip.ski_enabled && (
              <>
                <dt className="text-muted">Skipass</dt>
                <dd>
                  {{ yes: "ja", no: "nein", unknown: "unklar" }[p.ski_need]}
                  {cat && ` · ${cat}`}
                  {p.ski_discount && ` · ${p.ski_discount}`}
                  {p.ski_days.length > 0 && <div className="text-muted">{p.ski_days.map(formatShort).join(", ")}</div>}
                </dd>
              </>
            )}
            <dt className="text-muted">Essen</dt>
            <dd>
              {{ all_present: "an allen Anwesenheitstagen", custom: `an ${p.meal_days.length} Tagen`, none: "nein", unknown: "unklar" }[p.meal_mode]}
              {p.diet && ` · ${DIET_LABELS[p.diet]}`}
              {p.meal_mode === "custom" && <div className="text-muted">{p.meal_days.map(formatShort).join(", ")}</div>}
            </dd>
            {p.food_wishes && (
              <>
                <dt className="text-muted">Wünsche</dt>
                <dd>{p.food_wishes}</dd>
              </>
            )}
            {p.allergies && (
              <>
                <dt className="text-muted">Allergien</dt>
                <dd>
                  {p.allergies} <Badge tone="info">vertraulich</Badge>
                </dd>
              </>
            )}
            {p.contact && (
              <>
                <dt className="text-muted">Kontakt</dt>
                <dd className="break-all">{p.contact}</dd>
              </>
            )}
            {p.comment && (
              <>
                <dt className="text-muted">Nachricht</dt>
                <dd className="whitespace-pre-wrap">{p.comment}</dd>
              </>
            )}
            {p.org_note && (
              <>
                <dt className="text-muted">Intern</dt>
                <dd className="whitespace-pre-wrap">{p.org_note}</dd>
              </>
            )}
          </dl>

          <div className="flex flex-col gap-3 rounded-xl border border-line p-3">
            <div className="font-medium">Persönlicher Bearbeitungslink</div>
            <p className="text-xs text-muted">
              Aus Sicherheitsgründen speichern wir Links nur verschlüsselt. Erzeuge einen neuen Link, um ihn erneut zu versenden – der alte wird dadurch ungültig.
            </p>
            {link ? (
              <CopyLink url={link} secret />
            ) : (
              <div>
                <Button
                  size="sm"
                  loading={busy}
                  onClick={async () => {
                    if (!confirm("Neuen Link erzeugen? Der bisherige Link funktioniert danach nicht mehr.")) return;
                    setBusy(true);
                    try {
                      const r = await api<{ edit_url: string }>(`/api/trips/${tripId}/participants/${p.id}/reset-link`, { method: "POST" });
                      setLink(r.edit_url);
                    } catch (e) {
                      toast(e instanceof ApiError ? e.message : "Fehler", "error");
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Neuen Link erzeugen
                </Button>
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2 border-t border-line pt-4">
            <Button
              size="sm"
              variant="danger"
              onClick={async () => {
                if (!confirm(`Anmeldung von ${personName(p)} endgültig löschen? Das kann nicht rückgängig gemacht werden.`)) return;
                try {
                  await api(`/api/trips/${tripId}/participants/${p.id}`, { method: "DELETE" });
                  toast("Anmeldung gelöscht");
                  onClose();
                  reload();
                } catch (e) {
                  toast(e instanceof ApiError ? e.message : "Fehler", "error");
                }
              }}
            >
              Endgültig löschen
            </Button>
          </div>
        </div>
      )}

      {mode === "edit" && (
        <>
          <Notice>Änderungen durch Organisatoren werden im Verlauf protokolliert.</Notice>
          <div className="mt-4">
            <ParticipantForm
              key={`${p.id}-${formKey}`}
              trip={data.trip}
              initial={formFromParticipant(p)}
              mode="full"
              orgFields
              submitLabel="Speichern"
              busy={busy}
              serverErrors={errors}
              footer={
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-5 accent-pine-600"
                    checked={p.status === "withdrawn"}
                    onChange={async (e) => {
                      try {
                        await api(`/api/trips/${tripId}/participants/${p.id}`, {
                          method: "PATCH",
                          body: { ...toPayload({ ...formFromParticipant(p), status: e.target.checked ? "withdrawn" : "active" }, true), version: p.version },
                        });
                        toast(e.target.checked ? "Als zurückgezogen markiert" : "Wieder aktiv");
                        reload();
                      } catch (err) {
                        toast(err instanceof ApiError ? err.message : "Fehler", "error");
                      }
                    }}
                  />
                  Zurückgezogen
                </label>
              }
              onSubmit={async (f) => {
                setBusy(true);
                setErrors({});
                try {
                  await api(`/api/trips/${tripId}/participants/${p.id}`, { method: "PATCH", body: { ...toPayload(f, true), version: p.version } });
                  toast("Gespeichert");
                  await reload();
                  setMode("view");
                } catch (e) {
                  if (e instanceof ApiError) {
                    if (e.status === 409) {
                      await reload();
                      setFormKey((k) => k + 1);
                      setErrors({ _: "Jemand anderes hat diese Anmeldung gerade geändert. Der aktuelle Stand wurde geladen – bitte Änderungen erneut vornehmen." });
                    } else setErrors({ ...e.fields, _: e.message });
                  }
                } finally {
                  setBusy(false);
                }
              }}
            />
          </div>
        </>
      )}

      {mode === "history" && <AuditList entityId={p.id} />}
    </Sheet>
  );
}

/** Organisator legt eine Person stellvertretend an. */
export function AddParticipantSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, tripId, reload, toast } = useTrip();
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [link, setLink] = useState<string | null>(null);
  const close = () => {
    setLink(null);
    setErrors({});
    onClose();
  };
  return (
    <Sheet open={open} onClose={close} title="Person hinzufügen" wide>
      {link ? (
        <div className="flex flex-col gap-4">
          <Notice tone="ok">Person angelegt.</Notice>
          <p className="text-sm">Schicke diesen persönlichen Link an die Person, damit sie ihre Angaben selbst pflegen kann:</p>
          <CopyLink url={link} secret />
          <Button onClick={close}>Fertig</Button>
        </div>
      ) : (
        <ParticipantForm
          trip={data.trip}
          initial={emptyForm()}
          mode="full"
          orgFields
          submitLabel="Anlegen"
          busy={busy}
          serverErrors={errors}
          onSubmit={async (f) => {
            setBusy(true);
            setErrors({});
            try {
              const r = await api<{ edit_url: string }>(`/api/trips/${tripId}/participants`, { body: toPayload(f, true) });
              setLink(r.edit_url);
              toast("Person angelegt");
              reload();
            } catch (e) {
              if (e instanceof ApiError) setErrors({ ...e.fields, _: e.message });
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
    </Sheet>
  );
}
