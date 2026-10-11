// Word times for an explainer's subtitles: each scene's voice file is heard once (whisper-1) and its words aligned to
// the line; a new line or a new file is heard again. Without the OpenAI key, or when it fails, the times stay estimated.
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { MotionPiece } from "../../shared/motion.ts";
import type { Brief } from "../../shared/schema.ts";
import { alignWordTimes, keepHeard, subtitleWords, wordTimesFresh, type HeardWordTimes } from "../../shared/subtitles.ts";
import { api } from "../lib/api.ts";
import type { AudioFile } from "./Audio.tsx";

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

// Returns the note shown when a voice could not be heard.
export function useHeardWords(
  autoSync: boolean,
  piece: MotionPiece,
  voices: Record<string, AudioFile>,
  language: Brief["language"],
  setPiece: Dispatch<SetStateAction<MotionPiece>>,
): string {
  const script = piece.script;
  // The newest voices, for answers that arrive after the voice changed.
  const voicesRef = useRef(voices);
  voicesRef.current = voices;
  const hearing = useRef(new Set<string>());
  const [heardNote, setHeardNote] = useState("");
  useEffect(() => {
    if (!autoSync || !script || piece.voice === "none") return;
    const todo = script.scenes.filter((s) => {
      const v = voices[s.id];
      return v && s.voice.trim() && !wordTimesFresh(piece.wordTimes?.[s.id], s.voice, v.duration) && !hearing.current.has(`${s.id}|${s.voice.trim()}|${v.duration}`);
    });
    if (!todo.length) return;
    for (const s of todo) hearing.current.add(`${s.id}|${s.voice.trim()}|${voices[s.id].duration}`);
    (async () => {
      for (const s of todo) {
        const v = voices[s.id];
        const text = s.voice.trim();
        const key = `${s.id}|${text}|${v.duration}`;
        try {
          const heard = await api.voiceWords(v.blob, v.name, text, language);
          const aligned = alignWordTimes(subtitleWords(text), heard.words, v.duration);
          if (!aligned) {
            hearing.current.delete(key);
            continue;
          }
          const entry: HeardWordTimes = { text, seconds: v.duration, times: aligned.times, matched: aligned.matched };
          // Only while it is still this scene's line and voice file: an older voice's late answer is dropped (and
          // that voice may be heard again if it comes back).
          const current = voicesRef.current[s.id];
          if (current !== v) hearing.current.delete(key);
          setPiece((p) => {
            const now = p.script?.scenes.find((x) => x.id === s.id)?.voice;
            const next = current === v ? keepHeard(p.wordTimes ?? {}, s.id, entry, now, current.duration) : p.wordTimes;
            return next === p.wordTimes ? p : { ...p, wordTimes: next };
          });
        } catch (e) {
          hearing.current.delete(key);
          setHeardNote(`No se pudieron escuchar las palabras de una voz (${message(e)}): sus subtítulos siguen con tiempos estimados.`);
        }
      }
    })();
    // The voices and the lines decide it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSync, voices, script?.scenes, piece.voice]);
  return heardNote;
}
