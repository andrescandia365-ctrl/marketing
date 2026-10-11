// The big screens were split into smaller files without changing what they do (IDEAS.md idea 51). These guards keep
// what the split had to keep: the parts that download on demand stay lazy, the first download stays without the app,
// and the explainer's pieza.md is written as before.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { blankScene, newMotionPiece, type MotionScript } from "../shared/motion.ts";
import { pieceMarkdown } from "../src/lib/motionMarkdown.ts";

const read = (file: string) => readFileSync(file, "utf8");
const lazyOf = (text: string, module: string) => new RegExp(`lazy\\(\\(\\) => import\\("${module.replace(/[.]/g, "\\.")}"\\)`).test(text);
// A type-only import is erased from the bundle, so it does not count.
const staticOf = (text: string, module: string) => new RegExp(`^import (?!type )[^;]*from "${module.replace(/[.]/g, "\\.")}";`, "m").test(text);

test("the parts behind a click still download on demand", () => {
  const cases: [string, string[]][] = [
    ["src/main.tsx", ["./App.tsx", "./RenderPage.tsx"]],
    [
      "src/App.tsx",
      [
        "./components/BoardView.tsx",
        "./components/MotionStudio.tsx",
        "./components/LyricStudio.tsx",
        "./components/StillStudio.tsx",
        "./components/SeriesEditor.tsx",
        "./components/EpisodesPanel.tsx",
        "./components/ModelsPanel.tsx",
      ],
    ],
    ["src/components/ProductionView.tsx", ["./VideoPanel.tsx"]],
    ["src/components/AdsSection.tsx", ["./ads/AdsStudio.tsx"]],
    ["src/components/MotionStoryboardPanel.tsx", ["./MotionStoryboard.tsx"]],
    ["src/components/SetupsPanel.tsx", ["./SheetBuilder.tsx", "./CastRefs.tsx"]],
  ];
  for (const [file, modules] of cases) {
    const text = read(file);
    for (const m of modules) {
      assert.ok(lazyOf(text, m), `${file} loads ${m} lazily`);
      assert.ok(!staticOf(text, m), `${file} never imports ${m} up front`);
    }
  }
});

test("the first download is still React and the error notice, without the app", () => {
  const imports = [...read("src/main.tsx").matchAll(/^import [^;]*?from "([^"]+)";|^import "([^"]+)";/gm)].map((m) => m[1] ?? m[2]);
  assert.deepEqual(imports.sort(), ["./styles.css", "react", "react-dom/client"]);
});

test("an explainer's pieza.md is written as before the split", () => {
  assert.equal(pieceMarkdown(newMotionPiece("vertical"), []), "# Explicativo sin guion todavía\n");
  const scenes = [
    { ...blankScene("hook"), id: "a", title: "El pedido llegó tarde", seconds: 3, voice: "Otra vez tarde.", emotion: "cansada" },
    { ...blankScene("screen"), id: "b", title: "Así se arma", seconds: 4.5, items: ["Leche", "Pan"], disclosure: "concept" as const },
  ];
  const script: MotionScript = {
    problem: "Los pedidos llegan tarde",
    title: "Antes del corte",
    durationNote: "",
    scenes,
    music: { mood: "calm", bpm: 100 },
    note: "",
    caption: "Armá el pedido antes del corte.",
    tone: "warm",
  };
  const md = pieceMarkdown({ ...newMotionPiece("vertical"), script, music: "synth" }, scenes);
  assert.match(md, /^# Los pedidos llegan tarde\n\n\*\*Antes del corte\*\* · 7\.5 s · música: sintetizada \(.+, 100 bpm\)/);
  assert.match(md, /\*\*Texto para publicar:\*\* Armá el pedido antes del corte\./);
  assert.match(md, /## 1\. .+ · 0\.0–3\.0 s\n/);
  assert.match(md, /- \*\*Voz\*\* \(cansada\): “Otra vez tarde\.”/);
  assert.match(md, /## 2\. .+ · 3\.0–7\.5 s · \*\*CONCEPTO\*\*/);
  assert.match(md, /- \*\*Elementos:\*\* Leche · Pan/);
});
