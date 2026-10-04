// "Narración de ElevenLabs": copy the lines to paste into ElevenLabs (or any voice tool), then bring the whole
// narration back as one file; the app cuts it into one part per line and puts each in its shot or scene.
// Only voices the person may use: ElevenLabs' library voices under their licence, or the person's own voice.
import { useEffect, useMemo, useState } from "react";
import { narrationText, splitNarration, type NarrationLine, type NarrationPart } from "../lib/narration.ts";
import { CopyButton } from "./ScriptView.tsx";
import { Button, Spinner, inputClass } from "./ui.tsx";

export function NarrationImport({
  lines,
  narratorKeys,
  language,
  autoSync,
  room,
  onParts,
}: {
  lines: NarrationLine[];
  // The lines the narrator says (empty: there is no narrator character).
  narratorKeys: string[];
  language: "es" | "en";
  autoSync: boolean;
  // How long each place lasts, by key, to say when a part does not fit.
  room: Record<string, number>;
  onParts: (parts: NarrationPart[]) => Promise<void>;
}) {
  const [who, setWho] = useState<"narrator" | "all">(narratorKeys.length ? "narrator" : "all");
  const [emotions, setEmotions] = useState(false);
  const [busy, setBusy] = useState<null | "split" | "apply">(null);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ parts: NarrationPart[]; how: "words" | "pauses"; urls: string[] } | null>(null);
  const [done, setDone] = useState(false);
  const chosen = useMemo(() => (who === "narrator" ? lines.filter((l) => narratorKeys.includes(l.key)) : lines), [who, lines, narratorKeys]);
  const label = Object.fromEntries(lines.map((l) => [l.key, l]));

  useEffect(() => () => result?.urls.forEach((u) => URL.revokeObjectURL(u)), [result]);

  async function split(file: File) {
    setBusy("split");
    setError("");
    setDone(false);
    try {
      const { parts, how } = await splitNarration(file, file.name, chosen, language, autoSync);
      setResult({ parts, how, urls: parts.map((p) => URL.createObjectURL(p.blob)) });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function apply() {
    if (!result) return;
    setBusy("apply");
    setError("");
    try {
      await onParts(result.parts);
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  if (!lines.length) return null;
  const script = narrationText(chosen, emotions, who === "all");
  return (
    <details className="rounded-lg border border-line bg-white p-3 text-sm">
      <summary className="cursor-pointer font-semibold">Narración de ElevenLabs (u otra voz)</summary>
      <div className="mt-2 space-y-3">
        <p className="text-xs text-muted">
          1. Copiá las líneas y pegalas en ElevenLabs. 2. Generá todo de una vez y bajá el audio. 3. Subilo acá: la app lo
          corta por línea y pone cada parte en su lugar. Solo voces con licencia (las de la biblioteca de ElevenLabs) o la
          tuya; nunca la voz clonada de una persona real sin su permiso.
        </p>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          {narratorKeys.length > 0 && (
            <label className="flex items-center gap-1">
              <span className="font-semibold">Quién</span>
              <select className="rounded border border-line px-1 py-0.5" value={who} onChange={(e) => setWho(e.target.value as "narrator" | "all")} aria-label="Qué líneas">
                <option value="narrator">Solo el narrador ({narratorKeys.length})</option>
                <option value="all">Todas las líneas ({lines.length})</option>
              </select>
            </label>
          )}
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={emotions} onChange={(e) => setEmotions(e.target.checked)} />
            Con la emoción entre corchetes
          </label>
        </div>
        <textarea className={`${inputClass} font-mono text-xs`} rows={Math.min(10, chosen.length * 2 + 1)} readOnly value={script} aria-label="Guion para ElevenLabs" />
        <div className="flex flex-wrap items-center gap-2">
          <CopyButton text={script} idle="Copiar el guion" variant="secondary" />
          <span className="text-xs text-muted">Un renglón vacío entre líneas deja una pausa clara, y ayuda a cortar.</span>
        </div>
        <label className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-semibold">Subir la narración entera</span>
          <input
            type="file"
            accept="audio/*"
            disabled={busy !== null}
            aria-label="Narración entera"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void split(file);
            }}
          />
          {busy === "split" && <Spinner />}
        </label>
        {!autoSync && (
          <p className="text-xs text-muted">Sin OPENAI_API_KEY la app corta en las pausas; con la clave, encuentra cada línea por sus palabras.</p>
        )}
        {error && <p className="text-xs text-neg">{error}</p>}
        {result && (
          <div className="space-y-1.5">
            <p className="text-xs text-muted">
              {result.parts.length} partes, {result.how === "words" ? "cortadas por las palabras" : "cortadas en las pausas"}. Escuchalas antes de ponerlas.
            </p>
            <ol className="space-y-1">
              {result.parts.map((p, i) => {
                const line = label[p.key];
                const max = room[p.key];
                const long = max !== undefined && p.duration > max - 0.2;
                return (
                  <li key={p.key} className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="w-16 shrink-0 font-semibold">{line?.label}</span>
                    <audio controls src={result.urls[i]} className="h-7" aria-label={`Parte ${i + 1}`} />
                    <span className="font-mono">{p.duration.toFixed(1)} s</span>
                    <span className="min-w-0 flex-1 truncate text-muted">“{line?.text}”</span>
                    {!p.sure && <span className="text-amber-700">revisá el corte</span>}
                    {long && <span className="text-neg">no entra en {max} s</span>}
                  </li>
                );
              })}
            </ol>
            <Button className="px-3 py-1 text-xs" disabled={busy !== null || done} onClick={apply}>
              {busy === "apply" ? <Spinner /> : null} {done ? "Partes puestas" : "Poner cada parte en su lugar"}
            </Button>
          </div>
        )}
      </div>
    </details>
  );
}
