import { useEffect, useRef, useState } from "react";
import {
  VOICE_MODES,
  VOICE_MODE_LABEL,
  speakingPrompt,
  type AudioSettings,
  type CharacterVoice,
  type VoiceMode,
} from "../../shared/audio.ts";
import { SHOT_LENGTHS, type Character, type Shot } from "../../shared/schema.ts";
import { Button, Spinner, inputClass } from "./ui.tsx";

export type AudioFile = { url: string; blob: Blob; name: string; duration: number };

// Reads a text aloud with the browser's own voice (free, no key), to hear a prompt or how long a line takes.
export function SpeakButton({ text, lang, label = "Escuchar" }: { text: string; lang: string; label?: string }) {
  const [speaking, setSpeaking] = useState(false);
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;
  useEffect(() => () => window.speechSynthesis?.cancel(), []);
  if (!supported || !text.trim()) return null;
  function toggle() {
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    setSpeaking(true);
    window.speechSynthesis.speak(u);
  }
  return (
    <button
      type="button"
      onClick={toggle}
      className="rounded px-2 py-1 text-xs font-semibold text-muted hover:bg-black/5 hover:text-ink"
      title={speaking ? "Parar" : "Leerlo en voz alta con la voz del navegador"}
    >
      {speaking ? "■ Parar" : `🔊 ${label}`}
    </button>
  );
}

// Duration of an audio file. Decoding is the reliable way: browser recordings often carry no duration.
export async function audioDuration(blob: Blob): Promise<number> {
  const ctx = new OfflineAudioContext(1, 1, 44100);
  const buffer = await ctx.decodeAudioData(await blob.arrayBuffer());
  return buffer.duration;
}

// Records the microphone while showing the line to read.
function Recorder({ line, onDone }: { line: string; onDone: (blob: Blob) => void }) {
  const [state, setState] = useState<"idle" | "recording" | "error">("idle");
  const [error, setError] = useState("");
  const recorder = useRef<MediaRecorder | null>(null);
  const started = useRef(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (state !== "recording") return;
    const timer = setInterval(() => setElapsed((Date.now() - started.current) / 1000), 200);
    return () => clearInterval(timer);
  }, [state]);

  async function start() {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        onDone(new Blob(chunks, { type: rec.mimeType || "audio/webm" }));
      };
      recorder.current = rec;
      started.current = Date.now();
      setElapsed(0);
      rec.start();
      setState("recording");
    } catch (e) {
      setState("error");
      setError(e instanceof Error && e.name === "NotAllowedError" ? "El navegador no dio permiso para el micrófono." : "No se pudo usar el micrófono.");
    }
  }

  function stop() {
    recorder.current?.stop();
    setState("idle");
  }

  if (state === "recording") {
    return (
      <div className="space-y-2 rounded-lg border-2 border-neg bg-neg-soft p-3">
        <p className="text-xs font-semibold text-neg">● Grabando · {elapsed.toFixed(1)} s · leé:</p>
        <p className="text-base font-semibold">“{line}”</p>
        <Button onClick={stop}>■ Parar</Button>
      </div>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button variant="secondary" className="px-3 py-1 text-xs" onClick={start}>
        ● Grabar
      </Button>
      {error && <span className="text-xs text-neg">{error}</span>}
    </span>
  );
}

function AudioSlot({
  label,
  file,
  onFile,
  onRemove,
}: {
  label: string;
  file?: AudioFile;
  onFile: (file: File) => void;
  onRemove: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {file ? (
        <>
          <audio src={file.url} controls className="h-8 max-w-56" />
          <span className="font-mono text-xs text-muted">{file.duration.toFixed(1)} s</span>
          <button type="button" onClick={onRemove} className="text-xs font-semibold text-muted hover:text-neg">
            Quitar
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="rounded px-2 py-1 text-xs font-semibold text-muted hover:bg-black/5 hover:text-ink"
        >
          {label}
        </button>
      )}
      <input
        ref={input}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
    </span>
  );
}

export type VoiceRowProps = {
  shot: Shot;
  index: number;
  speaker?: Character;
  language: "es" | "en";
  audio: AudioSettings;
  voice?: AudioFile;
  sfx?: AudioFile;
  voiceAvailable: boolean;
  onMode: (index: number, mode: VoiceMode) => void;
  onVoice: (index: number, blob: Blob, name: string) => Promise<void>;
  onGenerate: (index: number) => Promise<void>;
  onRemove: (index: number, kind: "voice" | "sfx") => void;
  onSfx: (index: number, blob: Blob, name: string) => Promise<void>;
  onSeconds: (index: number, seconds: number) => void;
};

// How this shot's line is heard, plus an optional sound effect.
export function VoiceRow(props: VoiceRowProps) {
  const { shot, index, speaker, language, audio, voice, sfx, voiceAvailable } = props;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const line = shot.voiceover.trim();
  const own = speaker ? audio.characters[speaker.id] : undefined;
  const mode: VoiceMode = !line ? "subtitles" : (audio.shots[index] ?? own?.mode ?? "subtitles");
  const tooLong = voice && voice.duration > shot.seconds - 0.2;
  const fits = voice ? SHOT_LENGTHS.find((l) => l >= voice.duration + 0.3) : undefined;

  async function act(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-line bg-paper/60 p-2.5">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-semibold">Voz</span>
        {line ? (
          <select
            value={mode}
            onChange={(e) => props.onMode(index, e.target.value as VoiceMode)}
            className="rounded border border-line bg-white px-1.5 py-0.5"
            aria-label="Cómo se escucha la línea"
          >
            {VOICE_MODES.map((m) => (
              <option key={m} value={m}>
                {VOICE_MODE_LABEL[m]}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-muted">sin línea</span>
        )}
        {line && <SpeakButton text={line} lang={language === "es" ? "es-AR" : "en-US"} label="Escuchar la línea" />}
        {busy && <Spinner />}
      </div>

      {mode === "grok" && line && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted">
            Grok dice la línea dentro del clip{own?.grokVoice ? ` con la voz ${own.grokVoice}` : ""}. Dejá "Sonido de los
            clips" en Mantener.
          </span>
          <CopyPrompt text={speakingPrompt(shot.videoPrompt, speaker?.name ?? "The character", line, own?.grokVoice ?? "", language)} />
        </div>
      )}

      {mode === "generated" && line && (
        <div className="flex flex-wrap items-center gap-2">
          {voiceAvailable ? (
            <Button variant="secondary" className="px-3 py-1 text-xs" disabled={busy} onClick={() => act(() => props.onGenerate(index))}>
              {voice ? "Generar de nuevo" : "Generar voz"}
            </Button>
          ) : (
            <span className="text-xs text-muted">Para la voz generada falta OPENAI_API_KEY en .env.</span>
          )}
          {voice && <AudioSlot label="" file={voice} onFile={() => undefined} onRemove={() => props.onRemove(index, "voice")} />}
        </div>
      )}

      {mode === "recorded" && line && (
        <div className="flex flex-wrap items-center gap-2">
          {!voice && <Recorder line={line} onDone={(blob) => act(() => props.onVoice(index, blob, `toma-${index + 1}-grabada`))} />}
          <AudioSlot
            label="Subir audio"
            file={voice}
            onFile={(f) => act(() => props.onVoice(index, f, f.name))}
            onRemove={() => props.onRemove(index, "voice")}
          />
        </div>
      )}

      {tooLong && voice && (
        <p className="text-xs text-neg">
          La voz dura {voice.duration.toFixed(1)} s y la toma {shot.seconds} s: se corta.{" "}
          {fits && fits !== shot.seconds && (
            <button type="button" className="font-semibold underline" onClick={() => props.onSeconds(index, fits)}>
              Pasarla a {fits} s
            </button>
          )}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-semibold">Efecto de sonido</span>
        <AudioSlot
          label="Subir efecto"
          file={sfx}
          onFile={(f) => act(() => props.onSfx(index, f, f.name))}
          onRemove={() => props.onRemove(index, "sfx")}
        />
      </div>
      {error && <p className="text-xs text-neg">{error}</p>}
    </div>
  );
}

function CopyPrompt({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      variant="secondary"
      className="px-3 py-1 text-xs"
      onClick={async () => {
        await navigator.clipboard.writeText(text).catch(() => undefined);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
      title={text}
    >
      {done ? "Copiado ✓" : "Copiar prompt de video con voz"}
    </Button>
  );
}

// Each character's voice: how their lines are heard by default, their Grok voice and their generated voice.
export function VoicesPanel({
  characters,
  audio,
  defaultTtsVoice,
  onChange,
}: {
  characters: Character[];
  audio: AudioSettings;
  defaultTtsVoice: string;
  onChange: (id: string, voice: CharacterVoice) => void;
}) {
  return (
    <div className="space-y-3 rounded-xl border border-line bg-white p-4">
      <div>
        <p className="text-sm font-semibold">Voces</p>
        <p className="mt-1 text-xs text-muted">
          Cómo se escucha cada personaje. Cada toma puede cambiarlo. Los subtítulos salen siempre.
        </p>
      </div>
      <ul className="space-y-3">
        {characters.map((c) => {
          const v: CharacterVoice = audio.characters[c.id] ?? { mode: "subtitles", grokVoice: "", ttsVoice: "" };
          const set = (patch: Partial<CharacterVoice>) => onChange(c.id, { ...v, ...patch });
          return (
            <li key={c.id} className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <b className="text-sm">{c.name}</b>
                <select
                  value={v.mode}
                  onChange={(e) => set({ mode: e.target.value as VoiceMode })}
                  className="rounded border border-line bg-white px-1.5 py-0.5"
                  aria-label={`Voz de ${c.name}`}
                >
                  {VOICE_MODES.map((m) => (
                    <option key={m} value={m}>
                      {VOICE_MODE_LABEL[m]}
                    </option>
                  ))}
                </select>
              </div>
              {v.mode === "grok" && (
                <input
                  className={`${inputClass} py-1 text-xs`}
                  value={v.grokVoice}
                  placeholder="Voz en Grok (panel Audio), ej. Eve"
                  aria-label={`Voz de Grok de ${c.name}`}
                  onChange={(e) => set({ grokVoice: e.target.value })}
                />
              )}
              {v.mode === "generated" && (
                <input
                  className={`${inputClass} py-1 text-xs`}
                  value={v.ttsVoice}
                  placeholder={`Voz generada (por defecto: ${defaultTtsVoice})`}
                  aria-label={`Voz generada de ${c.name}`}
                  onChange={(e) => set({ ttsVoice: e.target.value })}
                />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
