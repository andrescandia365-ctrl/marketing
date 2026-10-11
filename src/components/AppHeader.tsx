// The top of the app: its name, the Playbook / Publicidad switch, and the open piece's save state, the episode log, the
// writer (Modelos) and the image generators that are connected.
import type { Status } from "../../shared/schema.ts";
import type { SaveStatus } from "../useProject.ts";
import { Button } from "./ui.tsx";

// The two sections of the app: Playbook (organic content with a story) and Publicidad (paid ads, Método 50-5-3).
export type Section = "playbook" | "ads";

type Props = {
  section: Section;
  setSection: (section: Section) => void;
  status: Status | null;
  projectId: string | null;
  saveStatus: SaveStatus;
  newPiece: () => void;
  setShowEpisodes: (show: boolean) => void;
  setShowModels: (show: boolean) => void;
};

export function AppHeader({ section, setSection, status, projectId, saveStatus, newPiece, setShowEpisodes, setShowModels }: Props) {
  const realProviders = status?.imageProviders.filter((p) => p.available && p.id !== "placeholder") ?? [];
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-wrap items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Playbook Studio</h1>
          <p className="text-sm text-muted">
            {section === "playbook"
              ? "Contenido con historia: el Bueno contra el Malo, temas, puentes, callbacks y la pizarra de la serie."
              : "Publicidad · Método 50-5-3: hooks × meats × CTAs, de 150 a 750 anuncios por semana sin armarlos uno por uno."}
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-line bg-white p-0.5">
          {(["playbook", "ads"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSection(s)}
              className={`rounded-md px-3 py-1.5 text-sm font-semibold ${section === s ? "bg-ink text-white" : "text-muted hover:text-ink"}`}
            >
              {s === "playbook" ? "Playbook" : "Publicidad"}
            </button>
          ))}
        </div>
      </div>
      {status && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {projectId && (
            <span
              className={`rounded-full border px-2.5 py-1 font-medium ${
                saveStatus === "error" ? "border-neg/40 bg-neg-soft text-neg" : "border-line bg-white text-muted"
              }`}
              title={`${status.projectsDir}/${projectId}`}
            >
              {saveStatus === "saving" ? "Guardando…" : saveStatus === "error" ? "No se pudo guardar" : "Guardado ✓"}
            </span>
          )}
          {projectId && (
            <Button variant="ghost" className="px-2 py-1 text-xs" onClick={newPiece}>
              + Nueva pieza
            </Button>
          )}
          <Button
            variant="ghost"
            className="px-2 py-1 text-xs"
            title="Episodios estudiados: el registro de episodios del playbook (§2.6)"
            onClick={() => setShowEpisodes(true)}
          >
            Episodios
          </Button>
          <button
            type="button"
            onClick={() => setShowModels(true)}
            title="Modelos: quién escribe y las claves"
            className={`rounded-full border px-2.5 py-1 font-medium hover:border-ink ${status.writer ? "border-good/40 bg-good-soft text-good" : "border-line bg-white text-muted"}`}
          >
            {status.writer ? `${status.writer.label} · ${status.writer.model}` : "IA sin conectar"} · Modelos
          </button>
          {realProviders.map((p) => (
            <span key={p.id} className="rounded-full border border-good/40 bg-good-soft px-2.5 py-1 font-medium text-good">
              {p.label}
            </span>
          ))}
        </div>
      )}
    </header>
  );
}
