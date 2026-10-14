"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { TripProvider, useTrip } from "./TripContext";
import { Button, ErrorBox, Loading, cx } from "@/components/ui";
import { formatShort } from "@/lib/dates";
import { isComplete } from "@/lib/stats";

const NAV = [
  { href: "", label: "Übersicht", icon: "M3 11l9-7 9 7v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z" },
  { href: "/timeline", label: "Zeitachse", icon: "M4 6h10M4 12h16M4 18h7" },
  { href: "/participants", label: "Teilnehmer", icon: "M16 19v-1a4 4 0 00-4-4H7a4 4 0 00-4 4v1M9.5 10a3 3 0 100-6 3 3 0 000 6zM21 19v-1a4 4 0 00-3-3.87M16 4.13a3 3 0 010 5.74" },
  { href: "/ski", label: "Skipässe", icon: "M12 2v20M4.9 6.5l14.2 11M19.1 6.5L4.9 17.5" },
  { href: "/meals", label: "Essensplanung", icon: "M7 3v8a2 2 0 002 2v8M11 3v6M3 3v6a4 4 0 004 4M17 3c-2 2-2 6 0 8v10" },
  { href: "/shopping", label: "Einkaufsliste", icon: "M3 4h2l2.4 11.2a2 2 0 002 1.6h7.7a2 2 0 002-1.5L21 8H6M10 21a1 1 0 100-2 1 1 0 000 2zM18 21a1 1 0 100-2 1 1 0 000 2z" },
  { href: "/settings", label: "Einstellungen", icon: "M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" },
];

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" className="size-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

function NavLinks({ base, onNavigate }: { base: string; onNavigate?: () => void }) {
  const pathname = usePathname();
  const { issues, active, data } = useTrip();
  const openIssues = active.filter((p) => !isComplete(issues.get(p.id) ?? [])).length;
  return (
    <nav aria-label="Hauptnavigation" className="flex flex-col gap-0.5">
      {NAV.filter((n) => n.href !== "/ski" || data.trip.ski_enabled).map((n) => {
        const href = base + n.href;
        const current = n.href === "" ? pathname === base : pathname.startsWith(href);
        return (
          <Link
            key={n.href}
            href={href}
            onClick={onNavigate}
            aria-current={current ? "page" : undefined}
            className={cx(
              "flex min-h-11 items-center gap-3 rounded-lg px-3 text-[15px] transition-colors",
              current ? "bg-pine-50 font-semibold text-pine-800" : "text-ink hover:bg-sunken"
            )}
          >
            <Icon d={n.icon} />
            <span className="flex-1">{n.label}</span>
            {n.href === "/participants" && openIssues > 0 && (
              <span className="rounded-full bg-amber-soft px-2 text-xs font-semibold text-amber-ink" title="Anmeldungen mit offenen Angaben">
                {openIssues}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

function LiveDot() {
  const { live } = useTrip();
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted" title={live === "live" ? "Änderungen erscheinen sofort" : "Verbindung wird hergestellt"}>
      <span className={cx("size-2 rounded-full", live === "live" ? "bg-pine-500" : live === "connecting" ? "bg-amber-line" : "bg-danger")} aria-hidden />
      {live === "live" ? "Live" : live === "connecting" ? "Verbinde …" : "Offline"}
    </span>
  );
}

function Frame({ children }: { children: ReactNode }) {
  const { data, tripId } = useTrip();
  const base = `/trips/${tripId}`;
  const [menu, setMenu] = useState(false);
  const t = data.trip;
  return (
    <div className="flex min-h-dvh flex-1">
      <aside className="no-print sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-5 border-r border-line bg-surface p-4 lg:flex">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-pine-700">TripSync</div>
          <div className="mt-1 font-semibold leading-snug">{t.name}</div>
          <div className="text-xs text-muted">
            {formatShort(t.start_date)} – {formatShort(t.end_date)}
          </div>
        </div>
        <NavLinks base={base} />
        <div className="mt-auto flex items-center justify-between border-t border-line pt-3 text-xs text-muted">
          <span className="truncate">Angemeldet als {data.me.name}</span>
          <LiveDot />
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-40 flex items-center gap-3 border-b border-line bg-surface/95 px-4 py-2.5 backdrop-blur lg:hidden">
          <Button variant="ghost" size="sm" onClick={() => setMenu(true)} aria-label="Menü öffnen" aria-expanded={menu} className="-ml-2">
            <Icon d="M4 6h16M4 12h16M4 18h16" />
          </Button>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-semibold">{t.name}</div>
          </div>
          <LiveDot />
        </header>
        {menu && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div className="absolute inset-0 bg-ink/30" onClick={() => setMenu(false)} aria-hidden />
            <div role="dialog" aria-modal="true" aria-label="Menü" className="absolute inset-y-0 left-0 flex w-[82%] max-w-xs flex-col gap-5 bg-surface p-4 shadow-xl">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold">{t.name}</div>
                  <div className="text-xs text-muted">
                    {formatShort(t.start_date)} – {formatShort(t.end_date)}
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setMenu(false)} aria-label="Menü schließen">
                  ✕
                </Button>
              </div>
              <NavLinks base={base} onNavigate={() => setMenu(false)} />
              <div className="mt-auto text-xs text-muted">Angemeldet als {data.me.name}</div>
            </div>
          </div>
        )}
        <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 px-4 py-5 sm:px-6 sm:py-7">{children}</main>
      </div>
    </div>
  );
}

export function OrgShell({ children }: { children: ReactNode }) {
  const { tripId } = useParams<{ tripId: string }>();
  return (
    <TripProvider
      tripId={tripId}
      fallback={<Loading label="Reise wird geladen …" />}
      errorView={(msg, status, retry) => (
        <div className="mx-auto w-full max-w-lg px-4 py-16">
          <ErrorBox onRetry={status >= 500 || status === 0 ? retry : undefined}>
            <p className="font-semibold">{msg}</p>
            {(status === 401 || status === 403) && (
              <p className="mt-2 text-ink">Öffne deinen persönlichen Organisator-Link, um diese Reise zu verwalten. Teilnehmer nutzen ihren eigenen Bearbeitungslink.</p>
            )}
          </ErrorBox>
        </div>
      )}
    >
      <Frame>{children}</Frame>
    </TripProvider>
  );
}
