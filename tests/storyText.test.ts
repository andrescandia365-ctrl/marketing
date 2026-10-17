// IDEAS idea 21: where the story's headline and subtitles sit, per position and format, and the text style's new
// fields (name colour, positions, another family) reading old series as before.
import assert from "node:assert/strict";
import { test } from "node:test";
import { safeRect } from "../shared/safeZone.ts";
import { DEFAULT_TEXT_STYLE, TextStyleSchema, markdownToSeries, seriesToMarkdown, EMPTY_SERIES } from "../shared/series.ts";
import { HEADLINE_POSITIONS, SUBTITLE_POSITIONS, storyTextLayout, type StoryTextInput } from "../shared/storyText.ts";

const FORMATS = { vertical: [1080, 1920], horizontal: [1920, 1080], preview: [360, 640] } as const;

const input = (w: number, h: number, patch: Partial<StoryTextInput> = {}): StoryTextInput => {
  const unit = Math.min(w, h);
  return { w, h, headline: unit * 0.075 * 1.18 * 2, subtitle: unit * 0.045 * 1.18 * 2, name: unit * 0.032 * 1.5, labelled: false, disclosure: true, ...patch };
};

test("the default places give exactly the old look (headline arriba, subtitle abajo)", () => {
  for (const [w, h] of Object.values(FORMATS)) {
    for (const labelled of [false, true]) {
      for (const disclosure of [false, true]) {
        const o = input(w, h, { labelled, disclosure });
        const unit = Math.min(w, h);
        const phone = h > w * 1.5;
        const safe = safeRect(w, h);
        const oldHead = phone ? safe.y + unit * (labelled ? 0.1 : 0.03) : h * 0.08;
        const floor = phone ? safe.y + safe.h - unit * (disclosure ? 0.06 : 0.01) : h - unit * (disclosure ? 0.13 : 0.08);
        const oldSub = Math.min(h * 0.8, floor - o.subtitle);
        const got = storyTextLayout(o);
        assert.equal(got.headlineTop, oldHead);
        assert.equal(got.subtitleTop, oldSub);
      }
    }
  }
});

test("every position keeps the text inside the 9:16 safe zone and the subtitle off the headline", () => {
  for (const [name, [w, h]] of Object.entries(FORMATS)) {
    const safe = safeRect(w, h);
    for (const headlinePosition of HEADLINE_POSITIONS) {
      for (const subtitlePosition of SUBTITLE_POSITIONS) {
        for (const labelled of [false, true]) {
          const o = input(w, h, { headlinePosition, subtitlePosition, labelled });
          const got = storyTextLayout(o);
          const where = `${name} ${headlinePosition}/${subtitlePosition}${labelled ? " labelled" : ""}`;
          const blockTop = got.subtitleTop - o.name;
          const blockEnd = got.subtitleTop + o.subtitle;
          const headEnd = got.headlineTop + o.headline;
          assert.ok(got.headlineTop >= got.area.top - 0.01 && headEnd <= got.area.bottom + 0.01, `${where}: headline in the area`);
          assert.ok(blockTop >= got.area.top - 0.01 && blockEnd <= got.area.bottom + 0.01, `${where}: subtitle in the area`);
          assert.ok(got.area.top >= safe.y && got.area.bottom <= safe.y + safe.h, `${where}: area inside the safe zone`);
          assert.ok(blockTop >= headEnd || blockEnd <= got.headlineTop, `${where}: the subtitle never sits over the headline`);
        }
      }
    }
  }
});

test("each position goes where it says", () => {
  const [w, h] = FORMATS.vertical;
  const solo = (p: Partial<StoryTextInput>) => storyTextLayout(input(w, h, { headline: 0, ...p }));
  const top = solo({ subtitlePosition: "top" });
  const center = solo({ subtitlePosition: "center" });
  const bottom = solo({ subtitlePosition: "bottom" });
  assert.ok(top.subtitleTop < center.subtitleTop && center.subtitleTop < bottom.subtitleTop);
  const o = input(w, h);
  const mid = center.subtitleTop - o.name + (o.name + o.subtitle) / 2;
  assert.ok(Math.abs(mid - h / 2) < 1, "centro is the middle of the frame");
  const head = storyTextLayout(input(w, h, { headlinePosition: "center", subtitle: 0, name: 0 }));
  assert.ok(Math.abs(head.headlineTop + o.headline / 2 - h / 2) < 1);
});

test("a subtitle that would land on the headline moves below it (or above when there is no room)", () => {
  const [w, h] = FORMATS.vertical;
  const o = input(w, h, { headlinePosition: "top", subtitlePosition: "top" });
  const got = storyTextLayout(o);
  assert.ok(got.subtitleTop - o.name > got.headlineTop + o.headline, "under the headline");
  const both = input(w, h, { headlinePosition: "center", subtitlePosition: "center" });
  const c = storyTextLayout(both);
  assert.ok(c.subtitleTop - both.name > c.headlineTop + both.headline);
  // A tall headline in the middle and a big subtitle: no room below, so it goes above.
  const tall = input(w, h, { headlinePosition: "center", subtitlePosition: "center", headline: h * 0.2, subtitle: h * 0.2 });
  const t = storyTextLayout(tall);
  assert.ok(t.subtitleTop + tall.subtitle <= t.headlineTop, "above the headline");
  // No room on either side: the headline goes up to the top and the subtitle sits under it.
  const taller = input(w, h, { headlinePosition: "center", subtitlePosition: "center", headline: h * 0.3, subtitle: h * 0.2 });
  const u = storyTextLayout(taller);
  assert.equal(u.headlineTop, u.area.top);
  assert.ok(u.subtitleTop - taller.name >= u.headlineTop + taller.headline);
  assert.ok(u.subtitleTop + taller.subtitle <= u.area.bottom);
});

test("the text style reads old series as today's look and checks the new fields", () => {
  const { nameColor: _n, subtitlePosition: _s, headlinePosition: _h, fontFamily: _f, ...old } = DEFAULT_TEXT_STYLE;
  const parsed = TextStyleSchema.parse(old);
  assert.equal(parsed.nameColor, "role");
  assert.equal(parsed.subtitlePosition, "bottom");
  assert.equal(parsed.headlinePosition, "top");
  assert.equal(parsed.fontFamily, "");
  assert.equal(TextStyleSchema.parse({ ...old, nameColor: "#ffcc00" }).nameColor, "#ffcc00");
  assert.equal(TextStyleSchema.safeParse({ ...old, nameColor: "red" }).success, false);
  assert.equal(TextStyleSchema.safeParse({ ...old, subtitlePosition: "left" }).success, false);
  assert.equal(TextStyleSchema.safeParse({ ...old, headlinePosition: "bottom" }).success, false, "the headline is never abajo");
  assert.equal(TextStyleSchema.safeParse({ ...old, font: "other", fontFamily: 'Inter"; x' }).success, false, "no quotes in a family");
  assert.equal(TextStyleSchema.parse({ ...old, font: "other", fontFamily: "Bebas Neue" }).fontFamily, "Bebas Neue");
  const style = { ...DEFAULT_TEXT_STYLE, font: "other" as const, fontFamily: "Manrope", nameColor: "#112233", subtitlePosition: "center" as const, headlinePosition: "center" as const };
  const md = seriesToMarkdown({ ...EMPTY_SERIES, name: "IMAN", textStyle: style });
  assert.deepEqual(markdownToSeries(md, "iman").textStyle, style, "saved in the bible and read back");
  const oldMd = md.replace(/Estilo de texto: .*/, `Estilo de texto: ${JSON.stringify(old)}`);
  assert.deepEqual(markdownToSeries(oldMd, "iman").textStyle, DEFAULT_TEXT_STYLE);
});
