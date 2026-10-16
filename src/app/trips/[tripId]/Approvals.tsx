"use client";

import { useState } from "react";
import { useTrip } from "./TripContext";
import { personName } from "./ParticipantSheet";
import { Badge, Button, Card } from "@/components/ui";
import { api, ApiError } from "@/lib/client/api";
import { formatShort } from "@/lib/dates";
import type { Approval, Participant } from "@/lib/types";

/** Gruppiert Personen nach gemeinsamer Anmeldung. */
export function groupByRegistration(ps: Participant[]): Participant[][] {
  const m = new Map<string, Participant[]>();
  for (const p of ps) m.set(p.registration_id, [...(m.get(p.registration_id) ?? []), p]);
  return [...m.values()].map((g) => g.sort((a, b) => a.position - b.position));
}

/** WhatsApp-Link: direkt an die Nummer, falls der Kontakt eine internationale Telefonnummer ist, sonst Teilen-Dialog. */
export function whatsappLink(text: string, contact: string | null): string {
  const digits = (contact ?? "").replace(/[\s\-/()]/g, "");
  const m = digits.match(/^(?:\+|00)(\d{8,15})$/);
  return `https://wa.me/${m ? m[1] : ""}?text=${encodeURIComponent(text)}`;
}

export function approvalMessage(names: string[], tripName: string, decision: Approval, publicUrl: string | null): string {
  const who = names.length > 1 ? names.slice(0, -1).join(", ") + " und " + names[names.length - 1] : names[0];
  if (decision === "approved")
    return `Hallo ${who}! 👋 Eure Anmeldung für „${tripName}“ ist bestätigt ✅. Änderungen könnt ihr jederzeit über euren persönlichen Link aus der Anmeldung vornehmen.${
      publicUrl ? `\nWer wann da ist: ${publicUrl}` : ""
    }`;
  return `Hallo ${who}, leider können wir eure Anmeldung für „${tripName}“ nicht bestätigen. Meldet euch bei Fragen gern direkt bei uns.`;
}

export function useDecide() {
  const { tripId, reload, toast } = useTrip();
  return async (ids: string[], decision: Approval) => {
    try {
      await api(`/api/trips/${tripId}/approvals`, { body: { participant_ids: ids, decision } });
      toast(decision === "approved" ? "Bestätigt" : decision === "rejected" ? "Abgelehnt" : "Zurückgesetzt");
      await reload();
      return true;
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Fehler", "error");
      return false;
    }
  };
}

/** Karte mit offenen Anmeldungen (pro Familie/Gruppe) inkl. Bestätigen/Ablehnen und WhatsApp-Nachricht. */
export function PendingApprovals({ onOpen }: { onOpen: (id: string) => void }) {
  const { data, pending } = useTrip();
  const decide = useDecide();
  const [notify, setNotify] = useState<{ names: string[]; decision: Approval; contact: string | null } | null>(null);
  const groups = groupByRegistration(pending);
  const publicUrl = data.trip.public_enabled ? data.links.public : null;

  if (!groups.length && !notify) return null;

  return (
    <Card title={`Neue Anmeldungen bestätigen (${pending.length})`} className="border-snow/40">
      <div className="flex flex-col gap-3" data-testid="pending-approvals">
        {notify && (
          <div className="flex flex-col gap-2 rounded-lg bg-pine-50 p-3 text-sm text-pine-800" data-testid="notify-box">
            <span>
              {notify.decision === "approved" ? "Bestätigt" : "Abgelehnt"}: <strong>{notify.names.join(", ")}</strong>. Jetzt Bescheid geben?
            </span>
            <div className="flex flex-wrap gap-2">
              <a href={whatsappLink(approvalMessage(notify.names, data.trip.name, notify.decision, publicUrl), notify.contact)} target="_blank" rel="noreferrer">
                <Button size="sm" variant="primary">
                  Per WhatsApp benachrichtigen
                </Button>
              </a>
              <Button
                size="sm"
                onClick={() => navigator.clipboard?.writeText(approvalMessage(notify.names, data.trip.name, notify.decision, publicUrl)).catch(() => {})}
              >
                Text kopieren
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setNotify(null)}>
                Fertig
              </Button>
            </div>
          </div>
        )}
        {groups.length === 0 && <p className="text-sm text-muted">Keine offenen Anmeldungen mehr.</p>}
        <ul className="flex flex-col gap-3">
          {groups.map((g) => {
            const contact = g.find((p) => p.phone)?.phone ?? g[0].contact;
            return (
              <li key={g[0].registration_id} className="rounded-lg border border-line p-3" data-testid="pending-group">
                <div className="flex flex-col gap-1">
                  {g.map((p) => (
                    <button key={p.id} type="button" onClick={() => onOpen(p.id)} className="flex flex-wrap items-center gap-2 text-left text-sm hover:underline">
                      <span className="font-medium">{personName(p)}</span>
                      <span className="text-muted">
                        {formatShort(p.arrival_date)} – {formatShort(p.departure_date)}
                      </span>
                      {p.stay_status === "tentative" && <Badge tone="warn">? unbestätigt</Badge>}
                      {(p.phone || p.email) && <span className="w-full text-xs text-muted">{[p.phone, p.email].filter(Boolean).join(" · ")}</span>}
                    </button>
                  ))}
                </div>
                {(g[0].contact || g[0].comment) && (
                  <div className="mt-2 text-xs text-muted">
                    {g[0].contact && <div>Kontakt: {g[0].contact}</div>}
                    {g[0].comment && <div className="whitespace-pre-wrap">„{g[0].comment}“</div>}
                  </div>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={async () => {
                      if (await decide(g.map((p) => p.id), "approved")) setNotify({ names: g.map((p) => p.first_name), decision: "approved", contact });
                    }}
                  >
                    {g.length > 1 ? `Alle ${g.length} bestätigen` : "Bestätigen"}
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={async () => {
                      if (!confirm(`Anmeldung von ${g.map((p) => p.first_name).join(", ")} ablehnen?`)) return;
                      if (await decide(g.map((p) => p.id), "rejected")) setNotify({ names: g.map((p) => p.first_name), decision: "rejected", contact });
                    }}
                  >
                    Ablehnen
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </Card>
  );
}
