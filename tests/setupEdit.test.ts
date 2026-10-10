// Changing a setup's description once carries it into every shot's prompts, reports where it was not found, and undoes.
import assert from "node:assert/strict";
import { test } from "node:test";
import { DEMO_BOARD } from "../server/demo.ts";
import { migrateBoard, type Board, type Shot } from "../shared/schema.ts";
import { identityPattern, propagateSetupIdentity, undoSetupIdentity } from "../shared/setupEdit.ts";

const board = (): Board => structuredClone(DEMO_BOARD);
const NEW_B = "a cheerful corner-store owner in her sixties, long white braid, red apron";

test("the new description replaces the old one in every prompt of every shot that has the setup", () => {
  const b = board();
  const old = b.setups.find((s) => s.id === "B")!.identity;
  const result = propagateSetupIdentity(b, "B", NEW_B)!;
  assert.ok(result);
  assert.equal(result.board.setups.find((s) => s.id === "B")!.identity, NEW_B);
  const withB = b.shots.map((s, i) => (s.setups.includes("B") ? i : -1)).filter((i) => i >= 0);
  for (const i of result.edit.changed) {
    const shot = result.board.shots[i];
    const all = [shot.visualPrompt, shot.middlePrompt, shot.endPrompt, shot.editPrompt, shot.videoPrompt].join(" ");
    assert.ok(!all.toLowerCase().includes(old.toLowerCase()), `toma ${i + 1} todavía tiene la descripción vieja`);
    assert.match(all, /cheerful corner-store owner in her sixties/i);
  }
  // Every shot with B is either changed or reported; none is silently skipped.
  for (const i of withB) assert.ok(result.edit.changed.includes(i) || result.edit.missing.includes(i));
  // The other setups and the untouched shots are the same objects.
  assert.equal(result.board.setups.find((s) => s.id === "A")!.identity, b.setups.find((s) => s.id === "A")!.identity);
  b.shots.forEach((s, i) => {
    if (!result.edit.changed.includes(i)) assert.equal(result.board.shots[i], s);
  });
  // The input board is not changed.
  assert.equal(b.setups.find((s) => s.id === "B")!.identity, old);
});

test("a prompt that opens with the description keeps its capital; spaces and a trailing stop do not matter", () => {
  const b = board();
  const shot = b.shots[1];
  assert.match(shot.visualPrompt, /^A tired but kind/);
  const r = propagateSetupIdentity(b, "B", NEW_B)!;
  assert.match(r.board.shots[1].visualPrompt, /^A cheerful corner-store owner in her sixties, long white braid, red apron, staring/);
  const p = identityPattern("a tall  man\nin a hat.")!;
  assert.ok(p.test("A tall man in a hat, smiling"));
  assert.equal(identityPattern("a man"), null);
});

test("a shot that lists the setup but never writes its description is reported, not edited", () => {
  const b = board();
  const target = b.shots.findIndex((s) => s.setups.includes("B"));
  const free: Shot = { ...b.shots[target], visualPrompt: "The owner stares at the fridge.", videoPrompt: "She sighs.", editPrompt: "", middlePrompt: "", endPrompt: "" };
  b.shots[target] = free;
  const r = propagateSetupIdentity(b, "B", NEW_B)!;
  assert.ok(r.edit.missing.includes(target));
  assert.ok(!r.edit.changed.includes(target));
  assert.equal(r.board.shots[target], free);
});

test("a real-screen shot is never reported as missing the description", () => {
  const b = board();
  b.shots[0] = { ...b.shots[0], kind: "screen", screen: "app", setups: ["B"], visualPrompt: "", videoPrompt: "" };
  const r = propagateSetupIdentity(b, "B", NEW_B)!;
  assert.ok(!r.edit.missing.includes(0));
});

test("the same description, an empty one or an unknown setup changes nothing", () => {
  const b = board();
  assert.equal(propagateSetupIdentity(b, "B", ` ${b.setups[1].identity} `), null);
  assert.equal(propagateSetupIdentity(b, "B", "   "), null);
  assert.equal(propagateSetupIdentity(b, "Z", NEW_B), null);
});

test("undo puts every prompt and the setup back, but keeps a prompt edited by hand since", () => {
  const b = board();
  const r = propagateSetupIdentity(b, "C", "a tiny neighbourhood shop at dusk, warm yellow bulbs, crowded wooden shelves")!;
  assert.ok(r.edit.changed.length >= 2);
  const back = undoSetupIdentity(r.board, r.edit);
  assert.deepEqual(back.board, b);
  assert.deepEqual(back.kept, []);

  const [first, second] = r.edit.changed;
  const edited = { ...r.board, shots: r.board.shots.map((s, i) => (i === first ? { ...s, visualPrompt: s.visualPrompt + " Rain outside." } : s)) };
  const partial = undoSetupIdentity(edited, r.edit);
  assert.deepEqual(partial.kept, [first]);
  assert.match(partial.board.shots[first].visualPrompt, /Rain outside\.$/);
  assert.deepEqual(partial.board.shots[second], b.shots[second]);
  assert.equal(partial.board.setups.find((s) => s.id === "C")!.identity, b.setups.find((s) => s.id === "C")!.identity);
});

test("an old saved board (one setup per shot, no castId) still propagates after migrateBoard", () => {
  const legacy = board() as unknown as { setups: Record<string, unknown>[]; shots: Record<string, unknown>[] };
  legacy.setups = legacy.setups.map(({ castId: _c, ...s }) => s);
  legacy.shots = legacy.shots.map(({ setups, editPrompt: _e, middlePrompt: _m, endPrompt: _n, ...s }) => ({ ...s, setup: (setups as string[])[0] }));
  const migrated = migrateBoard(legacy as unknown as Board);
  const r = propagateSetupIdentity(migrated, "B", NEW_B)!;
  assert.ok(r.edit.changed.length > 0);
});
