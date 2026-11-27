// "Bajar kit de la toma": one .zip with the paste-ready prompt (references numbered), the first frame, the cast's
// pictures in order and the shot's voice for lip sync, for making the clip by hand in a web form (Replicate, APIMart,
// Higgsfield). "Probar otra versión del prompt" downloads the same kit with a version B of the video prompt, to compare
// the two fairly. "Bajar kit de lip sync" packs the shot's clip and its voice for a lip-sync tool. The zips are built
// only when the person clicks (src/lib/shotKit.ts loads then).
import { useState } from "react";
import { PROMPT_TEST_STEPS, type KitPicture, type KitVoice } from "../../shared/shotKit.ts";
import type { ShotKitInput } from "../lib/shotKit.ts";

type Props = Omit<ShotKitInput, "voice" | "pictures" | "variant"> & {
  pictures: KitPicture[];
  voice: (KitVoice & { blob: Blob }) | null;
  // The shot's clip, when there is one: the lip-sync kit carries it.
  clip?: { blob: Blob; name: string } | null;
  // A prompt test edits the shot's own video prompt (rawPrompt); prepare turns it into what the kit sends, the same way
  // as the shot's (its sound line, Grok's spoken line). "Ganó la B" makes the edit the shot's video prompt.
  rawPrompt: string;
  prepare: (raw: string) => string;
  onUseVariant?: (prompt: string) => void;
};

const message = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

export function ShotKit(props: Props) {
  const { clip, onUseVariant, rawPrompt, prepare, ...kit } = props;
  const [busy, setBusy] = useState<"" | "A" | "B" | "lipsync">("");
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [testing, setTesting] = useState(false);
  const [variant, setVariant] = useState(rawPrompt);

  async function run(which: "A" | "B" | "lipsync") {
    setBusy(which);
    setError("");
    setDone("");
    try {
      const lib = await import("../lib/shotKit.ts");
      if (which === "lipsync") {
        if (!clip || !kit.voice) return;
        const pack = await lib.buildLipSyncKit({ shotIndex: kit.shotIndex, title: kit.title, seconds: kit.seconds, clip: clip.blob, clipName: clip.name, voice: kit.voice.blob });
        lib.downloadBlob(pack.zip, pack.name);
        setDone(`Listo: ${pack.name}. Seguí los pasos de LEEME.txt.`);
        return;
      }
      const pack = await lib.buildShotKit(which === "B" ? { ...kit, videoPrompt: prepare(variant), variant: "B" } : kit);
      lib.downloadBlob(pack.zip, pack.name);
      setDone(`Listo: ${pack.name} (${pack.files} archivos). Seguí los pasos de LEEME.txt.`);
    } catch (e) {
      setError(message(e, "No se pudo armar el kit."));
    } finally {
      setBusy("");
    }
  }

  const parts = [
    kit.firstFrame ? "imagen de inicio" : null,
    kit.pictures.length ? `${kit.pictures.length} referencia${kit.pictures.length === 1 ? "" : "s"}` : null,
    kit.voice ? "la voz para el lip sync" : null,
  ].filter(Boolean);
  const changed = Boolean(variant.trim()) && variant.trim() !== rawPrompt.trim();

  return (
    <div className="space-y-1 text-xs">
      <button
        type="button"
        disabled={Boolean(busy)}
        onClick={() => void run("A")}
        className="w-full rounded-md border border-line py-1 font-semibold hover:border-ink disabled:opacity-50"
        title="Para hacer el clip a mano en Replicate, APIMart o Higgsfield: prompt listo, imágenes numeradas y la voz de la toma"
      >
        {busy === "A" ? "Armando el kit…" : "Bajar kit de la toma (.zip)"}
      </button>
      <p className="text-muted">
        Prompt listo{parts.length ? `, ${parts.join(", ")}` : ""}.
        {!kit.voice && kit.voiceHint ? ` ${kit.voiceHint}` : ""}
      </p>
      {clip && kit.voice && (
        <button
          type="button"
          disabled={Boolean(busy)}
          onClick={() => void run("lipsync")}
          className="w-full rounded-md border border-line py-1 font-semibold hover:border-ink disabled:opacity-50"
          title="El clip de la toma y su voz, para una herramienta de lip sync (Kling LipSync, sync.so…) cuando la boca no sigue la voz"
        >
          {busy === "lipsync" ? "Armando el kit…" : "Bajar kit de lip sync (.zip)"}
        </button>
      )}
      {!testing ? (
        <button
          type="button"
          className="font-semibold text-muted underline hover:text-ink"
          onClick={() => {
            setVariant(rawPrompt);
            setTesting(true);
          }}
        >
          Probar otra versión del prompt…
        </button>
      ) : (
        <div className="space-y-1 rounded-md border border-line bg-paper p-1.5">
          <p className="font-semibold">Versión B del prompt de video</p>
          <textarea
            aria-label="Versión B del prompt de video"
            className="block w-full resize-y rounded border border-line bg-white px-2 py-1 text-xs"
            rows={5}
            value={variant}
            onChange={(e) => setVariant(e.target.value)}
          />
          <ul className="list-disc space-y-0.5 pl-4 text-muted">
            {PROMPT_TEST_STEPS.slice(0, 2).map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={Boolean(busy) || !changed}
              onClick={() => void run("B")}
              className="rounded bg-ink px-2 py-0.5 font-semibold text-white disabled:opacity-50"
              title={changed ? undefined : "Cambiá algo del prompt para probar la versión B"}
            >
              {busy === "B" ? "Armando…" : "Bajar kit B (.zip)"}
            </button>
            {onUseVariant && (
              <button
                type="button"
                disabled={!changed}
                onClick={() => {
                  onUseVariant(variant.trim());
                  setTesting(false);
                }}
                className="font-semibold underline disabled:opacity-50"
                title="Ganó la B: pasa a ser el prompt de video de la toma"
              >
                Ganó la B: usarla en la toma
              </button>
            )}
            <button type="button" className="text-muted underline" onClick={() => setTesting(false)}>
              cerrar
            </button>
          </div>
        </div>
      )}
      {done && <p className="text-good">{done}</p>}
      {error && <p className="text-neg">{error}</p>}
    </div>
  );
}
