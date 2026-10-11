import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The projects folder is read when projects.ts loads: point it at a temporary one first.
const root = await mkdtemp(join(tmpdir(), "zip-proyectos-"));
process.env.PROJECTS_DIR = root;
const { createProject, saveMedia, saveState, getProject, listProjects } = await import("../server/projects.ts");
const { readZip, writeZip, unsafePath, projectPathAllowed, unwrapFolder, exportProjectZip, importProjectZip, ZipWriter } = await import(
  "../server/projectZip.ts"
);

test.after(() => rm(root, { recursive: true, force: true }));

const bytes = (s: string) => new Uint8Array(Buffer.from(s));
const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]);

async function collect(gen: AsyncGenerator<Buffer>): Promise<Buffer> {
  const parts: Buffer[] = [];
  for await (const part of gen) parts.push(part);
  return Buffer.concat(parts);
}

// A zip with one entry whose name and Unix mode are set by hand (what a hostile zip can carry).
function rawZip(name: string, data: Uint8Array, mode = 0o100644): Buffer {
  const zip = new ZipWriter();
  const body = zip.add({ name: "x", data });
  const end = zip.finish();
  const fixName = (b: Buffer, at: number) => Buffer.concat([b.subarray(0, at), Buffer.from(name), b.subarray(at + 1)]);
  const local = fixName(body, 30);
  local.writeUInt16LE(name.length, 26);
  const central = fixName(end.subarray(0, 47), 46);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE((mode << 16) >>> 0, 38);
  const eocd = Buffer.from(end.subarray(47));
  eocd.writeUInt32LE(central.length, 12);
  eocd.writeUInt32LE(local.length, 16);
  return Buffer.concat([local, central, eocd]);
}

test("unsafe paths are recognized", () => {
  for (const p of ["../x", "a/../../x", "/etc/passwd", "C:/x", "a\\..\\x", "a//b", "./x", ""]) assert.equal(unsafePath(p), true, p);
  for (const p of ["project.json", "sync/QA.md", "toma-01-imagen.png"]) assert.equal(unsafePath(p), false, p);
});

test("only the names a project folder uses are allowed", () => {
  for (const p of ["project.json", "pieza.md", "toma-01-clip.mp4", "video-final-vertical.mp4", "portada-9x16.jpg", "video-final-vertical.srt", "sync/QA.md", "sync/contact.png"]) {
    assert.equal(projectPathAllowed(p), true, p);
  }
  for (const p of [".project.json.tmp", "otro.json", "script.js", "index.html", "sync/otro.txt", "media/a.png", "Foto.PNG", ".env"]) {
    assert.equal(projectPathAllowed(p), false, p);
  }
});

test("a zip round trip keeps every byte, stored and deflated", () => {
  const big = bytes("hola ".repeat(5000));
  const files = [
    { name: "project.json", data: bytes('{"a":1}') },
    { name: "pieza.md", data: big },
    { name: "toma-01-imagen.png", data: PNG },
    { name: "vacio.md", data: new Uint8Array(0) },
  ];
  const zip = writeZip(files);
  assert.ok(zip.length < big.length, "text is deflated");
  const back = readZip(zip);
  assert.deepEqual(back.map((f) => f.name), files.map((f) => f.name));
  back.forEach((f, i) => assert.deepEqual(new Uint8Array(f.data), files[i].data));
});

test("traversal, absolute paths and symlinks are rejected", () => {
  assert.throws(() => readZip(rawZip("../evil.png", PNG)), /sale de la carpeta/);
  assert.throws(() => readZip(rawZip("/tmp/evil.png", PNG)), /sale de la carpeta/);
  assert.throws(() => readZip(rawZip("sync/../../evil.md", PNG)), /sale de la carpeta/);
  assert.throws(() => readZip(rawZip("a\\..\\evil.md", PNG)), /sale de la carpeta/);
  assert.throws(() => readZip(rawZip("toma-01-imagen.png", bytes("/etc/passwd"), 0o120777)), /enlace simbólico/);
});

test("sizes are capped by what is declared and by what really inflates", () => {
  const zip = writeZip([{ name: "pieza.md", data: bytes("a".repeat(10_000)) }]);
  assert.throws(() => readZip(zip, { file: 1000, total: 1e9, entries: 10 }), /pesa más/);
  assert.throws(() => readZip(zip, { file: 1e9, total: 1000, entries: 10 }), /suman más/);
  assert.throws(() => readZip(writeZip([{ name: "a.md", data: PNG }, { name: "b.md", data: PNG }]), { file: 1e9, total: 1e9, entries: 1 }), /más de 1 archivos/);
  // A bomb that lies about its size: declared 10 bytes, inflates to a megabyte.
  const zipBomb = (() => {
    const w = new ZipWriter();
    const head = w.add({ name: "pieza.md", data: Buffer.alloc(1_000_000) });
    const tail = w.finish();
    // Rewrite the declared size to 10 in both headers.
    head.writeUInt32LE(10, 22);
    tail.writeUInt32LE(10, 24);
    return Buffer.concat([head, tail]);
  })();
  assert.throws(() => readZip(zipBomb), /dañado/);
  assert.throws(() => readZip(bytes("no soy un zip")), /no parece un \.zip/);
});

test("a folder zipped by hand loses its top folder; junk is skipped", () => {
  const files = unwrapFolder([{ name: "mi-pieza/project.json" }, { name: "mi-pieza/pieza.md" }]);
  assert.deepEqual(files.map((f) => f.name), ["project.json", "pieza.md"]);
  const zip = writeZip([
    { name: "__MACOSX/._pieza.md", data: PNG },
    { name: ".DS_Store", data: PNG },
    { name: "pieza.md", data: PNG },
  ]);
  assert.deepEqual(readZip(zip).map((f) => f.name), ["pieza.md"]);
});

test("export then import makes a new project with the same files, never overwriting", async () => {
  const project = await createProject("iman");
  await saveState(project.id, { step: "board", story: { problem: "Se vence la leche" } }, "# Pieza\n");
  await saveMedia(project.id, 0, "image", Buffer.from(PNG), "image/png", { name: "a.png", duration: 0 });
  await mkdir(join(root, project.id, "sync"), { recursive: true });
  await writeFile(join(root, project.id, "sync", "QA.md"), "# QA\n");
  await writeFile(join(root, project.id, "notas-privadas.txt"), "no va");
  await writeFile(join(root, project.id, ".video-final-vertical.mp4"), "a medias");
  await symlink("/etc/hostname", join(root, project.id, "enlace.png")).catch(() => undefined);

  const zip = await collect(exportProjectZip(project.id));
  const names = readZip(zip).map((f) => f.name);
  assert.deepEqual(names, ["project.json", "pieza.md", "sync/QA.md", "toma-01-imagen.png"]);

  const first = await importProjectZip(zip);
  assert.notEqual(first.id, project.id);
  assert.match(first.id, new RegExp(`^${project.id}-2$`));
  const copy = await getProject(first.id);
  assert.equal(copy.id, first.id);
  assert.deepEqual(copy.state, (await getProject(project.id)).state);
  assert.equal(copy.media[0].image, "toma-01-imagen.png");
  assert.deepEqual(new Uint8Array(await readFile(join(root, first.id, "toma-01-imagen.png"))), PNG);
  assert.equal(await readFile(join(root, first.id, "sync", "QA.md"), "utf8"), "# QA\n");
  assert.equal(await readFile(join(root, first.id, "pieza.md"), "utf8"), "# Pieza\n");
  // The original is untouched, and a second import picks yet another name.
  assert.equal((await getProject(project.id)).id, project.id);
  const second = await importProjectZip(zip);
  assert.equal(second.id, `${project.id}-3`);
  assert.equal((await listProjects()).length, 3);
});

test("a project.json that fails its check says what is wrong, and nothing is left behind", async () => {
  const before = await readdir(root);
  const bad = writeZip([{ name: "project.json", data: bytes(JSON.stringify({ id: "x", createdAt: "", updatedAt: "", state: {}, media: { 0: { image: "../../etc/passwd" } } })) }]);
  await assert.rejects(importProjectZip(bad), /project\.json del \.zip no sirve: «media\.0\.image»/);
  await assert.rejects(importProjectZip(writeZip([{ name: "pieza.md", data: PNG }])), /le falta project\.json/);
  await assert.rejects(
    importProjectZip(writeZip([{ name: "project.json", data: bytes("{}") }, { name: "index.html", data: PNG }])),
    /un proyecto no usa/,
  );
  assert.deepEqual(await readdir(root), before);
});
