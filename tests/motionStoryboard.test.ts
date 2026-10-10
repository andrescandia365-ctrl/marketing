// "Storyboard del explicativo": one panel per scene, read from the arranged script. Its frame moment (settled, past the
// entrance), what sounds in it (the same hits the mix plays, and the bed's dip before the product or the logo), how
// it enters, its camera and label, and the Markdown export.
import assert from "node:assert/strict";
import { test } from "node:test";
import { THROUGH, blankScene, carryOf, cutPush, pushOf, sceneElements, settledAt, timeScenes, type MotionScene, type MotionScript, type MotionTone } from "../shared/motion.ts";
import { EXAMPLE_BRIEF } from "../shared/example.ts";
import { demoMotion } from "../server/demo.ts";
import { panelLines, soundsLine, storyboardMarkdown, storyboardName, storyboardPanels } from "../src/lib/motionStoryboard.ts";
import { arrangeScenes, motionBeats, soundHits } from "../src/lib/motionProject.ts";

const scene = (o: Partial<MotionScene>): MotionScene => ({ ...blankScene("screen"), ...o });
const script = (tone: MotionTone, scenes: MotionScene[]): MotionScript => ({
  problem: "El pedido llega tarde",
  title: "Pedí antes del corte",
  durationNote: "",
  note: "",
  tone,
  caption: "Un pedido que sale a tiempo.",
  music: { mood: "drive", bpm: 120 },
  scenes,
});
const opts = { music: "synth", effects: "library", voice: "generated" } as const;

const four = () => [
  scene({ id: "a", template: "hook", title: "Tercera vez que falta leche", seconds: 3, voice: "Otra vez sin leche." }),
  scene({ id: "b", template: "screen", asset: "s", title: "Pedidos", seconds: 3, entry: "through", camera: "push", cameraBy: "ai" }),
  scene({ id: "c", template: "zoom", asset: "s", title: "El corte", seconds: 3, disclosure: "concept" }),
  scene({ id: "d", template: "logo", items: ["Probalo"], seconds: 3 }),
];

test("one panel per scene, numbered, with its time range, template and camera", () => {
  const panels = storyboardPanels(script("warm", four()), opts);
  assert.deepEqual(
    panels.map((p) => [p.number, p.start, p.end, p.template]),
    [
      [1, 0, 3, "hook"],
      [2, 3, 6, "screen"],
      [3, 6, 9, "zoom"],
      [4, 9, 12, "logo"],
    ],
  );
  assert.deepEqual(panels[1].camera, { kind: "push", label: "Se acerca", byAi: true });
  assert.equal(panels[0].camera.label, "Quieta");
  assert.equal(panels[2].disclosure, "CONCEPTO");
  assert.equal(panels[0].disclosure, null);
  assert.ok(panels[0].onScreen.some((x) => x.label === "Título" && x.text === "Tercera vez que falta leche"));
  assert.ok(panels[3].onScreen.some((x) => x.text === "Probalo"));
});

test("how each scene enters: the start, the tone's cut with its seconds, a hard cut, through, continuity", () => {
  for (const tone of ["dry", "warm", "absurdist"] as const) {
    const panels = storyboardPanels(script(tone, four()), opts);
    assert.equal(panels[0].entry.kind, "start");
    assert.deepEqual([panels[1].entry.kind, panels[1].entry.seconds], ["through", THROUGH]);
    // Same screen in a row: the carry ("Continuidad"), carryOf(push) long.
    assert.deepEqual([panels[2].entry.kind, panels[2].entry.seconds], ["match", Math.round(carryOf(cutPush(tone)) * 100) / 100]);
    if (tone === "dry") assert.deepEqual(panels[3].entry, { kind: "hard", seconds: 0, label: "Corte seco" });
    else {
      assert.equal(panels[3].entry.kind, "cut");
      assert.equal(panels[3].entry.seconds, cutPush(tone));
      assert.match(panels[3].entry.label, new RegExp(cutPush(tone).toFixed(2)));
    }
  }
});

test("the frame is the settled moment: past the entrance, every element in, inside the scene", () => {
  for (const tone of ["dry", "warm", "absurdist"] as const) {
    const s = script(tone, four());
    const timed = timeScenes(s.scenes);
    storyboardPanels(s, opts).forEach((p, i) => {
      const sc = timed[i];
      const push = pushOf(sc, cutPush(tone));
      assert.ok(p.frameAt >= sc.start + Math.min(push, sc.seconds), `${tone} ${i}: after the entrance`);
      assert.ok(p.frameAt < sc.end, `${tone} ${i}: inside the scene`);
      for (const e of sceneElements(sc).filter((x) => x.lane !== "voice")) {
        const done = sc.start + settledAt(sc, e, push);
        if (done < sc.end - 0.2) assert.ok(p.frameAt >= done, `${tone} ${i} ${e.key} settled`);
      }
    });
  }
  // A scene whose typing runs to its end still gets a frame inside it.
  const long = storyboardPanels(script("warm", [scene({ id: "t", template: "type", title: "x".repeat(80), seconds: 2 })]), opts);
  assert.ok(long[0].frameAt < 2);
});

test("what sounds: the same hits the mix plays, by scene, and the dip before the logo; none when off", () => {
  const s = script("warm", four());
  const panels = storyboardPanels(s, opts);
  const hits = soundHits(s);
  const counted = panels.reduce((n, p) => n + p.sounds.reduce((m, x) => m + x.count, 0), 0);
  assert.equal(counted, hits.length);
  assert.ok(panels[3].sounds.some((x) => x.kind === "logo"));
  assert.ok(panels[3].musicDip, "the bed dips before the logo");
  assert.ok(panels[3].musicDip!.to > panels[3].musicDip!.from);
  assert.equal(panels[0].musicDip, null);
  assert.match(soundsLine(panels[3]), /música baja/);
  // No music: no dip. No effects: nothing listed.
  assert.equal(storyboardPanels(s, { ...opts, music: "none" })[3].musicDip, null);
  assert.ok(storyboardPanels(s, { ...opts, effects: "none" }).every((p) => p.sounds.length === 0));
  // Dry: no whoosh on the cuts.
  assert.ok(storyboardPanels(script("dry", four()), opts).every((p) => !p.sounds.some((x) => x.kind === "whoosh")));
});

test("the voice: said, or only a subtitle when the piece has no voice", () => {
  const s = script("warm", four());
  assert.equal(storyboardPanels(s, opts)[0].voiceHeard, true);
  const silent = storyboardPanels(s, { ...opts, voice: "none" });
  assert.equal(silent[0].voiceHeard, false);
  assert.ok(panelLines(silent[0]).some((l) => l.startsWith("Subtítulo (sin voz)")));
  assert.equal(storyboardPanels(s, opts)[1].voice, "");
});

test("the Markdown names every scene, links the sheet and keeps the caption", () => {
  const s = script("warm", four());
  const panels = storyboardPanels(s, opts);
  const sheetName = storyboardName(s.title, "vertical", "png", (t) => t.toLowerCase().replace(/\W+/g, "-"));
  assert.equal(sheetName, "ped-antes-del-corte-storyboard-9x16.png");
  const md = storyboardMarkdown(s, panels, { format: "vertical", music: "synth", sheetName });
  assert.match(md, /^# Storyboard · El pedido llega tarde/);
  assert.ok(md.includes(`![Hoja del storyboard](${sheetName})`));
  for (const p of panels) assert.ok(md.includes(`## Escena ${p.number} · `));
  assert.match(md, /Pasar a través/);
  assert.match(md, /\*\*Etiqueta:\*\* CONCEPTO/);
  assert.match(md, /la eligió la IA/);
  assert.match(md, /Un pedido que sale a tiempo\./);
});

test("the sample pieces and an old script with no tone, camera or entry build their panels", () => {
  for (const series of ["iman", "masogar"]) {
    for (const tone of ["dry", "warm", "absurdist"] as const) {
      const raw = demoMotion({ ...EXAMPLE_BRIEF, piece: "explainer", series, tone, narrator: "with" }, null);
      const beats = motionBeats(raw, "synth", null);
      const played = { ...raw, scenes: arrangeScenes(raw, beats, true, "synth", null) };
      const panels = storyboardPanels(played, opts);
      assert.equal(panels.length, played.scenes.length);
      assert.ok(panels.every((p) => p.frameAt >= p.start && p.frameAt < p.end), `${series} ${tone}`);
      assert.ok(storyboardMarkdown(played, panels, { format: "horizontal", music: "synth", sheetName: "x.png" }).includes("16:9"));
    }
  }
  const old = script("warm", [scene({ id: "a", seconds: 3 }), scene({ id: "b", seconds: 3 })]);
  delete old.tone;
  const panels = storyboardPanels(
    { ...old, scenes: old.scenes.map(({ camera: _c, entry: _e, ...x }) => x as MotionScene) },
    opts,
  );
  assert.equal(panels[1].entry.kind, "cut");
  assert.equal(panels[1].camera.kind, "hold");
});
