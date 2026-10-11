import { useState } from "react";
import type { Brief, SeriesInfo, Story } from "../../shared/schema.ts";
import { correspondentMember, inventedCorrespondent } from "../../shared/segment.ts";
import { api } from "../lib/api.ts";
import { Button } from "./ui.tsx";

// A story "Con corresponsal" in a series with none: the writer invented one. One click adds it to the cast as the
// series' correspondent, so the next pieces bring back the same person.
export function CorrespondentOffer({ story, brief, series, onSeries }: { story: Story; brief: Brief; series: SeriesInfo | undefined; onSeries: (series: SeriesInfo[]) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const found = inventedCorrespondent(story, brief, series);
  if (!found || !series) return null;

  async function add() {
    if (!found || !series) return;
    setBusy(true);
    setError("");
    try {
      const { series: list } = await api.addCorrespondent(series.id, correspondentMember(found, series.cast));
      onSeries(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 rounded border border-line p-3 text-sm">
      <p>
        <span className="font-semibold">{series.name}</span> no tiene corresponsal y la IA inventó a <span className="font-semibold">{found.name}</span>.
        Sumalo al elenco y queda como el corresponsal de la serie: vuelve igual en las próximas piezas.
      </p>
      <Button variant="secondary" className="w-full" onClick={add} disabled={busy}>
        {busy ? "Sumando…" : "Sumar al elenco como corresponsal"}
      </Button>
      <p className="text-xs text-muted">Después subile la imagen en Editar serie.</p>
      {error && <p className="text-xs text-bad">{error}</p>}
    </div>
  );
}
