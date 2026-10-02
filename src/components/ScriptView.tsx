import { useRef, useState } from "react";
import { buildCopyPrompt } from "../../shared/prompt.ts";
import type { Brief, Script, Shot } from "../../shared/schema.ts";
import { TEMPLATE, TOTAL_SECONDS, formatTime, timeShots } from "../../shared/template.ts";
import { copyText } from "../lib/files.ts";
import { SectionChip, Spinner, inputClass } from "./ui.tsx";

export type ImageState = { url?: string; loading?: boolean; error?: string };

type Props = {
  brief: Brief;
  script: Script;
  images: Record<number, ImageState>;
  onShotChange: (index: number, shot: Shot) => void;
  onGenerate: (index: number) => void;
  onUpload: (index: number, file: File) => void;
};

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
        <span>0:00 Negative</span>
        <span>0:25 Touching</span>
        <span>0:40 Good</span>
        <span>1:15</span>
      </div>
    </div>
  );
}

function ShotImage({
  image,
  vertical,
  copyPrompt,
  onGenerate,
  onUpload,
}: {
  image: ImageState;
  vertical: boolean;
  copyPrompt: string;
  onGenerate: () => void;
  onUpload: (file: File) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [copied, setCopied] = useState<"" | "yes" | "error">("");

  async function copy() {
    try {
      await copyText(copyPrompt);
      setCopied("yes");
    } catch {
      setCopied("error");
    }
    setTimeout(() => setCopied(""), 1600);
  }

  const action = "w-full rounded-md py-1 text-xs font-semibold text-muted hover:bg-black/5 hover:text-ink disabled:opacity-50";

  return (
    <div className={`shrink-0 ${vertical ? "w-24 sm:w-32" : "w-32 sm:w-48"}`}>
      <button
        type="button"
        onClick={() => fileInput.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) onUpload(file);
        }}
        title="Click or drop an image here"
        className={`relative block w-full overflow-hidden rounded-lg border-2 border-dashed bg-paper ${
          dragging ? "border-ink" : image.url ? "border-transparent" : "border-line"
        } ${vertical ? "aspect-[9/16]" : "aspect-video"}`}
      >
        {image.url && <img src={image.url} alt="" className="absolute inset-0 size-full object-cover" />}
        {image.loading && (
          <span className="absolute inset-0 grid place-items-center bg-white/70 text-muted">
            <Spinner />
          </span>
        )}
        {!image.url && !image.loading && (
          <span className="absolute inset-0 grid place-items-center p-2 text-center text-xs text-muted">
            Drop or click to upload
          </span>
        )}
      </button>
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onUpload(file);
          e.target.value = "";
        }}
      />
      <div className="mt-1 space-y-0.5">
        <button type="button" onClick={copy} className={action}>
          {copied === "yes" ? "Copied ✓" : copied === "error" ? "Copy failed" : "Copy prompt"}
        </button>
        <button type="button" onClick={() => fileInput.current?.click()} className={action}>
          {image.url ? "Replace image" : "Upload image"}
        </button>
        <button type="button" disabled={image.loading} onClick={onGenerate} className={action}>
          Generate
        </button>
      </div>
      {image.error && <p className="mt-1 text-xs text-neg">{image.error}</p>}
    </div>
  );
}

export function ScriptView({ brief, script, images, onShotChange, onGenerate, onUpload }: Props) {
  const vertical = brief.format === "vertical";
  return (
    <ol className="space-y-3">
      {timeShots(script.shots).map((shot) => {
        const image = images[shot.index] ?? {};
        const set = <K extends keyof Shot>(key: K, value: Shot[K]) => onShotChange(shot.index, { ...shot, [key]: value });
        return (
          <li key={shot.index} className="flex gap-4 rounded-xl border border-line bg-white p-3 sm:p-4">
            <ShotImage
              image={image}
              vertical={vertical}
              copyPrompt={buildCopyPrompt(shot.visualPrompt, script.style, brief.format)}
              onGenerate={() => onGenerate(shot.index)}
              onUpload={(file) => onUpload(shot.index, file)}
            />

            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs text-muted">
                  {formatTime(shot.start)}–{formatTime(shot.end)}
                </span>
                <SectionChip section={shot.section} />
                <select
                  value={shot.disclosure}
                  onChange={(e) => set("disclosure", e.target.value as Shot["disclosure"])}
                  className="ml-auto rounded border border-line bg-white px-1.5 py-0.5 text-xs"
                  title="Label shots that show anything not shipped today"
                >
                  <option value="none">Real / shipped</option>
                  <option value="concept">Label: Concept</option>
                  <option value="simulation">Label: Simulation</option>
                </select>
              </div>
              <label className="block">
                <span className="text-xs font-semibold text-muted">Voiceover</span>
                <textarea
                  className={`${inputClass} mt-0.5 font-medium`}
                  rows={2}
                  value={shot.voiceover}
                  onChange={(e) => set("voiceover", e.target.value)}
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-muted">On screen</span>
                <input
                  className={`${inputClass} mt-0.5`}
                  value={shot.onScreenText}
                  onChange={(e) => set("onScreenText", e.target.value)}
                />
              </label>
              <details>
                <summary className="cursor-pointer text-xs font-semibold text-muted hover:text-ink">Image prompt</summary>
                <textarea
                  className={`${inputClass} mt-1 text-xs`}
                  rows={3}
                  value={shot.visualPrompt}
                  onChange={(e) => set("visualPrompt", e.target.value)}
                />
              </details>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function ScriptNotes({ script }: { script: Script }) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-line bg-white p-4">
        <p className="text-sm font-semibold">Callback</p>
        <p className="mt-1 text-sm text-muted">
          Planted: “{script.callback.planted}”
          <br />
          Payoff: {script.callback.payoff}
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
          <p className="text-sm font-semibold text-neg">Verify before it ships</p>
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
