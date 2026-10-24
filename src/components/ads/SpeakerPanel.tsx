// "Que lo diga un personaje" on one piece of Publicidad: pick an invented adult of the series cast (with its approved
// image), and the app writes the Grok prompt where that character says the piece's line on camera. Copy, paste in
// Grok with the reference, upload the clip with «Subir clip». No AI key needed. "Que lo diga la mascota" opens an
// explainer where the series' code mascot says it instead.
import { useMemo, useState } from "react";
import { wordsFor, type Piece } from "../../../shared/ads.ts";
import { promptsWithSlots } from "../../../shared/adsBulk.ts";
import { continuityNote, grokSequence } from "../../../shared/adsSequence.ts";
import {
  SPEAKER_SOUNDS,
  SPEAKER_SOUND_LABEL,
  defaultEmotion,
  defaultPlace,
  sequencePromptText,
  sequenceSpeakerPrompts,
  speakerCandidates,
  speakerDraft,
  speakerDisclosure,
  speakerFit,
  speakerIssues,
  speakerPrompt,
  type PieceSpeaker,
  type SpeakerSound,
} from "../../../shared/adsSpeaker.ts";
import type { SeriesInfo, ToolInfo } from "../../../shared/schema.ts";
import { libraryFileUrl } from "../../lib/api.ts";
import { CopyButton } from "../ScriptView.tsx";
import { Button, Segmented, Spinner, inputClass } from "../ui.tsx";

type Props = {
  piece: Piece;
  series: SeriesInfo;
  tool: ToolInfo | undefined;
  format: "vertical" | "horizontal";
  hasClip: boolean;
  hasVoice: boolean;
  onSave: (speaker: PieceSpeaker | null) => Promise<void>;
  // "Que lo diga la mascota": opens an explainer with the series' code mascot; missing when the series has none.
  onMascot?: (emotion: string) => void;
};

const s1 = (n: number) => `${(Math.round(n * 10) / 10).toString().replace(".", ",")} s`;

export function SpeakerPanel({ piece, series, tool, format, hasClip, hasVoice, onSave, onMascot }: Props) {
  const candidates = useMemo(() => speakerCandidates(series.cast), [series.cast]);
  const [open, setOpen] = useState(Boolean(piece.speaker));
  const [draft, setDraft] = useState<PieceSpeaker | null>(() => (piece.speaker ? piece.speaker : candidates[0] ? speakerDraft(piece, candidates[0].id) : null));
  const [saving, setSaving] = useState(false);
  const member = candidates.find((m) => m.id === draft?.castId);
  const fit = speakerFit(piece.text, piece.seconds);
  const issues = speakerIssues(piece.text, piece.seconds);
  const slots = grokSequence(piece.seconds);
  const sequence = slots.length > 1;
  const rawPrompts =
    member && draft
      ? sequence
        ? sequenceSpeakerPrompts({
            text: piece.text,
            pieceSeconds: piece.seconds,
            member,
            speaker: draft,
            format,
            look: series.look,
            type: series.type,
          })
        : [
            speakerPrompt({
              text: piece.text,
              pieceSeconds: piece.seconds,
              member,
              speaker: draft,
              format,
              look: series.look,
              type: series.type,
            }),
          ]
      : [];
  const slotted = rawPrompts.length ? promptsWithSlots(piece.id, rawPrompts) : [];
  const prompt = sequence ? sequencePromptText(slotted) : (slotted[0] ?? "");
  const saved = JSON.stringify(piece.speaker ?? null) === JSON.stringify(draft);
  const lip = tool?.lipSync;

  async function save(next: PieceSpeaker | null) {
    setSaving(true);
    try {
      await onSave(next);
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <div className="space-y-1.5 border-t border-line pt-2">
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" className="px-2 py-1 text-xs" onClick={() => setOpen(true)}>
            Que lo diga un personaje
          </Button>
          {onMascot && (
            <Button
              variant="ghost"
              className="px-2 py-1 text-xs"
              title="Abre un explicativo de esta serie donde la mascota en código dice esta línea"
              onClick={() => onMascot(defaultEmotion(piece))}
            >
              Que lo diga la mascota ({series.mascot?.name})
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2 border-t border-line pt-2">
      <p className="font-semibold text-ink">Que lo diga un personaje</p>
      <p className="text-muted">
        Solo personajes inventados y adultos del elenco de la serie, nunca la cara de una persona real. El video lleva el aviso «
        {speakerDisclosure(draft?.sound ?? "clip")}».
      </p>
      {!candidates.length ? (
        <p className="text-touch">La serie no tiene personajes con imagen aprobada. Sumalos en Editar serie (mejor con su hoja de personaje) y volvé.</p>
      ) : (
        draft && (
          <>
            <div className="flex items-start gap-2">
              {member?.image && (
                <img src={libraryFileUrl(series.id, member.image)} alt="" className="h-16 w-12 shrink-0 rounded border border-line object-cover" />
              )}
              <div className="flex-1 space-y-1.5">
                <select className={inputClass} value={draft.castId} onChange={(e) => setDraft(speakerDraft(piece, e.target.value))}>
                  {candidates.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} (@{m.ref})
                    </option>
                  ))}
                </select>
                <label className="block">
                  <span className="font-semibold">Cómo lo dice</span>
                  <input className={inputClass} value={draft.emotion} onChange={(e) => setDraft({ ...draft, emotion: e.target.value })} />
                </label>
              </div>
            </div>
            <label className="block">
              <span className="font-semibold">Qué hace</span> <span className="text-muted">(una sola acción, en inglés)</span>
              <input className={inputClass} value={draft.action} onChange={(e) => setDraft({ ...draft, action: e.target.value })} />
            </label>
            <label className="block">
              <span className="font-semibold">Dónde</span> <span className="text-muted">(en inglés; vacío: {defaultPlace(series.type)})</span>
              <input className={inputClass} value={draft.place} onChange={(e) => setDraft({ ...draft, place: e.target.value })} />
            </label>
            <label className="block">
              <span className="font-semibold">Voz de Grok</span> <span className="text-muted">(opcional: el nombre de la voz en el panel de audio)</span>
              <input className={inputClass} value={draft.voice} onChange={(e) => setDraft({ ...draft, voice: e.target.value })} />
            </label>
            <p className={fit.fits ? "text-muted" : "text-neg"}>
              {sequence ? (
                <>
                  La línea ({fit.words} palabras) se parte en {slots.length} clips de Grok ({slots.map((s) => `${s.length} s`).join(" + ")}). Cada uno sigue donde terminó el anterior, con el mismo personaje y el mismo lugar. La pieza usa {s1(piece.seconds)}
                  {fit.fits ? "." : `: no entra. Acortala a ${wordsFor(piece.seconds)} palabras.`}
                </>
              ) : (
                <>
                  La línea ({fit.words} palabras) se dice en unos {s1(fit.speech)}: pedí en Grok un clip de <b>{fit.clip} s</b>. La pieza usa {s1(piece.seconds)}
                  {fit.fits ? "." : `: no entra y se corta. Acortala a ${wordsFor(piece.seconds)} palabras.`}
                </>
              )}
            </p>
            {issues.map((i) => (
              <p key={i} className="text-neg">
                {i}
              </p>
            ))}
            {!issues.length && member && (
              <>
                <ol className="list-decimal space-y-0.5 pl-4 text-muted">
                  <li>
                    En {tool?.name ?? "Grok"}, adjuntá la referencia <b>@{member.ref}</b> (su imagen aprobada) en cada clip.
                  </li>
                  {sequence ? (
                    <>
                      <li>
                        Pegá cada prompt y pedí {slots.map((s) => `${s.length} s`).join(", ")} ({format === "vertical" ? "9:16" : "16:9"}), con sonido. Primero la imagen, después animala. El clip 2 arranca donde terminó el 1.
                      </li>
                      {slots.map((_, i) =>
                        i > 0 ? (
                          <li key={i}>{continuityNote(i)}</li>
                        ) : null,
                      )}
                    </>
                  ) : (
                    <li>
                      Pegá el prompt y elegí <b>{fit.clip} s</b> y {format === "vertical" ? "9:16" : "16:9"}, con sonido.
                    </li>
                  )}
                  <li>{sequence ? "Subí cada clip en su lugar, arriba («Clip i de N»)." : "Subí el clip acá arriba con «Subir clip»."}</li>
                </ol>
                <CopyButton text={prompt} idle={sequence ? "Copiar todos los prompts" : "Copiar prompt para Grok"} />
                <pre className="whitespace-pre-wrap rounded bg-paper p-2 font-mono text-[11px] text-muted">{prompt}</pre>
              </>
            )}
            <p className="rounded border border-touch/30 bg-touch-soft px-2 py-1">
              <b>Labios:</b>{" "}
              {lip
                ? `[${lip.tag}] ${lip.tag === "TESTED" ? "probado en " : "no está probado en "}${tool?.name ?? "la herramienta"}.`
                : `el perfil de ${tool?.name ?? "la herramienta"} no dice si sincroniza los labios.`}{" "}
              Mirá el clip: si la boca no coincide, elegí «{SPEAKER_SOUND_LABEL.voice}» y generá o subí la voz abajo.
            </p>
            <div className="space-y-1">
              <span className="font-semibold">Qué se oye</span>
              <Segmented<SpeakerSound>
                value={draft.sound}
                onChange={(sound) => setDraft({ ...draft, sound })}
                options={SPEAKER_SOUNDS.map((v) => ({
                  value: v,
                  label: SPEAKER_SOUND_LABEL[v],
                }))}
              />
            </div>
            {draft.sound === "clip" && hasVoice && (
              <p className="text-neg">La pieza también tiene voz: se oirían las dos. Quitá la voz o elegí el clip mudo.</p>
            )}
            {draft.sound === "voice" && !hasVoice && (
              <p className="text-touch">Falta la voz de la pieza: generala o subila abajo (si no, queda solo el subtítulo).</p>
            )}
            {sequence ? (
              <p className="text-muted">Cada clip arranca desde el principio. Si el personaje tarda en hablar, recortá ese silencio en Grok antes de subirlo.</p>
            ) : (
              <label className="block">
                <span className="font-semibold">El clip arranca en</span>{" "}
                <input
                  type="number"
                  min={0}
                  max={14}
                  step={0.1}
                  className="w-20 rounded-lg border border-line px-2 py-1"
                  value={draft.from}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      from: Math.max(0, Math.min(14, Number(e.target.value) || 0)),
                    })
                  }
                />{" "}
                <span className="text-muted">s (si el personaje tarda en hablar, salteá ese silencio)</span>
              </label>
            )}
            {!hasClip && piece.speaker && <p className="text-muted">Todavía no hay clip: hasta que lo subas, la pieza sale con imagen o tarjeta de color.</p>}
            <div className="flex flex-wrap gap-2">
              <Button className="px-2 py-1 text-xs" onClick={() => save(draft)} disabled={saving || saved}>
                {saving ? <Spinner /> : saved ? "Guardado" : "Guardar personaje"}
              </Button>
              {piece.speaker && (
                <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => save(null)} disabled={saving}>
                  Quitar personaje
                </Button>
              )}
              {!piece.speaker && (
                <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => setOpen(false)}>
                  Cerrar
                </Button>
              )}
            </div>
          </>
        )
      )}
      {onMascot ? (
        <p className="text-muted">
          O{" "}
          <button type="button" className="font-semibold underline" onClick={() => onMascot(draft?.emotion || defaultEmotion(piece))}>
            que lo diga la mascota ({series.mascot?.name})
          </button>
          : abre un explicativo donde la mascota en código dice esta línea con la voz del narrador; generalo y traelo con «Usar en Publicidad».
        </p>
      ) : (
        <p className="text-muted">La serie no tiene mascota en código (Editar serie → Mascota en código): por eso no aparece «Que lo diga la mascota».</p>
      )}
    </div>
  );
}
