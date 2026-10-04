import { useEffect, useRef, useState } from "react";
import type { SeriesInfo } from "../../shared/schema.ts";
import {
  CAST_KIND_LABEL,
  PUPPET_ROLES,
  PUPPET_ROLE_LABEL,
  guessRole,
  type PuppetRole,
  DISPLAY_FONTS,
  EMPTY_LOOK,
  UI_FONTS,
  EMPTY_SERIES,
  LOOK_PRESETS,
  SERIES_TYPE_LABEL,
  castRef,
  type CastKind,
  type CastMember,
  type SeriesFields,
  type Brand,
  type SeriesLook,
} from "../../shared/series.ts";
import { ensureFont } from "../lib/fonts.ts";
import { PuppetPreview } from "./PuppetPreview.tsx";
import { SheetBuilder } from "./SheetBuilder.tsx";
import { CopyButton } from "./ScriptView.tsx";
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
  onPuppetFiles,
  onPuppetRemove,
}: {
  member: CastMember;
  seriesId: string | null;
  version: number;
  onChange: (member: CastMember) => void;
  onRemove: () => void;
  onImage: (file: File) => Promise<void>;
  onPuppetFiles: (files: File[]) => Promise<void>;
  onPuppetRemove: (index: number) => Promise<void>;
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
        {member.kind === "character" && (
          <details className="text-xs" open={member.puppet.layers.length > 0 || undefined}>
            <summary className="cursor-pointer font-semibold text-muted">
              Títere 3D para los explicativos {member.puppet.layers.length ? `(${member.puppet.layers.length} partes)` : ""}
            </summary>
            <div className="mt-1.5 space-y-2">
              <p className="text-muted">
                Hacé la vista «Para el títere» (de frente, brazos separados, boca cerrada; la escribe «+ Personaje con hoja» → Personaje 3D). En Grok:
                Segmentos → cabeza, cuerpo, cada brazo, boca y ojos → Descargar todo. Subí esas capas acá (PNG con fondo transparente, todas del mismo
                cuadro, así encajan solas). Sin partes, el personaje usa su imagen entera.
              </p>
              <div className="flex flex-wrap items-start gap-3">
                {seriesId && <PuppetPreview seriesId={seriesId} puppet={member.puppet} />}
                <ul className="min-w-0 flex-1 space-y-1">
                  {member.puppet.layers.map((l, i) => (
                    <li key={l.file} className="flex items-center gap-2">
                      {seriesId && <img src={libraryFileUrl(seriesId, l.file)} alt="" className="size-9 rounded border border-line bg-paper object-contain" />}
                      <select
                        className={`${inputClass} w-auto py-0.5 text-xs`}
                        value={l.role}
                        aria-label={`Parte ${i + 1}`}
                        onChange={(e) =>
                          set("puppet", { layers: member.puppet.layers.map((x, k) => (k === i ? { ...x, role: e.target.value as PuppetRole, pivot: null } : x)) })
                        }
                      >
                        {PUPPET_ROLES.map((r) => (
                          <option key={r} value={r}>
                            {PUPPET_ROLE_LABEL[r]}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="text-xs font-semibold text-muted hover:text-neg"
                        disabled={busy}
                        onClick={async () => {
                          setBusy(true);
                          setError("");
                          try {
                            await onPuppetRemove(i);
                          } catch (e) {
                            setError(e instanceof Error ? e.message : String(e));
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        Quitar
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
              <label className={`inline-flex items-center gap-2 ${seriesId ? "" : "opacity-50"}`}>
                <span className="rounded-lg border border-line bg-white px-2.5 py-1 font-semibold hover:border-ink">{busy ? "Subiendo…" : "Subir capas"}</span>
                <input
                  type="file"
                  accept="image/png,image/webp"
                  multiple
                  disabled={!seriesId || busy}
                  className="hidden"
                  aria-label={`Subir capas del títere de ${member.name}`}
                  onChange={async (e) => {
                    const files = [...(e.target.files ?? [])];
                    e.target.value = "";
                    if (!files.length) return;
                    setBusy(true);
                    setError("");
                    try {
                      await onPuppetFiles(files);
                    } catch (err) {
                      setError(err instanceof Error ? err.message : String(err));
                    } finally {
                      setBusy(false);
                    }
                  }}
                />
              </label>
              {member.puppet.layers.length > 0 && !member.puppet.layers.some((l) => l.role === "head") && (
                <p className="text-neg">Falta la cabeza: marcá qué capa es (sin cabeza no gira ni habla).</p>
              )}
            </div>
          </details>
        )}
        {member.sheet && (
          <details className="text-xs">
            <summary className="cursor-pointer font-semibold text-muted">Hoja de referencia</summary>
            <p className="mt-1 font-mono">{member.sheet}</p>
            <CopyButton text={member.sheet} idle="Copiar la hoja" variant="secondary" />
          </details>
        )}
        {error && <p className="text-xs text-neg">{error}</p>}
      </div>
    </li>
  );
}

// The brand kit for motion graphics: logo, three colours (one accent) and two fonts.
function BrandSection({
  brand,
  seriesId,
  version,
  onChange,
  onLogo,
}: {
  brand: Brand;
  seriesId: string | null;
  version: number;
  onChange: (brand: Brand) => void;
  onLogo: (file: File) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    ensureFont(brand.displayFont);
    ensureFont(brand.uiFont);
  }, [brand.displayFont, brand.uiFont]);
  const logo = seriesId && brand.logo ? libraryFileUrl(seriesId, brand.logo, version) : undefined;
  const color = (key: "bg" | "text" | "accent", label: string) => (
    <label className="flex items-center gap-1.5 text-xs">
      <input type="color" value={brand[key]} onChange={(e) => onChange({ ...brand, [key]: e.target.value })} />
      {label}
    </label>
  );
  return (
    <Field
      label="Marca (motion graphics)"
      group
      hint="Logo, un fondo, un color de texto, UN acento, una fuente de títulos y una de interfaz. Los explicativos y los videos de letra las usan."
    >
      <div className="grid gap-3 sm:grid-cols-[120px_minmax(0,1fr)]">
        <div className="space-y-1">
          <label
            className={`grid aspect-square w-[120px] cursor-pointer place-items-center overflow-hidden rounded-lg border border-dashed border-line bg-paper text-xs text-muted ${!seriesId ? "opacity-60" : ""}`}
            title={seriesId ? "Subir el logo" : "Guardá la serie primero"}
          >
            {logo ? <img src={logo} alt="Logo" className="size-full object-contain p-2" /> : busy ? <Spinner /> : "Subir logo"}
            <input
              type="file"
              accept="image/png,image/webp,image/jpeg"
              className="hidden"
              disabled={!seriesId || busy}
              aria-label="Subir el logo"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                setBusy(true);
                setError("");
                try {
                  await onLogo(file);
                } catch (err) {
                  setError(err instanceof Error ? err.message : String(err));
                } finally {
                  setBusy(false);
                }
              }}
            />
          </label>
          {error && <p className="text-xs text-neg">{error}</p>}
        </div>
        <div className="space-y-2">
          <div className="flex flex-wrap gap-3">
            {color("bg", "Fondo")}
            {color("text", "Texto")}
            {color("accent", "Acento (uno solo)")}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block text-xs">
              <span className="font-semibold">Fuente de títulos</span>
              <select className={`${inputClass} mt-0.5 py-1`} value={brand.displayFont} onChange={(e) => onChange({ ...brand, displayFont: e.target.value })}>
                {DISPLAY_FONTS.map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </select>
            </label>
            <label className="block text-xs">
              <span className="font-semibold">Fuente de interfaz</span>
              <select className={`${inputClass} mt-0.5 py-1`} value={brand.uiFont} onChange={(e) => onChange({ ...brand, uiFont: e.target.value })}>
                {UI_FONTS.map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="rounded-lg p-3" style={{ background: brand.bg, color: brand.text }}>
            <p style={{ fontFamily: `"${brand.displayFont}"`, fontWeight: 700, fontSize: 22, lineHeight: 1.1 }}>
              Armá el pedido <span style={{ color: brand.accent }}>antes del corte</span>
            </p>
            <p style={{ fontFamily: `"${brand.uiFont}"`, fontSize: 13, opacity: 0.85 }}>Así se ven los títulos y el texto.</p>
          </div>
        </div>
      </div>
    </Field>
  );
}

const LOOK_FIELDS: { key: keyof SeriesLook; label: string; hint: string }[] = [
  { key: "camera", label: "Cámara", hint: "Ej.: celular en mano; compacta digital de los 2000." },
  { key: "flash", label: "Flash", hint: "Ej.: flash directo que aplana la cara; sin flash." },
  { key: "grain", label: "Grano y ruido", hint: "Ej.: ruido en las sombras, compresión de celular." },
  { key: "focus", label: "Foco", hint: "Ej.: el autofoco busca y a veces se va al fondo." },
  { key: "light", label: "Luz (nunca cambia)", hint: "De dónde viene. Solo cambia la exposición automática." },
  { key: "extra", label: "Otros defectos", hint: "Ej.: piel con poros y pecas, sin filtro." },
];

// The series' look as flaws (camera, flash, grain, focus, light), never "cinematic": it goes into every prompt.
function LookSection({ look, onChange }: { look: SeriesLook; onChange: (look: SeriesLook) => void }) {
  return (
    <Field
      label="Look (cámara y defectos)"
      group
      hint='Para que se vea real: pedí defectos, no "cinematic" ni "vintage". Va en todos los prompts de imagen y de video. En inglés o castellano: la IA lo pasa al prompt.'
    >
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          {Object.entries(LOOK_PRESETS).map(([key, preset]) => (
            <Button key={key} variant="secondary" className="px-3 py-1 text-xs" onClick={() => onChange(preset.look)}>
              {preset.label}
            </Button>
          ))}
          <Button variant="ghost" className="px-3 py-1 text-xs" onClick={() => onChange(EMPTY_LOOK)}>
            Sin look fijo
          </Button>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {LOOK_FIELDS.map((f) => (
            <label key={f.key} className="block text-xs">
              <span className="font-semibold">{f.label}</span>
              <input
                className={`${inputClass} mt-0.5 py-1.5 text-xs`}
                value={look[f.key]}
                placeholder={f.hint}
                onChange={(e) => onChange({ ...look, [f.key]: e.target.value })}
              />
            </label>
          ))}
        </div>
      </div>
    </Field>
  );
}

type Props = {
  // null: a new series.
  id: string | null;
  onSaved: (series: SeriesInfo[], id: string) => void;
  // The logo is saved at once; the app's copy of the series follows.
  onLogoSaved?: (series: SeriesInfo[]) => void;
  onDeleted: (series: SeriesInfo[]) => void;
  onClose: () => void;
};

export function SeriesEditor({ id, onSaved, onDeleted, onClose, onLogoSaved }: Props) {
  const [fields, setFields] = useState<SeriesFields | null>(id ? null : EMPTY_SERIES);
  // "Lo que existe hoy" is edited as text, one item per line.
  const [works, setWorks] = useState("");
  const [practices, setPractices] = useState("");
  const [loop, setLoop] = useState("");
  const [sheetFor, setSheetFor] = useState<null | "person" | "place">(null);
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
        setPractices(fields.practices.join("\n"));
        setLoop(fields.loop.join("\n"));
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [id]);

  if (!fields) {
    return error ? <Notice tone="error">{error}</Notice> : <Spinner />;
  }

  const music = fields.type === "music";
  const set = <K extends keyof SeriesFields>(key: K, value: SeriesFields[K]) => setFields({ ...fields, [key]: value });
  const text = (key: Exclude<keyof SeriesFields, "worksToday" | "practices" | "loop" | "type" | "textStyle" | "lyricStyle" | "look" | "brand" | "cast">, rows = 4) => (
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
    const next = { ...fields, worksToday: lines(works), practices: lines(practices), loop: lines(loop) };
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
    set("cast", [...fields.cast, { id: `${base}-${n}`, name, ref: castRef(name), kind, identity: "", note: "", image: "", sheet: "", puppet: { layers: [] } }]);
  }

  // Puppet parts go straight to the series library, in order; each answer brings the member as the server has it.
  async function memberPuppetFiles(member: CastMember, files: File[]) {
    if (!id || !fields) return;
    await api.upsertCast(id, member);
    let current = member;
    for (const file of files) {
      const { member: next } = await api.uploadPuppetLayer(id, member.id, current.puppet.layers.length, file, guessRole(file.name));
      current = { ...current, puppet: next.puppet };
      const updated = current;
      setFields((f) => (f ? { ...f, cast: f.cast.map((m) => (m.id === member.id ? updated : m)) } : f));
    }
  }

  async function memberPuppetRemove(member: CastMember, index: number) {
    if (!id) return;
    const { member: next } = await api.removePuppetLayer(id, member.id, index);
    setFields((f) => (f ? { ...f, cast: f.cast.map((m) => (m.id === member.id ? { ...m, puppet: next.puppet } : m)) } : f));
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
            : fields.type === "ecommerce"
              ? 'E-commerce: un producto distinto en cada episodio; el brief pide "Producto de este episodio".'
              : "Música: videos de letra. Sin historia: subís la canción, pegás la letra (en cualquier idioma), se sincroniza y se anima sobre un fondo orgánico."
        }
      >
        <Segmented
          value={fields.type}
          onChange={(v) => set("type", v)}
          options={[
            { value: "software", label: SERIES_TYPE_LABEL.software },
            { value: "ecommerce", label: SERIES_TYPE_LABEL.ecommerce },
            { value: "music", label: SERIES_TYPE_LABEL.music },
          ]}
        />
      </Field>

      <Field
        label="Qué es"
        hint={music ? "El artista o el proyecto, el género, el clima de las canciones. La IA lo lee para proponer colores y palabras." : undefined}
      >
        {text("what", 3)}
      </Field>

      <BrandSection
        brand={fields.brand}
        seriesId={id}
        version={version}
        onChange={(brand) => set("brand", brand)}
        onLogo={async (file) => {
          if (!id) return;
          const { file: logo, series } = await api.uploadLogo(id, file);
          setFields((f) => (f ? { ...f, brand: { ...f.brand, logo } } : f));
          setVersion(Date.now());
          onLogoSaved?.(series);
        }}
      />

      {!music && <LookSection look={fields.look} onChange={(look) => set("look", look)} />}

      {!music && (
        <>
          <Field
            label="Lo que existe hoy"
            hint="Una función o un producto por línea. Es lo único que la IA puede mostrar como real; todo lo demás lo marca como Concepto."
          >
            <textarea className={`${inputClass} font-mono`} rows={9} value={works} onChange={(e) => setWorks(e.target.value)} />
          </Field>

          <Field
            label="Cómo se trabaja hoy"
            hint="Cómo hace la gente cada cosa hoy, sin la marca, una por línea. Ej.: el pedido se arma mirando la góndola. La IA arma los dolores solo con esto y las notas del brief; si muestra otra costumbre, el check la marca."
          >
            <textarea
              className={`${inputClass} font-mono`}
              rows={6}
              value={practices}
              onChange={(e) => setPractices(e.target.value)}
            />
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
                      onPuppetFiles={(files) => memberPuppetFiles(m, files)}
                      onPuppetRemove={(index) => memberPuppetRemove(m, index)}
                    />
                  ))}
              </ul>
              {sheetFor && id && (
                <SheetBuilder
                  seriesId={id}
                  place={sheetFor === "place"}
                  cast={fields.cast}
                  onAdd={(member) => set("cast", [...fields.cast, member])}
                  onClose={() => setSheetFor(null)}
                />
              )}
              <div className="flex flex-wrap gap-2">
                <Button className="px-3 py-1 text-xs" onClick={() => setSheetFor("person")} disabled={!id} title={id ? undefined : "Guardá la serie primero"}>
                  + Personaje con hoja
                </Button>
                <Button className="px-3 py-1 text-xs" onClick={() => setSheetFor("place")} disabled={!id} title={id ? undefined : "Guardá la serie primero"}>
                  + Lugar con hoja
                </Button>
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
        </>
      )}

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
                    onPuppetFiles={(files) => memberPuppetFiles(m, files)}
                    onPuppetRemove={(index) => memberPuppetRemove(m, index)}
                  />
                ))}
            </ul>
            <Button variant="secondary" className="px-3 py-1 text-xs" onClick={() => addMember("screen")}>
              + Pantalla real
            </Button>
          </div>
        </Field>
      )}

      {!music && (
        <>
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
        </>
      )}

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
