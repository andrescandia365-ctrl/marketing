// A character's puppet moving in a small loop (presents, waves, points, cheers, talks), to check that the parts
// fit and turn where they should. Only in the editor; videos draw the puppet with the motion engine.
import { useEffect, useRef, useState } from "react";
import type { MotionGesture } from "../../shared/motion.ts";
import type { Puppet } from "../../shared/series.ts";
import { libraryFileUrl } from "../lib/api.ts";
import { loadImage } from "../lib/motionProject.ts";
import { buildPuppet, drawPuppet, puppetPose, type PuppetAsset } from "../lib/puppet.ts";

const LOOP: MotionGesture[] = ["present", "wave", "point", "cheer", "surprise"];
const EACH = 3.2;

export function PuppetPreview({ seriesId, puppet }: { seriesId: string; puppet: Puppet }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [asset, setAsset] = useState<PuppetAsset | null>(null);
  const files = puppet.layers.map((l) => `${l.file}:${l.role}:${l.pivot?.join(",") ?? ""}:${l.place ? `${l.place.x},${l.place.y},${l.place.w}` : ""}`).join("|");

  useEffect(() => {
    let alive = true;
    Promise.all(puppet.layers.map((l) => loadImage(libraryFileUrl(seriesId, l.file)))).then((imgs) => alive && setAsset(buildPuppet(puppet, imgs)));
    return () => {
      alive = false;
    };
    // The layers' files, roles, turning points and places decide it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seriesId, files]);

  useEffect(() => {
    if (!asset) return;
    let frame = 0;
    const started = performance.now();
    const tick = () => {
      const c = canvas.current;
      const ctx = c?.getContext("2d");
      if (c && ctx) {
        const t = (performance.now() - started) / 1000;
        const n = Math.floor(t / EACH) % LOOP.length;
        const lt = t % EACH;
        const talk = lt > 0.3 && lt < 2.4 ? Math.max(0, Math.sin(lt * Math.PI * 2 * 4.4)) * 0.8 : 0;
        ctx.clearRect(0, 0, c.width, c.height);
        ctx.fillStyle = "#e9e9e4";
        ctx.fillRect(0, 0, c.width, c.height);
        drawPuppet(ctx, asset, c.width / 2, c.height - 8, c.height - 30, puppetPose(t, lt, -1, LOOP[n], 0.3, talk, 1, 7));
        ctx.fillStyle = "#5a6170";
        ctx.font = "600 11px system-ui, sans-serif";
        ctx.fillText(["Presenta", "Saluda", "Señala", "Festeja", "Se sorprende"][n], 6, 14);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [asset]);

  if (!puppet.layers.length) return null;
  return <canvas ref={canvas} width={170} height={230} className="rounded-md border border-line" aria-label="Vista previa del títere" />;
}
