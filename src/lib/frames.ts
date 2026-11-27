// Pictures handed to a video model as its start frame: a blob or URL as a JPEG data URL, or the last frame of an
// earlier clip, so the next clip of a sequence starts where that one ended.

const MAX_SIDE = 1920;

async function canvasToDataUrl(canvas: HTMLCanvasElement): Promise<string> {
  return canvas.toDataURL("image/jpeg", 0.92);
}

function fit(w: number, h: number): [number, number] {
  const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
  return [Math.round(w * scale), Math.round(h * scale)];
}

// Any picture the browser can show (object URL, data URL, same-origin URL) as a JPEG data URL.
export async function imageDataUrl(src: string): Promise<string> {
  const img = new Image();
  img.src = src;
  await img.decode();
  const [w, h] = fit(img.naturalWidth, img.naturalHeight);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
  return canvasToDataUrl(canvas);
}

// The last frame of a clip (a little before its end, where every browser has a frame to show).
export async function lastFrameDataUrl(src: string): Promise<string> {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = src;
  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error("No se pudo leer el clip anterior."));
  });
  await new Promise<void>((resolve, reject) => {
    video.onseeked = () => resolve();
    video.onerror = () => reject(new Error("No se pudo leer el clip anterior."));
    video.currentTime = Math.max(0, (Number.isFinite(video.duration) ? video.duration : 0) - 0.1);
  });
  const [w, h] = fit(video.videoWidth, video.videoHeight);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(video, 0, 0, w, h);
  return canvasToDataUrl(canvas);
}
