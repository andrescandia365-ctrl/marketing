// "Nota del director" for an explainer: the writer returns the whole script, each scene naming the current scene it
// comes from; mergeNote keeps what the note did not touch (ids, hand tweaks, cameras the person picked, voices).
import assert from "node:assert/strict";
import { test } from "node:test";
import type { z } from "zod";
import { MotionNoteSchema, blankScene, normalizeMotion, pickCamera, type MotionScene, type MotionScript } from "../shared/motion.ts";
import { MotionScriptInput, generatedVoice, mergeNote, noteSummary, noteView, type NoteLink } from "../shared/motionNote.ts";
import { checkErrorText } from "../shared/errors.ts";

type WireScene = z.infer<typeof MotionNoteSchema>["scenes"][number];

const scene = (o: Partial<MotionScene>): MotionScene => ({ ...blankScene("screen"), ...o });
const script = (scenes: MotionScene[]): MotionScript => ({
  problem: "Se vence la leche",
  title: "La leche",
  durationNote: "",
  note: "",
  caption: "Texto",
  scenes,
  music: { mood: "drive", bpm: 110 },
  tone: "warm",
});

// What a writer that echoes a scene sends back (the wire), with optional changes.
function echo(s: MotionScene, patch: Partial<WireScene> = {}): WireScene {
  return {
    from: s.id,
    template: s.template,
    seconds: s.seconds,
    title: s.title,
    text: s.text,
    items: s.items,
    asset: s.asset,
    assetB: s.assetB,
    gesture: s.gesture ?? "",
    move: s.move ?? "",
    entry: s.entry ?? "cut",
    reveal: s.reveal ?? "",
    camera: s.camera ?? "hold",
    focusX: s.focusX,
    focusY: s.focusY,
    zoom: s.zoom,
    voice: s.voice,
    emotion: s.emotion,
    disclosure: s.disclosure ?? "real",
    beyondToday: "",
    ...patch,
  };
}

// The server's path: normalize the wire (fresh ids), keep each scene's `from` and literal camera, merge.
function revise(current: MotionScript, scenes: WireScene[], top: Partial<z.infer<typeof MotionNoteSchema>> = {}) {
  const wire: z.infer<typeof MotionNoteSchema> = {
    problem: current.problem,
    title: current.title,
    durationNote: "",
    note: "",
    caption: current.caption ?? "",
    music: { mood: current.music.mood, bpm: current.music.bpm },
    ...top,
    scenes,
  };
  const links: NoteLink[] = wire.scenes.map((s) => ({ from: s.from, camera: pickCamera(s.camera) }));
  const revised = normalizeMotion({ ...wire, scenes: wire.scenes.map(({ from: _f, ...s }) => s) }, current.tone);
  return mergeNote(current, { ...revised, tone: current.tone }, links);
}

const hook = scene({ id: "a", template: "hook", title: "¿Otra vez vencida?", voice: "Otra vez la leche vencida.", emotion: "harto", tweaks: { title: { at: 0.2, v: { dy: 0.05 } } } });
const steps = scene({
  id: "b",
  template: "steps",
  title: "Así se arregla",
  items: ["Cargás", "Avisa", "Pedís"],
  voice: "Cargás, te avisa y pedís.",
  tweaks: { item2: { v: { dx: 0.1 } }, title: { h: { scale: 1.2 } } },
});
const product = scene({ id: "c", template: "product", title: "Planner", camera: "pull", asset: "producto", voice: "Y listo." });
const base = script([hook, steps, product]);

test("an echoed script comes back as it was: same scenes, same tweaks, nothing reported", () => {
  const m = revise(base, base.scenes.map((s) => echo(s)));
  assert.deepEqual(m.script.scenes.map((s) => s.id), ["a", "b", "c"]);
  m.script.scenes.forEach((s, i) => assert.equal(s, base.scenes[i]));
  assert.deepEqual([m.changed, m.added, m.removed, m.voiceChanged], [[], [], [], []]);
  assert.equal(noteSummary(m), "La nota no cambió ninguna escena.");
});

test("a changed voice line keeps the scene's id and tweaks and is reported; the other scenes stay untouched", () => {
  const m = revise(base, [echo(hook), echo(steps, { voice: "Cargás y listo." }), echo(product)]);
  const b = m.script.scenes[1];
  assert.equal(b.id, "b");
  assert.equal(b.voice, "Cargás y listo.");
  assert.deepEqual(b.tweaks, steps.tweaks);
  assert.equal(m.script.scenes[0], hook);
  assert.equal(m.script.scenes[2], product);
  assert.deepEqual(m.changed, ["b"]);
  assert.deepEqual(m.voiceChanged, ["b"]);
});

test("a title change is not a voice change", () => {
  const m = revise(base, [echo(hook, { title: "¿Vencida de nuevo?" }), echo(steps), echo(product)]);
  assert.deepEqual(m.changed, ["a"]);
  assert.deepEqual(m.voiceChanged, []);
  assert.deepEqual(m.script.scenes[0].tweaks, hook.tweaks);
});

test("a scene left out is removed, a scene with no from is new, a second claim of an id is new", () => {
  const m = revise(base, [echo(hook), echo(product), echo(product, { title: "Copia" }), echo(steps, { from: "", title: "Nueva" })]);
  assert.deepEqual(m.removed, ["b"]);
  assert.equal(m.script.scenes.length, 4);
  assert.equal(m.script.scenes[1], product);
  assert.notEqual(m.script.scenes[2].id, "c");
  assert.equal(m.added.length, 2);
  assert.ok(m.added.includes(m.script.scenes[3].id));
  assert.equal(new Set(m.script.scenes.map((s) => s.id)).size, 4);
  assert.match(noteSummary(m), /se sumaron las escenas 3, 4, se quitó 1 escena/);
});

test("tweaks stay on the elements a changed scene still has, and go with another template", () => {
  const fewer = revise(base, [echo(hook), echo(steps, { items: ["Cargás", "Avisa"] }), echo(product)]);
  assert.deepEqual(fewer.script.scenes[1].tweaks, { title: { h: { scale: 1.2 } } });
  const other = revise(base, [echo(hook, { template: "stat", title: "3 litros" }), echo(steps), echo(product)]);
  assert.equal(other.script.scenes[0].id, "a");
  assert.equal(other.script.scenes[0].template, "stat");
  assert.equal(other.script.scenes[0].tweaks, undefined);
});

test("a camera the person picked stays when the writer echoes it, and changes only when the writer asks", () => {
  const kept = revise(base, base.scenes.map((s) => echo(s)));
  assert.equal(kept.script.scenes[2].camera, "pull");
  assert.equal(kept.script.scenes[2].cameraBy, undefined);
  const asked = revise(base, [echo(hook), echo(steps), echo(product, { camera: "push" })]);
  assert.equal(asked.script.scenes[2].camera, "push");
  assert.equal(asked.script.scenes[2].cameraBy, "ai");
  assert.deepEqual(asked.changed, ["c"]);
});

test("an old scene with no gesture, entry, camera or disclosure reads as unchanged when echoed", () => {
  const old = { ...scene({ id: "o", template: "character", asset: "ana", voice: "Hola." }) } as MotionScene;
  delete old.gesture;
  delete old.move;
  delete old.camera;
  const s = script([old]);
  const m = revise(s, [echo(old, { gesture: "", move: "", camera: "", disclosure: "" })]);
  assert.equal(m.script.scenes[0], old);
  assert.deepEqual(m.changed, []);
});

test("seconds within the writer's rounding and focus on templates that ignore it are not changes", () => {
  const odd = scene({ id: "x", template: "screen", seconds: 3.25 });
  const s = script([odd]);
  const m = revise(s, [echo(odd, { seconds: 3.25, focusX: 0.9 })]);
  assert.equal(m.script.scenes[0], odd);
  const longer = revise(s, [echo(odd, { seconds: 5 })]);
  assert.equal(longer.script.scenes[0].seconds, 5);
});

test("the tone stays the piece's; the writer's top fields come through", () => {
  const dry = { ...base, tone: "dry" as const };
  const m = revise(dry, dry.scenes.map((s) => echo(s)), { title: "Nuevo título", music: { mood: "calm", bpm: 90 } });
  assert.equal(m.script.tone, "dry");
  assert.equal(m.script.title, "Nuevo título");
  assert.deepEqual(m.script.music, { mood: "calm", bpm: 90 });
});

test("the summary names the scenes as they now play and what happened to their voices", () => {
  const m = revise(base, [echo(hook, { voice: "Otra vez." }), echo(steps, { voice: "Así." }), echo(product)]);
  const text = noteSummary(m, { dropped: ["a"], recorded: ["b"] });
  assert.match(text, /cambiaron las escenas 1, 2\./);
  assert.match(text, /El resto quedó igual/);
  assert.match(text, /en la escena 1: la voz generada se sacó/);
  assert.match(text, /Tu voz grabada en la escena 2/);
  assert.match(text, /Deshacer/);
});

test("only the studio's own generated file counts as a generated voice", () => {
  assert.equal(generatedVoice("s1", "voz-s1.mp3"), true);
  assert.equal(generatedVoice("s1", "voz-s1.webm"), false);
  assert.equal(generatedVoice("s1", "voz-s1.wav"), false);
  assert.equal(generatedVoice("s1", "mi-grabacion.mp3"), false);
});

test("the writer reads ids and content, never the hand tweaks", () => {
  const view = noteView(base);
  assert.match(view, /"id": "b"/);
  assert.doesNotMatch(view, /tweaks|scale/);
});

test("an old saved script passes the request check; a broken one says which field", () => {
  const parsed = MotionScriptInput.parse({
    problem: "p",
    title: "t",
    music: { mood: "drive", bpm: 100 },
    scenes: [{ id: "s1", template: "hook", seconds: 3, title: "Hola", text: "", items: [], asset: "", tweaks: { title: { at: 0.3 } } }],
  });
  assert.equal(parsed.scenes[0].voice, "");
  assert.deepEqual((parsed.scenes[0] as Record<string, unknown>).tweaks, { title: { at: 0.3 } });
  const bad = MotionScriptInput.safeParse({ music: { mood: "drive", bpm: 100 }, scenes: [{ id: "s1", template: "nope", seconds: 3 }] });
  assert.equal(bad.success, false);
  if (!bad.success) assert.match(checkErrorText(bad.error), /scenes\.1\.template/);
});
