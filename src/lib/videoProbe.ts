// "Videos de la app funcionando": before a screen recording is uploaded, this browser opens it the way the preview and
// the render will. A file it cannot play is refused here (a MOV in ProRes, an HEVC file in a browser without it), and
// one it plays gives its length, its size and a poster frame (a JPEG of the frame at posterSecond).
import { SCREEN_VIDEO_MAX_BYTES } from "../../shared/screenVideo.ts";

// Half a second in (past a black first frame), or the middle of a very short one.
export const posterSecond = (seconds: number) => Math.min(0.5, seconds / 2);

export type ProbedVideo = { seconds: number; width: number; height: number; poster: Blob | null };

export async function probeScreenVideo(file: File): Promise<ProbedVideo> {
  if (file.size > SCREEN_VIDEO_MAX_BYTES) throw new Error(`El video pesa más de ${SCREEN_VIDEO_MAX_BYTES / 1024 / 1024} MB: acortalo o bajale la calidad.`);
  const url = URL.createObjectURL(file);
  try {
    return await probeVideoUrl(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}

// The same for a video already at an address (a metaphor's clip in the project folder). `at`: the poster's second
// (default posterSecond; 0 for a clip whose first frame is the picture it was made from).
export async function probeVideoUrl(url: string, at?: number): Promise<ProbedVideo> {
  const v = document.createElement("video");
  v.muted = true;
  v.playsInline = true;
  v.preload = "auto";
  const once = (ok: string, ms: number) =>
    new Promise<boolean>((done) => {
      const timer = setTimeout(() => done(false), ms);
      v.addEventListener(ok, () => (clearTimeout(timer), done(true)), { once: true });
      v.addEventListener("error", () => (clearTimeout(timer), done(false)), { once: true });
    });
  try {
    const meta = once("loadeddata", 20000);
    v.src = url;
    const unreadable = "Este navegador no puede reproducir ese video. Exportalo como MP4 (H.264) o WebM y subilo de nuevo.";
    if (!(await meta) || !v.videoWidth || !v.videoHeight || !Number.isFinite(v.duration) || v.duration <= 0) throw new Error(unreadable);
    const seconds = Math.round(v.duration * 1000) / 1000;
    const seeked = once("seeked", 10000);
    v.currentTime = at ?? posterSecond(seconds);
    let poster: Blob | null = null;
    if (await seeked) {
      const canvas = document.createElement("canvas");
      canvas.width = v.videoWidth;
      canvas.height = v.videoHeight;
      canvas.getContext("2d")!.drawImage(v, 0, 0);
      poster = await new Promise<Blob | null>((done) => canvas.toBlob(done, "image/jpeg", 0.9));
    }
    return { seconds, width: v.videoWidth, height: v.videoHeight, poster };
  } finally {
    v.removeAttribute("src");
    v.load();
  }
}
