// npm run playbook            → says whether PLAYBOOK.md and server/playbook.md drifted apart (exit 1 if they did).
// npm run playbook -- --write → records the current state, once both say the same.
import { readFileSync, writeFileSync } from "node:fs";
import { describeDrift, drift, snapshot } from "./playbookSync.ts";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");
const research = read("PLAYBOOK.md");
const summary = read("server/playbook.md");
const SNAPSHOT = "scripts/playbook.snapshot.md";

if (process.argv.includes("--write")) {
  writeFileSync(new URL(SNAPSHOT, root), snapshot(research, summary));
  console.log(`Listo: ${SNAPSHOT} quedó al día con PLAYBOOK.md y server/playbook.md.`);
} else {
  let recorded = "";
  try {
    recorded = read(SNAPSHOT);
  } catch {
    console.error(`Falta ${SNAPSHOT}. Corré: npm run playbook -- --write`);
    process.exit(1);
  }
  const text = describeDrift(drift(recorded, research, summary));
  if (text) {
    console.error(text);
    process.exit(1);
  }
  console.log("Los dos playbooks están al día.");
}
