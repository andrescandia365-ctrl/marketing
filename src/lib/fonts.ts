// Loads a Google Fonts family on demand (brand fonts), so canvas text can use it once it is there.
const requested = new Set<string>();

export function ensureFont(family: string): Promise<void> {
  if (!family || typeof document === "undefined") return Promise.resolve();
  if (!requested.has(family)) {
    requested.add(family);
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, "+")}:wght@400;600;700&display=swap`;
    document.head.appendChild(link);
  }
  // A canvas only draws with a web font after it has loaded; fall back quietly when offline.
  return Promise.all(
    ["400", "700"].map((w) => document.fonts?.load(`${w} 48px "${family}"`).catch(() => [])),
  ).then(() => undefined);
}
