// Image and video models by API: the price table, the clip length each model gets, what one call costs, and the
// fields each provider receives.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  costText,
  estimateCost,
  falImageInput,
  falVideoInput,
  mediaProviderId,
  needsImage,
  parseModelTable,
  parseSeconds,
  pickDuration,
  splitProviderId,
  usesImage,
  xaiVideoBody,
} from "../shared/mediaModels.ts";

test("the app's own price table reads with no skipped rows", () => {
  const { models, skipped } = parseModelTable(readFileSync(new URL("../server/media/modelos-api.md", import.meta.url), "utf8"));
  assert.deepEqual(skipped, []);
  assert.ok(models.some((m) => m.provider === "xai" && m.kind === "video"));
  assert.ok(models.some((m) => m.provider === "fal" && m.kind === "imagen"));
  for (const m of models.filter((x) => x.kind === "video")) {
    assert.ok(m.seconds && m.seconds.length > 0, m.model);
    assert.equal(m.unit, "segundo", m.model);
  }
  const ids = models.map(mediaProviderId);
  assert.equal(new Set(ids).size, ids.length);
});

test("a row that does not read is skipped and listed, the rest stay", () => {
  const md = [
    "| proveedor | tipo | modelo | nombre | precio | unidad | entrada | segundos | etiqueta |",
    "|---|---|---|---|---|---|---|---|---|",
    "| xai | video | ok-model | OK | 0,05 | segundo | ambas | 1-15 | [DOCS] |",
    "| openai | video | other | Otro | 0.1 | segundo | ambas | 1-15 | [DOCS] |",
    "| fal | video | no-seconds | Sin largos | 0.1 | segundo | imagen | | [DOCS] |",
    "",
    "| not | a | table |",
  ].join("\n");
  const { models, skipped } = parseModelTable(md);
  assert.equal(models.length, 1);
  assert.equal(models[0].price, 0.05);
  assert.equal(skipped.length, 2);
});

test("seconds read as a range or a list", () => {
  assert.deepEqual(parseSeconds("3-6"), [3, 4, 5, 6]);
  assert.deepEqual(parseSeconds("8, 4,6"), [4, 6, 8]);
  assert.deepEqual(parseSeconds("9-3"), []);
  assert.deepEqual(parseSeconds(""), []);
});

test("the clip length is the shortest the model accepts that covers the slot, else its longest", () => {
  assert.equal(pickDuration([4, 6, 8], 6), 6);
  assert.equal(pickDuration([4, 6, 8], 7), 8);
  assert.equal(pickDuration([4, 6, 8], 15), 8);
  assert.equal(pickDuration(parseSeconds("1-15"), 10), 10);
  assert.equal(pickDuration(parseSeconds("3-15"), 2), 3);
});

test("cost: per second for video, per image for pictures, in Rioplatense money", () => {
  assert.equal(estimateCost({ price: 0.05, unit: "segundo" }, 6), 0.30000000000000004);
  assert.equal(costText(estimateCost({ price: 0.05, unit: "segundo" }, 6)), "US$ 0,30");
  assert.equal(costText(estimateCost({ price: 0.02, unit: "imagen" }, 99)), "US$ 0,02");
  assert.equal(costText(0.003), "menos de US$ 0,01");
  assert.equal(costText(0), "US$ 0,00");
});

test("start pictures: an image-only model needs one, a text-only model ignores it", () => {
  assert.equal(needsImage({ input: "imagen" }), true);
  assert.equal(needsImage({ input: "ambas" }), false);
  assert.equal(usesImage({ input: "texto" }, true), false);
  assert.equal(usesImage({ input: "ambas" }, true), true);
  assert.equal(usesImage({ input: "ambas" }, false), false);
});

test("xAI: a start picture replaces the aspect ratio, and a silent clip asks for no audio", () => {
  const withImage = xaiVideoBody({ model: "grok-imagine-video", prompt: "p", seconds: 6, aspect: "vertical", image: "data:image/jpeg;base64,AA", audio: false });
  assert.deepEqual(withImage, { model: "grok-imagine-video", prompt: "p", duration: 6, image: { url: "data:image/jpeg;base64,AA" }, resolution: "480p", generate_audio: false });
  const textOnly = xaiVideoBody({ model: "grok-imagine-video-1.5", prompt: "p", seconds: 10, aspect: "horizontal", audio: true, resolution: "720p" });
  assert.deepEqual(textOnly, { model: "grok-imagine-video-1.5", prompt: "p", duration: 10, aspect_ratio: "16:9", resolution: "720p" });
});

test("fal: each model family gets its own field names", () => {
  const kling = falVideoInput({ model: "fal-ai/kling-video/o3/standard/image-to-video", prompt: "p", seconds: 6, aspect: "vertical", image: "data:x", audio: false });
  assert.deepEqual(kling, { prompt: "p", image_url: "data:x", duration: "6", generate_audio: false });
  const veo = falVideoInput({ model: "fal-ai/veo3/fast", prompt: "p", seconds: 8, aspect: "vertical", audio: true });
  assert.deepEqual(veo, { prompt: "p", aspect_ratio: "9:16", duration: "8s", resolution: "720p", generate_audio: true });
  assert.deepEqual(falImageInput("fal-ai/flux/schnell", "p", "vertical"), { prompt: "p", image_size: "portrait_16_9", num_images: 1, output_format: "png" });
  assert.deepEqual(falImageInput("fal-ai/nano-banana", "p", "horizontal"), { prompt: "p", aspect_ratio: "16:9", num_images: 1, output_format: "png" });
});

test("provider ids round-trip, and anything else is not an API model", () => {
  const id = mediaProviderId({ provider: "fal", model: "fal-ai/kling-video/o3/standard/image-to-video" });
  assert.deepEqual(splitProviderId(id), { provider: "fal", model: "fal-ai/kling-video/o3/standard/image-to-video" });
  assert.equal(splitProviderId("openai"), null);
  assert.equal(splitProviderId("other:x"), null);
  assert.equal(splitProviderId("xai:"), null);
});
