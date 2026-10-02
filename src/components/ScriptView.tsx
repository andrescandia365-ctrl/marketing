import { useRef, useState } from "react";
import { buildCopyPrompt } from "../../shared/prompt.ts";
import type { Brief, Script, Shot } from "../../shared/schema.ts";
import { TEMPLATE, TOTAL_SECONDS, formatTime, timeShots, type TimedShot } from "../../shared/template.ts";
import { copyText } from "../lib/files.ts";
import { formatElapsed, type LogEntry } from "../lib/markdown.ts";
import { Button, SectionChip, Spinner, inputClass } from "./ui.tsx";

export type ClipFile = { url: string; blob: Blob; name: string; duration: number };
export type MediaState = { image?: string; clip?: ClipFile; loading?: boolean; error?: string };

const BAR = { negative: "bg-neg", touching: "bg-touch", good: "bg-good" };

export function Timeline({ script }: { script: Script }) {
  const shots = timeShots(script.shots);
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full">
        {shots.map((s) => (
          <div
            key={s.index}
            className={`${BAR[TEMPLATE[s.section].beat]} border-r border-white/70 last:border-r-0`}
            style={{ width: `${((s.end - s.start) / TOTAL_SECONDS) * 100}%` }}
            title={`${TEMPLATE[s.section].label} ${formatTime(s.start)}–${formatTime(s.end)}`}
          />
        ))}
      </div>
      <div className="mt-1.5 flex justify-between font-mono text-xs text-muted">
        <span>0:00 Negativo</span>
        <span>0:25 Emotivo</span>
        <span>0:40 Bueno</span>
        <span>1:15</span>
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

// A drop zone that also opens the file picker on click.
function DropSlot({
  accept,
  empty,
  vertical,
  onFile,
  children,
}: {
  accept: string;
  empty: string;
  vertical: boolean;
  onFile: (file: File) => void;
  children?: React.ReactNode;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => input.current?.click()}
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
        title="Hacé clic o soltá un archivo acá"
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
    </>
  );
}

function clipNote(clip: ClipFile, shot: TimedShot): string {
  const need = shot.end - shot.start;
  if (clip.duration >= need - 0.05) {
    return `Clip de ${clip.duration.toFixed(1)} s → se usan ${need.toFixed(1)} s.`;
  }
  return `Clip de ${clip.duration.toFixed(1)} s y la toma dura ${need.toFixed(1)} s: el último cuadro se sostiene ${(need - clip.duration).toFixed(1)} s. Podés alargarlo con Extend.`;
}

type CardProps = {
  brief: Brief;
  script: Script;
  shot: TimedShot;
  media: MediaState;
  toolName: string;
  onShotChange: (index: number, shot: Shot) => void;
  onGenerate: (index: number) => void;
  onUploadImage: (index: number, file: File) => void;
  onUploadClip: (index: number, file: File) => void;
  onRewrite: (index: number, note: string) => Promise<boolean>;
};

function ShotCard(props: CardProps) {
  const { brief, script, shot, media, toolName, onShotChange, onGenerate, onUploadImage, onUploadClip, onRewrite } = props;
  const [open, setOpen] = useState(true);
  const [note, setNote] = useState("");
  const [rewriting, setRewriting] = useState(false);
  const vertical = brief.format === "vertical";
  const setup = script.setups.find((s) => s.id === shot.setup);
  const set = <K extends keyof Shot>(key: K, value: Shot[K]) => onShotChange(shot.index, { ...shot, [key]: value });
  const words = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;

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
          <SectionChip section={shot.section} />
          <span className="min-w-0 flex-1 truncate">{shot.onScreenText ? `“${shot.onScreenText}”` : shot.voiceover}</span>
          <span className="text-xs text-muted">Setup {shot.setup}</span>
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

  return (
    <li className="rounded-xl border border-line bg-white p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs text-muted">
          Toma {shot.index + 1} · {formatTime(shot.start)}–{formatTime(shot.end)}
        </span>
        <SectionChip section={shot.section} />
        <span className="rounded border border-line px-1.5 py-0.5 text-xs font-medium">
          Setup {shot.setup}
          {setup ? ` · ${setup.name}` : ""}
        </span>
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
            <DropSlot accept="image/*" empty="Soltá la imagen" vertical={vertical} onFile={(f) => onUploadImage(shot.index, f)}>
              {media.image || media.loading ? (
                <>
                  {media.image && <img src={media.image} alt="" className="absolute inset-0 size-full object-cover" />}
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
            <DropSlot accept="video/*" empty="Soltá el clip" vertical={vertical} onFile={(f) => onUploadClip(shot.index, f)}>
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
          {!media.clip && !media.image && setup && (
            <p className="text-xs text-muted">
              Primero la imagen (setup {setup.id}); después animala en {toolName}.
            </p>
          )}
          <button
            type="button"
            disabled={media.loading}
            onClick={() => onGenerate(shot.index)}
            className="w-full rounded-md py-1 text-xs font-semibold text-muted hover:bg-black/5 hover:text-ink disabled:opacity-50"
          >
            Generar imagen
          </button>
          {media.error && <p className="text-xs text-neg">{media.error}</p>}
        </div>

        <div className="min-w-0 space-y-3">
          <div className="overflow-hidden rounded-lg border border-line">
            <div className="flex items-center justify-between gap-2 border-b border-line bg-paper py-1.5 pr-1.5 pl-3">
              <span className="text-xs font-semibold">
                Prompt de imagen{" "}
                <span className="font-normal text-muted">· {words(shot.visualPrompt)} palabras · se hace primero</span>
              </span>
              <CopyButton text={buildCopyPrompt(shot.visualPrompt, brief.format)} />
            </div>
            <textarea
              aria-label="Prompt de imagen"
              className="block w-full resize-y border-0 px-3 py-2 text-sm outline-none"
              rows={4}
              value={shot.visualPrompt}
              onChange={(e) => set("visualPrompt", e.target.value)}
            />
          </div>
          <div className="overflow-hidden rounded-lg border border-line">
            <div className="flex items-center justify-between gap-2 border-b border-line bg-paper py-1.5 pr-1.5 pl-3">
              <span className="text-xs font-semibold">
                Prompt de video{" "}
                <span className="font-normal text-muted">· {words(shot.videoPrompt)} palabras · anima la imagen</span>
              </span>
              <CopyButton text={shot.videoPrompt} />
            </div>
            <textarea
              aria-label="Prompt de video"
              className="block w-full resize-y border-0 px-3 py-2 text-sm outline-none"
              rows={3}
              value={shot.videoPrompt}
              onChange={(e) => set("videoPrompt", e.target.value)}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-semibold text-muted">Locución (va encima)</span>
              <textarea
                className={`${inputClass} mt-0.5`}
                rows={2}
                value={shot.voiceover}
                onChange={(e) => set("voiceover", e.target.value)}
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-muted">Texto en pantalla</span>
              <input
                className={`${inputClass} mt-0.5`}
                value={shot.onScreenText}
                onChange={(e) => set("onScreenText", e.target.value)}
              />
            </label>
          </div>
          <div className="flex items-end gap-2">
            <label className="block flex-1">
              <span className="text-xs font-semibold text-muted">Nota para Claude</span>
              <input
                className={`${inputClass} mt-0.5`}
                value={note}
                placeholder="ej. la góndola se ve demasiado moderna"
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
              ) : (
                "Reescribir prompts"
              )}
            </Button>
          </div>
        </div>
      </div>
    </li>
  );
}

type Props = Omit<CardProps, "shot" | "media"> & { media: Record<number, MediaState> };

export function ScriptView(props: Props) {
  return (
    <ol className="space-y-3">
      {timeShots(props.script.shots).map((shot) => (
        <ShotCard key={shot.index} {...props} shot={shot} media={props.media[shot.index] ?? {}} />
      ))}
    </ol>
  );
}

export function SetupsPanel({
  script,
  media,
  toolName,
}: {
  script: Script;
  media: Record<number, MediaState>;
  toolName: string;
}) {
  if (!script.setups.length) return null;
  const shots = timeShots(script.shots);
  return (
    <div className="space-y-3 rounded-xl border border-line bg-white p-4">
      <div>
        <p className="text-sm font-semibold">Setups · una imagen principal por cada uno</p>
        <p className="mt-1 text-xs text-muted">
          {toolName} mantiene igual a una persona o un lugar gracias a la imagen, no a las palabras. Hacé la imagen
          principal una vez y reusala (o adjuntala como referencia) en cada toma del setup.
        </p>
      </div>
      <ul className="space-y-3">
        {script.setups.map((s) => {
          const inSetup = shots.filter((sh) => sh.setup === s.id);
          const hero = inSetup.some((sh) => media[sh.index]?.image);
          return (
            <li key={s.id} className="grid grid-cols-[28px_minmax(0,1fr)] gap-x-2 text-sm">
              <span className="grid size-7 place-items-center rounded-md bg-ink text-xs font-bold text-white">{s.id}</span>
              <div className="min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{s.name}</span>
                  <span className={`font-mono text-xs ${hero ? "text-good" : "text-muted"}`}>
                    {hero ? "imagen ✓" : "falta imagen"}
                  </span>
                </div>
                <p className="text-xs text-muted">
                  Tomas {inSetup.map((sh) => sh.index + 1).join(", ") || "—"} · “{s.identity}”
                </p>
                <div className="mt-1">
                  <CopyButton text={s.identity} idle="Copiar descripción" variant="secondary" />
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
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

export function ScriptNotes({ script }: { script: Script }) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-line bg-white p-4">
        <p className="text-sm font-semibold">Callback</p>
        <p className="mt-1 text-sm text-muted">
          Se siembra: “{script.callback.planted}”
          <br />
          Se paga: {script.callback.payoff}
        </p>
      </div>
      <div className="rounded-xl border border-line bg-white p-4">
        <p className="text-sm font-semibold">Checklist</p>
        <ul className="mt-2 space-y-2">
          {script.checklist.map((c) => (
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
      {script.verify.length > 0 && (
        <div className="rounded-xl border border-neg/30 bg-neg-soft p-4">
          <p className="text-sm font-semibold text-neg">Verificar antes de publicar</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {script.verify.map((v) => (
              <li key={v}>{v}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
