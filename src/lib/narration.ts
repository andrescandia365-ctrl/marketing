// A narration made outside the app (ElevenLabs, or any recording) brought in as ONE file and cut into one part per
// line. With OpenAI's transcription the lines are found by their words (the lyric-video aligner); without it, by the
// pauses between them. Every cut lands on the quietest moment near the boundary, so no word is chopped.
import { api } from "./api.ts";
import { toWav } from "./motionAudio.ts";

export type NarrationLine = {
  // Where the part goes: a shot index or a scene id.
  key: string;
  // "Toma 3", "Escena 2".
  label: string;
  speaker: string;
  text: string;
  emotion: string;
};

export type NarrationPart = {
  key: string;
  start: number;
  end: number;
  blob: Blob;
  duration: number;
  // false: the cut did not land in a clear pause; worth a listen.
  sure: boolean;
};

// The script to paste into ElevenLabs: one line per paragraph, in order. With emotions, each goes first in square
// brackets (ElevenLabs reads bracketed directions in some of its models [NOT SURE which]; without them it is the plain text).
export function narrationText(lines: NarrationLine[], emotions: boolean, speakers: boolean): string {
  return lines
    .map((l) => {
      const who = speakers && l.speaker ? `${l.speaker}: ` : "";
      const how = emotions && l.emotion.trim() ? `[${l.emotion.trim()}] ` : "";
      return `${who}${how}${l.text.trim()}`;
    })
    .join("\n\n");
}

const FRAME = 0.01;

// Loudness every 10 ms (mono mix).
function envelope(buffer: AudioBuffer): Float32Array {
  const hop = Math.max(1, Math.round(buffer.sampleRate * FRAME));
  const frames = Math.floor(buffer.length / hop);
  const out = new Float32Array(frames);
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    for (let i = f * hop; i < (f + 1) * hop; i++) {
      let v = 0;
      for (const ch of channels) v += ch[i];
      v /= channels.length;
      sum += v * v;
    }
    out[f] = Math.sqrt(sum / hop);
  }
  return out;
}

function speechLevel(env: Float32Array): number {
  const sorted = [...env].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length * 0.9)] || 1e-6;
}

// The quietest 10 ms frame in [from, to] seconds.
function quietest(env: Float32Array, from: number, to: number): number {
  const a = Math.max(0, Math.floor(from / FRAME));
  const b = Math.min(env.length - 1, Math.ceil(to / FRAME));
  let best = a;
  for (let f = a; f <= b; f++) if (env[f] < env[best]) best = f;
  return best * FRAME;
}

// Stretches with no voice, at least 0.25 s long, as [start, end] seconds.
function pauses(env: Float32Array, level: number): [number, number][] {
  const quiet = level * 0.06;
  const out: [number, number][] = [];
  let start = -1;
  for (let f = 0; f <= env.length; f++) {
    const silent = f < env.length && env[f] < quiet;
    if (silent && start < 0) start = f;
    if (!silent && start >= 0) {
      if ((f - start) * FRAME >= 0.25) out.push([start * FRAME, f * FRAME]);
      start = -1;
    }
  }
  return out;
}

function slice(buffer: AudioBuffer, start: number, end: number): Blob {
  const from = Math.max(0, Math.round(start * buffer.sampleRate));
  const to = Math.min(buffer.length, Math.round(end * buffer.sampleRate));
  const length = Math.max(1, to - from);
  const mono = new AudioBuffer({ length, numberOfChannels: 1, sampleRate: buffer.sampleRate });
  const data = mono.getChannelData(0);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const src = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) data[i] += src[from + i] / buffer.numberOfChannels;
  }
  return toWav(mono);
}

// Trims the silence around a part, keeping a short breath of room.
function trim(env: Float32Array, level: number, start: number, end: number): [number, number] {
  const quiet = level * 0.06;
  let a = Math.floor(start / FRAME);
  let b = Math.min(env.length - 1, Math.ceil(end / FRAME));
  while (a < b && env[a] < quiet) a++;
  while (b > a && env[b] < quiet) b--;
  return [Math.max(start, a * FRAME - 0.06), Math.min(end, (b + 1) * FRAME + 0.12)];
}

export async function splitNarration(
  file: Blob,
  name: string,
  lines: NarrationLine[],
  language: "es" | "en",
  autoSync: boolean,
): Promise<{ parts: NarrationPart[]; how: "words" | "pauses" }> {
  if (!lines.length) throw new Error("No hay líneas para repartir.");
  let buffer: AudioBuffer;
  try {
    buffer = await new OfflineAudioContext(1, 1, 48000).decodeAudioData(await file.arrayBuffer());
  } catch {
    throw new Error("No se pudo leer ese audio. Probá con un .mp3 o un .wav.");
  }
  const env = envelope(buffer);
  const level = speechLevel(env);
  const total = buffer.duration;
  let cuts: number[];
  let how: "words" | "pauses";

  if (autoSync) {
    // The words tell where each line starts and ends; the cut goes to the quietest moment between them.
    const { lines: timed } = await api.syncLyrics(file, name, lines.map((l) => l.text), [], language);
    cuts = timed.slice(0, -1).map((l, i) => {
      const next = timed[i + 1];
      const a = Math.min(l.end, next.start);
      const b = Math.max(l.end, next.start);
      return quietest(env, a - 0.15, b + 0.15);
    });
    how = "words";
  } else {
    // No transcription: the longest pauses between lines (not the silence before the first or after the last),
    // one fewer than the lines, in order.
    const found = pauses(env, level).filter(([a, b]) => a > FRAME * 2 && b < total - FRAME * 2);
    if (found.length < lines.length - 1) {
      throw new Error(
        `Encontré ${found.length} ${found.length === 1 ? "pausa" : "pausas"} y hacen falta ${lines.length - 1}. En ElevenLabs dejá un renglón vacío entre línea y línea (hace una pausa), o cargá OPENAI_API_KEY para que la app las encuentre por las palabras.`,
      );
    }
    cuts = found
      .sort((a, b) => b[1] - b[0] - (a[1] - a[0]))
      .slice(0, lines.length - 1)
      .sort((a, b) => a[0] - b[0])
      .map(([a, b]) => (a + b) / 2);
    how = "pauses";
  }

  const edges = [0, ...cuts, total];
  const parts = lines.map((l, i) => {
    const [start, end] = trim(env, level, edges[i], edges[i + 1]);
    const atCut = i < cuts.length ? env[Math.min(env.length - 1, Math.round(cuts[i] / FRAME))] : 0;
    return {
      key: l.key,
      start,
      end,
      blob: slice(buffer, start, end),
      duration: end - start,
      sure: atCut < level * 0.12 && end - start > 0.3,
    };
  });
  return { parts, how };
}
