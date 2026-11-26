// "Cómo mantener al personaje igual": the steps that keep a character the same face, hair and clothes in every clip
// (shared/shotKit.ts CONSISTENCY_STEPS, the same text the shot kit's LEEME.txt carries).
import { CONSISTENCY_STEPS } from "../../shared/shotKit.ts";

export function ConsistencyGuide({ open = false }: { open?: boolean }) {
  return (
    <details className="rounded-xl border border-line bg-white p-3 text-sm" open={open}>
      <summary className="cursor-pointer font-semibold">Cómo crear y mantener al personaje igual en todos los clips</summary>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs">
        {CONSISTENCY_STEPS.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <p className="mt-2 text-xs text-muted">
        Para hacerlo a mano en Replicate o APIMart, «Bajar kit de la toma» trae las referencias ya numeradas en ese orden y la voz de la toma
        para el lip sync.
      </p>
    </details>
  );
}
