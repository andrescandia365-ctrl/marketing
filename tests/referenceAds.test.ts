// "Analizar un anuncio que funciona": the vision writer's teardown is normalised into the series' shape and kept as
// text in the bible under "Referencias", both ways. Old series without the section keep loading.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
import {
  REFERENCES_HEADING,
  ReferenceSchema,
  ReferenceWireSchema,
  angleOf,
  cleanPalette,
  imageStyleOf,
  markdownToReferences,
  normalizeReference,
  referencesToMarkdown,
  type ReferenceWire,
} from "../shared/reference.ts";
import { EMPTY_SERIES, SeriesFieldsSchema, markdownToSeries, seriesToMarkdown } from "../shared/series.ts";
import { usageKind } from "../shared/usage.ts";

const wire: ReferenceWire = {
  title: "Antes y después de un placard\n",
  first: "La foto del placard ordenado, a la derecha",
  next: "El titular grande arriba",
  last: "El botón | Comprar",
  layout: "Dos mitades: el caos a la izquierda, el orden a la derecha",
  palette: ["#FFF", "1a2b3c", "ada", "#1A2B3C", "rojo", "#00ff00 (verde)", "#123", "#abcdef", "#a1a1a1", "#b2b2b2", "#c3c3c3"],
  type: "Sin serifa, gruesa y condensada",
  imageStyle: "Lifestyle photo in a real home",
  contrast: "Fondo claro con texto oscuro",
  whitespace: "Mucho aire arriba",
  framing: "Plano medio, de frente",
  hook: "¿Otra vez no encontrás nada?",
  promise: "Todo en su lugar en 10 minutos",
  cta: "Compralo hoy",
  otherLines: ["Envío gratis", "Envío gratis", "  ", "Últimas unidades"],
  angle: "Pain relief: the mess",
  angleWhy: "Muestra el dolor y el alivio juntos",
  borrow: ["El orden de lectura: dolor, alivio, botón", "La partición en dos mitades"],
  avoid: ["Sus frases y su producto", "La urgencia inventada (últimas unidades)"],
};

test("normalizeReference cleans the writer's teardown", () => {
  const r = normalizeReference(wire, "2026-10-11", "De la competencia\nen Instagram");
  assert.equal(r.title, "Antes y después de un placard");
  assert.equal(r.added, "2026-10-11");
  assert.equal(r.last, "El botón / Comprar", "the list separator never gets into a line");
  assert.deepEqual(r.palette, ["#ffffff", "#1a2b3c", "#00ff00", "#112233", "#abcdef", "#a1a1a1", "#b2b2b2", "#c3c3c3"]);
  assert.equal(r.imageStyle, "lifestyle");
  assert.equal(r.angle, "pain");
  assert.deepEqual(r.otherLines, ["Envío gratis", "Últimas unidades"]);
  assert.equal(r.note, "De la competencia en Instagram");
  assert.ok(ReferenceSchema.safeParse(r).success);
});

test("normalizeReference survives an empty or odd reply", () => {
  const r = normalizeReference({ title: "", palette: "nope" as unknown as string[], angle: 3 as unknown as string }, "11/10/2026");
  assert.equal(r.title, "Anuncio de referencia");
  assert.equal(r.added, "");
  assert.deepEqual(r.palette, []);
  assert.equal(r.angle, "other");
  assert.equal(r.imageStyle, "other");
  assert.ok(ReferenceWireSchema.safeParse(wire).success);
});

test("angles and image styles from Spanish or English words", () => {
  assert.equal(angleOf("Miedo o urgencia"), "fear");
  assert.equal(angleOf("scarcity"), "fear");
  assert.equal(angleOf("Estatus o identidad"), "status");
  assert.equal(angleOf("curiosity"), "curiosity");
  assert.equal(angleOf("Facilidad"), "ease");
  assert.equal(angleOf("authority"), "authority");
  assert.equal(angleOf("algo raro"), "other");
  assert.equal(imageStyleOf("UGC"), "ugc");
  assert.equal(imageStyleOf("Ilustración plana"), "illustration");
  assert.equal(imageStyleOf("product only, white background"), "product");
  assert.equal(imageStyleOf("studio"), "studio");
  assert.equal(imageStyleOf("minimalista"), "minimal");
  assert.deepEqual(cleanPalette(["#ABC", "#abc"]), ["#aabbcc"]);
});

test("references round trip through the bible's Markdown", () => {
  const a = normalizeReference(wire, "2026-10-11", "Nota");
  const b = normalizeReference({ ...wire, title: "Placard (versión 2)", angle: "ease", imageStyle: "ugc", hook: "", otherLines: [], palette: [] }, "");
  const md = referencesToMarkdown([a, b]);
  assert.match(md, /^### Antes y después de un placard \(2026-10-11\)/);
  assert.match(md, /Gancho \(sus palabras, nunca se reusan\): ¿Otra vez no encontrás nada\?/);
  assert.deepEqual(markdownToReferences(md), [a, b]);
});

test("a series keeps its references in the bible, and old series load without them", () => {
  const fields = SeriesFieldsSchema.parse({
    ...EMPTY_SERIES,
    name: "Máshogar",
    type: "ecommerce",
    other: "Precio a confirmar.",
    references: [normalizeReference(wire, "2026-10-11")],
  });
  const md = seriesToMarkdown(fields);
  assert.ok(md.includes(`## ${REFERENCES_HEADING}`));
  const back = markdownToSeries(md, "mashogar");
  assert.deepEqual(back.references, fields.references);
  assert.equal(back.other, "Precio a confirmar.", "the section never leaks into Otras notas");

  // A series saved before the field existed: the request and the bible both still read.
  const { references: _gone, ...old } = fields;
  assert.deepEqual(SeriesFieldsSchema.parse(old).references, []);
  assert.equal(seriesToMarkdown({ ...fields, references: [] }).includes("Referencias"), false);
  for (const file of readdirSync(new URL("../server/series/", import.meta.url)).filter((f) => f.endsWith(".md"))) {
    const text = readFileSync(new URL(`../server/series/${file}`, import.meta.url), "utf8");
    const series = markdownToSeries(text, file.replace(/\.md$/, ""));
    assert.ok(Array.isArray(series.references), file);
    assert.ok(SeriesFieldsSchema.safeParse(series).success, file);
  }
});

test("a hand-edited block still reads; one with no title is skipped", () => {
  const body = ["### ", "- Ángulo: x", "", "### Mi referencia", "- angulo: Facilidad", "- Colores: #FFFFFF | nada", "- Que tomar: El orden | La promesa", "- Algo nuevo: se ignora"].join("\n");
  const [r, ...rest] = markdownToReferences(body);
  assert.equal(rest.length, 0);
  assert.equal(r.title, "Mi referencia");
  assert.equal(r.angle, "ease");
  assert.deepEqual(r.palette, ["#ffffff"]);
  assert.deepEqual(r.borrow, ["El orden", "La promesa"]);
});

test("the teardown has its own line in the token log", () => {
  assert.equal(usageKind("/api/reference/teardown"), "Analizar un anuncio");
});
