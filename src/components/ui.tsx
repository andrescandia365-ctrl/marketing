import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { Beat, Role } from "../../shared/schema.ts";
import { BEAT_INFO } from "../../shared/template.ts";

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" }) {
  const styles = {
    primary: "bg-ink text-white hover:bg-black disabled:bg-muted",
    secondary: "bg-white text-ink border border-line hover:border-ink disabled:text-muted",
    ghost: "text-ink hover:bg-black/5 disabled:text-muted",
  }[variant];
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed ${styles} ${className}`}
      {...props}
    />
  );
}

// `group` for fields that hold buttons: a <label> would click its first button whenever its text is clicked.
export function Field({ label, hint, group, children }: { label: string; hint?: string; group?: boolean; children: ReactNode }) {
  const Tag = group ? "div" : "label";
  return (
    <Tag className="block" role={group ? "group" : undefined} aria-label={group ? label : undefined}>
      <span className="text-sm font-semibold">{label}</span>
      {hint && <span className="mt-0.5 block text-xs text-muted">{hint}</span>}
      <div className="mt-1.5">{children}</div>
    </Tag>
  );
}

export const inputClass =
  "w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-ink focus:ring-2 focus:ring-ink/10";

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex flex-wrap rounded-lg border border-line bg-white p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${
            value === o.value ? "bg-ink text-white" : "text-muted hover:text-ink"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const BEAT_CHIP = {
  negative: "bg-neg-soft text-neg border-neg/40",
  touching: "bg-touch-soft text-touch border-touch/40",
  good: "bg-good-soft text-good border-good/40",
};

export function BeatChip({ beat }: { beat: Beat }) {
  return (
    <span className={`rounded border px-1.5 py-0.5 text-xs font-semibold ${BEAT_CHIP[beat]}`}>{BEAT_INFO[beat].label}</span>
  );
}

// Colour per role, so the Good-vs-Bad dialogue reads at a glance.
export const ROLE_TEXT: Record<Role, string> = {
  good: "text-good",
  bad: "text-neg",
  human: "text-touch",
  narrator: "text-muted",
};

export function Spinner() {
  return <span className="inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />;
}

export function Notice({ tone = "info", children }: { tone?: "info" | "error" | "warn"; children: ReactNode }) {
  const styles = {
    info: "border-line bg-white",
    error: "border-neg/40 bg-neg-soft text-neg",
    warn: "border-touch/30 bg-touch-soft",
  }[tone];
  return <div className={`rounded-lg border px-4 py-3 text-sm ${styles}`}>{children}</div>;
}

// Every piece is named by the problem it solves; the hook title comes second. Older pieces have no problem.
export function PieceTitle({ problem, title }: { problem: string; title: string }) {
  if (!problem) return <h2 className="text-xl font-bold tracking-tight">{title}</h2>;
  return (
    <>
      <h2 className="text-xl font-bold tracking-tight">{problem}</h2>
      <p className="text-sm font-semibold">
        <span className="font-normal text-muted">Gancho: </span>
        {title}
      </p>
    </>
  );
}
