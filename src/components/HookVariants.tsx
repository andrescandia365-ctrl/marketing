// PLAYBOOK §3: five hook variants per piece, each naming the move it leans on (§2.5) and the viewer's awareness level.
// One can become the story's hook; the five can go to Publicidad as candidate hooks for paid ads (Método 50-5-3).
import { useState } from "react";
import { MOVE_HINT, MOVE_LABEL } from "../../shared/moves.ts";
import type { HookVariant } from "../../shared/schema.ts";
import { Button, Spinner } from "./ui.tsx";
import { ClaudeHandoff, type Handoff } from "./ClaudeHandoff.tsx";

const LEVEL_LABEL = { 1: "Inconsciente", 2: "Consciente del problema", 3: "Consciente de la solución", 4: "Consciente del producto", 5: "Totalmente consciente" } as const;

type Props = {
  variants: HookVariant[] | null;
  current: string;
  busy: boolean;
  onWrite: () => Promise<void>;
  onUse: (variant: HookVariant) => void;
  // Sends them to Publicidad; resolves with how many arrived.
  onSend: (variants: HookVariant[]) => Promise<number>;
  // Without a key: the five by copy and paste with claude.ai (the button shows the sample).
  handoff?: Handoff | null;
};

export function HookVariants({ variants, current, busy, onWrite, onUse, onSend, handoff }: Props) {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<string>("");
  const key = (variants ?? []).map((v) => v.title).join("|");

  return (
    <section className="rounded-xl border border-line bg-white p-3" aria-label="Variantes de gancho">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">5 variantes de gancho</h3>
        <span className="text-[11px] text-muted">PLAYBOOK §3</span>
      </div>
      <p className="mt-1 text-xs text-muted">La misma historia, cinco entradas distintas, cada una con su jugada. Elegí una para la pieza o mandalas a Publicidad.</p>
      <Button variant="secondary" className="mt-2 w-full" onClick={onWrite} disabled={busy}>
        {busy ? (
          <>
            <Spinner /> Escribiendo…
          </>
        ) : handoff ? (
          "Ver un ejemplo"
        ) : variants?.length ? (
          "Otras 5 variantes"
        ) : (
          "Escribir 5 variantes"
        )}
      </Button>
      {handoff && <ClaudeHandoff className="mt-2" title="5 variantes" what="las 5 variantes" disabled={busy} via={handoff} />}
      {variants && variants.length > 0 && (
        <>
          <ol className="mt-3 space-y-2">
            {variants.map((v, i) => {
              const inUse = v.title.trim() === current.trim();
              return (
                <li key={`${i}-${v.title}`} className={`rounded-lg border p-2 ${inUse ? "border-good/50 bg-good-soft" : "border-line"}`}>
                  <p className="text-sm font-semibold leading-snug">{v.title}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-1 text-[11px]">
                    <span title={MOVE_HINT[v.move]} className="rounded-full border border-touch/40 bg-touch-soft px-2 py-0.5 font-semibold text-touch">
                      {MOVE_LABEL[v.move]}
                    </span>
                    <span title={LEVEL_LABEL[v.level]} className="rounded border border-line px-1.5 py-0.5 text-muted">
                      N{v.level} · {LEVEL_LABEL[v.level]}
                    </span>
                  </p>
                  {v.why && <p className="mt-1 text-xs text-muted">{v.why}</p>}
                  <Button variant="ghost" className="mt-1 px-2 py-1 text-xs" disabled={inUse} onClick={() => onUse(v)}>
                    {inUse ? "Es el gancho de la pieza" : "Usar como gancho"}
                  </Button>
                </li>
              );
            })}
          </ol>
          <Button
            variant="secondary"
            className="mt-2 w-full"
            disabled={sending || sent === key}
            onClick={async () => {
              setSending(true);
              try {
                const n = await onSend(variants);
                if (n === variants.length) setSent(key);
              } finally {
                setSending(false);
              }
            }}
          >
            {sending ? <Spinner /> : sent === key ? "Las 5 están en Publicidad ✓" : "Mandar las 5 a Publicidad"}
          </Button>
          <p className="mt-1 text-[11px] text-muted">Entran como hooks pendientes, con su nivel, para aprobar con Sí o No en Publicidad.</p>
        </>
      )}
    </section>
  );
}
