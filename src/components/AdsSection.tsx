// Publicidad, the app's second section: the series to work on, the sample-mode notice and the ads studio (Método
// 50-5-3), which loads the first time the section opens.
import { lazy, type Dispatch, type SetStateAction } from "react";
import type { Brief, SeriesInfo, Status } from "../../shared/schema.ts";
import { Lazy, Notice } from "./ui.tsx";
import type { Section } from "./AppHeader.tsx";

const AdsStudio = lazy(() => import("./ads/AdsStudio.tsx").then((m) => ({ default: m.AdsStudio })));

type Props = {
  brief: Brief;
  setBrief: Dispatch<SetStateAction<Brief>>;
  status: Status | null;
  // The brief's series, when the status has it.
  currentSeries: SeriesInfo | undefined;
  setSection: (section: Section) => void;
  // Back to Playbook's brief with a hook as its angle.
  setStep: (step: "brief") => void;
  setShowModels: (show: boolean) => void;
};

export function AdsSection({ brief, setBrief, status, currentSeries, setSection, setStep, setShowModels }: Props) {
  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2">
          <span className="font-semibold">Serie</span>
          <select
            className="rounded-lg border border-line bg-white px-2 py-1.5 text-sm"
            value={brief.series}
            onChange={(e) => setBrief({ ...brief, series: e.target.value })}
          >
            {(status?.series ?? []).filter((x) => x.type !== "music").map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
        <span className="text-xs text-muted">La misma serie (biblia, elenco, estilo de texto) que Playbook; el perfil de oferta se guarda por serie.</span>
      </div>
      {status && !status.writer && (
        <Notice tone="warn">
          <b>Modo de muestra.</b> Sin clave de IA, los hooks, meats y CTAs son ejemplos fijos y la revisión solo mira largo y repetidos. Cargá una clave en{" "}
          <button type="button" className="font-semibold underline" onClick={() => setShowModels(true)}>
            Modelos
          </button>
          .
        </Notice>
      )}
      {status && currentSeries && currentSeries.type !== "music" ? (
        <Lazy>
        <AdsStudio
          key={currentSeries.id}
          series={currentSeries}
          tools={status.tools}
          imageProviders={status.imageProviders}
          writer={Boolean(status.writer)}
          voice={status.voice}
          onToPlaybook={(text) => {
            setBrief((b) => ({ ...b, angle: text }));
            setSection("playbook");
            setStep("brief");
          }}
        />
        </Lazy>
      ) : (
        status && <Notice tone="info">Elegí una serie de tipo software o e-commerce: las series de música hacen videos de letra, no anuncios.</Notice>
      )}
    </div>
  );
}
