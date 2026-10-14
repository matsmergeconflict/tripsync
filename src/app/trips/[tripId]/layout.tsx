import { Suspense } from "react";
import type { Metadata } from "next";
import { Loading } from "@/components/ui";
import { OrgShell } from "./OrgShell";

export const metadata: Metadata = { title: "Organisation" };

export default function TripLayout({ children }: LayoutProps<"/trips/[tripId]">) {
  return (
    <Suspense fallback={<Loading label="Reise wird geladen …" />}>
      <OrgShell>{children}</OrgShell>
    </Suspense>
  );
}
