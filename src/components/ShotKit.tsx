// "Bajar kit de la toma": one .zip with the paste-ready prompt (references numbered), the first frame, the cast's
// pictures in order and the shot's voice for lip sync, for making the clip by hand in Replicate's or APIMart's web
// form. The zip is built only when the person clicks (src/lib/shotKit.ts loads then).
import { useState } from "react";
import type { KitPicture, KitVoice } from "../../shared/shotKit.ts";
import type { ShotKitInput } from "../lib/shotKit.ts";

type Props = Omit<ShotKitInput, "voice" | "pictures"> & {
  pictures: KitPicture[];
  voice: (KitVoice & { blob: Blob }) | null;
};

export function ShotKit(props: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  async function run() {
    setBusy(true);
    setError("");
    setDone("");
    try {
      const { buildShotKit, downloadBlob } = await import("../lib/shotKit.ts");
      const kit = await buildShotKit(props);
      downloadBlob(kit.zip, kit.name);
      setDone(`Listo: ${kit.name} (${kit.files} archivos). Seguí los pasos de LEEME.txt.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo armar el kit.");
    } finally {
      setBusy(false);
    }
  }

  const parts = [
    props.firstFrame ? "imagen de inicio" : null,
    props.pictures.length ? `${props.pictures.length} referencia${props.pictures.length === 1 ? "" : "s"}` : null,
    props.voice ? "la voz para el lip sync" : null,
  ].filter(Boolean);

  return (
    <div className="space-y-1 text-xs">
      <button
        type="button"
        disabled={busy}
        onClick={() => void run()}
        className="w-full rounded-md border border-line py-1 font-semibold hover:border-ink disabled:opacity-50"
        title="Para hacer el clip a mano en Replicate o APIMart: prompt listo, imágenes numeradas y la voz de la toma"
      >
        {busy ? "Armando el kit…" : "Bajar kit de la toma (.zip)"}
      </button>
      <p className="text-muted">
        Prompt listo{parts.length ? `, ${parts.join(", ")}` : ""}.
        {!props.voice && props.voiceHint ? ` ${props.voiceHint}` : ""}
      </p>
      {done && <p className="text-good">{done}</p>}
      {error && <p className="text-neg">{error}</p>}
    </div>
  );
}
