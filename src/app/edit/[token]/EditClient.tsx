"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { PublicShell } from "@/components/PublicShell";
import { ParticipantForm, formFromParticipant, toPayload, type FormState, type FormTrip } from "@/components/ParticipantForm";
import { Button, ErrorBox, Loading, Notice } from "@/components/ui";
import { api, ApiError } from "@/lib/client/api";
import type { Participant } from "@/lib/types";

type Me = Omit<Participant, "org_note">;

export function EditClient() {
  const { token } = useParams<{ token: string }>();
  const headers = { "x-edit-token": token };
  const [data, setData] = useState<{ participant: Me; trip: FormTrip & { location: string | null }; public_url: string | null } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);

  const load = useCallback(() => {
    api<NonNullable<typeof data>>("/api/me", { headers: { "x-edit-token": token } })
      .then((r) => {
        setData(r);
        setLoadError(null);
        setFormKey((k) => k + 1);
      })
      .catch((e) => setLoadError(e instanceof ApiError ? e.message : "Fehler beim Laden"));
  }, [token]);
  useEffect(load, [load]);

  const save = async (f: FormState, statusOverride?: "active" | "withdrawn") => {
    if (!data) return;
    setBusy(true);
    setErrors({});
    setSaved(null);
    try {
      const res = await api<{ participant: Me }>("/api/me", {
        method: "PATCH",
        headers,
        body: { ...toPayload({ ...f, status: statusOverride ?? f.status }), version: data.participant.version },
      });
      setData({ ...data, participant: res.participant });
      setFormKey((k) => k + 1);
      setSaved(
        statusOverride === "withdrawn"
          ? "Deine Teilnahme wurde zurückgezogen."
          : statusOverride === "active"
            ? "Du bist wieder angemeldet."
            : "Gespeichert. Die Organisatoren sehen die Änderung sofort."
      );
      window.scrollTo({ top: 0 });
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.status === 409 && e.current) {
          setData({ ...data, participant: e.current as Me });
          setFormKey((k) => k + 1);
          setErrors({ _: "Deine Anmeldung wurde inzwischen (z. B. von einem Organisator) geändert. Wir haben den aktuellen Stand geladen – bitte prüfe ihn und speichere erneut." });
        } else setErrors({ ...e.fields, _: e.message });
      }
    } finally {
      setBusy(false);
    }
  };

  if (loadError)
    return (
      <PublicShell>
        <ErrorBox onRetry={load}>
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

  const p = data.participant;
  const withdrawn = p.status === "withdrawn";

  return (
    <PublicShell trip={data.trip}>
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Hallo {p.first_name}!</h1>
        <p className="text-sm text-muted">Hier kannst du deine Anmeldung ansehen und ändern. Dieser Link gehört nur dir.</p>
      </div>
      {saved && (
        <Notice tone="ok">
          <span role="status">{saved}</span>
        </Notice>
      )}
      {errors._ && (
        <div role="alert" className="rounded-lg bg-danger-soft px-3.5 py-3 text-sm font-medium text-danger">
          {errors._}
        </div>
      )}
      {withdrawn && (
        <Notice tone="warn">
          Du hast deine Teilnahme zurückgezogen. Du erscheinst nicht mehr in den Übersichten.
          <div className="mt-2">
            <Button size="sm" variant="primary" onClick={() => save(formFromParticipant(p), "active")} loading={busy}>
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
      <ParticipantForm
        key={formKey}
        trip={data.trip}
        initial={formFromParticipant(p)}
        mode="full"
        submitLabel="Änderungen speichern"
        busy={busy}
        serverErrors={errors}
        onSubmit={(f) => save(f)}
        footer={
          !withdrawn && (
            <Button
              type="button"
              variant="danger"
              onClick={() => {
                if (confirm("Möchtest du deine Teilnahme wirklich zurückziehen? Du kannst sie später wieder aktivieren.")) save(formFromParticipant(p), "withdrawn");
              }}
            >
              Teilnahme zurückziehen
            </Button>
          )
        }
      />
    </PublicShell>
  );
}
