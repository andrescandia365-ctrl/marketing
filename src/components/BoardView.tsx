import { useState } from "react";
import type { Board, Story } from "../../shared/schema.ts";
import { formatTime, timeShots, totalSeconds } from "../../shared/template.ts";
import { BeatChip, Button, ROLE_TEXT, Spinner, inputClass } from "./ui.tsx";

type Props = {
  story: Story;
  board: Board;
  round: number;
  busy: boolean;
  onRevise: (note: string, shotNotes: { index: number; note: string }[]) => Promise<boolean>;
  onApprove: () => void;
};

const BAR = { negative: "bg-neg", touching: "bg-touch", good: "bg-good" };

// Step 3: the whole board at once, with a note box on every shot, before a single image is made.
export function BoardView({ story, board, round, busy, onRevise, onApprove }: Props) {
  const [note, setNote] = useState("");
  const [shotNotes, setShotNotes] = useState<Record<number, string>>({});
  const cast = Object.fromEntries(story.characters.map((c) => [c.id, c]));
  const topics = Object.fromEntries(story.topics.map((t, i) => [t.id, i + 1]));
  const setups = Object.fromEntries(board.setups.map((s) => [s.id, s]));
  const shots = timeShots(board.shots);
  const pending = Object.entries(shotNotes)
    .filter(([, v]) => v.trim())
    .map(([k, v]) => ({ index: Number(k), note: v.trim() }));

  async function revise() {
    if (await onRevise(note.trim(), pending)) {
      setNote("");
      setShotNotes({});
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-xs text-muted">Storyboard · ronda {round}</p>
          <h2 className="text-xl font-bold tracking-tight">{story.title}</h2>
          <p className="text-sm text-muted">
            {board.shots.length} tomas · {formatTime(totalSeconds(board.shots))} · estilo: {board.style}
          </p>
        </div>
      </div>

      <div className="flex h-3 overflow-hidden rounded-full">
        {shots.map((s) => (
          <div
            key={s.index}
            className={`${BAR[s.beat]} border-r border-white/70 last:border-r-0`}
            style={{ width: `${(s.seconds / totalSeconds(board.shots)) * 100}%` }}
          />
        ))}
      </div>

      <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {shots.map((s) => {
          const who = cast[s.speaker];
          const setup = setups[s.setup];
          const prevTopic = s.index > 0 ? shots[s.index - 1].topic : null;
          return (
            <li key={s.index} className="flex flex-col gap-2 rounded-xl border border-line bg-white p-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-mono text-xs text-muted">
                  {s.index + 1} · {formatTime(s.start)} · {s.seconds} s
                </span>
                <BeatChip beat={s.beat} />
                {s.topic !== prevTopic && (
                  <span className="rounded bg-ink px-1.5 py-0.5 text-xs font-semibold text-white">Tema {topics[s.topic] ?? s.topic}</span>
                )}
                {s.disclosure !== "none" && (
                  <span className="rounded border border-line px-1.5 py-0.5 text-xs">
                    {s.disclosure === "concept" ? "Concepto" : "Simulación"}
                  </span>
                )}
              </div>
              {s.voiceover && (
                <p className="text-sm">
                  <span className={`font-bold ${who ? ROLE_TEXT[who.role] : "text-muted"}`}>{who?.name ?? "—"}: </span>“{s.voiceover}”
                </p>
              )}
              {s.onScreenText && <p className="text-xs">En pantalla: <b>{s.onScreenText}</b></p>}
              <p className="text-xs text-muted">
                <span className="font-semibold text-ink">Setup {s.setup}</span>
                {setup ? ` · ${setup.name}` : ""} · {s.visualPrompt}
              </p>
              <input
                className={`${inputClass} mt-auto py-1.5 text-xs`}
                placeholder="Nota para esta toma"
                aria-label={`Nota para la toma ${s.index + 1}`}
                value={shotNotes[s.index] ?? ""}
                onChange={(e) => setShotNotes((n) => ({ ...n, [s.index]: e.target.value }))}
              />
            </li>
          );
        })}
      </ol>

      <div className="space-y-3 rounded-xl border border-ink/20 bg-white p-4">
        <label className="block">
          <span className="text-sm font-semibold">Nota para todo el storyboard</span>
          <span className="block text-xs text-muted">
            Junto con las notas de cada toma, Claude revisa el storyboard entero ({pending.length} nota
            {pending.length === 1 ? "" : "s"} de tomas).
          </span>
          <textarea
            className={`${inputClass} mt-1.5`}
            rows={2}
            value={note}
            placeholder="ej. el Malo tiene que verse igual en todas las tomas; menos tomas de producto"
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={revise} disabled={busy || (!note.trim() && pending.length === 0)}>
            {busy ? (
              <>
                <Spinner /> Revisando…
              </>
            ) : (
              "Revisar storyboard"
            )}
          </Button>
          <Button onClick={onApprove} disabled={busy}>
            Aprobar → producción
          </Button>
        </div>
      </div>
    </div>
  );
}
