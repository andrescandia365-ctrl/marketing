// Step 5 of a story piece, Producción: the prompts to copy, the pictures and clips of each shot (generated or uploaded),
// the voices, the narration in one file, the setups fixed into the series' cast and the video. The media and the
// autosave live in useProject; this view holds what only production does with them.
import { lazy, type Dispatch, type SetStateAction } from "react";
import { lineEmotion, withClipMusic, type AudioSettings, type CharacterVoice, type VoiceMode } from "../../shared/audio.ts";
import { buildCopyPrompt, lookPhrase } from "../../shared/prompt.ts";
import type { Board, Brief, SeriesInfo, Setup, Shot, Status, Story, ToolInfo } from "../../shared/schema.ts";
import { DEFAULT_TEXT_STYLE, castRef, hasLook, seriesId, type CastMember, type TextStyle } from "../../shared/series.ts";
import { BEAT_INFO, formatTime, timeShots } from "../../shared/template.ts";
import { generatesImage, shotFrames, type FrameSource } from "../../shared/transformScreen.ts";
import { propagateSetupIdentity, undoSetupIdentity, type SetupIdentityEdit } from "../../shared/setupEdit.ts";
import { VoicesPanel } from "./Audio.tsx";
import { NarrationImport } from "./NarrationImport.tsx";
import { ProductPanel } from "./ProductPanel.tsx";
import { CopyButton, DirectionLog, ScriptView, StoryNotes, Timeline, type LibraryEntry } from "./ScriptView.tsx";
import { SetupsPanel, type SetupIdentityResult } from "./SetupsPanel.tsx";
import { Button, Lazy, Notice, PieceTitle, Spinner } from "./ui.tsx";
import { api, askPrompt, asks } from "../lib/api.ts";
import { download, pieceToMarkdown, slug, type LogEntry } from "../lib/markdown.ts";
import type { ShotMedia } from "../lib/render.ts";
import type { ProjectFiles } from "../useProject.ts";
import { storyFonts } from "../../shared/brandFonts.ts";

const VideoPanel = lazy(() => import("./VideoPanel.tsx").then((m) => ({ default: m.VideoPanel })));

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

type Props = {
  pieceBrief: Brief;
  story: Story;
  board: Board;
  status: Status | null;
  setStatus: Dispatch<SetStateAction<Status | null>>;
  pieceSeries: SeriesInfo | undefined;
  pieceTool: ToolInfo | undefined;
  toolName: string;
  library: Record<string, LibraryEntry>;
  libraryVersion: number;
  setLibraryVersion: Dispatch<SetStateAction<number>>;
  log: LogEntry[];
  addLog: (entry: Omit<LogEntry, "at">) => void;
  audio: AudioSettings;
  setAudio: Dispatch<SetStateAction<AudioSettings>>;
  // The image generator picked for "Generar todas".
  provider: string;
  setProvider: (id: string) => void;
  project: ProjectFiles;
  // What the video plays per shot, and how each shot's line is heard.
  renderMedia: Record<number, ShotMedia>;
  modes: VoiceMode[];
  setBoard: Dispatch<SetStateAction<Board | null>>;
  // The last setup description carried into the shots, kept to undo it.
  setupUndo: { edit: SetupIdentityEdit; member: CastMember | null } | null;
  setSetupUndo: (undo: { edit: SetupIdentityEdit; member: CastMember | null } | null) => void;
  setError: (error: string) => void;
  reviewMedia: (index: number, what: "image" | "clip", source: string | Blob) => void;
  // "Enviar a Publicidad": the story's hook title, once sent.
  sent: string;
  sendToAds: () => void;
};

export function ProductionView({
  pieceBrief,
  story,
  board,
  status,
  setStatus,
  pieceSeries,
  pieceTool,
  toolName,
  library,
  libraryVersion,
  setLibraryVersion,
  log,
  addLog,
  audio,
  setAudio,
  provider,
  setProvider,
  project,
  renderMedia,
  modes,
  setBoard,
  setupUndo,
  setSetupUndo,
  setError,
  reviewMedia,
  sent,
  sendToAds,
}: Props) {
  const { media, music, sketchUploads, projectId, setShotMedia, keep, uploadImage, uploadClip, removeMedia, addAudio, addMusic, removeMusic, keepVideo } = project;
  async function generateImage(index: number) {
    if (!board) return;
    const shot = board.shots[index];
    // A real screen (a screen shot, or a transform that starts on one) is the cast's screenshot, never generated.
    if (!generatesImage(shot)) return;
    setShotMedia(index, { loading: true, error: undefined });
    try {
      const { dataUrl } = await api.image(provider, shot.visualPrompt, board.style, pieceBrief.format, shot.beat, lookPhrase(pieceSeries?.look));
      setShotMedia(index, { image: dataUrl, loading: false });
      const blob = await (await fetch(dataUrl)).blob();
      await keep(index, (id) => api.uploadMedia(id, index, "image", blob));
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

  async function generateVoice(index: number) {
    const shot = board?.shots[index];
    if (!shot) return;
    const own = audio.characters[shot.speaker];
    // Said with its story line's emotion.
    const emotion = lineEmotion(story, shot.voiceover);
    const blob = await api.speak(shot.voiceover, own?.ttsVoice ?? "", pieceBrief.language, emotion);
    await addAudio(index, "voice", blob, `toma-${index + 1}-voz-generada.mp3`);
  }

  function setVoiceMode(index: number, mode: VoiceMode) {
    setAudio((a) => ({ ...a, shots: { ...a.shots, [index]: mode } }));
  }

  function setCharacterVoice(id: string, voice: CharacterVoice) {
    setAudio((a) => ({ ...a, characters: { ...a.characters, [id]: voice } }));
  }

  // `reply`: the answer pasted from claude.ai ("Sin clave"); its error shows under its own box.
  async function rewriteShot(index: number, note: string, reply?: string): Promise<boolean> {
    if (!story || !board) return false;
    try {
      const result = await api.rewriteShot(pieceBrief, story, board, index, note, reply);
      setBoard((b) => (b ? { ...b, shots: b.shots.map((old, i) => (i === index ? result.shot : old)) } : b));
      addLog({
        shot: index,
        text: `“${note}”`,
        outcome: result.demo ? "modo de muestra: sin cambios (falta la clave de la IA)" : result.pasted ? "toma reescrita · respuesta pegada de claude.ai" : "toma reescrita",
      });
      return true;
    } catch (e) {
      if (reply !== undefined) throw e;
      addLog({ shot: index, text: `“${note}”`, outcome: `no se pudo: ${message(e)}` });
      return false;
    }
  }

  function updateShot(index: number, shot: Shot) {
    setBoard((b) => (b ? { ...b, shots: b.shots.map((old, i) => (i === index ? shot : old)) } : b));
  }

  // Fixes a setup into the series' cast: creates the cast member if the setup has none, links the setup to it
  // and, when an image is given, makes it the approved image.
  async function fixSetup(setup: Setup, kind: CastMember["kind"], image: Blob | null) {
    const seriesKey = pieceBrief.series;
    const cast = pieceSeries?.cast ?? [];
    let castId = setup.castId;
    if (!castId || !cast.some((m) => m.id === castId)) {
      const base = seriesId(setup.name);
      castId = base;
      for (let n = 2; cast.some((m) => m.id === castId); n++) castId = `${base}-${n}`;
      let ref = castRef(setup.name);
      const taken = new Set(cast.map((m) => m.ref.toLowerCase()));
      for (let n = 2; taken.has(ref.toLowerCase()); n++) ref = `${castRef(setup.name)}${n}`;
      const { series } = await api.upsertCast(seriesKey, {
        id: castId,
        name: setup.name.slice(0, 60),
        ref,
        kind,
        identity: setup.identity,
        note: "",
        image: "",
        sheet: "",
        puppet: { layers: [] },
        rig: { file: "", clips: { idle: "", walk: "", turnL: "", turnR: "", point: "" } },
        refs: [],
        views: [],
      });
      setStatus((s) => (s ? { ...s, series } : s));
      const linked = castId;
      setBoard((b) => (b ? { ...b, setups: b.setups.map((x) => (x.id === setup.id ? { ...x, castId: linked } : x)) } : b));
      addLog({ text: `Setup ${setup.name} guardado en el elenco fijo de la serie` });
    }
    if (image) {
      const { series } = await api.uploadCastImage(seriesKey, castId, image);
      setStatus((s) => (s ? { ...s, series } : s));
      setLibraryVersion((v) => v + 1);
      addLog({ text: `Imagen fija de ${setup.name} actualizada` });
    }
  }

  // "Hoja de personaje" from a setup: the member keeps everything and takes the sheet's prompt and its loose views.
  async function saveCastSheet(member: CastMember) {
    const { url: _url, ...clean } = member as LibraryEntry;
    const { series } = await api.upsertCast(pieceBrief.series, clean);
    setStatus((s) => (s ? { ...s, series } : s));
    addLog({ text: `Hoja de ${member.name} guardada en el elenco (${member.views.length} vistas sueltas)` });
  }

  // Changes a setup's description in every shot that writes it, and in the series' cast when asked.
  // The last change can be undone (its prompts, and the cast member's line if it was saved there).
  async function editSetupIdentity(setup: Setup, identity: string, toSeries: boolean): Promise<SetupIdentityResult> {
    if (!board) throw new Error("No hay storyboard.");
    const result = propagateSetupIdentity(board, setup.id, identity);
    if (!result) return { changed: [], missing: [] };
    const member = toSeries && setup.castId ? pieceSeries?.cast.find((m) => m.id === setup.castId) : undefined;
    if (member) {
      const { series } = await api.upsertCast(pieceBrief.series, { ...member, identity: result.edit.after });
      setStatus((s) => (s ? { ...s, series } : s));
    }
    setBoard(result.board);
    setSetupUndo({ edit: result.edit, member: member ?? null });
    const { changed, missing } = result.edit;
    addLog({
      text: `Descripción de ${setup.name}: “${result.edit.after}”`,
      outcome:
        (changed.length ? `cambiada en las tomas ${changed.map((i) => i + 1).join(", ")}` : "no estaba escrita en ninguna toma") +
        (missing.length ? `; revisar a mano las tomas ${missing.map((i) => i + 1).join(", ")}` : "") +
        (member ? `; guardada en el elenco de ${pieceSeries?.name ?? "la serie"}` : ""),
    });
    return { changed, missing };
  }

  async function undoSetupEdit(): Promise<number[]> {
    if (!board || !setupUndo) return [];
    const { edit, member } = setupUndo;
    const { board: back, kept } = undoSetupIdentity(board, edit);
    const current = member ? pieceSeries?.cast.find((m) => m.id === member.id) : undefined;
    // The series line goes back only while it is still the one this change wrote.
    if (member && current && current.identity === edit.after) {
      const { series } = await api.upsertCast(pieceBrief.series, { ...current, identity: member.identity });
      setStatus((s) => (s ? { ...s, series } : s));
    }
    setBoard(back);
    setSetupUndo(null);
    const name = back.setups.find((x) => x.id === edit.setupId)?.name ?? edit.setupId;
    addLog({
      text: `Deshecho el cambio de descripción de ${name}`,
      outcome: kept.length ? `las tomas ${kept.map((i) => i + 1).join(", ")} quedan como las editaste después` : "todo como antes",
    });
    return kept;
  }

  async function saveStyle(style: TextStyle) {
    const { series } = await api.saveSeriesStyle(pieceBrief.series, style);
    setStatus((s) => (s ? { ...s, series } : s));
  }

  // A transform's end can be a real screen from the cast: it is used as it is, never generated.
  const frameCopy = (f: FrameSource) =>
    f.from === "screen" ? `(Pantalla real: ${library[f.screen]?.name ?? f.screen}, no se genera)` : buildCopyPrompt(f.prompt, pieceBrief.format);
  const allPrompts = (kind: "image" | "video") =>
    board
      ? timeShots(board.shots)
          .map(
            (s) =>
              `Toma ${s.index + 1} · ${s.title} · ${formatTime(s.start)}–${formatTime(s.end)} · ${BEAT_INFO[s.beat].label} · ${s.toolSettings}\n` +
              (kind === "video"
                ? s.videoPrompt
                : s.kind === "screen"
                  ? `(Pantalla real: ${library[s.screen]?.name ?? s.screen}, no se genera)`
                  : s.kind === "transform"
                    ? [
                        `Inicial: ${frameCopy(shotFrames(s).start)}`,
                        s.middlePrompt && `Intermedia: ${buildCopyPrompt(s.middlePrompt, pieceBrief.format)}`,
                        `Final: ${frameCopy(shotFrames(s).end!)}`,
                      ]
                        .filter(Boolean)
                        .join("\n")
                    : buildCopyPrompt(s.visualPrompt, pieceBrief.format)),
          )
          .join("\n\n")
      : "";

  const spoken = modes.map((m, i) => (m === "grok" ? true : m !== "subtitles" && Boolean(renderMedia[i]?.voice)));
  const generating = Object.values(media).some((m) => m.loading);

  return (
    <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-4">
        <div>
          <p className="font-mono text-xs text-muted">{pieceSeries?.name ?? ""}</p>
          <PieceTitle problem={story.problem} title={story.title} />
          <p className="text-sm text-muted">{story.logline}</p>
        </div>
        <Timeline board={board} />
        {pieceSeries?.type === "ecommerce" && (
          <ProductPanel
            toolName={toolName}
            setups={board.setups}
            products={Object.values(library).filter((m) => m.kind === "product")}
            onWrite={async () => {
              setError("");
              try {
                return await api.productShot(pieceBrief);
              } catch (e) {
                setError(message(e));
                return null;
              }
            }}
            onSave={async (setup, image) => {
              await fixSetup(setup, "product", image);
              addLog({ text: `Producto recortado: ${setup.name}` });
            }}
          />
        )}

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
                  new Blob(
                    [
                      pieceToMarkdown(
                        pieceBrief,
                        story,
                        board,
                        toolName,
                        log,
                        audio,
                        projectId ? { uploaded: sketchUploads, folder: projectId } : undefined,
                      ),
                    ],
                    { type: "text/markdown" },
                  ),
                  `${slug(story.problem || story.title)}.md`,
                )
              }
            >
              Descargar todo .md
            </Button>
          </div>
        </div>

        <Notice tone="warn">
          <b>En {toolName}, cada vez:</b> elegí el largo del clip (6, 10 o 15 s) y la forma en sus propios
          controles; el prompt solo lo recuerda. Primero la imagen, después animala.
        </Notice>

        <NarrationImport
          lines={board.shots.flatMap((s, i) =>
            s.voiceover.trim()
              ? [
                  {
                    key: String(i),
                    label: `Toma ${i + 1}`,
                    speaker: story.characters.find((c) => c.id === s.speaker)?.name ?? s.speaker,
                    text: s.voiceover,
                    // The story line's emotion (a continuous take: its first spoken beat's).
                    emotion:
                      story.topics.flatMap((t) => t.lines).find((l) => l.text.trim() === s.voiceover.trim())?.emotion ??
                      s.timeline?.find((b) => b.line.trim())?.emotion ??
                      "",
                  },
                ]
              : [],
          )}
          narratorKeys={board.shots.flatMap((s, i) =>
            story.characters.find((c) => c.id === s.speaker)?.role === "narrator" && s.voiceover.trim() ? [String(i)] : [],
          )}
          language={pieceBrief.language}
          autoSync={status?.lyrics.autoSync ?? false}
          room={Object.fromEntries(board.shots.map((s, i) => [String(i), s.seconds]))}
          onParts={async (parts) => {
            for (const p of parts) {
              const i = Number(p.key);
              await addAudio(i, "voice", p.blob, `toma-${i + 1}-narracion.wav`);
              setVoiceMode(i, "recorded");
            }
            addLog({ text: `Narración en un archivo: ${parts.length} partes repartidas en sus tomas.` });
          }}
        />

        <ScriptView
          brief={pieceBrief}
          story={story}
          board={board}
          media={media}
          toolName={toolName}
          maxRefs={pieceTool?.maxRefs ?? null}
          onShotChange={updateShot}
          onGenerate={generateImage}
          onUploadImage={uploadImage}
          onUploadClip={uploadClip}
          onRemoveMedia={removeMedia}
          onRewrite={(index, note) => rewriteShot(index, note)}
          rewriteHandoff={
            status && !status.writer
              ? (index, note) => ({
                  prompt: () => askPrompt(asks.rewriteShot(pieceBrief, story, board, index, note)),
                  paste: (reply) => rewriteShot(index, note, reply),
                })
              : null
          }
          strictLook={pieceSeries ? hasLook(pieceSeries.look) : false}
          onSegment={async (index, note) => {
            const result = await api.segmentEdit(pieceBrief, board.shots[index], note);
            addLog({ shot: index, text: `Segmento: “${note}”`, outcome: result.select });
            return result;
          }}
          onReview={
            status?.writer
              ? (index) => {
                  const m = media[index];
                  const source = m?.clip?.blob ?? m?.image;
                  if (source) reviewMedia(index, m?.clip ? "clip" : "image", source);
                }
              : null
          }
          library={library}
          voice={{
            language: pieceBrief.language,
            emotionOf: (line: string) => lineEmotion(story, line),
            audio,
            voiceAvailable: status?.voice.available ?? false,
            onMode: setVoiceMode,
            onVoice: (i, blob, name) => addAudio(i, "voice", blob, name),
            onGenerate: generateVoice,
            onRemove: (i, kind) => removeMedia(i, kind),
            onSfx: (i, blob, name) => addAudio(i, "sfx", blob, name),
            onClipSound: (i, sound) => setAudio((a) => ({ ...a, clipSound: { ...a.clipSound, [i]: sound } })),
            onClipLevel: (i, level) => setAudio((a) => ({ ...a, clipLevel: { ...a.clipLevel, [i]: level } })),
            onClipMusicOk: (i) => {
              setAudio((a) => withClipMusic(a, i, "ok"));
              addLog({ shot: i, text: "El clip queda con su sonido: tiene licencia o no es música" });
            },
            onSeconds: (i, seconds) => {
              const shot = board.shots[i];
              updateShot(i, { ...shot, seconds, toolSettings: shot.toolSettings.replace(/\d+(\.\d+)?\s*s\b/, `${seconds} s`) });
            },
          }}
        />
      </div>
      <aside className="space-y-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:self-start lg:overflow-y-auto">
        <Lazy>
        <VideoPanel
          brief={pieceBrief}
          story={story}
          board={board}
          media={renderMedia}
          watermarked={pieceBrief.tool === "grok-imagine"}
          seriesName={pieceSeries?.name ?? ""}
          seriesStyle={pieceSeries?.textStyle ?? DEFAULT_TEXT_STYLE}
          brandFonts={pieceSeries ? { ...storyFonts(pieceSeries.brand), series: pieceSeries.id } : undefined}
          ownFonts={[...new Set((pieceSeries?.brand.fonts ?? []).map((f) => f.family))]}
          onSaveStyle={saveStyle}
          onRendered={keepVideo}
          audio={audio}
          onAudio={(patch) => setAudio((a) => ({ ...a, ...patch }))}
          spoken={spoken}
          music={music}
          onMusic={addMusic}
          onRemoveMusic={removeMusic}
        />
        </Lazy>
        <VoicesPanel
          characters={story.characters}
          audio={audio}
          defaultTtsVoice={status?.voice.defaultVoice ?? ""}
          onChange={setCharacterVoice}
        />
        <SetupsPanel
          board={board}
          media={media}
          toolName={toolName}
          seriesName={pieceSeries?.name ?? ""}
          library={library}
          onFix={fixSetup}
          onIdentity={editSetupIdentity}
          undoSetupId={setupUndo?.edit.setupId ?? ""}
          onUndoIdentity={undoSetupEdit}
          seriesId={pieceSeries?.id}
          cast={pieceSeries?.cast ?? []}
          maxRefs={pieceTool?.maxRefs ?? null}
          libraryVersion={libraryVersion}
          onSaveMember={saveCastSheet}
          onSeries={(series) => {
            setStatus((s) => (s ? { ...s, series } : s));
            setLibraryVersion((v) => v + 1);
          }}
        />
        <Button variant="ghost" className="w-full" onClick={sendToAds} disabled={sent === story.title}>
          {sent === story.title ? "Enviado a Publicidad ✓" : "Enviar a Publicidad (hook)"}
        </Button>
        <DirectionLog log={log} />
        <StoryNotes story={story} />
      </aside>
    </section>
  );
}
