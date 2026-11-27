// "Kit de la toma" in the browser: fetches the shot's first frame, the cast's reference pictures and the shot's voice,
// lays the voice out as the render plays it (shared/shotKit.ts voiceLayout) and zips it all with the prompts and the
// steps (LEEME.txt), so the person uploads it to Replicate's or APIMart's web form as is.
import { storeZip } from "../../shared/storeZip.ts";
import { kitPictureFile, kitPrompt, kitReadme, lipSyncFolder, lipSyncReadme, shotKitFolder, voiceLayout, type KitPicture, type KitVoice } from "../../shared/shotKit.ts";
import { toWav } from "./wav.ts";

const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };

async function fetchBytes(url: string): Promise<{ data: Uint8Array; type: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("No se pudo traer una imagen del kit.");
  const blob = await res.blob();
  return { data: new Uint8Array(await blob.arrayBuffer()), type: blob.type };
}

// The voice as the render plays it: silence for the lead, the voice, silence to the end; mono WAV.
export async function voiceReference(voice: Blob, shotSeconds: number): Promise<{ wav: Blob; cut: boolean }> {
  const ctx = new OfflineAudioContext(1, 1, 44_100);
  const decoded = await ctx.decodeAudioData(await voice.arrayBuffer());
  const plan = voiceLayout(decoded.duration, shotSeconds);
  const rate = decoded.sampleRate;
  const out = new AudioBuffer({ length: Math.max(1, Math.round(plan.total * rate)), numberOfChannels: 1, sampleRate: rate });
  const mono = out.getChannelData(0);
  const start = Math.round(plan.lead * rate);
  const count = Math.min(Math.round(plan.voice * rate), mono.length - start);
  const chans = Array.from({ length: decoded.numberOfChannels }, (_, c) => decoded.getChannelData(c));
  for (let i = 0; i < count; i++) {
    let sum = 0;
    for (const ch of chans) sum += ch[i];
    mono[start + i] = sum / chans.length;
  }
  // A short fade on a cut, so the reference does not end on a click.
  if (plan.cut) {
    const fade = Math.min(count, Math.round(0.03 * rate));
    for (let i = 0; i < fade; i++) mono[start + count - 1 - i] *= i / fade;
  }
  return { wav: toWav(out), cut: plan.cut };
}

export type ShotKitInput = {
  shotIndex: number;
  title: string;
  seconds: number;
  format: "vertical" | "horizontal";
  toolName: string;
  videoPrompt: string;
  imagePrompt: string;
  endPrompt: string;
  firstFrame: string | null;
  lastFrame: { url: string; name: string } | null;
  pictures: KitPicture[];
  voice: (KitVoice & { blob: Blob }) | null;
  voiceHint: string;
  // A prompt test ("B"): its own folder and clip name.
  variant?: string;
};

export async function buildShotKit(k: ShotKitInput): Promise<{ zip: Blob; name: string; files: number }> {
  const folder = shotKitFolder(k.shotIndex, k.variant);
  const enc = new TextEncoder();
  const files: { name: string; data: Uint8Array }[] = [];
  let firstFrame: string | null = null;
  if (k.firstFrame) {
    const { data, type } = await fetchBytes(k.firstFrame);
    firstFrame = `00-primer-cuadro.${EXT[type] ?? "png"}`;
    files.push({ name: `${folder}/${firstFrame}`, data });
  }
  let lastFrame: string | null = null;
  if (k.lastFrame) {
    const { data, type } = await fetchBytes(k.lastFrame.url);
    lastFrame = `99-ultimo-cuadro.${EXT[type] ?? "png"}`;
    files.push({ name: `${folder}/${lastFrame}`, data });
  }
  const pictures: { file: string; name: string; label: string }[] = [];
  for (const [i, p] of k.pictures.entries()) {
    const { data, type } = await fetchBytes(p.url);
    const file = kitPictureFile(i + 1, p.ref, EXT[type] ?? "png");
    pictures.push({ file, name: p.name, label: p.label });
    files.push({ name: `${folder}/${file}`, data });
  }
  let voice: { file: string; cut: boolean } | null = null;
  if (k.voice) {
    const ref = await voiceReference(k.voice.blob, k.seconds);
    voice = { file: "audio1-voz.wav", cut: ref.cut };
    files.push({ name: `${folder}/${voice.file}`, data: new Uint8Array(await ref.wav.arrayBuffer()) });
  }
  const prompt = kitPrompt({ prompt: k.videoPrompt, pictures: k.pictures, firstFrame: Boolean(firstFrame), lastFrame: lastFrame ?? undefined, voice: k.voice });
  files.push({ name: `${folder}/prompt.txt`, data: enc.encode(prompt + "\n") });
  if (k.imagePrompt.trim()) files.push({ name: `${folder}/imagen.txt`, data: enc.encode(k.imagePrompt.trim() + "\n") });
  if (k.endPrompt.trim() && !k.lastFrame) files.push({ name: `${folder}/imagen-final.txt`, data: enc.encode(k.endPrompt.trim() + "\n") });
  const readme = kitReadme({
    shotIndex: k.shotIndex,
    title: k.title,
    seconds: k.seconds,
    format: k.format,
    toolName: k.toolName,
    pictures,
    firstFrame,
    lastFrame,
    voice,
    voiceHint: k.voiceHint,
    variant: k.variant,
  });
  files.unshift({ name: `${folder}/LEEME.txt`, data: enc.encode(readme) });
  return { zip: new Blob([storeZip(files) as BlobPart], { type: "application/zip" }), name: `${folder}.zip`, files: files.length };
}

// "Bajar kit de lip sync": the shot's clip as it is, the voice laid out as the render plays it, and the steps.
export async function buildLipSyncKit(k: { shotIndex: number; title: string; seconds: number; clip: Blob; clipName: string; voice: Blob }) {
  const folder = lipSyncFolder(k.shotIndex);
  const ext = k.clipName.split(".").pop()?.toLowerCase() || "mp4";
  const clipFile = `video.${ext}`;
  const ref = await voiceReference(k.voice, k.seconds);
  const voice = { file: "audio1-voz.wav", cut: ref.cut };
  const enc = new TextEncoder();
  const files = [
    { name: `${folder}/LEEME.txt`, data: enc.encode(lipSyncReadme({ shotIndex: k.shotIndex, title: k.title, seconds: k.seconds, clipFile, voice })) },
    { name: `${folder}/${clipFile}`, data: new Uint8Array(await k.clip.arrayBuffer()) },
    { name: `${folder}/${voice.file}`, data: new Uint8Array(await ref.wav.arrayBuffer()) },
  ];
  return { zip: new Blob([storeZip(files) as BlobPart], { type: "application/zip" }), name: `${folder}.zip` };
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
