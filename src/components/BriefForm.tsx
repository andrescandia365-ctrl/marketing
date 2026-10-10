import type { Brief, SeriesInfo, ToolInfo } from "../../shared/schema.ts";
import { inDays, upcomingMoments } from "../../shared/calendar.ts";
import { LENGTHS } from "../../shared/template.ts";
import { SEGMENT_HINT, SEGMENT_LABEL, SEGMENTS } from "../../shared/segment.ts";
import { seriesCorrespondent } from "../../shared/series.ts";
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
  // The series' calendar moments with a date, the nearest first: one click puts it in "Gancho del momento".
  const upcoming = upcomingMoments(current?.moments ?? [], new Date())
    .filter((m) => m.days !== null)
    .slice(0, 3);
  const productMode = current?.productPerEpisode ?? false;
  const explainer = brief.piece === "explainer";
  // The correspondent format names who goes "on location": the series' own, or one the AI invents.
  const segment = brief.segment ?? "desk";
  const reporter = current ? seriesCorrespondent(current) : null;
  const segmentHint =
    segment === "correspondent"
      ? `${SEGMENT_HINT.correspondent} ${reporter ? `Sale ${reporter.name}, el corresponsal de la serie.` : "La serie no tiene corresponsal: la IA inventa uno (adulto, nadie conocido) y después te ofrece sumarlo al elenco."}`
      : SEGMENT_HINT[segment];
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
        <Field
          label="Pieza"
          group
          hint="Historia: el Bueno contra el Malo, con storyboard. Explicativo: motion graphics que explican la app o el producto, con la marca de la serie."
        >
          <Segmented
            value={brief.piece}
            onChange={(v) => set("piece", v)}
            options={[
              { value: "story", label: "Historia" },
              { value: "explainer", label: "Explicativo (motion graphics)" },
            ]}
          />
        </Field>
      </div>

      {!explainer && (
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
      )}

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
        {upcoming.length > 0 && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-muted">Del calendario de la serie:</span>
            {upcoming.map((m) => (
              <button
                key={m.line}
                type="button"
                className={`rounded-full border px-2.5 py-1 hover:border-ink ${brief.angle.trim() === m.line ? "border-ink bg-paper font-semibold" : "border-line bg-white"}`}
                title={m.line}
                onClick={() => set("angle", m.line)}
              >
                {inDays(m.days!)} · {m.what.length > 48 ? `${m.what.slice(0, 48)}…` : m.what}
              </button>
            ))}
          </div>
        )}
      </Field>

      <div className="md:col-span-2">
        <Field label="Notas" hint="Datos verificados, temas prohibidos, personajes que ya existen, lo que quieras que la IA sepa.">
          <textarea className={inputClass} rows={2} value={brief.notes} onChange={(e) => set("notes", e.target.value)} />
        </Field>
      </div>

      <div className="flex flex-wrap gap-6 md:col-span-2">
        {!explainer && (
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
        )}
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
        <Field
          label="Narrador"
          group
          hint={
            explainer
              ? "Sin narrador: el explicativo no lleva voz; lo cuentan los títulos, los rótulos y el producto en uso, con música y efectos."
              : "Sin narrador: la historia la cuentan los personajes con lo que dicen (Grok los hace hablar o van subtitulados), lo que hacen y el texto en pantalla."
          }
        >
          <Segmented
            value={brief.narrator ?? "with"}
            onChange={(v) => set("narrator", v)}
            options={[
              { value: "with", label: "Con narrador" },
              { value: "without", label: "Sin narrador" },
            ]}
          />
        </Field>
        {!explainer && (
          <Field
            label="Tomas"
            group
            hint="Toma continua: planos de 15 s en mano con varias líneas, tiempos, errores de cámara y diálogo dicho dentro del clip."
          >
            <Segmented
              value={brief.takes}
              onChange={(v) => set("takes", v)}
              options={[
                { value: "lines", label: "Una línea por toma" },
                { value: "continuous", label: "Toma continua (15 s)" },
              ]}
            />
          </Field>
        )}
        {!explainer && (
          <Field label="Formato del segmento" group hint={segmentHint}>
            <Segmented
              value={brief.segment ?? "desk"}
              onChange={(v) => set("segment", v)}
              options={SEGMENTS.map((value) => ({ value, label: SEGMENT_LABEL[value] }))}
            />
          </Field>
        )}
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
        {!explainer && (
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
        )}
      </div>
    </div>
  );
}
