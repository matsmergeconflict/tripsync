"use client";

import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

export function cx(...c: (string | false | null | undefined)[]): string {
  return c.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  variant = "secondary",
  size = "md",
  className,
  loading,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md"; loading?: boolean }) {
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed select-none",
        size === "md" ? "min-h-11 px-4 text-[15px]" : "min-h-9 px-3 text-sm",
        variant === "primary" && "bg-pine-600 text-white hover:bg-pine-700 active:bg-pine-800",
        variant === "secondary" && "bg-surface text-ink border border-line hover:bg-sunken",
        variant === "ghost" && "text-muted hover:bg-sunken hover:text-ink",
        variant === "danger" && "bg-surface text-danger border border-danger/30 hover:bg-danger-soft",
        className
      )}
    >
      {loading && <Spinner small />}
      {children}
    </button>
  );
}

export function Spinner({ small }: { small?: boolean }) {
  return (
    <span
      role="status"
      aria-label="Lädt"
      className={cx("inline-block animate-spin rounded-full border-2 border-current border-r-transparent", small ? "size-4" : "size-6")}
    />
  );
}

export function Field({
  label,
  hint,
  error,
  children,
  optional,
  id,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  children: (props: { id: string; "aria-invalid"?: boolean; "aria-describedby"?: string }) => ReactNode;
  optional?: boolean;
  id?: string;
}) {
  const auto = useId();
  const fid = id ?? auto;
  const describedBy = [hint ? `${fid}-hint` : null, error ? `${fid}-err` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={fid} className="text-sm font-medium text-ink">
        {label}
        {optional && <span className="ml-1 font-normal text-faint">(optional)</span>}
      </label>
      {children({ id: fid, "aria-invalid": error ? true : undefined, "aria-describedby": describedBy })}
      {hint && !error && (
        <p id={`${fid}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${fid}-err`} role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

const inputCls =
  "w-full min-h-11 rounded-lg border border-line bg-surface px-3 text-[16px] text-ink placeholder:text-faint aria-[invalid=true]:border-danger focus:border-pine-500";

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(inputCls, props.className)} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={3} {...props} className={cx(inputCls, "py-2.5 leading-snug", props.className)} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(inputCls, "pr-8", props.className)} />;
}

/** Segmentierte Auswahl (große Touch-Ziele, als Radiogruppe zugänglich). */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  name,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; hint?: string }[];
  label: string;
  name?: string;
}) {
  const auto = useId();
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <label
            key={o.value}
            className={cx(
              "flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3.5 text-[15px] transition-colors",
              active ? "border-pine-500 bg-pine-50 text-pine-800 font-medium" : "border-line bg-surface text-ink hover:bg-sunken"
            )}
          >
            <input type="radio" className="sr-only" name={name ?? auto} checked={active} onChange={() => onChange(o.value)} />
            <span aria-hidden className={cx("size-4 rounded-full border-2", active ? "border-pine-600 bg-pine-600 ring-2 ring-inset ring-white" : "border-faint")} />
            {o.label}
          </label>
        );
      })}
    </div>
  );
}

export function Card({ children, className, title, actions }: { children: ReactNode; className?: string; title?: ReactNode; actions?: ReactNode }) {
  return (
    <section className={cx("rounded-xl border border-line bg-surface", className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          {title && <h2 className="text-[15px] font-semibold">{title}</h2>}
          {actions}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Badge({ tone = "neutral", children, className }: { tone?: "neutral" | "ok" | "warn" | "bad" | "info"; children: ReactNode; className?: string }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-xs font-medium",
        tone === "neutral" && "bg-sunken text-muted",
        tone === "ok" && "bg-pine-50 text-pine-700",
        tone === "warn" && "bg-amber-soft text-amber-ink",
        tone === "bad" && "bg-danger-soft text-danger",
        tone === "info" && "bg-snow-soft text-snow",
        className
      )}
    >
      {children}
    </span>
  );
}

export function ErrorBox({ children, onRetry }: { children: ReactNode; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col gap-3 rounded-xl border border-danger/30 bg-danger-soft p-4 text-sm text-danger">
      <div>{children}</div>
      {onRetry && (
        <div>
          <Button size="sm" onClick={onRetry}>
            Erneut versuchen
          </Button>
        </div>
      )}
    </div>
  );
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-line bg-surface px-6 py-10 text-center">
      <p className="font-medium">{title}</p>
      {children && <div className="max-w-md text-sm text-muted">{children}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Loading({ label = "Lädt …" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-muted">
      <Spinner />
      <span>{label}</span>
    </div>
  );
}

/** Link anzeigen + kopieren (+ teilen auf Mobilgeräten). */
export function CopyLink({ url, label, secret }: { url: string; label?: string; secret?: boolean }) {
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator !== "undefined" && "share" in navigator;
  return (
    <div className="flex flex-col gap-2">
      {label && <span className="text-sm font-medium">{label}</span>}
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          readOnly
          value={url}
          aria-label={label ?? "Link"}
          onFocus={(e) => e.currentTarget.select()}
          className={cx(inputCls, "font-mono text-sm", secret && "bg-amber-soft/40")}
          data-testid="copy-link-input"
        />
        <div className="flex gap-2">
          <Button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(url);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              } catch {
                /* Kopieren nicht erlaubt – Feld ist markierbar */
              }
            }}
          >
            {copied ? "Kopiert ✓" : "Kopieren"}
          </Button>
          {canShare && (
            <Button type="button" variant="ghost" onClick={() => navigator.share({ url }).catch(() => {})}>
              Teilen
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Seitenpanel (Desktop) bzw. Bottom-Sheet (Mobil). */
export function Sheet({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      prev?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-stretch sm:justify-end">
      <div className="absolute inset-0 bg-ink/30" onClick={onClose} aria-hidden />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : undefined}
        tabIndex={-1}
        className={cx(
          "relative flex max-h-[92dvh] w-full flex-col rounded-t-2xl bg-surface shadow-xl sm:max-h-none sm:rounded-none",
          wide ? "sm:w-[640px]" : "sm:w-[460px]"
        )}
      >
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h2 className="text-base font-semibold">{title}</h2>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Schließen">
            ✕
          </Button>
        </header>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "ok"; children: ReactNode }) {
  return (
    <div
      className={cx(
        "rounded-lg px-3.5 py-3 text-sm",
        tone === "info" && "bg-snow-soft text-snow",
        tone === "warn" && "bg-amber-soft text-amber-ink",
        tone === "ok" && "bg-pine-50 text-pine-800"
      )}
    >
      {children}
    </div>
  );
}
