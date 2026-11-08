// Publicidad, "Versión estática" (Imagen fija, paso 3): every approved hook can also run as a static ad. The hook's
// visualPrompt becomes a Grok image prompt with NO text (the still prompt builder of shared/still.ts, §3.2's slots,
// clear space where the words go); the person makes the picture and uploads it; the app sets the hook's on-screen line
// (and optionally a CTA) with the same overlay renderer as "Imagen fija" (shared/stillLayout.ts, src/lib/stillDraw.ts)
// and exports 9:16, 4:5 and 1:1 to publicidad/<series>/estaticos/<hookId>-<format>.png (text variants after the first
// are <hookId>-vN-<format>.png). The files go in the campaign CSV next to the videos. Pure code: no AI, no key.
import {
  AUDIENCE_LABEL,
  CSV_HEAD,
  LEVEL_INFO,
  copyKey,
  csvCell,
  embudoOfLevel,
  exportCsv,
  type AdsMedia,
  type Batch,
  type Cta,
  type Hook,
  type HookStatic,
  type Meat,
  type Offer,
} from "./ads.ts";
import { imageSaveLine } from "./adsBulk.ts";
import type { Reference } from "./reference.ts";
import type { SeriesLook } from "./series.ts";
import { stillChecks, stillImagePrompt, type StillConcept, type StillFamily, type StillProblem } from "./still.ts";
import {
  STILL_FORMATS,
  ctaLines,
  headlineLines,
  variantGrid,
  type KeepOut,
  type OverlayCopy,
  type StillFormat,
  type StillVariant,
} from "./stillLayout.ts";

// ── The hook as a still concept ───────────────────────────────────────────────────────────────────────────────────
// The family only names how the picture frames the pain; none of these needs a real proof (offers, press and
// testimonials stay in "Imagen fija", where the person confirms them).
export function hookFamily(h: Pick<Hook, "angle" | "formula">): StillFamily {
  if (h.formula === "beforeAfter") return "beforeAfter";
  const byAngle: Record<Hook["angle"], StillFamily> = {
    pain: "nightmare",
    desire: "benefit",
    objection: "comparison",
    myth: "comparison",
    curiosity: "humor",
    proof: "benefit",
  };
  return byAngle[h.angle];
}

const oneLine = (s: string, max: number) => s.replace(/\s+/g, " ").trim().slice(0, max);

// The words that go on the picture by default: the hook's on-screen line, or its first sentence when it has none.
export function hookHeadline(h: Pick<Hook, "onScreenText" | "text">): string {
  const own = oneLine(h.onScreenText, 120);
  if (own) return own;
  const first = oneLine(h.text, 600).split(/(?<=[.?!¿¡])\s+/)[0] ?? "";
  return first.slice(0, 90);
}

export function hookConcept(h: Hook, offer: Pick<Offer, "problem" | "promise">, placement: OverlayCopy["placement"] = "top"): StillConcept {
  const picture = oneLine(h.visualPrompt, 700) || `One frozen moment that shows this problem, said in Spanish: «${oneLine(h.text, 300)}». The presenter and the real place where it happens`;
  return {
    id: h.id,
    family: hookFamily(h),
    problem: oneLine(offer.problem, 120),
    title: oneLine(h.text, 120),
    pain: oneLine(h.text, 300),
    relief: oneLine(offer.promise, 300) || oneLine(h.text, 300),
    touching: "",
    picture,
    product: "",
    light: "",
    camera: "",
    copy: { headline: hookHeadline(h), sub: "", cta: "", placement },
    proof: "",
    proofOk: false,
    verify: [],
    caption: "",
  };
}

export type StaticPromptOptions = { look?: SeriesLook; brand: { accent: string; bg: string } };

// The Grok prompt for the hook's static version: no text, clear space where the first placement puts the words.
export function staticPrompt(h: Hook, offer: Pick<Offer, "problem" | "promise">, st: Pick<HookStatic, "placements">, o: StaticPromptOptions): string {
  const placement = st.placements[0] ?? "top";
  return stillImagePrompt(hookConcept(h, offer, placement), { ...o, placement });
}

// The file the person saves from Grok. It is not the piece image (H12-img) and it is not inside the prompt.
export function staticSaveStem(hookId: string): string {
  return `${hookId.toUpperCase()}-estatico`;
}

// Every prompt, one after another, to paste into Grok in a row. The file name is its own line, above the prompt.
export function allStaticPrompts(items: { hook: Hook; prompt: string }[]): string {
  return items.map(({ hook, prompt }) => `${hook.id} · ${hookHeadline(hook)}\n${imageSaveLine(staticSaveStem(hook.id))}\n${prompt}`).join("\n\n");
}

// ── Settings ──────────────────────────────────────────────────────────────────────────────────────────────────────
// A hook's static as the batch view starts it: the hook's line on top, no call, every format, the full frame.
export function defaultStatic(h: Hook): HookStatic {
  return {
    picture: null,
    headlines: hookHeadline(h),
    ctas: "",
    ctaId: "",
    placements: ["top"],
    align: "left",
    formats: [...STILL_FORMATS],
    fit: "full",
    keepOut: null,
    exports: [],
    dismissed: [],
  };
}
export const staticOf = (h: Hook, statics: Record<string, HookStatic>): HookStatic => statics[h.id] ?? defaultStatic(h);
export const keepOutOf = (st: HookStatic, toolDefault: KeepOut | null): KeepOut => st.keepOut ?? toolDefault ?? { corner: "none", w: 0, h: 0 };

// "Estáticos" keeps a local copy of each hook's static while the person edits it. What the server saved replaces it for
// every hook that has no edit waiting or on its way (`busy`), so an edit saved as the panel closed shows when it opens
// again. Nothing new: the same object.
export function adoptSaved(local: Record<string, HookStatic>, saved: Record<string, HookStatic>, busy: ReadonlySet<string>): Record<string, HookStatic> {
  let next = local;
  for (const [id, st] of Object.entries(saved)) {
    if (busy.has(id) || JSON.stringify(local[id]) === JSON.stringify(st)) continue;
    if (next === local) next = { ...local };
    next[id] = st;
  }
  return next;
}

// The edits still waiting when the panel closes, sent one after another (never two at once, so the last answer is the
// last save) and every answer handed on. One that fails does not stop the rest.
export async function flushInOrder<P, S>(patches: [string, P][], send: (id: string, patch: P) => Promise<S>, onState: (state: S) => void): Promise<void> {
  for (const [id, patch] of patches) {
    try {
      onState(await send(id, patch));
    } catch {
      // Kept as it was on the server; the panel shows the server's copy when it opens again.
    }
  }
}

// The words a CTA puts on the picture: its on-screen line, else the action it asks for.
export const ctaWords = (c: Pick<Cta, "onScreenText" | "what" | "text">) => oneLine(c.onScreenText, 60) || oneLine(c.what, 60) || oneLine(c.text, 60);

// "Variantes de texto": headlines × calls × placements, numbered from 1 (shared with "Imagen fija").
export function staticVariants(h: Hook, st: HookStatic): StillVariant[] {
  const heads = headlineLines(st.headlines);
  return variantGrid(heads.length ? heads : [{ headline: hookHeadline(h), sub: "" }], ctaLines(st.ctas), st.placements, st.align);
}

// ── Files ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// The first variant is <hookId>-<format>.png; the others carry their number: <hookId>-v2-<format>.png.
export const STATIC_FILE = /^(H\d{1,4})(?:-v(\d{1,2}))?-(9x16|4x5|1x1)\.png$/;
export const STATIC_PICTURE = /^(H\d{1,4})-imagen\.(png|jpg|webp)$/;
export function staticFile(hookId: string, n: number, format: StillFormat): string {
  return `${hookId}${n > 1 ? `-v${n}` : ""}-${format}.png`;
}
export function parseStaticFile(name: string): { hookId: string; n: number; format: StillFormat } | null {
  const m = STATIC_FILE.exec(name);
  return m ? { hookId: m[1], n: m[2] ? Number(m[2]) : 1, format: m[3] as StillFormat } : null;
}
// A file of this hook (and not of H12 when the hook is H1).
export const staticBelongs = (name: string, hookId: string) => parseStaticFile(name)?.hookId === hookId;

export type StaticJob = { variant: StillVariant; format: StillFormat; file: string };
export function staticJobs(h: Hook, st: HookStatic): StaticJob[] {
  const formats = STILL_FORMATS.filter((f) => st.formats.includes(f));
  return staticVariants(h, st).flatMap((variant) => formats.map((format) => ({ variant, format, file: staticFile(h.id, variant.n, format) })));
}

// ── Checks (the same as "Imagen fija": claims, [VERIFY], borrowed names or lines, legible text, watermark, fonts) ─────
export function staticChecks(o: {
  hook: Hook;
  offer: Pick<Offer, "problem" | "promise">;
  variants: OverlayCopy[];
  layouts: { label: string; fits: boolean; problems: string[] }[];
  picture: boolean;
  fontsLoaded: boolean;
  watermarkWhole: boolean;
  references: Reference[];
  brandName: string;
  // The Publicidad review's flags for this hook (claims, platform policy): they block until the hook is fixed.
  flags: { kind: string; note: string }[];
}): StillProblem[] {
  const concept = hookConcept(o.hook, o.offer);
  const base = stillChecks({
    concept,
    variants: o.variants,
    layouts: o.layouts,
    picture: o.picture,
    fontsLoaded: o.fontsLoaded,
    watermarkWhole: o.watermarkWhole,
    // The platform texts come with the batch, not with the picture (the caption checks are dropped below).
    caption: "",
    references: o.references,
    brandName: o.brandName,
  })
    // A hook is the pain alone: the touching detail lives in the meat, the relief in the CTA.
    .filter((p) => !["giro", "malo-bueno", "compartir", "compartir-generico"].includes(p.id))
    .map((p) => (p.id === "imagen" ? { ...p, detail: "Subí la imagen que hiciste en Grok con el prompt de este hook." } : p));
  if (o.hook.status !== "approved") base.unshift({ id: "aprobado", label: "Hook sin aprobar", detail: "Solo los hooks aprobados salen como estáticos.", blocking: true });
  for (const f of o.flags.filter((x) => x.kind === "claim" || x.kind === "policy"))
    base.push({ id: `revision:${f.kind}`, label: f.kind === "claim" ? "Promesa sin verificar" : "La plataforma suele rechazarlo", detail: f.note, blocking: true });
  return base;
}

// ── The campaign CSV: the batch's videos, then the static versions of its hooks ───────────────────────────────────
// Static rows: id <hookId>-<format> (or <hookId>-vN-<format>), the file relative to the batch's CSV, the hook, the CTA
// on the picture, and the platform texts of the batch's hook+CTA pair (that CTA's, else the hook's first pair).
export function staticRows(o: {
  hooks: Hook[];
  ctas: Cta[];
  statics: Record<string, HookStatic>;
  copies?: Batch["copies"];
  // How the CSV reaches estaticos/: "../../estaticos/" from anuncios/<batch>/, "" from estaticos/ itself.
  prefix: string;
  only?: Set<string>;
}): string[][] {
  const C = new Map(o.ctas.map((c) => [c.id, c]));
  const rows: string[][] = [];
  for (const h of o.hooks) {
    if (o.only && !o.only.has(h.id)) continue;
    const st = o.statics[h.id];
    if (!st?.exports.length) continue;
    const variants = new Map(staticVariants(h, st).map((v) => [v.n, v]));
    const cta = st.ctaId ? C.get(st.ctaId) : undefined;
    const copy =
      o.copies?.[copyKey(h.id, st.ctaId)] ?? Object.entries(o.copies ?? {}).find(([k]) => k.startsWith(`${h.id}-`))?.[1];
    for (const file of [...st.exports].sort()) {
      const parsed = parseStaticFile(file);
      if (!parsed || parsed.hookId !== h.id) continue;
      const v = variants.get(parsed.n);
      rows.push([
        file.replace(/\.png$/, ""),
        `${o.prefix}${file}`,
        `${h.level} · ${LEVEL_INFO[h.level].label}`,
        AUDIENCE_LABEL[LEVEL_INFO[h.level].audience],
        h.text,
        "",
        v?.cta || (cta ? ctaWords(cta) : ""),
        copy?.primary ?? "",
        copy?.headline ?? v?.headline ?? "",
        copy?.button ?? "",
        "imagen",
        parsed.format.replace("x", ":"),
        "",
        "",
        "",
        embudoOfLevel(h.level),
      ]);
    }
  }
  return rows;
}

const line = (cells: string[]) => cells.map(csvCell).join(",");

// The batch's CSV with the static versions of its hooks next to the videos.
export function campaignCsv(
  batch: Batch,
  hooks: Hook[],
  meats: Meat[],
  ctas: Cta[],
  statics: Record<string, HookStatic>,
  media?: Record<string, AdsMedia>,
  seriesId?: string,
): string {
  const videos = exportCsv(batch, hooks, meats, ctas, media, seriesId);
  const rows = staticRows({ hooks, ctas, statics, copies: batch.copies, prefix: "../../estaticos/", only: new Set(batch.ads.map((a) => a.hookId)) });
  return rows.length ? `${videos}\n${rows.map(line).join("\n")}` : videos;
}

// estaticos/estaticos.csv: every exported static, with or without a batch.
export function staticsCsv(hooks: Hook[], ctas: Cta[], statics: Record<string, HookStatic>): string {
  return [CSV_HEAD.join(","), ...staticRows({ hooks, ctas, statics, prefix: "" }).map(line)].join("\n");
}
