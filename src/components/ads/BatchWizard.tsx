// "Generar tanda": a short assistant. Level(s), duration and counts; then the app chains hooks → meats → CTAs →
// combinations with an approval pause at each stage. The stages live in the tabs; this is the bar that drives them.
import { useState } from "react";
import { AD_SECONDS, BUDGETS, LEVEL_INFO, MEAT_FORMAT_LABEL, levelsOf, wordsFor, type AdSeconds } from "../../../shared/ads.ts";
import { Button, Field, Segmented, Spinner } from "../ui.tsx";
import { LevelPicker } from "./pieces.tsx";

export type WizardStage = "hooks" | "meats" | "ctas" | "combine";
export type Wizard = { stage: WizardStage; levels: number[]; seconds: AdSeconds; hooks: number; meats: number; ctas: number };

type Props = {
  wizard: Wizard | null;
  defaults: { levels: number[]; seconds: AdSeconds };
  counts: { hooks: number; hooksApproved: number; meats: number; meatsApproved: number; ctas: number; ctasApproved: number };
  busy: boolean;
  onStart: (w: Wizard) => Promise<void>;
  onNext: () => Promise<void>;
  onStop: () => void;
};

const STAGES: { id: WizardStage; label: string }[] = [
  { id: "hooks", label: "Hooks" },
  { id: "meats", label: "Meats" },
  { id: "ctas", label: "CTAs" },
  { id: "combine", label: "Combinar" },
];

export function BatchWizard({ wizard, defaults, counts, busy, onStart, onNext, onStop }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Wizard>({ stage: "hooks", levels: defaults.levels, seconds: defaults.seconds, hooks: 50, meats: 4, ctas: 2 });
  const chosen = levelsOf(draft.levels);
  const budget = BUDGETS[draft.seconds];

  if (wizard) {
    const i = STAGES.findIndex((s) => s.id === wizard.stage);
    const approvedNow = wizard.stage === "hooks" ? counts.hooksApproved : wizard.stage === "meats" ? counts.meatsApproved : wizard.stage === "ctas" ? counts.ctasApproved : 0;
    const total = wizard.stage === "hooks" ? counts.hooks : wizard.stage === "meats" ? counts.meats : wizard.stage === "ctas" ? counts.ctas : 0;
    const label = wizard.stage === "combine" ? "Elegí el modo y renderizá" : `Aprobá con Sí / No y seguí (${approvedNow} de ${total} aprobados)`;
    return (
      <div className="rounded-xl border-2 border-ink bg-white p-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-semibold">Tanda en curso</span>
          <ol className="flex items-center gap-1 text-xs">
            {STAGES.map((s, k) => (
              <li key={s.id} className={`rounded-md px-2 py-1 font-semibold ${k < i ? "bg-good-soft text-good" : k === i ? "bg-ink text-white" : "bg-paper text-muted"}`}>
                {k + 1} · {s.label}
              </li>
            ))}
          </ol>
          <span className="text-xs text-muted">
            {wizard.seconds} s · N{levelsOf(wizard.levels).join(", N")} · {wizard.hooks}×{wizard.meats}×{wizard.ctas}
          </span>
          <span className="ml-auto flex items-center gap-2">
            <span className="text-xs text-muted">{label}</span>
            {wizard.stage !== "combine" && (
              <Button onClick={onNext} disabled={busy || approvedNow === 0}>
                {busy ? <Spinner /> : `Seguir con ${STAGES[i + 1].label}`}
              </Button>
            )}
            <Button variant="ghost" className="px-2 py-1 text-xs" onClick={onStop}>
              Cerrar
            </Button>
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-line bg-white p-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => setOpen(!open)} variant={open ? "secondary" : "primary"}>
          Generar tanda
        </Button>
        <span className="text-xs text-muted">Un asistente corto: nivel, duración y cantidad; la app encadena hooks, meats, CTAs y combinaciones con una pausa de aprobación en cada etapa.</span>
      </div>
      {open && (
        <div className="mt-3 grid gap-4 border-t border-line pt-3 md:grid-cols-[1fr_auto]">
          <div className="space-y-3">
            <Field label="Niveles de conciencia" hint="Uno, varios o todos. Cada nivel trae una receta de meats por defecto." group>
              <LevelPicker value={draft.levels} onChange={(levels) => setDraft({ ...draft, levels })} />
              <p className="mt-1 text-xs text-muted">
                {chosen.map((l) => `N${l}: ${LEVEL_INFO[l].meats.map((f) => MEAT_FORMAT_LABEL[f]).join(" o ")}`).join(" · ")}
              </p>
            </Field>
            <Field label="Duración del anuncio" hint={`Reparto del tiempo: hook ${budget.hook} s (${wordsFor(budget.hook)} palabras), meat ${budget.meat} s (${wordsFor(budget.meat)}), CTA ${budget.cta} s (${wordsFor(budget.cta)}).`} group>
              <Segmented value={String(draft.seconds)} options={AD_SECONDS.map((s) => ({ value: String(s), label: `${s} s` }))} onChange={(v) => setDraft({ ...draft, seconds: Number(v) as AdSeconds })} />
            </Field>
          </div>
          <div className="space-y-2">
            {(["hooks", "meats", "ctas"] as const).map((k) => (
              <label key={k} className="flex items-center justify-between gap-3 text-sm">
                <span className="font-semibold">{k === "hooks" ? "Hooks" : k === "meats" ? "Meats" : "CTAs"}</span>
                <input
                  type="number"
                  min={1}
                  max={k === "hooks" ? 60 : k === "meats" ? 8 : 5}
                  className="w-20 rounded-lg border border-line px-2 py-1"
                  value={draft[k]}
                  onChange={(e) => setDraft({ ...draft, [k]: Math.max(1, Number(e.target.value) || 1) })}
                />
              </label>
            ))}
            <p className="text-xs text-muted">
              Hasta {draft.hooks * draft.meats * draft.ctas} anuncios.
            </p>
            <Button className="w-full" onClick={() => onStart({ ...draft, stage: "hooks" })} disabled={busy}>
              {busy ? <Spinner /> : "Empezar: escribir los hooks"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
