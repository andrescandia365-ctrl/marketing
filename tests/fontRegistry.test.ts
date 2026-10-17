// "Fuentes propias de la marca": the uploaded faces are registered per series. One series' "Inter" never stands in for
// another series' Google "Inter", and a family a series removed is gone from the registry.
import assert from "node:assert/strict";
import { test } from "node:test";
import { fontBytes, ownFamily, registerBrandFonts } from "../src/lib/fonts.ts";

const inter = { family: "Inter", name: "Inter-Bold.ttf", file: "inter-bold.ttf", role: "display", weight: 700, style: "normal" } as const;

test("an uploaded family belongs to its series only, and drops out when the series removes it", () => {
  registerBrandFonts("serie-a", { fonts: [inter] });
  registerBrandFonts("serie-b", { fonts: [] });
  assert.equal(ownFamily("serie-a", "inter")?.family, "Inter");
  assert.equal(ownFamily("serie-b", "Inter"), null);
  assert.equal(ownFamily(undefined, "Inter"), null);
  registerBrandFonts("serie-a", { fonts: [] });
  assert.equal(ownFamily("serie-a", "Inter"), null);
});

test("the code sandbox's bytes for another series' family name come from Google Fonts, not the other series' files", async () => {
  registerBrandFonts("serie-a", { fonts: [inter] });
  const asked: string[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    asked.push(String(input));
    return new Response("", { status: 404 });
  }) as typeof fetch;
  try {
    await fontBytes(["Inter"], "serie-b");
    await fontBytes(["Inter"], "serie-a");
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.ok(asked[0].includes("fonts.googleapis.com"), asked.join(", "));
  assert.ok(asked.slice(1).some((u) => u.includes("serie-a") && u.includes("inter-bold.ttf")), asked.join(", "));
});
