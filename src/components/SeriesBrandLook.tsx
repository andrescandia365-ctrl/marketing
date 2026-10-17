// Editar serie: the brand kit (logo, colours, fonts, how it moves) and the series' look (camera and flaws).
import { useEffect, useState } from "react";
import {
  DISPLAY_FONTS,
  EMPTY_LOOK,
  UI_FONTS,
  LOOK_PRESETS,
  BRAND_MOTIONS,
  BRAND_MOTION_LABEL,
  brandContrast,
  stepDownContrast,
  type BrandMotion,
  type SeriesType,
  type Brand,
  type SeriesLook,
} from "../../shared/series.ts";
import { brandFontsKey, ensureBrandFonts, ensureFont } from "../lib/fonts.ts";
import { fontChoices, type FontRole } from "../../shared/brandFonts.ts";
import { BrandFontsBox } from "./BrandFontsBox.tsx";
import { BrandFromWeb } from "./BrandFromWeb.tsx";
import type { WebCastPick } from "../../shared/webCast.ts";
import { libraryFileUrl } from "../lib/api.ts";
import { Button, Field, Spinner, inputClass } from "./ui.tsx";

// The font list of a select: the brand's own files first, then Google Fonts.
function FontOptions({ choices }: { choices: { family: string; uploaded: boolean }[] }) {
  const own = choices.filter((c) => c.uploaded);
  const google = choices.filter((c) => !c.uploaded);
  const options = (list: typeof choices) => list.map((c) => <option key={c.family}>{c.family}</option>);
  return own.length ? (
    <>
      <optgroup label="Fuentes propias">{options(own)}</optgroup>
      <optgroup label="Google Fonts">{options(google)}</optgroup>
    </>
  ) : (
    <>{options(google)}</>
  );
}

// The brand kit for motion graphics: logo, three colours (one accent) and two fonts.
export function BrandSection({
  brand,
  seriesId,
  version,
  onChange,
  onLogo,
  onFontUpload,
  onFontRemove,
  works,
  onName,
  onConfirm,
  seriesType,
  onCast,
}: {
  brand: Brand;
  seriesId: string | null;
  version: number;
  onChange: (brand: Brand) => void;
  onLogo: (file: File) => Promise<void>;
  onFontUpload: (file: File, face: { family: string; role: FontRole; weight: number; style: "normal" | "italic" }) => Promise<void>;
  onFontRemove: (file: string) => Promise<void>;
  works: string;
  onName: (name: string, tagline: string) => void;
  onConfirm: (claim: string) => void;
  seriesType: SeriesType;
  onCast: (pick: WebCastPick, file: File, confirmed: boolean) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (seriesId) ensureBrandFonts(seriesId, brand);
    else {
      ensureFont(brand.displayFont);
      ensureFont(brand.uiFont);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seriesId, brandFontsKey(brand)]);
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
                <FontOptions choices={fontChoices(brand, "display", DISPLAY_FONTS)} />
              </select>
            </label>
            <label className="block text-xs">
              <span className="font-semibold">Fuente de interfaz</span>
              <select className={`${inputClass} mt-0.5 py-1`} value={brand.uiFont} onChange={(e) => onChange({ ...brand, uiFont: e.target.value })}>
                <FontOptions choices={fontChoices(brand, "ui", UI_FONTS)} />
              </select>
            </label>
          </div>
          <BrandFontsBox brand={brand} seriesId={seriesId} onChange={onChange} onUpload={onFontUpload} onRemove={onFontRemove} />
          <label className="block text-xs">
            <span className="font-semibold">Cómo se mueve la marca</span>
            <select
              className={`${inputClass} mt-0.5 py-1`}
              value={brand.motion ?? "even"}
              onChange={(e) => onChange({ ...brand, motion: e.target.value as BrandMotion })}
            >
              {BRAND_MOTIONS.map((m) => (
                <option key={m} value={m}>
                  {BRAND_MOTION_LABEL[m]}
                </option>
              ))}
            </select>
            <span className="mt-0.5 block text-muted">Cómo aterriza cada cosa y si las imágenes respiran. El texto nunca se mueve mientras se lee; un tono seco nunca rebota.</span>
          </label>
          <div className="rounded-lg p-3" style={{ background: brand.bg, color: brand.text }}>
            <p style={{ fontFamily: `"${brand.displayFont}"`, fontWeight: 700, fontSize: 22, lineHeight: 1.1 }}>
              Armá el pedido <span style={{ color: brand.accent }}>antes del corte</span>
            </p>
            <p style={{ fontFamily: `"${brand.uiFont}"`, fontSize: 13, opacity: 0.85 }}>Así se ven los títulos y el texto.</p>
          </div>
          {(() => {
            const contrast = brandContrast(brand);
            const down = stepDownContrast(brand);
            return contrast.problems.length ? (
              <ul className="space-y-0.5 text-xs text-neg">
                {contrast.problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-good">
                ✓ Contraste: texto {contrast.text.toFixed(1).replace(".", ",")}:1 y acento {contrast.accent.toFixed(1).replace(".", ",")}:1 sobre el fondo. En los
                rótulos y pasos de los explicativos, los que ya pasaron bajan a {down.text.toFixed(1).replace(".", ",")}:1 y se siguen leyendo.
              </p>
            );
          })()}
        </div>
      </div>
      <div className="mt-3">
        <BrandFromWeb
          brand={brand}
          seriesId={seriesId}
          seriesType={seriesType}
          works={works}
          onBrand={onChange}
          onLogo={onLogo}
          onName={onName}
          onConfirm={onConfirm}
          onCast={onCast}
        />
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
export function LookSection({ look, onChange }: { look: SeriesLook; onChange: (look: SeriesLook) => void }) {
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
