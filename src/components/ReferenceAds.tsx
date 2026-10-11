// Editar serie → "Referencias": "Analizar un anuncio que funciona" (PLAYBOOK §3.2). The person uploads an ad they like;
// the model that looks at pictures tears it down into its structure and the series keeps only that text. The picture
// is sent for that one request; its thumbnail lives only in this browser tab and never goes to an image generator.
import { useEffect, useState } from "react";
import { IMAGE_STYLE_LABEL, MAX_REFERENCES, REFERENCE_ANGLE_LABEL, type Reference } from "../../shared/reference.ts";
import { api } from "../lib/api.ts";
import { pictureForReview } from "../lib/files.ts";
import { Button, Notice, Spinner, inputClass } from "./ui.tsx";

function Row({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <p>
      <span className="font-semibold">{label}:</span> {value}
    </p>
  );
}

export function ReferenceCard({ reference: r, onRemove }: { reference: Reference; onRemove?: () => void }) {
  return (
    <li className="space-y-1 rounded-lg border border-line p-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold">{r.title}</p>
        <span className="rounded bg-paper px-1.5 py-0.5">{REFERENCE_ANGLE_LABEL[r.angle]}</span>
        {r.added && <span className="text-muted">{r.added}</span>}
        {onRemove && (
          <Button variant="ghost" className="ml-auto px-2 py-0.5 text-xs text-neg" onClick={onRemove}>
            Quitar
          </Button>
        )}
      </div>
      <Row label="Por qué ese ángulo" value={r.angleWhy} />
      <Row label="Se ve primero" value={r.first} />
      <Row label="Después" value={r.next} />
      <Row label="Al final" value={r.last} />
      <Row label="Armado" value={r.layout} />
      {r.palette.length > 0 && (
        <p className="flex flex-wrap items-center gap-1">
          <span className="font-semibold">Colores:</span>
          {r.palette.map((c) => (
            <span key={c} className="inline-flex items-center gap-0.5">
              <span className="inline-block size-3 rounded border border-line" style={{ background: c }} />
              <code>{c}</code>
            </span>
          ))}
        </p>
      )}
      <Row label="Letra" value={r.type} />
      <Row label="Estilo de imagen" value={IMAGE_STYLE_LABEL[r.imageStyle]} />
      <Row label="Contraste" value={r.contrast} />
      <Row label="Aire" value={r.whitespace} />
      <Row label="Encuadre" value={r.framing} />
      {(r.hook || r.promise || r.cta || r.otherLines.length > 0) && (
        <div className="rounded bg-paper p-1.5">
          <p className="text-muted">Sus palabras, para entender cómo está armado. Nunca se reusan.</p>
          <Row label="Gancho" value={r.hook} />
          <Row label="Promesa" value={r.promise} />
          <Row label="Llamado a la acción" value={r.cta} />
          <Row label="Otras líneas" value={r.otherLines.join(" · ")} />
        </div>
      )}
      {r.borrow.length > 0 && (
        <div>
          <p className="font-semibold">Qué tomar (solo la estructura):</p>
          <ul className="ml-4 list-disc">
            {r.borrow.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
      )}
      {r.avoid.length > 0 && (
        <div>
          <p className="font-semibold">Qué no tomar:</p>
          <ul className="ml-4 list-disc">
            {r.avoid.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
      )}
      <Row label="Nota" value={r.note} />
    </li>
  );
}

export function ReferenceAds({
  seriesId,
  references,
  onChange,
}: {
  // null: a series not saved yet (the analysis then does not read its bible).
  seriesId: string | null;
  references: Reference[];
  onChange: (next: Reference[]) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [thumb, setThumb] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  // The thumbnail is an object URL in this tab only; it goes away with the next picture or when the panel closes.
  useEffect(() => {
    if (!file) return setThumb("");
    const url = URL.createObjectURL(file);
    setThumb(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const full = references.length >= MAX_REFERENCES;

  async function analyse() {
    if (!file) return;
    setBusy(true);
    setError("");
    setInfo("");
    try {
      const { jpeg } = await pictureForReview(thumb, 1280);
      const reply = await api.teardownAd(seriesId, jpeg, note);
      if (reply.demo || !reply.reference) {
        setInfo(reply.note || "Para desarmar un anuncio hace falta una IA que mire imágenes: cargá una clave en Modelos.");
        return;
      }
      onChange([...references, reply.reference]);
      setInfo("Ficha agregada. Se guarda en la serie con «Guardar serie»; la imagen no se guarda.");
      setFile(null);
      setNote("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 text-xs">
      <Notice tone="info">
        <p>
          Subí un anuncio que funcione (de la competencia o de quien sea) y la IA que mira imágenes lo desarma: qué se ve
          primero, colores, letra, el texto separado en gancho, promesa y llamado, y el ángulo. La serie guarda solo esa
          ficha en texto.
        </p>
        <p className="mt-1">
          <b>La estructura sí, el anuncio no:</b> la imagen no se guarda en la serie ni se manda nunca al generador de
          imágenes, y su logo, su producto, sus fotos y sus frases nunca aparecen en lo nuestro.
        </p>
      </Notice>
      <div className="flex flex-wrap items-center gap-2">
        <label className="cursor-pointer rounded-lg border border-line px-3 py-1 hover:bg-paper">
          {file ? "Cambiar la imagen" : "Elegir la imagen del anuncio"}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setInfo("");
              setError("");
              e.target.value = "";
            }}
          />
        </label>
        {thumb && <img src={thumb} alt="Anuncio de referencia (solo en esta pestaña)" className="h-16 rounded border border-line object-contain" />}
      </div>
      <input
        className={`${inputClass} py-1 text-xs`}
        placeholder="Nota opcional: de dónde salió, qué te gusta de él"
        aria-label="Nota sobre el anuncio"
        maxLength={400}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <Button className="px-3 py-1 text-xs" disabled={!file || busy || full} onClick={analyse}>
        {busy ? <Spinner /> : null} Desarmar el anuncio
      </Button>
      {full && <p className="text-muted">Ya hay {MAX_REFERENCES} referencias: quitá una para sumar otra.</p>}
      {error && <p className="text-neg">{error}</p>}
      {info && <p className="text-muted">{info}</p>}
      {references.length > 0 && (
        <ul className="space-y-2">
          {references.map((r, i) => (
            <ReferenceCard key={`${r.title}-${i}`} reference={r} onRemove={() => onChange(references.filter((_, k) => k !== i))} />
          ))}
        </ul>
      )}
    </div>
  );
}
