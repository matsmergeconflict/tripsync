"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, CopyLink, Field, Input, Notice } from "@/components/ui";
import { api, ApiError } from "@/lib/client/api";

export function CreateTripForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [form, setForm] = useState({ name: "", location: "", start_date: "", end_date: "", organizer_name: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ trip_id: string; organizer_url: string } | null>(null);

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  if (created) {
    return (
      <div className="flex flex-col gap-4" data-testid="trip-created">
        <Notice tone="ok">Die Reise ist angelegt.</Notice>
        <p className="text-sm">
          <strong>Speichere deinen persönlichen Organisator-Link.</strong> Damit kommst du von jedem Gerät wieder in die Organisation. Gib ihn nicht weiter – jeder mit
          diesem Link kann die Reise verwalten.
        </p>
        <CopyLink url={created.organizer_url} label="Dein Organisator-Link" secret />
        <Button variant="primary" onClick={() => router.push(`/trips/${created.trip_id}`)}>
          Zur Reise
        </Button>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErrors({});
        try {
          const res = await api<{ trip_id: string; organizer_url: string }>("/api/trips", { body: { ...form, location: form.location || null } });
          setCreated(res);
        } catch (err) {
          if (err instanceof ApiError) setErrors({ ...err.fields, _: err.message });
        } finally {
          setBusy(false);
        }
      }}
    >
      {params.get("fehler") === "link" && <Notice tone="warn">Dieser Organisator-Link ist ungültig oder wurde zurückgesetzt.</Notice>}
      <Field label="Name der Reise" error={errors.name}>
        {(p) => <Input {...p} placeholder="z. B. Skiwoche Zillertal 2027" value={form.name} onChange={(e) => set("name", e.target.value)} maxLength={120} />}
      </Field>
      <Field label="Ort / Unterkunft" optional error={errors.location}>
        {(p) => <Input {...p} placeholder="z. B. Hütte am Hang" value={form.location} onChange={(e) => set("location", e.target.value)} maxLength={120} />}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Erster Tag" error={errors.start_date}>
          {(p) => <Input {...p} type="date" value={form.start_date} onChange={(e) => set("start_date", e.target.value)} />}
        </Field>
        <Field label="Letzter Tag" error={errors.end_date}>
          {(p) => <Input {...p} type="date" min={form.start_date || undefined} value={form.end_date} onChange={(e) => set("end_date", e.target.value)} />}
        </Field>
      </div>
      <Field label="Dein Name" hint="So erscheinst du im Änderungsprotokoll." error={errors.organizer_name}>
        {(p) => <Input {...p} autoComplete="name" value={form.organizer_name} onChange={(e) => set("organizer_name", e.target.value)} maxLength={80} />}
      </Field>
      {errors._ && !Object.keys(errors).some((k) => k !== "_") && <p className="text-sm font-medium text-danger">{errors._}</p>}
      <Button type="submit" variant="primary" loading={busy}>
        Reise anlegen
      </Button>
    </form>
  );
}
