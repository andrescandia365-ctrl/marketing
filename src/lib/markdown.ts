// The script as a Markdown file, the deliverable format the playbook asks for (§7.5).
import type { Brief, Hook, Script } from "../../shared/schema.ts";
import { TEMPLATE, formatTime, timeShots } from "../../shared/template.ts";

export function scriptToMarkdown(brief: Brief, hook: Hook, script: Script): string {
  const shots = timeShots(script.shots)
    .map((s) => {
      const label = TEMPLATE[s.section].label.toUpperCase();
      const disclosure = s.disclosure === "none" ? "" : ` · **${s.disclosure.toUpperCase()}**`;
      return [
        `### ${formatTime(s.start)}–${formatTime(s.end)} · ${label}${disclosure}`,
        `- **Voiceover:** ${s.voiceover}`,
        s.onScreenText ? `- **On screen:** ${s.onScreenText}` : "",
        `- **Image prompt:** ${s.visualPrompt}`,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");

  const checklist = script.checklist.map((c) => `- [${c.pass ? "x" : " "}] **${c.item}**: ${c.note}`).join("\n");
  const verify = script.verify.length ? script.verify.map((v) => `- ${v}`).join("\n") : "- None.";

  return `# ${script.title}

${script.logline}

- **Product:** ${brief.productName} (Job ${brief.job})
- **Buyer:** ${brief.buyer}
- **Hook move:** ${hook.move}
- **CTA:** ${script.cta}
- **Callback:** "${script.callback.planted}" → ${script.callback.payoff}
- **Visual style:** ${script.style}

## Shots

${shots}

## Checklist

${checklist}

## To verify before this ships

${verify}
`;
}

export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function slug(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 50) || "script"
  );
}
