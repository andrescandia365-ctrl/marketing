// "Sin clave" in Publicidad: a writer request that may take several prompts (50 hooks, the platform texts of a big
// run). It shows how many there are and walks them in order: copy prompt 1, paste its reply, then prompt 2, which the
// server builds after the first reply was saved (shared/adsHandoff.ts), so nothing repeats.
import { useEffect, useState } from "react";
import { partsText } from "../../../shared/adsHandoff.ts";
import { ClaudeHandoff, type Handoff } from "../ClaudeHandoff.tsx";

type Props = {
  parts: number;
  // What the replies make ("los hooks"), for the texts.
  what: string;
  title: string;
  via: (part: number) => Handoff;
  // When it changes (another count or other levels), the walk starts again from prompt 1.
  resetKey: string;
  disabled?: boolean;
  className?: string;
};

export function PartsHandoff({ parts, what, title, via, resetKey, disabled = false, className = "" }: Props) {
  const [part, setPart] = useState(1);
  const [done, setDone] = useState<number[]>([]);
  useEffect(() => {
    setPart(1);
    setDone([]);
  }, [resetKey]);

  if (parts < 1) return null;
  const all = done.length >= parts;
  const base = via(part);
  const handoff: Handoff = {
    prompt: base.prompt,
    paste: async (reply) => {
      await base.paste(reply);
      const next = [...new Set([...done, part])];
      setDone(next);
      const left = Array.from({ length: parts }, (_, i) => i + 1).find((p) => !next.includes(p));
      if (left) setPart(left);
    },
  };

  return (
    <div className={`space-y-1.5 ${className}`}>
      <p className="text-xs text-muted">{partsText(parts, what)}</p>
      {parts > 1 && (
        <div className="flex flex-wrap items-center gap-1 text-xs" aria-label="Prompts">
          {Array.from({ length: parts }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPart(p)}
              className={`rounded-md border px-2 py-0.5 font-semibold ${p === part && !all ? "border-ink bg-ink text-white" : done.includes(p) ? "border-good/40 bg-good-soft text-good" : "border-line bg-white text-muted"}`}
              title={done.includes(p) ? "Ya entró su respuesta" : "Todavía sin respuesta"}
            >
              {p}
              {done.includes(p) ? " ✓" : ""}
            </button>
          ))}
        </div>
      )}
      {all ? (
        <p className="text-xs text-good">
          Listo: {parts === 1 ? "entró la respuesta" : `entraron las ${parts} respuestas`}.{" "}
          <button type="button" className="text-muted underline hover:text-ink" onClick={() => (setDone([]), setPart(1))}>
            Pedir otra vez
          </button>
        </p>
      ) : (
        <ClaudeHandoff key={`${resetKey}-${part}`} via={handoff} title={parts > 1 ? `${title} · prompt ${part} de ${parts}` : title} what={what} disabled={disabled} />
      )}
    </div>
  );
}
