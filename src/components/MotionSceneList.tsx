// The explainer studio's scene list: template, camera, place, entry, what it shows, seconds, the words, the picture
// and the voice of each scene, in playing order.
import type { SeriesInfo } from "../../shared/schema.ts";
import {
  MOTION_CAMERAS,
  MOTION_CAMERA_LABEL,
  SCENE_ENTRIES,
  SCENE_ENTRY_LABEL,
  samePicture,
  BEFORE_AFTER_REVEALS,
  BEFORE_AFTER_REVEAL_LABEL,
  MOTION_GESTURES,
  MOTION_GESTURE_LABEL, MOTION_MOVES, MOTION_MOVE_LABEL,
  MOTION_TEMPLATES,
  ITEMS_HINT,
  TITLE_HINT,
  slotsNote,
  MOTION_TEMPLATE_LABEL,
  SCENE_DISCLOSURES,
  SCENE_DISCLOSURE_LABEL,
  blankScene,
  labelled,
  elementTimes,
  timeScenes,
  type MotionGesture,
  type MotionPiece,
  type MotionScene,
  type MotionScript,
  voiceOverrun,
  hostScenes,
} from "../../shared/motion.ts";
import { WORLD_PLACES, WORLD_PLACE_LABEL } from "../../shared/world.ts";
import type { PuppetAsset } from "../lib/puppet.ts";
import type { ActorAsset } from "../lib/actor.ts";
import { Recorder, type AudioFile } from "./Audio.tsx";
import type { Selection } from "./MotionTimeline.tsx";
import { SceneRecording } from "./SceneRecording.tsx";
import { Button, inputClass } from "./ui.tsx";

const smallInput = inputClass.replace("w-full", "");

type Props = {
  script: MotionScript;
  scenes: MotionScene[];
  selected: Selection | null;
  setSelected: (selection: Selection | null) => void;
  seek: (t: number) => void;
  voices: Record<string, AudioFile>;
  piece: MotionPiece;
  actors: Record<string, ActorAsset>;
  puppets: Record<string, PuppetAsset>;
  series: SeriesInfo;
  layers: HTMLImageElement[];
  host: string | null;
  castCharacters: string[];
  remember: (tag: string) => void;
  setScript: (next: MotionScript) => void;
  updateScene: (id: string, patch: Partial<MotionScene>) => void;
  moveScene: (id: string, by: number) => void;
  fitVoice: (sceneId: string) => void;
  generateVoice: (scene: MotionScene) => Promise<void>;
  keepVoice: (sceneId: string, blob: Blob, name: string) => Promise<void>;
  voiceAvailable: boolean;
  busy: string | null;
};

export function MotionSceneList({ script, scenes, selected, setSelected, seek, voices, piece, actors, puppets, series, layers, host, castCharacters, remember, setScript, updateScene, moveScene, fitVoice, generateVoice, keepVoice, voiceAvailable, busy }: Props) {
  const assetOptions = [
    ...series.cast
      .filter((m) => m.kind !== "character" || m.image || m.puppet?.layers.length || m.rig?.file)
      .map((m) => ({
        value: m.id,
        label: `${m.name} (${m.kind === "screen" ? (m.video ? "pantalla · con video" : "pantalla") : m.kind === "product" ? "producto" : m.kind === "place" ? "lugar" : m.rig?.file ? "personaje · camina" : m.puppet?.layers.length ? "personaje · títere 3D" : "personaje"})${m.image || m.puppet?.layers.length || m.rig?.file ? "" : " · sin imagen"}`,
      })),
    ...layers.map((_, k) => ({ value: `layer:${k}`, label: `Capa ${k + 1} (Grok)` })),
  ];
  return (
    <>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold">Escenas</h3>
          <Button
            variant="secondary"
            className="px-3 py-1 text-xs"
            onClick={() => {
              remember(`add-${Date.now()}`);
              setScript({ ...script, scenes: [...script.scenes, blankScene()] });
            }}
          >
            + Escena
          </Button>
        </div>
        <ol className="space-y-2">
          {timeScenes(scenes).map((s) => {
            const raw = script.scenes.find((x) => x.id === s.id)!;
            const voice = voices[s.id];
            return (
              <li key={s.id} className={`rounded-xl border bg-white p-3 ${selected?.sceneId === s.id ? "border-touch" : "border-line"}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="font-mono text-xs text-muted hover:text-ink"
                    title="Ver esta escena en la vista previa"
                    onClick={() => {
                      seek(s.start + 0.6);
                      setSelected({ sceneId: s.id, key: null });
                    }}
                  >
                    {s.index + 1} · {s.start.toFixed(1)}–{s.end.toFixed(1)} s
                  </button>
                  <select
                    className={`${smallInput} py-1 text-xs`}
                    value={raw.template}
                    aria-label="Plantilla"
                    onChange={(e) => {
                      // A new character scene gets the series' explainer character.
                      const template = e.target.value as MotionScene["template"];
                      const [hosted] = hostScenes([{ ...raw, template }], host, castCharacters, true);
                      updateScene(s.id, hosted.asset === raw.asset ? { template } : { template, asset: hosted.asset, assetB: hosted.assetB });
                    }}
                  >
                    {MOTION_TEMPLATES.map((t) => (
                      <option key={t} value={t}>
                        {MOTION_TEMPLATE_LABEL[t]}
                      </option>
                    ))}
                  </select>
                  <select
                    className={`${smallInput} py-1 text-xs`}
                    value={raw.camera ?? "hold"}
                    aria-label="Cámara"
                    title={raw.cameraBy === "ai" ? "La eligió la IA según lo que muestra la escena. Si la cambiás, queda la tuya." : undefined}
                    onChange={(e) => updateScene(s.id, { camera: e.target.value as (typeof MOTION_CAMERAS)[number], cameraBy: undefined })}
                  >
                    {MOTION_CAMERAS.map((c) => (
                      <option key={c} value={c}>
                        Cámara{raw.cameraBy === "ai" && c === (raw.camera ?? "hold") ? " (IA)" : ""}: {MOTION_CAMERA_LABEL[c]}
                      </option>
                    ))}
                  </select>
                  <select
                    className={`${smallInput} py-1 text-xs`}
                    value={raw.world ?? "piece"}
                    aria-label="Lugar"
                    title="El mundo ilustrado detrás de esta escena. «Como la pieza» usa el de toda la pieza."
                    onChange={(e) => {
                      const v = e.target.value;
                      updateScene(s.id, { world: v === "none" || (WORLD_PLACES as readonly string[]).includes(v) ? (v as MotionScene["world"]) : undefined });
                    }}
                  >
                    <option value="piece">Lugar: Como la pieza ({script.world ? WORLD_PLACE_LABEL[script.world] : "ninguno"})</option>
                    <option value="none">Lugar: Ninguno</option>
                    {WORLD_PLACES.map((p) => (
                      <option key={p} value={p}>
                        Lugar: {WORLD_PLACE_LABEL[p]}
                      </option>
                    ))}
                  </select>
                  {s.index > 0 && (
                    <select
                      className={`${smallInput} py-1 text-xs`}
                      value={raw.entry ?? "auto"}
                      aria-label="Entrada"
                      title="Pasar a través: la cámara se mete en lo principal de la escena anterior (la pantalla, el producto, el número) y esta escena se abre desde adentro. Continuidad: si las dos escenas muestran la misma imagen, esa imagen viaja de donde estaba a su lugar nuevo. Automática usa Continuidad cuando se puede y si no, el corte del tono."
                      onChange={(e) => {
                        const v = e.target.value;
                        updateScene(s.id, { entry: v === "through" || v === "match" || v === "cut" ? v : undefined });
                      }}
                    >
                      <option value="auto">Entrada: Automática ({s.carryIn ? SCENE_ENTRY_LABEL.match : SCENE_ENTRY_LABEL.cut})</option>
                      {SCENE_ENTRIES.map((c) => (
                        <option key={c} value={c}>
                          Entrada: {SCENE_ENTRY_LABEL[c]}
                          {c === "match" && !samePicture(script.scenes[s.index - 1], raw) ? " (no muestra la misma imagen: va el corte)" : ""}
                        </option>
                      ))}
                    </select>
                  )}
                  <select
                    className={`${smallInput} py-1 text-xs ${labelled(raw) ? "border-neg/50 font-semibold" : ""}`}
                    value={raw.disclosure ?? "real"}
                    aria-label="Qué muestra"
                    title="Solo lo que está en «Lo que existe hoy» se muestra como real. Concepto o Simulación pone el rótulo en pantalla mientras dura la escena."
                    onChange={(e) => updateScene(s.id, { disclosure: e.target.value === "real" ? undefined : (e.target.value as MotionScene["disclosure"]) })}
                  >
                    {SCENE_DISCLOSURES.map((c) => (
                      <option key={c} value={c}>
                        {SCENE_DISCLOSURE_LABEL[c]}
                      </option>
                    ))}
                  </select>
                  <label className="flex items-center gap-1 text-xs">
                    <input
                      type="number"
                      min={2}
                      max={8}
                      step={0.5}
                      className={`${smallInput} w-16 px-2 py-1 text-xs`}
                      value={raw.seconds}
                      aria-label="Segundos"
                      onChange={(e) => updateScene(s.id, { seconds: Math.max(2, Math.min(8, Number(e.target.value) || 2)) })}
                    />
                    s
                  </label>
                  <span className="ml-auto flex gap-1">
                    <Button variant="ghost" className="px-2 py-0.5 text-xs" onClick={() => moveScene(s.id, -1)} aria-label="Subir">
                      ↑
                    </Button>
                    <Button variant="ghost" className="px-2 py-0.5 text-xs" onClick={() => moveScene(s.id, 1)} aria-label="Bajar">
                      ↓
                    </Button>
                    <Button
                      variant="ghost"
                      className="px-2 py-0.5 text-xs text-neg"
                      onClick={() => {
                        remember(`remove-${Date.now()}`);
                        setScript({ ...script, scenes: script.scenes.filter((x) => x.id !== s.id) });
                      }}
                    >
                      Sacar
                    </Button>
                  </span>
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <input className={`${inputClass} py-1.5`} value={raw.title} placeholder={TITLE_HINT[raw.template] ?? "Título (hasta 6 palabras)"} aria-label="Título" onChange={(e) => updateScene(s.id, { title: e.target.value })} />
                  <input className={`${inputClass} py-1.5`} value={raw.text} placeholder="Texto de apoyo" aria-label="Texto" onChange={(e) => updateScene(s.id, { text: e.target.value })} />
                  <textarea
                    className={`${inputClass} py-1.5 text-xs`}
                    rows={2}
                    value={raw.items.join("\n")}
                    placeholder={ITEMS_HINT[raw.template] ?? "Rótulos, pasos, precio o llamado (uno por línea)"}
                    aria-label="Elementos"
                    onChange={(e) => updateScene(s.id, { items: e.target.value.split("\n").slice(0, 5) })}
                  />
                  {raw.template === "slots" && <p className="text-[11px] text-muted sm:col-span-2">{slotsNote(s.slots)}</p>}
                  <div className="space-y-1.5">
                    <select className={`${inputClass} py-1 text-xs`} value={raw.asset} aria-label="Imagen" onChange={(e) => updateScene(s.id, { asset: e.target.value })}>
                      <option value="">Sin imagen</option>
                      {assetOptions.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    {raw.template === "beforeAfter" && (
                      <select className={`${inputClass} py-1 text-xs`} value={raw.assetB} aria-label="Imagen de después" onChange={(e) => updateScene(s.id, { assetB: e.target.value })}>
                        <option value="">Después: sin imagen</option>
                        {assetOptions.map((o) => (
                          <option key={o.value} value={o.value}>
                            Después: {o.label}
                          </option>
                        ))}
                      </select>
                    )}
                    {raw.template === "character" && (
                      <>
                        <select className={`${inputClass} py-1 text-xs`} value={raw.assetB} aria-label="Lo que muestra" onChange={(e) => updateScene(s.id, { assetB: e.target.value })}>
                          <option value="">No muestra nada (el personaje solo)</option>
                          {assetOptions
                            .filter((o) => o.value !== raw.asset)
                            .map((o) => (
                              <option key={o.value} value={o.value}>
                                Muestra: {o.label}
                              </option>
                            ))}
                        </select>
                        {actors[raw.asset] ? (
                          <select
                            className={`${inputClass} py-1 text-xs`}
                            value={raw.move ?? "walk"}
                            aria-label="Tramo"
                            onChange={(e) => updateScene(s.id, { move: e.target.value as (typeof MOTION_MOVES)[number] })}
                          >
                            {MOTION_MOVES.map((g) => (
                              <option key={g} value={g}>
                                Tramo: {MOTION_MOVE_LABEL[g]}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <select
                            className={`${inputClass} py-1 text-xs`}
                            value={raw.gesture ?? "present"}
                            aria-label="Gesto"
                            onChange={(e) => updateScene(s.id, { gesture: e.target.value as MotionGesture })}
                          >
                            {MOTION_GESTURES.map((g) => (
                              <option key={g} value={g}>
                                Gesto: {MOTION_GESTURE_LABEL[g]}
                              </option>
                            ))}
                          </select>
                        )}
                        {raw.asset && actors[raw.asset] && raw.move && actors[raw.asset].root[raw.move] === false && (
                          <p className="text-[11px] text-muted">Ese clip no trae root motion: el personaje se desplaza, pero no es el paso del clip.</p>
                        )}
                        {raw.asset && !puppets[raw.asset] && !actors[raw.asset] && (
                          <p className="text-[11px] text-neg">Este personaje no tiene imagen, títere ni GLB: subilos en Editar serie.</p>
                        )}
                      </>
                    )}
                    {raw.template === "beforeAfter" && (
                      <div className="space-y-1">
                        <select
                          className={`${inputClass} py-1 text-xs`}
                          value={raw.reveal ?? "wipe"}
                          aria-label="Cómo cambia"
                          onChange={(e) => updateScene(s.id, { reveal: e.target.value === "iris" ? "iris" : undefined })}
                        >
                          {BEFORE_AFTER_REVEALS.map((r) => (
                            <option key={r} value={r}>
                              Cómo cambia: {BEFORE_AFTER_REVEAL_LABEL[r]}
                            </option>
                          ))}
                        </select>
                        {raw.reveal === "iris" && (
                          <div className="grid grid-cols-2 gap-1 text-[11px] text-muted">
                            {(["focusX", "focusY"] as const).map((k) => (
                              <label key={k} className="block">
                                {k === "focusX" ? "Desde: horizontal" : "Desde: vertical"}
                                <input
                                  type="range"
                                  min={0}
                                  max={1}
                                  step={0.01}
                                  className="block w-full"
                                  value={raw[k]}
                                  onChange={(e) => updateScene(s.id, { [k]: Number(e.target.value) })}
                                />
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    <SceneRecording scene={raw} cast={series.cast} update={(patch) => updateScene(s.id, patch)} />
                    {raw.template === "zoom" && (
                      <div className="grid grid-cols-3 gap-1 text-[11px] text-muted">
                        {(["focusX", "focusY", "zoom"] as const).map((k) => (
                          <label key={k} className="block">
                            {k === "focusX" ? "Horizontal" : k === "focusY" ? "Vertical" : "Zoom"}
                            <input
                              type="range"
                              min={k === "zoom" ? 1.2 : 0}
                              max={k === "zoom" ? 4 : 1}
                              step={0.01}
                              className="block w-full"
                              value={raw[k]}
                              onChange={(e) => updateScene(s.id, { [k]: Number(e.target.value) })}
                            />
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input
                    className={`${inputClass} min-w-0 flex-1 py-1.5 text-sm`}
                    value={raw.voice}
                    placeholder="Lo que dice la voz"
                    aria-label="Voz"
                    onChange={(e) => updateScene(s.id, { voice: e.target.value })}
                  />
                  <input className={`${smallInput} w-32 py-1.5 text-xs`} value={raw.emotion} placeholder="Emoción" aria-label="Emoción" onChange={(e) => updateScene(s.id, { emotion: e.target.value })} />
                </div>
                {piece.voice !== "none" && raw.voice.trim() && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                    {voice && <audio src={voice.url} controls className="h-8" />}
                    {voice && voiceOverrun(s, voice.duration) > 0 && (
                      <>
                        <span className="text-neg">
                          La voz dura {voice.duration.toFixed(1)} s, entra a los {(elementTimes(s).voice ?? 0.25).toFixed(2)} s y la escena dura {s.seconds.toFixed(1)} s: se corta con un fundido en el corte.
                        </span>
                        <Button variant="secondary" className="px-2 py-1 text-xs" onClick={() => fitVoice(s.id)}>
                          Ajustar al largo de la voz
                        </Button>
                      </>
                    )}
                    {piece.voice === "generated" ? (
                      <Button variant="secondary" className="px-2 py-1 text-xs" disabled={!voiceAvailable || busy !== null} onClick={() => generateVoice(raw)}>
                        {voice ? "Generar de nuevo" : "Generar voz"}
                      </Button>
                    ) : (
                      <>
                        <Recorder line={raw.voice} onDone={(blob) => keepVoice(s.id, blob, `voz-${s.id}.webm`)} />
                        <input type="file" accept="audio/*" aria-label="Subir voz" className="text-xs" onChange={(e) => e.target.files?.[0] && keepVoice(s.id, e.target.files[0], e.target.files[0].name)} />
                      </>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </>
  );
}
