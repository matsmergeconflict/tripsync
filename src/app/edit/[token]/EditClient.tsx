"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { PublicShell } from "@/components/PublicShell";
import { GroupForm, groupFromParticipants, groupToPayload, type GroupState } from "@/components/GroupForm";
import type { FormTrip } from "@/components/ParticipantForm";
import { Badge, Button, ErrorBox, Loading, Notice } from "@/components/ui";
import { api, ApiError } from "@/lib/client/api";
import type { Participant } from "@/lib/types";

type Me = Omit<Participant, "org_note">;
interface Data {
  registration: { id: string; contact: string | null; comment: string | null; version: number };
  participants: Me[];
  trip: FormTrip & { location: string | null };
  public_url: string | null;
}

export function EditClient() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<Data | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);

  const load = useCallback(
    (notice?: string) =>
      api<Data>("/api/me", { headers: { "x-edit-token": token } })
        .then((r) => {
          setData(r);
          setLoadError(null);
          setFormKey((k) => k + 1);
          if (notice) setError(notice);
        })
        .catch((e) => setLoadError(e instanceof ApiError ? e.message : "Fehler beim Laden")),
    [token]
  );
  useEffect(() => {
    load();
  }, [load]);

  const save = async (g: GroupState, message: string) => {
    if (!data) return;
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      const res = await api<Pick<Data, "registration" | "participants">>("/api/me", {
        method: "PATCH",
        headers: { "x-edit-token": token },
        body: { ...groupToPayload(g, data.trip), version: data.registration.version },
      });
      setData({ ...data, ...res });
      setFormKey((k) => k + 1);
      setSaved(message);
      window.scrollTo({ top: 0 });
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        await load("Die Anmeldung wurde inzwischen (z. B. von einem Organisator) geändert. Der aktuelle Stand ist geladen – bitte prüfen und erneut speichern.");
      } else setError(e instanceof ApiError ? e.message : "Fehler beim Speichern");
    } finally {
      setBusy(false);
    }
  };

  if (loadError)
    return (
      <PublicShell>
        <ErrorBox onRetry={() => load()}>
          {loadError}
          <p className="mt-2 text-ink">Falls der Link zurückgesetzt wurde, bitte die Organisatoren um einen neuen.</p>
        </ErrorBox>
      </PublicShell>
    );
  if (!data)
    return (
      <PublicShell>
        <Loading />
      </PublicShell>
    );

  const ps = data.participants;
  const active = ps.filter((p) => p.status === "active");
  const pending = active.filter((p) => p.approval === "pending");
  const rejected = ps.filter((p) => p.approval === "rejected");
  const allWithdrawn = ps.length > 0 && active.length === 0;
  const names = (list: Me[]) => list.map((p) => p.first_name).join(", ");
  const initial = groupFromParticipants(ps, data.registration);

  return (
    <PublicShell trip={data.trip}>
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Hallo {ps.length > 1 ? names(ps) : ps[0]?.first_name}!</h1>
        <p className="text-sm text-muted">Hier könnt ihr eure Anmeldung ansehen und ändern. Dieser Link gehört nur euch.</p>
      </div>

      <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4" data-testid="approval-status">
        <span className="text-sm font-semibold">Status der Anmeldung</span>
        <ul className="flex flex-col gap-1.5 text-sm">
          {ps.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2">
              <span>
                {p.first_name} {p.last_name}
              </span>
              {p.status === "withdrawn" ? (
                <Badge>zurückgezogen</Badge>
              ) : p.approval === "approved" ? (
                <Badge tone="ok">✓ bestätigt</Badge>
              ) : p.approval === "rejected" ? (
                <Badge tone="bad">abgelehnt</Badge>
              ) : (
                <Badge tone="warn">wartet auf Bestätigung</Badge>
              )}
            </li>
          ))}
        </ul>
        {pending.length > 0 && <p className="text-xs text-muted">Die Organisatoren wurden informiert und bestätigen die Anmeldung, sobald sie Zeit haben.</p>}
        {rejected.length > 0 && <p className="text-xs text-muted">Bei Fragen zur Absage wende dich bitte direkt an die Organisatoren.</p>}
      </div>

      {saved && (
        <Notice tone="ok">
          <span role="status">{saved}</span>
        </Notice>
      )}
      {allWithdrawn && (
        <Notice tone="warn">
          Die Teilnahme ist zurückgezogen. Ihr erscheint nicht mehr in den Übersichten.
          <div className="mt-2">
            <Button
              size="sm"
              variant="primary"
              loading={busy}
              onClick={() => save({ ...initial, persons: initial.persons.map((p) => ({ ...p, status: "active" })) }, "Ihr seid wieder angemeldet.")}
            >
              Doch wieder teilnehmen
            </Button>
          </div>
        </Notice>
      )}
      {data.public_url && (
        <a href={data.public_url} className="text-sm font-medium text-pine-700 underline underline-offset-2">
          Gemeinsame Übersicht ansehen →
        </a>
      )}
      <GroupForm
        key={formKey}
        trip={data.trip}
        initial={initial}
        mode="full"
        submitLabel="Änderungen speichern"
        busy={busy}
        serverError={error}
        onSubmit={(g) => save(g, "Gespeichert. Die Organisatoren sehen die Änderung sofort.")}
        footer={
          !allWithdrawn && (
            <Button
              type="button"
              variant="danger"
              onClick={() => {
                if (confirm(ps.length > 1 ? "Wirklich für alle absagen? Ihr könnt die Teilnahme später wieder aktivieren." : "Möchtest du deine Teilnahme wirklich zurückziehen? Du kannst sie später wieder aktivieren."))
                  save({ ...initial, persons: initial.persons.map((p) => ({ ...p, status: "withdrawn" })) }, ps.length > 1 ? "Die Teilnahme aller Personen wurde zurückgezogen." : "Deine Teilnahme wurde zurückgezogen.");
              }}
            >
              {ps.length > 1 ? "Für alle absagen" : "Teilnahme zurückziehen"}
            </Button>
          )
        }
      />
    </PublicShell>
  );
}
