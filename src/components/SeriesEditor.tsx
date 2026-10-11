import { useEffect, useRef, useState } from "react";
import type { SeriesInfo } from "../../shared/schema.ts";
import {
  CAST_KIND_LABEL,
  guessRole,
  type PuppetRole,
  EMPTY_SERIES,
  SERIES_TYPE_LABEL,
  castRef,
  drawableCharacter,
  EXPLAINER_CHARACTER,
  CORRESPONDENT,
  type CastKind,
  type CastMember,
  type SeriesFields,
} from "../../shared/series.ts";
import { inDays, momentLine, upcomingMoments } from "../../shared/calendar.ts";
import { addWebCast, webCastMember } from "../../shared/webCast.ts";
import { SheetBuilder } from "./SheetBuilder.tsx";
import { api } from "../lib/api.ts";
import { Button, Field, Notice, Segmented, Spinner, inputClass } from "./ui.tsx";
import { CastCard } from "./CastCard.tsx";
// CastCard shows CastRefs; importing it here as well keeps the bundler from adding a module-namespace helper to the
// first-screen bundle for the production step's lazy CastRefs (rolldown, checked with npm run build).
import "./CastRefs.tsx";
import { BrandSection, LookSection } from "./SeriesBrandLook.tsx";
import { ReferenceAds } from "./ReferenceAds.tsx";

type Props = {
  // null: a new series.
  id: string | null;
  onSaved: (series: SeriesInfo[], id: string) => void;
  // The logo is saved at once; the app's copy of the series follows.
  onLogoSaved?: (series: SeriesInfo[]) => void;
  onDeleted: (series: SeriesInfo[]) => void;
  onClose: () => void;
  // The tools' cap on reference images (server/tools/*.md), for a member's extra references; null: none named.
  maxRefs?: number | null;
};

export function SeriesEditor({ id, onSaved, onDeleted, onClose, onLogoSaved, maxRefs = null }: Props) {
  const [fields, setFields] = useState<SeriesFields | null>(id ? null : EMPTY_SERIES);
  // "Lo que existe hoy" is edited as text, one item per line.
  const [works, setWorks] = useState("");
  const [practices, setPractices] = useState("");
  const [loop, setLoop] = useState("");
  const [moments, setMoments] = useState("");
  const [sheetFor, setSheetFor] = useState<null | "person" | "place">(null);
  const [version, setVersion] = useState(Date.now());
  // Web pictures whose member reached the server but whose image upload failed, by pick (see addWebCast).
  const webPending = useRef(new Map<string, CastMember>());
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
        setMoments((fields.moments ?? []).join("\n"));
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [id]);

  if (!fields) {
    return error ? <Notice tone="error">{error}</Notice> : <Spinner />;
  }

  const music = fields.type === "music";
  const set = <K extends keyof SeriesFields>(key: K, value: SeriesFields[K]) => setFields({ ...fields, [key]: value });
  const text = (key: Exclude<keyof SeriesFields, "worksToday" | "practices" | "loop" | "moments" | "type" | "textStyle" | "lyricStyle" | "look" | "brand" | "cast" | "references">, rows = 4) => (
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
    // Moments keep a leading number: it is their date ("1.º de mayo", "25.5").
    const next = { ...fields, worksToday: lines(works), practices: lines(practices), loop: lines(loop), moments: [...new Set(moments.split("\n").map(momentLine).filter(Boolean))] };
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
    set("cast", [...fields.cast, { id: `${base}-${n}`, name, ref: castRef(name), kind, identity: "", note: "", image: "", sheet: "", puppet: { layers: [] }, rig: { file: "", clips: { idle: "", walk: "", turnL: "", turnR: "", point: "" } }, refs: [], views: [] }]);
  }

  // Puppet parts go straight to the series library, in order; each answer brings the member as the server has it.
  async function memberPuppetFiles(member: CastMember, files: File[]) {
    if (!id || !fields) return;
    await api.upsertCast(id, member);
    let current = member;
    for (const file of files) {
      const { member: next } = await api.uploadPuppetLayer(id, member.id, current.puppet.layers.length, file, guessRole(file.name), file.name);
      current = { ...current, puppet: next.puppet };
      const updated = current;
      setFields((f) => (f ? { ...f, cast: f.cast.map((m) => (m.id === member.id ? updated : m)) } : f));
    }
  }

  async function memberPuppetReplace(member: CastMember, layers: { role: PuppetRole; name: string; png: string }[]) {
    if (!id || !fields) return;
    await api.upsertCast(id, member);
    const { member: next } = await api.replacePuppet(id, member.id, layers);
    setFields((f) => (f ? { ...f, cast: f.cast.map((m) => (m.id === member.id ? { ...m, puppet: next.puppet } : m)) } : f));
    setVersion(Date.now());
  }

  // "Armar a mano" saved: the server's answer is the member's puppet now.
  function memberPuppetArranged(next: CastMember) {
    setFields((f) => (f ? { ...f, cast: f.cast.map((m) => (m.id === next.id ? { ...m, puppet: next.puppet } : m)) } : f));
  }

  async function memberRigFile(member: CastMember, file: File): Promise<CastMember> {
    if (!id) throw new Error("Guardá la serie primero.");
    await api.upsertCast(id, member);
    const { member: next } = await api.uploadRig(id, member.id, file);
    setFields((f) => (f ? { ...f, cast: f.cast.map((m) => (m.id === member.id ? { ...m, rig: next.rig } : m)) } : f));
    return { ...member, rig: next.rig };
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
        works={works}
        onName={(name, tagline) => setFields((f) => (f ? { ...f, name: name || f.name, tagline: tagline || f.tagline } : f))}
        onConfirm={(claim) => setWorks((w) => (w.trim() ? `${w.replace(/\s+$/, "")}\n${claim}` : claim))}
        seriesType={fields.type}
        onCast={async (pick, file, confirmed) => {
          if (!id) return;
          // Saved and its image stored before it joins the form: a failed upload leaves nothing behind, and a retry
          // reuses the same member instead of adding a second one.
          const member = await addWebCast(
            webPending.current,
            `${pick.kind}:${pick.url}`,
            fields.cast,
            (taken) => webCastMember(pick, taken, { confirmed, date: new Date().toLocaleDateString("es-AR") }),
            async (m) => {
              await api.upsertCast(id, m);
              return (await api.uploadCastImage(id, m.id, file)).file;
            },
          );
          setFields((f) => (f ? { ...f, cast: [...f.cast.filter((m) => m.id !== member.id), member] } : f));
          setVersion(Date.now());
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
            label="Momentos del calendario (opcional)"
            hint="Fechas que el público ya siente, una por línea: «cuándo: qué pasa». Ej.: «el 1 de cada mes: cobran los sueldos», «primera semana de junio: primer frío», «los lunes: llega el proveedor». El brief te sugiere el más cercano, y el menú y los ganchos de Publicidad los usan."
          >
            <textarea
              className={`${inputClass} font-mono`}
              rows={5}
              value={moments}
              onChange={(e) => setMoments(e.target.value)}
            />
            {moments.trim() && (
              <ul className="mt-1 space-y-0.5 text-xs text-muted">
                {upcomingMoments(moments.split("\n"), new Date()).map((m) => (
                  <li key={m.line}>
                    {m.days === null ? (
                      <span className="text-amber-800">Sin fecha fija: la IA lo usa igual, pero no se puede sugerir por cercanía.</span>
                    ) : (
                      <span className="text-ink">
                        {inDays(m.days)} · {m.next!.split("-").reverse().join("/")}
                      </span>
                    )}{" "}
                    · {m.what}
                  </li>
                ))}
              </ul>
            )}
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
                      onPuppetReplace={(layers) => memberPuppetReplace(m, layers)}
                      onPuppetRemove={(index) => memberPuppetRemove(m, index)}
                      onPuppetArranged={(next) => memberPuppetArranged(next)}
                      onRigFile={(file) => memberRigFile(m, file)}
                      maxRefs={maxRefs}
                      onRefs={(next, series) => {
                        setFields((f) => (f ? { ...f, cast: f.cast.map((x) => (x.id === next.id ? { ...x, refs: next.refs } : x)) } : f));
                        // The extra references are saved at once (like the logo): the app's copy of the series follows.
                        onLogoSaved?.(series);
                      }}
                      onBeforeRef={async () => {
                        if (id) await api.upsertCast(id, m);
                      }}
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
              {(() => {
                const hosts = fields.cast.filter(drawableCharacter);
                const current = fields.cast.find((m) => m.id === fields.explainerCharacter);
                return (
                  <label className="block text-xs">
                    <span className="font-semibold">{EXPLAINER_CHARACTER}</span>
                    <select
                      className={`${inputClass} mt-0.5 py-1`}
                      value={fields.explainerCharacter}
                      onChange={(e) => set("explainerCharacter", e.target.value)}
                      disabled={!hosts.length && !fields.explainerCharacter}
                    >
                      <option value="">Ninguno fijo: la IA elige en cada pieza</option>
                      {hosts.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                          {m.rig?.file ? " (camina)" : m.puppet.layers.length ? " (títere 3D)" : " (imagen)"}
                        </option>
                      ))}
                      {fields.explainerCharacter && !hosts.some((m) => m.id === fields.explainerCharacter) && (
                        <option value={fields.explainerCharacter}>{current ? `${current.name} (sin imagen ni títere)` : "Ya no está en el elenco"}</option>
                      )}
                    </select>
                    <span className="mt-0.5 block text-muted">
                      {hosts.length
                        ? "El mismo personaje presenta en todos los explicativos de la serie, así la gente lo reconoce."
                        : "Subí la imagen o el títere de un personaje para elegirlo acá."}
                    </span>
                  </label>
                );
              })()}
              {(() => {
                const people = fields.cast.filter((m) => m.kind === "character");
                return (
                  <label className="block text-xs">
                    <span className="font-semibold">{CORRESPONDENT}</span>
                    <select
                      className={`${inputClass} mt-0.5 py-1`}
                      value={fields.correspondent}
                      onChange={(e) => set("correspondent", e.target.value)}
                      disabled={!people.length && !fields.correspondent}
                    >
                      <option value="">Ninguno fijo: la IA inventa uno cuando la pieza lo pide</option>
                      {people.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name || m.id}
                        </option>
                      ))}
                      {fields.correspondent && !people.some((m) => m.id === fields.correspondent) && (
                        <option value={fields.correspondent}>Ya no está en el elenco</option>
                      )}
                    </select>
                    <span className="mt-0.5 block text-muted">
                      {people.length
                        ? "Sale «en el lugar» en las historias «Con corresponsal» (y puede hacer las preguntas en una «Visita de campo»): escala lo absurdo y vuelve al problema real."
                        : "Sumá un personaje al elenco para elegirlo acá."}
                    </span>
                  </label>
                );
              })()}
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
                    onPuppetReplace={(layers) => memberPuppetReplace(m, layers)}
                    onPuppetRemove={(index) => memberPuppetRemove(m, index)}
                    onPuppetArranged={(next) => memberPuppetArranged(next)}
                    onRigFile={(file) => memberRigFile(m, file)}
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

      {!music && (
        <Field
          label="Referencias: analizar un anuncio que funciona (opcional)"
          group
          hint="Fichas de estructura de anuncios ajenos. La IA las lee para armar piezas: toma el orden y la forma, nunca el anuncio."
        >
          <ReferenceAds seriesId={id} references={fields.references ?? []} onChange={(next) => set("references", next)} />
        </Field>
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
