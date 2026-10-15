// "Escena de código": the scene's animation is JavaScript written by Opus in claude.ai. The person picks the pictures
// it may use, copies the prompt (the contract, the scene, the brand, the motion vocabulary and the house rules), pastes
// the reply back, and the app tests it in its sandbox at the scene's sample times before saving it with the scene.
// With an AI key, "Que la IA escriba la animación" sends the same prompt to the writer.
import { useEffect, useState } from "react";
import { stripFences, type CodeProblem, type SceneCode } from "../../shared/codeScene.ts";
import { Button, Spinner, inputClass } from "./ui.tsx";

export type CodeTools = {
  // The prompt for this scene, with these pictures and the person's note.
  prompt: (sceneId: string, assets: string[], note: string) => string;
  // Tests the code in a fresh sandbox and saves it with the scene when nothing fatal came up.
  testAndSave: (sceneId: string, source: string, assets: string[]) => Promise<{ problems: CodeProblem[]; saved: boolean; texts: number; slowest: number }>;
  // With a key: the writer answers the same prompt. Null: no key (copy and paste only).
  ai: ((prompt: string) => Promise<string>) | null;
};

type Props = {
  sceneId: string;
  code: SceneCode | undefined;
  options: { value: string; label: string }[];
  tools: CodeTools;
};

export function CodeScenePanel({ sceneId, code, options, tools }: Props) {
  const [assets, setAssets] = useState<string[]>(code?.assets ?? []);
  const [note, setNote] = useState("");
  const [draft, setDraft] = useState(code?.source ?? "");
  const [problems, setProblems] = useState<CodeProblem[]>([]);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState<"" | "test" | "ai">("");
  const [shown, setShown] = useState<string | null>(null);
  // A code saved from elsewhere (undo, another tab of the studio) shows up in the box.
  useEffect(() => {
    setDraft(code?.source ?? "");
    setAssets(code?.assets ?? []);
  }, [code?.source, code?.assets]);

  const prompt = () => tools.prompt(sceneId, assets, note);

  async function copy() {
    const text = prompt();
    try {
      await navigator.clipboard.writeText(text);
      setStatus("Prompt copiado. Pegalo en claude.ai (Opus) y traé acá el bloque de código que te devuelva.");
      setShown(null);
    } catch {
      // Without clipboard access the prompt shows below to copy by hand.
      setShown(text);
      setStatus("No pude copiar solo: seleccioná el texto de abajo y copialo.");
    }
  }

  async function test(source: string) {
    const clean = stripFences(source);
    setDraft(clean);
    setBusy("test");
    setStatus("Probando la animación en su caja…");
    setProblems([]);
    try {
      const r = await tools.testAndSave(sceneId, clean, assets);
      setProblems(r.problems);
      setStatus(
        r.saved
          ? `Guardada con la escena. Dibuja ${r.texts} texto${r.texts === 1 ? "" : "s"}; el cuadro más lento tardó ${Math.round(r.slowest)} ms.${r.problems.length ? " Mirá los avisos." : ""}`
          : "No se guardó: arreglá lo de abajo (o pegale el error a Opus) y probá de nuevo.",
      );
    } finally {
      setBusy("");
    }
  }

  async function ask() {
    if (!tools.ai) return;
    setBusy("ai");
    setStatus("La IA está escribiendo la animación…");
    try {
      const reply = await tools.ai(prompt());
      setBusy("");
      await test(reply);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }

  const fatal = problems.filter((p) => p.fatal);
  return (
    <div className="mt-2 space-y-2 rounded-lg border border-line bg-paper p-2 text-xs sm:col-span-2">
      <p className="text-muted">
        La animación de esta escena es código. Copiá el prompt, pegalo en claude.ai (Opus) y pegá acá el código que te devuelve. La app lo prueba en una caja aislada
        (sin internet ni acceso a la app) y lo guarda con la escena. El subtítulo y el aviso de IA los pone la app encima.
      </p>
      {options.length > 0 && (
        <fieldset className="space-y-1">
          <legend className="font-semibold">Imágenes que puede usar</legend>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {options.map((o) => (
              <label key={o.value} className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={assets.includes(o.value)}
                  onChange={(e) => setAssets((a) => (e.target.checked ? [...a, o.value] : a.filter((x) => x !== o.value)))}
                />
                {o.label}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <input className={`${inputClass} py-1 text-xs`} value={note} placeholder="Qué querés que haga la animación (opcional)" aria-label="Qué querés que haga" onChange={(e) => setNote(e.target.value)} />
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" className="px-2 py-1 text-xs" onClick={copy}>
          Copiar el prompt para Opus
        </Button>
        <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => setShown((s) => (s === null ? prompt() : null))}>
          {shown === null ? "Ver el prompt" : "Ocultar el prompt"}
        </Button>
        {tools.ai && (
          <Button variant="secondary" className="px-2 py-1 text-xs" disabled={busy !== ""} onClick={ask}>
            {busy === "ai" ? <Spinner /> : null} Que la IA escriba la animación
          </Button>
        )}
      </div>
      {shown !== null && <textarea className={`${inputClass} font-mono text-[11px]`} rows={8} readOnly value={shown} aria-label="Prompt para Opus" onFocus={(e) => e.target.select()} />}
      <textarea
        className={`${inputClass} font-mono text-[11px]`}
        rows={8}
        value={draft}
        spellCheck={false}
        placeholder="Pegá acá el código (la respuesta entera de Opus sirve: la app saca el bloque de código)"
        aria-label="Pegá acá el código"
        onChange={(e) => setDraft(e.target.value)}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button className="px-2 py-1 text-xs" disabled={busy !== "" || !draft.trim()} onClick={() => test(draft)}>
          {busy === "test" ? <Spinner /> : null} Probar y guardar
        </Button>
        {code?.source && draft.trim() !== code.source.trim() && <span className="text-muted">Hay cambios sin probar.</span>}
      </div>
      {status && <p className={fatal.length ? "text-neg" : "text-muted"}>{status}</p>}
      {problems.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-4">
          {problems.map((p, i) => (
            <li key={i} className={p.fatal ? "text-neg" : "text-muted"}>
              {p.message}
            </li>
          ))}
        </ul>
      )}
      {fatal.length > 0 && <p className="text-muted">Podés pegarle estos errores a Opus tal cual: «Me dio este error: …». Te devuelve el código arreglado.</p>}
    </div>
  );
}
