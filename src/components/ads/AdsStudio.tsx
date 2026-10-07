// Publicidad (Método 50-5-3): paid ads next to Playbook's organic content. Tabs: the offer profile, the sources of
// winning hooks, the hooks, the meats, the CTAs and the combiner. Reuses the app's writer, its image generators, its
// 6/10/15 s clip prompts and its video renderer (render.ts, by pieces with a cache).
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AD_SECONDS,
  BUDGETS,
  LEVEL_INFO,
  levelsOf,
  offerFilled,
  type AdCombo,
  type AdSeconds,
  type AdsState,
  type CombineRules,
  type Cta,
  type Hook,
  type Meat,
  type MeatFormat,
  type Offer,
  type Piece,
  type PieceStatus,
  type RankedHook,
  type ReviewFlag,
} from "../../../shared/ads.ts";
import type { ImageProviderInfo, SeriesInfo, ToolInfo } from "../../../shared/schema.ts";
import { ads as adsApi, adsFileUrl, api } from "../../lib/api.ts";
import { concatPieces, renderAdWhole, renderPiece, type PieceLook } from "../../lib/adsRender.ts";
import { blobToDataUrl, readImageFile } from "../../lib/files.ts";
import { Button, Notice, Segmented, Spinner } from "../ui.tsx";
import { BatchWizard, type Wizard } from "./BatchWizard.tsx";
import { CombinePanel, type RenderProgress } from "./CombinePanel.tsx";
import { HooksPanel } from "./HooksPanel.tsx";
import { OfferForm } from "./OfferForm.tsx";
import { PiecesPanel } from "./PiecesPanel.tsx";
import { PieceCard, type PieceMediaState } from "./pieces.tsx";
import { SourcesPanel } from "./SourcesPanel.tsx";

type Tab = "offer" | "sources" | "hooks" | "meats" | "ctas" | "combine";
const TABS: { id: Tab; label: string }[] = [
  { id: "offer", label: "Oferta" },
  { id: "sources", label: "Fuentes" },
  { id: "hooks", label: "1 · Hooks" },
  { id: "meats", label: "2 · Meats" },
  { id: "ctas", label: "3 · CTAs" },
  { id: "combine", label: "4 · Combinar" },
];

type Props = {
  series: SeriesInfo;
  tools: ToolInfo[];
  imageProviders: ImageProviderInfo[];
  writer: boolean;
  onToPlaybook: (text: string) => void;
};

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

function clipDuration(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => resolve(video.duration);
    video.onerror = () => reject(new Error("No se pudo leer ese video. Probá con un .mp4."));
    video.src = url;
  });
}

const SETTINGS_KEY = "playbook-studio.ads.v1";
type Settings = { seconds: AdSeconds; levels: number[]; format: "vertical" | "horizontal"; tool: string; provider: string };
function loadSettings(): Settings {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null");
    if (saved) return { seconds: 15, levels: [], format: "vertical", tool: "", provider: "", ...saved };
  } catch {
    // Storage unavailable: defaults.
  }
  return { seconds: 15, levels: [], format: "vertical", tool: "", provider: "" };
}

export function AdsStudio({ series, tools, imageProviders, writer, onToPlaybook }: Props) {
  const [state, setState] = useState<AdsState | null>(null);
  const [ranking, setRanking] = useState<RankedHook[]>([]);
  const [transcription, setTranscription] = useState(false);
  const [folder, setFolder] = useState("");
  const [tab, setTab] = useState<Tab>("offer");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [media, setMedia] = useState<Record<string, PieceMediaState>>({});
  const [flags, setFlags] = useState<ReviewFlag[] | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [progress, setProgress] = useState<RenderProgress | null>(null);
  const [wizard, setWizard] = useState<Wizard | null>(null);
  const [fields, setFields] = useState<{ worksToday: string[]; audience: string; what: string } | null>(null);
  const renders = useRef(new Map<string, Blob>());
  const urls = useRef<string[]>([]);
  const toolId = settings.tool && tools.some((t) => t.id === settings.tool) ? settings.tool : (tools[0]?.id ?? "");
  const toolName = tools.find((t) => t.id === toolId)?.name ?? "la herramienta";
  const realProviders = imageProviders.filter((p) => p.available && p.id !== "placeholder");
  const provider = settings.provider && realProviders.some((p) => p.id === settings.provider) ? settings.provider : (realProviders[0]?.id ?? "");

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      // Not critical.
    }
  }, [settings]);

  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  // The series bible, to prefill the offer profile.
  useEffect(() => {
    let cancel = false;
    setFields(null);
    api
      .seriesFields(series.id)
      .then((r) => !cancel && setFields({ worksToday: r.fields.worksToday, audience: r.fields.audience, what: r.fields.what }))
      .catch(() => undefined);
    return () => {
      cancel = true;
    };
  }, [series.id]);

  // Load the series' campaign and the pieces' saved media.
  useEffect(() => {
    let cancel = false;
    setState(null);
    setMedia({});
    renders.current.clear();
    adsApi
      .load(series.id)
      .then((v) => {
        if (cancel) return;
        setState(v.state);
        setRanking(v.ranking);
        setTranscription(v.transcription);
        setFolder(v.folder);
        setTab(offerFilled(v.state.offer) ? (v.state.hooks.length ? "hooks" : "sources") : "offer");
        for (const [id, m] of Object.entries(v.state.media)) {
          if (m.image) {
            fetch(adsFileUrl(series.id, m.image))
              .then((r) => r.blob())
              .then(blobToDataUrl)
              .then((image) => !cancel && setMedia((prev) => ({ ...prev, [id]: { ...prev[id], image } })))
              .catch(() => undefined);
          }
          if (m.clip) {
            const saved = m.clip;
            fetch(adsFileUrl(series.id, saved.file))
              .then((r) => r.blob())
              .then((blob) => {
                if (cancel) return;
                const url = URL.createObjectURL(blob);
                urls.current.push(url);
                setMedia((prev) => ({ ...prev, [id]: { ...prev[id], clip: { url, blob, name: saved.name, duration: saved.duration } } }));
              })
              .catch(() => undefined);
          }
        }
      })
      .catch((e) => !cancel && setError(message(e)));
    return () => {
      cancel = true;
    };
  }, [series.id]);

  const demo = !writer;
  const pieceById = useMemo(() => {
    const m = new Map<string, Piece>();
    for (const p of [...(state?.hooks ?? []), ...(state?.meats ?? []), ...(state?.ctas ?? [])]) m.set(p.id, p);
    return m;
  }, [state]);

  async function act<T extends { state: AdsState }>(kind: string, work: () => Promise<T>): Promise<T | null> {
    setError("");
    setBusy(kind);
    try {
      const r = await work();
      setState(r.state);
      return r;
    } catch (e) {
      setError(message(e));
      return null;
    } finally {
      setBusy(null);
    }
  }

  const setStatus = useCallback(
    async (ids: string[], status: PieceStatus) => {
      setError("");
      try {
        const r = await adsApi.setStatus(series.id, ids, status);
        setState(r.state);
      } catch (e) {
        setError(message(e));
      }
    },
    [series.id],
  );

  const setPieceMedia = (id: string, patch: Partial<PieceMediaState>) => setMedia((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  async function uploadImage(piece: Piece, file: File) {
    try {
      const image = await readImageFile(file);
      setPieceMedia(piece.id, { image, error: undefined });
      const r = await adsApi.uploadPieceMedia(series.id, piece.id, "image", file);
      setState(r.state);
      renders.current.delete(piece.id);
    } catch (e) {
      setPieceMedia(piece.id, { error: message(e) });
    }
  }

  async function uploadClip(piece: Piece, file: File) {
    if (!file.type.startsWith("video/")) return setPieceMedia(piece.id, { error: "Ese archivo no es un video." });
    const url = URL.createObjectURL(file);
    try {
      const duration = await clipDuration(url);
      urls.current.push(url);
      setPieceMedia(piece.id, { clip: { url, blob: file, name: file.name, duration }, error: undefined });
      const r = await adsApi.uploadPieceMedia(series.id, piece.id, "clip", file, { name: file.name, duration });
      setState(r.state);
      renders.current.delete(piece.id);
    } catch (e) {
      URL.revokeObjectURL(url);
      setPieceMedia(piece.id, { error: message(e) });
    }
  }

  async function generateImage(piece: Piece) {
    if (!provider) return;
    setPieceMedia(piece.id, { loading: true, error: undefined });
    try {
      const { dataUrl } = await api.image(provider, piece.visualPrompt, "", settings.format, piece.kind === "hook" ? "negative" : piece.kind === "meat" ? "touching" : "good");
      setPieceMedia(piece.id, { image: dataUrl, loading: false });
      const blob = await (await fetch(dataUrl)).blob();
      const r = await adsApi.uploadPieceMedia(series.id, piece.id, "image", blob);
      setState(r.state);
      renders.current.delete(piece.id);
    } catch (e) {
      setPieceMedia(piece.id, { loading: false, error: message(e) });
    }
  }

  async function removeMedia(piece: Piece, kind: "image" | "clip") {
    setMedia((prev) => {
      const next = { ...prev[piece.id] };
      delete next[kind];
      return { ...prev, [piece.id]: next };
    });
    renders.current.delete(piece.id);
    await act("media", () => adsApi.removePieceMedia(series.id, piece.id, kind));
  }

  const flagsFor = (id: string) => (flags ?? []).filter((f) => f.pieceId === id).map((f) => ({ kind: f.kind, note: f.note, fix: f.fix }));

  const renderCard = (piece: Piece): ReactNode => (
    <PieceCard
      key={piece.id}
      piece={piece}
      media={media[piece.id]}
      format={settings.format}
      toolName={toolName}
      canGenerate={Boolean(provider)}
      onStatus={(status) => setStatus([piece.id], status)}
      onSave={async (patch) => {
        const r = await act("patch", () => adsApi.patchPiece(series.id, piece.id, patch));
        if (r) renders.current.delete(piece.id);
      }}
      onRemove={() => confirm(`¿Borrar ${piece.id}?`) && act("remove", () => adsApi.removePiece(series.id, piece.id))}
      onUploadImage={(f) => uploadImage(piece, f)}
      onUploadClip={(f) => uploadClip(piece, f)}
      onGenerateImage={() => generateImage(piece)}
      onRemoveMedia={(k) => removeMedia(piece, k)}
      flags={flagsFor(piece.id)}
      stats={
        piece.kind === "hook" ? (
          <Button variant="ghost" className="px-2 py-1 text-xs" title="Lleva este hook al brief de Playbook como momento/peg" onClick={() => onToPlaybook(piece.text)}>
            A Playbook
          </Button>
        ) : undefined
      }
    />
  );

  // ── Generation ──────────────────────────────────────────────────────────────
  const lang = "es" as const;
  async function generateHooks(count: number, levels = settings.levels, seconds = settings.seconds) {
    const r = await act("hooks", () => adsApi.hooks(series.id, { levels, count, seconds, tool: toolId, language: lang }));
    if (r) setNotes((n) => ({ ...n, hooks: r.note }));
    return r;
  }
  async function generateMeats(count: number, formats: MeatFormat[], levels = settings.levels, seconds = settings.seconds) {
    const r = await act("meats", () => adsApi.meats(series.id, { levels, formats, count, seconds, tool: toolId, language: lang }));
    if (r) setNotes((n) => ({ ...n, meats: r.note }));
    return r;
  }
  async function generateCtas(count: number, levels = settings.levels, seconds = settings.seconds) {
    const r = await act("ctas", () => adsApi.ctas(series.id, { levels, count, seconds, tool: toolId, language: lang }));
    if (r) setNotes((n) => ({ ...n, ctas: r.note }));
    return r;
  }

  async function startWizard(w: Wizard) {
    setSettings((s) => ({ ...s, levels: w.levels, seconds: w.seconds }));
    setWizard(w);
    setTab("hooks");
    await generateHooks(w.hooks, w.levels, w.seconds);
  }
  async function nextWizard() {
    if (!wizard) return;
    if (wizard.stage === "hooks") {
      setTab("meats");
      setWizard({ ...wizard, stage: "meats" });
      await generateMeats(wizard.meats, [...new Set(levelsOf(wizard.levels).flatMap((l) => LEVEL_INFO[l].meats))], wizard.levels, wizard.seconds);
    } else if (wizard.stage === "meats") {
      setTab("ctas");
      setWizard({ ...wizard, stage: "ctas" });
      await generateCtas(wizard.ctas, wizard.levels, wizard.seconds);
    } else if (wizard.stage === "ctas") {
      setTab("combine");
      setWizard({ ...wizard, stage: "combine" });
    }
  }

  async function review() {
    setError("");
    setBusy("review");
    try {
      const r = await adsApi.review(series.id);
      setFlags(r.flags);
      setReviewNote(r.note);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(null);
    }
  }

  // ── The run: pieces once (cached), then the ads cut from them ─────────────────
  async function runBatch(combos: AdCombo[], mode: "full" | "stage", rules: CombineRules) {
    if (!state) return;
    setError("");
    setBusy("run");
    const errors: string[] = [];
    try {
      const created = await adsApi.createBatch(series.id, { seconds: settings.seconds, mode, rules, ads: combos });
      setState(created.state);
      const batch = created.batch;
      let current = created.state;
      const look: PieceLook = { format: settings.format, style: series.textStyle, disclosure: "Imágenes ilustrativas", fullFrame: true, headlines: true };
      const pieceIds = [...new Set(combos.flatMap((a) => [a.hookId, a.meatId, a.ctaId]))];
      const shotMedia = (id: string) => ({ image: media[id]?.image, clip: media[id]?.clip?.blob });

      setProgress({ stage: "pieces", done: 0, total: pieceIds.length, current: "", errors });
      for (let i = 0; i < pieceIds.length; i++) {
        const id = pieceIds[i];
        const piece = pieceById.get(id);
        if (!piece) continue;
        setProgress({ stage: "pieces", done: i, total: pieceIds.length, current: `${id}: ${piece.text.slice(0, 60)}`, errors });
        if (renders.current.has(id)) continue;
        const saved = current.renders[id];
        if (saved) {
          const blob = await fetch(adsFileUrl(series.id, saved))
            .then((r) => (r.ok ? r.blob() : null))
            .catch(() => null);
          if (blob && blob.size) {
            renders.current.set(id, blob);
            continue;
          }
        }
        try {
          const result = await renderPiece(piece, shotMedia(id), look, () => undefined);
          renders.current.set(id, result.blob);
          const up = await adsApi.uploadRender(series.id, id, result.blob);
          current = up.state;
          setState(current);
        } catch (e) {
          errors.push(`${id}: ${message(e)}`);
        }
      }

      setProgress({ stage: "ads", done: 0, total: combos.length, current: "", errors });
      let whole = false;
      for (let i = 0; i < combos.length; i++) {
        const ad = combos[i];
        setProgress({ stage: "ads", done: i, total: combos.length, current: ad.id, errors });
        const parts = [ad.hookId, ad.meatId, ad.ctaId];
        const pieces = parts.map((id) => pieceById.get(id)).filter((p): p is Piece => Boolean(p));
        let blob: Blob | null = null;
        const cached = parts.map((id) => renders.current.get(id));
        if (!whole && cached.every((b): b is Blob => Boolean(b))) {
          try {
            blob = await concatPieces(cached);
          } catch (e) {
            // The pieces could not be cut together in this browser: the rest of the run renders each ad whole.
            whole = true;
            errors.push(`Las piezas no se pudieron unir sin recodificar (${message(e)}); los anuncios se renderizan enteros.`);
          }
        }
        if (!blob) {
          try {
            blob = (await renderAdWhole(pieces, Object.fromEntries(parts.map((id) => [id, shotMedia(id)])), look, () => undefined)).blob;
          } catch (e) {
            errors.push(`${ad.id}: ${message(e)}`);
            continue;
          }
        }
        try {
          await adsApi.uploadAd(series.id, batch.id, ad.id, blob);
        } catch (e) {
          errors.push(`${ad.id}: no se guardó (${message(e)})`);
        }
      }
      setProgress({ stage: "csv", done: combos.length, total: combos.length, current: "anuncios.csv", errors });
      await adsApi.batchCsv(series.id, batch.id);
      const v = await adsApi.load(series.id);
      setState(v.state);
      setRanking(v.ranking);
      setProgress({ stage: "csv", done: combos.length, total: combos.length, current: `Listo: ${folder}/anuncios/${batch.id}/`, errors });
      if (wizard) setWizard(null);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(null);
    }
  }

  if (!state) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted">
        <Spinner /> Abriendo Publicidad de {series.name}…
      </div>
    );
  }

  const counts = {
    hooks: state.hooks.length,
    hooksApproved: state.hooks.filter((h) => h.status === "approved").length,
    meats: state.meats.length,
    meatsApproved: state.meats.filter((m) => m.status === "approved").length,
    ctas: state.ctas.length,
    ctasApproved: state.ctas.filter((c) => c.status === "approved").length,
  };
  const budget = BUDGETS[settings.seconds];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-white p-3 text-sm">
        <span className="font-semibold">{series.name}</span>
        <label className="flex items-center gap-2">
          <span className="text-muted">Duración</span>
          <Segmented value={String(settings.seconds)} options={AD_SECONDS.map((s) => ({ value: String(s), label: `${s} s` }))} onChange={(v) => setSettings({ ...settings, seconds: Number(v) as AdSeconds })} />
        </label>
        <span className="text-xs text-muted">
          hook {budget.hook} s · meat {budget.meat} s · CTA {budget.cta} s
        </span>
        <label className="flex items-center gap-2">
          <span className="text-muted">Formato</span>
          <Segmented
            value={settings.format}
            options={[
              { value: "vertical", label: "9:16" },
              { value: "horizontal", label: "16:9" },
            ]}
            onChange={(v) => setSettings({ ...settings, format: v })}
          />
        </label>
        <label className="flex items-center gap-2">
          <span className="text-muted">Herramienta</span>
          <select className="rounded-lg border border-line bg-white px-2 py-1 text-sm" value={toolId} onChange={(e) => setSettings({ ...settings, tool: e.target.value })}>
            {tools.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        {realProviders.length > 1 && (
          <label className="flex items-center gap-2">
            <span className="text-muted">Imágenes</span>
            <select className="rounded-lg border border-line bg-white px-2 py-1 text-sm" value={provider} onChange={(e) => setSettings({ ...settings, provider: e.target.value })}>
              {realProviders.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <span className="ml-auto font-mono text-xs text-muted" title="Carpeta de Publicidad de esta serie">
          {folder}
        </span>
      </div>

      <BatchWizard wizard={wizard} defaults={{ levels: settings.levels, seconds: settings.seconds }} counts={counts} busy={busy !== null} onStart={startWizard} onNext={nextWizard} onStop={() => setWizard(null)} />

      <nav className="flex gap-1 overflow-x-auto border-b border-line">
        {TABS.map((t) => {
          const n = t.id === "hooks" ? counts.hooksApproved : t.id === "meats" ? counts.meatsApproved : t.id === "ctas" ? counts.ctasApproved : 0;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-semibold ${tab === t.id ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink"}`}
            >
              {t.label}
              {n > 0 && <span className="ml-1 rounded-full bg-good-soft px-1.5 text-xs text-good">{n}</span>}
            </button>
          );
        })}
      </nav>

      {error && <Notice tone="error">{error}</Notice>}
      {!offerFilled(state.offer) && tab !== "offer" && (
        <Notice tone="warn">
          Falta el perfil de oferta.{" "}
          <button type="button" className="font-semibold underline" onClick={() => setTab("offer")}>
            Completalo
          </button>{" "}
          antes de generar: la IA lo lee en cada pedido.
        </Notice>
      )}

      {tab === "offer" && (
        <OfferForm
          key={series.id}
          offer={state.offer}
          series={series}
          seriesFields={fields}
          onSave={async (offer: Offer) => {
            await act("offer", () => adsApi.saveOffer(series.id, offer));
          }}
        />
      )}
      {tab === "sources" && (
        <SourcesPanel
          series={series.id}
          state={state}
          ranking={ranking}
          transcription={transcription}
          demo={demo}
          busy={busy}
          onUploadClip={async (file) => {
            await act("clip", () => adsApi.uploadClip(series.id, file, lang));
          }}
          onClipText={async (name, transcript) => {
            await act("clipText", () => adsApi.clipFromText(series.id, name, transcript));
          }}
          onRemoveClip={async (id) => {
            await act("clip", () => adsApi.removeClip(series.id, id));
          }}
          onImportMetrics={async (csv) => {
            const r = await adsApi.importMetrics(series.id, csv);
            setState(r.state);
            setRanking(r.ranking);
            return r;
          }}
          onHookFromClip={async (clipId) => {
            const clip = state.clips.find((c) => c.id === clipId);
            if (!clip) return;
            await act("hook", () => adsApi.organicHook(series.id, clip.hook, clip.level, settings.seconds, `De “${clip.name}”`));
            setTab("hooks");
          }}
          onOpenOffer={() => setTab("offer")}
        />
      )}
      {tab === "hooks" && (
        <HooksPanel
          hooks={state.hooks}
          levels={settings.levels}
          seconds={settings.seconds}
          busy={busy === "hooks"}
          demo={demo}
          note={notes.hooks ?? ""}
          onLevels={(levels) => setSettings({ ...settings, levels })}
          onGenerate={async (count) => {
            await generateHooks(count);
          }}
          onStatus={setStatus}
          renderCard={(h: Hook) => renderCard(h)}
        />
      )}
      {tab === "meats" && (
        <PiecesPanel<Meat>
          kind="meat"
          pieces={state.meats}
          hooks={state.hooks}
          levels={settings.levels}
          seconds={settings.seconds}
          busy={busy === "meats"}
          demo={demo}
          note={notes.meats ?? ""}
          onLevels={(levels) => setSettings({ ...settings, levels })}
          onGenerate={async (count, formats) => {
            await generateMeats(count, formats);
          }}
          renderCard={(m) => renderCard(m)}
        />
      )}
      {tab === "ctas" && (
        <PiecesPanel<Cta>
          kind="cta"
          pieces={state.ctas}
          hooks={state.hooks}
          levels={settings.levels}
          seconds={settings.seconds}
          busy={busy === "ctas"}
          demo={demo}
          note={notes.ctas ?? ""}
          onLevels={(levels) => setSettings({ ...settings, levels })}
          onGenerate={async (count) => {
            await generateCtas(count);
          }}
          renderCard={(c) => renderCard(c)}
        />
      )}
      {tab === "combine" && (
        <CombinePanel
          series={series.id}
          state={state}
          seconds={settings.seconds}
          folder={folder}
          busy={busy}
          flags={flags}
          reviewNote={reviewNote}
          progress={progress}
          onReview={review}
          onRun={runBatch}
          onWeeklyLimit={async (n) => {
            await act("settings", () => adsApi.saveSettings(series.id, n));
          }}
          onRemoveBatch={async (id) => {
            await act("batch", () => adsApi.removeBatch(series.id, id));
          }}
          onBatchCsv={async (id) => (await adsApi.batchCsv(series.id, id)).csv}
        />
      )}
    </div>
  );
}
