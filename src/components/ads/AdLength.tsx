// The ad's length (6 to 120 s) and the split between gancho, cuerpo and llamado. A suggestion from the awareness
// levels never writes itself: the person picks "Usar N s". A hand split stays until it is cleared or the length changes.
import { useEffect, useState } from "react";
import {
  AD_MAX_SECONDS,
  AD_MIN_SECONDS,
  adLengthChoices,
  defaultSplit,
  meatGapNote,
  splitIssue,
  suggestedSeconds,
  wordsFor,
  type Budget,
} from "../../../shared/ads.ts";
import { Segmented } from "../ui.tsx";

type Props = {
  seconds: number;
  split: Budget | null;
  levels: number[];
  onChange: (next: { seconds: number; split: Budget | null }) => void;
};

const PARTS = [
  { key: "hook" as const, label: "Gancho", empty: "sin gancho" },
  { key: "meat" as const, label: "Cuerpo", empty: "sin cuerpo" },
  { key: "cta" as const, label: "Llamado", empty: "sin llamado" },
];

const shareWords = (key: (typeof PARTS)[number], seconds: number) => (seconds < 1 ? key.empty : `${wordsFor(seconds)} palabras`);

export function AdLength({ seconds, split, levels, onChange }: Props) {
  // The draft as typed. splitOf() would snap a half-written split back to the default, so a custom split could never be built.
  const shown = split ?? defaultSplit(seconds);
  const issue = split ? splitIssue(seconds, split) : null;
  const gap = meatGapNote(shown);
  const sug = suggestedSeconds(levels);
  const [typed, setTyped] = useState(String(seconds));
  useEffect(() => setTyped(String(seconds)), [seconds]);

  function setSeconds(n: number) {
    if (!Number.isInteger(n) || n < AD_MIN_SECONDS || n > AD_MAX_SECONDS) return;
    onChange({ seconds: n, split: null });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          value={String(seconds)}
          options={adLengthChoices(seconds).map((s) => ({ value: String(s), label: `${s} s` }))}
          onChange={(v) => setSeconds(Number(v))}
        />
        <label className="flex items-center gap-1 text-xs">
          <span className="text-muted">Otro</span>
          <input
            type="number"
            min={AD_MIN_SECONDS}
            max={AD_MAX_SECONDS}
            step={1}
            className="w-16 rounded-lg border border-line px-2 py-1"
            value={typed}
            aria-label="Segundos del anuncio"
            onChange={(e) => {
              setTyped(e.target.value);
              const n = Number(e.target.value);
              if (Number.isInteger(n)) setSeconds(n);
            }}
            onBlur={() => setTyped(String(seconds))}
          />
          <span className="text-muted">s (de {AD_MIN_SECONDS} a {AD_MAX_SECONDS})</span>
        </label>
      </div>
      <div className="flex flex-wrap items-end gap-3 text-xs">
        {PARTS.map((p) => (
          <label key={p.key} className="flex flex-col gap-0.5">
            <span className="font-semibold">{p.label}</span>
            <input
              type="number"
              min={0}
              max={AD_MAX_SECONDS}
              step={1}
              className="w-16 rounded-lg border border-line px-2 py-1"
              value={shown[p.key]}
              aria-label={`Segundos del ${p.label.toLowerCase()}`}
              onChange={(e) => {
                const n = Math.round(Number(e.target.value));
                onChange({ seconds, split: { ...shown, [p.key]: Number.isFinite(n) ? n : 0 } });
              }}
            />
            <span className="text-muted">{shareWords(p, shown[p.key])}</span>
          </label>
        ))}
        {split !== null && (
          <button type="button" className="text-xs text-muted underline" onClick={() => onChange({ seconds, split: null })}>
            Volver al reparto de la app
          </button>
        )}
      </div>
      <p className="text-xs text-muted">
        De 7 s en adelante el gancho queda corto, el llamado entre 3 y 6 s y el cuerpo se lleva el resto. Un anuncio de 6 s es 2 + 2 + 2. Si cambiás una parte, las tres tienen que sumar {Math.round(seconds)} s.
      </p>
      {issue && <p className="text-xs text-neg">{issue}</p>}
      {gap && !issue && <p className="text-xs text-touch">{gap}</p>}
      {sug && (
        <p className="text-xs text-muted">
          {sug.note}{" "}
          {sug.seconds !== seconds && (
            <button type="button" className="font-semibold underline" onClick={() => onChange({ seconds: sug.seconds, split: null })}>
              Usar {sug.seconds} s
            </button>
          )}
        </p>
      )}
    </div>
  );
}
