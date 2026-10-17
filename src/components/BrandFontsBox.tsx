// Editar serie → Marca → "Fuentes propias": the brand's own font files (shared/brandFonts.ts). Uploading and removing
// a file is saved at once; a face's family, role, weight and style are saved with the series.
import { useEffect, useState } from "react";
import { FONT_LICENCE_NOTE, FONT_ROLES, FONT_ROLE_LABEL, FONT_WEIGHTS, editFontFace, guessFontFace, type BrandFont, type FontRole } from "../../shared/brandFonts.ts";
import type { Brand } from "../../shared/series.ts";
import { ensureFont, registerBrandFonts } from "../lib/fonts.ts";
import { Spinner, inputClass } from "./ui.tsx";

export function BrandFontsBox({
  brand,
  seriesId,
  onChange,
  onUpload,
  onRemove,
}: {
  brand: Brand;
  seriesId: string | null;
  onChange: (brand: Brand) => void;
  onUpload: (file: File, face: { family: string; role: FontRole; weight: number; style: "normal" | "italic" }) => Promise<void>;
  onRemove: (file: string) => Promise<void>;
}) {
  const [role, setRole] = useState<FontRole>("display");
  const [busy, setBusy] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const fonts = brand.fonts ?? [];

  // Each face's sample is drawn in its own file.
  const key = fonts.map((f) => `${f.file}:${f.family}:${f.weight}:${f.style}`).join("|");
  useEffect(() => {
    if (!seriesId) return;
    registerBrandFonts(seriesId, brand);
    for (const family of new Set(fonts.map((f) => f.family))) ensureFont(family);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seriesId, key]);

  async function upload(files: File[]) {
    setErrors([]);
    const failed: string[] = [];
    for (const file of files) {
      setBusy(file.name);
      try {
        await onUpload(file, { ...guessFontFace(file.name), role });
      } catch (e) {
        failed.push(`${file.name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    setBusy("");
    setErrors(failed);
  }

  const edit = (file: string, patch: Partial<Pick<BrandFont, "family" | "role" | "weight" | "style">>) => onChange(editFontFace({ ...brand, fonts }, file, patch));

  return (
    <div className="space-y-2 rounded-lg border border-line p-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-semibold">Fuentes propias de la marca</span>
        <label className="flex items-center gap-1">
          Subir como
          <select className={`${inputClass} w-auto py-0.5`} value={role} onChange={(e) => setRole(e.target.value as FontRole)}>
            {FONT_ROLES.map((r) => (
              <option key={r} value={r}>
                {FONT_ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </label>
        <label className={`cursor-pointer rounded border border-line px-2 py-1 hover:bg-paper ${!seriesId || busy ? "pointer-events-none opacity-60" : ""}`} title={seriesId ? undefined : "Guardá la serie primero"}>
          {busy ? (
            <span className="inline-flex items-center gap-1">
              <Spinner /> {busy}
            </span>
          ) : (
            "Subir fuentes (woff2, woff, ttf, otf)"
          )}
          <input
            type="file"
            multiple
            accept=".woff2,.woff,.ttf,.otf,font/woff2,font/woff,font/ttf,font/otf"
            className="hidden"
            disabled={!seriesId || Boolean(busy)}
            aria-label="Subir fuentes de la marca"
            onChange={(e) => {
              const list = [...(e.target.files ?? [])];
              e.target.value = "";
              if (list.length) upload(list);
            }}
          />
        </label>
      </div>
      <p className="text-xs text-muted">
        {FONT_LICENCE_NOTE} Cada archivo es un estilo (por ejemplo Regular o Bold): subí los que uses y ponele a todos el mismo nombre de familia. Después
        elegila arriba como fuente de títulos o de interfaz.
      </p>
      {errors.length > 0 && (
        <ul className="space-y-0.5 text-xs text-neg">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      {fonts.length > 0 && (
        <ul className="space-y-1.5">
          {fonts.map((f) => (
            <FaceRow key={f.file} face={f} onEdit={(patch) => edit(f.file, patch)} onRemove={() => onRemove(f.file)} />
          ))}
        </ul>
      )}
      {fonts.length > 0 && <p className="text-xs text-muted">Los cambios de nombre, uso y peso se guardan con «Guardar» de la serie.</p>}
    </div>
  );
}

function FaceRow({ face, onEdit, onRemove }: { face: BrandFont; onEdit: (patch: Partial<Pick<BrandFont, "family" | "role" | "weight" | "style">>) => void; onRemove: () => Promise<void> }) {
  // The family is typed freely and saved on leaving the field (spaces in the middle survive while typing).
  const [family, setFamily] = useState(face.family);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => setFamily(face.family), [face.family]);
  return (
    <li className="grid gap-1 text-xs sm:grid-cols-[minmax(0,1.2fr)_auto_auto_auto_auto] sm:items-center">
      <input
        className={`${inputClass} py-0.5`}
        value={family}
        aria-label="Nombre de la familia"
        onChange={(e) => setFamily(e.target.value)}
        onBlur={() => family !== face.family && onEdit({ family })}
      />
      <select className={`${inputClass} w-auto py-0.5`} aria-label="Uso" value={face.role} onChange={(e) => onEdit({ role: e.target.value as FontRole })}>
        {FONT_ROLES.map((r) => (
          <option key={r} value={r}>
            {FONT_ROLE_LABEL[r]}
          </option>
        ))}
      </select>
      <select className={`${inputClass} w-auto py-0.5`} aria-label="Peso" value={face.weight} onChange={(e) => onEdit({ weight: Number(e.target.value) })}>
        {FONT_WEIGHTS.map((w) => (
          <option key={w} value={w}>
            {w}
          </option>
        ))}
      </select>
      <select className={`${inputClass} w-auto py-0.5`} aria-label="Estilo" value={face.style} onChange={(e) => onEdit({ style: e.target.value as "normal" | "italic" })}>
        <option value="normal">Normal</option>
        <option value="italic">Itálica</option>
      </select>
      <button
        type="button"
        className="text-muted hover:text-neg disabled:opacity-50"
        disabled={removing}
        onClick={async () => {
          setRemoving(true);
          setError("");
          try {
            await onRemove();
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
            setRemoving(false);
          }
        }}
      >
        {removing ? <Spinner /> : "Sacar"}
      </button>
      <p className="truncate sm:col-span-5" style={{ fontFamily: `"${face.family}"`, fontWeight: face.weight, fontStyle: face.style, fontSize: 16 }} title={face.name || face.file}>
        Armá el pedido antes del corte · ÁÉÍÓÚ ñ 0123456789 <span className="font-sans text-[11px] text-muted">({face.name || face.file})</span>
      </p>
      {error && <p className="text-neg sm:col-span-5">{error}</p>}
    </li>
  );
}
