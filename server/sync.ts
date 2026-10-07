// Writes proyectos/<id>/sync from a drums stem (or Demucs) and a vocal stem. The master is never the beat clock.
import { spawn, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import type { HeardWord, LyricLanguage } from "../shared/lyrics.ts";
import type { Brand } from "../shared/series.ts";
import {
  ClockError,
  assembleSync,
  decodeWav,
  qaMarkdown,
  type Pcm,
  type SyncDoc,
} from "../shared/clock.ts";
import { contactFrames, contactSheet, critique, type Critique } from "../shared/syncDraw.ts";
import { PROJECTS_DIR, ProjectError, getProject } from "./projects.ts";
import { autoSyncAvailable, hearSong } from "./lyrics.ts";

const ID = /^[a-z0-9-]{1,80}$/;

function syncDir(id: string): string {
  if (!ID.test(id)) throw new ProjectError("Ese proyecto no existe.");
  return join(PROJECTS_DIR, id, "sync");
}

function which(cmd: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn("bash", ["-lc", `command -v ${cmd}`], { stdio: "ignore" });
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
  });
}

function pythonHas(mod: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn("python3", ["-c", `import ${mod}`], { stdio: "ignore" });
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
  });
}

function run(cmd: string, args: string[], cwd: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let err = "";
    child.stderr.on("data", (chunk: Buffer) => {
      err = (err + chunk.toString()).slice(-2000);
    });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new ClockError(`${cmd} tardó demasiado.`));
    }, timeoutMs);
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(new ClockError(error.message));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new ClockError(err.trim() || `${cmd} salió con código ${code}.`));
    });
  });
}

// Whether Demucs is on this computer (checked once, for the status the app shows).
let demucs: boolean | undefined;
export function demucsAvailable(): boolean {
  demucs ??= spawnSync("sh", ["-c", "command -v demucs"], { stdio: "ignore" }).status === 0;
  return demucs;
}

// Demucs only. If it is not installed, the caller must pass a drums stem. The master is not a fallback.
export async function separateDrums(master: Uint8Array): Promise<{ drums: Uint8Array; vocals: Uint8Array | null }> {
  if (!(await which("demucs"))) {
    throw new ClockError("No está Demucs y no subiste el stem de batería. El reloj no mide el beat en el master.");
  }
  if (!(await which("ffmpeg"))) {
    throw new ClockError("Demucs necesita ffmpeg y acá no está. Subí el stem de batería en WAV.");
  }
  const dir = await mkdtemp(join(tmpdir(), "reloj-"));
  try {
    await writeFile(join(dir, "master.wav"), master);
    await run("demucs", ["-n", "htdemucs", "--out", join(dir, "out"), join(dir, "master.wav")], dir, 20 * 60 * 1000);
    const stem = join(dir, "out", "htdemucs", "master");
    const drums = new Uint8Array(await readFile(join(stem, "drums.wav")));
    let vocals: Uint8Array | null = null;
    try {
      vocals = new Uint8Array(await readFile(join(stem, "vocals.wav")));
    } catch {
      vocals = null;
    }
    return { drums, vocals };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function collectWords(value: unknown, out: HeardWord[]) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) collectWords(item, out);
    return;
  }
  const rec = value as Record<string, unknown>;
  if (typeof rec.word === "string" && typeof rec.start === "number" && typeof rec.end === "number") {
    out.push({ word: rec.word, start: rec.start, end: rec.end });
  }
  for (const child of Object.values(rec)) collectWords(child, out);
}

async function transcribeFile(wavPath: string, engine: "whisperx" | "stable-ts"): Promise<HeardWord[] | null> {
  const dir = join(wavPath, "..");
  if (engine === "whisperx") {
    await run("whisperx", ["--model", "small", "--output_format", "json", "--output_dir", dir, wavPath], dir, 15 * 60 * 1000);
    const base = wavPath.replace(/\.wav$/i, ".json");
    const words: HeardWord[] = [];
    collectWords(JSON.parse(await readFile(base, "utf8")), words);
    return words.length ? words : null;
  }
  const script = `
import json, stable_whisper, sys
result = stable_whisper.load_model("base").transcribe(sys.argv[1])
words = []
for seg in result.segments:
    for w in (getattr(seg, "words", None) or []):
        words.append({"word": w.word, "start": float(w.start), "end": float(w.end)})
print(json.dumps(words))
`;
  const out = await new Promise<string>((resolve, reject) => {
    const child = spawn("python3", ["-c", script, wavPath], { stdio: ["ignore", "pipe", "pipe"] });
    let text = "";
    let err = "";
    child.stdout.on("data", (chunk: Buffer) => {
      text += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      err = (err + chunk.toString()).slice(-2000);
    });
    child.on("error", (error) => reject(new ClockError(error.message)));
    child.on("close", (code) => {
      if (code === 0) resolve(text);
      else reject(new ClockError(err.trim() || "stable-ts no pudo alinear."));
    });
  });
  const words: HeardWord[] = [];
  collectWords(JSON.parse(out), words);
  return words.length ? words : null;
}

export async function transcribeVocals(wav: Uint8Array, lyrics: string, language: LyricLanguage): Promise<{ words: HeardWord[]; engine: string }> {
  const dir = await mkdtemp(join(tmpdir(), "reloj-voz-"));
  const wavPath = join(dir, "vocals.wav");
  try {
    await writeFile(wavPath, wav);
    if (await which("whisperx")) {
      const words = await transcribeFile(wavPath, "whisperx");
      if (words?.length) return { words, engine: "whisperx" };
    } else if (await pythonHas("stable_whisper")) {
      const words = await transcribeFile(wavPath, "stable-ts");
      if (words?.length) return { words, engine: "stable-ts" };
    }
  } catch (error) {
    if (!(await autoSyncAvailable())) throw error;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  if (autoSyncAvailable()) {
    const audio = new Blob([wav.buffer as ArrayBuffer], { type: "audio/wav" });
    const heard = await hearSong(audio, "vocals.wav", language, lyrics);
    return { words: heard.words, engine: "openai-whisper-1" };
  }
  return { words: [], engine: "none" };
}

export async function drumsFromUpload(drums: Uint8Array | null, master: Uint8Array | null): Promise<{ pcm: Pcm; vocals: Uint8Array | null }> {
  if (drums) return { pcm: decodeWav(drums), vocals: null };
  if (!master) throw new ClockError("Subí el master o el stem de batería.");
  const separated = await separateDrums(master);
  return { pcm: decodeWav(separated.drums), vocals: separated.vocals };
}

export async function writeSyncFiles(id: string, doc: SyncDoc): Promise<string> {
  await getProject(id);
  const dir = syncDir(id);
  await mkdir(dir, { recursive: true });
  const qa = qaMarkdown(doc);
  const sync = {
    grid: doc.grid,
    words: doc.words,
    moves: doc.moves,
    lyric_gate: doc.lyric_gate,
    unaligned: doc.unaligned,
    engines: doc.engines,
  };
  await writeFile(join(dir, "grid.json"), JSON.stringify(doc.grid, null, 2));
  await writeFile(join(dir, "words.json"), JSON.stringify(doc.words, null, 2));
  await writeFile(join(dir, "moves.json"), JSON.stringify(doc.moves, null, 2));
  await writeFile(join(dir, "sync.json"), JSON.stringify(sync, null, 2));
  await writeFile(join(dir, "QA.md"), qa);
  return qa;
}

export async function loadSync(id: string): Promise<{ doc: SyncDoc; qa: string } | null> {
  await getProject(id);
  try {
    const raw = JSON.parse(await readFile(join(syncDir(id), "sync.json"), "utf8")) as SyncDoc;
    const qa = await readFile(join(syncDir(id), "QA.md"), "utf8");
    if (!raw.grid || !Array.isArray(raw.words) || !Array.isArray(raw.moves) || typeof raw.lyric_gate !== "string") return null;
    const [hit, total] = raw.lyric_gate.split("/").map(Number);
    return {
      qa,
      doc: {
        ...raw,
        lyric_gate_ok: total > 0 && hit === total,
        unaligned: raw.unaligned ?? [],
        engines: raw.engines ?? { beats: "drums-lowpass-150", words: "none" },
      },
    };
  } catch {
    return null;
  }
}

export async function buildProjectSync(
  id: string,
  input: {
    lyrics: string;
    moves: string;
    fps: number;
    language: LyricLanguage;
    drums: Uint8Array | null;
    vocals: Uint8Array | null;
    master: Uint8Array | null;
    heard?: HeardWord[];
    wordsEngine?: string;
  },
): Promise<{ doc: SyncDoc; qa: string }> {
  const source = await drumsFromUpload(input.drums, input.master);
  const vocals = input.vocals ?? source.vocals;
  let heard = input.heard ?? [];
  let wordsEngine = input.wordsEngine ?? "none";
  if (!input.heard && vocals) {
    const transcribed = await transcribeVocals(vocals, input.lyrics, input.language);
    heard = transcribed.words;
    wordsEngine = transcribed.engine;
  }
  const doc = assembleSync({
    drums: source.pcm,
    lyrics: input.lyrics,
    moves: input.moves,
    heard,
    fps: input.fps,
    wordsEngine,
  });
  const qa = await writeSyncFiles(id, doc);
  return { doc, qa };
}

function crc32(data: Buffer): number {
  let crc = ~0;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return ~crc >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(4);
  head.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([head, body, crc]);
}

export function encodePng(rgba: Uint8Array, w: number, h: number): Buffer {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    const row = y * (w * 4 + 1);
    raw[row] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, row + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

export async function critiqueProject(id: string, brand: Brand): Promise<Critique & { qa: string }> {
  const loaded = await loadSync(id);
  if (!loaded) throw new ClockError("Todavía no hay un reloj. Armalo con la batería y la letra.");
  const frames = contactFrames(loaded.doc, brand);
  const sheet = contactSheet(loaded.doc, brand, frames);
  const result = critique(loaded.doc, brand, frames);
  const dir = syncDir(id);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "contact.png"), encodePng(sheet.rgba, sheet.w, sheet.h));
  const qa = await writeSyncFiles(id, result.applied);
  return { ...result, qa };
}
