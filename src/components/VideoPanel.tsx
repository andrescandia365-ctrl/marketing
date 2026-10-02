import { useEffect, useState } from "react";
import type { Brief, Script } from "../../shared/schema.ts";
import { download, slug } from "../lib/markdown.ts";
import { renderVideo, type RenderResult } from "../lib/render.ts";
import { Button, Notice, inputClass } from "./ui.tsx";

const DISCLOSURE = { en: "Illustrative images", es: "Imágenes ilustrativas" };

type Props = { brief: Brief; script: Script; images: Record<number, string>; missing: number };

export function VideoPanel({ brief, script, images, missing }: Props) {
  const [progress, setProgress] = useState<number | null>(null);
  const [result, setResult] = useState<(RenderResult & { url: string }) | null>(null);
  const [error, setError] = useState("");
  const [showDisclosure, setShowDisclosure] = useState(true);
  const [disclosure, setDisclosure] = useState(DISCLOSURE[brief.language]);

  useEffect(() => () => {
    if (result) URL.revokeObjectURL(result.url);
  }, [result]);

  async function render() {
    setError("");
    setProgress(0);
    try {
      const out = await renderVideo(script, images, brief.format, showDisclosure ? disclosure : "", setProgress);
      setResult({ ...out, url: URL.createObjectURL(out.blob) });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setProgress(null);
    }
  }

  const vertical = brief.format === "vertical";

  return (
    <div className="rounded-xl border border-line bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold">Video · 1:15</p>
        <Button onClick={render} disabled={progress !== null}>
          {progress !== null ? `Rendering ${Math.round(progress * 100)}%` : result ? "Render again" : "Render video"}
        </Button>
      </div>
      <div className="mt-3 space-y-1.5">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={showDisclosure} onChange={(e) => setShowDisclosure(e.target.checked)} />
          Disclosure line at the bottom of the video
        </label>
        {showDisclosure && (
          <input
            className={`${inputClass} py-1.5 text-xs`}
            value={disclosure}
            onChange={(e) => setDisclosure(e.target.value)}
            placeholder="e.g. Illustrative images · Dramatization"
          />
        )}
      </div>
      {missing > 0 && (
        <p className="mt-2 text-xs text-muted">
          {missing} shot{missing === 1 ? " has" : "s have"} no image yet; {missing === 1 ? "it" : "they"} will show as a
          colour card.
        </p>
      )}
      {progress !== null && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-paper">
          <div className="h-full bg-good transition-all" style={{ width: `${progress * 100}%` }} />
        </div>
      )}
      {error && (
        <div className="mt-3">
          <Notice tone="error">{error}</Notice>
        </div>
      )}
      {result && (
        <div className="mt-3 space-y-2">
          <video
            src={result.url}
            controls
            playsInline
            className={`mx-auto w-full rounded-lg bg-black ${vertical ? "max-h-[70vh] w-auto" : ""}`}
          />
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => download(result.blob, `${slug(script.title)}.${result.extension}`)}
          >
            Download .{result.extension}
          </Button>
          <p className="text-xs text-muted">No voice track yet: captions and subtitles carry the script.</p>
        </div>
      )}
    </div>
  );
}
