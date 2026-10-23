// Steps 2 and 3: meats (3–5, by format, neutral opening) and CTAs (1–3, four things each), written against the
// approved hooks of the chosen levels.
import { useEffect, useState, type ReactNode } from "react";
import {
  LEVEL_INFO,
  MEAT_FORMATS,
  MEAT_FORMAT_LABEL,
  levelsOf,
  noShareNote,
  pieceShare,
  splitIssue,
  wordsFor,
  type Budget,
  type Cta,
  type Hook,
  type Meat,
  type MeatFormat,
} from "../../../shared/ads.ts";
import { promptCount } from "../../../shared/adsHandoff.ts";
import type { Handoff } from "../ClaudeHandoff.tsx";
import { Button, Notice, Spinner } from "../ui.tsx";
import { PartsHandoff } from "./PartsHandoff.tsx";
import { rememberCount, rememberedCount, takePreset } from "../../lib/handoffWalk.ts";
import { LevelPicker } from "./pieces.tsx";

type Props<T extends Meat | Cta> = {
  kind: T["kind"];
  pieces: T[];
  hooks: Hook[];
  levels: number[];
  seconds: number;
  split: Budget | null;
  busy: boolean;
  demo: boolean;
  note: string;
  onLevels: (levels: number[]) => void;
  onGenerate: (count: number, formats: MeatFormat[]) => Promise<void>;
  renderCard: (piece: T) => ReactNode;
  // "Que lo digan los personajes": the approved pieces' character prompts in one go.
  extra?: ReactNode;
  onMotionBatch?: () => void;
  motionBusy?: boolean;
  // "Sin clave": the prompts for claude.ai for this count (and, for meats, these formats).
  handoff?: ((count: number, formats: MeatFormat[]) => (part: number) => Handoff) | null;
  presetCount?: number;
  // Keeps the typed count and the prompts' walk while another tab is open (series id).
  walkKey: string;
};

export function PiecesPanel<T extends Meat | Cta>({ kind, pieces, hooks, levels, seconds, split, busy, demo, note, onLevels, onGenerate, renderCard, extra, onMotionBatch, motionBusy = false, handoff = null, presetCount, walkKey }: Props<T>) {
  const isMeat = kind === "meat";
  const chosen = levelsOf(levels);
  const recipe = [...new Set(chosen.flatMap((l) => LEVEL_INFO[l].meats))];
  const countKey = `${walkKey}:${kind}-count`;
  const [count, setCountState] = useState(() => rememberedCount(countKey, presetCount ?? (isMeat ? 4 : 2)));
  const setCount = (n: number) => {
    setCountState(n);
    rememberCount(countKey, n);
  };
  useEffect(() => {
    if (takePreset(countKey, presetCount)) setCount(Math.min(isMeat ? 8 : 5, presetCount!));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetCount, isMeat, countKey]);
  const [formats, setFormats] = useState<MeatFormat[]>([]);
  const shareKind = isMeat ? "meat" : "cta";
  const pieceSeconds = pieceShare(seconds, shareKind, split);
  const blocked = (split ? splitIssue(seconds, split) : null) ?? noShareNote(shareKind, seconds, split);
  const approvedHooks = hooks.filter((h) => h.status === "approved" && chosen.includes(h.level));
  const useFormats = formats.length ? formats : recipe;

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-line bg-white p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1.5">
            <p className="text-sm font-semibold">Niveles</p>
            <LevelPicker value={levels} onChange={onLevels} />
          </div>
          <label className="text-sm">
            <span className="font-semibold">Cantidad</span>
            <input
              type="number"
              min={1}
              max={isMeat ? 8 : 5}
              className="ml-2 w-20 rounded-lg border border-line px-2 py-1"
              value={count}
              onChange={(e) => setCount(Math.max(1, Math.min(isMeat ? 8 : 5, Number(e.target.value) || 1)))}
            />
            <span className="ml-2 text-xs text-muted">{isMeat ? "3 a 5" : "1 a 3"}</span>
          </label>
          <Button variant={handoff ? "secondary" : "primary"} onClick={() => onGenerate(count, isMeat ? useFormats : [])} disabled={busy || Boolean(blocked)}>
            {busy ? (
              <>
                <Spinner /> Escribiendo…
              </>
            ) : demo ? (
              "Ver un ejemplo"
            ) : (
              `Generar ${count} ${isMeat ? "meats" : "CTAs"}`
            )}
          </Button>
        </div>
        {isMeat && (
          <div className="mt-3 space-y-1.5">
            <p className="text-sm font-semibold">
              Formatos <span className="font-normal text-muted">(receta por defecto de los niveles elegidos: {recipe.map((f) => MEAT_FORMAT_LABEL[f]).join(", ")})</span>
            </p>
            <div className="flex flex-wrap gap-1.5">
              {MEAT_FORMATS.map((f) => {
                const on = useFormats.includes(f);
                return (
                  <button
                    key={f}
                    type="button"
                    onClick={() => {
                      const base = formats.length ? formats : recipe;
                      setFormats(base.includes(f) ? base.filter((x) => x !== f) : [...base, f]);
                    }}
                    className={`rounded-md border px-2 py-1 text-xs font-semibold ${on ? "border-ink bg-ink text-white" : "border-line bg-white text-muted hover:text-ink"}`}
                  >
                    {MEAT_FORMAT_LABEL[f]}
                  </button>
                );
              })}
              {formats.length > 0 && (
                <button type="button" className="text-xs text-muted underline" onClick={() => setFormats([])}>
                  volver a la receta
                </button>
              )}
            </div>
          </div>
        )}
        <p className="mt-3 text-xs text-muted">
          {pieceSeconds < 1
            ? isMeat
              ? "Sin cuerpo: este reparto no le deja segundos. Alargá el anuncio o cambialo antes de pedir meats."
              : "Sin llamado: este reparto no le deja segundos. Cambialo antes de pedir CTAs."
            : isMeat
              ? `Cada meat dura ${pieceSeconds} s (hasta ${wordsFor(pieceSeconds)} palabras) y abre neutro, así encaja con cualquier hook de su nivel. Educa sobre el problema, la solución o la oferta según el nivel.`
              : `Cada CTA dura ${pieceSeconds} s (hasta ${wordsFor(pieceSeconds)} palabras) y dice qué hacer, por qué importa, cuándo y qué tan fácil es (del perfil: landing). ${chosen.map((l) => `N${l}: ${LEVEL_INFO[l].cta}`).join(" ")}`}
        </p>
        {blocked && <p className="mt-2 text-xs text-neg">{blocked}</p>}
        <p className="mt-1 text-xs text-muted">
          Contexto que recibe la IA: {approvedHooks.length ? `${approvedHooks.length} hooks aprobados de esos niveles` : "todavía no hay hooks aprobados de esos niveles (escribe igual, por nivel)"}.
        </p>
        {note && <p className="mt-2 text-xs text-muted">{note}</p>}
        {demo && <p className="mt-2 text-xs text-muted">Sin clave de IA, «Ver un ejemplo» trae piezas de muestra. Las de verdad, con claude.ai:</p>}
        {handoff && (
          <PartsHandoff
            className="mt-2"
            parts={promptCount(kind, count)}
            what={isMeat ? "los meats" : "los CTAs"}
            title={`${count} ${isMeat ? "meats" : "CTAs"}`}
            via={handoff(count, isMeat ? useFormats : [])}
            resetKey={`${count}-${levels.join(",")}-${seconds}-${JSON.stringify(split)}-${isMeat ? useFormats.join(",") : ""}`}
            walkKey={`${walkKey}:${kind}`}
            disabled={busy || Boolean(blocked)}
          />
        )}
        {(extra || onMotionBatch) && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {extra}
            {onMotionBatch && (
              <Button variant="secondary" className="px-2 py-1 text-xs" onClick={onMotionBatch} disabled={busy || motionBusy}>
                {motionBusy ? "Armando…" : "Hacer en motion graphics"}
              </Button>
            )}
          </div>
        )}
      </div>
      {approvedHooks.length === 0 && hooks.length > 0 && <Notice tone="warn">Aprobá primero algunos hooks: el meat y el CTA se escriben con el hook elegido como contexto para que sean coherentes.</Notice>}
      <div className="space-y-2">{pieces.map((p) => renderCard(p))}</div>
      {pieces.length === 0 && <p className="text-sm text-muted">Todavía no hay {isMeat ? "meats" : "CTAs"}.</p>}
    </section>
  );
}
