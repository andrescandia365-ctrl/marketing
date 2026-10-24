// "Subir clips en lote": drop files (or a folder) whose names carry the slot (H12, M3-c2, H12-img). Each one that
// matches is sent, alone, through the same piece route a single upload uses. A bad file is listed and the rest go on.
// The queue lives in AdsStudio, so changing tab does not drop the progress or let a second upload start.
import { useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import {
  bulkKindOf,
  bulkMimeOf,
  markRepeated,
  matchBulkFile,
  pendingUploads,
  slotChoices,
  webmContainer,
  type BulkMatch,
  type BulkPiece,
  type ForcedSlot,
} from "../../../shared/adsBulk.ts";
import type { PieceKind } from "../../../shared/ads.ts";
import { Button, Spinner } from "../ui.tsx";

type Item = { key: string; file: File; kind: "video" | "image" | null; mime: ReturnType<typeof bulkMimeOf>; forced?: ForcedSlot };
type Job = { pieceId: string; image: boolean; index: number | null; file: File };
type Row = { item: Item; match: BulkMatch };

const HEAD = 262144;

export type BulkQueue = {
  items: Item[];
  setItems: Dispatch<SetStateAction<Item[]>>;
  results: Record<string, string>;
  setResults: Dispatch<SetStateAction<Record<string, string>>>;
  progress: { done: number; total: number } | null;
  note: string;
  setNote: (note: string) => void;
  stop: MutableRefObject<boolean>;
  busy: boolean;
  upload: (ready: Row[]) => Promise<void>;
  clear: () => void;
  onFile: MutableRefObject<(job: Job) => Promise<void>>;
};

function videoHasPicture(file: File): Promise<boolean> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    const done = (ok: boolean) => {
      window.clearTimeout(timer);
      URL.revokeObjectURL(url);
      video.removeAttribute("src");
      video.load();
      resolve(ok);
    };
    const timer = window.setTimeout(() => done(false), 4000);
    video.preload = "metadata";
    video.onloadedmetadata = () => done(video.videoWidth > 0);
    video.onerror = () => done(false);
    video.src = url;
  });
}

async function sniff(file: File): Promise<Pick<Item, "kind" | "mime">> {
  const head = new Uint8Array(await file.slice(0, HEAD).arrayBuffer());
  let mime = bulkMimeOf(head);
  if (!mime && webmContainer(head) && (await videoHasPicture(file))) mime = "video/webm";
  return { mime, kind: mime ? bulkKindOf(head) || (mime.startsWith("video/") ? "video" : "image") : null };
}

export function useBulkQueue(): BulkQueue {
  const stop = useRef(false);
  const onFile = useRef<(job: Job) => Promise<void>>(async () => {});
  const [items, setItems] = useState<Item[]>([]);
  const [results, setResults] = useState<Record<string, string>>({});
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [note, setNote] = useState("");
  const progressRef = useRef(progress);
  progressRef.current = progress;

  async function upload(ready: Row[]) {
    if (!ready.length || progressRef.current) return;
    const send = onFile.current;
    stop.current = false;
    setNote("");
    setProgress({ done: 0, total: ready.length });
    let done = 0;
    let failed = 0;
    for (const row of ready) {
      if (stop.current) break;
      const match = row.match;
      try {
        if (!row.item.mime || !match.pieceId || match.image === undefined) throw new Error(match.status);
        const file = new File([row.item.file], row.item.file.name, { type: row.item.mime });
        await send({ pieceId: match.pieceId, image: match.image, index: match.index ?? null, file });
        setResults((prev) => ({ ...prev, [row.item.key]: "listo" }));
      } catch (e) {
        failed++;
        setResults((prev) => ({ ...prev, [row.item.key]: e instanceof Error ? e.message : String(e) }));
      }
      done++;
      setProgress({ done, total: ready.length });
    }
    setProgress(null);
    if (stop.current) setNote("Paraste la subida.");
    else if (failed) setNote(`${failed} ${failed === 1 ? "no entró" : "no entraron"}. El resto siguió.`);
  }

  function clear() {
    if (progressRef.current) return;
    setItems([]);
    setResults({});
    setNote("");
  }

  return { items, setItems, results, setResults, progress, note, setNote, stop, busy: progress !== null, upload, clear, onFile };
}

type Props = {
  pieces: BulkPiece[];
  scope: PieceKind | "all";
  queue: BulkQueue;
};

export function BulkUpload({ pieces, scope, queue }: Props) {
  const filesRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const { items, setItems, results, setResults, progress, note, setNote, stop, busy, upload } = queue;

  useEffect(() => {
    folderRef.current?.setAttribute("webkitdirectory", "");
    folderRef.current?.setAttribute("directory", "");
  }, []);

  const base = items.map((item) => ({
    item,
    match: matchBulkFile({ name: item.file.name, size: item.file.size, kind: item.kind }, pieces, scope, item.forced),
  }));
  const marked = markRepeated(base.map((row) => row.match));
  const rows: Row[] = base.map((row, i) => ({ item: row.item, match: marked[i] }));
  const ready = pendingUploads(
    rows.map((row) => ({ key: row.item.key, status: row.match.status, row })),
    results,
  ).map((row) => row.row);
  const choices = slotChoices(pieces, scope);

  async function take(list: File[]) {
    if (!list.length || busy) return;
    const next: Item[] = [];
    for (const [i, file] of list.entries()) {
      const sniffed = await sniff(file);
      next.push({ key: `${file.name}-${file.size}-${file.lastModified}-${i}-${items.length}`, file, ...sniffed });
    }
    setItems((prev) => [...prev, ...next]);
    setNote("");
  }

  function pick(key: string, value: string) {
    const choice = choices[Number(value)];
    setItems((prev) => prev.map((item) => (item.key === key ? { ...item, forced: choice ? { pieceId: choice.pieceId, image: choice.image, index: choice.index } : undefined } : item)));
    setResults((prev) => {
      const copy = { ...prev };
      delete copy[key];
      return copy;
    });
  }

  return (
    <div className="rounded-xl border border-line bg-white p-4">
      <p className="text-sm font-semibold">Subir clips en lote</p>
      <p className="mt-1 text-xs text-muted">
        El nombre va al lado del botón de copiar (H12.mp4, M3-c2.mp4, H12-img.png). Soltá esos archivos, o una carpeta, y cada uno entra en su lugar. Uno por uno, por el mismo camino que «Subir clip». Si dos caen en el mismo lugar, el segundo dice «repetido» y hay que elegir a mano. Lo que ya quedó «listo» no se vuelve a subir.
      </p>
      <label
        className={`mt-3 block cursor-pointer rounded-lg border border-dashed p-4 text-center text-sm ${over ? "border-ink bg-paper" : "border-line hover:border-ink"} ${busy ? "pointer-events-none opacity-60" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void take([...(e.dataTransfer.files ?? [])]);
        }}
      >
        Soltá los clips acá
        <span className="mt-2 flex flex-wrap justify-center gap-2">
          <button type="button" className="rounded-lg border border-line bg-white px-2 py-1 text-xs font-semibold hover:border-ink" onClick={() => filesRef.current?.click()}>
            Elegir archivos
          </button>
          <button type="button" className="rounded-lg border border-line bg-white px-2 py-1 text-xs font-semibold hover:border-ink" onClick={() => folderRef.current?.click()}>
            Elegir una carpeta
          </button>
        </span>
      </label>
      <input
        ref={filesRef}
        type="file"
        multiple
        accept="video/*,image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          void take([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />
      <input
        ref={folderRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          void take([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />
      {rows.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-muted">
              <tr>
                <th className="py-1 pr-2 font-medium">Archivo</th>
                <th className="py-1 pr-2 font-medium">Pieza y lugar</th>
                <th className="py-1 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ item, match }) => (
                <tr key={item.key} className="border-t border-line align-top">
                  <td className="py-1 pr-2 font-mono">{item.file.name}</td>
                  <td className="py-1 pr-2">
                    {match.pick ? (
                      <select className="max-w-56 rounded border border-line bg-white px-1 py-0.5" value={choiceValue(choices, match, item.forced)} onChange={(e) => pick(item.key, e.target.value)} disabled={busy}>
                        <option value="">Elegí el lugar…</option>
                        {choices.map((c, i) => (
                          <option key={`${c.label}-${i}`} value={String(i)}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="font-mono">
                        {match.pieceId}
                        {match.slot && match.slot !== match.pieceId ? ` · ${match.slot}` : ""}
                      </span>
                    )}
                  </td>
                  <td className="py-1">
                    <span className={match.status === "nuevo" || match.status === "reemplaza el actual" ? "" : "text-neg"}>{match.status}</span>
                    {results[item.key] && <span className={`ml-2 ${results[item.key] === "listo" ? "text-good" : "text-neg"}`}>{results[item.key]}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button className="px-3 py-1.5 text-xs" disabled={busy || ready.length === 0} onClick={() => void upload(ready)}>
              {busy ? <Spinner /> : `Subir ${ready.length} ${ready.length === 1 ? "clip" : "clips"}`}
            </Button>
            {progress && (
              <>
                <span className="font-mono text-xs text-muted">
                  {progress.done} de {progress.total}
                </span>
                <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => (stop.current = true)}>
                  Parar
                </Button>
              </>
            )}
            {!busy && (
              <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => queue.clear()}>
                Vaciar
              </Button>
            )}
          </div>
        </div>
      )}
      {note && <p className="mt-2 text-xs text-muted">{note}</p>}
    </div>
  );
}

function choiceValue(choices: { pieceId: string; image: boolean; index: number | null }[], match: BulkMatch, forced?: ForcedSlot): string {
  const slot = forced ?? (match.pieceId && match.image !== undefined ? { pieceId: match.pieceId, image: match.image, index: match.index ?? null } : null);
  if (!slot) return "";
  const i = choices.findIndex((c) => c.pieceId === slot.pieceId && c.image === slot.image && c.index === slot.index);
  return i >= 0 ? String(i) : "";
}
