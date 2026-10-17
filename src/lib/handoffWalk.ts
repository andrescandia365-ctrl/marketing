// Publicidad "Sin clave": where a walk of several prompts stands (which prompt, which replies came in) and the count
// the person typed, kept outside the panels. The panels unmount when the person opens another tab; coming back must
// not show prompt 1 again, or copying it again would ask for part 1's level quota a second time. Memory only: a
// reload starts over. Keys carry the series ("iman:hooks").
export type Walk = { resetKey: string; part: number; done: number[] };

const walks = new Map<string, Walk>();
const counts = new Map<string, number>();
const presets = new Map<string, number>();

// The saved walk while its request is the same (resetKey), else a fresh one from prompt 1.
export function loadWalk(key: string, resetKey: string): Walk {
  const saved = walks.get(key);
  return saved && saved.resetKey === resetKey ? { ...saved, done: [...saved.done] } : { resetKey, part: 1, done: [] };
}

export function saveWalk(key: string, walk: Walk): void {
  walks.set(key, { ...walk, done: [...walk.done] });
}

export function rememberedCount(key: string, fallback: number): number {
  return counts.get(key) ?? fallback;
}

export function rememberCount(key: string, count: number): void {
  counts.set(key, count);
}

// True the first time a preset ("Generar tanda" asked for N) is seen for this key, so it applies once and a remount
// does not undo a count typed since.
export function takePreset(key: string, preset: number | undefined): boolean {
  if (!preset || presets.get(key) === preset) return false;
  presets.set(key, preset);
  return true;
}
