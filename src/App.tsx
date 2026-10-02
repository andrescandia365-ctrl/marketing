import { useEffect, useRef, useState } from "react";
import { buildCopyPrompt } from "../shared/prompt.ts";
import { EMPTY_BRIEF, EXAMPLE_BRIEF } from "../shared/example.ts";
import type { Brief, Hook, HooksResult, Script, Shot, Status } from "../shared/schema.ts";
import { TEMPLATE, formatTime, timeShots } from "../shared/template.ts";
import { BriefForm } from "./components/BriefForm.tsx";
import { HookPicker } from "./components/HookPicker.tsx";
import {
  CopyButton,
  DirectionLog,
  ScriptNotes,
  ScriptView,
  SetupsPanel,
  Timeline,
  type ClipFile,
  type MediaState,
} from "./components/ScriptView.tsx";
import { VideoPanel } from "./components/VideoPanel.tsx";
import { Button, Notice, Spinner } from "./components/ui.tsx";
import { api } from "./lib/api.ts";
import { readImageFile } from "./lib/files.ts";
import { download, scriptToMarkdown, slug, type LogEntry } from "./lib/markdown.ts";

type Step = "brief" | "hooks" | "script";

const BRIEF_KEY = "playbook-studio.brief";

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

export function App() {
  const [status, setStatus] = useState<Status | null>(null);
  const [step, setStep] = useState<Step>("brief");
  const [brief, setBrief] = useState<Brief>(loadBrief);
  const [hooks, setHooks] = useState<HooksResult | null>(null);
  const [hook, setHook] = useState<Hook | null>(null);
  const [pendingHook, setPendingHook] = useState<Hook | null>(null);
  const [script, setScript] = useState<Script | null>(null);
  const [scriptTool, setScriptTool] = useState(brief.tool);
  const [demo, setDemo] = useState(false);
  const [media, setMedia] = useState<Record<number, MediaState>>({});
  const [log, setLog] = useState<LogEntry[]>([]);
  const logStart = useRef(Date.now());
  const clipUrls = useRef<string[]>([]);
  const [provider, setProvider] = useState("placeholder");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .status()
      .then((s) => {
        setStatus(s);
        const real = s.imageProviders.find((p) => p.available && p.id !== "placeholder");
        if (real) setProvider(real.id);
        // A saved brief may name a tool whose file was removed.
        setBrief((b) => (s.tools.some((t) => t.id === b.tool) ? b : { ...b, tool: s.tools[0]?.id ?? b.tool }));
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(BRIEF_KEY, JSON.stringify(brief));
    } catch {
      // Not critical.
    }
  }, [brief]);

  // Uploaded clips live as object URLs; free them when the page goes away.
  useEffect(() => () => clipUrls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const toolName = status?.tools.find((t) => t.id === scriptTool)?.name ?? "la herramienta";
  const briefReady = brief.productName.trim() && brief.whatItDoes.trim() && brief.pain.trim();

  function addLog(entry: Omit<LogEntry, "at">) {
    setLog((l) => [...l, { ...entry, at: Date.now() - logStart.current }]);
  }

  function setShotMedia(index: number, patch: Partial<MediaState>) {
    setMedia((prev) => ({ ...prev, [index]: { ...prev[index], ...patch } }));
  }

  async function writeHooks() {
    setError("");
    setBusy(true);
    try {
      const result = await api.hooks(brief);
      setHooks(result);
      setDemo(result.demo);
      setStep("hooks");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function pickHook(chosen: Hook) {
    setError("");
    setPendingHook(chosen);
    try {
      const result = await api.script(brief, chosen);
      clipUrls.current.forEach((u) => URL.revokeObjectURL(u));
      clipUrls.current = [];
      setHook(chosen);
      setScript(result.script);
      setScriptTool(brief.tool);
      setDemo(result.demo);
      setMedia({});
      logStart.current = Date.now();
      setLog([{ at: 0, text: `Gancho elegido (${chosen.move}): “${chosen.line}”` }]);
      setStep("script");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPendingHook(null);
    }
  }

  async function generateImage(index: number) {
    if (!script) return;
    const shot = script.shots[index];
    setShotMedia(index, { loading: true, error: undefined });
    try {
      const { dataUrl } = await api.image(provider, shot.visualPrompt, script.style, brief.format, shot.section);
      setShotMedia(index, { image: dataUrl, loading: false });
    } catch (e) {
      setShotMedia(index, { loading: false, error: e instanceof Error ? e.message : String(e) });
    }
  }

  async function generateAll() {
    if (!script) return;
    const queue = script.shots.map((_, i) => i);
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
      setShotMedia(index, { error: e instanceof Error ? e.message : String(e) });
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
      setShotMedia(index, { error: e instanceof Error ? e.message : String(e) });
    }
  }

  async function rewriteShot(index: number, note: string): Promise<boolean> {
    if (!script) return false;
    try {
      const result = await api.rewrite({ ...brief, tool: scriptTool }, script, index, note);
      setScript((s) => (s ? { ...s, shots: s.shots.map((old, i) => (i === index ? result.shot : old)) } : s));
      addLog({
        shot: index,
        text: `“${note}”`,
        outcome: result.demo ? "modo de muestra: sin cambios (falta la clave de Claude)" : "prompts reescritos",
      });
      return true;
    } catch (e) {
      addLog({ shot: index, text: `“${note}”`, outcome: `no se pudo: ${e instanceof Error ? e.message : String(e)}` });
      return false;
    }
  }

  function updateShot(index: number, shot: Shot) {
    setScript((s) => (s ? { ...s, shots: s.shots.map((old, i) => (i === index ? shot : old)) } : s));
  }

  const allPrompts = (kind: "image" | "video") =>
    script
      ? timeShots(script.shots)
          .map(
            (s) =>
              `Toma ${s.index + 1} · ${formatTime(s.start)}–${formatTime(s.end)} · ${TEMPLATE[s.section].label} · ${s.toolSettings}\n` +
              (kind === "image" ? buildCopyPrompt(s.visualPrompt, brief.format) : s.videoPrompt),
          )
          .join("\n\n")
      : "";

  const renderMedia = Object.fromEntries(
    Object.entries(media).map(([k, v]) => [k, { image: v.image, clip: v.clip?.blob }]),
  );
  const generating = Object.values(media).some((m) => m.loading);
  const realProviders = status?.imageProviders.filter((p) => p.available && p.id !== "placeholder") ?? [];

  const steps: { id: Step; label: string; enabled: boolean }[] = [
    { id: "brief", label: "1 · Brief", enabled: true },
    { id: "hooks", label: "2 · Ganchos", enabled: hooks !== null },
    { id: "script", label: "3 · Guion y video", enabled: script !== null },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 pt-6 pb-16">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Playbook Studio</h1>
          <p className="text-sm text-muted">
            Brief → cinco ganchos → un guion de 75 segundos → imágenes y clips → video.
          </p>
        </div>
        {status && (
          <div className="flex flex-wrap gap-2 text-xs">
            <span
              className={`rounded-full border px-2.5 py-1 font-medium ${status.claude ? "border-good/40 bg-good-soft text-good" : "border-line bg-white text-muted"}`}
            >
              {status.claude ? `Claude · ${status.model}` : "Claude sin conectar"}
            </span>
            {realProviders.map((p) => (
              <span key={p.id} className="rounded-full border border-good/40 bg-good-soft px-2.5 py-1 font-medium text-good">
                {p.label}
              </span>
            ))}
          </div>
        )}
      </header>

      <nav className="mt-6 flex gap-1 border-b border-line">
        {steps.map((s) => (
          <button
            key={s.id}
            type="button"
            disabled={!s.enabled}
            onClick={() => setStep(s.id)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold ${
              step === s.id ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink disabled:opacity-40"
            }`}
          >
            {s.label}
          </button>
        ))}
      </nav>

      <div className="mt-6 space-y-4">
        {status && !status.claude && (
          <Notice tone="warn">
            <b>Modo de muestra.</b> No hay clave de Claude, así que los ganchos y el guion son un ejemplo fijo escrito para
            el brief de ejemplo, no para lo que escribas. Agregá <code>ANTHROPIC_API_KEY</code> en <code>.env</code> y
            reiniciá para escribir los de verdad.
          </Notice>
        )}
        {error && <Notice tone="error">{error}</Notice>}

        {step === "brief" && (
          <section className="space-y-6">
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setBrief({ ...EXAMPLE_BRIEF, tool: brief.tool })}>
                Cargar ejemplo
              </Button>
              <Button variant="ghost" onClick={() => setBrief({ ...EMPTY_BRIEF, tool: brief.tool })}>
                Borrar
              </Button>
            </div>
            <BriefForm brief={brief} tools={status?.tools ?? []} onChange={setBrief} />
            <div className="flex items-center gap-3 border-t border-line pt-5">
              <Button onClick={writeHooks} disabled={!briefReady || busy}>
                {busy ? (
                  <>
                    <Spinner /> Escribiendo cinco ganchos…
                  </>
                ) : (
                  "Escribir cinco ganchos"
                )}
              </Button>
              {!briefReady && <span className="text-sm text-muted">Falta el nombre del producto, qué hace y el dolor.</span>}
            </div>
          </section>
        )}

        {step === "hooks" && hooks && (
          <section>
            <p className="mb-4 text-sm text-muted">
              Elegí la apertura. Cada una usa una movida distinta del playbook. {demo && "(Ganchos de muestra.)"}
            </p>
            <HookPicker hooks={hooks.hooks} questions={hooks.questions} pending={pendingHook} onPick={pickHook} />
          </section>
        )}

        {step === "script" && script && hook && (
          <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="min-w-0 space-y-4">
              <div>
                <h2 className="text-xl font-bold tracking-tight">{script.title}</h2>
                <p className="text-sm text-muted">{script.logline}</p>
              </div>
              <Timeline script={script} />

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
                        new Blob([scriptToMarkdown(brief, hook, script, toolName, log)], { type: "text/markdown" }),
                        `${slug(script.title)}.md`,
                      )
                    }
                  >
                    Descargar guion .md
                  </Button>
                </div>
              </div>

              <Notice tone="warn">
                <b>En {toolName}, cada vez:</b> elegí la forma y el largo del clip en sus propios controles (el prompt solo
                lo recuerda). Primero la imagen, después animala.
              </Notice>

              <ScriptView
                brief={brief}
                script={script}
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
              <VideoPanel brief={brief} script={script} media={renderMedia} watermarked={scriptTool === "grok-imagine"} />
              <SetupsPanel script={script} media={media} toolName={toolName} />
              <DirectionLog log={log} />
              <ScriptNotes script={script} />
            </aside>
          </section>
        )}
      </div>
    </div>
  );
}
