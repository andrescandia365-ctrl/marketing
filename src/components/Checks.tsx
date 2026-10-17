import type { Problem } from "../../shared/checks.ts";
import type { Story } from "../../shared/schema.ts";
import { Button, Spinner } from "./ui.tsx";
import { ClaudeHandoff, type Handoff } from "./ClaudeHandoff.tsx";

type Props = {
  problems: Problem[];
  dismissed: number;
  fixing: boolean;
  disabled: boolean;
  onFix: () => void;
  onDismiss: (problem: Problem) => void;
  // Without a key: "Arreglalo" by copy and paste with claude.ai (the button shows the sample).
  handoff?: Handoff | null;
};

// The check that gates approval: every problem is fixed by the writer ("Arreglalo") or dismissed by hand.
export function ChecksPanel({ problems, dismissed, fixing, disabled, onFix, onDismiss, handoff }: Props) {
  if (problems.length === 0) {
    return (
      <div className="rounded-xl border border-good/40 bg-good-soft p-4 text-sm">
        <b className="text-good">Check ✓</b> Sin problemas pendientes
        {dismissed > 0 ? ` (${dismissed} marcado${dismissed === 1 ? "" : "s"} como "no es un problema")` : ""}.
      </div>
    );
  }
  return (
    <div className="space-y-3 rounded-xl border border-neg/40 bg-neg-soft p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-neg">
          Check · {problems.length} problema{problems.length === 1 ? "" : "s"}. Hay que resolverlos antes de aprobar.
        </p>
        <Button onClick={onFix} disabled={disabled} variant={handoff ? "secondary" : "primary"}>
          {fixing ? (
            <>
              <Spinner /> Arreglando…
            </>
          ) : handoff ? (
            "Ver un ejemplo"
          ) : (
            "Arreglalo"
          )}
        </Button>
      </div>
      {handoff && <ClaudeHandoff via={handoff} title="Arreglalo" what="la nueva ronda" disabled={disabled} />}
      <ul className="space-y-2">
        {problems.map((p) => (
          <li key={p.id} className="flex items-start justify-between gap-3 rounded-lg bg-white/70 p-2.5 text-sm">
            <span>
              <b>{p.label}</b>
              <span className="block text-xs text-muted">{p.detail}</span>
            </span>
            <button
              type="button"
              onClick={() => onDismiss(p)}
              disabled={disabled}
              className="shrink-0 rounded px-2 py-1 text-xs font-semibold text-muted hover:bg-black/5 hover:text-ink disabled:opacity-50"
              title="Queda anotado en el registro de dirección"
            >
              No es un problema
            </button>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted">
        "Arreglalo" le pasa la lista a la IA como nota de director y escribe otra ronda. "No es un problema" lo saca de
        la lista y queda anotado en el registro.
      </p>
    </div>
  );
}

// The loops behind the check: what opens, where it pays off, the series loop, what the brand does and how people work.
export function LoopsMap({ story }: { story: Story }) {
  return (
    <details className="rounded-xl border border-line bg-white p-4">
      <summary className="cursor-pointer text-sm font-semibold">
        Mapa de loops · {story.loops.filter((l) => l.closed).length}/{story.loops.length} cerrados
      </summary>
      <div className="mt-3 space-y-4 text-sm">
        <div>
          <p className="text-xs font-semibold text-muted uppercase">Gancho → retención → recompensa</p>
          <ul className="mt-1 space-y-2">
            {story.loops.map((l, i) => (
              <li key={i} className="flex gap-2">
                <span className={`font-bold ${l.closed ? "text-good" : "text-neg"}`}>{l.closed ? "✓" : "✗"}</span>
                <span>
                  <b>{l.question}</b>
                  <span className="block text-xs text-muted">
                    Se abre: {l.opens} · Se cierra: {l.closes || "nunca"}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        {story.seriesLoop.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted uppercase">El loop de la serie</p>
            <ul className="mt-1 space-y-1.5">
              {story.seriesLoop.map((s, i) => (
                <li key={i} className="flex gap-2">
                  <span className={`font-bold ${!s.appears ? "text-muted" : s.complete ? "text-good" : "text-neg"}`}>
                    {!s.appears ? "·" : s.complete ? "✓" : "✗"}
                  </span>
                  <span>
                    {s.step}
                    <span className="block text-xs text-muted">{s.note}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {story.claims.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted uppercase">Lo que hace la marca en la historia</p>
            <ul className="mt-1 space-y-1.5">
              {story.claims.map((c, i) => (
                <li key={i} className="flex gap-2">
                  <span className={`font-bold ${c.real ? "text-good" : c.concept ? "text-touch" : "text-neg"}`}>
                    {c.real ? "✓" : c.concept ? "C" : "✗"}
                  </span>
                  <span>
                    {c.claim}
                    <span className="block text-xs text-muted">
                      {c.real ? "Existe hoy." : c.concept ? "Mostrado como concepto." : "No existe hoy."} {c.note}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {(story.practices ?? []).length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted uppercase">¿Pasa así de verdad?</p>
            <ul className="mt-1 space-y-1.5">
              {story.practices.map((p, i) => (
                <li key={i} className="flex gap-2">
                  <span className={`font-bold ${p.known ? "text-good" : "text-neg"}`}>{p.known ? "✓" : "✗"}</span>
                  <span>
                    {p.practice}
                    <span className="block text-xs text-muted">
                      {p.known ? "Así se trabaja hoy." : "Nadie confirmó que se trabaje así."} {p.note}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </details>
  );
}
