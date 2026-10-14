import "server-only";
import { EventEmitter } from "node:events";
import pg from "pg";

/**
 * Live-Aktualisierung: Jede Änderung ruft pg_notify('tripsync', {tripId}) auf.
 * Ein einzelner LISTEN-Client pro Serverprozess verteilt die Meldungen an alle
 * offenen Server-Sent-Events-Verbindungen der betroffenen Reise. Da die Meldung
 * über Postgres läuft, funktioniert das auch mit mehreren Serverinstanzen.
 */
const g = globalThis as unknown as { __tripsyncBus?: { emitter: EventEmitter; ready: Promise<void> | null } };

function bus() {
  if (!g.__tripsyncBus) {
    const emitter = new EventEmitter();
    emitter.setMaxListeners(0);
    g.__tripsyncBus = { emitter, ready: null };
  }
  return g.__tripsyncBus;
}

async function connectListener(): Promise<void> {
  const b = bus();
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  client.on("notification", (msg) => {
    try {
      const { tripId, kind } = JSON.parse(msg.payload ?? "{}");
      if (tripId) b.emitter.emit(tripId, kind ?? "change");
    } catch {
      /* ignorieren */
    }
  });
  const reconnect = () => {
    b.ready = null;
    setTimeout(() => ensureListener().catch(() => {}), 2000);
  };
  client.on("error", reconnect);
  client.on("end", reconnect);
  await client.connect();
  await client.query("LISTEN tripsync");
  // Nach (Wieder-)Verbindung könnten Meldungen verpasst worden sein: alle offenen Ansichten neu laden lassen
  for (const name of b.emitter.eventNames()) b.emitter.emit(name, "resync");
}

export function ensureListener(): Promise<void> {
  const b = bus();
  if (!b.ready) b.ready = connectListener().catch((e) => {
    b.ready = null;
    throw e;
  });
  return b.ready;
}

/** Erzeugt eine SSE-Antwort, die bei jeder Änderung an der Reise ein Event sendet. */
export async function sseResponse(tripId: string, signal: AbortSignal): Promise<Response> {
  await ensureListener();
  const emitter = bus().emitter;
  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    start(controller) {
      const send = (text: string) => {
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          cleanup();
        }
      };
      const onChange = (kind: string) => send(`event: change\ndata: ${JSON.stringify({ kind, at: Date.now() })}\n\n`);
      emitter.on(tripId, onChange);
      const heartbeat = setInterval(() => send(`: ping\n\n`), 20_000);
      send(`retry: 3000\nevent: ready\ndata: {}\n\n`);
      cleanup = () => {
        clearInterval(heartbeat);
        emitter.off(tripId, onChange);
        try {
          controller.close();
        } catch {
          /* schon geschlossen */
        }
      };
      signal.addEventListener("abort", () => cleanup());
    },
    cancel() {
      cleanup();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
