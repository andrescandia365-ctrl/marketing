// "Traer la marca desde su web": paste the brand's own address and the app proposes the kit (colours, fonts, logo,
// name and line) and lists what the page says. Nothing changes until the person uses a part; what the page claims is
// [VERIFY] until the person confirms it into "Lo que existe hoy" (the only list the writer may show as real).
import { useEffect, useState } from "react";
import type { BrandFromWeb as Found } from "../../shared/schema.ts";
import type { Brand } from "../../shared/series.ts";
import { api } from "../lib/api.ts";
import { ensureFont } from "../lib/fonts.ts";
import { rasterSvg } from "../lib/svgSanitize.ts";
import { Button, Spinner, inputClass } from "./ui.tsx";

async function logoFile(dataUrl: string): Promise<File> {
  const blob = await (await fetch(dataUrl)).blob();
  // An SVG is cleaned (no scripts or links) and drawn to a PNG first, like the Elementos tab does.
  if (blob.type === "image/svg+xml") return new File([await rasterSvg(await blob.text())], "logo.png", { type: "image/png" });
  const ext = blob.type.split("/")[1] ?? "png";
  return new File([blob], `logo.${ext}`, { type: blob.type });
}

export function BrandFromWeb({
  brand,
  seriesId,
  works,
  onBrand,
  onLogo,
  onName,
  onConfirm,
}: {
  brand: Brand;
  seriesId: string | null;
  // "Lo que existe hoy" as it is in the form, one item per line.
  works: string;
  onBrand: (brand: Brand) => void;
  onLogo: (file: File) => Promise<void>;
  onName: (name: string, tagline: string) => void;
  onConfirm: (claim: string) => void;
}) {
  const [url, setUrl] = useState("");
  const [own, setOwn] = useState(false);
  const [busy, setBusy] = useState<null | "read" | "logo">(null);
  const [error, setError] = useState("");
  const [found, setFound] = useState<Found | null>(null);
  const [used, setUsed] = useState<string[]>([]);
  const s = found?.suggestion;

  useEffect(() => {
    if (!s) return;
    ensureFont(s.displayFont);
    ensureFont(s.uiFont);
  }, [s]);

  async function read() {
    setBusy("read");
    setError("");
    setFound(null);
    setUsed([]);
    try {
      setFound(await api.brandFromWeb(url, seriesId));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const mark = (what: string) => setUsed((u) => [...u, what]);
  const listed = works
    .split("\n")
    .map((l) => l.trim().toLowerCase())
    .filter(Boolean);

  return (
    <details className="rounded-lg border border-line p-2 text-xs">
      <summary className="cursor-pointer font-semibold">Traer la marca desde su web</summary>
      <div className="mt-2 space-y-2">
        <p className="text-muted">
          Pegá la dirección de la web de la marca. La app lee sus colores, sus fuentes, su logo y lo que dice, y te los
          propone: no cambia nada hasta que tocás "Usar". Lo que dice la web queda como [VERIFY] hasta que lo confirmes.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            className={`${inputClass} w-64! py-1 text-xs`}
            placeholder="https://www.lamarca.com"
            aria-label="Web de la marca"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={own} onChange={(e) => setOwn(e.target.checked)} />
            Es la web de la marca (no de un revendedor ni de otra marca)
          </label>
          <Button className="px-3 py-1 text-xs" disabled={!url.trim() || !own || busy !== null} onClick={read}>
            {busy === "read" ? <Spinner /> : null} Leer la web
          </Button>
        </div>
        {error && <p className="text-neg">{error}</p>}
        {found && s && (
          <div className="space-y-3 rounded-md bg-paper p-2">
            <p className="text-muted">
              Leído de <span className="font-mono">{found.url}</span>
              {found.demo ? " · propuesta de muestra (sin clave de IA)" : ""}
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <div className="rounded-md p-2" style={{ background: s.bg, color: s.text, minWidth: 180 }}>
                <p style={{ fontFamily: `"${s.displayFont}"`, fontWeight: 700, fontSize: 18, lineHeight: 1.1 }}>
                  {s.name || "La marca"} <span style={{ color: s.accent }}>●</span>
                </p>
                <p style={{ fontFamily: `"${s.uiFont}"`, fontSize: 12 }}>{s.tagline || "Así se ven los títulos y el texto."}</p>
              </div>
              <div className="space-y-1">
                <p>
                  Fondo <code>{s.bg}</code> · Texto <code>{s.text}</code> · Acento <code>{s.accent}</code>
                </p>
                <p>
                  Títulos <b>{s.displayFont}</b> · Interfaz <b>{s.uiFont}</b>
                </p>
                {s.fontNote && <p className="text-muted">{s.fontNote}</p>}
              </div>
            </div>
            {found.colors.length > 0 && (
              <div className="flex flex-wrap items-center gap-1" aria-label="Colores de la web">
                <span className="text-muted">Colores de la web:</span>
                {found.colors.map((c) => (
                  <span key={c} title={c} className="inline-block size-4 rounded border border-line" style={{ background: c }} />
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                className="px-3 py-1 text-xs"
                disabled={used.includes("colors")}
                onClick={() => {
                  onBrand({ ...brand, bg: s.bg, text: s.text, accent: s.accent });
                  mark("colors");
                }}
              >
                {used.includes("colors") ? "Colores puestos" : "Usar estos colores"}
              </Button>
              <Button
                variant="secondary"
                className="px-3 py-1 text-xs"
                disabled={used.includes("fonts")}
                onClick={() => {
                  onBrand({ ...brand, displayFont: s.displayFont, uiFont: s.uiFont });
                  mark("fonts");
                }}
              >
                {used.includes("fonts") ? "Fuentes puestas" : "Usar estas fuentes"}
              </Button>
              {(s.name || s.tagline) && (
                <Button
                  variant="secondary"
                  className="px-3 py-1 text-xs"
                  disabled={used.includes("name")}
                  onClick={() => {
                    onName(s.name, s.tagline);
                    mark("name");
                  }}
                >
                  {used.includes("name") ? "Nombre y frase puestos" : "Usar nombre y frase"}
                </Button>
              )}
            </div>

            {found.logo ? (
              <div className="flex flex-wrap items-center gap-2">
                <img src={found.logo} alt="Logo de la web" className="h-14 max-w-[160px] rounded border border-line bg-white object-contain p-1" />
                <Button
                  variant="secondary"
                  className="px-3 py-1 text-xs"
                  disabled={!seriesId || busy !== null || used.includes("logo")}
                  title={seriesId ? undefined : "Guardá la serie primero"}
                  onClick={async () => {
                    setBusy("logo");
                    setError("");
                    try {
                      await onLogo(await logoFile(found.logo));
                      mark("logo");
                    } catch (e) {
                      setError(e instanceof Error ? e.message : String(e));
                    } finally {
                      setBusy(null);
                    }
                  }}
                >
                  {busy === "logo" ? <Spinner /> : null} {used.includes("logo") ? "Logo puesto" : "Usar este logo"}
                </Button>
              </div>
            ) : (
              <p className="text-muted">No encontré un logo que se pueda bajar: subilo a mano.</p>
            )}

            {s.claims.length > 0 && (
              <div className="space-y-1">
                <p className="font-semibold">Lo que dice la web</p>
                <p className="text-muted">
                  Nada de esto se muestra como real hasta que lo confirmes: tocá "Lo confirmo" solo si hoy funciona así.
                </p>
                <ul className="space-y-1">
                  {s.claims.map((claim) => {
                    const added = listed.includes(claim.trim().toLowerCase());
                    return (
                      <li key={claim} className="flex flex-wrap items-center gap-2">
                        {!added && <span className="rounded bg-amber-100 px-1 font-mono text-[10px] text-amber-900">[VERIFY]</span>}
                        <span className="min-w-0 flex-1">{claim}</span>
                        <button
                          type="button"
                          className="font-semibold text-muted hover:text-ink disabled:opacity-50"
                          disabled={added}
                          onClick={() => onConfirm(claim)}
                        >
                          {added ? "En Lo que existe hoy" : "Lo confirmo → Lo que existe hoy"}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            {s.note && <p className="text-muted">{s.note}</p>}
            <p className="text-muted">Los cambios se guardan con "Guardar serie" (el logo se guarda al usarlo).</p>
          </div>
        )}
      </div>
    </details>
  );
}
