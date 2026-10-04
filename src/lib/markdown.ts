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
            `- *${BEAT_INFO[l.beat].label}* · **${cast[l.speaker]?.name ?? l.speaker}:** “${l.text}”${l.emotion ? ` _(${l.emotion})_` : ""}\n  - _${l.direction}_`,
        )
        .join("\n");
      return `### Tema ${i + 1} · ${t.title}\n\n${i === 0 ? "Arranca con" : "Puente"}: ${t.bridge}\n\n${lines}`;
    })
    .join("\n\n");
  const callbacks = story.callbacks.map((c) => `- ${c.planted} → ${c.payoff}`).join("\n") || "- Ninguno.";
  const checklist = story.checklist.map((c) => `- [${c.pass ? "x" : " "}] **${c.item}**: ${c.note}`).join("\n");
  const loops =
    story.loops.map((l) => `- [${l.closed ? "x" : " "}] **${l.question}** · se abre: ${l.opens} · se cierra: ${l.closes || "nunca"}`).join("\n") ||
    "- Ninguno.";
  const seriesLoop = story.seriesLoop
    .map((s) => `- ${s.appears ? (s.complete ? "✓" : "✗") : "·"} ${s.step}: ${s.note}`)
    .join("\n");
  const claims = story.claims
    .map((c) => `- ${c.real ? "✓" : c.concept ? "Concepto" : "✗ no existe hoy"} · ${c.claim}${c.note ? ` (${c.note})` : ""}`)
    .join("\n");
  const practices = (story.practices ?? [])
    .map((p) => `- ${p.known ? "✓" : "✗ no confirmado"} · ${p.practice}${p.note ? ` (${p.note})` : ""}`)
    .join("\n");
  const verify = story.verify.length ? story.verify.map((v) => `- ${v}`).join("\n") : "- Nada.";

  return `# ${story.problem || story.title}
${story.problem ? `\n**Gancho:** ${story.title}\n` : ""}
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

## Loops (gancho → retención → recompensa)

${loops}
${seriesLoop ? `\n## Loop de la serie\n\n${seriesLoop}\n` : ""}${claims ? `\n## Lo que hace la marca\n\n${claims}\n` : ""}${practices ? `\n## ¿Pasa así de verdad?\n\n${practices}\n` : ""}
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
        `### Toma ${s.index + 1} · ${s.title}`,
        `${formatTime(s.start)}–${formatTime(s.end)} · ${s.seconds} s · ${BEAT_INFO[s.beat].label} · ${s.kind === "transform" ? "Transformación · " : s.kind === "screen" ? "Pantalla real · " : ""}En cuadro: ${s.setups.join(" + ") || "—"}${disclosure}`,
        s.action ? `- **Qué pasa:** ${s.action}` : "",
        s.timeline?.length
          ? `- **Toma continua:**\n${s.timeline
              .map((b) => `  - ${b.from.toFixed(1)}–${b.to.toFixed(1)} s${b.line ? ` · **${cast[b.speaker]?.name ?? b.speaker}** (${b.emotion}): “${b.line}”` : ""} · ${b.action}`)
              .join("\n")}`
          : s.voiceover
            ? `- **${cast[s.speaker]?.name ?? s.speaker}:** “${s.voiceover}”`
            : "",
        s.onScreenText ? `- **Headline:** ${s.onScreenText}` : "",
        `- **En ${toolName}:** ${s.toolSettings}`,
        s.kind === "screen" ? `- **Pantalla real:** ${s.screen}` : "",
        s.kind !== "screen" ? `- **${s.kind === "transform" ? "Imagen inicial" : "Prompt de imagen"}:** ${buildCopyPrompt(s.visualPrompt, brief.format)}` : "",
        s.editFrom ? `- **Editar la imagen de la toma ${s.editFrom}:** ${s.editPrompt}` : "",
        s.kind === "transform" && s.middlePrompt ? `- **Imagen intermedia:** ${buildCopyPrompt(s.middlePrompt, brief.format)}` : "",
        s.kind === "transform" ? `- **Imagen final:** ${buildCopyPrompt(s.endPrompt, brief.format)}` : "",
        s.videoPrompt ? `- **Prompt de video:** ${s.videoPrompt}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");
  const setups =
    board.setups.map((s) => `- **${s.id} · ${s.name}${s.castId ? ` (elenco fijo: ${s.castId})` : ""}:** ${s.identity}`).join("\n") ||
    "- Ninguno.";
  const issues = board.issues.length
    ? board.issues.map((i) => `- ${i.shot ? `Toma ${i.shot}` : "General"} (${i.kind}): ${i.note}`).join("\n")
    : "- Ninguno.";
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

### Check del storyboard

${issues}

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
