import { useRef, useState } from "react";
import type { SeriesInfo } from "../../shared/schema.ts";
import { api, type ProjectSummary } from "../lib/api.ts";
import { Button } from "./ui.tsx";

const STEP_LABEL: Record<string, string> = {
  brief: "Brief",
  lyrics: "Video de letra",
  motion: "Explicativo",
  menu: "Menú",
  story: "Historia",
  board: "Storyboard",
  production: "Producción",
};

type Props = {
  projects: ProjectSummary[];
  series: SeriesInfo[];
  current: string | null;
  folder: string;
  onOpen: (id: string) => void;
  onDelete: (project: ProjectSummary) => void;
  // After "Importar .zip": the list is read again (the new project shows up in it).
  onImported: (id: string) => void;
};

// Saved pieces, newest first. Each one is a folder on this computer.
export function ProjectsPanel({ projects, series, current, folder, onOpen, onDelete, onImported }: Props) {
  const names = Object.fromEntries(series.map((s) => [s.id, s.name]));
  const input = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  async function importZip(file: File) {
    setImporting(true);
    setNote(null);
    try {
      const { id, files } = await api.importProject(file);
      setNote({ ok: true, text: `Listo: quedó como un proyecto nuevo («${id}», ${files} archivos).` });
      onImported(id);
    } catch (e) {
      setNote({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setImporting(false);
    }
  }

  return (
    <section className="rounded-xl border border-line bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">Proyectos guardados</h2>
        <span className="flex flex-wrap items-baseline gap-3">
          <span className="font-mono text-xs text-muted" title="Cada proyecto es una carpeta con sus imágenes, clips, el video y el .md">
            {folder}
          </span>
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={importing}
            title="Un proyecto exportado desde esta app (o su carpeta comprimida). Entra como uno nuevo: nunca pisa uno que ya tengas."
            className="rounded px-2 py-1 text-xs font-semibold text-muted hover:bg-black/5 hover:text-ink disabled:opacity-50"
          >
            {importing ? "Importando…" : "Importar .zip"}
          </button>
          <input
            ref={input}
            type="file"
            accept=".zip,application/zip"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void importZip(file);
            }}
          />
        </span>
      </div>
      {note && <p className={`mt-2 text-xs ${note.ok ? "text-good" : "text-neg"}`}>{note.text}</p>}
      {projects.length === 0 ? (
        <p className="mt-2 text-xs text-muted">
          Todavía no hay. Cada pieza se guarda sola en su carpeta desde que abrís el menú de temas.
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-line">
          {projects.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
              <span className="min-w-0 flex-1">
                <b>{p.title}</b>
                {p.id === current && <span className="ml-2 rounded bg-good-soft px-1.5 text-xs text-good">abierto</span>}
                <span className="block text-xs text-muted">
                  {names[p.series] ?? p.series} · {STEP_LABEL[p.step] ?? p.step}
                  {p.shots ? ` · ${p.shots} tomas` : ""}
                  {p.hasVideo ? " · video ✓" : ""} · {new Date(p.updatedAt).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })}
                </span>
              </span>
              <Button variant="secondary" className="px-3 py-1 text-xs" onClick={() => onOpen(p.id)} disabled={p.id === current}>
                Abrir
              </Button>
              <a
                href={api.exportProjectUrl(p.id)}
                download={`${p.id}.zip`}
                title="La carpeta entera en un archivo: el .md, las imágenes, los clips, las voces y los videos. Se guarda lo último que se autoguardó."
                className="rounded px-2 py-1 text-xs font-semibold text-muted hover:bg-black/5 hover:text-ink"
              >
                Exportar .zip
              </a>
              <button
                type="button"
                onClick={() => onDelete(p)}
                className="rounded px-2 py-1 text-xs font-semibold text-muted hover:bg-black/5 hover:text-neg"
              >
                Borrar
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
