// Editar serie → "Subir muchas pantallas" and "Revisá las pantallas". Many real screenshots at once: each one becomes
// a pending real screen (saved with its image, one after the other), then the person names them, says what each
// shows and on which device, and confirms them. Naming works with no key (the grid, or the claude.ai copy/paste round
// trip) and, with one, by the model that looks at pictures.
import { useEffect, useRef, useState } from "react";
import type { SeriesInfo } from "../../shared/schema.ts";
import type { CastMember } from "../../shared/series.ts";
import {
  ANSWER_FORMAT,
  SCREEN_DEVICE_LABEL,
  batchFileName,
  cleanScreenName,
  guessDevice,
  matchScreenNames,
  parseScreenNames,
  promptBatches,
  renameScreen,
  reorderSubset,
  screenFileProblem,
  screenNamingPrompt,
  worksTodayOffers,
  type ScreenDevice,
} from "../../shared/screenBatch.ts";
import { api, libraryFileUrl } from "../lib/api.ts";
import { pictureForReview } from "../lib/files.ts";
import { Button, Notice, Segmented, Spinner, inputClass } from "./ui.tsx";

const IMAGE_EXT = /\.(png|jpe?g|webp|gif|heic|heif|bmp|tiff?|avif)$/i;

async function pictureSize(file: File): Promise<{ w: number; h: number } | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const size = { w: bitmap.width, h: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return null;
  }
}

type Failure = { file: string; reason: string };

export function ScreenBatch({
  seriesId,
  seriesName,
  cast,
  works,
  version,
  aiReady,
  onCast,
  onWorks,
  onSeries,
}: {
  seriesId: string | null;
  seriesName: string;
  cast: CastMember[];
  // "Lo que existe hoy" as the form has it now (one per line).
  works: string;
  version: number;
  // A model key is set: "Que la IA las nombre" is offered.
  aiReady: boolean;
  onCast: (update: (cast: CastMember[]) => CastMember[]) => void;
  onWorks: (lines: string[]) => void;
  onSeries?: (series: SeriesInfo[]) => void;
}) {
  const files = useRef<HTMLInputElement>(null);
  const folder = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<{ done: number; total: number; label: string } | null>(null);
  const [failures, setFailures] = useState<Failure[]>([]);
  const [skipped, setSkipped] = useState(0);
  const [removed, setRemoved] = useState<string[]>([]);
  const [paste, setPaste] = useState("");
  const [pasteReport, setPasteReport] = useState<string[]>([]);
  const [copied, setCopied] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [offers, setOffers] = useState<{ id: string; line: string; on: boolean }[]>([]);
  const [over, setOver] = useState(false);
  const stop = useRef(false);

  useEffect(() => {
    folder.current?.setAttribute("webkitdirectory", "");
    folder.current?.setAttribute("directory", "");
  }, []);

  const pending = cast.filter((m) => m.kind === "screen" && m.pending);
  const busy = progress !== null;
  const worksLines = works
    .split("\n")
    .map((l) => l.replace(/^\s*[-*•]\s*/, "").trim())
    .filter(Boolean);

  const update = (id: string, change: (m: CastMember, all: CastMember[]) => CastMember) =>
    onCast((all) => all.map((m) => (m.id === id ? change(m, all) : m)));

  async function upload(list: File[]) {
    if (!seriesId || !list.length) return;
    const images = list.filter((f) => f.type.startsWith("image/") || IMAGE_EXT.test(f.name));
    setSkipped(list.length - images.length);
    images.sort((a, b) => (a.webkitRelativePath || a.name).localeCompare(b.webkitRelativePath || b.name, "es", { numeric: true }));
    const failed: Failure[] = [];
    setFailures([]);
    setError("");
    setNote("");
    stop.current = false;
    for (let i = 0; i < images.length; i++) {
      if (stop.current) break;
      const file = images[i];
      setProgress({ done: i, total: images.length, label: `Subiendo ${i + 1} de ${images.length}: ${file.name}` });
      const problem = screenFileProblem(file);
      if (problem) {
        failed.push({ file: file.name, reason: problem });
        continue;
      }
      try {
        const size = await pictureSize(file);
        const { member } = await api.addScreen(seriesId, file, file.name, cleanScreenName(file.name), size ? guessDevice(size.w, size.h) : undefined);
        onCast((all) => [...all.filter((m) => m.id !== member.id), member]);
      } catch (e) {
        failed.push({ file: file.name, reason: e instanceof Error ? e.message : String(e) });
      }
    }
    setFailures(failed);
    setProgress(null);
  }

  function move(id: string, dir: -1 | 1) {
    const ids = pending.map((m) => m.id);
    const i = ids.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    onCast((all) => reorderSubset(all, ids));
  }

  function remove(id: string) {
    onCast((all) => all.filter((m) => m.id !== id));
    setRemoved((r) => [...r, id]);
  }

  async function nameWithAi() {
    if (!seriesId) return;
    setError("");
    setNote("");
    stop.current = false;
    const list = pending.filter((m) => m.image);
    for (let i = 0; i < list.length; i++) {
      if (stop.current) break;
      const m = list[i];
      setProgress({ done: i, total: list.length, label: `La IA mira ${i + 1} de ${list.length}: ${m.name}` });
      try {
        const { jpeg } = await pictureForReview(libraryFileUrl(seriesId, m.image, version), 768);
        const reply = await api.nameScreen(seriesId, jpeg, batchFileName(m));
        if (reply.demo || !reply.screen) {
          setNote(reply.note);
          break;
        }
        const s = reply.screen;
        update(m.id, (cur, all) => ({ ...renameScreen(cur, s.name || cur.name, all), identity: s.shows || cur.identity, ...(s.device && { device: s.device }) }));
      } catch (e) {
        setError(`${m.name}: ${e instanceof Error ? e.message : String(e)}`);
        break;
      }
    }
    setProgress(null);
  }

  const batches = promptBatches(pending);

  async function copyPrompt(n: number) {
    const text = screenNamingPrompt({
      series: seriesName,
      files: batches[n].map(batchFileName),
      worksToday: worksLines,
      batch: { n: n + 1, of: batches.length },
    });
    try {
      await navigator.clipboard.writeText(text);
      setCopied(n);
    } catch {
      setError("El navegador no dejó copiar. Seleccioná el texto del prompt a mano.");
    }
  }

  function applyPaste() {
    const { rows, problems } = parseScreenNames(paste);
    const { matched, unmatched, missing } = matchScreenNames(
      rows,
      pending.map((m) => ({ key: m.id, fileName: batchFileName(m) })),
    );
    onCast((all) => {
      let next = all;
      for (const { item, row } of matched) {
        next = next.map((m) =>
          m.id === item.key ? { ...renameScreen(m, row.name, next), identity: row.shows || m.identity, ...(row.device && { device: row.device }) } : m,
        );
      }
      return next;
    });
    const report = [
      `${matched.length} de ${pending.length} pantallas tomaron su nombre.`,
      ...problems.map((p) => `Línea ${p.line}: ${p.reason}`),
      ...unmatched.map((r) => `Línea ${r.line}: «${r.file}» no coincide con ningún archivo de la lista.`),
      ...(missing.length ? [`Sin respuesta: ${missing.map((m) => m.fileName).join(", ")}.`] : []),
    ];
    setPasteReport(report);
  }

  async function confirm() {
    if (!seriesId || !pending.length) return;
    const unnamed = pending.filter((m) => !m.name.trim());
    if (unnamed.length) {
      setError("Cada pantalla necesita un nombre antes de confirmar.");
      return;
    }
    setError("");
    setProgress({ done: 0, total: 1, label: "Guardando las pantallas…" });
    try {
      const { series } = await api.confirmScreens(
        seriesId,
        pending.map((m) => ({ id: m.id, name: m.name.trim(), ref: m.ref, identity: m.identity.trim(), ...(m.device && { device: m.device }) })),
        removed,
      );
      const confirmed = pending.map((m) => ({ ...m }));
      onCast((all) =>
        all.map((m) => {
          if (!(m.kind === "screen" && m.pending)) return m;
          const { pending: _p, ...rest } = m;
          return rest;
        }),
      );
      setRemoved([]);
      setOffers(worksTodayOffers(confirmed, worksLines).map((o) => ({ ...o, on: false })));
      onSeries?.(series);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setProgress(null);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-line p-3">
      <div
        className={`rounded-lg border-2 border-dashed p-3 text-sm ${over ? "border-good bg-paper" : "border-line"}`}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          if (!busy) upload([...e.dataTransfer.files]);
        }}
      >
        <p className="font-semibold">Subir muchas pantallas</p>
        <p className="text-xs text-muted">
          Arrastrá acá las capturas (PNG, JPG o WebP, hasta 15 MB cada una) o elegilas. Cada una entra como pantalla real por
          revisar; el nombre sale del archivo («stock-buscar.png» → «Stock buscar»; «IMG_2031.png» → «Pantalla 12»).
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button className="px-3 py-1 text-xs" disabled={!seriesId || busy} onClick={() => files.current?.click()} title={seriesId ? undefined : "Guardá la serie primero"}>
            Elegir capturas
          </Button>
          <Button variant="secondary" className="px-3 py-1 text-xs" disabled={!seriesId || busy} onClick={() => folder.current?.click()} title="Si tu navegador lo permite">
            Elegir una carpeta
          </Button>
        </div>
        <input
          ref={files}
          type="file"
          multiple
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            upload([...(e.target.files ?? [])]);
            e.target.value = "";
          }}
        />
        <input
          ref={folder}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            upload([...(e.target.files ?? [])]);
            e.target.value = "";
          }}
        />
        {!seriesId && <p className="mt-1 text-xs text-muted">Las capturas se suben después de guardar la serie.</p>}
      </div>

      {progress && (
        <div className="flex items-center gap-2 text-xs">
          <Spinner />
          <span className="min-w-0 truncate">{progress.label}</span>
          <progress className="h-1.5 w-24" max={progress.total} value={progress.done} />
          {progress.total > 1 && (
            <Button variant="ghost" className="px-2 py-0.5 text-xs" onClick={() => (stop.current = true)}>
              Parar
            </Button>
          )}
        </div>
      )}
      {skipped > 0 && <p className="text-xs text-muted">{skipped} archivos que no son imágenes quedaron afuera.</p>}
      {failures.length > 0 && (
        <Notice tone="warn">
          <p>No entraron {failures.length}:</p>
          <ul className="mt-1 list-disc pl-4">
            {failures.map((f, i) => (
              <li key={`${f.file}-${i}`}>
                <span className="font-mono">{f.file}</span>: {f.reason}
              </li>
            ))}
          </ul>
        </Notice>
      )}

      {pending.length > 0 && (
        <div className="space-y-3">
          <div>
            <p className="font-semibold">Revisá las pantallas ({pending.length})</p>
            <p className="text-xs text-muted">
              Poné a cada una un nombre que diga su función y qué muestra, en una línea. Hasta que confirmes, la IA no las usa.
            </p>
          </div>
          <ul className="grid gap-2 sm:grid-cols-2">
            {pending.map((m, i) => (
              <li key={m.id} className="grid grid-cols-[64px_minmax(0,1fr)] gap-2 rounded-lg border border-line p-2">
                <div className="aspect-[9/16] w-16 overflow-hidden rounded border border-line bg-paper">
                  {seriesId && m.image && <img src={libraryFileUrl(seriesId, m.image, version)} alt="" className="size-full object-contain" />}
                </div>
                <div className="min-w-0 space-y-1">
                  <input
                    className={`${inputClass} py-1`}
                    value={m.name}
                    aria-label="Nombre"
                    placeholder="Nombre"
                    onChange={(e) => update(m.id, (cur, all) => renameScreen(cur, e.target.value, all))}
                  />
                  <input
                    className={`${inputClass} py-1 text-xs`}
                    value={m.identity}
                    aria-label="Qué muestra"
                    placeholder="Qué muestra (una línea)"
                    onChange={(e) => update(m.id, (cur) => ({ ...cur, identity: e.target.value }))}
                  />
                  <div className="flex flex-wrap items-center gap-1 text-xs">
                    <Segmented
                      value={m.device ?? ""}
                      onChange={(v) => update(m.id, (cur) => ({ ...cur, device: v as ScreenDevice }))}
                      options={[
                        { value: "phone", label: SCREEN_DEVICE_LABEL.phone },
                        { value: "pc", label: SCREEN_DEVICE_LABEL.pc },
                      ]}
                    />
                    <span className="font-mono text-good">@{m.ref}</span>
                    <span className="ml-auto flex gap-0.5">
                      <Button variant="ghost" className="px-1.5 py-0.5 text-xs" disabled={i === 0} onClick={() => move(m.id, -1)} title="Subir">
                        ↑
                      </Button>
                      <Button variant="ghost" className="px-1.5 py-0.5 text-xs" disabled={i === pending.length - 1} onClick={() => move(m.id, 1)} title="Bajar">
                        ↓
                      </Button>
                      <Button variant="ghost" className="px-1.5 py-0.5 text-xs text-neg" onClick={() => remove(m.id)}>
                        Quitar
                      </Button>
                    </span>
                  </div>
                  <p className="truncate font-mono text-[10px] text-muted">{batchFileName(m)}</p>
                </div>
              </li>
            ))}
          </ul>

          <div className="space-y-2 rounded-lg bg-paper p-2 text-xs">
            <p className="font-semibold">Nombrarlas con Opus en claude.ai (sin clave)</p>
            <p className="text-muted">
              Copiá el prompt, pegalo en claude.ai y adjuntá las mismas capturas (en tandas de hasta 20). Pegá acá abajo lo que
              responda: una línea por archivo, «{ANSWER_FORMAT}». Se ubican por el nombre del archivo.
            </p>
            <div className="flex flex-wrap gap-2">
              {batches.map((b, n) => (
                <Button key={n} variant="secondary" className="px-3 py-1 text-xs" onClick={() => copyPrompt(n)} disabled={busy}>
                  {copied === n ? "Copiado" : batches.length > 1 ? `Copiar prompt (tanda ${n + 1} de ${batches.length}, ${b.length})` : "Copiar prompt para nombrarlas en claude.ai"}
                </Button>
              ))}
              {aiReady && (
                <Button variant="secondary" className="px-3 py-1 text-xs" onClick={nameWithAi} disabled={busy || !seriesId}>
                  Que la IA las nombre
                </Button>
              )}
            </div>
            <textarea
              className={`${inputClass} font-mono text-xs`}
              rows={4}
              value={paste}
              placeholder={"stock-buscar.png | Stock buscar | Buscador de productos con su stock | celular"}
              onChange={(e) => setPaste(e.target.value)}
              aria-label="Respuesta de claude.ai"
            />
            <Button variant="secondary" className="px-3 py-1 text-xs" onClick={applyPaste} disabled={!paste.trim() || busy}>
              Aplicar la respuesta
            </Button>
            {pasteReport.length > 0 && (
              <ul className="space-y-0.5">
                {pasteReport.map((r, i) => (
                  <li key={i} className={i === 0 ? "text-ink" : "text-amber-800"}>
                    {r}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {note && <Notice tone="warn">{note}</Notice>}
          <div className="flex flex-wrap items-center gap-2">
            <Button className="px-3 py-1 text-xs" onClick={confirm} disabled={busy || !seriesId}>
              Confirmar {pending.length} {pending.length === 1 ? "pantalla" : "pantallas"}
            </Button>
            <span className="text-xs text-muted">Confirmás que la app hoy se ve así. Quedan guardadas al toque.</span>
          </div>
        </div>
      )}
      {error && <Notice tone="error">{error}</Notice>}

      {offers.length > 0 && (
        <div className="space-y-1 rounded-lg border border-line p-2 text-xs">
          <p className="font-semibold">¿Sumar sus funciones a «Lo que existe hoy»?</p>
          <p className="text-muted">Es lo único que la IA muestra como real. Marcá solo las que la app hace hoy.</p>
          <ul className="space-y-0.5">
            {offers.map((o) => (
              <li key={o.id}>
                <label className="flex items-start gap-1.5">
                  <input type="checkbox" checked={o.on} onChange={() => setOffers((all) => all.map((x) => (x.id === o.id ? { ...x, on: !x.on } : x)))} />
                  <span>{o.line}</span>
                </label>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <Button
              className="px-3 py-1 text-xs"
              disabled={!offers.some((o) => o.on)}
              onClick={() => {
                onWorks(offers.filter((o) => o.on).map((o) => o.line));
                setOffers([]);
                setNote("Sumadas a «Lo que existe hoy». Guardá la serie para que la IA las lea.");
              }}
            >
              Sumar las marcadas
            </Button>
            <Button variant="ghost" className="px-3 py-1 text-xs" onClick={() => setOffers([])}>
              No, gracias
            </Button>
          </div>
        </div>
      )}
      {note && !pending.length && <p className="text-xs text-muted">{note}</p>}
    </div>
  );
}
