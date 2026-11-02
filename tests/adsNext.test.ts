// The next batch is pure code: rank what the CSV already measured, say why, archive on apply, restore on undo.
import assert from "node:assert/strict";
import { test } from "node:test";
import { AdsStateSchema, EMPTY_OFFER, emptyAds, MIN_IMPRESSIONS, pieceStats, type MetricRow, type PieceStatus } from "../shared/ads.ts";
import {
  DEFAULT_KEEP_SHARE,
  MIN_ARCHIVE,
  keepCount,
  metricColumnGap,
  pieceIdOrder,
  planApply,
  proposeNext,
  rowsForVoice,
  undoChanges,
  undoSkipNote,
  undoStatusPlan,
  undoVoicePlan,
  variantFacts,
  variantHookRefusal,
  variantWinnerRefusal,
  type NextPiece,
  type NextVoice,
} from "../shared/adsNext.ts";
import { hooksTask } from "../server/adsWriter.ts";
import { isAdId, parseAdId } from "../shared/voiceVariants.ts";

function row(adId: string, extra: Partial<MetricRow> = {}): MetricRow {
  return {
    name: adId,
    adId,
    impressions: 4200,
    views3s: 0,
    views2s: 0,
    views6s: 0,
    views: 0,
    avgWatch: 0,
    clicks: 0,
    conversions: 0,
    spend: 0,
    ...extra,
  };
}

const hook = (id: string, status: PieceStatus = "approved"): NextPiece => ({
  id,
  kind: "hook",
  status,
  text: `Texto ${id}`,
  level: 2,
  angle: "pain",
  formula: "question",
});

test("keep count rounds up and never keeps a tie by stretching the cut", () => {
  assert.equal(MIN_IMPRESSIONS, 1000);
  assert.equal(DEFAULT_KEEP_SHARE, 0.2);
  assert.equal(MIN_ARCHIVE, 3);
  assert.equal(keepCount(0, 0.2), 0);
  assert.equal(keepCount(10, 0), 0);
  assert.equal(keepCount(10, 1), 10);
  assert.equal(keepCount(10, 0.2), 2);
  assert.equal(keepCount(5, 0.2), 1);
  assert.equal(keepCount(3, 0.2), 1);
  assert.equal(keepCount(1, 0.2), 1);
  assert.ok(pieceIdOrder("H2", "H10") < 0);
  assert.ok(pieceIdOrder("H10", "H2") > 0);
});

test("the example: H12 stays, H4 is archived, H9 has too little data, and the why quotes the numbers", () => {
  const proposal = proposeNext({
    pieces: [hook("H4"), hook("H12"), hook("H8"), hook("H9", "pending")],
    rows: [
      row("H12-M1-C1", { views3s: 1596, impressions: 4200 }),
      row("H4-M1-C1", { views3s: 168, impressions: 4200 }),
      row("H8-M1-C1", { views3s: 840, impressions: 4200 }),
      row("H9-M1-C1", { views3s: 40, impressions: 400 }),
    ],
  });
  const byId = Object.fromEntries(proposal.lines.map((l) => [l.id, l]));
  assert.equal(byId.H12.verdict, "ganador");
  assert.equal(byId.H12.action, "keep");
  assert.equal(byId.H4.verdict, "perdedor");
  assert.equal(byId.H4.action, "drop");
  assert.equal(byId.H8.action, "drop");
  assert.equal(byId.H9.verdict, "sin datos suficientes");
  assert.equal(byId.H9.action, "leave");
  assert.match(byId.H12.why, /H12 sigue: 38 % de retención a 3 s con 4\.200 impresiones \(la media de la tanda es 21 %\)/);
  assert.match(byId.H12.why, /1 de 3 con datos/);
  assert.match(byId.H4.why, /H4 se archiva: 4 % de retención a 3 s con 4\.200 impresiones/);
  assert.match(byId.H9.why, /H9 sin datos suficientes: 400 impresiones \(hacen falta 1\.000\)/);
  assert.equal(proposal.voices.length, 0);
});

test("fewer than 3 pieces with data are ranked and not archived", () => {
  const proposal = proposeNext({
    pieces: [hook("H10"), hook("H2")],
    rows: [row("H10-M1-C1", { views3s: 2000 }), row("H2-M1-C1", { views3s: 400 })],
    keepShare: 0.2,
  });
  const byId = Object.fromEntries(proposal.lines.map((l) => [l.id, l]));
  assert.equal(byId.H10.action, "keep");
  assert.equal(byId.H2.action, "leave");
  assert.equal(byId.H2.verdict, "perdedor");
  assert.match(byId.H2.why, /Con menos de 3 piezas con datos no se archiva nada/);
  assert.doesNotMatch(byId.H2.why, /se archiva:/);
  assert.deepEqual(planApply(proposal, [{ id: "H10", status: "approved" }, { id: "H2", status: "approved" }], {}, {}).status, []);
});

test("a tied score stays with the last kept one, and ids sort by number", () => {
  const proposal = proposeNext({
    pieces: [hook("H10"), hook("H4"), hook("H2"), hook("H3")],
    rows: [
      row("H2-M1-C1", { views3s: 1000 }),
      row("H10-M1-C1", { views3s: 1000 }),
      row("H3-M1-C1", { views3s: 200 }),
      row("H4-M1-C1", { views3s: 100 }),
    ],
    keepShare: 0.2,
  });
  assert.deepEqual(
    proposal.lines.map((l) => l.id),
    ["H2", "H10", "H3", "H4"],
  );
  const byId = Object.fromEntries(proposal.lines.map((l) => [l.id, l]));
  assert.equal(byId.H2.action, "keep");
  assert.equal(byId.H10.action, "keep");
  assert.match(byId.H2.why, /Empata con el último que se queda y se quedan juntos/);
  assert.match(byId.H10.why, /Empata con el último que se queda y se quedan juntos/);
  assert.equal(byId.H3.action, "drop");
  assert.equal(byId.H4.action, "drop");
  assert.doesNotMatch(byId.H3.why, /Empata/);
});

test("ten hooks with data keep the top two", () => {
  const pieces = Array.from({ length: 10 }, (_, i) => hook(`H${i + 1}`));
  const rows = pieces.map((p, i) => row(`${p.id}-M1-C1`, { views3s: (i + 1) * 100, impressions: 1000 }));
  const proposal = proposeNext({ pieces, rows });
  const kept = proposal.lines.filter((l) => l.action === "keep").map((l) => l.id);
  const dropped = proposal.lines.filter((l) => l.action === "drop");
  assert.deepEqual(kept.sort(), ["H10", "H9"]);
  assert.equal(dropped.length, 8);
  assert.ok(dropped.every((l) => l.verdict === "perdedor"));
});

test("meats rank by watch time and CTAs by rate, each against the mean of rates", () => {
  const proposal = proposeNext({
    pieces: [
      { id: "M3", kind: "meat", status: "approved", text: "El cuerpo" },
      { id: "M2", kind: "meat", status: "approved", text: "El medio" },
      { id: "M1", kind: "meat", status: "approved", text: "El otro" },
      { id: "C2", kind: "cta", status: "approved", text: "El llamado" },
      { id: "C3", kind: "cta", status: "approved", text: "El otro llamado" },
      { id: "C1", kind: "cta", status: "pending", text: "El flojo" },
    ],
    rows: [
      row("H1-M3-C9", { avgWatch: 18.2, impressions: 4200 }),
      row("H1-M2-C9", { avgWatch: 9, impressions: 4200 }),
      row("H1-M1-C9", { avgWatch: 4, impressions: 4200 }),
      row("H1-M9-C2", { clicks: 48, conversions: 6, impressions: 4200 }),
      row("H1-M9-C3", { clicks: 30, conversions: 4, impressions: 4200 }),
      row("H1-M9-C1", { clicks: 12, conversions: 2, impressions: 4200 }),
    ],
  });
  const byId = Object.fromEntries(proposal.lines.map((l) => [l.id, l]));
  assert.equal(byId.M3.action, "keep");
  assert.match(byId.M3.why, /M3 sigue: 18,2 s de visionado promedio con 4\.200 impresiones \(la media de la tanda es 10,4 s\)/);
  assert.equal(byId.M1.action, "drop");
  assert.equal(byId.C2.action, "keep");
  assert.match(byId.C2.why, /C2 sigue: 0,1 % de conversión y 1,1 % de clics en 4\.200 impresiones \(la media de la tanda es 0,1 % de conversión y 0,7 % de clics\)/);
  assert.equal(byId.C1.verdict, "perdedor");
  assert.equal(byId.C1.action, "drop");
});

test("voice winners come from the ad id, and an old id matches the pieces without naming a voice", () => {
  const voices: NextVoice[] = [
    { pieceId: "H12", id: "v1", name: "Calma" },
    { pieceId: "H12", id: "v3", name: "Firme" },
  ];
  const proposal = proposeNext({
    pieces: [hook("H12")],
    voices,
    rows: [
      row("H12v3-M1-C1", { views3s: 2000, impressions: 4000 }),
      row("H12v1-M1-C1", { views3s: 400, impressions: 4000 }),
    ],
  });
  const v3 = proposal.voices.find((v) => v.voiceId === "v3");
  const v1 = proposal.voices.find((v) => v.voiceId === "v1");
  assert.equal(v3?.verdict, "ganador");
  assert.equal(v3?.pick, true);
  assert.match(v3?.why ?? "", /H12 v3 \(Firme\) sigue y queda elegida/);
  assert.equal(v1?.verdict, "perdedor");
  assert.equal(v1?.pick, false);
  assert.match(v1?.why ?? "", /queda destildada/);
  const tied = proposeNext({
    pieces: [hook("H12")],
    voices,
    rows: [
      row("H12v3-M1-C1", { views3s: 2000, impressions: 4000 }),
      row("H12v1-M1-C1", { views3s: 2000, impressions: 4000 }),
    ],
  });
  assert.equal(tied.voices.find((v) => v.voiceId === "v1")?.pick, true);
  assert.match(tied.voices.find((v) => v.voiceId === "v3")?.why ?? "", /empata y queda destildada: se queda el id más bajo/);
  const quiet = proposeNext({
    pieces: [hook("H12")],
    voices,
    rows: [row("H12v1-M1-C1", { impressions: 100, views3s: 10 })],
    voiceChoice: { H12: { picked: ["v3"], known: ["v1", "v3"] } },
  });
  assert.ok(quiet.voices.every((v) => v.verdict === "sin datos suficientes"));
  assert.equal(quiet.voices.find((v) => v.voiceId === "v3")?.pick, true);
  assert.equal(quiet.voices.find((v) => v.voiceId === "v1")?.pick, false);
  assert.match(quiet.voices[0].why, /Queda como estaba/);
  assert.equal(proposeNext({ pieces: [hook("H12")], voices: [voices[0]], rows: [] }).voices.length, 0);

  const old = parseAdId("H12-M3-C2");
  assert.equal(old?.hookId, "H12");
  assert.equal(old?.meatId, "M3");
  assert.equal(old?.ctaId, "C2");
  assert.equal(old?.hookVoice, undefined);
  assert.equal(isAdId("h1-m1-c1"), false);
  const legacy = row("H12-M3-C2", { views3s: 1596, avgWatch: 18.2, clicks: 48, conversions: 6 });
  const stats = pieceStats([legacy]);
  assert.equal(stats.H12.impressions, 4200);
  assert.equal(stats.M3.impressions, 4200);
  assert.equal(stats.C2.impressions, 4200);
  assert.equal(rowsForVoice([legacy], "H12", "v3").length, 0);
  const ranked = proposeNext({
    pieces: [hook("H12"), { id: "M3", kind: "meat", status: "approved", text: "cuerpo" }, { id: "C2", kind: "cta", status: "approved", text: "llamado" }],
    voices,
    rows: [legacy],
  });
  assert.equal(ranked.lines.find((l) => l.id === "H12")?.action, "keep");
  assert.equal(ranked.lines.find((l) => l.id === "M3")?.action, "keep");
  assert.equal(ranked.lines.find((l) => l.id === "C2")?.action, "keep");
  assert.ok(ranked.voices.every((v) => v.verdict === "sin datos suficientes"));
  assert.ok(ranked.voices.every((v) => v.pick));
});

test("apply archives a loser and approves a pending winner, and undo restores a missing voice pick as null", () => {
  const proposal = proposeNext({
    pieces: [hook("H12", "pending"), hook("H4", "approved"), hook("H9", "pending"), hook("H1", "approved")],
    voices: [
      { pieceId: "H12", id: "v1", name: "" },
      { pieceId: "H12", id: "v3", name: "Firme" },
    ],
    rows: [
      row("H12v3-M1-C1", { views3s: 3600, impressions: 4000 }),
      row("H12v1-M1-C1", { views3s: 800, impressions: 4000 }),
      row("H4-M1-C1", { views3s: 168 }),
      row("H1-M1-C1", { views3s: 2000 }),
      row("H9-M1-C1", { impressions: 400, views3s: 10 }),
    ],
    keepShare: 0.5,
  });
  const pieces = [
    { id: "H12", status: "pending" as const },
    { id: "H4", status: "approved" as const },
    { id: "H9", status: "pending" as const },
    { id: "H1", status: "approved" as const },
  ];
  const plan = planApply(proposal, pieces, {}, { H12: ["v1", "v3"] });
  assert.deepEqual(
    plan.status.map((s) => [s.id, s.from, s.to]),
    [
      ["H12", "pending", "approved"],
      ["H4", "approved", "archived"],
    ],
  );
  assert.equal(plan.voices.length, 1);
  assert.equal(plan.voices[0].before, null);
  assert.deepEqual(plan.voices[0].after.picked, ["v3"]);
  const again = planApply(proposal, [{ id: "H12", status: "approved" }, { id: "H4", status: "archived" }, { id: "H1", status: "approved" }], {
    H12: plan.voices[0].after,
  }, { H12: ["v1", "v3"] });
  assert.deepEqual(again.status, []);
  assert.deepEqual(again.voices, []);
  const back = undoChanges(plan);
  assert.deepEqual(
    back.status.map((s) => [s.id, s.to]),
    [
      ["H12", "pending"],
      ["H4", "approved"],
    ],
  );
  assert.equal(back.voices[0].restore, null);
  const missing = proposeNext({ pieces: [hook("H8")], rows: [] });
  assert.equal(missing.lines[0].action, "leave");
  assert.deepEqual(planApply(missing, [{ id: "H8", status: "approved" }], {}, {}).status, []);
});

test("TikTok rows with only 2 s views rank on those views, and a real 3 s count stays 3 s", () => {
  const proposal = proposeNext({
    pieces: [hook("H5"), hook("H6")],
    rows: [
      row("H5-M2-C1", { impressions: 3000, views3s: 0, views2s: 2100, views6s: 900, views: 2400 }),
      row("H6-M2-C1", { impressions: 3000, views3s: 0, views2s: 300, views: 2400 }),
    ],
    keepShare: 0.5,
  });
  const h5 = proposal.lines.find((l) => l.id === "H5");
  const h6 = proposal.lines.find((l) => l.id === "H6");
  assert.equal(h5?.verdict, "ganador");
  assert.equal(h6?.verdict, "perdedor");
  assert.match(h5?.why ?? "", /70 % de retención a 2 s con 3\.000 impresiones/);
  assert.doesNotMatch(h5?.why ?? "", /a 3 s/);
  assert.match(h6?.why ?? "", /10 % de retención a 2 s/);
  const voices = proposeNext({
    pieces: [hook("H5")],
    voices: [
      { pieceId: "H5", id: "v1", name: "Baja" },
      { pieceId: "H5", id: "v2", name: "Alta" },
    ],
    rows: [
      row("H5v2-M2-C1", { impressions: 3000, views3s: 0, views2s: 2100 }),
      row("H5v1-M2-C1", { impressions: 3000, views3s: 0, views2s: 300 }),
    ],
  });
  const alta = voices.voices.find((v) => v.voiceId === "v2");
  assert.equal(alta?.verdict, "ganador");
  assert.equal(voices.voices.find((v) => v.voiceId === "v1")?.verdict, "perdedor");
  assert.match(alta?.why ?? "", /70 % de retención a 2 s/);
  assert.doesNotMatch(alta?.why ?? "", /a 3 s/);
  const both = proposeNext({
    pieces: [hook("H7")],
    rows: [row("H7-M1-C1", { impressions: 3000, views3s: 900, views2s: 2100 })],
  });
  assert.match(both.lines[0].why, /30 % de retención a 3 s/);
  const facts = variantFacts(
    { id: "H5", text: "Llega tarde", level: 3, angle: "pain", formula: "question" },
    { impressions: 3000, views3s: 0, views2s: 2100, hookRate: 0.7 },
    2,
  );
  assert.match(facts.line, /70% ven 2 s, 2100 vistas de 2 s, 3000 impresiones/);
  assert.doesNotMatch(facts.line, /ven 3 s/);
});

test("a variant under the impression floor cannot be sent as a winner", () => {
  assert.equal(variantWinnerRefusal("H9", { impressions: 1000 }), null);
  assert.equal(variantWinnerRefusal("H9", { impressions: 400 }, 400), null);
  const thin = variantWinnerRefusal("H9", { impressions: 400 });
  assert.match(thin ?? "", /H9 tiene 400 impresiones/);
  assert.match(thin ?? "", /mínimo para mandarlo como ganador es 1000/);
  assert.match(thin ?? "", /No se puede mandar como ganador/);
  assert.match(variantWinnerRefusal("H3", undefined) ?? "", /H3 tiene 0 impresiones/);
});

test("variant facts quote the stored numbers, and the hook task locks the angle only when asked", () => {
  const facts = variantFacts(
    { id: "H12", text: "Otra vez tarde", level: 2, angle: "pain", formula: "question" },
    { impressions: 4200, views3s: 1596, views2s: 0, hookRate: 0.38 },
    3,
  );
  assert.equal(facts.count, 3);
  assert.equal(facts.angle, "pain");
  assert.match(facts.line, /Otra vez tarde \(H12, N2, angle pain, formula question, 38% ven 3 s, 1596 vistas de 3 s, 4200 impresiones\)/);
  assert.match(facts.line, /Write 3 new hooks in this same angle and formula\. Never reuse these words\./);
  const zeros = variantFacts({ id: "H1", text: "Nada", level: 1, angle: "pain", formula: "question" }, undefined, 0);
  assert.equal(zeros.count, 1);
  assert.match(zeros.line, /0% ven 3 s, 0 vistas de 3 s, 0 impresiones/);
  const req = { levels: [2] as const, count: 3, seconds: 15 as const, winners: [facts.line], existing: [], language: "es" as const };
  const focused = hooksTask("iman", EMPTY_OFFER, "grok-imagine", { ...req, levels: [2], focus: { angle: "pain", formula: "question" } });
  assert.match(focused.prompt, /Write every hook in this exact angle and formula, and no other: angle pain, formula question\./);
  assert.doesNotMatch(focused.prompt, /Cover a grid inside each level/);
  assert.match(focused.prompt, /4200 impresiones/);
  const open = hooksTask("iman", EMPTY_OFFER, "grok-imagine", { ...req, levels: [2] });
  assert.match(open.prompt, /Cover a grid inside each level/);
  assert.doesNotMatch(open.prompt, /this exact angle and formula/);
});

test("an old campaign file still loads, and archived is a status", () => {
  const raw = { ...emptyAds("iman") } as Record<string, unknown>;
  delete raw.statics;
  delete raw.keepPercent;
  delete raw.nextUndo;
  const parsed = AdsStateSchema.parse(raw);
  assert.equal(parsed.hooks.length, 0);
  assert.deepEqual(parsed.statics, {});
  assert.equal(parsed.keepPercent, 20);
  assert.equal(parsed.nextUndo, null);
  const archived = AdsStateSchema.parse({
    ...emptyAds("iman"),
    hooks: [
      {
        id: "H1",
        kind: "hook",
        text: "Hola",
        onScreenText: "",
        visualPrompt: "",
        videoPrompt: "",
        seconds: 3,
        status: "archived",
        source: "ai",
        createdAt: "2026-10-01",
        level: 1,
        angle: "pain",
        formula: "question",
      },
    ],
  });
  assert.equal(archived.hooks[0].status, "archived");
  const oldId = parseAdId("H12-M3-C2");
  assert.deepEqual([oldId?.hookId, oldId?.meatId, oldId?.ctaId], ["H12", "M3", "C2"]);
});

test("a rejected piece is not ranked, not counted, and not changed", () => {
  const proposal = proposeNext({
    pieces: [hook("H1", "rejected"), hook("H2"), hook("H3"), hook("H4")],
    rows: [
      row("H1-M1-C1", { views3s: 3780 }),
      row("H2-M1-C1", { views3s: 1596 }),
      row("H3-M1-C1", { views3s: 840 }),
      row("H4-M1-C1", { views3s: 168 }),
    ],
  });
  assert.equal(proposal.lines.some((l) => l.id === "H1"), false);
  assert.match(proposal.lines.find((l) => l.id === "H2")?.why ?? "", /1 de 3 con datos/);
  assert.match(proposal.lines.find((l) => l.id === "H2")?.why ?? "", /la media de la tanda es 21 %/);
  const forced = planApply(
    { lines: [{ id: "H1", kind: "hook", action: "keep", verdict: "ganador", impressions: 4200, why: "" }], voices: [] },
    [{ id: "H1", status: "rejected" }],
    {},
    {},
  );
  assert.deepEqual(forced.status, []);
  const dropped = planApply(
    { lines: [{ id: "H1", kind: "hook", action: "drop", verdict: "perdedor", impressions: 4200, why: "" }], voices: [] },
    [{ id: "H1", status: "rejected" }],
    {},
    {},
  );
  assert.deepEqual(dropped.status, []);
});

test("zero impressions are never ranked, and a keep of 0 % archives nothing", () => {
  const none = proposeNext({
    pieces: [hook("H2"), hook("H3"), hook("H4")],
    rows: [row("H2-M1-C1", { impressions: 0, views3s: 0 }), row("H3-M1-C1", { impressions: 0, views3s: 0 }), row("H4-M1-C1", { impressions: 500, views3s: 100 })],
    minImpressions: 0,
  });
  assert.equal(none.lines.find((l) => l.id === "H2")?.verdict, "sin datos suficientes");
  assert.equal(none.lines.find((l) => l.id === "H2")?.action, "leave");
  assert.equal(none.lines.find((l) => l.id === "H4")?.action, "keep");
  const zeroShare = proposeNext({
    pieces: [hook("H2", "pending"), hook("H3"), hook("H4"), hook("H5")],
    rows: [row("H2-M1-C1", { views3s: 2000 }), row("H3-M1-C1", { views3s: 1000 }), row("H4-M1-C1", { views3s: 400 }), row("H5-M1-C1", { views3s: 100 })],
    keepShare: 0,
  });
  assert.ok(zeroShare.lines.every((l) => l.action === "leave"));
  assert.match(zeroShare.lines[0].why, /Quedarse con el 0 % no aprueba ni archiva/);
  assert.deepEqual(planApply(zeroShare, zeroShare.lines.map((l) => ({ id: l.id, status: "approved" as const })), {}, {}).status, []);
});

test("a missing ranking column is named and is not ranked as zeros", () => {
  const meats = [
    { id: "M1", kind: "meat" as const, status: "approved" as const, text: "a" },
    { id: "M2", kind: "meat" as const, status: "approved" as const, text: "b" },
    { id: "M3", kind: "meat" as const, status: "approved" as const, text: "c" },
  ];
  const ctas = [
    { id: "C1", kind: "cta" as const, status: "approved" as const, text: "a" },
    { id: "C2", kind: "cta" as const, status: "approved" as const, text: "b" },
  ];
  const noWatch = [row("H1-M1-C1", { avgWatch: 0, clicks: 10, conversions: 1 }), row("H1-M2-C1", { avgWatch: 0, clicks: 4, conversions: 0 })];
  assert.equal(metricColumnGap("meat", noWatch), "tiempo promedio");
  assert.equal(metricColumnGap("cta", noWatch), null);
  assert.equal(metricColumnGap("hook", noWatch), null);
  assert.equal(metricColumnGap("meat", []), null);
  const missingWatch = proposeNext({ pieces: meats, rows: noWatch });
  assert.ok(missingWatch.lines.every((l) => l.action === "leave" && l.verdict === "sin datos suficientes"));
  assert.match(missingWatch.lines[0].why, /el CSV no trae la columna tiempo promedio/);
  const noClicks = [row("H1-M1-C1", { avgWatch: 8, clicks: 0, conversions: 0 }), row("H1-M1-C2", { avgWatch: 4, clicks: 0, conversions: 0 })];
  assert.equal(metricColumnGap("cta", noClicks), "clics y resultados");
  const missingClicks = proposeNext({ pieces: ctas, rows: noClicks });
  assert.match(missingClicks.lines[0].why, /el CSV no trae la columna clics y resultados/);
  const oneWatch = proposeNext({
    pieces: meats,
    rows: [row("H1-M1-C1", { avgWatch: 12 }), row("H1-M2-C1", { avgWatch: 0 }), row("H1-M3-C1", { avgWatch: 3 })],
  });
  assert.doesNotMatch(oneWatch.lines.map((l) => l.why).join("\n"), /columna/);
  assert.equal(oneWatch.lines.find((l) => l.id === "M1")?.action, "keep");
});

test("a clip speaker has no voice pick, and undo skips a piece that moved", () => {
  const voices: NextVoice[] = [
    { pieceId: "H12", id: "v1", name: "Calma" },
    { pieceId: "H12", id: "v2", name: "Otra" },
  ];
  const spoken = proposeNext({
    pieces: [{ ...hook("H12"), clipSpeaker: true }],
    voices,
    rows: [row("H12v1-M1-C1", { views3s: 2000 }), row("H12v2-M1-C1", { views3s: 400 })],
  });
  assert.equal(spoken.voices.length, 0);
  const status = undoStatusPlan(
    [
      { id: "H4", from: "approved", to: "archived" },
      { id: "H12", from: "pending", to: "approved" },
    ],
    [
      { id: "H4", status: "archived" },
      { id: "H12", status: "rejected" },
    ],
  );
  assert.deepEqual(status.revert.map((s) => [s.id, s.to]), [["H4", "approved"]]);
  assert.deepEqual(status.skipped, ["H12"]);
  const after = { picked: ["v2"], known: ["v1", "v2"] };
  const voice = undoVoicePlan([{ pieceId: "H12", before: null, after }, { pieceId: "M3", before: { picked: ["v1"], known: ["v1", "v2"] }, after: { picked: ["v1"], known: ["v1", "v2"] } }], {
    H12: after,
    M3: { picked: ["v2"], known: ["v1", "v2"] },
  });
  assert.deepEqual(voice.revert.map((v) => v.pieceId), ["H12"]);
  assert.equal(voice.revert[0].restore, null);
  assert.deepEqual(voice.skipped, ["M3"]);
  assert.equal(undoSkipNote(["H4"], []), "No volví H4: el estado ya no es el que dejó Aplicar.");
  assert.equal(undoSkipNote([], ["H12"]), "No volví la voz de H12: la elección ya no es la que dejó Aplicar.");
});

test("variants refuse a rejected, archived or losing hook, and a short list can still vary the best", () => {
  const strong = [hook("H1"), hook("H2"), hook("H3")];
  const rows = [
    row("H1-M1-C1", { views3s: 2000 }),
    row("H2-M1-C1", { views3s: 800 }),
    row("H3-M1-C1", { views3s: 200 }),
  ];
  const ask = (id: string, status: NextPiece["status"]) =>
    variantHookRefusal({ id, status, stats: { impressions: 4200 }, pieces: strong, rows, keepShare: 0.2 });
  assert.match(ask("H9", "rejected") ?? "", /H9 está descartado/);
  assert.match(ask("H8", "archived") ?? "", /H8 está archivado/);
  assert.match(ask("H3", "approved") ?? "", /H3 quedó como perdedor/);
  assert.match(ask("H3", "approved") ?? "", /No se puede pedir variantes de un gancho que se archiva/);
  assert.equal(ask("H1", "approved"), null);
  const short = variantHookRefusal({
    id: "H1",
    status: "approved",
    stats: { impressions: 4200 },
    pieces: [hook("H1"), hook("H2")],
    rows: [row("H1-M1-C1", { views3s: 2000 }), row("H2-M1-C1", { views3s: 200 })],
    keepShare: 0.2,
  });
  assert.equal(short, null);
});
