import { createContext, useContext, useEffect, useRef, useState } from "react";
import { ClaudeHandoff, type Handoff } from "./ClaudeHandoff.tsx";
import { clipMusicNotice, clipPrompt } from "../../shared/audio.ts";
import { polishWords } from "../../shared/checks.ts";
import { buildCopyPrompt } from "../../shared/prompt.ts";
import { SHOT_LENGTHS, type Board, type Brief, type ImageReview, type SegmentEdit, type Setup, type Shot, type Story } from "../../shared/schema.ts";
import type { CastMember } from "../../shared/series.ts";
import { shotReferences } from "../../shared/castRefs.ts";
import { formatTime, timeShots, totalSeconds, type TimedShot } from "../../shared/template.ts";
import { editsFrom, generatesImage, transformScreen, withScreenMove } from "../../shared/transformScreen.ts";
import { copyText } from "../lib/files.ts";
import { formatElapsed, type LogEntry } from "../lib/markdown.ts";
import { SpeakButton, VoiceRow, type AudioFile, type VoiceRowProps } from "./Audio.tsx";
import { ActionWarning, BEAT_EDGE } from "./shotBits.tsx";
import { BeatChip, Button, ROLE_TEXT, Spinner, inputClass } from "./ui.tsx";

export type ClipFile = { url: string; blob: Blob; name: string; duration: number };
// A member of the series' fixed cast, with the URL of its approved image.
// videoUrl: a real screen's recording ("Videos de la app funcionando"), which a screen shot can take as its clip.
export type LibraryEntry = CastMember & { url?: string; videoUrl?: string };
// The writer's look at an uploaded image or clip frame, and the picture's format against the video's.
export type ReviewState = { what: "image" | "clip"; loading: boolean; result?: ImageReview; format?: string; error?: string };

export type MediaState = {
  image?: string;
  // The image's file name in the project folder (kept for sketches, which pieza.md links).
  imageFile?: string;
  clip?: ClipFile;
  review?: ReviewState;
  voice?: AudioFile;
  sfx?: AudioFile;
  loading?: boolean;
  error?: string;
};

const BAR = { negative: "bg-neg", touching: "bg-touch", good: "bg-good" };

export function Timeline({ board }: { board: Board }) {
  const shots = timeShots(board.shots);
  const total = totalSeconds(board.shots);
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full">
        {shots.map((s) => (
          <div
            key={s.index}
            className={`${BAR[s.beat]} border-r border-white/70 last:border-r-0`}
            style={{ width: `${(s.seconds / total) * 100}%` }}
            title={`Toma ${s.index + 1} · ${formatTime(s.start)}–${formatTime(s.end)}`}
          />
        ))}
      </div>
      <div className="mt-1.5 flex justify-between font-mono text-xs text-muted">
        <span>0:00</span>
        <span>
          <span className="text-neg">■</span> Negativo <span className="text-touch">■</span> Emotivo{" "}
          <span className="text-good">■</span> Bueno
        </span>
        <span>{formatTime(total)}</span>
      </div>
    </div>
  );
}

export function CopyButton({
  text,
  idle = "Copiar",
  variant = "primary",
}: {
  text: string;
  idle?: string;
  variant?: "primary" | "secondary";
}) {
  const [copied, setCopied] = useState<"" | "yes" | "error">("");
  async function copy() {
    try {
      await copyText(text);
      setCopied("yes");
    } catch {
      setCopied("error");
    }
    setTimeout(() => setCopied(""), 1600);
  }
  return (
    <Button variant={variant} className="px-3 py-1.5 text-xs" onClick={copy}>
      {copied === "yes" ? "Copiado ✓" : copied === "error" ? "No se pudo copiar" : idle}
    </Button>
  );
}

// Full-size view of a shot's image or clip, over the page. Esc or a click outside closes it.
export function MediaViewer({ src, kind, onClose }: { src: string; kind: "image" | "clip"; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={kind === "image" ? "Imagen" : "Clip"}
      className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4"
      onClick={onClose}
    >
      <div className="relative max-h-full" onClick={(e) => e.stopPropagation()}>
        {kind === "image" ? (
          <img src={src} alt="" className="max-h-[90vh] max-w-[92vw] rounded-lg object-contain" />
        ) : (
          <video src={src} controls autoPlay playsInline className="max-h-[90vh] max-w-[92vw] rounded-lg bg-black" />
        )}
        <button
          type="button"
          onClick={onClose}
          className="absolute -top-3 -right-3 grid size-8 place-items-center rounded-full bg-white text-sm font-bold shadow"
          aria-label="Cerrar"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

// An empty slot opens the file picker on click; a full one opens the viewer. Dropping a file always works.
function DropSlot({
  accept,
  empty,
  vertical,
  onFile,
  onView,
  onRemove,
  children,
}: {
  accept: string;
  empty: string;
  vertical: boolean;
  onFile: (file: File) => void;
  onView?: () => void;
  onRemove?: () => void;
  children?: React.ReactNode;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const full = Boolean(children) && Boolean(onView);
  return (
    <div>
      <button
        type="button"
        onClick={() => (full ? onView?.() : input.current?.click())}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) onFile(file);
        }}
        title={full ? "Clic para verlo en grande; soltá otro archivo para reemplazarlo" : "Hacé clic o soltá un archivo acá"}
        className={`relative block w-full overflow-hidden rounded-lg border-2 border-dashed bg-paper ${
          dragging ? "border-ink" : children ? "border-transparent" : "border-line"
        } ${vertical ? "aspect-[9/16]" : "aspect-video"}`}
      >
        {children ?? (
          <span className="absolute inset-0 grid place-items-center p-2 text-center text-xs font-semibold text-muted">
            {empty}
          </span>
        )}
      </button>
      {full && (
        <div className="mt-1 flex flex-wrap justify-center gap-x-1 text-[11px] leading-tight font-semibold">
          <button type="button" onClick={() => input.current?.click()} className="rounded px-1 py-0.5 text-muted hover:bg-black/5 hover:text-ink">
            Cambiar
          </button>
          {onRemove && (
            <button type="button" onClick={onRemove} className="rounded px-1 py-0.5 text-muted hover:bg-black/5 hover:text-neg">
              Quitar
            </button>
          )}
        </div>
      )}
      <input
        ref={input}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}

function clipNote(clip: ClipFile, shot: TimedShot): string {
  const need = shot.seconds;
  if (clip.duration >= need - 0.05) {
    return `Clip de ${clip.duration.toFixed(1)} s → se usan ${need.toFixed(1)} s.`;
  }
  return `Clip de ${clip.duration.toFixed(1)} s y la toma dura ${need.toFixed(1)} s: el último cuadro se sostiene ${(need - clip.duration).toFixed(1)} s. Podés alargarlo con Extend.`;
}

type CardProps = {
  brief: Brief;
  story: Story;
  board: Board;
  shot: TimedShot;
  media: MediaState;
  toolName: string;
  onShotChange: (index: number, shot: Shot) => void;
  onGenerate: (index: number) => void;
  onUploadImage: (index: number, file: File) => void;
  onUploadClip: (index: number, file: File) => void;
  onRemoveMedia: (index: number, kind: "image" | "clip") => void;
  // One object changed in the image with the tool's segments.
  onSegment: (index: number, note: string) => Promise<SegmentEdit>;
  // Look at the shot's clip (or else its image) again; null when no writer can look at pictures.
  onReview: ((index: number) => void) | null;
  onRewrite: (index: number, note: string) => Promise<boolean>;
  // Without a key: "Reescribir prompts" by copy and paste with claude.ai (the button shows the sample).
  rewriteHandoff?: ((index: number, note: string) => Handoff) | null;
  // The series' fixed cast by id: approved images, @ references and real screens.
  library: Record<string, LibraryEntry>;
  // The tool's cap on reference images (its profile in server/tools/), or null.
  maxRefs?: number | null;
  // How lines are heard: the voice row under each shot.
  voice: Omit<VoiceRowProps, "shot" | "index" | "speaker" | "voice" | "sfx">;
};

// One prompt with its copy button. Image prompts are checked for actions (an image is one moment).
function PromptBox({
  label,
  hint,
  value,
  copy,
  rows = 3,
  still = false,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  copy: string;
  rows?: number;
  still?: boolean;
  onChange: (value: string) => void;
}) {
  const words = value.trim().split(/\s+/).filter(Boolean).length;
  const polish = useContext(StrictLook) ? polishWords(value) : [];
  return (
    <div className="overflow-hidden rounded-lg border border-line">
      <div className="flex items-center justify-between gap-2 border-b border-line bg-paper py-1.5 pr-1.5 pl-3">
        <span className="text-xs font-semibold">
          {label} <span className="font-normal text-muted">· {words} palabras · {hint}</span>
        </span>
        <span className="flex items-center gap-1">
          <SpeakButton text={value} lang="en-US" />
          <CopyButton text={copy} />
        </span>
      </div>
      <textarea
        aria-label={label}
        className="block w-full resize-y border-0 px-3 py-2 text-sm outline-none"
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {still && (
        <div className="px-3 pb-2 empty:hidden">
          <ActionWarning prompt={value} />
        </div>
      )}
      {polish.length > 0 && (
        <p className="mx-3 mb-2 rounded-md bg-amber-100 px-2 py-1 text-xs text-amber-900">
          Pide "{polish.join('", "')}": con el look de la serie, pedí defectos (cámara, grano, foco, luz), no un look pulido.
        </p>
      )}
    </div>
  );
}

// True when the series has a look: prompts that ask for a polished look get a yellow note.
const StrictLook = createContext(false);

// Who and what is in the frame. Linked members of the fixed cast show their @ reference for the image tool.
function InFrame({
  shot,
  setups,
  library,
  toolName,
  maxRefs,
  onChange,
}: {
  shot: Shot;
  setups: Setup[];
  library: Record<string, LibraryEntry>;
  toolName: string;
  maxRefs: number | null;
  onChange: (setups: string[]) => void;
}) {
  const byId = Object.fromEntries(setups.map((s) => [s.id, s]));
  const missing = setups.filter((s) => !shot.setups.includes(s.id));
  const members = shot.setups.map((id) => byId[id]?.castId).flatMap((c) => (c && library[c] ? [library[c]] : []));
  const refs = shotReferences(members);
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="font-semibold text-muted">En cuadro:</span>
        {shot.setups.map((id) => {
          const setup = byId[id];
          const member = setup?.castId ? library[setup.castId] : undefined;
          return (
            <span
              key={id}
              className="inline-flex items-center gap-1 rounded-full border border-line bg-white py-0.5 pr-1 pl-1"
              title={member ? `En ${toolName}: escribí @${member.ref} para usar su imagen aprobada` : setup?.identity}
            >
              {member?.url ? (
                <img src={member.url} alt="" className="size-5 rounded-full object-cover" />
              ) : (
                <span className="grid size-5 place-items-center rounded-full bg-ink text-[10px] font-bold text-white">{id}</span>
              )}
              {setup?.name ?? id}
              {member && <b className="font-mono text-good">@{member.ref}</b>}
              {(member?.refs ?? [])
                .filter((r) => r.image)
                .map((r) => (
                  <b key={r.ref} className="font-mono text-good/80" title={`Otra referencia de ${member?.name}: ${r.label}`}>
                    @{r.ref}
                  </b>
                ))}
              <button
                type="button"
                onClick={() => onChange(shot.setups.filter((x) => x !== id))}
                className="rounded-full px-1 text-muted hover:text-neg"
                aria-label={`Sacar ${setup?.name ?? id} de la toma`}
              >
                ×
              </button>
            </span>
          );
        })}
        {missing.length > 0 && (
          <select
            value=""
            onChange={(e) => e.target.value && onChange([...shot.setups, e.target.value])}
            className="rounded-full border border-dashed border-line bg-white px-2 py-0.5 text-xs text-muted"
            aria-label="Sumar a la toma"
          >
            <option value="">+ sumar</option>
            {missing.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}
      </div>
      {maxRefs !== null && refs.length > maxRefs && (
        <p className="text-xs text-amber-800">
          Esta toma tiene {refs.length} referencias y {toolName} acepta hasta {maxRefs}: llamá con @ solo las que se ven.
        </p>
      )}
    </div>
  );
}

function ShotCard(props: CardProps) {
  const {
    brief,
    story,
    board,
    shot,
    media,
    toolName,
    onShotChange,
    onGenerate,
    onUploadImage,
    onUploadClip,
    onRemoveMedia,
    onRewrite,
    rewriteHandoff,
    onReview,
    onSegment,
    library,
    voice,
  } = props;
  const [open, setOpen] = useState(true);
  const [viewing, setViewing] = useState<"image" | "clip" | null>(null);
  const [note, setNote] = useState("");
  const [rewriting, setRewriting] = useState(false);
  const [takingVideo, setTakingVideo] = useState(false);
  const [videoError, setVideoError] = useState("");
  const vertical = brief.format === "vertical";
  const setup = board.setups.find((s) => s.id === shot.setups[0]);
  const screen = shot.kind === "screen" ? library[shot.screen] : undefined;
  // A transform can start or end on a real screen from the cast: that frame is the screenshot, never generated.
  const realEnd = transformScreen(shot);
  const editFrom = editsFrom(board.shots, shot.editFrom) ? shot.editFrom : 0;
  const realScreen = realEnd ? library[realEnd.screen] : undefined;
  const screens = Object.values(library).filter((m) => m.kind === "screen");
  // A screen shot (or a transform that starts on a real screen) shows the real screenshot from the series unless
  // the person uploaded another image.
  const image = media.image ?? screen?.url ?? (realEnd?.at === "start" ? realScreen?.url : undefined);
  const who = story.characters.find((c) => c.id === shot.speaker);
  const set = <K extends keyof Shot>(key: K, value: Shot[K]) => onShotChange(shot.index, { ...shot, [key]: value });

  if (!open) {
    const status = media.clip ? "imagen ✓ clip ✓" : media.image ? "imagen ✓" : "sin empezar";
    return (
      <li>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-line bg-white px-4 py-3 text-left text-sm hover:border-ink"
        >
          <span className="w-24 shrink-0 font-mono text-xs text-muted">
            {formatTime(shot.start)}–{formatTime(shot.end)}
          </span>
          <BeatChip beat={shot.beat} />
          <span className="min-w-0 flex-1 truncate">
            <b>{shot.title}</b>
            <span className="text-muted">
              {" · "}
              {who && <span className={ROLE_TEXT[who.role]}>{who.name}: </span>}
              {shot.voiceover || shot.onScreenText || "(sin texto)"}
            </span>
          </span>
          <span className="text-xs text-muted">{shot.setups.join(" + ")}</span>
          <span className="rounded border border-line px-1.5 font-mono text-xs">{status}</span>
        </button>
      </li>
    );
  }

  async function rewrite() {
    setRewriting(true);
    const ok = await onRewrite(shot.index, note.trim());
    setRewriting(false);
    if (ok) setNote("");
  }

  // "Final: pantalla real": the end (or start) frame becomes a cast screenshot and the video prompt says so.
  const setRealScreen = (at: Shot["screenAt"], id: string) => {
    const name = library[id]?.name ?? id;
    onShotChange(shot.index, { ...shot, screenAt: id ? at : "", screen: id && at ? id : "", videoPrompt: withScreenMove(shot.videoPrompt, id ? at : "", name) });
  };

  const setSeconds = (seconds: number) =>
    onShotChange(shot.index, { ...shot, seconds, toolSettings: shot.toolSettings.replace(/\d+(\.\d+)?\s*s\b/, `${seconds} s`) });

  return (
    <li className={`rounded-xl border border-l-4 border-line bg-white p-3 shadow-sm sm:p-4 ${BEAT_EDGE[shot.beat]}`}>
      {viewing === "image" && image && <MediaViewer kind="image" src={image} onClose={() => setViewing(null)} />}
      {viewing === "clip" && media.clip && <MediaViewer kind="clip" src={media.clip.url} onClose={() => setViewing(null)} />}
      <div className="mb-3 border-b border-line pb-3">
        <p className="font-mono text-xs text-muted">
          Toma {shot.index + 1} · {formatTime(shot.start)}–{formatTime(shot.end)}
        </p>
        <h3 className="text-lg leading-snug font-bold">{shot.title || "(sin título)"}</h3>
        {shot.action && <p className="text-sm text-muted">{shot.action}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex overflow-hidden rounded-md border border-line text-xs" title="Largo de la toma (los largos de clip de Grok)">
          {SHOT_LENGTHS.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setSeconds(l)}
              className={`px-2 py-0.5 font-mono ${shot.seconds === l ? "bg-ink text-white" : "text-muted hover:text-ink"}`}
            >
              {l} s
            </button>
          ))}
        </span>
        <BeatChip beat={shot.beat} />
        {shot.kind === "transform" && (
          <span className="rounded bg-touch-soft px-1.5 py-0.5 text-xs font-semibold text-touch">Transformación</span>
        )}
        {shot.kind === "screen" && (
          <span className="rounded bg-good-soft px-1.5 py-0.5 text-xs font-semibold text-good">Pantalla real</span>
        )}
        <select
          value={shot.disclosure}
          onChange={(e) => set("disclosure", e.target.value as Shot["disclosure"])}
          className="rounded border border-line bg-white px-1.5 py-0.5 text-xs"
          title="Etiquetá las tomas que muestran algo que todavía no existe"
        >
          <option value="none">Real / ya existe</option>
          <option value="concept">Etiqueta: Concepto</option>
          <option value="simulation">Etiqueta: Simulación</option>
        </select>
        <span
          className="ml-auto rounded-md bg-ink px-2 py-1 font-mono text-xs text-white"
          title={`Qué elegir en los controles de ${toolName}`}
        >
          {toolName}: {shot.toolSettings}
        </span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded px-1.5 py-1 text-xs font-semibold text-muted hover:text-ink"
        >
          Plegar
        </button>
      </div>

      <div className="mt-3 grid gap-4 sm:grid-cols-[196px_minmax(0,1fr)]">
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <DropSlot
              accept="image/*"
              empty="Soltá la imagen"
              vertical={vertical}
              onFile={(f) => onUploadImage(shot.index, f)}
              onView={image ? () => setViewing("image") : undefined}
              onRemove={media.image ? () => onRemoveMedia(shot.index, "image") : undefined}
            >
              {image || media.loading ? (
                <>
                  {image && <img src={image} alt="" className="absolute inset-0 size-full object-cover" />}
                  {media.loading && (
                    <span className="absolute inset-0 grid place-items-center bg-white/70 text-muted">
                      <Spinner />
                    </span>
                  )}
                  <span className="absolute top-1 left-1 rounded bg-black/60 px-1 font-mono text-[10px] text-white">
                    IMAGEN
                  </span>
                </>
              ) : undefined}
            </DropSlot>
            <DropSlot
              accept="video/*"
              empty="Soltá el clip"
              vertical={vertical}
              onFile={(f) => onUploadClip(shot.index, f)}
              onView={media.clip ? () => setViewing("clip") : undefined}
              onRemove={media.clip ? () => onRemoveMedia(shot.index, "clip") : undefined}
            >
              {media.clip ? (
                <>
                  <video
                    src={`${media.clip.url}#t=0.1`}
                    muted
                    playsInline
                    preload="metadata"
                    className="absolute inset-0 size-full object-cover"
                  />
                  <span className="absolute top-1 left-1 rounded bg-black/60 px-1 font-mono text-[10px] text-white">CLIP</span>
                </>
              ) : undefined}
            </DropSlot>
          </div>
          {media.clip && <p className="text-xs text-muted">{clipNote(media.clip, shot)}</p>}
          {media.clip && clipMusicNotice(voice.audio, shot.index) && (
            <div className="space-y-1 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900" role="status">
              <p>
                <span className="font-semibold">Este clip parece traer música.</span> La música va aparte, con su licencia;
                si no la tiene, que el clip suene mudo. Es una estimación: puede equivocarse.
              </p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="font-semibold underline" onClick={() => voice.onClipLevel(shot.index, "mute")}>
                  Ponerlo en Mudo
                </button>
                {voice.onClipMusicOk && (
                  <button type="button" className="font-semibold underline" onClick={() => voice.onClipMusicOk?.(shot.index)}>
                    Tiene licencia / no es música
                  </button>
                )}
              </div>
            </div>
          )}
          {!media.clip && !image && setup && shot.kind === "single" && (
            <p className="text-xs text-muted">
              {editFrom > 0
                ? `Partí de la imagen de la toma ${editFrom} y editala; después animala en ${toolName}.`
                : `Primero la imagen (${setup.name}); después animala en ${toolName}.`}
            </p>
          )}
          {!media.clip && shot.kind === "transform" && (
            <p className="text-xs text-muted">
              En {toolName}: cargá la imagen inicial{shot.middlePrompt ? ", la intermedia" : ""} y la final en la barra del
              clip, y pegá el prompt de video.
              {realEnd &&
                (realScreen
                  ? ` La ${realEnd.at === "end" ? "final" : "inicial"} es la captura real de ${realScreen.name}: no se genera con IA.`
                  : ` Falta la pantalla "${realEnd.screen}" en el elenco de la serie.`)}
            </p>
          )}
          {realEnd?.at === "end" && realScreen?.url && (
            <a
              href={realScreen.url}
              download={`${realScreen.id}.png`}
              className="block overflow-hidden rounded-md border border-line text-xs"
              title="Bajala y cargala como imagen final en la barra del clip"
            >
              <img src={realScreen.url} alt="" className="max-h-28 w-full object-contain bg-paper" />
              <span className="block px-2 py-1 font-semibold">Imagen final: {realScreen.name} (bajar)</span>
            </a>
          )}
          {shot.kind === "screen" && (
            <p className="text-xs text-muted">
              {screen ? `Pantalla real: ${screen.name}. No se genera con IA.` : `Falta la pantalla "${shot.screen}" en el elenco de la serie.`}
            </p>
          )}
          {shot.kind === "screen" && screen?.videoUrl && screen.video && (
            <button
              type="button"
              disabled={media.loading || takingVideo}
              onClick={async () => {
                // The recording of the app working, as this shot's clip (the render plays it from its start and cuts it
                // at the shot's length; its own sound follows "Sonido del clip").
                setTakingVideo(true);
                setVideoError("");
                try {
                  const res = await fetch(screen.videoUrl!);
                  if (!res.ok) throw new Error("No se pudo traer el video de la pantalla.");
                  const blob = await res.blob();
                  const ext = screen.video!.file.split(".").pop() ?? "mp4";
                  onUploadClip(shot.index, new File([blob], `${screen.id}-video.${ext}`, { type: blob.type || "video/mp4" }));
                } catch (e) {
                  setVideoError(e instanceof Error ? e.message : "No se pudo traer el video de la pantalla.");
                } finally {
                  setTakingVideo(false);
                }
              }}
              className="w-full rounded-md border border-line py-1 text-xs font-semibold hover:border-ink disabled:opacity-50"
              title={`Usa la grabación de ${screen.name} (${screen.video.seconds.toFixed(1)} s) como clip de esta toma`}
            >
              {takingVideo ? "Trayendo el video…" : `Usar el video de la app como clip (${screen.video.seconds.toFixed(1)} s)`}
            </button>
          )}
          {videoError && <p className="text-xs text-neg">{videoError}</p>}
          <button
            type="button"
            disabled={media.loading || !generatesImage(shot)}
            title={generatesImage(shot) ? undefined : "Es una pantalla real: no se genera con IA"}
            onClick={() => onGenerate(shot.index)}
            className="w-full rounded-md py-1 text-xs font-semibold text-muted hover:bg-black/5 hover:text-ink disabled:opacity-50"
          >
            Generar imagen
          </button>
          {media.error && <p className="text-xs text-neg">{media.error}</p>}
          <ReviewBox review={media.review} onReview={onReview && (media.image || media.clip) ? () => onReview(shot.index) : null} />
          {media.image && shot.kind !== "screen" && <SegmentBox toolName={toolName} onSegment={(note) => onSegment(shot.index, note)} />}
        </div>

        <div className="min-w-0 space-y-3">
          <InFrame
            shot={shot}
            setups={board.setups}
            library={library}
            toolName={toolName}
            maxRefs={props.maxRefs ?? null}
            onChange={(setups) => set("setups", setups)}
          />
          {shot.timeline.length > 0 && (
            <div className="rounded-lg border border-line bg-paper p-2 text-xs">
              <p className="font-semibold">
                Toma continua · el primer cuadro es el hero still; los tiempos van en el prompt de video
              </p>
              <ol className="mt-1 space-y-0.5">
                {shot.timeline.map((b, i) => (
                  <li key={i}>
                    <span className="font-mono text-muted">
                      {b.from.toFixed(1)}–{b.to.toFixed(1)} s
                    </span>{" "}
                    {b.line && (
                      <>
                        <b>{story.characters.find((c) => c.id === b.speaker)?.name ?? b.speaker}</b> ({b.emotion}): “{b.line}” ·{" "}
                      </>
                    )}
                    <span className="text-muted">{b.action}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
          {shot.kind === "transform" && (
            <label className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-semibold text-muted">Pantalla real en la transformación</span>
              <select
                value={shot.screenAt ? `${shot.screenAt}:${shot.screen}` : ""}
                onChange={(e) => {
                  const [at, id] = e.target.value.split(":") as [Shot["screenAt"], string | undefined];
                  setRealScreen(at, id ?? "");
                }}
                className="rounded border border-line bg-white px-1.5 py-0.5"
                title="Una punta del clip puede ser una captura real de la serie (nunca dibujada por IA)"
              >
                <option value="">Ninguna: las dos imágenes con IA</option>
                {screens.map((m) => (
                  <option key={`end:${m.id}`} value={`end:${m.id}`}>
                    Final: pantalla real · {m.name}
                  </option>
                ))}
                {screens.map((m) => (
                  <option key={`start:${m.id}`} value={`start:${m.id}`}>
                    Inicial: pantalla real · {m.name}
                  </option>
                ))}
              </select>
              {screens.length === 0 && <span className="text-muted">(la serie no tiene pantallas reales en el elenco)</span>}
            </label>
          )}
          {shot.kind !== "screen" && realEnd?.at !== "start" && (
            <PromptBox
              label={shot.kind === "transform" ? "Imagen inicial" : "Prompt de imagen"}
              hint={shot.kind === "transform" ? "el Malo, el arranque" : "se hace primero"}
              value={shot.visualPrompt}
              copy={buildCopyPrompt(shot.visualPrompt, brief.format)}
              rows={4}
              still
              onChange={(v) => set("visualPrompt", v)}
            />
          )}
          {editFrom > 0 && shot.kind !== "screen" && realEnd?.at !== "start" && (
            <PromptBox
              label={`Editar la imagen de la toma ${editFrom}`}
              hint="mismo personaje, solo cambia esto"
              value={shot.editPrompt}
              copy={shot.editPrompt}
              rows={2}
              onChange={(v) => set("editPrompt", v)}
            />
          )}
          {shot.kind === "transform" && (
            <>
              <PromptBox
                label="Imagen intermedia (opcional)"
                hint="el giro"
                value={shot.middlePrompt}
                copy={buildCopyPrompt(shot.middlePrompt, brief.format)}
                rows={2}
                still
                onChange={(v) => set("middlePrompt", v)}
              />
              {realEnd?.at !== "end" && (
                <PromptBox
                  label="Imagen final"
                  hint={realEnd ? "la escena a la que sale la pantalla" : "el Bueno, el cierre"}
                  value={shot.endPrompt}
                  copy={buildCopyPrompt(shot.endPrompt, brief.format)}
                  rows={3}
                  still
                  onChange={(v) => set("endPrompt", v)}
                />
              )}
            </>
          )}
          {(shot.kind !== "screen" || shot.videoPrompt) && (
            <PromptBox
              label="Prompt de video"
              hint={
                realEnd
                  ? realEnd.at === "end"
                    ? "de la escena a la pantalla real"
                    : "de la pantalla real a la escena"
                  : shot.kind === "transform"
                    ? "el cambio de una imagen a la otra"
                    : "anima la imagen"
              }
              value={shot.videoPrompt}
              // What is heard inside the clip (the voice row's "Sonido dentro del clip") replaces its "Audio:" line.
              copy={clipPrompt(voice.audio, shot, shot.index)}
              onChange={(v) => set("videoPrompt", v)}
            />
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-semibold text-muted">
                Lo que se dice{who ? <> · <b className={ROLE_TEXT[who.role]}>{who.name}</b></> : ""}
              </span>
              <textarea
                className={`${inputClass} mt-0.5`}
                rows={2}
                value={shot.voiceover}
                onChange={(e) => set("voiceover", e.target.value)}
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-muted" title="Lo que se dice sale solo como subtítulo abajo">
                Headline (arriba)
              </span>
              <input
                className={`${inputClass} mt-0.5`}
                value={shot.onScreenText}
                onChange={(e) => set("onScreenText", e.target.value)}
              />
            </label>
          </div>
          <VoiceRow
            {...voice}
            shot={shot}
            index={shot.index}
            speaker={who}
            voice={media.voice}
            sfx={media.sfx}
          />
          <div className="flex items-end gap-2">
            <label className="block flex-1">
              <span className="text-xs font-semibold text-muted">Nota para la IA</span>
              <input
                className={`${inputClass} mt-0.5`}
                value={note}
                placeholder="ej. que siga a la toma anterior; cambiá la línea: …"
                onChange={(e) => setNote(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && note.trim() && !rewriting) rewrite();
                }}
              />
            </label>
            <Button variant="secondary" disabled={!note.trim() || rewriting} onClick={rewrite}>
              {rewriting ? (
                <>
                  <Spinner /> Reescribiendo…
                </>
              ) : rewriteHandoff ? (
                "Ver un ejemplo"
              ) : (
                "Reescribir prompts"
              )}
            </Button>
          </div>
          {rewriteHandoff && (
            <ClaudeHandoff
              title="Reescribir prompts"
              what={`la toma ${shot.index + 1}`}
              disabled={!note.trim() || rewriting}
              via={{
                ...rewriteHandoff(shot.index, note.trim()),
                paste: async (reply) => {
                  if (await rewriteHandoff(shot.index, note.trim()).paste(reply)) setNote("");
                },
              }}
            />
          )}
        </div>
      </div>
    </li>
  );
}

// "Cambiar un solo objeto": the tool's segments edit one thing in the existing image and keep the rest.
function SegmentBox({ toolName, onSegment }: { toolName: string; onSegment: (note: string) => Promise<SegmentEdit> }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SegmentEdit | null>(null);
  const [error, setError] = useState("");
  async function ask() {
    setBusy(true);
    setError("");
    try {
      setResult(await onSegment(note.trim()));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="text-xs">
      <summary className="cursor-pointer font-semibold text-muted hover:text-ink">Cambiar un solo objeto</summary>
      <div className="mt-1.5 space-y-1.5">
        <p className="text-muted">Con los segmentos de {toolName}: elegís un objeto y cambiás solo eso.</p>
        <input
          className={`${inputClass} py-1 text-xs`}
          placeholder="ej. cambiá solo el yogur vencido por uno fresco"
          aria-label="Qué cambiar"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && note.trim() && !busy) ask();
          }}
        />
        <Button variant="secondary" className="w-full px-2 py-1 text-xs" disabled={!note.trim() || busy} onClick={ask}>
          {busy ? <Spinner /> : null} Armar el segmento
        </Button>
        {error && <p className="text-neg">{error}</p>}
        {result && (
          <div className="space-y-1 rounded-md bg-paper p-2">
            <p>
              <b>Seleccioná:</b> {result.select}
            </p>
            <p className="font-mono">{result.prompt}</p>
            <CopyButton text={result.prompt} idle="Copiar prompt" variant="secondary" />
            {result.note && <p className="text-muted">{result.note}</p>}
          </div>
        )}
      </div>
    </details>
  );
}

function ReviewBox({ review, onReview }: { review?: ReviewState; onReview: (() => void) | null }) {
  const failed = review?.result?.checks.filter((c) => !c.pass) ?? [];
  return (
    <div className="space-y-1.5 text-xs">
      {review?.loading && (
        <p className="flex items-center gap-1.5 text-muted">
          <Spinner /> La IA está mirando {review.what === "clip" ? "el clip" : "la imagen"}…
        </p>
      )}
      {review?.format && <p className="rounded-md bg-amber-100 px-2 py-1 text-amber-900">{review.format}</p>}
      {review?.error && <p className="text-neg">No se pudo revisar: {review.error}</p>}
      {review?.result && !review.loading && (
        <div className={`rounded-md px-2 py-1.5 ${failed.length ? "bg-neg-soft" : "bg-good-soft"}`}>
          <p className={`font-semibold ${failed.length ? "text-neg" : "text-good"}`}>
            {failed.length
              ? `Revisión de la IA: ${failed.length} problema${failed.length === 1 ? "" : "s"}`
              : "Revisión de la IA: no ve problemas"}
          </p>
          <ul className="mt-1 space-y-0.5">
            {review.result.checks.map((c, i) => (
              <li key={i} className={c.pass ? "text-muted" : ""}>
                {c.pass ? "✓" : "✗"} <b>{c.item}</b>
                {c.note ? `: ${c.note}` : ""}
              </li>
            ))}
          </ul>
          {review.result.fixPrompt && (
            <div className="mt-1.5 space-y-1">
              <p className="text-muted">Prompt de edición para corregirlo:</p>
              <p className="font-mono">{review.result.fixPrompt}</p>
              <CopyButton text={review.result.fixPrompt} idle="Copiar prompt de edición" variant="secondary" />
            </div>
          )}
        </div>
      )}
      {onReview && !review?.loading && (
        <button type="button" onClick={onReview} className="font-semibold text-muted hover:text-ink">
          {review?.result ? "Revisar de nuevo con IA" : "Revisar con IA"}
        </button>
      )}
    </div>
  );
}

type Props = Omit<CardProps, "shot" | "media"> & { media: Record<number, MediaState>; strictLook: boolean };

export function ScriptView({ strictLook, ...props }: Props) {
  return (
    <StrictLook.Provider value={strictLook}>
      <ol className="space-y-3">
        {timeShots(props.board.shots).map((shot) => (
          <ShotCard key={shot.index} {...props} shot={shot} media={props.media[shot.index] ?? {}} />
        ))}
      </ol>
    </StrictLook.Provider>
  );
}

export function DirectionLog({ log }: { log: LogEntry[] }) {
  return (
    <div className="space-y-2 rounded-xl border border-line bg-white p-4">
      <p className="text-sm font-semibold">Registro de dirección</p>
      {log.length === 0 && (
        <p className="text-xs text-muted">Tus notas y lo que subís queda anotado acá y se exporta con el guion.</p>
      )}
      <ul className="max-h-64 space-y-2 overflow-y-auto">
        {log.map((e, i) => (
          <li key={i} className="text-xs">
            <span className="font-mono text-muted">
              {formatElapsed(e.at)}
              {e.shot === undefined ? "" : ` · toma ${e.shot + 1}`}
            </span>{" "}
            {e.text}
            {e.outcome && <span className="block text-muted">→ {e.outcome}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function StoryNotes({ story }: { story: Story }) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-line bg-white p-4">
        <p className="text-sm font-semibold">Callbacks</p>
        <ul className="mt-1 space-y-1 text-sm text-muted">
          {story.callbacks.map((c, i) => (
            <li key={i}>
              {c.planted} → {c.payoff}
            </li>
          ))}
        </ul>
      </div>
      <div className="rounded-xl border border-line bg-white p-4">
        <p className="text-sm font-semibold">Checklist</p>
        <ul className="mt-2 space-y-2">
          {story.checklist.map((c) => (
            <li key={c.item} className="flex gap-2 text-sm">
              <span className={`mt-0.5 font-bold ${c.pass ? "text-good" : "text-neg"}`}>{c.pass ? "✓" : "✗"}</span>
              <span>
                <span className="font-medium">{c.item}</span>
                <span className="block text-xs text-muted">{c.note}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
      {story.verify.length > 0 && (
        <div className="rounded-xl border border-neg/30 bg-neg-soft p-4">
          <p className="text-sm font-semibold text-neg">Verificar antes de publicar</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {story.verify.map((v) => (
              <li key={v}>{v}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
