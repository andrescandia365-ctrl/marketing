// Demucs on this computer: splits a song into stems so the two clocks read the right sound (the kick on the drums
// stem, the words on the vocal stem). Optional: without it the person uploads the stems and nothing else changes.
// Found by DEMUCS_BIN (a path, e.g. a virtual environment's bin/demucs), else `demucs` on the PATH, else
// `python3 -m demucs`. Each song is split once: its stems stay in PROJECTS_DIR/.demucs/<model>-<hash>/, so the
// lyric sync, the Reloj and an explainer's grid reuse the same split.
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { accessSync, constants, readdirSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { ClockError, decodeWav, encodeWav, synthDrumStem, type Pcm } from "../shared/clock.ts";
import { PROJECTS_DIR } from "./projects.ts";

export const DEMUCS_MODEL = /^[a-z0-9_]{1,40}$/.test(process.env.DEMUCS_MODEL ?? "") ? process.env.DEMUCS_MODEL! : "htdemucs";
// A split takes minutes on a computer without a graphics card; past this it is stopped.
const TIMEOUT_MS = 30 * 60 * 1000;
// Not found is checked again after this, so installing it while the app runs works without a restart.
const RECHECK_MS = 15_000;

export function stemsDir(): string {
  return join(PROJECTS_DIR, ".demucs");
}

type Command = { cmd: string; args: string[]; label: string };
let found: { command: Command | null; at: number } | undefined;

const expand = (p: string) => (p === "~" ? homedir() : p.startsWith("~/") ? join(homedir(), p.slice(2)) : p);

function executable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function lookUp(): Command | null {
  const bin = process.env.DEMUCS_BIN?.trim();
  if (bin) {
    const path = expand(bin);
    return basename(path) === "demucs" && executable(path) ? { cmd: path, args: [], label: path } : null;
  }
  // A login shell, so the PATH the person set in their profile (pipx, ~/.local/bin) counts too.
  const where = spawnSync("bash", ["-lc", "command -v demucs"], { encoding: "utf8", timeout: 10_000 });
  const path = where.status === 0 ? where.stdout.trim().split("\n").pop() ?? "" : "";
  if (path) return { cmd: path, args: [], label: path };
  const module = spawnSync("python3", ["-c", "import importlib.util, sys; sys.exit(0 if importlib.util.find_spec('demucs') else 1)"], {
    stdio: "ignore",
    timeout: 10_000,
  });
  return module.status === 0 ? { cmd: "python3", args: ["-m", "demucs"], label: "python3 -m demucs" } : null;
}

export function demucsCommand(fresh = false): Command | null {
  const now = Date.now();
  if (fresh || !found || (!found.command && now - found.at > RECHECK_MS)) found = { command: lookUp(), at: now };
  return found.command;
}

// What the app shows: whether it is here, how it is called, which model, and how many songs are already split.
export function demucsStatus(fresh = false): { ready: boolean; command: string; model: string; songs: number; envBin: boolean } {
  const command = demucsCommand(fresh);
  let songs = 0;
  try {
    songs = readdirSync(stemsDir()).filter((name) => name.startsWith(`${DEMUCS_MODEL}-`)).length;
  } catch {
    songs = 0;
  }
  return { ready: Boolean(command), command: command?.label ?? "", model: DEMUCS_MODEL, songs, envBin: Boolean(process.env.DEMUCS_BIN?.trim()) };
}

// A path for DEMUCS_BIN, from Modelos: it must be an executable file named demucs (so the app never runs anything else).
export function checkDemucsBin(bin: string): string {
  const path = expand(bin.trim());
  if (basename(path) !== "demucs") throw new ClockError("La ruta tiene que terminar en /demucs (por ejemplo ~/demucs/bin/demucs).");
  if (!executable(path)) throw new ClockError(`No encontré un Demucs que se pueda abrir en ${path}.`);
  return bin.trim();
}

export function demucsAvailable(): boolean {
  return Boolean(demucsCommand());
}

let ffmpeg: boolean | undefined;
function ffmpegHere(): boolean {
  ffmpeg ??= spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0;
  return ffmpeg;
}

// The file's kind from its first bytes (the extension Demucs gets; ffmpeg reads anything but WAV for it).
export function audioKind(bytes: Uint8Array): "wav" | "mp3" | "m4a" | "flac" | "ogg" | "webm" | "audio" {
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WAVE") return "wav";
  if (ascii(0, 3) === "ID3" || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)) return "mp3";
  if (ascii(4, 8) === "ftyp") return "m4a";
  if (ascii(0, 4) === "fLaC") return "flac";
  if (ascii(0, 4) === "OggS") return "ogg";
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return "webm";
  return "audio";
}

function run(command: Command, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command.cmd, [...command.args, ...args], { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let err = "";
    child.stdout.resume();
    child.stderr.on("data", (chunk: Buffer) => {
      err = (err + chunk.toString()).slice(-2000);
    });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new ClockError("Demucs tardó más de 30 minutos y lo corté. Subí el stem de batería."));
    }, TIMEOUT_MS);
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(new ClockError(`No pude correr Demucs (${command.label}): ${error.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new ClockError(`Demucs falló: ${err.trim().split("\n").slice(-3).join(" ") || `salió con código ${code}.`}`));
    });
  });
}

export type Stems = { drums: Uint8Array; vocals: Uint8Array | null; cached: boolean };

// Two requests for the same song wait for one split.
const running = new Map<string, Promise<Stems>>();

// The song's drums and vocals, from the cache or from Demucs. Demucs only: without it this refuses, and the caller
// asks for the stem. The master is never a fallback for the beat.
export async function separate(song: Uint8Array): Promise<Stems> {
  if (song.length < 44) throw new ClockError("Falta el tema.");
  const hash = createHash("sha256").update(song).digest("hex").slice(0, 24);
  const dir = join(stemsDir(), `${DEMUCS_MODEL}-${hash}`);
  try {
    const drums = new Uint8Array(await readFile(join(dir, "drums.wav")));
    const vocals = await readFile(join(dir, "vocals.wav")).then((b) => new Uint8Array(b), () => null);
    return { drums, vocals, cached: true };
  } catch {
    // Not split yet.
  }
  const busy = running.get(dir);
  if (busy) return busy;
  const job = split(song, dir);
  running.set(dir, job);
  try {
    return await job;
  } finally {
    running.delete(dir);
  }
}

// Demucs once, in a scratch folder under the cache that is removed after.
async function splitNow(song: Uint8Array): Promise<{ drums: Uint8Array; vocals: Uint8Array | null }> {
  const command = demucsCommand(true);
  if (!command) throw new ClockError("No está Demucs y no subiste el stem de batería. El reloj no mide el beat en el master.");
  const kind = audioKind(song);
  if (kind !== "wav" && !ffmpegHere()) throw new ClockError("Para leer mp3 o m4a, Demucs necesita ffmpeg y acá no está. Instalalo o subí el tema en WAV.");
  await mkdir(stemsDir(), { recursive: true });
  const work = await mkdtemp(join(stemsDir(), "tmp-"));
  try {
    const input = join(work, `tema.${kind}`);
    await writeFile(input, song);
    await run(command, ["-n", DEMUCS_MODEL, "--out", join(work, "out"), input], work);
    const out = join(work, "out", DEMUCS_MODEL, "tema");
    const drums = await readFile(join(out, "drums.wav")).then(
      (b) => new Uint8Array(b),
      () => {
        throw new ClockError("Demucs terminó pero no dejó el stem de batería.");
      },
    );
    const vocals = await readFile(join(out, "vocals.wav")).then((b) => new Uint8Array(b), () => null);
    return { drums, vocals };
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

async function split(song: Uint8Array, dir: string): Promise<Stems> {
  const { drums, vocals } = await splitNow(song);
  // Written aside and moved in whole, so a half-written folder is never read as the cache.
  const keep = await mkdtemp(join(stemsDir(), "tmp-"));
  try {
    await writeFile(join(keep, "drums.wav"), drums);
    if (vocals) await writeFile(join(keep, "vocals.wav"), vocals);
    await rm(dir, { recursive: true, force: true });
    await rename(keep, dir);
  } finally {
    await rm(keep, { recursive: true, force: true });
  }
  return { drums, vocals, cached: false };
}

// "Probar Demucs": four seconds of made-up drums and a tone go through the whole path (the program, the model, which
// it downloads the first time, and the stems it writes), so an install problem shows now and not on a real song.
export async function tryDemucs(): Promise<{ seconds: number; command: string }> {
  const rate = 44_100;
  const pcm = synthDrumStem(rate, [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5], [0.25, 0.75, 1.25, 1.75, 2.25, 2.75, 3.25, 3.75], 4);
  for (let i = 0; i < pcm.samples.length; i++) pcm.samples[i] = pcm.samples[i] * 0.7 + 0.2 * Math.sin((2 * Math.PI * 440 * i) / rate);
  const started = Date.now();
  const { drums } = await splitNow(encodeWav(pcm.samples, rate));
  decodeWav(drums);
  return { seconds: Math.round((Date.now() - started) / 100) / 10, command: demucsCommand()?.label ?? "" };
}

// One channel at a lower rate (each output sample is the average of the input samples it covers): a vocal stem
// for the transcription, which takes files up to 25 MB. A 4-minute stem at 16 kHz is about 7.7 MB.
export function downsample(pcm: Pcm, rate: number): Pcm {
  if (pcm.sampleRate <= rate) return pcm;
  const ratio = pcm.sampleRate / rate;
  const n = Math.floor(pcm.samples.length / ratio);
  const samples = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const from = Math.floor(i * ratio);
    const to = Math.min(pcm.samples.length, Math.max(from + 1, Math.floor((i + 1) * ratio)));
    let sum = 0;
    for (let j = from; j < to; j++) sum += pcm.samples[j];
    samples[i] = sum / (to - from);
  }
  return { samples, sampleRate: rate };
}

export function speechWav(wav: Uint8Array): Uint8Array {
  return encodeWav(downsample(decodeWav(wav), 16_000).samples, 16_000);
}
