// "Traer la marca desde su web" → cast: product photos and screenshots found on the brand's page, the checks on every
// picture it brings (address, redirects, size, real type) and the cast member a picked one becomes.
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  BrandWebError,
  MAX_PICTURE,
  PICTURES_PER_KIND,
  bringPictures,
  checkPicture,
  checkUrl,
  fetchPicture,
  imageInfo,
  largestSrc,
  parseBrandPage,
  privateAddress,
  sitePictures,
  type FetchedPicture,
  type PictureCandidate,
} from "../server/brandWeb.ts";
import { CastMemberSchema } from "../shared/series.ts";
import { addWebCast, webCastMember, webPictureKinds } from "../shared/webCast.ts";

const base = new URL("https://tienda.example.com/productos/taza");

const SHOP = `<!doctype html><html><head>
<title>Taza Nube | Casa Linda</title>
<meta property="og:type" content="product">
<meta property="og:title" content="Taza Nube">
<meta property="og:image" content="/img/og-taza.jpg">
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Organization","name":"Casa Linda","logo":"/logo.png"},
{"@type":"Product","name":"Taza Nube &amp; plato","image":["https://cdn.example.com/taza-1.jpg",{"@type":"ImageObject","url":"/img/taza-2.jpg"}]}]}</script>
<script type="application/ld+json">{ broken json </script>
</head><body>
<header class="site-header"><a href="/"><img src="/logo.svg" alt="Casa Linda logo"></a></header>
<div class="product-gallery"><img src="https://cdn.example.com/taza-1.jpg?width=400" alt="Taza Nube blanca">
<img srcset="/img/taza-lado-480.jpg 480w, /img/taza-lado-1200.jpg 1200w" src="/img/taza-lado-480.jpg" alt="Taza de costado"></div>
<img src="/img/pixel.gif" width="1" height="1">
<img src="/img/avatar-ana.jpg" alt="Ana">
<footer class="footer"><img src="/img/visa.png" alt="Visa"></footer>
</body></html>`;

const SAAS = `<html><head><title>Planilla</title><meta property="og:image" content="/social-card.png"></head><body>
<nav class="nav"><img src="/brand/logo.png" alt="Planilla"></nav>
<section class="hero"><h1>Turnos sin planilla</h1><img src="/shots/turnos.png" alt="Pantalla de turnos de la semana"></section>
<section id="features"><div class="feature"><img data-src="/shots/stock.webp" alt="Control de stock"></div></section>
<section class="testimonials"><img src="/people/marta.jpg" alt="Marta, dueña"></section>
<script type="application/ld+json">{"@type":"SoftwareApplication","name":"Planilla","screenshot":"https://planilla.example.com/shots/app.png"}</script>
<img src="data:image/png;base64,AAAA" alt="screen">
</body></html>`;

test("product photos come from the product's JSON-LD first, then the product share image, then the gallery", () => {
  const pics = sitePictures(SHOP, base).filter((p) => p.kind === "product");
  assert.deepEqual(
    pics.slice(0, 3).map((p) => [p.url, p.source]),
    [
      ["https://cdn.example.com/taza-1.jpg", "jsonld"],
      ["https://tienda.example.com/img/taza-2.jpg", "jsonld"],
      ["https://tienda.example.com/img/og-taza.jpg", "og"],
    ],
  );
  assert.equal(pics[0].name, "Taza Nube & plato");
  assert.equal(pics[2].name, "Taza Nube");
  const urls = pics.map((p) => p.url);
  // The same picture resized on a CDN is offered once; the srcset gives its biggest size.
  assert.equal(urls.filter((u) => u.includes("taza-1.jpg")).length, 1);
  assert.ok(urls.includes("https://tienda.example.com/img/taza-lado-1200.jpg"));
  // Logos, tracking pixels, avatars and payment badges in the footer are never offered.
  for (const bad of ["logo", "pixel", "avatar", "visa"]) assert.ok(!urls.some((u) => u.includes(bad)), bad);
});

test("screenshots come from the app's JSON-LD and the hero and feature parts, never logos or testimonials", () => {
  const pics = sitePictures(SAAS, new URL("https://planilla.example.com/"));
  const screens = pics.filter((p) => p.kind === "screen");
  assert.equal(screens[0].url, "https://planilla.example.com/shots/app.png");
  assert.equal(screens[0].source, "jsonld");
  const urls = screens.map((p) => p.url);
  assert.ok(urls.includes("https://planilla.example.com/shots/turnos.png"));
  assert.ok(urls.includes("https://planilla.example.com/shots/stock.webp"), "lazy data-src in a feature part");
  assert.ok(!urls.some((u) => /logo|marta|social-card|^data:/.test(u)));
  assert.equal(screens.find((p) => p.url.endsWith("turnos.png"))?.name, "Pantalla de turnos de la semana");
  // A share card on a page that is not a product is a last resort for products and never a screen.
  const og = pics.filter((p) => p.url.endsWith("social-card.png"));
  assert.deepEqual(og.map((p) => p.kind), ["product"]);
});

test("parseBrandPage carries the pictures with the rest of the facts", async () => {
  const facts = await parseBrandPage(SHOP, base, async () => "");
  assert.ok(facts.pictures.length > 0);
  assert.ok(facts.pictures.every((p) => p.url.startsWith("https://")));
});

test("largestSrc picks the widest or densest entry", () => {
  assert.equal(largestSrc("a.jpg 320w, b.jpg 1280w, c.jpg 640w"), "b.jpg");
  assert.equal(largestSrc("a.jpg 1x, b.jpg 2x"), "b.jpg");
  assert.equal(largestSrc("only.jpg"), "only.jpg");
});

test("which kinds each series type asks for", () => {
  assert.deepEqual(webPictureKinds("ecommerce"), ["product"]);
  assert.deepEqual(webPictureKinds("software"), ["screen"]);
  assert.deepEqual(webPictureKinds("music"), []);
  assert.deepEqual(webPictureKinds(undefined), ["product", "screen"]);
});

// Minimal headers: enough bytes for the type and size, as a real file starts.
function png(w: number, h: number): Buffer {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write("IHDR", 12, "ascii");
  b.writeUInt32BE(w, 16);
  b.writeUInt32BE(h, 20);
  return b;
}
function jpeg(w: number, h: number): Buffer {
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x10, ...Buffer.from("JFIF\0"), 1, 1, 0, 0, 1, 0, 1, 0, 0]);
  const sof = Buffer.alloc(19);
  sof.writeUInt16BE(0xffc0, 0);
  sof.writeUInt16BE(17, 2);
  sof[4] = 8;
  sof.writeUInt16BE(h, 5);
  sof.writeUInt16BE(w, 7);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof, Buffer.from([0xff, 0xd9])]);
}
function gif(w: number, h: number): Buffer {
  const b = Buffer.alloc(13);
  b.write("GIF89a", 0, "ascii");
  b.writeUInt16LE(w, 6);
  b.writeUInt16LE(h, 8);
  return b;
}
function webpX(w: number, h: number): Buffer {
  const b = Buffer.alloc(30);
  b.write("RIFF", 0, "ascii");
  b.write("WEBP", 8, "ascii");
  b.write("VP8X", 12, "ascii");
  b.writeUIntLE(w - 1, 24, 3);
  b.writeUIntLE(h - 1, 27, 3);
  return b;
}

test("imageInfo reads the real type and size from the bytes", () => {
  assert.deepEqual(imageInfo(png(800, 600)), { type: "image/png", width: 800, height: 600 });
  assert.deepEqual(imageInfo(jpeg(1024, 768)), { type: "image/jpeg", width: 1024, height: 768 });
  assert.deepEqual(imageInfo(gif(300, 250)), { type: "image/gif", width: 300, height: 250 });
  assert.deepEqual(imageInfo(webpX(1280, 720)), { type: "image/webp", width: 1280, height: 720 });
  assert.equal(imageInfo(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'></svg>")), null);
  assert.equal(imageInfo(Buffer.from("<!doctype html><title>404</title>")), null);
});

test("checkPicture refuses cut files, pages, SVGs, icons and giants", () => {
  assert.deepEqual(checkPicture(png(800, 600), "image/png", false), { type: "image/png", width: 800, height: 600 });
  // The bytes decide the type, not the header (a CDN that says octet-stream).
  assert.equal(checkPicture(jpeg(640, 480), "application/octet-stream", false).type, "image/jpeg");
  assert.throws(() => checkPicture(png(800, 600), "image/png", true), BrandWebError);
  assert.throws(() => checkPicture(png(800, 600), "text/html; charset=utf-8", false), BrandWebError);
  assert.throws(() => checkPicture(Buffer.from("<svg/>"), "image/svg+xml", false), BrandWebError);
  assert.throws(() => checkPicture(png(64, 64), "image/png", false), /muy chica/);
  assert.throws(() => checkPicture(png(20_000, 900), "image/png", false), /demasiado grande/);
});

test("only public addresses: this computer, the local network and cloud metadata are refused", async () => {
  for (const ip of ["127.0.0.1", "10.1.2.3", "192.168.0.10", "172.20.0.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:a9fe:a9fe"]) {
    assert.ok(privateAddress(ip), ip);
  }
  for (const ip of ["93.184.216.34", "8.8.8.8", "2606:4700::1111", "::ffff:5db8:d822"]) assert.ok(!privateAddress(ip), ip);
  for (const url of ["http://127.0.0.1/a.png", "http://[::1]/a.png", "http://[::ffff:127.0.0.1]/a.png", "http://169.254.169.254/latest/meta-data", "http://localhost:8787/", "ftp://93.184.216.34/x", "https://u:p@93.184.216.34/"]) {
    await assert.rejects(checkUrl(url), BrandWebError, url);
  }
  assert.equal((await checkUrl("https://93.184.216.34/a.png")).host, "93.184.216.34");
});

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

test("fetchPicture checks every redirect and returns a data URL typed by its bytes", async () => {
  const seen: string[] = [];
  globalThis.fetch = (async (input: string | URL) => {
    const url = String(input);
    seen.push(url);
    if (url.endsWith("/sneaky.png")) return new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest" } });
    if (url.endsWith("/moved.png")) return new Response(null, { status: 301, headers: { location: "/final.png" } });
    if (url.endsWith("/final.png")) return new Response(new Uint8Array(png(900, 700)), { headers: { "content-type": "image/png" } });
    if (url.endsWith("/huge.png")) return new Response(new Uint8Array(Buffer.concat([png(900, 700), Buffer.alloc(MAX_PICTURE)])), { headers: { "content-type": "image/png" } });
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
  const pick = (url: string): PictureCandidate => ({ url, name: "Taza", kind: "product", source: "page" });

  await assert.rejects(fetchPicture(pick("https://93.184.216.34/sneaky.png")), BrandWebError);
  assert.ok(!seen.some((u) => u.includes("169.254")), "the metadata address is never opened");
  const ok = await fetchPicture(pick("https://93.184.216.34/moved.png"));
  assert.ok(ok.image.startsWith("data:image/png;base64,"));
  assert.equal(ok.width, 900);
  await assert.rejects(fetchPicture(pick("https://93.184.216.34/huge.png")), /pesa más/);
  await assert.rejects(fetchPicture(pick("http://10.0.0.5/x.png")), BrandWebError);
});

test("bringPictures keeps the kinds asked for, drops failures, caps each kind and brings a shared picture once", async () => {
  const cands: PictureCandidate[] = [
    ...Array.from({ length: 8 }, (_, i) => ({ url: `https://x.example/p${i}.jpg`, name: `P${i}`, kind: "product" as const, source: "page" as const })),
    { url: "https://x.example/hero.jpg", name: "Hero", kind: "screen", source: "page" },
    { url: "https://x.example/p0.jpg", name: "P0", kind: "screen", source: "page" },
  ];
  const calls: string[] = [];
  const fake = async (c: PictureCandidate): Promise<FetchedPicture> => {
    calls.push(c.url);
    if (c.url.endsWith("p1.jpg")) throw new BrandWebError("no");
    return { ...c, image: "data:image/jpeg;base64,AA", width: 800, height: 800, bytes: 1000 };
  };
  const products = await bringPictures(cands, ["product"], fake);
  assert.equal(products.length, PICTURES_PER_KIND);
  assert.ok(products.every((p) => p.kind === "product"));
  assert.ok(!products.some((p) => p.url.endsWith("p1.jpg")));
  calls.length = 0;
  const both = await bringPictures(cands, ["product", "screen"], fake);
  assert.equal(calls.filter((u) => u.endsWith("p0.jpg")).length, 1);
  assert.deepEqual(both.filter((p) => p.kind === "screen").map((p) => p.name), ["Hero", "P0"]);
  assert.deepEqual(await bringPictures(cands, [], fake), []);
});

test("a picked picture becomes a cast member labelled as from the website; a screen needs the person's ok", () => {
  const cast = [{ id: "producto-1", ref: "TazaNube" }];
  const product = webCastMember({ kind: "product", name: "Taza Nube", url: "https://tienda.example.com/a.jpg" }, cast, { confirmed: false, date: "10/10/2026" });
  assert.equal(product.id, "producto-2");
  assert.equal(product.ref, "TazaNube2");
  assert.equal(product.kind, "product");
  assert.match(product.note, /web de la marca \(tienda\.example\.com\)/);
  CastMemberSchema.parse(product);

  assert.throws(() => webCastMember({ kind: "screen", name: "Turnos", url: "https://planilla.example.com/s.png" }, [], { confirmed: false, date: "10/10/2026" }), /confirmás/);
  const screen = webCastMember({ kind: "screen", name: "Turnos", url: "https://planilla.example.com/s.png" }, [], { confirmed: true, date: "10/10/2026" });
  assert.equal(screen.kind, "screen");
  assert.match(screen.identity, /captura de la web/);
  assert.match(screen.note, /Captura de la web.*Confirmaste el 10\/10\/2026/);
  CastMemberSchema.parse(screen);

  const unnamed = webCastMember({ kind: "product", name: "  ", url: "nota" }, [], { confirmed: false, date: "" });
  assert.equal(unnamed.name, "Producto 1");
  const full = Array.from({ length: 60 }, (_, i) => ({ id: `x-${i}`, ref: `X${i}` }));
  assert.throws(() => webCastMember({ kind: "product", name: "Otro", url: "https://a.example/" }, full, { confirmed: false, date: "" }), /60/);
});

test("addWebCast: a failed upload adds nothing to the form and a retry reuses the same member", async () => {
  const pending = new Map<string, import("../shared/series.ts").CastMember>();
  const pick = { kind: "product" as const, name: "Taza Nube", url: "https://tienda.example.com/a.jpg", source: "og" as const, image: "", width: 1, height: 1 };
  const make = (taken: import("../shared/series.ts").CastMember[]) => webCastMember(pick, taken, { confirmed: false, date: "10/10/2026" });
  const saved: string[] = [];
  let fail = true;
  const store = async (m: import("../shared/series.ts").CastMember) => {
    saved.push(m.id);
    if (fail) throw new Error("red caída");
    return `${m.id}.jpg`;
  };
  await assert.rejects(addWebCast(pending, pick.url, [], make, store), /red caída/);
  fail = false;
  const m = await addWebCast(pending, pick.url, [], make, store);
  assert.equal(m.id, "producto-1");
  assert.equal(m.image, "producto-1.jpg");
  assert.equal(m.ref, "TazaNube");
  assert.deepEqual(saved, ["producto-1", "producto-1"]);
  assert.equal(pending.size, 0);
});

test("addWebCast: a pending member's id is taken for other picks", async () => {
  const pending = new Map<string, import("../shared/series.ts").CastMember>();
  const pick = { kind: "product" as const, name: "Taza", url: "a", source: "og" as const, image: "", width: 1, height: 1 };
  const make = (p: typeof pick) => (t: import("../shared/series.ts").CastMember[]) => webCastMember(p, t, { confirmed: false, date: "x" });
  await assert.rejects(addWebCast(pending, "a", [], make(pick), async () => Promise.reject(new Error("no"))));
  const b = await addWebCast(pending, "b", [], make({ ...pick, name: "Mate", url: "b" }), async (m) => `${m.id}.jpg`);
  assert.equal(b.id, "producto-2");
  const a = await addWebCast(pending, "a", [b], make(pick), async (m) => `${m.id}.jpg`);
  assert.equal(a.id, "producto-1");
  assert.equal(pending.size, 0);
});
