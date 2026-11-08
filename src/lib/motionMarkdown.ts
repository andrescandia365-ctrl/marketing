// An explainer as Markdown (pieza.md in its project folder): the script, the music, the tone and each scene as it plays.
import { metaphorLine } from "../../shared/metaphor.ts";
import {
  DISCLOSURE_TAG,
  MOTION_MOOD_LABEL,
  MOTION_TEMPLATE_LABEL,
  MOTION_TONE_LABEL,
  beyondNow,
  labelled,
  timeScenes,
  type MotionPiece,
  type MotionScene,
} from "../../shared/motion.ts";
import { WORLD_PLACE_LABEL } from "../../shared/world.ts";
import { embudoMarkdown } from "../../shared/funnel.ts";

export function pieceMarkdown(piece: MotionPiece, scenes: MotionScene[], floor?: string): string {
  const s = piece.script;
  if (!s) return "# Explicativo sin guion todavía\n";
  return `# ${s.problem}
${embudoMarkdown(floor)}
**${s.title}** · ${scenes.reduce((n, x) => n + x.seconds, 0).toFixed(1)} s · música: ${piece.music === "synth" ? `sintetizada (${MOTION_MOOD_LABEL[s.music.mood]}, ${s.music.bpm} bpm)` : piece.music === "track" ? "tema propio" : "sin música"}

${s.caption ? `**Texto para publicar:** ${s.caption}

` : ""}**Tono:** ${MOTION_TONE_LABEL[s.tone ?? "warm"]}${s.world ? ` · **Mundo:** ${WORLD_PLACE_LABEL[s.world]}` : ""}

${timeScenes(scenes)
  .map(
    (x) =>
      `## ${x.index + 1}. ${MOTION_TEMPLATE_LABEL[x.template]} · ${x.start.toFixed(1)}–${x.end.toFixed(1)} s${labelled(x) ? ` · **${DISCLOSURE_TAG[x.disclosure as "concept" | "simulation"]}**` : ""}\n\n${beyondNow(x) ? `- **No está en «Lo que existe hoy»:** ${x.beyond!.what}\n` : ""}- **Título:** ${x.title}\n${x.text ? `- **Texto:** ${x.text}\n` : ""}${x.items.length ? `- **Elementos:** ${x.items.join(" · ")}\n` : ""}${x.asset ? `- **Imagen:** ${x.asset}${x.assetB ? ` → ${x.assetB}` : ""}\n` : ""}${x.world ? `- **Lugar:** ${x.world === "none" ? "ninguno" : WORLD_PLACE_LABEL[x.world]}\n` : ""}${x.voice ? `- **Voz** (${x.emotion}): “${x.voice}”\n` : ""}${x.template === "metaphor" ? `- **Metáfora:** ${metaphorLine(x)}\n${x.metaphor?.video.trim() ? `- **Cómo se mueve (clip):** ${x.metaphor.video.trim()}\n` : ""}` : ""}${x.template === "code" && x.code?.source.trim() ? `- **Animación (código)**${x.code.assets.length ? `, con ${x.code.assets.join(", ")}` : ""}:\n\n\`\`\`js\n${x.code.source.trim()}\n\`\`\`\n` : ""}`,
  )
  .join("\n")}
`;
}
