#!/usr/bin/env node
// Final render of a motion-graphics explainer, following the studio's render contract: the page paints frame t with
// window.seek(t) (a pure function of time), and every frame goes losslessly (PNG) to ffmpeg, which encodes H.264,
// yuv420p, CRF 16, with the piece's mix (-14 LUFS) in AAC.
//
// Usage (with the app running):  node render.mjs <proyecto> [vertical|horizontal|ambos] [--url http://localhost:5173]
// The video lands in the project's folder as video-final-vertical.mp4 / video-final-horizontal.mp4.
// Browser: Google Chrome if installed, or the one at CHROME_PATH.
import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "playwright-core";

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args.splice(i, 2)[1] : undefined;
};
const url = (flag("--url") || process.env.APP_URL || "http://localhost:5173").replace(/\/$/, "");
const [project, which = "vertical"] = args;
const fail = (text) => {
  console.error(text);
  process.exit(1);
};

if (!project || !/^[a-z0-9-]{1,80}$/.test(project)) fail("Uso: node render.mjs <proyecto> [vertical|horizontal|ambos] [--url http://localhost:5173]");
const formats = which === "ambos" ? ["vertical", "horizontal"] : [which];
if (!formats.every((f) => f === "vertical" || f === "horizontal")) fail("El formato es vertical, horizontal o ambos.");
if (spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status !== 0) fail("No encontré ffmpeg. En la Mac: brew install ffmpeg");
const folder = join(resolve(process.env.PROJECTS_DIR || "proyectos"), project);

async function launch() {
  const tries = [...(process.env.CHROME_PATH ? [{ executablePath: process.env.CHROME_PATH }] : []), { channel: "chrome" }, { channel: "msedge" }, {}];
  for (const option of tries) {
    try {
      return await chromium.launch({ headless: true, ...option });
    } catch {
      // Next browser.
    }
  }
  fail("No encontré un navegador para el render. Instalá Google Chrome, o poné en .env CHROME_PATH=<ruta del navegador>.");
}

// Writes into ffmpeg's input, waiting when its buffer is full.
function feed(stream, data) {
  return new Promise((done, failed) => {
    stream.write(data, (error) => (error ? failed(error) : undefined));
    if (stream.writableNeedDrain) stream.once("drain", done);
    else done();
  });
}

async function renderOne(browser, format, index) {
  const vertical = format === "vertical";
  const [width, height] = vertical ? [1080, 1920] : [1920, 1080];
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.goto(`${url}/?render=${encodeURIComponent(project)}&format=${format}`);
  await page.waitForFunction(() => window.motionRender || window.motionRenderError, null, { timeout: 120_000 });
  const problem = await page.evaluate(() => window.motionRenderError);
  if (problem) fail(problem);
  const info = await page.evaluate(() => {
    const { width, height, fps, duration, notice } = window.motionRender;
    return { width, height, fps, duration, notice };
  });
  const temp = await mkdtemp(join(tmpdir(), "render-"));
  const wav = join(temp, "sonido.wav");
  const sound = await page.evaluate(() => window.motionRender.sound());
  if (sound) await writeFile(wav, Buffer.from(sound, "base64"));

  const out = join(folder, `video-final-${format}.mp4`);
  const partial = join(folder, `.video-final-${format}.mp4`);
  const ffmpeg = spawn(
    "ffmpeg",
    [
      "-y",
      "-loglevel",
      "error",
      "-f",
      "image2pipe",
      "-framerate",
      String(info.fps),
      "-c:v",
      "png",
      "-i",
      "-",
      ...(sound ? ["-i", wav] : []),
      "-vf",
      "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p",
      "-c:v",
      "libx264",
      "-preset",
      "slow",
      "-crf",
      "16",
      "-pix_fmt",
      "yuv420p",
      "-color_primaries",
      "bt709",
      "-color_trc",
      "bt709",
      "-colorspace",
      "bt709",
      ...(sound ? ["-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-shortest"] : []),
      // Says so in the file too when some pictures were made with AI (the notice is also on screen).
      ...(info.notice ? ["-metadata", `comment=${info.notice}`] : []),
      "-movflags",
      "+faststart",
      "-f",
      "mp4",
      partial,
    ],
    { stdio: ["pipe", "ignore", "pipe"] },
  );
  let errors = "";
  ffmpeg.stderr.on("data", (d) => (errors += d.toString()));
  const finished = new Promise((done) => ffmpeg.on("close", done));

  const canvas = page.locator("canvas");
  const frames = Math.round(info.duration * info.fps);
  for (let f = 0; f < frames; f++) {
    await page.evaluate((t) => window.seek(t), f / info.fps);
    await feed(ffmpeg.stdin, await canvas.screenshot({ type: "png", animations: "disabled" }));
    if (f % 15 === 0) console.log(`progreso ${format} ${((index + f / frames) / formats.length).toFixed(3)}`);
  }
  ffmpeg.stdin.end();
  const code = await finished;
  await rm(temp, { recursive: true, force: true });
  await page.close();
  if (code !== 0) {
    await rm(partial, { force: true });
    fail(`ffmpeg falló: ${errors.trim().split("\n").slice(-3).join(" ")}`);
  }
  await rename(partial, out);
  console.log(`listo video-final-${format}.mp4`);
}

const browser = await launch();
try {
  for (const [i, format] of formats.entries()) await renderOne(browser, format, i);
  console.log(`progreso ${formats.at(-1)} 1`);
} finally {
  await browser.close();
}
