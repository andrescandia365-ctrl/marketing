// Idea 53: a request that fails its check says which field and what is wrong, in Spanish.
import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import { checkErrorText, issueText } from "../shared/errors.ts";
import { BriefSchema } from "../shared/schema.ts";

const S = z.object({
  brief: z.object({
    series: z.string(),
    tone: z.enum(["dry", "warm"]),
    text: z.string().max(5),
    name: z.string().min(1),
    n: z.number().int().min(1),
    hex: z.string().regex(/^#[0-9a-f]{6}$/),
    tags: z.array(z.string()).min(1),
  }),
  custom: z.string().min(1, "Poné un nombre para la serie.").optional(),
});
const first = (value: unknown) => {
  const r = S.safeParse(value);
  assert.equal(r.success, false);
  return issueText(r.error!.issues[0]);
};
const ok = { series: "iman", tone: "dry", text: "hola", name: "x", n: 2, hex: "#ff5a36", tags: ["a"] };

test("each problem says where it is and what is wrong", () => {
  assert.equal(first({}), "falta «brief»");
  assert.equal(first({ brief: { ...ok, series: undefined } }), "falta «brief.series»");
  assert.equal(first({ brief: { ...ok, series: 3 } }), "«brief.series» tendría que ser un texto");
  assert.equal(first({ brief: { ...ok, tone: "loud" } }), "«brief.tone» tiene que ser una de estas opciones: dry, warm");
  assert.equal(first({ brief: { ...ok, text: "demasiado" } }), "«brief.text» es demasiado largo (hasta 5 caracteres)");
  assert.equal(first({ brief: { ...ok, name: "" } }), "«brief.name» está vacío");
  assert.equal(first({ brief: { ...ok, n: 0 } }), "«brief.n» es demasiado chico (al menos 1)");
  assert.equal(first({ brief: { ...ok, hex: "red" } }), "«brief.hex» no tiene el formato esperado");
  assert.equal(first({ brief: { ...ok, tags: [] } }), "«brief.tags» está vacío");
  // A message the schema wrote on purpose is kept.
  assert.equal(first({ brief: ok, custom: "" }), "«custom»: Poné un nombre para la serie.");
});

test("the whole message names the first problem and counts the rest", () => {
  const r = BriefSchema.safeParse({ series: "iman" });
  assert.equal(r.success, false);
  const text = checkErrorText(r.error!);
  // A missing choice reads as "which options", which is what fixes it.
  assert.match(text, /^Al pedido le faltaban datos: «length» tiene que ser una de estas opciones: short, episode, y otros \d+ problemas\.$/);
  assert.equal(checkErrorText({ issues: [] }), "Al pedido le faltaban datos.");
  assert.equal(checkErrorText(z.object({ a: z.string() }).safeParse({}).error!, "Faltan datos de la serie"), "Faltan datos de la serie: falta «a».");
});

test("list positions count from 1, types are always in Spanish, and one period ends the sentence", () => {
  const L = z.object({ shots: z.array(z.object({ title: z.string() })), tags: z.record(z.string(), z.string()) });
  const bad = (value: unknown) => issueText(L.safeParse(value).error!.issues[0]);
  assert.equal(bad({ shots: [{ title: "a" }, {}], tags: {} }), "falta «shots.2.title»");
  assert.equal(bad({ shots: [], tags: [] }), "«tags» tendría que ser un grupo de datos");
  assert.equal(issueText({ code: "invalid_type", path: ["x"], message: "Invalid input: expected weird", expected: "weird" }), "«x» tendría que ser otra cosa");
  const custom = z.object({ name: z.string().min(1, "Poné un nombre para la serie.") }).safeParse({ name: "" }).error!;
  assert.equal(checkErrorText(custom), "Al pedido le faltaban datos: «name»: Poné un nombre para la serie.");
  const bare = z.string().min(1, "¿Qué querés hacer?").safeParse("").error!;
  assert.equal(checkErrorText(bare), "Al pedido le faltaban datos: ¿Qué querés hacer?");
});
