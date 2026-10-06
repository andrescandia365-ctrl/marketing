// "+ Personaje con hoja" / "+ Lugar con hoja": the AI writes a reference sheet (a grid of views, as in a character
// turnaround) to make in the tool before any motion, so faces and places never drift. People are invented adults.
import { useState } from "react";
import type { Sheet, SheetTemplate } from "../../shared/schema.ts";
import { castRef, seriesId as slug, type CastMember } from "../../shared/series.ts";
import { api } from "../lib/api.ts";
import { CopyButton } from "./ScriptView.tsx";
import { Button, Field, Notice, Segmented, Spinner, inputClass } from "./ui.tsx";

const PERSON_FIELDS = ["nombre", "pelo", "piel y cara", "contextura", "ropa", "accesorios", "actitud", "papel en la serie"];
const PLACE_FIELDS = ["nombre", "qué es", "detalles fijos", "luz"];
const PUPPET_FIELDS = ["nombre", "qué es (persona, mascota u objeto)", "forma y colores", "cara", "ropa o detalles", "actitud", "papel en la serie"];

type Props = {
  seriesId: string;
  place: boolean;
  cast: CastMember[];
  onAdd: (member: CastMember) => void;
  onClose: () => void;
};

export function SheetBuilder({ seriesId, place, cast, onAdd, onClose }: Props) {
  const [template, setTemplate] = useState<SheetTemplate>(place ? "place" : "girl");
  const [age, setAge] = useState(24);
  const [details, setDetails] = useState<Record<string, string>>({});
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fields = place ? PLACE_FIELDS : template === "puppet" ? PUPPET_FIELDS : PERSON_FIELDS;

  async function write() {
    setBusy(true);
    setError("");
    try {
      setSheet(await api.sheet(seriesId, template, details, age));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function add() {
    if (!sheet) return;
    const name = (details.nombre?.trim() || sheet.name).slice(0, 60);
    let id = slug(name);
    for (let n = 2; cast.some((m) => m.id === id); n++) id = `${slug(name)}-${n}`;
    let ref = castRef(name);
    const taken = new Set(cast.map((m) => m.ref.toLowerCase()));
    for (let n = 2; taken.has(ref.toLowerCase()); n++) ref = `${castRef(name)}${n}`;
    onAdd({
      id,
      name,
      ref,
      kind: place ? "place" : "character",
      identity: sheet.identity.slice(0, 600),
      note: (details["papel en la serie"] ?? "").slice(0, 600),
      image: "",
      sheet: sheet.sheetPrompt.slice(0, 6000),
      puppet: { layers: [] },
        rig: { file: "", clips: { idle: "", walk: "", turnL: "", turnR: "", point: "" } },
    });
    onClose();
  }

  return (
    <div className="space-y-3 rounded-lg border-2 border-ink/20 bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">{place ? "Lugar con hoja (6 paneles, sin gente)" : "Personaje con hoja"}</p>
        <button type="button" onClick={onClose} className="text-xs font-semibold text-muted hover:text-ink">
          Cerrar
        </button>
      </div>
      {!place && (
        <div className="flex flex-wrap items-end gap-4">
          <Field label="Plantilla" group>
            <Segmented
              value={template}
              onChange={setTemplate}
              options={[
                { value: "girl", label: "Chica" },
                { value: "boy", label: "Chico" },
                { value: "puppet", label: "Personaje 3D" },
              ]}
            />
          </Field>
          <Field label={template === "puppet" ? "Edad (si es persona, adulto)" : "Edad (adulto)"}>
            <input
              type="number"
              min={18}
              max={90}
              className={`${inputClass} w-24`}
              value={age}
              onChange={(e) => setAge(Math.max(18, Math.min(90, Number(e.target.value) || 18)))}
            />
          </Field>
        </div>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        {fields.map((f) => (
          <Field key={f} label={f[0].toUpperCase() + f.slice(1)}>
            <input
              className={`${inputClass} py-1.5`}
              value={details[f] ?? ""}
              placeholder="Vacío: lo elige la IA"
              onChange={(e) => setDetails((d) => ({ ...d, [f]: e.target.value }))}
            />
          </Field>
        ))}
      </div>
      <p className="text-xs text-muted">
        {place
          ? "Seis paneles del mismo lugar, sin gente: exterior, el ángulo principal, el contraplano, dos detalles y la vista."
          : template === "puppet"
            ? "Look 3D estilizado, para animar como títere en los explicativos: una persona (adulta), una mascota o un objeto que habla. Primero la vista «Para el títere» (de frente, brazos separados, boca cerrada); después la cortás en partes con Segmentos de Grok y subís las capas en su tarjeta. Nunca un personaje conocido ni el estilo de un estudio."
            : "Frente, tres cuartos, perfil y espalda; la cara de cerca con expresiones; detalles de joyas, manos y tela. Siempre un adulto inventado, sin parecido a nadie real, sin poses ni ropa sexualizada."}
      </p>
      <Button variant="secondary" onClick={write} disabled={busy}>
        {busy ? <Spinner /> : null} {sheet ? "Escribir otra" : "Escribir la hoja"}
      </Button>
      {error && <Notice tone="error">{error}</Notice>}
      {sheet && (
        <div className="space-y-2 text-xs">
          {sheet.filled.length > 0 && (
            <p className="text-muted">
              <b className="text-ink">La IA eligió: </b>
              {sheet.filled.map((f) => `${f.field}: ${f.value}`).join(" · ")}
            </p>
          )}
          <div className="rounded-md bg-paper p-2">
            <p className="font-semibold">La hoja completa (una imagen 16:9)</p>
            <p className="mt-1 font-mono">{sheet.sheetPrompt}</p>
            <div className="mt-1.5">
              <CopyButton text={sheet.sheetPrompt} idle="Copiar la hoja" variant="secondary" />
            </div>
          </div>
          <details>
            <summary className="cursor-pointer font-semibold text-muted">Vistas sueltas ({sheet.views.length}), por si Grok no arma la grilla</summary>
            <ul className="mt-1.5 space-y-1.5">
              {sheet.views.map((v, i) => (
                <li key={i} className="rounded-md bg-paper p-2">
                  <p className="font-semibold">{v.title}</p>
                  <p className="font-mono">{v.prompt}</p>
                  <CopyButton text={v.prompt} idle="Copiar" variant="secondary" />
                </li>
              ))}
            </ul>
          </details>
          {sheet.note && <p className="text-muted">{sheet.note}</p>}
          <Button onClick={add}>Agregar al elenco</Button>
          <p className="text-muted">
            Después: hacé la hoja en Grok, descargala y subila en su tarjeta. Queda como su imagen aprobada (su @ en Grok), y la
            revisión de imágenes compara cada toma con ella. Guardá la serie al final.
          </p>
        </div>
      )}
    </div>
  );
}
