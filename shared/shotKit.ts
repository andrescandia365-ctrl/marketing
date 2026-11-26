// "Kit de la toma": everything a person needs to make one shot's clip by hand in a web form (Replicate or APIMart's
// Seedance, or any tool that takes numbered references): the video prompt with the cast's @names turned into
// [Image1], [Image2]… in the order of the kit's numbered files, the first frame, the reference pictures and, for lip
// sync, the shot's own voice laid out exactly as the render plays it. Pure: the browser fetches the files and zips
// them (src/lib/shotKit.ts).

// The render starts a shot's voice this far into the shot (src/lib/render.ts), so the kit's voice starts there too and
// the mouth in the clip lands on the voice the app plays.
export const VOICE_LEAD = 0.15;
// Seedance's reference audio: 2 to 30 s (APIMart's limits).
export const REF_AUDIO_MIN = 2;
export const REF_AUDIO_MAX = 30;

export type KitPicture = { ref: string; name: string; label: string; url: string };

type Member = { ref: string; name: string; image: string; url?: string; refs?: { ref: string; label: string; image: string }[] };

// The reference pictures for the members in frame, main first: each member's approved image, then its extra
// references (the face crop, a loose view), without repeats. urlOf turns a library file into its URL.
export function kitPictures(members: Member[], urlOf: (file: string) => string): KitPicture[] {
  const out: KitPicture[] = [];
  const seen = new Set<string>();
  for (const m of members) {
    if (m.image && !seen.has(m.ref)) {
      seen.add(m.ref);
      out.push({ ref: m.ref, name: m.name, label: "imagen aprobada", url: m.url ?? urlOf(m.image) });
    }
    for (const r of m.refs ?? []) {
      if (!r.image || seen.has(r.ref)) continue;
      seen.add(r.ref);
      out.push({ ref: r.ref, name: m.name, label: r.label || "otra referencia", url: urlOf(r.image) });
    }
  }
  return out;
}

const pad = (n: number) => String(n).padStart(2, "0");

// "01-Marta.png": the number is the one the prompt calls ([Image1]).
export function kitPictureFile(n: number, ref: string, ext: string): string {
  return `${pad(n)}-${ref}.${ext}`;
}
export const shotKitFolder = (shotIndex: number) => `toma-${pad(shotIndex + 1)}-kit`;
export const shotClipName = (shotIndex: number) => `toma-${pad(shotIndex + 1)}-clip.mp4`;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// The prompt with each @ref of the kit turned into [ImageN] (longest names first, so @MartaCara is not read as
// @Marta + "Cara"). @refs that are not in the kit stay as they are.
export function numberRefs(prompt: string, refs: string[]): string {
  const order = refs.map((ref, i) => ({ ref, n: i + 1 })).sort((a, b) => b.ref.length - a.ref.length);
  let out = prompt;
  for (const { ref, n } of order) out = out.replace(new RegExp(`@${escape(ref)}(?![A-Za-z0-9_])`, "g"), `[Image${n}]`);
  return out;
}

// The prompt without the app's "no speech" words, for a clip whose character speaks (the same cleanup as Grok's
// speaking prompt in shared/audio.ts).
function withoutSilence(prompt: string): string {
  return prompt
    .replace(/,?\s*no (?:speech|dialogue|talking|voices?)\b/gi, "")
    .replace(/,?\s*nobody speaks\b/gi, "")
    .replace(/\s+\./g, ".")
    .trim();
}

export type KitVoice = { name: string; line: string; emotion: string; language: "es" | "en"; timed: boolean };

// The paste-ready video prompt: a reference map first (what each numbered file is), then the shot's prompt with the
// numbers, then, when the kit carries the voice, the lip-sync sentence on [Audio1].
export function kitPrompt(input: { prompt: string; pictures: KitPicture[]; firstFrame: boolean; lastFrame?: string; voice?: KitVoice | null }): string {
  const { pictures, firstFrame, voice } = input;
  const map: string[] = [];
  if (firstFrame) map.push("The first frame is the uploaded start image: keep its people, place and light.");
  if (input.lastFrame) map.push(`The last frame is the uploaded end image (${input.lastFrame}): the clip ends exactly on it.`);
  pictures.forEach((p, i) =>
    map.push(`[Image${i + 1}] is ${p.name} (${p.label === "imagen aprobada" ? "approved reference" : p.label}): keep this face, hair, build and clothes exactly; use it only as a reference, never as a shot.`),
  );
  if (voice) map.push(`[Audio1] is ${voice.name}'s voice for this shot: use it only as the voice, never as music.`);
  let body = numberRefs(input.prompt.trim(), pictures.map((p) => p.ref));
  if (voice) {
    body = withoutSilence(body);
    const tongue = voice.language === "es" ? "Rioplatense Spanish (Buenos Aires accent)" : "English";
    const tone = voice.emotion.trim().replace(/[.:;,]+$/, "").replace(/"/g, "'");
    body += voice.timed
      ? ` The spoken lines are [Audio1]: every mouth moves in sync with it, each line once, exactly as written.`
      : ` ${voice.name} says, in ${tongue}${tone ? `, tone: ${tone}` : ""}, once and exactly as written, with the lips in sync with [Audio1]: "${voice.line.trim()}"\nNo smile while speaking. No music.`;
  }
  return map.length ? `References:\n${map.map((l) => `- ${l}`).join("\n")}\n\n${body}` : body;
}

// How the kit lays the voice out: silence for VOICE_LEAD, then the voice, cut at the shot's end; at least
// REF_AUDIO_MIN long (silence after a short line) and at most REF_AUDIO_MAX.
export function voiceLayout(voiceSeconds: number, shotSeconds: number): { lead: number; voice: number; total: number; cut: boolean } {
  const total = Math.min(REF_AUDIO_MAX, Math.max(REF_AUDIO_MIN, shotSeconds));
  const room = Math.max(0, Math.min(total, shotSeconds) - VOICE_LEAD);
  const voice = Math.min(Math.max(0, voiceSeconds), room);
  return { lead: VOICE_LEAD, voice, total, cut: voiceSeconds > room + 0.01 };
}

// What the person keeps the same in every clip so the character does not change (Spanish, for the kit and the app).
export const CONSISTENCY_STEPS = [
  "Creá el personaje una sola vez, en Editar serie → Elenco: un adulto inventado (nunca una persona real ni un personaje conocido), con una imagen aprobada de frente, con luz pareja y fondo liso.",
  "Hacé su hoja de personaje (frente, tres cuartos, perfil, espalda y caras) con «Hoja de personaje» y, de esa hoja, recortá la cara como otra referencia (@NombreCara). Todo queda guardado en la biblioteca de la serie.",
  "Escribí una sola línea de identidad (edad, cara, pelo, cuerpo, ropa y un detalle) y no la cambies: la app la repite palabra por palabra en cada prompt.",
  "En cada clip subí las mismas referencias en el mismo orden: el kit ya las numera (01, 02…) y el prompt las llama [Image1], [Image2]… en ese orden.",
  "Arrancá cada clip desde una imagen de inicio que aprobaste (la imagen de la toma), nunca solo desde texto.",
  "Para primeros planos, usá también la referencia de la cara y 1080p: las caras cambian más de cerca.",
  "La ropa queda igual en toda la pieza. Si cambia, es una referencia nueva, aprobada antes de las tomas que la usan.",
  "Las seeds no mantienen al personaje: solo repiten la misma toma. Lo que lo mantiene son las imágenes y la línea de identidad.",
  "Si la cara se va en una toma, no lo arregles con más palabras: generala de nuevo, o arrancala desde el último cuadro bueno de la toma anterior.",
  "No le pongas reglas de postura («quieta», «la cabeza derecha»): la congelan y queda fría. Describí lo que hace.",
] as const;

export type KitReadme = {
  shotIndex: number;
  title: string;
  seconds: number;
  format: "vertical" | "horizontal";
  toolName: string;
  pictures: { file: string; name: string; label: string }[];
  firstFrame: string | null;
  lastFrame: string | null;
  voice: { file: string; cut: boolean } | null;
  // What to do about the voice when the kit has none ("" when it has one).
  voiceHint: string;
};

// LEEME.txt: the steps in the web form, in Spanish, plus how to keep the character the same.
export function kitReadme(k: KitReadme): string {
  const shape = k.format === "vertical" ? "9:16" : "16:9";
  const lines = [
    `Toma ${k.shotIndex + 1}: ${k.title}`,
    `Largo: ${k.seconds} s · Formato: ${shape} · Herramienta del guion: ${k.toolName}`,
    "",
    "Cómo hacer el clip en la web (Replicate: replicate.com/bytedance/seedance-2.5 · APIMart: Playground → Seedance 2.5)",
    k.firstFrame
      ? `1. Imagen de inicio (Replicate: «image»; APIMart: «First Frame»): ${k.firstFrame}. Con imagen de inicio, el formato va en «adaptive».`
      : `1. Todavía no hay imagen de inicio: hacela con imagen.txt en tu herramienta de imágenes, aprobala y subila a la toma en la app. Después bajá el kit de nuevo.`,
    ...(k.lastFrame ? [`   Imagen final (Replicate: «last_frame_image»; APIMart: «Last Frame»): ${k.lastFrame}.`] : []),
    k.pictures.length
      ? `2. Imágenes de referencia, en este orden (son [Image1], [Image2]…):\n${k.pictures.map((p) => `   - ${p.file}: ${p.name}, ${p.label}`).join("\n")}`
      : "2. Esta toma no tiene personajes del elenco con imagen: no hay referencias para subir.",
    k.voice
      ? `3. Audio de referencia (es [Audio1]): ${k.voice.file}. Es la voz de la toma tal como suena en el video, con ${VOICE_LEAD} s de silencio al principio.${k.voice.cut ? " La voz era más larga que la toma y quedó cortada: alargá la toma o acortá la línea." : ""}`
      : `3. Sin audio de referencia. ${k.voiceHint}`,
    `4. Pegá prompt.txt en el prompt. Largo: ${k.seconds} s. Resolución: 480p para probar, 720p para usar, 1080p para caras de cerca.`,
    k.voice ? "5. Dejá el sonido prendido (generate_audio). En la app, en «Sonido del clip», poné Mudo: así se oye siempre la misma voz, la de la app." : "5. Sonido: apagalo si la toma no necesita sonido propio.",
    `6. Generá, bajá el clip apenas esté listo (los links duran poco) y guardalo como ${shotClipName(k.shotIndex)}. Soltalo en la toma ${k.shotIndex + 1} de la app.`,
    "7. En la app, debajo del clip, anotá dónde lo generaste («Lo generé afuera»): así la app lleva el gasto.",
    "",
    "Cómo mantener al personaje igual en todos los clips",
    ...CONSISTENCY_STEPS.map((s, i) => `${i + 1}. ${s}`),
    "",
    "El aviso de IA del video queda prendido. Nunca recortes ni tapes la marca de agua de una herramienta.",
  ];
  return lines.join("\n") + "\n";
}
