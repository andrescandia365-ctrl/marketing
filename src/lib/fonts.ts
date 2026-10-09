// Loads a Google Fonts family on demand (brand fonts), so canvas text can use it once it is there. The promise waits
// for the stylesheet and then the font files (the final render paints only after that), and gives up quietly after a
// few seconds when offline: the canvas then falls back to the next font in its list.
const loading = new Map<string, Promise<void>>();

const WAIT = 8000;

export function ensureFont(family: string): Promise<void> {
  if (!family || typeof document === "undefined") return Promise.resolve();
  let done = loading.get(family);
  if (!done) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, "+")}:wght@400;500;600;700&display=swap`;
    const sheet = new Promise<void>((resolve) => {
      link.onload = () => resolve();
      link.onerror = () => resolve();
      setTimeout(resolve, WAIT);
    });
    document.head.appendChild(link);
    done = sheet.then(() =>
      Promise.race([
        Promise.all(["400", "500", "600", "700"].map((w) => document.fonts?.load(`${w} 48px "${family}"`).catch(() => []))).then(() => undefined),
        new Promise<void>((resolve) => setTimeout(resolve, WAIT)),
      ]),
    );
    loading.set(family, done);
  }
  return done;
}

// Whether a face of this family really loaded. (document.fonts.check() says yes for a family it has never heard of,
// since there is nothing to wait for, so it cannot tell a brand font from the fallback.)
export function fontLoaded(family: string): boolean {
  if (!family || typeof document === "undefined") return true;
  const name = family.replace(/["']/g, "").trim().toLowerCase();
  let loaded = false;
  document.fonts.forEach((face) => {
    if (face.status === "loaded" && face.family.replace(/["']/g, "").trim().toLowerCase() === name) loaded = true;
  });
  return loaded;
}
