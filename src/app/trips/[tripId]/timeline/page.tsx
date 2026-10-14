import { TimelineView } from "./TimelineView";

// Inhalte werden clientseitig nach dem Laden der Reisedaten gerendert – keine statische Shell zu validieren.
export const instant = false;


export default function Page() {
  return <TimelineView />;
}
