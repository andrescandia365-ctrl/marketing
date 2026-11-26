import { useEffect, useRef, useState } from "react";
import { MOVES, MOVE_HINT, MOVE_LABEL, moveCounts } from "../../shared/moves.ts";
import { runnerInUse, runnerLandings, type Problem } from "../../shared/checks.ts";
import type { Story } from "../../shared/schema.ts";
import { LENGTHS, ROLE_LABEL, formatTime, spokenSeconds } from "../../shared/template.ts";
import { ChecksPanel, LoopsMap } from "./Checks.tsx";
import { BeatChip, Button, PieceTitle, ROLE_TEXT, Spinner, inputClass } from "./ui.tsx";
import { ClaudeHandoff, type Handoff } from "./ClaudeHandoff.tsx";
import { HookElementsPanel } from "./HookElementsPanel.tsx";
import type { HookElement } from "../../shared/hookElements.ts";

type Props = {
  story: Story;
  round: number;
  length: keyof typeof LENGTHS;
  busy: "revise" | "fix" | "board" | null;
  problems: Problem[];
  dismissed: number;
  onRevise: (note: string) => Promise<boolean>;
  onFix: () => void;
  onDismiss: (problem: Problem) => void;
  onApprove: () => void;
  // Runners already used by other pieces, so this one can show the repeat.
  usedRunners?: { bit: string; problem: string }[];
  // A line the writers' room put on, or took off, the director's note.
  seed?: { id: number; text: string; on: boolean } | null;
  // Without a key: each writer button by copy and paste with claude.ai (the buttons show the sample).
  handoffs?: { revise: (note: string) => Handoff; fix: Handoff; board: Handoff } | null;
  funnel?: string | null;
  seriesId: string;
  library?: HookElement[];
  previous?: string[];
  noKey?: boolean;
  onElements: (next: HookElement[]) => void;
  onLibrary?: (element: HookElement) => void | Promise<void | HookElement[]>;
};

// Step 2: the story as a Good-vs-Bad script. Notes go back to Claude for another round until you approve it.
export function StoryView({ story, round, length, busy, problems, dismissed, onRevise, onFix, onDismiss, onApprove, usedRunners = [], seed, handoffs, funnel, seriesId, library = [], previous = [], noKey = false, onElements, onLibrary }: Props) {
  const [note, setNote] = useState("");
  const box = useRef<HTMLTextAreaElement>(null);
  const cast = Object.fromEntries(story.characters.map((c) => [c.id, c]));
  const seconds = story.topics.reduce((n, t) => n + t.lines.reduce((m, l) => m + spokenSeconds(l.text), 0), 0);
  const target = LENGTHS[length];
  const fits = seconds >= target.min * 0.8 && seconds <= target.max * 1.15;
  const lands = runnerLandings(story);
  const bit = (story.runner?.bit ?? "").trim().toLowerCase();
  const prior = bit ? usedRunners.filter((u) => u.bit.trim().toLowerCase() === bit) : [];

  async function revise() {
    if (await onRevise(note.trim())) setNote("");
  }

  useEffect(() => {
    if (!seed?.text) return;
    setNote((n) => {
      if (!seed.on) return n.split("\n").filter((row) => row.trim() !== seed.text.trim()).join("\n").trim();
      return n.includes(seed.text) ? n : n.trim() ? `${n.trim()}\n${seed.text}` : seed.text;
    });
    if (seed.on) box.current?.scrollIntoView({ block: "center" });
  }, [seed]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs text-muted">Ronda {round}</p>
          <PieceTitle problem={story.problem} title={story.title} funnel={funnel} />
          <p className="text-sm text-muted">{story.logline}</p>
        </div>
        <span
          className={`rounded-md px-2 py-1 font-mono text-xs ${fits ? "bg-good-soft text-good" : "bg-neg-soft text-neg"}`}
          title="Estimado a 2,5 palabras por segundo"
        >
          ≈ {formatTime(seconds)} hablado · objetivo {formatTime(target.min)}–{formatTime(target.max)}
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {story.characters.map((c) => (
          <div key={c.id} className="rounded-lg border border-line bg-white px-3 py-2 text-sm">
            <span className={`font-bold ${ROLE_TEXT[c.role]}`}>{c.name}</span>
            <span className="text-xs text-muted"> · {ROLE_LABEL[c.role]}</span>
            <p className="max-w-64 text-xs text-muted">{c.voice}</p>
          </div>
        ))}
      </div>

      <MoveCoverage topics={story.topics} />

      <HookElementsPanel
        elements={story.hookElements ?? []}
        onChange={onElements}
        seriesId={seriesId}
        pain={story.problem}
        library={library}
        previous={previous}
        noKey={noKey}
        onLibrary={onLibrary}
      />

      {story.topics.map((topic, i) => (
        <section key={topic.id} className="rounded-xl border border-line bg-white p-4">
          <p className="font-mono text-xs text-muted">Tema {i + 1}</p>
          <h3 className="text-lg font-bold">{topic.title}</h3>
          <p className="mt-1 text-sm text-muted">
            <span className="font-semibold text-ink">{i === 0 ? "Arranca con: " : "Puente: "}</span>
            {topic.bridge}
          </p>
          {(topic.moves ?? []).length > 0 && (
            <p className="mt-2 flex flex-wrap gap-1" aria-label="Jugadas del playbook en este tema">
              {topic.moves.map((m) => (
                <span key={m} title={MOVE_HINT[m]} className="rounded-full border border-touch/40 bg-touch-soft px-2 py-0.5 text-[11px] font-semibold text-touch">
                  {MOVE_LABEL[m]}
                </span>
              ))}
            </p>
          )}
          <ol className="mt-3 space-y-2">
            {topic.lines.map((line, j) => {
              const who = cast[line.speaker];
              const hits = lands.filter((land) => land.hit && land.quotes.some((q) => line.text.toLowerCase().includes(q.toLowerCase())));
              return (
                <li key={j} className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 text-sm">
                  <div className="space-y-1">
                    <BeatChip beat={line.beat} />
                    <p className={`text-xs font-bold ${who ? ROLE_TEXT[who.role] : "text-muted"}`}>{who?.name ?? line.speaker}</p>
                  </div>
                  <div>
                    <p className="font-medium">
                      “{line.text}”
                      {line.emotion && <span className="ml-1.5 text-xs font-normal text-touch italic">({line.emotion})</span>}
                    </p>
                    {hits.length > 0 && (
                      <p className="mt-1 flex flex-wrap gap-1">
                        {hits.map((land) => (
                          <span key={land.where} className="rounded bg-ink px-1.5 py-0.5 text-[10px] font-semibold text-white">
                            Corredor · {land.where}
                          </span>
                        ))}
                      </p>
                    )}
                    <p className="text-xs text-muted">{line.direction}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      ))}

      <div className="rounded-xl border border-line bg-white p-4">
        <p className="text-sm font-semibold">Callbacks</p>
        <ul className="mt-2 space-y-1 text-sm">
          {story.callbacks.map((c, i) => (
            <li key={i}>
              <span className="text-muted">Se siembra:</span> {c.planted} <span className="text-muted">→ Se paga:</span> {c.payoff}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-sm">
          <span className="text-muted">Cierre:</span> “{story.close}”
        </p>
      </div>

      {(runnerInUse(story) || (story.tease ?? "").trim() || (story.canon ?? []).length > 0) && (
        <div className="rounded-xl border border-line bg-white p-4">
          <p className="text-sm font-semibold">La sala de esta pieza</p>
          {lands.length > 0 && (
            <div className="mt-2">
              <p className="text-xs font-semibold tracking-wide text-muted uppercase">
                Corredor{story.runner?.bit ? ` · ${story.runner.bit}` : ""}
              </p>
              {prior.length > 0 && (
                <p className="mt-1.5 rounded-md border border-neg/30 bg-neg-soft px-2 py-1 text-xs text-neg">
                  Ya lo usó {prior.map((p) => p.problem).join(", ")}.
                </p>
              )}
              <ol className="mt-2 grid gap-2 sm:grid-cols-3">
                {lands.map((land, i) => {
                  const ok = land.hit && !land.same;
                  const status = !land.quotes.length ? "Falta la cita" : !land.hit ? "No está en una línea" : land.same ? "Cae, y es igual a otra" : "Cae en una línea";
                  return (
                    <li
                      key={land.where}
                      className={`rounded-lg border px-3 py-2 text-sm ${ok ? "border-good/40 bg-good-soft" : "border-neg/40 bg-neg-soft"}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[10px] text-muted">
                          {i + 1} · {land.where}
                        </span>
                        <span className={`rounded-full bg-white px-1.5 py-0.5 text-[10px] font-semibold ${ok ? "text-good" : "text-neg"}`}>
                          {status}
                        </span>
                      </div>
                      <p className="mt-1.5 leading-snug">{land.text}</p>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}
          {(story.tease ?? "").trim() && (
            <p className="mt-3 border-l-[3px] border-l-touch pl-2 text-sm">
              <span className="text-muted">Para el próximo:</span> {story.tease}
            </p>
          )}
          {(story.canon ?? []).length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-semibold tracking-wide text-muted uppercase">Quedó en el mundo</p>
              <ul className="mt-1 space-y-1 text-sm">
                {(story.canon ?? []).map((c) => (
                  <li key={c.fact} className="border-l-[3px] border-l-good pl-2">
                    {c.fact}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <LoopsMap story={story} />

      <ChecksPanel
        problems={problems}
        dismissed={dismissed}
        fixing={busy === "fix"}
        disabled={busy !== null}
        onFix={onFix}
        onDismiss={onDismiss}
        handoff={handoffs?.fix}
      />

      <div className="space-y-3 rounded-xl border border-ink/20 bg-white p-4">
        <label className="block">
          <span className="text-sm font-semibold">Notas para esta ronda</span>
          <span className="block text-xs text-muted">
            Como un director: qué no funciona, qué falta, qué sobra. La IA reescribe y aparece la ronda {round + 1}.
          </span>
          <textarea
            ref={box}
            className={`${inputClass} mt-1.5`}
            rows={3}
            value={note}
            placeholder="ej. el Malo es demasiado amable; el momento emotivo llega tarde; sacá el chiste del router"
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={revise} disabled={!note.trim() || busy !== null}>
            {busy === "revise" ? (
              <>
                <Spinner /> Reescribiendo…
              </>
            ) : handoffs ? (
              "Ver un ejemplo"
            ) : (
              "Reescribir la historia"
            )}
          </Button>
          <Button
            onClick={onApprove}
            disabled={busy !== null || problems.length > 0}
            title={problems.length > 0 ? "Primero resolvé los problemas del check" : undefined}
          >
            {busy === "board" ? (
              <>
                <Spinner /> Armando el storyboard…
              </>
            ) : handoffs ? (
              "Aprobar → storyboard de ejemplo"
            ) : (
              "Aprobar → storyboard"
            )}
          </Button>
        </div>
        {handoffs && (
          <div className="grid gap-2 md:grid-cols-2">
            <ClaudeHandoff
              title="Reescribir la historia"
              what={`la ronda ${round + 1}`}
              disabled={!note.trim() || busy !== null}
              via={{ ...handoffs.revise(note.trim()), paste: async (reply) => (await handoffs.revise(note.trim()).paste(reply)) && setNote("") }}
            />
            <ClaudeHandoff
              title="Aprobar → storyboard"
              what="el storyboard"
              disabled={busy !== null || problems.length > 0}
              via={handoffs.board}
            />
          </div>
        )}
        {handoffs && !note.trim() && <p className="text-xs text-muted">Para reescribir con claude.ai, primero escribí la nota de esta ronda.</p>}
      </div>
    </div>
  );
}

// The playbook's moves (§2.5) across the piece: the ones its topics use, and the ones it leaves out. Stories written
// before the moves were data show nothing.
function MoveCoverage({ topics }: { topics: Story["topics"] }) {
  const counts = moveCounts(topics.map((t) => t.moves ?? []));
  if (!MOVES.some((m) => counts[m] > 0)) return null;
  return (
    <div className="rounded-xl border border-line bg-white p-3">
      <p className="text-sm font-semibold">Jugadas del playbook</p>
      <p className="mt-2 flex flex-wrap gap-1">
        {MOVES.map((m) => (
          <span
            key={m}
            title={MOVE_HINT[m]}
            className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
              counts[m] ? "border-touch/40 bg-touch-soft text-touch" : "border-line text-muted line-through decoration-muted/40"
            }`}
          >
            {MOVE_LABEL[m]}
            {counts[m] > 1 ? ` ×${counts[m]}` : ""}
          </span>
        ))}
      </p>
    </div>
  );
}
