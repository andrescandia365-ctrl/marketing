// "Imagen fija" (IDEAS 34): one picture where the pain and the relief meet. Menu of concepts by family → the picked
// concept's prompt for Grok (no text in the picture, clear space for it) → the person uploads the picture → the app
// sets the words with the brand's fonts and colours, out of the platform's band and the watermark's corner → many
// exports at once ("Variantes de texto") in 9:16, 4:5 and 1:1, plus the share caption. Everything works with no AI key:
// "Copiar el prompt para Opus" and a box to paste the reply (strict format, shared/still.ts). With a key, the same
// prompt goes to the writer.
import { useEffect, useMemo, useRef, useState } from "react";
import type { Brief, SeriesInfo, ToolInfo } from "../../shared/schema.ts";
import { SERIES_TYPE_LABEL, type SeriesFields } from "../../shared/series.ts";
import {
  FAMILY_HOW,
  FAMILY_LABEL,
  PROOF_FAMILIES,
  STILL_FORMAT_HELP,
  STILL_PICTURE,
  addCopies,
  conceptBlocks,
  migrateStill,
  nextConceptId,
  parseStillPaste,
  pickConcept,
  stillChecks,
  stillCopyPrompt,
  stillImagePrompt,
  stillMarkdown,
  stillMenuPrompt,
  stillPromptSlots,
  type StillBrand,
  type StillConcept,
  type StillPiece,
} from "../../shared/still.ts";
import { STILL_SAMPLE_COPIES, STILL_SAMPLE_MENU, STILL_SAMPLE_PRODUCT } from "../../shared/stillSample.ts";
import {
  ALIGN_LABEL,
  ALIGNS,
  CORNER_LABEL,
  CORNERS,
  MAX_VARIANTS,
  PLACEMENT_LABEL,
  PLACEMENTS,
  STILL_FORMAT_INFO,
  STILL_FORMATS,
  ctaLines,
  exportJobs,
  gridCount,
  headlineLines,
  variantGrid,
  type Corner,
  type StillFormat,
  type StillVariant,
} from "../../shared/stillLayout.ts";
import { storeZip } from "../../shared/storeZip.ts";
import { api, projectFileUrl } from "../lib/api.ts";
import { copyText } from "../lib/files.ts";
import { brandFontsKey, ensureBrandFonts } from "../lib/fonts.ts";
import { download, slug } from "../lib/markdown.ts";
import { canvasBlob, drawStill, layoutOnly } from "../lib/stillDraw.ts";
import { Button, Field, Notice, Segmented, Spinner, inputClass } from "./ui.tsx";
import { FloorTag } from "./EmbudoPicker.tsx";

export type StillOpen = { key: string; initial: { piece: unknown } | null };

type Props = {
  projectId: string | null;
  brief: Brief;
  series: SeriesInfo;
  tools: ToolInfo[];
  initial: StillOpen["initial"];
  aiReady: boolean;
  onSaveStatus: (status: "saving" | "saved" | "error") => void;
};

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const pct = (v: number) => Math.round(v * 100);

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("No se pudo leer esa imagen."));
    img.src = src;
  });
}

// A box to paste Opus' reply in: read with the strict parser, problems listed by block.
function PasteBox({ label, onRead }: { label: string; onRead: (text: string) => string[] }) {
  const [text, setText] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  return (
    <div className="space-y-1">
      <textarea
        className={`${inputClass} font-mono text-[11px]`}
        rows={5}
        value={text}
        placeholder={label}
        aria-label={label}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          className="px-3 py-1 text-xs"
          disabled={!text.trim()}
          onClick={() => {
            const errs = onRead(text);
            setErrors(errs);
            if (!errs.length) setText("");
          }}
        >
          Leer lo pegado
        </Button>
        <details className="text-xs text-muted">
          <summary className="cursor-pointer">Formato</summary>
          <p className="mt-1">{STILL_FORMAT_HELP}</p>
        </details>
      </div>
      {errors.length > 0 && (
        <ul className="list-disc pl-4 text-xs text-neg">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ConceptCard({ c, picked, onPick, onChange, onRemove }: { c: StillConcept; picked: boolean; onPick: () => void; onChange: (c: StillConcept) => void; onRemove: () => void }) {
  const blocks = conceptBlocks(c);
  const proof = PROOF_FAMILIES.includes(c.family);
  return (
    <li className={`space-y-1 rounded-lg border p-3 text-xs ${picked ? "border-ink bg-white" : "border-line bg-white/60"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded bg-paper px-1.5 py-0.5 font-semibold">{FAMILY_LABEL[c.family]}</span>
        <span className="text-muted">{c.problem}</span>
        <Button variant="ghost" className="ml-auto px-2 py-0.5 text-xs text-neg" onClick={onRemove}>
          Quitar
        </Button>
      </div>
      <p className="text-sm font-semibold">{c.title || c.copy.headline}</p>
      <p>
        <b>Dolor:</b> {c.pain}
      </p>
      <p>
        <b>Alivio:</b> {c.relief}
      </p>
      <p>
        <b>Detalle que toca:</b> {c.touching}
      </p>
      <p>
        <b>Texto:</b> «{c.copy.headline}»{c.copy.sub ? ` / «${c.copy.sub}»` : ""}
        {c.copy.cta ? ` · ${c.copy.cta}` : ""} · {PLACEMENT_LABEL[c.copy.placement].toLowerCase()}
      </p>
      {proof && (
        <div className="space-y-1 rounded bg-paper p-2">
          <p className="text-muted">{FAMILY_HOW[c.family]}.</p>
          <input
            className={`${inputClass} py-1 text-xs`}
            value={c.proof}
            placeholder={c.family === "press" ? "El link de la nota real" : c.family === "offer" ? "La oferta real, con condiciones y fechas" : "La cita textual del cliente real"}
            aria-label="Prueba real"
            onChange={(e) => onChange({ ...c, proof: e.target.value, proofOk: false })}
          />
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={c.proofOk} disabled={!c.proof.trim()} onChange={(e) => onChange({ ...c, proofOk: e.target.checked })} />
            Es real{c.family === "testimonial" ? " y el cliente dio permiso" : ""}
          </label>
        </div>
      )}
      {c.verify.length > 0 && (
        <ul className="list-disc pl-4 text-amber-700">
          {c.verify.map((v) => (
            <li key={v}>{v}</li>
          ))}
        </ul>
      )}
      {blocks.map((b) => (
        <p key={b} className="text-neg">
          {b}
        </p>
      ))}
      <Button variant={picked ? "primary" : "secondary"} className="px-3 py-1 text-xs" onClick={onPick}>
        {picked ? "Elegido" : "Elegir este"}
      </Button>
    </li>
  );
}

export function StillStudio({ projectId, brief, series, tools, initial, aiReady, onSaveStatus }: Props) {
  const toolKeepOut = (tools.find((t) => t.id === brief.tool) ?? tools.find((t) => t.watermark))?.watermark ?? null;
  const [piece, setPiece] = useState<StillPiece>(() => migrateStill(initial?.piece, toolKeepOut));
  const [fields, setFields] = useState<SeriesFields | null>(null);
  const [picture, setPicture] = useState<HTMLImageElement | null>(null);
  const [fontsReady, setFontsReady] = useState(false);
  const [busy, setBusy] = useState<"" | "menu" | "copy" | "upload" | "export">("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [shownPrompt, setShownPrompt] = useState<"" | "menu" | "copy">("");
  const [format, setFormat] = useState<StillFormat>("9x16");
  const [selected, setSelected] = useState(0);
  const [showKeepOut, setShowKeepOut] = useState(true);
  const [progress, setProgress] = useState("");
  const big = useRef<HTMLCanvasElement>(null);
  const thumbs = useRef<(HTMLCanvasElement | null)[]>([]);

  useEffect(() => {
    api
      .seriesFields(series.id)
      .then((r) => setFields(r.fields))
      .catch(() => setFields(null));
  }, [series.id]);

  // The brand fonts: the export waits for them and is blocked if they do not load.
  useEffect(() => {
    let alive = true;
    ensureBrandFonts(series.id, series.brand).then((missing) => {
      if (alive) setFontsReady(!missing.length);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series.id, brandFontsKey(series.brand)]);

  // The saved picture, read back from the project folder.
  useEffect(() => {
    if (!projectId || !piece.picture || picture) return;
    loadImage(projectFileUrl(projectId, piece.picture.file))
      .then(setPicture)
      .catch(() => setError("No se pudo leer la imagen guardada. Subila de nuevo."));
    // Only when a project opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const concept = piece.concepts.find((c) => c.id === piece.picked) ?? null;
  const variants: StillVariant[] = useMemo(
    () => variantGrid(headlineLines(piece.headlines), ctaLines(piece.ctas), piece.placements, piece.align),
    [piece.headlines, piece.ctas, piece.placements, piece.align],
  );
  const wanted = gridCount(headlineLines(piece.headlines).length, ctaLines(piece.ctas).length, piece.placements.length);
  const pictureSize = piece.picture ? { w: piece.picture.w, h: piece.picture.h } : { w: 1080, h: 1920 };
  const current = variants[Math.min(selected, Math.max(0, variants.length - 1))];

  const stillBrand: StillBrand = {
    name: series.name,
    type: SERIES_TYPE_LABEL[series.type],
    what: fields?.what ?? series.tagline,
    audience: fields?.audience ?? "",
    rules: fields?.rules ?? "",
    bad: fields?.bad ?? "",
    good: fields?.good ?? "",
    worksToday: fields?.worksToday ?? [],
    practices: fields?.practices ?? [],
  };
  const briefBits = { product: brief.product, angle: brief.angle, notes: brief.notes, tone: brief.tone, language: brief.language, funnel: brief.funnel };
  const menuPrompt = () => stillMenuPrompt({ brand: stillBrand, brief: briefBits, references: fields?.references ?? [] });
  const copyPrompt = () => (concept ? stillCopyPrompt({ brand: stillBrand, brief: briefBits, concept }) : "");
  const imagePrompt = concept ? stillImagePrompt(concept, { look: series.look, brand: series.brand }) : "";

  // Autosave.
  useEffect(() => {
    if (!projectId) return;
    onSaveStatus("saving");
    const timer = setTimeout(() => {
      api
        .saveProject(projectId, { version: 1, kind: "still", step: "still", pieceBrief: brief, still: piece }, stillMarkdown(piece, { prompt: imagePrompt, variants, funnel: brief.funnel }))
        .then(() => onSaveStatus("saved"))
        .catch((e) => {
          onSaveStatus("error");
          setError(`No se pudo guardar el proyecto: ${message(e)}`);
        });
    }, 800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, piece]);

  // Every variant in every chosen format, laid out (no pixels) to check before exporting.
  const layouts = useMemo(() => {
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) return [];
    const formats = STILL_FORMATS.filter((f) => piece.formats.includes(f));
    return variants.flatMap((v) =>
      formats.map((f) => {
        const r = layoutOnly(ctx, { format: f, pictureSize, fit: piece.fit, keepOut: piece.keepOut, copy: v, brand: series.brand });
        return { label: `Variante ${v.n}, ${f.replace("x", ":")}`, fits: r.layout.fits, problems: r.layout.problems, whole: r.watermarkWhole };
      }),
    );
    // fontsReady: the measures change once the brand fonts are in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variants, piece.formats, piece.fit, piece.keepOut, pictureSize.w, pictureSize.h, series.brand, fontsReady]);

  const problems = stillChecks({
    concept,
    variants,
    layouts,
    picture: Boolean(picture && piece.picture),
    fontsLoaded: fontsReady,
    watermarkWhole: layouts.every((l) => l.whole),
    caption: piece.caption,
    references: fields?.references ?? [],
    brandName: series.name,
    funnel: brief.funnel,
    proofs: series.proofs,
    landing: series.landing,
  }).filter((p) => (p.id.startsWith("embudo:") ? !piece.dismissed.includes(p.id) : p.blocking || !piece.dismissed.includes(p.id)));
  const blocking = problems.filter((p) => p.blocking);
  const jobs = exportJobs(variants, piece.formats, piece.fileType);

  // The previews: the selected variant big, and every variant small.
  useEffect(() => {
    const base = { format, picture, pictureSize, fit: piece.fit, keepOut: piece.keepOut, brand: series.brand, showKeepOut };
    if (big.current && current) drawStill(big.current, { ...base, copy: current, scale: 360 / 1080 });
    variants.forEach((v, i) => {
      const c = thumbs.current[i];
      if (c) drawStill(c, { ...base, copy: v, scale: 120 / 1080 });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [format, picture, piece.fit, piece.keepOut, variants, current, series.brand, showKeepOut, fontsReady, pictureSize.w, pictureSize.h]);

  const update = (patch: Partial<StillPiece>) => setPiece((p) => ({ ...p, ...patch }));

  async function copy(text: string, what: string) {
    try {
      await copyText(text);
      setStatus(`${what} copiado.`);
    } catch (e) {
      setError(message(e));
    }
  }

  // Concepts from a reply (pasted, the writer's or the sample) join the menu.
  function readMenu(text: string): string[] {
    const r = parseStillPaste(text, piece.align, nextConceptId(piece.concepts));
    if (r.concepts.length) {
      setPiece((p) => ({ ...p, concepts: [...p.concepts, ...r.concepts] }));
      setStatus(`${r.concepts.length} concepto${r.concepts.length === 1 ? "" : "s"} al menú.`);
    }
    if (r.copies.length) setPiece((p) => addCopies(p, r.copies));
    if (!r.concepts.length && !r.copies.length && !r.errors.length) return ["No había nada para cargar."];
    return r.errors;
  }
  function readCopies(text: string): string[] {
    const r = parseStillPaste(text, piece.align);
    if (r.copies.length) {
      setPiece((p) => addCopies(p, r.copies));
      setStatus(`${r.copies.length} texto${r.copies.length === 1 ? "" : "s"} sumado${r.copies.length === 1 ? "" : "s"} a las variantes.`);
    }
    if (r.concepts.length) return [...r.errors, "Eso son conceptos: pegalos arriba, en el menú."];
    return r.copies.length || r.errors.length ? r.errors : ["No había nada para cargar."];
  }

  async function askWriter(kind: "menu" | "copy") {
    setBusy(kind);
    setError("");
    try {
      const reply = await api.stillAsk(kind === "menu" ? menuPrompt() : copyPrompt());
      if (reply.demo) {
        setStatus("Sin IA conectada: cargué la muestra de Máshogar.");
        (kind === "menu" ? readMenu : readCopies)(kind === "menu" ? STILL_SAMPLE_MENU : STILL_SAMPLE_COPIES);
        return;
      }
      const errs = (kind === "menu" ? readMenu : readCopies)(reply.text);
      if (errs.length) setError(`La respuesta de la IA tenía problemas: ${errs.join(" ")}`);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy("");
    }
  }

  async function uploadPicture(file: File) {
    setBusy("upload");
    setError("");
    const url = URL.createObjectURL(file);
    try {
      const img = await loadImage(url);
      if (img.naturalWidth < 400 || img.naturalHeight < 400) throw new Error("La imagen es muy chica: bajala de Grok en su tamaño completo.");
      setPicture(img);
      let saved = "";
      if (projectId) saved = (await api.uploadMedia(projectId, STILL_PICTURE, "image", file)).file;
      update({ picture: { file: saved, w: img.naturalWidth, h: img.naturalHeight } });
      const ratio = img.naturalHeight / img.naturalWidth;
      setStatus(
        Math.abs(ratio - 16 / 9) > 0.05
          ? "La imagen no es 9:16: en 9:16 va con bandas del color de la marca (nunca se recorta la marca de agua)."
          : "Imagen cargada. Fijate que la marca de agua quede dentro del recuadro rojo.",
      );
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy("");
    }
  }

  async function exportAll() {
    if (blocking.length || !picture) return;
    setBusy("export");
    setError("");
    try {
      await document.fonts?.ready;
      const canvas = document.createElement("canvas");
      const files: { name: string; data: Uint8Array }[] = [];
      for (const [i, job] of jobs.entries()) {
        setProgress(`${i + 1} de ${jobs.length}`);
        const report = drawStill(canvas, { format: job.format, picture, pictureSize, fit: piece.fit, keepOut: piece.keepOut, copy: job.variant, brand: series.brand });
        if (!report.layout.fits || !report.watermarkWhole) throw new Error(`Variante ${job.variant.n} (${job.format}): ${report.layout.problems.join(" ") || "la marca de agua se corta"}`);
        const blob = await canvasBlob(canvas, piece.fileType);
        if (projectId) await api.saveStillExport(projectId, job.file, blob);
        files.push({ name: job.file, data: new Uint8Array(await blob.arrayBuffer()) });
      }
      if (projectId) await api.pruneStillExports(projectId, jobs.map((j) => j.file));
      const base = slug(concept?.problem || concept?.title || "imagen-fija");
      if (files.length === 1) download(new Blob([files[0].data as BlobPart]), `${base}-${files[0].name}`);
      else {
        const caption = new TextEncoder().encode(`${piece.caption.trim()}\n`);
        const zip = storeZip([...files, { name: "texto-para-compartir.txt", data: caption }]);
        download(new Blob([zip as BlobPart], { type: "application/zip" }), `${base}-imagenes.zip`);
      }
      update({ exports: jobs.map((j) => j.file) });
      setStatus(`${files.length} ${files.length === 1 ? "imagen" : "imágenes"} exportada${files.length === 1 ? "" : "s"}${projectId ? " y guardadas en la carpeta del proyecto" : ""}.`);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy("");
      setProgress("");
    }
  }

  const slots = concept ? stillPromptSlots(concept, { look: series.look, brand: series.brand }) : [];

  return (
    <section className="space-y-8">
      <header className="space-y-1">
        <h2 className="flex flex-wrap items-center gap-2 text-xl font-semibold">
          Imagen fija · {series.name} <FloorTag floor={brief.funnel} />
        </h2>
        <p className="text-sm text-muted">
          Una sola imagen donde se encuentran el dolor y el alivio. La imagen va sin texto (Grok escribe mal); las palabras las pone la app con las letras y los colores
          de la marca.
        </p>
      </header>

      {error && <Notice tone="error">{error}</Notice>}
      {status && <p className="text-sm text-muted">{status}</p>}

      {/* 1. The concept menu */}
      <div className="space-y-3">
        <h3 className="font-semibold">1. Menú de conceptos</h3>
        <p className="text-sm text-muted">
          Copiá el prompt, pegalo en claude.ai (Opus) y traé la respuesta acá. Usa la serie, el brief y las fichas de tus anuncios que funcionan (Editar serie →
          Referencias).
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" className="px-3 py-1 text-xs" onClick={() => copy(menuPrompt(), "Prompt del menú")}>
            Copiar el prompt para Opus
          </Button>
          <Button variant="ghost" className="px-3 py-1 text-xs" onClick={() => setShownPrompt((s) => (s === "menu" ? "" : "menu"))}>
            {shownPrompt === "menu" ? "Ocultar el prompt" : "Ver el prompt"}
          </Button>
          {aiReady ? (
            <Button variant="secondary" className="px-3 py-1 text-xs" disabled={busy !== ""} onClick={() => askWriter("menu")}>
              {busy === "menu" ? <Spinner /> : null} Que la IA escriba los conceptos
            </Button>
          ) : (
            <Button variant="ghost" className="px-3 py-1 text-xs" onClick={() => readMenu(STILL_SAMPLE_MENU)}>
              Ver la muestra (Máshogar)
            </Button>
          )}
        </div>
        {!aiReady && <p className="text-xs text-muted">La muestra es de Máshogar ({STILL_SAMPLE_PRODUCT}).</p>}
        {shownPrompt === "menu" && <textarea className={`${inputClass} font-mono text-[11px]`} rows={10} readOnly value={menuPrompt()} aria-label="Prompt del menú" onFocus={(e) => e.target.select()} />}
        <PasteBox label="Pegá acá la respuesta de Opus (los bloques «## Concepto N»)" onRead={readMenu} />
        {piece.concepts.length > 0 && (
          <ul className="grid gap-3 md:grid-cols-2">
            {piece.concepts.map((c) => (
              <ConceptCard
                key={c.id}
                c={c}
                picked={c.id === piece.picked}
                onPick={() => setPiece((p) => pickConcept(p, c.id))}
                onChange={(next) => setPiece((p) => ({ ...p, concepts: p.concepts.map((x) => (x.id === c.id ? next : x)) }))}
                onRemove={() => setPiece((p) => ({ ...p, concepts: p.concepts.filter((x) => x.id !== c.id), picked: p.picked === c.id ? null : p.picked }))}
              />
            ))}
          </ul>
        )}
      </div>

      {/* 2. The prompt for Grok */}
      {concept && (
        <div className="space-y-2">
          <h3 className="font-semibold">2. Prompt para Grok</h3>
          <p className="text-sm text-muted">
            En el orden de los casilleros del playbook. Hacé la imagen en 9:16, sin texto, y bajala entera: la app nunca corta ni tapa la marca de agua.
          </p>
          <ol className="space-y-0.5 text-xs">
            {slots.map((s) => (
              <li key={s.n} className={s.inPrompt ? "" : "text-muted"}>
                <b>
                  {s.n}. {s.label}:
                </b>{" "}
                {s.text}
              </li>
            ))}
          </ol>
          <textarea className={`${inputClass} font-mono text-[11px]`} rows={5} readOnly value={imagePrompt} aria-label="Prompt para Grok" onFocus={(e) => e.target.select()} />
          <Button variant="secondary" className="px-3 py-1 text-xs" onClick={() => copy(imagePrompt, "Prompt para Grok")}>
            Copiar el prompt para Grok
          </Button>
        </div>
      )}

      {/* 3. The picture */}
      {concept && (
        <div className="space-y-2">
          <h3 className="font-semibold">3. Subir la imagen</h3>
          <div className="flex flex-wrap items-center gap-3">
            <label className="cursor-pointer rounded-lg border border-line px-3 py-1 text-sm hover:bg-paper">
              {busy === "upload" ? <Spinner /> : null} {piece.picture ? "Cambiar la imagen" : "Elegir la imagen"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void uploadPicture(f);
                  e.target.value = "";
                }}
              />
            </label>
            {piece.picture && (
              <span className="text-xs text-muted">
                {piece.picture.w} × {piece.picture.h} px{piece.picture.file ? ` · ${piece.picture.file}` : ""}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-end gap-4 text-xs">
            <Field label="Marca de agua de la herramienta" group hint="[NO SEGURO] La esquina sale del perfil de Grok: mirá tu imagen y corregila si hace falta.">
              <div className="flex flex-wrap items-center gap-2">
                <select
                  className={`${inputClass} w-auto py-1 text-xs`}
                  value={piece.keepOut.corner}
                  aria-label="Esquina de la marca de agua"
                  onChange={(e) => update({ keepOut: { ...piece.keepOut, corner: e.target.value as Corner | "none", w: piece.keepOut.w || 0.22, h: piece.keepOut.h || 0.07 } })}
                >
                  {CORNERS.map((c) => (
                    <option key={c} value={c}>
                      {CORNER_LABEL[c]}
                    </option>
                  ))}
                  <option value="none">no tiene</option>
                </select>
                {piece.keepOut.corner !== "none" && (
                  <>
                    <label className="flex items-center gap-1">
                      ancho
                      <input
                        type="number"
                        min={5}
                        max={60}
                        className={`${inputClass} w-16 py-1 text-xs`}
                        value={pct(piece.keepOut.w)}
                        onChange={(e) => update({ keepOut: { ...piece.keepOut, w: Math.min(60, Math.max(5, Number(e.target.value) || 5)) / 100 } })}
                      />
                      %
                    </label>
                    <label className="flex items-center gap-1">
                      alto
                      <input
                        type="number"
                        min={3}
                        max={60}
                        className={`${inputClass} w-16 py-1 text-xs`}
                        value={pct(piece.keepOut.h)}
                        onChange={(e) => update({ keepOut: { ...piece.keepOut, h: Math.min(60, Math.max(3, Number(e.target.value) || 3)) / 100 } })}
                      />
                      %
                    </label>
                  </>
                )}
              </div>
            </Field>
            <Field label="En 4:5 y 1:1" group>
              <Segmented
                value={piece.fit}
                onChange={(v) => update({ fit: v })}
                options={[
                  { value: "full", label: "Cuadro completo" },
                  { value: "crop", label: "Recortar (sin cortar la marca de agua)" },
                ]}
              />
            </Field>
          </div>
        </div>
      )}

      {/* 4. The words: variants */}
      {concept && (
        <div className="space-y-3">
          <h3 className="font-semibold">4. Variantes de texto</h3>
          <p className="text-sm text-muted">
            Una imagen, muchos textos: cada título × cada llamado × cada lugar es una variante (hasta {MAX_VARIANTS}).
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Títulos" hint="Uno por línea. Para una bajada: «título | bajada».">
              <textarea className={inputClass} rows={5} value={piece.headlines} onChange={(e) => update({ headlines: e.target.value })} />
            </Field>
            <Field label="Llamados" hint="Uno por línea (un solo pedido cada uno). Vacío: sin llamado.">
              <textarea className={inputClass} rows={5} value={piece.ctas} onChange={(e) => update({ ctas: e.target.value })} />
            </Field>
          </div>
          <div className="flex flex-wrap items-end gap-4 text-sm">
            <Field label="Lugar del texto" group>
              <div className="flex flex-wrap gap-3">
                {PLACEMENTS.map((p) => (
                  <label key={p} className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={piece.placements.includes(p)}
                      onChange={(e) => update({ placements: e.target.checked ? [...piece.placements, p] : piece.placements.filter((x) => x !== p) })}
                    />
                    {PLACEMENT_LABEL[p]}
                  </label>
                ))}
              </div>
            </Field>
            <Field label="Alineación" group>
              <Segmented value={piece.align} onChange={(v) => update({ align: v })} options={ALIGNS.map((a) => ({ value: a, label: ALIGN_LABEL[a] }))} />
            </Field>
          </div>
          <div className="space-y-1 rounded-lg border border-line p-2">
            <p className="text-xs font-semibold">Más textos con Opus</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" className="px-3 py-1 text-xs" onClick={() => copy(copyPrompt(), "Prompt de textos")}>
                Copiar el prompt para Opus
              </Button>
              <Button variant="ghost" className="px-3 py-1 text-xs" onClick={() => setShownPrompt((s) => (s === "copy" ? "" : "copy"))}>
                {shownPrompt === "copy" ? "Ocultar el prompt" : "Ver el prompt"}
              </Button>
              {aiReady ? (
                <Button variant="secondary" className="px-3 py-1 text-xs" disabled={busy !== ""} onClick={() => askWriter("copy")}>
                  {busy === "copy" ? <Spinner /> : null} Que la IA escriba más textos
                </Button>
              ) : (
                <Button variant="ghost" className="px-3 py-1 text-xs" onClick={() => readCopies(STILL_SAMPLE_COPIES)}>
                  Sumar textos de muestra
                </Button>
              )}
            </div>
            {shownPrompt === "copy" && <textarea className={`${inputClass} font-mono text-[11px]`} rows={8} readOnly value={copyPrompt()} aria-label="Prompt de textos" onFocus={(e) => e.target.select()} />}
            <PasteBox label="Pegá acá los textos de Opus (los bloques «## Texto N»)" onRead={readCopies} />
          </div>
          {wanted > MAX_VARIANTS && <p className="text-xs text-amber-700">Salen {wanted} combinaciones: se usan las primeras {MAX_VARIANTS}.</p>}

          <div className="flex flex-wrap items-center gap-3">
            <Segmented value={format} onChange={setFormat} options={STILL_FORMATS.map((f) => ({ value: f, label: f.replace("x", ":") }))} />
            <label className="flex items-center gap-1 text-xs">
              <input type="checkbox" checked={showKeepOut} onChange={(e) => setShowKeepOut(e.target.checked)} />
              Ver la marca de agua (solo en la vista previa)
            </label>
          </div>
          {variants.length > 0 ? (
            <div className="flex flex-wrap items-start gap-4">
              <canvas ref={big} className="rounded border border-line" style={{ width: 360 }} aria-label="Vista previa" />
              <ul className="flex max-w-xl flex-wrap gap-2">
                {variants.map((v, i) => (
                  <li key={`${v.n}-${v.headline}-${v.cta}-${v.placement}`}>
                    <button type="button" className={`rounded border p-0.5 ${i === selected ? "border-ink" : "border-line"}`} onClick={() => setSelected(i)} title={`${v.headline} · ${v.cta}`}>
                      <canvas
                        ref={(el) => {
                          thumbs.current[i] = el;
                        }}
                        style={{ width: 80 }}
                      />
                      <span className="block text-[10px] text-muted">{v.n}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-muted">Escribí al menos un título.</p>
          )}
        </div>
      )}

      {/* 5. Checks and export */}
      {concept && (
        <div className="space-y-3">
          <h3 className="font-semibold">5. Revisar y exportar</h3>
          <Field label="Texto para compartir" hint="1 a 3 oraciones, de esta pieza, para publicar tal cual.">
            <textarea className={inputClass} rows={2} value={piece.caption} onChange={(e) => update({ caption: e.target.value })} />
          </Field>
          <Button variant="ghost" className="px-3 py-1 text-xs" disabled={!piece.caption.trim()} onClick={() => copy(piece.caption, "Texto para compartir")}>
            Copiar el texto para compartir
          </Button>
          {problems.length > 0 ? (
            <ul className="space-y-1 text-sm">
              {problems.map((p) => (
                <li key={p.id} className={p.blocking ? "text-neg" : "text-amber-700"}>
                  <b>{p.label}:</b> {p.detail}
                  {(!p.blocking || p.id.startsWith("embudo:")) && (
                    <Button variant="ghost" className="ml-2 px-2 py-0 text-xs" onClick={() => update({ dismissed: [...piece.dismissed, p.id] })}>
                      No es un problema
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-good">Todo en orden: el texto entra legible, fuera de la marca de agua y de lo que tapa la plataforma.</p>
          )}
          <div className="flex flex-wrap items-end gap-4 text-sm">
            <Field label="Formatos" group>
              <div className="flex flex-wrap gap-3">
                {STILL_FORMATS.map((f) => (
                  <label key={f} className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={piece.formats.includes(f)}
                      onChange={(e) => update({ formats: e.target.checked ? [...piece.formats, f] : piece.formats.filter((x) => x !== f) })}
                    />
                    {STILL_FORMAT_INFO[f].label}
                  </label>
                ))}
              </div>
            </Field>
            <Field label="Archivo" group>
              <Segmented
                value={piece.fileType}
                onChange={(v) => update({ fileType: v })}
                options={[
                  { value: "png", label: "PNG" },
                  { value: "jpg", label: "JPG" },
                ]}
              />
            </Field>
          </div>
          <Button disabled={busy !== "" || blocking.length > 0 || !jobs.length} onClick={exportAll}>
            {busy === "export" ? (
              <>
                <Spinner /> Exportando {progress}…
              </>
            ) : (
              `Exportar ${jobs.length} ${jobs.length === 1 ? "imagen" : "imágenes"}`
            )}
          </Button>
          {piece.exports.length > 0 && <p className="text-xs text-muted">Última exportación: {piece.exports.length} archivos en la carpeta del proyecto (fija-NN-formato).</p>}
        </div>
      )}
    </section>
  );
}
