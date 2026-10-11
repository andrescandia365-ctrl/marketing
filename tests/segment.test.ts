// "Formato del segmento": a story at the desk (as before), with the series' correspondent "on location" (PLAYBOOK §2.5
// Remote Stand-up) or as a field visit (§2.5 Field Visit). The brief defaults to the desk, the series bible keeps its
// correspondent, the writer's brief lines follow the format, the story's moves must show it, and a correspondent the
// writer invented is offered to the cast.
import assert from "node:assert/strict";
import { test } from "node:test";
import { BriefSchema, type Story } from "../shared/schema.ts";
import { EXAMPLE_BRIEF } from "../shared/example.ts";
import { EMPTY_SERIES, markdownToSeries, seriesCorrespondent, seriesToMarkdown, SeriesFieldsSchema, type CastMember } from "../shared/series.ts";
import { INVENTED_CORRESPONDENT, correspondentMember, inventedCorrespondent, segmentOf, segmentRules } from "../shared/segment.ts";
import { storyProblems } from "../shared/checks.ts";
import { describeBrief } from "../server/claude.ts";
import { DEMO_STORY, demoStory } from "../server/demo.ts";
import { listSeries } from "../server/series.ts";

const member = (id: string, kind: CastMember["kind"] = "character"): CastMember => ({
  id,
  name: id[0].toUpperCase() + id.slice(1),
  ref: id,
  kind,
  identity: `${id} identity`,
  note: "",
  image: "",
  sheet: "",
  puppet: { layers: [] },
  rig: { file: "", clips: { idle: "", walk: "", turnL: "", turnR: "", point: "" } },
  refs: [],
  views: [],
});

test("the brief defaults to the desk, and an old brief with no segment still parses", () => {
  const { segment: _drop, ...old } = EXAMPLE_BRIEF;
  assert.equal(BriefSchema.parse(old).segment, "desk");
  assert.equal(BriefSchema.parse({ ...old, segment: "field" }).segment, "field");
  assert.throws(() => BriefSchema.parse({ ...old, segment: "studio" }));
  // Explainers have no segment: they always read as the desk.
  assert.equal(segmentOf({ piece: "explainer", segment: "correspondent" }), "desk");
  assert.equal(segmentOf(undefined), "desk");
});

test("the correspondent round-trips through the bible, and old bibles read none", () => {
  const fields = { ...EMPTY_SERIES, name: "Prueba", cast: [member("ramiro"), member("caja", "product")], correspondent: "ramiro" };
  const md = seriesToMarkdown(fields);
  assert.match(md, /^Corresponsal: ramiro \(Ramiro\)$/m);
  const back = markdownToSeries(md, "prueba");
  assert.equal(back.correspondent, "ramiro");
  assert.equal(seriesCorrespondent(back)?.name, "Ramiro");
  assert.doesNotMatch(seriesToMarkdown({ ...fields, correspondent: "" }), /Corresponsal:/);
  assert.equal(markdownToSeries("# Vieja\n\nFrase: algo\n", "vieja").correspondent, "");
  // A form saved before the field existed.
  const { correspondent: _drop, ...oldForm } = EMPTY_SERIES;
  assert.equal(SeriesFieldsSchema.parse({ ...oldForm, name: "Vieja" }).correspondent, "");
  // A product or a member who left the cast is no correspondent.
  assert.equal(seriesCorrespondent({ cast: fields.cast, correspondent: "caja" }), null);
  assert.equal(seriesCorrespondent({ cast: fields.cast, correspondent: "nadie" }), null);
});

test("the writer's brief lines follow the format", () => {
  assert.equal(segmentRules({ segment: "desk" }, null), "");
  assert.equal(segmentRules({ piece: "explainer", segment: "field" }, null), "");

  const own = segmentRules({ segment: "correspondent" }, member("ramiro"));
  assert.match(own, /Remote Stand-up/);
  assert.match(own, /cast id ramiro/);
  assert.match(own, /"ramiro identity"/);
  assert.match(own, /concept/);
  assert.match(own, /remoteStandup/);
  assert.match(own, /real problem/);

  const invented = segmentRules({ segment: "correspondent" }, null);
  assert.match(invented, new RegExp(`id "${INVENTED_CORRESPONDENT}"`));
  assert.match(invented, /adult, invented, non-famous/);

  const field = segmentRules({ segment: "field" }, null);
  assert.match(field, /FIELD VISIT/);
  assert.match(field, /fieldVisit/);
  assert.match(field, /permiso firmado/);
  assert.match(field, /AI scenes are invented/);
  assert.match(field, /Nobody hosts the visit/);
  assert.match(segmentRules({ segment: "field" }, member("ramiro")), /cast id ramiro/);
});

test("describeBrief carries the segment only when it is not the desk", () => {
  const series = listSeries().find((s) => s.type !== "music")!.id;
  const desk = describeBrief({ ...EXAMPLE_BRIEF, series });
  assert.doesNotMatch(desk, /Segment:/);
  assert.match(describeBrief({ ...EXAMPLE_BRIEF, series, segment: "correspondent" }), /Segment: WITH A CORRESPONDENT/);
  assert.match(describeBrief({ ...EXAMPLE_BRIEF, series, segment: "field" }), /Segment: FIELD VISIT/);
  assert.doesNotMatch(describeBrief({ ...EXAMPLE_BRIEF, series, piece: "explainer", segment: "field" }), /Segment:/);
});

test("a story of the format that never tags its move is blocked", () => {
  const tagged: Story = { ...DEMO_STORY, topics: DEMO_STORY.topics.map((t) => ({ ...t, moves: ["clipDrop", "turn", "button"] })) };
  const ids = (segment: "desk" | "correspondent" | "field") => storyProblems(tagged, { narrator: "with", segment }).map((p) => p.id);
  assert.ok(!ids("desk").some((id) => id.startsWith("jugada:remote") || id.startsWith("jugada:field")));
  assert.ok(ids("correspondent").includes("jugada:remoteStandup"));
  assert.ok(ids("field").includes("jugada:fieldVisit"));
});

test("sample mode shows the format, with its move tagged", () => {
  const series = listSeries().find((s) => s.type !== "music")!.id;
  assert.equal(demoStory({ series, segment: "desk" }), DEMO_STORY);
  for (const segment of ["correspondent", "field"] as const) {
    const story = demoStory({ series, segment });
    const move = segment === "correspondent" ? "remoteStandup" : "fieldVisit";
    assert.ok(story.topics.some((t) => t.moves.includes(move)), segment);
    assert.ok(!storyProblems(story, { narrator: "with", segment }).some((p) => p.id === `jugada:${move}`), segment);
    // Every line is said by a character of the story.
    const ids = new Set(story.characters.map((c) => c.id));
    for (const t of story.topics) for (const l of t.lines) assert.ok(ids.has(l.speaker), `${segment}: ${l.speaker}`);
  }
  // The robot manager appears only as a labelled concept.
  const report = demoStory({ series, segment: "correspondent" });
  assert.ok(report.claims.some((c) => /robot/i.test(c.claim) && c.concept && !c.real));
  assert.ok(demoStory({ series, segment: "field" }).verify.some((v) => /permiso/.test(v)));
});

test("an invented correspondent is offered to the cast, once", () => {
  const story = { characters: [...DEMO_STORY.characters, { id: INVENTED_CORRESPONDENT, name: "Ramiro, el corresponsal", role: "human" as const, voice: "Formal.", identity: "an invented man" }] };
  const series = { cast: [member("marta")], correspondent: "" };
  const found = inventedCorrespondent(story, { segment: "correspondent" }, series);
  assert.equal(found?.id, INVENTED_CORRESPONDENT);
  assert.equal(inventedCorrespondent(story, { segment: "desk" }, series), null);
  assert.equal(inventedCorrespondent(story, { segment: "correspondent" }, { cast: [member("marta"), member("ramiro")], correspondent: "ramiro" }), null);
  assert.equal(inventedCorrespondent(story, { segment: "correspondent" }, { cast: [member(INVENTED_CORRESPONDENT)], correspondent: "" }), null);

  const m = correspondentMember(found!, [member(INVENTED_CORRESPONDENT)]);
  assert.equal(m.id, `${INVENTED_CORRESPONDENT}-2`);
  assert.equal(m.kind, "character");
  assert.equal(m.identity, "an invented man");
  assert.match(m.note, /Formal\./);
  assert.equal(correspondentMember({ id: "Raro Id", name: "Doña Pía", voice: "", identity: "" }, []).id, "dona-pia");
});

test("correspondentMember never reuses a cast member's @ref", () => {
  const cast = [{ ...member("mara"), ref: "Mara" }, { ...member("mara-2"), ref: "mara2" }];
  const m = correspondentMember({ id: INVENTED_CORRESPONDENT, name: "Mara", voice: "", identity: "" }, cast);
  assert.equal(m.id, INVENTED_CORRESPONDENT);
  assert.equal(m.ref, "Mara3");
  assert.equal(correspondentMember({ id: INVENTED_CORRESPONDENT, name: "Juan", voice: "", identity: "" }, cast).ref, "Juan");
});
