import { useEffect, useState } from "react";
import type { Board, Brief, Story } from "../../shared/schema.ts";
import { formatTime, totalSeconds } from "../../shared/template.ts";
import { download, slug } from "../lib/markdown.ts";
import { renderVideo, type RenderResult, type ShotMedia } from "../lib/render.ts";
import { Button, Notice, Segmented, inputClass } from "./ui.tsx";

const DISCLOSURE = { en: "Illustrative images", es: "Imágenes ilustrativas" };

type Props = {
  brief: Brief;
  story: Story;
  board: Board;
  media: Record<number, ShotMedia>;
  // Tools that watermark their output start with the full frame on.
  watermarked: boolean;
};

export function VideoPanel({ brief, story, board, media, watermarked }: Props) {
  const [progress, setProgress] = useState<number | null>(null);
  const [result, setResult] = useState<(RenderResult & { url: string }) | null>(null);
  const [error, setError] = useState("");
  const [showDisclosure, setShowDisclosure] = useState(true);
  const [disclosure, setDisclosure] = useState(DISCLOSURE[brief.language]);
  const [fullFrame, setFullFrame] = useState(watermarked);
  const [sound, setSound] = useState<"keep" | "mute">("keep");

  useEffect(() => () => {
    if (result) URL.revokeObjectURL(result.url);
  }, [result]);

  const total = board.shots.length;
  const clips = board.shots.filter((_, i) => media[i]?.clip).length;
  const empty = board.shots.filter((_, i) => !media[i]?.clip && !media[i]?.image).length;
  const speakers = Object.fromEntries(story.characters.map((c) => [c.id, { name: c.name, role: c.role }]));

  async function render() {
    setError("");
    setProgress(0);
    try {
      const out = await renderVideo(
        board,
        media,
        {
          format: brief.format,
          disclosure: showDisclosure ? disclosure : "",
          fullFrame,
          keepSound: sound === "keep",
          speakers,
        },
        setProgress,
      );
      setResult({ ...out, url: URL.createObjectURL(out.blob) });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setProgress(null);
    }
  }

  const vertical = brief.format === "vertical";

  return (
    <div className="space-y-3 rounded-xl border border-line bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold">Video · {formatTime(totalSeconds(board.shots))}</p>
        <Button onClick={render} disabled={progress !== null}>
          {progress !== null ? `Generando ${Math.round(progress * 100)}%` : result ? "Generar de nuevo" : "Generar video"}
        </Button>
      </div>
      <p className="text-xs text-muted">
        {clips} de {total} tomas tienen clip. Las que solo tienen imagen llevan un acercamiento lento
        {empty > 0 ? `; las ${empty} vacías muestran una placa de color.` : "."}
      </p>

      <div className="space-y-1">
        <span className="text-xs font-semibold">Sonido de los clips</span>
        <div>
          <Segmented
            value={sound}
            onChange={setSound}
            options={[
              { value: "keep", label: "Mantener" },
              { value: "mute", label: "Silenciar" },
            ]}
          />
        </div>
      </div>

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1 size-4" checked={fullFrame} onChange={(e) => setFullFrame(e.target.checked)} />
        <span>
          <b>Cuadro completo</b>
          <span className="block text-xs text-muted">
            Sin zoom ni recorte, así la marca de agua de la herramienta queda visible{watermarked ? " (Grok lo exige)" : ""}.
          </span>
        </span>
      </label>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-1 size-4"
          checked={showDisclosure}
          onChange={(e) => setShowDisclosure(e.target.checked)}
        />
        <span>
          <b>Aviso al pie</b>
          <span className="block text-xs text-muted">Una línea chica abajo, en todo el video.</span>
        </span>
      </label>
      {showDisclosure && (
        <input
          className={`${inputClass} py-1.5 text-xs`}
          value={disclosure}
          onChange={(e) => setDisclosure(e.target.value)}
          placeholder="ej. Imágenes ilustrativas · Dramatización"
        />
      )}

      {progress !== null && (
        <div className="h-1.5 overflow-hidden rounded-full bg-paper">
          <div className="h-full bg-good transition-all" style={{ width: `${progress * 100}%` }} />
        </div>
      )}
      {error && <Notice tone="error">{error}</Notice>}
      {result && (
        <div className="space-y-2">
          <video
            src={result.url}
            controls
            playsInline
            className={`mx-auto w-full rounded-lg bg-black ${vertical ? "max-h-[70vh] w-auto" : ""}`}
          />
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => download(result.blob, `${slug(story.title)}.${result.extension}`)}
          >
            Descargar .{result.extension}
          </Button>
          {result.notes.map((n) => (
            <p key={n} className="text-xs text-muted">
              {n}
            </p>
          ))}
          <p className="text-xs text-muted">Todavía no hay voces: el nombre de quien habla y su línea van en subtítulos.</p>
        </div>
      )}
    </div>
  );
}
