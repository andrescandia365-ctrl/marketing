// "Pantallas en lote": many real screenshots at once. Names from file names, unique ids and @refs, the claude.ai
// paste-back parser and its matching by file name, the order after review and what the writers read.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  batchFileName,
  cleanScreenName,
  guessDevice,
  matchScreenNames,
  nextScreenNumber,
  parseScreenNames,
  promptBatches,
  renameScreen,
  reorderSubset,
  screenFileProblem,
  screenMember,
  screenNamingPrompt,
  screenTypeOf,
  screensForWriter,
  uniqueScreenId,
  uniqueScreenRef,
  worksTodayOffers,
} from "../shared/screenBatch.ts";
import { CastMemberSchema, EMPTY_SERIES, markdownToSeries, seriesToMarkdown, type CastMember } from "../shared/series.ts";

const member = (id: string, over: Partial<CastMember> = {}): CastMember =>
  CastMemberSchema.parse({ id, name: id, ref: id.replace(/-/g, ""), kind: "screen", identity: "", note: "", image: "", ...over });

test("cleanScreenName reads a file name, and drops the ones a device made up", () => {
  assert.equal(cleanScreenName("stock-buscar.png"), "Stock buscar");
  assert.equal(cleanScreenName("capturas/pedido_al_proveedor.PNG"), "Pedido al proveedor");
  assert.equal(cleanScreenName("stockBuscar.webp"), "Stock buscar");
  assert.equal(cleanScreenName("01-caja.jpg"), "Caja");
  assert.equal(cleanScreenName("VENCIMIENTOS.png"), "Vencimientos");
  assert.equal(cleanScreenName("Turnos Semana.png"), "Turnos Semana");
  for (const auto of ["IMG_2031.png", "Screenshot 2026-10-02 at 10.31.22.png", "Captura de pantalla 2026-10-02 103122.png", "WhatsApp Image 2026-10-01 at 09.12.33.jpeg", "PXL_20261001_101010.jpg", "image (3).png", "1234.png", "a3f9c2d1e8b7.png", "Screenshot_20261002-103122.png"]) {
    assert.equal(cleanScreenName(auto), "", auto);
  }
});

test("a made-up file name becomes the next free Pantalla N", () => {
  const cast = [member("pantalla-1", { name: "Pantalla 1" }), member("pantalla-2", { name: "Pantalla 2" }), member("ana", { kind: "character", name: "Ana" })];
  assert.equal(nextScreenNumber(cast), 3);
  assert.equal(nextScreenNumber([...cast, member("pantalla-3", { name: "Otra" })]), 4);
  const m = screenMember({ fileName: "IMG_2031.png" }, cast);
  assert.equal(m.name, "Pantalla 3");
  assert.equal(m.id, "pantalla-3");
  assert.equal(m.pending, true);
  assert.equal(m.kind, "screen");
  assert.equal(batchFileName(m), "IMG_2031.png");
  assert.equal(batchFileName(member("vieja")), "vieja");
  assert.ok(CastMemberSchema.safeParse(m).success);
});

test("ids and @refs never repeat, any case, extra references included", () => {
  assert.equal(uniqueScreenId("Stock buscar", []), "pantalla-stock-buscar");
  assert.equal(uniqueScreenId("Stock buscar", ["pantalla-stock-buscar"]), "pantalla-stock-buscar-2");
  assert.equal(uniqueScreenId("Pantalla 4", []), "pantalla-4");
  assert.equal(uniqueScreenId("Señal y Configuración de la app para el local con un nombre largo", []).length <= 40, true);
  const cast = [member("a", { ref: "StockBuscar" }), member("b", { kind: "character", ref: "Marta", refs: [{ ref: "STOCKBUSCAR2", label: "x", image: "" }] })];
  assert.equal(uniqueScreenRef("Stock buscar", cast), "StockBuscar3");
  assert.equal(uniqueScreenRef("Caja", cast), "Caja");
  // Batch: each new member counts the ones before it.
  let all: CastMember[] = [];
  for (const f of ["caja.png", "caja.jpg", "IMG_1.png", "IMG_2.png"]) all = [...all, screenMember({ fileName: f }, all)];
  assert.deepEqual(all.map((m) => [m.id, m.ref, m.name]), [
    ["pantalla-caja", "Caja", "Caja"],
    ["pantalla-caja-2", "Caja2", "Caja"],
    ["pantalla-3", "Pantalla3", "Pantalla 3"],
    ["pantalla-4", "Pantalla4", "Pantalla 4"],
  ]);
});

test("renaming moves an automatic @ref along, never a hand-made one", () => {
  const cast = [member("pantalla-3", { name: "Pantalla 3", ref: "Pantalla3" }), member("x", { ref: "Caja" })];
  assert.equal(renameScreen(cast[0], "Caja", cast).ref, "Caja2");
  assert.equal(renameScreen(cast[0], "Stock", cast).ref, "Stock");
  const hand = member("h", { name: "Stock", ref: "MiPantalla" });
  assert.equal(renameScreen(hand, "Caja", [hand]).ref, "MiPantalla");
});

test("device from the picture's shape; file checks; type read from the bytes", () => {
  assert.equal(guessDevice(1170, 2532), "phone");
  assert.equal(guessDevice(1920, 1080), "pc");
  assert.equal(guessDevice(1000, 1000), "pc");
  assert.equal(screenFileProblem({ name: "a.png", size: 0, type: "image/png" }), "El archivo está vacío.");
  assert.match(screenFileProblem({ name: "a.png", size: 16 * 1024 * 1024, type: "image/png" }), /15 MB/);
  assert.match(screenFileProblem({ name: "a.heic", size: 10, type: "image/heic" }), /PNG, JPG o WebP/);
  assert.equal(screenFileProblem({ name: "a.png", size: 10, type: "image/png" }), "");
  assert.equal(screenTypeOf(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])), "image/png");
  assert.equal(screenTypeOf(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), "image/jpeg");
  assert.equal(screenTypeOf(new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ")), "image/webp");
  assert.equal(screenTypeOf(new TextEncoder().encode("<svg onload=alert(1)>")), null);
});

test("the paste-back parser takes the strict format and tolerates bullets, tables and fences", () => {
  const text = [
    "Acá van:",
    "```",
    "archivo | nombre | qué muestra | celular o pc",
    "- stock-buscar.png | Stock buscar | Buscador de productos con su stock | celular",
    "2. IMG_2031.png | Pedido al proveedor | Lista del pedido por proveedor | PC",
    "| caja.jpg | Caja | Cierre de caja del día | computadora |",
    "|---|---|---|---|",
    "vto.png | Vencimientos | Productos por vencer",
    "raro.png | Raro | Algo | tostadora",
    "solo.png | Solo",
    "otra.png sin columnas",
    "```",
  ].join("\n");
  const { rows, problems } = parseScreenNames(text);
  assert.deepEqual(
    rows.map((r) => [r.file, r.name, r.shows, r.device]),
    [
      ["stock-buscar.png", "Stock buscar", "Buscador de productos con su stock", "phone"],
      ["IMG_2031.png", "Pedido al proveedor", "Lista del pedido por proveedor", "pc"],
      ["caja.jpg", "Caja", "Cierre de caja del día", "pc"],
      ["vto.png", "Vencimientos", "Productos por vencer", undefined],
      ["raro.png", "Raro", "Algo", undefined],
    ],
  );
  assert.deepEqual(problems.map((p) => p.line), [9, 10, 11]);
  assert.match(problems[0].reason, /tostadora/);
  assert.match(problems[1].reason, /4/);
});

test("answers match their screens by file name, extension and case aside", () => {
  const items = [
    { key: "a", fileName: "Stock-Buscar.PNG" },
    { key: "b", fileName: "IMG_2031.png" },
    { key: "c", fileName: "caja.png" },
    { key: "d", fileName: "caja.jpg" },
    { key: "e", fileName: "nadie.png" },
  ];
  const { rows } = parseScreenNames(
    ["stock buscar.png | Stock | s | celular", "IMG_2031 | Pedido | p | pc", "caja.jpg | Caja jpg | c | pc", "caja | Caja ambigua | c | pc", "fantasma.png | X | x | pc"].join("\n"),
  );
  const { matched, unmatched, missing } = matchScreenNames(rows, items);
  assert.deepEqual(
    matched.map((m) => [m.item.key, m.row.name]),
    [
      ["a", "Stock"],
      ["b", "Pedido"],
      ["d", "Caja jpg"],
      // caja.jpg is taken, so "caja" now names one screen only.
      ["c", "Caja ambigua"],
    ],
  );
  assert.deepEqual(unmatched.map((r) => r.file), ["fantasma.png"]);
  assert.deepEqual(missing.map((m) => m.key), ["e"]);
  // With both still free, a bare stem names two screens and matches neither.
  const two = matchScreenNames(parseScreenNames("caja | C | c | pc").rows, items.slice(2, 4));
  assert.equal(two.matched.length, 0);
  assert.equal(two.unmatched.length, 1);
});

test("the claude.ai prompt names every file and the exact answer format, in batches of 20", () => {
  const prompt = screenNamingPrompt({ series: "IMAN", files: ["a.png", "b.png"], worksToday: ["Pedidos al proveedor"], batch: { n: 1, of: 3 } });
  assert.match(prompt, /- a\.png\n- b\.png/);
  assert.match(prompt, /archivo \| nombre \| qué muestra \| celular o pc/);
  assert.match(prompt, /tanda 1 de 3/);
  assert.match(prompt, /- Pedidos al proveedor/);
  assert.match(prompt, /No inventes/);
  const batches = promptBatches(Array.from({ length: 45 }, (_, i) => i));
  assert.deepEqual(batches.map((b) => b.length), [20, 20, 5]);
  // The prompt's own example parses with the parser.
  const example = prompt.split("\n").at(-1)!;
  assert.equal(parseScreenNames(example).rows.length, 1);
});

test("reviewed screens keep the order the person left, among the rest of the cast", () => {
  const list = [{ id: "ana" }, { id: "s1" }, { id: "lugar" }, { id: "s2" }, { id: "s3" }];
  assert.deepEqual(reorderSubset(list, ["s3", "s1", "s2"]).map((m) => m.id), ["ana", "s3", "lugar", "s1", "s2"]);
  assert.deepEqual(reorderSubset(list, ["s2", "nope", "s1"]).map((m) => m.id), ["ana", "s2", "lugar", "s1", "s3"]);
});

test("the writers read confirmed screens with name, function and device; pending ones stay out", () => {
  const cast = [
    member("pantalla-stock", { name: "Stock buscar", ref: "StockBuscar", identity: "Buscador de productos", device: "phone", image: "pantalla-stock.png" }),
    member("pantalla-caja", { name: "Caja", ref: "Caja", identity: "Cierre del día", device: "pc", pending: true }),
    member("ana", { kind: "character", name: "Ana" }),
  ];
  const text = screensForWriter(cast);
  assert.equal(text, "- pantalla-stock (@StockBuscar, phone): Stock buscar — Buscador de productos");
  assert.equal(screensForWriter(cast, ["otra"]), "");
});

test("works-today offers skip lines already listed and screens with no function", () => {
  const offers = worksTodayOffers(
    [
      { id: "a", name: "Stock buscar", identity: "Buscador de productos con su stock" },
      { id: "b", name: "Caja", identity: "" },
      { id: "c", name: "Pedidos", identity: "Pedido al proveedor por WhatsApp" },
    ],
    ["El pedido al proveedor por WhatsApp sale solo"],
  );
  assert.deepEqual(offers, [{ id: "a", line: "Stock buscar: Buscador de productos con su stock" }]);
});

test("device and pending survive the bible's round trip; older screens load without them", () => {
  const fields = { ...EMPTY_SERIES, name: "IMAN", cast: [member("pantalla-x", { device: "phone", pending: true }), member("pantalla-y")] };
  const back = markdownToSeries(seriesToMarkdown(fields), "iman");
  assert.equal(back.cast[0].device, "phone");
  assert.equal(back.cast[0].pending, true);
  assert.equal(back.cast[1].device, undefined);
  assert.equal(back.cast[1].pending, undefined);
});
