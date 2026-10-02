import type { Hook } from "../../shared/schema.ts";
import { Spinner } from "./ui.tsx";

type Props = {
  hooks: Hook[];
  questions: string[];
  pending: Hook | null;
  onPick: (hook: Hook) => void;
};

export function HookPicker({ hooks, questions, pending, onPick }: Props) {
  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-2">
        {hooks.map((hook) => {
          const busy = pending === hook;
          return (
            <button
              key={hook.line}
              type="button"
              disabled={pending !== null}
              onClick={() => onPick(hook)}
              className="group rounded-xl border border-line bg-white p-4 text-left transition hover:border-ink disabled:cursor-wait disabled:opacity-60"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="rounded bg-neg-soft px-1.5 py-0.5 font-mono text-xs font-semibold text-neg">
                  {hook.move}
                </span>
                <span className="flex items-center gap-2 text-xs font-semibold text-muted group-hover:text-ink">
                  {busy ? (
                    <>
                      <Spinner /> Escribiendo el guion…
                    </>
                  ) : (
                    "Usar este gancho →"
                  )}
                </span>
              </div>
              <p className="mt-3 text-lg leading-snug font-bold">“{hook.line}”</p>
              <p className="mt-2 text-sm text-muted">
                <span className="font-semibold text-ink">En pantalla:</span> {hook.visual}
              </p>
              <p className="mt-1 text-sm text-muted">{hook.why}</p>
            </button>
          );
        })}
      </div>

      {questions.length > 0 && (
        <div className="rounded-xl border border-touch/30 bg-touch-soft p-4">
          <p className="text-sm font-semibold text-touch">Completá esto antes de publicar</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {questions.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
