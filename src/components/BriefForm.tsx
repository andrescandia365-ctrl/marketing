import type { Brief, ToolInfo } from "../../shared/schema.ts";
import { Field, Segmented, inputClass } from "./ui.tsx";

type Props = { brief: Brief; tools: ToolInfo[]; onChange: (brief: Brief) => void };

export function BriefForm({ brief, tools, onChange }: Props) {
  const set = <K extends keyof Brief>(key: K, value: Brief[K]) => onChange({ ...brief, [key]: value });
  const text = (key: keyof Brief, rows = 2, placeholder = "") => (
    <textarea
      className={inputClass}
      rows={rows}
      value={brief[key]}
      placeholder={placeholder}
      onChange={(e) => set(key, e.target.value as never)}
    />
  );

  return (
    <div className="grid gap-5 md:grid-cols-2">
      <div className="md:col-span-2">
        <Field label="¿Qué trabajo?">
          <Segmented
            value={brief.job}
            onChange={(v) => set("job", v)}
            options={[
              { value: "A", label: "A · Planificador para locales" },
              { value: "B", label: "B · Sentirse bien en casa" },
            ]}
          />
        </Field>
      </div>

      <Field label="Nombre del producto">
        <input className={inputClass} value={brief.productName} onChange={(e) => set("productName", e.target.value)} />
      </Field>
      <Field label="Quién lo compra">{text("buyer", 2, "ej. dueño de uno o dos kioscos")}</Field>

      <Field label="Qué hace">{text("whatItDoes", 3)}</Field>
      <Field label="El dolor para abrir" hint="Concreto: el objeto, el número, la hora.">
        {text("pain", 3)}
      </Field>

      <Field label="Qué funciona hoy" hint="Solo esto se muestra como real.">
        {text("shippedToday", 3)}
      </Field>
      <Field label="Lo que viene (todavía no existe)" hint="Solo aparece como concepto, con etiqueta.">
        {text("roadmap", 3)}
      </Field>

      <Field label="Oferta / llamado a la acción">
        <input className={inputClass} value={brief.offer} onChange={(e) => set("offer", e.target.value)} />
      </Field>
      <Field label="Temas prohibidos">
        <input className={inputClass} value={brief.offLimits} onChange={(e) => set("offLimits", e.target.value)} />
      </Field>

      <div className="md:col-span-2">
        <Field
          label="Datos verificados"
          hint="Números o citas con fuente. Cualquier otra afirmación del guion queda marcada [VERIFY]."
        >
          {text("facts", 2)}
        </Field>
      </div>

      <div className="md:col-span-2">
        <Field label="Estilo visual" hint="Opcional. Se aplica a todas las imágenes para que las tomas combinen.">
          {text("visualStyle", 2)}
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
        <Field label="Idioma del aviso">
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
