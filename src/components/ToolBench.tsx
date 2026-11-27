// "Banco de pruebas" (Modelos): what each image/video tool profile still has to prove. Each [NOT SURE] line can be
// marked after a real try: "Funcionó" turns it into [TESTED] and "No funcionó" keeps it [NOT SURE]; either way the
// finding is written into the profile (server/tools/<id>.md), so the writer reads it on the next prompt.
import { useEffect, useState } from "react";
import { api, type BenchView } from "../lib/api.ts";
import { PROMPT_TEST_STEPS } from "../../shared/shotKit.ts";
import { Button, Notice } from "./ui.tsx";

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const when = (at: string) => new Date(at).toLocaleString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function ToolBench() {
  const [view, setView] = useState<BenchView | null>(null);
  const [error, setError] = useState("");
  const [tool, setTool] = useState("");
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    api.bench().then(setView, (e) => setError(message(e)));
  }, []);

  const current = view?.tools.find((t) => t.id === tool) ?? view?.tools.find((t) => t.lines.some((l) => l.tag === "NOT SURE")) ?? view?.tools[0];
  const lines = (current?.lines ?? []).filter((l) => showAll || l.tag === "NOT SURE");

  async function mark(line: number, verdict: "worked" | "failed") {
    if (!current) return;
    setBusy(line);
    setError("");
    try {
      setView(await api.markTrial(current.id, line, verdict, notes[line] ?? ""));
      setNotes((n) => ({ ...n, [line]: "" }));
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="space-y-3 rounded-xl border border-line bg-white p-4">
      <div>
        <h3 className="font-bold">Banco de pruebas</h3>
        <p className="text-xs text-muted">
          Lo que cada herramienta todavía tiene que demostrar ([NOT SURE] en su perfil). Probalo con un clip barato (480p) y anotá lo que pasó:
          «Funcionó» lo pasa a [TESTED] y «No funcionó» lo deja en duda con tu nota. Queda escrito en el perfil y el escritor lo lee en el
          próximo prompt.
        </p>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      {view && current && (
        <>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <select className="rounded border border-line bg-white px-1.5 py-1" value={current.id} onChange={(e) => setTool(e.target.value)} aria-label="Herramienta">
              {view.tools.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} · {t.lines.filter((l) => l.tag === "NOT SURE").length} por probar
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
              Ver también lo confirmado
            </label>
          </div>
          {current.tests.length > 0 && (
            <details className="rounded-md border border-line bg-paper p-2 text-xs">
              <summary className="cursor-pointer font-semibold">Pruebas sugeridas ({current.tests.length})</summary>
              <ol className="mt-1 list-decimal space-y-0.5 pl-5">
                {current.tests.map((t) => (
                  <li key={t.n}>{t.text}</li>
                ))}
              </ol>
              <p className="mt-2 font-semibold">Para comparar dos prompts</p>
              <ul className="list-disc space-y-0.5 pl-5">
                {PROMPT_TEST_STEPS.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
              <p className="mt-1 text-muted">En cada toma, «Probar otra versión del prompt…» baja el kit con la versión B.</p>
            </details>
          )}
          {lines.length === 0 ? (
            <p className="text-xs text-muted">No queda nada por probar en este perfil.</p>
          ) : (
            <ul className="space-y-2">
              {lines.map((l) => (
                <li key={l.line} className="space-y-1 rounded-md border border-line p-2 text-xs">
                  <p>
                    <span className={`mr-1 rounded px-1 font-mono ${l.tag === "TESTED" ? "bg-good-soft text-good" : l.tag === "DOCS" ? "bg-paper text-muted" : "bg-amber-100 text-amber-900"}`}>
                      {l.tag}
                    </span>
                    {l.text}
                    {l.section && <span className="text-muted"> · {l.section}</span>}
                  </p>
                  {l.tag === "NOT SURE" && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <input
                        className="min-w-48 flex-1 rounded border border-line px-1.5 py-0.5"
                        placeholder="Qué pasó (ej.: la boca siguió la voz a 480p, 7 s)"
                        value={notes[l.line] ?? ""}
                        maxLength={300}
                        onChange={(e) => setNotes((n) => ({ ...n, [l.line]: e.target.value }))}
                        aria-label="Qué pasó en la prueba"
                      />
                      <Button variant="secondary" className="px-2 py-0.5 text-xs" disabled={busy !== null} onClick={() => void mark(l.line, "worked")}>
                        Funcionó
                      </Button>
                      <Button variant="ghost" className="px-2 py-0.5 text-xs" disabled={busy !== null} onClick={() => void mark(l.line, "failed")}>
                        No funcionó
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          {view.recent.length > 0 && (
            <div className="text-xs">
              <p className="font-semibold">Lo último que anotaste</p>
              <ul className="space-y-0.5 text-muted">
                {view.recent.slice(0, 8).map((r) => (
                  <li key={r.at}>
                    {when(r.at)} · {view.tools.find((t) => t.id === r.tool)?.name ?? r.tool} · {r.verdict === "worked" ? "funcionó" : "no funcionó"}: {r.line.slice(0, 80)}
                    {r.line.length > 80 ? "…" : ""}
                    {r.note ? ` — ${r.note}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}
