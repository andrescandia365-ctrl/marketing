// Step 1: 50 hooks by awareness level, covering a grid of level × angle, approved with a quick yes/no.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ANGLES, ANGLE_LABEL, BUDGETS, FORMULA_LABEL, LEVELS, LEVEL_INFO, levelsOf, wordsFor, type AdSeconds, type Hook, type PieceStatus } from "../../../shared/ads.ts";
import { promptCount } from "../../../shared/adsHandoff.ts";
import type { Handoff } from "../ClaudeHandoff.tsx";
import { Button, Spinner } from "../ui.tsx";
import { PartsHandoff } from "./PartsHandoff.tsx";
import { rememberCount, rememberedCount, takePreset } from "../../lib/handoffWalk.ts";
import { LevelChip, LevelPicker, Tag, WordsBadge } from "./pieces.tsx";

type Props = {
  hooks: Hook[];
  levels: number[];
  seconds: AdSeconds;
  busy: boolean;
  demo: boolean;
  note: string;
  onLevels: (levels: number[]) => void;
  onGenerate: (count: number) => Promise<void>;
  onStatus: (ids: string[], status: PieceStatus) => Promise<void>;
  renderCard: (hook: Hook) => ReactNode;
  // "Que lo digan los personajes": the approved hooks' character prompts in one go.
  extra?: ReactNode;
  // "Sin clave": the count's prompts for claude.ai (several when one reply would be too long).
  handoff?: ((count: number) => (part: number) => Handoff) | null;
  // The count "Generar tanda" asked for.
  presetCount?: number;
  // Keeps the typed count and the prompts' walk while another tab is open (series id).
  walkKey: string;
};

export function HooksPanel({ hooks, levels, seconds, busy, demo, note, onLevels, onGenerate, onStatus, renderCard, extra, handoff = null, presetCount, walkKey }: Props) {
  const countKey = `${walkKey}:hooks-count`;
  const [count, setCountState] = useState(() => rememberedCount(countKey, presetCount ?? 50));
  const setCount = (n: number) => {
    setCountState(n);
    rememberCount(countKey, n);
  };
  useEffect(() => {
    if (takePreset(countKey, presetCount)) setCount(presetCount!);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetCount, countKey]);
  const [quick, setQuick] = useState(false);
  const [filter, setFilter] = useState<"all" | PieceStatus>("all");
  const pending = hooks.filter((h) => h.status === "pending");
  const approvedN = hooks.filter((h) => h.status === "approved").length;
  const chosen = levelsOf(levels);
  const budget = BUDGETS[seconds];

  // The grid: how many live hooks per level and angle, so the 50 come out covering it instead of at random.
  const grid = useMemo(() => {
    const g: Record<string, number> = {};
    for (const h of hooks) if (h.status !== "rejected") g[`${h.level}-${h.angle}`] = (g[`${h.level}-${h.angle}`] ?? 0) + 1;
    return g;
  }, [hooks]);

  // Quick mode: one pending hook at a time; → or S approves, ← or N rejects.
  const current = pending[0];
  useEffect(() => {
    if (!quick || !current) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowRight" || e.key.toLowerCase() === "s") void onStatus([current.id], "approved");
      if (e.key === "ArrowLeft" || e.key.toLowerCase() === "n") void onStatus([current.id], "rejected");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [quick, current, onStatus]);

  const shown = hooks.filter((h) => filter === "all" || h.status === filter);

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-line bg-white p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1.5">
            <p className="text-sm font-semibold">Niveles de conciencia</p>
            <LevelPicker value={levels} onChange={onLevels} />
            <p className="text-xs text-muted">Los hooks se reparten entre los niveles elegidos, o se concentran en uno solo.</p>
          </div>
          <label className="text-sm">
            <span className="font-semibold">Cantidad</span>
            <input type="number" min={1} max={60} className="ml-2 w-20 rounded-lg border border-line px-2 py-1" value={count} onChange={(e) => setCount(Math.max(1, Math.min(60, Number(e.target.value) || 1)))} />
          </label>
          <Button variant={handoff ? "secondary" : "primary"} onClick={() => onGenerate(count)} disabled={busy}>
            {busy ? (
              <>
                <Spinner /> Escribiendo hooks…
              </>
            ) : demo ? (
              "Ver un ejemplo"
            ) : (
              `Generar ${count} hooks`
            )}
          </Button>
          <span className="text-xs text-muted">
            Cada hook: {budget.hook} s, hasta {wordsFor(budget.hook)} palabras. Los ganadores (métricas, orgánico) entran como patrón; los existentes no se repiten.
          </span>
        </div>
        {note && <p className="mt-2 text-xs text-muted">{note}</p>}
        {demo && <p className="mt-2 text-xs text-muted">Sin clave de IA, «Ver un ejemplo» trae hooks de muestra. Los de verdad, con claude.ai:</p>}
        {handoff && (
          <PartsHandoff
            className="mt-2"
            parts={promptCount("hook", count)}
            what="los hooks"
            title={`${count} hooks`}
            via={handoff(count)}
            resetKey={`${count}-${levels.join(",")}-${seconds}`}
            walkKey={`${walkKey}:hooks`}
            disabled={busy}
          />
        )}
      </div>

      {hooks.length > 0 && (
        <div className="rounded-xl border border-line bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold">Grilla nivel × ángulo</p>
            <p className="text-xs text-muted">
              {approvedN} aprobados · {pending.length} pendientes · {hooks.length - approvedN - pending.length} descartados
            </p>
          </div>
          <table className="mt-2 w-full text-center text-xs">
            <thead className="text-muted">
              <tr>
                <th className="py-1 text-left font-medium">Nivel</th>
                {ANGLES.map((a) => (
                  <th key={a} className="py-1 font-medium">
                    {ANGLE_LABEL[a]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {LEVELS.filter((l) => chosen.includes(l) || hooks.some((h) => h.level === l)).map((l) => (
                <tr key={l} className="border-t border-line">
                  <td className="py-1 text-left">
                    <LevelChip level={l} full />
                  </td>
                  {ANGLES.map((a) => {
                    const n = grid[`${l}-${a}`] ?? 0;
                    return (
                      <td key={a} className={`py-1 font-mono ${n === 0 ? "text-line" : ""}`}>
                        {n || "·"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pending.length > 0 && (
        <div className="rounded-xl border border-line bg-white p-4">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold">Aprobación rápida</p>
            <span className="text-xs text-muted">Un hook por vez: Sí o No, con las flechas o las teclas S y N. Sin editar 50 textos.</span>
            <Button variant={quick ? "secondary" : "primary"} className="ml-auto px-3 py-1.5 text-xs" onClick={() => setQuick(!quick)}>
              {quick ? "Cerrar" : `Empezar (${pending.length} pendientes)`}
            </Button>
          </div>
          {quick && current && (
            <div className="mt-3 rounded-xl border-2 border-ink p-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs text-muted">{current.id}</span>
                <LevelChip level={current.level} full />
                <Tag>{ANGLE_LABEL[current.angle]}</Tag>
                <Tag>{FORMULA_LABEL[current.formula]}</Tag>
                <WordsBadge text={current.text} seconds={current.seconds} />
              </div>
              <p className="mt-3 text-xl font-semibold leading-snug">{current.text}</p>
              {current.onScreenText && <p className="mt-1 text-sm text-muted">En pantalla: “{current.onScreenText}”</p>}
              <p className="mt-1 text-xs text-muted">{LEVEL_INFO[current.level].desc}</p>
              <div className="mt-4 flex gap-3">
                <Button className="bg-neg px-6 hover:bg-neg" onClick={() => onStatus([current.id], "rejected")}>
                  ← No
                </Button>
                <Button className="bg-good px-6 hover:bg-good" onClick={() => onStatus([current.id], "approved")}>
                  Sí →
                </Button>
                <span className="self-center text-xs text-muted">{pending.length - 1} más</span>
                <Button variant="ghost" className="ml-auto text-xs" onClick={() => onStatus(pending.map((h) => h.id), "approved")}>
                  Aprobar todos los pendientes
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {hooks.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted">Ver:</span>
          {(["all", "pending", "approved", "rejected"] as const).map((f) => (
            <button key={f} type="button" onClick={() => setFilter(f)} className={`rounded-md border px-2 py-1 font-semibold ${filter === f ? "border-ink bg-ink text-white" : "border-line bg-white text-muted"}`}>
              {{ all: "Todos", pending: "Pendientes", approved: "Aprobados", rejected: "Descartados" }[f]}
            </button>
          ))}
        </div>
      )}
      {extra}
      <div className="space-y-2">{shown.map((h) => renderCard(h))}</div>
      {hooks.length === 0 && <p className="text-sm text-muted">Todavía no hay hooks. Elegí los niveles y generá la primera tanda, o traé ganadores desde Fuentes.</p>}
    </section>
  );
}
