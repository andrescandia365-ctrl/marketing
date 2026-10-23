// Publicidad (Método 50-5-3): the combinations are code, the metrics CSV, the ranking and the export.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  defaultSplit,
  clipSecondsFor,
  combine,
  ctasFromWire,
  emptyAds,
  estimate,
  exportCsv,
  hooksFromWire,
  localFlags,
  meatsFromWire,
  nearDuplicates,
  parseMetricsCsv,
  pieceStats,
  rankHooks,
  varyHook,
  wordsFor,
} from "../shared/ads.ts";

const prompts = { onScreenText: "", visualPrompt: "", videoPrompt: "" };

function catalogue() {
  const s = emptyAds("iman");
  const hooks = hooksFromWire(
    s,
    {
      hooks: [
        { text: "¿Otra vez el proveedor cerró antes del pedido?", level: 2, angle: "pain", formula: "question", ...prompts },
        { text: "Hasta el viernes el primer mes no se paga", level: 5, angle: "proof", formula: "number", ...prompts },
        { text: "¿Otra vez el proveedor cerró antes de armar el pedido?", level: 2, angle: "pain", formula: "question", ...prompts },
      ],
      note: "",
    },
    defaultSplit(15).hook,
    "ai",
    "approved",
  );
  s.hooks.push(...hooks);
  const meats = meatsFromWire(
    s,
    { meats: [{ text: "m1", format: "demo", levels: [1, 2, 3], ...prompts }, { text: "m2", format: "testimonial", levels: [4, 5], ...prompts }], note: "" },
    defaultSplit(15).meat,
    "",
    [2],
  );
  meats.forEach((m) => (m.status = "approved"));
  s.meats.push(...meats);
  const ctas = ctasFromWire(s, { ctas: [{ text: "c1", levels: [1, 2, 3, 4, 5], what: "", why: "", when: "", easy: "", ...prompts }], note: "" }, defaultSplit(15).cta, [2]);
  ctas.forEach((c) => (c.status = "approved"));
  s.ctas.push(...ctas);
  return s;
}

test("ids are numbered per kind and the combination respects the level when asked", () => {
  const s = catalogue();
  const length = { seconds: 15 };
  assert.deepEqual(s.hooks.map((h) => h.id), ["H1", "H2", "H3"]);
  assert.deepEqual(combine(s.hooks, s.meats, s.ctas, { sameLevel: true }, length).map((a) => a.id).sort(), ["H1-M1-C1", "H2-M2-C1", "H3-M1-C1"]);
  assert.equal(combine(s.hooks, s.meats, s.ctas, { sameLevel: false }, length).length, 6);
  assert.equal(varyHook(s.meats[0], s.ctas[0], s.hooks, { sameLevel: true }, length).length, 2);
  assert.equal(combine(s.hooks, s.meats, s.ctas, { sameLevel: false }, { seconds: 60 }).length, 0, "a 60 s batch does not pick a 9 s meat");
  assert.deepEqual(varyHook(s.meats[0], s.ctas[0], s.hooks, { sameLevel: true }, { seconds: 60 }), []);
});

test("time budget and near-duplicates", () => {
  assert.equal(wordsFor(3), 8);
  assert.equal(clipSecondsFor(9), 10);
  assert.equal(clipSecondsFor(3), 6);
  const s = catalogue();
  assert.equal(nearDuplicates(s.hooks).length, 1);
  assert.equal(localFlags(s.hooks, s.meats, s.ctas).filter((f) => f.kind === "duplicate").length, 1);
});

test("a platform report in English or Spanish feeds each piece's metric", () => {
  const s = catalogue();
  const en = parseMetricsCsv(`Ad name,Impressions,3-second video plays,Video average play time,Link clicks,Results,Amount spent (ARS)
H1-M1-C1,"1,000",400,6.5,20,2,"1,500.50"
H3-M1-C1,500,100,4,5,0,700
"otro anuncio",300,100,3,1,0,100
`);
  assert.equal(en.rows.length, 3);
  assert.equal(en.rows[0].spend, 1500.5);
  const es = parseMetricsCsv("Nombre del anuncio;Impresiones;Reproducciones de video de 3 segundos;Importe gastado (ARS)\nH2-M2-C1;2.000;1.200;3.400,25\n");
  assert.equal(es.rows[0].impressions, 2000);
  assert.equal(es.rows[0].spend, 3400.25);
  s.metrics = en.rows;
  const stats = pieceStats(s.metrics);
  assert.equal(stats.H1.hookRate, 0.4);
  assert.equal(stats.M1.ads, 2);
  assert.deepEqual(rankHooks(s).map((r) => r.id), ["H1", "H3"]);
});

test("the export CSV quotes what needs quoting and the estimate counts unique pieces", () => {
  const s = catalogue();
  const ads = combine(s.hooks, s.meats, s.ctas, { sameLevel: true }, { seconds: 15 });
  const csv = exportCsv(
    { id: "tanda-1", createdAt: new Date().toISOString(), seconds: 15, mode: "full", rules: { sameLevel: true }, ads, copies: { "H1-C1": { primary: 'Hola, "mundo"', headline: "T", button: "Comprar" } }, files: { "H1-M1-C1": "H1-M1-C1.mp4" } },
    s.hooks,
    s.meats,
    s.ctas,
  );
  assert.equal(csv.split("\n").length, 4);
  assert.ok(csv.includes('"Hola, ""mundo"""'));
  const pieceSeconds = Object.fromEntries([...s.hooks, ...s.meats, ...s.ctas].map((p) => [p.id, p.seconds]));
  const e = estimate(ads, new Set(["H1"]), pieceSeconds);
  assert.equal(e.pieces, 6);
  assert.equal(e.toRender, 5);
  // H2 and H3 are 3 s, M1 and M2 are 9 s, C1 is 3 s: 27 s still to render.
  assert.equal(e.renderSeconds, 27 * 0.8 + ads.length * 0.6);
  assert.equal(estimate(ads, new Set(["H1"]), {}).renderSeconds, ads.length * 0.6);
});
