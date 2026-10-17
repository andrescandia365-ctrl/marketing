// "Escenas metáfora": one simple picture made with Grok that explains an idea, with the scene's title as its line.
// The scene carries what Grok draws (and, optionally, how the still moves), written by the writer or by Opus in
// claude.ai by copy and paste; the person copies the prompt, makes the picture in Grok and uploads it (or the clip)
// into the scene. Until then the preview shows a placeholder with the prompt and the render stops.
import { useState } from "react";
import { METAPHOR_SETTINGS, emptyMetaphor, isMetaphorAsset, type SceneMetaphor } from "../../shared/metaphor.ts";
import type { MotionScene } from "../../shared/motion.ts";
import { Button, inputClass } from "./ui.tsx";

export type MetaphorTools = {
  // The full prompts for Grok (the series look and the cast's @refs added), and the request for Opus.
  imagePrompt: (scene: MotionScene) => string;
  videoPrompt: (scene: MotionScene) => string;
  opusPrompt: (scene: MotionScene) => string;
  // Opus's pasted reply, read into the scene's metaphor.
  parse: (reply: string) => { metaphor: SceneMetaphor } | { error: string };
  // The cast the picture may call by @ref.
  cast: { id: string; label: string }[];
  // What the scene has uploaded: the still, the clip.
  has: (asset: string) => { image: boolean; clip: boolean };
  upload: (sceneId: string, file: File) => Promise<void>;
  remove: (sceneId: string) => Promise<void>;
  // "Copiar todos los prompts de metáforas": every metaphor scene's prompts in order.
  batch: () => string;
};

// "Copiar todos los prompts de metáforas", for the scene list's header (only when the piece has metaphor scenes).
export function MetaphorBatchButton({ tools, count }: { tools: MetaphorTools; count: number }) {
  const [shown, setShown] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  async function copy() {
    const text = tools.batch();
    try {
      await navigator.clipboard.writeText(text);
      setStatus(`Copiados los prompts de ${count} metáfora${count === 1 ? "" : "s"}.`);
      setShown(null);
    } catch {
      setShown(text);
      setStatus("No pude copiar solo: seleccioná el texto de abajo y copialo.");
    }
  }
  return (
    <span className="flex flex-col items-end gap-1">
      <Button variant="ghost" className="px-3 py-1 text-xs" onClick={() => void copy()}>
        Copiar todos los prompts de metáforas
      </Button>
      {status && <span className="text-[11px] text-muted">{status}</span>}
      {shown && <textarea readOnly className={`${inputClass} w-80 py-1.5 font-mono text-[11px]`} rows={6} value={shown} onFocus={(e) => e.target.select()} />}
    </span>
  );
}

type Props = {
  scene: MotionScene;
  tools: MetaphorTools;
  update: (patch: Partial<MotionScene>) => void;
  busy: boolean;
};

export function MetaphorPanel({ scene, tools, update, busy }: Props) {
  const m = scene.metaphor ?? emptyMetaphor();
  const [status, setStatus] = useState("");
  const [shown, setShown] = useState<string | null>(null);
  const [paste, setPaste] = useState("");
  const setMetaphor = (patch: Partial<SceneMetaphor>) => update({ metaphor: { ...m, ...patch } });
  const has = isMetaphorAsset(scene.asset) ? tools.has(scene.asset) : { image: false, clip: false };

  async function copy(text: string, done: string) {
    if (!text) {
      setStatus("Primero escribí qué se ve en la imagen.");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setStatus(done);
      setShown(null);
    } catch {
      // Without clipboard access the prompt shows below to copy by hand.
      setShown(text);
      setStatus("No pude copiar solo: seleccioná el texto de abajo y copialo.");
    }
  }

  function usePaste() {
    const read = tools.parse(paste);
    if ("error" in read) {
      setStatus(read.error);
      return;
    }
    update({ metaphor: read.metaphor });
    setPaste("");
    setStatus("Listo: la escena tiene la imagen escrita. Ahora copiá el prompt para Grok.");
  }

  async function upload(file: File) {
    setStatus("Subiendo…");
    try {
      await tools.upload(scene.id, file);
      setStatus(file.type.startsWith("video/") ? "Clip guardado con la escena: se reproduce sin sonido desde que entra la imagen." : "Imagen guardada con la escena.");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    }
  }

  const picture = has.image && has.clip ? "Tiene imagen y clip de Grok." : has.clip ? "Tiene el clip de Grok." : has.image ? "Tiene la imagen de Grok." : "Falta la imagen de Grok: hasta que la subas, la escena muestra el prompt y no se puede generar el video.";

  return (
    <div className="space-y-1.5 rounded-lg border border-line bg-paper p-2 text-xs sm:col-span-2">
      <p className={has.image || has.clip ? "text-good" : "font-semibold text-neg"}>{picture}</p>
      <label className="block">
        <span className="text-muted">Qué se ve (en inglés, para Grok; sin palabras en la imagen)</span>
        <textarea
          className={`${inputClass} py-1.5 text-xs`}
          rows={3}
          value={m.image}
          placeholder="A tall stack of cardboard delivery boxes leaning, about to topple, on a bare shop counter…"
          aria-label="Qué se ve"
          onChange={(e) => setMetaphor({ image: e.target.value })}
        />
      </label>
      <label className="block">
        <span className="text-muted">Cómo se mueve (opcional, para el clip)</span>
        <textarea
          className={`${inputClass} py-1.5 text-xs`}
          rows={2}
          value={m.video}
          placeholder="The top box slowly tips and the stack sways. Slow push-in."
          aria-label="Cómo se mueve"
          onChange={(e) => setMetaphor({ video: e.target.value })}
        />
      </label>
      {tools.cast.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          <span className="text-muted">Aparece:</span>
          {tools.cast.map((c) => (
            <label key={c.id} className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={m.cast.includes(c.id)}
                onChange={(e) => setMetaphor({ cast: e.target.checked ? [...m.cast, c.id].slice(0, 4) : m.cast.filter((x) => x !== c.id) })}
              />
              {c.label}
            </label>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        <Button variant="secondary" className="px-2 py-1 text-xs" onClick={() => void copy(tools.imagePrompt(scene), "Prompt copiado. Pegalo en Grok (imagen cuadrada 1:1) y subí acá lo que haga.")}>
          Copiar prompt para Grok
        </Button>
        {m.video.trim() && (
          <Button variant="secondary" className="px-2 py-1 text-xs" onClick={() => void copy(tools.videoPrompt(scene), "Prompt del clip copiado. En Grok: Crear video desde la imagen, 6 s, sonido apagado.")}>
            Copiar prompt del clip
          </Button>
        )}
        <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => void copy(tools.opusPrompt(scene), "Pedido copiado. Pegalo en claude.ai (Opus) y traé acá las líneas IMAGEN, VIDEO y CAST.")}>
          Copiar pedido para Opus
        </Button>
      </div>
      <p className="text-[11px] text-muted">{METAPHOR_SETTINGS}</p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1">
          <span>Subir lo que hizo Grok (imagen o clip):</span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,video/mp4,video/webm,video/quicktime"
            aria-label="Subir imagen o clip de Grok"
            className="text-xs"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void upload(file);
            }}
          />
        </label>
        {(has.image || has.clip) && (
          <Button variant="ghost" className="px-2 py-0.5 text-xs text-neg" disabled={busy} onClick={() => void tools.remove(scene.id)}>
            Sacar lo subido
          </Button>
        )}
      </div>
      <details>
        <summary className="cursor-pointer text-muted">Pegar la respuesta de Opus</summary>
        <textarea className={`${inputClass} mt-1 py-1.5 text-xs`} rows={4} value={paste} placeholder={"IMAGEN: …\nVIDEO: …\nCAST: …"} aria-label="Respuesta de Opus" onChange={(e) => setPaste(e.target.value)} />
        <Button variant="secondary" className="mt-1 px-2 py-1 text-xs" disabled={!paste.trim()} onClick={usePaste}>
          Usar la respuesta
        </Button>
      </details>
      {status && <p className="text-muted">{status}</p>}
      {shown && <textarea readOnly className={`${inputClass} py-1.5 font-mono text-[11px]`} rows={6} value={shown} onFocus={(e) => e.target.select()} />}
    </div>
  );
}
