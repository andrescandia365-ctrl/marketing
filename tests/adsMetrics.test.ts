// Phase 1: platform CSVs, the impression floor, exported ad names, and organic hooks that are not winners yet.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  AdsStateSchema,
  MIN_IMPRESSIONS,
  adExportName,
  emptyAds,
  enoughData,
  exportCsv,
  hookPatterns,
  hooksFromWire,
  measuredWinners,
  organicHook,
  parseMetricsCsv,
  pieceStats,
  rankHooks,
  seriesToken,
} from "../shared/ads.ts";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const prompts = { onScreenText: "", visualPrompt: "", videoPrompt: "" };

test("Meta in English does not read a cost rate or ThruPlay as a 3-second view", () => {
  const parsed = parseMetricsCsv(fixture("meta-en.csv"), "iman");
  assert.equal(parsed.otherSeries, 1);
  assert.equal(parsed.rows.length, 2);
  const named = parsed.rows[0];
  assert.equal(named.adId, "H1-M1-C1");
  assert.equal(named.impressions, 2000);
  assert.equal(named.views3s, 800);
  assert.equal(named.views, 1500);
  assert.equal(named.clicks, 40);
  assert.equal(named.conversions, 4);
  assert.equal(named.spend, 30);
  assert.equal(named.views2s, 0);
  assert.equal(named.views6s, 0);
  const old = parsed.rows[1];
  assert.equal(old.name, "H3-M1-C1");
  assert.equal(old.adId, "H3-M1-C1");
  assert.equal(old.impressions, 400);
  assert.equal(old.views3s, 100);
  assert.ok(!parsed.rows.some((r) => r.adId === "H9-M9-C9"));
  assert.equal(parseMetricsCsv(fixture("meta-en.csv")).rows.length, 3);
});

test("Meta in Spanish reads the series token in any case and keeps the Spanish numbers", () => {
  const parsed = parseMetricsCsv(fixture("meta-es.csv"), "iman");
  assert.equal(parsed.otherSeries, 0);
  assert.equal(parsed.rows.length, 1);
  const row = parsed.rows[0];
  assert.equal(row.adId, "H2-M2-C1");
  assert.equal(row.impressions, 2000);
  assert.equal(row.views3s, 1200);
  assert.equal(row.views, 1800);
  assert.equal(row.spend, 3400.25);
  assert.notEqual(row.views3s, 9999);
  const accent = parseMetricsCsv("Nombre del anuncio;Reproducciones de vídeo de 3 segundos;Impresiones\nH1-M1-C1;10;100\n");
  assert.equal(accent.rows[0].views3s, 10);
  assert.ok(accent.found.includes("views3s"));
});

test("TikTok's 2-second and 6-second views, Cost and Clicks stay in their own columns", () => {
  const parsed = parseMetricsCsv(fixture("tiktok.csv"), "iman");
  assert.equal(parsed.rows.length, 1);
  const row = parsed.rows[0];
  assert.equal(row.adId, "H5-M2-C1");
  assert.equal(row.impressions, 3000);
  assert.equal(row.clicks, 90);
  assert.equal(row.spend, 12);
  assert.equal(row.views2s, 2100);
  assert.equal(row.views6s, 900);
  assert.equal(row.views, 2400);
  assert.equal(row.views3s, 0);
  assert.equal(pieceStats(parsed.rows).H5.hookRate, 0);
  assert.equal(enoughData(pieceStats(parsed.rows).H5, MIN_IMPRESSIONS), true);
});

test("a row under the impression minimum is ranked and is not a winner", () => {
  const s = emptyAds("iman");
  s.hooks.push(
    ...hooksFromWire(
      s,
      {
        hooks: [
          { text: "Con datos", level: 2, angle: "pain", formula: "question", ...prompts },
          { text: "Justo mil", level: 2, angle: "curiosity", formula: "number", ...prompts },
          { text: "Pocas", level: 2, angle: "desire", formula: "stop", ...prompts },
        ],
        note: "",
      },
      3,
      "ai",
      "approved",
    ),
  );
  s.metrics = parseMetricsCsv(`Ad name,Impressions,3-second video plays,Video plays
H1-M1-C1,2000,800,1500
H2-M1-C1,1000,100,200
H3-M1-C1,999,400,500
`).rows;
  assert.deepEqual(rankHooks(s).map((r) => r.id).sort(), ["H1", "H2", "H3"]);
  assert.deepEqual(measuredWinners(rankHooks(s)).map((r) => r.id).sort(), ["H1", "H2"]);
  assert.equal(enoughData({ impressions: 1000 }), true);
  assert.equal(enoughData({ impressions: 999 }), false);
  const patterns = hookPatterns(s);
  assert.equal(patterns.winners.length, 2);
  assert.match(patterns.winners[0], /Con datos/);
  assert.equal(patterns.organic.length, 0);
});

test("an organic hook is not a winner until it is measured, and then it is not listed twice", () => {
  const s = emptyAds("iman");
  s.hooks.push(organicHook(s, "La góndola vacía a las seis", 2, 3, "De una historia"));
  s.hooks.push(
    ...hooksFromWire(s, { hooks: [{ text: "Medido", level: 2, angle: "pain", formula: "question", ...prompts }], note: "" }, 3, "ai", "approved"),
  );
  s.metrics = parseMetricsCsv("Ad name,Impressions,3-second video plays\nH2-M1-C1,2000,800\n").rows;
  const before = hookPatterns(s);
  assert.deepEqual(before.organic, ["La góndola vacía a las seis (del orgánico, sin medir)"]);
  assert.match(before.winners.join("\n"), /Medido/);
  assert.doesNotMatch(before.winners.join("\n"), /góndola/);
  s.metrics = parseMetricsCsv("Ad name,Impressions,3-second video plays\nH1-M1-C1,5000,2000\nH2-M1-C1,2000,800\n").rows;
  const after = hookPatterns(s);
  assert.equal(after.organic.length, 0);
  assert.match(after.winners.join("\n"), /góndola/);
  assert.match(after.winners.join("\n"), /Medido/);
});

test("an old metrics row without 2 s or 6 s views still parses", () => {
  const row = {
    name: "H1-M1-C1",
    adId: "H1-M1-C1",
    impressions: 10,
    views3s: 4,
    views: 8,
    avgWatch: 1,
    clicks: 1,
    conversions: 0,
    spend: 2,
  };
  const state = AdsStateSchema.parse({ ...emptyAds("iman"), metrics: [row] });
  assert.equal(state.metrics[0].views2s, 0);
  assert.equal(state.metrics[0].views6s, 0);
  assert.equal(pieceStats(state.metrics).H1.views2s, 0);
});

test("the exported ad name uses the series id, and the file name stays the raw id", () => {
  assert.equal(seriesToken("iman"), "IMAN");
  assert.equal(seriesToken("masogar"), "MASOGAR");
  assert.equal(seriesToken("Máshogar"), "MASHOGAR");
  assert.equal(adExportName("iman", 2, "H12-M3-C2", 45), "IMAN_N2_H12-M3-C2_45s_9x16");
  assert.equal(adExportName("iman", 2, "H12v3-M3-C2", 45), "IMAN_N2_H12v3-M3-C2_45s_9x16");
  assert.equal(adExportName("foo-bar", 1, "H1-M1-C1", 15), "FOO-BAR_N1_H1-M1-C1_15s_9x16");
  const s = emptyAds("iman");
  const csv = exportCsv(
    {
      id: "tanda-1",
      createdAt: "2026-10-24T00:00:00.000Z",
      seconds: 45,
      mode: "full",
      rules: { sameLevel: true },
      ads: [{ id: "H12v3-M3-C2", hookId: "H12", meatId: "M3", ctaId: "C2", level: 2, hookVoice: "v3" }],
      copies: {},
      files: { "H12v3-M3-C2": "H12v3-M3-C2.mp4" },
    },
    [],
    [],
    [],
    undefined,
    "iman",
  );
  const line = csv.split("\n")[1];
  assert.ok(line.startsWith("IMAN_N2_H12v3-M3-C2_45s_9x16,"));
  assert.ok(line.includes("H12v3-M3-C2.mp4"));
  const plain = exportCsv(
    {
      id: "tanda-1",
      createdAt: "2026-10-24T00:00:00.000Z",
      seconds: 15,
      mode: "full",
      rules: { sameLevel: true },
      ads: [{ id: "H1-M1-C1", hookId: "H1", meatId: "M1", ctaId: "C1", level: 2 }],
      copies: {},
      files: {},
    },
    s.hooks,
    s.meats,
    s.ctas,
  );
  assert.ok(plain.split("\n")[1].startsWith("H1-M1-C1,"));
});
