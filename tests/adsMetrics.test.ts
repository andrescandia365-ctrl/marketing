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
  hookWatch,
  hooksFromWire,
  measuredWinners,
  organicHook,
  organicNote,
  parseMetricsCsv,
  pieceStats,
  rankHooks,
  sameSeriesName,
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
  const stats = pieceStats(parsed.rows).H5;
  assert.equal(stats.hookRate, 2100 / 3000);
  assert.deepEqual(hookWatch(stats), { seconds: 2, views: 2100 });
  assert.equal(enoughData(stats, MIN_IMPRESSIONS), true);
  const s = emptyAds("iman");
  s.hooks.push(
    ...hooksFromWire(s, { hooks: [{ text: "Se ve en dos segundos", level: 3, angle: "pain", formula: "question", ...prompts }], note: "" }, 3, "ai", "approved"),
  );
  s.metrics = [{ ...row, name: "H1-M2-C1", adId: "H1-M2-C1" }];
  const line = hookPatterns(s).winners[0];
  assert.match(line, /70% ven 2 s, 2100 vistas/);
  assert.doesNotMatch(line, /ven 3 s/);
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
  s.metrics = parseMetricsCsv("Ad name,Impressions,3-second video plays\nH1-M1-C1,500,100\n").rows;
  const thin = hookPatterns(s);
  assert.match(thin.organic[0], /sin datos suficientes/);
  assert.doesNotMatch(thin.organic[0], /sin medir/);
  assert.equal(organicNote({ impressions: 500 }), "sin datos suficientes");
  assert.equal(organicNote({ impressions: 0 }), "del orgánico, sin medir");
  assert.equal(organicNote(undefined), "del orgánico, sin medir");
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

test("a copied or prefixed export name still yields the ad id, and another series stays out", () => {
  const csv = `Ad name,Impressions,3-second video plays
"IMAN_N2_H12-M3-C2_15s_9x16 - Copy",2000,800
"IMAN_N2_H11-M3-C2_15s_9x16 – Copia",1100,400
"Promo IMAN_N2_H13-M3-C2_15s_9x16",1500,600
"MASOGAR_N1_H9-M9-C9_15s_9x16 - Copy",9000,100
H3-M1-C1,400,100
`;
  const parsed = parseMetricsCsv(csv, "iman");
  assert.equal(parsed.otherSeries, 1);
  assert.deepEqual(
    parsed.rows.map((r) => r.adId),
    ["H12-M3-C2", "H11-M3-C2", "H13-M3-C2", "H3-M1-C1"],
  );
  assert.equal(parsed.rows[0].impressions, 2000);
  assert.equal(pieceStats(parsed.rows).H12.impressions, 2000);
  assert.equal(sameSeriesName("IMAN_N2_H12-M3-C2_15s_9x16 - Copy", "iman"), true);
  assert.equal(sameSeriesName("MASOGAR_N1_H9-M9-C9_15s_9x16 – Copia", "iman"), false);
  assert.equal(sameSeriesName("H3-M1-C1", "iman"), true);
  const accented = parseMetricsCsv("Ad name,Impressions\nMÁSHOGAR_N2_H14-M3-C2_45s_9x16,1200\n");
  assert.equal(accented.rows[0].adId, "H14-M3-C2");
  assert.equal(accented.rows[0].impressions, 1200);
  assert.equal(sameSeriesName("MÁSHOGAR_N2_H14-M3-C2_45s_9x16", "mashogar"), true);
  assert.equal(sameSeriesName("MÁSHOGAR_N2_H14-M3-C2_45s_9x16", "iman"), false);
});

test("Meta's English 3-second view headers are views, not a missing column", () => {
  const views = parseMetricsCsv(fixture("meta-3s-views.csv"), "iman");
  assert.equal(views.rows[0].adId, "H4-M1-C1");
  assert.equal(views.rows[0].views3s, 640);
  assert.equal(views.rows[0].views, 1000);
  assert.ok(views.found.includes("views3s"));
  const at = parseMetricsCsv(fixture("meta-3s-at.csv"));
  assert.equal(at.rows[0].views3s, 250);
  assert.ok(at.found.includes("views3s"));
  assert.equal(at.missing.includes("views3s"), false);
  const singular = parseMetricsCsv("Ad name,Impressions,Video views at 3 second\nH4-M1-C1,1000,180\n");
  assert.equal(singular.rows[0].views3s, 180);
});
