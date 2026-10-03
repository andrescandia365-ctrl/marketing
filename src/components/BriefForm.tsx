import type { Brief, SeriesInfo, ToolInfo } from "../../shared/schema.ts";
import { LENGTHS } from "../../shared/template.ts";
import { Button, Field, Segmented, inputClass } from "./ui.tsx";

type Props = {
  brief: Brief;
  series: SeriesInfo[];
  tools: ToolInfo[];
  onChange: (brief: Brief) => void;
  onEditSeries: (id: string) => void;
  onNewSeries: () => void;
};

export function BriefForm({ brief, series, tools, onChange, onEditSeries, onNewSeries }: Props) {
  const set = <K extends keyof Brief>(key: K, value: Brief[K]) => onChange({ ...brief, [key]: value });
  const current = series.find((s) => s.id === brief.series);
  const productMode = current?.productPerEpisode ?? false;
  const screens = current?.type === "software" ? current.cast.filter((m) => m.kind === "screen") : [];

  const seriesField = (
    <div className="md:col-span-2">
      <Field label="Serie" group hint="Lo que la IA sabe de cada marca sale de su serie. Editala cuando cambie algo.">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            value={brief.series}
            onChange={(v) => set("series", v)}
            options={series.map((s) => ({ value: s.id, label: s.name }))}
          />
          <Button variant="secondary" onClick={() => onEditSeries(brief.series)} disabled={!brief.series}>
            Editar serie
          </Button>
          <Button variant="ghost" onClick={onNewSeries}>
            + Nueva serie
          </Button>
        </div>
      </Field>
    </div>
  );

  // A music series makes lyric videos: no story, so none of the story's brief.
  if (current?.type === "music") {
    return (
      <div className="grid gap-5 md:grid-cols-2">
        {seriesField}
        <p className="text-sm text-muted md:col-span-2">
          {current.name} es una serie de música: hace videos de letra. La canción, la letra (en cualquier idioma) y el estilo se
          cargan en el paso siguiente.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-5 md:grid-cols-2">
      {seriesField}

      <div className="md:col-span-2">
        <Field label="Largo" group>
          <Segmented
            value={brief.length}
            onChange={(v) => set("length", v)}
            options={[
              { value: "short", label: LENGTHS.short.label },
              { value: "episode", label: LENGTHS.episode.label },
            ]}
          />
        </Field>
      </div>

      <Field
        label={productMode ? "Producto de este episodio" : "Foco (opcional)"}
        hint={
          productMode
            ? "Qué es y qué problema resuelve. Ej.: burletes para puertas, frenan el frío que entra por abajo."
            : "Una función o un tema. Ej.: vencimientos, cierre de caja, sin internet."
        }
      >
        <textarea className={inputClass} rows={3} value={brief.product} onChange={(e) => set("product", e.target.value)} />
      </Field>
      {screens.length > 0 && (
        <div className="md:col-span-2">
          <Field
            label="Pantallas reales en esta pieza"
            group
            hint="Las capturas de la app que la historia puede mostrar. La IA no dibuja la interfaz: estas tomas usan la captura tal cual."
          >
            <div className="flex flex-wrap gap-2">
              {screens.map((m) => {
                const on = brief.screens.includes(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      set("screens", on ? brief.screens.filter((x) => x !== m.id) : [...brief.screens, m.id])
                    }
                    className={`rounded-full border px-3 py-1 text-sm ${on ? "border-ink bg-ink text-white" : "border-line bg-white text-muted hover:border-ink"}`}
                    title={m.identity}
                  >
                    {m.name}
                  </button>
                );
              })}
            </div>
          </Field>
        </div>
      )}
      <Field label="Gancho del momento (opcional)" hint="Algo que la gente ya siente: una fecha, la primera semana de frío, un aumento.">
        <textarea className={inputClass} rows={3} value={brief.angle} onChange={(e) => set("angle", e.target.value)} />
      </Field>

      <div className="md:col-span-2">
        <Field label="Notas" hint="Datos verificados, temas prohibidos, personajes que ya existen, lo que quieras que la IA sepa.">
          <textarea className={inputClass} rows={2} value={brief.notes} onChange={(e) => set("notes", e.target.value)} />
        </Field>
      </div>

      <div className="flex flex-wrap gap-6 md:col-span-2">
        <Field label="Tono" group>
          <Segmented
            value={brief.tone}
            onChange={(v) => set("tone", v)}
            options={[
              { value: "dry", label: "Seco" },
              { value: "warm", label: "Cálido" },
              { value: "absurdist", label: "Absurdo" },
            ]}
          />
        </Field>
        <Field label="Idioma de lo que se dice" group>
          <Segmented
            value={brief.language}
            onChange={(v) => set("language", v)}
            options={[
              { value: "es", label: "Español" },
              { value: "en", label: "English" },
            ]}
          />
        </Field>
        <Field label="Formato" group>
          <Segmented
            value={brief.format}
            onChange={(v) => set("format", v)}
            options={[
              { value: "vertical", label: "Vertical 9:16" },
              { value: "horizontal", label: "Horizontal 16:9" },
            ]}
          />
        </Field>
        <Field label="Herramienta de imagen y video" hint="Los prompts se escriben en su formato.">
          <select className={inputClass} value={brief.tool} onChange={(e) => set("tool", e.target.value)}>
            {tools.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.checked ? ` · revisado ${t.checked}` : ""}
              </option>
            ))}
          </select>
        </Field>
      </div>
    </div>
  );
}
