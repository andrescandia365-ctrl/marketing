// "Elementos del gancho": the striking thing in the first 1–2 seconds. The English `what` stays visible
// outside any collapsed details, so the storyboard and the ad card show it before the prompts open.
import { useState, type FormEvent } from "react";
import {
  PLACEMENT_LABEL,
  PLACEMENTS,
  repeatedElements,
  type HookElement,
  type HookPlacement,
} from "../../shared/hookElements.ts";
import { askPrompt, asks, sendAsk } from "../lib/api.ts";
import { ClaudeHandoff } from "./ClaudeHandoff.tsx";
import { Button, Field, inputClass } from "./ui.tsx";

type Draft = { what: string; label: string; why: string; tie: string; placement: HookPlacement };

const empty = (): Draft => ({ what: "", label: "", why: "", tie: "", placement: "center" });

type Props = {
  elements: HookElement[];
  onChange: (next: HookElement[]) => void;
  seriesId: string;
  pain: string;
  library: HookElement[];
  noKey: boolean;
  onLibrary?: (element: HookElement) => void | Promise<void | HookElement[]>;
  missing?: string[];
  onUndo?: () => void;
  canUndo?: boolean;
  previous?: string[];
  onVariant?: () => void;
};

export function HookElementsPanel({
  elements,
  onChange,
  seriesId,
  pain,
  library,
  noKey,
  onLibrary,
  missing = [],
  onUndo,
  canUndo = false,
  previous = [],
  onVariant,
}: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(empty);
  const [busy, setBusy] = useState(false);
  const [lib, setLib] = useState<HookElement[] | null>(null);
  const [localUndo, setLocalUndo] = useState<HookElement[] | null>(null);
  const shownLib = lib ?? library;
  const repeats = repeatedElements(previous, elements);

  function remember(before: HookElement[]) {
    if (!onUndo) setLocalUndo(before);
  }

  function apply(next: HookElement[]) {
    remember(elements);
    onChange(next.slice(0, 3));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const what = draft.what.trim();
    const label = draft.label.trim();
    if (!what || !label) return;
    const id = editing && editing !== "new" ? editing : `he-${Date.now().toString(36)}`.slice(0, 40);
    const nextEl: HookElement = { id, what, label, why: draft.why.trim(), tie: draft.tie.trim(), placement: draft.placement };
    const next = editing && editing !== "new" ? elements.map((e) => (e.id === id ? { ...e, ...nextEl } : e)) : [...elements, nextEl];
    apply(next);
    setEditing(null);
    setDraft(empty());
  }

  async function askOthers() {
    setBusy(true);
    try {
      const body = { series: seriesId, pain, existing: elements, avoid: previous };
      const res = await sendAsk(asks.hookElements(body));
      apply(res.elements ?? []);
    } finally {
      setBusy(false);
    }
  }

  function pick(el: HookElement) {
    if (elements.length >= 3) return;
    if (elements.some((e) => e.id === el.id || (e.what === el.what && e.label === el.label))) return;
    apply([...elements, { ...el }]);
  }

  async function saveToLibrary(el: HookElement) {
    if (!onLibrary) return;
    const back = await onLibrary(el);
    if (Array.isArray(back)) setLib(back);
  }

  function undo() {
    if (onUndo) {
      onUndo();
      return;
    }
    if (!localUndo) return;
    onChange(localUndo);
    setLocalUndo(null);
  }

  const undoReady = onUndo ? canUndo : localUndo !== null;
  const askBody = { series: seriesId, pain, existing: elements, avoid: previous };

  return (
    <section aria-label="Elementos del gancho" className="space-y-3 rounded-xl border border-line bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold">Elementos del gancho</h3>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" disabled={elements.length >= 3} onClick={() => { setEditing("new"); setDraft(empty()); }}>
            + Agregar elemento
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => void askOthers()}>
            {busy ? "Pidiendo…" : "Pedir otros elementos"}
          </Button>
          {undoReady && (
            <Button variant="ghost" onClick={undo}>
              Deshacer
            </Button>
          )}
          {onVariant && (
            <Button variant="ghost" onClick={onVariant}>
              Otra variante de elementos
            </Button>
          )}
        </div>
      </div>
      {noKey && (
        <ClaudeHandoff
          via={{
            prompt: () => askPrompt(asks.hookElements(askBody)),
            paste: async (reply) => {
              const res = await sendAsk(asks.hookElements(askBody), reply);
              apply(res.elements ?? []);
              return res;
            },
          }}
          what="los elementos del gancho"
        />
      )}
      {missing.length > 0 && <p className="text-xs text-neg">Faltó en el prompt: {missing.join(", ")}</p>}
      {repeats.length > 0 && (
        <p className="text-xs text-neg">La pieza anterior ya usó: {repeats.map((e) => e.label).join(", ")}.</p>
      )}
      <ul className="space-y-2">
        {elements.map((el) => (
          <li key={el.id} className="rounded-lg border border-line px-3 py-2 text-sm">
            <p className="font-semibold">{el.label}</p>
            <p>{el.what}</p>
            <p className="text-xs text-muted">
              {PLACEMENT_LABEL[el.placement]}
              {el.tie ? ` · ${el.tie}` : ""}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setEditing(el.id);
                  setDraft({ what: el.what, label: el.label, why: el.why, tie: el.tie, placement: el.placement });
                }}
              >
                Editar
              </Button>
              <Button variant="ghost" onClick={() => apply(elements.filter((e) => e.id !== el.id))}>
                Borrar
              </Button>
              {onLibrary && (
                <Button variant="ghost" onClick={() => void saveToLibrary(el)}>
                  Guardar en la biblioteca
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {editing && (
        <form className="space-y-2" onSubmit={submit}>
          <Field label="Qué se ve, en inglés">
            <input className={inputClass} value={draft.what} onChange={(e) => setDraft({ ...draft, what: e.target.value })} />
          </Field>
          <Field label="Nombre corto">
            <input className={inputClass} value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
          </Field>
          <Field label="Por qué frena">
            <input className={inputClass} value={draft.why} onChange={(e) => setDraft({ ...draft, why: e.target.value })} />
          </Field>
          <Field label="Cómo se ata al dolor">
            <input className={inputClass} value={draft.tie} onChange={(e) => setDraft({ ...draft, tie: e.target.value })} />
          </Field>
          <Field label="Dónde">
            <select className={inputClass} value={draft.placement} onChange={(e) => setDraft({ ...draft, placement: e.target.value as HookPlacement })}>
              {PLACEMENTS.map((p) => (
                <option key={p} value={p}>
                  {PLACEMENT_LABEL[p]}
                </option>
              ))}
            </select>
          </Field>
          <Button type="submit" disabled={editing === "new" && elements.length >= 3}>
            Agregar
          </Button>
        </form>
      )}
      {shownLib.length > 0 && (
        <div>
          <p className="text-sm font-semibold">Elementos de la serie</p>
          <ul className="mt-1 space-y-1">
            {shownLib.map((el) => (
              <li key={el.id}>
                <button type="button" className="text-left text-sm text-ink underline disabled:text-muted" disabled={elements.length >= 3 || elements.some((e) => e.id === el.id || e.what === el.what)} onClick={() => pick(el)}>
                  {el.label}
                  <span className="ml-2 text-xs text-muted">{el.what}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
