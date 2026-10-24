// Shared bits of the Publicidad section: level chips and the card that shows and edits one piece (hook, meat or CTA)
// with its prompts and its clip or image.
import { useEffect, useRef, useState, type ReactNode } from "react";
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
import { imageSaveLine, promptsWithSlots, slotName, videoSaveLine, withSlotLine } from "../../../shared/adsBulk.ts";
import { continuityNote, grokSequence, sequencePromptText, sequencePromptsFromPiece } from "../../../shared/adsSequence.ts";
import { unverified } from "../../../shared/adsSpeaker.ts";
import { formatSeconds, nextVoiceId, voiceLengthWarning, voiceNumber, VOICE_VARIANTS_MAX } from "../../../shared/voiceVariants.ts";
import { buildCopyPrompt } from "../../../shared/prompt.ts";
import type { Brief } from "../../../shared/schema.ts";
import { CopyButton } from "../ScriptView.tsx";
import { Button, Spinner, inputClass } from "../ui.tsx";

export type ClipFile = { url: string; blob: Blob; name: string; duration: number; from?: number };
export type VoiceClip = ClipFile & { id: string; cutOk?: boolean };
export type PieceMediaState = {
  image?: string;
  clip?: ClipFile;
  clips?: (ClipFile | null)[];
  // The single voice, mirrored while the piece has exactly one (the old render reads this blob).
  voice?: ClipFile;
  voices?: VoiceClip[];
  voiceSeq?: number;
  voiceErrors?: string[];
  loading?: boolean;
  voiceLoading?: boolean;
  error?: string;
};

// A voice starts 0.15 s into its piece (render.ts) and is cut at the piece's end.
export const VOICE_START = 0.15;

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
      {status === "archived" && <span className={`${cls} text-muted`}>Archivada</span>}
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
  // One file per Grok clip when the piece is longer than 15 s.
  onUploadClipAt?: (index: number, file: File) => void;
  onRemoveClipAt?: (index: number) => void;
  // The series look, already a phrase, so a sequence prompt stays in the same light.
  look?: string;
  onGenerateImage: () => void;
  onRemoveMedia: (kind: "image" | "clip" | "voice") => void;
  onUploadVoices: (files: File[]) => void;
  onReplaceVoice: (vid: string, file: File) => void;
  onRenameVoice: (vid: string, name: string) => void;
  onAcceptCut: (vid: string) => void;
  onRemoveVoice: (vid: string) => void;
  onConvert: () => void;
  converting?: boolean;
  convertDisabled?: boolean;
  voiceSeq?: number;
  savedVoiceCount?: number;
  voiceAdding?: boolean;
  // "2/4" when several voices each have their own render.
  cachedDetail?: string;
  // Null when there is no OpenAI key for generated voices.
  onGenerateVoice: (() => void) | null;
  // The piece's render in the cache: "mp4" (H.264) or "webm" (VP9 or another codec); null if not rendered yet.
  cached: "mp4" | "webm" | null;
  stats?: ReactNode;
  // The last CSV's line for this piece (verdict plus why). Missing until a CSV is imported.
  metric?: { verdict: string; why: string };
  flags?: { kind: string; note: string; fix: string }[];
  // The clip came from an explainer of this series ("Usar en Publicidad"): its title and in point.
  explainer?: { title: string; from: number };
  // "Hacelo como explicativo": a hook, meat or CTA with no clip opens a new explainer with its text.
  onMakeExplainer?: () => void;
  // "Que lo diga un personaje" (SpeakerPanel), shown under the clip buttons in Producción.
  speakerPanel?: ReactNode;
};

function PlayVoice({ url }: { url: string }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [on, setOn] = useState(false);
  if (!url) return null;
  return (
    <>
      <audio
        ref={audio}
        src={url}
        onEnded={() => setOn(false)}
        onPause={() => setOn(false)}
      />
      <Button
        variant="ghost"
        className="px-2 py-1 text-xs"
        onClick={() => {
          const el = audio.current;
          if (!el) return;
          if (on) {
            el.pause();
            setOn(false);
          } else {
            void el.play();
            setOn(true);
          }
        }}
      >
        {on ? "Pausa" : "Escuchar"}
      </Button>
    </>
  );
}

function VoiceName({ name, onRename }: { name: string; onRename: (name: string) => void }) {
  const [draft, setDraft] = useState(name);
  useEffect(() => setDraft(name), [name]);
  return (
    <input
      className="w-40 rounded border border-line bg-white px-2 py-1 text-xs"
      value={draft}
      aria-label="Nombre de la voz"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const next = draft.trim();
        if (next && next !== name) onRename(next);
        else setDraft(name);
      }}
    />
  );
}

function VoiceBox({
  pieceSeconds,
  voices,
  errors,
  loading,
  canGenerate,
  hasText,
  converting,
  convertDisabled,
  onUpload,
  onReplace,
  onRename,
  onAcceptCut,
  onRemove,
  onGenerate,
  onConvert,
  voiceSeq = 0,
  savedCount = 0,
  adding = false,
}: {
  pieceSeconds: number;
  voices: VoiceClip[];
  errors: string[];
  loading: boolean;
  canGenerate: boolean;
  hasText: boolean;
  converting: boolean;
  convertDisabled: boolean;
  onUpload: (files: File[]) => void;
  onReplace: (vid: string, file: File) => void;
  onRename: (vid: string, name: string) => void;
  onAcceptCut: (vid: string) => void;
  onRemove: (vid: string) => void;
  onGenerate: (() => void) | null;
  onConvert: () => void;
  voiceSeq?: number;
  savedCount?: number;
  adding?: boolean;
}) {
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const count = Math.max(voices.length, savedCount);
  const gate = nextVoiceId(voiceSeq, count);
  const cannotAdd = "error" in gate;
  // One voice is replaced in place. Every other case needs a new id.
  const addBlocked = cannotAdd && voices.length !== 1;
  const seqFull = cannotAdd && count < VOICE_VARIANTS_MAX;
  return (
    <div className="space-y-1.5 border-t border-line pt-2">
      <p className="font-semibold text-ink">
        Voces ({voices.length}/{VOICE_VARIANTS_MAX})
      </p>
      <div
        className={`rounded-lg border-2 border-dashed p-2 ${over ? "border-good bg-paper" : "border-line"}`}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          if (!cannotAdd && !adding && e.dataTransfer.files.length) onUpload([...e.dataTransfer.files]);
        }}
      >
        <p className="text-muted">
          Soltá las voces acá o elegilas. mp3, wav, m4a, ogg o webm, hasta 25 MB. Cada archivo entra solo: si uno falla, los demás siguen.
        </p>
        <Button variant="secondary" className="mt-1 px-2 py-1 text-xs" disabled={cannotAdd || adding} onClick={() => input.current?.click()}>
          Elegir voces
        </Button>
        <input
          ref={input}
          type="file"
          multiple
          accept=".mp3,.wav,.m4a,.ogg,.webm,audio/*"
          className="hidden"
          onChange={(e) => {
            if (!adding && !cannotAdd && e.target.files?.length) onUpload([...e.target.files]);
            e.target.value = "";
          }}
        />
      </div>
      {seqFull && "error" in gate && <p className="text-muted">{gate.error}</p>}
      {voices.map((v) => {
        const warning = voiceLengthWarning(voiceNumber(v.id), v.duration, pieceSeconds);
        return (
          <div key={v.id} className="flex flex-wrap items-center gap-2 rounded border border-line px-2 py-1">
            <span className="font-mono text-[11px] text-muted">{v.id}</span>
            <PlayVoice url={v.url} />
            <VoiceName name={v.name} onRename={(name) => onRename(v.id, name)} />
            <span className="text-muted">{formatSeconds(v.duration)} s</span>
            <label className="cursor-pointer rounded border border-line bg-white px-2 py-0.5 font-semibold hover:border-ink">
              Reemplazar
              <input
                type="file"
                accept=".mp3,.wav,.m4a,.ogg,.webm,audio/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onReplace(v.id, file);
                  e.target.value = "";
                }}
              />
            </label>
            <button type="button" className="text-muted underline" onClick={() => onRemove(v.id)}>
              Borrar
            </button>
            {warning && !v.cutOk && (
              <p className="basis-full text-neg">
                {warning}. Se corta al final de la pieza. Aceptá el corte o reemplazala antes de renderizar.{" "}
                <button type="button" className="font-semibold underline" onClick={() => onAcceptCut(v.id)}>
                  Cortala igual
                </button>
              </p>
            )}
            {warning && v.cutOk && <p className="basis-full text-muted">Aceptaste el corte: se corta al final de la pieza.</p>}
          </div>
        );
      })}
      {errors.map((e, i) => (
        <p key={i} className="text-neg">
          {e}
        </p>
      ))}
      <div className="flex flex-wrap gap-2">
        {onGenerate && (
          <Button variant="secondary" className="px-2 py-1 text-xs" onClick={onGenerate} disabled={loading || adding || !hasText || addBlocked}>
            {loading ? <Spinner /> : voices.length === 1 ? "Generar de nuevo" : voices.length > 1 ? "Generar otra voz" : "Generar voz"}
          </Button>
        )}
        {voices.length === 1 && (
          <Button variant="secondary" className="px-2 py-1 text-xs" onClick={onConvert} disabled={converting || convertDisabled}>
            {converting ? <Spinner /> : "Convertir la voz"}
          </Button>
        )}
        {voices.length > 1 && (
          <Button variant="secondary" className="px-2 py-1 text-xs" onClick={onConvert} disabled={converting || convertDisabled}>
            {converting ? (
              <Spinner />
            ) : (
              `Convertir las ${voices.length} voces`
            )}
          </Button>
        )}
      </div>
      {!canGenerate && <p className="text-muted">Para generarla falta la clave de OpenAI en Modelos; podés subir las voces.</p>}
    </div>
  );
}

export function PieceCard({
  piece,
  media,
  format,
  toolName,
  canGenerate,
  onStatus,
  onSave,
  onRemove,
  onUploadImage,
  onUploadClip,
  onUploadClipAt,
  onRemoveClipAt,
  look,
  onGenerateImage,
  onRemoveMedia,
  onUploadVoices,
  onReplaceVoice,
  onRenameVoice,
  onAcceptCut,
  onRemoveVoice,
  onConvert,
  converting = false,
  convertDisabled = false,
  voiceSeq = 0,
  savedVoiceCount = 0,
  voiceAdding = false,
  cachedDetail,
  onGenerateVoice,
  cached,
  stats,
  metric,
  flags = [],
  explainer,
  onMakeExplainer,
  speakerPanel,
}: CardProps) {
  const voices = [...(media?.voices ?? [])].sort((a, b) => voiceNumber(a.id) - voiceNumber(b.id));
  const longVoice = voices.find((v) => !v.cutOk && voiceLengthWarning(voiceNumber(v.id), v.duration, piece.seconds));
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ text: piece.text, onScreenText: piece.onScreenText, visualPrompt: piece.visualPrompt, videoPrompt: piece.videoPrompt });
  const [saving, setSaving] = useState(false);
  const slots = explainer ? [] : grokSequence(piece.seconds);
  const sequence = slots.length > 1;
  const clipSeconds = sequence ? slots[0].length : clipSecondsFor(piece.seconds);
  const imageLine = imageSaveLine(slotName(piece.id, { image: true }));
  const videoLine = videoSaveLine(slotName(piece.id, sequence ? { count: slots.length, index: 0 } : { count: 1, index: 0 }));
  const imageCopy = withSlotLine(buildCopyPrompt(piece.visualPrompt, format), imageLine);
  const videoCopy = withSlotLine(piece.videoPrompt, videoLine);
  const sequenceText = sequence
    ? sequencePromptText(promptsWithSlots(piece.id, sequencePromptsFromPiece({ text: piece.text, seconds: piece.seconds, visualPrompt: piece.visualPrompt, videoPrompt: piece.videoPrompt, look })))
    : "";
  const dim = piece.status === "rejected" || piece.status === "archived" ? "opacity-60" : "";

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
      {metric && (
        <p className="mt-1 text-xs text-muted">
          <span className="font-semibold text-ink">{metric.verdict}</span> · {metric.why}
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
        {explainer && (
          <Tag title="El video trae sus palabras y subtítulos: no se dibuja nada encima">
            explicativo{explainer.title ? ` «${explainer.title}»` : ""}
            {explainer.from > 0 ? ` desde ${explainer.from.toFixed(1)} s` : ""}
          </Tag>
        )}
        {onMakeExplainer && !media?.clip && !media?.clips?.some(Boolean) && (
          <Button
            variant="ghost"
            className="px-2 py-1 text-xs"
            title={
              piece.kind === "hook"
                ? "Abre un explicativo con el gancho en texto cinético. Si la escena es más larga que la pieza, el anuncio usa los primeros segundos."
                : "Abre un explicativo nuevo de esta serie con el texto de la pieza; después se usa acá con «Usar en Publicidad»"
            }
            onClick={onMakeExplainer}
          >
            Hacelo como explicativo
          </Button>
        )}
        {media?.image && !media.clip && <Tag>imagen</Tag>}
        {piece.speaker && <Tag title="Que lo diga un personaje">lo dice un personaje</Tag>}
        {voices.length > 1 ? (
          <Tag title={longVoice ? (voiceLengthWarning(voiceNumber(longVoice.id), longVoice.duration, piece.seconds) ?? "Voz larga") : "Variantes de voz"}>
            <span className={longVoice ? "text-neg" : ""}>
              voces {voices.length}/{VOICE_VARIANTS_MAX}
            </span>
          </Tag>
        ) : voices.length === 1 ? (
          <Tag title={longVoice ? "La voz no entra: se corta al final de la pieza" : "Voz"}>
            <span className={longVoice ? "text-neg" : ""}>voz {formatSeconds(voices[0].duration)} s</span>
          </Tag>
        ) : media?.voice ? (
          <Tag>voz {formatSeconds(media.voice.duration)} s</Tag>
        ) : (
          <Tag>solo subtítulo</Tag>
        )}
        {cached && (
          <Tag title={cached === "mp4" ? "Renderizada en H.264: se une sin recodificar y las plataformas la aceptan." : "Renderizada en webm (VP9 u otro): este navegador no codifica H.264. Los anuncios salen en MP4 con VP9, que algunas plataformas rechazan."}>
            <span className={cached === "webm" ? "text-neg" : ""}>
              en caché{cachedDetail ? ` · ${cachedDetail}` : ""} · {cached === "mp4" ? "H.264" : "webm"}
            </span>
          </Tag>
        )}
      </div>

      {open && (
        <div className="mt-3 grid gap-3 border-t border-line pt-3 md:grid-cols-[minmax(0,1fr)_200px]">
          <div className="space-y-2 text-xs">
            <p className="text-muted">
              {sequence ? (
                <>
                  Esta pieza dura <b>{piece.seconds} s</b> y Grok arma clips de 6, 10 o 15 s. Son {slots.length} clips ({slots.map((s) => `${s.length} s`).join(" + ")}), el mismo lugar y los mismos @ref, cada uno siguiendo al anterior. El anuncio usa{" "}
                  {slots.map((s) => (s.play < s.length ? `${s.play} s del de ${s.length}` : `${s.play} s`)).join(", ")}. En {toolName}: primero la imagen con el prompt, después animala ({format === "vertical" ? "9:16" : "16:9"}).
                </>
              ) : (
                <>
                  En {toolName}: imagen con el prompt, después animala con el de video a <b>{clipSeconds} s</b> ({format === "vertical" ? "9:16" : "16:9"}). La pieza dura {piece.seconds} s en el anuncio; el render corta el clip.
                </>
              )}
            </p>
            <div className="flex flex-wrap gap-2">
              <CopyButton text={imageCopy} idle="Copiar prompt de imagen" />
              <CopyButton text={videoCopy} idle="Copiar prompt de video" variant="secondary" />
              {sequence &&
                (unverified(piece.text) ? (
                  <p className="text-neg">El texto tiene un [VERIFY]: confirmalo o cambialo antes de copiar los prompts.</p>
                ) : (
                  <CopyButton text={sequenceText} idle="Copiar todos los prompts" />
                ))}
              {canGenerate && (
                <Button variant="secondary" className="px-2 py-1 text-xs" onClick={onGenerateImage} disabled={media?.loading || !piece.visualPrompt}>
                  {media?.loading ? <Spinner /> : "Generar imagen"}
                </Button>
              )}
            </div>
            <p className="text-[11px] text-muted">Al copiar, el prompt termina con «{videoLine}» o «{imageLine}».</p>
            <pre className="whitespace-pre-wrap rounded bg-paper p-2 font-mono text-[11px] text-muted">{piece.visualPrompt || "(sin prompt de imagen)"}</pre>
            <pre className="whitespace-pre-wrap rounded bg-paper p-2 font-mono text-[11px] text-muted">{piece.videoPrompt || "(sin prompt de video)"}</pre>
            <div className="flex flex-wrap gap-2">
              <label className="cursor-pointer rounded-lg border border-line bg-white px-2 py-1 font-semibold hover:border-ink">
                Subir imagen
                <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && onUploadImage(e.target.files[0])} />
              </label>
              {!sequence && (
                <label className="cursor-pointer rounded-lg border border-line bg-white px-2 py-1 font-semibold hover:border-ink">
                  Subir clip
                  <input type="file" accept="video/*" className="hidden" onChange={(e) => e.target.files?.[0] && onUploadClip(e.target.files[0])} />
                </label>
              )}
              {media?.image && (
                <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => onRemoveMedia("image")}>
                  Quitar imagen
                </Button>
              )}
              {media?.clip && !sequence && (
                <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => onRemoveMedia("clip")}>
                  Quitar clip
                </Button>
              )}
            </div>
            {sequence && (
              <ol className="space-y-1.5">
                {slots.map((slot, i) => {
                  const file = media?.clips?.[i];
                  return (
                    <li key={i} className="flex flex-wrap items-center gap-2 rounded border border-line px-2 py-1">
                      <span className="font-semibold">
                        Clip {i + 1} de {slots.length}
                      </span>
                      <span className="text-muted">
                        pedí {slot.length} s{slot.play < slot.length ? ` (el anuncio usa los primeros ${slot.play} s)` : ""}
                      </span>
                      {i > 0 && <span className="basis-full text-muted">{continuityNote(i)}</span>}
                      <label className="cursor-pointer rounded border border-line bg-white px-2 py-0.5 font-semibold hover:border-ink">
                        {file ? "Cambiar" : "Subir"}
                        <input type="file" accept="video/*" className="hidden" onChange={(e) => e.target.files?.[0] && onUploadClipAt?.(i, e.target.files[0])} />
                      </label>
                      {file && (
                        <>
                          <span className="text-muted">{file.name}</span>
                          <button type="button" className="text-muted underline" onClick={() => onRemoveClipAt?.(i)}>
                            Quitar
                          </button>
                        </>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
            {speakerPanel}
            <VoiceBox
              pieceSeconds={piece.seconds}
              voices={voices}
              errors={media?.voiceErrors ?? []}
              loading={Boolean(media?.voiceLoading)}
              canGenerate={Boolean(onGenerateVoice)}
              hasText={Boolean(piece.text.trim())}
              converting={converting}
              convertDisabled={convertDisabled}
              onUpload={onUploadVoices}
              onReplace={onReplaceVoice}
              onRename={onRenameVoice}
              onAcceptCut={onAcceptCut}
              onRemove={onRemoveVoice}
              onGenerate={onGenerateVoice}
              onConvert={onConvert}
              voiceSeq={voiceSeq}
              savedCount={savedVoiceCount}
              adding={voiceAdding}
            />
            {media?.error && <p className="text-neg">{media.error}</p>}
          </div>
          <div className={`overflow-hidden rounded-lg border border-line bg-black ${format === "vertical" ? "aspect-[9/16]" : "aspect-video"}`}>
            {media?.clip ? (
              <video src={media.clip.url} className="size-full object-contain" controls muted />
            ) : media?.clips?.find((c) => c) ? (
              <video src={media.clips.find((c) => c)!.url} className="size-full object-contain" controls muted />
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
