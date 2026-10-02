import type { Brief } from "../../shared/schema.ts";
import { Field, Segmented, inputClass } from "./ui.tsx";

type Props = { brief: Brief; onChange: (brief: Brief) => void };

export function BriefForm({ brief, onChange }: Props) {
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
        <Field label="Which job?">
          <Segmented
            value={brief.job}
            onChange={(v) => set("job", v)}
            options={[
              { value: "A", label: "A · Planner for stores" },
              { value: "B", label: "B · Good feelings at home" },
            ]}
          />
        </Field>
      </div>

      <Field label="Product name">
        <input className={inputClass} value={brief.productName} onChange={(e) => set("productName", e.target.value)} />
      </Field>
      <Field label="Who buys it">{text("buyer", 2, "e.g. owner of one or two corner stores")}</Field>

      <Field label="What it does">{text("whatItDoes", 3)}</Field>
      <Field label="The pain to open on" hint="Concrete: the object, the number, the hour.">
        {text("pain", 3)}
      </Field>

      <Field label="Works today" hint="Only this is shown as real.">
        {text("shippedToday", 3)}
      </Field>
      <Field label="Roadmap (not shipped)" hint="Shown only as a labeled concept.">
        {text("roadmap", 3)}
      </Field>

      <Field label="Offer / call to action">
        <input className={inputClass} value={brief.offer} onChange={(e) => set("offer", e.target.value)} />
      </Field>
      <Field label="Off-limits topics">
        <input className={inputClass} value={brief.offLimits} onChange={(e) => set("offLimits", e.target.value)} />
      </Field>

      <div className="md:col-span-2">
        <Field label="Verified facts" hint="Numbers or quotes with a source. Anything else the script uses gets marked [VERIFY].">
          {text("facts", 2)}
        </Field>
      </div>

      <div className="md:col-span-2">
        <Field label="Visual style" hint="Optional. Applied to every image so the shots match.">
          {text("visualStyle", 2)}
        </Field>
      </div>

      <div className="flex flex-wrap gap-6 md:col-span-2">
        <Field label="Voice">
          <Segmented
            value={brief.tone}
            onChange={(v) => set("tone", v)}
            options={[
              { value: "dry", label: "Dry" },
              { value: "warm", label: "Warm" },
              { value: "absurdist", label: "Absurd" },
            ]}
          />
        </Field>
        <Field label="Language">
          <Segmented
            value={brief.language}
            onChange={(v) => set("language", v)}
            options={[
              { value: "en", label: "English" },
              { value: "es", label: "Español" },
            ]}
          />
        </Field>
        <Field label="Format">
          <Segmented
            value={brief.format}
            onChange={(v) => set("format", v)}
            options={[
              { value: "vertical", label: "Vertical 9:16" },
              { value: "horizontal", label: "Horizontal 16:9" },
            ]}
          />
        </Field>
      </div>
    </div>
  );
}
