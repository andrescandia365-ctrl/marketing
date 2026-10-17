// Loads a brand font on demand (a Google Fonts family, or the series' own files), so canvas text can use it once it is there. The promise waits
// for the stylesheet and then the font files (the final render paints only after that), and gives up quietly after a
// few seconds when offline: the canvas then falls back to the next font in its list.
// "Fuentes propias de la marca" (shared/brandFonts.ts): a family a series uploaded is loaded from its own files with
// FontFace (registerBrandFonts first, or ensureBrandFonts), never from Google Fonts.
import { brandFontSources, brandFontUrl, type BrandFont } from "../../shared/brandFonts.ts";

const loading = new Map<string, Promise<void>>();

const WAIT = 8000;

type OwnFace = { url: string; weight: number; style: "normal" | "italic" };
// Uploaded families by lower-case name: the faces to load and where they are served.
const own = new Map<string, { family: string; faces: OwnFace[] }>();
const key = (family: string) => family.replace(/["']/g, "").trim().toLowerCase();

// The series' uploaded faces, so ensureFont and fontBytes find them by family name. A family registered again (the
// series changed its files) replaces what it had.
export function registerBrandFonts(seriesId: string, brand: { fonts?: BrandFont[] }) {
  const families = new Map<string, { family: string; faces: OwnFace[] }>();
  for (const f of brand.fonts ?? []) {
    const k = key(f.family);
    const entry = families.get(k) ?? { family: f.family, faces: [] };
    entry.faces.push({ url: brandFontUrl(seriesId, f.file), weight: f.weight, style: f.style });
    families.set(k, entry);
  }
  for (const [k, entry] of families) own.set(k, entry);
}

// The brand's two families, its uploaded files registered first; resolves with the families that did not load.
export async function ensureBrandFonts(seriesId: string, brand: { displayFont: string; uiFont: string; fonts?: BrandFont[] }): Promise<string[]> {
  registerBrandFonts(seriesId, brand);
  const sources = brandFontSources(brand);
  await Promise.all(sources.map((s) => ensureFont(s.family)));
  return sources.map((s) => s.family).filter((f) => !fontLoaded(f));
}

// What an effect that loads the brand fonts depends on (the names and the uploaded files).
export const brandFontsKey = (brand: { displayFont: string; uiFont: string; fonts?: BrandFont[] }) =>
  [brand.displayFont, brand.uiFont, ...(brand.fonts ?? []).map((f) => `${f.file}:${f.family}:${f.weight}:${f.style}`)].join("|");

// Each uploaded file's bytes, fetched once (FontFace in the page and the code-scene sandbox share them).
const fileBytes = new Map<string, Promise<ArrayBuffer | null>>();
function faceBytes(url: string): Promise<ArrayBuffer | null> {
  let got = fileBytes.get(url);
  if (!got) {
    got = fetch(url)
      .then((r) => (r.ok ? r.arrayBuffer() : null))
      .catch(() => null)
      .then((data) => {
        if (!data) fileBytes.delete(url);
        return data;
      });
    fileBytes.set(url, got);
  }
  return got;
}

function ensureOwnFont(entry: { family: string; faces: OwnFace[] }): Promise<void> {
  const id = `file:${entry.family}:${entry.faces.map((f) => `${f.url}@${f.weight}${f.style}`).join(",")}`;
  let done = loading.get(id);
  if (!done) {
    done = Promise.race([
      Promise.all(
        entry.faces.map(async (f) => {
          const data = await faceBytes(f.url);
          if (!data) return;
          const face = new FontFace(entry.family, data.slice(0), { weight: String(f.weight), style: f.style });
          await face.load();
          document.fonts.add(face);
        }),
      ).then(
        () => undefined,
        () => undefined,
      ),
      new Promise<void>((resolve) => setTimeout(resolve, WAIT)),
    ]).then(() => {
      // One that did not load is tried again next time.
      if (!fontLoaded(entry.family)) loading.delete(id);
    });
    loading.set(id, done);
  }
  return done;
}

export function ensureFont(family: string): Promise<void> {
  if (!family || typeof document === "undefined") return Promise.resolve();
  const mine = own.get(key(family));
  if (mine) return ensureOwnFont(mine);
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
  const one = (family: string): Promise<{ family: string; weight: string; data: ArrayBuffer }[]> => {
    // An uploaded family: its own files (the upright faces; the sandbox takes one face per weight).
    const mine = own.get(key(family));
    if (mine)
      return Promise.all(
        mine.faces
          .filter((f) => f.style === "normal")
          .map((f) => faceBytes(f.url).then((data) => (data ? { family, weight: String(f.weight), data } : null))),
      ).then((list) => list.filter((x): x is { family: string; weight: string; data: ArrayBuffer } => x !== null));
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
        .catch(() => [])
        .then((list) => {
          // A family that brought nothing is asked again next time (a network blip is not kept for the session).
          if (!list.length) bytes.delete(family);
          return list;
        });
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
