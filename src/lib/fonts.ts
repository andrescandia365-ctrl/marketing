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

// The brand fonts' files, for a code scene's sandbox (src/lib/codeSandbox.ts), which cannot reach Google Fonts itself:
// the latin faces of weights 400 to 700 of each family, read from the same stylesheet. A family that cannot be fetched
// is left out (the sandbox then draws in a fallback face and the test says so). Fetched once per family.
const bytes = new Map<string, Promise<{ family: string; weight: string; data: ArrayBuffer }[]>>();
export function fontBytes(families: string[]): Promise<{ family: string; weight: string; data: ArrayBuffer }[]> {
  const one = (family: string) => {
    let done = bytes.get(family);
    if (!done) {
      const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, "+")}:wght@400;500;600;700&display=swap`;
      done = fetch(url)
        .then((r) => (r.ok ? r.text() : ""))
        .then(async (css) => {
          const faces = fontFaces(css);
          const out = await Promise.all(
            faces.map((f) =>
              fetch(f.url)
                .then((r) => (r.ok ? r.arrayBuffer() : null))
                .then((data) => (data ? { family, weight: f.weight, data } : null))
                .catch(() => null),
            ),
          );
          return out.filter((x): x is { family: string; weight: string; data: ArrayBuffer } => x !== null);
        })
        .catch(() => []);
      bytes.set(family, done);
    }
    return done;
  };
  return Promise.all([...new Set(families.filter(Boolean))].map(one)).then((lists) => lists.flat().map((f) => ({ ...f, data: f.data.slice(0) })));
}

// The @font-face rules of a Google Fonts stylesheet that cover basic Latin (or say no range), one per weight.
export function fontFaces(css: string): { weight: string; url: string }[] {
  const out = new Map<string, string>();
  for (const block of css.match(/@font-face\s*{[^}]*}/g) ?? []) {
    const weight = block.match(/font-weight:\s*(\d+)/)?.[1] ?? "400";
    const url = block.match(/src:\s*url\(([^)]+)\)/)?.[1]?.replace(/["']/g, "");
    const range = block.match(/unicode-range:\s*([^;]+);/)?.[1] ?? "";
    if (!url) continue;
    const latin = !range || /U\+0000-00FF/i.test(range);
    if (latin && !out.has(weight)) out.set(weight, url);
  }
  return [...out].map(([weight, url]) => ({ weight, url }));
}
