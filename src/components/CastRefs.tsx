// "Referencias de <personaje>": the extra reference images of one cast member. A part cut from its sheet (the face
// by default, or a dragged rectangle) on a canvas in the browser, or a loose view of the sheet made on its own; each
// one is saved in the series library and called with its own @ in the image tool.
import { useEffect, useRef, useState, type PointerEvent } from "react";
import type { SeriesInfo } from "../../shared/schema.ts";
import type { CastMember } from "../../shared/series.ts";
import { cropOutputSize, defaultFaceRect, memberRefCount, rectFromDrag, toImagePoint, type Rect } from "../../shared/castRefs.ts";
import { api, libraryFileUrl } from "../lib/api.ts";
import { blobToDataUrl, readImageFile } from "../lib/files.ts";
import { CopyButton } from "./ScriptView.tsx";
import { Button, Spinner, inputClass } from "./ui.tsx";

type Props = {
  seriesId: string;
  member: CastMember;
  version: number;
  // The tools' cap on reference images (server/tools/*.md), or null when no profile names one.
  maxRefs: number | null;
  toolName?: string;
  // Saves the member first when the server may not know it yet (a card not saved in "Editar serie").
  beforeUpload?: () => Promise<void>;
  onChange: (member: CastMember, series: SeriesInfo[]) => void;
};

// Which sheet the member was built from, for where its face usually sits.
const templateOf = (m: CastMember) => (m.kind === "place" ? "place" : m.views.some((v) => /títere/i.test(v.title)) ? "puppet" : "");

export function CastRefs({ seriesId, member, version, maxRefs, toolName = "la herramienta", beforeUpload, onChange }: Props) {
  const [source, setSource] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const viewInput = useRef<HTMLInputElement>(null);
  const [viewFor, setViewFor] = useState("");
  const count = memberRefCount(member);
  const full = maxRefs !== null && count >= maxRefs;

  async function save(image: Blob, label: string) {
    setBusy(true);
    setError("");
    try {
      await beforeUpload?.();
      const { member: next, series } = await api.addCastRef(seriesId, member.id, image, label);
      onChange({ ...member, refs: next.refs }, series);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function remove(ref: string) {
    setBusy(true);
    setError("");
    try {
      const { member: next, series } = await api.removeCastRef(seriesId, member.id, ref);
      onChange({ ...member, refs: next.refs }, series);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  // The library image goes through a data URL so the crop canvas is never tainted.
  async function cropFromSheet() {
    if (!member.image) return;
    setError("");
    try {
      const res = await fetch(libraryFileUrl(seriesId, member.image, version));
      if (!res.ok) throw new Error("No se pudo abrir la imagen aprobada.");
      setSource(await blobToDataUrl(await res.blob()));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="space-y-2 text-xs">
      <p className="text-muted">
        Referencias extra de <b className="text-ink">{member.name}</b>: partes de su hoja (la cara) o vistas sueltas, cada una
        con su @ en {toolName}.{maxRefs !== null && ` Lleva ${count} de ${maxRefs} imágenes de referencia.`}
      </p>
      {member.refs.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {member.refs.map((r) => (
            <li key={r.ref} className="flex items-center gap-1.5 rounded-lg border border-line bg-white p-1 pr-2">
              {r.image ? (
                <img src={libraryFileUrl(seriesId, r.image, version)} alt="" className="size-10 rounded object-cover" />
              ) : (
                <span className="grid size-10 place-items-center rounded bg-paper text-muted">—</span>
              )}
              <span>
                <b className="block font-mono text-good">@{r.ref}</b>
                <span className="text-muted">{r.label}</span>
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() => remove(r.ref)}
                className="ml-1 rounded px-1 text-muted hover:text-neg"
                aria-label={`Borrar la referencia @${r.ref}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      {!source && (
        <div className="flex flex-wrap gap-1">
          <Button
            type="button"
            variant="secondary"
            className="px-2 py-1 text-xs"
            disabled={busy || full || !member.image}
            title={member.image ? undefined : "Subí primero su hoja como imagen aprobada"}
            onClick={cropFromSheet}
          >
            Recortar de la hoja
          </Button>
          <Button type="button" variant="secondary" className="px-2 py-1 text-xs" disabled={busy || full} onClick={() => fileInput.current?.click()}>
            Recortar de otra imagen…
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              try {
                setSource(await readImageFile(file));
              } catch (err) {
                setError(err instanceof Error ? err.message : String(err));
              }
            }}
          />
        </div>
      )}
      {source && (
        <Cropper
          source={source}
          template={templateOf(member)}
          busy={busy}
          onCancel={() => setSource(null)}
          onSave={async (blob, label) => {
            if (await save(blob, label)) setSource(null);
          }}
        />
      )}
      {full && <p className="text-amber-800">Ya tiene las {maxRefs} imágenes que acepta {toolName}: borrá una para sumar otra.</p>}
      {member.views.length > 0 && (
        <details>
          <summary className="cursor-pointer font-semibold text-muted">Vistas sueltas de la hoja ({member.views.length})</summary>
          <ul className="mt-1.5 space-y-1.5">
            {member.views.map((v, i) => {
              const made = member.refs.find((r) => r.label === v.title.trim().slice(0, 60));
              return (
                <li key={i} className="rounded-md bg-paper p-2">
                  <p className="font-semibold">
                    {v.title} {made && <span className="font-mono text-good">@{made.ref}</span>}
                  </p>
                  <p className="font-mono">{v.prompt}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <CopyButton text={v.prompt} idle="Copiar" variant="secondary" />
                    <Button
                      type="button"
                      variant="secondary"
                      className="px-2 py-1 text-xs"
                      disabled={busy || full}
                      onClick={() => {
                        setViewFor(v.title);
                        viewInput.current?.click();
                      }}
                    >
                      {busy && viewFor === v.title ? <Spinner /> : made ? "Subir otra de esta vista" : "Subir esta vista"}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
          <input
            ref={viewInput}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) save(file, viewFor);
            }}
          />
        </details>
      )}
      {error && <p className="text-neg">{error}</p>}
    </div>
  );
}

// The picture with a rectangle on it: the face by default; dragging draws another one. Cut in the browser.
function Cropper({
  source,
  template,
  busy,
  onCancel,
  onSave,
}: {
  source: string;
  template: "puppet" | "place" | "";
  busy: boolean;
  onCancel: () => void;
  onSave: (image: Blob, label: string) => void;
}) {
  const img = useRef<HTMLImageElement>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const [label, setLabel] = useState(template === "place" ? "detalle" : "cara");
  const drag = useRef<{ x: number; y: number } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setNatural(null);
    setRect(null);
  }, [source]);

  function loaded() {
    const el = img.current;
    if (!el) return;
    const size = { w: el.naturalWidth, h: el.naturalHeight };
    setNatural(size);
    setRect(defaultFaceRect(size.w, size.h, template));
  }

  function point(e: PointerEvent<HTMLDivElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    return toImagePoint({ x: e.clientX - box.left, y: e.clientY - box.top }, { w: box.width, h: box.height }, natural!);
  }

  function down(e: PointerEvent<HTMLDivElement>) {
    if (!natural) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = point(e);
  }

  function move(e: PointerEvent<HTMLDivElement>) {
    if (!natural || !drag.current) return;
    const p = point(e);
    // A click (no real drag) keeps the rectangle there is.
    if (Math.abs(p.x - drag.current.x) < 4 && Math.abs(p.y - drag.current.y) < 4) return;
    setRect(rectFromDrag(drag.current, p, natural.w, natural.h));
  }

  function save() {
    const el = img.current;
    if (!el || !rect) return;
    const size = cropOutputSize(rect);
    const canvas = document.createElement("canvas");
    canvas.width = size.w;
    canvas.height = size.h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return setError("Este navegador no puede recortar imágenes.");
    ctx.drawImage(el, rect.x, rect.y, rect.w, rect.h, 0, 0, size.w, size.h);
    canvas.toBlob((blob) => (blob ? onSave(blob, label.trim() || "referencia") : setError("No se pudo recortar.")), "image/png");
  }

  const pct = (v: number, of: number) => `${(v / of) * 100}%`;
  return (
    <div className="space-y-2 rounded-lg border border-line bg-white p-2">
      <p className="text-muted">El cuadro marca la cara; arrastrá sobre la imagen para marcar otra parte.</p>
      <div
        className="relative cursor-crosshair touch-none overflow-hidden select-none"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
      >
        <img ref={img} src={source} alt="" onLoad={loaded} draggable={false} className="block w-full rounded" />
        {natural && rect && (
          <div
            className="pointer-events-none absolute border-2 border-good shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]"
            style={{ left: pct(rect.x, natural.w), top: pct(rect.y, natural.h), width: pct(rect.w, natural.w), height: pct(rect.h, natural.h) }}
          />
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <label className="flex items-center gap-1">
          Qué es
          <input className={`${inputClass} w-32 py-1 text-xs`} value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} />
        </label>
        {rect && (
          <span className="text-muted">
            {rect.w}×{rect.h} px
          </span>
        )}
        <Button type="button" className="px-2 py-1 text-xs" disabled={busy || !rect} onClick={save}>
          {busy ? <Spinner /> : "Guardar como referencia"}
        </Button>
        <button type="button" onClick={onCancel} className="rounded px-2 py-1 font-semibold text-muted hover:text-ink">
          Cancelar
        </button>
      </div>
      {error && <p className="text-neg">{error}</p>}
    </div>
  );
}
