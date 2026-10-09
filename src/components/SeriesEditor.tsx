import { useEffect, useRef, useState } from "react";
import type { SeriesInfo } from "../../shared/schema.ts";
import {
  CAST_KIND_LABEL,
  PUPPET_ROLES,
  PUPPET_ROLE_LABEL,
  guessRole,
  guessClip,
  RIG_MOVES,
  RIG_MOVE_LABEL,
  type PuppetRole,
  type RigMove,
  DISPLAY_FONTS,
  EMPTY_LOOK,
  UI_FONTS,
  EMPTY_SERIES,
  LOOK_PRESETS,
  SERIES_TYPE_LABEL,
  BRAND_MOTIONS,
  BRAND_MOTION_LABEL,
  brandContrast,
  type BrandMotion,
  castRef,
  type CastKind,
  type CastMember,
  type SeriesFields,
  type Brand,
  type SeriesLook,
} from "../../shared/series.ts";
import { inDays, upcomingMoments } from "../../shared/calendar.ts";
import { ensureFont } from "../lib/fonts.ts";
import { BrandFromWeb } from "./BrandFromWeb.tsx";
import { PuppetArranger } from "./PuppetArranger.tsx";
import { PuppetPreview } from "./PuppetPreview.tsx";
import { SheetBuilder } from "./SheetBuilder.tsx";
import { CopyButton } from "./ScriptView.tsx";
import { api, libraryFileUrl } from "../lib/api.ts";
// three.js (in actor.ts) loads only when a character has a rig to preview.
const loadActor: typeof import("../lib/actor.ts").loadActor = (...args) => import("../lib/actor.ts").then((m) => m.loadActor(...args));
import { canvasPng, findFullFigures, revokeFigures, splitFigure, type FigureFile } from "../lib/segmentAssemble.ts";
import { Button, Field, Notice, Segmented, Spinner, inputClass } from "./ui.tsx";

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
function CastCard({
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
        {error && <p className="text-xs text-neg">{error}</p>}
      </div>
    </li>
  );
}

// The brand kit for motion graphics: logo, three colours (one accent) and two fonts.
function BrandSection({
  brand,
  seriesId,
  version,
  onChange,
  onLogo,
  works,
  onName,
  onConfirm,
}: {
  brand: Brand;
  seriesId: string | null;
  version: number;
  onChange: (brand: Brand) => void;
  onLogo: (file: File) => Promise<void>;
  works: string;
  onName: (name: string, tagline: string) => void;
  onConfirm: (claim: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    ensureFont(brand.displayFont);
    ensureFont(brand.uiFont);
  }, [brand.displayFont, brand.uiFont]);
  const logo = seriesId && brand.logo ? libraryFileUrl(seriesId, brand.logo, version) : undefined;
  const color = (key: "bg" | "text" | "accent", label: string) => (
    <label className="flex items-center gap-1.5 text-xs">
      <input type="color" value={brand[key]} onChange={(e) => onChange({ ...brand, [key]: e.target.value })} />
      {label}
    </label>
  );
  return (
    <Field
      label="Marca (motion graphics)"
      group
      hint="Logo, un fondo, un color de texto, UN acento, una fuente de títulos y una de interfaz. Los explicativos y los videos de letra las usan."
    >
      <div className="grid gap-3 sm:grid-cols-[120px_minmax(0,1fr)]">
        <div className="space-y-1">
          <label
            className={`grid aspect-square w-[120px] cursor-pointer place-items-center overflow-hidden rounded-lg border border-dashed border-line bg-paper text-xs text-muted ${!seriesId ? "opacity-60" : ""}`}
            title={seriesId ? "Subir el logo" : "Guardá la serie primero"}
          >
            {logo ? <img src={logo} alt="Logo" className="size-full object-contain p-2" /> : busy ? <Spinner /> : "Subir logo"}
            <input
              type="file"
              accept="image/png,image/webp,image/jpeg"
              className="hidden"
              disabled={!seriesId || busy}
              aria-label="Subir el logo"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                setBusy(true);
                setError("");
                try {
                  await onLogo(file);
                } catch (err) {
                  setError(err instanceof Error ? err.message : String(err));
                } finally {
                  setBusy(false);
                }
              }}
            />
          </label>
          {error && <p className="text-xs text-neg">{error}</p>}
        </div>
        <div className="space-y-2">
          <div className="flex flex-wrap gap-3">
            {color("bg", "Fondo")}
            {color("text", "Texto")}
            {color("accent", "Acento (uno solo)")}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block text-xs">
              <span className="font-semibold">Fuente de títulos</span>
              <select className={`${inputClass} mt-0.5 py-1`} value={brand.displayFont} onChange={(e) => onChange({ ...brand, displayFont: e.target.value })}>
                {[...new Set([...DISPLAY_FONTS, brand.displayFont])].map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </select>
            </label>
            <label className="block text-xs">
              <span className="font-semibold">Fuente de interfaz</span>
              <select className={`${inputClass} mt-0.5 py-1`} value={brand.uiFont} onChange={(e) => onChange({ ...brand, uiFont: e.target.value })}>
                {[...new Set([...UI_FONTS, brand.uiFont])].map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="block text-xs">
            <span className="font-semibold">Cómo se mueve la marca</span>
            <select
              className={`${inputClass} mt-0.5 py-1`}
              value={brand.motion ?? "even"}
              onChange={(e) => onChange({ ...brand, motion: e.target.value as BrandMotion })}
            >
              {BRAND_MOTIONS.map((m) => (
                <option key={m} value={m}>
                  {BRAND_MOTION_LABEL[m]}
                </option>
              ))}
            </select>
            <span className="mt-0.5 block text-muted">Cómo aterriza cada cosa y si las imágenes respiran. El texto nunca se mueve mientras se lee; un tono seco nunca rebota.</span>
          </label>
          <div className="rounded-lg p-3" style={{ background: brand.bg, color: brand.text }}>
            <p style={{ fontFamily: `"${brand.displayFont}"`, fontWeight: 700, fontSize: 22, lineHeight: 1.1 }}>
              Armá el pedido <span style={{ color: brand.accent }}>antes del corte</span>
            </p>
            <p style={{ fontFamily: `"${brand.uiFont}"`, fontSize: 13, opacity: 0.85 }}>Así se ven los títulos y el texto.</p>
          </div>
          {(() => {
            const contrast = brandContrast(brand);
            return contrast.problems.length ? (
              <ul className="space-y-0.5 text-xs text-neg">
                {contrast.problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-good">
                ✓ Contraste: texto {contrast.text.toFixed(1).replace(".", ",")}:1 y acento {contrast.accent.toFixed(1).replace(".", ",")}:1 sobre el fondo.
              </p>
            );
          })()}
        </div>
      </div>
      <div className="mt-3">
        <BrandFromWeb brand={brand} seriesId={seriesId} works={works} onBrand={onChange} onLogo={onLogo} onName={onName} onConfirm={onConfirm} />
      </div>
    </Field>
  );
}

const LOOK_FIELDS: { key: keyof SeriesLook; label: string; hint: string }[] = [
  { key: "camera", label: "Cámara", hint: "Ej.: celular en mano; compacta digital de los 2000." },
  { key: "flash", label: "Flash", hint: "Ej.: flash directo que aplana la cara; sin flash." },
  { key: "grain", label: "Grano y ruido", hint: "Ej.: ruido en las sombras, compresión de celular." },
  { key: "focus", label: "Foco", hint: "Ej.: el autofoco busca y a veces se va al fondo." },
  { key: "light", label: "Luz (nunca cambia)", hint: "De dónde viene. Solo cambia la exposición automática." },
  { key: "extra", label: "Otros defectos", hint: "Ej.: piel con poros y pecas, sin filtro." },
];

// The series' look as flaws (camera, flash, grain, focus, light), never "cinematic": it goes into every prompt.
function LookSection({ look, onChange }: { look: SeriesLook; onChange: (look: SeriesLook) => void }) {
  return (
    <Field
      label="Look (cámara y defectos)"
      group
      hint='Para que se vea real: pedí defectos, no "cinematic" ni "vintage". Va en todos los prompts de imagen y de video. En inglés o castellano: la IA lo pasa al prompt.'
    >
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          {Object.entries(LOOK_PRESETS).map(([key, preset]) => (
            <Button key={key} variant="secondary" className="px-3 py-1 text-xs" onClick={() => onChange(preset.look)}>
              {preset.label}
            </Button>
          ))}
          <Button variant="ghost" className="px-3 py-1 text-xs" onClick={() => onChange(EMPTY_LOOK)}>
            Sin look fijo
          </Button>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {LOOK_FIELDS.map((f) => (
            <label key={f.key} className="block text-xs">
              <span className="font-semibold">{f.label}</span>
              <input
                className={`${inputClass} mt-0.5 py-1.5 text-xs`}
                value={look[f.key]}
                placeholder={f.hint}
                onChange={(e) => onChange({ ...look, [f.key]: e.target.value })}
              />
            </label>
          ))}
        </div>
      </div>
    </Field>
  );
}

type Props = {
  // null: a new series.
  id: string | null;
  onSaved: (series: SeriesInfo[], id: string) => void;
  // The logo is saved at once; the app's copy of the series follows.
  onLogoSaved?: (series: SeriesInfo[]) => void;
  onDeleted: (series: SeriesInfo[]) => void;
  onClose: () => void;
};

export function SeriesEditor({ id, onSaved, onDeleted, onClose, onLogoSaved }: Props) {
  const [fields, setFields] = useState<SeriesFields | null>(id ? null : EMPTY_SERIES);
  // "Lo que existe hoy" is edited as text, one item per line.
  const [works, setWorks] = useState("");
  const [practices, setPractices] = useState("");
  const [loop, setLoop] = useState("");
  const [moments, setMoments] = useState("");
  const [sheetFor, setSheetFor] = useState<null | "person" | "place">(null);
  const [version, setVersion] = useState(Date.now());
  const [busy, setBusy] = useState<null | "save" | "delete">(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    api
      .seriesFields(id)
      .then(({ fields }) => {
        setFields(fields);
        setWorks(fields.worksToday.join("\n"));
        setPractices(fields.practices.join("\n"));
        setLoop(fields.loop.join("\n"));
        setMoments((fields.moments ?? []).join("\n"));
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [id]);

  if (!fields) {
    return error ? <Notice tone="error">{error}</Notice> : <Spinner />;
  }

  const music = fields.type === "music";
  const set = <K extends keyof SeriesFields>(key: K, value: SeriesFields[K]) => setFields({ ...fields, [key]: value });
  const text = (key: Exclude<keyof SeriesFields, "worksToday" | "practices" | "loop" | "moments" | "type" | "textStyle" | "lyricStyle" | "look" | "brand" | "cast">, rows = 4) => (
    <textarea className={inputClass} rows={rows} value={fields[key]} onChange={(e) => set(key, e.target.value)} />
  );

  async function save() {
    if (!fields) return;
    setError("");
    setBusy("save");
    const lines = (t: string) =>
      t
        .split("\n")
        .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
        .filter(Boolean);
    const next = { ...fields, worksToday: lines(works), practices: lines(practices), loop: lines(loop), moments: lines(moments) };
    try {
      if (id) {
        const { series } = await api.saveSeries(id, next);
        onSaved(series, id);
      } else {
        const { series, id: newId } = await api.createSeries(next);
        onSaved(series, newId);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  function addMember(kind: CastKind) {
    if (!fields) return;
    let n = fields.cast.filter((m) => m.kind === kind).length + 1;
    const base = { character: "personaje", place: "lugar", product: "producto", screen: "pantalla" }[kind];
    while (fields.cast.some((m) => m.id === `${base}-${n}`)) n++;
    const name = `${CAST_KIND_LABEL[kind]} ${n}`;
    set("cast", [...fields.cast, { id: `${base}-${n}`, name, ref: castRef(name), kind, identity: "", note: "", image: "", sheet: "", puppet: { layers: [] }, rig: { file: "", clips: { idle: "", walk: "", turnL: "", turnR: "", point: "" } } }]);
  }

  // Puppet parts go straight to the series library, in order; each answer brings the member as the server has it.
  async function memberPuppetFiles(member: CastMember, files: File[]) {
    if (!id || !fields) return;
    await api.upsertCast(id, member);
    let current = member;
    for (const file of files) {
      const { member: next } = await api.uploadPuppetLayer(id, member.id, current.puppet.layers.length, file, guessRole(file.name), file.name);
      current = { ...current, puppet: next.puppet };
      const updated = current;
      setFields((f) => (f ? { ...f, cast: f.cast.map((m) => (m.id === member.id ? updated : m)) } : f));
    }
  }

  async function memberPuppetReplace(member: CastMember, layers: { role: PuppetRole; name: string; png: string }[]) {
    if (!id || !fields) return;
    await api.upsertCast(id, member);
    const { member: next } = await api.replacePuppet(id, member.id, layers);
    setFields((f) => (f ? { ...f, cast: f.cast.map((m) => (m.id === member.id ? { ...m, puppet: next.puppet } : m)) } : f));
    setVersion(Date.now());
  }

  // "Armar a mano" saved: the server's answer is the member's puppet now.
  function memberPuppetArranged(next: CastMember) {
    setFields((f) => (f ? { ...f, cast: f.cast.map((m) => (m.id === next.id ? { ...m, puppet: next.puppet } : m)) } : f));
  }

  async function memberRigFile(member: CastMember, file: File): Promise<CastMember> {
    if (!id) throw new Error("Guardá la serie primero.");
    await api.upsertCast(id, member);
    const { member: next } = await api.uploadRig(id, member.id, file);
    setFields((f) => (f ? { ...f, cast: f.cast.map((m) => (m.id === member.id ? { ...m, rig: next.rig } : m)) } : f));
    return { ...member, rig: next.rig };
  }

  async function memberPuppetRemove(member: CastMember, index: number) {
    if (!id) return;
    const { member: next } = await api.removePuppetLayer(id, member.id, index);
    setFields((f) => (f ? { ...f, cast: f.cast.map((m) => (m.id === member.id ? { ...m, puppet: next.puppet } : m)) } : f));
  }

  // The image goes straight to the series library; the member is saved first so the server knows it.
  async function memberImage(member: CastMember, file: File) {
    if (!id || !fields) return;
    await api.upsertCast(id, member);
    const { file: name } = await api.uploadCastImage(id, member.id, file);
    setFields((f) => (f ? { ...f, cast: f.cast.map((m) => (m.id === member.id ? { ...member, image: name } : m)) } : f));
    setVersion(Date.now());
  }

  async function remove() {
    if (!id || !confirm(`¿Borrar la serie "${fields?.name}"? No se puede deshacer.`)) return;
    setError("");
    setBusy("delete");
    try {
      const { series } = await api.deleteSeries(id);
      onDeleted(series);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="space-y-5 rounded-xl border border-line bg-white p-5">
      <div>
        <h2 className="text-lg font-bold">{id ? `Editar serie · ${fields.name}` : "Nueva serie"}</h2>
        <p className="text-sm text-muted">
          Esto es todo lo que la IA sabe de la marca. Se manda completo con cada pedido, así que conviene que esté al día.
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <Field label="Nombre">
          <input className={inputClass} value={fields.name} onChange={(e) => set("name", e.target.value)} />
        </Field>
        <Field label="Frase de la marca (opcional)">
          <input className={inputClass} value={fields.tagline} onChange={(e) => set("tagline", e.target.value)} />
        </Field>
      </div>

      <Field
        label="Tipo de serie"
        group
        hint={
          fields.type === "software"
            ? "Software: funciones que existen hoy, el loop del producto y pantallas reales de la app."
            : fields.type === "ecommerce"
              ? 'E-commerce: un producto distinto en cada episodio; el brief pide "Producto de este episodio".'
              : "Música: videos de letra. Sin historia: subís la canción, pegás la letra (en cualquier idioma), se sincroniza y se anima sobre un fondo orgánico."
        }
      >
        <Segmented
          value={fields.type}
          onChange={(v) => set("type", v)}
          options={[
            { value: "software", label: SERIES_TYPE_LABEL.software },
            { value: "ecommerce", label: SERIES_TYPE_LABEL.ecommerce },
            { value: "music", label: SERIES_TYPE_LABEL.music },
          ]}
        />
      </Field>

      <Field
        label="Qué es"
        hint={music ? "El artista o el proyecto, el género, el clima de las canciones. La IA lo lee para proponer colores y palabras." : undefined}
      >
        {text("what", 3)}
      </Field>

      <BrandSection
        brand={fields.brand}
        seriesId={id}
        version={version}
        onChange={(brand) => set("brand", brand)}
        onLogo={async (file) => {
          if (!id) return;
          const { file: logo, series } = await api.uploadLogo(id, file);
          setFields((f) => (f ? { ...f, brand: { ...f.brand, logo } } : f));
          setVersion(Date.now());
          onLogoSaved?.(series);
        }}
        works={works}
        onName={(name, tagline) => setFields((f) => (f ? { ...f, name: name || f.name, tagline: tagline || f.tagline } : f))}
        onConfirm={(claim) => setWorks((w) => (w.trim() ? `${w.replace(/\s+$/, "")}\n${claim}` : claim))}
      />

      {!music && <LookSection look={fields.look} onChange={(look) => set("look", look)} />}

      {!music && (
        <>
          <Field
            label="Lo que existe hoy"
            hint="Una función o un producto por línea. Es lo único que la IA puede mostrar como real; todo lo demás lo marca como Concepto."
          >
            <textarea className={`${inputClass} font-mono`} rows={9} value={works} onChange={(e) => setWorks(e.target.value)} />
          </Field>

          <Field
            label="Cómo se trabaja hoy"
            hint="Cómo hace la gente cada cosa hoy, sin la marca, una por línea. Ej.: el pedido se arma mirando la góndola. La IA arma los dolores solo con esto y las notas del brief; si muestra otra costumbre, el check la marca."
          >
            <textarea
              className={`${inputClass} font-mono`}
              rows={6}
              value={practices}
              onChange={(e) => setPractices(e.target.value)}
            />
          </Field>

          <Field
            label="El loop de la serie (opcional)"
            hint="Los pasos de la rutina que la marca resuelve, uno por línea y en orden. El check revisa que cada paso que aparece se muestre completo: el dolor, el paso y el resultado."
          >
            <textarea className={`${inputClass} font-mono`} rows={6} value={loop} onChange={(e) => setLoop(e.target.value)} />
          </Field>

          <Field
            label="Momentos del calendario (opcional)"
            hint="Fechas que el público ya siente, una por línea: «cuándo: qué pasa». Ej.: «el 1 de cada mes: cobran los sueldos», «primera semana de junio: primer frío», «los lunes: llega el proveedor». El brief te sugiere el más cercano, y el menú y los ganchos de Publicidad los usan."
          >
            <textarea
              className={`${inputClass} font-mono`}
              rows={5}
              value={moments}
              onChange={(e) => setMoments(e.target.value)}
            />
            {moments.trim() && (
              <ul className="mt-1 space-y-0.5 text-xs text-muted">
                {upcomingMoments(moments.split("\n"), new Date()).map((m) => (
                  <li key={m.line}>
                    {m.days === null ? (
                      <span className="text-amber-800">Sin fecha fija: la IA lo usa igual, pero no se puede sugerir por cercanía.</span>
                    ) : (
                      <span className="text-ink">
                        {inDays(m.days)} · {m.next!.split("-").reverse().join("/")}
                      </span>
                    )}{" "}
                    · {m.what}
                  </li>
                ))}
              </ul>
            )}
          </Field>

          <Field
            label="Elenco fijo"
            group
            hint="Personajes, lugares y productos que se repiten en todos los episodios, cada uno con su imagen aprobada y su referencia @ para Grok. La IA los reusa tal cual."
          >
            <div className="space-y-2">
              <ul className="space-y-2">
                {fields.cast
                  .filter((m) => m.kind !== "screen")
                  .map((m) => (
                    <CastCard
                      key={m.id}
                      member={m}
                      seriesId={id}
                      version={version}
                      onChange={(next) => set("cast", fields.cast.map((x) => (x.id === m.id ? next : x)))}
                      onRemove={() => set("cast", fields.cast.filter((x) => x.id !== m.id))}
                      onImage={(file) => memberImage(m, file)}
                      onPuppetFiles={(files) => memberPuppetFiles(m, files)}
                      onPuppetReplace={(layers) => memberPuppetReplace(m, layers)}
                      onPuppetRemove={(index) => memberPuppetRemove(m, index)}
                      onPuppetArranged={(next) => memberPuppetArranged(next)}
                      onRigFile={(file) => memberRigFile(m, file)}
                    />
                  ))}
              </ul>
              {sheetFor && id && (
                <SheetBuilder
                  seriesId={id}
                  place={sheetFor === "place"}
                  cast={fields.cast}
                  onAdd={(member) => set("cast", [...fields.cast, member])}
                  onClose={() => setSheetFor(null)}
                />
              )}
              <div className="flex flex-wrap gap-2">
                <Button className="px-3 py-1 text-xs" onClick={() => setSheetFor("person")} disabled={!id} title={id ? undefined : "Guardá la serie primero"}>
                  + Personaje con hoja
                </Button>
                <Button className="px-3 py-1 text-xs" onClick={() => setSheetFor("place")} disabled={!id} title={id ? undefined : "Guardá la serie primero"}>
                  + Lugar con hoja
                </Button>
                <Button variant="secondary" className="px-3 py-1 text-xs" onClick={() => addMember("character")}>
                  + Personaje
                </Button>
                <Button variant="secondary" className="px-3 py-1 text-xs" onClick={() => addMember("place")}>
                  + Lugar
                </Button>
                <Button variant="secondary" className="px-3 py-1 text-xs" onClick={() => addMember("product")}>
                  + Producto
                </Button>
              </div>
              {!id && <p className="text-xs text-muted">Las imágenes se suben después de guardar la serie.</p>}
            </div>
          </Field>
        </>
      )}

      {fields.type === "software" && (
        <Field
          label="Pantallas reales de la app"
          group
          hint="Capturas reales (celular y PC), una por función. La IA no puede dibujar la interfaz: las tomas que muestran la app usan estas capturas tal cual."
        >
          <div className="space-y-2">
            <ul className="space-y-2">
              {fields.cast
                .filter((m) => m.kind === "screen")
                .map((m) => (
                  <CastCard
                    key={m.id}
                    member={m}
                    seriesId={id}
                    version={version}
                    onChange={(next) => set("cast", fields.cast.map((x) => (x.id === m.id ? next : x)))}
                    onRemove={() => set("cast", fields.cast.filter((x) => x.id !== m.id))}
                    onImage={(file) => memberImage(m, file)}
                    onPuppetFiles={(files) => memberPuppetFiles(m, files)}
                    onPuppetReplace={(layers) => memberPuppetReplace(m, layers)}
                    onPuppetRemove={(index) => memberPuppetRemove(m, index)}
                    onPuppetArranged={(next) => memberPuppetArranged(next)}
                    onRigFile={(file) => memberRigFile(m, file)}
                  />
                ))}
            </ul>
            <Button variant="secondary" className="px-3 py-1 text-xs" onClick={() => addMember("screen")}>
              + Pantalla real
            </Button>
          </div>
        </Field>
      )}

      {!music && (
        <>
          <Field label="La historia que contamos (opcional)" hint="El hilo de la serie. Ej.: el loop diario del kiosco.">
            {text("story")}
          </Field>

          <div className="grid gap-5 md:grid-cols-2">
            <Field label="El Malo" hint="El dolor personificado: quién es y cómo aparece.">
              {text("bad")}
            </Field>
            <Field label="El Bueno" hint="Cómo gana: el producto, la rutina, la marca.">
              {text("good")}
            </Field>
          </div>
        </>
      )}

      <Field label="Reglas de la serie (opcional)" hint="Lo que nunca se dice o se muestra, el tono, los límites.">
        {text("rules")}
      </Field>
      <Field label="Quién mira">{text("audience", 2)}</Field>
      <Field label="Otras notas (opcional)" hint="Precios, personajes fijos, datos verificados, lo que quieras que la IA sepa siempre.">
        {text("other", 4)}
      </Field>

      {error && <Notice tone="error">{error}</Notice>}

      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
        <Button onClick={save} disabled={busy !== null || !fields.name.trim()}>
          {busy === "save" ? (
            <>
              <Spinner /> Guardando…
            </>
          ) : (
            "Guardar serie"
          )}
        </Button>
        <Button variant="secondary" onClick={onClose} disabled={busy !== null}>
          Cancelar
        </Button>
        {id && (
          <Button variant="ghost" className="ml-auto text-neg" onClick={remove} disabled={busy !== null}>
            Borrar serie
          </Button>
        )}
      </div>
    </section>
  );
}
