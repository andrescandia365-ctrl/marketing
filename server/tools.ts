// Image and video tool profiles: one Markdown file per tool in server/tools/. Tools change often, so their
// features live in these files rather than in code. Claude reads the chosen file before writing prompts.
import { readFileSync, readdirSync } from "node:fs";
import type { ToolInfo } from "../shared/schema.ts";

const DIR = new URL("./tools/", import.meta.url);

type Tool = ToolInfo & { text: string };

function load(): Tool[] {
  return readdirSync(DIR)
    .filter((f) => f.endsWith(".md"))
    // The general fallback goes last; named tools first, alphabetically.
    .sort((a, b) => Number(a === "general.md") - Number(b === "general.md") || a.localeCompare(b))
    .map((file) => {
      const text = readFileSync(new URL(file, DIR), "utf8");
      return {
        id: file.replace(/\.md$/, ""),
        name: text.match(/^#\s+(.+)$/m)?.[1].trim() ?? file,
        checked: text.match(/^Last checked:\s*(.+)$/m)?.[1].trim() ?? "",
        text,
      };
    });
}

// Read once at startup; edit a file and restart the app to pick up changes.
const TOOLS = load();

export function listTools(): ToolInfo[] {
  return TOOLS.map(({ id, name, checked }) => ({ id, name, checked }));
}

export function getTool(id: string): Tool {
  return TOOLS.find((t) => t.id === id) ?? TOOLS.find((t) => t.id === "general") ?? TOOLS[0];
}
