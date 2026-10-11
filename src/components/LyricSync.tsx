// Lyric videos, "Sincronizar": sync by tapping, and the line editor (drag, nudge by frames, key words).
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { LyricLine } from "../../shared/lyrics.ts";
import { Button, inputClass } from "./ui.tsx";

const FRAME = 1 / 30;
// inputClass without its full width, for the small time fields.
const smallInput = inputClass.replace("w-full", "");

// Hand sync: the song plays and the person taps (or presses the space bar) when each line starts.
export function TapSync({
  texts,
  audio,
  onDone,
}: {
  texts: string[];
  audio: React.RefObject<HTMLAudioElement | null>;
  onDone: (starts: number[]) => void;
}) {
  const [starts, setStarts] = useState<number[] | null>(null);

  function begin() {
    const a = audio.current;
    if (!a) return;
    a.currentTime = 0;
    a.play().catch(() => undefined);
    setStarts([]);
  }

  function tap() {
    const a = audio.current;
    if (!a || !starts) return;
    const next = [...starts, a.currentTime];
    if (next.length >= texts.length) {
      setStarts(null);
      onDone(next);
    } else setStarts(next);
  }

  useEffect(() => {
    if (!starts) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" || (e.target as HTMLElement).tagName === "TEXTAREA" || (e.target as HTMLElement).tagName === "INPUT") return;
      e.preventDefault();
      tap();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!starts) {
    if (!texts.length) {
      return (
        <div className="space-y-2 rounded-xl border border-line bg-white p-4">
          <p className="text-sm font-semibold">Tocando</p>
          <p className="text-xs text-muted">Primero pegá la letra en "Canción y letra".</p>
        </div>
      );
    }
    return (
      <div className="space-y-2 rounded-xl border border-line bg-white p-4">
        <p className="text-sm font-semibold">Tocando</p>
        <p className="text-xs text-muted">
          Suena la canción desde el principio y tocás <b>Ahora</b> (o la barra espaciadora) justo cuando empieza cada línea. Sirve
          para cualquier idioma.
        </p>
        <Button variant="secondary" onClick={begin}>
          Empezar a tocar
        </Button>
      </div>
    );
  }
  const i = starts.length;
  return (
    <div className="space-y-3 rounded-xl border-2 border-ink bg-white p-4">
      <p className="text-xs text-muted">
        Línea {i + 1} de {texts.length}. Tocá cuando empiece:
      </p>
      <p className="text-lg font-bold">{texts[i]}</p>
      {texts[i + 1] && <p className="text-sm text-muted">Después: {texts[i + 1]}</p>}
      <div className="flex gap-2">
        <Button className="flex-1 py-4 text-base" onClick={tap}>
          Ahora
        </Button>
        <Button variant="secondary" onClick={() => setStarts(starts.slice(0, -1))} disabled={!i}>
          Deshacer
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            audio.current?.pause();
            setStarts(null);
          }}
        >
          Cancelar
        </Button>
      </div>
    </div>
  );
}

function stamp(t: number) {
  const s = Math.max(0, t);
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(2).padStart(5, "0")}`;
}

// One lane per line that overlaps another, so a long song does not stack every block on the same pixel.
function lineLanes(lines: { start: number; end: number }[]): number[] {
  const laneEnd: number[] = [];
  return lines.map((l) => {
    let lane = laneEnd.findIndex((end) => end <= l.start + 0.02);
    if (lane < 0) {
      lane = laneEnd.length;
      laneEnd.push(l.end);
    } else laneEnd[lane] = l.end;
    return lane;
  });
}

export function LineEditor({
  lines,
  duration,
  nudge,
  onNudge,
  onStart,
  onShift,
  onKey,
  onPlay,
}: {
  lines: LyricLine[];
  duration: number;
  nudge: number;
  onNudge: (n: number) => void;
  onStart: (i: number, start: number) => void;
  onShift: (delta: number) => void;
  onKey: (line: number, word: number) => void;
  onPlay: (t: number) => void;
}) {
  const [picked, setPicked] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const i = Math.min(picked, Math.max(0, lines.length - 1));
  const line = lines[i];
  const span = Math.max(duration, ...lines.map((l) => l.end), 1);
  const lanes = lineLanes(lines);
  const rows = lanes.length ? Math.max(...lanes) + 1 : 1;
  const px = 96;

  useEffect(() => {
    trackRef.current?.querySelector(`[data-line="${i}"]`)?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [i]);

  // The slider and the buttons share one offset, clamped to ±4 s, so they cannot drift apart.
  function applyNudge(next: number) {
    const clamped = Math.max(-4, Math.min(4, Math.round(next * 1000) / 1000));
    const delta = Math.round((clamped - nudge) * 1000) / 1000;
    onNudge(clamped);
    if (delta !== 0) onShift(delta);
  }

  function dragLine(index: number, event: ReactPointerEvent<HTMLButtonElement>) {
    const track = event.currentTarget.parentElement;
    if (!track) return;
    const originX = event.clientX;
    const origin = lines[index].start;
    const width = track.getBoundingClientRect().width || 1;
    setPicked(index);
    const move = (ev: PointerEvent) => onStart(index, Math.max(0, Math.min(span, origin + ((ev.clientX - originX) / width) * span)));
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  return (
    <div className="space-y-3 rounded-xl border border-line bg-white p-4">
      <div>
        <div className="mb-1 flex items-baseline justify-between gap-2">
          <p className="text-sm font-semibold">Correr toda la letra</p>
          <p className="font-mono text-xs text-muted">{nudge >= 0 ? "+" : ""}{nudge.toFixed(2)} s</p>
        </div>
        <input
          type="range"
          min={-4}
          max={4}
          step={FRAME}
          aria-label="Correr toda la letra"
          className="h-10 w-full cursor-ew-resize accent-ink"
          value={nudge}
          onChange={(e) => applyNudge(Number(e.target.value))}
        />
        <div className="mt-1 flex flex-wrap gap-1">
          <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => applyNudge(nudge - 0.5)}>−0.5 s</Button>
          <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => applyNudge(nudge - 0.1)}>−0.1 s</Button>
          <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => applyNudge(nudge - FRAME)}>−1 cuadro</Button>
          <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => applyNudge(nudge + FRAME)}>+1 cuadro</Button>
          <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => applyNudge(nudge + 0.1)}>+0.1 s</Button>
          <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => applyNudge(nudge + 0.5)}>+0.5 s</Button>
        </div>
      </div>

      <div>
        <p className="mb-1 text-xs text-muted">Arrastrá una línea en la canción. El slider de abajo afina la que está elegida, de a un cuadro.</p>
        <div ref={trackRef} className="overflow-x-auto rounded-lg bg-paper">
          <div className="relative" style={{ width: Math.max(span * px, 280), height: rows * 40 + 8 }}>
            {lines.map((l, n) => (
              <button
                key={n}
                type="button"
                data-line={n}
                title={`${n + 1}. ${l.text}`}
                aria-label={`Mover la línea ${n + 1}`}
                className={`absolute truncate rounded px-1.5 text-left text-[11px] leading-8 ${n === i ? "z-10 bg-ink text-white" : "bg-ink/15 text-ink hover:bg-ink/25"}`}
                style={{ left: l.start * px, width: Math.max(44, (l.end - l.start) * px), top: 4 + lanes[n] * 40, height: 32 }}
                onPointerDown={(e) => dragLine(n, e)}
              >
                {n + 1}. {l.text}
              </button>
            ))}
          </div>
        </div>
      </div>

      {line && (
        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <p className="min-w-0 truncate text-sm font-semibold">Línea {i + 1} · {line.text}</p>
            <p className="shrink-0 font-mono text-xs text-muted">{stamp(line.start)}</p>
          </div>
          <input
            type="range"
            min={0}
            max={span}
            step={FRAME}
            aria-label={`Empieza la línea ${i + 1}`}
            className="h-12 w-full cursor-ew-resize accent-ink"
            value={Math.min(span, line.start)}
            onChange={(e) => onStart(i, Number(e.target.value))}
          />
          <div className="flex flex-wrap items-center gap-1">
            <Button variant="ghost" className="px-2 py-1 text-xs" title="Escuchar desde acá" onClick={() => onPlay(Math.max(0, line.start - 0.4))}>▶</Button>
            <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => onStart(i, line.start - FRAME)}>−1 cuadro</Button>
            <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => onStart(i, line.start - 0.1)}>−0.1</Button>
            <input
              type="number"
              step={0.01}
              min={0}
              aria-label={`Segundos de la línea ${i + 1}`}
              className={`${smallInput} w-24 px-2 py-1 font-mono text-xs`}
              value={Number(line.start.toFixed(2))}
              onChange={(e) => onStart(i, Number(e.target.value))}
            />
            <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => onStart(i, line.start + 0.1)}>+0.1</Button>
            <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => onStart(i, line.start + FRAME)}>+1 cuadro</Button>
          </div>
        </div>
      )}

      <ol className="divide-y divide-line border-t border-line">
        {lines.map((l, n) => (
          <li key={n} className={`flex flex-wrap items-center gap-3 py-2 ${n === i ? "bg-paper/80" : ""}`}>
            <button type="button" className="w-16 shrink-0 text-left font-mono text-xs text-muted" onClick={() => setPicked(n)}>
              {stamp(l.start)}
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap gap-1">
                {l.words.map((w, wi) => (
                  <button
                    key={wi}
                    type="button"
                    onClick={() => {
                      setPicked(n);
                      onKey(n, wi);
                    }}
                    aria-pressed={w.key}
                    className={`rounded px-1 text-sm ${w.key ? "bg-touch-soft font-bold text-touch" : "hover:bg-black/5"}`}
                  >
                    {w.text}
                  </button>
                ))}
              </div>
              {l.second && <p className="text-xs text-muted">{l.second}</p>}
            </div>
          </li>
        ))}
      </ol>
      <p className="text-xs text-muted">Tocá una palabra para que salga más grande. Un cuadro es 1/30 de segundo.</p>
    </div>
  );
}
