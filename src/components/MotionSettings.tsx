// The explainer studio's settings column: voice, narration, tone, illustrated world, share text, effects, music (with
// the drums stem or Demucs for the beat grid), Grok's layers, the AI notice and the format.
import {
  MOTION_MOODS,
  MOTION_MOOD_LABEL,
  MOTION_TONES,
  MOTION_TONE_LABEL,
  timeScenes,
  type MotionPiece,
  type MotionScene,
  type MotionScript,
} from "../../shared/motion.ts";
import { WORLD_PLACES, WORLD_PLACE_LABEL } from "../../shared/world.ts";
import type { Brief } from "../../shared/schema.ts";
import { CopyButton } from "./ScriptView.tsx";
import { NarrationImport } from "./NarrationImport.tsx";
import type { AudioFile } from "./Audio.tsx";
import { Button, Field, Segmented, Spinner, inputClass } from "./ui.tsx";

const smallInput = inputClass.replace("w-full", "");

type Props = {
  piece: MotionPiece;
  set: (patch: Partial<MotionPiece>) => void;
  script: MotionScript;
  setScript: (next: MotionScript) => void;
  scenes: MotionScene[];
  brief: Brief;
  autoSync: boolean;
  demucs: boolean;
  voiceAvailable: boolean;
  busy: string | null;
  generateAllVoices: () => Promise<void>;
  keepVoice: (sceneId: string, blob: Blob, name: string) => Promise<void>;
  track: { file: AudioFile; buffer: AudioBuffer } | null;
  addTrack: (file: File) => Promise<void>;
  addDrums: (file: File) => Promise<void>;
  separateDrums: () => Promise<void>;
  separating: boolean;
  addLayers: (files: File[]) => Promise<void>;
  layers: HTMLImageElement[];
};

export function MotionSettings({ piece, set, script, setScript, scenes, brief, autoSync, demucs, voiceAvailable, busy, generateAllVoices, keepVoice, track, addTrack, addDrums, separateDrums, separating, addLayers, layers }: Props) {
  return (
    <>
      <Field label="Voz" group>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            value={piece.voice}
            onChange={(voice) => set({ voice })}
            options={[
              { value: "generated", label: "Generada" },
              { value: "recorded", label: "Grabada o subida" },
              { value: "none", label: "Sin voz" },
            ]}
          />
          {piece.voice === "generated" && (
            <Button variant="secondary" className="px-3 py-1 text-xs" disabled={!voiceAvailable || busy !== null} onClick={generateAllVoices}>
              Generar todas
            </Button>
          )}
        </div>
        {piece.voice === "generated" && !voiceAvailable && <p className="mt-1 text-xs text-muted">La voz generada necesita OPENAI_API_KEY.</p>}
      </Field>

      {piece.voice !== "none" && (
        <NarrationImport
          lines={timeScenes(scenes).flatMap((s) =>
            s.voice.trim() ? [{ key: s.id, label: `Escena ${s.index + 1}`, speaker: "", text: s.voice, emotion: s.emotion }] : [],
          )}
          narratorKeys={[]}
          language={brief.language}
          autoSync={autoSync}
          room={Object.fromEntries(scenes.map((s) => [s.id, s.seconds]))}
          onParts={async (parts) => {
            for (const p of parts) await keepVoice(p.key, p.blob, `voz-${p.key}.wav`);
            set({ voice: "recorded" });
          }}
        />
      )}

      <Field label="Tono" group hint="Sale de la voz del brief. Seco: cortes secos y casi sin efectos. Cálido: pasa de escena con un empuje suave. Absurdo: cortes rápidos y más efectos.">
        <Segmented
          value={script.tone ?? "warm"}
          onChange={(tone) => setScript({ ...script, tone })}
          options={MOTION_TONES.map((t) => ({ value: t, label: MOTION_TONE_LABEL[t] }))}
        />
      </Field>

      <Field
        label="Mundo ilustrado"
        group
        hint="Un lugar dibujado con formas planas en los colores de la marca, detrás de todas las escenas. Se mueve con la cámara y nunca queda nada cargado detrás de las palabras. Cada escena puede cambiarlo."
      >
        <Segmented
          value={script.world ?? "none"}
          onChange={(v) => setScript({ ...script, world: v === "none" ? undefined : v })}
          options={[{ value: "none" as const, label: "Ninguno" }, ...WORLD_PLACES.map((p) => ({ value: p, label: WORLD_PLACE_LABEL[p] }))]}
        />
      </Field>

      <Field
        label="Texto para publicar"
        hint="De 1 a 3 frases para pegar en X, LinkedIn o Instagram, en el tono de la pieza. Lo que no esté confirmado va con [VERIFY]."
      >
        <textarea
          className={`${inputClass} text-sm`}
          rows={3}
          aria-label="Texto para publicar"
          value={script.caption ?? ""}
          onChange={(e) => setScript({ ...script, caption: e.target.value })}
        />
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <CopyButton text={script.caption ?? ""} idle="Copiar el texto" variant="secondary" />
          {/\[VERIFY\]/.test(script.caption ?? "") && <span className="text-xs text-neg">Tiene datos sin confirmar: sacá el [VERIFY] solo cuando lo confirmes.</span>}
        </div>
      </Field>

      <Field label="Efectos de sonido" group hint="La biblioteca libre (dominio público, Kenney y teclas) o sintetizados. Suenan al empezar cada movimiento.">
        <Segmented
          value={piece.effects ?? "library"}
          onChange={(effects) => set({ effects })}
          options={[
            { value: "library", label: "Biblioteca libre" },
            { value: "synth", label: "Sintetizados" },
            { value: "none", label: "Sin efectos" },
          ]}
        />
      </Field>

      <Field label="Música" group hint="Sintetizada en código, o tu tema: los cortes caen en sus beats, y el producto y el logo en los golpes más fuertes.">
        <div className="space-y-2">
          <Segmented
            value={piece.music}
            onChange={(music) => set({ music })}
            options={[
              { value: "synth", label: "Sintetizada" },
              { value: "track", label: "Tema propio" },
              { value: "none", label: "Sin música" },
            ]}
          />
          {piece.music === "synth" && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <select
                className={`${smallInput} py-1 text-xs`}
                value={script.music.mood}
                aria-label="Clima de la música"
                onChange={(e) => setScript({ ...script, music: { ...script.music, mood: e.target.value as MotionScript["music"]["mood"] } })}
              >
                {MOTION_MOODS.map((m) => (
                  <option key={m} value={m}>
                    {MOTION_MOOD_LABEL[m]}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-1">
                <input
                  type="number"
                  min={80}
                  max={130}
                  className={`${smallInput} w-16 px-2 py-1 text-xs`}
                  value={script.music.bpm}
                  onChange={(e) => setScript({ ...script, music: { ...script.music, bpm: Math.max(80, Math.min(130, Number(e.target.value) || 100)) } })}
                />
                bpm
              </label>
            </div>
          )}
          {piece.music === "track" && (
            <input type="file" accept="audio/*" aria-label="Subir el tema" className="text-sm" onChange={(e) => e.target.files?.[0] && addTrack(e.target.files[0])} />
          )}
          {piece.music === "track" && track && (
            <div className="space-y-1.5 rounded-lg border border-line p-2 text-xs">
              {piece.kickGrid ? (
                <p className="text-good">
                  Grilla del tema: {piece.kickGrid.kicks.length} bombos, {Math.round(piece.kickGrid.bpm)} bpm, {piece.kickGrid.downbeats.length} primeros tiempos, de{" "}
                  {piece.kickGrid.source === "demucs" ? "Demucs" : piece.kickGrid.name} (error mediano {piece.kickGrid.medianErrorMs} ms)
                  {piece.kickGrid.usable ? "" : ". El tempo cambia: los cortes van a los bombos que hay"}.
                </p>
              ) : (
                <p className="text-neg">
                  Sin grilla: los cortes no se pegan al tema. La app mide el beat solo en la pista de batería, nunca en el tema entero.
                </p>
              )}
              <label className="block">
                <span className="text-muted">Pista de batería del mismo tema (la exporta tu programa de música o un separador de pistas):</span>
                <input type="file" accept="audio/*" aria-label="Subir la pista de batería" className="mt-1 block text-xs" onChange={(e) => e.target.files?.[0] && addDrums(e.target.files[0])} />
              </label>
              {demucs ? (
                <div className="space-y-1">
                  <Button variant="secondary" className="px-2 py-1 text-xs" disabled={busy !== null} onClick={separateDrums}>
                    {separating ? (
                      <>
                        <Spinner /> Separando con Demucs…
                      </>
                    ) : (
                      "Separar la batería con Demucs"
                    )}
                  </Button>
                  {!piece.kickGrid && <p className="text-muted">Unos minutos la primera vez; después el tema queda separado.</p>}
                </div>
              ) : (
                !piece.kickGrid && (
                  <p className="text-muted">
                    ¿No tenés la pista de batería? Con Demucs instalado en esta compu, la app la separa sola (Modelos → Demucs).
                  </p>
                )
              )}
            </div>
          )}
          {piece.music === "track" && track && <p className="text-xs text-muted">{track.file.name}</p>}
        </div>
      </Field>

      <Field label="Capas de Grok" group hint="Las capas que separa Grok (Segmentos → Descargar todo). Quedan para usar en las escenas.">
        <input
          type="file"
          accept="image/png,image/webp,image/*"
          multiple
          aria-label="Subir capas"
          className="text-sm"
          onChange={(e) => {
            if (e.target.files?.length) addLayers([...e.target.files]);
            e.target.value = "";
          }}
        />
        {layers.length > 0 && <p className="mt-1 text-xs text-muted">{layers.length} capa(s).</p>}
      </Field>

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1" checked={piece.disclosure} onChange={(e) => set({ disclosure: e.target.checked })} />
        <span>
          <b>Aviso de IA</b>
          <span className="block text-xs text-muted">Si alguna imagen la hizo una IA (capas, personajes, producto), una línea chica al pie.</span>
        </span>
      </label>

      <Field label="Video" group>
        <Segmented
          value={piece.format}
          onChange={(format) => set({ format })}
          options={[
            { value: "vertical", label: "Vertical 9:16" },
            { value: "horizontal", label: "Horizontal 16:9" },
          ]}
        />
      </Field>
    </>
  );
}
