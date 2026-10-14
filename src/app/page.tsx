import { Suspense } from "react";
import { CreateTripForm } from "./CreateTripForm";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-4 py-10 sm:py-16">
      <header className="flex items-center gap-2 text-pine-700">
        <Logo />
        <span className="text-lg font-semibold tracking-tight">TripSync</span>
      </header>
      <div className="grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:items-start">
        <section className="flex flex-col gap-5">
          <h1 className="text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
            Wer ist wann da?
            <br />
            <span className="text-pine-600">Endlich auf einen Blick.</span>
          </h1>
          <p className="max-w-lg text-[17px] leading-relaxed text-muted">
            TripSync organisiert Gruppenreisen mit unterschiedlichen An- und Abreisen – Skiurlaub, Hüttenwochenende, Gruppenfahrt. Alle tragen sich per
            Link ein, ohne Konto. Du siehst sofort, wie viele Leute an jedem Tag da sind, wer welchen Skipass braucht und was eingekauft werden muss.
          </p>
          <ul className="grid gap-3 text-[15px] sm:grid-cols-2">
            {[
              ["Zeitachse", "Ein Balken pro Person – An- und Abreise sofort sichtbar."],
              ["Ohne Konto", "Einladungslink teilen, jeder pflegt seine Daten selbst."],
              ["Skipässe", "Bedarf pro Tag und Kategorie, automatisch gezählt."],
              ["Essen & Einkauf", "Portionen aus den Anmeldungen, Einkaufsliste aus den Rezepten."],
            ].map(([t, d]) => (
              <li key={t} className="rounded-xl border border-line bg-surface p-4">
                <div className="font-semibold">{t}</div>
                <div className="text-sm text-muted">{d}</div>
              </li>
            ))}
          </ul>
        </section>
        <section className="rounded-2xl border border-line bg-surface p-5 shadow-sm sm:p-6">
          <h2 className="mb-1 text-lg font-semibold">Neue Reise anlegen</h2>
          <p className="mb-5 text-sm text-muted">Du wirst Organisator und bekommst einen persönlichen Zugangslink.</p>
          <Suspense>
            <CreateTripForm />
          </Suspense>
        </section>
      </div>
    </main>
  );
}

function Logo() {
  return (
    <svg viewBox="0 0 32 32" className="size-8" aria-hidden>
      <rect width="32" height="32" rx="8" fill="currentColor" />
      <path d="M6 23l6-9 4 5 3-4 7 8z" fill="#fff" />
      <rect x="7" y="9" width="10" height="2.5" rx="1.25" fill="#a6dcc9" />
      <rect x="12" y="13" width="13" height="2.5" rx="1.25" fill="#a6dcc9" opacity=".7" />
    </svg>
  );
}
