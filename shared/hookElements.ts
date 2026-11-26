// "Elementos del gancho": one striking, filmable thing in the first 1–2 seconds, tied to the pain.
// Missing on an old story, hook, scene or concept means none. At most three per hook.
import { z } from "zod";
import { safeBands, type Rect } from "./safeZone.ts";

// The tool's watermark band, same shape as stillLayout's KeepOut, without importing it (that file imports series).
export type WatermarkBand = { corner: string; w: number; h: number };

export const HOOK_ELEMENT_MAX = 3;
export const ELEMENT_LIBRARY_MAX = 40;
export const ELEMENT_SET_IDS = ["e1", "e2", "e3"] as const;
export type ElementSetId = (typeof ELEMENT_SET_IDS)[number];

export const PLACEMENTS = ["foreground", "hand", "background", "center"] as const;
export type HookPlacement = (typeof PLACEMENTS)[number];

export const PLACEMENT_LABEL: Record<HookPlacement, string> = {
  foreground: "adelante",
  hand: "en la mano",
  background: "al fondo",
  center: "al centro",
};

export type HookElement = {
  id: string;
  // Exact visual description in English, for the image generator.
  what: string;
  // Short Spanish name.
  label: string;
  // Spanish: why it stops the scroll.
  why: string;
  // Spanish: how it connects to the pain. Empty is a failed check.
  tie: string;
  placement: HookPlacement;
  castId?: string;
  // English: the one thing it does in the clip. Empty: a still hold.
  does?: string;
};

export type ElementSet = {
  id: ElementSetId;
  elements: HookElement[];
  visualPrompt: string;
  videoPrompt: string;
};

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();

export function isPlacement(value: string): value is HookPlacement {
  return (PLACEMENTS as readonly string[]).includes(value);
}

export function isElementSetId(value: string): value is ElementSetId {
  return (ELEMENT_SET_IDS as readonly string[]).includes(value);
}

function clean(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function placementOf(value: unknown): HookPlacement {
  const t = fold(typeof value === "string" ? value : "");
  if (t.includes("hand") || t.includes("mano")) return "hand";
  if (t.includes("back") || t.includes("fondo")) return "background";
  if (t.includes("center") || t.includes("centro") || t.includes("centre")) return "center";
  if (t.includes("fore") || t.includes("adelante") || t.includes("front")) return "foreground";
  return "foreground";
}

let seq = 0;
function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}${seq.toString(36)}`;
}

// Old data, a missing list, or a bad item becomes a short list. Nothing is invented past what was written.
export function normalizeHookElements(raw: unknown, max = HOOK_ELEMENT_MAX): HookElement[] {
  let list: unknown = raw;
  if (typeof list === "string") {
    const text = list.trim();
    if (!text) return [];
    try {
      list = JSON.parse(text);
    } catch {
      return [];
    }
  }
  if (list && typeof list === "object" && !Array.isArray(list) && Array.isArray((list as { elements?: unknown }).elements)) {
    list = (list as { elements: unknown }).elements;
  }
  if (!Array.isArray(list)) return [];
  const cap = Math.max(0, Math.min(max, ELEMENT_LIBRARY_MAX));
  const out: HookElement[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const what = clean(row.what, 400);
    const label = clean(row.label, 80);
    if (!what && !label) continue;
    const castId = clean(row.castId, 40);
    const does = clean(row.does, 200);
    out.push({
      id: clean(row.id, 40) || nextId("he"),
      what: what || label,
      label: label || what.slice(0, 40),
      why: clean(row.why, 300),
      tie: clean(row.tie, 300),
      placement: placementOf(row.placement),
      ...(castId ? { castId } : {}),
      ...(does ? { does } : {}),
    });
    if (out.length >= cap) break;
  }
  return out;
}

// The previous piece's what and label, so the next one does not repeat them. At most three.
export function previousFrom(elements: readonly { what?: string; label?: string }[] | undefined): string[] {
  return (elements ?? [])
    .flatMap((e) => [e.what ?? "", e.label ?? ""])
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, HOOK_ELEMENT_MAX);
}

export const HookElementSchema = z.object({
  id: z.string().max(40),
  what: z.string().max(400),
  label: z.string().max(80),
  why: z.string().max(300),
  tie: z.string().max(300),
  placement: z.enum(PLACEMENTS),
  castId: z.string().max(40).optional(),
  does: z.string().max(200).optional(),
});

export const ElementSetSchema = z.object({
  id: z.enum(ELEMENT_SET_IDS),
  elements: z.array(HookElementSchema).max(HOOK_ELEMENT_MAX),
  visualPrompt: z.string().max(3000),
  videoPrompt: z.string().max(3000),
});

export const HookElementWireSchema = z.object({
  id: z.string().optional().describe("Short id. Empty: the app assigns one."),
  what: z
    .string()
    .describe(
      "The exact thing in frame, in English, concrete and filmable (a bubblegum-pink handheld microphone with glitter). No real brand, logo, insignia or uniform of a real organisation. No real person.",
    ),
  label: z.string().describe("Short name in Spanish, two to five words."),
  why: z.string().describe("In Spanish: why this stops the scroll in the first 1–2 seconds."),
  tie: z.string().describe("In Spanish: how this thing is the pain, not decoration. Never empty."),
  placement: z.string().describe("One of: foreground, hand, background, center."),
  castId: z.string().optional().describe("A cast member id when this thing is already in the cast. Empty if new."),
  does: z.string().optional().describe("In English: the one action in the clip (the mic spins once on the table). Empty if it only holds."),
});

export const HookElementsWireSchema = z.object({
  elements: z.array(HookElementWireSchema).describe("Two or three hook elements for this hook. Never more than three."),
});

// The writer's rules. English, after the prompt cache, on every task that writes a hook.
export function hookElementRules(library: readonly HookElement[] = [], previous: readonly string[] = []): string {
  const saved = library
    .slice(0, 12)
    .map((e) => `- ${e.label}: ${e.what} (${e.placement}). Tie: ${e.tie || "—"}.`)
    .join("\n");
  const last = previous.map((p) => p.trim()).filter(Boolean).slice(0, HOOK_ELEMENT_MAX);
  return [
    "Hook elements: when you write a hook, propose 2 or 3 hook elements (never more than 3).",
    "A hook element is one striking, recognisable thing in the first 1–2 seconds that stops the scroll and makes people look twice. It is not decoration. It is tied to the piece's pain.",
    "Each element: what (exact visual, English, filmable), label (short Spanish name), why (Spanish, why it stops the scroll), tie (Spanish, how it connects to the pain; never empty), placement (foreground, hand, background or center), and does (English, the one action in the clip, or empty if it only holds).",
    "Rules: concrete and filmable; tied to the pain; unusual enough to stop the scroll; no real brands, logos, insignia or uniforms of a real organisation (a generic police car with no real insignia is fine); no real people; identity symbols treated with respect and never as the joke (punch at the problem, never the person); no politics.",
    "Put each element in the hook shot (the first shot, one frozen moment in the image prompt; the action in the video prompt). Do not change a prompt the person already rewrote by hand.",
    saved ? `Elements already saved for this series. Reuse a winner when it fits this pain:\n${saved}` : "No hook element is saved for this series yet.",
    last.length
      ? `The previous piece of this series used: ${last.join(" | ")}. Do not use the same element again on this piece.`
      : "No previous piece's hook element is on record.",
  ].join("\n");
}

// The small prompt for "Pedir otros elementos": three new ones for this hook.
export function hookElementsPrompt(o: { pain: string; existing?: readonly HookElement[]; avoid?: readonly string[]; library?: readonly HookElement[] }): string {
  const have = (o.existing ?? []).map((e) => `- ${e.label}: ${e.what}`).join("\n");
  const avoid = (o.avoid ?? []).map((a) => a.trim()).filter(Boolean);
  return [
    "Propose 3 hook elements for this piece. Return only JSON: {\"elements\":[{id, what, label, why, tie, placement, does}]}.",
    hookElementRules(o.library ?? [], avoid),
    `The pain: ${o.pain.trim() || "(unnamed)"}`,
    have ? `Already on this hook; do not repeat them:\n${have}` : "This hook has no elements yet.",
    avoid.length ? `Do not use these; the previous piece used them: ${avoid.join(" | ")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function parseHookElementsReply(text: string): HookElement[] {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return [];
  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as { elements?: unknown };
    return normalizeHookElements(parsed.elements);
  } catch {
    return [];
  }
}

export function placementPhrase(placement: HookPlacement): string {
  if (placement === "hand") return "held in a hand";
  if (placement === "background") return "in the background";
  if (placement === "center") return "in the center of the frame, clear of the corners";
  return "in the foreground";
}

export function elementImageClause(element: HookElement): string {
  return `${element.what}, ${placementPhrase(element.placement)}`;
}

export function elementVideoClause(element: HookElement): string {
  const action = element.does?.trim();
  return action || `${element.what} holds still, ${placementPhrase(element.placement)}`;
}

// Appends a clause once. A prompt that already contains it is returned unchanged.
export function appendClause(prompt: string, clause: string): string {
  const extra = clause.trim().replace(/[.;,\s]+$/, "");
  if (!extra) return prompt;
  if (prompt.toLowerCase().includes(extra.toLowerCase())) return prompt;
  const base = prompt.trim().replace(/[.\s]+$/, "");
  return base ? `${base}. ${extra}.` : `${extra}.`;
}

export function withElementPrompt(prompt: string, elements: readonly HookElement[] | undefined, kind: "image" | "video"): string {
  let next = prompt;
  for (const element of (elements ?? []).slice(0, HOOK_ELEMENT_MAX)) {
    next = appendClause(next, kind === "image" ? elementImageClause(element) : elementVideoClause(element));
  }
  return next;
}

export type ElementSetup = { id: string; name: string; identity: string; castId: string };

export function elementSetup(element: HookElement): ElementSetup {
  return {
    id: element.id.startsWith("he-") ? element.id : `he-${element.id}`,
    name: element.label,
    identity: element.what,
    castId: element.castId ?? "",
  };
}

export type SetupShot = {
  kind: string;
  setups: string[];
  visualPrompt: string;
  videoPrompt: string;
};

export type SetupBoard = {
  setups: ElementSetup[];
  shots: SetupShot[];
};

// The hook shot is shot 1, and only when it is a single still. Screen and transform shots are left as they are
// (their frames are a real screenshot or a move between frames).
export function applyElementsToBoard<T extends SetupBoard>(board: T, elements: readonly HookElement[]): { board: T; missing: number[] } {
  const list = elements.slice(0, HOOK_ELEMENT_MAX);
  const shot = board.shots[0];
  if (!shot || shot.kind !== "single") return { board, missing: shot ? [0] : [] };
  const oldIds = new Set(board.setups.filter((s) => s.id.startsWith("he-")).map((s) => s.id));
  const added = list.map(elementSetup);
  const setups = [...board.setups.filter((s) => !s.id.startsWith("he-")), ...added];
  const shots = board.shots.map((s, index) => {
    const kept = s.setups.filter((id) => !oldIds.has(id));
    if (index !== 0) return { ...s, setups: kept };
    return {
      ...s,
      setups: [...kept, ...added.map((a) => a.id)],
      visualPrompt: withElementPrompt(s.visualPrompt, list, "image"),
      videoPrompt: withElementPrompt(s.videoPrompt, list, "video"),
    };
  });
  return { board: { ...board, setups, shots }, missing: [] };
}

// One identity edit, the same shape propagateSetupIdentity returns, so Deshacer can put the line back.
export type ElementPromptEdit = {
  setupId: string;
  before: string;
  after: string;
  shot: number;
  field: "visualPrompt" | "videoPrompt";
  promptBefore: string;
  promptAfter: string;
};

export function replaceIdentity(prompt: string, before: string, after: string): string | null {
  const from = before.trim();
  const to = after.trim();
  if (!from || !to || from === to) return null;
  if (from.length < 8) return null;
  const index = prompt.toLowerCase().indexOf(from.toLowerCase());
  if (index < 0) return null;
  return prompt.slice(0, index) + to + prompt.slice(index + from.length);
}

// Editing, adding or removing updates the hook shot's prompts. A line the person rewrote (the old description is
// not in the prompt) is reported and left as it is.
export function syncElementPrompts(
  shot: SetupShot,
  before: readonly HookElement[],
  after: readonly HookElement[],
): { shot: SetupShot; missing: string[]; edits: ElementPromptEdit[] } {
  if (shot.kind !== "single") return { shot, missing: ["la toma 1 no es una imagen única"], edits: [] };
  let visual = shot.visualPrompt;
  let video = shot.videoPrompt;
  const missing: string[] = [];
  const edits: ElementPromptEdit[] = [];
  const nextIds = new Set(after.map((e) => e.id));
  for (const old of before) {
    if (nextIds.has(old.id)) continue;
    for (const field of ["visualPrompt", "videoPrompt"] as const) {
      const text = field === "visualPrompt" ? visual : video;
      const clause = field === "visualPrompt" ? elementImageClause(old) : elementVideoClause(old);
      const cleared = stripClause(text, clause) ?? stripClause(text, old.what);
      if (cleared === null) {
        if (text.trim()) missing.push(old.label);
        continue;
      }
      edits.push({ setupId: elementSetup(old).id, before: old.what, after: "", shot: 0, field, promptBefore: text, promptAfter: cleared });
      if (field === "visualPrompt") visual = cleared;
      else video = cleared;
    }
  }
  const prevById = new Map(before.map((e) => [e.id, e]));
  for (const element of after) {
    const old = prevById.get(element.id);
    if (!old) {
      const vBefore = visual;
      const dBefore = video;
      visual = appendClause(visual, elementImageClause(element));
      video = appendClause(video, elementVideoClause(element));
      if (visual !== vBefore) edits.push({ setupId: elementSetup(element).id, before: "", after: element.what, shot: 0, field: "visualPrompt", promptBefore: vBefore, promptAfter: visual });
      if (video !== dBefore) edits.push({ setupId: elementSetup(element).id, before: "", after: element.what, shot: 0, field: "videoPrompt", promptBefore: dBefore, promptAfter: video });
      continue;
    }
    if (old.what !== element.what) {
      const nextVisual = replaceIdentity(visual, old.what, element.what);
      const nextVideo = replaceIdentity(video, old.what, element.what);
      if (nextVisual === null && visual.trim()) missing.push(element.label);
      else if (nextVisual !== null) {
        edits.push({ setupId: elementSetup(element).id, before: old.what, after: element.what, shot: 0, field: "visualPrompt", promptBefore: visual, promptAfter: nextVisual });
        visual = nextVisual;
      }
      if (nextVideo === null && video.trim()) missing.push(element.label);
      else if (nextVideo !== null) {
        edits.push({ setupId: elementSetup(element).id, before: old.what, after: element.what, shot: 0, field: "videoPrompt", promptBefore: video, promptAfter: nextVideo });
        video = nextVideo;
      }
    }
  }
  const ids = after.map((e) => elementSetup(e).id);
  const kept = shot.setups.filter((id) => !id.startsWith("he-"));
  return { shot: { ...shot, visualPrompt: visual, videoPrompt: video, setups: [...kept, ...ids] }, missing: [...new Set(missing)], edits };
}

function stripClause(prompt: string, clause: string): string | null {
  const bit = clause.trim().replace(/[.;,\s]+$/, "");
  if (bit.length < 8) return null;
  const index = prompt.toLowerCase().indexOf(bit.toLowerCase());
  if (index < 0) return null;
  const cut = `${prompt.slice(0, index)} ${prompt.slice(index + bit.length)}`
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,])/g, "$1")
    .replace(/([.])\s*[.]/g, "$1")
    .trim();
  return cut;
}

// Puts back prompts this edit wrote. A prompt changed by hand since then stays, and is reported.
export function undoElementEdits<T extends { visualPrompt: string; videoPrompt: string }>(shot: T, edits: readonly ElementPromptEdit[]): { shot: T; kept: string[] } {
  let next = shot;
  const kept: string[] = [];
  for (const edit of [...edits].reverse()) {
    const current = next[edit.field];
    if (current !== edit.promptAfter) {
      kept.push(edit.field);
      continue;
    }
    next = { ...next, [edit.field]: edit.promptBefore };
  }
  return { shot: next, kept };
}

// Still slots: the subject (slot 1) and how the thing appears (slot 7). No elements: the slot text is unchanged.
// Each clause is appended on its own, so a prompt that already has it (withElementPrompt) is not written twice.
export function stillSlotText(text: string, elements: readonly HookElement[] | undefined, slot: 1 | 7): string {
  const list = (elements ?? []).slice(0, HOOK_ELEMENT_MAX);
  if (!list.length) return text;
  let next = text;
  for (const element of list) {
    const clause = slot === 1 ? elementImageClause(element) : `${element.what}, ${placementPhrase(element.placement)}`;
    next = appendClause(next, clause);
  }
  return next;
}

// The client's edit. Replaces the hook shot's element lines (it does not append a second copy of an old what).
// Only shot 1, and only when it is a single still. A screen or a transform is left as it is.
export function commitHookElements<T extends SetupBoard>(
  board: T,
  before: readonly HookElement[],
  after: readonly HookElement[],
): { board: T; missing: string[]; edits: ElementPromptEdit[] } {
  const list = after.slice(0, HOOK_ELEMENT_MAX);
  const shot = board.shots[0];
  if (!shot || shot.kind !== "single") return { board, missing: shot ? ["la toma 1 no es una imagen única"] : [], edits: [] };
  const synced = syncElementPrompts(shot, before, list);
  const added = list.map(elementSetup);
  const setups = [...board.setups.filter((s) => !s.id.startsWith("he-")), ...added];
  const shots = board.shots.map((s, index) => (index === 0 ? synced.shot : { ...s, setups: s.setups.filter((id) => !id.startsWith("he-")) }));
  return { board: { ...board, setups, shots }, missing: synced.missing, edits: synced.edits };
}

// Sample mode ("Pedir otros elementos" with no key): three filmable things, complete ties, no real brand.
export function sampleHookElements(pain: string): HookElement[] {
  const tie = pain.trim() || "el problema de todos los días";
  return normalizeHookElements([
    {
      id: "he-sample-1",
      what: "a bubblegum-pink handheld microphone with glitter, no logo",
      label: "Micrófono rosa",
      why: "El rosa chicle corta el scroll en el primer segundo.",
      tie: `Es el objeto del reclamo: ${tie}.`,
      placement: "center",
      does: "the microphone spins once on the table",
    },
    {
      id: "he-sample-2",
      what: "a generic police car with no real insignia, hood open, up on a lift in a small garage",
      label: "Auto en el elevador",
      why: "Un auto levantado no se ve en un anuncio común.",
      tie: `Muestra el día trabado: ${tie}.`,
      placement: "center",
    },
    {
      id: "he-sample-3",
      what: "a cracked kitchen timer with a red hand stuck at zero, plain plastic, no brand",
      label: "Timer trabado",
      why: "El cero en rojo dice que el tiempo ya se acabó.",
      tie: `El tiempo que se pierde es ${tie}.`,
      placement: "center",
    },
  ]);
}

export type ElementCarrier = {
  hookElements?: HookElement[];
  elementSets?: ElementSet[];
  visualPrompt: string;
  videoPrompt: string;
};

// A second set is stored together with the first, so one visual set never renames H12. The third is e3.
export function addElementSet<T extends ElementCarrier>(hook: T): T {
  const current: ElementSet = {
    id: "e1",
    elements: hook.hookElements ?? [],
    visualPrompt: hook.visualPrompt,
    videoPrompt: hook.videoPrompt,
  };
  const existing = (hook.elementSets ?? []).filter((s) => isElementSetId(s.id));
  const base = existing.length ? existing : [current];
  if (base.length >= ELEMENT_SET_IDS.length) return { ...hook, elementSets: base.slice(0, ELEMENT_SET_IDS.length).map((s, i) => ({ ...s, id: ELEMENT_SET_IDS[i] })) };
  const nextId = ELEMENT_SET_IDS[base.length];
  const source = base[0];
  const copy: ElementSet = {
    id: nextId,
    elements: source.elements.map((e) => ({ ...e, id: `${e.id}-${nextId}`.slice(0, 40) })),
    visualPrompt: source.visualPrompt,
    videoPrompt: source.videoPrompt,
  };
  const sets = [...base, copy].slice(0, ELEMENT_SET_IDS.length).map((s, i) => ({ ...s, id: ELEMENT_SET_IDS[i] }));
  return { ...hook, elementSets: sets };
}

// The render of one set uses that set's prompts. No set named: the piece is unchanged.
export function pieceWithSet<T extends ElementCarrier>(piece: T, element?: string): T {
  if (!element || !isElementSetId(element)) return piece;
  const set = piece.elementSets?.find((s) => s.id === element);
  if (!set) return piece;
  return { ...piece, visualPrompt: set.visualPrompt, videoPrompt: set.videoPrompt, hookElements: set.elements };
}

// One set: the ad id stays H12-M3-C1. More than one: H12e2-M3-C1.
export function elementAxis(ids: readonly string[] | undefined): (ElementSetId | undefined)[] {
  const sets = [...new Set((ids ?? []).filter(isElementSetId))];
  if (sets.length <= 1) return [undefined];
  return sets;
}

export function elementoCell(setId: string | undefined, labels: readonly string[]): string {
  if (setId && isElementSetId(setId)) return setId;
  const named = labels.map((l) => l.trim()).filter(Boolean);
  if (named.length <= 1 && !setId) return named[0] ? "" : "";
  // A single set has no "e" suffix. The column stays empty unless the ad names a set or the hook has elements
  // the person should see. Old hooks have no labels, so the cell is empty.
  return named.join(" · ");
}

// The column shows the set when the ad id carries one, else the labels when the hook has elements, else empty.
export function elementoOf(setId: string | undefined, elements: readonly { label: string }[] | undefined): string {
  if (setId && isElementSetId(setId)) return setId;
  const labels = (elements ?? []).map((e) => e.label.trim()).filter(Boolean);
  return labels.length ? labels.join(" · ") : "";
}

// Same element twice in a row: the previous piece's what/label, folded.
export function repeatedElements(previous: readonly string[], proposed: readonly HookElement[]): HookElement[] {
  const banned = new Set(previous.map((p) => fold(p)).filter(Boolean));
  if (!banned.size) return [];
  return proposed.filter((e) => banned.has(fold(e.what)) || banned.has(fold(e.label)) || banned.has(fold(e.id)));
}

export function libraryWithout(library: readonly HookElement[], id: string): HookElement[] {
  return library.filter((e) => e.id !== id).slice(0, ELEMENT_LIBRARY_MAX);
}

export function libraryAdd(library: readonly HookElement[], element: HookElement): HookElement[] {
  const what = fold(element.what);
  const kept = library.filter((e) => fold(e.what) !== what && e.id !== element.id);
  return [...kept, element].slice(-ELEMENT_LIBRARY_MAX);
}

// ── Checks (dismissible) ────────────────────────────────────────────────────────
export type ElementProblem = { id: string; label: string; detail: string; shot?: number };

const BRANDS = [
  "nike",
  "adidas",
  "apple",
  "iphone",
  "coca-cola",
  "cocacola",
  "pepsi",
  "mcdonald",
  "mcdonalds",
  "starbucks",
  "samsung",
  "google",
  "facebook",
  "instagram",
  "tiktok",
  "whatsapp",
  "mercedes",
  "bmw",
  "ferrari",
  "gucci",
  "disney",
  "marvel",
  "pokemon",
  "nintendo",
  "youtube",
];

// "no real insignia" / "without a logo" is the allowed generic. The word alone, or a real brand, is not.
export function namesRealMark(what: string): boolean {
  const cleaned = fold(what)
    .replace(/\b(no|without|sin|generic|unmarked|plain)\s+(?:(?:a|an|the|un|una|real)\s+)*(logo|insignia|badge|emblem|brand|uniform|mark)s?\b/g, " ")
    .replace(/\bno real insignia\b/g, " ");
  if (BRANDS.some((b) => new RegExp(`\\b${b}\\b`).test(cleaned))) return true;
  if (/\b(logo|insignia|badge|emblem|wordmark|trademark)\b/.test(cleaned)) return true;
  if (/\b(police|sheriff|military|army)\s+(uniform|badge|insignia)\b/.test(cleaned)) return true;
  return false;
}

// A 9:16 frame. The box is a share of the frame (0–1). Center stays inside the safe zone. A corner named in the
// description, or a box that reaches the platform's covers or the tool's watermark, does not.
export function elementBox(element: Pick<HookElement, "placement" | "what">): Rect {
  const named = cornerBox(element.what);
  if (named) return named;
  if (element.placement === "center") return { x: 0.28, y: 0.32, w: 0.4, h: 0.28 };
  if (element.placement === "hand") return { x: 0.34, y: 0.42, w: 0.28, h: 0.22 };
  if (element.placement === "background") return { x: 0.18, y: 0.22, w: 0.6, h: 0.4 };
  return { x: 0.22, y: 0.38, w: 0.5, h: 0.28 };
}

function cornerBox(what: string): Rect | null {
  const t = fold(what);
  const top = /top|arriba|upper|superior/.test(t);
  const bottom = /bottom|abajo|lower|inferior/.test(t);
  const right = /right|derecha/.test(t);
  const left = /left|izquierda/.test(t);
  const watermark = /watermark|marca de agua/.test(t);
  if (!top && !bottom && !right && !left && !watermark) return null;
  const x = right || watermark ? 0.78 : left ? 0.02 : 0.3;
  const y = top ? 0.02 : bottom || watermark ? 0.82 : 0.4;
  return { x, y, w: 0.18, h: 0.14 };
}

function bandRect(keepOut: WatermarkBand, w: number, h: number): Rect | null {
  if (keepOut.corner === "none" || !(keepOut.w > 0) || !(keepOut.h > 0)) return null;
  const bw = w * keepOut.w;
  const bh = h * keepOut.h;
  const right = keepOut.corner.endsWith("right");
  const bottom = keepOut.corner.startsWith("bottom");
  return { x: right ? w - bw : 0, y: bottom ? h - bh : 0, w: bw, h: bh };
}

export function elementInCover(element: Pick<HookElement, "placement" | "what">, keepOut?: WatermarkBand | null, frame = { w: 1080, h: 1920 }): boolean {
  const box = elementBox(element);
  const px: Rect = { x: box.x * frame.w, y: box.y * frame.h, w: box.w * frame.w, h: box.h * frame.h };
  if (safeBands(px, frame.w, frame.h).length) return true;
  const band = keepOut ? bandRect(keepOut, frame.w, frame.h) : null;
  if (!band) return false;
  const x = Math.max(0, Math.min(px.x + px.w, band.x + band.w) - Math.max(px.x, band.x));
  const y = Math.max(0, Math.min(px.y + px.h, band.y + band.h) - Math.max(px.y, band.y));
  return x > 2 && y > 2;
}

export function elementProblems(
  elements: readonly HookElement[] | undefined,
  opts: { keepOut?: WatermarkBand | null; shot?: number } = {},
): ElementProblem[] {
  const problems: ElementProblem[] = [];
  (elements ?? []).slice(0, HOOK_ELEMENT_MAX).forEach((element, index) => {
    const shot = opts.shot;
    if (!element.tie.trim()) {
      problems.push({
        id: `elemento:nexo:${element.id || index}`,
        label: "Elemento sin nexo",
        detail: `${element.label || "Un elemento"} no dice cómo se ata al dolor. No es decoración: tiene que ser el problema.`,
        ...(shot !== undefined ? { shot } : {}),
      });
    }
    if (namesRealMark(element.what)) {
      problems.push({
        id: `elemento:marca:${element.id || index}`,
        label: "Marca o insignia real",
        detail: `${element.label || "Un elemento"} nombra una marca, un logo o una insignia real ("${element.what.slice(0, 80)}"). Usá un objeto genérico, sin insignia.`,
        ...(shot !== undefined ? { shot } : {}),
      });
    }
    if (elementInCover(element, opts.keepOut)) {
      problems.push({
        id: `elemento:zona:${element.id || index}`,
        label: "Elemento en la zona tapada",
        detail: `${element.label || "Un elemento"} cae en la banda de la marca de agua o en lo que tapa la app (arriba, abajo o la columna de botones). Movelo al centro del cuadro.`,
        ...(shot !== undefined ? { shot } : {}),
      });
    }
  });
  return problems;
}

export function openElementProblems(
  piece: { hookElements?: readonly HookElement[] | null; elementDismissed?: readonly string[] | null },
  opts: { keepOut?: WatermarkBand | null } = {},
): ElementProblem[] {
  const dismissed = new Set(piece.elementDismissed ?? []);
  return elementProblems(piece.hookElements ?? [], opts).filter((p) => !dismissed.has(p.id));
}

export function elementosMarkdown(elements: readonly HookElement[] | undefined): string {
  const list = elements ?? [];
  if (!list.length) return "";
  const lines = list.map((e) => `- **${e.label}** (${PLACEMENT_LABEL[e.placement]}): ${e.why} ${e.tie}`.trim());
  return `\n**Elementos del gancho:**\n${lines.join("\n")}\n`;
}

// The bible line. Empty when the series has none, so an old bible is unchanged.
export const HOOK_LIBRARY_LINE = "Elementos del gancho";

export function hookLibraryLine(elements: readonly HookElement[]): string[] {
  const list = elements.slice(0, ELEMENT_LIBRARY_MAX);
  if (!list.length) return [];
  return [`${HOOK_LIBRARY_LINE}: ${JSON.stringify(list)}`];
}

export function readHookLibraryLine(text: string): HookElement[] {
  const match = text.match(new RegExp(`^${HOOK_LIBRARY_LINE}:[ \\t]*(\\[.*\\])\\s*$`, "im"));
  if (!match) return [];
  try {
    return normalizeHookElements(JSON.parse(match[1]), ELEMENT_LIBRARY_MAX);
  } catch {
    return [];
  }
}

export const HOOK_PREVIOUS_LINE = "Últimos elementos";

export function hookPreviousLine(previous: readonly string[]): string[] {
  const list = previous.map((p) => p.trim()).filter(Boolean).slice(0, HOOK_ELEMENT_MAX);
  if (!list.length) return [];
  return [`${HOOK_PREVIOUS_LINE}: ${JSON.stringify(list)}`];
}

export function readHookPreviousLine(text: string): string[] {
  const match = text.match(new RegExp(`^${HOOK_PREVIOUS_LINE}:[ \\t]*(\\[.*\\])\\s*$`, "im"));
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[1]) as unknown;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean).slice(0, HOOK_ELEMENT_MAX) : [];
  } catch {
    return [];
  }
}
