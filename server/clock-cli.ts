// npx tsx server/clock-cli.ts sync --project ID --lyrics lyrics.txt [--drums drums.wav] [--vocals vocals.wav] [--master master.wav] [--moves moves.txt]
// npx tsx server/clock-cli.ts critique --project ID
import { readFile } from "node:fs/promises";
import { DEFAULT_BRAND } from "../shared/series.ts";
import { buildProjectSync, critiqueProject } from "./sync.ts";

function arg(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1] ?? null) : null;
}

async function readWav(path: string | null): Promise<Uint8Array | null> {
  if (!path) return null;
  return new Uint8Array(await readFile(path));
}

const cmd = process.argv[2];
const project = arg("--project");
if (!project || (cmd !== "sync" && cmd !== "critique")) {
  console.error("Uso: tsx server/clock-cli.ts sync|critique --project ID [--drums WAV] [--vocals WAV] [--master WAV] [--lyrics TXT] [--moves TXT]");
  process.exit(1);
}

if (cmd === "critique") {
  const result = await critiqueProject(project, DEFAULT_BRAND);
  console.log(`score ${result.score}  ${result.passed ? "pasa" : "no pasa"}`);
  for (const fix of result.worst) console.log(`${fix.t.toFixed(3)}  ${fix.problem}  ${fix.fix}`);
  console.log(result.qa);
} else {
  const lyricsPath = arg("--lyrics");
  if (!lyricsPath) {
    console.error("Falta --lyrics.");
    process.exit(1);
  }
  const { doc, qa } = await buildProjectSync(project, {
    lyrics: await readFile(lyricsPath, "utf8"),
    moves: arg("--moves") ? await readFile(arg("--moves")!, "utf8") : "",
    fps: Number(arg("--fps") ?? 24) || 24,
    language: "auto",
    drums: await readWav(arg("--drums")),
    vocals: await readWav(arg("--vocals")),
    master: await readWav(arg("--master")),
  });
  console.log(qa);
  console.log(`gate ${doc.lyric_gate}`);
}
