// Image and video tool profiles: one Markdown file per tool in server/tools/. Tools change often, so their
// features live in these files rather than in code. Claude reads the chosen file before writing prompts.
import { readFileSync, readdirSync } from "node:fs";
import type { ToolInfo } from "../shared/schema.ts";
import { referenceCap, toolsRefCap } from "../shared/castRefs.ts";

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
        maxRefs: referenceCap(text),
        text,
      };
    });
}

// Read once at startup; edit a file and restart the app to pick up changes.
const TOOLS = load();

export function listTools(): ToolInfo[] {
  return TOOLS.map(({ id, name, checked, maxRefs }) => ({ id, name, checked, maxRefs }));
}

// The strictest cap on reference images among the tools whose profile names one (Grok: 14), or null. A cast member
// never carries more images than that, so all of them fit in one prompt of any tool.
export function referenceLimit(): number | null {
  return toolsRefCap(TOOLS);
}

export function getTool(id: string): Tool {
  return TOOLS.find((t) => t.id === id) ?? TOOLS.find((t) => t.id === "general") ?? TOOLS[0];
}
