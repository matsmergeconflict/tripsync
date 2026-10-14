"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { PublicShell } from "@/components/PublicShell";
import { ParticipantForm, emptyForm, toPayload, type FormTrip } from "@/components/ParticipantForm";
import { Button, CopyLink, ErrorBox, Loading, Notice } from "@/components/ui";
import { api, ApiError } from "@/lib/client/api";

export function JoinClient() {
  const { code } = useParams<{ code: string }>();
  const [trip, setTrip] = useState<(FormTrip & { location: string | null }) | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ edit_url: string; public_url: string | null } | null>(null);

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
    return (
      <PublicShell trip={trip}>
        <div className="flex flex-col gap-4" data-testid="join-done">
          <Notice tone="ok">
            <strong>Danke, du bist angemeldet!</strong> Die Organisatoren sehen deine Angaben ab sofort.
          </Notice>
          <div className="rounded-xl border border-line bg-surface p-4">
            <h2 className="mb-2 font-semibold">Dein persönlicher Bearbeitungslink</h2>
            <p className="mb-3 text-sm text-muted">
              Mit diesem Link kannst du deine Angaben jederzeit ändern oder deine Teilnahme zurückziehen. Speichere ihn (z. B. als Lesezeichen) und gib ihn nicht weiter.
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
        <p className="text-sm text-muted">Dauert ein bis zwei Minuten. Kein Konto nötig – du kannst alles später noch ändern.</p>
      </div>
      <ParticipantForm
        trip={trip}
        initial={emptyForm()}
        mode="wizard"
        submitLabel="Anmeldung absenden"
        busy={busy}
        serverErrors={errors}
        onSubmit={async (f) => {
          setBusy(true);
          setErrors({});
          try {
            const res = await api<{ edit_url: string; public_url: string | null }>(`/api/join/${code}`, { body: toPayload(f) });
            setDone(res);
            window.scrollTo({ top: 0 });
          } catch (e) {
            if (e instanceof ApiError) setErrors({ ...e.fields, _: e.message });
          } finally {
            setBusy(false);
          }
        }}
      />
      {errors._ && (
        <p role="alert" className="text-sm font-medium text-danger">
          {errors._}
        </p>
      )}
    </PublicShell>
  );
}
