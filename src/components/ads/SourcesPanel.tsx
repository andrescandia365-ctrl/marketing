// Where winning hooks come from (this goes first): metrics of previous ads, hooks from the organic content, and the
// clips of previous ads catalogued by the AI (hook, meat, CTA, level, format).
import { useState } from "react";
import { ANGLE_LABEL, FORMULA_LABEL, LEVEL_INFO, MEAT_FORMAT_LABEL, clipStats, pieceStats, type AdsState, type RankedHook } from "../../../shared/ads.ts";
import { adsFileUrl } from "../../lib/api.ts";
import { ClaudeHandoff, type Handoff } from "../ClaudeHandoff.tsx";
import { Button, Notice, Spinner, inputClass } from "../ui.tsx";
import { LevelChip, Tag } from "./pieces.tsx";

type Props = {
  series: string;
  state: AdsState;
  ranking: RankedHook[];
  transcription: boolean;
  demo: boolean;
  busy: string | null;
  onUploadClip: (file: File) => Promise<void>;
  onClipText: (name: string, transcript: string) => Promise<void>;
  onRemoveClip: (id: string) => Promise<void>;
  onImportMetrics: (csv: string) => Promise<{ rows: number; withId: number; missing: string[] }>;
  onHookFromClip: (clipId: string) => Promise<void>;
  onOpenOffer: () => void;
  // "Sin clave": the pasted transcript cut by claude.ai, and a catalogued clip cut again by claude.ai.
  clipHandoff?: ((name: string, transcript: string) => Handoff) | null;
  splitHandoff?: ((clipId: string) => Handoff) | null;
};

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n)));

export function SourcesPanel({
  series,
  state,
  ranking,
  transcription,
  demo,
  busy,
  onUploadClip,
  onClipText,
  onRemoveClip,
  onImportMetrics,
  onHookFromClip,
  onOpenOffer,
  clipHandoff = null,
  splitHandoff = null,
}: Props) {
  const [splitting, setSplitting] = useState<string | null>(null);
  const [pasteName, setPasteName] = useState("");
  const [paste, setPaste] = useState("");
  const [imported, setImported] = useState<{ rows: number; withId: number; missing: string[] } | null>(null);
  const [error, setError] = useState("");
  const stats = pieceStats(state.metrics);
  const byClip = clipStats(state.clips, state.metrics);
  const organic = state.hooks.filter((h) => h.source === "organic");

  async function importFile(file: File) {
    setError("");
    try {
      setImported(await onImportMetrics(await file.text()));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <section className="space-y-6">
      <div className="rounded-xl border border-line bg-white p-4">
        <h3 className="text-sm font-semibold">Cómo conseguir hooks ganadores</h3>
        <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-muted">
          <li>
            <b className="text-ink">Datos de anuncios previos:</b> cuántos videos usaron cada hook y qué porcentaje de impresiones vio al menos 3 segundos. Subí el reporte exportado de la plataforma (CSV); los nombres con ID (H12-M3-C2) se asignan solos a cada pieza.
          </li>
          <li>
            <b className="text-ink">Hooks del contenido orgánico (Playbook):</b> desde una historia, «Enviar a Publicidad» trae su problema y su gancho como hook candidato.
          </li>
          <li>
            <b className="text-ink">Clips previos:</b> subilos y la IA los transcribe y separa en Hook, Meat y CTA, con nivel de conciencia, ángulo, fórmula y formato.
          </li>
          <li>
            <b className="text-ink">El lenguaje del público:</b> pegá los comentarios y preguntas más repetidos en el{" "}
            <button type="button" className="font-semibold underline" onClick={onOpenOffer}>
              perfil de oferta
            </button>
            .
          </li>
        </ol>
      </div>

      <div className="rounded-xl border border-line bg-white p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold">Ranking de hooks</h3>
          <span className="text-xs text-muted">
            {state.metrics.length ? `${state.metrics.length} filas de métricas · ${new Date(state.metricsImportedAt).toLocaleDateString()}` : "Sin métricas todavía"}
          </span>
        </div>
        {ranking.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Cuando haya métricas, acá aparecen los hooks de mejor a peor: videos que lo usaron, impresiones, % que ve 3 s, vistas.</p>
        ) : (
          <table className="mt-2 w-full text-left text-xs">
            <thead className="text-muted">
              <tr>
                <th className="py-1 pr-2 font-medium">Hook</th>
                <th className="py-1 pr-2 font-medium">Nivel</th>
                <th className="py-1 pr-2 text-right font-medium">Videos</th>
                <th className="py-1 pr-2 text-right font-medium">Impresiones</th>
                <th className="py-1 pr-2 text-right font-medium">Ven 3 s</th>
                <th className="py-1 pr-2 text-right font-medium">Vistas</th>
              </tr>
            </thead>
            <tbody>
              {ranking.map((r) => (
                <tr key={r.id} className="border-t border-line">
                  <td className="py-1.5 pr-2">
                    <span className="font-mono text-muted">{r.id}</span> {r.text}
                    <span className="ml-1 text-muted">
                      · {ANGLE_LABEL[r.angle]} · {FORMULA_LABEL[r.formula]}
                    </span>
                  </td>
                  <td className="py-1.5 pr-2">
                    <LevelChip level={r.level} />
                  </td>
                  <td className="py-1.5 pr-2 text-right font-mono">{r.stats.ads}</td>
                  <td className="py-1.5 pr-2 text-right font-mono">{fmt(r.stats.impressions)}</td>
                  <td className="py-1.5 pr-2 text-right font-mono">{r.stats.impressions ? pct(r.stats.hookRate) : "–"}</td>
                  <td className="py-1.5 pr-2 text-right font-mono">{fmt(r.stats.views3s || r.stats.views)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3 text-xs">
          <label className="cursor-pointer rounded-lg border border-line bg-white px-3 py-1.5 font-semibold hover:border-ink">
            Cargar reporte CSV
            <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />
          </label>
          <span className="text-muted">Columnas que lee: nombre del anuncio, impresiones, reproducciones de 3 s, tiempo promedio, clics, resultados, gasto. Reemplaza la carga anterior.</span>
          {imported && (
            <span className="text-good">
              {imported.rows} filas, {imported.withId} con ID de la app{imported.missing.length ? ` · sin columna: ${imported.missing.join(", ")}` : ""}
            </span>
          )}
          {error && <span className="text-neg">{error}</span>}
        </div>
        {Object.keys(stats).length > 0 && (
          <div className="mt-3 grid gap-2 text-xs md:grid-cols-3">
            {(["M", "C"] as const).map((prefix) => {
              const rows = Object.values(stats)
                .filter((s) => s.id.startsWith(prefix))
                .sort((a, b) => (prefix === "M" ? b.avgWatch - a.avgWatch : b.ctr - a.ctr));
              if (!rows.length) return null;
              return (
                <div key={prefix} className="rounded-lg border border-line p-2">
                  <p className="font-semibold">{prefix === "M" ? "Meats: retención (tiempo promedio)" : "CTAs: clics y conversión"}</p>
                  {rows.slice(0, 6).map((s) => (
                    <p key={s.id} className="mt-1 font-mono text-muted">
                      {s.id} · {prefix === "M" ? `${s.avgWatch.toFixed(1)} s` : `CTR ${pct(s.ctr)} · conv ${pct(s.convRate)}`} · {s.ads} videos
                    </p>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-line bg-white p-4">
        <h3 className="text-sm font-semibold">Hooks del contenido orgánico</h3>
        {organic.length === 0 ? (
          <p className="mt-1 text-sm text-muted">Ninguno todavía. En Playbook, cuando una historia funcionó, «Enviar a Publicidad» la trae acá.</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm">
            {organic.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs text-muted">{h.id}</span>
                <LevelChip level={h.level} />
                <span>{h.text}</span>
                {h.note && <span className="text-xs text-muted">· {h.note}</span>}
                <Tag>{h.status === "approved" ? "aprobado" : h.status === "rejected" ? "descartado" : "pendiente"}</Tag>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-xl border border-line bg-white p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold">Clips de anuncios previos</h3>
          <span className="text-xs text-muted">{transcription ? "Transcribe con OpenAI (whisper-1), misma clave que la voz." : "Sin OPENAI_API_KEY: pegá la transcripción a mano."}</span>
        </div>
        {demo && (
          <p className="mt-1 text-xs text-muted">
            Sin clave de IA, «Catalogar el texto» corta por oraciones con etiquetas de muestra. Para que lo corte y etiquete claude.ai, usá «Con claude.ai» debajo del texto, o «Cortar con claude.ai» en un clip ya catalogado.
          </p>
        )}
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <label className={`block cursor-pointer rounded-lg border border-dashed border-line p-4 text-center text-sm hover:border-ink ${transcription ? "" : "opacity-50"}`}>
              {busy === "clip" ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner /> Transcribiendo y catalogando…
                </span>
              ) : (
                "Soltá o elegí un clip (mp4, hasta 25 MB)"
              )}
              <input type="file" accept="video/*,audio/*" className="hidden" disabled={!transcription || busy !== null} onChange={(e) => e.target.files?.[0] && onUploadClip(e.target.files[0])} />
            </label>
          </div>
          <div className="space-y-2">
            <input className={inputClass} placeholder="Nombre del anuncio (como en la plataforma, para cruzarlo con sus métricas)" value={pasteName} onChange={(e) => setPasteName(e.target.value)} />
            <textarea className={`${inputClass} min-h-20`} placeholder="Pegá la transcripción del clip…" value={paste} onChange={(e) => setPaste(e.target.value)} />
            <Button
              variant="secondary"
              disabled={paste.trim().length < 10 || busy !== null}
              onClick={async () => {
                await onClipText(pasteName, paste);
                setPaste("");
                setPasteName("");
              }}
            >
              {busy === "clipText" ? <Spinner /> : demo ? "Catalogar el texto (de muestra)" : "Catalogar el texto"}
            </Button>
            {clipHandoff && paste.trim().length >= 10 && (
              <ClaudeHandoff
                title="Catalogar el texto"
                what="el corte en hook, meat y CTA"
                disabled={busy !== null}
                via={{
                  prompt: clipHandoff(pasteName, paste).prompt,
                  paste: async (reply) => {
                    await clipHandoff(pasteName, paste).paste(reply);
                    setPaste("");
                    setPasteName("");
                  },
                }}
              />
            )}
          </div>
        </div>
        {state.clips.length > 0 && (
          <ul className="mt-4 space-y-3">
            {state.clips.map((clip) => {
              const s = byClip[clip.id];
              return (
                <li key={clip.id} className="rounded-lg border border-line p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <b>{clip.name}</b>
                    <LevelChip level={clip.level} full />
                    <Tag>{MEAT_FORMAT_LABEL[clip.format]}</Tag>
                    <Tag>{ANGLE_LABEL[clip.angle]}</Tag>
                    <Tag>{FORMULA_LABEL[clip.formula]}</Tag>
                    {s && (
                      <Tag title="De las métricas cargadas">
                        {s.ads} videos · {pct(s.hookRate)} ven 3 s · {fmt(s.views3s || s.views)} vistas
                      </Tag>
                    )}
                    <span className="ml-auto flex gap-2">
                      <Button variant="secondary" className="px-2 py-1 text-xs" onClick={() => onHookFromClip(clip.id)} disabled={!clip.hook}>
                        Usar su hook
                      </Button>
                      {splitHandoff && clip.transcript.trim().length >= 10 && (
                        <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => setSplitting(splitting === clip.id ? null : clip.id)}>
                          {splitting === clip.id ? "Cerrar" : "Cortar con claude.ai"}
                        </Button>
                      )}
                      <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => onRemoveClip(clip.id)}>
                        Borrar
                      </Button>
                    </span>
                  </div>
                  {splitHandoff && splitting === clip.id && (
                    <ClaudeHandoff
                      className="mt-2"
                      title="Cortar de nuevo"
                      what="el corte en hook, meat y CTA"
                      disabled={busy !== null}
                      via={{
                        prompt: splitHandoff(clip.id).prompt,
                        paste: async (reply) => {
                          await splitHandoff(clip.id).paste(reply);
                          setSplitting(null);
                        },
                      }}
                    />
                  )}
                  <div className="mt-2 grid gap-2 text-xs md:grid-cols-3">
                    <p>
                      <b className="text-neg">Hook</b> <span className="text-muted">(hasta {clip.hookEndsAt.toFixed(0)} s)</span>
                      <br />
                      {clip.hook}
                    </p>
                    <p>
                      <b className="text-touch">Meat</b>
                      <br />
                      {clip.meat}
                    </p>
                    <p>
                      <b className="text-good">CTA</b>
                      <br />
                      {clip.cta || "(sin CTA)"}
                    </p>
                  </div>
                  {clip.note && <p className="mt-2 text-xs text-muted">{clip.note}</p>}
                  {clip.file && (
                    <a className="mt-1 inline-block text-xs underline" href={adsFileUrl(series, clip.file)} target="_blank" rel="noreferrer">
                      Ver el clip
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <Notice tone="info">
        <b>Una métrica por pieza.</b> Hook: % de impresiones que ven 3 s. Meat: tiempo promedio de visualización. CTA: clics y conversión. Las vistas totales dependen de cuánto se invirtió, así que van al lado y no solas. Niveles 1 a 3 → audiencias frías; 4 y 5 → retargeting. {LEVEL_INFO[1].short}–{LEVEL_INFO[5].short} se etiquetan en cada pieza.
      </Notice>
    </section>
  );
}
