// "Estáticos de la tanda" (Imagen fija, paso 3): every approved hook as a static ad. Per hook: the Grok prompt (no
// text in the picture, clear space for the words), an upload slot for the picture, the hook's on-screen line (and
// optionally a CTA) set by the app with the brand's fonts and colours ("Variantes de texto": headlines × calls ×
// placements), the same checks as "Imagen fija", and the exports in 9:16, 4:5 and 1:1 saved to
// publicidad/<series>/estaticos/. All of it works with no AI key: the prompts are copied to Grok by hand.
import { useEffect, useMemo, useRef, useState } from "react";
import { LEVEL_INFO, type AdsState, type Cta, type Hook, type HookStatic, type ReviewFlag } from "../../../shared/ads.ts";
import {
  adoptSaved,
  allStaticPrompts,
  ctaWords,
  flushInOrder,
  hookHeadline,
  keepOutOf,
  staticChecks,
  staticJobs,
  staticOf,
  staticPrompt,
  staticVariants,
} from "../../../shared/adsStatic.ts";
import type { Reference } from "../../../shared/reference.ts";
import type { SeriesInfo, ToolInfo } from "../../../shared/schema.ts";
import type { StillProblem } from "../../../shared/still.ts";
import {
  ALIGN_LABEL,
  ALIGNS,
  CORNER_LABEL,
  CORNERS,
  PLACEMENT_LABEL,
  PLACEMENTS,
  STILL_FORMAT_INFO,
  STILL_FORMATS,
  type Corner,
  type KeepOut,
  type StillFormat,
  type StillVariant,
} from "../../../shared/stillLayout.ts";
import { storeZip } from "../../../shared/storeZip.ts";
import { ads as adsApi, adsFileUrl, api } from "../../lib/api.ts";
import { copyText } from "../../lib/files.ts";
import { ensureFont, fontLoaded } from "../../lib/fonts.ts";
import { download } from "../../lib/markdown.ts";
import { canvasBlob, drawStill, layoutOnly, previewKey } from "../../lib/stillDraw.ts";
import { Button, Field, Notice, Segmented, Spinner, inputClass } from "../ui.tsx";
import { LevelChip } from "./pieces.tsx";

type Props = {
  series: SeriesInfo;
  state: AdsState;
  tools: ToolInfo[];
  flags: ReviewFlag[] | null;
  folder: string;
  onState: (state: AdsState) => void;
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

type Review = { variants: StillVariant[]; problems: StillProblem[]; blocking: StillProblem[]; keepOut: KeepOut; jobs: ReturnType<typeof staticJobs> };

export function StaticsPanel({ series, state, tools, flags, folder, onState }: Props) {
  const toolKeepOut = (tools.find((t) => /grok/i.test(t.id) && t.watermark) ?? tools.find((t) => t.watermark))?.watermark ?? null;
  const [local, setLocal] = useState<Record<string, HookStatic>>(state.statics);
  const [pictures, setPictures] = useState<Record<string, HTMLImageElement>>({});
  const [references, setReferences] = useState<Reference[]>([]);
  const [fontsReady, setFontsReady] = useState(false);
  const [copied, setCopied] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string>("");
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const pending = useRef(new Map<string, Partial<HookStatic>>());
  // Saves on their way, by hook.
  const saving = useRef(new Map<string, number>());
  const measure = useMemo(() => document.createElement("canvas").getContext("2d"), []);

  const hooks = state.hooks.filter((h) => h.status === "approved");
  const others = state.hooks.filter((h) => h.status === "pending").length;
  const ctas = state.ctas.filter((c) => c.status === "approved");

  useEffect(() => {
    api
      .seriesFields(series.id)
      .then((r) => setReferences(r.fields.references ?? []))
      .catch(() => setReferences([]));
  }, [series.id]);

  useEffect(() => {
    let alive = true;
    Promise.all([ensureFont(series.brand.displayFont), ensureFont(series.brand.uiFont)]).then(() => {
      if (alive) setFontsReady(fontLoaded(series.brand.displayFont) && fontLoaded(series.brand.uiFont));
    });
    return () => {
      alive = false;
    };
  }, [series.brand.displayFont, series.brand.uiFont]);

  // The saved pictures, read back from estaticos/.
  useEffect(() => {
    for (const [id, st] of Object.entries(state.statics)) {
      if (!st.picture || pictures[id]) continue;
      loadImage(adsFileUrl(series.id, st.picture.file))
        .then((img) => setPictures((p) => ({ ...p, [id]: img })))
        .catch(() => undefined);
    }
    // Only when the panel opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series.id]);

  // Unsaved changes are sent when the panel closes, one after another, and the studio keeps what was saved: the panel
  // opens again with it.
  useEffect(() => {
    const t = timers.current;
    const p = pending.current;
    return () => {
      const out: [string, Partial<HookStatic>][] = [];
      for (const [id, timer] of t) {
        clearTimeout(timer);
        const patch = p.get(id);
        if (patch) out.push([id, patch]);
      }
      void flushInOrder(out, (id, patch) => adsApi.patchStatic(series.id, id, patch).then((r) => r.state), onState);
    };
    // onState is the studio's setState.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series.id]);

  // What the server saved comes into the local copy for every hook not being edited or saved right now.
  useEffect(() => {
    const busy = new Set([...pending.current.keys(), ...saving.current.keys()]);
    setLocal((prev) => adoptSaved(prev, state.statics, busy));
  }, [state.statics]);

  const stOf = (h: Hook) => staticOf(h, local);

  // A change shows at once and is saved half a second after the last one.
  function patch(h: Hook, change: Partial<Omit<HookStatic, "picture" | "exports">>) {
    setLocal((prev) => ({ ...prev, [h.id]: { ...staticOf(h, prev), ...change } }));
    pending.current.set(h.id, { ...pending.current.get(h.id), ...change });
    clearTimeout(timers.current.get(h.id));
    timers.current.set(
      h.id,
      setTimeout(() => {
        const body = pending.current.get(h.id) ?? {};
        pending.current.delete(h.id);
        timers.current.delete(h.id);
        saving.current.set(h.id, (saving.current.get(h.id) ?? 0) + 1);
        const done = () => {
          const left = (saving.current.get(h.id) ?? 1) - 1;
          if (left > 0) saving.current.set(h.id, left);
          else saving.current.delete(h.id);
        };
        adsApi
          .patchStatic(series.id, h.id, body)
          .then((r) => {
            done();
            onState(r.state);
          })
          .catch((e) => {
            done();
            setError(message(e));
          });
      }, 500),
    );
  }

  // Server answers that change the picture or the exports bring only those fields into the local copy.
  function adopt(h: Hook, next: AdsState) {
    onState(next);
    const saved = next.statics[h.id];
    if (saved) setLocal((prev) => ({ ...prev, [h.id]: { ...staticOf(h, prev), picture: saved.picture, exports: saved.exports } }));
  }

  function review(h: Hook): Review {
    const st = stOf(h);
    const keepOut = keepOutOf(st, toolKeepOut);
    const variants = staticVariants(h, st);
    const picture = pictures[h.id];
    const pictureSize = st.picture ? { w: st.picture.w, h: st.picture.h } : { w: 1080, h: 1920 };
    const layouts = measure
      ? variants.flatMap((v) =>
          STILL_FORMATS.filter((f) => st.formats.includes(f)).map((f) => {
            const r = layoutOnly(measure, { format: f, pictureSize, fit: st.fit, keepOut, copy: v, brand: series.brand });
            return { label: `Variante ${v.n}, ${f.replace("x", ":")}`, fits: r.layout.fits, problems: r.layout.problems, whole: r.watermarkWhole };
          }),
        )
      : [];
    const problems = staticChecks({
      hook: h,
      offer: state.offer,
      variants,
      layouts,
      picture: Boolean(picture && st.picture),
      fontsLoaded: fontsReady,
      watermarkWhole: layouts.every((l) => l.whole),
      references,
      brandName: series.name,
      flags: (flags ?? []).filter((f) => f.pieceId === h.id),
    }).filter((p) => p.blocking || !st.dismissed.includes(p.id));
    return { variants, problems, blocking: problems.filter((p) => p.blocking), keepOut, jobs: st.formats.length ? staticJobs(h, st) : [] };
  }

  const prompts = hooks.map((hook) => ({ hook, prompt: staticPrompt(hook, state.offer, stOf(hook), { look: series.look, brand: series.brand }) }));

  async function copy(text: string, what: string, id?: string) {
    try {
      await copyText(text);
      setStatus(`${what} copiado.`);
      if (id) setCopied((s) => new Set(s).add(id));
    } catch (e) {
      setError(message(e));
    }
  }

  async function uploadPicture(h: Hook, file: File) {
    setBusy(`upload:${h.id}`);
    setError("");
    const url = URL.createObjectURL(file);
    try {
      const img = await loadImage(url);
      if (img.naturalWidth < 400 || img.naturalHeight < 400) throw new Error("La imagen es muy chica: bajala de Grok en su tamaño completo.");
      const r = await adsApi.uploadStaticPicture(series.id, h.id, file, img.naturalWidth, img.naturalHeight);
      setPictures((p) => ({ ...p, [h.id]: img }));
      adopt(h, r.state);
      const ratio = img.naturalHeight / img.naturalWidth;
      setStatus(
        Math.abs(ratio - 16 / 9) > 0.05
          ? `${h.id}: la imagen no es 9:16; en 9:16 va con bandas del color de la marca (la marca de agua nunca se corta).`
          : `${h.id}: imagen cargada. Fijate que la marca de agua quede dentro del recuadro rojo.`,
      );
    } catch (e) {
      URL.revokeObjectURL(url);
      setError(message(e));
    } finally {
      setBusy("");
    }
  }

  // One hook's exports: drawn at full size, saved to estaticos/, the extra old ones removed, estaticos.csv rewritten.
  async function exportHook(h: Hook, into?: { name: string; data: Uint8Array }[]): Promise<number> {
    const r = review(h);
    const st = stOf(h);
    const picture = pictures[h.id];
    if (r.blocking.length || !picture || !st.picture) throw new Error(`${h.id}: ${r.blocking[0]?.detail ?? "falta la imagen."}`);
    await document.fonts?.ready;
    const canvas = document.createElement("canvas");
    for (const [i, job] of r.jobs.entries()) {
      setProgress(`${h.id} ${i + 1}/${r.jobs.length}`);
      const report = drawStill(canvas, { format: job.format, picture, pictureSize: { w: st.picture.w, h: st.picture.h }, fit: st.fit, keepOut: r.keepOut, copy: job.variant, brand: series.brand });
      if (!report.layout.fits || !report.watermarkWhole) throw new Error(`${h.id}, variante ${job.variant.n} (${job.format}): ${report.layout.problems.join(" ") || "la marca de agua se corta"}`);
      const blob = await canvasBlob(canvas, "png");
      await adsApi.saveStaticExport(series.id, h.id, job.file, blob);
      into?.push({ name: job.file, data: new Uint8Array(await blob.arrayBuffer()) });
    }
    const done = await adsApi.finishStaticExports(series.id, h.id, r.jobs.map((j) => j.file));
    adopt(h, done.state);
    return r.jobs.length;
  }

  async function run(work: () => Promise<string>) {
    setBusy("export");
    setError("");
    try {
      setStatus(await work());
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy("");
      setProgress("");
    }
  }

  const ready = hooks.filter((h) => pictures[h.id] && stOf(h).picture && !review(h).blocking.length && review(h).jobs.length);

  async function exportReady() {
    await run(async () => {
      const files: { name: string; data: Uint8Array }[] = [];
      let n = 0;
      for (const h of ready) n += await exportHook(h, files);
      if (files.length) download(new Blob([storeZip(files) as BlobPart], { type: "application/zip" }), `${series.id}-estaticos.zip`);
      return `${n} imágenes de ${ready.length} hooks guardadas en ${folder}/estaticos/ (y en el .zip), con estaticos.csv.`;
    });
  }

  if (!hooks.length) {
    return (
      <section className="space-y-2 rounded-xl border border-line bg-white p-4 text-sm">
        <h3 className="font-semibold">Estáticos de la tanda</h3>
        <p className="text-muted">Aprobá hooks en «1 · Hooks»: cada hook aprobado puede salir también como imagen fija.{others ? ` Hay ${others} esperando.` : ""}</p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="space-y-2 rounded-xl border border-line bg-white p-4 text-sm">
        <h3 className="font-semibold">Estáticos de la tanda</h3>
        <p className="text-muted">
          Cada hook aprobado como imagen fija. Copiá su prompt, hacé la imagen en Grok en 9:16 y sin texto, bajala entera y subila en su casillero: la app pone la
          frase del hook (y, si querés, un llamado) con las letras y los colores de {series.name}, fuera de la marca de agua y de lo que tapa la plataforma. Sale en
          9:16, 4:5 y 1:1 a <span className="font-mono text-xs">{folder}/estaticos/</span> y entra en el CSV de la tanda, al lado de los videos.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" className="px-3 py-1 text-xs" onClick={() => copy(allStaticPrompts(prompts), `Los ${prompts.length} prompts`)}>
            Copiar los {prompts.length} prompts seguidos
          </Button>
          <Button className="px-3 py-1 text-xs" disabled={busy !== "" || !ready.length} onClick={exportReady}>
            {busy === "export" ? (
              <>
                <Spinner /> Exportando {progress}…
              </>
            ) : (
              `Exportar los ${ready.length} listos`
            )}
          </Button>
          <span className="text-xs text-muted">
            {hooks.filter((h) => stOf(h).picture).length} de {hooks.length} con imagen · {hooks.filter((h) => stOf(h).exports.length).length} exportados
          </span>
        </div>
        {!fontsReady && <p className="text-xs text-amber-700">Cargando las letras de la marca… sin ellas no se exporta.</p>}
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      {status && <p className="text-sm text-muted">{status}</p>}
      <ol className="space-y-3">
        {prompts.map(({ hook, prompt }) => (
          <StaticRow
            key={hook.id}
            hook={hook}
            st={stOf(hook)}
            prompt={prompt}
            ctas={ctas}
            picture={pictures[hook.id] ?? null}
            review={review(hook)}
            brand={series.brand}
            fontsReady={fontsReady}
            copied={copied.has(hook.id)}
            busy={busy}
            onCopy={() => copy(prompt, `Prompt de ${hook.id}`, hook.id)}
            onUpload={(f) => uploadPicture(hook, f)}
            onPatch={(p) => patch(hook, p)}
            onExport={() =>
              run(async () => {
                const n = await exportHook(hook);
                return `${hook.id}: ${n} ${n === 1 ? "imagen guardada" : "imágenes guardadas"} en ${folder}/estaticos/.`;
              })
            }
          />
        ))}
      </ol>
    </section>
  );
}

function StaticRow({
  hook,
  st,
  prompt,
  ctas,
  picture,
  review,
  brand,
  fontsReady,
  copied,
  busy,
  onCopy,
  onUpload,
  onPatch,
  onExport,
}: {
  hook: Hook;
  st: HookStatic;
  prompt: string;
  ctas: Cta[];
  picture: HTMLImageElement | null;
  review: Review;
  brand: SeriesInfo["brand"];
  fontsReady: boolean;
  copied: boolean;
  busy: string;
  onCopy: () => void;
  onUpload: (f: File) => void;
  onPatch: (p: Partial<Omit<HookStatic, "picture" | "exports">>) => void;
  onExport: () => void;
}) {
  const [format, setFormat] = useState<StillFormat>("9x16");
  const [selected, setSelected] = useState(0);
  const [open, setOpen] = useState(false);
  const big = useRef<HTMLCanvasElement>(null);
  const thumbs = useRef<(HTMLCanvasElement | null)[]>([]);
  const { variants, problems, blocking, keepOut, jobs } = review;
  const current = variants[Math.min(selected, Math.max(0, variants.length - 1))];
  const pictureSize = st.picture ? { w: st.picture.w, h: st.picture.h } : { w: 1080, h: 1920 };
  const drawKey = previewKey({ format, fit: st.fit, keepOut, copies: variants, selected, pictureSize, brand, open, fontsReady });

  useEffect(() => {
    const base = { format, picture, pictureSize, fit: st.fit, keepOut, brand, showKeepOut: true };
    if (big.current && current) drawStill(big.current, { ...base, copy: current, scale: 200 / 1080 });
    if (open) variants.forEach((v, i) => thumbs.current[i] && drawStill(thumbs.current[i]!, { ...base, copy: v, scale: 90 / 1080 }));
    // drawKey carries everything drawn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawKey, picture]);

  const pickCta = (id: string) => {
    const c = ctas.find((x) => x.id === id);
    onPatch({ ctaId: id, ctas: c ? ctaWords(c) : "" });
  };

  return (
    <li className="space-y-3 rounded-xl border border-line bg-white p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs font-semibold">{hook.id}</span>
        <LevelChip level={hook.level} />
        <span className="text-xs text-muted">{LEVEL_INFO[hook.level].label}</span>
        {st.exports.length > 0 && <span className="rounded-full bg-good-soft px-2 text-xs text-good">{st.exports.length} exportadas</span>}
      </div>
      <p>{hook.text}</p>
      <p className="text-xs text-muted">
        En la imagen: «{variants[0]?.headline ?? hookHeadline(hook)}»{variants[0]?.cta ? ` · llamado: «${variants[0].cta}»` : ""}
      </p>
      <div className="flex flex-wrap items-start gap-4">
        <canvas ref={big} className="rounded border border-line" style={{ width: 200 }} aria-label={`Vista previa de ${hook.id}`} />
        <div className="min-w-64 flex-1 space-y-2">
          <textarea className={`${inputClass} font-mono text-[11px]`} rows={4} readOnly value={prompt} aria-label={`Prompt para Grok de ${hook.id}`} onFocus={(e) => e.target.select()} />
          <div className="flex flex-wrap items-center gap-2">
            <Button variant={copied ? "ghost" : "secondary"} className="px-3 py-1 text-xs" onClick={onCopy}>
              {copied ? "Copiado ✓ (copiar de nuevo)" : "Copiar el prompt para Grok"}
            </Button>
            <label className="cursor-pointer rounded-lg border border-line px-3 py-1 text-xs hover:bg-paper">
              {busy === `upload:${hook.id}` ? <Spinner /> : null} {st.picture ? "Cambiar la imagen" : "Subir la imagen"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onUpload(f);
                  e.target.value = "";
                }}
              />
            </label>
            {st.picture && (
              <span className="text-xs text-muted">
                {st.picture.w} × {st.picture.h} px
              </span>
            )}
            <Segmented value={format} onChange={setFormat} options={STILL_FORMATS.map((f) => ({ value: f, label: f.replace("x", ":") }))} />
          </div>
          <Button variant="ghost" className="px-2 py-0.5 text-xs" onClick={() => setOpen((o) => !o)}>
            {open ? "Ocultar las variantes de texto" : `Variantes de texto (${variants.length})`}
          </Button>
          {problems.length > 0 ? (
            <ul className="space-y-0.5 text-xs">
              {problems.map((p) => (
                <li key={p.id} className={p.blocking ? "text-neg" : "text-amber-700"}>
                  <b>{p.label}:</b> {p.detail}
                  {!p.blocking && (
                    <Button variant="ghost" className="ml-2 px-2 py-0 text-xs" onClick={() => onPatch({ dismissed: [...st.dismissed, p.id] })}>
                      No es un problema
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-good">Todo en orden: el texto entra legible, con contraste, fuera de la marca de agua y de lo que tapa la plataforma.</p>
          )}
          <Button className="px-3 py-1 text-xs" disabled={busy !== "" || blocking.length > 0 || !jobs.length} onClick={onExport}>
            {`Exportar ${jobs.length} ${jobs.length === 1 ? "imagen" : "imágenes"}`}
          </Button>
        </div>
      </div>
      {open && (
        <div className="space-y-3 rounded-lg border border-line p-3">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Títulos" hint="Uno por línea; para una bajada: «título | bajada». Vacío: la frase del hook.">
              <textarea className={inputClass} rows={3} value={st.headlines} placeholder={hookHeadline(hook)} onChange={(e) => onPatch({ headlines: e.target.value })} />
            </Field>
            <div className="space-y-2">
              <Field label="Llamado de un CTA aprobado" group>
                <select className={`${inputClass} py-1 text-xs`} value={st.ctaId} onChange={(e) => pickCta(e.target.value)} aria-label="CTA en la imagen">
                  <option value="">Sin llamado</option>
                  {ctas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.id} · {ctaWords(c)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Llamados" hint="Uno por línea, un solo pedido cada uno. Vacío: sin llamado.">
                <textarea className={inputClass} rows={2} value={st.ctas} onChange={(e) => onPatch({ ctas: e.target.value })} />
              </Field>
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-4 text-xs">
            <Field label="Lugar del texto" group>
              <div className="flex flex-wrap gap-3">
                {PLACEMENTS.map((p) => (
                  <label key={p} className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={st.placements.includes(p)}
                      onChange={(e) => onPatch({ placements: e.target.checked ? [...st.placements, p] : st.placements.filter((x) => x !== p) })}
                    />
                    {PLACEMENT_LABEL[p]}
                  </label>
                ))}
              </div>
            </Field>
            <Field label="Alineación" group>
              <Segmented value={st.align} onChange={(v) => onPatch({ align: v })} options={ALIGNS.map((a) => ({ value: a, label: ALIGN_LABEL[a] }))} />
            </Field>
            <Field label="Formatos" group>
              <div className="flex flex-wrap gap-3">
                {STILL_FORMATS.map((f) => (
                  <label key={f} className="flex items-center gap-1" title={STILL_FORMAT_INFO[f].label}>
                    <input type="checkbox" checked={st.formats.includes(f)} onChange={(e) => onPatch({ formats: e.target.checked ? [...st.formats, f] : st.formats.filter((x) => x !== f) })} />
                    {f.replace("x", ":")}
                  </label>
                ))}
              </div>
            </Field>
            <Field label="En 4:5 y 1:1" group>
              <Segmented
                value={st.fit}
                onChange={(v) => onPatch({ fit: v })}
                options={[
                  { value: "full", label: "Cuadro completo" },
                  { value: "crop", label: "Recortar (sin cortar la marca de agua)" },
                ]}
              />
            </Field>
            <Field label="Marca de agua" group hint="[NO SEGURO] Sale del perfil de Grok: mirá tu imagen y corregila si hace falta.">
              <div className="flex flex-wrap items-center gap-2">
                <select
                  className={`${inputClass} w-auto py-1 text-xs`}
                  value={keepOut.corner}
                  aria-label="Esquina de la marca de agua"
                  onChange={(e) => onPatch({ keepOut: { ...keepOut, corner: e.target.value as Corner | "none", w: keepOut.w || 0.22, h: keepOut.h || 0.07 } })}
                >
                  {CORNERS.map((c) => (
                    <option key={c} value={c}>
                      {CORNER_LABEL[c]}
                    </option>
                  ))}
                  <option value="none">no tiene</option>
                </select>
                {keepOut.corner !== "none" && (
                  <>
                    <label className="flex items-center gap-1">
                      ancho
                      <input
                        type="number"
                        min={5}
                        max={60}
                        className={`${inputClass} w-16 py-1 text-xs`}
                        value={pct(keepOut.w)}
                        onChange={(e) => onPatch({ keepOut: { ...keepOut, w: Math.min(60, Math.max(5, Number(e.target.value) || 5)) / 100 } })}
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
                        value={pct(keepOut.h)}
                        onChange={(e) => onPatch({ keepOut: { ...keepOut, h: Math.min(60, Math.max(3, Number(e.target.value) || 3)) / 100 } })}
                      />
                      %
                    </label>
                  </>
                )}
              </div>
            </Field>
          </div>
          {variants.length > 1 && (
            <ul className="flex flex-wrap gap-2">
              {variants.map((v, i) => (
                <li key={`${v.n}-${v.headline}-${v.cta}-${v.placement}`}>
                  <button type="button" className={`rounded border p-0.5 ${i === selected ? "border-ink" : "border-line"}`} onClick={() => setSelected(i)} title={`${v.headline} · ${v.cta}`}>
                    <canvas
                      ref={(el) => {
                        thumbs.current[i] = el;
                      }}
                      style={{ width: 60 }}
                    />
                    <span className="block text-[10px] text-muted">{v.n}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}
