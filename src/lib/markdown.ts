// The script as a Markdown file, the deliverable format the playbook asks for (§7.5).
import type { Brief, Hook, Script } from "../../shared/schema.ts";
import { buildCopyPrompt } from "../../shared/prompt.ts";
import { TEMPLATE, formatTime, timeShots } from "../../shared/template.ts";

export type LogEntry = { at: number; shot?: number; text: string; outcome?: string };

export function formatElapsed(ms: number): string {
  const m = Math.floor(ms / 60000);
  return `+${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
}

export function scriptToMarkdown(brief: Brief, hook: Hook, script: Script, toolName: string, log: LogEntry[]): string {
  const shots = timeShots(script.shots)
    .map((s) => {
      const label = TEMPLATE[s.section].label.toUpperCase();
      const disclosure = s.disclosure === "none" ? "" : ` · **${s.disclosure === "concept" ? "CONCEPTO" : "SIMULACIÓN"}**`;
      return [
        `### Toma ${s.index + 1} · ${formatTime(s.start)}–${formatTime(s.end)} · ${label} · Setup ${s.setup}${disclosure}`,
        `- **Locución:** ${s.voiceover}`,
        s.onScreenText ? `- **En pantalla:** ${s.onScreenText}` : "",
        `- **En ${toolName}:** ${s.toolSettings}`,
        `- **Prompt de imagen:** ${buildCopyPrompt(s.visualPrompt, brief.format)}`,
        `- **Prompt de video:** ${s.videoPrompt}`,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");

  const setups = script.setups.length
    ? script.setups.map((s) => `- **${s.id} · ${s.name}:** ${s.identity}`).join("\n")
    : "- Ninguno.";
  const checklist = script.checklist.map((c) => `- [${c.pass ? "x" : " "}] **${c.item}**: ${c.note}`).join("\n");
  const verify = script.verify.length ? script.verify.map((v) => `- ${v}`).join("\n") : "- Nada.";
  const direction = log.length
    ? log
        .map((e) => {
          const where = e.shot === undefined ? "" : ` · toma ${e.shot + 1}`;
          return `**${formatElapsed(e.at)}${where}**\n\n> ${e.text}${e.outcome ? `\n\n→ ${e.outcome}` : ""}`;
        })
        .join("\n\n")
    : "Sin notas todavía.";

  return `# ${script.title}

${script.logline}

- **Producto:** ${brief.productName} (Trabajo ${brief.job})
- **Comprador:** ${brief.buyer}
- **Movida del gancho:** ${hook.move}
- **Llamado a la acción:** ${script.cta}
- **Callback:** "${script.callback.planted}" → ${script.callback.payoff}
- **Estilo visual:** ${script.style}
- **Herramienta:** ${toolName}

## Setups

${setups}

## Tomas

${shots}

## Checklist

${checklist}

## Verificar antes de publicar

${verify}

## Registro de dirección

${direction}
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
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 50) || "guion"
  );
}
