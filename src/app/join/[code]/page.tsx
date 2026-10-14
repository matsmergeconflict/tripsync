import { Suspense } from "react";
import type { Metadata } from "next";
import { Loading } from "@/components/ui";
import { JoinClient } from "./JoinClient";

export const metadata: Metadata = { title: "Anmeldung" };

export default function JoinPage() {
  return (
    <Suspense fallback={<Loading />}>
      <JoinClient />
    </Suspense>
  );
}
