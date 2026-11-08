import { Children, type ReactNode } from "react";
import { MOVES, MOVE_HINT, MOVE_LABEL, moveCounts } from "../../shared/moves.ts";
import type { RoomCard } from "../../shared/room.ts";
import { overusedMoves, retakeCanon, retakeLoop, retakeRunner, retakeTease } from "../../shared/room.ts";
import { Button } from "./ui.tsx";

type Props = {
  seriesName: string;
  cards: RoomCard[];
  // Debts pinned onto this piece. Clicking a pinned one takes it off.
  notes: string[];
  showBanner: boolean;
  busy: boolean;
  onRetake?: (note: string) => void;
  onClear: () => void;
  // "arriba 7 · medio 2 · abajo 0", only when some piece of the series has a floor.
  tally?: string | null;
};

const TONE = {
  touch: "border-touch/30 bg-touch-soft",
  neg: "border-neg/30 bg-neg-soft",
  good: "border-good/30 bg-good-soft",
} as const;

const CHIP = {
  touch: "border-touch/30 bg-touch-soft text-touch",
  neg: "border-neg/30 bg-neg-soft text-neg",
  good: "border-good/30 bg-good-soft text-good",
  ink: "border-line bg-paper text-ink",
} as const;

const BAR = {
  touch: "bg-touch",
  neg: "bg-neg",
  good: "bg-good",
  ink: "bg-ink",
} as const;

// The wall of the writers' room: what the other episodes left, newest debt first, season oldest first.
export function WritersRoom({ seriesName, cards, notes, showBanner, busy, onRetake, onClear, tally }: Props) {
  const season = [...cards].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
  const teases = cards.filter((c) => c.tease);
  const loops = cards.flatMap((c) => c.open.map((question) => ({ card: c, question })));
  const canon = canonGroups(cards);
  const runners = cards.filter((c) => c.runner);
  const moves = moveCounts(cards.map((c) => c.moves ?? []));
  const leaning = new Set(overusedMoves(cards).map((m) => m.move));

  return (
    <section className="rounded-xl border border-line bg-white p-4" aria-label="La pizarra">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">La pizarra</h2>
        <span className="font-mono text-xs text-muted">{seriesName}</span>
      </div>
      <p className="mt-1 text-xs text-muted">Lo que las otras piezas dejaron para esta.</p>
      {tally && <p className="mt-1 font-mono text-xs text-muted">Embudo de la serie: {tally}</p>}
      {cards.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          <Count n={teases.length} label="para el próximo" tone="touch" />
          <Count n={loops.length} label="sin pagar" tone="neg" />
          <Count n={canon.length} label="en el mundo" tone="good" />
          {runners.length > 0 && (
            <Count n={runners.length} label={runners.length === 1 ? "corredor" : "corredores"} tone="ink" />
          )}
        </ul>
      )}

      {showBanner && notes.length > 0 && (
        <div className="mt-3 rounded-lg border border-touch/30 bg-touch-soft px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">Esta pieza arranca con esto.</p>
            {notes.length > 1 && (
              <button type="button" className="shrink-0 text-xs font-semibold text-touch hover:underline" onClick={onClear}>
                Sacar todas
              </button>
            )}
          </div>
          <ul className="mt-2 space-y-1.5">
            {notes.map((note) => (
              <li key={note} className="flex items-start gap-2 rounded-lg border border-touch/20 bg-white px-2.5 py-1.5 text-sm leading-snug">
                <span className="min-w-0 flex-1">{note}</span>
                {onRetake && (
                  <button
                    type="button"
                    className="shrink-0 rounded-md px-1.5 py-0.5 text-xs font-semibold text-touch hover:bg-touch-soft"
                    aria-label={`Sacar: ${note.slice(0, 48)}`}
                    onClick={() => onRetake(note)}
                  >
                    Sacar
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {MOVES.some((m) => moves[m] > 0) && (
        <div className="mt-3">
          <p className="text-xs font-semibold">Jugadas en la serie</p>
          <p className="mt-1 flex flex-wrap gap-1">
            {MOVES.filter((m) => moves[m] > 0).map((m) => (
              <span
                key={m}
                title={`${MOVE_HINT[m]} · en ${moves[m]} de ${cards.length} piezas${leaning.has(m) && m !== "turn" && m !== "button" ? ". La serie se apoya mucho en esta: probá otra." : ""}`}
                className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                  leaning.has(m) && m !== "turn" && m !== "button" ? "border-neg/40 bg-neg-soft text-neg" : "border-line bg-paper text-muted"
                }`}
              >
                {MOVE_LABEL[m]} {moves[m]}/{cards.length}
              </span>
            ))}
          </p>
        </div>
      )}

      {cards.length === 0 ? (
        <p className="mt-3 text-sm text-muted">
          Todavía no hay otras piezas con historia en {seriesName}. Lo que esta deje para el próximo, y lo que cambie en el mundo, va a quedar acá.
        </p>
      ) : (
        <>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <Column title="Para el próximo" empty="Nada para el próximo." tone="touch">
              {teases.map((c) => (
                <Debt
                  key={`${c.id}:tease`}
                  episode={c.problem}
                  text={c.tease}
                  note={retakeTease(c)}
                  action="Retomar"
                  tone="touch"
                  notes={notes}
                  busy={busy}
                  onRetake={onRetake}
                />
              ))}
            </Column>
            <Column title="Sin pagar" empty="Nada sin pagar." tone="neg">
              {loops.map(({ card, question }) => (
                <Debt
                  key={`${card.id}:${question}`}
                  episode={card.problem}
                  text={question}
                  note={retakeLoop(card, question)}
                  action="Retomar"
                  tone="neg"
                  notes={notes}
                  busy={busy}
                  onRetake={onRetake}
                />
              ))}
            </Column>
            <Column title="El mundo ya sabe" empty="Nada quedó en el mundo." tone="good">
              {canon.map((group) => (
                <Debt
                  key={group.fact}
                  episode={group.episodes.join(" · ")}
                  text={group.fact}
                  note={retakeCanon(group.fact, group.episodes[0] ?? "")}
                  action="Ya pasó"
                  tone="good"
                  notes={notes}
                  busy={busy}
                  onRetake={onRetake}
                />
              ))}
            </Column>
          </div>

          {runners.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-semibold tracking-wide text-muted uppercase">Corredores ya usados</p>
              <ul className="mt-1.5 flex flex-wrap gap-2">
                {runners.map((c) => (
                  <li key={`${c.id}:runner`}>
                    <Debt
                      episode={c.problem}
                      text={c.runner}
                      note={retakeRunner(c)}
                      action="Otro bit"
                      tone="ink"
                      notes={notes}
                      busy={busy}
                      onRetake={onRetake}
                      inline
                    />
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-4">
            <p className="text-xs font-semibold tracking-wide text-muted uppercase">En orden</p>
            <ul className="mt-1.5 flex gap-2 overflow-x-auto pb-1">
              {season.map((c, i) => (
                <li
                  key={c.id}
                  className="w-48 shrink-0 rounded-lg border border-line bg-paper px-2.5 py-2"
                  title={[c.title, c.paid[0] ? `Pagó: ${c.paid[0]}` : ""].filter(Boolean).join(" · ")}
                >
                  <div className="flex items-start gap-2">
                    <span className="grid size-5 shrink-0 place-items-center rounded-full bg-ink text-[10px] font-semibold text-white">
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs leading-snug font-semibold">{c.problem}</p>
                      {c.title && <p className="truncate text-[11px] text-muted">{c.title}</p>}
                      {c.paid[0] && <p className="line-clamp-2 text-[11px] leading-snug font-medium text-good">Pagó: {c.paid[0]}</p>}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </section>
  );
}

function canonGroups(cards: RoomCard[]): { fact: string; episodes: string[] }[] {
  const groups = new Map<string, string[]>();
  for (const card of cards) {
    for (const fact of card.canon) {
      const episodes = groups.get(fact) ?? [];
      if (!episodes.includes(card.problem)) episodes.push(card.problem);
      groups.set(fact, episodes);
    }
  }
  return [...groups.entries()].map(([fact, episodes]) => ({ fact, episodes }));
}

function Count({ n, label, tone }: { n: number; label: string; tone: keyof typeof CHIP }) {
  return (
    <li className={`rounded-full border px-2 py-0.5 font-mono text-[11px] ${CHIP[tone]}`}>
      {n} {label}
    </li>
  );
}

function Column({
  title,
  empty,
  tone,
  children,
}: {
  title: string;
  empty: string;
  tone: keyof typeof TONE;
  children: ReactNode;
}) {
  const count = Children.count(children);
  return (
    <div className={`flex flex-col rounded-lg border p-3 ${TONE[tone]}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold tracking-wide text-muted uppercase">{title}</p>
        <span className="font-mono text-[11px] text-muted">{count}</span>
      </div>
      {count === 0 ? (
        <p className="mt-2 flex flex-1 items-center rounded-md border border-dashed border-line bg-white/60 px-2 py-3 text-xs text-muted">{empty}</p>
      ) : (
        <div className="mt-2 space-y-2">{children}</div>
      )}
    </div>
  );
}

function Debt({
  episode,
  text,
  note,
  action,
  tone,
  notes,
  busy,
  onRetake,
  inline,
}: {
  episode: string;
  text: string;
  note: string;
  action: string;
  tone: keyof typeof BAR;
  notes: string[];
  busy: boolean;
  onRetake?: (note: string) => void;
  inline?: boolean;
}) {
  const on = notes.includes(note);
  return (
    <div className={`${inline ? "inline-flex" : "flex"} max-w-full overflow-hidden rounded-lg border ${on ? "border-ink bg-paper" : "border-line bg-white"}`}>
      <span className={`w-1 shrink-0 ${BAR[tone]}`} aria-hidden="true" />
      <div className="flex min-w-0 flex-1 items-start justify-between gap-2 px-2.5 py-2">
        <div className="min-w-0">
          {episode && <p className="text-[11px] leading-tight font-semibold text-muted">{episode}</p>}
          <p className={`${inline ? "text-xs" : "text-sm"} leading-snug font-medium`}>{text}</p>
        </div>
        {onRetake && (
          <Button
            variant={on ? "primary" : "secondary"}
            className="shrink-0 px-2.5 py-1 text-xs"
            disabled={busy}
            aria-pressed={on}
            title={on ? "Sacar de la nota" : undefined}
            onClick={() => onRetake(note)}
          >
            {on ? "En la nota" : action}
          </Button>
        )}
      </div>
    </div>
  );
}
