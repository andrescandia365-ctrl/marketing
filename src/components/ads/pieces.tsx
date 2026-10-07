// Shared bits of the Publicidad section: level chips and the card that shows and edits one piece (hook, meat or CTA)
// with its prompts and its clip or image.
import { useState, type ReactNode } from "react";
import {
  ANGLE_LABEL,
  FORMULA_LABEL,
  LEVELS,
  LEVEL_INFO,
  MEAT_FORMAT_LABEL,
  PIECE_LABEL,
  clipSecondsFor,
  countWords,
  wordsFor,
  type Level,
  type Piece,
  type PieceStatus,
} from "../../../shared/ads.ts";
import { buildCopyPrompt } from "../../../shared/prompt.ts";
import type { Brief } from "../../../shared/schema.ts";
import { CopyButton } from "../ScriptView.tsx";
import { Button, Spinner, inputClass } from "../ui.tsx";

export type ClipFile = { url: string; blob: Blob; name: string; duration: number };
export type PieceMediaState = { image?: string; clip?: ClipFile; voice?: ClipFile; loading?: boolean; error?: string };

const LEVEL_CHIP: Record<Level, string> = {
  1: "bg-neg-soft text-neg border-neg/40",
  2: "bg-neg-soft text-neg border-neg/40",
  3: "bg-touch-soft text-touch border-touch/40",
  4: "bg-good-soft text-good border-good/40",
  5: "bg-good-soft text-good border-good/40",
};

export function LevelChip({ level, full = false }: { level: Level; full?: boolean }) {
  return (
    <span className={`rounded border px-1.5 py-0.5 text-xs font-semibold ${LEVEL_CHIP[level]}`} title={LEVEL_INFO[level].desc}>
      {full ? `${level} · ${LEVEL_INFO[level].label}` : LEVEL_INFO[level].short}
    </span>
  );
}

export function Tag({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <span className="rounded border border-line bg-paper px-1.5 py-0.5 text-xs text-muted" title={title}>
      {children}
    </span>
  );
}

// Which levels a batch covers: one, some or all.
export function LevelPicker({ value, onChange }: { value: number[]; onChange: (levels: number[]) => void }) {
  const all = value.length === 0 || value.length === 5;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        onClick={() => onChange([])}
        className={`rounded-md border px-2 py-1 text-xs font-semibold ${all ? "border-ink bg-ink text-white" : "border-line bg-white text-muted hover:text-ink"}`}
      >
        Todos
      </button>
      {LEVELS.map((l) => {
        const on = !all && value.includes(l);
        return (
          <button
            key={l}
            type="button"
            title={`${LEVEL_INFO[l].label}: ${LEVEL_INFO[l].desc}`}
            onClick={() => {
              const base = all ? [] : value;
              onChange(base.includes(l) ? base.filter((x) => x !== l) : [...base, l].sort());
            }}
            className={`rounded-md border px-2 py-1 text-xs font-semibold ${on ? "border-ink bg-ink text-white" : "border-line bg-white text-muted hover:text-ink"}`}
          >
            {l} · {LEVEL_INFO[l].label}
          </button>
        );
      })}
    </div>
  );
}

export function StatusButtons({ status, onStatus, small = false }: { status: PieceStatus; onStatus: (s: PieceStatus) => void; small?: boolean }) {
  const cls = small ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-sm";
  return (
    <div className="inline-flex rounded-lg border border-line bg-white p-0.5">
      <button
        type="button"
        onClick={() => onStatus("approved")}
        className={`rounded-md font-semibold ${cls} ${status === "approved" ? "bg-good text-white" : "text-muted hover:text-good"}`}
      >
        Sí
      </button>
      <button
        type="button"
        onClick={() => onStatus("rejected")}
        className={`rounded-md font-semibold ${cls} ${status === "rejected" ? "bg-neg text-white" : "text-muted hover:text-neg"}`}
      >
        No
      </button>
    </div>
  );
}

export function WordsBadge({ text, seconds }: { text: string; seconds: number }) {
  const words = countWords(text);
  const budget = wordsFor(seconds);
  const over = words > budget + 2;
  return (
    <span className={`font-mono text-xs ${over ? "text-neg" : "text-muted"}`} title={`En ${seconds} s entran unas ${budget} palabras`}>
      {words}/{budget} palabras · {seconds} s
    </span>
  );
}

type CardProps = {
  piece: Piece;
  media?: PieceMediaState;
  format: Brief["format"];
  toolName: string;
  canGenerate: boolean;
  onStatus: (status: PieceStatus) => void;
  onSave: (patch: Partial<Pick<Piece, "text" | "onScreenText" | "visualPrompt" | "videoPrompt">>) => Promise<void>;
  onRemove: () => void;
  onUploadImage: (file: File) => void;
  onUploadClip: (file: File) => void;
  onGenerateImage: () => void;
  onRemoveMedia: (kind: "image" | "clip") => void;
  stats?: ReactNode;
  flags?: { kind: string; note: string; fix: string }[];
};

export function PieceCard({ piece, media, format, toolName, canGenerate, onStatus, onSave, onRemove, onUploadImage, onUploadClip, onGenerateImage, onRemoveMedia, stats, flags = [] }: CardProps) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ text: piece.text, onScreenText: piece.onScreenText, visualPrompt: piece.visualPrompt, videoPrompt: piece.videoPrompt });
  const [saving, setSaving] = useState(false);
  const clipSeconds = clipSecondsFor(piece.seconds);
  const dim = piece.status === "rejected" ? "opacity-60" : "";

  async function save() {
    setSaving(true);
    try {
      await onSave(draft);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className={`rounded-xl border bg-white p-3 ${piece.status === "approved" ? "border-good/50" : "border-line"} ${dim}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs font-semibold">{piece.id}</span>
        {piece.kind === "hook" ? (
          <>
            <LevelChip level={piece.level} />
            <Tag title="Ángulo">{ANGLE_LABEL[piece.angle]}</Tag>
            <Tag title="Fórmula">{FORMULA_LABEL[piece.formula]}</Tag>
            {piece.source !== "ai" && <Tag>{piece.source === "organic" ? "del Playbook" : piece.source === "clip" ? "de un clip" : "a mano"}</Tag>}
          </>
        ) : (
          <>
            {piece.levels.map((l) => (
              <LevelChip key={l} level={l} />
            ))}
            {piece.kind === "meat" && <Tag title="Formato">{MEAT_FORMAT_LABEL[piece.format]}</Tag>}
          </>
        )}
        <WordsBadge text={piece.text} seconds={piece.seconds} />
        <span className="ml-auto flex items-center gap-2">
          {stats}
          <StatusButtons status={piece.status} onStatus={onStatus} small />
        </span>
      </div>

      {editing ? (
        <div className="mt-2 space-y-2">
          <textarea className={`${inputClass} min-h-16`} value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} />
          <input className={inputClass} value={draft.onScreenText} placeholder="Titular en pantalla (hasta 6 palabras)" onChange={(e) => setDraft({ ...draft, onScreenText: e.target.value })} />
          <textarea className={`${inputClass} min-h-16 font-mono text-xs`} value={draft.visualPrompt} placeholder="Prompt de imagen (inglés)" onChange={(e) => setDraft({ ...draft, visualPrompt: e.target.value })} />
          <textarea className={`${inputClass} min-h-12 font-mono text-xs`} value={draft.videoPrompt} placeholder="Prompt de video (inglés)" onChange={(e) => setDraft({ ...draft, videoPrompt: e.target.value })} />
          <div className="flex gap-2">
            <Button onClick={save} disabled={saving || !draft.text.trim()}>
              {saving ? <Spinner /> : "Guardar"}
            </Button>
            <Button variant="ghost" onClick={() => setEditing(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <p className="mt-2 text-sm leading-snug">{piece.text}</p>
      )}
      {piece.kind === "cta" && !editing && (
        <p className="mt-1 text-xs text-muted">
          <b>Qué:</b> {piece.what} · <b>Por qué:</b> {piece.why} · <b>Cuándo:</b> {piece.when} · <b>Fácil:</b> {piece.easy}
        </p>
      )}
      {piece.onScreenText && !editing && <p className="mt-1 text-xs text-muted">En pantalla: “{piece.onScreenText}”</p>}
      {piece.note && <p className="mt-1 text-xs text-muted">{piece.note}</p>}
      {flags.map((f, i) => (
        <p key={i} className="mt-1 rounded border border-touch/30 bg-touch-soft px-2 py-1 text-xs">
          <b>{f.kind}:</b> {f.note}
          {f.fix && (
            <>
              {" "}
              <button type="button" className="font-semibold underline" onClick={() => onSave({ text: f.fix })}>
                Usar el arreglo
              </button>
            </>
          )}
        </p>
      ))}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => setOpen(!open)}>
          {open ? "Ocultar producción" : "Producción"}
        </Button>
        {!editing && (
          <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => setEditing(true)}>
            Editar
          </Button>
        )}
        <Button variant="ghost" className="px-2 py-1 text-xs text-muted" onClick={onRemove}>
          Borrar
        </Button>
        {media?.clip && <Tag>clip {media.clip.duration.toFixed(1)} s</Tag>}
        {media?.image && !media.clip && <Tag>imagen</Tag>}
      </div>

      {open && (
        <div className="mt-3 grid gap-3 border-t border-line pt-3 md:grid-cols-[minmax(0,1fr)_200px]">
          <div className="space-y-2 text-xs">
            <p className="text-muted">
              En {toolName}: imagen con el prompt, después animala con el de video a <b>{clipSeconds} s</b> ({format === "vertical" ? "9:16" : "16:9"}). La pieza dura {piece.seconds} s en el anuncio; el render corta el clip.
            </p>
            <div className="flex flex-wrap gap-2">
              <CopyButton text={buildCopyPrompt(piece.visualPrompt, format)} idle="Copiar prompt de imagen" />
              <CopyButton text={piece.videoPrompt} idle="Copiar prompt de video" variant="secondary" />
              {canGenerate && (
                <Button variant="secondary" className="px-2 py-1 text-xs" onClick={onGenerateImage} disabled={media?.loading || !piece.visualPrompt}>
                  {media?.loading ? <Spinner /> : "Generar imagen"}
                </Button>
              )}
            </div>
            <pre className="whitespace-pre-wrap rounded bg-paper p-2 font-mono text-[11px] text-muted">{piece.visualPrompt || "(sin prompt de imagen)"}</pre>
            <pre className="whitespace-pre-wrap rounded bg-paper p-2 font-mono text-[11px] text-muted">{piece.videoPrompt || "(sin prompt de video)"}</pre>
            <div className="flex flex-wrap gap-2">
              <label className="cursor-pointer rounded-lg border border-line bg-white px-2 py-1 font-semibold hover:border-ink">
                Subir imagen
                <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && onUploadImage(e.target.files[0])} />
              </label>
              <label className="cursor-pointer rounded-lg border border-line bg-white px-2 py-1 font-semibold hover:border-ink">
                Subir clip
                <input type="file" accept="video/*" className="hidden" onChange={(e) => e.target.files?.[0] && onUploadClip(e.target.files[0])} />
              </label>
              {media?.image && (
                <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => onRemoveMedia("image")}>
                  Quitar imagen
                </Button>
              )}
              {media?.clip && (
                <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => onRemoveMedia("clip")}>
                  Quitar clip
                </Button>
              )}
            </div>
            {media?.error && <p className="text-neg">{media.error}</p>}
          </div>
          <div className={`overflow-hidden rounded-lg border border-line bg-black ${format === "vertical" ? "aspect-[9/16]" : "aspect-video"}`}>
            {media?.clip ? (
              <video src={media.clip.url} className="size-full object-contain" controls muted />
            ) : media?.image ? (
              <img src={media.image} alt="" className="size-full object-contain" />
            ) : (
              <div className="flex size-full items-center justify-center p-3 text-center text-xs text-muted">Sin imagen ni clip: se renderiza con una tarjeta de color.</div>
            )}
          </div>
        </div>
      )}
    </article>
  );
}

export const kindTitle = (kind: Piece["kind"]) => PIECE_LABEL[kind];
