"use client";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public fields: Record<string, string> = {},
    public current?: unknown
  ) {
    super(message);
  }
}

export async function api<T = unknown>(
  url: string,
  opts: { method?: string; body?: unknown; headers?: Record<string, string>; signal?: AbortSignal } = {}
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method ?? (opts.body ? "POST" : "GET"),
      headers: { ...(opts.body ? { "Content-Type": "application/json" } : {}), ...opts.headers },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      credentials: "same-origin",
      cache: "no-store",
      signal: opts.signal,
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError(0, "Keine Verbindung zum Server. Bitte Internetverbindung prüfen.");
  }
  let data: Record<string, unknown> = {};
  try {
    data = await res.json();
  } catch {
    /* kein JSON */
  }
  if (!res.ok) {
    throw new ApiError(
      res.status,
      (data.error as string) ?? `Fehler ${res.status}`,
      (data.fields as Record<string, string>) ?? {},
      data.current
    );
  }
  return data as T;
}
