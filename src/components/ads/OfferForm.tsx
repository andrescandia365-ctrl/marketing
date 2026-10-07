// The offer profile, once per series. Everything the AI writes for the ads reads it, and the Playbook writer reads
// the same profile, so every piece sounds like the same brand.
import { useState } from "react";
import { EMPTY_OFFER, offerFilled, type Offer } from "../../../shared/ads.ts";
import type { SeriesInfo } from "../../../shared/schema.ts";
import { Button, Field, Notice, Segmented, Spinner, inputClass } from "../ui.tsx";

type Props = {
  offer: Offer;
  series: SeriesInfo;
  seriesFields: { worksToday: string[]; audience: string; what: string } | null;
  onSave: (offer: Offer) => Promise<void>;
  defaultVoice?: string;
};

const lines = (xs: string[]) => xs.join("\n");
const toList = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 20);

export function OfferForm({ offer, series, seriesFields, onSave, defaultVoice = "" }: Props) {
  const [draft, setDraft] = useState<Offer>({ ...EMPTY_OFFER, ...offer });
  const [objections, setObjections] = useState(lines(offer.objections));
  const [proofs, setProofs] = useState(lines(offer.proofs));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const set = <K extends keyof Offer>(k: K, v: Offer[K]) => {
    setSaved(false);
    setDraft((d) => ({ ...d, [k]: v }));
  };

  async function save() {
    setSaving(true);
    try {
      await onSave({ ...draft, objections: toList(objections), proofs: toList(proofs) });
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  // Prefill from the series bible: the product, who watches, and what exists today as proofs to pick from.
  function fromSeries() {
    if (!seriesFields) return;
    setSaved(false);
    setDraft((d) => ({
      ...d,
      product: d.product || `${series.name}${series.tagline ? `: ${series.tagline}` : ""}`,
      audience: d.audience || seriesFields.audience,
      problem: d.problem || seriesFields.what.split(/\n/)[0] || "",
    }));
    if (!proofs.trim()) setProofs(lines(seriesFields.worksToday.slice(0, 8)));
  }

  return (
    <section className="space-y-4">
      {!offerFilled(offer) && (
        <Notice tone="warn">
          <b>Primero el perfil de oferta.</b> Producto, público, problema y promesa son lo mínimo: todo lo que genera la IA (hooks, meats, CTAs, textos de la plataforma) lo lee de acá, y no hace falta repetirlo en cada pedido.
        </Notice>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={fromSeries} disabled={!seriesFields}>
          Traer de la serie {series.name}
        </Button>
        <span className="text-xs text-muted">Completa lo vacío con la biblia de la serie; «Lo que existe hoy» pasa a las pruebas.</span>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Producto" hint="Qué es y qué hace, en una línea.">
          <input className={inputClass} value={draft.product} onChange={(e) => set("product", e.target.value)} />
        </Field>
        <Field label="Quién habla" hint="El mismo presentador o voz en todas las piezas, para que corten entre sí.">
          <input className={inputClass} value={draft.presenter} placeholder="p. ej. la dueña del local, mujer de 40, sin nombre" onChange={(e) => set("presenter", e.target.value)} />
          <input
            className={`${inputClass} mt-2`}
            value={draft.ttsVoice}
            placeholder={`Voz generada del presentador (por defecto: ${defaultVoice || "la de la app"})`}
            aria-label="Voz generada del presentador"
            onChange={(e) => set("ttsVoice", e.target.value)}
          />
        </Field>
        <Field label="Público" hint="Quién compra, qué hace hoy, qué le duele.">
          <textarea className={`${inputClass} min-h-20`} value={draft.audience} onChange={(e) => set("audience", e.target.value)} />
        </Field>
        <Field label="Problema" hint="El problema que resuelve, en palabras simples.">
          <textarea className={`${inputClass} min-h-20`} value={draft.problem} onChange={(e) => set("problem", e.target.value)} />
        </Field>
        <Field label="Promesa" hint="Qué cambia para quien lo usa. Beneficio, no característica.">
          <textarea className={`${inputClass} min-h-16`} value={draft.promise} onChange={(e) => set("promise", e.target.value)} />
        </Field>
        <Field label="Landing / qué tan fácil es" hint="Precio, prueba gratis, cuánto tarda. De acá sale el «qué tan fácil» del CTA.">
          <textarea className={`${inputClass} min-h-16`} value={draft.landing} placeholder="p. ej. 14 días gratis, sin tarjeta; se arma en 10 minutos" onChange={(e) => set("landing", e.target.value)} />
        </Field>
        <Field label="Objeciones" hint="Una por línea: por qué dudan o no compran.">
          <textarea className={`${inputClass} min-h-20`} value={objections} onChange={(e) => (setSaved(false), setObjections(e.target.value))} />
        </Field>
        <Field label="Pruebas" hint="Una por línea: testimonios reales (con permiso) y números verificados. La IA solo cita estas.">
          <textarea className={`${inputClass} min-h-20`} value={proofs} onChange={(e) => (setSaved(false), setProofs(e.target.value))} />
        </Field>
        <Field label="Lo que no se puede decir" hint="Promesas, palabras o comparaciones prohibidas.">
          <textarea className={`${inputClass} min-h-16`} value={draft.forbidden} onChange={(e) => set("forbidden", e.target.value)} />
        </Field>
        <Field label="El lenguaje del público" hint="Los comentarios y preguntas más repetidos del contenido orgánico: materia prima para hooks.">
          <textarea className={`${inputClass} min-h-16`} value={draft.audienceLanguage} onChange={(e) => set("audienceLanguage", e.target.value)} />
        </Field>
        <Field label="Tono" group>
          <Segmented
            value={draft.tone}
            options={[
              { value: "dry", label: "Seco" },
              { value: "warm", label: "Cálido" },
              { value: "absurdist", label: "Absurdo" },
            ]}
            onChange={(v) => set("tone", v)}
          />
        </Field>
      </div>
      <div className="flex items-center gap-3 border-t border-line pt-4">
        <Button onClick={save} disabled={saving}>
          {saving ? (
            <>
              <Spinner /> Guardando…
            </>
          ) : (
            "Guardar perfil"
          )}
        </Button>
        {saved && <span className="text-sm text-good">Guardado ✓</span>}
      </div>
    </section>
  );
}
