// The finished MP4 checked against what was rendered (render.mjs): every frame there, the size and pixel format
// asked for, and the sound present and as long as the picture. ffprobe reads the file; this compares.

/** @param {string} file @param {(cmd: string, args: string[]) => { status: number | null; stdout: string }} run */
export function probeStreams(file, run) {
  const r = run("ffprobe", ["-v", "error", "-count_packets", "-show_entries", "stream=codec_type,nb_read_packets,duration,width,height,pix_fmt", "-of", "json", file]);
  if (r.status !== 0) return null;
  try {
    return JSON.parse(r.stdout).streams ?? null;
  } catch {
    return null;
  }
}

/**
 * @param {Array<{ codec_type?: string; nb_read_packets?: string; duration?: string; width?: number; height?: number; pix_fmt?: string }>} streams
 * @param {{ frames: number; fps: number; width: number; height: number; sound: boolean }} want
 * @returns {string[]} what does not match, in Spanish (empty when the file is right)
 */
export function checkStreams(streams, want) {
  const problems = [];
  const video = streams.find((s) => s.codec_type === "video");
  const audio = streams.find((s) => s.codec_type === "audio");
  if (!video) return ["no tiene imagen"];
  const frames = Number(video.nb_read_packets);
  if (frames !== want.frames) problems.push(`tiene ${frames} cuadros y se pintaron ${want.frames}`);
  if (video.width !== want.width || video.height !== want.height) problems.push(`mide ${video.width}×${video.height} y se pidió ${want.width}×${want.height}`);
  if (video.pix_fmt !== "yuv420p") problems.push(`el color está en ${video.pix_fmt}, no en yuv420p`);
  if (want.sound && !audio) problems.push("no tiene sonido");
  if (want.sound && audio) {
    const length = want.frames / want.fps;
    const heard = Number(audio.duration);
    // AAC adds a little padding; more than ~0.1 s off is a cut or a missing piece of the mix.
    if (Number.isFinite(heard) && Math.abs(heard - length) > 0.12) problems.push(`el sonido dura ${heard.toFixed(2)} s y la imagen ${length.toFixed(2)} s`);
  }
  return problems;
}
