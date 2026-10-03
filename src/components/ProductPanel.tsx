// E-commerce series: the episode's product, clean and cut out. The AI writes the prompt; the person makes it in the
// tool, removes the background there and drops the PNG here; it joins the series' cast as a product (@ref).
import { useState } from "react";
import type { ProductShot, Setup } from "../../shared/schema.ts";
import { CopyButton, type LibraryEntry } from "./ScriptView.tsx";
import { Button, Field, Notice, Spinner, inputClass } from "./ui.tsx";

type Props = {
  toolName: string;
  setups: Setup[];
  products: LibraryEntry[];
  onWrite: () => Promise<ProductShot | null>;
  onSave: (setup: Setup, image: Blob) => Promise<void>;
};

// True when some pixel is see-through, i.e. the background was removed.
async function hasTransparency(file: Blob): Promise<boolean> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  const scale = Math.min(1, 256 / Math.max(bitmap.width, bitmap.height));
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let i = 3; i < data.length; i += 4) if (data[i] < 250) return true;
  return false;
}

export function ProductPanel({ toolName, setups, products, onWrite, onSave }: Props) {
  const [shot, setShot] = useState<ProductShot | null>(null);
  const [busy, setBusy] = useState<null | "write" | "save">(null);
  const [linked, setLinked] = useState("");
  const [message, setMessage] = useState<{ tone: "info" | "warn" | "error"; text: string } | null>(null);

  async function write() {
    setBusy("write");
    setMessage(null);
    const result = await onWrite();
    setBusy(null);
    if (!result) return;
    setShot(result);
    const words = result.name.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    setLinked(setups.find((s) => words.some((w) => s.name.toLowerCase().includes(w)))?.id ?? "");
  }

  async function save(file: File) {
    if (!shot) return;
    setBusy("save");
    setMessage(null);
    try {
      const clear = await hasTransparency(file).catch(() => false);
      const target = setups.find((s) => s.id === linked);
      const setup: Setup = target
        ? { ...target, name: shot.name, identity: shot.identity }
        : { id: "__producto", name: shot.name, identity: shot.identity, castId: "" };
      await onSave(setup, file);
      setMessage(
        clear
          ? { tone: "info", text: `Listo: ${shot.name} quedó en el elenco de la serie, sin fondo.` }
          : {
              tone: "warn",
              text: `Guardado, pero la imagen tiene fondo. En ${toolName} usá "Eliminar fondo" (solo sobre el producto) y subí el PNG de nuevo.`,
            },
      );
    } catch (e) {
      setMessage({ tone: "error", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-line bg-white p-4">
      <div>
        <p className="text-sm font-semibold">Producto recortado</p>
        <p className="text-xs text-muted">
          El producto del episodio, limpio y sin fondo, para usarlo igual en todas las escenas de la casa.
        </p>
      </div>
      {products.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {products.map((p) => (
            <span key={p.id} className="flex items-center gap-1.5 rounded-full border border-line px-2 py-0.5 text-xs">
              {p.url && <img src={p.url} alt="" className="size-5 rounded object-contain" />}@{p.ref}
            </span>
          ))}
        </div>
      )}
      <Button variant="secondary" onClick={write} disabled={busy !== null}>
        {busy === "write" ? <Spinner /> : null} {shot ? "Escribir otro prompt" : "Escribir el prompt del producto"}
      </Button>
      {shot && (
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Nombre">
              <input className={inputClass} value={shot.name} onChange={(e) => setShot({ ...shot, name: e.target.value })} />
            </Field>
            <Field label="Es el setup del storyboard">
              <select className={inputClass} value={linked} onChange={(e) => setLinked(e.target.value)}>
                <option value="">Ninguno (solo al elenco)</option>
                {setups.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.id} · {s.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="rounded-lg bg-paper p-2 text-xs">
            <p className="font-mono">{shot.prompt}</p>
            <div className="mt-1.5">
              <CopyButton text={shot.prompt} idle="Copiar prompt" variant="secondary" />
            </div>
          </div>
          {shot.note && <p className="text-xs text-muted">{shot.note}</p>}
          <ol className="list-decimal space-y-0.5 pl-5 text-xs text-muted">
            <li>Pegá el prompt en {toolName} y generá la imagen.</li>
            <li>
              Usá <b>Eliminar fondo</b>, solo sobre el producto (nunca para tapar la marca de agua).
            </li>
            <li>Descargá el PNG y soltalo acá: queda en el elenco de la serie como producto.</li>
          </ol>
          <input
            type="file"
            accept="image/png,image/webp,image/*"
            aria-label="Subir el producto recortado"
            className="text-sm"
            disabled={busy !== null}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) save(file);
              e.target.value = "";
            }}
          />
          {busy === "save" && <Spinner />}
        </div>
      )}
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
    </div>
  );
}
