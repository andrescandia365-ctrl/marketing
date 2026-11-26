// "Imagen fija" (IDEAS 34 points 3-5, PLAYBOOK §1 Job B, §3.2, §5, §7.4): one picture where the Negative and the Good
// meet in a single frame. Flow: brief → a menu of concepts by family (each one names the pain, the relief, the touching
// detail and its family) → the picked concept's image prompt in §3.2's slot order, with clear space for the words and
// NO text in the picture → the person makes it in Grok and uploads it → the app sets the words on top
// (shared/stillLayout.ts) → exports in 9:16, 4:5 and 1:1 with the share caption.
// It works with no AI key: "Copiar el prompt para Opus" builds the request for claude.ai and the reply is pasted back in
// the strict format below (parseStillPaste). With a key, the same prompt goes to the writer and its reply is read by the
// same parser. Offers, press and testimonials only when real: otherwise [VERIFY] and the export is blocked.
import { borrowedNames } from "./checks.ts";
import { hookElementRules, normalizeHookElements, stillSlotText, type HookElement } from "./hookElements.ts";
import { embudoMarkdown, funnelBlock, funnelProblems, isFloor } from "./funnel.ts";
import { PLAIN_PHOTO, lookPhrase } from "./prompt.ts";
import { oneLine, type Reference } from "./reference.ts";
import type { SeriesLook } from "./series.ts";
import {
  ALIGNS,
  NO_KEEP_OUT,
  PLACEMENTS,
  STILL_FORMATS,
  type Align,
  type KeepOut,
  type OverlayCopy,
  type Placement,
  type StillFit,
  type StillFormat,
} from "./stillLayout.ts";

// ── Concept families (PLAYBOOK §3.2), each the Negative → Good frame inside one picture ─────────────────────────────
export const STILL_FAMILIES = ["beforeAfter", "nightmare", "comparison", "benefit", "reasons", "offer", "press", "testimonial", "humor"] as const;
export type StillFamily = (typeof STILL_FAMILIES)[number];
export const FAMILY_LABEL: Record<StillFamily, string> = {
  beforeAfter: "Antes y después",
  nightmare: "La pesadilla",
  comparison: "Comparación",
  benefit: "Gran beneficio",
  reasons: "Razones por qué",
  offer: "Oferta",
  press: "Prensa",
  testimonial: "Testimonio",
  humor: "Humor",
};
// Our version of each family (§3.2's table), for the person and for the writer.
export const FAMILY_HOW: Record<StillFamily, string> = {
  beforeAfter: "el Malo y el Bueno lado a lado: el mismo lugar, la misma luz, una sola cosa cambió",
  nightmare: "el dolor llevado al absurdo, con humor; es solo el dolor, nunca se vende miedo",
  comparison: "contra el problema o «la forma de antes», nunca contra una marca con nombre ni contra personas",
  benefit: "una sola promesa, de lo que existe hoy, en palabras concretas",
  reasons: "cada función atada al dolor que saca; solo lo que existe hoy",
  offer: "solo una oferta real, con sus condiciones y fechas reales; sin urgencia ni escasez inventada",
  press: "solo una nota real, con su link",
  testimonial: "solo un cliente real, citado tal cual, con su permiso",
  humor: "se le pega al problema, nunca a la persona",
};
// Families that need something real the person confirms (the offer's terms, the note's link, the customer's words).
export const PROOF_FAMILIES: readonly StillFamily[] = ["offer", "press", "testimonial"];

const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();

// The family from a label, an id or the writer's words (Spanish or English). null when it names none.
export function familyOf(s: string): StillFamily | null {
  const t = fold(s);
  if (!t) return null;
  const exact = STILL_FAMILIES.find((f) => fold(f) === t || fold(FAMILY_LABEL[f]) === t);
  if (exact) return exact;
  if (/antes|before|after|despues/.test(t)) return "beforeAfter";
  if (/pesadilla|nightmare/.test(t)) return "nightmare";
  if (/compar|nosotros contra|us vs|versus|\bvs\b/.test(t)) return "comparison";
  if (/razon|reason|funcion|feature/.test(t)) return "reasons";
  if (/beneficio|benefit|promesa/.test(t)) return "benefit";
  if (/oferta|offer|descuento|promo/.test(t)) return "offer";
  if (/prensa|press|as seen|como se vio|nota/.test(t)) return "press";
  if (/testimon|resena|review|cliente/.test(t)) return "testimonial";
  if (/humor|chiste|funny|gracioso/.test(t)) return "humor";
  return null;
}

export function placementOf(s: string): Placement | null {
  const t = fold(s);
  if ((PLACEMENTS as readonly string[]).includes(t)) return t as Placement;
  if (/arriba|top|superior/.test(t)) return "top";
  if (/abajo|bottom|inferior/.test(t)) return "bottom";
  if (/medio|centro|middle|center/.test(t)) return "middle";
  return null;
}

// ── A concept ───────────────────────────────────────────────────────────────────────────────────────────────────────
export type StillConcept = {
  id: string;
  family: StillFamily;
  // The problem it solves, plain words (shown before the hook, like every piece).
  problem: string;
  title: string;
  pain: string;
  relief: string;
  // The Turn inside the picture: the touching detail (the one cleared surface, the person exhaling at the door).
  touching: string;
  // For the image tool, in English: the one frozen moment, how the product appears, the light, the camera.
  picture: string;
  product: string;
  light: string;
  camera: string;
  // The words the app sets on top.
  copy: { headline: string; sub: string; cta: string; placement: Placement };
  // Offers, press and testimonials: the real terms, link or quote, and whether the person confirmed it is real.
  proof: string;
  proofOk: boolean;
  // Claims the writer could not check ([VERIFY]): shown, and while the words carry [VERIFY] the export is blocked.
  verify: string[];
  caption: string;
  // Hook elements for this picture. Missing: the prompt is exactly as before.
  hookElements?: HookElement[];
};

const MAX_CONCEPTS = 24;
export const MAX_PASTED_COPIES = 30;

// The writer's concept as the studio keeps it: every field one clean line, the family and placement as app values,
// and a proof family with no proof gets a [VERIFY] note (it stays blocked until the person adds the real thing).
export function normalizeConcept(raw: Partial<Record<keyof StillConcept | "headline" | "sub" | "cta" | "placement", unknown>>, id: string): StillConcept {
  const s = (v: unknown, max = 300) => oneLine(v, max);
  const family = familyOf(typeof raw.family === "string" ? raw.family : "") ?? "beforeAfter";
  const copy = (raw.copy && typeof raw.copy === "object" ? raw.copy : raw) as Record<string, unknown>;
  const proof = s(raw.proof, 400);
  const verify = Array.isArray(raw.verify) ? raw.verify.map((v) => s(v)).filter(Boolean).slice(0, 6) : [];
  if (PROOF_FAMILIES.includes(family) && !proof && !verify.some((v) => /prueba|real/i.test(v)))
    verify.push(`[VERIFY] ${FAMILY_LABEL[family]}: falta la prueba real (${FAMILY_HOW[family]}).`);
  const hookElements = normalizeHookElements(raw.hookElements);
  return {
    id,
    family,
    problem: s(raw.problem, 120),
    title: s(raw.title, 120),
    pain: s(raw.pain),
    relief: s(raw.relief),
    touching: s(raw.touching),
    picture: s(raw.picture, 700),
    product: s(raw.product),
    light: s(raw.light),
    camera: s(raw.camera),
    copy: {
      headline: s(copy.headline, 120),
      sub: s(copy.sub, 160),
      cta: s(copy.cta, 60),
      placement: placementOf(typeof copy.placement === "string" ? copy.placement : "") ?? "bottom",
    },
    proof,
    proofOk: raw.proofOk === true && Boolean(proof),
    verify,
    caption: s(raw.caption, 600),
    ...(hookElements.length ? { hookElements } : {}),
  };
}

// What keeps a concept from being exported (the person fixes it in the studio).
export function conceptBlocks(c: StillConcept): string[] {
  const out: string[] = [];
  if (PROOF_FAMILIES.includes(c.family)) {
    if (!c.proof.trim()) out.push(`${FAMILY_LABEL[c.family]} sin prueba real: ${FAMILY_HOW[c.family]}. Escribila (y su link) o elegí otro concepto.`);
    else if (c.family === "press" && !/https?:\/\/\S+/.test(c.proof)) out.push("Prensa: falta el link de la nota real.");
    else if (!c.proofOk) out.push(`Confirmá que ${c.family === "offer" ? "la oferta" : c.family === "press" ? "la nota" : "el testimonio"} es real${c.family === "testimonial" ? " y que el cliente dio permiso" : ""}.`);
  }
  return out;
}

// ── The image prompt, in §3.2's slot order ─────────────────────────────────────────────────────────────────────────
export type PromptSlot = { n: number; label: string; text: string; inPrompt: boolean };

const CLEAR_SPACE: Record<Placement, string> = {
  top: "the subject sits in the lower two thirds; the top third of the frame stays calm and empty (plain wall, ceiling or sky, no objects), as clear space for words added later",
  middle: "the subject sits at the top and bottom edges; a calm, empty band across the middle of the frame (plain wall or floor, no objects) stays clear for words added later",
  bottom: "the subject sits in the upper two thirds; the bottom third of the frame stays calm and empty (plain floor, table or wall, no objects), as clear space for words added later",
};

const sentence = (s: string) => s.trim().replace(/[.;,\s]+$/, "");

// The ten slots of §3.2 for this concept. The picture carries no text at all (the app sets it), so slot 8 asks for
// bare surfaces and slot 9 has nothing to spell; the shape is 9:16, the biggest of the exports.
export function stillPromptSlots(c: StillConcept, o: { look?: SeriesLook; brand: { accent: string; bg: string }; placement?: Placement }): PromptSlot[] {
  const look = lookPhrase(o.look);
  const placement = o.placement ?? c.copy.placement;
  return [
    { n: 1, label: "Sujeto y acción (un solo momento congelado)", text: stillSlotText(sentence(c.picture), c.hookElements, 1), inPrompt: true },
    { n: 2, label: "Estilo", text: look ? `Look: ${sentence(look)}` : PLAIN_PHOTO, inPrompt: true },
    { n: 3, label: "Luz y clima", text: sentence(c.light || o.look?.light || "soft daylight from a window, the room's own light"), inPrompt: true },
    { n: 4, label: "Cámara y ángulo", text: sentence(c.camera || o.look?.camera || "eye-level phone photo, 26mm, the whole scene in focus"), inPrompt: true },
    { n: 5, label: "Composición y lugar para el texto", text: `Composition: ${CLEAR_SPACE[placement]}`, inPrompt: true },
    { n: 6, label: "Colores de la marca", text: `One small real detail in a colour close to ${o.brand.accent} (a cushion, a mug, a towel); the rest in the room's own colours`, inPrompt: true },
    { n: 7, label: "Cómo aparece el producto", text: stillSlotText(sentence(c.product || "the product in use, real size, nothing staged"), c.hookElements, 7), inPrompt: true },
    { n: 8, label: "Texto en la imagen", text: "Bare surfaces, blank labels and packaging, no signage, no lettering, no logos anywhere in the picture", inPrompt: true },
    { n: 9, label: "Legibilidad", text: "No aplica: la imagen va sin texto. La app pone las palabras encima con las letras de la marca, sin errores.", inPrompt: false },
    { n: 10, label: "Formato", text: "Vertical 9:16 (choose 9:16 in Grok's controls)", inPrompt: true },
  ];
}

export function stillImagePrompt(c: StillConcept, o: Parameters<typeof stillPromptSlots>[1]): string {
  return `${stillPromptSlots(c, o)
    .filter((s) => s.inPrompt && s.text)
    .map((s) => sentence(s.text))
    .join(". ")}. Invented adults only, no real public figures.`;
}

// Words that describe a sequence, not one frozen moment (§3.2 slot 1, §7.4 static).
export function notFrozen(picture: string): string[] {
  const t = ` ${fold(picture)} `;
  return [" then ", " and then ", " after that ", " afterwards ", " later ", " luego ", " despues ", " y entonces ", " mientras tanto "].filter((w) => t.includes(w)).map((w) => w.trim());
}

// ── The prompts for Opus (or the writer) and the strict format of the reply ─────────────────────────────────────────
export type StillBrand = { name: string; type: string; what: string; audience: string; rules: string; bad: string; good: string; worksToday: string[]; practices: string[] };
export type StillBriefBits = { product: string; angle: string; notes: string; tone: string; language: "es" | "en"; funnel?: string };

// The keys of a concept block, in order, with what each holds. The parser reads exactly these.
export const CONCEPT_KEYS: { key: string; field: string; required: boolean; what: string }[] = [
  { key: "familia", field: "family", required: true, what: `una de: ${STILL_FAMILIES.map((f) => FAMILY_LABEL[f].toLowerCase()).join(", ")}` },
  { key: "problema", field: "problem", required: true, what: "el problema que resuelve, en 3 a 8 palabras" },
  { key: "gancho", field: "title", required: false, what: "el nombre del concepto: la tensión, no la respuesta" },
  { key: "dolor", field: "pain", required: true, what: "el dolor concreto (el objeto, la hora, el lugar de la casa)" },
  { key: "alivio", field: "relief", required: true, what: "cómo se siente la casa después, gracias al producto" },
  { key: "detalle", field: "touching", required: true, what: "el detalle que toca: el Giro dentro de la imagen" },
  { key: "imagen", field: "picture", required: true, what: "EN INGLÉS: un solo momento congelado (sujeto, acción, lugar), 25 a 60 palabras, sin texto" },
  { key: "producto", field: "product", required: false, what: "EN INGLÉS: cómo aparece el producto, en uso" },
  { key: "luz", field: "light", required: false, what: "EN INGLÉS: la luz y el clima" },
  { key: "camara", field: "camera", required: false, what: "EN INGLÉS: la cámara y el ángulo" },
  { key: "titulo", field: "headline", required: true, what: "el título que pone la app encima, 3 a 8 palabras" },
  { key: "bajada", field: "sub", required: false, what: "una línea corta debajo (opcional)" },
  { key: "llamado", field: "cta", required: false, what: "un solo llamado a la acción, 2 a 4 palabras" },
  { key: "lugar", field: "placement", required: false, what: "arriba, medio o abajo: dónde va el texto (la imagen deja ese lugar libre)" },
  { key: "prueba", field: "proof", required: false, what: "solo oferta, prensa o testimonio: la oferta real con sus condiciones, el link de la nota o la cita textual del cliente; si no hay, vacío" },
  { key: "verificar", field: "verify", required: false, what: "lo que no se pudo confirmar, separado con |" },
  { key: "compartir", field: "caption", required: false, what: "el texto para compartir: 1 a 3 oraciones" },
  { key: "elementos", field: "hookElements", required: false, what: "2 o 3 elementos del gancho en JSON: [{\"what\",\"label\",\"why\",\"tie\",\"placement\"}]" },
];
export const COPY_KEYS: { key: string; field: keyof OverlayCopy; required: boolean; what: string }[] = [
  { key: "titulo", field: "headline", required: true, what: "3 a 8 palabras" },
  { key: "bajada", field: "sub", required: false, what: "opcional, una línea corta" },
  { key: "llamado", field: "cta", required: false, what: "2 a 4 palabras" },
  { key: "lugar", field: "placement", required: false, what: "arriba, medio o abajo" },
];

const conceptFormatDoc = () =>
  [
    "## Concepto 1",
    ...CONCEPT_KEYS.map((k) => `${k.key}: (${k.what})`),
    "",
    "## Concepto 2",
    "…",
  ].join("\n");
const copyFormatDoc = () => ["## Texto 1", ...COPY_KEYS.map((k) => `${k.key}: (${k.what})`), "", "## Texto 2", "…"].join("\n");

export const STILL_FORMAT_HELP =
  "Cada bloque empieza con «## Concepto N» (o «## Texto N») y sigue con una línea por campo, «campo: valor», con los nombres de campo tal cual. Lo que no siga el formato se avisa y no se carga.";

const list = (items: string[], empty: string) => (items.length ? items.map((x) => `- ${x}`).join("\n") : `- ${empty}`);

function referenceLines(refs: Reference[]): string {
  if (!refs.length) return "- (todavía no hay: armá los conceptos desde el dolor)";
  return refs
    .slice(0, 8)
    .map((r) => `- ${r.title}: ángulo ${r.angle}; se ve primero ${r.first || "?"}, después ${r.next || "?"}, al final ${r.last || "?"}; armado: ${r.layout || "?"}. Qué tomar: ${r.borrow.join("; ") || "?"}`)
    .join("\n");
}

const RULES = (lang: "es" | "en") => `Reglas (no negociables):
- Una sola imagen donde se encuentran el Malo (el dolor) y el Bueno (cómo se siente la casa con el producto). La persona es la heroína; la marca guía y nunca abre el título.
- Se vende solo lo bueno: lo negativo aparece solo como el dolor que el producto saca. Nunca miedo, vergüenza ni culpa como lo que se vende, ni burla de la casa o la familia de nadie. El chiste es el problema, nunca la persona.
- Cada concepto tiene un detalle que toca (una superficie despejada donde por fin alguien se sienta, alguien que llega y respira): una sola cosa sincera.
- Solo lo que dice «Lo que existe hoy» o el brief se muestra como real. Nada de números, premios, salud, seguridad o sueño que no estén ahí: lo dudoso va en «verificar» con [VERIFY].
- Oferta, prensa y testimonio solo si son reales: en «prueba» va la oferta con sus condiciones y fechas, el link de la nota o la cita textual del cliente. Si no la tenés, dejá «prueba» vacío (la app no lo deja salir hasta que la persona cargue la real). Nada de urgencia ni escasez inventadas.
- La imagen: un solo momento congelado, sin texto, sin letras, sin carteles ni logos (la herramienta escribe mal; la app pone el texto encima con las letras de la marca). Deja libre y tranquilo el lugar del texto («lugar»). Solo adultos inventados, nadie conocido.
- Nada prestado: ni nombres de programas, conductores, gente real o marcas ajenas, ni frases o fotos de los anuncios de referencia (de ellos solo se toma la estructura).
- El texto encima: título de 3 a 8 palabras, concreto (el objeto, la hora, el lugar); un solo llamado; en ${lang === "es" ? "castellano rioplatense, de vos" : "plain English"}.
- «compartir»: 1 a 3 oraciones para publicar tal cual, específicas de esta pieza, en su tono; nada de «nos emociona compartir» ni frases genéricas.`;

// "Copiar el prompt para Opus": the concept menu.
export function stillMenuPrompt(o: { brand: StillBrand; brief: StillBriefBits; references: Reference[]; count?: number; library?: readonly HookElement[]; previous?: readonly string[] }): string {
  const count = Math.min(12, Math.max(3, o.count ?? 8));
  const b = o.brand;
  return `Hola Opus. Armo anuncios de imagen fija (una sola imagen, sin video) para ${b.name} en mi app. Necesito un menú de ${count} conceptos para elegir. Respondé SOLO con los bloques en el formato de abajo, sin nada antes ni después.

Marca: ${b.name} (${b.type}). ${b.what}
Quién mira: ${b.audience || "(sin dato)"}
El Malo de la serie: ${b.bad || "(sin dato)"}
El Bueno de la serie: ${b.good || "(sin dato)"}
Reglas de la serie: ${b.rules || "(sin reglas propias)"}
Lo que existe hoy (lo único que se puede mostrar como real):
${list(b.worksToday, "(vacío: mostrá solo lo que dice el brief y marcá el resto con [VERIFY])")}
Cómo se trabaja / se vive hoy (los dolores salen de acá, nunca de un hábito inventado):
${list(b.practices, "(vacío)")}

Brief de esta pieza:
- Producto: ${o.brief.product || "(sin producto: usá el de la serie)"}
- Momento: ${o.brief.angle || "(ninguno)"}
- Notas: ${o.brief.notes || "(ninguna)"}
- Tono: ${o.brief.tone}

Estructuras de anuncios que ya le funcionaron a la marca (desarmadas; se toma solo la forma, nunca sus palabras ni sus fotos):
${referenceLines(o.references)}

Familias de conceptos (usá al menos 5 distintas en el menú; cada una es el Malo → el Bueno en un cuadro):
${STILL_FAMILIES.map((f) => `- ${FAMILY_LABEL[f].toLowerCase()}: ${FAMILY_HOW[f]}`).join("\n")}

El foco: mostrar cómo el producto calma un dolor real de la casa y hace que se sienta más hogar. Pensá: ¿cómo se sentía la casa antes? ¿cómo se siente después?

${RULES(o.brief.language)}

Formato de la respuesta (estricto). ${STILL_FORMAT_HELP}
${conceptFormatDoc()}

${hookElementRules(o.library ?? [], o.previous ?? [])}${isFloor(o.brief.funnel) ? `\n\n${funnelBlock(o.brief.funnel)}` : ""}`;
}

// "Copiar el prompt para Opus": more words for the picked concept (QUANTITY: one picture, many texts).
export function stillCopyPrompt(o: { brand: StillBrand; brief: StillBriefBits; concept: StillConcept; count?: number }): string {
  const count = Math.min(MAX_PASTED_COPIES, Math.max(3, o.count ?? 10));
  const c = o.concept;
  return `Hola Opus. Tengo una imagen fija para ${o.brand.name} ya hecha (sin texto) y quiero probar muchos textos encima. Escribí ${count} variantes. Respondé SOLO con los bloques en el formato de abajo, sin nada antes ni después.

El concepto (${FAMILY_LABEL[c.family]}): ${c.title || c.problem}
- Problema: ${c.problem}
- Dolor: ${c.pain}
- Alivio: ${c.relief}
- Detalle que toca: ${c.touching}
- La imagen: ${c.picture}
- Texto de ahora: «${c.copy.headline}»${c.copy.sub ? ` / «${c.copy.sub}»` : ""}${c.copy.cta ? ` / llamado «${c.copy.cta}»` : ""}
Lo que existe hoy:
${list(o.brand.worksToday, "(vacío: nada se afirma como real fuera del brief)")}
Producto: ${o.brief.product || "(el de la serie)"}

Que cada variante pruebe otra entrada (el objeto, la hora, el alivio, una pregunta, una contradicción, el detalle que toca) y que los llamados varíen. Lugar: arriba, medio o abajo, según dónde quede mejor; la imagen dejó libre «${c.copy.placement === "top" ? "arriba" : c.copy.placement === "middle" ? "medio" : "abajo"}».

${RULES(o.brief.language)}

Formato de la respuesta (estricto). ${STILL_FORMAT_HELP}
${copyFormatDoc()}`;
}

// ── Reading the pasted reply ───────────────────────────────────────────────────────────────────────────────────────
export type StillPaste = { concepts: StillConcept[]; copies: OverlayCopy[]; errors: string[] };

// Reads blocks of "## Concepto N" / "## Texto N" with "campo: valor" lines. Fences and text outside blocks are ignored;
// a line with no known field continues the field before it. A block missing a required field, an unknown field or a
// family the app does not know is reported (in Spanish, with the block) and left out.
export function parseStillPaste(text: string, align: Align = "left", firstId = 1): StillPaste {
  const out: StillPaste = { concepts: [], copies: [], errors: [] };
  const clean = text.replace(/\r/g, "").replace(/^\s*```[a-z]*\s*$/gim, "");
  const heads = [...clean.matchAll(/^\s*#{1,4}\s*(concepto|texto)\s*(\d+)?[^\n]*$/gim)];
  if (!heads.length) {
    out.errors.push("No encontré ningún bloque «## Concepto N» ni «## Texto N». Pegá la respuesta entera, con los encabezados.");
    return out;
  }
  let nextId = firstId;
  heads.forEach((h, i) => {
    const kind = fold(h[1]) === "concepto" ? "concept" : "copy";
    const name = `${kind === "concept" ? "Concepto" : "Texto"} ${h[2] ?? i + 1}`;
    const body = clean.slice(h.index! + h[0].length, i + 1 < heads.length ? heads[i + 1].index : undefined);
    const keys = kind === "concept" ? CONCEPT_KEYS : COPY_KEYS;
    const values: Record<string, string> = {};
    const unknown: string[] = [];
    let last = "";
    for (const raw of body.split("\n")) {
      const line = raw.trim();
      if (!line) continue;
      const m = line.match(/^[-*•]?\s*([A-Za-zÁÉÍÓÚáéíóúñÑ ]{3,24}):\s*(.*)$/);
      const key = m ? fold(m[1]).replace(/\s+/g, " ") : "";
      const known = m ? keys.find((k) => k.key === key || (k.key === "compartir" && key.startsWith("texto para compartir"))) : undefined;
      if (known) {
        last = known.field;
        values[last] = m![2].replace(/^\((.*)\)$/, "$1").trim();
      } else if (m && !last) unknown.push(m[1].trim());
      else if (m && /^[a-z ]+$/.test(key) && key.split(" ").length <= 2) unknown.push(m[1].trim());
      else if (last) values[last] = `${values[last]} ${line}`.trim();
    }
    const missing = keys.filter((k) => k.required && !values[k.field]?.trim()).map((k) => `«${k.key}»`);
    const problems: string[] = [];
    if (unknown.length) problems.push(`no conozco ${unknown.map((u) => `«${u}»`).join(", ")}`);
    if (missing.length) problems.push(`falta ${missing.join(", ")}`);
    if (kind === "concept" && values.family && !familyOf(values.family)) problems.push(`la familia «${values.family}» no es ninguna de: ${STILL_FAMILIES.map((f) => FAMILY_LABEL[f].toLowerCase()).join(", ")}`);
    if (values.placement && !placementOf(values.placement)) problems.push(`el lugar «${values.placement}» tiene que ser arriba, medio o abajo`);
    if (problems.length) {
      out.errors.push(`${name}: ${problems.join("; ")}.`);
      return;
    }
    if (kind === "concept") {
      if (out.concepts.length >= MAX_CONCEPTS) return;
      out.concepts.push(
        normalizeConcept({ ...values, verify: (values.verify ?? "").split("|").map((v) => v.trim()).filter(Boolean) }, `c${nextId++}`),
      );
    } else {
      if (out.copies.length >= MAX_PASTED_COPIES) return;
      out.copies.push({
        headline: oneLine(values.headline, 120),
        sub: oneLine(values.sub, 160),
        cta: oneLine(values.cta, 60),
        placement: placementOf(values.placement ?? "") ?? "bottom",
        align,
      });
    }
  });
  return out;
}

// ── The piece as the project keeps it ──────────────────────────────────────────────────────────────────────────────
export type StillPiece = {
  version: 1;
  concepts: StillConcept[];
  picked: string | null;
  // "Variantes de texto": "título | bajada" per line, calls one per line, the placements to try.
  headlines: string;
  ctas: string;
  placements: Placement[];
  align: Align;
  formats: StillFormat[];
  fileType: "png" | "jpg";
  fit: StillFit;
  // Where the image tool's watermark is on this picture (from the tool's profile, the person can change it).
  keepOut: KeepOut;
  // The uploaded picture (media slot STILL_PICTURE in the project folder).
  picture: { file: string; w: number; h: number } | null;
  // The last export's files.
  exports: string[];
  caption: string;
  // Check problems the person marked "no es un problema" (only the ones that do not block).
  dismissed: string[];
};
// The picture's media slot (saved as fija-imagen.<ext>).
export const STILL_PICTURE = 500;

export function newStillPiece(keepOut: KeepOut | null): StillPiece {
  return {
    version: 1,
    concepts: [],
    picked: null,
    headlines: "",
    ctas: "",
    placements: ["bottom"],
    align: "left",
    formats: [...STILL_FORMATS],
    fileType: "png",
    fit: "full",
    keepOut: keepOut ?? NO_KEEP_OUT,
    picture: null,
    exports: [],
    caption: "",
    dismissed: [],
  };
}

// The number the next concept's id takes (c1, c2…): one past the highest in use, so a concept removed from the
// middle never gives its number to a new one while a later one still has it.
export const nextConceptId = (concepts: { id: string }[]): number =>
  1 + Math.max(0, ...concepts.map((c) => Number(/^c(\d+)$/.exec(c.id)?.[1] ?? 0)));

// A saved piece read back: unknown values fall back to the defaults.
export function migrateStill(raw: unknown, keepOut: KeepOut | null): StillPiece {
  const base = newStillPiece(keepOut);
  if (!raw || typeof raw !== "object") return base;
  const p = raw as Partial<StillPiece>;
  const read = Array.isArray(p.concepts) ? p.concepts.map((c, i) => normalizeConcept(c as never, typeof c?.id === "string" ? c.id : `c${i + 1}`)) : [];
  // Ids repeated by an older version get the next free number (the first keeps its own).
  const seen = new Set<string>();
  const concepts: StillConcept[] = [];
  for (const c of read) {
    const id = seen.has(c.id) ? `c${nextConceptId([...read, ...concepts])}` : c.id;
    seen.add(id);
    concepts.push(id === c.id ? c : { ...c, id });
  }
  return {
    ...base,
    concepts,
    picked: typeof p.picked === "string" && concepts.some((c) => c.id === p.picked) ? p.picked : null,
    headlines: typeof p.headlines === "string" ? p.headlines : "",
    ctas: typeof p.ctas === "string" ? p.ctas : "",
    placements: Array.isArray(p.placements) ? p.placements.filter((x): x is Placement => (PLACEMENTS as readonly string[]).includes(x)) : base.placements,
    align: (ALIGNS as readonly string[]).includes(p.align as string) ? (p.align as Align) : "left",
    formats: Array.isArray(p.formats) ? p.formats.filter((x): x is StillFormat => (STILL_FORMATS as readonly string[]).includes(x)) : base.formats,
    fileType: p.fileType === "jpg" ? "jpg" : "png",
    fit: p.fit === "crop" ? "crop" : "full",
    keepOut: p.keepOut && typeof p.keepOut === "object" ? { ...base.keepOut, ...p.keepOut } : base.keepOut,
    picture: p.picture && typeof p.picture.file === "string" ? p.picture : null,
    exports: Array.isArray(p.exports) ? p.exports.filter((x) => typeof x === "string") : [],
    caption: typeof p.caption === "string" ? p.caption : "",
    dismissed: Array.isArray(p.dismissed) ? p.dismissed.filter((x) => typeof x === "string") : [],
  };
}

// Picking a concept fills the variants with its words (the person adds more lines, or pastes Opus' texts).
export function pickConcept(piece: StillPiece, id: string): StillPiece {
  const c = piece.concepts.find((x) => x.id === id);
  if (!c) return piece;
  return {
    ...piece,
    picked: id,
    headlines: c.copy.headline ? `${c.copy.headline}${c.copy.sub ? ` | ${c.copy.sub}` : ""}` : "",
    ctas: c.copy.cta,
    placements: [c.copy.placement],
    caption: c.caption,
  };
}

// Pasted texts join the variants: their headlines and calls (no repeats) and their placements.
export function addCopies(piece: StillPiece, copies: OverlayCopy[]): StillPiece {
  const heads = piece.headlines.split("\n").map((l) => l.trim()).filter(Boolean);
  const calls = piece.ctas.split("\n").map((l) => l.trim()).filter(Boolean);
  const places = [...piece.placements];
  for (const c of copies) {
    const line = `${c.headline}${c.sub ? ` | ${c.sub}` : ""}`;
    if (c.headline && !heads.includes(line)) heads.push(line);
    if (c.cta && !calls.includes(c.cta)) calls.push(c.cta);
    if (!places.includes(c.placement)) places.push(c.placement);
  }
  return { ...piece, headlines: heads.join("\n"), ctas: calls.join("\n"), placements: places };
}

// ── Checks before export (PLAYBOOK §7.4, static image) ─────────────────────────────────────────────────────────────
export type StillProblem = { id: string; label: string; detail: string; blocking: boolean };

const shingles = (s: string, n = 4) => {
  const words = fold(s)
    .replace(/[^a-z0-9ñ ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const out = new Set<string>();
  for (let i = 0; i + n <= words.length; i++) out.add(words.slice(i, i + n).join(" "));
  return out;
};

// A line that repeats four words in a row from a reference ad's own lines (its words are never reused).
export function borrowedFromReference(text: string, refs: Reference[]): string | null {
  const ours = shingles(text);
  if (!ours.size) return null;
  for (const r of refs) {
    const theirs = [r.hook, r.promise, r.cta, ...r.otherLines].flatMap((l) => [...shingles(l)]);
    if (theirs.some((s) => ours.has(s))) return r.title;
  }
  return null;
}

const GENERIC = /(nos emociona|emocionados de|excited to share|streamline|revoluciona|game.?changer|lleva tu .* al siguiente nivel|next level)/i;

export function stillChecks(o: {
  concept: StillConcept | null;
  variants: OverlayCopy[];
  // The layout of every variant in every format: whether it fit and what got in the way.
  layouts: { label: string; fits: boolean; problems: string[] }[];
  picture: boolean;
  fontsLoaded: boolean;
  // Whether the watermark's area is whole on every export (never cropped).
  watermarkWhole: boolean;
  caption: string;
  references: Reference[];
  brandName: string;
  // Missing funnel: the same checks as before.
  funnel?: string;
  proofs?: readonly string[];
  landing?: string;
}): StillProblem[] {
  const out: StillProblem[] = [];
  const add = (id: string, label: string, detail: string, blocking: boolean) => out.push({ id, label, detail, blocking });
  const c = o.concept;
  if (!c) add("concepto", "Falta el concepto", "Elegí un concepto del menú.", true);
  if (!o.picture) add("imagen", "Falta la imagen", "Subí la imagen que hiciste en Grok con el prompt.", true);
  if (!o.variants.length) add("texto", "Falta el texto", "Escribí al menos un título en «Variantes de texto».", true);
  if (c) {
    for (const b of conceptBlocks(c)) add(`prueba:${c.id}`, "Solo lo real", b, true);
    if (!c.pain.trim() || !c.relief.trim()) add("malo-bueno", "Malo → Bueno de un vistazo", "El concepto tiene que nombrar el dolor y el alivio.", true);
    const moving = notFrozen(c.picture);
    if (moving.length) add("congelado", "Un solo momento congelado", `La imagen describe una secuencia («${moving.join("», «")}»): elegí un instante.`, false);
    if (!c.touching.trim()) add("giro", "Sin detalle que toca", "Falta el Giro dentro de la imagen: un detalle sincero.", false);
  }
  const words = [...o.variants.flatMap((v) => [v.headline, v.sub, v.cta]), o.caption];
  if (words.some((w) => /\[VERIFY/i.test(w)))
    add("verify", "[VERIFY] en el texto", "Hay texto con [VERIFY]: confirmalo y sacá la marca, o cambialo.", true);
  const borrowed = borrowedNames(words.join("\n"));
  if (borrowed.length) add("prestado", "Nada prestado", `Nombra ${borrowed.map((b) => `"${b}"`).join(", ")}.`, true);
  for (const v of o.variants) {
    const ref = borrowedFromReference([v.headline, v.sub, v.cta].join(" "), o.references);
    if (ref) {
      add(`referencia:${v.headline}`, "Nada prestado", `«${v.headline}» repite palabras del anuncio de referencia «${ref}»: de ahí se toma solo la estructura.`, true);
      break;
    }
  }
  const brand = fold(o.brandName);
  if (brand && o.variants.some((v) => fold(v.headline).startsWith(brand)))
    add("cliente-heroe", "Cliente héroe", "Un título abre con la marca: que abra con la persona o con su casa.", false);
  if (o.variants.some((v) => v.cta.split(/[|/]| y /).length > 2))
    add("un-llamado", "Un solo llamado", "Un llamado pide más de una cosa.", false);
  for (const l of o.layouts.filter((x) => !x.fits)) add(`entra:${l.label}`, "Texto legible", `${l.label}: ${l.problems.join(" ")}`, true);
  if (!o.fontsLoaded) add("letra", "La letra de la marca no cargó", "Sin la letra de la marca el texto saldría en otra. Revisá la conexión y probá de nuevo.", true);
  if (!o.watermarkWhole) add("marca-de-agua", "La marca de agua se corta", "Con «Recortar» la marca de agua quedaría fuera: usá «Cuadro completo».", true);
  if (!o.caption.trim()) add("compartir", "Falta el texto para compartir", "Escribí 1 a 3 oraciones para publicar con la imagen.", false);
  else if (GENERIC.test(o.caption)) add("compartir-generico", "Texto para compartir genérico", "Que hable de este dolor y esta casa, no frases de folleto.", false);
  if (isFloor(o.funnel)) {
    for (const p of funnelProblems({
      floor: o.funnel,
      proofs: o.proofs,
      landing: o.landing,
      proofOk: Boolean(c?.proofOk),
      brandName: o.brandName,
      openingText: o.variants[0]?.headline ?? "",
      sellText: words.join("\n"),
    }))
      add(p.id, p.label, p.detail, true);
  }
  return out;
}

// ── pieza.md ───────────────────────────────────────────────────────────────────────────────────────────────────────
export function stillMarkdown(p: StillPiece, o: { prompt: string; variants: OverlayCopy[]; funnel?: string }): string {
  const c = p.concepts.find((x) => x.id === p.picked) ?? null;
  if (!c) return `# Imagen fija sin concepto todavía\n${p.concepts.length ? `\n${p.concepts.length} conceptos en el menú.\n` : ""}`;
  const embudo = embudoMarkdown(o.funnel).trim();
  const lines = [
    `# ${c.problem || c.title}`,
    "",
    ...(embudo ? [embudo, ""] : []),
    `**${c.title}** · ${FAMILY_LABEL[c.family]}`,
    "",
    `- Dolor: ${c.pain}`,
    `- Alivio: ${c.relief}`,
    `- Detalle que toca: ${c.touching}`,
    ...(c.proof ? [`- Prueba: ${c.proof}${c.proofOk ? " (confirmada)" : " (sin confirmar)"}`] : []),
    ...c.verify.map((v) => `- ${v.startsWith("[VERIFY") ? v : `[VERIFY] ${v}`}`),
    "",
    "## Prompt para Grok",
    "",
    o.prompt,
    "",
    "## Textos",
    "",
    "| # | Título | Bajada | Llamado | Lugar |",
    "|---|---|---|---|---|",
    ...o.variants.map((v, i) => `| ${i + 1} | ${v.headline} | ${v.sub} | ${v.cta} | ${v.placement} |`),
    "",
    "## Para compartir",
    "",
    p.caption || "(falta)",
  ];
  if (p.picture) lines.push("", `Imagen: ${p.picture.file} (${p.picture.w} × ${p.picture.h})`);
  if (p.exports.length) lines.push("", "## Exportadas", "", ...p.exports.map((f) => `- ${f}`));
  return `${lines.join("\n")}\n`;
}
