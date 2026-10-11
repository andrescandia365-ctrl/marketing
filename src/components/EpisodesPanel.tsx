// "Episodios estudiados" (PLAYBOOK.md §2.6 from the app): paste an episode summary, the writer puts it into the EP-NN
// template, the person edits it and says ok, and only then it is added to PLAYBOOK.md. The episodes stay in the
// research file: the playbook the writer reads (server/playbook.md) never gets their names, quotes or politics.
// Moves that repeat in 3+ episodes are shown as a proposal for §2.5; the app never folds them in itself.
import { useEffect, useState } from "react";
import { episodeTemplate } from "../../shared/episodes.ts";
import { api, type EpisodesView } from "../lib/api.ts";
import { Button, Notice, Spinner, inputClass } from "./ui.tsx";

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const ep = (n: number) => `EP-${String(n).padStart(2, "0")}`;

const RECORD_TEXT = {
  recorded: "El registro del playbook (scripts/playbook.snapshot.md) quedó al día.",
  patched: "En el registro del playbook se anotó solo el episodio: había otro cambio sin pasar a server/playbook.md y sigue avisando.",
  left: "El registro del playbook no se tocó: §2.6 ya tenía cambios a mano sin anotar. Corré npm run playbook para verlos.",
} as const;

export function EpisodesPanel({ onClose, onModels }: { onClose: () => void; onModels: () => void }) {
  const [view, setView] = useState<(EpisodesView & { demo: boolean }) | null>(null);
  const [summary, setSummary] = useState("");
  const [entry, setEntry] = useState("");
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  useEffect(() => {
    api.episodes().then(setView).catch((e) => setError(message(e)));
  }, []);

  async function draft() {
    setError("");
    setDone("");
    setBusy("draft");
    try {
      const r = await api.draftEpisode(summary);
      setEntry(r.entry);
      setOk(false);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy("");
    }
  }

  async function add() {
    setError("");
    setBusy("add");
    try {
      const r = await api.addEpisode(entry);
      setView((old) => ({ ...r.view, demo: old?.demo ?? false }));
      setDone(`Listo: ${ep(r.n)} quedó al final de §2.6 en PLAYBOOK.md. server/playbook.md no cambia: los episodios no van a la IA. ${RECORD_TEXT[r.record]}`);
      setEntry("");
      setSummary("");
      setOk(false);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy("");
    }
  }

  const repeated = view?.moves.filter((m) => m.episodes.length >= view.repeatMin) ?? [];
  const others = view?.moves.filter((m) => m.episodes.length < view.repeatMin) ?? [];

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <aside
        role="dialog"
        aria-label="Episodios estudiados"
        className="h-full w-full max-w-2xl space-y-5 overflow-y-auto bg-paper p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">Episodios estudiados</h2>
          <Button variant="ghost" className="px-2 py-1 text-xs" onClick={onClose}>
            Cerrar
          </Button>
        </div>
        <p className="text-sm text-muted">
          El registro de episodios del playbook (§2.6). Pegás el resumen de un episodio, la IA lo pasa a la plantilla (fuente, duración, tabla de temas
          con sus callbacks, observaciones, traducción a marketing y qué chequear en el video), vos lo revisás y, con tu ok, se suma a PLAYBOOK.md. Es
          material de estudio: lo que sirve es la estructura, nunca los nombres, las frases ni la política.
        </p>
        {error && <Notice tone="error">{error}</Notice>}
        {done && <Notice>{done}</Notice>}
        {!view ? (
          !error && (
            <p className="text-sm text-muted">
              <Spinner /> Cargando…
            </p>
          )
        ) : (
          <>
            {view.drift && (
              <Notice tone="warn">
                Los dos playbooks no están al día entre sí (npm run playbook). Igual podés sumar un episodio; ese aviso sigue hasta que alguien los ponga
                al día.
              </Notice>
            )}

            <section className="space-y-2">
              <h3 className="font-semibold">Ya anotados</h3>
              {view.episodes.length === 0 ? (
                <p className="text-sm text-muted">Todavía no hay episodios.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {view.episodes.map((e) => (
                    <li key={e.n}>
                      <b>{ep(e.n)}</b> — {e.title}
                      {e.moves.length > 0 && <span className="text-muted"> · {e.moves.join(" · ")}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="space-y-2">
              <h3 className="font-semibold">Jugadas que se repiten</h3>
              {repeated.length === 0 ? (
                <p className="text-sm text-muted">
                  Ninguna jugada aparece todavía en {view.repeatMin} episodios o más. Con un solo episodio no hay patrón.
                </p>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {repeated.map((m) => (
                    <li key={m.name} className={m.propose ? "rounded-lg border border-line bg-white p-2" : ""}>
                      <b>{m.name}</b> en {m.episodes.length} episodios ({m.episodes.map(ep).join(", ")}).{" "}
                      {m.propose
                        ? "Propuesta: sumarla a las jugadas de §2.5. La app no la agrega sola; si te sirve, pasala a mano a PLAYBOOK.md y a server/playbook.md."
                        : "Ya está en §2.5: estos episodios la confirman."}
                    </li>
                  ))}
                </ul>
              )}
              {others.length > 0 && (
                <p className="text-xs text-muted">
                  Menos de {view.repeatMin}: {others.map((m) => `${m.name} (${m.episodes.length})`).join(" · ")}
                </p>
              )}
            </section>

            <section className="space-y-2">
              <h3 className="font-semibold">Nuevo episodio: {ep(view.next)}</h3>
              <textarea
                className={`${inputClass} min-h-32`}
                placeholder="Pegá el resumen: título, link o fecha si los tenés, y cada tema con sus tiempos, cómo arranca, los momentos clave y los callbacks."
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
              />
              {view.demo && (
                <Notice tone="warn">
                  <b>Modo de muestra.</b> Pasar un resumen a la plantilla necesita una IA conectada: cargá una clave en{" "}
                  <button type="button" className="font-semibold underline" onClick={onModels}>
                    Modelos
                  </button>
                  . Mientras, podés escribir la ficha a mano.
                </Notice>
              )}
              <div className="flex flex-wrap gap-2">
                <Button disabled={view.demo || !summary.trim() || busy !== ""} onClick={draft}>
                  {busy === "draft" && <Spinner />} Pasar a la plantilla
                </Button>
                <Button variant="secondary" disabled={busy !== ""} onClick={() => (setEntry(episodeTemplate(view.next)), setOk(false))}>
                  Escribirla a mano
                </Button>
              </div>
            </section>

            {entry && (
              <section className="space-y-2">
                <h3 className="font-semibold">Revisala antes de sumarla</h3>
                <p className="text-xs text-muted">
                  Es Markdown, como el resto del playbook. Todo lo que dice sale del resumen y no está chequeado contra el video ([EP]). Corregí lo que
                  haga falta; la línea <b>Moves</b> es la que se cuenta para las jugadas que se repiten. El número se pone al guardar.
                </p>
                <textarea
                  className={`${inputClass} min-h-80 font-mono text-xs`}
                  value={entry}
                  onChange={(e) => (setEntry(e.target.value), setOk(false))}
                  spellCheck={false}
                />
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} />
                  La revisé y está bien (ok)
                </label>
                <div className="flex flex-wrap gap-2">
                  <Button disabled={!ok || busy !== ""} onClick={add}>
                    {busy === "add" && <Spinner />} Sumar a PLAYBOOK.md como {ep(view.next)}
                  </Button>
                  <Button variant="ghost" disabled={busy !== ""} onClick={() => (setEntry(""), setOk(false))}>
                    Descartar
                  </Button>
                </div>
              </section>
            )}
          </>
        )}
      </aside>
    </div>
  );
}
