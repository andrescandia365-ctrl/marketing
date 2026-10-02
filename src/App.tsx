import { useEffect, useRef, useState } from "react";
import { buildCopyPrompt } from "../shared/prompt.ts";
import { EMPTY_BRIEF, EXAMPLE_BRIEF } from "../shared/example.ts";
import type { Board, Brief, Menu, Shot, Status, Story, TopicIdea } from "../shared/schema.ts";
import { BEAT_INFO, formatTime, timeShots } from "../shared/template.ts";
import { BoardView } from "./components/BoardView.tsx";
import { BriefForm } from "./components/BriefForm.tsx";
import { MenuPicker } from "./components/MenuPicker.tsx";
import {
  CopyButton,
  DirectionLog,
  ScriptView,
  SetupsPanel,
  StoryNotes,
  Timeline,
  type ClipFile,
  type MediaState,
} from "./components/ScriptView.tsx";
import { StoryView } from "./components/StoryView.tsx";
import { VideoPanel } from "./components/VideoPanel.tsx";
import { Button, Notice, Spinner } from "./components/ui.tsx";
import { api } from "./lib/api.ts";
import { readImageFile } from "./lib/files.ts";
import { download, pieceToMarkdown, slug, storyToMarkdown, type LogEntry } from "./lib/markdown.ts";

type Step = "brief" | "menu" | "story" | "board" | "production";

const BRIEF_KEY = "playbook-studio.brief.v2";

function loadBrief(): Brief {
  try {
    const saved = localStorage.getItem(BRIEF_KEY);
    if (saved) return { ...EMPTY_BRIEF, ...JSON.parse(saved) };
  } catch {
    // Storage unavailable (private window): start empty.
  }
  return EMPTY_BRIEF;
}

function clipDuration(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => resolve(video.duration);
    video.onerror = () => reject(new Error("No se pudo leer ese video. Probá con un .mp4."));
    video.src = url;
  });
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function App() {
  const [status, setStatus] = useState<Status | null>(null);
  const [step, setStep] = useState<Step>("brief");
  const [brief, setBrief] = useState<Brief>(loadBrief);
  // The brief the current piece was written from; later steps use it even if the form changes.
  const [pieceBrief, setPieceBrief] = useState<Brief>(brief);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [story, setStory] = useState<Story | null>(null);
  const [storyRound, setStoryRound] = useState(1);
  const [board, setBoard] = useState<Board | null>(null);
  const [boardRound, setBoardRound] = useState(1);
  const [demo, setDemo] = useState(false);
  const [media, setMedia] = useState<Record<number, MediaState>>({});
  const [log, setLog] = useState<LogEntry[]>([]);
  const logStart = useRef(Date.now());
  const clipUrls = useRef<string[]>([]);
  const [provider, setProvider] = useState("placeholder");
  const [busy, setBusy] = useState<null | "menu" | "story" | "revise" | "board" | "reviseBoard">(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .status()
      .then((s) => {
        setStatus(s);
        const real = s.imageProviders.find((p) => p.available && p.id !== "placeholder");
        if (real) setProvider(real.id);
        // A saved brief may name a tool or series whose file was removed.
        setBrief((b) => ({
          ...b,
          tool: s.tools.some((t) => t.id === b.tool) ? b.tool : (s.tools[0]?.id ?? b.tool),
          series: s.series.some((x) => x.id === b.series) ? b.series : (s.series[0]?.id ?? b.series),
        }));
      })
      .catch((e) => setError(message(e)));
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(BRIEF_KEY, JSON.stringify(brief));
    } catch {
      // Not critical.
    }
  }, [brief]);

  useEffect(() => () => clipUrls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const toolName = status?.tools.find((t) => t.id === pieceBrief.tool)?.name ?? "la herramienta";
  const seriesName = status?.series.find((s) => s.id === pieceBrief.series)?.name ?? "";

  function addLog(entry: Omit<LogEntry, "at">) {
    setLog((l) => [...l, { ...entry, at: Date.now() - logStart.current }]);
  }

  function setShotMedia(index: number, patch: Partial<MediaState>) {
    setMedia((prev) => ({ ...prev, [index]: { ...prev[index], ...patch } }));
  }

  async function run<T>(kind: NonNullable<typeof busy>, work: () => Promise<T>): Promise<T | null> {
    setError("");
    setBusy(kind);
    try {
      return await work();
    } catch (e) {
      setError(message(e));
      return null;
    } finally {
      setBusy(null);
    }
  }

  // Step 1 → menu
  async function openMenu() {
    const result = await run("menu", () => api.menu(brief));
    if (!result) return;
    setPieceBrief(brief);
    setMenu(result);
    setDemo(result.demo);
    setStory(null);
    setBoard(null);
    logStart.current = Date.now();
    setLog([]);
    setStep("menu");
  }

  // Step 2 → story
  async function writeStory(topics: TopicIdea[]) {
    const result = await run("story", () => api.story(pieceBrief, topics));
    if (!result) return;
    setStory(result.story);
    setStoryRound(1);
    setBoard(null);
    setDemo(result.demo);
    addLog({ text: `Temas elegidos: ${topics.map((t) => `“${t.title}”`).join(", ")}`, outcome: "historia, ronda 1" });
    setStep("story");
  }

  async function reviseStory(note: string): Promise<boolean> {
    if (!story) return false;
    const result = await run("revise", () => api.reviseStory(pieceBrief, story, note));
    if (!result) return false;
    setStory(result.story);
    setStoryRound((r) => r + 1);
    addLog({
      text: `Historia, ronda ${storyRound}: “${note}”`,
      outcome: result.demo ? "modo de muestra: sin cambios" : `historia, ronda ${storyRound + 1}`,
    });
    return true;
  }

  // Step 3 → storyboard
  async function makeBoard() {
    if (!story) return;
    const result = await run("board", () => api.board(pieceBrief, story));
    if (!result) return;
    setBoard(result.board);
    setBoardRound(1);
    setMedia({});
    addLog({ text: `Historia aprobada en la ronda ${storyRound}`, outcome: "storyboard, ronda 1" });
    setStep("board");
  }

  async function reviseBoard(note: string, shotNotes: { index: number; note: string }[]): Promise<boolean> {
    if (!story || !board) return false;
    const result = await run("reviseBoard", () => api.reviseBoard(pieceBrief, story, board, note, shotNotes));
    if (!result) return false;
    setBoard(result.board);
    setBoardRound((r) => r + 1);
    const notes = [note && `“${note}”`, ...shotNotes.map((n) => `toma ${n.index + 1}: “${n.note}”`)].filter(Boolean);
    addLog({
      text: `Storyboard, ronda ${boardRound}: ${notes.join(" · ")}`,
      outcome: result.demo ? "modo de muestra: sin cambios" : `storyboard, ronda ${boardRound + 1}`,
    });
    return true;
  }

  function approveBoard() {
    addLog({ text: `Storyboard aprobado en la ronda ${boardRound}` });
    setStep("production");
  }

  // Step 4 → production
  async function generateImage(index: number) {
    if (!board) return;
    const shot = board.shots[index];
    setShotMedia(index, { loading: true, error: undefined });
    try {
      const { dataUrl } = await api.image(provider, shot.visualPrompt, board.style, pieceBrief.format, shot.beat);
      setShotMedia(index, { image: dataUrl, loading: false });
    } catch (e) {
      setShotMedia(index, { loading: false, error: message(e) });
    }
  }

  async function generateAll() {
    if (!board) return;
    const queue = board.shots.map((_, i) => i);
    const worker = async () => {
      for (let i = queue.shift(); i !== undefined; i = queue.shift()) await generateImage(i);
    };
    await Promise.all([worker(), worker(), worker()]);
  }

  async function uploadImage(index: number, file: File) {
    try {
      const image = await readImageFile(file);
      setShotMedia(index, { image, error: undefined });
      addLog({ shot: index, text: `Imagen subida: ${file.name}` });
    } catch (e) {
      setShotMedia(index, { error: message(e) });
    }
  }

  async function uploadClip(index: number, file: File) {
    if (!file.type.startsWith("video/")) {
      setShotMedia(index, { error: "Ese archivo no es un video." });
      return;
    }
    const url = URL.createObjectURL(file);
    try {
      const duration = await clipDuration(url);
      clipUrls.current.push(url);
      const clip: ClipFile = { url, blob: file, name: file.name, duration };
      setShotMedia(index, { clip, error: undefined });
      addLog({ shot: index, text: `Clip subido: ${file.name}, ${duration.toFixed(1)} s` });
    } catch (e) {
      URL.revokeObjectURL(url);
      setShotMedia(index, { error: message(e) });
    }
  }

  async function rewriteShot(index: number, note: string): Promise<boolean> {
    if (!story || !board) return false;
    try {
      const result = await api.rewriteShot(pieceBrief, story, board, index, note);
      setBoard((b) => (b ? { ...b, shots: b.shots.map((old, i) => (i === index ? result.shot : old)) } : b));
      addLog({
        shot: index,
        text: `“${note}”`,
        outcome: result.demo ? "modo de muestra: sin cambios (falta la clave de la IA)" : "prompts reescritos",
      });
      return true;
    } catch (e) {
      addLog({ shot: index, text: `“${note}”`, outcome: `no se pudo: ${message(e)}` });
      return false;
    }
  }

  function updateShot(index: number, shot: Shot) {
    setBoard((b) => (b ? { ...b, shots: b.shots.map((old, i) => (i === index ? shot : old)) } : b));
  }

  const allPrompts = (kind: "image" | "video") =>
    board
      ? timeShots(board.shots)
          .map(
            (s) =>
              `Toma ${s.index + 1} · ${formatTime(s.start)}–${formatTime(s.end)} · ${BEAT_INFO[s.beat].label} · ${s.toolSettings}\n` +
              (kind === "image" ? buildCopyPrompt(s.visualPrompt, pieceBrief.format) : s.videoPrompt),
          )
          .join("\n\n")
      : "";

  const renderMedia = Object.fromEntries(Object.entries(media).map(([k, v]) => [k, { image: v.image, clip: v.clip?.blob }]));
  const generating = Object.values(media).some((m) => m.loading);
  const realProviders = status?.imageProviders.filter((p) => p.available && p.id !== "placeholder") ?? [];
  const maxTopics = pieceBrief.length === "short" ? 1 : 4;

  const steps: { id: Step; label: string; enabled: boolean }[] = [
    { id: "brief", label: "1 · Brief", enabled: true },
    { id: "menu", label: "2 · Menú", enabled: menu !== null },
    { id: "story", label: "3 · Historia", enabled: story !== null },
    { id: "board", label: "4 · Storyboard", enabled: board !== null },
    { id: "production", label: "5 · Producción", enabled: board !== null && step === "production" },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 pt-6 pb-16">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Playbook Studio</h1>
          <p className="text-sm text-muted">Contenido con historia: el Bueno contra el Malo, temas, puentes y callbacks.</p>
        </div>
        {status && (
          <div className="flex flex-wrap gap-2 text-xs">
            <span
              className={`rounded-full border px-2.5 py-1 font-medium ${status.writer ? "border-good/40 bg-good-soft text-good" : "border-line bg-white text-muted"}`}
            >
              {status.writer ? `${status.writer.label} · ${status.writer.model}` : "IA sin conectar"}
            </span>
            {realProviders.map((p) => (
              <span key={p.id} className="rounded-full border border-good/40 bg-good-soft px-2.5 py-1 font-medium text-good">
                {p.label}
              </span>
            ))}
          </div>
        )}
      </header>

      <nav className="mt-6 flex gap-1 overflow-x-auto border-b border-line">
        {steps.map((s) => (
          <button
            key={s.id}
            type="button"
            disabled={!s.enabled}
            onClick={() => setStep(s.id)}
            className={`-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-semibold ${
              step === s.id ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink disabled:opacity-40"
            }`}
          >
            {s.label}
          </button>
        ))}
      </nav>

      <div className="mt-6 space-y-4">
        {status && !status.writer && (
          <Notice tone="warn">
            <b>Modo de muestra.</b> No hay clave de IA: el menú, la historia y el storyboard son un ejemplo fijo de
            IMAN, y las revisiones no cambian nada. Agregá <code>ANTHROPIC_API_KEY</code> (Claude) o <code>KIMI_API_KEY</code> (Kimi) en <code>.env</code> y reiniciá
            para escribir los de verdad.
          </Notice>
        )}
        {error && <Notice tone="error">{error}</Notice>}

        {step === "brief" && (
          <section className="space-y-6">
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={() => setBrief({ ...EXAMPLE_BRIEF, tool: brief.tool, series: brief.series })}
              >
                Cargar ejemplo
              </Button>
              <Button variant="ghost" onClick={() => setBrief({ ...EMPTY_BRIEF, tool: brief.tool, series: brief.series })}>
                Borrar
              </Button>
            </div>
            <BriefForm brief={brief} series={status?.series ?? []} tools={status?.tools ?? []} onChange={setBrief} />
            <div className="flex items-center gap-3 border-t border-line pt-5">
              <Button onClick={openMenu} disabled={busy !== null || (brief.series === "masogar" && !brief.product.trim())}>
                {busy === "menu" ? (
                  <>
                    <Spinner /> Armando el menú…
                  </>
                ) : (
                  "Ver el menú de temas"
                )}
              </Button>
              {brief.series === "masogar" && !brief.product.trim() && (
                <span className="text-sm text-muted">Para Masogar, escribí el producto del episodio.</span>
              )}
            </div>
          </section>
        )}

        {step === "menu" && menu && (
          <section>
            {demo && <p className="mb-2 text-sm text-muted">(Menú de muestra.)</p>}
            <MenuPicker
              ideas={menu.ideas}
              questions={menu.questions}
              max={maxTopics}
              busy={busy === "story"}
              onWrite={writeStory}
            />
          </section>
        )}

        {step === "story" && story && (
          <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <StoryView
              story={story}
              round={storyRound}
              length={pieceBrief.length}
              busy={busy === "revise" ? "revise" : busy === "board" ? "board" : null}
              onRevise={reviseStory}
              onApprove={makeBoard}
            />
            <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
              <Button
                variant="secondary"
                className="w-full"
                onClick={() => download(new Blob([storyToMarkdown(story)], { type: "text/markdown" }), `${slug(story.title)}-historia.md`)}
              >
                Descargar historia .md
              </Button>
              <DirectionLog log={log} />
              <StoryNotes story={story} />
            </aside>
          </section>
        )}

        {step === "board" && story && board && (
          <BoardView
            story={story}
            board={board}
            round={boardRound}
            busy={busy === "reviseBoard"}
            onRevise={reviseBoard}
            onApprove={approveBoard}
          />
        )}

        {step === "production" && story && board && (
          <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="min-w-0 space-y-4">
              <div>
                <p className="font-mono text-xs text-muted">{seriesName}</p>
                <h2 className="text-xl font-bold tracking-tight">{story.title}</h2>
                <p className="text-sm text-muted">{story.logline}</p>
              </div>
              <Timeline board={board} />

              <div className="space-y-3 rounded-xl border border-line bg-white p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <CopyButton text={allPrompts("image")} idle="Copiar todos los prompts de imagen" />
                  <CopyButton text={allPrompts("video")} idle="Copiar todos los prompts de video" variant="secondary" />
                  <span className="text-sm text-muted">
                    Pegalos en {toolName} y después soltá cada imagen y cada clip en su toma.
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
                  <label className="flex items-center gap-2 text-sm">
                    <span className="text-muted">O generar con</span>
                    <select
                      className="rounded-lg border border-line bg-white px-2 py-1.5 text-sm"
                      value={provider}
                      onChange={(e) => setProvider(e.target.value)}
                    >
                      {status?.imageProviders.map((p) => (
                        <option key={p.id} value={p.id} disabled={!p.available}>
                          {p.label}
                          {p.available ? "" : " (sin conectar)"}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Button variant="secondary" onClick={generateAll} disabled={generating}>
                    {generating ? (
                      <>
                        <Spinner /> Generando…
                      </>
                    ) : (
                      "Generar todas"
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    className="ml-auto"
                    onClick={() =>
                      download(
                        new Blob([pieceToMarkdown(pieceBrief, story, board, toolName, log)], { type: "text/markdown" }),
                        `${slug(story.title)}.md`,
                      )
                    }
                  >
                    Descargar todo .md
                  </Button>
                </div>
              </div>

              <Notice tone="warn">
                <b>En {toolName}, cada vez:</b> elegí la forma y el largo del clip en sus propios controles (el prompt solo
                lo recuerda). Primero la imagen, después animala.
              </Notice>

              <ScriptView
                brief={pieceBrief}
                story={story}
                board={board}
                media={media}
                toolName={toolName}
                onShotChange={updateShot}
                onGenerate={generateImage}
                onUploadImage={uploadImage}
                onUploadClip={uploadClip}
                onRewrite={rewriteShot}
              />
            </div>
            <aside className="space-y-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:self-start lg:overflow-y-auto">
              <VideoPanel
                brief={pieceBrief}
                story={story}
                board={board}
                media={renderMedia}
                watermarked={pieceBrief.tool === "grok-imagine"}
              />
              <SetupsPanel board={board} media={media} toolName={toolName} />
              <DirectionLog log={log} />
              <StoryNotes story={story} />
            </aside>
          </section>
        )}
      </div>
    </div>
  );
}
