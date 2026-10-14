import { Suspense } from "react";
import type { Metadata } from "next";
import { Loading } from "@/components/ui";
import { OrgShell } from "./OrgShell";

// Inhalte werden clientseitig nach dem Laden der Reisedaten gerendert – keine statische Shell zu validieren.
export const instant = false;


export const metadata: Metadata = { title: "Organisation" };

export default function TripLayout({ children }: LayoutProps<"/trips/[tripId]">) {
  return (
    <Suspense fallback={<Loading label="Reise wird geladen …" />}>
      <OrgShell>{children}</OrgShell>
    </Suspense>
  );
}
