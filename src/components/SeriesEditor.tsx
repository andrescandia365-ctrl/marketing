import { useEffect, useRef, useState } from "react";
import type { SeriesInfo } from "../../shared/schema.ts";
import {
  CAST_KIND_LABEL,
  EMPTY_SERIES,
  SERIES_TYPE_LABEL,
  castRef,
  type CastKind,
  type CastMember,
  type SeriesFields,
} from "../../shared/series.ts";
import { api, libraryFileUrl } from "../lib/api.ts";
import { Button, Field, Notice, Segmented, Spinner, inputClass } from "./ui.tsx";

// One member of the fixed cast: name, @ reference, description and approved image.
function CastCard({
  member,
  seriesId,
  version,
  onChange,
  onRemove,
  onImage,
}: {
  member: CastMember;
  seriesId: string | null;
  version: number;
  onChange: (member: CastMember) => void;
  onRemove: () => void;
  onImage: (file: File) => Promise<void>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const screen = member.kind === "screen";
  const url = seriesId && member.image ? libraryFileUrl(seriesId, member.image, version) : undefined;
  const set = <K extends keyof CastMember>(key: K, value: CastMember[K]) => onChange({ ...member, [key]: value });

  async function upload(file: File) {
    setBusy(true);
    setError("");
    try {
      await onImage(file);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="grid grid-cols-[72px_minmax(0,1fr)] gap-3 rounded-lg border border-line p-3">
      <div className="space-y-1">
        <button
          type="button"
          disabled={!seriesId || busy}
          onClick={() => input.current?.click()}
          className="relative block aspect-[9/16] w-[72px] overflow-hidden rounded-md border border-dashed border-line bg-paper text-[10px] font-semibold text-muted disabled:opacity-60"
          title={seriesId ? "Subir la imagen aprobada" : "Guardá la serie primero"}
        >
          {url ? <img src={url} alt="" className="absolute inset-0 size-full object-cover" /> : busy ? <Spinner /> : screen ? "Subir captura" : "Subir imagen"}
        </button>
        <input
          ref={input}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) upload(file);
            e.target.value = "";
          }}
        />
      </div>
      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <input
            className={`${inputClass} w-40 py-1`}
            value={member.name}
            placeholder="Nombre"
            aria-label="Nombre"
            onChange={(e) => {
              const name = e.target.value;
              // The @ reference follows the name until it is edited by hand.
              const auto = member.ref === castRef(member.name);
              onChange({ ...member, name, ref: auto ? castRef(name) : member.ref });
            }}
          />
          <span className="text-xs text-muted">{CAST_KIND_LABEL[member.kind]}</span>
          <label className="flex items-center gap-0.5 font-mono text-xs text-good" title="Nombre de la referencia en Grok">
            @
            <input
              className="w-28 rounded border border-line px-1 py-0.5"
              value={member.ref}
              aria-label="Referencia"
              onChange={(e) => set("ref", e.target.value.replace(/[^A-Za-z0-9_]/g, ""))}
            />
          </label>
          <button type="button" onClick={onRemove} className="ml-auto text-xs font-semibold text-muted hover:text-neg">
            Sacar
          </button>
        </div>
        <textarea
          className={`${inputClass} py-1.5 text-xs`}
          rows={2}
          value={member.identity}
          placeholder={
            screen
              ? "Qué muestra esta pantalla. Ej.: lista de Vence en el celular, con los productos que vencen esta semana."
              : "Descripción visual en inglés, la que se repite en cada prompt. Ej.: a tired but kind corner-store owner in her fifties…"
          }
          aria-label={screen ? "Qué muestra" : "Descripción visual"}
          onChange={(e) => set("identity", e.target.value)}
        />
        <input
          className={`${inputClass} py-1 text-xs`}
          value={member.note}
          placeholder="Cuándo usarlo (opcional)"
          aria-label="Cuándo usarlo"
          onChange={(e) => set("note", e.target.value)}
        />
        {error && <p className="text-xs text-neg">{error}</p>}
      </div>
    </li>
  );
}

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
  const [version, setVersion] = useState(Date.now());
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
  const text = (key: Exclude<keyof SeriesFields, "worksToday" | "loop" | "type" | "textStyle" | "cast">, rows = 4) => (
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

  function addMember(kind: CastKind) {
    if (!fields) return;
    let n = fields.cast.filter((m) => m.kind === kind).length + 1;
    const base = { character: "personaje", place: "lugar", product: "producto", screen: "pantalla" }[kind];
    while (fields.cast.some((m) => m.id === `${base}-${n}`)) n++;
    const name = `${CAST_KIND_LABEL[kind]} ${n}`;
    set("cast", [...fields.cast, { id: `${base}-${n}`, name, ref: castRef(name), kind, identity: "", note: "", image: "" }]);
  }

  // The image goes straight to the series library; the member is saved first so the server knows it.
  async function memberImage(member: CastMember, file: File) {
    if (!id || !fields) return;
    await api.upsertCast(id, member);
    const { file: name } = await api.uploadCastImage(id, member.id, file);
    setFields((f) => (f ? { ...f, cast: f.cast.map((m) => (m.id === member.id ? { ...member, image: name } : m)) } : f));
    setVersion(Date.now());
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

      <Field
        label="Tipo de serie"
        group
        hint={
          fields.type === "software"
            ? "Software: funciones que existen hoy, el loop del producto y pantallas reales de la app."
            : 'E-commerce: un producto distinto en cada episodio; el brief pide "Producto de este episodio".'
        }
      >
        <Segmented
          value={fields.type}
          onChange={(v) => set("type", v)}
          options={[
            { value: "software", label: SERIES_TYPE_LABEL.software },
            { value: "ecommerce", label: SERIES_TYPE_LABEL.ecommerce },
          ]}
        />
      </Field>

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

      <Field
        label="Elenco fijo"
        group
        hint="Personajes, lugares y productos que se repiten en todos los episodios, cada uno con su imagen aprobada y su referencia @ para Grok. La IA los reusa tal cual."
      >
        <div className="space-y-2">
          <ul className="space-y-2">
            {fields.cast
              .filter((m) => m.kind !== "screen")
              .map((m) => (
                <CastCard
                  key={m.id}
                  member={m}
                  seriesId={id}
                  version={version}
                  onChange={(next) => set("cast", fields.cast.map((x) => (x.id === m.id ? next : x)))}
                  onRemove={() => set("cast", fields.cast.filter((x) => x.id !== m.id))}
                  onImage={(file) => memberImage(m, file)}
                />
              ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" className="px-3 py-1 text-xs" onClick={() => addMember("character")}>
              + Personaje
            </Button>
            <Button variant="secondary" className="px-3 py-1 text-xs" onClick={() => addMember("place")}>
              + Lugar
            </Button>
            <Button variant="secondary" className="px-3 py-1 text-xs" onClick={() => addMember("product")}>
              + Producto
            </Button>
          </div>
          {!id && <p className="text-xs text-muted">Las imágenes se suben después de guardar la serie.</p>}
        </div>
      </Field>

      {fields.type === "software" && (
        <Field
          label="Pantallas reales de la app"
          group
          hint="Capturas reales (celular y PC), una por función. La IA no puede dibujar la interfaz: las tomas que muestran la app usan estas capturas tal cual."
        >
          <div className="space-y-2">
            <ul className="space-y-2">
              {fields.cast
                .filter((m) => m.kind === "screen")
                .map((m) => (
                  <CastCard
                    key={m.id}
                    member={m}
                    seriesId={id}
                    version={version}
                    onChange={(next) => set("cast", fields.cast.map((x) => (x.id === m.id ? next : x)))}
                    onRemove={() => set("cast", fields.cast.filter((x) => x.id !== m.id))}
                    onImage={(file) => memberImage(m, file)}
                  />
                ))}
            </ul>
            <Button variant="secondary" className="px-3 py-1 text-xs" onClick={() => addMember("screen")}>
              + Pantalla real
            </Button>
          </div>
        </Field>
      )}

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
