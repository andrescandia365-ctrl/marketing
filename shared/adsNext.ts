// The next batch, from the metrics already imported. Pure code: nothing here calls a model or deletes a piece.
// A piece under MIN_IMPRESSIONS is "sin datos suficientes", never a winner or a loser. Of the ones with enough
// data, the top share stays (and is approved) and the rest are archived. Voices are read off the ad id (H12v3).
import { enoughData, hookWatch, MIN_IMPRESSIONS, pieceStats, type MetricRow, type PieceKind, type PieceStats, type PieceStatus } from "./ads.ts";
import { parseAdId } from "./voiceVariants.ts";

export const DEFAULT_KEEP_SHARE = 0.2;
// Below this many pieces with data, the panel only shows the ranking. Nothing is archived.
export const MIN_ARCHIVE = 3;

export type Verdict = "ganador" | "perdedor" | "sin datos suficientes";
export type NextAction = "keep" | "drop" | "leave";

export type NextPiece = {
  id: string;
  kind: PieceKind;
  status: PieceStatus;
  text: string;
  level?: number;
  angle?: string;
  formula?: string;
  // The line is said inside the character clip. Those pieces have no voice pick.
  clipSpeaker?: boolean;
  // A hook with more than one element set. Missing, or one set: the ad id has no "e".
  elementSets?: { id: string }[];
};

export type NextVoice = { pieceId: string; id: string; name: string };

export type NextLine = {
  id: string;
  kind: PieceKind;
  action: NextAction;
  verdict: Verdict;
  impressions: number;
  why: string;
};

export type VoiceLine = {
  pieceId: string;
  voiceId: string;
  name: string;
  verdict: Verdict;
  pick: boolean;
  why: string;
};

export type ElementLine = {
  pieceId: string;
  elementId: string;
  verdict: Verdict;
  impressions: number;
  why: string;
};

export type NextProposal = { lines: NextLine[]; voices: VoiceLine[]; elements?: ElementLine[] };

export type StatusChange = { id: string; from: PieceStatus; to: PieceStatus };

export type VoiceSelectionLike = { picked: string[]; known: string[] };

export type VoiceChange = { pieceId: string; before: VoiceSelectionLike | null; after: VoiceSelectionLike };

const esInt = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const pct = (rate: number) => `${Math.round(rate * 100)} %`;
const ratePct = (rate: number) => `${(rate * 100).toFixed(1).replace(".", ",")} %`;
const secs = (n: number) => `${(Math.round(n * 10) / 10).toString().replace(".", ",")} s`;

// H2 before H10. A text sort would put H10 first and split a tie across the cut.
export function pieceIdOrder(a: string, b: string): number {
  const pa = /^([A-Za-z]+)(\d+)$/.exec(a);
  const pb = /^([A-Za-z]+)(\d+)$/.exec(b);
  if (pa && pb) {
    const d = Number(pa[2]) - Number(pb[2]);
    if (d) return d;
    return pa[1].toUpperCase().localeCompare(pb[1].toUpperCase());
  }
  return a.localeCompare(b, "es");
}

function voiceIdOrder(a: string, b: string): number {
  const na = /(\d+)$/.exec(a);
  const nb = /(\d+)$/.exec(b);
  if (na && nb && na[1] !== nb[1]) return Number(na[1]) - Number(nb[1]);
  return a.localeCompare(b, "es");
}

// How many of the pieces that have data stay. 0 keeps none. 1 keeps all. Anything in between rounds up, and at
// least one, so three hooks do not all get archived.
export function keepCount(withData: number, share: number): number {
  if (withData <= 0) return 0;
  if (!(share > 0)) return 0;
  if (share >= 1) return withData;
  return Math.max(1, Math.ceil(withData * share - 1e-9));
}

function sumRows(id: string, rows: MetricRow[]): PieceStats {
  const s: PieceStats = { id, ads: 0, impressions: 0, views: 0, views3s: 0, views2s: 0, views6s: 0, hookRate: 0, avgWatch: 0, clicks: 0, ctr: 0, conversions: 0, convRate: 0, spend: 0 };
  let watch = 0;
  let weight = 0;
  for (const r of rows) {
    s.ads++;
    s.impressions += r.impressions;
    s.views += r.views;
    s.views3s += r.views3s;
    s.views2s += r.views2s ?? 0;
    s.views6s += r.views6s ?? 0;
    s.clicks += r.clicks;
    s.conversions += r.conversions;
    s.spend += r.spend;
    watch += r.avgWatch * (r.impressions || 1);
    weight += r.impressions || 1;
  }
  s.avgWatch = weight ? watch / weight : 0;
  s.hookRate = s.impressions ? hookWatch(s).views / s.impressions : 0;
  s.ctr = s.impressions ? s.clicks / s.impressions : 0;
  s.convRate = s.impressions ? s.conversions / s.impressions : 0;
  return s;
}

// Ads whose id names this voice on this piece. An old id without a suffix matches the piece, not a voice.
// Ads whose id names this element set on this hook. An old id without an "e" matches the piece, not a set.
export function rowsForElement(rows: MetricRow[], pieceId: string, elementId: string): MetricRow[] {
  const id = pieceId.toUpperCase();
  return rows.filter((r) => {
    const parsed = parseAdId(r.adId || r.name);
    return Boolean(parsed && parsed.hookId === id && parsed.hookElement === elementId);
  });
}

export function rowsForVoice(rows: MetricRow[], pieceId: string, voiceId: string): MetricRow[] {
  const id = pieceId.toUpperCase();
  return rows.filter((r) => {
    const parsed = parseAdId(r.adId || r.name);
    if (!parsed) return false;
    if (parsed.hookId === id && parsed.hookVoice === voiceId) return true;
    if (parsed.meatId === id && parsed.meatVoice === voiceId) return true;
    if (parsed.ctaId === id && parsed.ctaVoice === voiceId) return true;
    return false;
  });
}

function scoreOf(kind: PieceKind, stats: PieceStats): number {
  if (kind === "hook") return stats.hookRate;
  if (kind === "meat") return stats.avgWatch;
  return stats.convRate * 1000 + stats.ctr;
}

function metricText(kind: PieceKind, stats: PieceStats): string {
  if (kind === "hook") {
    const watch = hookWatch(stats);
    return `${pct(stats.hookRate)} de retención a ${watch.seconds} s con ${esInt(stats.impressions)} impresiones`;
  }
  if (kind === "meat") return `${secs(stats.avgWatch)} de visionado promedio con ${esInt(stats.impressions)} impresiones`;
  return `${ratePct(stats.convRate)} de conversión y ${ratePct(stats.ctr)} de clics en ${esInt(stats.impressions)} impresiones`;
}

function meanText(kind: PieceKind, rows: PieceStats[]): string {
  const n = rows.length || 1;
  if (kind === "hook") return pct(rows.reduce((a, s) => a + s.hookRate, 0) / n);
  if (kind === "meat") return secs(rows.reduce((a, s) => a + s.avgWatch, 0) / n);
  const conv = rows.reduce((a, s) => a + s.convRate, 0) / n;
  const ctr = rows.reduce((a, s) => a + s.ctr, 0) / n;
  return `${ratePct(conv)} de conversión y ${ratePct(ctr)} de clics`;
}

// The column this kind is ranked by is missing, or every row has it at 0. Empty rows are not this case:
// those stay the impression message. Hooks rank on the hook rate, which is views over impressions.
export function metricColumnGap(kind: PieceKind, rows: MetricRow[]): string | null {
  if (rows.length === 0 || kind === "hook") return null;
  if (kind === "meat" && rows.every((r) => !(r.avgWatch > 0))) return "tiempo promedio";
  if (kind === "cta" && rows.every((r) => !(r.clicks > 0)) && rows.every((r) => !(r.conversions > 0))) return "clics y resultados";
  return null;
}

function thinLine(piece: NextPiece, kind: PieceKind, impressions: number, why: string): NextLine {
  return { id: piece.id, kind, action: "leave", verdict: "sin datos suficientes", impressions, why };
}

function rankKind(pieces: NextPiece[], byId: Record<string, PieceStats>, rows: MetricRow[], minImpressions: number, keepShare: number): NextLine[] {
  const kind = pieces[0]?.kind;
  if (!kind) return [];
  const gap = metricColumnGap(kind, rows);
  if (gap) {
    return pieces.map((piece) => {
      const stats = byId[piece.id] ?? sumRows(piece.id, []);
      return thinLine(piece, kind, stats.impressions, `${piece.id} sin datos suficientes: el CSV no trae la columna ${gap}.`);
    });
  }
  const enough: { piece: NextPiece; stats: PieceStats }[] = [];
  const lines: NextLine[] = [];
  for (const piece of pieces) {
    const stats = byId[piece.id] ?? sumRows(piece.id, []);
    if (!(stats.impressions > 0) || stats.impressions < minImpressions) {
      lines.push(thinLine(piece, kind, stats.impressions, `${piece.id} sin datos suficientes: ${esInt(stats.impressions)} impresiones (hacen falta ${esInt(minImpressions)}).`));
    } else enough.push({ piece, stats });
  }
  enough.sort((a, b) => scoreOf(kind, b.stats) - scoreOf(kind, a.stats) || pieceIdOrder(a.piece.id, b.piece.id));
  const archive = enough.length >= MIN_ARCHIVE && keepShare > 0;
  const kept = keepShare > 0 ? keepCount(enough.length, keepShare) : 0;
  let cut = kept;
  if (archive && kept > 0 && kept < enough.length) {
    const boundary = scoreOf(kind, enough[kept - 1].stats);
    while (cut < enough.length && scoreOf(kind, enough[cut].stats) === boundary) cut++;
  }
  const widened = archive && cut > kept;
  const mean = meanText(kind, enough.map((e) => e.stats));
  enough.forEach((e, i) => {
    const metric = metricText(kind, e.stats);
    const rank = `${i + 1} de ${enough.length} con datos`;
    let action: NextAction = "leave";
    let verdict: Verdict = "ganador";
    let why: string;
    if (!(keepShare > 0)) {
      verdict = i === 0 ? "ganador" : "perdedor";
      why = `${e.piece.id} queda ${rank}: ${metric} (la media de la tanda es ${mean}). Quedarse con el 0 % no aprueba ni archiva.`;
    } else if (!archive) {
      const keep = i < kept;
      action = keep ? "keep" : "leave";
      verdict = keep ? "ganador" : "perdedor";
      why = keep
        ? `${e.piece.id} sigue: ${metric} (la media de la tanda es ${mean}). Es la ${rank}; se quedan ${kept}. Con menos de 3 piezas con datos no se archiva nada.`
        : `${e.piece.id} queda ${rank}: ${metric} (la media de la tanda es ${mean}). Con menos de 3 piezas con datos no se archiva nada.`;
    } else {
      const keep = i < cut;
      const tied = widened && scoreOf(kind, e.stats) === scoreOf(kind, enough[kept - 1].stats);
      action = keep ? "keep" : "drop";
      verdict = keep ? "ganador" : "perdedor";
      const tie = tied ? " Empata con el último que se queda y se quedan juntos." : "";
      why = `${e.piece.id} ${keep ? "sigue" : "se archiva"}: ${metric} (la media de la tanda es ${mean}). Es la ${rank}; se quedan ${cut}.${tie}`;
    }
    lines.push({ id: e.piece.id, kind, action, verdict, impressions: e.stats.impressions, why });
  });
  return lines;
}

function pickedNow(ids: string[], current: VoiceSelectionLike | undefined, voiceId: string): boolean {
  if (!current) return ids.includes(voiceId);
  return current.picked.includes(voiceId);
}

function voiceLinesFor(
  piece: NextPiece,
  voices: NextVoice[],
  rows: MetricRow[],
  minImpressions: number,
  current: VoiceSelectionLike | undefined,
): VoiceLine[] {
  if (piece.clipSpeaker) return [];
  const mine = voices.filter((v) => v.pieceId === piece.id);
  if (mine.length < 2) return [];
  const ids = mine.map((v) => v.id);
  const scored = mine.map((v) => ({ voice: v, stats: sumRows(v.id, rowsForVoice(rows, piece.id, v.id)) }));
  const gap = metricColumnGap(piece.kind, rows);
  if (gap) {
    return scored.map((s) => ({
      pieceId: piece.id,
      voiceId: s.voice.id,
      name: s.voice.name,
      verdict: "sin datos suficientes" as const,
      pick: pickedNow(ids, current, s.voice.id),
      why: `${piece.id} ${s.voice.id}${s.voice.name ? ` (${s.voice.name})` : ""} sin datos suficientes: el CSV no trae la columna ${gap}. Queda como estaba.`,
    }));
  }
  const enough = scored.filter((s) => s.stats.impressions > 0 && s.stats.impressions >= minImpressions);
  enough.sort((a, b) => scoreOf(piece.kind, b.stats) - scoreOf(piece.kind, a.stats) || voiceIdOrder(a.voice.id, b.voice.id));
  const winner = enough[0]?.voice.id;
  const mean = enough.length ? meanText(piece.kind, enough.map((e) => e.stats)) : "";
  return scored.map((s) => {
    const was = pickedNow(ids, current, s.voice.id);
    if (!(s.stats.impressions > 0) || s.stats.impressions < minImpressions) {
      return {
        pieceId: piece.id,
        voiceId: s.voice.id,
        name: s.voice.name,
        verdict: "sin datos suficientes" as const,
        pick: was,
        why: `${piece.id} ${s.voice.id}${s.voice.name ? ` (${s.voice.name})` : ""} sin datos suficientes: ${esInt(s.stats.impressions)} impresiones en los anuncios que nombran esa voz (hacen falta ${esInt(minImpressions)}). Queda como estaba.`,
      };
    }
    const win = s.voice.id === winner;
    const tied = !win && enough.some((e) => e.voice.id !== s.voice.id && scoreOf(piece.kind, e.stats) === scoreOf(piece.kind, s.stats) && e.voice.id === winner);
    const head = win ? "sigue y queda elegida" : tied ? "empata y queda destildada: se queda el id más bajo" : "queda destildada";
    return {
      pieceId: piece.id,
      voiceId: s.voice.id,
      name: s.voice.name,
      verdict: win ? "ganador" : "perdedor",
      pick: win,
      why: `${piece.id} ${s.voice.id}${s.voice.name ? ` (${s.voice.name})` : ""} ${head}: ${metricText(piece.kind, s.stats)} (la media de sus voces con datos es ${mean}).`,
    };
  });
}

// The proposal for every piece passed in. Hooks, meats and CTAs are ranked apart. Voices only when the piece has
// more than one and an ad id names one (H12v3). Numbers come from the rows; a missing row is zero, not a guess.
export function proposeNext(input: {
  pieces: NextPiece[];
  rows: MetricRow[];
  voices?: NextVoice[];
  minImpressions?: number;
  keepShare?: number;
  voiceChoice?: Record<string, VoiceSelectionLike | undefined>;
}): NextProposal {
  const minImpressions = input.minImpressions ?? MIN_IMPRESSIONS;
  const keepShare = input.keepShare ?? DEFAULT_KEEP_SHARE;
  const byId = pieceStats(input.rows);
  const ranked = input.pieces.filter((p) => p.status === "pending" || p.status === "approved" || p.status === "archived");
  const lines: NextLine[] = [];
  for (const kind of ["hook", "meat", "cta"] as const) {
    lines.push(...rankKind(ranked.filter((p) => p.kind === kind), byId, input.rows, minImpressions, keepShare));
  }
  const voices: VoiceLine[] = [];
  for (const piece of ranked) {
    voices.push(...voiceLinesFor(piece, input.voices ?? [], input.rows, minImpressions, input.voiceChoice?.[piece.id]));
  }
  const elements: ElementLine[] = [];
  for (const piece of ranked) {
    const sets = piece.elementSets ?? [];
    if (piece.kind !== "hook" || sets.length <= 1) continue;
    for (const set of sets) {
      const mine = rowsForElement(input.rows, piece.id, set.id);
      const impressions = mine.reduce((n, r) => n + (r.impressions || 0), 0);
      const enough = impressions >= minImpressions;
      elements.push({
        pieceId: piece.id,
        elementId: set.id,
        verdict: enough ? "ganador" : "sin datos suficientes",
        impressions,
        why: enough
          ? `${piece.id} ${set.id}: ${impressions} impresiones.`
          : `${piece.id} ${set.id}: sin datos suficientes (${impressions} impresiones, el mínimo es ${minImpressions}).`,
      });
    }
  }
  return elements.length ? { lines, voices, elements } : { lines, voices };
}

// What Aplicar changes. A kept piece that is already approved is not touched. A drop becomes archived. Voices
// change only when a tick would move. `before: null` means the piece had no explicit pick (every voice was in).
export function planApply(
  proposal: NextProposal,
  pieces: { id: string; status: PieceStatus }[],
  voiceChoice: Record<string, VoiceSelectionLike | undefined>,
  voiceIds: Record<string, string[]>,
): { status: StatusChange[]; voices: VoiceChange[] } {
  const status: StatusChange[] = [];
  const byId = Object.fromEntries(pieces.map((p) => [p.id, p.status]));
  for (const line of proposal.lines) {
    const from = byId[line.id];
    if (!from || from === "rejected") continue;
    const to: PieceStatus | null = line.action === "keep" ? "approved" : line.action === "drop" ? "archived" : null;
    if (to && to !== from) status.push({ id: line.id, from, to });
  }
  const voices: VoiceChange[] = [];
  const grouped = new Map<string, VoiceLine[]>();
  for (const line of proposal.voices) {
    const list = grouped.get(line.pieceId) ?? [];
    list.push(line);
    grouped.set(line.pieceId, list);
  }
  for (const [pieceId, list] of grouped) {
    const ids = voiceIds[pieceId] ?? list.map((l) => l.voiceId);
    if (ids.length < 2) continue;
    const before = voiceChoice[pieceId] ?? null;
    const picked = ids.filter((id) => {
      const line = list.find((l) => l.voiceId === id);
      return line ? line.pick : before ? before.picked.includes(id) : true;
    });
    const known = [...new Set([...(before?.known ?? ids), ...ids])];
    const same = before ? before.picked.length === picked.length && before.picked.every((id) => picked.includes(id)) : picked.length === ids.length;
    if (same) continue;
    voices.push({ pieceId, before, after: { picked, known } });
  }
  return { status, voices };
}

// The statuses Deshacer writes back. A voice `restore` of null means the piece had no explicit pick.
export function undoChanges(applied: { status: StatusChange[]; voices: VoiceChange[] }): {
  status: StatusChange[];
  voices: { pieceId: string; restore: VoiceSelectionLike | null }[];
} {
  return {
    status: applied.status.map((s) => ({ id: s.id, from: s.to, to: s.from })),
    voices: applied.voices.map((v) => ({ pieceId: v.pieceId, restore: v.before })),
  };
}

// The winner's own words, angle, level and the numbers in the imported rows. `count` is how many new hooks to ask
// for. The route looks the hook up; this only formats facts it was given.
export function variantFacts(
  hook: { id: string; text: string; level: number; angle: string; formula: string },
  stats: Pick<PieceStats, "impressions" | "views3s" | "views2s" | "hookRate"> | undefined,
  count: number,
): { angle: string; formula: string; level: number; count: number; line: string } {
  const impressions = stats?.impressions ?? 0;
  const views3s = stats?.views3s ?? 0;
  const rate = stats?.hookRate ?? 0;
  const watch = hookWatch({ views3s, views2s: stats?.views2s ?? 0 });
  const shown = watch.seconds === 2 ? watch.views : views3s;
  const n = Math.max(1, Math.round(count));
  return {
    angle: hook.angle,
    formula: hook.formula,
    level: hook.level,
    count: n,
    line: `${hook.text} (${hook.id}, N${hook.level}, angle ${hook.angle}, formula ${hook.formula}, ${Math.round(rate * 100)}% ven ${watch.seconds} s, ${Math.round(shown)} vistas de ${watch.seconds} s, ${Math.round(impressions)} impresiones). Write ${n} new hooks in this same angle and formula. Never reuse these words.`,
  };
}

// A variant asks for more hooks in one winner's angle. Under the floor it is not a winner, so the route refuses.
export function variantWinnerRefusal(id: string, stats: { impressions: number } | undefined, min = MIN_IMPRESSIONS): string | null {
  if (enoughData(stats ?? { impressions: 0 }, min)) return null;
  const n = Math.round(stats?.impressions ?? 0);
  return `${id} tiene ${n} impresiones y el mínimo para mandarlo como ganador es ${min}. No se puede mandar como ganador: subí el mínimo en Fuentes o elegí un gancho que ya lo pase.`;
}

// Status, the impression floor, then a hook this ranking would archive. Under three pieces with data nobody is
// archived, so the best of a short list can still be a variant. The floor is the person's own setting.
export function variantHookRefusal(input: {
  id: string;
  status: PieceStatus;
  stats: { impressions: number } | undefined;
  pieces: NextPiece[];
  rows: MetricRow[];
  min?: number;
  keepShare?: number;
}): string | null {
  if (input.status === "rejected") return `${input.id} está descartado. Aprobá el gancho o elegí un ganador.`;
  if (input.status === "archived") return `${input.id} está archivado. Aprobá el gancho o elegí un ganador.`;
  const min = input.min ?? MIN_IMPRESSIONS;
  const floor = variantWinnerRefusal(input.id, input.stats, min);
  if (floor) return floor;
  const line = proposeNext({
    pieces: input.pieces,
    rows: input.rows,
    minImpressions: min,
    keepShare: input.keepShare ?? DEFAULT_KEEP_SHARE,
  }).lines.find((l) => l.id === input.id);
  if (line?.action === "drop") return `${input.id} quedó como perdedor de la próxima tanda. No se puede pedir variantes de un gancho que se archiva: elegí un ganador.`;
  return null;
}

// Deshacer only reverts a piece whose status is still the one Aplicar wrote. The rest are named and left as they are.
export function undoStatusPlan(applied: StatusChange[], current: { id: string; status: PieceStatus }[]): { revert: StatusChange[]; skipped: string[] } {
  const byId = new Map(current.map((p) => [p.id, p.status]));
  const revert: StatusChange[] = [];
  const skipped: string[] = [];
  for (const change of applied) {
    if (byId.get(change.id) === change.to) revert.push({ id: change.id, from: change.to, to: change.from });
    else skipped.push(change.id);
  }
  return { revert, skipped };
}

function sameVoice(current: VoiceSelectionLike | null | undefined, after: VoiceSelectionLike): boolean {
  if (!current || current.picked.length !== after.picked.length) return false;
  const picked = new Set(current.picked);
  return after.picked.every((id) => picked.has(id));
}

export function undoVoicePlan(
  applied: VoiceChange[],
  current: Record<string, VoiceSelectionLike | undefined>,
): { revert: { pieceId: string; restore: VoiceSelectionLike | null }[]; skipped: string[] } {
  const revert: { pieceId: string; restore: VoiceSelectionLike | null }[] = [];
  const skipped: string[] = [];
  for (const change of applied) {
    if (sameVoice(current[change.pieceId], change.after)) revert.push({ pieceId: change.pieceId, restore: change.before });
    else skipped.push(change.pieceId);
  }
  return { revert, skipped };
}

export function undoSkipNote(statusSkipped: string[], voiceSkipped: string[]): string {
  const bits: string[] = [];
  if (statusSkipped.length) bits.push(`No volví ${statusSkipped.join(", ")}: el estado ya no es el que dejó Aplicar.`);
  if (voiceSkipped.length) bits.push(`No volví la voz de ${voiceSkipped.join(", ")}: la elección ya no es la que dejó Aplicar.`);
  return bits.join(" ");
}
