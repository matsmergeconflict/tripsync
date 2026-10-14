import { Suspense } from "react";
import type { Metadata } from "next";
import { Loading } from "@/components/ui";
import { EditClient } from "./EditClient";

export const metadata: Metadata = { title: "Meine Anmeldung" };

export default function EditPage() {
  return (
    <Suspense fallback={<Loading />}>
      <EditClient />
    </Suspense>
  );
}
