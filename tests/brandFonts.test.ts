// "Fuentes propias de la marca": font files a series uploads, checked by their bytes, named safely, listed in the
// bible's brand line, and resolved by family name (the brand's own files first, else Google Fonts).
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BRAND_FONT_MAX,
  FONT_MAX_BYTES,
  afterFontRemoved,
  brandFontSources,
  brandFontUrl,
  cleanFamily,
  editFontFace,
  fontChoices,
  fontFileName,
  fontTypeOf,
  fontUploadProblems,
  guessFontFace,
  keepBrandFonts,
  missingFontText,
  resolveBrandFont,
  storyFonts,
  uploadedFamilies,
  type BrandFont,
} from "../shared/brandFonts.ts";
import { fontWeights } from "../shared/codePrompt.ts";
import { DEFAULT_BRAND, DEFAULT_TEXT_STYLE, EMPTY_SERIES, TextStyleSchema, markdownToSeries, seriesToMarkdown, type Brand } from "../shared/series.ts";
import { fontPath } from "../server/series.ts";

const bytes = (head: number[] | string, size = 64) => {
  const out = new Uint8Array(size);
  const start = typeof head === "string" ? [...head].map((c) => c.charCodeAt(0)) : head;
  out.set(start);
  return out;
};

const face = (o: Partial<BrandFont> = {}): BrandFont => ({ file: "gotham-700.woff2", family: "Gotham", role: "display", weight: 700, style: "normal", name: "Gotham-Bold.woff2", ...o });
const brand = (o: Partial<Brand> = {}): Brand => ({ ...DEFAULT_BRAND, ...o });

test("font files are recognised by their first bytes, never by their name", () => {
  assert.equal(fontTypeOf(bytes("wOF2")), "woff2");
  assert.equal(fontTypeOf(bytes("wOFF")), "woff");
  assert.equal(fontTypeOf(bytes("OTTO")), "otf");
  assert.equal(fontTypeOf(bytes([0, 1, 0, 0])), "ttf");
  assert.equal(fontTypeOf(bytes("true")), "ttf");
  assert.equal(fontTypeOf(bytes("ttcf")), null, "a collection is refused");
  assert.equal(fontTypeOf(bytes([0x89, 0x50, 0x4e, 0x47])), null, "a PNG is not a font");
  assert.equal(fontTypeOf(bytes("wOF2", 4)), null, "too short to be a font");
});

test("an upload is checked for emptiness, size, type and how many the brand has", () => {
  assert.deepEqual(fontUploadProblems(bytes("wOF2"), 0), []);
  assert.match(fontUploadProblems(new Uint8Array(0), 0)[0], /vacío/);
  assert.match(fontUploadProblems(bytes("wOF2", FONT_MAX_BYTES + 1), 0)[0], /pesa más de 8 MB/);
  assert.match(fontUploadProblems(bytes("%PDF"), 0)[0], /no es una fuente/);
  assert.match(fontUploadProblems(bytes("wOF2"), BRAND_FONT_MAX)[0], new RegExp(`ya tiene ${BRAND_FONT_MAX}`));
});

test("a family name is made safe for CSS, and the file name gives a first guess", () => {
  assert.equal(cleanFamily(`  Got"ham; } Rounded  `), "Got ham Rounded");
  assert.equal(cleanFamily(`"';{}\\`), "");
  assert.equal(cleanFamily("Ñandú Sans"), "Ñandú Sans");
  assert.deepEqual(guessFontFace("Gotham-BoldItalic.woff2"), { family: "Gotham", weight: 700, style: "italic" });
  assert.deepEqual(guessFontFace("Inter_SemiBold.ttf"), { family: "Inter", weight: 600, style: "normal" });
  assert.deepEqual(guessFontFace("BrandSans-Regular.otf"), { family: "Brand Sans", weight: 400, style: "normal" });
  assert.deepEqual(guessFontFace("Marca-ExtraLight.woff"), { family: "Marca", weight: 200, style: "normal" });
  assert.deepEqual(guessFontFace("Mascota-Black.ttf"), { family: "Mascota", weight: 900, style: "normal" });
  assert.equal(guessFontFace("Bold.woff2").family, "Bold", "a name that is only a weight keeps it as the family");
});

test("saved names are slugs, unique, with the extension the bytes said", () => {
  assert.equal(fontFileName("Gótham Rounded", 700, "normal", "woff2", []), "gotham-rounded-700.woff2");
  assert.equal(fontFileName("Gotham", 400, "italic", "otf", []), "gotham-400-italic.otf");
  assert.equal(fontFileName("Gotham", 700, "normal", "woff2", ["gotham-700.woff2"]), "gotham-700-2.woff2");
  assert.equal(fontFileName("../../", 400, "normal", "ttf", []), "fuente-400.ttf");
});

test("the server only reads and removes font names inside the series' fuentes folder", () => {
  assert.ok(fontPath("iman", "gotham-700.woff2")?.endsWith("/iman/fuentes/gotham-700.woff2"));
  assert.equal(fontPath("iman", "../../.env"), null);
  assert.equal(fontPath("iman", "gotham.exe"), null);
  assert.equal(fontPath("../iman", "gotham-700.woff2"), null);
  assert.equal(brandFontUrl("iman", "gotham-700.woff2"), "/api/series/iman/fonts/gotham-700.woff2");
});

test("a brand font resolves to its uploaded files by family (any case), else to Google Fonts", () => {
  const b = brand({ displayFont: "gotham", uiFont: "Inter", fonts: [face(), face({ file: "gotham-400.woff2", weight: 400, role: "ui" }), face({ file: "x-400.ttf", family: "Otra", role: "other", weight: 400 })] });
  const display = resolveBrandFont(b, "gotham");
  assert.equal(display.kind, "file");
  assert.equal(display.kind === "file" && display.faces.length, 2);
  assert.equal(display.family, "Gotham", "the family as uploaded");
  assert.deepEqual(resolveBrandFont(b, "Inter"), { family: "Inter", kind: "google" });
  assert.deepEqual(
    brandFontSources(b).map((s) => [s.family, s.kind]),
    [
      ["Gotham", "file"],
      ["Inter", "google"],
    ],
  );
  assert.equal(brandFontSources(brand({ displayFont: "Gotham", uiFont: "gotham", fonts: [face()] })).length, 1, "one family used twice loads once");
  assert.deepEqual(uploadedFamilies(b), [
    { family: "Gotham", roles: ["display", "ui"], weights: [400, 700] },
    { family: "Otra", roles: ["other"], weights: [400] },
  ]);
  assert.deepEqual(storyFonts(b), { display: "gotham", ui: "Inter" });
});

test("the font selects list the brand's own families first, by role, then Google Fonts", () => {
  const b = brand({ displayFont: "Space Grotesk", uiFont: "Hecha a mano", fonts: [face({ family: "Cuerpo", role: "ui", file: "cuerpo-400.woff2", weight: 400 }), face()] });
  const display = fontChoices(b, "display", ["Space Grotesk", "Syne"]);
  assert.deepEqual(display.slice(0, 2), [
    { family: "Gotham", uploaded: true },
    { family: "Cuerpo", uploaded: true },
  ]);
  assert.deepEqual(display.slice(2).map((c) => c.family), ["Space Grotesk", "Syne"]);
  const ui = fontChoices(b, "ui", ["Inter"]);
  assert.deepEqual(ui.map((c) => c.family), ["Cuerpo", "Gotham", "Inter", "Hecha a mano"], "the current one stays even if it is in neither list");
});

test("the form may rename a face or change its role, never add or drop a file", () => {
  const saved = [face(), face({ file: "gotham-400.woff2", weight: 400 })];
  const sent = [face({ family: "Gotham Pro", role: "ui", weight: 600 }), face({ file: "intruso-400.woff2", family: "Intruso" })];
  const kept = keepBrandFonts(saved, sent);
  assert.deepEqual(kept.map((f) => [f.file, f.family, f.role, f.weight]), [
    ["gotham-700.woff2", "Gotham Pro", "ui", 600],
    ["gotham-400.woff2", "Gotham", "display", 400],
  ]);
  assert.deepEqual(keepBrandFonts(saved, undefined), saved);
});

test("renaming a family carries the brand's choice with it; removing its last file falls back to the default", () => {
  const b = brand({ displayFont: "Gotham", uiFont: "Inter", fonts: [face()] });
  const renamed = editFontFace(b, "gotham-700.woff2", { family: "Gotham Pro" });
  assert.equal(renamed.displayFont, "Gotham Pro");
  assert.equal(renamed.fonts[0].family, "Gotham Pro");
  const two = brand({ displayFont: "Gotham", uiFont: "Inter", fonts: [face(), face({ file: "gotham-400.woff2", weight: 400 })] });
  assert.equal(editFontFace(two, "gotham-700.woff2", { family: "Otra" }).displayFont, "Gotham", "another face still carries the old name");
  assert.equal(editFontFace(b, "gotham-700.woff2", { family: `"';` }).fonts[0].family, "Gotham", "an unsafe name keeps the old one");

  const removed = afterFontRemoved({ ...b, fonts: [] }, [face()], DEFAULT_BRAND);
  assert.equal(removed.displayFont, DEFAULT_BRAND.displayFont);
  assert.equal(removed.uiFont, "Inter");
  const stillThere = afterFontRemoved({ ...two, fonts: [two.fonts[1]] }, [two.fonts[0]], DEFAULT_BRAND);
  assert.equal(stillThere.displayFont, "Gotham", "the family keeps another file");
});

test("the bible lists the brand's fonts in its brand line; old bibles have none", () => {
  const fields = { ...EMPTY_SERIES, name: "IMAN", brand: brand({ displayFont: "Gotham", fonts: [face()] }) };
  const md = seriesToMarkdown(fields);
  assert.match(md, /^Marca[^\n]*"fonts":\[\{"file":"gotham-700\.woff2","family":"Gotham"/m);
  assert.deepEqual(markdownToSeries(md, "iman").brand.fonts, [face()]);
  const old = md.replace(/,"fonts":\[[^\]]*\]/, "");
  assert.doesNotMatch(old, /fonts/);
  assert.deepEqual(markdownToSeries(old, "iman").brand.fonts, []);
  const bad = md.replace('"family":"Gotham"', '"family":"Go\\";}ham"');
  assert.deepEqual(markdownToSeries(bad, "iman").brand, DEFAULT_BRAND, "a hand-edited unsafe family keeps the default brand");
});

test("the story's text style uses the app's letter unless it asks for the brand's", () => {
  assert.equal(DEFAULT_TEXT_STYLE.font, "app");
  const { font: _f, ...old } = DEFAULT_TEXT_STYLE;
  assert.equal(TextStyleSchema.parse(old).font, "app", "old saved styles read as the app's letter");
  assert.equal(TextStyleSchema.parse({ ...old, font: "brand" }).font, "brand");
});

test("the code prompt names an uploaded family's weights, and a stopped render says where the font came from", () => {
  const b = brand({ displayFont: "Gotham", fonts: [face(), face({ file: "gotham-400.woff2", weight: 400 }), face({ file: "gotham-700-italic.woff2", style: "italic" })] });
  assert.equal(fontWeights(b, "Gotham"), " (the brand's own file: weights 400, 700 only)");
  assert.equal(fontWeights(b, "Inter"), "");
  assert.match(missingFontText(["Gotham"], b), /fuente subida a la serie/);
  assert.match(missingFontText(["Inter"], b), /conexión a internet/);
});
