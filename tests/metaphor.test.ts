// "Escenas metáfora" (IDEAS idea 63): one simple picture made with Grok that explains an idea, with a short line. The
// layout of the picture and its line, the picture's settle, the Grok prompts (look, cast @refs, no words in the
// picture), the request for Opus and its pasted reply, the batch copy, the writer's fields, the director's note, the
// project slots, the clip timing, the render gate and the drawing (placeholder until the picture is uploaded).
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  METAPHOR_BASE,
  METAPHOR_ENTER,
  METAPHOR_MISSING,
  NO_TEXT,
  isMetaphorSlot,
  metaphorAsset,
  metaphorBatch,
  metaphorCastOf,
  metaphorFileBase,
  metaphorImagePrompt,
  metaphorIssues,
  metaphorLayout,
  metaphorLine,
  metaphorOpusPrompt,
  metaphorSettle,
  metaphorSlot,
  metaphorVideoPrompt,
  nextMetaphorSlot,
  parseMetaphorReply,
  pickMetaphor,
  placeholderLines,
  type SceneMetaphor,
} from "../shared/metaphor.ts";
import { blankScene, normalizeMotion, pickTemplate, sceneElements, showsSig, timeScenes, type MotionScene, type MotionScript } from "../shared/motion.ts";
import { mergeNote, noteView } from "../shared/motionNote.ts";
import { METAPHOR_CLIP, clipTime, recordingsUsed, sceneClip, videoAssetOf } from "../shared/screenVideo.ts";
import { PLAIN_PHOTO } from "../shared/prompt.ts";
import { safeRect } from "../shared/safeZone.ts";
import { DEFAULT_BRAND, type SeriesLook } from "../shared/series.ts";
import { drawMotionFrame, floorOf, type MotionWorld } from "../src/lib/motion.ts";
import { usesAiImages } from "../src/lib/motionProject.ts";
import { pieceMarkdown } from "../src/lib/motionMarkdown.ts";
import { newMotionPiece } from "../shared/motion.ts";

const FORMATS = [
  [1080, 1920],
  [1920, 1080],
] as const;
const LOOK: SeriesLook = { camera: "Phone camera, slightly wide", flash: "", grain: "visible grain", focus: "", light: "flat shop light", extra: "" };
const CAST = [
  { id: "mica", ref: "Mica", identity: "woman in her 30s, short dark hair, green apron", kind: "character", image: "mica.png" },
  { id: "almacen", ref: "Almacen", identity: "small corner shop, yellow walls", kind: "place", image: "almacen.png" },
  { id: "inicio", ref: "PantallaInicio", identity: "La pantalla de inicio", kind: "screen", image: "inicio.png" },
  { id: "sin-foto", ref: "SinFoto", identity: "a man", kind: "character", image: "" },
];
const BOXES: SceneMetaphor = { image: "A tall stack of cardboard boxes leaning on a bare shop counter, about to topple, soft morning light", video: "The top box slowly tips over", cast: [] };
const scene = (over: Partial<MotionScene>): MotionScene => ({ ...blankScene("metaphor"), ...over });

// ── Layout ──────────────────────────────────────────────────────────────────────────────

test("the picture is square, starts below the top it is given, stays in the frame, and its line fits under or beside it", () => {
  for (const [w, h] of FORMATS) {
    const vertical = h > w;
    const safe = safeRect(w, h);
    const floor = vertical ? floorOf({ voice: "una línea" }, w, h, true) : h * 0.9;
    for (const top of [vertical ? h * 0.12 : h * 0.08, vertical ? h * 0.2 : h * 0.18]) {
      for (const hasText of [false, true]) {
        const L = metaphorLayout(w, h, { top, floor, hasText });
        const where = `${w}x${h} top ${top} text ${hasText}`;
        assert.equal(L.pic.w, L.pic.h, `${where}: square`);
        assert.ok(L.pic.y >= top - 0.5, `${where}: below the top`);
        assert.ok(L.pic.x >= 0 && L.pic.x + L.pic.w <= w && L.pic.y + L.pic.h <= h, `${where}: in the frame`);
        assert.ok(L.titleSize > 0 && L.textSize > 0 && L.titleMax > 0);
        if (vertical) {
          assert.ok(L.titleY > L.pic.y + L.pic.h, `${where}: the line under the picture`);
          const words = L.titleSize * 1.02 * 2 + (hasText ? L.textSize * 1.3 * 2 : 0);
          assert.ok(L.titleY - L.titleSize + words <= floor + 0.5, `${where}: two lines of title (and of text) end above the subtitle`);
          assert.ok(L.titleX >= safe.x - 0.5 && L.titleX + L.titleMax <= w, `${where}: the line inside the frame`);
        } else {
          assert.ok(L.titleX >= L.pic.x + L.pic.w, `${where}: the line beside the picture`);
          assert.ok(L.titleX + L.titleMax <= w + 0.5);
          assert.ok(L.pic.y + L.pic.h <= floor + 0.5, `${where}: the picture above the floor`);
        }
      }
    }
    // A lower top (a CONCEPTO label) makes the picture smaller, never moves it above the top.
    const free = metaphorLayout(w, h, { top: h * 0.1, floor, hasText: true });
    const labelled = metaphorLayout(w, h, { top: h * 0.2, floor, hasText: true });
    assert.ok(labelled.pic.w <= free.pic.w + 0.5);
  }
});

test("the picture settles as a pure function of time: in from 92 %, never from nothing, and lands at its size at the end", () => {
  const at = 0.2;
  const seconds = 4;
  const before = metaphorSettle(0, at, seconds);
  assert.equal(before.alpha, 0);
  assert.ok(Math.abs(before.scale - 0.92 * 1.03) < 1e-9, "starts at 92 % of the slightly large picture");
  const entered = metaphorSettle(at + METAPHOR_ENTER, at, seconds);
  assert.equal(entered.alpha, 1);
  assert.ok(entered.scale > 1 && entered.scale <= 1.03 + 1e-9);
  const end = metaphorSettle(seconds, at, seconds);
  assert.ok(Math.abs(end.scale - 1) < 1e-9, "its own size at the end of the scene");
  // After the entrance it only sinks, never jumps back.
  let last = Infinity;
  for (let t = at + METAPHOR_ENTER; t <= seconds; t += 0.05) {
    const { scale } = metaphorSettle(t, at, seconds);
    assert.ok(scale <= last + 1e-9, `t ${t.toFixed(2)}`);
    assert.ok(scale >= 0.92);
    last = scale;
  }
  assert.deepEqual(metaphorSettle(1.3, at, seconds), metaphorSettle(1.3, at, seconds));
  assert.deepEqual(metaphorSettle(Number.NaN, at, seconds), metaphorSettle(0, 0, seconds));
});

// ── Prompts ─────────────────────────────────────────────────────────────────────────────

test("the Grok image prompt: the moment first, the cast's @refs, the series look or the plain photo, no words, square", () => {
  const cast = metaphorCastOf(CAST);
  assert.deepEqual(
    cast.map((c) => c.id),
    ["mica", "almacen"],
    "never a real screen, never a member without an approved image",
  );
  const plain = metaphorImagePrompt(BOXES);
  assert.ok(plain.startsWith("A tall stack of cardboard boxes"));
  assert.ok(plain.includes(PLAIN_PHOTO));
  assert.ok(plain.includes(NO_TEXT));
  assert.ok(/Square 1:1/.test(plain));
  assert.ok(!/@/.test(plain));
  const withCast = metaphorImagePrompt({ ...BOXES, image: `${BOXES.image}, cinematic, 8k`, cast: ["mica", "inicio"] }, { look: LOOK, cast });
  assert.ok(withCast.includes("@Mica (woman in her 30s, short dark hair, green apron)"));
  assert.ok(!withCast.includes("@PantallaInicio"), "a screen in the cast list is not called");
  assert.ok(withCast.includes("Look: Phone camera, slightly wide; visible grain; flat shop light"));
  assert.ok(!withCast.includes(PLAIN_PHOTO));
  assert.ok(!/cinematic|8k/i.test(withCast), "polish words are dropped");
  assert.equal(metaphorImagePrompt({ image: "  ", video: "", cast: [] }), "", "nothing to ask until the moment is written");
});

test("the Grok clip prompt animates the still: one action, a slow or locked camera, muted, no words", () => {
  assert.equal(metaphorVideoPrompt({ ...BOXES, video: "" }), "");
  const v = metaphorVideoPrompt(BOXES);
  assert.ok(v.startsWith("The top box slowly tips over."));
  assert.ok(/Locked-off camera/.test(v), "a camera when the action names none");
  assert.ok(/no music, no speech/.test(v));
  assert.ok(/No text appears/.test(v));
  const own = metaphorVideoPrompt({ ...BOXES, video: "The stack sways, slow push-in" });
  assert.ok(!/Locked-off/.test(own), "its own camera move stays the only one");
});

test("Copiar todos los prompts de metáforas: every metaphor scene in order, the clip only when it has one", () => {
  const scenes = [
    { index: 1, title: "Se te cae el pedido", metaphor: BOXES, asset: "" },
    { index: 4, title: "Todo en su lugar", metaphor: { image: "One neat row of jars on a shelf", video: "", cast: ["mica"] }, asset: metaphorAsset(2) },
    { index: 6, title: "", metaphor: undefined, asset: "" },
  ];
  const text = metaphorBatch(scenes, { look: LOOK, cast: metaphorCastOf(CAST) });
  assert.ok(text.startsWith("# Prompts de metáforas para Grok"));
  const a = text.indexOf("## Escena 2 — «Se te cae el pedido»");
  const b = text.indexOf("## Escena 5 — «Todo en su lugar» (ya tiene imagen)");
  const c = text.indexOf("## Escena 7");
  assert.ok(a > 0 && b > a && c > b, "in order, numbered as they play");
  assert.equal(text.split("Video (Grok, opcional)").length - 1, 1, "only the scene with an animation gets a clip prompt");
  assert.ok(text.includes("@Mica"));
  assert.ok(text.includes("(falta escribir qué se ve)"));
  assert.equal(metaphorBatch([]), "");
});

test("Opus by copy and paste: the request names the scene and the cast, and the pasted reply is read tolerantly", () => {
  const cast = metaphorCastOf(CAST);
  const ask = metaphorOpusPrompt(scene({ title: "Se te cae el pedido", voice: "Un pedido mal armado se cae solo." }), { series: "IMAN", problem: "Pedidos que se arman a ojo", cast, look: LOOK });
  assert.ok(ask.includes("«IMAN»"));
  assert.ok(ask.includes('"Se te cae el pedido"'));
  assert.ok(ask.includes("- mica (@Mica, character)"));
  assert.ok(!ask.includes("inicio"), "no real screen offered");
  assert.ok(/IMAGEN:[\s\S]*VIDEO:[\s\S]*CAST:/.test(ask));
  const reply = "Claro, acá va:\n\n**IMAGEN:** A tall stack of boxes on a counter,\nleaning to the left, morning light\n**VIDEO:** The top box tips over. Slow push-in.\n**CAST:** @mica, inicio, nadie\n";
  const read = parseMetaphorReply(reply, cast.map((c) => c.id));
  assert.ok("metaphor" in read);
  if ("metaphor" in read) {
    assert.equal(read.metaphor.image, "A tall stack of boxes on a counter, leaning to the left, morning light");
    assert.equal(read.metaphor.video, "The top box tips over. Slow push-in.");
    assert.deepEqual(read.metaphor.cast, ["mica"], "only ids of the cast it may call");
  }
  const english = parseMetaphorReply("Image: two hands passing a key\nClip:\nCast:");
  assert.ok("metaphor" in english && english.metaphor.image === "two hands passing a key" && english.metaphor.video === "");
  const bad = parseMetaphorReply("No sé qué imagen poner.");
  assert.ok("error" in bad && /IMAGEN/.test(bad.error));
});

// ── The script ──────────────────────────────────────────────────────────────────────────

test("the writer's fields become the scene's metaphor; its picture is only ever the uploaded one", () => {
  const wire = (over: Record<string, unknown>) => ({ template: "metaphor", seconds: 3.5, title: "Se te cae el pedido", text: "", items: [], asset: "", assetB: "", gesture: "", focusX: 0.5, focusY: 0.5, zoom: 2, voice: "", emotion: "", ...over });
  const script = normalizeMotion(
    {
      problem: "",
      title: "",
      durationNote: "",
      note: "",
      caption: "",
      music: { mood: "drive", bpm: 110 },
      scenes: [
        wire({ imagePrompt: ` ${BOXES.image} `, videoPrompt: BOXES.video, cast: "mica, @almacen, inicio" }),
        wire({ template: "Metáfora", imagePrompt: "One key", asset: "mica" }),
        wire({ template: "screen", asset: "inicio", imagePrompt: "ignored" }),
      ],
    },
    "warm",
    { cast: metaphorCastOf(CAST).map((c) => c.id) },
  );
  const [a, b, c] = script.scenes;
  assert.equal(a.template, "metaphor");
  assert.deepEqual(a.metaphor, { image: BOXES.image, video: BOXES.video, cast: ["mica", "almacen"] });
  assert.equal(a.asset, "");
  assert.equal(b.template, "metaphor");
  assert.equal(b.asset, "", "a cast id the writer put as the picture is not the picture");
  assert.deepEqual(b.metaphor?.cast, ["mica"], "it joins the picture's cast");
  assert.equal(c.metaphor, undefined, "other templates carry no metaphor");
  assert.equal(pickTemplate("metafora"), "metaphor");
  // The camera only moves in depth, and the picture enters before its line.
  assert.ok(["hold", "push", "pull"].includes(a.camera ?? "hold"));
  const keys = sceneElements({ ...a, text: "Uno" }).map((e) => [e.key, e.at]);
  assert.deepEqual(keys, [
    ["media", 0],
    ["title", 0.45],
    ["text", 0.9],
  ]);
});

test("a director's note keeps the uploaded picture and changes only what Grok should draw", () => {
  const cur = scene({ id: "m1", title: "Se te cae el pedido", asset: metaphorAsset(0), metaphor: BOXES });
  const other = scene({ id: "s1", template: "screen", asset: "inicio" });
  const current: MotionScript = { problem: "p", title: "t", durationNote: "", note: "", music: { mood: "drive", bpm: 110 }, scenes: [cur, other], tone: "warm" };
  const view = JSON.parse(noteView(current));
  assert.equal(view.scenes[0].imagePrompt, BOXES.image);
  assert.equal(view.scenes[0].cast, "");
  assert.equal(view.scenes[1].imagePrompt, undefined);
  const revisedScene = { ...cur, id: "new", asset: "", metaphor: { ...BOXES, image: "A leaning stack of crates" } };
  const merged = mergeNote(current, { ...current, scenes: [revisedScene, { ...other, id: "x" }] }, [{ from: "m1" }, { from: "s1" }]);
  const kept = merged.script.scenes[0];
  assert.equal(kept.id, "m1");
  assert.equal(kept.asset, metaphorAsset(0), "the picture the person uploaded stays");
  assert.equal(kept.metaphor?.image, "A leaning stack of crates");
  assert.deepEqual(merged.changed, ["m1"]);
  const same = mergeNote(current, { ...current, scenes: [{ ...cur, id: "y", asset: "" }, { ...other, id: "z" }] }, [{ from: "m1" }, { from: "s1" }]);
  assert.deepEqual(same.changed, [], "an echoed metaphor with no picture is no change");
  // Uploading the picture does not change what the scene shows (a concept flag stays), the written moment does.
  assert.equal(showsSig({ ...cur, asset: "" }), showsSig(cur));
  assert.notEqual(showsSig(cur), showsSig({ ...cur, metaphor: { ...BOXES, image: "Another thing" } }));
});

// ── Media, timing and the render gate ───────────────────────────────────────────────────

test("the uploaded picture lives in slot 600 + N of the project, named metafora-NN", () => {
  assert.equal(metaphorSlot("metafora:3"), 3);
  assert.equal(metaphorSlot("layer:3"), null);
  assert.equal(metaphorSlot(""), null);
  assert.equal(nextMetaphorSlot([]), 0);
  assert.equal(nextMetaphorSlot([{ asset: "metafora:0" }, { asset: "inicio" }, { asset: "metafora:4" }]), 5, "past every slot in use");
  assert.ok(isMetaphorSlot(METAPHOR_BASE) && isMetaphorSlot(METAPHOR_BASE + 99) && !isMetaphorSlot(METAPHOR_BASE + 100) && !isMetaphorSlot(599));
  assert.equal(metaphorFileBase(METAPHOR_BASE, "image"), "metafora-01-imagen");
  assert.equal(metaphorFileBase(METAPHOR_BASE + 11, "clip"), "metafora-12-clip");
});

test("a metaphor's Grok clip plays from its start when the picture comes in and holds its last frame", () => {
  const m = scene({ id: "m", asset: metaphorAsset(1), metaphor: BOXES });
  assert.deepEqual(videoAssetOf(m), { id: "metafora:1", key: "media" });
  assert.equal(sceneClip(m), METAPHOR_CLIP);
  assert.equal(videoAssetOf(scene({ asset: "" })), null);
  assert.equal(clipTime(METAPHOR_CLIP, 6, 0, 0), 0);
  assert.ok(clipTime(METAPHOR_CLIP, 6, 9, 0) < 6, "past its end it holds the last frame");
  const screen = { ...blankScene("screen"), asset: "inicio" };
  assert.deepEqual([...recordingsUsed([m, screen])], ["metafora:1"], "a screen without a stretch plays no recording");
});

test("a metaphor scene with no uploaded picture stops the render and says what is missing", () => {
  const scenes = [
    scene({ id: "a", metaphor: BOXES }),
    scene({ id: "b" }),
    scene({ id: "c", asset: metaphorAsset(0), metaphor: BOXES }),
    scene({ id: "d", asset: metaphorAsset(1), metaphor: BOXES }),
    { ...blankScene("screen"), id: "e" },
  ];
  const issues = metaphorIssues(scenes, (id) => id === metaphorAsset(1));
  assert.deepEqual(
    issues.map((i) => [i.sceneId, i.index]),
    [
      ["a", 0],
      ["b", 1],
      ["c", 2],
    ],
  );
  assert.match(issues[0].problem, /Falta subir la imagen de Grok/);
  assert.match(issues[1].problem, /Falta escribir qué se ve/);
  assert.match(issues[2].problem, /no se pudo cargar/);
  // The picture made with Grok turns the AI notice on.
  const series = { cast: [] } as unknown as Parameters<typeof usesAiImages>[1];
  assert.ok(usesAiImages([scenes[2]], series));
  assert.ok(!usesAiImages([scenes[0]], series));
});

// ── The drawing ─────────────────────────────────────────────────────────────────────────

function recorder() {
  const ops: { op: string; text?: string; args?: number[] }[] = [];
  const own: Record<string, unknown> = {
    fillStyle: "#000000",
    globalAlpha: 1,
    fillText(t: string) {
      ops.push({ op: "text", text: t });
    },
    drawImage(...args: unknown[]) {
      ops.push({ op: "image", args: args.slice(1).map(Number) });
    },
    measureText: (t: string) => ({ width: t.length * 20 }),
  };
  const ctx = new Proxy(own, {
    get: (o, k: string) => (k in o ? o[k] : () => undefined),
    set: (o, k: string, v) => {
      o[k] = v;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, ops };
}

test("until the picture is uploaded the scene shows a placeholder with the prompt; then the picture, whole, and its line", () => {
  const m = scene({ id: "m", seconds: 4, title: "Se te cae el pedido", metaphor: BOXES });
  const script: MotionScript = { problem: "", title: "", durationNote: "", note: "", scenes: [m], music: { mood: "drive", bpm: 110 }, tone: "warm" };
  const picture = { width: 1024, height: 1024 } as unknown as CanvasImageSource;
  const base: MotionWorld = { brand: DEFAULT_BRAND, assets: {}, logo: null, beats: [], seed: 7, disclosure: "" };
  for (const [w, h] of FORMATS) {
    const paint = (world: MotionWorld, s: MotionScript) => {
      const r = recorder();
      drawMotionFrame(r.ctx, w, h, 2, s, world);
      return r.ops;
    };
    const empty = paint(base, script);
    const texts = empty.filter((o) => o.op === "text").map((o) => o.text);
    assert.ok(texts.includes(METAPHOR_MISSING), `${w}x${h}: says the picture is missing`);
    assert.ok(texts.some((t) => t?.startsWith("Prompt:")), `${w}x${h}: shows the prompt`);
    assert.deepEqual(empty, paint(base, script), "a pure function of t");
    const uploaded = { ...script, scenes: [{ ...m, asset: metaphorAsset(0) }] };
    const world = { ...base, assets: { [metaphorAsset(0)]: { image: picture, width: 1024, height: 1024, name: "m" } } };
    const drawn = paint(world, uploaded);
    assert.ok(!drawn.some((o) => o.text === METAPHOR_MISSING));
    const img = drawn.find((o) => o.op === "image");
    assert.ok(img, `${w}x${h}: the picture is drawn`);
    // Drawn whole: the source rectangle is never a crop (four numbers: x, y, w, h on the canvas).
    assert.equal(img!.args!.length, 4);
    assert.ok(drawn.some((o) => o.op === "text" && /pedido/.test(o.text ?? "")), `${w}x${h}: its line in the brand's type`);
  }
  assert.ok(placeholderLines(undefined)[1].includes("Escribí qué se ve"));
  assert.ok(placeholderLines({ ...BOXES, image: "x".repeat(400) })[1].endsWith("…"));
});

test("pieza.md and the storyboard line say what Grok draws and whether the picture is in", () => {
  const m = scene({ title: "Se te cae el pedido", metaphor: { ...BOXES, cast: ["mica"] } });
  assert.match(metaphorLine(m), /imagen de Grok: “A tall stack[^”]*” \(aparece: mica\) · falta subir la imagen/);
  assert.match(metaphorLine({ ...m, asset: metaphorAsset(0) }), /imagen subida/);
  const piece = { ...newMotionPiece("vertical"), script: { problem: "p", title: "t", durationNote: "", note: "", scenes: [m], music: { mood: "drive" as const, bpm: 110 }, tone: "warm" as const } };
  const md = pieceMarkdown(piece, timeScenes([m]));
  assert.ok(md.includes("- **Metáfora:** imagen de Grok"));
  assert.ok(md.includes("- **Cómo se mueve (clip):** The top box slowly tips over"));
  assert.deepEqual(pickMetaphor(undefined, undefined, undefined), { image: "", video: "", cast: [] });
});
