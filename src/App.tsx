import { useEffect, useState } from "react";
import { EMPTY_BRIEF, EXAMPLE_BRIEF } from "../shared/example.ts";
import type { Brief, Hook, HooksResult, Script, Shot, Status } from "../shared/schema.ts";
import { BriefForm } from "./components/BriefForm.tsx";
import { HookPicker } from "./components/HookPicker.tsx";
import { ScriptNotes, ScriptView, Timeline, type ImageState } from "./components/ScriptView.tsx";
import { VideoPanel } from "./components/VideoPanel.tsx";
import { Button, Notice, Spinner } from "./components/ui.tsx";
import { api } from "./lib/api.ts";
import { download, scriptToMarkdown, slug } from "./lib/markdown.ts";

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

export function App() {
  const [status, setStatus] = useState<Status | null>(null);
  const [step, setStep] = useState<Step>("brief");
  const [brief, setBrief] = useState<Brief>(loadBrief);
  const [hooks, setHooks] = useState<HooksResult | null>(null);
  const [hook, setHook] = useState<Hook | null>(null);
  const [pendingHook, setPendingHook] = useState<Hook | null>(null);
  const [script, setScript] = useState<Script | null>(null);
  const [demo, setDemo] = useState(false);
  const [images, setImages] = useState<Record<number, ImageState>>({});
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

  const briefReady = brief.productName.trim() && brief.whatItDoes.trim() && brief.pain.trim();

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
      setHook(chosen);
      setScript(result.script);
      setDemo(result.demo);
      setImages({});
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
    setImages((prev) => ({ ...prev, [index]: { ...prev[index], loading: true, error: undefined } }));
    try {
      const { dataUrl } = await api.image(provider, shot.visualPrompt, script.style, brief.format, shot.section);
      setImages((prev) => ({ ...prev, [index]: { url: dataUrl } }));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setImages((prev) => ({ ...prev, [index]: { ...prev[index], loading: false, error: message } }));
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

  function updateShot(index: number, shot: Shot) {
    setScript((s) => (s ? { ...s, shots: s.shots.map((old, i) => (i === index ? shot : old)) } : s));
  }

  const imageUrls = Object.fromEntries(
    Object.entries(images)
      .filter(([, v]) => v.url)
      .map(([k, v]) => [k, v.url!]),
  );
  const missing = script ? script.shots.length - Object.keys(imageUrls).length : 0;
  const generating = Object.values(images).some((i) => i.loading);

  const steps: { id: Step; label: string; enabled: boolean }[] = [
    { id: "brief", label: "1 · Brief", enabled: true },
    { id: "hooks", label: "2 · Hooks", enabled: hooks !== null },
    { id: "script", label: "3 · Script & video", enabled: script !== null },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 pt-6 pb-16">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Playbook Studio</h1>
          <p className="text-sm text-muted">
            Brief → five hooks → a 75-second script → images → video. Hook, Agitate, Turn, Resolve, Button.
          </p>
        </div>
        {status && (
          <div className="flex flex-wrap gap-2 text-xs">
            <span
              className={`rounded-full border px-2.5 py-1 font-medium ${status.claude ? "border-good/40 bg-good-soft text-good" : "border-line bg-white text-muted"}`}
            >
              {status.claude ? `Claude · ${status.model}` : "Claude not connected"}
            </span>
            {status.imageProviders
              .filter((p) => p.available && p.id !== "placeholder")
              .map((p) => (
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
            <b>Sample mode.</b> No Claude key is set, so hooks and script are a fixed sample written for the example brief,
            not for what you type. Add <code>ANTHROPIC_API_KEY</code> to <code>.env</code> and restart to write real ones.
          </Notice>
        )}
        {error && <Notice tone="error">{error}</Notice>}

        {step === "brief" && (
          <section className="space-y-6">
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setBrief(EXAMPLE_BRIEF)}>
                Load example
              </Button>
              <Button variant="ghost" onClick={() => setBrief(EMPTY_BRIEF)}>
                Clear
              </Button>
            </div>
            <BriefForm brief={brief} onChange={setBrief} />
            <div className="flex items-center gap-3 border-t border-line pt-5">
              <Button onClick={writeHooks} disabled={!briefReady || busy}>
                {busy ? (
                  <>
                    <Spinner /> Writing five hooks…
                  </>
                ) : (
                  "Write five hooks"
                )}
              </Button>
              {!briefReady && <span className="text-sm text-muted">Needs a product name, what it does, and the pain.</span>}
            </div>
          </section>
        )}

        {step === "hooks" && hooks && (
          <section>
            <p className="mb-4 text-sm text-muted">
              Pick the opening. Each uses a different move from the playbook. {demo && "(Sample hooks.)"}
            </p>
            <HookPicker hooks={hooks.hooks} questions={hooks.questions} pending={pendingHook} onPick={pickHook} />
          </section>
        )}

        {step === "script" && script && hook && (
          <section className="grid gap-6 lg:grid-cols-[1fr_340px]">
            <div className="min-w-0 space-y-4">
              <div>
                <h2 className="text-xl font-extrabold tracking-tight">{script.title}</h2>
                <p className="text-sm text-muted">{script.logline}</p>
              </div>
              <Timeline script={script} />
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-white p-3">
                <label className="flex items-center gap-2 text-sm">
                  <span className="font-semibold">Images from</span>
                  <select
                    className="rounded-lg border border-line bg-white px-2 py-1.5 text-sm"
                    value={provider}
                    onChange={(e) => setProvider(e.target.value)}
                  >
                    {status?.imageProviders.map((p) => (
                      <option key={p.id} value={p.id} disabled={!p.available}>
                        {p.label}
                        {p.available ? "" : " (not connected)"}
                      </option>
                    ))}
                  </select>
                </label>
                <Button onClick={generateAll} disabled={generating}>
                  {generating ? (
                    <>
                      <Spinner /> Making images…
                    </>
                  ) : (
                    "Make all images"
                  )}
                </Button>
                <Button
                  variant="ghost"
                  className="ml-auto"
                  onClick={() =>
                    download(
                      new Blob([scriptToMarkdown(brief, hook, script)], { type: "text/markdown" }),
                      `${slug(script.title)}.md`,
                    )
                  }
                >
                  Download script .md
                </Button>
              </div>
              <ScriptView
                brief={brief}
                script={script}
                images={images}
                onShotChange={updateShot}
                onGenerate={generateImage}
              />
            </div>
            <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
              <VideoPanel brief={brief} script={script} images={imageUrls} missing={missing} />
              <ScriptNotes script={script} />
            </aside>
          </section>
        )}
      </div>
    </div>
  );
}
