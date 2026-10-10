// "Avisos", "Flujo" y "Casilleros": three templates whose texts arrive one by one. Their layouts stay inside the frame
// (and the 9:16 safe zone, above the subtitle), every check reads their texts, and the boxes of "Casilleros" fill
// scene by scene from the script's order alone.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  blankScene,
  figureIssues,
  focusShare,
  itemsOf,
  normalizeMotion,
  noticeParts,
  pickTemplate,
  quietGaps,
  readingIssues,
  readingNeed,
  revealTimes,
  sceneElements,
  sequenceTimes,
  settledAt,
  slotsNote,
  slotsPlan,
  timeScenes,
  type MotionScene,
  type MotionScript,
} from "../shared/motion.ts";
import { DEFAULT_BRAND, stepDownColour } from "../shared/series.ts";
import { safeRect } from "../shared/safeZone.ts";
import { EXAMPLE_BRIEF } from "../shared/example.ts";
import { demoMotion } from "../server/demo.ts";
import { drawMotionFrame, floorOf, flowLayout, noticeLayout, partialPath, slotsLayout, type Box } from "../src/lib/motion.ts";
import { soundHits } from "../src/lib/motionProject.ts";
import { measureFacts, slotsFacts } from "../src/lib/motionQuality.ts";

const scene = (over: Partial<MotionScene>): MotionScene => ({ ...blankScene(over.template ?? "notify"), ...over });
const close = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);
const FORMATS = [
  [1080, 1920],
  [1920, 1080],
] as const;
const inside = (b: Box, r: { x: number; y: number; w: number; h: number }, slack = 0.5) =>
  b.x >= r.x - slack && b.y >= r.y - slack && b.x + b.w <= r.x + r.w + slack && b.y + b.h <= r.y + r.h + slack;
const apart = (a: Box, b: Box) => a.x + a.w <= b.x + 0.5 || b.x + b.w <= a.x + 0.5 || a.y + a.h <= b.y + 0.5 || b.y + b.h <= a.y + 0.5;

// ── The layouts ──────────────────────────────────────────────────────────────────────

test("Avisos: the cards stack down from the top, inside the safe zone and above the band's floor, never overlapping", () => {
  for (const [w, h] of FORMATS) {
    const vertical = h > w;
    const safe = safeRect(w, h);
    const bottom = vertical ? floorOf({ voice: "una línea" }, w, h, true) - Math.min(w, h) * 0.02 : h * 0.9;
    const top = vertical ? h * 0.3 : h * 0.16;
    for (let n = 1; n <= 3; n++) {
      const cards = noticeLayout(n, w, h, top, bottom);
      assert.equal(cards.length, n);
      cards.forEach((c, i) => {
        assert.ok(inside(c, safe), `${w}x${h} ${n}: card ${i} in the safe zone`);
        assert.ok(c.y >= top - 0.5 && c.y + c.h <= bottom + 0.5, `${w}x${h} ${n}: card ${i} in the band`);
        if (i) assert.ok(c.y > cards[i - 1].y && apart(c, cards[i - 1]), "each one below the last");
      });
      // 16:9: the right half, so the title keeps the left.
      if (!vertical) assert.ok(cards[0].x > w * 0.4);
    }
  }
  assert.deepEqual(noticeLayout(0, 1080, 1920, 500, 1300), []);
});

test("Flujo: each line runs from the source to its place, and every place stays in the band and the safe zone", () => {
  for (const [w, h] of FORMATS) {
    const safe = safeRect(w, h);
    const top = h > w ? h * 0.22 : h * 0.26;
    const bottom = h > w ? floorOf({ voice: "una línea" }, w, h, true) - Math.min(w, h) * 0.02 : h - Math.min(w, h) * 0.064;
    for (let n = 1; n <= 4; n++) {
      const L = flowLayout(n, w, h, top, bottom);
      assert.ok(inside(L.source, safe), `${w}x${h}: source`);
      assert.equal(L.places.length, n);
      assert.equal(L.paths.length, n);
      L.places.forEach((p, i) => {
        assert.ok(inside(p, safe), `${w}x${h} ${n}: place ${i}`);
        assert.ok(p.y + p.h <= bottom + 0.5, `${w}x${h} ${n}: place ${i} above the floor`);
        assert.ok(apart(p, L.source), "no place on the source");
        if (i) assert.ok(apart(p, L.places[i - 1]));
        const path = L.paths[i];
        const [start, end] = [path[0], path[path.length - 1]];
        // Starts on the source's edge (its right side on 16:9, its bottom on 9:16), ends at the place's left middle.
        if (w > h) close(start.x, L.source.x + L.source.w);
        else close(start.y, L.source.y + L.source.h);
        close(end.x, p.x);
        close(end.y, p.y + p.h / 2);
        // Straight segments only (elbows), so it reads as a diagram.
        path.slice(1).forEach((q, k) => assert.ok(Math.abs(q.x - path[k].x) < 1e-9 || Math.abs(q.y - path[k].y) < 1e-9));
      });
    }
  }
});

test("Casilleros: the boxes and their names fit the band, one row on 16:9, two columns on 9:16", () => {
  for (const [w, h] of FORMATS) {
    const safe = safeRect(w, h);
    const top = h > w ? h * 0.34 : h * 0.4;
    const bottom = h > w ? floorOf({ voice: "una línea" }, w, h, true) - Math.min(w, h) * 0.02 : h - Math.min(w, h) * 0.05;
    for (let n = 1; n <= 5; n++) {
      const { boxes, label } = slotsLayout(n, w, h, top, bottom);
      assert.equal(boxes.length, n);
      boxes.forEach((b, i) => {
        const withName = { ...b, h: b.h + label };
        assert.ok(inside(withName, safe), `${w}x${h} ${n}: box ${i}`);
        assert.ok(b.y >= top - 0.5 && withName.y + withName.h <= bottom + 0.5, `${w}x${h} ${n}: box ${i} in the band`);
        boxes.slice(0, i).forEach((o) => assert.ok(apart(withName, { ...o, h: o.h + label }), `${w}x${h} ${n}: ${i} clear`));
      });
      if (w > h) assert.ok(boxes.every((b) => b.y === boxes[0].y), "one row");
      else assert.ok(new Set(boxes.map((b) => b.x)).size === Math.min(2, n), "two columns");
    }
  }
});

test("a line draws itself in by length", () => {
  const pts = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 30 },
  ];
  assert.deepEqual(partialPath(pts, 0), [{ x: 0, y: 0 }]);
  assert.deepEqual(partialPath(pts, 1), pts);
  assert.deepEqual(partialPath(pts, 0.25), [{ x: 0, y: 0 }, { x: 10, y: 0 }]);
  assert.deepEqual(partialPath(pts, 0.5), [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]);
  assert.deepEqual(partialPath(pts, 7), pts);
});

// ── The script ───────────────────────────────────────────────────────────────────────

test("a notification splits into title and body at '|' or ': ', never inside a time", () => {
  assert.deepEqual(noticeParts("Proveedor | Cierra el pedido hoy"), { title: "Proveedor", body: "Cierra el pedido hoy" });
  assert.deepEqual(noticeParts("Stock: Quedan pocas"), { title: "Stock", body: "Quedan pocas" });
  assert.deepEqual(noticeParts("Abre a las 6:00"), { title: "Abre a las 6:00", body: "" });
  assert.deepEqual(noticeParts("Corte 18:00 | Último pedido"), { title: "Corte 18:00", body: "Último pedido" });
});

test("the lists drop empty lines and stop at what the template draws", () => {
  assert.deepEqual(itemsOf({ template: "notify", items: ["a", " ", "b", "c", "d"] }), ["a", "b", "c"]);
  assert.deepEqual(itemsOf({ template: "flow", items: ["a", "b", "", "c", "d", "e"] }), ["a", "b", "c", "d"]);
  assert.deepEqual(itemsOf({ template: "slots", items: ["a", "b", "c", "d", "e", "f"] }), ["a", "b", "c", "d", "e"]);
  // Others keep their items as they are (callouts may have an empty label in place).
  assert.deepEqual(itemsOf({ template: "callouts", items: ["a", "", "b"] }), ["a", "", "b"]);
});

test("a sequence leaves the last text its reading time, half a second to 1.1 s apart", () => {
  const t = sequenceTimes(3, 5, 1.2);
  assert.equal(t[0], 0.6);
  assert.ok(5 - (t[2] + 0.5) >= 1.2 - 1e-9);
  assert.ok(t.slice(1).every((x, i) => x - t[i] >= 0.5 - 1e-9 && x - t[i] <= 1.1 + 1e-9));
  // A long scene never spreads them further than 1.1 s; a short one never closer than 0.5 s.
  assert.deepEqual(sequenceTimes(3, 8, 0.8), [0.6, 1.7, 2.8]);
  assert.deepEqual(sequenceTimes(3, 2, 2), [0.6, 1.1, 1.6]);
  assert.deepEqual(sequenceTimes(0, 4, 1), []);
});

test("Casilleros: the fill count comes from the script's order", () => {
  const named = scene({ template: "slots", items: ["Qué queda", "Qué falta", "Cuándo"] });
  const fill = () => scene({ template: "slots", items: [] });
  const other = scene({ template: "screen" });
  const list = [other, named, other, fill(), other, fill(), fill(), fill()];
  assert.equal(slotsPlan(list, 0), null);
  assert.deepEqual(slotsPlan(list, 1), { names: ["Qué queda", "Qué falta", "Cuándo"], filled: 0, fills: null, naming: true });
  assert.deepEqual(slotsPlan(list, 3), { names: named.items, filled: 0, fills: 0, naming: false });
  assert.deepEqual(slotsPlan(list, 5), { names: named.items, filled: 1, fills: 1, naming: false });
  assert.deepEqual(slotsPlan(list, 6), { names: named.items, filled: 2, fills: 2, naming: false });
  // Every box already full: nothing left to fill.
  assert.deepEqual(slotsPlan(list, 7), { names: named.items, filled: 3, fills: null, naming: false });
  // A second scene with names starts a new row.
  const again = [named, fill(), scene({ template: "slots", items: ["Uno", "Dos"] }), fill()];
  assert.deepEqual(slotsPlan(again, 3), { names: ["Uno", "Dos"], filled: 0, fills: 0, naming: false });
  // A filling scene moved before the one that names the boxes fills the first box of that row.
  const early = [fill(), named, fill()];
  assert.deepEqual(slotsPlan(early, 0), { names: named.items, filled: 0, fills: 0, naming: false });
  assert.deepEqual(slotsPlan(early, 2), { names: named.items, filled: 0, fills: 0, naming: false });
  // No names anywhere: an empty row, nothing to fill.
  assert.deepEqual(slotsPlan([fill()], 0), { names: [], filled: 0, fills: null, naming: false });
  // timeScenes carries it, and a stale one is worked out again.
  const timed = timeScenes(list);
  assert.deepEqual(timed[5].slots, slotsPlan(list, 5));
  assert.equal(timed[0].slots, undefined);
  const moved = timeScenes([timed[5], timed[1]]);
  assert.deepEqual(moved[0].slots, { names: named.items, filled: 0, fills: 0, naming: false });
});

test("the studio says what each slots scene does", () => {
  const named = scene({ template: "slots", items: ["Qué queda", "Qué falta"] });
  const fill = scene({ template: "slots" });
  const t = timeScenes([named, fill, { ...fill, id: "x" }, { ...fill, id: "y" }]);
  assert.match(slotsNote(t[0].slots), /Nombra 2 casilleros/);
  assert.match(slotsNote(t[1].slots), /Llena «Qué queda» \(1 de 2\)/);
  assert.equal(slotsNote(t[2].slots), "Llena «Qué falta» (2 de 2). El anterior ya aparece lleno.");
  assert.match(slotsNote(t[3].slots), /todos llenos/);
  assert.match(slotsNote(timeScenes([fill])[0].slots), /Todavía no hay casilleros/);
});

test("the writer's names map to the templates, and only the first slots scene keeps its names", () => {
  assert.equal(pickTemplate("notifications"), "notify");
  assert.equal(pickTemplate("Avisos"), "notify");
  assert.equal(pickTemplate("fan-out"), "flow");
  assert.equal(pickTemplate("flujo"), "flow");
  assert.equal(pickTemplate("casilleros"), "slots");
  assert.equal(pickTemplate("slots"), "slots");
  assert.equal(pickTemplate("beforeAfter"), "beforeAfter");
  assert.equal(pickTemplate("callouts"), "callouts");
  assert.equal(pickTemplate("nonsense"), "screen");
  const wire = (template: string, items: string[]) => ({ template, seconds: 3, title: "t", text: "", items, asset: "", assetB: "", gesture: "", focusX: 0.5, focusY: 0.5, zoom: 2, voice: "", emotion: "" });
  const script = normalizeMotion({
    problem: "",
    title: "",
    durationNote: "",
    note: "",
    caption: "",
    music: { mood: "drive", bpm: 110 },
    scenes: [wire("hook", []), wire("slots", ["Uno", "Dos"]), wire("screen", []), wire("slots", ["Uno", "Dos"]), wire("Casilleros", ["Uno"])],
  });
  assert.deepEqual(
    script.scenes.map((s) => [s.template, s.items]),
    [
      ["hook", []],
      ["slots", ["Uno", "Dos"]],
      ["screen", []],
      ["slots", []],
      ["slots", []],
    ],
  );
  // The writer's cameras hold on them: words to read.
  assert.ok(script.scenes.filter((s) => s.template === "slots").every((s) => s.camera === "hold"));
});

// ── The checks ───────────────────────────────────────────────────────────────────────

test("the timeline, the reading check and the 2-to-4 s check see each arriving text", () => {
  const notify = scene({ template: "notify", seconds: 5, title: "Lunes", items: ["Proveedor | Cierra el pedido hoy", "", "Stock | Quedan pocas yerbas"] });
  const els = sceneElements(notify);
  assert.deepEqual(
    els.map((e) => e.key),
    ["title", "item0", "item1"],
  );
  assert.equal(els[1].lane, "items");
  assert.equal(els[1].label, "Aviso 1: Proveedor");
  // The last card is read whole (title and body).
  const last = els[2];
  assert.ok(notify.seconds - settledAt(notify, last) >= readingNeed("Stock Quedan pocas yerbas") - 1e-9);
  assert.deepEqual(readingIssues([notify], 0.38), []);
  // Too short: the last card is flagged with its whole text.
  const short = { ...notify, seconds: 2.5 };
  const issue = readingIssues([short], 0.38).find((r) => r.key === "item1");
  assert.ok(issue);
  assert.equal(issue.text, "Stock Quedan pocas yerbas");
  // Each arrival is something new on screen.
  assert.deepEqual(revealTimes(notify), [0, ...els.slice(1).map((e) => e.at)]);
  // A hand-set time moves it.
  const moved = { ...notify, tweaks: { item1: { at: 2 } } };
  assert.equal(sceneElements(moved).find((e) => e.key === "item1")!.at, 2);

  const flow = scene({ template: "flow", seconds: 4.5, title: "Un pedido", text: "", items: ["Proveedor", "Stock", "Caja"] });
  assert.deepEqual(
    sceneElements(flow).map((e) => [e.key, e.lane]),
    [
      ["title", "title"],
      ["item0", "items"],
      ["item1", "items"],
      ["item2", "items"],
    ],
  );
  assert.deepEqual(readingIssues([flow], 0.38), []);
  // A picture alone still makes a source.
  assert.deepEqual(sceneElements(scene({ template: "flow", asset: "p", items: ["A"] })).map((e) => e.key), ["title", "item0"]);

  const named = scene({ template: "slots", seconds: 3.5, title: "Antes del corte", items: ["Qué queda", "Qué falta"] });
  const fill = scene({ template: "slots", seconds: 3, title: "Ya sabés qué queda" });
  const full = scene({ template: "slots", seconds: 3, title: "Otra vez" });
  const timed = timeScenes([named, fill, { ...fill, id: "f2" }, full]);
  assert.deepEqual(sceneElements(timed[0]).map((e) => e.key), ["title", "item0", "item1"]);
  assert.deepEqual(sceneElements(timed[1]).map((e) => e.key), ["title", "media", "fill"]);
  assert.equal(sceneElements(timed[1]).find((e) => e.key === "fill")!.label, "Se llena: Qué queda");
  // Nothing left to fill: no fill, and nothing pretends to happen.
  assert.deepEqual(sceneElements(timed[3]).map((e) => e.key), ["title", "media"]);
  // An untimed scene with no names is a filling scene.
  assert.deepEqual(sceneElements(fill).map((e) => e.key), ["title", "media", "fill"]);
  assert.deepEqual(quietGaps(timed, 0.38), []);
  // Foco de a uno: the earlier text steps down once the next one is in, in all three.
  for (const s of [notify, flow, timed[0]]) {
    assert.equal(focusShare(s, "item0", s.seconds - 0.01), 1, s.template);
    const n = itemsOf(s).length;
    assert.equal(focusShare(s, `item${n - 1}`, s.seconds - 0.01), 0, s.template);
  }
});

test("numbers on these templates need a source like any other text", () => {
  const scenes = [
    scene({ template: "notify", items: ["Proveedor | Corta a las 18", "Stock | Quedan 7"] }),
    scene({ template: "flow", title: "40 pedidos", items: ["Proveedor", "3 locales"] }),
    scene({ template: "slots", items: ["Qué queda", "Las 2 cuentas [VERIFY]"] }),
  ];
  const found = figureIssues(scenes, "El proveedor corta a las 18.").map((i) => `${i.index}:${i.key}:${i.figure}`);
  assert.deepEqual(found.sort(), ["0:item1:7", "1:item1:3", "1:title:40", "2:item1:2", "2:item1:[VERIFY]"].sort());
});

test("sounds: the first and last arrival of each list, and a tap on the fill even when dry", () => {
  const scenes = [
    scene({ id: "n", template: "notify", seconds: 5, items: ["A | uno", "B | dos", "C | tres"] }),
    scene({ id: "f", template: "flow", seconds: 4.5, title: "Origen", items: ["Uno", "Dos", "Tres"] }),
    scene({ id: "s1", template: "slots", seconds: 3.5, items: ["Uno", "Dos"] }),
    scene({ id: "s2", template: "slots", seconds: 3 }),
  ];
  for (const tone of ["dry", "warm", "absurdist"] as const) {
    const script: MotionScript = { problem: "", title: "", durationNote: "", note: "", scenes, music: { mood: "drive", bpm: 110 }, tone };
    const hits = soundHits(script);
    const timed = timeScenes(scenes);
    const within = (s: (typeof timed)[number]) => hits.filter((x) => x.at >= s.start + 0.01 && x.at < s.end);
    for (const s of timed.slice(0, 3)) {
      const pops = within(s).filter((x) => x.kind === "pop");
      assert.equal(pops.length, tone === "dry" ? 0 : 2, `${tone} ${s.template}`);
    }
    const fillAt = timed[3].start + sceneElements(timed[3]).find((e) => e.key === "fill")!.at;
    assert.ok(hits.some((x) => x.kind === "tap" && Math.abs(x.at - fillAt) < 1e-9), tone);
  }
});

test("the reviewer is told which scene names the boxes and which fills which", () => {
  const scenes = [scene({ template: "hook", title: "Hola" }), scene({ template: "slots", items: ["Qué queda", "Qué falta"] }), scene({ template: "slots" })];
  const line = slotsFacts(timeScenes(scenes));
  assert.ok(line);
  assert.match(line, /scene 2 names 2 empty boxes \("Qué queda", "Qué falta"\)/);
  assert.match(line, /scene 3 fills box 1 \("Qué queda"\), 0 already filled/);
  assert.match(line, /At the end 1 of 2 are filled/);
  const script: MotionScript = { problem: "", title: "", durationNote: "", note: "", scenes, music: { mood: "drive", bpm: 110 }, tone: "warm" };
  assert.ok(measureFacts(script, [], "none", {}, []).includes(line));
  assert.equal(slotsFacts(timeScenes([scenes[0]])), null);
});

test("the IMAN sample opens the loop and fills both boxes before the logo", () => {
  for (const tone of ["dry", "warm", "absurdist"] as const) {
    const script = demoMotion({ ...EXAMPLE_BRIEF, piece: "explainer", series: "iman", tone, narrator: "with" }, null);
    const rows = timeScenes(script.scenes).filter((s) => s.slots);
    assert.equal(rows.length, 3, tone);
    assert.ok(rows[0].slots!.naming);
    assert.deepEqual(
      rows.slice(1).map((s) => s.slots!.fills),
      [0, 1],
    );
    assert.ok(rows.at(-1)!.index < script.scenes.length - 1, "before the logo");
  }
});

// ── The drawing ──────────────────────────────────────────────────────────────────────

// A stand-in 2D context that records fills, rectangles and text with their colour, and keeps the transform's offset.
function recorder() {
  const ops: { op: "fill" | "rect" | "text"; style: string; text?: string }[] = [];
  const own: Record<string, unknown> = {
    fillStyle: "#000000",
    globalAlpha: 1,
    fill() {
      ops.push({ op: "fill", style: String(own.fillStyle) });
    },
    fillRect() {
      ops.push({ op: "rect", style: String(own.fillStyle) });
    },
    fillText(t: string) {
      ops.push({ op: "text", style: String(own.fillStyle), text: t });
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

test("the three draw their texts in the brand's colours, step the earlier ones down, and are pure functions of t", () => {
  const { text, bg, accent } = DEFAULT_BRAND;
  const down = stepDownColour(text, bg, 1);
  const scenes = [
    scene({ id: "n", template: "notify", seconds: 5, title: "Lunes", items: ["Proveedor | Cierra hoy", "Stock | Quedan pocas"], voice: "Llegan los avisos." }),
    scene({ id: "f", template: "flow", seconds: 4.5, title: "Un pedido", items: ["Proveedor", "Stock", "Caja"], voice: "Un pedido va a tres lados." }),
    scene({ id: "s1", template: "slots", seconds: 3.5, title: "Antes del corte", items: ["Qué queda", "Qué falta"] }),
    scene({ id: "s2", template: "slots", seconds: 3, title: "Ya sabés qué queda" }),
    scene({ id: "s3", template: "slots", seconds: 3, title: "Y lo que falta" }),
  ];
  const timed = timeScenes(scenes);
  for (const tone of ["dry", "warm", "absurdist"] as const) {
    const script: MotionScript = { problem: "", title: "", durationNote: "", note: "", scenes, music: { mood: "drive", bpm: 110 }, tone };
    const world = { brand: DEFAULT_BRAND, assets: {}, logo: null, beats: [], seed: 7, disclosure: "Algunas imágenes están hechas con IA" };
    for (const [w, h] of FORMATS) {
      const where = `${tone} ${w}x${h}`;
      const paint = (t: number) => {
        const r = recorder();
        const boxes: { key: string; box: Box }[] = [];
        drawMotionFrame(r.ctx, w, h, t, script, world, (_id, key, box) => boxes.push({ key, box }));
        return { ops: r.ops, boxes };
      };
      const colourOf = (ops: ReturnType<typeof paint>["ops"], words: string) => ops.find((o) => o.op === "text" && o.text === words)?.style;
      // Avisos: both cards drawn, the first stepped down at the end.
      const n = paint(timed[0].end - 0.05);
      assert.equal(colourOf(n.ops, "Proveedor"), down, where);
      assert.equal(colourOf(n.ops, "Stock"), text, where);
      // Flujo: the source in the background colour on the accent, the places in turn.
      const f = paint(timed[1].end - 0.05);
      assert.equal(colourOf(f.ops, "Un pedido"), bg, where);
      assert.equal(colourOf(f.ops, "Proveedor"), down, where);
      assert.equal(colourOf(f.ops, "Caja"), text, where);
      // Casilleros: named empty, then the first box filled from the cut in the third scene.
      const s1 = paint(timed[2].end - 0.05);
      assert.ok(colourOf(s1.ops, "Qué falta"), where);
      const fills = (t: number) => paint(t).ops.filter((o) => o.op === "rect" && o.style === accent).length;
      const startOf3 = timed[4].start + 0.45;
      assert.ok(fills(startOf3) >= 1, `${where}: the box filled before is already filled`);
      assert.ok(fills(timed[4].end - 0.05) > fills(startOf3), `${where}: and the next one fills`);
      // Settled boxes stay in the 9:16 safe zone and above the subtitle band.
      if (h > w) {
        const safe = safeRect(w, h);
        for (const s of timed) {
          const at = paint(s.end - 0.05);
          for (const { key, box } of at.boxes) {
            assert.ok(inside(box, safe, 2), `${where} ${s.template} ${key}`);
            if (key !== "media") assert.ok(box.y + box.h <= floorOf(s, w, h, true) + 2, `${where} ${s.template} ${key} above the floor`);
          }
        }
      }
      // Pure: the same t, the same frame.
      for (const t of [0.7, 2.2, 6.1, 9.4, 12.3]) assert.deepEqual(paint(t), paint(t), `${where} at ${t}`);
    }
  }
});
