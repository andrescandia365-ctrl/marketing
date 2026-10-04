// The explainer's timeline: the scenes in a row (drag a scene's right edge to change its length) and one lane per kind
// of element, each element a mark at the second it enters (drag it to change when). The ruler scrubs the preview;
// the beats show as ticks and pull the marks onto them (hold Alt to place freely). Where an element sits on screen
// is moved on the preview itself (MotionStudio); the inspector below holds the numbers.
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import {
  LANES,
  LANE_LABEL,
  MOTION_TEMPLATE_LABEL,
  sceneElements,
  type Lane,
  type SceneElement,
  type TimedScene,
  type Tweak,
} from "../../shared/motion.ts";
import { Button } from "./ui.tsx";

export type Selection = { sceneId: string; key: string | null };

type Props = {
  scenes: TimedScene[];
  total: number;
  beats: number[];
  gaps: { from: number; to: number }[];
  // Each scene's raw length (before snapping onto the beats), for resizing.
  rawSeconds: Record<string, number>;
  // How long each scene's voice lasts, when there is a file.
  voiceLengths: Record<string, number>;
  selected: Selection | null;
  playheadRef: RefObject<HTMLDivElement | null>;
  // The thumbnail's second (frame 0 of the video), marked on the ruler.
  poster?: number;
  onSeek: (t: number) => void;
  onSelect: (selection: Selection) => void;
  // Called once at the start of every drag, so the whole drag undoes in one step.
  onBegin: () => void;
  onSceneSeconds: (sceneId: string, seconds: number) => void;
  onElementAt: (sceneId: string, key: string, at: number) => void;
};

const ROW = { ruler: 22, scenes: 44, lane: 26 };
const MAGNET = 0.1;

type Drag =
  | { kind: "seek" }
  | { kind: "edge"; sceneId: string; t0: number; seconds0: number }
  | { kind: "element"; scene: TimedScene; key: string; t0: number; at0: number };

export function MotionTimeline(props: Props) {
  const { scenes, total, beats, gaps, voiceLengths, selected } = props;
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [zoom, setZoom] = useState(1);
  const [width, setWidth] = useState(600);

  useEffect(() => {
    const el = outer.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setWidth(el.clientWidth));
    observer.observe(el);
    setWidth(el.clientWidth);
    return () => observer.disconnect();
  }, []);

  const length = Math.max(total, 0.5);
  const pct = (t: number) => `${(t / length) * 100}%`;
  const perSecond = (width * zoom) / length;
  const step = perSecond >= 40 ? 1 : perSecond >= 16 ? 2 : perSecond >= 7 ? 5 : 10;
  const timeAt = (clientX: number) => {
    const rect = inner.current!.getBoundingClientRect();
    return Math.min(length, Math.max(0, ((clientX - rect.left) / rect.width) * length));
  };
  const magnet = (t: number, free: boolean) => {
    if (free || !beats.length) return t;
    const near = beats.reduce((best, b) => (Math.abs(b - t) < Math.abs(best - t) ? b : best), beats[0]);
    return Math.abs(near - t) <= MAGNET ? near : t;
  };

  const elements = scenes.map((s) => sceneElements(s));
  const lanes = LANES.filter((lane) => elements.some((list) => list.some((e) => e.lane === lane)));

  function start(e: ReactPointerEvent, next: Drag) {
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    drag.current = next;
    if (next.kind !== "seek") props.onBegin();
  }

  function move(e: ReactPointerEvent) {
    const d = drag.current;
    if (!d) return;
    const t = timeAt(e.clientX);
    if (d.kind === "seek") props.onSeek(t);
    else if (d.kind === "edge") props.onSceneSeconds(d.sceneId, Math.round(Math.min(8, Math.max(2, d.seconds0 + t - d.t0)) * 10) / 10);
    else {
      const latest = Math.max(0, d.scene.seconds - 0.3);
      const wanted = magnet(d.scene.start + d.at0 + t - d.t0, e.altKey) - d.scene.start;
      const at = Math.round(Math.min(latest, Math.max(0, wanted)) * 100) / 100;
      props.onElementAt(d.scene.id, d.key, at);
      props.onSeek(Math.min(d.scene.end - 0.05, d.scene.start + at + 0.5));
    }
  }

  const end = () => {
    drag.current = null;
  };

  function focusElement(s: TimedScene, el: SceneElement) {
    props.onSelect({ sceneId: s.id, key: el.key });
    props.onSeek(Math.min(s.end - 0.05, s.start + el.at + 0.7));
  }

  function nudge(e: React.KeyboardEvent, s: TimedScene, el: SceneElement) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    props.onBegin();
    const by = (e.key === "ArrowLeft" ? -1 : 1) * (e.shiftKey ? 0.5 : 0.1);
    const at = Math.round(Math.min(Math.max(0, s.seconds - 0.3), Math.max(0, el.at + by)) * 100) / 100;
    props.onElementAt(s.id, el.key, at);
    props.onSeek(Math.min(s.end - 0.05, s.start + at + 0.5));
  }

  const ticks: number[] = [];
  for (let t = 0; t <= length + 0.001; t += step) ticks.push(t);

  return (
    <div className="rounded-xl border border-line bg-white p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-bold">Línea de tiempo</h3>
        <span className="text-xs text-muted">Arrastrá el borde de una escena para alargarla; cada marca, para cambiar cuándo entra (Alt: sin imán a los beats).</span>
        <span className="ml-auto flex items-center gap-1">
          <Button variant="ghost" className="px-2 py-0.5 text-xs" aria-label="Alejar" disabled={zoom <= 1} onClick={() => setZoom((z) => Math.max(1, z / 1.5))}>
            −
          </Button>
          <span className="w-10 text-center font-mono text-[11px] text-muted">{Math.round(zoom * 100)}%</span>
          <Button variant="ghost" className="px-2 py-0.5 text-xs" aria-label="Acercar" disabled={zoom >= 8} onClick={() => setZoom((z) => Math.min(8, z * 1.5))}>
            +
          </Button>
        </span>
      </div>
      <div className="flex text-[11px]">
        <div className="w-28 shrink-0 pr-2 text-right text-muted">
          <div style={{ height: ROW.ruler }} />
          <div style={{ height: ROW.scenes }} className="flex items-center justify-end font-semibold text-ink">
            Escenas
          </div>
          {lanes.map((lane) => (
            <div key={lane} style={{ height: ROW.lane }} className="flex items-center justify-end">
              {LANE_LABEL[lane]}
            </div>
          ))}
        </div>
        <div ref={outer} className="min-w-0 flex-1 overflow-x-auto">
          <div
            ref={inner}
            className="relative select-none"
            style={{ width: `${zoom * 100}%`, minWidth: "100%" }}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
          >
            {/* Ruler: seconds, beats; click or drag to move the preview. */}
            <div
              className="relative cursor-ew-resize border-b border-line bg-paper"
              style={{ height: ROW.ruler }}
              onPointerDown={(e) => {
                start(e, { kind: "seek" });
                props.onSeek(timeAt(e.clientX));
              }}
              aria-label="Regla de tiempo"
            >
              {beats
                .filter((b) => b <= length)
                .map((b) => (
                  <span key={`b${b}`} className="absolute bottom-0 h-1.5 w-px bg-muted/50" style={{ left: pct(b) }} />
                ))}
              {props.poster !== undefined && (
                <span
                  className="absolute top-0 z-10 -translate-x-1/2 rounded-sm bg-touch px-1 text-[9px] leading-[14px] font-bold text-white"
                  style={{ left: pct(props.poster) }}
                  title={`Portada: ${props.poster.toFixed(1)} s`}
                >
                  P
                </span>
              )}
              {ticks.map((t) => (
                <span key={t} className="absolute top-0 h-full border-l border-line pl-0.5 font-mono text-[10px] text-muted" style={{ left: pct(t) }}>
                  {t}s
                </span>
              ))}
            </div>

            {/* Scenes. */}
            <div className="relative" style={{ height: ROW.scenes }}>
              {scenes.map((s) => {
                const isSelected = selected?.sceneId === s.id && selected.key === null;
                return (
                  <div
                    key={s.id}
                    className={`absolute top-1 bottom-1 overflow-hidden rounded-md border px-1.5 ${isSelected ? "border-touch bg-touch-soft" : "border-line bg-paper hover:bg-touch-soft/50"}`}
                    style={{ left: pct(s.start), width: pct(s.seconds) }}
                    title={`${s.index + 1} · ${MOTION_TEMPLATE_LABEL[s.template]} · ${s.seconds.toFixed(1)} s`}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      props.onSelect({ sceneId: s.id, key: null });
                      props.onSeek(Math.min(s.end - 0.05, s.start + 0.6));
                    }}
                  >
                    <span className="block truncate pt-1 leading-tight font-semibold">
                      {s.index + 1} · {s.title || MOTION_TEMPLATE_LABEL[s.template]}
                    </span>
                    <span className="block truncate font-mono text-[10px] leading-tight text-muted">{s.seconds.toFixed(1)} s</span>
                    <span
                      role="slider"
                      aria-label={`Largo de la escena ${s.index + 1}`}
                      aria-valuenow={s.seconds}
                      aria-valuemin={2}
                      aria-valuemax={8}
                      tabIndex={0}
                      className="absolute top-0 right-0 bottom-0 w-2 cursor-col-resize bg-ink/15 hover:bg-touch"
                      onPointerDown={(e) => start(e, { kind: "edge", sceneId: s.id, t0: timeAt(e.clientX), seconds0: props.rawSeconds[s.id] ?? s.seconds })}
                      onKeyDown={(e) => {
                        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
                        e.preventDefault();
                        props.onBegin();
                        const raw = props.rawSeconds[s.id] ?? s.seconds;
                        props.onSceneSeconds(s.id, Math.round(Math.min(8, Math.max(2, raw + (e.key === "ArrowLeft" ? -0.5 : 0.5))) * 10) / 10);
                      }}
                    />
                  </div>
                );
              })}
              {gaps.map((g) => (
                <div
                  key={`${g.from}-${g.to}`}
                  className="pointer-events-none absolute bottom-0 h-1 rounded bg-neg"
                  style={{ left: pct(g.from), width: pct(g.to - g.from) }}
                  title="Tramo quieto: más de 4 s sin nada nuevo"
                />
              ))}
            </div>

            {/* One lane per kind of element. */}
            {lanes.map((lane) => (
              <div key={lane} className="relative border-t border-line/60" style={{ height: ROW.lane }}>
                {scenes.map((s, n) =>
                  elements[n]
                    .filter((el) => el.lane === lane)
                    .map((el) => (
                      <Mark
                        key={`${s.id}-${el.key}`}
                        scene={s}
                        el={el}
                        lane={lane}
                        voiceLength={voiceLengths[s.id]}
                        selected={selected?.sceneId === s.id && selected.key === el.key}
                        pct={pct}
                        onPointerDown={(e) => {
                          focusElement(s, el);
                          start(e, { kind: "element", scene: s, key: el.key, t0: timeAt(e.clientX), at0: el.at });
                        }}
                        onKeyDown={(e) => nudge(e, s, el)}
                      />
                    )),
                )}
              </div>
            ))}

            <div ref={props.playheadRef} className="pointer-events-none absolute top-0 bottom-0 w-px bg-neg" style={{ left: 0 }}>
              <span className="absolute -top-0.5 -left-1 h-2 w-2 rotate-45 bg-neg" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Mark({
  scene,
  el,
  lane,
  voiceLength,
  selected,
  pct,
  onPointerDown,
  onKeyDown,
}: {
  scene: TimedScene;
  el: SceneElement;
  lane: Lane;
  voiceLength: number | undefined;
  selected: boolean;
  pct: (t: number) => string;
  onPointerDown: (e: ReactPointerEvent) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
}) {
  const from = scene.start + el.at;
  // The voice shows how long it lasts (its file, or about 2.5 words a second); red when it runs past the scene.
  const voice = lane === "voice";
  const estimated = voice && voiceLength === undefined;
  const spoken = voice ? (voiceLength ?? scene.voice.trim().split(/\s+/).length / 2.5) : 0;
  const until = voice ? from + spoken : scene.end;
  const over = voice && until > scene.end + 0.01;
  const tone = selected ? "bg-touch" : voice ? (over ? "bg-neg" : "bg-good") : lane === "moves" ? "bg-muted" : "bg-ink";
  return (
    <>
      <div
        className={`pointer-events-none absolute top-2 bottom-2 rounded-sm ${voice ? `${tone} opacity-40` : "bg-ink/10"}`}
        style={{ left: pct(from), width: pct(Math.max(0, until - from)) }}
      />
      <button
        type="button"
        className={`absolute top-1 bottom-1 w-2.5 -translate-x-1/2 cursor-grab rounded-sm active:cursor-grabbing ${tone} ${selected ? "ring-2 ring-touch/40" : ""}`}
        style={{ left: pct(from) }}
        title={`${scene.index + 1} · ${el.label} · entra a los ${el.at.toFixed(2)} s${over ? ` · la voz dura ${estimated ? "unos " : ""}${spoken.toFixed(1)} s y no entra en la escena` : ""}`}
        aria-label={`Escena ${scene.index + 1}, ${el.label}, entra a los ${el.at.toFixed(2)} segundos`}
        onPointerDown={onPointerDown}
        onKeyDown={onKeyDown}
      />
    </>
  );
}

// The numbers for what is selected: when it enters, where it is and how big; or the scene's length.
export function Inspector({
  scene,
  selected,
  rawSeconds,
  outside,
  format,
  onBegin,
  onTweak,
  onClearTweak,
  onClearScene,
  onSeconds,
}: {
  scene: TimedScene | undefined;
  selected: Selection | null;
  rawSeconds: number;
  // The selected element runs past the edge of the frame.
  outside: boolean;
  // Which format's place the sliders change.
  format: "v" | "h";
  onBegin: (tag: string) => void;
  onTweak: (key: string, patch: Tweak) => void;
  onClearTweak: (key: string) => void;
  onClearScene: () => void;
  onSeconds: (seconds: number) => void;
}) {
  if (!scene || !selected) {
    return <p className="text-xs text-muted">Tocá un elemento en la vista previa o una marca en la línea de tiempo para moverlo. En la vista previa: arrastrá, o usá las flechas (con Mayús, más rápido).</p>;
  }
  const el = selected.key ? sceneElements(scene).find((e) => e.key === selected.key) : undefined;
  const tweak: Tweak = (selected.key && scene.tweaks?.[selected.key]) || {};
  const tweaked = Object.keys(scene.tweaks ?? {}).length > 0;
  const field = "w-full accent-[var(--color-touch)]";

  if (!el) {
    return (
      <div className="space-y-2 text-sm">
        <p className="font-semibold">
          Escena {scene.index + 1} · {MOTION_TEMPLATE_LABEL[scene.template]}
        </p>
        <label className="flex items-center gap-2 text-xs">
          Dura
          <input
            type="number"
            min={2}
            max={8}
            step={0.1}
            className="w-20 rounded-md border border-line px-2 py-1"
            value={rawSeconds}
            onFocus={() => onBegin(`seconds-${scene.id}`)}
            onChange={(e) => onSeconds(Math.min(8, Math.max(2, Number(e.target.value) || 2)))}
          />
          s{Math.abs(rawSeconds - scene.seconds) > 0.01 && <span className="text-muted">(con los beats: {scene.seconds.toFixed(2)} s)</span>}
        </label>
        {tweaked && (
          <Button variant="secondary" className="px-2 py-1 text-xs" onClick={onClearScene}>
            Volver toda la escena a la plantilla
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2 text-sm">
      <p className="font-semibold">
        Escena {scene.index + 1} · {el.label}
      </p>
      <label className="flex items-center gap-2 text-xs">
        Entra a los
        <input
          type="number"
          min={0}
          max={Math.max(0, scene.seconds - 0.3)}
          step={0.05}
          className="w-20 rounded-md border border-line px-2 py-1"
          value={Number(el.at.toFixed(2))}
          onFocus={() => onBegin(`at-${scene.id}-${el.key}`)}
          onChange={(e) => onTweak(el.key, { at: Math.max(0, Number(e.target.value) || 0) })}
        />
        s de la escena
      </label>
      {el.move ? (
        <div className="grid grid-cols-3 gap-2 text-[11px] text-muted">
          <p className="col-span-3">Lugar en {format === "v" ? "9:16" : "16:9"} (el otro formato tiene el suyo):</p>
          {(
            [
              ["dx", "Horizontal", -0.6, 0.6, 0],
              ["dy", "Vertical", -0.9, 0.9, 0],
              ["scale", "Tamaño", 0.4, 2.5, 1],
            ] as const
          ).map(([k, label, min, max, base]) => (
            <label key={k} className="block">
              {label} {k === "scale" ? `${Math.round((tweak[format]?.scale ?? 1) * 100)}%` : ""}
              <input
                type="range"
                min={min}
                max={max}
                step={0.005}
                className={field}
                value={tweak[format]?.[k] ?? base}
                onPointerDown={() => onBegin(`slider-${scene.id}-${el.key}-${k}-${Date.now()}`)}
                onChange={(e) => onTweak(el.key, { [format]: { [k]: Number(e.target.value) } })}
              />
            </label>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted">{el.lane === "voice" ? "La voz se mueve solo en el tiempo." : "Este movimiento se cambia solo en el tiempo."}</p>
      )}
      {outside && <p className="text-xs font-semibold text-neg">Se sale del cuadro: en el celular no se va a leer entero.</p>}
      <div className="flex flex-wrap gap-2">
        {Object.keys(tweak).length > 0 && (
          <Button variant="secondary" className="px-2 py-1 text-xs" onClick={() => onClearTweak(el.key)}>
            Volver a como estaba
          </Button>
        )}
        {tweaked && (
          <Button variant="ghost" className="px-2 py-1 text-xs" onClick={onClearScene}>
            Volver toda la escena a la plantilla
          </Button>
        )}
      </div>
    </div>
  );
}
