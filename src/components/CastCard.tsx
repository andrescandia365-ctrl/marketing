// One member of a series' fixed cast in Editar serie: image, 3D-look puppet layers, rig and extra references.
import { useEffect, useRef, useState } from "react";
import type { SeriesInfo } from "../../shared/schema.ts";
import {
  CAST_KIND_LABEL,
  PUPPET_ROLES,
  PUPPET_ROLE_LABEL,
  guessClip,
  RIG_MOVES,
  RIG_MOVE_LABEL,
  type PuppetRole,
  type RigMove,
  castRef,
  type CastMember,
} from "../../shared/series.ts";
import { PuppetArranger } from "./PuppetArranger.tsx";
import { PuppetPreview } from "./PuppetPreview.tsx";
import { CastRefs } from "./CastRefs.tsx";
import { CopyButton } from "./ScriptView.tsx";
import { api, libraryFileUrl } from "../lib/api.ts";
import { ScreenVideoBox } from "./ScreenVideoBox.tsx";
// three.js (in actor.ts) loads only when a character has a rig to preview.
const loadActor: typeof import("../lib/actor.ts").loadActor = (...args) => import("../lib/actor.ts").then((m) => m.loadActor(...args));
import { canvasPng, findFullFigures, revokeFigures, splitFigure, type FigureFile } from "../lib/segmentAssemble.ts";
import { Button, Spinner, inputClass } from "./ui.tsx";

// The file dialog's click can land on the page when it closes (Cancelar, and Editar serie se va).
// The shield stays down until the window loses focus, so it never cancels the click that opens the dialog.
function openFilePicker(input: HTMLInputElement | null) {
  if (!input) return;
  let swallow = false;
  let safety = 0;
  const stop = (e: Event) => {
    if (!swallow) return;
    e.preventDefault();
    e.stopPropagation();
  };
  const disarm = () => {
    window.clearTimeout(safety);
    document.removeEventListener("click", stop, true);
    document.removeEventListener("mouseup", stop, true);
    window.removeEventListener("blur", onBlur);
    window.removeEventListener("focus", onFocus);
  };
  const onBlur = () => {
    swallow = true;
  };
  const onFocus = () => {
    swallow = true;
    window.setTimeout(disarm, 400);
  };
  document.addEventListener("click", stop, true);
  document.addEventListener("mouseup", stop, true);
  window.addEventListener("blur", onBlur);
  window.addEventListener("focus", onFocus);
  safety = window.setTimeout(disarm, 180_000);
  input.click();
}

// The head lives at the top of a full-length canvas, so a plain thumbnail looks empty. Fit the opaque part.
function LayerThumb({ url }: { url: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let alive = true;
    const img = new Image();
    img.onload = () => {
      const canvas = ref.current;
      if (!alive || !canvas) return;
      const probe = document.createElement("canvas");
      const down = Math.min(1, 160 / Math.max(img.naturalWidth, img.naturalHeight));
      probe.width = Math.max(1, Math.round(img.naturalWidth * down));
      probe.height = Math.max(1, Math.round(img.naturalHeight * down));
      const read = probe.getContext("2d", { willReadFrequently: true });
      const ctx = canvas.getContext("2d");
      if (!read || !ctx) return;
      read.drawImage(img, 0, 0, probe.width, probe.height);
      const data = read.getImageData(0, 0, probe.width, probe.height).data;
      let x0 = probe.width;
      let y0 = probe.height;
      let x1 = -1;
      let y1 = -1;
      for (let y = 0; y < probe.height; y++) {
        for (let x = 0; x < probe.width; x++) {
          if (data[(y * probe.width + x) * 4 + 3] > 24) {
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            if (y > y1) y1 = y;
          }
        }
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (x1 < 0) return;
      const sx = x0 / down;
      const sy = y0 / down;
      const sw = (x1 - x0 + 1) / down;
      const sh = (y1 - y0 + 1) / down;
      const fit = Math.min(canvas.width / sw, canvas.height / sh);
      const dw = sw * fit;
      const dh = sh * fit;
      ctx.drawImage(img, sx, sy, sw, sh, (canvas.width - dw) / 2, (canvas.height - dh) / 2, dw, dh);
    };
    img.src = url;
    return () => {
      alive = false;
    };
  }, [url]);
  return <canvas ref={ref} width={36} height={48} className="rounded border border-line bg-paper" aria-hidden />;
}

function loadLayerSize(url: string): Promise<{ w: number; h: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

async function splitLayers(figure: FigureFile): Promise<{ role: PuppetRole; name: string; png: string }[]> {
  const { body, head } = splitFigure(figure.img, figure.img.naturalWidth, figure.img.naturalHeight);
  return [
    { role: "body", name: `${figure.name} · cuerpo`, png: await blobPng(await canvasPng(body)) },
    { role: "head", name: `${figure.name} · cabeza`, png: await blobPng(await canvasPng(head)) },
  ];
}

function blobPng(blob: Blob): Promise<string> {
  return blob.arrayBuffer().then((buf) => {
    const bytes = new Uint8Array(buf);
    let binary = "";
    const step = 0x8000;
    for (let i = 0; i < bytes.length; i += step) binary += String.fromCharCode(...bytes.subarray(i, i + step));
    return `data:image/png;base64,${btoa(binary)}`;
  });
}

// One member of the fixed cast: name, @ reference, description and approved image.
export function CastCard({
  member,
  seriesId,
  version,
  onChange,
  onRemove,
  onImage,
  onPuppetFiles,
  onPuppetReplace,
  onPuppetRemove,
  onPuppetArranged,
  onRigFile,
  maxRefs,
  onRefs,
  onBeforeRef,
  onVideo,
}: {
  member: CastMember;
  seriesId: string | null;
  version: number;
  onChange: (member: CastMember) => void;
  onRemove: () => void;
  onImage: (file: File) => Promise<void>;
  onPuppetFiles: (files: File[]) => Promise<void>;
  onPuppetReplace: (layers: { role: PuppetRole; name: string; png: string }[]) => Promise<void>;
  onPuppetRemove: (index: number) => Promise<void>;
  onPuppetArranged: (member: CastMember) => void;
  onRigFile: (file: File) => Promise<CastMember>;
  // Extra references (characters, places and products; screens go as they are).
  maxRefs?: number | null;
  onRefs?: (member: CastMember, series: SeriesInfo[]) => void;
  onBeforeRef?: () => Promise<void>;
  // Real screens: the recording of the app working, saved at once like the extra references.
  onVideo?: (member: CastMember, series: SeriesInfo[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const looseInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [clipNames, setClipNames] = useState<string[]>([]);
  const [rootless, setRootless] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [figures, setFigures] = useState<FigureFile[]>([]);
  const figuresRef = useRef<FigureFile[]>([]);
  const [mixed, setMixed] = useState(false);
  // "Armar a mano" open: the parts laid out to drag into place.
  const [arranging, setArranging] = useState(false);
  const screen = member.kind === "screen";
  const url = seriesId && member.image ? libraryFileUrl(seriesId, member.image, version) : undefined;
  const set = <K extends keyof CastMember>(key: K, value: CastMember[K]) => onChange({ ...member, [key]: value });

  useEffect(() => {
    if (!seriesId || !member.rig?.file) {
      setClipNames([]);
      setRootless([]);
      return;
    }
    let cancel = false;
    loadActor(libraryFileUrl(seriesId, member.rig.file, version), member.rig).then((actor) => {
      if (cancel || !actor) return;
      setClipNames(actor.names);
      setRootless(RIG_MOVES.filter((m) => member.rig.clips[m] && actor.root[m] === false));
    });
    return () => {
      cancel = true;
    };
  }, [seriesId, member.rig?.file, version]);

  async function upload(file: File) {
    setBusy(true);
    setError("");
    try {
      await onImage(file);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    folderInput.current?.setAttribute("webkitdirectory", "");
    folderInput.current?.setAttribute("directory", "");
    return () => revokeFigures(figuresRef.current);
  }, []);

  // Layers Grok cropped to each object are different sizes. Stacking them stretches one over the other.
  useEffect(() => {
    if (!seriesId || member.puppet.layers.length < 2) {
      setMixed(false);
      return;
    }
    let alive = true;
    Promise.all(member.puppet.layers.map((l) => loadLayerSize(libraryFileUrl(seriesId, l.file)))).then((sizes) => {
      if (!alive) return;
      const known = sizes.filter((s): s is { w: number; h: number } => s !== null);
      // Loose crops that nobody placed yet sit where the app guessed: worth a look in Armar a mano.
      setMixed(member.puppet.layers.some((l, i) => !l.place && sizes[i] && known.length > 1 && (sizes[i]!.w !== known[0].w || sizes[i]!.h !== known[0].h)));
    });
    return () => {
      alive = false;
    };
  }, [seriesId, member.puppet.layers]);

  function remember(next: FigureFile[]) {
    revokeFigures(figuresRef.current);
    figuresRef.current = next;
    setFigures(next);
  }

  async function useFigure(figure: FigureFile, whole: boolean) {
    setBusy(true);
    setError("");
    setStatus(whole ? "Guardando la figura entera…" : "Separando la cabeza del cuerpo…");
    try {
      const layers = whole
        ? [{ role: "body" as const, name: figure.name, png: await blobPng(figure.file) }]
        : await splitLayers(figure);
      await onPuppetReplace(layers);
      setStatus(whole ? "Figura entera. La cabeza no gira sola." : `Cabeza y cuerpo a partir de ${figure.name}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("");
    } finally {
      setBusy(false);
    }
  }

  async function fromFolder(files: File[]) {
    setBusy(true);
    setError("");
    setStatus(`Leyendo ${files.length} archivos…`);
    try {
      const found = await findFullFigures(files);
      if (!found.figures.length) {
        setError(
          found.crops
            ? "Esos archivos son recortes (la campera, el pelo, una cara) y no dicen dónde van. Elegí la carpeta segments entera: adentro está la figura de cuerpo entero."
            : "En esa carpeta no hay imágenes PNG.",
        );
        setStatus("");
        return;
      }
      remember(found.figures);
      const layers = await splitLayers(found.figures[0]);
      await onPuppetReplace(layers);
      const extra = found.crops ? ` ${found.crops} recortes quedaron afuera.` : "";
      setStatus(
        found.figures.length > 1
          ? `Armado con ${found.figures[0].name}. Si esa no es la de frente, elegí otra abajo.${extra}`
          : `Armado con ${found.figures[0].name}.${extra}`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="grid grid-cols-[72px_minmax(0,1fr)] gap-3 rounded-lg border border-line p-3">
      <div className="space-y-1">
        <button
          type="button"
          disabled={!seriesId || busy}
          onClick={() => input.current?.click()}
          className="relative block aspect-[9/16] w-[72px] overflow-hidden rounded-md border border-dashed border-line bg-paper text-[10px] font-semibold text-muted disabled:opacity-60"
          title={seriesId ? "Subir la imagen aprobada" : "Guardá la serie primero"}
        >
          {url ? <img src={url} alt="" className="absolute inset-0 size-full object-cover" /> : busy ? <Spinner /> : screen ? "Subir captura" : "Subir imagen"}
        </button>
        <input
          ref={input}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) upload(file);
            e.target.value = "";
          }}
        />
      </div>
      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <input
            className={`${inputClass} w-40 py-1`}
            value={member.name}
            placeholder="Nombre"
            aria-label="Nombre"
            onChange={(e) => {
              const name = e.target.value;
              // The @ reference follows the name until it is edited by hand.
              const auto = member.ref === castRef(member.name);
              onChange({ ...member, name, ref: auto ? castRef(name) : member.ref });
            }}
          />
          <span className="text-xs text-muted">{CAST_KIND_LABEL[member.kind]}</span>
          <label className="flex items-center gap-0.5 font-mono text-xs text-good" title="Nombre de la referencia en Grok">
            @
            <input
              className="w-28 rounded border border-line px-1 py-0.5"
              value={member.ref}
              aria-label="Referencia"
              onChange={(e) => set("ref", e.target.value.replace(/[^A-Za-z0-9_]/g, ""))}
            />
          </label>
          <button type="button" onClick={onRemove} className="ml-auto text-xs font-semibold text-muted hover:text-neg">
            Sacar
          </button>
        </div>
        <textarea
          className={`${inputClass} py-1.5 text-xs`}
          rows={2}
          value={member.identity}
          placeholder={
            screen
              ? "Qué muestra esta pantalla. Ej.: lista de Vence en el celular, con los productos que vencen esta semana."
              : "Descripción visual en inglés, la que se repite en cada prompt. Ej.: a tired but kind corner-store owner in her fifties…"
          }
          aria-label={screen ? "Qué muestra" : "Descripción visual"}
          onChange={(e) => set("identity", e.target.value)}
        />
        <input
          className={`${inputClass} py-1 text-xs`}
          value={member.note}
          placeholder="Cuándo usarlo (opcional)"
          aria-label="Cuándo usarlo"
          onChange={(e) => set("note", e.target.value)}
        />
        {screen && seriesId && onVideo && (
          <ScreenVideoBox seriesId={seriesId} member={member} beforeUpload={async () => void (await api.upsertCast(seriesId, member))} onSaved={onVideo} />
        )}
        {member.kind === "character" && (
          <>
          <details className="text-xs" open={member.puppet.layers.length > 0 || undefined}>
            <summary className="cursor-pointer font-semibold text-muted">
              Títere 3D para los explicativos {member.puppet.layers.length ? `(${member.puppet.layers.length} partes)` : ""}
            </summary>
            <div className="mt-1.5 space-y-2">
              <p className="text-muted">
                En Grok: Segmentos → Descargar todo. Eso baja una carpeta por cosa (la persona, la campera, el pelo) y cada
                archivo es un recorte, sin decir dónde va. <b>Carpeta de Segmentos</b> toma la figura de frente y le separa la
                cabeza del cuerpo. Para que muevan los brazos o la boca, sumá esos recortes con <b>Partes sueltas</b> y
                ponelos en su lugar con <b>Armar a mano</b>.
              </p>
              <p className="text-muted">
                Si la hoja del títere trae bocas y caras, sumalas también (opcional): las bocas A, O y E cambian con la
                voz, las caras contenta, sorprendida y preocupada siguen la emoción de la frase, y el cuerpo de 3/4 o de
                perfil aparece cuando señala o presenta algo.
              </p>
              {mixed && !arranging && (
                <p className="text-neg">
                  Hay partes sueltas que la app ubicó a ojo. Revisalas en Armar a mano: arrastralas a su lugar y guardá.
                </p>
              )}
              {arranging && seriesId ? (
                <PuppetArranger
                  seriesId={seriesId}
                  member={member}
                  onClose={() => setArranging(false)}
                  onSaved={(next) => {
                    onPuppetArranged(next);
                    setArranging(false);
                    setStatus("Armado guardado.");
                  }}
                />
              ) : (
              <div className="flex flex-wrap items-start gap-3">
                {seriesId && <PuppetPreview seriesId={seriesId} puppet={member.puppet} />}
                <ul className="min-w-[220px] flex-1 space-y-1">
                  {member.puppet.layers.map((l, i) => (
                    <li key={l.file} className="flex items-center gap-2">
                      {seriesId && <LayerThumb url={libraryFileUrl(seriesId, l.file)} />}
                      <div className="min-w-0 flex-1">
                        <select
                          className={`${inputClass} w-full py-0.5 text-xs`}
                          value={l.role}
                          aria-label={`Parte ${i + 1}`}
                          onChange={(e) =>
                            set("puppet", { layers: member.puppet.layers.map((x, k) => (k === i ? { ...x, role: e.target.value as PuppetRole, pivot: null } : x)) })
                          }
                        >
                          {PUPPET_ROLES.map((r) => (
                            <option key={r} value={r}>
                              {PUPPET_ROLE_LABEL[r]}
                            </option>
                          ))}
                        </select>
                        {l.name && <p className="truncate text-[10px] text-muted">{l.name}</p>}
                      </div>
                      <button
                        type="button"
                        className="text-xs font-semibold text-muted hover:text-neg"
                        disabled={busy}
                        onClick={async () => {
                          setBusy(true);
                          setError("");
                          try {
                            await onPuppetRemove(i);
                          } catch (e) {
                            setError(e instanceof Error ? e.message : String(e));
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        Quitar
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
              )}
              <div className={`flex flex-wrap gap-2 ${seriesId ? "" : "opacity-50"}`}>
                <Button
                  type="button"
                  className="px-3 py-1 text-xs"
                  disabled={!seriesId || busy}
                  onClick={() => openFilePicker(folderInput.current)}
                >
                  {busy ? "Trabajando…" : "Carpeta de Segmentos"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="px-3 py-1 text-xs"
                  disabled={!seriesId || busy}
                  onClick={() => openFilePicker(looseInput.current)}
                >
                  Partes sueltas
                </Button>
                {member.puppet.layers.length > 0 && !arranging && (
                  <Button type="button" variant="secondary" className="px-3 py-1 text-xs" disabled={!seriesId || busy} onClick={() => setArranging(true)}>
                    Armar a mano
                  </Button>
                )}
              </div>
              <input
                ref={folderInput}
                type="file"
                accept="image/png,image/webp"
                multiple
                disabled={!seriesId || busy}
                className="hidden"
                aria-label={`Carpeta de segmentos de ${member.name}`}
                onChange={(e) => {
                  const files = [...(e.target.files ?? [])];
                  e.target.value = "";
                  if (files.length) void fromFolder(files);
                }}
              />
              <input
                ref={looseInput}
                type="file"
                accept="image/png,image/webp"
                multiple
                disabled={!seriesId || busy}
                className="hidden"
                aria-label={`Capas sueltas del títere de ${member.name}`}
                onChange={(e) => {
                  const files = [...(e.target.files ?? [])];
                  e.target.value = "";
                  if (!files.length) return;
                  setBusy(true);
                  setError("");
                  setStatus("");
                  setArranging(false);
                  onPuppetFiles(files)
                    .then(() => {
                      // Loose crops do not say where they go: open the layout so the person puts them in place.
                      setStatus("Partes agregadas. Ponelas en su lugar y guardá.");
                      setArranging(true);
                    })
                    .catch((err) => setError(err instanceof Error ? err.message : String(err)))
                    .finally(() => setBusy(false));
                }}
              />
              {figures.length > 1 && (
                <div className="space-y-1">
                  <p className="text-muted">Otras figuras enteras de la hoja. Tocá la de frente si no era la primera.</p>
                  <div className="flex gap-2 overflow-x-auto">
                    {figures.map((f) => (
                      <button
                        key={f.url}
                        type="button"
                        disabled={busy}
                        className="w-16 shrink-0 text-left"
                        onClick={() => void useFigure(f, false)}
                      >
                        <img src={f.url} alt="" className="h-20 w-full rounded border border-line bg-paper object-contain" />
                        <span className="block truncate text-[10px] text-muted">{f.name.replace(/\.[a-z0-9]+$/i, "")}</span>
                      </button>
                    ))}
                  </div>
                  <button type="button" className="text-xs font-semibold text-muted hover:text-ink" disabled={busy} onClick={() => void useFigure(figures[0], true)}>
                    Usar {figures[0].name} entera, sin separar la cabeza
                  </button>
                </div>
              )}
              {status && <p className="text-muted">{status}</p>}
              {member.puppet.layers.length > 0 && !member.puppet.layers.some((l) => l.role === "head") && (
                <p className="text-neg">Falta la cabeza: marcá qué capa es (sin cabeza no gira ni habla).</p>
              )}
            </div>
          </details>
          <details className="text-xs" open={member.rig?.file ? true : undefined}>
            <summary className="cursor-pointer font-semibold text-muted">
              Camina y gira {member.rig?.file ? "(GLB listo)" : "(GLB)"}
            </summary>
            <div className="mt-1.5 space-y-2">
              <p className="text-muted">
                El mesh se hace afuera. Mesh2Motion o Mixamo le ponen el esqueleto y los clips, y exportás un GLB. Acá se asigna cada tramo. Caminar y girar usan el root motion de la cadera; si el clip no lo trae, la escena igual se mueve, pero es un desliz.
              </p>
              <label className={`inline-flex items-center gap-2 ${seriesId ? "" : "opacity-50"}`}>
                <span className="rounded-lg border border-line bg-white px-2.5 py-1 font-semibold hover:border-ink">{busy ? "Subiendo…" : member.rig?.file ? "Cambiar GLB" : "Subir GLB"}</span>
                <input
                  type="file"
                  accept=".glb,model/gltf-binary"
                  disabled={!seriesId || busy}
                  className="hidden"
                  aria-label={`Subir GLB de ${member.name}`}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file) return;
                    setBusy(true);
                    setError("");
                    try {
                      const next = await onRigFile(file);
                      const actor = seriesId ? await loadActor(libraryFileUrl(seriesId, next.rig.file), next.rig) : null;
                      const clips = { ...next.rig.clips };
                      for (const name of actor?.names ?? []) {
                        const move = guessClip(name);
                        if (move && !clips[move]) clips[move] = name;
                      }
                      onChange({ ...next, rig: { ...next.rig, clips } });
                    } catch (err) {
                      setError(err instanceof Error ? err.message : String(err));
                    } finally {
                      setBusy(false);
                    }
                  }}
                />
              </label>
              {member.rig?.file && (
                <div className="grid gap-1">
                  {RIG_MOVES.map((move) => (
                    <label key={move} className="flex items-center gap-2">
                      <span className="w-36">{RIG_MOVE_LABEL[move]}</span>
                      <select
                        className={`${inputClass} w-auto py-0.5 text-xs`}
                        value={member.rig.clips[move]}
                        aria-label={RIG_MOVE_LABEL[move]}
                        onChange={(e) => set("rig", { ...member.rig, clips: { ...member.rig.clips, [move]: e.target.value } })}
                      >
                        <option value="">Sin clip</option>
                        {clipNames.map((name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                  {rootless.length > 0 && (
                    <p className="text-muted">Sin root motion: {rootless.map((m) => RIG_MOVE_LABEL[m as RigMove]).join(", ")}.</p>
                  )}
                </div>
              )}
            </div>
          </details>
          </>
        )}
        {member.sheet && (
          <details className="text-xs">
            <summary className="cursor-pointer font-semibold text-muted">Hoja de referencia</summary>
            <p className="mt-1 font-mono">{member.sheet}</p>
            <CopyButton text={member.sheet} idle="Copiar la hoja" variant="secondary" />
          </details>
        )}
        {!screen && seriesId && onRefs && (member.image || member.refs.length > 0 || member.views.length > 0) && (
          <details className="text-xs" open={member.refs.length > 0 || undefined}>
            <summary className="cursor-pointer font-semibold text-muted">
              Referencias extra{member.refs.length ? ` (${member.refs.length})` : ""}: recortar la cara, vistas sueltas
            </summary>
            <div className="mt-1.5">
              <CastRefs seriesId={seriesId} member={member} version={version} maxRefs={maxRefs ?? null} beforeUpload={onBeforeRef} onChange={onRefs} />
            </div>
          </details>
        )}
        {error && <p className="text-xs text-neg">{error}</p>}
      </div>
    </li>
  );
}
