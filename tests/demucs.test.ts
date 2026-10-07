// Demucs, installed by the person: the app finds it by DEMUCS_BIN, splits each song once (the cache in
// PROJECTS_DIR/.demucs), sends the transcription a small vocal file, and says when the voice stem is worth it.
// A stand-in demucs (a shell script that copies the song into drums.wav and vocals.wav) plays the real one.
import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { decodeWav, encodeWav, synthDrumStem } from "../shared/clock.ts";
import { voiceStemHelps } from "../shared/demucs.ts";
import { alignLyrics } from "../shared/lyrics.ts";

const root = await mkdtemp(join(tmpdir(), "demucs-test-"));
const bin = join(root, "bin");
const runs = join(root, "runs.log");
await mkdir(bin);
await writeFile(
  join(bin, "demucs"),
  `#!/bin/sh
while [ $# -gt 0 ]; do
  case "$1" in
    -n) model="$2"; shift 2;;
    --out) out="$2"; shift 2;;
    *) input="$1"; shift;;
  esac
done
name=$(basename "$input"); name=\${name%.*}
mkdir -p "$out/$model/$name"
cp "$input" "$out/$model/$name/drums.wav"
cp "$input" "$out/$model/$name/vocals.wav"
echo run >> "${runs}"
`,
);
await chmod(join(bin, "demucs"), 0o755);
await writeFile(join(bin, "not-demucs"), "#!/bin/sh\n");
await chmod(join(bin, "not-demucs"), 0o755);
process.env.PROJECTS_DIR = join(root, "proyectos");
process.env.DEMUCS_BIN = join(bin, "demucs");
const { audioKind, checkDemucsBin, demucsStatus, downsample, separate, speechWav, stemsDir, tryDemucs } = await import("../server/demucs.ts");

const countRuns = () => readFile(runs, "utf8").then((t) => t.split("\n").filter(Boolean).length, () => 0);
const song = (seconds: number, offset: number) =>
  encodeWav(synthDrumStem(44100, Array.from({ length: seconds * 2 }, (_, i) => offset + i * 0.5), [], seconds).samples, 44100);

test("DEMUCS_BIN is found, and only a file named demucs is accepted as its path", () => {
  const status = demucsStatus(true);
  assert.equal(status.ready, true);
  assert.equal(status.command, join(bin, "demucs"));
  assert.equal(status.model, "htdemucs");
  assert.equal(checkDemucsBin(join(bin, "demucs")), join(bin, "demucs"));
  assert.throws(() => checkDemucsBin(join(bin, "not-demucs")), /terminar en \/demucs/);
  assert.throws(() => checkDemucsBin(join(root, "nada", "demucs")), /No encontré/);
});

test("each song is split once: the second time and a request in parallel come from the same split", async () => {
  const a = song(3, 0.1);
  const [first, parallel] = await Promise.all([separate(a), separate(a)]);
  assert.equal(await countRuns(), 1);
  assert.equal(first.cached, false);
  assert.deepEqual(parallel.drums, first.drums);
  assert.ok(first.vocals);
  const again = await separate(a);
  assert.equal(again.cached, true);
  assert.deepEqual(again.drums, first.drums);
  assert.equal(await countRuns(), 1);
  assert.equal(demucsStatus().songs, 1);
  await separate(song(3, 0.2));
  assert.equal(await countRuns(), 2);
  assert.equal(demucsStatus().songs, 2);
  // Nothing half-written is left next to the stems.
  const left = await readdir(stemsDir());
  assert.ok(left.every((name) => name.startsWith("htdemucs-")), left.join(", "));
});

test("the test run goes through the whole path and keeps nothing", async () => {
  const result = await tryDemucs();
  assert.ok(result.seconds >= 0);
  assert.equal(demucsStatus().songs, 2);
});

test("the vocal stem goes to the transcription as one channel at 16 kHz (under its 25 MB)", () => {
  const rate = 44100;
  const samples = new Float32Array(rate * 2).map((_, i) => 0.5 * Math.sin((2 * Math.PI * 220 * i) / rate));
  const small = downsample({ samples, sampleRate: rate }, 16000);
  assert.equal(small.sampleRate, 16000);
  assert.ok(Math.abs(small.samples.length - 32000) <= 1);
  // A 220 Hz tone survives the averaging almost whole.
  const peak = small.samples.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
  assert.ok(peak > 0.45 && peak <= 0.5, String(peak));
  const wav = speechWav(encodeWav(samples, rate));
  assert.equal(decodeWav(wav).sampleRate, 16000);
  // Four minutes at 16 kHz, 16-bit, one channel.
  assert.ok(4 * 60 * 16000 * 2 + 44 < 25 * 1024 * 1024);
});

test("the song's kind comes from its first bytes", () => {
  const bytes = (...xs: number[]) => new Uint8Array([...xs, ...new Array(16).fill(0)]);
  const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));
  assert.equal(audioKind(song(1, 0.1)), "wav");
  assert.equal(audioKind(bytes(...ascii("ID3"))), "mp3");
  assert.equal(audioKind(bytes(0xff, 0xfb)), "mp3");
  assert.equal(audioKind(bytes(0, 0, 0, 0x20, ...ascii("ftyp"))), "m4a");
  assert.equal(audioKind(bytes(...ascii("fLaC"))), "flac");
  assert.equal(audioKind(bytes(...ascii("OggS"))), "ogg");
  assert.equal(audioKind(bytes(1, 2, 3, 4)), "audio");
});

test("the sync says how much of the lyrics it really heard, and the voice stem is suggested under 70 %", () => {
  const texts = ["uno dos tres cuatro", "cinco seis siete ocho"];
  const all = ["uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho"].map((word, i) => ({ word, start: i * 0.5, end: i * 0.5 + 0.4 }));
  const share = { matched: 0, total: 0 };
  alignLyrics(texts, [], all, 5, share);
  assert.deepEqual(share, { matched: 8, total: 8 });
  assert.equal(voiceStemHelps(share.matched, share.total), false);
  // Half the song heard: letters matched by chance may add a word, still well under 70 %.
  alignLyrics(texts, [], all.slice(0, 4), 5, share);
  assert.equal(share.total, 8);
  assert.ok(share.matched >= 4 && share.matched <= 5, String(share.matched));
  assert.equal(voiceStemHelps(share.matched, share.total), true);
  // Too few words to judge.
  assert.equal(voiceStemHelps(1, 4), false);
});
