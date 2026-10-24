// "Próxima tanda": what the imported metrics say to keep, archive and tick. Nothing is written until Aplicar.
// The numbers in each line are the CSV's. Variantes de los ganadores asks the hook writer for that angle only.
import { useState } from "react";
import type { NextLine, NextProposal, VoiceLine } from "../../../shared/adsNext.ts";
import { copyText } from "../../lib/files.ts";
import { Button, Spinner } from "../ui.tsx";

type Props = {
  hasMetrics: boolean;
  proposal: NextProposal;
  minImpressions: number;
  keepPercent: number;
  onMin: (n: number) => void;
  onKeepPercent: (n: number) => void;
  applyLabel: string;
  canApply: boolean;
  canUndo: boolean;
  undoNote?: string;
  busy: boolean;
  demo: boolean;
  onApply: () => void;
  onUndo: () => void;
  onPrompt: (id: string, count: number) => Promise<string>;
  onAsk: (id: string, count: number) => void;
  onPaste: (id: string, count: number, reply: string) => void;
};

const GROUPS: { kind: NextLine["kind"]; title: string }[] = [
  { kind: "hook", title: "Hooks" },
  { kind: "meat", title: "Meats" },
  { kind: "cta", title: "CTAs" },
];

export function NextBatch({
  hasMetrics,
  proposal,
  minImpressions,
  keepPercent,
  onMin,
  onKeepPercent,
  applyLabel,
  canApply,
  canUndo,
  undoNote = "",
  busy,
  demo,
  onApply,
  onUndo,
  onPrompt,
  onAsk,
  onPaste,
}: Props) {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [pasteFor, setPasteFor] = useState<{ id: string; count: number } | null>(null);
  const [paste, setPaste] = useState("");
  const [note, setNote] = useState("");
  const winners = proposal.lines.filter((l) => l.kind === "hook" && l.verdict === "ganador");

  async function copy(id: string) {
    const count = counts[id] ?? 3;
    setNote("");
    try {
      await copyText(await onPrompt(id, count));
      setPasteFor({ id, count });
      setPaste("");
      setNote(`Pedido de ${id} copiado${demo ? ". Pegá la respuesta de claude.ai acá abajo." : "."}`);
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
    }
  }

  if (!hasMetrics) {
    return (
      <div className="rounded-xl border border-line bg-white p-4">
        <p className="text-sm font-semibold">Próxima tanda</p>
        <p className="mt-1 text-xs text-muted">Importá un CSV en Fuentes para armar la próxima tanda.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-line bg-white p-4">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <p className="text-sm font-semibold">Próxima tanda</p>
          <p className="mt-1 max-w-xl text-xs text-muted">
            Con las métricas que ya importaste. Un gancho descartado no entra. Lo que no llega a las impresiones mínimas queda como está. Si hay al menos 3 con datos, se queda el porcentaje de arriba y el resto se archiva: no se borra, y sigue en Fuentes. Con menos de 3, o con 0 %, solo se muestra el ranking. Nada cambia hasta Aplicar.
          </p>
        </div>
        <label className="text-xs">
          <span className="font-semibold">Impresiones mínimas</span>
          <input
            type="number"
            min={1}
            className="ml-2 w-24 rounded-lg border border-line px-2 py-1"
            value={minImpressions}
            onChange={(e) => onMin(Math.max(1, Math.round(Number(e.target.value) || 1)))}
          />
        </label>
        <label className="text-xs">
          <span className="font-semibold">Quedarse con el</span>
          <input
            type="number"
            min={0}
            max={100}
            className="ml-2 w-16 rounded-lg border border-line px-2 py-1"
            value={keepPercent}
            onChange={(e) => onKeepPercent(Math.max(0, Math.min(100, Math.round(Number(e.target.value) || 0))))}
          />
          <span className="ml-1">%</span>
        </label>
      </div>
      {keepPercent === 0 && <p className="mt-2 text-xs text-neg">Quedarse con el 0 % no aprueba ni archiva. Subí el porcentaje para poder aplicar.</p>}
      {GROUPS.map((g) => {
        const lines = proposal.lines.filter((l) => l.kind === g.kind);
        if (!lines.length) return null;
        return (
          <section key={g.kind} className="mt-3">
            <p className="text-xs font-semibold">{g.title}</p>
            <ul className="mt-1 space-y-1">
              {lines.map((l) => (
                <li key={l.id} className="text-xs text-muted">
                  <span className={l.verdict === "perdedor" ? "font-semibold text-neg" : "font-semibold text-ink"}>{l.verdict}</span> · {l.why}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {proposal.voices.length > 0 && (
        <section className="mt-3">
          <p className="text-xs font-semibold">Voces de esta tanda</p>
          <ul className="mt-1 space-y-1">
            {proposal.voices.map((v) => (
              <li key={`${v.pieceId}-${v.voiceId}`} className="text-xs text-muted">
                <VoiceTick line={v} />
              </li>
            ))}
          </ul>
        </section>
      )}
      {winners.length > 0 && (
        <section className="mt-3 space-y-2">
          <p className="text-xs font-semibold">Variantes de los ganadores</p>
          <p className="text-xs text-muted">Pide ganchos nuevos con el mismo ángulo y la misma fórmula. Los números del pedido son los del CSV, no se inventan.</p>
          {winners.map((w) => (
            <div key={w.id} className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-mono font-semibold">{w.id}</span>
              <label>
                N
                <input
                  type="number"
                  min={1}
                  max={20}
                  className="ml-1 w-14 rounded border border-line px-1 py-0.5"
                  value={counts[w.id] ?? 3}
                  onChange={(e) => setCounts((c) => ({ ...c, [w.id]: Math.max(1, Math.min(20, Math.round(Number(e.target.value) || 1))) }))}
                />
              </label>
              <Button variant="secondary" className="px-2 py-1 text-xs" disabled={busy} onClick={() => void copy(w.id)}>
                Copiar pedido
              </Button>
              {!demo && (
                <Button className="px-2 py-1 text-xs" disabled={busy} onClick={() => onAsk(w.id, counts[w.id] ?? 3)}>
                  {busy ? <Spinner /> : "Pedirlas"}
                </Button>
              )}
            </div>
          ))}
          {demo && pasteFor && (
            <div className="space-y-1">
              <textarea
                className="min-h-20 w-full rounded-lg border border-line px-2 py-1 font-mono text-xs"
                placeholder={`Pegá acá la respuesta de claude.ai para ${pasteFor.id}`}
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
              />
              <Button className="px-2 py-1 text-xs" disabled={busy || !paste.trim()} onClick={() => onPaste(pasteFor.id, pasteFor.count, paste)}>
                Usar esta respuesta
              </Button>
            </div>
          )}
        </section>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button className="px-3 py-1.5 text-xs" disabled={busy || !canApply} onClick={onApply}>
          {busy ? <Spinner /> : "Aplicar"}
        </Button>
        <Button variant="secondary" className="px-3 py-1.5 text-xs" disabled={busy || !canUndo} onClick={onUndo}>
          Deshacer
        </Button>
        <span className="text-xs text-muted">{applyLabel}</span>
      </div>
      {undoNote && <p className="mt-2 text-xs text-muted">{undoNote}</p>}
      {note && <p className="mt-2 text-xs text-muted">{note}</p>}
    </div>
  );
}

function VoiceTick({ line }: { line: VoiceLine }) {
  const tick = line.pick ? "queda elegida" : "queda destildada";
  return (
    <>
      <span className="font-semibold text-ink">{line.verdict}</span> · {line.why}
      {line.verdict !== "sin datos suficientes" && !line.why.includes(tick) ? ` ${tick}.` : ""}
    </>
  );
}
