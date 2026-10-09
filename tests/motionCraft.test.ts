// What came from the 20 motion-design repos (IDEAS.md §33): the stat counter, the platform safe zone, numbers with a
// source, overlap and contrast measured, the Contradicción template, the score's room before big hits, and the rule
// that drawing code never reads a clock.
import assert from "node:assert/strict";
import { test } from "node:test";
import { STAT_COUNT, blankScene, figureIssues, normalizeMotion, readingIssues, figuresIn, sceneElements, settledAt, statCountText, type MotionScene } from "../shared/motion.ts";
import { DEFAULT_BRAND, brandContrast, contrastRatio } from "../shared/series.ts";
import { BUTTONS_FROM, OVERLAP, PHONE_SAFE, isPhoneFrame, overlapShare, safeBands, safeRect } from "../shared/safeZone.ts";

const stat = (title: string, text = "", seconds = 4): MotionScene => ({ ...blankScene("stat"), title, text, seconds });

test("the stat counter settles on the title exactly as written", () => {
  for (const title of ["1.500 pedidos", "2,5 horas", "40% menos", "+3 sucursales", "US$ 1.200", "1.234,5 kg", "12,000 users", "3 minutos"]) {
    assert.equal(statCountText(title, 1), title);
  }
  // Midway it keeps the title's own marks and decimals.
  assert.equal(statCountText("1.500 pedidos", 0.5), "750 pedidos");
  assert.equal(statCountText("12.000 pedidos", 0.5), "6.000 pedidos");
  assert.equal(statCountText("2,5 horas", 0.5), "1,3 horas");
  assert.equal(statCountText("1.234,5 kg", 0.5), "617,3 kg");
  assert.equal(statCountText("40% menos", 0.5), "20% menos");
  assert.equal(statCountText("US$ 1.200", 0), "US$ 0");
  // Not a quantity, or no number at all: shown as written all the way.
  assert.equal(statCountText("24/7", 0.3), "24/7");
  assert.equal(statCountText("6:00 de la mañana", 0.3), "6:00 de la mañana");
  assert.equal(statCountText("Cero errores", 0.3), "Cero errores");
});

test("the stat's supporting line enters after the number stops counting", () => {
  const s = stat("1.500 pedidos", "por semana, sin planillas");
  const title = sceneElements(s).find((e) => e.key === "title")!;
  const text = sceneElements(s).find((e) => e.key === "text")!;
  assert.ok(text.at >= settledAt(s, title));
  assert.ok(Math.abs(settledAt(s, title) - (title.at + STAT_COUNT)) < 1e-9);
  // A hand-timed number moves its line with it.
  const late = { ...s, tweaks: { title: { at: 0.5 } } };
  assert.ok(sceneElements(late).find((e) => e.key === "text")!.at >= 0.5 + STAT_COUNT);
});

test("the safe zone is only for 9:16 and leaves the platform's bars out", () => {
  assert.equal(isPhoneFrame(1080, 1920), true);
  for (const [w, h] of [[1920, 1080], [1080, 1080], [1080, 1350]]) {
    assert.equal(isPhoneFrame(w, h), false);
    assert.deepEqual(safeRect(w, h), { x: 0, y: 0, w, h });
    assert.deepEqual(safeBands({ x: 0, y: 0, w, h }, w, h), []);
  }
  const s = safeRect(1080, 1920);
  assert.equal(s.y, 1920 * PHONE_SAFE.top);
  assert.equal(s.y + s.h, 1920 * (1 - PHONE_SAFE.bottom));
  assert.equal(s.x + s.w, 1080 * (1 - PHONE_SAFE.right));
  // Inside, or touching the edge by a pixel: nothing.
  assert.deepEqual(safeBands({ x: s.x, y: s.y - 1, w: s.w, h: s.h + 2 }, 1080, 1920), []);
  // A title under the top bar, a label under the caption.
  assert.deepEqual(safeBands({ x: 100, y: 120, w: 600, h: 120 }, 1080, 1920), ["top"]);
  assert.deepEqual(safeBands({ x: 100, y: 1600, w: 400, h: 60 }, 1080, 1920), ["bottom"]);
  // The button column only covers the lower part of the right edge.
  assert.deepEqual(safeBands({ x: 600, y: 250, w: 450, h: 100 }, 1080, 1920), []);
  assert.deepEqual(safeBands({ x: 600, y: 1920 * BUTTONS_FROM, w: 450, h: 100 }, 1080, 1920), ["right"]);
});

test("overlap is measured on the smaller box", () => {
  const title = { x: 0, y: 0, w: 800, h: 100 };
  assert.equal(overlapShare(title, { x: 0, y: 100, w: 800, h: 50 }), 0);
  assert.equal(overlapShare(title, { x: 700, y: 50, w: 100, h: 100 }), 0.5);
  assert.ok(overlapShare(title, { x: 0, y: 95, w: 800, h: 50 }) < OVERLAP);
});

test("numbers are read one way, whatever their marks", () => {
  assert.deepEqual(figuresIn("1.500 pedidos y 1500 más"), ["1500", "1500"]);
  assert.deepEqual(figuresIn("2,5 horas, 40% menos"), ["2.5", "40"]);
  assert.deepEqual(figuresIn("a las 6:00 y 12,000 users"), ["6:00", "12000"]);
  assert.deepEqual(figuresIn("sin números"), []);
});

test("a number on screen needs a source, and [VERIFY] never ships", () => {
  const scenes: MotionScene[] = [
    { ...blankScene("stat"), id: "a", title: "1.500 pedidos", text: "por semana" },
    { ...blankScene("screen"), id: "b", title: "Pedido en 3 toques", voice: "Ahorra 2 horas [VERIFY]" },
  ];
  const sources = "Arma el pedido en 3 toques\nUsado por 1500 pedidos semanales";
  const issues = figureIssues(scenes, sources);
  assert.deepEqual(
    issues.map((i) => [i.sceneId, i.key, i.figure, i.verify]),
    [
      ["b", "voice", "[VERIFY]", true],
      ["b", "voice", "2", false],
    ],
  );
  assert.equal(figureIssues(scenes, "").filter((i) => !i.verify).length, 3);
});

test("brand contrast is measured (WCAG)", () => {
  assert.equal(Math.round(contrastRatio("#000000", "#ffffff")), 21);
  assert.equal(contrastRatio("#777777", "#777777"), 1);
  assert.deepEqual(brandContrast(DEFAULT_BRAND).problems, []);
  const weak = brandContrast({ bg: "#ffffff", text: "#999999", accent: "#ffe066" });
  assert.equal(weak.problems.length, 2);
  assert.ok(weak.text < 4.5 && weak.accent < 3);
});

test("Contradicción: what is said, then what happens, then the strike", () => {
  const s: MotionScene = { ...blankScene("contradiction"), title: "El pedido de los martes", items: ["La planilla dice: 40 cajas", "La góndola tiene 3"], seconds: 4 };
  const els = sceneElements(s);
  const at = (key: string) => els.find((e) => e.key === key)!.at;
  assert.deepEqual(els.map((e) => e.key), ["title", "item0", "item1", "strike"]);
  // The first is read before the second arrives, and struck once the second is in.
  assert.ok(at("item1") - settledAt(s, els.find((e) => e.key === "item0")!) >= 0.6);
  assert.ok(at("strike") >= settledAt(s, els.find((e) => e.key === "item1")!));
  assert.equal(readingIssues([s], 0).length, 0);
  // Only one statement: nothing to strike.
  assert.deepEqual(sceneElements({ ...s, items: ["La planilla dice: 40 cajas"] }).map((e) => e.key), ["title", "item0"]);
  // The writer's name for it comes back as the template.
  const wire = { problem: "", title: "", durationNote: "", note: "", caption: "", music: { mood: "drive", bpm: 110 }, scenes: [{ ...s, template: "contradiction", gesture: "", move: "" }] };
  assert.equal(normalizeMotion(wire).scenes[0].template, "contradiction");
});
