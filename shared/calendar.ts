// The series' calendar moments (idea 60): dates and seasons the audience already feels ("el 1 de cada mes: cobran",
// "primera semana de junio: primer frío"). Each line is "cuándo: qué pasa"; this reads the "cuándo" in Spanish and
// finds its next date, so the brief can suggest the nearest one and the writers see them nearest first. A line whose
// "cuándo" is not a date it knows stays as is, without a date: the writers still read it.

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const DAYS = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
const ORDINAL: Record<string, number> = { primer: 1, primero: 1, primera: 1, segundo: 2, segunda: 2, tercer: 3, tercero: 3, tercera: 3, cuarto: 4, cuarta: 4, ultimo: -1, ultima: -1 };

// `span`: how many days the moment lasts (a week, a whole month); while it lasts, it is "today".
type Rule =
  | { kind: "yearly"; month: number; day: number | "last-week"; span?: number }
  | { kind: "monthly"; day: number | "last" }
  | { kind: "monthly-weekday"; nth: number; weekday: number }
  | { kind: "weekly"; weekday: number };

export type Moment = { line: string; when: string; what: string; next: string | null; days: number | null };

const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const monthRe = `(${MONTHS.join("|")}|setiembre)`;
const dayRe = `(${DAYS.join("|")})`;
const monthOf = (m: string) => (m === "setiembre" ? 8 : MONTHS.indexOf(m));
const lastDay = (y: number, m: number) => new Date(y, m + 1, 0).getDate();

export function parseWhen(when: string): Rule | null {
  const w = plain(when);
  let m: RegExpMatchArray | null;
  if ((m = w.match(/\b(\d{1,2})\/(\d{1,2})\b/))) return { kind: "yearly", day: Number(m[1]), month: Number(m[2]) - 1 };
  if ((m = w.match(new RegExp(`\\b(\\d{1,2}) de ${monthRe}`)))) return { kind: "yearly", day: Number(m[1]), month: monthOf(m[2]) };
  if ((m = w.match(new RegExp(`\\b(primera|segunda|tercera|cuarta|ultima) semana de ${monthRe}`))))
    return ORDINAL[m[1]] === -1
      ? { kind: "yearly", month: monthOf(m[2]), day: "last-week", span: 7 }
      : { kind: "yearly", month: monthOf(m[2]), day: 1 + 7 * (ORDINAL[m[1]] - 1), span: 7 };
  if ((m = w.match(new RegExp(`\\b(principios|comienzos|inicio|inicios) de ${monthRe}`)))) return { kind: "yearly", month: monthOf(m[2]), day: 1, span: 10 };
  if ((m = w.match(new RegExp(`\\bmediados de ${monthRe}`)))) return { kind: "yearly", month: monthOf(m[1]), day: 11, span: 10 };
  if ((m = w.match(new RegExp(`\\b(fin|fines|finales) de ${monthRe}`)))) return { kind: "yearly", month: monthOf(m[2]), day: "last-week", span: 7 };
  if ((m = w.match(new RegExp(`\\b(primer|primero|segundo|tercer|tercero|cuarto|ultimo) ${dayRe} (de cada mes|del mes|de mes)`))))
    return { kind: "monthly-weekday", nth: ORDINAL[m[1]], weekday: DAYS.indexOf(m[2]) };
  if ((m = w.match(/\b(?:el )?(?:dia )?(\d{1,2}) (?:de cada mes|del mes|de mes)\b/)) || (m = w.match(/\bcada (?:dia )?(\d{1,2})\b/)))
    return { kind: "monthly", day: Number(m[1]) };
  if (/\b(fin|fines|final|finales) de (cada )?mes\b/.test(w)) return { kind: "monthly", day: "last" };
  if ((m = w.match(new RegExp(`\\b(?:todos los|cada|los) ${dayRe}s?\\b`)))) return { kind: "weekly", weekday: DAYS.indexOf(m[1]) };
  if ((m = w.match(new RegExp(`^(?:en |todo )?${monthRe}$`)))) return { kind: "yearly", month: monthOf(m[1]), day: 1, span: 31 };
  return null;
}

// The first date on or after `today` the rule falls on.
export function nextDate(rule: Rule, today: Date): Date {
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const y = t.getFullYear();
  const mo = t.getMonth();
  const onOrAfter = (make: (year: number, month: number) => Date, step: "year" | "month") => {
    for (let k = 0; k < 14; k++) {
      const d = step === "year" ? make(y + k, 0) : make(y, mo + k);
      if (d >= t) return d;
    }
    return make(y + 1, mo);
  };
  switch (rule.kind) {
    case "yearly": {
      const start = (year: number) =>
        new Date(year, rule.month, rule.day === "last-week" ? lastDay(year, rule.month) - 6 : Math.min(rule.day, lastDay(year, rule.month)));
      // A moment that lasts (a week, a month) and has started but not ended is today.
      const begun = start(y);
      const end = new Date(begun.getFullYear(), begun.getMonth(), Math.min(begun.getDate() + (rule.span ?? 1) - 1, lastDay(y, rule.month)));
      if (begun <= t && t <= end) return t;
      return onOrAfter((year) => start(year), "year");
    }
    case "monthly":
      return onOrAfter((year, month) => {
        const n = new Date(year, month, 1);
        const days = lastDay(n.getFullYear(), n.getMonth());
        return new Date(n.getFullYear(), n.getMonth(), rule.day === "last" ? days : Math.min(rule.day, days));
      }, "month");
    case "monthly-weekday":
      return onOrAfter((year, month) => {
        const n = new Date(year, month, 1);
        const [ny, nm] = [n.getFullYear(), n.getMonth()];
        if (rule.nth === -1) {
          const last = new Date(ny, nm, lastDay(ny, nm));
          return new Date(ny, nm, last.getDate() - ((last.getDay() - rule.weekday + 7) % 7));
        }
        const first = (rule.weekday - n.getDay() + 7) % 7;
        return new Date(ny, nm, 1 + first + 7 * (rule.nth - 1));
      }, "month");
    case "weekly":
      return new Date(t.getFullYear(), t.getMonth(), t.getDate() + ((rule.weekday - t.getDay() + 7) % 7));
  }
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function readMoment(line: string, today: Date): Moment {
  const cut = line.indexOf(":");
  const when = (cut > 0 ? line.slice(0, cut) : line).trim();
  const what = (cut > 0 ? line.slice(cut + 1) : line).trim() || when;
  const rule = parseWhen(when);
  if (!rule) return { line, when, what, next: null, days: null };
  const next = nextDate(rule, today);
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return { line, when, what, next: iso(next), days: Math.round((next.getTime() - t.getTime()) / 86_400_000) };
}

// Every moment, the nearest first; the ones without a date at the end, in their order.
export function upcomingMoments(lines: readonly string[], today: Date): Moment[] {
  return lines
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => readMoment(l, today))
    .map((m, i) => ({ m, i }))
    .sort((a, b) => (a.m.days ?? Infinity) - (b.m.days ?? Infinity) || a.i - b.i)
    .map(({ m }) => m);
}

export function inDays(days: number): string {
  return days === 0 ? "hoy" : days === 1 ? "mañana" : `en ${days} días`;
}

// For the writers (English, like their prompts): the moments nearest first, with how far each one is.
export function momentsForWriter(lines: readonly string[], today: Date): string {
  const list = upcomingMoments(lines, today);
  if (!list.length) return "";
  return `The series' calendar moments (dates the audience already feels), nearest first: ${list
    .map((m) => `"${m.line}"${m.days === null ? " (no fixed date)" : ` (${m.days === 0 ? "today" : `in ${m.days} days`})`}`)
    .join("; ")}. When the brief's moment is empty, a hook may open on the nearest one; never invent a date.`;
}
