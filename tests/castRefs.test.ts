// Extra references of a cast member: the face cut from its sheet (or a dragged part) and its loose views, each its own
// @ reference in the image tool, within the tool's cap read from its profile. Old series without them still load.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  CROP_MAX_SIDE,
  MIN_CROP,
  clampRect,
  cropOutputSize,
  defaultFaceRect,
  extraRefName,
  memberRefCount,
  rectFromDrag,
  refFileName,
  referenceCap,
  seriesRefNames,
  shotReferences,
  toImagePoint,
  toolsRefCap,
} from "../shared/castRefs.ts";
import { CastMemberSchema, EMPTY_SERIES, markdownToSeries, seriesToMarkdown } from "../shared/series.ts";

const inside = (r: { x: number; y: number; w: number; h: number }, w: number, h: number) =>
  r.x >= 0 && r.y >= 0 && r.x + r.w <= w && r.y + r.h <= h;

test("the default face on a 16:9 sheet is a square in the bottom row's first panel", () => {
  const r = defaultFaceRect(1920, 1080);
  assert.equal(r.w, r.h);
  assert.ok(inside(r, 1920, 1080));
  assert.ok(r.x + r.w <= 1920 / 7 + 1, "inside the first of seven panels");
  assert.ok(r.y >= 540, "in the bottom row");
  // The 3D look has eight panels in its bottom row: a narrower first panel.
  const p = defaultFaceRect(1920, 1080, "puppet");
  assert.ok(p.w < r.w && p.x + p.w <= 1920 / 8 + 1);
});

test("the default face on a portrait is in its upper middle", () => {
  const r = defaultFaceRect(900, 1600);
  assert.equal(r.w, r.h);
  assert.ok(inside(r, 900, 1600));
  assert.ok(Math.abs(r.x + r.w / 2 - 450) <= 1, "centred");
  assert.ok(r.y + r.h < 800, "upper half");
});

test("a drag in any direction gives the same rectangle, clamped to the picture", () => {
  const a = rectFromDrag({ x: 100, y: 50 }, { x: 300, y: 250 }, 1000, 800);
  const b = rectFromDrag({ x: 300, y: 250 }, { x: 100, y: 50 }, 1000, 800);
  assert.deepEqual(a, { x: 100, y: 50, w: 200, h: 200 });
  assert.deepEqual(a, b);
  const off = rectFromDrag({ x: -50, y: -50 }, { x: 2000, y: 100 }, 1000, 800);
  assert.deepEqual(off, { x: 0, y: 0, w: 1000, h: 100 });
});

test("a tiny drag still keeps a crop worth saving", () => {
  const r = rectFromDrag({ x: 995, y: 795 }, { x: 999, y: 799 }, 1000, 800);
  assert.equal(r.w, MIN_CROP);
  assert.equal(r.h, MIN_CROP);
  assert.ok(inside(r, 1000, 800));
  // A picture smaller than the minimum is taken whole.
  assert.deepEqual(clampRect({ x: 5, y: 5, w: 2, h: 2 }, 20, 10), { x: 0, y: 0, w: 20, h: 10 });
});

test("a point on the shown picture maps to the image's own pixels", () => {
  assert.deepEqual(toImagePoint({ x: 240, y: 135 }, { w: 480, h: 270 }, { w: 1920, h: 1080 }), { x: 960, y: 540 });
  assert.deepEqual(toImagePoint({ x: -10, y: 999 }, { w: 480, h: 270 }, { w: 1920, h: 1080 }), { x: 0, y: 1080 });
});

test("the crop is saved at its own size, scaled down only past the longest side", () => {
  assert.deepEqual(cropOutputSize({ x: 0, y: 0, w: 300, h: 200 }), { w: 300, h: 200 });
  assert.deepEqual(cropOutputSize({ x: 0, y: 0, w: 4000, h: 2000 }), { w: CROP_MAX_SIDE, h: CROP_MAX_SIDE / 2 });
});

test("an extra reference is named after the member and the part, never one the series uses", () => {
  assert.equal(extraRefName("Marta", "cara", []), "MartaCara");
  assert.equal(extraRefName("Marta", "Perfil izquierdo", []), "MartaPerfilIzquierdo");
  assert.equal(extraRefName("DonaMarta", "Para el títere", []), "DonaMartaParaElTitere");
  assert.equal(extraRefName("Marta", "cara", ["martacara"]), "MartaCara2");
  assert.equal(extraRefName("Marta", "cara", ["MartaCara", "MartaCara2"]), "MartaCara3");
  assert.equal(extraRefName("Marta", "", []), "MartaRef");
  const long = extraRefName("A".repeat(28), "cara", ["A".repeat(28) + "Ca"]);
  assert.ok(long.length <= 30 && /^[A-Za-z0-9_]+$/.test(long));
  assert.notEqual(long.toLowerCase(), ("A".repeat(28) + "Ca").toLowerCase());
  assert.deepEqual(seriesRefNames([{ ref: "Marta", refs: [{ ref: "MartaCara" }] }, { ref: "Kiosco" }]), ["Marta", "MartaCara", "Kiosco"]);
});

test("an extra reference's file fits the library's name rule", () => {
  const name = refFileName("dona-marta-de-la-esquina-del-barrio", "DonaMartaParaElTitere", "lz8k2m1x", "png");
  assert.match(name, /^[a-z0-9-]{1,60}\.(png|jpg|webp|gif|glb)$/);
  assert.ok(name.startsWith("dona-marta-de-la-esquina"));
  assert.match(refFileName("marta", "Marta_Cara", "1", "jpg"), /^marta-ref-martacara-1\.jpg$/);
});

test("the cap comes from the tool's profile", () => {
  const grok = readFileSync(new URL("../server/tools/grok-imagine.md", import.meta.url), "utf8");
  assert.equal(referenceCap(grok), 14);
  assert.equal(referenceCap("No references here."), null);
  assert.equal(toolsRefCap([{ maxRefs: 14 }, { maxRefs: null }, {}]), 14);
  assert.equal(toolsRefCap([{ maxRefs: null }]), null);
  assert.equal(toolsRefCap([{ maxRefs: 14 }, { maxRefs: 8 }]), 8);
});

test("what a member and a shot bring to the tool", () => {
  const marta = { ref: "Marta", image: "marta.png", refs: [{ ref: "MartaCara", image: "m-ref.png" }, { ref: "MartaPerfil", image: "" }] };
  const kiosco = { ref: "Kiosco", image: "", refs: [{ ref: "KioscoPuerta", image: "k.png" }] };
  assert.equal(memberRefCount(marta), 2);
  assert.equal(memberRefCount({ image: "" }), 0);
  assert.deepEqual(shotReferences([marta, kiosco, marta]), ["Marta", "MartaCara", "KioscoPuerta"]);
});

test("a cast member saved before references and views loads with none, and keeps them through the bible", () => {
  const old = CastMemberSchema.parse({ id: "marta", name: "Marta", ref: "Marta", kind: "character", identity: "", note: "", image: "marta.png" });
  assert.deepEqual(old.refs, []);
  assert.deepEqual(old.views, []);
  const member = {
    ...old,
    refs: [{ ref: "MartaCara", label: "cara", image: "marta-ref-martacara-1.png" }],
    views: [{ title: "Perfil", prompt: "Side profile of the same woman." }],
  };
  const back = markdownToSeries(seriesToMarkdown({ ...EMPTY_SERIES, name: "Prueba", cast: [member] }), "prueba");
  assert.deepEqual(back.cast[0].refs, member.refs);
  assert.deepEqual(back.cast[0].views, member.views);
});
