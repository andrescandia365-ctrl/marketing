import { useEffect, useState } from "react";
import type { SeriesInfo } from "../../shared/schema.ts";
import { EMPTY_SERIES, type SeriesFields } from "../../shared/series.ts";
import { api } from "../lib/api.ts";
import { Button, Field, Notice, Spinner, inputClass } from "./ui.tsx";

type Props = {
  // null: a new series.
  id: string | null;
  onSaved: (series: SeriesInfo[], id: string) => void;
  onDeleted: (series: SeriesInfo[]) => void;
  onClose: () => void;
};

export function SeriesEditor({ id, onSaved, onDeleted, onClose }: Props) {
  const [fields, setFields] = useState<SeriesFields | null>(id ? null : EMPTY_SERIES);
  // "Lo que existe hoy" is edited as text, one item per line.
  const [works, setWorks] = useState("");
  const [loop, setLoop] = useState("");
  const [busy, setBusy] = useState<null | "save" | "delete">(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    api
      .seriesFields(id)
      .then(({ fields }) => {
        setFields(fields);
        setWorks(fields.worksToday.join("\n"));
        setLoop(fields.loop.join("\n"));
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [id]);

  if (!fields) {
    return error ? <Notice tone="error">{error}</Notice> : <Spinner />;
  }

  const set = <K extends keyof SeriesFields>(key: K, value: SeriesFields[K]) => setFields({ ...fields, [key]: value });
  const text = (key: Exclude<keyof SeriesFields, "worksToday" | "loop" | "productPerEpisode" | "textStyle">, rows = 4) => (
    <textarea className={inputClass} rows={rows} value={fields[key]} onChange={(e) => set(key, e.target.value)} />
  );

  async function save() {
    if (!fields) return;
    setError("");
    setBusy("save");
    const lines = (t: string) =>
      t
        .split("\n")
        .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
        .filter(Boolean);
    const next = { ...fields, worksToday: lines(works), loop: lines(loop) };
    try {
      if (id) {
        const { series } = await api.saveSeries(id, next);
        onSaved(series, id);
      } else {
        const { series, id: newId } = await api.createSeries(next);
        onSaved(series, newId);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!id || !confirm(`¿Borrar la serie "${fields?.name}"? No se puede deshacer.`)) return;
    setError("");
    setBusy("delete");
    try {
      const { series } = await api.deleteSeries(id);
      onDeleted(series);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="space-y-5 rounded-xl border border-line bg-white p-5">
      <div>
        <h2 className="text-lg font-bold">{id ? `Editar serie · ${fields.name}` : "Nueva serie"}</h2>
        <p className="text-sm text-muted">
          Esto es todo lo que la IA sabe de la marca. Se manda completo con cada pedido, así que conviene que esté al día.
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <Field label="Nombre">
          <input className={inputClass} value={fields.name} onChange={(e) => set("name", e.target.value)} />
        </Field>
        <Field label="Frase de la marca (opcional)">
          <input className={inputClass} value={fields.tagline} onChange={(e) => set("tagline", e.target.value)} />
        </Field>
      </div>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-1 size-4"
          checked={fields.productPerEpisode}
          onChange={(e) => set("productPerEpisode", e.target.checked)}
        />
        <span>
          <b>Un producto distinto en cada episodio</b>
          <span className="block text-xs text-muted">
            Como Masogar: el brief pide "Producto de este episodio" y es obligatorio.
          </span>
        </span>
      </label>

      <Field label="Qué es">{text("what", 3)}</Field>

      <Field
        label="Lo que existe hoy"
        hint="Una función o un producto por línea. Es lo único que la IA puede mostrar como real; todo lo demás lo marca como Concepto."
      >
        <textarea className={`${inputClass} font-mono`} rows={9} value={works} onChange={(e) => setWorks(e.target.value)} />
      </Field>

      <Field
        label="El loop de la serie (opcional)"
        hint="Los pasos de la rutina que la marca resuelve, uno por línea y en orden. El check revisa que cada paso que aparece se muestre completo: el dolor, el paso y el resultado."
      >
        <textarea className={`${inputClass} font-mono`} rows={6} value={loop} onChange={(e) => setLoop(e.target.value)} />
      </Field>

      <Field label="La historia que contamos (opcional)" hint="El hilo de la serie. Ej.: el loop diario del kiosco.">
        {text("story")}
      </Field>

      <div className="grid gap-5 md:grid-cols-2">
        <Field label="El Malo" hint="El dolor personificado: quién es y cómo aparece.">
          {text("bad")}
        </Field>
        <Field label="El Bueno" hint="Cómo gana: el producto, la rutina, la marca.">
          {text("good")}
        </Field>
      </div>

      <Field label="Reglas de la serie (opcional)" hint="Lo que nunca se dice o se muestra, el tono, los límites.">
        {text("rules")}
      </Field>
      <Field label="Quién mira">{text("audience", 2)}</Field>
      <Field label="Otras notas (opcional)" hint="Precios, personajes fijos, datos verificados, lo que quieras que la IA sepa siempre.">
        {text("other", 4)}
      </Field>

      {error && <Notice tone="error">{error}</Notice>}

      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
        <Button onClick={save} disabled={busy !== null || !fields.name.trim()}>
          {busy === "save" ? (
            <>
              <Spinner /> Guardando…
            </>
          ) : (
            "Guardar serie"
          )}
        </Button>
        <Button variant="secondary" onClick={onClose} disabled={busy !== null}>
          Cancelar
        </Button>
        {id && (
          <Button variant="ghost" className="ml-auto text-neg" onClick={remove} disabled={busy !== null}>
            Borrar serie
          </Button>
        )}
      </div>
    </section>
  );
}
