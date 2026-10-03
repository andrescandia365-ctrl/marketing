import { useState } from "react";
import type { Problem } from "../../shared/checks.ts";
import type { Story } from "../../shared/schema.ts";
import { LENGTHS, ROLE_LABEL, formatTime, spokenSeconds } from "../../shared/template.ts";
import { ChecksPanel, LoopsMap } from "./Checks.tsx";
import { BeatChip, Button, PieceTitle, ROLE_TEXT, Spinner, inputClass } from "./ui.tsx";

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
};

// Step 2: the story as a Good-vs-Bad script. Notes go back to Claude for another round until you approve it.
export function StoryView({ story, round, length, busy, problems, dismissed, onRevise, onFix, onDismiss, onApprove }: Props) {
  const [note, setNote] = useState("");
  const cast = Object.fromEntries(story.characters.map((c) => [c.id, c]));
  const seconds = story.topics.reduce((n, t) => n + t.lines.reduce((m, l) => m + spokenSeconds(l.text), 0), 0);
  const target = LENGTHS[length];
  const fits = seconds >= target.min * 0.8 && seconds <= target.max * 1.15;

  async function revise() {
    if (await onRevise(note.trim())) setNote("");
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs text-muted">Ronda {round}</p>
          <PieceTitle problem={story.problem} title={story.title} />
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

      {story.topics.map((topic, i) => (
        <section key={topic.id} className="rounded-xl border border-line bg-white p-4">
          <p className="font-mono text-xs text-muted">Tema {i + 1}</p>
          <h3 className="text-lg font-bold">{topic.title}</h3>
          <p className="mt-1 text-sm text-muted">
            <span className="font-semibold text-ink">{i === 0 ? "Arranca con: " : "Puente: "}</span>
            {topic.bridge}
          </p>
          <ol className="mt-3 space-y-2">
            {topic.lines.map((line, j) => {
              const who = cast[line.speaker];
              return (
                <li key={j} className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 text-sm">
                  <div className="space-y-1">
                    <BeatChip beat={line.beat} />
                    <p className={`text-xs font-bold ${who ? ROLE_TEXT[who.role] : "text-muted"}`}>{who?.name ?? line.speaker}</p>
                  </div>
                  <div>
                    <p className="font-medium">“{line.text}”</p>
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

      <LoopsMap story={story} />

      <ChecksPanel
        problems={problems}
        dismissed={dismissed}
        fixing={busy === "fix"}
        disabled={busy !== null}
        onFix={onFix}
        onDismiss={onDismiss}
      />

      <div className="space-y-3 rounded-xl border border-ink/20 bg-white p-4">
        <label className="block">
          <span className="text-sm font-semibold">Notas para esta ronda</span>
          <span className="block text-xs text-muted">
            Como un director: qué no funciona, qué falta, qué sobra. La IA reescribe y aparece la ronda {round + 1}.
          </span>
          <textarea
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
            ) : (
              "Aprobar → storyboard"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
