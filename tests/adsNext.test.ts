// The next batch is pure code: rank what the CSV already measured, say why, archive on apply, restore on undo.
import assert from "node:assert/strict";
import { test } from "node:test";
import { AdsStateSchema, EMPTY_OFFER, emptyAds, pieceStats, type MetricRow, type PieceStatus } from "../shared/ads.ts";
import {
  DEFAULT_KEEP_SHARE,
  MIN_IMPRESSIONS,
  keepCount,
  planApply,
  proposeNext,
  rowsForVoice,
  undoChanges,
  variantFacts,
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
  assert.equal(keepCount(0, 0.2), 0);
  assert.equal(keepCount(10, 0), 0);
  assert.equal(keepCount(10, 1), 10);
  assert.equal(keepCount(10, 0.2), 2);
  assert.equal(keepCount(5, 0.2), 1);
  assert.equal(keepCount(3, 0.2), 1);
  assert.equal(keepCount(1, 0.2), 1);
});

test("the example: H12 stays, H4 is archived, H9 has too little data, and the why quotes the numbers", () => {
  const proposal = proposeNext({
    pieces: [hook("H4"), hook("H12"), hook("H9", "pending")],
    rows: [
      row("H12-M1-C1", { views3s: 1596, impressions: 4200 }),
      row("H4-M1-C1", { views3s: 168, impressions: 4200 }),
      row("H9-M1-C1", { views3s: 40, impressions: 400 }),
    ],
  });
  const byId = Object.fromEntries(proposal.lines.map((l) => [l.id, l]));
  assert.equal(byId.H12.verdict, "ganador");
  assert.equal(byId.H12.action, "keep");
  assert.equal(byId.H4.verdict, "perdedor");
  assert.equal(byId.H4.action, "drop");
  assert.equal(byId.H9.verdict, "sin datos suficientes");
  assert.equal(byId.H9.action, "leave");
  assert.match(byId.H12.why, /H12 sigue: 38 % de retención a 3 s con 4\.200 impresiones \(la media de la tanda es 21 %\)/);
  assert.match(byId.H4.why, /H4 se archiva: 4 % de retención a 3 s con 4\.200 impresiones/);
  assert.match(byId.H9.why, /H9 sin datos suficientes: 400 impresiones \(hacen falta 1\.000\)/);
  assert.equal(proposal.voices.length, 0);
});

test("a tied score does not widen the keep set: the lower id stays", () => {
  const proposal = proposeNext({
    pieces: [hook("H2"), hook("H10")],
    rows: [row("H2-M1-C1", { views3s: 1000 }), row("H10-M1-C1", { views3s: 1000 })],
    keepShare: 0.2,
  });
  const byId = Object.fromEntries(proposal.lines.map((l) => [l.id, l]));
  assert.equal(byId.H10.action, "keep");
  assert.equal(byId.H2.action, "drop");
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

test("meats rank by watch time and CTAs by conversions and clicks, each against its own mean", () => {
  const proposal = proposeNext({
    pieces: [
      { id: "M3", kind: "meat", status: "approved", text: "El cuerpo" },
      { id: "M1", kind: "meat", status: "approved", text: "El otro" },
      { id: "C2", kind: "cta", status: "approved", text: "El llamado" },
      { id: "C1", kind: "cta", status: "pending", text: "El flojo" },
    ],
    rows: [
      row("H1-M3-C9", { avgWatch: 18.2, impressions: 4200 }),
      row("H1-M1-C9", { avgWatch: 4, impressions: 4200 }),
      row("H1-M9-C2", { clicks: 48, conversions: 6, impressions: 4200 }),
      row("H1-M9-C1", { clicks: 12, conversions: 2, impressions: 4200 }),
    ],
  });
  const byId = Object.fromEntries(proposal.lines.map((l) => [l.id, l]));
  assert.equal(byId.M3.action, "keep");
  assert.match(byId.M3.why, /M3 sigue: 18,2 s de visionado promedio con 4\.200 impresiones \(la media de la tanda es 11,1 s\)/);
  assert.equal(byId.M1.action, "drop");
  assert.equal(byId.C2.action, "keep");
  assert.match(byId.C2.why, /C2 sigue: 6 conversiones y 48 clics en 4\.200 impresiones \(la media de la tanda es 4 conversiones y 30 clics\)/);
  assert.equal(byId.C1.verdict, "perdedor");
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

test("variant facts quote the stored numbers, and the hook task locks the angle only when asked", () => {
  const facts = variantFacts(
    { id: "H12", text: "Otra vez tarde", level: 2, angle: "pain", formula: "question" },
    { impressions: 4200, views3s: 1596, hookRate: 0.38 },
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
  const parsed = AdsStateSchema.parse(raw);
  assert.equal(parsed.hooks.length, 0);
  assert.deepEqual(parsed.statics, {});
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
