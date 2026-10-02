// The piece as a Markdown file: story, storyboard with every prompt, and the direction log.
import type { Board, Brief, Story } from "../../shared/schema.ts";
import { buildCopyPrompt } from "../../shared/prompt.ts";
import { BEAT_INFO, ROLE_LABEL, formatTime, timeShots, totalSeconds } from "../../shared/template.ts";

export type LogEntry = { at: number; shot?: number; text: string; outcome?: string };

export function formatElapsed(ms: number): string {
  const m = Math.floor(ms / 60000);
  return `+${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
}

export function storyToMarkdown(story: Story): string {
  const cast = Object.fromEntries(story.characters.map((c) => [c.id, c]));
  const characters = story.characters
    .map((c) => `- **${c.name}** (${ROLE_LABEL[c.role]}): ${c.voice}\n  - Imagen: ${c.identity}`)
    .join("\n");
  const topics = story.topics
    .map((t, i) => {
      const lines = t.lines
        .map(
          (l) =>
            `- *${BEAT_INFO[l.beat].label}* · **${cast[l.speaker]?.name ?? l.speaker}:** “${l.text}”\n  - _${l.direction}_`,
        )
        .join("\n");
      return `### Tema ${i + 1} · ${t.title}\n\n${i === 0 ? "Arranca con" : "Puente"}: ${t.bridge}\n\n${lines}`;
    })
    .join("\n\n");
  const callbacks = story.callbacks.map((c) => `- ${c.planted} → ${c.payoff}`).join("\n") || "- Ninguno.";
  const checklist = story.checklist.map((c) => `- [${c.pass ? "x" : " "}] **${c.item}**: ${c.note}`).join("\n");
  const verify = story.verify.length ? story.verify.map((v) => `- ${v}`).join("\n") : "- Nada.";

  return `# ${story.title}

${story.logline}

## Personajes

${characters}

## Historia

${topics}

**Cierre:** “${story.close}”

## Callbacks

${callbacks}

## Checklist

${checklist}

## Verificar antes de publicar

${verify}
`;
}

export function pieceToMarkdown(brief: Brief, story: Story, board: Board, toolName: string, log: LogEntry[]): string {
  const cast = Object.fromEntries(story.characters.map((c) => [c.id, c]));
  const shots = timeShots(board.shots)
    .map((s) => {
      const disclosure = s.disclosure === "none" ? "" : ` · **${s.disclosure === "concept" ? "CONCEPTO" : "SIMULACIÓN"}**`;
      return [
        `### Toma ${s.index + 1} · ${formatTime(s.start)}–${formatTime(s.end)} · ${BEAT_INFO[s.beat].label} · Setup ${s.setup}${disclosure}`,
        s.voiceover ? `- **${cast[s.speaker]?.name ?? s.speaker}:** “${s.voiceover}”` : "",
        s.onScreenText ? `- **En pantalla:** ${s.onScreenText}` : "",
        `- **En ${toolName}:** ${s.toolSettings}`,
        `- **Prompt de imagen:** ${buildCopyPrompt(s.visualPrompt, brief.format)}`,
        `- **Prompt de video:** ${s.videoPrompt}`,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");
  const setups = board.setups.map((s) => `- **${s.id} · ${s.name}:** ${s.identity}`).join("\n") || "- Ninguno.";
  const direction = log.length
    ? log
        .map((e) => {
          const where = e.shot === undefined ? "" : ` · toma ${e.shot + 1}`;
          return `**${formatElapsed(e.at)}${where}**\n\n> ${e.text}${e.outcome ? `\n\n→ ${e.outcome}` : ""}`;
        })
        .join("\n\n")
    : "Sin notas todavía.";

  return `${storyToMarkdown(story)}
## Storyboard

${board.shots.length} tomas · ${formatTime(totalSeconds(board.shots))} · ${toolName} · estilo: ${board.style}

### Setups

${setups}

${shots}

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
      .slice(0, 50) || "pieza"
  );
}
