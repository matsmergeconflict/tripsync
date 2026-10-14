"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Hört auf Server-Sent Events und ruft `onChange` (entprellt) bei Änderungen auf.
 * Fällt bei Verbindungsproblemen auf Polling zurück und lädt beim Zurückkehren in den Tab neu.
 */
export function useLive(url: string | null, onChange: () => void): "live" | "connecting" | "offline" {
  const cb = useRef(onChange);
  useEffect(() => {
    cb.current = onChange;
  }, [onChange]);
  const [state, setState] = useState<"live" | "connecting" | "offline">("connecting");

  useEffect(() => {
    if (!url) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const trigger = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => cb.current(), 150);
    };
    const es = new EventSource(url);
    es.addEventListener("ready", () => setState("live"));
    es.addEventListener("change", trigger);
    es.onerror = () => setState(es.readyState === EventSource.CLOSED ? "offline" : "connecting");
    es.onopen = () => {
      setState("live");
      trigger(); // nach Wiederverbindung verpasste Änderungen nachladen
    };
    // Sicherheitsnetz: ohne offene Verbindung alle 30 s, sonst alle 2 min vollständig neu laden
    let ticks = 0;
    const poll = setInterval(() => {
      ticks++;
      if (es.readyState !== EventSource.OPEN || ticks % 4 === 0) cb.current();
    }, 30_000);
    const onVisible = () => document.visibilityState === "visible" && trigger();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      es.close();
      clearInterval(poll);
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [url]);
  return state;
}
