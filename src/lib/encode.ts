// Encodes frames drawn by a pure function of time, plus a finished audio mix, with WebCodecs through mediabunny.
// H.264 first (MP4), at the highest quality preset the browser allows; WebM only when H.264 is not there.
import {
  AudioBufferSource,
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  QUALITY_VERY_HIGH,
  WebMOutputFormat,
  getFirstEncodableAudioCodec,
  getFirstEncodableVideoCodec,
} from "mediabunny";
import type { RenderResult } from "./render.ts";

export async function encodeFrames(options: {
  width: number;
  height: number;
  fps?: number;
  duration: number;
  draw: (ctx: CanvasRenderingContext2D, t: number) => void | Promise<void>;
  audio: AudioBuffer | null;
  onProgress: (fraction: number) => void;
}): Promise<RenderResult> {
  if (typeof VideoEncoder === "undefined") {
    throw new Error("Este navegador no puede generar video. Usá una versión reciente de Chrome, Edge o Safari.");
  }
  const { width: w, height: h, duration, draw, audio, onProgress } = options;
  const fps = options.fps ?? 30;
  const notes: string[] = [];
  const codec = await getFirstEncodableVideoCodec(["avc", "vp9", "av1", "vp8"], { width: w, height: h });
  if (!codec) throw new Error("Este navegador no tiene un codificador de video disponible.");
  const mp4 = codec === "avc";
  if (!mp4) notes.push("Este navegador no codifica H.264: salió en WebM.");

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const output = new Output({
    format: mp4 ? new Mp4OutputFormat({ fastStart: "in-memory" }) : new WebMOutputFormat(),
    target: new BufferTarget(),
  });
  const video = new CanvasSource(canvas, { codec, quality: mp4 ? QUALITY_VERY_HIGH : QUALITY_HIGH });
  output.addVideoTrack(video, { frameRate: fps });

  let sound: AudioBufferSource | null = null;
  if (audio) {
    const audioCodec = await getFirstEncodableAudioCodec(mp4 ? ["aac", "opus"] : ["opus", "vorbis"], {
      numberOfChannels: audio.numberOfChannels,
      sampleRate: audio.sampleRate,
    });
    if (audioCodec) {
      sound = new AudioBufferSource({ codec: audioCodec, quality: QUALITY_HIGH });
      output.addAudioTrack(sound);
    } else notes.push("El sonido quedó afuera: este navegador no puede codificar audio.");
  }

  await output.start();
  if (sound && audio) await sound.add(audio);
  const frames = Math.round(duration * fps);
  for (let f = 0; f < frames; f++) {
    await draw(ctx, f / fps);
    await video.add(f / fps, 1 / fps);
    if (f % 15 === 0) onProgress(f / frames);
  }
  await output.finalize();
  onProgress(1);
  const mimeType = mp4 ? "video/mp4" : "video/webm";
  return { blob: new Blob([output.target.buffer!], { type: mimeType }), extension: mp4 ? "mp4" : "webm", mimeType, notes };
}
