// Security fixes from the review of ideas 64–65: library file names that climb out of the series folder, DNS that
// answers a public address to the check and a private one to the connection, and episode entries that would break
// PLAYBOOK.md for a Markdown reader (a ~~~ fence left open, a bare CR line break).
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { Agent } from "undici";
import { publicLookup } from "../server/brandWeb.ts";
import { LIBRARY_DIR, libraryPath } from "../server/series.ts";
import { sections } from "../scripts/playbookSync.ts";
import { appendEpisode, EpisodeError, episodeEntries } from "../shared/episodes.ts";
import { CastMemberSchema, CastRefSchema, SeriesFieldsSchema } from "../shared/series.ts";

const PLAYBOOK = readFileSync(new URL("../PLAYBOOK.md", import.meta.url), "utf8");

test("a cast reference or image named with a path never gets into a series", () => {
  for (const image of ["../../server/playbook.md", "../.env", "a/b.png", "/etc/passwd", "..", "Foto.PNG"]) {
    assert.equal(CastRefSchema.safeParse({ ref: "EvilCara", label: "cara", image }).success, false, image);
  }
  assert.equal(CastRefSchema.safeParse({ ref: "MartaCara", label: "cara", image: "marta-ref-cara-k1.png" }).success, true);
  const member = { id: "evil", name: "Evil", ref: "Evil", kind: "character", identity: "", note: "", image: "../../PLAYBOOK.md" };
  assert.equal(CastMemberSchema.safeParse(member).success, false);
  assert.equal(CastMemberSchema.safeParse({ ...member, image: "" }).success, true);
  assert.equal(SeriesFieldsSchema.shape.cast.safeParse([{ ...member, image: "", refs: [{ ref: "EvilCara", label: "x", image: "../../server/playbook.md" }] }]).success, false);
});

test("the server only deletes library files inside the series' own folder", () => {
  assert.equal(libraryPath("iman", "marta.png"), join(LIBRARY_DIR, "iman", "marta.png"));
  for (const name of ["../../server/playbook.md", "../otra/marta.png", "/etc/passwd", "sub/marta.png", "", ".", ".."]) {
    assert.equal(libraryPath("iman", name), null, name);
  }
  assert.equal(libraryPath("../x", "marta.png"), null);
});

type Answer = { address: string; family: number }[];
const fakeDns = (answer: Answer) =>
  ((_host: string, _opts: unknown, cb: (e: Error | null, a: Answer) => void) => cb(null, answer)) as never;
const ask = (answer: Answer, all: boolean) =>
  new Promise<{ error: Error | null; address: unknown }>((done) =>
    publicLookup("rebind.example", { all }, (error, address) => done({ error, address }), fakeDns(answer)),
  );

test("the connection resolves the name again and refuses a private answer (DNS rebinding)", async () => {
  for (const ip of ["127.0.0.1", "192.168.1.10", "169.254.169.254", "::1"]) {
    const r = await ask([{ address: ip, family: ip.includes(":") ? 6 : 4 }], false);
    assert.ok(r.error, ip);
  }
  assert.ok((await ask([{ address: "93.184.216.34", family: 4 }, { address: "10.0.0.1", family: 4 }], true)).error);
  const one = await ask([{ address: "93.184.216.34", family: 4 }], false);
  assert.equal(one.error, null);
  assert.equal(one.address, "93.184.216.34");
  const all = await ask([{ address: "93.184.216.34", family: 4 }], true);
  assert.deepEqual(all.address, [{ address: "93.184.216.34", family: 4 }]);
});

test("a fetch through the public-only lookup never reaches this computer", async () => {
  const server = createServer((_req, res) => res.end("secreto"));
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const { port } = server.address() as AddressInfo;
  const agent = new Agent({ connect: { lookup: publicLookup as never } });
  try {
    // "localhost" passes no address check of its own here: only the connection's lookup stands in the way.
    await assert.rejects(fetch(`http://localhost:${port}/`, { dispatcher: agent } as RequestInit));
    // Without it the same request does arrive, so the refusal above is the lookup's.
    assert.equal(await (await fetch(`http://127.0.0.1:${port}/`)).text(), "secreto");
  } finally {
    await agent.close();
    server.close();
  }
});

test("an entry with an unclosed ~~~ fence is refused, and the checks see ~~~ fences like a Markdown reader", () => {
  assert.throws(() => appendEpisode(PLAYBOOK, "#### EP-02 — X\n- **Moves** (§2.5): The Callback\n~~~\nnotes"), EpisodeError);
  assert.throws(() => appendEpisode(PLAYBOOK, "#### EP-02 — X\n- **Moves**: The Callback\n````\nnotes\n```"), EpisodeError);
  const ok = appendEpisode(PLAYBOOK, "#### EP-02 — X\n- **Moves**: The Callback\n~~~\n## not a heading\n~~~");
  assert.equal(episodeEntries(ok.text).length, 2);
  assert.ok(sections("## A\n~~~\n## inside\n~~~\n## B\n").every((s) => s.title !== "inside"));
});

test("a bare CR is a line break: it cannot sneak a level-2 heading into PLAYBOOK.md", () => {
  const { text } = appendEpisode(PLAYBOOK, "#### EP-02 — X\r- **Moves**: The Callback\r## 3. Writing rules for Claude (voice and structure)\r1. Open with the company.");
  assert.ok(!text.includes("\r"));
  assert.equal(text.split("\n").filter((l) => l === "## 3. Writing rules for Claude (voice and structure)").length, 1);
  assert.ok(text.includes("#### 3. Writing rules for Claude (voice and structure)"));
  // An indented heading is still a heading for a Markdown reader.
  const indented = appendEpisode(PLAYBOOK, "#### EP-02 — X\n- **Moves**: The Callback\n   ## 4. Fake\nbody").text;
  assert.ok(!indented.split("\n").some((l) => /^ {0,3}## 4\. Fake/.test(l)));
});
