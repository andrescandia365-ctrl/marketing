// "Lo generé afuera": under a clip slot, the person notes that they made it by hand on a website (Replicate, APIMart),
// with which model and resolution. The server prices it with server/media/modelos-web.md and adds it to the spend log,
// and the slot lists what was made for it. One request per project feeds every slot on the page.
import { useEffect, useState, useSyncExternalStore } from "react";
import { costText } from "../../shared/mediaModels.ts";
import { webCost, webModelId, webModelText, type WebModel } from "../../shared/webModels.ts";
import { api, type WebSpend } from "../lib/api.ts";

const PICK_KEY = "lo-genere-afuera-modelo";

// The entries of each project, shared by its slots.
const store = new Map<string, WebSpend[]>();
const loading = new Set<string>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
function setEntries(project: string, entries: WebSpend[]) {
  store.set(project, entries);
  emit();
}
function load(project: string) {
  if (store.has(project) || loading.has(project)) return;
  loading.add(project);
  api
    .webSpend(project)
    .then((r) => setEntries(project, r.entries))
    .catch(() => setEntries(project, []))
    .finally(() => loading.delete(project));
}
function useEntries(project: string): WebSpend[] {
  useEffect(() => load(project), [project]);
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => store.get(project) ?? EMPTY,
  );
}
const EMPTY: WebSpend[] = [];

function readPick(): string {
  try {
    return localStorage.getItem(PICK_KEY) ?? "";
  } catch {
    return "";
  }
}

const when = (at: string) => new Date(at).toLocaleString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

type Props = {
  models: WebModel[] | undefined;
  kind?: "video" | "imagen";
  seconds: number;
  // A story's project id, or "ads:<series>" for Publicidad.
  project: string | null | undefined;
  // Which slot: "toma-03", "H12-c2"…
  slot: string;
};

export function MadeOutside({ models, kind = "video", seconds, project, slot }: Props) {
  const list = (models ?? []).filter((m) => m.kind === kind);
  const entries = useEntries(project ?? "").filter((e) => e.slot === slot);
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState(readPick);
  const [length, setLength] = useState(seconds);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => setLength(seconds), [seconds]);
  if (!project || !list.length) return null;
  const model = list.find((m) => webModelId(m) === pick) ?? list[0];
  const cost = webCost(model, length);

  async function note() {
    setBusy(true);
    setError("");
    try {
      const r = await api.noteWebSpend({ model: webModelId(model), seconds: length, project: project!, slot });
      setEntries(project!, r.entries);
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo anotar.");
    } finally {
      setBusy(false);
    }
  }
  async function remove(at: string) {
    try {
      setEntries(project!, (await api.removeWebSpend(at, slot, project!)).entries);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo borrar la nota.");
    }
  }

  return (
    <div className="space-y-1 text-xs">
      {entries.length > 0 && (
        <ul className="space-y-0.5">
          {entries.map((e) => (
            <li key={e.at} className="flex flex-wrap items-center gap-1 text-muted">
              <span className="text-good">✓</span>
              Generado en {webModelText({ site: e.provider as WebModel["site"], label: e.label ?? e.model, resolution: e.resolution ?? "" })}
              {e.seconds ? ` · ${e.seconds} s` : ""} · ≈ {costText(e.usd)} · {when(e.at)}
              <button type="button" className="underline hover:text-neg" onClick={() => void remove(e.at)} aria-label="Borrar esta nota">
                borrar
              </button>
            </li>
          ))}
        </ul>
      )}
      {!open ? (
        <button type="button" className="font-semibold text-muted underline hover:text-ink" onClick={() => setOpen(true)}>
          Lo generé afuera…
        </button>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-line bg-paper p-1.5">
          <select
            className="rounded border border-line bg-white px-1 py-0.5"
            value={webModelId(model)}
            onChange={(e) => {
              setPick(e.target.value);
              try {
                localStorage.setItem(PICK_KEY, e.target.value);
              } catch {
                /* private window */
              }
            }}
            aria-label="Dónde y con qué modelo"
          >
            {list.map((m) => (
              <option key={webModelId(m)} value={webModelId(m)}>
                {webModelText(m)} · {costText(m.price)}
                {m.unit === "segundo" ? "/s" : ""}
              </option>
            ))}
          </select>
          {model.unit === "segundo" && (
            <label className="flex items-center gap-1">
              <input
                type="number"
                min={1}
                max={60}
                value={length}
                onChange={(e) => setLength(Math.max(1, Math.min(60, Number(e.target.value) || 1)))}
                className="w-12 rounded border border-line bg-white px-1 py-0.5 font-mono"
                aria-label="Segundos generados"
              />
              s
            </label>
          )}
          <button type="button" disabled={busy} onClick={() => void note()} className="rounded bg-ink px-2 py-0.5 font-semibold text-white disabled:opacity-50">
            Anotar (≈ {costText(cost)})
          </button>
          <button type="button" className="text-muted underline" onClick={() => setOpen(false)}>
            cancelar
          </button>
          <span className="basis-full text-muted">Es la estimación con la tabla de precios; la factura del sitio manda. Anotá cada intento, también los que descartaste.</span>
        </div>
      )}
      {error && <p className="text-neg">{error}</p>}
    </div>
  );
}
