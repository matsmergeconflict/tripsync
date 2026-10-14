import { Suspense } from "react";
import type { Metadata } from "next";
import { Loading } from "@/components/ui";
import { PublicView } from "./PublicView";

export const metadata: Metadata = { title: "Wer ist wann da?" };

export default function ViewPage() {
  return (
    <Suspense fallback={<Loading />}>
      <PublicView />
    </Suspense>
  );
}
