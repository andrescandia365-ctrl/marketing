// The Reloj tab: drums + lyrics become sync/, and the mute preview shows the kick, the word and the accent.
import { useEffect, useRef, useState } from "react";
import { activeMove, activeWord, coincidence, encodeWav, nearestKick, type SyncDoc } from "../../shared/clock.ts";
import type { LyricLanguage } from "../../shared/lyrics.ts";
import type { Brand } from "../../shared/series.ts";
import { api } from "../lib/api.ts";
import { drawSyncFrame } from "../../shared/syncDraw.ts";
import { Button, Field, Notice } from "./ui.tsx";

type Loaded = { sync: SyncDoc; qa: string };
type Report = { score: number; passed: boolean; worst: { t: number; problem: string; fix: string }[] };

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function fileToWav(file: Blob): Promise<Blob> {
  const ctx = new AudioContext();
  try {
    const audio = await ctx.decodeAudioData(await file.arrayBuffer());
    const left = audio.getChannelData(0);
    const right = audio.numberOfChannels > 1 ? audio.getChannelData(1) : null;
    const samples = new Float32Array(audio.length);
    for (let i = 0; i < audio.length; i++) samples[i] = right ? (left[i] + right[i]) * 0.5 : left[i];
    const wav = encodeWav(samples, audio.sampleRate);
    return new Blob([wav.buffer as ArrayBuffer], { type: "audio/wav" });
  } finally {
    await ctx.close();
  }
}

export function ClockPanel({
  projectId,
  lyrics,
  language,
  song,
  brand,
}: {
  projectId: string | null;
  lyrics: string;
  language: LyricLanguage;
  song: { blob: Blob; name: string } | null;
  brand: Brand;
}) {
  const [drumsFile, setDrumsFile] = useState<File | null>(null);
  const [vocalsFile, setVocalsFile] = useState<File | null>(null);
  const [moves, setMoves] = useState("");
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [t, setT] = useState(0);
  const [busy, setBusy] = useState<null | "arm" | "critique">(null);
  const [error, setError] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!projectId) return;
    let live = true;
    api
      .readClock(projectId)
      .then((found) => {
        if (!live || !found) return;
        setLoaded(found);
        const at = coincidence(found.sync);
        if (at != null) setT(at);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [projectId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const sync = loaded?.sync;
    if (!canvas || !sync) return;
    const w = 240;
    const h = 426;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rgba = new Uint8Array(w * h * 4);
    drawSyncFrame(rgba, w, h, t, sync, brand);
    ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba.buffer), w, h), 0, 0);
  }, [loaded, t, brand]);

  const sync = loaded?.sync ?? null;
  const end = sync ? (sync.grid.kicks.at(-1) ?? 0) + sync.grid.period : 0;
  const kick = sync ? nearestKick(sync, t) : null;
  const word = sync ? activeWord(sync, t) : null;
  const move = sync ? activeMove(sync, t) : null;
  const status = sync
    ? `${kick != null ? `kick ${kick.toFixed(3)} s` : "sin kick"} · ${word ? word.text : "sin palabra"} · ${move ? move.move : "sin acento"}`
    : "";

  async function arm() {
    if (!projectId) return;
    setBusy("arm");
    setError("");
    setReport(null);
    try {
      const result = await api.buildClock(projectId, {
        lyrics,
        moves,
        language,
        master: song ? await fileToWav(song.blob) : null,
        drums: drumsFile ? await fileToWav(drumsFile) : null,
        vocals: vocalsFile ? await fileToWav(vocalsFile) : null,
      });
      setLoaded(result);
      const at = coincidence(result.sync);
      if (at != null) setT(at);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(null);
    }
  }

  async function critic() {
    if (!projectId) return;
    setBusy("critique");
    setError("");
    try {
      const result = await api.critiqueClock(projectId, brand);
      setReport(result);
      setLoaded({ sync: result.applied, qa: result.qa });
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        El corte y el acento del cuerpo van en el kick, medido en el stem de batería. La palabra entra en su t, alineada en la voz, y no se
        mueve al beat.
      </p>
      {!projectId && <Notice tone="warn">La carpeta del proyecto todavía no está lista.</Notice>}
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Stem de batería" hint="WAV, mp3 o m4a. Si no lo subís, el master se separa con Demucs. El beat no se mide en el master.">
          <input
            type="file"
            accept="audio/*,.wav"
            aria-label="Stem de batería"
            className="text-sm"
            onChange={(e) => setDrumsFile(e.target.files?.[0] ?? null)}
          />
        </Field>
        <Field label="Stem de voz" hint="La letra se alinea acá. Sin este stem el gate queda en 0 y no se inventan tiempos.">
          <input
            type="file"
            accept="audio/*,.wav"
            aria-label="Stem de voz"
            className="text-sm"
            onChange={(e) => setVocalsFile(e.target.files?.[0] ?? null)}
          />
        </Field>
        <Field label="Acentos" hint="Uno por línea, en orden: step, hit, land, turn. Vacío: un acento propuesto por downbeat.">
          <textarea
            className="w-full rounded-lg border border-line bg-white px-3 py-2 font-mono text-sm outline-none focus:border-ink"
            rows={6}
            aria-label="Acentos"
            value={moves}
            onChange={(e) => setMoves(e.target.value)}
          />
        </Field>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void arm()} disabled={!projectId || busy !== null || !lyrics.trim() || (!song && !drumsFile)}>
          {busy === "arm" ? "Armando el reloj…" : "Armar reloj"}
        </Button>
        <Button variant="secondary" onClick={() => void critic()} disabled={!projectId || !sync || busy !== null}>
          {busy === "critique" ? "Mirando los cuadros…" : "Crítica"}
        </Button>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      {sync && loaded && (
        <div className="grid items-start gap-4 md:grid-cols-[240px_1fr]">
          <div className="space-y-2">
            <canvas ref={canvasRef} className="w-full max-w-[240px] rounded-2xl border border-line" aria-label="Preview mudo del reloj" />
            <input
              type="range"
              aria-label="Tiempo del preview"
              min={0}
              max={Math.max(end, 0.1)}
              step={1 / sync.grid.fps}
              value={Math.min(t, Math.max(end, 0.1))}
              onChange={(e) => setT(Number(e.target.value))}
              className="w-full max-w-[240px]"
            />
            <p className="font-mono text-xs" data-testid="reloj-estado">
              {status}
            </p>
            <Button
              variant="secondary"
              className="px-3 py-1 text-xs"
              onClick={() => {
                const at = coincidence(sync);
                if (at != null) setT(at);
              }}
            >
              En el acento
            </Button>
          </div>
          <div className="space-y-3">
            <p className="font-mono text-lg" data-testid="reloj-gate">
              Gate {sync.lyric_gate}
            </p>
            <pre className="whitespace-pre-wrap rounded-xl border border-line bg-white p-3 font-mono text-xs" data-testid="reloj-qa">
              {loaded.qa}
            </pre>
            {report && (
              <div className="space-y-2 rounded-xl border border-line bg-white p-3 text-sm">
                <p className="font-semibold">Crítica {report.score}/10</p>
                {report.passed ? (
                  <p>El plano pasa. El gate está completo y los acentos caen en el kick.</p>
                ) : (
                  <ul className="space-y-2">
                    {report.worst.map((fix, i) => (
                      <li key={`${fix.t}-${i}`}>
                        <b>{fix.t.toFixed(3)} s.</b> {fix.problem} {fix.fix}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
