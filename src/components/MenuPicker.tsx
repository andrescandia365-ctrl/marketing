import { useState } from "react";
import type { TopicIdea } from "../../shared/schema.ts";
import { Button, Field, Spinner, inputClass } from "./ui.tsx";
import { ClaudeHandoff, type Handoff } from "./ClaudeHandoff.tsx";

type Props = {
  ideas: TopicIdea[];
  questions: string[];
  max: number;
  busy: boolean;
  onWrite: (topics: TopicIdea[]) => void;
  // Without a key: the story by copy and paste with claude.ai, for the chosen topics (the button shows the sample).
  handoff?: ((topics: TopicIdea[]) => Handoff) | null;
};

const BLANK: TopicIdea = { problem: "", title: "", pain: "", bad: "", good: "", peg: "", why: "Tema propio." };

// Step 1: the menu. Pick the topic (a short) or up to four in order (an episode); add your own if none fits.
export function MenuPicker({ ideas, questions, max, busy, onWrite, handoff }: Props) {
  const [own, setOwn] = useState<TopicIdea[]>([]);
  const [draft, setDraft] = useState<TopicIdea>(BLANK);
  const [chosen, setChosen] = useState<TopicIdea[]>([]);
  const all = [...ideas, ...own];

  function toggle(idea: TopicIdea) {
    setChosen((c) =>
      c.includes(idea) ? c.filter((x) => x !== idea) : max === 1 ? [idea] : c.length < max ? [...c, idea] : c,
    );
  }

  function addOwn() {
    if (!draft.problem.trim() || !draft.pain.trim()) return;
    const idea = { ...draft };
    setOwn((o) => [...o, idea]);
    toggle(idea);
    setDraft(BLANK);
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted">
        {max === 1
          ? "Elegí un tema para el corto."
          : `Elegí hasta ${max} temas, en el orden en que van a aparecer (el número muestra el orden).`}
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        {all.map((idea) => {
          const order = chosen.indexOf(idea);
          const selected = order >= 0;
          return (
            <button
              key={idea.problem + idea.title + idea.pain}
              type="button"
              onClick={() => toggle(idea)}
              aria-pressed={selected}
              className={`rounded-xl border bg-white p-4 text-left transition ${selected ? "border-ink ring-2 ring-ink/15" : "border-line hover:border-ink"}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  {idea.problem && (
                    <p className="text-xs font-semibold tracking-wide text-muted uppercase">Problema que resuelve</p>
                  )}
                  <p className="text-base leading-snug font-bold">{idea.problem || idea.title}</p>
                  {idea.problem && idea.title && (
                    <p className="mt-0.5 text-sm leading-snug">
                      <span className="text-muted">Gancho: </span>
                      {idea.title}
                    </p>
                  )}
                </div>
                <span
                  className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold ${selected ? "bg-ink text-white" : "border border-line text-muted"}`}
                >
                  {selected ? order + 1 : ""}
                </span>
              </div>
              <dl className="mt-2 space-y-1 text-sm">
                <div>
                  <dt className="inline font-semibold">Dolor: </dt>
                  <dd className="inline text-muted">{idea.pain}</dd>
                </div>
                <div>
                  <dt className="inline font-semibold text-neg">El Malo: </dt>
                  <dd className="inline text-muted">{idea.bad}</dd>
                </div>
                <div>
                  <dt className="inline font-semibold text-good">El Bueno: </dt>
                  <dd className="inline text-muted">{idea.good}</dd>
                </div>
                <div>
                  <dt className="inline font-semibold">Arranca con: </dt>
                  <dd className="inline text-muted">{idea.peg}</dd>
                </div>
              </dl>
              <p className="mt-2 text-xs text-muted">{idea.why}</p>
            </button>
          );
        })}
      </div>

      <details className="rounded-xl border border-line bg-white p-4">
        <summary className="cursor-pointer text-sm font-semibold">Agregar un tema propio</summary>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <Field label="El problema que resuelve">
            <input
              className={inputClass}
              value={draft.problem}
              placeholder="Ej.: Armar el pedido antes del corte del proveedor"
              onChange={(e) => setDraft({ ...draft, problem: e.target.value })}
            />
          </Field>
          <Field label="Gancho (opcional; si no, lo escribe la IA)">
            <input className={inputClass} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          </Field>
          <Field label="El dolor">
            <input className={inputClass} value={draft.pain} onChange={(e) => setDraft({ ...draft, pain: e.target.value })} />
          </Field>
          <Field label="El Malo (opcional)">
            <input className={inputClass} value={draft.bad} onChange={(e) => setDraft({ ...draft, bad: e.target.value })} />
          </Field>
          <Field label="El Bueno (opcional)">
            <input className={inputClass} value={draft.good} onChange={(e) => setDraft({ ...draft, good: e.target.value })} />
          </Field>
          <div className="md:col-span-2">
            <Button variant="secondary" onClick={addOwn} disabled={!draft.problem.trim() || !draft.pain.trim()}>
              Agregar y elegir
            </Button>
          </div>
        </div>
      </details>

      {questions.length > 0 && (
        <div className="rounded-xl border border-touch/30 bg-touch-soft p-4">
          <p className="text-sm font-semibold text-touch">Para completar</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {questions.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
        <Button onClick={() => onWrite(chosen)} disabled={chosen.length === 0 || busy} variant={handoff ? "secondary" : "primary"}>
          {busy ? (
            <>
              <Spinner /> Escribiendo la historia…
            </>
          ) : handoff ? (
            "Ver un ejemplo"
          ) : (
            "Escribir la historia"
          )}
        </Button>
        <span className="text-sm text-muted">
          {chosen.length} de {max} elegido{max === 1 ? "" : "s"}
        </span>
        {handoff && (
          <ClaudeHandoff
            className="w-full"
            title="Escribir la historia"
            what="la historia"
            disabled={chosen.length === 0 || busy}
            via={handoff(chosen)}
          />
        )}
      </div>
    </div>
  );
}
