// Publicidad, "Versión estática" (Imagen fija, paso 3): hook → still concept and Grok prompt, the file names, the
// variants, the checks and the campaign CSV rows next to the videos.
import assert from "node:assert/strict";
import { test } from "node:test";
import { AdsStateSchema, CSV_HEAD, ctasFromWire, defaultSplit, emptyAds, hooksFromWire, parseCsv, type Batch, type HookStatic } from "../shared/ads.ts";
import {
  allStaticPrompts,
  campaignCsv,
  defaultStatic,
  hookConcept,
  hookFamily,
  hookHeadline,
  keepOutOf,
  parseStaticFile,
  staticBelongs,
  staticChecks,
  staticFile,
  staticJobs,
  staticPrompt,
  staticRows,
  staticVariants,
  staticsCsv,
} from "../shared/adsStatic.ts";

const brand = { accent: "#e4572e", bg: "#fff8f0" };
const offer = { problem: "El proveedor cierra antes de que armes el pedido", promise: "El pedido sale armado antes del corte" };

function state() {
  const s = emptyAds("iman");
  s.hooks.push(
    ...hooksFromWire(
      s,
      {
        hooks: [
          {
            text: "¿Otra vez el proveedor cerró antes del pedido? Pasa todos los jueves.",
            level: 2,
            angle: "pain",
            formula: "question",
            onScreenText: "Cerró antes del pedido",
            visualPrompt: "A shop owner at the counter at 7 p.m., staring at a phone with an unanswered order, half-empty shelves behind",
            videoPrompt: "",
          },
          { text: "Antes: tres cuadernos. Después: uno solo.", level: 3, angle: "desire", formula: "beforeAfter", onScreenText: "", visualPrompt: "", videoPrompt: "" },
        ],
        note: "",
      },
      defaultSplit(15).hook,
      "ai",
      "approved",
    ),
  );
  const ctas = ctasFromWire(s, { ctas: [{ text: "Probalo gratis hoy", levels: [2, 3], what: "Probalo gratis", why: "", when: "", easy: "", onScreenText: "Probalo gratis", visualPrompt: "", videoPrompt: "" }], note: "" }, 3, [2]);
  ctas.forEach((c) => (c.status = "approved"));
  s.ctas.push(...ctas);
  return s;
}

test("a hook maps to a still concept with no proof to confirm and its on-screen line", () => {
  const s = state();
  const [h1, h2] = s.hooks;
  assert.equal(hookFamily(h1), "nightmare");
  assert.equal(hookFamily(h2), "beforeAfter");
  assert.equal(hookFamily({ angle: "proof", formula: "number" }), "benefit");
  const c = hookConcept(h1, offer);
  assert.equal(c.id, "H1");
  assert.equal(c.copy.headline, "Cerró antes del pedido");
  assert.equal(c.copy.placement, "top");
  assert.equal(c.relief, offer.promise);
  assert.ok(c.picture.startsWith("A shop owner"));
  // No onScreenText: the first sentence of the hook.
  assert.equal(hookHeadline(h2), "Antes: tres cuadernos.");
  // No visualPrompt: the picture is built from the hook's words.
  assert.match(hookConcept(h2, offer).picture, /frozen moment.*tres cuadernos/);
});

test("the Grok prompt is the still builder's: no text, clear space where the words go, 9:16", () => {
  const s = state();
  const h = s.hooks[0];
  const top = staticPrompt(h, offer, defaultStatic(h), { brand });
  assert.match(top, /^A shop owner at the counter/);
  assert.match(top, /top third of the frame stays calm and empty/);
  assert.match(top, /no lettering, no logos/);
  assert.match(top, /9:16/);
  assert.ok(!/cinematic/i.test(top));
  const bottom = staticPrompt(h, offer, { ...defaultStatic(h), placements: ["bottom", "top"] }, { brand });
  assert.match(bottom, /bottom third of the frame stays calm/);
  const all = allStaticPrompts([{ hook: h, prompt: top }, { hook: s.hooks[1], prompt: "p2" }]);
  assert.equal(all, `H1 · Cerró antes del pedido\n${top}\n\nH2 · Antes: tres cuadernos.\np2`);
});

test("files are <hookId>-<format>.png, later variants -vN-, and never mix H1 with H12", () => {
  assert.equal(staticFile("H12", 1, "9x16"), "H12-9x16.png");
  assert.equal(staticFile("H12", 3, "4x5"), "H12-v3-4x5.png");
  assert.deepEqual(parseStaticFile("H12-v3-4x5.png"), { hookId: "H12", n: 3, format: "4x5" });
  assert.deepEqual(parseStaticFile("H1-1x1.png"), { hookId: "H1", n: 1, format: "1x1" });
  assert.equal(parseStaticFile("H1-1x1.jpg"), null);
  assert.equal(parseStaticFile("../H1-1x1.png"), null);
  assert.equal(parseStaticFile("H1-imagen.png"), null);
  assert.ok(staticBelongs("H1-9x16.png", "H1"));
  assert.ok(!staticBelongs("H12-9x16.png", "H1"));
});

test("variants and jobs: headlines × calls × placements, one file per variant and format", () => {
  const s = state();
  const h = s.hooks[0];
  const st: HookStatic = { ...defaultStatic(h), headlines: "Cerró antes del pedido\nOtra vez jueves | Y el camión no vuelve", ctas: "Probalo gratis", formats: ["9x16", "1x1"] };
  const v = staticVariants(h, st);
  assert.equal(v.length, 2);
  assert.deepEqual([v[1].headline, v[1].sub, v[1].cta, v[1].placement], ["Otra vez jueves", "Y el camión no vuelve", "Probalo gratis", "top"]);
  assert.deepEqual(staticJobs(h, st).map((j) => j.file), ["H1-9x16.png", "H1-1x1.png", "H1-v2-9x16.png", "H1-v2-1x1.png"]);
  // Empty headlines: the hook's own line.
  assert.equal(staticVariants(h, { ...st, headlines: "" })[0].headline, "Cerró antes del pedido");
  assert.deepEqual(keepOutOf(st, { corner: "bottom-right", w: 0.2, h: 0.06 }), { corner: "bottom-right", w: 0.2, h: 0.06 });
  assert.deepEqual(keepOutOf({ ...st, keepOut: { corner: "none", w: 0, h: 0 } }, { corner: "bottom-right", w: 0.2, h: 0.06 }).corner, "none");
});

test("checks: [VERIFY], a pending hook, the review's claims and the watermark block; a missing Turn does not", () => {
  const s = state();
  const h = s.hooks[0];
  const base: Parameters<typeof staticChecks>[0] = {
    hook: h,
    offer,
    variants: staticVariants(h, defaultStatic(h)),
    layouts: [{ label: "Variante 1, 9:16", fits: true, problems: [] as string[] }],
    picture: true,
    fontsLoaded: true,
    watermarkWhole: true,
    references: [],
    brandName: "IMAN",
    flags: [],
  };
  assert.deepEqual(staticChecks(base), []);
  const ids = (o: Partial<typeof base>) => staticChecks({ ...base, ...o }).filter((p) => p.blocking).map((p) => p.id);
  assert.deepEqual(ids({ variants: [{ ...base.variants[0], headline: "Ahorrás 3 horas [VERIFY]" }] }), ["verify"]);
  assert.deepEqual(ids({ hook: { ...h, status: "pending" } }), ["aprobado"]);
  assert.deepEqual(ids({ flags: [{ kind: "claim", note: "«Todos los jueves» sin dato." }, { kind: "duplicate", note: "x" }] }), ["revision:claim"]);
  assert.deepEqual(ids({ watermarkWhole: false }), ["marca-de-agua"]);
  assert.deepEqual(ids({ picture: false, fontsLoaded: false }), ["imagen", "letra"]);
  assert.deepEqual(ids({ layouts: [{ label: "Variante 1, 1:1", fits: false, problems: ["El texto no entra."] }] }), ["entra:Variante 1, 1:1"]);
});

test("the campaign CSV lists the statics of the batch's hooks after the videos", () => {
  const s = state();
  const [h1, h2] = s.hooks;
  s.statics = {
    H1: { ...defaultStatic(h1), ctaId: "C1", ctas: "Probalo gratis", headlines: "Cerró antes del pedido\nOtra vez jueves", exports: ["H1-v2-9x16.png", "H1-9x16.png", "H1-1x1.png"] },
    H2: { ...defaultStatic(h2), exports: ["H2-4x5.png"] },
  };
  const batch: Batch = {
    id: "tanda-1",
    createdAt: new Date().toISOString(),
    seconds: 15,
    mode: "full",
    rules: { sameLevel: true },
    ads: [{ id: "H1-M1-C1", hookId: "H1", meatId: "M1", ctaId: "C1", level: 2 }],
    copies: { "H1-C1": { primary: "Pedí antes del corte, sin cuadernos.", headline: "El pedido a tiempo", button: "Registrarte" } },
    files: { "H1-M1-C1": "H1-M1-C1.mp4" },
  };
  const table = parseCsv(campaignCsv(batch, s.hooks, [], s.ctas, s.statics));
  assert.deepEqual(table[0], CSV_HEAD);
  assert.deepEqual(table.map((r) => r[0]), ["id", "H1-M1-C1", "H1-1x1", "H1-9x16", "H1-v2-9x16"]);
  const video = table[1];
  assert.deepEqual([video[10], video[11]], ["video", "15 s"]);
  const [, sq, , v2] = table.slice(1);
  assert.deepEqual(sq, [
    "H1-1x1",
    "../../estaticos/H1-1x1.png",
    "2 · Consciente del problema",
    "Fría",
    h1.text,
    "",
    "Probalo gratis",
    "Pedí antes del corte, sin cuadernos.",
    "El pedido a tiempo",
    "Registrarte",
    "imagen",
    "1:1",
    "",
    "",
    "",
  ]);
  assert.equal(v2[11], "9:16");
  // H2 is not in the batch: only in estaticos.csv, with the file next to it and no platform texts.
  const all = parseCsv(staticsCsv(s.hooks, s.ctas, s.statics));
  assert.deepEqual(all.map((r) => r[0]), ["id", "H1-1x1", "H1-9x16", "H1-v2-9x16", "H2-4x5"]);
  assert.deepEqual([all[4][1], all[4][8], all[4][9]], ["H2-4x5.png", "Antes: tres cuadernos.", ""]);
  // A hook with no exports adds no rows; a file of another hook in the list is ignored.
  assert.equal(staticRows({ hooks: s.hooks, ctas: s.ctas, statics: { H1: { ...defaultStatic(h1), exports: ["H12-9x16.png"] } }, prefix: "" }).length, 0);
});

test("older campaign files load with no statics", () => {
  const raw = { ...emptyAds("iman") } as Record<string, unknown>;
  delete raw.statics;
  const parsed = AdsStateSchema.parse(raw);
  assert.deepEqual(parsed.statics, {});
  const one = AdsStateSchema.parse({ ...raw, statics: { H1: { headlines: "x" } } });
  assert.deepEqual(one.statics.H1.placements, ["top"]);
  assert.equal(one.statics.H1.picture, null);
});

test("a static ad's preview is drawn again when the brand fonts arrive (its key changes with them)", async () => {
  const { previewKey } = await import("../src/lib/stillDraw.ts");
  const { DEFAULT_BRAND } = await import("../shared/series.ts");
  const parts = {
    format: "9x16" as const,
    fit: "full" as const,
    keepOut: { corner: "bottom-right" as const, w: 0.2, h: 0.06 },
    copies: [{ headline: "Frío afuera", sub: "", cta: "", placement: "bottom" as const, align: "left" as const }],
    selected: 0,
    pictureSize: { w: 1080, h: 1920 },
    brand: DEFAULT_BRAND,
    open: false,
  };
  assert.notEqual(previewKey({ ...parts, fontsReady: false }), previewKey({ ...parts, fontsReady: true }));
  // Estáticos passes the panel's fontsReady down to every row's preview.
  const { readFileSync } = await import("node:fs");
  const panel = readFileSync(new URL("../src/components/ads/StaticsPanel.tsx", import.meta.url), "utf8");
  assert.match(panel, /previewKey\(\{[^}]*fontsReady[^}]*\}\)/);
  assert.match(panel, /fontsReady=\{fontsReady\}/);
});

test("edits sent as Estáticos closes are saved one after another and their last answer reaches the studio", async () => {
  const { flushInOrder } = await import("../shared/adsStatic.ts");
  const sent: string[] = [];
  const states: string[] = [];
  let release: () => void = () => undefined;
  const first = new Promise<void>((r) => (release = r));
  const done = flushInOrder(
    [
      ["H1", { headlines: "uno" }],
      ["H2", { headlines: "dos" }],
    ],
    async (id) => {
      sent.push(id);
      if (id === "H1") await first;
      return `estado tras ${id}`;
    },
    (s) => states.push(s),
  );
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(sent, ["H1"], "the second waits for the first");
  release();
  await done;
  assert.deepEqual(sent, ["H1", "H2"]);
  assert.deepEqual(states, ["estado tras H1", "estado tras H2"]);
  // One that fails does not stop the rest.
  const after: string[] = [];
  await flushInOrder([["A", {}], ["B", {}]], async (id) => (id === "A" ? Promise.reject(new Error("x")) : id), (s) => after.push(s));
  assert.deepEqual(after, ["B"]);
});

test("Estáticos takes what the server saved for every hook it is not editing or saving right now", async () => {
  const { adoptSaved } = await import("../shared/adsStatic.ts");
  const mk = (headlines: string) => ({ headlines }) as unknown as HookStatic;
  const local = { H1: mk("viejo"), H2: mk("tipeando"), H3: mk("igual") };
  const saved = { H1: mk("nuevo"), H2: mk("del servidor"), H3: mk("igual"), H4: mk("otro") };
  const next = adoptSaved(local, saved, new Set(["H2"]));
  assert.equal(next.H1.headlines, "nuevo", "the text saved as the panel closed comes back when it opens again");
  assert.equal(next.H2.headlines, "tipeando", "an edit on its way is never overwritten");
  assert.equal(next.H4.headlines, "otro");
  assert.equal(next.H3, local.H3);
  assert.equal(adoptSaved(local, { H3: mk("igual") }, new Set()), local, "nothing new: the same object");
});
