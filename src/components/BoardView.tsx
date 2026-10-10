import { useEffect, useMemo, useRef, useState } from "react";
import { actionWords, runnerLandings, type Problem } from "../../shared/checks.ts";
import { sketchPrompt } from "../../shared/prompt.ts";
import type { Board, Brief, Story } from "../../shared/schema.ts";
import type { TextStyle } from "../../shared/series.ts";
import { formatTime, timeShots, totalSeconds, type TimedShot } from "../../shared/template.ts";
import { drawShot, loadImage, type Speaker } from "../lib/render.ts";
import { sketchSetups, type SketchSetup } from "../lib/sketch.ts";
import { copyText } from "../lib/files.ts";
import { ChecksPanel } from "./Checks.tsx";
import { Button, PieceTitle, ROLE_TEXT, Segmented, Spinner, inputClass } from "./ui.tsx";

type Props = {
  story: Story;
  board: Board;
  round: number;
  busy: "revise" | "fix" | null;
  problems: Problem[];
  dismissed: number;
  // How the finished piece looks: format, the series' text style and each shot's picture so far.
  look: Look;
  onRevise: (note: string, shotNotes: { index: number; note: string }[]) => Promise<boolean>;
  onFix: () => void;
  onDismiss: (problem: Problem) => void;
  onApprove: () => void;
  // "Boceto con IA": a sketch made with an image tool, uploaded for one shot, or removed.
  onSketch: (index: number, file: File) => Promise<void>;
  onSketchRemove: (index: number) => void;
};

const BAR = { negative: "bg-neg", touching: "bg-touch", good: "bg-good" };
// The beat colours and the action warning live in shotBits.tsx (light: production uses them without the renderer).
import { ActionWarning, BEAT_EDGE } from "./shotBits.tsx";
export { ActionWarning, BEAT_EDGE };

type Look = {
  format: Brief["format"];
  style: TextStyle;
  images: Record<number, string | undefined>;
  // The drawn storyboard: sketches made with an image tool, by shot, and the kind of each cast member (to draw it).
  sketches: Record<number, string | undefined>;
  castKinds: Record<string, string>;
};

// "Boceto con IA" for one shot: copy the sketch prompt for Grok (or any image tool), then upload what it made.
function SketchTools({ prompt, uploaded, onFile, onRemove }: { prompt: string; uploaded: boolean; onFile: (file: File) => Promise<void>; onRemove: () => void }) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      <button
        type="button"
        className="font-semibold text-muted hover:text-ink"
        title={prompt}
        onClick={async () => {
          await copyText(prompt);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? "Copiado" : "Prompt de boceto"}
      </button>
      <label className="cursor-pointer font-semibold text-muted hover:text-ink">
        {busy ? <Spinner /> : uploaded ? "Cambiar boceto" : "Subir boceto"}
        <input
          type="file"
          accept="image/*"
          className="hidden"
          aria-label="Subir boceto"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            setBusy(true);
            setError("");
            try {
              await onFile(file);
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err));
            } finally {
              setBusy(false);
            }
          }}
        />
      </label>
      {uploaded && (
        <button type="button" className="font-semibold text-muted hover:text-neg" onClick={onRemove}>
          Quitar boceto
        </button>
      )}
      {error && <span className="text-neg">{error}</span>}
    </div>
  );
}

const ICON_TITLE = { transform: "Transformación (imagen inicial y final)", screen: "Pantalla real (captura de la app)" };

// One shot as it will look on the phone: its picture (or the cast's approved image, or its colour card), the headline
// and the line, drawn by the same code as the final video.
function ShotFrame({
  shot,
  image,
  sketch,
  speakers,
  look,
  className = "",
}: {
  shot: TimedShot;
  image: HTMLImageElement | null;
  // With no picture, the shot is drawn as a pencil sketch of these setups.
  sketch: SketchSetup[] | null;
  speakers: Record<string, Speaker>;
  look: Look;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const vertical = look.format === "vertical";
  const [w, h] = vertical ? [270, 480] : [480, 270];
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    // A continuous take shows its first line; a one-line shot, the middle of its line.
    const t = shot.timeline.length ? shot.start + (shot.timeline.find((b) => b.line)?.from ?? 0) + 0.01 : (shot.start + shot.end) / 2;
    const draw = () => drawShot(ctx, shot, image, speakers, t, { disclosure: "", fullFrame: false, headlines: true, style: look.style, sketch });
    draw();
    // Canvas text needs the web font; draw again once it is there.
    document.fonts?.load(`600 24px "IBM Plex Sans"`).then(draw, () => undefined);
  }, [shot, image, sketch, speakers, look.format, look.style]);
  return (
    <canvas
      ref={ref}
      width={w}
      height={h}
      aria-label={`Toma ${shot.index + 1}: ${shot.title}`}
      className={`block w-full rounded-[1.1rem] border-[5px] border-ink bg-black ${className}`}
    />
  );
}

// "Ver la pieza": the shots one after the other at their real length, with the lines, before anything is produced.
function Playback({
  shots,
  images,
  sketches,
  speakers,
  look,
  onClose,
}: {
  shots: TimedShot[];
  images: Record<number, HTMLImageElement | null>;
  // By shot: the sketch to draw when there is no picture (null: the colour card).
  sketches: Record<number, SketchSetup[] | null>;
  speakers: Record<string, Speaker>;
  look: Look;
  onClose: () => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [playing, setPlaying] = useState(true);
  const [voice, setVoice] = useState(true);
  const [t, setT] = useState(0);
  const tRef = useRef(0);
  tRef.current = t;
  const clock = useRef({ base: 0, at: performance.now() });
  const spokenShot = useRef("");
  const total = shots.length ? shots[shots.length - 1].end : 0;
  const vertical = look.format === "vertical";

  useEffect(() => {
    clock.current = { base: tRef.current, at: performance.now() };
    if (!playing) window.speechSynthesis?.cancel();
  }, [playing]);

  useEffect(() => {
    let frame = 0;
    const tick = () => {
      const now = playing ? Math.min(total, clock.current.base + (performance.now() - clock.current.at) / 1000) : tRef.current;
      const shot = shots.find((s) => now >= s.start && now < s.end) ?? shots[shots.length - 1];
      const ctx = ref.current?.getContext("2d");
      if (ctx && shot)
        drawShot(ctx, shot, images[shot.index] ?? null, speakers, now, { disclosure: "", fullFrame: false, headlines: true, style: look.style, sketch: sketches[shot.index] ?? null });
      // A continuous take reads each beat's line when the beat starts; a one-line shot, its line.
      const beatIndex = shot ? shot.timeline.findIndex((b) => now - shot.start >= b.from && now - shot.start < b.to) : -1;
      const key = shot ? `${shot.index}:${beatIndex}` : "";
      if (playing && shot && spokenShot.current !== key) {
        spokenShot.current = key;
        const text = shot.timeline.length ? (shot.timeline[beatIndex]?.line ?? "") : shot.voiceover;
        if (voice && "speechSynthesis" in window) {
          window.speechSynthesis.cancel();
          if (text.trim()) {
            const u = new SpeechSynthesisUtterance(text);
            u.lang = "es-AR";
            window.speechSynthesis.speak(u);
          }
        }
      }
      if (playing) {
        setT(now);
        if (now >= total) setPlaying(false);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, voice, shots, images, sketches, speakers, look.style, total]);

  useEffect(() => () => window.speechSynthesis?.cancel(), []);

  function seek(to: number) {
    setT(to);
    clock.current = { base: to, at: performance.now() };
    spokenShot.current = "";
    window.speechSynthesis?.cancel();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4" role="dialog" aria-label="Ver la pieza">
      <div className="flex max-h-full w-full max-w-4xl flex-col items-center gap-3">
        <canvas
          ref={ref}
          width={vertical ? 540 : 960}
          height={vertical ? 960 : 540}
          className={`rounded-xl bg-black ${vertical ? "h-[75vh] w-auto" : "w-full"}`}
        />
        <input
          type="range"
          min={0}
          max={total}
          step={0.1}
          value={t}
          aria-label="Momento de la pieza"
          className="w-full max-w-xl"
          onChange={(e) => seek(Number(e.target.value))}
        />
        <div className="flex flex-wrap items-center gap-2 text-sm text-white">
          <Button variant="secondary" onClick={() => (t >= total ? (seek(0), setPlaying(true)) : setPlaying((p) => !p))}>
            {playing ? "Pausa" : t >= total ? "De nuevo" : "Seguir"}
          </Button>
          <span className="font-mono">
            {formatTime(t)} / {formatTime(total)}
          </span>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={voice} onChange={(e) => setVoice(e.target.checked)} />
            Leer las líneas (voz del navegador)
          </label>
          <Button variant="ghost" className="text-white hover:bg-white/10" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </div>
    </div>
  );
}

// Step 3: the whole board as the finished piece will look, with a note box on every shot, before an image is made.
function RunnerMark({ story }: { story: Story }) {
  const lands = runnerLandings(story);
  if (!lands.length) return null;
  const missed = lands.filter((land) => !land.hit || land.quotes.length === 0).length;
  const same = lands.some((land) => land.same);
  if (missed === 0 && !same) return <b className="text-good"> · las tres caen</b>;
  return (
    <b className="text-neg">
      {missed > 0 ? ` · ${missed} ${missed === 1 ? "caída" : "caídas"} sin línea` : ""}
      {same ? " · una caída se repite" : ""}
    </b>
  );
}

export function BoardView({ story, board, round, busy, problems, dismissed, look, onRevise, onFix, onDismiss, onApprove, onSketch, onSketchRemove }: Props) {
  // Bocetos: the drawn storyboard (uploaded sketches, else the app's pencil sketch). Imágenes: the pictures so far.
  const [view, setView] = useState<"sketch" | "image">("sketch");
  const [sketchImages, setSketchImages] = useState<Record<number, HTMLImageElement | null>>({});
  const sketchKey = JSON.stringify(look.sketches);
  const [note, setNote] = useState("");
  const [shotNotes, setShotNotes] = useState<Record<number, string>>({});
  const [playing, setPlaying] = useState(false);
  const [images, setImages] = useState<Record<number, HTMLImageElement | null>>({});
  const cast = Object.fromEntries(story.characters.map((c) => [c.id, c]));
  const speakers = useMemo(
    () => Object.fromEntries(story.characters.map((c) => [c.id, { name: c.name, role: c.role }])) as Record<string, Speaker>,
    [story.characters],
  );
  const topics = Object.fromEntries(story.topics.map((t, i) => [t.id, i + 1]));
  const setups = Object.fromEntries(board.setups.map((s) => [s.id, s]));
  const shots = useMemo(() => timeShots(board.shots), [board.shots]);
  const total = totalSeconds(board.shots);
  const flagged = new Set(problems.map((p) => p.shot).filter((n) => n !== undefined));
  const pending = Object.entries(shotNotes)
    .filter(([, v]) => v.trim())
    .map(([k, v]) => ({ index: Number(k), note: v.trim() }));
  const imageKey = JSON.stringify(look.images);
  const drawn = useMemo(
    () => Object.fromEntries(shots.map((s) => [s.index, sketchSetups(s, setups, look.castKinds)])) as Record<number, SketchSetup[]>,
    // setups and castKinds are rebuilt on every render; the board's setups and shots decide them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shots, board.setups, JSON.stringify(look.castKinds)],
  );
  const frameImages = view === "sketch" ? sketchImages : images;
  const frameSketches = view === "sketch" ? drawn : {};

  useEffect(() => {
    let alive = true;
    Promise.all(Object.entries(look.sketches).map(async ([i, src]) => [Number(i), await loadImage(src)] as const)).then((list) => {
      if (alive) setSketchImages(Object.fromEntries(list));
    });
    return () => {
      alive = false;
    };
    // sketchKey stands in for look.sketches, rebuilt on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sketchKey]);

  // The pictures the frames show, loaded once per change.
  useEffect(() => {
    let alive = true;
    Promise.all(Object.entries(look.images).map(async ([i, src]) => [Number(i), await loadImage(src)] as const)).then((list) => {
      if (alive) setImages(Object.fromEntries(list));
    });
    return () => {
      alive = false;
    };
    // imageKey stands in for look.images, which is rebuilt on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageKey]);

  // The topics as a band over time, with where each callback is planted and paid off.
  const topicSpans = story.topics.map((t, i) => {
    const own = shots.filter((s) => s.topic === t.id);
    const seconds = own.reduce((n, s) => n + s.seconds, 0);
    return { id: t.id, n: i + 1, title: t.title, seconds };
  });

  async function revise() {
    if (await onRevise(note.trim(), pending)) {
      setNote("");
      setShotNotes({});
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-xs text-muted">Storyboard · ronda {round}</p>
          <PieceTitle problem={story.problem} title={story.title} />
          <p className="text-sm text-muted">
            {board.shots.length} tomas · {formatTime(total)} · estilo: {board.style}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            value={view}
            onChange={setView}
            options={[
              { value: "sketch", label: "Bocetos" },
              { value: "image", label: "Imágenes" },
            ]}
          />
          <Button onClick={() => setPlaying(true)} disabled={!shots.length}>
            ▶ Ver la pieza
          </Button>
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex overflow-hidden rounded-lg text-xs font-semibold text-white">
          {topicSpans
            .filter((t) => t.seconds > 0)
            .map((t) => (
              <div
                key={t.id}
                className="truncate border-r border-white/40 bg-ink px-2 py-1.5 last:border-r-0"
                style={{ width: `${(t.seconds / total) * 100}%` }}
                title={t.title}
              >
                Tema {t.n} · {t.title}
              </div>
            ))}
        </div>
        <div className="flex h-2 overflow-hidden rounded-full">
          {shots.map((s) => (
            <div
              key={s.index}
              className={`${BAR[s.beat]} border-r border-white/70 last:border-r-0`}
              style={{ width: `${(s.seconds / total) * 100}%` }}
            />
          ))}
        </div>
        {story.callbacks.length > 0 && (
          <p className="text-xs text-muted">
            <b className="text-ink">Callbacks: </b>
            {story.callbacks.map((c) => `${c.planted} → ${c.payoff}`).join(" · ")}
          </p>
        )}
        {(story.runner?.bit || story.tease?.trim()) && (
          <div className="space-y-1 rounded-lg border border-line bg-paper px-2.5 py-1.5">
            {story.runner?.bit && (
              <p className="text-xs text-muted">
                <b className="text-ink">Corredor ({story.runner.bit}): </b>
                {story.runner.open} · {story.runner.middle} · {story.runner.tag}
                <RunnerMark story={story} />
              </p>
            )}
            {story.tease?.trim() && (
              <p className="text-xs text-muted">
                <b className="text-ink">Para el próximo: </b>
                {story.tease}
              </p>
            )}
          </div>
        )}
      </div>

      <ol className={`grid gap-4 ${look.format === "vertical" ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5" : "sm:grid-cols-2 lg:grid-cols-3"}`}>
        {shots.map((s) => {
          const who = cast[s.speaker];
          const prevTopic = s.index > 0 ? shots[s.index - 1].topic : null;
          const action = actionWords([s.visualPrompt, s.middlePrompt, s.endPrompt].join(" "));
          return (
            <li key={s.index} className="flex flex-col gap-2">
              {s.topic !== prevTopic && (
                <span className="self-start rounded bg-ink px-1.5 py-0.5 text-xs font-semibold text-white">
                  Tema {topics[s.topic] ?? s.topic}
                </span>
              )}
              <div className={`rounded-[1.4rem] ${flagged.has(s.index) ? "ring-4 ring-neg/50" : ""}`}>
                <ShotFrame shot={s} image={frameImages[s.index] ?? null} sketch={frameSketches[s.index] ?? null} speakers={speakers} look={look} />
              </div>
              {view === "sketch" && s.kind !== "screen" && (
                <SketchTools
                  prompt={sketchPrompt(s.visualPrompt, look.format)}
                  uploaded={Boolean(look.sketches[s.index])}
                  onFile={(file) => onSketch(s.index, file)}
                  onRemove={() => onSketchRemove(s.index)}
                />
              )}
              <div className={`border-l-4 pl-2 ${BEAT_EDGE[s.beat]}`}>
                <p className="text-sm leading-snug font-bold">
                  {s.index + 1}. {s.title}
                </p>
                <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                  <span>{s.seconds} s</span>
                  {who && s.voiceover && <span className={`font-semibold ${ROLE_TEXT[who.role]}`}>{who.name}</span>}
                  {s.kind !== "single" && (
                    <span title={ICON_TITLE[s.kind]} aria-label={ICON_TITLE[s.kind]}>
                      {s.kind === "transform" ? "⇄" : "▣"}
                    </span>
                  )}
                  {s.editFrom > 0 && <span title={s.editPrompt}>✎ edita la {s.editFrom}</span>}
                  {s.timeline.length > 0 && <span className="rounded bg-ink px-1 text-white">toma continua</span>}
                  {s.disclosure !== "none" && (
                    <span className="rounded border border-line px-1">{s.disclosure === "concept" ? "Concepto" : "Simulación"}</span>
                  )}
                  {action.length > 0 && (
                    <span className="rounded bg-amber-100 px-1 text-amber-900" title={`Acción en la imagen: ${action.join(", ")}`}>
                      ⚠ acción
                    </span>
                  )}
                </p>
              </div>
              <details className="text-xs">
                <summary className="cursor-pointer text-muted">Ver detalles</summary>
                <div className="mt-1.5 space-y-1.5">
                  <p className="text-muted">{s.action}</p>
                  {s.timeline.length > 0 ? (
                    <ol className="space-y-0.5">
                      {s.timeline.map((b, i) => (
                        <li key={i}>
                          <span className="font-mono text-muted">
                            {b.from.toFixed(1)}–{b.to.toFixed(1)} s
                          </span>{" "}
                          {b.line && (
                            <>
                              <b>{cast[b.speaker]?.name ?? b.speaker}</b> ({b.emotion}): “{b.line}” ·{" "}
                            </>
                          )}
                          <span className="text-muted">{b.action}</span>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    s.voiceover && (
                      <p>
                        <b>{who?.name ?? "—"}:</b> “{s.voiceover}”
                      </p>
                    )
                  )}
                  {s.onScreenText && (
                    <p>
                      Headline: <b>{s.onScreenText}</b>
                    </p>
                  )}
                  <p>
                    <b>En cuadro: </b>
                    {s.setups.map((id) => setups[id]?.name ?? id).join(" + ") || "—"}
                  </p>
                  {s.kind === "screen" ? (
                    <p className="text-muted">Captura real: {s.screen}</p>
                  ) : (
                    <p className="text-muted">
                      {s.kind === "transform" && <b className="text-ink">Inicial: </b>}
                      {s.kind === "transform" && s.screenAt === "start" ? `captura real (${s.screen}), no se genera` : s.visualPrompt}
                      {s.kind === "transform" && s.middlePrompt && (
                        <>
                          <br />
                          <b className="text-ink">Intermedia: </b>
                          {s.middlePrompt}
                        </>
                      )}
                      {s.kind === "transform" && (
                        <>
                          <br />
                          <b className="text-ink">Final: </b>
                          {s.screenAt === "end" ? `captura real (${s.screen}), no se genera` : s.endPrompt}
                        </>
                      )}
                    </p>
                  )}
                  <ActionWarning prompt={[s.visualPrompt, s.middlePrompt, s.endPrompt].join(" ")} />
                </div>
              </details>
              <input
                className={`${inputClass} mt-auto py-1.5 text-xs`}
                placeholder="Nota para esta toma"
                aria-label={`Nota para la toma ${s.index + 1}`}
                value={shotNotes[s.index] ?? ""}
                onChange={(e) => setShotNotes((n) => ({ ...n, [s.index]: e.target.value }))}
              />
            </li>
          );
        })}
      </ol>

      {playing && <Playback shots={shots} images={frameImages} sketches={frameSketches} speakers={speakers} look={look} onClose={() => setPlaying(false)} />}

      <ChecksPanel
        problems={problems}
        dismissed={dismissed}
        fixing={busy === "fix"}
        disabled={busy !== null}
        onFix={onFix}
        onDismiss={onDismiss}
      />

      <div className="space-y-3 rounded-xl border border-ink/20 bg-white p-4">
        <label className="block">
          <span className="text-sm font-semibold">Nota para todo el storyboard</span>
          <span className="block text-xs text-muted">
            Junto con las notas de cada toma, la IA revisa el storyboard entero ({pending.length} nota
            {pending.length === 1 ? "" : "s"} de tomas).
          </span>
          <textarea
            className={`${inputClass} mt-1.5`}
            rows={2}
            value={note}
            placeholder="ej. el Malo tiene que verse igual en todas las tomas; menos tomas de producto"
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={revise} disabled={busy !== null || (!note.trim() && pending.length === 0)}>
            {busy === "revise" ? (
              <>
                <Spinner /> Revisando…
              </>
            ) : (
              "Revisar storyboard"
            )}
          </Button>
          <Button
            onClick={onApprove}
            disabled={busy !== null || problems.length > 0}
            title={problems.length > 0 ? "Primero resolvé los problemas del check" : undefined}
          >
            Aprobar → producción
          </Button>
        </div>
      </div>
    </div>
  );
}
