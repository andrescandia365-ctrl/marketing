// Publicidad (Método 50-5-3): paid ads next to Playbook's organic content. Tabs: the offer profile, the sources of
// winning hooks, the hooks, the meats, the CTAs, the combiner and the hooks' static versions. Reuses the app's writer, its image generators, its
// 6/10/15 s clip prompts and its video renderer (render.ts, by pieces with a cache).
import { lazy, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AD_SECONDS,
  BUDGETS,
  LEVEL_INFO,
  levelsOf,
  currentRender,
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
import type { AdSeed, ExplainerKind } from "../../../shared/adsFromExplainer.ts";
import { audioDuration } from "../Audio.tsx";
import { Button, Lazy, Notice, Segmented, Spinner } from "../ui.tsx";
import { BatchWizard, type Wizard } from "./BatchWizard.tsx";
import { CombinePanel, type RenderProgress } from "./CombinePanel.tsx";
import { HooksPanel } from "./HooksPanel.tsx";
import { OfferForm } from "./OfferForm.tsx";
import { PiecesPanel } from "./PiecesPanel.tsx";
import { PieceCard, type PieceMediaState } from "./pieces.tsx";
import { SourcesPanel } from "./SourcesPanel.tsx";

// "Estáticos de la tanda" downloads only when opened (it brings the still renderer).
const StaticsPanel = lazy(() => import("./StaticsPanel.tsx").then((m) => ({ default: m.StaticsPanel })));

type Tab = "offer" | "sources" | "hooks" | "meats" | "ctas" | "combine" | "statics";
const TABS: { id: Tab; label: string }[] = [
  { id: "offer", label: "Oferta" },
  { id: "sources", label: "Fuentes" },
  { id: "hooks", label: "1 · Hooks" },
  { id: "meats", label: "2 · Meats" },
  { id: "ctas", label: "3 · CTAs" },
  { id: "combine", label: "4 · Combinar" },
  { id: "statics", label: "Estáticos" },
];

type Props = {
  series: SeriesInfo;
  tools: ToolInfo[];
  imageProviders: ImageProviderInfo[];
  writer: boolean;
  // Generated voices (OpenAI speech): whether the key is there, and the app's default voice.
  voice: { available: boolean; defaultVoice: string };
  onToPlaybook: (text: string) => void;
  // "Hacelo como explicativo": a new explainer of this series prefilled with a meat's or CTA's text.
  onToExplainer?: (seed: AdSeed) => void;
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

export function AdsStudio({ series, tools, imageProviders, writer, voice, onToPlaybook, onToExplainer }: Props) {
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
          for (const kind of ["clip", "voice"] as const) {
            const saved = m[kind];
            if (!saved) continue;
            fetch(adsFileUrl(series.id, saved.file))
              .then((r) => r.blob())
              .then((blob) => {
                if (cancel) return;
                const url = URL.createObjectURL(blob);
                urls.current.push(url);
                setMedia((prev) => ({ ...prev, [id]: { ...prev[id], [kind]: { url, blob, name: saved.name, duration: saved.duration } } }));
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
  const lang = "es" as const;
  // How a piece's cached render was encoded, from its file: mp4 is H.264 (render.ts), webm is VP9 or another codec.
  const cachedFormat = (id: string): "mp4" | "webm" | null => {
    const file = state?.renders[id];
    return file ? (file.endsWith(".mp4") ? "mp4" : "webm") : null;
  };
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

  // The piece's voice: uploaded, or generated with the presenter's voice from the offer profile. Its render is redone.
  async function keepVoice(piece: Piece, blob: Blob, name: string) {
    const duration = await audioDuration(blob).catch(() => {
      throw new Error("No se pudo leer ese audio. Probá con un .mp3 o un .wav.");
    });
    const url = URL.createObjectURL(blob);
    urls.current.push(url);
    setPieceMedia(piece.id, { voice: { url, blob, name, duration }, voiceLoading: false, error: undefined });
    const file = blob.type ? blob : new Blob([blob], { type: "audio/mpeg" });
    const r = await adsApi.uploadPieceMedia(series.id, piece.id, "voice", file, { name, duration });
    setState(r.state);
    renders.current.delete(piece.id);
  }

  async function uploadVoice(piece: Piece, file: File) {
    try {
      await keepVoice(piece, file, file.name);
    } catch (e) {
      setPieceMedia(piece.id, { error: message(e) });
    }
  }

  async function generateVoice(piece: Piece) {
    setPieceMedia(piece.id, { voiceLoading: true, error: undefined });
    try {
      const blob = await api.speak(piece.text, state?.offer.ttsVoice ?? "", lang);
      await keepVoice(piece, blob, `${piece.id}-voz-generada.mp3`);
    } catch (e) {
      setPieceMedia(piece.id, { voiceLoading: false, error: message(e) });
    }
  }

  // Every approved piece without a voice gets one, one after another (the speech API is called once per piece).
  async function generateMissingVoices() {
    if (!state) return;
    const missing = [...state.hooks, ...state.meats, ...state.ctas].filter((p) => p.status === "approved" && !media[p.id]?.voice && p.text.trim());
    setBusy("voices");
    setError("");
    try {
      for (const [i, p] of missing.entries()) {
        setProgress({ stage: "voices", done: i, total: missing.length, current: `${p.id}: ${p.text.slice(0, 60)}`, errors: [] });
        await generateVoice(p);
      }
      setProgress(null);
    } finally {
      setBusy(null);
    }
  }

  async function removeMedia(piece: Piece, kind: "image" | "clip" | "voice") {
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
      onUploadVoice={(f) => uploadVoice(piece, f)}
      onGenerateVoice={voice.available ? () => generateVoice(piece) : null}
      cached={cachedFormat(piece.id)}
      flags={flagsFor(piece.id)}
      explainer={state?.media[piece.id]?.clip?.explainer ? { title: state.media[piece.id]!.clip!.explainer!.title, from: state.media[piece.id]!.clip!.from ?? 0 } : undefined}
      onMakeExplainer={
        onToExplainer && piece.kind !== "hook"
          ? () => onToExplainer({ id: piece.id, kind: piece.kind as ExplainerKind, text: piece.text, onScreenText: piece.onScreenText, seconds: piece.seconds })
          : undefined
      }
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
  const look = (): PieceLook => ({ format: settings.format, style: series.textStyle, disclosure: "Imágenes ilustrativas", fullFrame: true, headlines: true });
  // An explainer's clip plays from its in point and carries its own words (nothing drawn on top).
  const shotMedia = (id: string) => {
    const saved = state?.media[id]?.clip;
    return { image: media[id]?.image, clip: media[id]?.clip?.blob, voice: media[id]?.voice?.blob, clipFrom: saved?.from ?? 0, finished: Boolean(saved?.explainer) };
  };

  // A piece's render: this session's, the cached file, or a new render saved to the cache.
  async function ensureRender(piece: Piece, current: AdsState): Promise<{ blob: Blob; state: AdsState }> {
    const known = renders.current.get(piece.id);
    if (known) return { blob: known, state: current };
    const saved = current.renders[piece.id];
    // A render from before the pieces were levelled to one loudness is made again.
    if (currentRender(saved)) {
      const blob = await fetch(adsFileUrl(series.id, saved))
        .then((r) => (r.ok ? r.blob() : null))
        .catch(() => null);
      if (blob && blob.size) {
        renders.current.set(piece.id, blob);
        return { blob, state: current };
      }
    }
    const result = await renderPiece(piece, shotMedia(piece.id), look(), () => undefined);
    renders.current.set(piece.id, result.blob);
    const up = await adsApi.uploadRender(series.id, piece.id, result.blob);
    setState(up.state);
    return { blob: result.blob, state: up.state };
  }

  // One ad from its cached pieces, packets copied; if this browser cannot, rendered whole (and so is the rest).
  async function assembleAd(ad: AdCombo, whole: { on: boolean }, errors: string[]): Promise<Blob> {
    const parts = [ad.hookId, ad.meatId, ad.ctaId];
    const pieces = parts.map((id) => pieceById.get(id)).filter((p): p is Piece => Boolean(p));
    const cached = parts.map((id) => renders.current.get(id));
    if (!whole.on && cached.every((b): b is Blob => Boolean(b))) {
      try {
        return await concatPieces(cached);
      } catch (e) {
        whole.on = true;
        errors.push(`Las piezas no se pudieron unir sin recodificar (${message(e)}); los anuncios se renderizan enteros.`);
      }
    }
    return (await renderAdWhole(pieces, Object.fromEntries(parts.map((id) => [id, shotMedia(id)])), look(), () => undefined)).blob;
  }

  // "Probar un anuncio": the three pieces (cached or rendered now) cut together, to watch before a batch.
  async function previewAd(hookId: string, meatId: string, ctaId: string): Promise<string | null> {
    if (!state) return null;
    setError("");
    setBusy("preview");
    try {
      let current = state;
      for (const id of [hookId, meatId, ctaId]) {
        const piece = pieceById.get(id);
        if (!piece) throw new Error(`No existe ${id}.`);
        current = (await ensureRender(piece, current)).state;
      }
      const errors: string[] = [];
      const blob = await assembleAd({ id: `${hookId}-${meatId}-${ctaId}`, hookId, meatId, ctaId, level: pieceById.get(hookId)?.kind === "hook" ? (pieceById.get(hookId) as Hook).level : 1 }, { on: false }, errors);
      if (errors.length) setError(errors.join(" "));
      const url = URL.createObjectURL(blob);
      urls.current.push(url);
      return url;
    } catch (e) {
      setError(message(e));
      return null;
    } finally {
      setBusy(null);
    }
  }
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
      const pieceIds = [...new Set(combos.flatMap((a) => [a.hookId, a.meatId, a.ctaId]))];

      setProgress({ stage: "pieces", done: 0, total: pieceIds.length, current: "", errors });
      for (let i = 0; i < pieceIds.length; i++) {
        const id = pieceIds[i];
        const piece = pieceById.get(id);
        if (!piece) continue;
        setProgress({ stage: "pieces", done: i, total: pieceIds.length, current: `${id}: ${piece.text.slice(0, 60)}`, errors });
        try {
          current = (await ensureRender(piece, current)).state;
        } catch (e) {
          errors.push(`${id}: ${message(e)}`);
        }
      }

      setProgress({ stage: "ads", done: 0, total: combos.length, current: "", errors });
      const whole = { on: false };
      for (let i = 0; i < combos.length; i++) {
        const ad = combos[i];
        setProgress({ stage: "ads", done: i, total: combos.length, current: ad.id, errors });
        let blob: Blob;
        try {
          blob = await assembleAd(ad, whole, errors);
        } catch (e) {
          errors.push(`${ad.id}: ${message(e)}`);
          continue;
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

  const approvedPieces = [...state.hooks, ...state.meats, ...state.ctas].filter((p) => p.status === "approved");
  const missingVoices = approvedPieces.filter((p) => !media[p.id]?.voice && p.text.trim()).length;
  const webmCount = approvedPieces.filter((p) => cachedFormat(p.id) === "webm").length;
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
        {voice.available && (
          <Button variant="secondary" className="px-2 py-1 text-xs" onClick={generateMissingVoices} disabled={busy !== null || missingVoices === 0}>
            {busy === "voices" && progress?.stage === "voices" ? (
              <>
                <Spinner /> Voz {progress.done + 1}/{progress.total}
              </>
            ) : missingVoices ? (
              `Generar las ${missingVoices} voces que faltan`
            ) : (
              "Todas las aprobadas tienen voz"
            )}
          </Button>
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
          defaultVoice={voice.defaultVoice}
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
          onPreview={previewAd}
          webm={webmCount}
          onDropWebm={async () => {
            for (const p of approvedPieces.filter((x) => cachedFormat(x.id) === "webm")) {
              renders.current.delete(p.id);
              await act("drop", () => adsApi.dropRender(series.id, p.id));
            }
          }}
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
      {tab === "statics" && (
        <Lazy>
          <StaticsPanel key={series.id} series={series} state={state} tools={tools} flags={flags} folder={folder} onState={setState} />
        </Lazy>
      )}
    </div>
  );
}
