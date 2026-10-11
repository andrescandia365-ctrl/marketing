// The prompts the app itself adds to: the image guardrails never ask for polish, and Grok's speaking prompt carries
// the line's written emotion.
import assert from "node:assert/strict";
import { test } from "node:test";
import { polishWords } from "../shared/checks.ts";
import { buildImagePrompt, lookPhrase, PLAIN_PHOTO } from "../shared/prompt.ts";
import { LOOK_PRESETS, EMPTY_LOOK } from "../shared/series.ts";
import { lineEmotion, speakingPrompt } from "../shared/audio.ts";
import { DEMO_BOARD, DEMO_STORY } from "../server/demo.ts";
import { guardedPrompt } from "../server/images/util.ts";

test("without a look the image prompt ends on a plain photo, never cinematic", () => {
  const p = buildImagePrompt("A woman at a fridge.", "35mm photo");
  assert.deepEqual(polishWords(p), []);
  assert.ok(p.includes(PLAIN_PHOTO));
  assert.ok(p.includes("No real public figures"));
});

test("with a look its words lead the closing line", () => {
  const look = lookPhrase(LOOK_PRESETS.digicam.look);
  assert.ok(look.startsWith("an early-2000s point-and-shoot digicam; harsh direct on-camera flash"));
  const p = buildImagePrompt("A woman at a fridge", "", look);
  assert.ok(p.startsWith("A woman at a fridge. Look: an early-2000s"));
  assert.ok(!p.includes(PLAIN_PHOTO));
  assert.deepEqual(polishWords(p), []);
  assert.equal(lookPhrase(EMPTY_LOOK), "");
  assert.equal(lookPhrase(undefined), "");
  // An old client sends no look: the plain line.
  assert.ok(guardedPrompt({ prompt: "x", style: "", aspect: "vertical", beat: "hook" }).includes(PLAIN_PHOTO));
});

test("the sample board asks for no polish", () => {
  assert.deepEqual(polishWords(DEMO_BOARD.style), []);
  for (const s of DEMO_BOARD.shots) {
    assert.deepEqual(polishWords(s.visualPrompt), [], s.title);
    assert.deepEqual(polishWords(s.endPrompt ?? ""), [], s.title);
    assert.deepEqual(polishWords(buildImagePrompt(s.visualPrompt, DEMO_BOARD.style)), [], s.title);
  }
});

test("Grok's speaking prompt carries the line's emotion", () => {
  const video = "She closes the fridge. Static camera. Audio: fridge hum, no music, no speech.";
  const p = speakingPrompt(video, "Marta", "Otra vez sin leche.", "", "es", "con fastidio.");
  assert.ok(p.includes('Marta says, in Rioplatense Spanish (Buenos Aires accent), tone: con fastidio, lips in sync: "Otra vez sin leche."'));
  assert.ok(!/no speech/.test(p));
  // No emotion: the old prompt, unchanged.
  assert.ok(speakingPrompt(video, "Marta", "Hola", "Ara", "es").includes("Marta says, in Rioplatense Spanish (Buenos Aires accent), lips in sync, with the voice Ara:"));
  // A quote inside the emotion never closes the line's quotes.
  assert.ok(!speakingPrompt(video, "M", "Hola", "", "en", 'en "voz" baja').includes('"voz"'));
});

test("lineEmotion finds the story line said in the shot", () => {
  const line = DEMO_STORY.topics.flatMap((t) => t.lines).find((l) => l.emotion.trim())!;
  assert.equal(lineEmotion(DEMO_STORY, `  ${line.text} `), line.emotion.trim());
  assert.equal(lineEmotion(DEMO_STORY, "una línea que no está"), "");
  assert.equal(lineEmotion(null, line.text), "");
  assert.equal(lineEmotion(DEMO_STORY, ""), "");
});
