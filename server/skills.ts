// The app's skills: one folder per skill in skills/ (SKILL.md with name and description, plus reference files), the
// same format claude.ai, Claude Code and the Skills API take. The chat reads them as text (server/chat.ts), and each
// can be downloaded as a .zip to upload to claude.ai. Read on every request, so an edited skill counts at once.
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { readFrontmatter, type SkillInfo, type SkillText } from "../shared/chat.ts";
import { storeZip } from "../shared/storeZip.ts";

export const SKILLS_DIR = resolve(process.env.SKILLS_DIR || fileURLToPath(new URL("../skills/", import.meta.url)));
const TEXT_FILE = /\.(md|txt)$/i;
const MAX_FILE = 200_000;

async function filesOf(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await filesOf(full)));
    else if (entry.isFile() && TEXT_FILE.test(entry.name)) out.push(full);
  }
  return out;
}

const SKILL_ID = /^[a-z0-9-]{1,64}$/;

async function readSkill(id: string): Promise<(SkillInfo & { dir: string }) | null> {
  if (!SKILL_ID.test(id)) return null;
  const dir = join(SKILLS_DIR, id);
  try {
    const md = await readFile(join(dir, "SKILL.md"), "utf8");
    const front = readFrontmatter(md);
    if (!front) return null;
    const files = (await filesOf(dir)).map((f) => relative(dir, f).split(sep).join("/"));
    // SKILL.md first, then the rest in path order.
    files.sort((a, b) => Number(b === "SKILL.md") - Number(a === "SKILL.md") || a.localeCompare(b));
    return { id, name: front.name, description: front.description, files, dir };
  } catch {
    return null;
  }
}

export async function listSkills(): Promise<SkillInfo[]> {
  let names: string[] = [];
  try {
    names = (await readdir(SKILLS_DIR, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
  const skills = await Promise.all(names.sort().map(readSkill));
  return skills.filter((s): s is SkillInfo & { dir: string } => s !== null).map(({ dir: _dir, ...s }) => s);
}

// The skills' text for the chat, in the order asked; an unknown id is skipped.
export async function loadSkills(ids: string[]): Promise<SkillText[]> {
  const out: SkillText[] = [];
  for (const id of [...new Set(ids)]) {
    const skill = await readSkill(id);
    if (!skill) continue;
    const body: SkillText["body"] = [];
    for (const path of skill.files) {
      const full = join(skill.dir, path);
      if ((await stat(full)).size > MAX_FILE) continue;
      body.push({ path, text: await readFile(full, "utf8") });
    }
    const { dir: _dir, ...info } = skill;
    out.push({ ...info, body });
  }
  return out;
}

// The skill as a .zip for claude.ai (Settings → Capabilities → Skills): one folder named like the skill, SKILL.md at
// its top. null when there is no such skill.
export async function zipSkill(id: string): Promise<Uint8Array | null> {
  const [skill] = await loadSkills([id]);
  if (!skill) return null;
  const enc = new TextEncoder();
  return storeZip(skill.body.map((f) => ({ name: `${skill.id}/${f.path}`, data: enc.encode(f.text) })));
}
