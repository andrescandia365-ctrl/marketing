// What came from the 20 motion-design repos (IDEAS.md idea 62): the stat counter, the platform safe zone, numbers with a
// source, overlap and contrast measured, the Contradicción template, the score's room before big hits, and the rule
// that drawing code never reads a clock.
import assert from "node:assert/strict";
import { test } from "node:test";
import { STAT_COUNT, blankScene, figureIssues, normalizeMotion, readingIssues, figuresIn, sceneElements, settledAt, statCountText, type MotionScene } from "../shared/motion.ts";
import { checkStreams, probeStreams } from "../scripts/renderCheck.mjs";
import { ROOM_DIP, levelGain, median, roomWindows, sampleShape } from "../shared/sound.ts";
import { DEFAULT_BRAND, brandContrast, contrastRatio } from "../shared/series.ts";
import { BUTTONS_FROM, OVERLAP, PHONE_SAFE, clampDelta, isPhoneFrame, overlapShare, safeBands, safeRect } from "../shared/safeZone.ts";

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

test("a fallen word stays inside the room it is given", () => {
  assert.equal(clampDelta(10, 200, 0, 100, 5), -10, "a span wider than the room pins to the start");
  assert.equal(clampDelta(40, 20, 0, 100, 5), 5, "a move that stays inside is left as it is");
  assert.equal(clampDelta(40, 20, 0, 100, 50), 40, "the far edge stops at the end of the room");
  assert.equal(clampDelta(40, 20, 0, 100, -50), -40, "the near edge stops at the start of the room");
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

test("a library effect lands on its attack, at its kind's level", () => {
  const rate = 48000;
  const data = new Float32Array(rate / 4);
  // 40 ms of near-silence, then the hit.
  for (let i = 0; i < data.length; i++) data[i] = i < rate * 0.04 ? 0.001 : 0.5 * Math.exp(-(i - rate * 0.04) / 800);
  const { onset, peak } = sampleShape(data, rate);
  assert.ok(Math.abs(onset - 0.038) < 0.001);
  assert.equal(peak, 0.5);
  assert.deepEqual(sampleShape(new Float32Array(10), rate), { onset: 0, peak: 0 });
  assert.equal(median([0.2, 0.6, 0.4]), 0.4);
  assert.equal(levelGain(0.2, 0.4), 2);
  assert.equal(levelGain(0.01, 0.9), 4);
  assert.equal(levelGain(0, 0.5), 1);
});

test("the music makes room before the product and the logo", () => {
  const hits = [
    { at: 0.02, kind: "logo" },
    { at: 3, kind: "whoosh" },
    { at: 3.05, kind: "reveal" },
    { at: 6, kind: "pop" },
    { at: 9, kind: "logo" },
    { at: 9.1, kind: "reveal" },
  ];
  assert.deepEqual(roomWindows(hits, 0.25), [
    { from: 2.8, to: 3.05 },
    { from: 8.75, to: 9.1 },
  ]);
  assert.ok(ROOM_DIP > 0 && ROOM_DIP < 0.5);
});

test("the finished MP4 is checked against what was painted", () => {
  const want = { frames: 300, fps: 30, width: 1080, height: 1920, sound: true };
  const good = [
    { codec_type: "video", nb_read_packets: "300", width: 1080, height: 1920, pix_fmt: "yuv420p", duration: "10.000000" },
    { codec_type: "audio", nb_read_packets: "470", duration: "10.021333" },
  ];
  assert.deepEqual(checkStreams(good, want), []);
  const bad = [{ codec_type: "video", nb_read_packets: "297", width: 1080, height: 1920, pix_fmt: "yuv444p", duration: "9.9" }];
  assert.deepEqual(checkStreams(bad, want), ["tiene 297 cuadros y se pintaron 300", "el color está en yuv444p, no en yuv420p", "no tiene sonido"]);
  const short = [good[0], { codec_type: "audio", nb_read_packets: "400", duration: "8.5" }];
  assert.equal(checkStreams(short, want).length, 1);
  // No ffprobe, or output it cannot read: no verdict, the render goes on.
  assert.equal(probeStreams("x.mp4", () => ({ status: 1, stdout: "" })), null);
  assert.equal(probeStreams("x.mp4", () => ({ status: 0, stdout: "not json" })), null);
});

test("review fixes: decimals with a leading zero, names with digits, every [VERIFY] form", () => {
  assert.equal(statCountText("0,125 segundos", 0.5), "0,063 segundos");
  assert.equal(statCountText("0,125 segundos", 1), "0,125 segundos");
  assert.deepEqual(figuresIn("0,125 y 0.005"), ["0.125", "0.005"]);
  assert.deepEqual(figuresIn("abre 06:00, formato mp3, venta B2B"), ["6:00"]);
  const scene = (o: Partial<MotionScene>): MotionScene => ({ ...blankScene("screen"), id: "x", ...o });
  for (const mark of ["[VERIFY]", "[VERIFY: 3 horas]", "[verificar]", "[A VERIFICAR]"]) {
    assert.equal(figureIssues([scene({ title: `Ahorra tiempo ${mark}` })], "").filter((i) => i.verify).length, 1, mark);
  }
  // A time on the hour and the bare hour are the same figure, both ways.
  assert.equal(figureIssues([scene({ title: "Corte a las 18:00" })], "El proveedor corta a las 18").length, 0);
  assert.equal(figureIssues([scene({ title: "Corte a las 18" })], "Horario de corte: 18:00").length, 0);
  // Fields the template never draws are not on screen: no check.
  assert.equal(figureIssues([scene({ template: "zoom", text: "99 pedidos", items: ["12"] })], "").length, 0);
  assert.equal(figureIssues([scene({ template: "product", items: ["$19.990", "3 cuotas"] })], "").length, 1);
});

test("the strike follows the second statement when it is moved", () => {
  const s: MotionScene = { ...blankScene("contradiction"), items: ["La planilla dice: alcanza", "La góndola está vacía"], seconds: 5, tweaks: { item1: { at: 3 } } };
  const els = sceneElements(s);
  assert.ok(els.find((e) => e.key === "strike")!.at >= 3);
});
