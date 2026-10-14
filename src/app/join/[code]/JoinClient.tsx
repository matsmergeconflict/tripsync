"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { PublicShell } from "@/components/PublicShell";
import { GroupForm, emptyGroup, groupToPayload } from "@/components/GroupForm";
import type { FormTrip } from "@/components/ParticipantForm";
import { Button, CopyLink, ErrorBox, Loading, Notice } from "@/components/ui";
import { api, ApiError } from "@/lib/client/api";
import type { Approval } from "@/lib/types";

interface Done {
  edit_url: string;
  public_url: string | null;
  approval: Approval;
  ids: string[];
}

export function JoinClient() {
  const { code } = useParams<{ code: string }>();
  const [trip, setTrip] = useState<(FormTrip & { location: string | null }) | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Done | null>(null);

  const load = useCallback(() => {
    api<{ trip: FormTrip & { location: string | null } }>(`/api/join/${code}`)
      .then((r) => {
        setTrip(r.trip);
        setLoadError(null);
      })
      .catch((e) => setLoadError(e instanceof ApiError ? e.message : "Fehler beim Laden"));
  }, [code]);
  useEffect(load, [load]);

  if (loadError)
    return (
      <PublicShell>
        <ErrorBox onRetry={load}>{loadError}</ErrorBox>
      </PublicShell>
    );
  if (!trip)
    return (
      <PublicShell>
        <Loading />
      </PublicShell>
    );

  if (done) {
    const many = done.ids.length > 1;
    return (
      <PublicShell trip={trip}>
        <div className="flex flex-col gap-4" data-testid="join-done">
          {done.approval === "pending" ? (
            <Notice tone="info">
              <strong>Danke, {many ? `eure Anmeldung (${done.ids.length} Personen) ist` : "deine Anmeldung ist"} eingegangen!</strong> Die Organisatoren müssen sie noch
              bestätigen. Über deinen persönlichen Link siehst du jederzeit den aktuellen Stand.
            </Notice>
          ) : (
            <Notice tone="ok">
              <strong>Danke, {many ? `ihr seid (${done.ids.length} Personen)` : "du bist"} angemeldet!</strong> Die Organisatoren sehen die Angaben ab sofort.
            </Notice>
          )}
          <div className="rounded-xl border border-line bg-surface p-4">
            <h2 className="mb-2 font-semibold">Dein persönlicher Bearbeitungslink</h2>
            <p className="mb-3 text-sm text-muted">
              Mit diesem Link {many ? "könnt ihr die Angaben aller angemeldeten Personen" : "kannst du deine Angaben"} jederzeit ändern, Personen ergänzen oder absagen –
              und siehst, ob die Anmeldung bestätigt wurde. Speichere ihn (z. B. als Lesezeichen) und gib ihn nicht weiter.
            </p>
            <CopyLink url={done.edit_url} label="Bearbeitungslink" secret />
            <div className="mt-3">
              <a href={done.edit_url} className="text-sm font-medium text-pine-700 underline underline-offset-2">
                Jetzt öffnen
              </a>
            </div>
          </div>
          {done.public_url && (
            <a href={done.public_url}>
              <Button className="w-full">Sehen, wer wann da ist</Button>
            </a>
          )}
        </div>
      </PublicShell>
    );
  }

  return (
    <PublicShell trip={trip}>
      <div>
        <h1 className="text-xl font-semibold">Anmeldung</h1>
        <p className="text-sm text-muted">Dauert ein bis zwei Minuten. Kein Konto nötig – alles lässt sich später noch ändern. Familien können sich gemeinsam anmelden.</p>
      </div>
      <GroupForm
        trip={trip}
        initial={emptyGroup()}
        mode="wizard"
        submitLabel="Anmeldung absenden"
        busy={busy}
        serverError={error}
        onSubmit={async (g) => {
          setBusy(true);
          setError(null);
          try {
            const res = await api<Done>(`/api/join/${code}`, { body: groupToPayload(g) });
            setDone(res);
            window.scrollTo({ top: 0 });
          } catch (e) {
            setError(e instanceof ApiError ? e.message : "Fehler beim Senden");
          } finally {
            setBusy(false);
          }
        }}
      />
    </PublicShell>
  );
}
