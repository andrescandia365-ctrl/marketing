// "Imagen fija" (IDEAS 34 points 3-5): concepts by family read from Opus' pasted reply (strict format), the image
// prompt in §3.2's slot order with no text in the picture, the words laid out by the app inside the 9:16 safe zone and
// out of the watermark's keep-out, the colour that reads, the text variants and the checks that block the export.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { readZip, projectPathAllowed } from "../server/projectZip.ts";
import { safeRect } from "../shared/safeZone.ts";
import { contrastRatio } from "../shared/series.ts";
import {
  FAMILY_LABEL,
  STILL_FAMILIES,
  addCopies,
  borrowedFromReference,
  conceptBlocks,
  familyOf,
  migrateStill,
  newStillPiece,
  normalizeConcept,
  notFrozen,
  parseStillPaste,
  pickConcept,
  stillChecks,
  stillCopyPrompt,
  stillImagePrompt,
  stillMarkdown,
  stillMenuPrompt,
  stillPromptSlots,
  type StillConcept,
} from "../shared/still.ts";
import { STILL_SAMPLE_COPIES, STILL_SAMPLE_MENU } from "../shared/stillSample.ts";
import {
  MAX_VARIANTS,
  NO_KEEP_OUT,
  STILL_EXPORT,
  ctaLines,
  exportJobs,
  exportSize,
  fitPicture,
  headlineLines,
  intersects,
  keepOutRect,
  layoutOverlay,
  lowContrast,
  pickTextStyle,
  textArea,
  variantGrid,
  watermarkKeepOut,
  wrapText,
  type KeepOut,
  type Measure,
  type OverlayCopy,
} from "../shared/stillLayout.ts";
import { crc32, storeZip } from "../shared/storeZip.ts";
import { BriefSchema } from "../shared/schema.ts";
import { usageKind } from "../shared/usage.ts";
import { REFERENCES_HEADING, normalizeReference } from "../shared/reference.ts";

// A stand-in for canvas measureText: every letter 0.55 of the size wide.
const measure: Measure = (text, font) => text.length * font.size * 0.55;
const FONTS = { display: "Space Grotesk", ui: "Inter" };
const copy = (o: Partial<OverlayCopy> = {}): OverlayCopy => ({ headline: "La toalla ya no vive en la puerta", sub: "", cta: "Pedilo en Máshogar", placement: "bottom", align: "left", ...o });
const GROK: KeepOut = { corner: "bottom-right", w: 0.22, h: 0.07 };

test("brief.piece takes 'still' and the writer's route has a name", () => {
  assert.equal(BriefSchema.shape.piece.parse("still"), "still");
  assert.equal(usageKind("/api/still/ask"), "Imagen fija");
});

test("the family is read from labels, ids and the writer's words", () => {
  for (const f of STILL_FAMILIES) {
    assert.equal(familyOf(f), f);
    assert.equal(familyOf(FAMILY_LABEL[f].toUpperCase()), f);
  }
  assert.equal(familyOf("Antes / después"), "beforeAfter");
  assert.equal(familyOf("Nightmare scenario"), "nightmare");
  assert.equal(familyOf("us vs. them"), "comparison");
  assert.equal(familyOf("Features and benefits"), "reasons");
  assert.equal(familyOf("as seen in"), "press");
  assert.equal(familyOf("reseña"), "testimonial");
  assert.equal(familyOf("algo raro"), null);
});

test("a proof family with no real proof is marked [VERIFY] and blocked until the person confirms it", () => {
  const c = normalizeConcept({ family: "testimonio", problem: "Frío", pain: "pies fríos", relief: "tibio", headline: "  «Ya no uso medias»  ", placement: "ARRIBA" }, "c1");
  assert.equal(c.family, "testimonial");
  assert.equal(c.copy.headline, "«Ya no uso medias»");
  assert.equal(c.copy.placement, "top");
  assert.ok(c.verify.some((v) => v.startsWith("[VERIFY]")));
  assert.equal(conceptBlocks(c).length, 1);
  assert.match(conceptBlocks(c)[0], /sin prueba real/);
  const quoted = { ...c, proof: "«Ya no uso medias para mirar tele», Ana, 3 de octubre" };
  assert.match(conceptBlocks(quoted)[0], /Confirmá que el testimonio es real y que el cliente dio permiso/);
  assert.deepEqual(conceptBlocks({ ...quoted, proofOk: true }), []);
  // Press needs its link.
  const press = normalizeConcept({ family: "prensa", proof: "Nota en un diario", proofOk: true }, "c2");
  assert.match(conceptBlocks(press)[0], /link/);
  assert.deepEqual(conceptBlocks({ ...press, proof: "Nota https://example.com/nota" }), []);
  // proofOk never stands without a proof, and other families need none.
  assert.equal(normalizeConcept({ family: "oferta", proofOk: true }, "c3").proofOk, false);
  assert.deepEqual(conceptBlocks(normalizeConcept({ family: "humor" }, "c4")), []);
  // Lines are cleaned: no breaks, no list separator, capped.
  const long = normalizeConcept({ family: "humor", pain: "a\nb | c", headline: "x".repeat(500) }, "c5");
  assert.equal(long.pain, "a b / c");
  assert.equal(long.copy.headline.length, 120);
});

test("the paste-back parser reads the strict format and reports what does not follow it", () => {
  const sample = parseStillPaste(STILL_SAMPLE_MENU);
  assert.deepEqual(sample.errors, []);
  assert.equal(sample.concepts.length, 6);
  assert.ok(new Set(sample.concepts.map((c) => c.family)).size >= 5, "at least five families");
  assert.deepEqual(sample.concepts.map((c) => c.id), ["c1", "c2", "c3", "c4", "c5", "c6"]);
  const first = sample.concepts[0];
  assert.equal(first.family, "beforeAfter");
  assert.equal(first.copy.placement, "top");
  assert.match(first.picture, /^A living-room door/);
  assert.match(first.caption, /toalla/);
  // The sample's testimonial has no proof and stays blocked.
  assert.equal(conceptBlocks(sample.concepts[5]).length, 1);
  assert.deepEqual(sample.concepts[2].verify, ["Que se pone una sola vez y no se mueve [VERIFY]"]);

  // Ids continue after the concepts already in the menu; fences and chatter outside blocks are ignored.
  const fenced = parseStillPaste("Acá van:\n```\n## Concepto 1\nfamilia: humor\nproblema: Frío\ndolor: pies\nalivio: tibio\ndetalle: medias\nimagen: Socks on a sofa arm,\n  folded neatly\ntitulo: Chau medias\n```\n", "left", 7);
  assert.deepEqual(fenced.errors, []);
  assert.equal(fenced.concepts[0].id, "c7");
  assert.equal(fenced.concepts[0].picture, "Socks on a sofa arm, folded neatly", "a line with no field continues the one before");

  const bad = parseStillPaste(
    "## Concepto 1\nfamilia: horóscopo\nproblema: x\ndolor: y\nalivio: z\ndetalle: d\nimagen: i\ntitulo: t\n\n## Concepto 2\nfamilia: humor\nproblema: x\ncolor favorito: verde\ntitulo: t\nlugar: al costado\n",
  );
  assert.equal(bad.concepts.length, 0);
  assert.match(bad.errors[0], /^Concepto 1: la familia «horóscopo» no es ninguna de/);
  assert.match(bad.errors[1], /^Concepto 2: no conozco «color favorito»; falta «dolor», «alivio», «detalle», «imagen»; el lugar «al costado»/);
  assert.match(parseStillPaste("hola").errors[0], /No encontré ningún bloque/);

  const copies = parseStillPaste(STILL_SAMPLE_COPIES, "right");
  assert.deepEqual(copies.errors, []);
  assert.equal(copies.copies.length, 3);
  assert.deepEqual(copies.copies[1], { headline: "Chau toalla enrollada", sub: "El burlete frena el frío de abajo.", cta: "Ver el burlete", placement: "bottom", align: "right" });
  assert.match(parseStillPaste("## Texto 1\nbajada: algo\n").errors[0], /^Texto 1: falta «titulo»/);
});

test("the image prompt follows §3.2's slots, asks for no text and leaves clear space where the words go", () => {
  const c = parseStillPaste(STILL_SAMPLE_MENU).concepts[1];
  const slots = stillPromptSlots(c, { brand: { accent: "#00bd74", bg: "#111418" } });
  assert.deepEqual(slots.map((s) => s.n), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(slots.find((s) => s.n === 9)!.inPrompt, false);
  const prompt = stillImagePrompt(c, { brand: { accent: "#00bd74", bg: "#111418" } });
  assert.ok(prompt.startsWith("A small dog curled asleep"), "subject first");
  assert.match(prompt, /top third of the frame stays calm and empty/);
  assert.match(prompt, /no lettering, no logos/);
  assert.match(prompt, /9:16/);
  assert.doesNotMatch(prompt, /cinematic/i);
  const bottom = stillImagePrompt(c, { brand: { accent: "#00bd74", bg: "#111418" }, placement: "bottom" });
  assert.match(bottom, /bottom third of the frame stays calm/);
  // The series look leads the style slot when there is one.
  const look = { camera: "cheap phone", flash: "", grain: "heavy grain", focus: "", light: "", extra: "" };
  assert.match(stillImagePrompt(c, { look, brand: { accent: "#00bd74", bg: "#111418" } }), /Look: cheap phone; heavy grain/);
  assert.deepEqual(notFrozen(c.picture), []);
  assert.deepEqual(notFrozen("She opens the door, then sits down"), ["then"]);
});

test("the prompts for Opus carry the brand, the references' structure only, the rules and the format", () => {
  const ref = normalizeReference({ title: "Nuestro anuncio de mantas", hook: "Frío nunca más en tu casa", first: "la manta", borrow: ["el producto abajo a la izquierda"], angle: "pain" });
  const brand = { name: "Máshogar", type: "E-commerce", what: "Tienda para el hogar", audience: "Familias", rules: "", bad: "", good: "", worksToday: ["Envíos a todo el país"], practices: [] };
  const brief = { product: "Burlete", angle: "", notes: "", tone: "warm", language: "es" as const };
  const menu = stillMenuPrompt({ brand, brief, references: [ref] });
  assert.match(menu, /- Envíos a todo el país/);
  assert.match(menu, /Nuestro anuncio de mantas: ángulo pain; se ve primero la manta/);
  assert.doesNotMatch(menu, /Frío nunca más/, "the reference's own words never go");
  assert.match(menu, /## Concepto 1\nfamilia:/);
  assert.match(menu, /prueba: \(solo oferta, prensa o testimonio/);
  assert.match(menu, /de vos/);
  const c = parseStillPaste(STILL_SAMPLE_MENU).concepts[0];
  const more = stillCopyPrompt({ brand, brief, concept: c, count: 12 });
  assert.match(more, /Escribí 12 variantes/);
  assert.match(more, /## Texto 1\ntitulo:/);
  assert.ok(REFERENCES_HEADING.length > 0);
});

test("watermark keep-out comes from the tool profile and is never cropped or covered", () => {
  const grok = watermarkKeepOut(readFileSync("server/tools/grok-imagine.md", "utf8"));
  assert.deepEqual(grok, { corner: "bottom-right", w: 0.22, h: 0.07 });
  assert.deepEqual(watermarkKeepOut("Watermark keep-out: top-left, 10% of the width, 5% of the height"), { corner: "top-left", w: 0.1, h: 0.05 });
  assert.equal(watermarkKeepOut("no line here"), null);
  assert.equal(watermarkKeepOut("Watermark keep-out: top-left, 90% of the width, 5% of the height"), null);
  assert.equal(keepOutRect(NO_KEEP_OUT, { x: 0, y: 0, w: 100, h: 100 }), null);
  assert.deepEqual(keepOutRect(GROK, { x: 0, y: 0, w: 1000, h: 2000 }), { x: 780, y: 1860, w: 220, h: 140 });

  // A 9:16 picture in 1:1: whole, letterboxed, the mark inside the canvas.
  const full = fitPicture(2048, 2048, 1152, 2048, "full", GROK);
  assert.equal(full.whole, true);
  assert.equal(full.pic.h, 2048);
  // Cropped: anchored on the mark's corner, so the cut falls on the far side and the mark stays whole.
  for (const corner of ["bottom-right", "bottom-left", "top-right", "top-left"] as const) {
    const crop = fitPicture(1152, 1152, 1152, 2048, "crop", { ...GROK, corner });
    assert.equal(crop.whole, true, corner);
  }
  const centred = fitPicture(1152, 1152, 1152, 2048, "crop", NO_KEEP_OUT);
  assert.equal(centred.pic.y, -(2048 - 1152) / 2);
});

test("exports keep the picture's resolution, at least 1080 wide", () => {
  assert.deepEqual(exportSize("9x16", 1152, 2048), { w: 1152, h: 2048 });
  assert.deepEqual(exportSize("1x1", 1152, 2048, "full"), { w: 2048, h: 2048 });
  assert.deepEqual(exportSize("1x1", 1152, 2048, "crop"), { w: 1152, h: 1152 });
  assert.deepEqual(exportSize("4x5", 720, 1280, "crop"), { w: 1080, h: 1350 });
  const huge = exportSize("1x1", 3000, 9000, "full");
  assert.ok(huge.w <= 4096 && huge.h <= 4096);
});

test("the words fit inside the safe zone, out of the watermark band, or the export is blocked", () => {
  const W = 1080;
  const H = 1920;
  const pic = fitPicture(W, H, W, H, "full", GROK);
  const lay = layoutOverlay({ w: W, h: H, copy: copy({ sub: "El burlete frena el frío que entra por abajo." }), fonts: FONTS, keepOut: pic.keepOut, measure });
  assert.equal(lay.fits, true, lay.problems.join(" "));
  assert.deepEqual(lay.boxes.map((b) => b.kind), ["headline", "sub", "cta"]);
  const safe = safeRect(W, H);
  for (const b of lay.boxes) {
    assert.ok(b.x >= safe.x && b.x + b.w <= safe.x + safe.w + 0.5, `${b.kind} inside the safe width`);
    assert.ok(b.y >= safe.y && b.y + b.h <= safe.y + safe.h + 0.5, `${b.kind} inside the safe height`);
    assert.ok(!intersects(b, pic.keepOut!), `${b.kind} off the watermark`);
    assert.ok(b.lines.length >= 1);
  }
  const head = lay.boxes[0];
  assert.ok(head.font.size >= 1080 * 0.045 && head.font.size <= 1080 * 0.09 + 0.01);
  assert.ok(lay.boxes[1].font.size < head.font.size);
  // Bottom placement sits right above the watermark band.
  const area = textArea(W, H, pic.keepOut);
  assert.ok(area.y + area.h <= pic.keepOut!.y);
  assert.ok(Math.abs(lay.boxes[2].y + lay.boxes[2].h - (area.y + area.h)) < 1);
  // Top: starts at the top of the room; right-aligned: ends at its right edge.
  const top = layoutOverlay({ w: W, h: H, copy: copy({ placement: "top", align: "right" }), fonts: FONTS, keepOut: pic.keepOut, measure });
  assert.ok(Math.abs(top.boxes[0].y - area.y) < 1);
  assert.ok(Math.abs(top.boxes[0].x + top.boxes[0].w - (area.x + area.w)) < 1);
  // A mark at the top pushes the room down instead.
  const topMark = fitPicture(W, H, W, H, "full", { ...GROK, corner: "top-left", h: 0.2 });
  assert.ok(textArea(W, H, topMark.keepOut).y >= topMark.keepOut!.y + topMark.keepOut!.h);
  // 1:1 has no platform band: the room is the frame minus its margin.
  assert.equal(textArea(1080, 1080, null).y, 1080 * 0.06);
  // Too many words: blocked, with the reason.
  const long = layoutOverlay({ w: W, h: H, copy: copy({ headline: Array(60).fill("palabra").join(" ") }), fonts: FONTS, keepOut: pic.keepOut, measure });
  assert.equal(long.fits, false);
  assert.match(long.problems[0], /no entra en letra legible/);
  const empty = layoutOverlay({ w: W, h: H, copy: copy({ headline: "", cta: "" }), fonts: FONTS, keepOut: null, measure });
  assert.equal(empty.fits, false);
  // One word wider than the line cannot wrap.
  assert.equal(wrapText("Supercalifragilístico", 100, { family: "x", weight: 700, size: 40 }, measure), null);
  assert.deepEqual(wrapText("uno dos tres", 200, { family: "x", weight: 700, size: 40 }, measure), ["uno dos", "tres"]);
});

test("the colour that reads: a brand colour on the picture, a solid box only when neither reads", () => {
  const brand = { text: "#f4f1ea", bg: "#111418" };
  const dark = Array(50).fill("#1a1a1a");
  assert.deepEqual(pickTextStyle(dark, brand), { colour: "#f4f1ea", box: null, ratio: contrastRatio("#f4f1ea", "#1a1a1a") });
  const light = Array(50).fill("#f8f8f8");
  assert.equal(pickTextStyle(light, brand).colour, "#111418");
  assert.equal(pickTextStyle(light, brand).box, null);
  const grey = Array(50).fill("#7a7a7a");
  const boxed = pickTextStyle(grey, brand);
  assert.equal(boxed.box, "#111418");
  assert.equal(boxed.colour, "#f4f1ea");
  assert.ok(boxed.ratio >= 4.5);
  // A tenth of the area that does not read decides it; a few bright specks do not.
  const specks = [...Array(95).fill("#101010"), ...Array(5).fill("#ffffff")];
  assert.equal(pickTextStyle(specks, brand).box, null);
  const patch = [...Array(80).fill("#101010"), ...Array(20).fill("#ffffff")];
  assert.notEqual(pickTextStyle(patch, brand).box, null);
  assert.equal(lowContrast("#ffffff", []), 1);
  // A brand pair that does not read falls back to black and white.
  assert.deepEqual(pickTextStyle(grey, { text: "#777777", bg: "#888888" }).box, "#111111");
});

test("variants: headlines × calls × placements, capped, one file per variant and format", () => {
  const heads = headlineLines("La toalla se jubila | El burlete frena el frío\n\nChau chiflete\nChau chiflete\n");
  assert.deepEqual(heads, [
    { headline: "La toalla se jubila", sub: "El burlete frena el frío" },
    { headline: "Chau chiflete", sub: "" },
  ]);
  const calls = ctaLines("Pedilo en Máshogar\n Ver el burlete \nPedilo en Máshogar");
  assert.deepEqual(calls, ["Pedilo en Máshogar", "Ver el burlete"]);
  const grid = variantGrid(heads, calls, ["top", "bottom"], "left");
  assert.equal(grid.length, 8);
  assert.deepEqual(grid.map((v) => v.n), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(grid[1], { n: 2, headline: "La toalla se jubila", sub: "El burlete frena el frío", cta: "Pedilo en Máshogar", placement: "bottom", align: "left" });
  assert.equal(variantGrid(heads, [], [], "left").length, 2, "no call and no placement: one each");
  const many = variantGrid(Array.from({ length: 30 }, (_, i) => ({ headline: `T${i}`, sub: "" })), ["a", "b"], ["top"], "left");
  assert.equal(many.length, MAX_VARIANTS);
  const jobs = exportJobs(grid, ["1x1", "9x16"], "jpg");
  assert.equal(jobs.length, 16);
  assert.deepEqual(jobs.slice(0, 2).map((j) => j.file), ["fija-01-9x16.jpg", "fija-01-1x1.jpg"]);
  assert.ok(jobs.every((j) => STILL_EXPORT.test(j.file) && projectPathAllowed(j.file)), "exports travel in the project's zip");
  assert.ok(projectPathAllowed("fija-imagen.png"));
});

test("picking a concept fills the variants; pasted texts join them without repeats", () => {
  const menu = parseStillPaste(STILL_SAMPLE_MENU).concepts;
  let p = { ...newStillPiece(GROK), concepts: menu };
  p = pickConcept(p, "c3");
  assert.equal(p.headlines, "Antes: tres cosas. Ahora: una. | El burlete se pone una vez.");
  assert.equal(p.ctas, "Pedilo en Máshogar");
  assert.deepEqual(p.placements, ["bottom"]);
  p = addCopies(p, parseStillPaste(STILL_SAMPLE_COPIES).copies);
  assert.equal(p.headlines.split("\n").length, 4);
  assert.deepEqual(p.ctas.split("\n"), ["Pedilo en Máshogar", "Ver el burlete"]);
  assert.deepEqual(p.placements, ["bottom", "top"]);
  // Saved and read back.
  const back = migrateStill(JSON.parse(JSON.stringify(p)), null);
  assert.deepEqual(back, p);
  assert.deepEqual(migrateStill({ placements: ["side"], formats: ["16x9", "4x5"], fit: "zoom" }, null).formats, ["4x5"]);
  assert.equal(migrateStill(null, GROK).keepOut, GROK);
  const md = stillMarkdown(p, { prompt: "PROMPT", variants: [copy()] });
  assert.match(md, /^# El frío que entra por debajo de la puerta/);
  assert.match(md, /## Prompt para Grok\n\nPROMPT/);
  assert.match(md, /\[VERIFY\] Que se pone una sola vez/);
});

test("checks before export: real proof, [VERIFY], nothing borrowed, legible text, fonts, watermark", () => {
  const menu = parseStillPaste(STILL_SAMPLE_MENU).concepts;
  const ok = (concept: StillConcept, over: Partial<Parameters<typeof stillChecks>[0]> = {}) =>
    stillChecks({
      concept,
      variants: [copy()],
      layouts: [{ label: "Variante 1, 9:16", fits: true, problems: [] }],
      picture: true,
      fontsLoaded: true,
      watermarkWhole: true,
      caption: "La toalla vuelve al baño.",
      references: [],
      brandName: "Máshogar",
      ...over,
    });
  assert.deepEqual(ok(menu[0]), []);
  const blocked = (list: ReturnType<typeof stillChecks>) => list.filter((x) => x.blocking).map((x) => x.id);
  assert.deepEqual(blocked(ok(menu[5])), ["prueba:c6"]);
  assert.deepEqual(blocked(ok(menu[0], { variants: [copy({ sub: "Y menos ruido [VERIFY]" })] })), ["verify"]);
  assert.deepEqual(blocked(ok(menu[0], { picture: false, fontsLoaded: false, watermarkWhole: false })), ["imagen", "letra", "marca-de-agua"]);
  assert.deepEqual(blocked(ok(menu[0], { layouts: [{ label: "Variante 3, 1:1", fits: false, problems: ["El texto no entra."] }] })), ["entra:Variante 3, 1:1"]);
  assert.deepEqual(blocked(ok(menu[0], { variants: [copy({ headline: "Como en The Daily Show" })] })), ["prestado"]);
  const ref = normalizeReference({ title: "Mantas", hook: "Frío nunca más en tu casa" });
  assert.equal(borrowedFromReference("Frío nunca más en tu casa, con Máshogar", [ref]), "Mantas");
  assert.equal(borrowedFromReference("Nunca más frío", [ref]), null);
  assert.deepEqual(blocked(ok(menu[0], { variants: [copy({ headline: "Frío nunca más en tu casa" })], references: [ref] })), ["referencia:Frío nunca más en tu casa"]);
  // Warnings do not block.
  const warn = ok(menu[0], { caption: "", variants: [copy({ headline: "Máshogar te salva del frío" })] });
  assert.deepEqual(warn.filter((x) => !x.blocking).map((x) => x.id), ["cliente-heroe", "compartir"]);
  assert.ok(ok(menu[0], { caption: "Nos emociona compartir esto" }).some((x) => x.id === "compartir-generico"));
  assert.deepEqual(blocked(ok({ ...menu[0], picture: "She sits, then sleeps" })), []);
  assert.ok(ok(null as unknown as StillConcept).some((x) => x.id === "concepto" && x.blocking));
});

test("many exports download as one stored zip that reads back", () => {
  assert.equal(crc32(new TextEncoder().encode("hello")), 0x3610a686);
  const files = [
    { name: "fija-01-9x16.png", data: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]) },
    { name: "texto-para-compartir.txt", data: new TextEncoder().encode("La toalla vuelve al baño.\n") },
  ];
  const back = readZip(storeZip(files));
  assert.deepEqual(back.map((f) => f.name), files.map((f) => f.name));
  assert.deepEqual([...back[0].data], [...files[0].data]);
  assert.equal(back[1].data.toString("utf8"), "La toalla vuelve al baño.\n");
});
