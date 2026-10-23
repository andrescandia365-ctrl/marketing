// Publicidad (Método 50-5-3): paid ads next to Playbook's organic content. Tabs: the offer profile, the sources of
// winning hooks, the hooks, the meats, the CTAs, the combiner and the hooks' static versions. Reuses the app's writer, its image generators, its
// clip prompts (one Grok clip, or a sequence when the piece is longer than 15 s) and its video renderer (render.ts, by pieces with a cache).
import { lazy, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ADS_SETTINGS_KEY,
  LEVEL_INFO,
  levelsOf,
  adId,
  currentRender,
  isAdSeconds,
  offerFilled,
  splitIssue,
  type AdCombo,
  copyKey,
  type AdsState,
  type Budget,
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
import { ads as adsApi, adsAsks, adsFileUrl, api, askPrompt, sendAsk } from "../../lib/api.ts";
import type { Handoff } from "../ClaudeHandoff.tsx";
import { concatPieces, renderAdWhole, renderPiece, type PieceLook, type PieceMedia } from "../../lib/adsRender.ts";
import { blobToDataUrl, readImageFile } from "../../lib/files.ts";
import type { AdSeed } from "../../../shared/adsFromExplainer.ts";
import { emptyClipSlots, grokSequence, type ClipPresence } from "../../../shared/adsSequence.ts";
import type { PastedCopy } from "../../../shared/adsHandoff.ts";
import { audioDuration } from "../Audio.tsx";
import { Button, Lazy, Notice, Segmented, Spinner } from "../ui.tsx";
import { BatchWizard, type Wizard } from "./BatchWizard.tsx";
import { CombinePanel, type RenderProgress } from "./CombinePanel.tsx";
import { HooksPanel } from "./HooksPanel.tsx";
import { OfferForm } from "./OfferForm.tsx";
import { PiecesPanel } from "./PiecesPanel.tsx";
import { PieceCard, type PieceMediaState, type VoiceClip } from "./pieces.tsx";
import { nextVoiceId, pieceOfUnit, renderKey, renderUnits, voiceCachePlan, voiceCutBlock, voiceNumber, type CachePlan } from "../../../shared/voiceVariants.ts";
import { SourcesPanel } from "./SourcesPanel.tsx";
import { SpeakerBatch } from "./SpeakerBatch.tsx";
import { SpeakerPanel } from "./SpeakerPanel.tsx";
import { storyFonts } from "../../../shared/brandFonts.ts";
import { lookPhrase } from "../../../shared/prompt.ts";
import { AdLength } from "./AdLength.tsx";

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
  // "Hacelo como explicativo": a new explainer of this series prefilled with a hook's, meat's or CTA's text.
  onToExplainer?: (seed: AdSeed) => void;
};

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const findPieceIn = (state: AdsState | null, id: string): Piece | undefined => (state ? [...state.hooks, ...state.meats, ...state.ctas].find((p) => p.id === id) : undefined);
const byVoiceId = (a: { id: string }, b: { id: string }) => voiceNumber(a.id) - voiceNumber(b.id);

function dropSessionPiece(map: Map<string, Blob>, pieceId: string) {
  for (const key of [...map.keys()]) {
    if (key === pieceId || key.startsWith(`${pieceId}.v`)) map.delete(key);
  }
}

function applySessionPlan(map: Map<string, Blob>, plan: CachePlan) {
  if (plan.move) {
    const blob = map.get(plan.move.from);
    if (blob) {
      map.delete(plan.move.from);
      map.set(plan.move.to, blob);
    }
  }
  for (const key of plan.drop) {
    if (key !== plan.move?.to) map.delete(key);
  }
}

const STAGE_LABEL: Record<RenderProgress["stage"], string> = {
  pieces: "Renderizando piezas",
  ads: "Armando anuncios",
  csv: "Escribiendo el CSV",
  voices: "Generando voces",
  convert: "Convirtiendo voces",
};

function clipDuration(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => resolve(video.duration);
    video.onerror = () => reject(new Error("No se pudo leer ese video. Probá con un .mp4."));
    video.src = url;
  });
}

const SETTINGS_KEY = ADS_SETTINGS_KEY;
type Settings = {
  seconds: number;
  split: Budget | null;
  // A length already saved in this browser is a choice: a later suggestion does not replace it.
  lengthTouched: boolean;
  levels: number[];
  format: "vertical" | "horizontal";
  tool: string;
  provider: string;
};
function loadSettings(): Settings {
  const base: Settings = { seconds: 15, split: null, lengthTouched: false, levels: [], format: "vertical", tool: "", provider: "" };
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null") as Partial<Settings> | null;
    if (!saved || typeof saved !== "object") return base;
    const seconds = isAdSeconds(Number(saved.seconds)) ? Number(saved.seconds) : 15;
    const raw = saved.split;
    const split = raw && splitIssue(seconds, raw) === null ? raw : null;
    return {
      ...base,
      levels: Array.isArray(saved.levels) ? saved.levels : [],
      format: saved.format === "horizontal" ? "horizontal" : "vertical",
      tool: typeof saved.tool === "string" ? saved.tool : "",
      provider: typeof saved.provider === "string" ? saved.provider : "",
      seconds,
      split,
      lengthTouched: isAdSeconds(Number(saved.seconds)),
    };
  } catch {
    // Storage unavailable: defaults.
  }
  return base;
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
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const [wizard, setWizard] = useState<Wizard | null>(null);
  const [fields, setFields] = useState<{ worksToday: string[]; audience: string; what: string } | null>(null);
  // "Sin clave": the platform texts pasted from claude.ai (by pair key) until a run takes them, and the counts
  // "Generar tanda" asked for, which the tabs' copy-and-paste boxes start from.
  const [pastedCopies, setPastedCopies] = useState<Record<string, PastedCopy>>({});
  const [preset, setPreset] = useState<{ hooks?: number; meats?: number; ctas?: number }>({});
  const [motionMade, setMotionMade] = useState("");
  useEffect(() => {
    setPastedCopies({});
    setPreset({});
  }, [series.id]);
  const renders = useRef(new Map<string, Blob>());
  const stopRef = useRef(false);
  const urls = useRef<string[]>([]);
  const motionLock = useRef(false);
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
          for (const kind of ["clip"] as const) {
            const saved = m[kind];
            if (!saved) continue;
            fetch(adsFileUrl(series.id, saved.file))
              .then((r) => r.blob())
              .then((blob) => {
                if (cancel) return;
                const url = URL.createObjectURL(blob);
                urls.current.push(url);
                const from = "from" in saved ? saved.from : undefined;
                setMedia((prev) => ({ ...prev, [id]: { ...prev[id], [kind]: { url, blob, name: saved.name, duration: saved.duration, ...(from !== undefined ? { from } : {}) } } }));
              })
              .catch(() => undefined);
          }
          if (m.voiceSeq || m.voices?.length) {
            setMedia((prev) => ({ ...prev, [id]: { ...prev[id], voiceSeq: m.voiceSeq } }));
          }
          const voiceList = m.voices ?? [];
          const singleVoice = voiceList.length === 1;
          for (const saved of voiceList) {
            fetch(adsFileUrl(series.id, saved.file))
              .then((r) => r.blob())
              .then((blob) => {
                if (cancel) return;
                const url = URL.createObjectURL(blob);
                urls.current.push(url);
                const entry: VoiceClip = { id: saved.id, url, blob, name: saved.name, duration: saved.seconds, ...(saved.cutOk ? { cutOk: true } : {}) };
                setMedia((prev) => {
                  const cur = prev[id] ?? {};
                  const voices = [...(cur.voices ?? [])];
                  const at = voices.findIndex((v) => v.id === saved.id);
                  if (at >= 0) voices[at] = entry;
                  else voices.push(entry);
                  voices.sort(byVoiceId);
                  const next: PieceMediaState = { ...cur, voices, voiceSeq: m.voiceSeq ?? cur.voiceSeq };
                  if (singleVoice) next.voice = { url, blob, name: saved.name, duration: saved.seconds };
                  else delete next.voice;
                  return { ...prev, [id]: next };
                });
              })
              .catch(() => undefined);
          }
          (m.clips ?? []).forEach((saved, index) => {
            if (!saved) return;
            fetch(adsFileUrl(series.id, saved.file))
              .then((r) => r.blob())
              .then((blob) => {
                if (cancel) return;
                const url = URL.createObjectURL(blob);
                urls.current.push(url);
                setMedia((prev) => {
                  const clips = [...(prev[id]?.clips ?? [])];
                  while (clips.length <= index) clips.push(null);
                  clips[index] = { url, blob, name: saved.name, duration: saved.duration, from: saved.from };
                  return { ...prev, [id]: { ...prev[id], clips } };
                });
              })
              .catch(() => undefined);
          });
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
  const cacheFiles = (id: string): string[] => {
    if (!state) return [];
    return Object.entries(state.renders)
      .filter(([key, file]) => currentRender(file) && (key === id || key.startsWith(`${id}.v`)))
      .map(([, file]) => file);
  };
  const cachedFormat = (id: string): "mp4" | "webm" | null => {
    const files = cacheFiles(id);
    if (!files.length) return null;
    return files.some((f) => !f.endsWith(".mp4")) ? "webm" : "mp4";
  };
  const cachedDetail = (id: string): string | undefined => {
    const total = state?.media[id]?.voices?.length ?? 0;
    if (total <= 1) return undefined;
    return `${cacheFiles(id).length}/${total}`;
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
      dropSessionPiece(renders.current, piece.id);
    } catch (e) {
      setPieceMedia(piece.id, { error: message(e) });
    }
  }

  async function uploadClip(piece: Piece, file: File, index?: number) {
    if (!file.type.startsWith("video/")) return setPieceMedia(piece.id, { error: "Ese archivo no es un video." });
    const url = URL.createObjectURL(file);
    try {
      const duration = await clipDuration(url);
      urls.current.push(url);
      if (index === undefined) {
        setPieceMedia(piece.id, { clip: { url, blob: file, name: file.name, duration }, error: undefined });
      } else {
        setMedia((prev) => {
          const clips = [...(prev[piece.id]?.clips ?? [])];
          while (clips.length <= index) clips.push(null);
          clips[index] = { url, blob: file, name: file.name, duration, from: 0 };
          return { ...prev, [piece.id]: { ...prev[piece.id], clips, error: undefined } };
        });
      }
      const r = await adsApi.uploadPieceMedia(series.id, piece.id, "clip", file, { name: file.name, duration, ...(index !== undefined && { index }) });
      setState(r.state);
      dropSessionPiece(renders.current, piece.id);
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
      dropSessionPiece(renders.current, piece.id);
    } catch (e) {
      setPieceMedia(piece.id, { loading: false, error: message(e) });
    }
  }

  // Stores one voice file under a variant id. One voice replaces that voice. Several voices add the next id.
  // The session cache follows voiceCachePlan, so the voice that did not change is not rendered again.
  async function storeVoice(piece: Piece, blob: Blob, name: string, vid: string, beforeIds: string[]) {
    const duration = await audioDuration(blob).catch(() => {
      throw new Error("No se pudo leer ese audio. Probá con un .mp3 o un .wav.");
    });
    const file = blob.type ? blob : new Blob([blob], { type: "audio/mpeg" });
    const r = await adsApi.uploadVoice(series.id, piece.id, vid, file, { name, seconds: duration });
    setState(r.state);
    const saved = r.state.media[piece.id];
    const url = URL.createObjectURL(file);
    urls.current.push(url);
    setMedia((prev) => {
      const cur = prev[piece.id] ?? {};
      const voices: VoiceClip[] = (saved?.voices ?? []).flatMap((v) => {
        const local = (cur.voices ?? []).find((x) => x.id === v.id);
        const src = v.id === vid ? { url, blob: file } : local;
        if (!src?.url) return [];
        return [{ id: v.id, url: src.url, blob: src.blob, name: v.name, duration: v.seconds, ...(v.cutOk ? { cutOk: true as const } : {}) }];
      });
      const next: PieceMediaState = { ...cur, voices, voiceSeq: saved?.voiceSeq, voiceLoading: false, error: undefined };
      if (voices.length === 1) next.voice = { url: voices[0].url, blob: voices[0].blob, name: voices[0].name, duration: voices[0].duration };
      else delete next.voice;
      return { ...prev, [piece.id]: next };
    });
    const afterIds = (saved?.voices ?? []).map((v) => v.id);
    applySessionPlan(renders.current, voiceCachePlan(piece.id, beforeIds, afterIds, vid, beforeIds.includes(vid) ? "replace" : "add"));
    return { seq: saved?.voiceSeq ?? 0, count: afterIds.length, ids: afterIds };
  }

  async function uploadVoices(piece: Piece, files: File[]) {
    const errors: string[] = [];
    let seq = state?.media[piece.id]?.voiceSeq ?? 0;
    let count = state?.media[piece.id]?.voices?.length ?? 0;
    let beforeIds = (state?.media[piece.id]?.voices ?? []).map((v) => v.id);
    for (const file of files) {
      const next = nextVoiceId(seq, count);
      if ("error" in next) {
        errors.push(`${file.name}: ${next.error}`);
        continue;
      }
      try {
        const saved = await storeVoice(piece, file, file.name, next.id, beforeIds);
        seq = saved.seq;
        count = saved.count;
        beforeIds = saved.ids;
      } catch (e) {
        errors.push(`${file.name}: ${message(e)}`);
      }
    }
    setPieceMedia(piece.id, { voiceErrors: errors });
  }

  async function replaceVoice(piece: Piece, vid: string, file: File) {
    const beforeIds = (state?.media[piece.id]?.voices ?? []).map((v) => v.id);
    try {
      await storeVoice(piece, file, file.name, vid, beforeIds);
      setPieceMedia(piece.id, { voiceErrors: [] });
    } catch (e) {
      setPieceMedia(piece.id, { voiceErrors: [`${file.name}: ${message(e)}`] });
    }
  }

  async function generateVoice(piece: Piece) {
    const list = state?.media[piece.id]?.voices ?? [];
    const seq = state?.media[piece.id]?.voiceSeq ?? 0;
    let vid = list.length === 1 ? list[0].id : "";
    if (list.length !== 1) {
      const next = nextVoiceId(seq, list.length);
      if ("error" in next) {
        setPieceMedia(piece.id, { error: next.error });
        return;
      }
      vid = next.id;
    }
    setPieceMedia(piece.id, { voiceLoading: true, error: undefined });
    try {
      const blob = await api.speak(piece.text, state?.offer.ttsVoice ?? "", lang);
      await storeVoice(piece, blob, `${piece.id}-voz-generada.mp3`, vid, list.map((v) => v.id));
    } catch (e) {
      setPieceMedia(piece.id, { voiceLoading: false, error: message(e) });
    }
  }

  // Every approved piece without a voice gets one, one after another (the speech API is called once per piece).
  async function generateMissingVoices() {
    if (!state) return;
    const missing = [...state.hooks, ...state.meats, ...state.ctas].filter((p) => p.status === "approved" && !(state.media[p.id]?.voices?.length) && p.text.trim());
    setBusy("voices");
    setError("");
    try {
      for (const [i, p] of missing.entries()) {
        setProgress({ stage: "voices", done: i + 1, total: missing.length, current: `${p.id}: ${p.text.slice(0, 60)}`, errors: [] });
        await generateVoice(p);
      }
    } finally {
      setBusy(null);
    }
  }

  async function renameVoice(piece: Piece, vid: string, name: string) {
    try {
      const r = await adsApi.patchVoice(series.id, piece.id, vid, { name });
      setState(r.state);
      const saved = r.state.media[piece.id]?.voices?.find((v) => v.id === vid);
      if (!saved) return;
      setMedia((prev) => {
        const cur = prev[piece.id];
        if (!cur) return prev;
        const voices = (cur.voices ?? []).map((v) => (v.id === vid ? { ...v, name: saved.name } : v));
        const next: PieceMediaState = { ...cur, voices };
        if (voices.length === 1 && next.voice) next.voice = { ...next.voice, name: saved.name };
        return { ...prev, [piece.id]: next };
      });
    } catch (e) {
      setPieceMedia(piece.id, { error: message(e) });
    }
  }

  async function acceptCut(piece: Piece, vid: string) {
    try {
      const r = await adsApi.patchVoice(series.id, piece.id, vid, { cutOk: true });
      setState(r.state);
      setMedia((prev) => {
        const voices = (prev[piece.id]?.voices ?? []).map((v) => (v.id === vid ? { ...v, cutOk: true } : v));
        return { ...prev, [piece.id]: { ...prev[piece.id], voices } };
      });
    } catch (e) {
      setPieceMedia(piece.id, { error: message(e) });
    }
  }

  async function removeVoice(piece: Piece, vid: string) {
    const before = (state?.media[piece.id]?.voices ?? []).map((v) => v.id);
    try {
      const r = await adsApi.removeVoice(series.id, piece.id, vid);
      setState(r.state);
      const after = (r.state.media[piece.id]?.voices ?? []).map((v) => v.id);
      applySessionPlan(renders.current, voiceCachePlan(piece.id, before, after, vid, "delete"));
      setMedia((prev) => {
        const cur = prev[piece.id] ?? {};
        const gone = (cur.voices ?? []).find((v) => v.id === vid);
        if (gone) URL.revokeObjectURL(gone.url);
        const voices = (cur.voices ?? []).filter((v) => v.id !== vid);
        const next: PieceMediaState = { ...cur, voices, voiceSeq: r.state.media[piece.id]?.voiceSeq };
        if (voices.length === 1) next.voice = { url: voices[0].url, blob: voices[0].blob, name: voices[0].name, duration: voices[0].duration };
        else delete next.voice;
        return { ...prev, [piece.id]: next };
      });
    } catch (e) {
      setPieceMedia(piece.id, { error: message(e) });
    }
  }

  async function removeMedia(piece: Piece, kind: "image" | "clip" | "voice", index?: number) {
    setMedia((prev) => {
      const next = { ...prev[piece.id] };
      if (kind === "clip" && index !== undefined) {
        const clips = [...(next.clips ?? [])];
        clips[index] = null;
        next.clips = clips;
      } else {
        delete next[kind];
      }
      return { ...prev, [piece.id]: next };
    });
    dropSessionPiece(renders.current, piece.id);
    await act("media", () => adsApi.removePieceMedia(series.id, piece.id, kind, index));
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
        if (r) dropSessionPiece(renders.current, piece.id);
      }}
      onRemove={() => confirm(`¿Borrar ${piece.id}?`) && act("remove", () => adsApi.removePiece(series.id, piece.id))}
      onUploadImage={(f) => uploadImage(piece, f)}
      onUploadClip={(f) => uploadClip(piece, f)}
      onUploadClipAt={(index, f) => uploadClip(piece, f, index)}
      onRemoveClipAt={(index) => removeMedia(piece, "clip", index)}
      look={lookPhrase(series.look)}
      onGenerateImage={() => generateImage(piece)}
      onRemoveMedia={(k) => removeMedia(piece, k)}
      onUploadVoices={(files) => void uploadVoices(piece, files)}
      onReplaceVoice={(vid, file) => void replaceVoice(piece, vid, file)}
      onRenameVoice={(vid, name) => void renameVoice(piece, vid, name)}
      onAcceptCut={(vid) => void acceptCut(piece, vid)}
      onRemoveVoice={(vid) => void removeVoice(piece, vid)}
      onConvert={() => void convertPiece(piece)}
      converting={convertingId === piece.id}
      convertDisabled={busy !== null}
      onGenerateVoice={voice.available ? () => generateVoice(piece) : null}
      cached={cachedFormat(piece.id)}
      cachedDetail={cachedDetail(piece.id)}
      flags={flagsFor(piece.id)}
      explainer={state?.media[piece.id]?.clip?.explainer ? { title: state.media[piece.id]!.clip!.explainer!.title, from: state.media[piece.id]!.clip!.from ?? 0 } : undefined}
      onMakeExplainer={
        onToExplainer
          ? () => onToExplainer({ id: piece.id, kind: piece.kind, text: piece.text, onScreenText: piece.onScreenText, seconds: piece.seconds })
          : undefined
      }
      speakerPanel={
        <SpeakerPanel
          key={`${piece.id}-${piece.speaker?.castId ?? ""}`}
          piece={piece}
          series={series}
          tool={tools.find((t) => t.id === toolId)}
          format={settings.format}
          hasClip={Boolean(media[piece.id]?.clip) || Boolean(media[piece.id]?.clips?.some(Boolean))}
          hasVoice={Boolean(media[piece.id]?.voice) || (media[piece.id]?.voices?.length ?? 0) > 0}
          onSave={async (speaker) => {
            const r = await act("patch", () => adsApi.patchPiece(series.id, piece.id, { speaker }));
            if (r) dropSessionPiece(renders.current, piece.id);
          }}
          onMascot={
            onToExplainer && series.mascot
              ? (emotion) => onToExplainer({ id: piece.id, kind: piece.kind, text: piece.text, onScreenText: piece.onScreenText, seconds: piece.seconds, presenter: "mascot", emotion })
              : undefined
          }
        />
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
  const lengthBody = () => ({ seconds: settings.seconds, ...(settings.split ? { split: settings.split } : {}) });
  async function generateHooks(count: number, levels = settings.levels, seconds = settings.seconds, split = settings.split) {
    const r = await act("hooks", () => adsApi.hooks(series.id, { levels, count, seconds, ...(split ? { split } : {}), tool: toolId, language: lang }));
    if (r) setNotes((n) => ({ ...n, hooks: r.note }));
    return r;
  }
  async function generateMeats(count: number, formats: MeatFormat[], levels = settings.levels, seconds = settings.seconds, split = settings.split) {
    const r = await act("meats", () => adsApi.meats(series.id, { levels, formats, count, seconds, ...(split ? { split } : {}), tool: toolId, language: lang }));
    if (r) setNotes((n) => ({ ...n, meats: r.note }));
    return r;
  }
  async function generateCtas(count: number, levels = settings.levels, seconds = settings.seconds, split = settings.split) {
    const r = await act("ctas", () => adsApi.ctas(series.id, { levels, count, seconds, ...(split ? { split } : {}), tool: toolId, language: lang }));
    if (r) setNotes((n) => ({ ...n, ctas: r.note }));
    return r;
  }

  // "Hacer en motion graphics": one explainer project per approved piece of this tab, up to 20. They stay in
  // Proyectos; none of them is opened here. A piece that already has one is skipped. A save that fails removes the
  // empty folder. A later failure keeps the ones already written.
  async function makeMotionBatch(pieces: Piece[]) {
    if (motionLock.current || busy) return;
    const approved = pieces.filter((p) => p.status === "approved");
    if (!approved.length) {
      setError("No hay piezas aprobadas en esta pestaña.");
      return;
    }
    const { MOTION_BATCH_MAX, projectForPiece, seedNotes, starterPiece } = await import("../../../shared/adsFromExplainer.ts");
    let batch = approved;
    if (approved.length > MOTION_BATCH_MAX) {
      if (!confirm(`Son ${approved.length} piezas aprobadas. En un clic armo hasta ${MOTION_BATCH_MAX}. ¿Armo las primeras ${MOTION_BATCH_MAX}? El resto queda para otro clic.`)) return;
      batch = approved.slice(0, MOTION_BATCH_MAX);
    } else if (!confirm(`¿Armar ${approved.length} explicativo${approved.length === 1 ? "" : "s"}, uno por pieza aprobada? Cada uno queda en Proyectos.`)) {
      return;
    }
    motionLock.current = true;
    setError("");
    setBusy("motion");
    const lines: string[] = [];
    try {
      const [{ pieceMarkdown }, { EMPTY_BRIEF }, listed] = await Promise.all([
        import("../../lib/motionMarkdown.ts"),
        import("../../../shared/example.ts"),
        api.projects(),
      ]);
      const known = listed.projects.map((p) => ({ id: p.id, series: p.series }));
      const tone = state?.offer.tone ?? "warm";
      for (const piece of batch) {
        const existing = projectForPiece(known, series.id, piece.id);
        if (existing) {
          lines.push(`${piece.id}: ya hay un explicativo (${existing.id}). No armé otro.`);
          continue;
        }
        const seed: AdSeed = { id: piece.id, kind: piece.kind, text: piece.text, onScreenText: piece.onScreenText, seconds: piece.seconds };
        let id: string | null = null;
        try {
          const motion = starterPiece(seed, settings.format, tone);
          const pieceBrief = {
            ...EMPTY_BRIEF,
            series: series.id,
            format: settings.format,
            piece: "explainer" as const,
            tone,
            tool: toolId || EMPTY_BRIEF.tool,
            product: state?.offer.product ?? "",
            notes: seedNotes(seed),
            narrator: "with" as const,
          };
          id = (await api.createProject(series.id, piece.id.toLowerCase())).id;
          await api.saveProject(id, { version: 1, kind: "motion", step: "motion", pieceBrief, motion }, pieceMarkdown(motion, motion.script?.scenes ?? []));
          known.push({ id, series: series.id });
          lines.push(`${piece.id} → ${id}`);
        } catch (e) {
          if (id) await api.deleteProject(id).catch(() => undefined);
          lines.push(`${piece.id}: no se pudo (${message(e)})`);
        }
      }
      const ok = lines.filter((l) => l.includes("→")).length;
      const left = approved.length - batch.length;
      setMotionMade(
        [`Listos ${ok} explicativos. Abrilos desde Proyectos.`, ...(left > 0 ? [`Quedaron ${left} sin armar: otro clic sigue con las siguientes.`] : []), ...lines].join("\n"),
      );
    } catch (e) {
      setError(message(e));
      if (lines.length) setMotionMade(lines.join("\n"));
    } finally {
      motionLock.current = false;
      setBusy(null);
    }
  }

  // ── "Sin clave": the same requests by copy and paste with claude.ai (shared/adsHandoff.ts) ─────
  const pastedNote = (r: { note: string; part?: number; parts?: number }) =>
    `${r.note ? `${r.note} · ` : ""}respuesta pegada de claude.ai${r.parts && r.parts > 1 ? ` (prompt ${r.part} de ${r.parts})` : ""}`;
  const via = <T,>(ask: Parameters<typeof sendAsk<T>>[0], done: (r: T) => void): Handoff => ({
    prompt: () => askPrompt(ask),
    paste: async (reply) => done(await sendAsk(ask, reply)),
  });
  const body = (count: number, part: number) => ({ levels: settings.levels, count, ...lengthBody(), tool: toolId, language: lang, part });
  const handoffs = demo
    ? {
        hooks: (count: number) => (part: number) =>
          via(adsAsks.hooks(series.id, body(count, part)), (r) => {
            setState(r.state);
            setNotes((n) => ({ ...n, hooks: pastedNote(r) }));
          }),
        meats: (count: number, formats: MeatFormat[]) => (part: number) =>
          via(adsAsks.meats(series.id, { ...body(count, part), formats }), (r) => {
            setState(r.state);
            setNotes((n) => ({ ...n, meats: pastedNote(r) }));
          }),
        ctas: (count: number) => (part: number) =>
          via(adsAsks.ctas(series.id, body(count, part)), (r) => {
            setState(r.state);
            setNotes((n) => ({ ...n, ctas: pastedNote(r) }));
          }),
        clipText: (name: string, transcript: string) => via(adsAsks.clipText(series.id, name, transcript), (r) => setState(r.state)),
        clipSplit: (clipId: string) => via(adsAsks.clipSplit(series.id, clipId), (r) => setState(r.state)),
        review: via(adsAsks.review(series.id), (r) => {
          setFlags(r.flags);
          setReviewNote(pastedNote(r));
        }),
        copies: (combos: AdCombo[], part: number) => via(adsAsks.copies(series.id, combos, part), (r) => setPastedCopies((prev) => ({ ...prev, ...r.copies }))),
      }
    : null;

  // Without a key the wizard does not fill the tabs with samples: it opens each tab with its count, where the
  // copy-and-paste box is.
  async function startWizard(w: Wizard) {
    setSettings((s) => ({ ...s, levels: w.levels, seconds: w.seconds, split: w.split, lengthTouched: true }));
    setWizard(w);
    setTab("hooks");
    if (demo) return setPreset({ hooks: w.hooks, meats: w.meats, ctas: w.ctas });
    await generateHooks(w.hooks, w.levels, w.seconds, w.split);
  }
  async function nextWizard() {
    if (!wizard) return;
    if (wizard.stage === "hooks") {
      setTab("meats");
      setWizard({ ...wizard, stage: "meats" });
      if (demo) return;
      await generateMeats(wizard.meats, [...new Set(levelsOf(wizard.levels).flatMap((l) => LEVEL_INFO[l].meats))], wizard.levels, wizard.seconds, wizard.split);
    } else if (wizard.stage === "meats") {
      setTab("ctas");
      setWizard({ ...wizard, stage: "ctas" });
      if (demo) return;
      await generateCtas(wizard.ctas, wizard.levels, wizard.seconds, wizard.split);
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
  const look = (): PieceLook => ({ format: settings.format, style: { ...series.textStyle, fonts: storyFonts(series.brand), series: series.id }, disclosure: "Imágenes ilustrativas", fullFrame: true, headlines: true });
  // An explainer's clip plays from its in point and carries its own words (nothing drawn on top).
  // A character's clip ("Que lo diga un personaje") plays from the speaker's in point, muted when the piece's own voice
  // says the line instead.
  const shotMedia = (id: string, voiceId?: string): PieceMedia => {
    const saved = state?.media[id]?.clip;
    const speaker = findPieceIn(state, id)?.speaker;
    const locals = media[id]?.voices ?? [];
    const multi = (state?.media[id]?.voices?.length ?? 0) > 1;
    // One voice keeps the old blob (media.voice). Several voices play the chosen variant.
    const voiceBlob = multi && voiceId ? locals.find((v) => v.id === voiceId)?.blob : locals.length === 1 ? locals[0].blob : media[id]?.voice?.blob;
    return {
      image: media[id]?.image,
      clip: media[id]?.clip?.blob,
      voice: voiceBlob,
      clipFrom: saved?.from ?? speaker?.from ?? 0,
      finished: Boolean(saved?.explainer),
      clips: (media[id]?.clips ?? []).map((c) => (c ? { blob: c.blob, from: c.from ?? 0 } : null)),
      ...(speaker && !saved?.explainer && { clipGain: speaker.sound === "voice" ? 0 : 1 }),
    };
  };

  // A piece's render: this session's, the cached file, or a new render saved to the cache.
  // One voice uses the piece id (`H3.l2.mp4`). Several voices use `H3.v2.l2.mp4`.
  async function ensureRender(piece: Piece, current: AdsState, voiceId?: string): Promise<{ blob: Blob; state: AdsState }> {
    const voices = current.media[piece.id]?.voices ?? [];
    const multi = voices.length > 1;
    const vid = multi ? voiceId : undefined;
    if (multi && !vid) throw new Error("Esta pieza tiene varias voces: indicá cuál render es.");
    const variant = vid ? voices.find((v) => v.id === vid) : voices[0];
    if (vid && !variant) throw new Error("Esa voz no existe.");
    if (variant) {
      const block = voiceCutBlock(variant, piece.seconds);
      if (block) throw new Error(block);
    }
    const key = renderKey(piece.id, vid, multi);
    const known = renders.current.get(key);
    if (known) return { blob: known, state: current };
    const saved = current.renders[key];
    // A render from before the pieces were levelled to one loudness is made again.
    if (currentRender(saved)) {
      const blob = await fetch(adsFileUrl(series.id, saved))
        .then((r) => (r.ok ? r.blob() : null))
        .catch(() => null);
      if (blob && blob.size) {
        renders.current.set(key, blob);
        return { blob, state: current };
      }
    }
    const result = await renderPiece(piece, shotMedia(piece.id, vid), look(), () => undefined);
    renders.current.set(key, result.blob);
    const up = await adsApi.uploadRender(series.id, piece.id, result.blob, vid);
    setState(up.state);
    return { blob: result.blob, state: up.state };
  }

  // One ad from its cached pieces, packets copied; if this browser cannot, rendered whole (and so is the rest).
  async function assembleAd(ad: AdCombo, whole: { on: boolean }, errors: string[]): Promise<Blob> {
    const parts = [ad.hookId, ad.meatId, ad.ctaId];
    const voiceOf = [ad.hookVoice, ad.meatVoice, ad.ctaVoice];
    const pieces = parts.map((id) => pieceById.get(id)).filter((p): p is Piece => Boolean(p));
    const cached = renderUnits(ad).map((unit) => renders.current.get(unit));
    if (!whole.on && cached.every((b): b is Blob => Boolean(b))) {
      try {
        return await concatPieces(cached);
      } catch (e) {
        whole.on = true;
        errors.push(`Las piezas no se pudieron unir sin recodificar (${message(e)}); los anuncios se renderizan enteros.`);
      }
    }
    return (await renderAdWhole(pieces, Object.fromEntries(parts.map((id, i) => [id, shotMedia(id, voiceOf[i])])), look(), () => undefined)).blob;
  }

  // "Probar un anuncio": the three pieces (cached or rendered now) cut together, to watch before a batch.
  async function previewAd(hookId: string, meatId: string, ctaId: string, voices?: { hook?: string; meat?: string; cta?: string }): Promise<string | null> {
    if (!state) return null;
    setError("");
    setBusy("preview");
    try {
      let current = state;
      const specs = [
        { id: hookId, voice: voices?.hook },
        { id: meatId, voice: voices?.meat },
        { id: ctaId, voice: voices?.cta },
      ];
      for (const spec of specs) {
        const piece = pieceById.get(spec.id);
        if (!piece) throw new Error(`No existe ${spec.id}.`);
        current = (await ensureRender(piece, current, spec.voice)).state;
      }
      const hook = pieceById.get(hookId);
      const errors: string[] = [];
      const blob = await assembleAd(
        {
          id: adId(hookId, meatId, ctaId, voices),
          hookId,
          meatId,
          ctaId,
          level: hook?.kind === "hook" ? (hook as Hook).level : 1,
          ...(voices?.hook && { hookVoice: voices.hook }),
          ...(voices?.meat && { meatVoice: voices.meat }),
          ...(voices?.cta && { ctaVoice: voices.cta }),
        },
        { on: false },
        errors,
      );
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

  async function convertPiece(piece: Piece) {
    if (!state || busy) return;
    const voices = state.media[piece.id]?.voices ?? [];
    if (!voices.length) return;
    stopRef.current = false;
    setConvertingId(piece.id);
    setBusy("convert");
    setError("");
    const errors: string[] = [];
    const total = voices.length;
    let stoppedAt = 0;
    try {
      let current = state;
      for (let i = 0; i < voices.length; i++) {
        if (stopRef.current) {
          errors.push("Paraste la conversión.");
          break;
        }
        const v = voices[i];
        stoppedAt = i + 1;
        setProgress({ stage: "convert", done: i + 1, total, current: `${piece.id} · ${v.name}`, errors: [...errors] });
        try {
          current = (await ensureRender(piece, current, v.id)).state;
        } catch (e) {
          errors.push(`${v.name}: ${message(e)}`);
          setProgress({ stage: "convert", done: i + 1, total, current: `${piece.id} · ${v.name}`, errors: [...errors] });
        }
      }
      setProgress({ stage: "convert", done: stopRef.current ? stoppedAt : total, total, current: stopRef.current ? "Parado" : "Listo", errors });
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(null);
      setConvertingId(null);
    }
  }
  function clipPresence(piece: Piece): ClipPresence {
    const saved = state?.media[piece.id];
    const local = media[piece.id];
    const explainer = Boolean(saved?.clip?.explainer);
    const n = explainer ? 1 : Math.max(1, grokSequence(piece.seconds).length);
    return {
      id: piece.id,
      seconds: piece.seconds,
      approved: piece.status === "approved",
      explainer,
      clip: Boolean(local?.clip || saved?.clip),
      slots: Array.from({ length: n }, (_, i) => Boolean(local?.clips?.[i] || saved?.clips?.[i])),
    };
  }
  async function runBatch(combos: AdCombo[], mode: "full" | "stage", rules: CombineRules) {
    if (!state) return;
    const pieceIds = [...new Set(combos.flatMap((a) => [a.hookId, a.meatId, a.ctaId]))];
    const holes = emptyClipSlots(pieceIds.flatMap((id) => {
      const piece = pieceById.get(id);
      return piece ? [clipPresence(piece)] : [];
    }));
    if (holes.length) {
      const detail = holes.map((h) => `${h.id}: ${h.clips.map((n) => `clip ${n}`).join(", ")}`).join("\n");
      if (!confirm(`Faltan clips en piezas aprobadas. Esos lugares salen con la imagen de la pieza, o con una tarjeta de color si no hay imagen:\n\n${detail}\n\n¿Seguir con la tanda igual?`)) return;
    }
    setError("");
    setBusy("run");
    stopRef.current = false;
    const errors: string[] = [];
    try {
      const created = await adsApi.createBatch(series.id, {
        seconds: settings.seconds,
        ...(settings.split ? { split: settings.split } : {}),
        mode,
        rules,
        ads: combos,
        ...(Object.keys(pastedCopies).length > 0 && { copies: pastedCopies }),
      });
      setState(created.state);
      // The run took its pasted texts (the server keeps only those still written for the pair's current text).
      const used = new Set(combos.map((a) => copyKey(a.hookId, a.ctaId)));
      setPastedCopies((prev) => Object.fromEntries(Object.entries(prev).filter(([key]) => !used.has(key))));
      const batch = created.batch;
      let current = created.state;
      const units = [...new Set(combos.flatMap((a) => renderUnits(a)))];

      setProgress({ stage: "pieces", done: 0, total: units.length, current: "", errors });
      for (let i = 0; i < units.length; i++) {
        if (stopRef.current) {
          errors.push("Paraste la tanda.");
          break;
        }
        const unit = units[i];
        const id = pieceOfUnit(unit);
        const voiceId = unit === id ? undefined : unit.slice(id.length + 1);
        const piece = pieceById.get(id);
        if (!piece) continue;
        setProgress({ stage: "pieces", done: i + 1, total: units.length, current: `${unit}: ${piece.text.slice(0, 60)}`, errors: [...errors] });
        try {
          current = (await ensureRender(piece, current, voiceId)).state;
        } catch (e) {
          errors.push(`${unit}: ${message(e)}`);
        }
      }

      setProgress({ stage: "ads", done: 0, total: combos.length, current: "", errors });
      const whole = { on: false };
      if (!stopRef.current) {
        for (let i = 0; i < combos.length; i++) {
          if (stopRef.current) {
            errors.push("Paraste la tanda.");
            break;
          }
          const ad = combos[i];
          setProgress({ stage: "ads", done: i + 1, total: combos.length, current: ad.id, errors: [...errors] });
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
  const missingVoices = approvedPieces.filter((p) => !(state.media[p.id]?.voices?.length) && p.text.trim()).length;
  const webmCount = approvedPieces.filter((p) => cachedFormat(p.id) === "webm").length;
  const counts = {
    hooks: state.hooks.length,
    hooksApproved: state.hooks.filter((h) => h.status === "approved").length,
    meats: state.meats.length,
    meatsApproved: state.meats.filter((m) => m.status === "approved").length,
    ctas: state.ctas.length,
    ctasApproved: state.ctas.filter((c) => c.status === "approved").length,
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-white p-3 text-sm">
        <span className="font-semibold">{series.name}</span>
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
                <Spinner /> Voz {progress.done}/{progress.total}
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

      <div className="rounded-xl border border-line bg-white p-3">
        <p className="mb-2 text-sm font-semibold">Duración del anuncio</p>
        <AdLength
          seconds={settings.seconds}
          split={settings.split}
          levels={settings.levels}
          onChange={(next) => setSettings({ ...settings, ...next, lengthTouched: true })}
        />
      </div>
      {motionMade && (
        <Notice tone="info">
          <span className="whitespace-pre-line">{motionMade}</span>
        </Notice>
      )}

      <BatchWizard wizard={wizard} defaults={{ levels: settings.levels, seconds: settings.seconds, split: settings.split, lengthTouched: settings.lengthTouched }} counts={counts} busy={busy !== null} onStart={startWizard} onNext={nextWizard} onStop={() => setWizard(null)} />

      {progress && (
        <div className="rounded-xl border border-line bg-white p-4 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold">
              {STAGE_LABEL[progress.stage]} · {progress.done} de {progress.total}
            </p>
            {(busy === "convert" || busy === "run") && (
              <Button
                variant="ghost"
                className="ml-auto px-2 py-1 text-xs"
                onClick={() => {
                  stopRef.current = true;
                }}
              >
                Parar
              </Button>
            )}
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded bg-paper">
            <div className="h-full bg-ink transition-all" style={{ width: `${progress.total ? (100 * progress.done) / progress.total : 0}%` }} />
          </div>
          <p className="mt-1 font-mono text-xs text-muted">{progress.current}</p>
          {progress.errors.map((e, i) => (
            <p key={i} className="mt-1 text-xs text-neg">
              {e}
            </p>
          ))}
        </div>
      )}

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
            await act("hook", () => adsApi.organicHook(series.id, clip.hook, clip.level, settings.seconds, `De “${clip.name}”`, settings.split ?? undefined));
            setTab("hooks");
          }}
          onOpenOffer={() => setTab("offer")}
          clipHandoff={handoffs?.clipText ?? null}
          splitHandoff={handoffs?.clipSplit ?? null}
        />
      )}
      {tab === "hooks" && (
        <HooksPanel
          hooks={state.hooks}
          levels={settings.levels}
          seconds={settings.seconds}
          split={settings.split}
          busy={busy === "hooks"}
          demo={demo}
          note={notes.hooks ?? ""}
          onLevels={(levels) => setSettings({ ...settings, levels })}
          onGenerate={async (count) => {
            await generateHooks(count);
          }}
          onStatus={setStatus}
          renderCard={(h: Hook) => renderCard(h)}
          extra={<SpeakerBatch pieces={state.hooks} series={series} format={settings.format} label="hooks" />}
          onMotionBatch={onToExplainer ? () => void makeMotionBatch(state.hooks) : undefined}
          motionBusy={busy === "motion"}
          handoff={handoffs?.hooks ?? null}
          presetCount={preset.hooks}
          walkKey={series.id}
        />
      )}
      {tab === "meats" && (
        <PiecesPanel<Meat>
          kind="meat"
          pieces={state.meats}
          hooks={state.hooks}
          levels={settings.levels}
          seconds={settings.seconds}
          split={settings.split}
          busy={busy === "meats"}
          demo={demo}
          note={notes.meats ?? ""}
          onLevels={(levels) => setSettings({ ...settings, levels })}
          onGenerate={async (count, formats) => {
            await generateMeats(count, formats);
          }}
          renderCard={(m) => renderCard(m)}
          extra={<SpeakerBatch pieces={state.meats} series={series} format={settings.format} label="meats" />}
          onMotionBatch={onToExplainer ? () => void makeMotionBatch(state.meats) : undefined}
          motionBusy={busy === "motion"}
          handoff={handoffs?.meats ?? null}
          presetCount={preset.meats}
          walkKey={series.id}
        />
      )}
      {tab === "ctas" && (
        <PiecesPanel<Cta>
          kind="cta"
          pieces={state.ctas}
          hooks={state.hooks}
          levels={settings.levels}
          seconds={settings.seconds}
          split={settings.split}
          busy={busy === "ctas"}
          demo={demo}
          note={notes.ctas ?? ""}
          onLevels={(levels) => setSettings({ ...settings, levels })}
          onGenerate={async (count) => {
            await generateCtas(count);
          }}
          renderCard={(c) => renderCard(c)}
          extra={<SpeakerBatch pieces={state.ctas} series={series} format={settings.format} label="ctas" />}
          onMotionBatch={onToExplainer ? () => void makeMotionBatch(state.ctas) : undefined}
          motionBusy={busy === "motion"}
          handoff={handoffs?.ctas ?? null}
          presetCount={preset.ctas}
          walkKey={series.id}
        />
      )}
      {tab === "combine" && (
        <CombinePanel
          series={series.id}
          state={state}
          seconds={settings.seconds}
          split={settings.split}
          folder={folder}
          busy={busy}
          flags={flags}
          onPreview={previewAd}
          webm={webmCount}
          onDropWebm={async () => {
            for (const p of approvedPieces.filter((x) => cachedFormat(x.id) === "webm")) {
              dropSessionPiece(renders.current, p.id);
              await act("drop", () => adsApi.dropRender(series.id, p.id));
            }
          }}
          reviewNote={reviewNote}
          onReview={review}
          onRun={runBatch}
          onWeeklyLimit={async (n) => {
            await act("settings", () => adsApi.saveSettings(series.id, n));
          }}
          onRemoveBatch={async (id) => {
            await act("batch", () => adsApi.removeBatch(series.id, id));
          }}
          onBatchCsv={async (id) => (await adsApi.batchCsv(series.id, id)).csv}
          reviewHandoff={handoffs?.review ?? null}
          copiesVia={handoffs?.copies ?? null}
          walkKey={series.id}
          pastedCopies={pastedCopies}
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
