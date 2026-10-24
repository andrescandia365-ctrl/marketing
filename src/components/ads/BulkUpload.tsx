// "Subir clips en lote": drop files (or a folder) whose names carry the slot (H12, M3-c2, H12-img). Each one that
// matches is sent, alone, through the same piece route a single upload uses. A bad file is listed and the rest go on.
import { useEffect, useRef, useState } from "react";
import {
  bulkKindOf,
  bulkMimeOf,
  bulkWillUpload,
  matchBulkFile,
  slotChoices,
  type BulkMatch,
  type BulkPiece,
  type ForcedSlot,
} from "../../../shared/adsBulk.ts";
import type { PieceKind } from "../../../shared/ads.ts";
import { Button, Spinner } from "../ui.tsx";

type Item = { key: string; file: File; head: Uint8Array; forced?: ForcedSlot };
type Job = { pieceId: string; image: boolean; index: number | null; file: File };

type Props = {
  pieces: BulkPiece[];
  scope: PieceKind | "all";
  onFile: (job: Job) => Promise<void>;
};

const readHead = async (file: File) => new Uint8Array(await file.slice(0, 64).arrayBuffer());

export function BulkUpload({ pieces, scope, onFile }: Props) {
  const filesRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const stop = useRef(false);
  const [over, setOver] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [results, setResults] = useState<Record<string, string>>({});
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    folderRef.current?.setAttribute("webkitdirectory", "");
    folderRef.current?.setAttribute("directory", "");
  }, []);

  const rows = items.map((item) => ({
    item,
    match: matchBulkFile({ name: item.file.name, size: item.file.size, kind: bulkKindOf(item.head) }, pieces, scope, item.forced),
  }));
  const ready = rows.filter((r) => bulkWillUpload(r.match.status));
  const choices = slotChoices(pieces, scope);
  const busy = progress !== null;

  async function take(list: File[]) {
    if (!list.length || busy) return;
    const next: Item[] = [];
    for (const [i, file] of list.entries()) {
      next.push({ key: `${file.name}-${file.size}-${file.lastModified}-${i}-${items.length}`, file, head: await readHead(file) });
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

  async function upload() {
    if (!ready.length || busy) return;
    stop.current = false;
    setNote("");
    setProgress({ done: 0, total: ready.length });
    let done = 0;
    let failed = 0;
    for (const row of ready) {
      if (stop.current) break;
      const mime = bulkMimeOf(row.item.head);
      const match = row.match;
      try {
        if (!mime || !match.pieceId || match.image === undefined) throw new Error(match.status);
        const file = new File([row.item.file], row.item.file.name, { type: mime });
        await onFile({ pieceId: match.pieceId, image: match.image, index: match.index ?? null, file });
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

  return (
    <div className="rounded-xl border border-line bg-white p-4">
      <p className="text-sm font-semibold">Subir clips en lote</p>
      <p className="mt-1 text-xs text-muted">
        El prompt copiado termina con el nombre del archivo (H12.mp4, M3-c2.mp4, H12-img.png). Soltá esos archivos, o una carpeta, y cada uno entra en su lugar. Uno por uno, por el mismo camino que «Subir clip».
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
            <Button className="px-3 py-1.5 text-xs" disabled={busy || ready.length === 0} onClick={() => void upload()}>
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
              <Button
                variant="ghost"
                className="px-2 py-1 text-xs"
                onClick={() => {
                  setItems([]);
                  setResults({});
                  setNote("");
                }}
              >
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
