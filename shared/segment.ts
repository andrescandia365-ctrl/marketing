// How a story is staged (the brief's "Formato del segmento"): at the desk (the story in its own scenes, as before),
// with the series' correspondent reporting "on location" (PLAYBOOK §2.5 Remote Stand-up) or as a field visit that goes
// where the people are and lets them talk (§2.5 Field Visit). The writer gets the rule from segmentRules; the story's
// moves must show the format's move (storyProblems); a correspondent the writer had to invent is offered to the cast.
import type { Brief, Character, Story } from "./schema.ts";
import { castRef, type CastMember } from "./series.ts";
import type { Move } from "./moves.ts";

export const SEGMENTS = ["desk", "correspondent", "field"] as const;
export type Segment = (typeof SEGMENTS)[number];

export const SEGMENT_LABEL: Record<Segment, string> = {
  desk: "Escritorio",
  correspondent: "Con corresponsal",
  field: "Visita de campo",
};

export const SEGMENT_HINT: Record<Segment, string> = {
  desk: "La historia en sus propias escenas, como siempre.",
  correspondent:
    "Se corta al corresponsal de la serie «en el lugar»: escala lo absurdo y vuelve al problema real. Lo que todavía no existe (el gerente robot, el local en 3D) aparece solo como chiste, marcado Concepto.",
  field:
    "La historia va adonde está la gente (el local a las 2 de la mañana, el living en un mal día) y la deja hablar. Si filmás un lugar real con gente real, hace falta su permiso; las escenas hechas con IA son inventadas.",
};

// The move each format puts on screen. A tagged story of that format that never uses it is blocked.
export const SEGMENT_MOVE: Partial<Record<Segment, Move>> = {
  correspondent: "remoteStandup",
  field: "fieldVisit",
};

// The id the writer gives a correspondent it had to invent, so the app can find it and offer it to the cast.
export const INVENTED_CORRESPONDENT = "corresponsal";

export const segmentOf = (brief: Partial<Pick<Brief, "segment" | "piece">> | undefined): Segment =>
  brief?.piece === "explainer" ? "desk" : (brief?.segment ?? "desk");

type CastLine = Pick<CastMember, "id" | "name" | "identity" | "note">;

function correspondentLine(c: CastLine | null): string {
  if (c)
    return `The series' correspondent is ${c.name} (cast id ${c.id}; use "${c.id}" as the character id, role human, and the cast identity line word for word: "${c.identity}"${c.note.trim() ? `; notes: ${c.note.trim()}` : ""}).`;
  return `The series has no correspondent yet: invent one, an adult, invented, non-famous person (never a real person, a host, a journalist people know or a known character), with the id "${INVENTED_CORRESPONDENT}", role human, a short voice line and a full visual identity line, so the person can add them to the series' cast.`;
}

// The brief's lines for the writer (menu, story, revisions, hooks, board). Empty at the desk and for explainers, so
// those prompts stay exactly as they were.
export function segmentRules(brief: Partial<Pick<Brief, "segment" | "piece">>, correspondent: CastLine | null): string {
  const segment = segmentOf(brief);
  if (segment === "correspondent")
    return [
      "Segment: WITH A CORRESPONDENT (the playbook's Remote Stand-up). In the Negative, cut to the correspondent reporting live \"on location\" (the place where the pain happens), with a concrete bridge into the cut (a time, a number, \"we go live to…\").",
      "The story's own scenes carry the argument; the correspondent carries the escalation: each beat of the report is a bigger, more specific version of the same pain. Then the report snaps back to the real problem before the Turn, so the gag proves the point instead of replacing it.",
      `Anything the brand does not do today (a robot manager, a 3D or simulated store, an agent that runs the place) may appear only as the correspondent's escalating gag, clearly labelled as a concept: list it in claims with concept true, and the board marks its shots disclosure "concept". The piece then returns to what is in "Lo que existe hoy". Lead with what the product fixes today; tease the future second.`,
      "Tag the topic with the cut as remoteStandup.",
      correspondentLine(correspondent),
    ].join("\n  ");
  if (segment === "field")
    return [
      "Segment: FIELD VISIT (the playbook's Field Visit). Go where the people are, at the hour the pain happens (the store at 2 a.m., the living room on a bad day), and let them talk: the people of the place carry the lines in their own words, about how they really work (only the series' \"Cómo se trabaja hoy\" list and the brief's notes). The laugh comes from what they say and do, never at their expense; the brand listens before it shows anything.",
      correspondent
        ? `The series' correspondent may be the one who visits and asks short questions: ${correspondent.name} (cast id ${correspondent.id}; use "${correspondent.id}" as the character id, role human, identity line word for word: "${correspondent.identity}").`
        : "Nobody hosts the visit: the people talk to the camera, or one asks the other.",
      "Every person is an invented adult character with no real person's likeness. The AI scenes are invented: never present them as a real recording, a documentary or a real customer. Add to verify: \"[VERIFY] Visita de campo: si se filma un lugar real con gente real, hace falta el permiso firmado de cada persona y del lugar.\"",
      "Tag the topic that visits as fieldVisit.",
    ].join("\n  ");
  return "";
}

const looksLikeCorrespondent = (c: Pick<Character, "id" | "name">) =>
  c.id === INVENTED_CORRESPONDENT || /corresponsal|correspondent/i.test(`${c.id} ${c.name}`);

// The correspondent the writer invented, to offer it to the cast: only for a story with a correspondent, when the
// series has none set and the character is not in the cast yet.
export function inventedCorrespondent(
  story: Pick<Story, "characters">,
  brief: Partial<Pick<Brief, "segment" | "piece">> | undefined,
  series: { cast: CastMember[]; correspondent?: string } | undefined,
): Character | null {
  if (segmentOf(brief) !== "correspondent" || !series) return null;
  const set = series.correspondent?.trim();
  if (set && series.cast.some((m) => m.id === set && m.kind === "character")) return null;
  const inCast = new Set(series.cast.map((m) => m.id));
  return story.characters.find((c) => c.role !== "good" && c.role !== "bad" && looksLikeCorrespondent(c) && !inCast.has(c.id)) ?? null;
}

// A story character as a cast member (no image yet): its id kept when it is free and valid, else one made from its
// name that does not clash with the cast.
export function correspondentMember(c: Pick<Character, "id" | "name" | "voice" | "identity">, cast: Pick<CastMember, "id">[]): CastMember {
  const taken = new Set(cast.map((m) => m.id));
  const slug = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 36);
  const base = /^[a-z0-9-]{1,40}$/.test(c.id) ? c.id : slug(c.name) || INVENTED_CORRESPONDENT;
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base.slice(0, 36)}-${n}`;
  const name = c.name.trim().slice(0, 60) || "Corresponsal";
  return {
    id,
    name,
    ref: castRef(name),
    kind: "character",
    identity: c.identity.trim().slice(0, 600),
    note: `Corresponsal de la serie: sale «en el lugar», escala lo absurdo y vuelve al problema real.${c.voice.trim() ? ` Cómo habla: ${c.voice.trim()}` : ""}`.slice(0, 600),
    image: "",
    sheet: "",
    puppet: { layers: [] },
    rig: { file: "", clips: { idle: "", walk: "", turnL: "", turnR: "", point: "" } },
    refs: [],
    views: [],
  };
}
