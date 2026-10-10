// The open story piece's project folder: its id and save state, the autosave (project.json and pieza.md, plus the app's
// sketches as boceto-app-NN.png), and the media of each shot and the music, read back when a piece opens and sent to
// the folder as they are added. Lyric videos and explainers save themselves (their studios), so both effects pause.
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { withClipMusic, type AudioSettings } from "../shared/audio.ts";
import { SKETCH_BASE } from "../shared/prompt.ts";
import type { Board, Brief } from "../shared/schema.ts";
import { audioDuration, type AudioFile } from "./components/Audio.tsx";
import type { ClipFile, MediaState } from "./components/ScriptView.tsx";
import { api, projectFileUrl, type ProjectData } from "./lib/api.ts";
import { blobToDataUrl, readImageFile } from "./lib/files.ts";
import type { LogEntry } from "./lib/markdown.ts";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

type ProjectOptions = {
  // The lyric video and the explainer open now, if any: while one is open, this autosave and the sketches stop.
  studios: unknown[];
  // What the autosave writes (read when the timer fires) and the values that make it save again.
  snapshot: (sketchUploads: Record<number, string | undefined>) => { state: Record<string, unknown>; markdown?: string };
  saveDeps: unknown[];
  // The app's sketches: the storyboard, its format and the kinds of the series' cast by id (as JSON).
  board: Board | null;
  format: Brief["format"];
  castKindsKey: string;
  projectsDir: string;
  addLog: (entry: Omit<LogEntry, "at">) => void;
  setError: (error: string) => void;
  setAudio: Dispatch<SetStateAction<AudioSettings>>;
  // Checks an uploaded picture or clip against its shot.
  review: (index: number, what: "image" | "clip", source: string | Blob) => void;
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

export function useProject(o: ProjectOptions) {
  const { board, addLog, setError, setAudio } = o;
  const paused = o.studios.some(Boolean);
  // The project folder this piece autosaves into.
  const [projectId, setProjectId] = useState<string | null>(null);
  const [media, setMedia] = useState<Record<number, MediaState>>({});
  // The clip each shot's music check is listening to, so a replaced clip's late answer is dropped.
  const musicChecks = useRef<Record<number, Blob>>({});
  const [music, setMusic] = useState<AudioFile | null>(null);
  const clipUrls = useRef<string[]>([]);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const unsaved = useRef(false);
  const uploads = useRef(0);
  const saveSeq = useRef(0);
  // Which app sketches (boceto-app-NN.png) this session already wrote, by shot: the key of what each was drawn from.
  const sketchWritten = useRef<{ project?: string; keys: Record<number, string>; count?: number }>({ keys: {} });

  useEffect(() => () => clipUrls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  // Warn before closing the tab while a save or an upload is still on its way.
  useEffect(() => {
    const onLeave = (e: BeforeUnloadEvent) => {
      if (unsaved.current || uploads.current > 0) e.preventDefault();
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, []);

  // The sketches the person uploaded, by shot, as files in the project folder (pieza.md links them).
  const sketchUploads: Record<number, string | undefined> = Object.fromEntries(
    (board?.shots ?? []).map((_, i) => [i, media[SKETCH_BASE + i]?.imageFile]),
  );
  const sketchKey = JSON.stringify(sketchUploads);

  // Autosave: a short pause after any change writes the state (and pieza.md) into the project folder.
  useEffect(() => {
    // Lyric videos and explainers save themselves.
    if (!projectId || paused) return;
    unsaved.current = true;
    setSaveStatus("saving");
    const seq = ++saveSeq.current;
    const timer = setTimeout(async () => {
      const { state, markdown } = o.snapshot(sketchUploads);
      try {
        await api.saveProject(projectId, state, markdown);
        if (seq === saveSeq.current) {
          unsaved.current = false;
          setSaveStatus("saved");
        }
      } catch (e) {
        if (seq === saveSeq.current) {
          setSaveStatus("error");
          setError(`No se pudo guardar el proyecto: ${message(e)}`);
        }
      }
    }, 800);
    return () => clearTimeout(timer);
    // The snapshot's values are in saveDeps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, ...o.studios, ...o.saveDeps, sketchKey]);

  // The app's pencil sketch of every shot without an uploaded one goes into the folder as boceto-app-NN.png, for
  // pieza.md. Drawn again only when what the sketch reads changes; sketches of shots that are gone are removed.
  useEffect(() => {
    if (!projectId || paused || !board) return;
    let alive = true;
    const timer = setTimeout(async () => {
      try {
        const { sketchJobs, sketchPng } = await import("./lib/sketchFiles.ts");
        await document.fonts?.ready;
        const written = sketchWritten.current;
        if (written.project !== projectId) {
          written.project = projectId;
          written.keys = {};
          written.count = undefined;
        }
        for (const job of sketchJobs(board, JSON.parse(o.castKindsKey), o.format, sketchUploads)) {
          if (!alive) return;
          if (written.project !== projectId || written.keys[job.index] === job.key) continue;
          await api.saveAppSketch(projectId, job.index, await sketchPng(job, o.format));
          written.keys[job.index] = job.key;
        }
        if (alive && written.count !== board.shots.length) {
          await api.pruneAppSketches(projectId, board.shots.length);
          written.count = board.shots.length;
        }
      } catch {
        // Only pieza.md misses a picture; the next change tries again.
      }
    }, 1500);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, ...o.studios, board, o.format, o.castKindsKey, sketchKey]);

  function setShotMedia(index: number, patch: Partial<MediaState>) {
    setMedia((prev) => ({ ...prev, [index]: { ...prev[index], ...patch } }));
  }

  // Sends a file to the project folder; the shot shows an error if it could not be saved.
  async function keep(index: number, work: (id: string) => Promise<unknown>) {
    if (!projectId) return;
    uploads.current++;
    try {
      await work(projectId);
    } catch (e) {
      setShotMedia(index, { error: `No se guardó en el proyecto: ${message(e)}` });
    } finally {
      uploads.current--;
    }
  }

  // A new piece starts with no media and no music.
  function clearMedia() {
    clipUrls.current.forEach((u) => URL.revokeObjectURL(u));
    clipUrls.current = [];
    setMedia({});
    musicChecks.current = {};
    setMusic(null);
  }

  // Images and clips come back from the folder.
  function loadMedia(id: string, project: ProjectData) {
    for (const [key, record] of Object.entries(project.media)) {
      const index = Number(key);
      if (record.image) {
        fetch(projectFileUrl(id, record.image))
          .then((r) => r.blob())
          .then(blobToDataUrl)
          .then((image) => setShotMedia(index, { image, imageFile: record.image }))
          .catch(() => setShotMedia(index, { error: "No se pudo leer la imagen guardada." }));
      }
      for (const kind of ["clip", "voice", "sfx"] as const) {
        const saved = record[kind];
        if (!saved) continue;
        fetch(projectFileUrl(id, saved.file))
          .then((r) => r.blob())
          .then((blob) => {
            const url = URL.createObjectURL(blob);
            clipUrls.current.push(url);
            setShotMedia(index, { [kind]: { url, blob, name: saved.name, duration: saved.duration } });
          })
          .catch(() => setShotMedia(index, { error: "No se pudo leer un archivo guardado de esta toma." }));
      }
    }
    if (project.music) {
      const { file, name, duration } = project.music;
      fetch(projectFileUrl(id, file))
        .then((r) => r.blob())
        .then((blob) => {
          const url = URL.createObjectURL(blob);
          clipUrls.current.push(url);
          setMusic({ url, blob, name, duration });
        })
        .catch(() => setError("No se pudo leer la música guardada."));
    }
  }

  async function uploadImage(index: number, file: File) {
    try {
      const image = await readImageFile(file);
      setShotMedia(index, { image, error: undefined });
      addLog({ shot: index, text: `Imagen subida: ${file.name}` });
      o.review(index, "image", image);
      await keep(index, (id) => api.uploadMedia(id, index, "image", file));
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
      o.review(index, "clip", file);
      checkClipMusic(index, file);
      await keep(index, (id) => api.uploadMedia(id, index, "clip", file, { name: file.name, duration }));
    } catch (e) {
      URL.revokeObjectURL(url);
      setShotMedia(index, { error: message(e) });
    }
  }

  // Story clips should come without music: listen once to a new clip and warn on the shot when it seems to carry some
  // (never a block). Only the latest clip of a shot gets its answer.
  function checkClipMusic(index: number, file: File) {
    musicChecks.current[index] = file;
    setAudio((a) => withClipMusic(a, index, null));
    import("./lib/clipMusic.ts")
      .then(({ clipMusic }) => clipMusic(file))
      .then((result) => {
        if (musicChecks.current[index] !== file || !result?.music) return;
        setAudio((a) => withClipMusic(a, index, "likely"));
        addLog({ shot: index, text: `El clip ${file.name} parece traer música (aviso)` });
      })
      .catch(() => undefined);
  }

  async function removeMedia(index: number, kind: "image" | "clip" | "voice" | "sfx") {
    if (kind === "clip") {
      delete musicChecks.current[index];
      setAudio((a) => withClipMusic(a, index, null));
    }
    setMedia((prev) => {
      const next = { ...prev[index] };
      delete next[kind];
      if (kind === "image") delete next.imageFile;
      if (kind === "image" || kind === "clip") delete next.review;
      return { ...prev, [index]: next };
    });
    const sketch = kind === "image" && index >= SKETCH_BASE;
    const what = sketch ? "Boceto quitado" : { image: "Imagen quitada", clip: "Clip quitado", voice: "Voz quitada", sfx: "Efecto quitado" }[kind];
    addLog({ shot: sketch ? index - SKETCH_BASE : index, text: what });
    await keep(index, (id) => api.removeMedia(id, index, kind));
  }

  // A voice (recorded, uploaded or generated) or a sound effect for one shot, kept in the project folder.
  async function addAudio(index: number, kind: "voice" | "sfx", blob: Blob, name: string) {
    const duration = await audioDuration(blob).catch(() => {
      throw new Error("No se pudo leer ese audio. Probá con un .mp3 o un .wav.");
    });
    const url = URL.createObjectURL(blob);
    clipUrls.current.push(url);
    setShotMedia(index, { [kind]: { url, blob, name, duration } });
    addLog({ shot: index, text: `${kind === "voice" ? "Voz" : "Efecto de sonido"}: ${name}, ${duration.toFixed(1)} s` });
    const type = blob.type || "audio/mpeg";
    const file = blob.type ? blob : new Blob([blob], { type });
    await keep(index, (id) => api.uploadMedia(id, index, kind, file, { name, duration }));
  }

  async function addMusic(file: File) {
    const duration = await audioDuration(file).catch(() => {
      throw new Error("No se pudo leer esa música. Probá con un .mp3 o un .wav.");
    });
    const url = URL.createObjectURL(file);
    clipUrls.current.push(url);
    setMusic({ url, blob: file, name: file.name, duration });
    addLog({ text: `Música: ${file.name}, ${duration.toFixed(0)} s` });
    if (projectId) await api.uploadMusic(projectId, file, { name: file.name, duration });
  }

  function removeMusic() {
    setMusic(null);
    addLog({ text: "Música quitada" });
    if (projectId) api.removeMusic(projectId).catch((e) => setError(message(e)));
  }

  async function keepVideo(video: Blob): Promise<string | null> {
    if (!projectId) return null;
    try {
      const { file } = await api.saveVideo(projectId, video);
      return `${o.projectsDir}/${projectId}/${file}`;
    } catch (e) {
      setError(`El video se generó pero no se guardó en el proyecto: ${message(e)}`);
      return null;
    }
  }

  return {
    projectId,
    setProjectId,
    saveStatus,
    setSaveStatus,
    media,
    setMedia,
    setShotMedia,
    music,
    sketchUploads,
    keep,
    clearMedia,
    loadMedia,
    uploadImage,
    uploadClip,
    removeMedia,
    addAudio,
    addMusic,
    removeMusic,
    keepVideo,
  };
}

export type ProjectFiles = ReturnType<typeof useProject>;
