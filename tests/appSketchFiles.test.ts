// The app's pencil sketches as files in the project folder (boceto-app-NN.png), for pieza.md and the .zip.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = await mkdtemp(join(tmpdir(), "app-sketch-"));
process.env.PROJECTS_DIR = root;
const { createProject, saveAppSketch, pruneAppSketches } = await import("../server/projects.ts");
const { projectPathAllowed } = await import("../server/projectZip.ts");
test.after(() => rm(root, { recursive: true, force: true }));

const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);

test("a sketch PNG is saved by shot, only a PNG, and travels in the .zip", async () => {
  const { id } = await createProject("iman");
  assert.equal(await saveAppSketch(id, 0, png), "boceto-app-01.png");
  await assert.rejects(saveAppSketch(id, 1, Buffer.from("<svg></svg>")), /no es un PNG/);
  await assert.rejects(saveAppSketch(id, -1, png), /Toma no válida/);
  await assert.rejects(saveAppSketch("../x", 0, png), /no existe/);
  assert.ok(projectPathAllowed("boceto-app-01.png"));
});

test("pruning keeps the shots the board still has and leaves uploaded sketches alone", async () => {
  const { id } = await createProject("iman");
  for (const i of [0, 1, 2, 3]) await saveAppSketch(id, i, png);
  await writeFile(join(root, id, "boceto-04.jpg"), "x");
  const removed = await pruneAppSketches(id, 2);
  assert.deepEqual(removed.sort(), ["boceto-app-03.png", "boceto-app-04.png"]);
  const left = (await readdir(join(root, id))).filter((n) => n.startsWith("boceto")).sort();
  assert.deepEqual(left, ["boceto-04.jpg", "boceto-app-01.png", "boceto-app-02.png"]);
});
