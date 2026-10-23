// "Que lo diga un personaje": the Grok prompt where a cast character says a Publicidad piece's line (length that fits
// the words, the line in quotes, its emotion, one action, no music), the batch of prompts, the lip-sync line read from
// the tool's profile, and "Que lo diga la mascota" (a starting explainer where the code mascot says it).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { HookSchema, emptyAds, type Hook, type Meat } from "../shared/ads.ts";
import {
  PieceSpeakerSchema,
  defaultEmotion,
  lipSyncNote,
  speakerBatch,
  speakerBatchText,
  speakerCandidates,
  speakerDisclosure,
  speakerDraft,
  speakerFit,
  sequenceSpeakerPrompts,
  speakerIssues,
  speakerPrompt,
  spokenLine,
  type SpeakerMember,
} from "../shared/adsSpeaker.ts";
import { explainerTargets, mascotScript, seedNotes, starterScript } from "../shared/adsFromExplainer.ts";
import { MASCOT_ASSET } from "../shared/mascot.ts";

const marta: SpeakerMember = {
  id: "marta",
  name: "Marta",
  ref: "Marta",
  kind: "character",
  identity: "woman in her 40s, short grey hair, navy apron.",
  image: "marta.png",
};
const sinFoto: SpeakerMember = {
  id: "beto",
  name: "Beto",
  ref: "Beto",
  kind: "character",
  identity: "man in his 30s",
  image: "",
};
const local: SpeakerMember = {
  id: "local",
  name: "Local",
  ref: "Local",
  kind: "place",
  identity: "corner store",
  image: "local.png",
};

function hook(id: string, text: string, extra: Partial<Hook> = {}): Hook {
  return {
    id,
    kind: "hook",
    text,
    onScreenText: "",
    visualPrompt: "",
    videoPrompt: "",
    seconds: 3,
    status: "approved",
    source: "ai",
    createdAt: "2026-10-11",
    note: "",
    level: 2,
    angle: "pain",
    formula: "question",
    ...extra,
  };
}

const speaker = {
  emotion: "harta, medio riéndose",
  action: "looks up into the lens",
  place: "",
  voice: "",
};

test("the clip fits the words: 6 s for a short line, longer when the line needs it, never shorter than the piece", () => {
  // 8 words at 2.7 a second plus the breath: 3.4 s, in a 3 s hook (8 words is its budget): a 6 s clip.
  const short = speakerFit("¿Otra vez se venció la leche del martes?", 3);
  assert.equal(short.words, 8);
  assert.equal(short.clip, 6);
  assert.ok(short.fits);
  assert.ok(!short.tooLong);
  // 20 words: about 7.8 s said, past 6 s: a 10 s clip; in a 9 s meat they fit (24 words).
  const twenty = Array.from({ length: 20 }, (_, i) => `palabra${i}`).join(" ");
  assert.equal(speakerFit(twenty, 9).clip, 10);
  assert.ok(speakerFit(twenty, 9).fits);
  // The same words in a 3 s hook do not fit the piece.
  assert.ok(!speakerFit(twenty, 3).fits);
  // A 15 s piece asks for 15 s even with few words: the render needs footage for all of it.
  assert.equal(speakerFit("Hola.", 15).clip, 15);
  // 40 words: over 15 s even in Grok's longest clip.
  const long = Array.from({ length: 40 }, () => "palabra").join(" ");
  assert.equal(speakerFit(long, 9).clip, 15);
  assert.ok(speakerFit(long, 9).tooLong);
  assert.ok(speakerIssues(long, 9).some((i) => i.includes("15 s")));
  // The same 40 words fit a 50 s meat: it is several clips, not one 15 s file.
  assert.equal(speakerFit(long, 50).tooLong, false);
  assert.equal(speakerFit(long, 50).fits, true);
});

test("the line goes in quotes, whole, on one line, with no quote inside that would close it", () => {
  assert.equal(spokenLine('  Dijo "nunca más"\n y   lo hizo  '), "Dijo 'nunca más' y lo hizo");
  assert.equal(spokenLine("“Hola”"), "'Hola'");
  const prompt = speakerPrompt({
    text: 'El sistema dice "40". El estante dice 3.',
    pieceSeconds: 3,
    member: marta,
    speaker,
    format: "vertical",
  });
  const quoted = prompt.match(/"([^"]*)"/g) ?? [];
  assert.equal(quoted.length, 1);
  assert.equal(quoted[0], `"El sistema dice '40'. El estante dice 3."`);
});

test("the prompt: the @ref and identity, one action, locked camera, the emotion as tone, Spanish, no music, the length", () => {
  const prompt = speakerPrompt({
    text: "¿Otra vez se te venció la leche?",
    pieceSeconds: 3,
    member: marta,
    speaker,
    format: "vertical",
    type: "software",
  });
  assert.match(prompt, /^@Marta, the invented adult in the reference image \(woman in her 40s, short grey hair, navy apron\)/);
  assert.match(prompt, /corner store/);
  assert.match(prompt, /Vertical 9:16/);
  assert.match(prompt, /@Marta looks up into the lens\./);
  assert.match(prompt, /Locked-off camera, no other camera move/);
  assert.match(
    prompt,
    /@Marta says, in Rioplatense Spanish \(Buenos Aires accent\), tone: harta, medio riéndose, lips in sync: "¿Otra vez se te venció la leche\?"/,
  );
  assert.match(prompt, /Audio: the spoken line, clear and in sync with the lips; natural room tone of the place; no music\./);
  assert.match(prompt, /Length: 6 s\.$/);
  assert.doesNotMatch(prompt, /cinematic/i);
  // An emotion with quotes cannot break the line's quote; a Grok voice is named when given.
  const voiced = speakerPrompt({
    text: "Hola.",
    pieceSeconds: 3,
    member: marta,
    speaker: { ...speaker, emotion: 'muy "cansada".', voice: "Ara" },
    format: "horizontal",
    type: "ecommerce",
  });
  assert.match(voiced, /tone: muy 'cansada', lips in sync, with the voice Ara: "Hola\."/);
  assert.match(voiced, /Horizontal 16:9/);
  assert.match(voiced, /living room/);
  // The series look replaces the plain phone video line.
  const look = {
    camera: "old phone camera",
    flash: "",
    grain: "visible grain",
    focus: "",
    light: "",
    extra: "",
  };
  const withLook = speakerPrompt({
    text: "Hola.",
    pieceSeconds: 3,
    member: marta,
    speaker,
    format: "vertical",
    look,
  });
  assert.match(withLook, /old phone camera; visible grain\./);
  assert.doesNotMatch(withLook, /Ordinary unretouched phone video/);
});

test("emotion and action defaults follow the piece's job; a saved choice is kept for its own character", () => {
  assert.equal(defaultEmotion({ kind: "hook", angle: "pain" }), "al límite, medio riéndose del lío");
  assert.notEqual(defaultEmotion({ kind: "meat" }), defaultEmotion({ kind: "cta" }));
  const h = hook("H1", "Hola.", {
    speaker: PieceSpeakerSchema.parse({
      castId: "marta",
      emotion: "seca",
      place: "at the counter",
      from: 0.8,
    }),
  });
  assert.equal(speakerDraft(h, "marta").emotion, "seca");
  const other = speakerDraft(h, "beto");
  assert.equal(other.castId, "beto");
  assert.equal(other.emotion, "seca");
  assert.equal(other.place, "at the counter");
  assert.equal(other.from, 0.8);
  assert.equal(other.sound, "clip");
  // A piece saved with its speaker reads back through the schema; older pieces have none.
  assert.equal(HookSchema.parse({ ...hook("H2", "x") }).speaker, undefined);
  assert.equal(HookSchema.parse(h).speaker?.castId, "marta");
});

test("only characters with an approved image can say it; [VERIFY] lines are held back", () => {
  assert.deepEqual(
    speakerCandidates([marta, sinFoto, local]).map((m) => m.id),
    ["marta"],
  );
  assert.ok(speakerIssues("Ahorrá 40 % [VERIFY]", 3).some((i) => i.includes("[VERIFY]")));
  assert.ok(speakerIssues("", 3).length > 0);
  assert.deepEqual(speakerIssues("Hola.", 3), []);
  assert.ok(speakerIssues("hola", 22).some((i) => i.includes("clip 2") && i.includes("no tiene palabras")));
  const overflow = Array.from({ length: 50 }, () => "palabra").join(" ");
  assert.ok(speakerIssues(overflow, 16).some((i) => i.includes("clip 2")));
  const said = sequenceSpeakerPrompts({ text: "uno dos tres cuatro cinco seis siete ocho", pieceSeconds: 22, member: marta, speaker, format: "vertical" });
  assert.equal(said.length, 2);
  assert.match(said[0], /starts speaking right away/);
  assert.match(said[0], /lips in sync/);
  assert.match(said[1], /keeps speaking from the previous clip/);
  assert.match(said[1], /does not start the action over/);
  assert.match(said[1], /does not start it over/);
  const silent = sequenceSpeakerPrompts({ text: "hola", pieceSeconds: 22, member: marta, speaker, format: "vertical" });
  assert.match(silent[1], /no speech/);
  assert.doesNotMatch(silent[1], /lips in sync/);
  assert.equal(speakerDisclosure("clip"), "Personaje y voz hechos con IA");
  assert.equal(speakerDisclosure("voice"), "Personaje hecho con IA");
});

test("the batch: approved pieces in order, up to the quantity, own character first, problems skipped and named", () => {
  const pieces = [
    hook("H1", "¿Otra vez la leche vencida?"),
    hook("H2", "Pendiente.", { status: "pending" }),
    hook("H3", "Ahorrás 40 % [VERIFY]."),
    hook("H4", "Tu sistema dice 40 y el estante 3.", {
      speaker: PieceSpeakerSchema.parse({ castId: "marta", emotion: "seca" }),
    }),
    hook("H5", "Cinco."),
  ];
  const cast = [marta, { ...marta, id: "rosa", name: "Rosa", ref: "Rosa", image: "rosa.png" }];
  const all = speakerBatch({
    pieces,
    cast,
    fallback: "rosa",
    count: 10,
    format: "vertical",
  });
  assert.deepEqual(
    all.entries.map((e) => [e.id, e.ref]),
    [
      ["H1", "Rosa"],
      ["H4", "Marta"],
      ["H5", "Rosa"],
    ],
  );
  assert.deepEqual(
    all.skipped.map((s) => s.id),
    ["H3"],
  );
  assert.match(all.entries[1].prompt, /tone: seca/);
  const two = speakerBatch({
    pieces,
    cast,
    fallback: "rosa",
    count: 2,
    format: "vertical",
  });
  assert.equal(two.entries.length, 2);
  const none = speakerBatch({
    pieces,
    cast,
    fallback: "",
    count: 10,
    format: "vertical",
  });
  assert.deepEqual(
    none.entries.map((e) => e.id),
    ["H4"],
  );
  const text = speakerBatchText(all.entries);
  assert.equal(text.split("———").length, 3);
  assert.match(text, /^H1 · adjuntá @Rosa · clip de 6 s \(la pieza usa 3 s\)\n@Rosa, the invented adult/);
});

test("the lip-sync line comes from the tool's profile, with its tag", () => {
  const grok = readFileSync(new URL("../server/tools/grok-imagine.md", import.meta.url), "utf8");
  const note = lipSyncNote(grok);
  assert.equal(note?.tag, "NOT SURE");
  assert.match(note?.text ?? "", /reference/);
  assert.deepEqual(lipSyncNote("- [TESTED] Lip sync: holds."), {
    tag: "TESTED",
    text: "holds.",
  });
  assert.equal(lipSyncNote("- [DOCS] Video in 9:16."), null);
});

test("Que lo diga la mascota: one character scene per sentence with the code mascot, its voice and emotion", () => {
  const seed = {
    id: "H7",
    kind: "hook" as const,
    text: "¿Otra vez la leche vencida? Pasa todas las semanas.",
    onScreenText: "Leche vencida",
    seconds: 3,
    presenter: "mascot" as const,
    emotion: "con humor",
  };
  const script = starterScript(seed);
  assert.equal(script.title, mascotScript(seed).title);
  assert.equal(script.scenes.length, 2);
  assert.ok(script.scenes.every((s) => s.template === "character" && s.asset === MASCOT_ASSET && s.emotion === "con humor"));
  assert.equal(script.scenes[0].voice, "¿Otra vez la leche vencida?");
  assert.equal(script.scenes[0].title, "Leche vencida");
  assert.equal(script.scenes[0].gesture, "surprise");
  assert.match(script.title, /^Gancho H7 dicho por la mascota$/);
  assert.match(seedNotes(seed), /mascota/);
  // A CTA closes cheering; without the mascot the starter stays the kinetic one.
  const cta = mascotScript({
    ...seed,
    kind: "cta",
    text: "Probalo. Es gratis.",
  });
  assert.equal(cta.scenes.at(-1)?.gesture, "cheer");
  assert.equal(starterScript({ ...seed, presenter: undefined }).scenes[0].template, "hook");
});

test("an explainer can go back into an approved hook too", () => {
  const state = emptyAds("iman");
  state.hooks.push(hook("H1", "Uno."), hook("H2", "Dos.", { status: "pending" }));
  const meat = {
    ...hook("M1", "x"),
    kind: "meat",
    format: "demo",
    levels: [2],
    hookId: "",
  } as unknown as Meat;
  state.meats.push(meat);
  assert.deepEqual(
    explainerTargets(state, "hook").map((t) => t.piece.id),
    ["H1"],
  );
});
