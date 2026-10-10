// "Personaje de los explicativos": a series names the cast character who hosts its explainers. It is kept in the
// series bible, the writer's character scenes use it, the studio defaults a new character scene to it, and the
// sample pieces show it. Series without it work as before.
import assert from "node:assert/strict";
import { test } from "node:test";
import { hostScenes } from "../shared/motion.ts";
import { EMPTY_SERIES, explainerHost, markdownToSeries, seriesToMarkdown, SeriesFieldsSchema, type CastMember } from "../shared/series.ts";
import { EXAMPLE_BRIEF } from "../shared/example.ts";
import { demoMotion } from "../server/demo.ts";
import { getSeries } from "../server/series.ts";

const member = (id: string, kind: CastMember["kind"], image = `${id}.png`): CastMember => ({
  id,
  name: id[0].toUpperCase() + id.slice(1),
  ref: id,
  kind,
  identity: "",
  note: "",
  image,
  sheet: "",
  puppet: { layers: [] },
  rig: { file: "", clips: { idle: "", walk: "", turnL: "", turnR: "", point: "" } },
});
const cast = [member("ana", "character"), member("beto", "character"), member("caja", "product"), member("sin", "character", "")];

test("the explainer character round-trips through the bible's Markdown", () => {
  const fields = { ...EMPTY_SERIES, name: "Prueba", cast, explainerCharacter: "beto" };
  const md = seriesToMarkdown(fields);
  assert.match(md, /^Personaje de los explicativos: beto \(Beto\)$/m);
  assert.equal(markdownToSeries(md, "prueba").explainerCharacter, "beto");
  // Not set: no line, and it reads back empty.
  const none = seriesToMarkdown({ ...fields, explainerCharacter: "" });
  assert.doesNotMatch(none, /Personaje de los explicativos/);
  assert.equal(markdownToSeries(none, "prueba").explainerCharacter, "");
});

test("an old bible and an old saved form keep working", () => {
  assert.equal(markdownToSeries("# Vieja\n\nFrase: algo\nTipo: Software (SaaS)\n", "vieja").explainerCharacter, "");
  const { explainerCharacter: _gone, ...old } = { ...EMPTY_SERIES, name: "Vieja" };
  const parsed = SeriesFieldsSchema.safeParse(old);
  assert.ok(parsed.success);
  assert.equal(parsed.data.explainerCharacter, "");
});

test("explainerHost is only a drawable character of the cast", () => {
  assert.equal(explainerHost({ cast, explainerCharacter: "ana" })?.id, "ana");
  assert.equal(explainerHost({ cast, explainerCharacter: "" }), null);
  assert.equal(explainerHost({ cast }), null);
  assert.equal(explainerHost({ cast, explainerCharacter: "caja" }), null, "a product is not a host");
  assert.equal(explainerHost({ cast, explainerCharacter: "sin" }), null, "a character with nothing to draw is not a host");
  assert.equal(explainerHost({ cast, explainerCharacter: "nadie" }), null, "gone from the cast");
  const puppet = { ...member("pupi", "character", ""), puppet: { layers: [{ file: "p.png", role: "body" as const, pivot: null, name: "", place: null }] } };
  assert.equal(explainerHost({ cast: [puppet], explainerCharacter: "pupi" })?.id, "pupi");
});

test("hostScenes: the writer's character scenes are always the host's", () => {
  const characters = ["ana", "beto", "sin"];
  const scenes = [
    { template: "character", asset: "beto", assetB: "" },
    { template: "character", asset: "", assetB: "caja" },
    { template: "character", asset: "caja", assetB: "" },
    { template: "product", asset: "caja", assetB: "" },
    { template: "character", asset: "ana", assetB: "" },
  ];
  const out = hostScenes(scenes, "ana", characters, false);
  assert.deepEqual(out[0], { template: "character", asset: "ana", assetB: "" }, "another character gives way, and is not presented");
  assert.deepEqual(out[1], { template: "character", asset: "ana", assetB: "caja" });
  assert.deepEqual(out[2], { template: "character", asset: "ana", assetB: "caja" }, "the product it named is what the host presents");
  assert.deepEqual(out[3], scenes[3], "other templates are untouched");
  assert.equal(out[4], scenes[4]);
  // No host: today's behaviour, the same array.
  assert.equal(hostScenes(scenes, "", characters, false), scenes);
  assert.equal(hostScenes(scenes, null, characters, false), scenes);
});

test("hostScenes in the studio keeps a character the person chose", () => {
  const characters = ["ana", "beto"];
  const [kept] = hostScenes([{ template: "character", asset: "beto", assetB: "" }], "ana", characters, true);
  assert.equal(kept.asset, "beto");
  const [fresh] = hostScenes([{ template: "character", asset: "", assetB: "" }], "ana", characters, true);
  assert.equal(fresh.asset, "ana");
  const [fromScreen] = hostScenes([{ template: "character", asset: "pantalla", assetB: "" }], "ana", characters, true);
  assert.deepEqual(fromScreen, { template: "character", asset: "ana", assetB: "pantalla" });
  const [presentsHost] = hostScenes([{ template: "character", asset: "", assetB: "ana" }], "ana", characters, true);
  assert.equal(presentsHost.assetB, "", "the host never presents itself");
});

test("the sample series name their explainer character and the sample pieces use it", () => {
  for (const [id, host] of [["iman", "mica"], ["masogar", "mara"]] as const) {
    const series = getSeries(id);
    assert.ok(series, id);
    assert.equal(explainerHost(series)?.id, host);
    for (const tone of ["dry", "warm", "absurdist"] as const) {
      const scenes = demoMotion({ ...EXAMPLE_BRIEF, piece: "explainer", series: id, tone, narrator: "with" }, null).scenes;
      const hosted = scenes.filter((s) => s.template === "character");
      assert.ok(hosted.length >= 1, `${id} ${tone}`);
      assert.ok(hosted.every((s) => s.asset === host), `${id} ${tone}`);
    }
  }
});
