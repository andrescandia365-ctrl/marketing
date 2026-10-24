// "Que lo diga un personaje": a hook, meat or CTA of Publicidad said on camera by an invented adult of the series cast
// (a character with an approved image, called in Grok as its @ref). The app writes the Grok video prompt from the
// piece's line (in quotes, with its emotion, one action, the 6/10/15 s clip that fits the words, no music); the person
// pastes it into Grok with the character's reference image and uploads the clip to the piece as with any clip. No AI
// key involved: the prompt is pure code. Grok's lip sync is [NOT SURE] in its profile (server/tools/grok-imagine.md),
// so the piece can keep the clip's own voice or mute it and play the generated or uploaded voice instead.
import { ANGLE_LABEL, WORDS_PER_SECOND, clipSecondsFor, countWords, wordsFor, type Piece, type PieceSpeaker, type SpeakerSound } from "./ads.ts";
import { promptsWithSlots } from "./adsBulk.ts";
import { clipContinuity, grokSequence, sequencePromptText, stretchText } from "./adsSequence.ts";
import { audioLine, speakingPrompt } from "./audio.ts";
import { lookPhrase, PLAIN_VIDEO } from "./prompt.ts";
export { PLAIN_VIDEO };
import type { CastMember, SeriesLook, SeriesType } from "./series.ts";

export { PieceSpeakerSchema, SPEAKER_SOUNDS, SPEAKER_SOUND_LABEL, type PieceSpeaker, type SpeakerSound } from "./ads.ts";

export type SpeakerMember = Pick<CastMember, "id" | "name" | "ref" | "kind" | "identity" | "image">;

// Who can say a piece: the series' characters with an approved image (the reference the clip is made from). The
// cast's characters are invented adults by the series' own rule (sheets are always invented adults).
export const speakerCandidates = <T extends SpeakerMember>(cast: T[]): T[] => cast.filter((m) => m.kind === "character" && Boolean(m.image));

// ── Length ───────────────────────────────────────────────────────────────────────────
// The character takes a breath before the first word and holds a beat after the last one.
export const SPEECH_LEAD = 0.4;
export const SPEECH_TAIL = 0.6;
const tenth = (n: number) => Math.round(n * 10) / 10;

export type SpeakerFit = {
  words: number;
  // Seconds the line takes said at the ads' pace (WORDS_PER_SECOND), with the breath before it.
  speech: number;
  // The Grok clip to ask for: 6, 10 or 15 s, never shorter than the piece nor than the line with its tail.
  clip: 6 | 10 | 15;
  // The line fits the piece's own seconds (the same word budget as the rest of Publicidad).
  fits: boolean;
  // The line does not fit even in Grok's longest clip.
  tooLong: boolean;
};

export function speakerFit(text: string, pieceSeconds: number): SpeakerFit {
  const words = countWords(text);
  const speech = tenth(words / WORDS_PER_SECOND + SPEECH_LEAD);
  const need = speech + SPEECH_TAIL;
  const slots = grokSequence(pieceSeconds);
  // A long meat is several clips: it is too long only when the words do not fit the meat, not one 15 s file.
  const sequence = slots.length > 1;
  return {
    words,
    speech,
    clip: sequence ? slots[0].length : clipSecondsFor(Math.max(pieceSeconds, need)),
    fits: words <= wordsFor(pieceSeconds),
    tooLong: sequence ? words > wordsFor(pieceSeconds) : need > 15,
  };
}

// ── The line ─────────────────────────────────────────────────────────────────────────
// The words as they go between the prompt's quotes: one line, no double quotes inside (they would close the quote
// early), no stage notes in brackets other than [VERIFY…], which stays so the person sees it.
export function spokenLine(text: string): string {
  return text.replace(/\s+/g, " ").replace(/["“”]/g, "'").trim();
}

export const unverified = (text: string) => /\[VERIFY/i.test(text);

// ── Defaults ─────────────────────────────────────────────────────────────────────────
// How it is said, by the piece's job: a hook by its angle, the body plain, the call warm.
export function defaultEmotion(piece: Pick<Piece, "kind"> & { angle?: keyof typeof ANGLE_LABEL }): string {
  if (piece.kind === "hook") {
    switch (piece.angle) {
      case "pain":
        return "al límite, medio riéndose del lío";
      case "desire":
        return "con ganas e ilusión";
      case "objection":
        return "con dudas, después con seguridad";
      case "myth":
        return "sin poder creerlo, con humor";
      case "curiosity":
        return "con intriga, en confianza";
      case "proof":
        return "con calma, en concreto";
      default:
        return "directa, con humor";
    }
  }
  return piece.kind === "meat" ? "con calidez y simple, como contándoselo a alguien de confianza" : "con calidez, invitando, sin apuro";
}

export function defaultAction(kind: Piece["kind"]): string {
  if (kind === "hook") return "looks up from what they are doing straight into the lens and leans in slightly";
  if (kind === "meat") return "talks to the lens with one small, natural hand gesture";
  return "smiles and gives one small nod toward the lens";
}

export function defaultPlace(type: SeriesType | undefined): string {
  if (type === "software") return "behind the counter of a small ordinary corner store, shelves soft and out of focus behind";
  if (type === "ecommerce") return "in an ordinary lived-in living room at home, soft daylight from a window";
  return "in an ordinary room, soft daylight";
}

// The panel's starting values for a character: the piece's saved choice when it is the same character, else the
// defaults by the piece's job, keeping what the person already wrote for the place, the voice, the sound and the in point.
export function speakerDraft(
  piece: Pick<Piece, "kind"> & {
    angle?: keyof typeof ANGLE_LABEL;
    speaker?: PieceSpeaker;
  },
  castId: string,
): PieceSpeaker {
  const had = piece.speaker;
  if (had && had.castId === castId) return had;
  return {
    castId,
    emotion: had?.emotion || defaultEmotion(piece),
    action: had?.action || defaultAction(piece.kind),
    place: had?.place ?? "",
    voice: had?.voice ?? "",
    sound: had?.sound ?? "clip",
    from: had?.from ?? 0,
  };
}

// ── The prompt ───────────────────────────────────────────────────────────────────────
export type SpeakerPromptInput = {
  text: string;
  pieceSeconds: number;
  member: SpeakerMember;
  speaker: Pick<PieceSpeaker, "emotion" | "action" | "place" | "voice">;
  format: "vertical" | "horizontal";
  look?: SeriesLook;
  type?: SeriesType;
};

const clean = (s: string) => s.trim().replace(/[.;,]+$/, "");

// The Grok video prompt: the @ref and its identity line, the place, the framing, one action and a locked-off camera,
// the line in quotes with its emotion (speakingPrompt, the story's own convention), the audio line with no music
// (audioLine) and the clip's length as a reminder (it is set in Grok's controls).
export function speakerPrompt(input: SpeakerPromptInput): string {
  const { member, speaker } = input;
  const ref = `@${member.ref}`;
  const identity = clean(member.identity);
  const place = clean(speaker.place) || defaultPlace(input.type);
  const action = clean(speaker.action) || "talks straight to the lens";
  const shape = input.format === "vertical" ? "Vertical 9:16" : "Horizontal 16:9";
  const look = lookPhrase(input.look) || PLAIN_VIDEO;
  const base = [
    `${ref}, the invented adult in the reference image${identity ? ` (${identity})` : ""}, ${place}.`,
    `${shape} medium close-up at eye level, face clear and in focus; ${ref} ${action}.`,
    `Locked-off camera, no other camera move; face, hair and clothes stay exactly as in the reference.`,
    `${look}. Bare walls and blank labels, nothing written anywhere in frame.`,
  ].join(" ");
  const fit = speakerFit(input.text, input.pieceSeconds);
  const said = speakingPrompt(base, ref, spokenLine(input.text), clean(speaker.voice), "es", speaker.emotion);
  return `${said}. ${ref} starts speaking right away and says the line once, as written. ${audioLine({ hear: ["dialogue", "ambient"], detail: "" })} Length: ${fit.clip} s.`;
}

// One prompt per Grok clip of a meat longer than 15 s. Same character, place and look; each clip continues the last
// and says only its stretch. A piece of 15 s or less is the single speakerPrompt.
export function sequenceSpeakerPrompts(input: SpeakerPromptInput): string[] {
  const slots = grokSequence(input.pieceSeconds);
  if (slots.length <= 1) return [speakerPrompt(input)];
  const { member, speaker } = input;
  const ref = `@${member.ref}`;
  const identity = clean(member.identity);
  const place = clean(speaker.place) || defaultPlace(input.type);
  const action = clean(speaker.action) || "talks straight to the lens";
  const shape = input.format === "vertical" ? "Vertical 9:16" : "Horizontal 16:9";
  const look = lookPhrase(input.look) || PLAIN_VIDEO;
  const lines = stretchText(input.text, slots);
  return slots.map((slot, i) => {
    const doing = i === 0 ? `${ref} ${action}` : `${ref} continues the same action and does not start it over`;
    const base = [
      clipContinuity(i, slots.length),
      `${ref}, the invented adult in the reference image${identity ? ` (${identity})` : ""}, ${place}.`,
      `${shape} medium close-up at eye level, face clear and in focus; ${doing}.`,
      `Locked-off camera, no other camera move; face, hair and clothes stay exactly as in the reference.`,
      `${look}. Bare walls and blank labels, nothing written anywhere in frame.`,
    ].join(" ");
    const line = (lines[i] ?? "").trim();
    const cut = slot.play < slot.length ? ` The finished piece plays the first ${slot.play} s of this clip.` : "";
    if (!line) return `${base} ${audioLine({ hear: ["ambient"], detail: "" })} Length: ${slot.length} s.${cut}`;
    const said = speakingPrompt(base, ref, spokenLine(line), clean(speaker.voice), "es", speaker.emotion);
    const goes =
      i === 0
        ? `${ref} starts speaking right away and says this clip's line once, as written.`
        : `${ref} keeps speaking from the previous clip, says this clip's line once, and does not start the action over.`;
    return `${said}. ${goes} ${audioLine({ hear: ["dialogue", "ambient"], detail: "" })} Length: ${slot.length} s.${cut}`;
  });
}

export { sequencePromptText };

// ── Problems that stop the copy ───────────────────────────────────────────────────────
export function speakerIssues(text: string, pieceSeconds: number): string[] {
  const out: string[] = [];
  const fit = speakerFit(text, pieceSeconds);
  if (!text.trim()) out.push("La pieza no tiene texto para decir.");
  if (unverified(text)) out.push("La línea tiene un [VERIFY]: confirmalo o cambialo antes de que alguien lo diga en cámara.");
  if (fit.tooLong) {
    const slots = grokSequence(pieceSeconds);
    out.push(
      slots.length > 1
        ? `La línea no entra en ${pieceSeconds} s (unas ${wordsFor(pieceSeconds)} palabras). Acortala.`
        : `La línea dura unos ${fit.speech.toString().replace(".", ",")} s: no entra ni en un clip de 15 s. Acortala.`,
    );
  }
  // Each clip of a sequence has to carry some of the line, and that stretch has to fit what the clip plays
  // (its seconds, minus the breath before the first word).
  const slots = grokSequence(pieceSeconds);
  if (text.trim() && slots.length > 1) {
    const lines = stretchText(text, slots);
    lines.forEach((line, i) => {
      const words = countWords(line);
      const room = Math.max(0, slots[i].play - SPEECH_LEAD);
      const limit = room * WORDS_PER_SECOND;
      if (words === 0) out.push(`El clip ${i + 1} no tiene palabras y en cámara tiene que decir algo.`);
      else if (words > limit + 1e-6) {
        const max = Math.max(0, Math.floor(limit));
        out.push(`El clip ${i + 1} tiene ${words} palabras y en sus ${slots[i].play} s entran unas ${max} (con la pausa del arranque). Acortá ese tramo.`);
      }
    });
  }
  return out;
}

// What the piece's render says in the corner: the character (and, when the clip speaks, its voice) is AI-made.
export const speakerDisclosure = (sound: SpeakerSound) => (sound === "clip" ? "Personaje y voz hechos con IA" : "Personaje hecho con IA");

// ── The batch ────────────────────────────────────────────────────────────────────────
export type SpeakerBatchEntry = {
  id: string;
  ref: string;
  pieceSeconds: number;
  clip: number;
  // More than one: the prompt is the whole sequence, and `clip` is how many Grok files it asks for.
  clips?: number;
  prompt: string;
};
export type SpeakerBatchInput = {
  pieces: (Pick<Piece, "id" | "text" | "seconds" | "kind" | "status"> & {
    speaker?: PieceSpeaker;
    angle?: keyof typeof ANGLE_LABEL;
  })[];
  cast: SpeakerMember[];
  // The character for pieces with none chosen yet ("" : those are skipped).
  fallback: string;
  count: number;
  format: "vertical" | "horizontal";
  look?: SeriesLook;
  type?: SeriesType;
};

// The approved pieces' prompts in order, up to `count`, each with its own character or the batch's; a piece with a
// problem (no text, [VERIFY], too long) or with no character is skipped and named.
export function speakerBatch(input: SpeakerBatchInput): {
  entries: SpeakerBatchEntry[];
  skipped: { id: string; why: string }[];
} {
  const candidates = speakerCandidates(input.cast);
  const entries: SpeakerBatchEntry[] = [];
  const skipped: { id: string; why: string }[] = [];
  for (const piece of input.pieces.filter((p) => p.status === "approved")) {
    if (entries.length >= Math.max(0, input.count)) break;
    const member = candidates.find((m) => m.id === (piece.speaker?.castId || input.fallback));
    if (!member) {
      skipped.push({ id: piece.id, why: "sin personaje" });
      continue;
    }
    const issues = speakerIssues(piece.text, piece.seconds);
    if (issues.length) {
      skipped.push({ id: piece.id, why: issues[0] });
      continue;
    }
    const speaker = speakerDraft(piece, member.id);
    const promptInput = {
      text: piece.text,
      pieceSeconds: piece.seconds,
      member,
      speaker,
      format: input.format,
      look: input.look,
      type: input.type,
    };
    const slots = grokSequence(piece.seconds);
    const prompts = promptsWithSlots(piece.id, sequenceSpeakerPrompts(promptInput));
    entries.push({
      id: piece.id,
      ref: member.ref,
      pieceSeconds: piece.seconds,
      clip: slots.length > 1 ? slots.length : speakerFit(piece.text, piece.seconds).clip,
      ...(slots.length > 1 && { clips: slots.length }),
      prompt: slots.length > 1 ? sequencePromptText(prompts) : prompts[0],
    });
  }
  return { entries, skipped };
}

// One text to paste prompt by prompt: a header per piece (its id, the @ref to attach, the clip length) and the prompt.
export function speakerBatchText(entries: SpeakerBatchEntry[]): string {
  return entries
    .map((e) => {
      const length = e.clips && e.clips > 1 ? `${e.clips} clips` : `clip de ${e.clip} s`;
      return `${e.id} · adjuntá @${e.ref} · ${length} (la pieza usa ${e.pieceSeconds} s)\n${e.prompt}`;
    })
    .join("\n\n———\n\n");
}

// ── What the tool's profile says about lip sync ─────────────────────────────────────────────
// The line "- [TAG] Lip sync: …" of the tool's profile in server/tools/ (read at startup), so the studio says how sure
// it is without hard-coding it. null: the profile does not say.
export type LipSyncNote = { tag: "DOCS" | "NOT SURE" | "TESTED"; text: string };
export function lipSyncNote(profile: string): LipSyncNote | null {
  const m = profile.match(/^-\s*\[(DOCS|NOT SURE|TESTED)\]\s*Lip sync:\s*(.+)$/im);
  return m ? { tag: m[1].toUpperCase() as LipSyncNote["tag"], text: m[2].trim() } : null;
}
