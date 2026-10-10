// "Armar a mano": the puppet's parts laid out on the body's canvas, to drag each one where it goes, size it and set
// the point it turns around. Grok's Segments cut each thing to its own size and do not say where it was, so loose
// parts (an arm, the mouth from a close-up) need a person to put them back. The puppet and the videos read the same
// places (`layerRects` in lib/puppet.ts), so what is set here is what moves in the explainer.
import { useEffect, useMemo, useRef, useState } from "react";
import { PUPPET_ROLE_LABEL, PUPPET_VIEWS, type CastMember, type Puppet, type PuppetLayer } from "../../shared/series.ts";
import { api, libraryFileUrl } from "../lib/api.ts";
import { loadImage } from "../lib/motionProject.ts";
import { buildPuppet, isAlternate, layerRects } from "../lib/puppet.ts";
import { PuppetPreview } from "./PuppetPreview.tsx";
import { Button, Spinner } from "./ui.tsx";

type Box = { x: number; y: number; w: number; h: number };
type Drag = { kind: "move" | "size" | "pivot"; index: number; startX: number; startY: number; place: { x: number; y: number; w: number }; pivot: [number, number] };

// Back to front, as drawPuppet draws them.
const ORDER = ["view34", "viewSide", "extra", "body", "armL", "armR", "head", "faceHappy", "faceSurprised", "faceWorried", "eyes", "mouth", "mouthA", "mouthO", "mouthE"] as const;
const W = 340;
const H = 440;

export function PuppetArranger({
  seriesId,
  member,
  onSaved,
  onClose,
}: {
  seriesId: string;
  member: CastMember;
  onSaved: (member: CastMember) => void;
  onClose: () => void;
}) {
  const [layers, setLayers] = useState<PuppetLayer[]>(member.puppet.layers);
  const [images, setImages] = useState<(HTMLImageElement | null)[] | null>(null);
  const [selected, setSelected] = useState(0);
  const [preview, setPreview] = useState<Puppet>({ layers: member.puppet.layers });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const canvas = useRef<HTMLCanvasElement>(null);
  const drag = useRef<Drag | null>(null);
  const changed = JSON.stringify(layers) !== JSON.stringify(member.puppet.layers);

  useEffect(() => {
    let alive = true;
    Promise.all(member.puppet.layers.map((l) => loadImage(libraryFileUrl(seriesId, l.file)))).then((imgs) => alive && setImages(imgs));
    return () => {
      alive = false;
    };
  }, [seriesId, member.puppet.layers]);

  const puppet = useMemo(() => ({ layers }), [layers]);
  const placed = useMemo(() => (images ? layerRects(puppet, images) : null), [puppet, images]);
  const asset = useMemo(() => (images ? buildPuppet(puppet, images) : null), [puppet, images]);

  // What the canvas shows: the body's canvas and every part, with a margin, fitted to the box.
  const view = useMemo(() => {
    if (!placed) return null;
    const all = [{ x: 0, y: 0, w: placed.width, h: placed.height }, ...placed.rects.filter((r): r is Box => r !== null)];
    const x0 = Math.min(...all.map((r) => r.x));
    const y0 = Math.min(...all.map((r) => r.y));
    const x1 = Math.max(...all.map((r) => r.x + r.w));
    const y1 = Math.max(...all.map((r) => r.y + r.h));
    const pad = Math.max(x1 - x0, y1 - y0) * 0.05;
    const k = Math.min(W / (x1 - x0 + pad * 2), H / (y1 - y0 + pad * 2));
    return { k, ox: (W - (x1 - x0) * k) / 2 - x0 * k, oy: (H - (y1 - y0) * k) / 2 - y0 * k };
    // Recomputed only when a drag ends, so the picture does not run away under the mouse.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placed && placed.width, placed && placed.height, preview, images]);

  const toScreen = (x: number, y: number) => (view ? [view.ox + x * view.k, view.oy + y * view.k] : [0, 0]);

  useEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx || !placed || !images || !view || !asset) return;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#ecebe6";
    ctx.fillRect(0, 0, W, H);
    // The body's canvas.
    const [cx, cy] = toScreen(0, 0);
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = "#b9b7ae";
    ctx.strokeRect(cx, cy, placed.width * view.k, placed.height * view.k);
    ctx.setLineDash([]);
    const order = layers.map((_, i) => i).sort((a, b) => ORDER.indexOf(layers[a].role) - ORDER.indexOf(layers[b].role));
    for (const i of order) {
      const r = placed.rects[i];
      const img = images[i];
      if (!r || !img) continue;
      const [x, y] = toScreen(r.x, r.y);
      // A face or a mouth shape sits over the part it swaps with: faint unless chosen, so both can be lined up.
      ctx.globalAlpha = i === selected ? 1 : isAlternate(layers[i].role) && !PUPPET_VIEWS.includes(layers[i].role as never) ? 0.35 : 0.92;
      ctx.drawImage(img, x, y, r.w * view.k, r.h * view.k);
    }
    ctx.globalAlpha = 1;
    const r = placed.rects[selected];
    const part = asset.parts[selected];
    if (r && part) {
      const [x, y] = toScreen(r.x, r.y);
      ctx.strokeStyle = "#e4572e";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x, y, r.w * view.k, r.h * view.k);
      // Size handle, bottom right.
      ctx.fillStyle = "#e4572e";
      ctx.fillRect(x + r.w * view.k - 5, y + r.h * view.k - 5, 10, 10);
      // Turning point.
      const [px, py] = toScreen(part.pivot[0], part.pivot[1]);
      ctx.beginPath();
      ctx.arc(px, py, 6, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#1f6feb";
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(px, py, 2, 0, Math.PI * 2);
      ctx.fillStyle = "#1f6feb";
      ctx.fill();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placed, images, view, asset, selected, layers]);

  // The place a part has now, written out (a part of the body's canvas sits on all of it).
  const placeOf = (i: number) => {
    const r = placed!.rects[i]!;
    return { x: r.x / placed!.width, y: r.y / placed!.height, w: r.w / placed!.width };
  };
  const pivotOf = (i: number): [number, number] => [asset!.parts[i].pivot[0] / placed!.width, asset!.parts[i].pivot[1] / placed!.height];
  const update = (i: number, patch: Partial<PuppetLayer>) => setLayers((ls) => ls.map((l, k) => (k === i ? { ...l, ...patch } : l)));

  function point(e: React.PointerEvent<HTMLCanvasElement>) {
    const b = e.currentTarget.getBoundingClientRect();
    return [((e.clientX - b.left) * W) / b.width, ((e.clientY - b.top) * H) / b.height];
  }

  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!placed || !view || !asset) return;
    const [mx, my] = point(e);
    const near = (x: number, y: number, d: number) => Math.hypot(mx - x, my - y) <= d;
    const r = placed.rects[selected];
    const part = asset.parts[selected];
    let kind: Drag["kind"] | null = null;
    let index = selected;
    if (r && part) {
      const [px, py] = toScreen(part.pivot[0], part.pivot[1]);
      const [x, y] = toScreen(r.x + r.w, r.y + r.h);
      if (near(px, py, 9)) kind = "pivot";
      else if (near(x, y, 9)) kind = "size";
    }
    if (!kind) {
      // The front-most part whose opaque area is under the mouse.
      const order = layers.map((_, i) => i).sort((a, b) => ORDER.indexOf(layers[b].role) - ORDER.indexOf(layers[a].role));
      const hit = order.find((i) => {
        const box = asset.parts[i]?.box;
        if (!box) return false;
        const [x, y] = toScreen(box.x, box.y);
        return mx >= x && my >= y && mx <= x + box.w * view.k && my <= y + box.h * view.k;
      });
      if (hit === undefined) return;
      index = hit;
      kind = "move";
      setSelected(hit);
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { kind, index, startX: mx, startY: my, place: placeOf(index), pivot: pivotOf(index) };
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    const d = drag.current;
    if (!d || !placed || !view) return;
    const [mx, my] = point(e);
    const dx = (mx - d.startX) / view.k;
    const dy = (my - d.startY) / view.k;
    if (d.kind === "move") {
      update(d.index, {
        place: { ...d.place, x: d.place.x + dx / placed.width, y: d.place.y + dy / placed.height },
        // The turning point travels with the part.
        pivot: [d.pivot[0] + dx / placed.width, d.pivot[1] + dy / placed.height],
      });
    } else if (d.kind === "size") {
      update(d.index, { place: { ...d.place, w: Math.max(0.02, d.place.w + dx / placed.width) }, pivot: null });
    } else {
      update(d.index, { pivot: [d.pivot[0] + dx / placed.width, d.pivot[1] + dy / placed.height] });
    }
  }

  function up() {
    if (!drag.current) return;
    drag.current = null;
    setPreview({ layers });
  }

  function nudge(e: React.KeyboardEvent) {
    if (!placed || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
    e.preventDefault();
    const step = (e.shiftKey ? 10 : 1) / (view?.k ?? 1);
    const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
    const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
    const p = placeOf(selected);
    const pv = pivotOf(selected);
    const next = layers.map((l, k) =>
      k === selected
        ? { ...l, place: { ...p, x: p.x + dx / placed.width, y: p.y + dy / placed.height }, pivot: [pv[0] + dx / placed.width, pv[1] + dy / placed.height] as [number, number] }
        : l,
    );
    setLayers(next);
    setPreview({ layers: next });
  }

  function resize(w: number) {
    const p = placeOf(selected);
    const next = layers.map((l, k) => (k === selected ? { ...l, place: { ...p, w }, pivot: null } : l));
    setLayers(next);
    setPreview({ layers: next });
  }

  async function save() {
    setBusy(true);
    setError("");
    try {
      const { member: next } = await api.arrangePuppet(
        seriesId,
        member.id,
        layers.map(({ file, role, pivot, place }) => ({ file, role, pivot, place })),
      );
      onSaved(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!images) return <Spinner />;
  const current = layers[selected];
  return (
    <div className="space-y-2 rounded-lg border border-line bg-white p-2">
      <p className="text-muted">
        Arrastrá cada parte a su lugar. El cuadrado rojo cambia el tamaño; el punto azul es donde gira (el hombro de un
        brazo, el cuello de la cabeza). Con las flechas del teclado la movés de a poco (Shift: más).
      </p>
      {layers.some((l) => isAlternate(l.role)) && (
        <p className="text-muted">
          Las bocas A, O y E van justo encima de la boca, y las caras encima de la cabeza: se ven tenues hasta que las
          elegís. El cuerpo de 3/4 y el de perfil quedan al costado; la app los pone en el lugar del cuerpo cuando gira.
        </p>
      )}
      <div className="flex flex-wrap items-start gap-3">
        <canvas
          ref={canvas}
          width={W}
          height={H}
          tabIndex={0}
          className="w-full max-w-[340px] touch-none rounded-md border border-line outline-none focus:border-ink"
          aria-label={`Armar a mano el títere de ${member.name}`}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          onKeyDown={nudge}
        />
        <div className="min-w-[180px] flex-1 space-y-2">
          <label className="block">
            <span className="font-semibold">Parte</span>
            <select
              className="mt-0.5 block w-full rounded border border-line px-1 py-0.5"
              value={selected}
              aria-label="Parte elegida"
              onChange={(e) => setSelected(Number(e.target.value))}
            >
              {layers.map((l, i) => (
                <option key={l.file} value={i}>
                  {i + 1}. {PUPPET_ROLE_LABEL[l.role]}
                  {l.name ? ` · ${l.name}` : ""}
                </option>
              ))}
            </select>
          </label>
          {current && placed && (
            <label className="block">
              <span className="font-semibold">Tamaño</span>
              <input
                type="range"
                min={0.02}
                max={1.5}
                step={0.005}
                className="block w-full"
                aria-label="Tamaño de la parte"
                value={placeOf(selected).w}
                onChange={(e) => resize(Number(e.target.value))}
              />
            </label>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="font-semibold text-muted hover:text-ink"
              onClick={() => {
                const next = layers.map((l, k) => (k === selected ? { ...l, place: null, pivot: null } : l));
                setLayers(next);
                setPreview({ layers: next });
              }}
            >
              Lugar automático
            </button>
            <button
              type="button"
              className="font-semibold text-muted hover:text-ink"
              onClick={() => {
                const next = layers.map((l, k) => (k === selected ? { ...l, pivot: null } : l));
                setLayers(next);
                setPreview({ layers: next });
              }}
            >
              Giro automático
            </button>
          </div>
          <PuppetPreview seriesId={seriesId} puppet={preview} />
        </div>
      </div>
      {error && <p className="text-neg">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button className="px-3 py-1 text-xs" disabled={busy || !changed} onClick={save}>
          {busy ? <Spinner /> : null} Guardar el armado
        </Button>
        <Button variant="secondary" className="px-3 py-1 text-xs" disabled={busy} onClick={onClose}>
          {changed ? "Descartar" : "Cerrar"}
        </Button>
      </div>
    </div>
  );
}
