// "Mascota en código" in Editar serie: the series' mascot as code (shared/mascot.ts). Copy the prompt for Opus, paste
// the reply back, and the app tests it in the same sandbox as the code scenes at sample poses (every expression, the
// mouth, every gesture, facing left, a smaller scale, a shift, a look and several t), shows them as a contact sheet
// with what it found, and saves it in the series (biblioteca/<series>/mascota.js). "Hoja de la mascota" downloads the
// main poses as one PNG, to upload in Grok as a reference. With a key, "Que la IA diseñe la mascota" sends the same
// prompt to the writer; without one everything works by copy and paste.
import { useEffect, useRef, useState } from "react";
import type { CodeProblem } from "../../shared/codeScene.ts";
import { MASCOT_TEST, SHEET_SAMPLES, mascotFromReply, mascotPrompt, mascotSig, type MascotCode } from "../../shared/mascot.ts";
import type { SeriesInfo } from "../../shared/schema.ts";
import type { Brand, SeriesFields } from "../../shared/series.ts";
import { api } from "../lib/api.ts";
import { testMascot, type MascotShot } from "../lib/codeSandbox.ts";
import { Button, Spinner, inputClass } from "./ui.tsx";

type Props = {
  seriesId: string;
  fields: SeriesFields;
  // A model key is set: the writer can answer the same prompt.
  aiReady: boolean;
  // The server's copy of the series after a save or a removal.
  onChanged: (series: SeriesInfo[], mascot: SeriesFields["mascot"]) => void;
};

type Shot = { id: string; label: string; url: string | null; sheet: boolean };
type Tested = { sig: string; problems: CodeProblem[]; shots: Shot[]; slowest: number };

// A shot on the brand background, as an image URL (the contact sheet shows the mascot as it sits in a scene).
function shotUrl(bitmap: CanvasImageSource, bg: string): string {
  const canvas = document.createElement("canvas");
  canvas.width = MASCOT_TEST.w;
  canvas.height = MASCOT_TEST.h;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0);
  return canvas.toDataURL("image/png");
}

// "Hoja de la mascota": the sheet poses side by side on the brand background, no words (an image tool reads words as
// part of the character).
async function sheetPng(shots: Shot[], bg: string): Promise<Blob | null> {
  const picked = SHEET_SAMPLES.map((s) => shots.find((x) => x.id === s.id)).filter((s): s is Shot => Boolean(s?.url));
  if (!picked.length) return null;
  const cols = Math.min(5, picked.length);
  const rows = Math.ceil(picked.length / cols);
  const canvas = document.createElement("canvas");
  canvas.width = cols * MASCOT_TEST.w;
  canvas.height = rows * MASCOT_TEST.h;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const images = await Promise.all(
    picked.map(
      (s) =>
        new Promise<HTMLImageElement | null>((resolve) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => resolve(null);
          img.src = s.url!;
        }),
    ),
  );
  images.forEach((img, i) => {
    if (img) ctx.drawImage(img, (i % cols) * MASCOT_TEST.w, Math.floor(i / cols) * MASCOT_TEST.h);
  });
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

export function MascotPanel({ seriesId, fields, aiReady, onChanged }: Props) {
  const [saved, setSaved] = useState<MascotCode | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [note, setNote] = useState("");
  const [shown, setShown] = useState<string | null>(null);
  const [tested, setTested] = useState<Tested | null>(null);
  const [busy, setBusy] = useState<"" | "test" | "save" | "ai" | "delete">("");
  const [status, setStatus] = useState("");
  const brand: Brand = fields.brand;
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );

  // The saved mascot comes in with its contact sheet.
  useEffect(() => {
    let live = true;
    api
      .mascot(seriesId)
      .then(({ mascot }) => {
        if (!live) return;
        setLoaded(true);
        if (!mascot) return;
        const code = { source: mascot.source, name: mascot.name, description: mascot.description };
        setSaved(code);
        setDraft(code.source);
        setName(code.name);
        setDescription(code.description);
        void run(code.source, code);
      })
      .catch((e: unknown) => {
        if (!live) return;
        setLoaded(true);
        setStatus(e instanceof Error ? e.message : String(e));
      });
    return () => {
      live = false;
    };
    // Only when the editor opens this series.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seriesId]);

  const prompt = () =>
    mascotPrompt({
      series: { name: fields.name, tagline: fields.tagline, type: fields.type, what: fields.what, audience: fields.audience },
      brand,
      current: saved,
      note,
      problems: tested && tested.sig === mascotSig(draft) ? tested.problems.map((p) => p.message) : undefined,
    });

  async function copy() {
    const text = prompt();
    try {
      await navigator.clipboard.writeText(text);
      setShown(null);
      setStatus("Prompt copiado. Pegalo en claude.ai (Opus) y traé acá su respuesta entera (nombre, descripción y código).");
    } catch {
      setShown(text);
      setStatus("No pude copiar solo: seleccioná el texto de abajo y copialo.");
    }
  }

  // Tests the code at every sample pose and keeps the contact sheet.
  async function run(source: string, meta: { name: string; description: string }) {
    setBusy("test");
    setStatus("Probando la mascota en su caja, pose por pose…");
    try {
      const result = await testMascot(source, brand, { name: meta.name || "Mascota", description: meta.description });
      const shots: Shot[] = result.shots.map((s: MascotShot) => {
        const url = s.bitmap ? shotUrl(s.bitmap, brand.bg) : null;
        s.bitmap?.close?.();
        return { id: s.id, label: s.label, url, sheet: s.sheet };
      });
      if (!alive.current) return;
      setTested({ sig: mascotSig(source), problems: result.problems, shots, slowest: result.slowest });
      const fatal = result.problems.some((p) => p.fatal);
      setStatus(
        fatal
          ? "No pasó la prueba: arreglá lo de abajo (o pegale los errores a Opus) y probá de nuevo."
          : `Pasó la prueba: ${shots.length} poses, la más lenta tardó ${Math.round(result.slowest)} ms.${result.problems.length ? " Mirá los avisos." : ""}`,
      );
    } finally {
      if (alive.current) setBusy("");
    }
  }

  async function test(text: string) {
    const reply = mascotFromReply(text);
    setDraft(reply.source);
    const nextName = reply.name || name;
    const nextDescription = reply.description || description;
    setName(nextName);
    setDescription(nextDescription);
    await run(reply.source, { name: nextName, description: nextDescription });
  }

  async function ask() {
    setBusy("ai");
    setStatus("La IA está diseñando la mascota…");
    try {
      const reply = await api.mascotCode(prompt());
      if (reply.demo) throw new Error("Modo de muestra: sin una clave de IA no se escribe código. Copiá el prompt y pedíselo a Opus en claude.ai.");
      setName(reply.name.slice(0, 60));
      setDescription(reply.description.slice(0, 600));
      setDraft(reply.code);
      setBusy("");
      await run(reply.code, { name: reply.name, description: reply.description });
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }

  const passed = Boolean(tested && tested.sig === mascotSig(draft) && !tested.problems.some((p) => p.fatal));
  const unchanged = Boolean(saved && saved.source.trim() === draft.trim() && saved.name === name.trim() && saved.description === description.trim());

  async function save() {
    if (!passed || !name.trim()) return;
    setBusy("save");
    try {
      const { mascot, series } = await api.saveMascot(seriesId, { source: draft, name: name.trim(), description: description.trim() });
      setSaved({ source: draft.trim(), name: mascot.name, description: mascot.description });
      onChanged(series, mascot);
      setStatus("Guardada en la serie. Las escenas de código y los explicativos de la serie ya la usan.");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }

  async function remove() {
    if (!window.confirm("¿Sacar la mascota de la serie? Las escenas que la usan van a mostrar que falta.")) return;
    setBusy("delete");
    try {
      const { series } = await api.deleteMascot(seriesId);
      setSaved(null);
      onChanged(series, null);
      setStatus("La serie ya no tiene mascota en código.");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }

  async function downloadSheet() {
    if (!tested) return;
    const blob = await sheetPng(tested.shots, brand.bg);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hoja-mascota-${seriesId}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  if (!loaded) return <Spinner />;
  const fresh = tested && tested.sig === mascotSig(draft) ? tested : null;
  const fatal = fresh?.problems.filter((p) => p.fatal) ?? [];
  return (
    <div className="space-y-2 rounded-lg border border-line bg-paper p-3 text-xs">
      <p className="text-muted">
        Un personaje propio de la marca, dibujado en código: Opus lo diseña y la app lo dibuja en cada escena de código y como presentador de los explicativos (con la boca
        siguiendo la voz y la cara según la emoción). Tiene que ser inventado: nunca un personaje conocido ni «al estilo de» nadie.
      </p>
      {saved && (
        <p>
          <span className="font-semibold">{saved.name}</span>
          {saved.description ? ` — ${saved.description}` : ""}
        </p>
      )}
      <input className={`${inputClass} py-1 text-xs`} value={note} placeholder="Qué querés que sea (opcional): «un frasco de yerba con anteojos», «más chiquita»" aria-label="Qué querés que sea" onChange={(e) => setNote(e.target.value)} />
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" className="px-2 py-1 text-xs" onClick={copy}>
          Copiar el prompt para Opus
        </Button>
        <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => setShown((s) => (s === null ? prompt() : null))}>
          {shown === null ? "Ver el prompt" : "Ocultar el prompt"}
        </Button>
        {aiReady && (
          <Button variant="secondary" className="px-2 py-1 text-xs" disabled={busy !== ""} onClick={ask}>
            {busy === "ai" ? <Spinner /> : null} Que la IA diseñe la mascota
          </Button>
        )}
      </div>
      {shown !== null && <textarea className={`${inputClass} font-mono text-[11px]`} rows={8} readOnly value={shown} aria-label="Prompt para Opus" onFocus={(e) => e.target.select()} />}
      <textarea
        className={`${inputClass} font-mono text-[11px]`}
        rows={8}
        value={draft}
        spellCheck={false}
        placeholder="Pegá acá la respuesta de Opus (la app saca el nombre, la descripción y el bloque de código)"
        aria-label="Pegá acá el código de la mascota"
        onChange={(e) => setDraft(e.target.value)}
      />
      <div className="grid gap-2 sm:grid-cols-2">
        <input className={`${inputClass} py-1 text-xs`} value={name} maxLength={60} placeholder="Nombre de la mascota" aria-label="Nombre de la mascota" onChange={(e) => setName(e.target.value)} />
        <input className={`${inputClass} py-1 text-xs`} value={description} maxLength={600} placeholder="Descripción corta (qué es, cómo es)" aria-label="Descripción de la mascota" onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" className="px-2 py-1 text-xs" disabled={busy !== "" || !draft.trim()} onClick={() => test(draft)}>
          {busy === "test" ? <Spinner /> : null} Probar
        </Button>
        <Button className="px-2 py-1 text-xs" disabled={busy !== "" || !passed || !name.trim() || unchanged} onClick={save} title={passed ? undefined : "Primero probala: se guarda la que pasó la prueba."}>
          {busy === "save" ? <Spinner /> : null} Guardar en la serie
        </Button>
        {fresh && fresh.shots.some((s) => s.url) && (
          <Button variant="ghost" className="px-2 py-1 text-xs" onClick={downloadSheet} title="Las poses principales en un PNG, para subirlo en Grok como referencia (@ref).">
            Descargar la hoja de la mascota (PNG)
          </Button>
        )}
        {saved && (
          <Button variant="ghost" className="ml-auto px-2 py-1 text-xs text-neg" disabled={busy !== ""} onClick={remove}>
            Sacar la mascota
          </Button>
        )}
        {passed && !name.trim() && <span className="text-neg">Ponele un nombre para guardarla.</span>}
        {saved && !unchanged && draft.trim() && <span className="text-muted">Hay cambios sin guardar.</span>}
      </div>
      {status && <p className={fatal.length ? "text-neg" : "text-muted"}>{status}</p>}
      {fresh && fresh.problems.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-4">
          {fresh.problems.map((p, i) => (
            <li key={i} className={p.fatal ? "text-neg" : "text-muted"}>
              {p.message}
            </li>
          ))}
        </ul>
      )}
      {fatal.length > 0 && <p className="text-muted">Podés pegarle estos errores a Opus tal cual, o copiar el prompt de nuevo: ya los lleva.</p>}
      {fresh && fresh.shots.length > 0 && (
        <div>
          <p className="font-semibold">Hoja de contactos</p>
          <ul className="mt-1 grid grid-cols-3 gap-2 sm:grid-cols-5">
            {fresh.shots.map((s) => (
              <li key={s.id} className="space-y-0.5">
                {s.url ? (
                  <img src={s.url} alt={`La mascota: ${s.label}`} className="w-full rounded border border-line" />
                ) : (
                  <div className="flex aspect-[8/7] items-center justify-center rounded border border-neg/40 text-neg">falló</div>
                )}
                <span className="block text-[11px] text-muted">{s.label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
