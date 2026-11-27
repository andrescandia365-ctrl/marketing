// Making clips by hand on a website: the tool's clip lengths (Grok 6/10/15, Seedance 4-15), the shot kit (numbered
// references, the lip-sync prompt, the voice laid out as the render plays it), and the price table of the websites.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { SHOT_LENGTHS, snapSeconds } from "../shared/schema.ts";
import { ANY_LENGTH, clipLengths, isRange, lengthRule, lengthsEnglish, lengthsOf, lengthsText } from "../shared/toolLengths.ts";
import { CONSISTENCY_STEPS, kitPictures, kitPrompt, kitReadme, lipSyncFolder, lipSyncReadme, numberRefs, PROMPT_TEST_STEPS, shotClipName, shotKitFolder, voiceLayout, VOICE_LEAD } from "../shared/shotKit.ts";
import { markLine, profileLines, profileTests, shortDate } from "../shared/toolChecks.ts";
import { lipSyncNote } from "../shared/adsSpeaker.ts";
import { parseWebTable, webCost, webModelId, webModelText } from "../shared/webModels.ts";
import { listTools, referenceLimit } from "../server/tools.ts";

test("clip lengths come from the tool's profile: Grok keeps 6, 10 or 15 s and Seedance takes 4 to 15", () => {
  const tools = listTools();
  const grok = tools.find((t) => t.id === "grok-imagine");
  const seedance = tools.find((t) => t.id === "seedance");
  assert.equal(grok?.lengths, null);
  assert.deepEqual(lengthsOf(grok), SHOT_LENGTHS);
  assert.deepEqual(seedance?.lengths, [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
  assert.equal(tools.at(-1)?.id, "general");
  assert.deepEqual(clipLengths("- Clip lengths: 5, 8 or 12"), [5, 8, 12]);
  assert.deepEqual(clipLengths("Clip lengths: 0-40"), ANY_LENGTH);
  assert.equal(clipLengths("no line here"), null);
});

test("a shot snaps to the tool's lengths; with Grok's it is the old rule", () => {
  assert.equal(snapSeconds(7), 10);
  assert.equal(snapSeconds(20), 15);
  const seedance = clipLengths("Clip lengths: 4-15")!;
  assert.equal(snapSeconds(7, seedance), 7);
  assert.equal(snapSeconds(2, seedance), 4);
  assert.equal(snapSeconds(22, seedance), 15);
  assert.equal(snapSeconds(7, ANY_LENGTH), 7);
});

test("the writer's length rule for Grok is the sentence it always had, and Seedance gets a range", () => {
  assert.match(lengthRule(SHOT_LENGTHS), /^seconds: exactly 6, 10 or 15, the only clip lengths the tool makes\./);
  const range = lengthRule(clipLengths("Clip lengths: 4-15")!);
  assert.match(range, /a whole number from 4 to 15/);
  assert.equal(isRange(SHOT_LENGTHS), false);
  assert.equal(lengthsText(SHOT_LENGTHS), "6, 10 o 15 s");
  assert.equal(lengthsEnglish(SHOT_LENGTHS), "6, 10 or 15 s");
  assert.equal(lengthsText(clipLengths("Clip lengths: 4-15")!), "de 4 a 15 s");
});

const members = [
  { ref: "Marta", name: "Marta", image: "marta.png", url: "/lib/marta.png", refs: [{ ref: "MartaCara", label: "cara", image: "marta-cara.png" }] },
  { ref: "Kiosco", name: "El kiosco", image: "kiosco.png" },
  { ref: "Sin", name: "Sin imagen", image: "" },
];

test("kit pictures: the approved image first, then its extra references, in frame order, only those with a picture", () => {
  const pics = kitPictures(members, (f) => `/u/${f}`);
  assert.deepEqual(
    pics.map((p) => [p.ref, p.url]),
    [
      ["Marta", "/lib/marta.png"],
      ["MartaCara", "/u/marta-cara.png"],
      ["Kiosco", "/u/kiosco.png"],
    ],
  );
});

test("@refs become [ImageN] in the kit's order; a longer name is never read as a shorter one", () => {
  assert.equal(numberRefs("@Marta looks at @MartaCara near @Kiosco; @Otro stays.", ["Marta", "MartaCara", "Kiosco"]), "[Image1] looks at [Image2] near [Image3]; @Otro stays.");
});

test("the kit prompt maps every file and, with the voice, asks for lip sync on [Audio1] without the 'no speech' words", () => {
  const pictures = kitPictures(members, (f) => `/u/${f}`);
  const plain = kitPrompt({ prompt: "@Marta wipes the counter. Audio: fridge hum, no speech.", pictures, firstFrame: true });
  assert.match(plain, /^References:\n- The first frame is the uploaded start image/);
  assert.match(plain, /\[Image1\] is Marta \(approved reference\)/);
  assert.match(plain, /\[Image2\] is Marta \(cara\)/);
  assert.match(plain, /no speech/);
  const spoken = kitPrompt({
    prompt: "@Marta wipes the counter. Audio: fridge hum, no speech.",
    pictures,
    firstFrame: true,
    voice: { name: "Marta", line: 'Otra vez "vencido".', emotion: "cansada.", language: "es", timed: false },
  });
  assert.doesNotMatch(spoken, /no speech/);
  assert.match(spoken, /\[Audio1\] is Marta's voice for this shot/);
  assert.match(spoken, /Marta says, in Rioplatense Spanish \(Buenos Aires accent\), tone: cansada, once and exactly as written, with the lips in sync with \[Audio1\]: "Otra vez "vencido"."\nNo smile while speaking\./);
  assert.equal(kitPrompt({ prompt: "A shelf.", pictures: [], firstFrame: false }), "A shelf.");
});

test("the kit's voice starts where the render plays it and is at least 2 s, cut at the shot's end", () => {
  assert.equal(VOICE_LEAD, 0.15);
  assert.deepEqual(voiceLayout(3, 6), { lead: 0.15, voice: 3, total: 6, cut: false });
  const long = voiceLayout(9, 6);
  assert.equal(long.cut, true);
  assert.ok(Math.abs(long.voice - 5.85) < 1e-9);
  assert.equal(voiceLayout(1, 1).total, 2);
  assert.equal(voiceLayout(1, 40).total, 30);
});

test("LEEME.txt walks the web form and carries how to keep the character the same", () => {
  const text = kitReadme({
    shotIndex: 2,
    title: "Marta abre",
    seconds: 7,
    format: "vertical",
    toolName: "Seedance 2.5",
    pictures: [{ file: "01-Marta.png", name: "Marta", label: "imagen aprobada" }],
    firstFrame: "00-primer-cuadro.png",
    lastFrame: null,
    voice: { file: "audio1-voz.wav", cut: false },
    voiceHint: "",
  });
  assert.match(text, /^Toma 3: Marta abre\nLargo: 7 s · Formato: 9:16/);
  assert.match(text, /01-Marta.png: Marta, imagen aprobada/);
  assert.match(text, /audio1-voz.wav/);
  assert.match(text, /toma-03-clip.mp4/);
  assert.match(text, /poné Mudo/);
  for (const step of CONSISTENCY_STEPS) assert.ok(text.includes(step));
  assert.match(text, /Nunca recortes ni tapes la marca de agua/);
});

test("the websites' price table reads with no skipped rows and prices each note", () => {
  const { models, skipped } = parseWebTable(readFileSync(new URL("../server/media/modelos-web.md", import.meta.url), "utf8"));
  assert.deepEqual(skipped, []);
  const seedance = models.find((m) => m.site === "apimart" && m.model === "seedance-2.5" && m.resolution === "720p")!;
  assert.ok(seedance);
  assert.equal(webModelId(seedance), "apimart:seedance-2.5:720p");
  assert.equal(webModelText(seedance), "APIMart · Seedance 2.5 · 720p");
  assert.ok(Math.abs(webCost(seedance, 10) - 2.16) < 1e-9);
  const image = models.find((m) => m.kind === "imagen")!;
  assert.equal(webCost(image, 99, 2), image.price * 2);
  const ids = models.map(webModelId);
  assert.equal(new Set(ids).size, ids.length);
});

test("a website row that does not read, or repeats, is skipped and listed", () => {
  const md = [
    "| sitio | tipo | modelo | nombre | resolución | precio | unidad | etiqueta |",
    "|---|---|---|---|---|---|---|---|",
    "| replicate | video | a | A | 720p | 0,2 | segundo | [DOCS] |",
    "| replicate | video | a | A | 720p | 0.3 | segundo | [DOCS] |",
    "| fal | video | b | B | 720p | 0.1 | segundo | [DOCS] |",
    "| apimart | audio | c | C | | 0.1 | segundo | [DOCS] |",
  ].join("\n");
  const { models, skipped } = parseWebTable(md);
  assert.equal(models.length, 1);
  assert.equal(models[0].price, 0.2);
  assert.equal(skipped.length, 3);
});

test("MAGI-2's profile makes 4 to 30 s clips and says it does not follow your audio", () => {
  const magi = listTools().find((t) => t.id === "magi-2");
  assert.ok(magi);
  assert.equal(magi.lengths?.[0], 4);
  assert.equal(magi.lengths?.at(-1), 30);
  assert.equal(magi.lipSync?.tag, "NOT SURE");
  assert.match(magi.lipSync?.text ?? "", /does not|nothing says/i);
});

test("the websites' table has Higgsfield and the lip-sync passes", () => {
  const { models } = parseWebTable(readFileSync(new URL("../server/media/modelos-web.md", import.meta.url), "utf8"));
  assert.ok(models.some((m) => m.site === "higgsfield" && m.model === "magi-2"));
  assert.ok(models.some((m) => m.model === "kling-lipsync"));
  assert.equal(webModelText({ site: "higgsfield", label: "MAGI-2", resolution: "1080p" }), "Higgsfield · MAGI-2 · 1080p");
});

test("a prompt test's kit has its own names and the steps to compare fairly", () => {
  assert.equal(shotKitFolder(2, "B"), "toma-03-kit-B");
  assert.equal(shotClipName(2, "B"), "toma-03-clip-B.mp4");
  const text = kitReadme({
    shotIndex: 2,
    title: "Marta abre",
    seconds: 7,
    format: "vertical",
    toolName: "Seedance 2.5",
    pictures: [],
    firstFrame: null,
    lastFrame: null,
    voice: null,
    voiceHint: "Sin voz.",
    variant: "B",
  });
  assert.match(text, /toma-03-clip-B.mp4/);
  assert.match(text, /Prueba de prompt: la toma \(A\) contra esta versión \(B\)/);
  for (const step of PROMPT_TEST_STEPS) assert.ok(text.includes(step));
});

test("the lip-sync kit's steps name the clip, the voice and the slot to put the result back in", () => {
  const text = lipSyncReadme({ shotIndex: 0, title: "Hola", seconds: 6, clipFile: "video.mp4", voice: { file: "audio1-voz.wav", cut: true } });
  assert.match(text, /video.mp4/);
  assert.match(text, /audio1-voz.wav/);
  assert.match(text, /quedó cortada/);
  assert.match(text, /toma-01-clip.mp4/);
  assert.match(text, /poné Mudo/);
  assert.equal(lipSyncFolder(0), "toma-01-lipsync");
});

const PROFILE = [
  "# Tool",
  "## What it can do",
  "- Clip lengths: 4-15",
  "- [DOCS] Makes clips.",
  "- [NOT SURE] Lip sync: follows the voice.",
  "## Tests to run (turn NOT SURE into TESTED)",
  "1. Lip sync: try a 6 s take.",
  "2. Silence: does it obey?",
  "## After",
  "3. not a test",
].join("\n");

test("the test bench reads the tagged lines with their section, and the tests list", () => {
  const lines = profileLines(PROFILE);
  assert.deepEqual(
    lines.map((l) => [l.line, l.tag, l.section]),
    [
      [3, "DOCS", "What it can do"],
      [4, "NOT SURE", "What it can do"],
    ],
  );
  assert.deepEqual(profileTests(PROFILE), [
    { n: 1, text: "Lip sync: try a 6 s take." },
    { n: 2, text: "Silence: does it obey?" },
  ]);
});

test("marking a line after a try: worked → [TESTED] with the finding, failed stays [NOT SURE]; the Lip sync line still reads", () => {
  const worked = markLine(PROFILE, 4, "worked", " la boca\nsiguió la voz ", "27 nov 2026")!;
  assert.equal(worked.split("\n")[4], "- [TESTED] Lip sync: follows the voice. (Probado 27 nov 2026: funcionó, la boca siguió la voz.)");
  assert.equal(lipSyncNote(worked)?.tag, "TESTED");
  const failed = markLine(PROFILE, 4, "failed", "", "27 nov 2026")!;
  assert.equal(failed.split("\n")[4], "- [NOT SURE] Lip sync: follows the voice. (Probado 27 nov 2026: no funcionó.)");
  assert.equal(markLine(PROFILE, 2, "worked", "", "x"), null);
  assert.equal(markLine(PROFILE, 99, "worked", "", "x"), null);
  assert.equal(shortDate(new Date("2026-11-27T10:00:00Z")), "27 nov 2026");
});

test("every tool profile's tests and lines read", () => {
  for (const t of ["seedance", "magi-2", "grok-imagine"]) {
    const md = readFileSync(new URL(`../server/tools/${t}.md`, import.meta.url), "utf8");
    assert.ok(profileTests(md).length > 0, t);
    assert.ok(profileLines(md).some((l) => l.tag === "NOT SURE"), t);
  }
});

test("Veo 3.1 makes 4, 6 or 8 s clips, and no profile lowers the cast's reference cap below Grok's 14", () => {
  const tools = listTools();
  assert.deepEqual(tools.find((t) => t.id === "veo-3-1")?.lengths, [4, 6, 8]);
  assert.equal(referenceLimit(), 14);
  const { models } = parseWebTable(readFileSync(new URL("../server/media/modelos-web.md", import.meta.url), "utf8"));
  assert.ok(models.some((m) => m.site === "google" && m.model === "veo-3.1-lite"));
});
