// Clipboard and file helpers for the copy-paste image workflow.

export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    // The async clipboard needs https or localhost; fall back for other addresses.
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  const ok = document.execCommand("copy");
  area.remove();
  if (!ok) throw new Error("No se pudo copiar. Seleccioná el texto y copialo a mano.");
}

export function readImageFile(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) return Promise.reject(new Error("Ese archivo no es una imagen."));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("No se pudo leer ese archivo."));
    reader.readAsDataURL(file);
  });
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("No se pudo leer ese archivo."));
    reader.readAsDataURL(blob);
  });
}

// A picture as a small JPEG (base64, no prefix) for the AI to look at, with the source's own size.
// `source` is an image URL, or a video file whose middle frame is used.
export async function pictureForReview(source: string | Blob, max = 1024): Promise<{ jpeg: string; width: number; height: number }> {
  let drawable: CanvasImageSource;
  let width: number;
  let height: number;
  let cleanup = () => {};
  if (typeof source === "string") {
    const img = new Image();
    img.src = source;
    await img.decode();
    [drawable, width, height] = [img, img.naturalWidth, img.naturalHeight];
  } else {
    const url = URL.createObjectURL(source);
    cleanup = () => URL.revokeObjectURL(url);
    const video = document.createElement("video");
    video.muted = true;
    video.preload = "auto";
    video.src = url;
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("No se pudo leer el clip."));
    });
    await new Promise<void>((resolve) => {
      video.onseeked = () => resolve();
      video.currentTime = Math.max(0, video.duration / 2);
    });
    [drawable, width, height] = [video, video.videoWidth, video.videoHeight];
  }
  const scale = Math.min(1, max / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  canvas.getContext("2d")!.drawImage(drawable, 0, 0, canvas.width, canvas.height);
  cleanup();
  return { jpeg: canvas.toDataURL("image/jpeg", 0.85).split(",")[1], width, height };
}
