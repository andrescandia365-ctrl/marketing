import type { Brief, SeriesInfo, ToolInfo } from "../../shared/schema.ts";
import { LENGTHS } from "../../shared/template.ts";
import { Field, Segmented, inputClass } from "./ui.tsx";

type Props = { brief: Brief; series: SeriesInfo[]; tools: ToolInfo[]; onChange: (brief: Brief) => void };

export function BriefForm({ brief, series, tools, onChange }: Props) {
  const set = <K extends keyof Brief>(key: K, value: Brief[K]) => onChange({ ...brief, [key]: value });
  const isMasogar = brief.series === "masogar";

  return (
    <div className="grid gap-5 md:grid-cols-2">
      <div className="md:col-span-2">
        <Field label="Serie">
          <Segmented
            value={brief.series}
            onChange={(v) => set("series", v)}
            options={series.map((s) => ({ value: s.id, label: s.name }))}
          />
        </Field>
      </div>

      <div className="md:col-span-2">
        <Field label="Largo">
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
        label={isMasogar ? "Producto de este episodio" : "Foco (opcional)"}
        hint={
          isMasogar
            ? "Qué es y qué problema resuelve. Ej.: burletes para puertas, frenan el frío que entra por abajo."
            : "Un paso del loop o una función. Ej.: Vence, cierre de caja, sin internet."
        }
      >
        <textarea className={inputClass} rows={3} value={brief.product} onChange={(e) => set("product", e.target.value)} />
      </Field>
      <Field label="Gancho del momento (opcional)" hint="Algo que la gente ya siente: una fecha, la primera semana de frío, un aumento.">
        <textarea className={inputClass} rows={3} value={brief.angle} onChange={(e) => set("angle", e.target.value)} />
      </Field>

      <div className="md:col-span-2">
        <Field label="Notas" hint="Datos verificados, temas prohibidos, personajes que ya existen, lo que quieras que la IA sepa.">
          <textarea className={inputClass} rows={2} value={brief.notes} onChange={(e) => set("notes", e.target.value)} />
        </Field>
      </div>

      <div className="flex flex-wrap gap-6 md:col-span-2">
        <Field label="Tono">
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
        <Field label="Idioma de lo que se dice">
          <Segmented
            value={brief.language}
            onChange={(v) => set("language", v)}
            options={[
              { value: "es", label: "Español" },
              { value: "en", label: "English" },
            ]}
          />
        </Field>
        <Field label="Formato">
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
