// "Generar clip": the same prompt the person would copy, sent to a video model by API (Modelos: xAI or fal.ai).
// It shows what it will cost before it runs, follows the job, and hands the file to the slot's own upload, so a
// generated clip lands exactly where an uploaded one would.
import { useEffect, useRef, useState } from "react";
import { costText, estimateCost, mediaProviderId, needsImage, pickDuration, usesImage, type MediaModelInfo } from "../../shared/mediaModels.ts";
import { api } from "../lib/api.ts";
import { Button, Spinner } from "./ui.tsx";

const PICK_KEY = "generar-clip-modelo";

function readPick(): string {
  try {
    return localStorage.getItem(PICK_KEY) ?? "";
  } catch {
    return "";
  }
}
function savePick(id: string) {
  try {
    localStorage.setItem(PICK_KEY, id);
  } catch {
    /* private window: the pick is only for this page */
  }
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

type Props = {
  models: MediaModelInfo[] | undefined;
  prompt: string;
  // The clip length the slot asks for (6, 10 or 15 s); the model gets the nearest length it accepts.
  seconds: number;
  aspect: "vertical" | "horizontal";
  // The start frame, when there is one: what it is (shown) and how to get it as a data URL.
  start?: { label: string; get: () => Promise<string> } | null;
  // Why it cannot run now (an unconfirmed claim, an empty prompt); null when it can.
  blocked?: string | null;
  defaultAudio?: boolean;
  fileName: string;
  onFile: (file: File) => Promise<void> | void;
};

export function GenerateClip({ models, prompt, seconds, aspect, start, blocked, defaultAudio = false, fileName, onFile }: Props) {
  const video = (models ?? []).filter((m) => m.kind === "video");
  const ready = video.filter((m) => m.available);
  const [pick, setPick] = useState(readPick);
  const [audio, setAudio] = useState(defaultAudio);
  const [resolution, setResolution] = useState<"480p" | "720p">("480p");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const alive = useRef(true);
  // Set again on every mount: React's development mode mounts twice, and a stale false would hide the result.
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  if (!video.length) return null;
  if (!ready.length) {
    return <p className="text-[11px] text-muted">Para generar el clip acá, cargá la clave de xAI o de fal.ai en Modelos.</p>;
  }
  const model = ready.find((m) => mediaProviderId(m) === pick) ?? ready[0];
  const length = pickDuration(model.seconds ?? [], seconds);
  const cost = estimateCost(model, length);
  const missingImage = needsImage(model) && !start;
  const reason = blocked || (!prompt.trim() ? "Falta el prompt de video." : missingImage ? `${model.label} necesita una imagen de inicio: subí o generá la imagen primero.` : null);

  async function run() {
    setBusy(true);
    setError("");
    setProgress(0);
    try {
      const image = start && usesImage(model, true) ? await start.get() : undefined;
      const job = await api.videoStart({
        provider: model.provider,
        model: model.model,
        prompt,
        seconds: length,
        aspect,
        image,
        audio,
        ...(model.provider === "xai" ? { resolution } : {}),
      });
      // A clip that has not come back in 20 minutes is given up here (the provider may still bill it).
      for (const until = Date.now() + 20 * 60_000; ; ) {
        if (Date.now() > until) throw new Error("El clip tardó más de 20 minutos. Probá de nuevo o con otro modelo.");
        await new Promise((r) => setTimeout(r, 3000));
        if (!alive.current) return;
        const s = await api.videoStatus(job.id);
        setProgress(s.progress);
        if (s.status === "failed") throw new Error(s.error || "El video falló.");
        if (s.status === "done") break;
      }
      const blob = await api.videoFile(job.id);
      await onFile(new File([blob], fileName, { type: "video/mp4" }));
    } catch (e) {
      if (alive.current) setError(message(e));
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <select
        className="rounded border border-line bg-white px-1 py-0.5"
        value={mediaProviderId(model)}
        disabled={busy}
        onChange={(e) => {
          setPick(e.target.value);
          savePick(e.target.value);
        }}
        aria-label="Modelo de video"
      >
        {ready.map((m) => (
          <option key={mediaProviderId(m)} value={mediaProviderId(m)}>
            {m.label} · {costText(m.price)}/s
          </option>
        ))}
      </select>
      {model.provider === "xai" && (
        <select className="rounded border border-line bg-white px-1 py-0.5" value={resolution} disabled={busy} onChange={(e) => setResolution(e.target.value as "480p" | "720p")} aria-label="Resolución">
          <option value="480p">480p (probar)</option>
          <option value="720p">720p</option>
        </select>
      )}
      <label className="flex items-center gap-1">
        <input type="checkbox" checked={audio} disabled={busy} onChange={(e) => setAudio(e.target.checked)} />
        Con sonido
      </label>
      <Button variant="secondary" className="px-2 py-0.5 text-xs" onClick={() => void run()} disabled={busy || Boolean(reason)}>
        {busy ? (
          <>
            <Spinner /> {progress ? `${progress}%` : "Generando…"}
          </>
        ) : (
          `Generar clip (${length} s, ≈ ${costText(cost)})`
        )}
      </Button>
      {start && usesImage(model, true) && !busy && <span className="text-muted">arranca de {start.label}</span>}
      {model.input === "texto" && start && <span className="text-muted">este modelo no usa imagen de inicio</span>}
      {reason && !busy && <span className="text-muted">{reason}</span>}
      {error && <span className="basis-full text-neg">{error}</span>}
    </div>
  );
}
