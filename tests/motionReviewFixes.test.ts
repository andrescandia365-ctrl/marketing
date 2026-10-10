// Review fixes: the CONCEPTO flag survives the host taking a character scene, a note never brings back a flag the
// person had resolved, and a note keeps the person's second "Casilleros" row.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { z } from "zod";
import { MotionNoteSchema, MotionScriptSchema, blankScene, conceptIssues, hostScenes, normalizeMotion, pickCamera, withBeyond, type MotionScene, type MotionScript } from "../shared/motion.ts";
import { mergeNote, noteView, type NoteLink } from "../shared/motionNote.ts";

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

function revise(current: MotionScript, scenes: WireScene[]) {
  const wire: z.infer<typeof MotionNoteSchema> = {
    problem: current.problem,
    title: current.title,
    durationNote: "",
    note: "",
    caption: current.caption ?? "",
    music: { mood: current.music.mood, bpm: current.music.bpm },
    scenes,
  };
  const links: NoteLink[] = wire.scenes.map((s) => ({ from: s.from, camera: pickCamera(s.camera) }));
  const revised = normalizeMotion({ ...wire, scenes: wire.scenes.map(({ from: _f, ...s }) => s) }, current.tone, { revising: true });
  return mergeNote(current, { ...revised, tone: current.tone }, links);
}

test("the host taking a flagged character scene keeps the writer's CONCEPTO flag current", () => {
  const wire = MotionScriptSchema.parse({
    problem: "p",
    title: "t",
    durationNote: "",
    note: "",
    caption: "",
    music: { mood: "drive", bpm: 110 },
    scenes: [{ template: "character", seconds: 4, title: "", text: "", items: [], asset: "pantalla-1", assetB: "", gesture: "", move: "", entry: "cut", reveal: "", camera: "hold", focusX: 0.5, focusY: 0.5, zoom: 2, voice: "El robot repone solo", emotion: "", disclosure: "real", beyondToday: "Robot que repone" }],
  });
  const motion = normalizeMotion(wire);
  assert.equal(conceptIssues(motion.scenes).length, 1);
  const hosted = hostScenes(motion.scenes, "mica", ["mica"], false);
  assert.equal(hosted[0].asset, "mica");
  assert.equal(hosted[0].assetB, "pantalla-1");
  assert.equal(conceptIssues(hosted).length, 1);
});

test("a stale flag stays stale: hosting does not revive it", () => {
  const flagged = withBeyond(scene({ id: "c", template: "character", asset: "pantalla-1", voice: "Robot" }), "Robot", "ia");
  const edited = { ...flagged, voice: "Otra cosa" };
  assert.equal(conceptIssues([edited]).length, 0);
  assert.equal(conceptIssues(hostScenes([edited], "mica", ["mica"], false)).length, 0);
});

test("noteView only sends the flags that still apply", () => {
  const flagged = withBeyond(scene({ id: "a", template: "hook", title: "Robot gerente", voice: "El robot" }), "robot gerente", "ia");
  const edited = { ...flagged, title: "Gerente de verdad" };
  const view = JSON.parse(noteView(script([edited])));
  assert.equal(view.scenes[0].beyondToday, "");
  const still = JSON.parse(noteView(script([flagged])));
  assert.equal(still.scenes[0].beyondToday, "robot gerente");
});

test("a note that touches another scene keeps the person's second Casilleros row", () => {
  const a = scene({ id: "a", template: "slots", title: "Fila", items: ["A", "B"] });
  const b = scene({ id: "b", template: "slots", title: "" });
  const c = scene({ id: "c", template: "slots", title: "Otra fila", items: ["P", "Q"] });
  const d = scene({ id: "d", template: "hook", title: "Gancho" });
  const merged = revise(script([a, b, c, d]), [echo(a), echo(b), echo(c), echo(d, { title: "Otro gancho" })]);
  assert.deepEqual(merged.changed, ["d"]);
  assert.deepEqual(merged.script.scenes.map((s) => s.items), [["A", "B"], [], ["P", "Q"], []]);
});
