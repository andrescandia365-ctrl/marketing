// Step 4: hook × meat × CTA by code. Two modes (full, or by stages: "Variar hook" on a winner), the combination rule,
// the review and the estimate before running, then the render by cached pieces and the export (videos with their
// IDs plus the CSV for the platform).
import { useMemo, useState } from "react";
import {
  AUDIENCE_LABEL,
  LEVEL_INFO,
  REVIEW_KIND_LABEL,
  adsThisWeek,
  combine,
  estimate,
  pieceStats,
  renderedPieces,
  varyHook,
  type AdCombo,
  type AdSeconds,
  type AdsState,
  type CombineRules,
  type ReviewFlag,
} from "../../../shared/ads.ts";
import { adsFileUrl } from "../../lib/api.ts";
import { download } from "../../lib/markdown.ts";
import { Button, Notice, Spinner } from "../ui.tsx";
import { LevelChip, Tag } from "./pieces.tsx";

export type RenderProgress = { stage: "pieces" | "ads" | "csv" | "voices"; done: number; total: number; current: string; errors: string[] };

type Props = {
  series: string;
  state: AdsState;
  seconds: AdSeconds;
  folder: string;
  busy: string | null;
  flags: ReviewFlag[] | null;
  reviewNote: string;
  progress: RenderProgress | null;
  onReview: () => Promise<void>;
  onRun: (ads: AdCombo[], mode: "full" | "stage", rules: CombineRules) => Promise<void>;
  onWeeklyLimit: (n: number) => Promise<void>;
  onRemoveBatch: (id: string) => Promise<void>;
  onBatchCsv: (id: string) => Promise<string>;
  // "Probar un anuncio": the ad cut from its three pieces, as a video URL (null if it failed).
  onPreview: (hookId: string, meatId: string, ctaId: string) => Promise<string | null>;
  // Approved pieces cached as webm (this browser has no H.264 encoder), and dropping them from the cache.
  webm: number;
  onDropWebm: () => Promise<void>;
};

const mins = (s: number) => (s < 90 ? `${Math.round(s)} s` : `${Math.round(s / 60)} min`);

export function CombinePanel({ series, state, seconds, folder, busy, flags, reviewNote, progress, onReview, onRun, onWeeklyLimit, onRemoveBatch, onBatchCsv, onPreview, webm, onDropWebm }: Props) {
  const [mode, setMode] = useState<"full" | "stage">("full");
  const [rules, setRules] = useState<CombineRules>({ sameLevel: true });
  const [winner, setWinner] = useState<{ meatId: string; ctaId: string }>({ meatId: "", ctaId: "" });
  const approved = { hooks: state.hooks.filter((p) => p.status === "approved"), meats: state.meats.filter((p) => p.status === "approved"), ctas: state.ctas.filter((p) => p.status === "approved") };
  const stats = useMemo(() => pieceStats(state.metrics), [state.metrics]);

  const ads = useMemo(() => {
    if (mode === "full") return combine(state.hooks, state.meats, state.ctas, rules);
    const meat = state.meats.find((m) => m.id === winner.meatId);
    const cta = state.ctas.find((c) => c.id === winner.ctaId);
    return meat && cta ? varyHook(meat, cta, state.hooks, rules) : [];
  }, [mode, rules, winner, state.hooks, state.meats, state.ctas]);
  const theoretical = approved.hooks.length * approved.meats.length * approved.ctas.length;
  const est = estimate(ads, renderedPieces(state.renders), seconds);
  const week = adsThisWeek(state.batches);
  const overLimit = week + ads.length > state.weeklyLimit;
  const policy = (flags ?? []).filter((f) => f.kind === "policy");
  const byLevel = ads.reduce<Record<number, number>>((acc, a) => ((acc[a.level] = (acc[a.level] ?? 0) + 1), acc), {});

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-line bg-white p-4">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm font-semibold">Modo</p>
          <div className="inline-flex rounded-lg border border-line bg-white p-0.5">
            {(["full", "stage"] as const).map((m) => (
              <button key={m} type="button" onClick={() => setMode(m)} className={`rounded-md px-3 py-1.5 text-sm font-medium ${mode === m ? "bg-ink text-white" : "text-muted hover:text-ink"}`}>
                {m === "full" ? "Completo" : "Por etapas (Variar hook)"}
              </button>
            ))}
          </div>
          <label className="ml-auto flex items-center gap-2 text-sm">
            <input type="checkbox" checked={rules.sameLevel} onChange={(e) => setRules({ sameLevel: e.target.checked })} />
            Solo meats y CTAs del mismo nivel que el hook
          </label>
        </div>
        <p className="mt-2 text-xs text-muted">
          {mode === "full"
            ? "Todos los hooks aprobados × todos los meats × todos los CTAs. Probar todo junto mezcla las variables: después no se sabe qué pieza ganó."
            : "Tomá un anuncio ganador, conservá su meat y su CTA y cambiá solo el hook. Después se fijan los hooks ganadores y se prueban meats, y al final CTAs."}
        </p>
        {mode === "stage" && (
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            <label className="text-sm">
              <span className="font-semibold">Meat ganador</span>
              <select className="mt-1 w-full rounded-lg border border-line bg-white px-2 py-1.5 text-sm" value={winner.meatId} onChange={(e) => setWinner({ ...winner, meatId: e.target.value })}>
                <option value="">Elegí…</option>
                {approved.meats.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.id}
                    {stats[m.id] ? ` · ${stats[m.id].avgWatch.toFixed(1)} s promedio` : ""} · {m.text.slice(0, 70)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="font-semibold">CTA ganador</span>
              <select className="mt-1 w-full rounded-lg border border-line bg-white px-2 py-1.5 text-sm" value={winner.ctaId} onChange={(e) => setWinner({ ...winner, ctaId: e.target.value })}>
                <option value="">Elegí…</option>
                {approved.ctas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.id}
                    {stats[c.id] ? ` · CTR ${(stats[c.id].ctr * 100).toFixed(1)}%` : ""} · {c.text.slice(0, 70)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-line bg-white p-4 text-sm">
          <p className="font-semibold">Combinaciones</p>
          <p className="mt-1 text-3xl font-bold tracking-tight">{ads.length}</p>
          <p className="text-xs text-muted">
            {approved.hooks.length} hooks × {approved.meats.length} meats × {approved.ctas.length} CTAs = {theoretical} en teoría
            {rules.sameLevel && theoretical !== ads.length ? `; ${ads.length} respetando el nivel` : ""}. Mínimo 50×3×1 = 150, máximo 50×5×3 = 750.
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {Object.entries(byLevel).map(([l, n]) => (
              <Tag key={l}>
                N{l} · {n} · {AUDIENCE_LABEL[LEVEL_INFO[Number(l) as 1].audience]}
              </Tag>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-line bg-white p-4 text-sm">
          <p className="font-semibold">Estimación</p>
          <ul className="mt-1 space-y-0.5 text-xs text-muted">
            <li>
              <b className="text-ink">{est.toRender}</b> piezas por renderizar ({est.pieces} únicas; {est.pieces - est.toRender} ya en caché) en vez de {ads.length} anuncios enteros.
            </li>
            <li>
              Tiempo aproximado: <b className="text-ink">{mins(est.renderSeconds)}</b> en este navegador.
            </li>
            <li>Créditos de IA: 1 pedido por cada 50 pares hook + CTA para los textos de la plataforma. Combinar es código puro.</li>
            <li>
              Esta semana: {week} anuncios de {state.weeklyLimit}.{" "}
              <button
                type="button"
                className="underline"
                onClick={() => {
                  const n = Number(prompt("Límite semanal de anuncios:", String(state.weeklyLimit)));
                  if (n > 0) void onWeeklyLimit(n);
                }}
              >
                cambiar límite
              </button>
            </li>
          </ul>
        </div>
      </div>

      <div className="rounded-xl border border-line bg-white p-4">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold">Revisor</p>
          <span className="text-xs text-muted">Marca promesas que las plataformas rechazan (salud, dinero), hooks casi duplicados y meats que no encajan.</span>
          <Button variant="secondary" className="ml-auto" onClick={onReview} disabled={busy !== null}>
            {busy === "review" ? <Spinner /> : "Revisar las piezas aprobadas"}
          </Button>
        </div>
        {flags && (
          <div className="mt-2 space-y-1 text-xs">
            {reviewNote && <p className="text-muted">{reviewNote}</p>}
            {flags.length === 0 ? (
              <p className="text-good">Sin observaciones.</p>
            ) : (
              flags.map((f, i) => (
                <p key={i} className={`rounded border px-2 py-1 ${f.kind === "policy" ? "border-neg/40 bg-neg-soft" : "border-touch/30 bg-touch-soft"}`}>
                  <span className="font-mono">{f.pieceId}</span> · <b>{REVIEW_KIND_LABEL[f.kind]}:</b> {f.note}
                  {f.fix && <span className="text-muted"> → {f.fix}</span>}
                </p>
              ))
            )}
            {flags.length > 0 && <p className="text-muted">Las observaciones se ven en cada tarjeta (Hooks, Meats, CTAs), con «Usar el arreglo».</p>}
          </div>
        )}
      </div>

      <TryAd state={state} rules={rules} busy={busy} onPreview={onPreview} />

      {webm > 0 && (
        <Notice tone="warn">
          {webm === 1 ? "Una pieza aprobada quedó" : `${webm} piezas aprobadas quedaron`} en caché como webm: este navegador no codifica H.264, así que los anuncios
          saldrían en MP4 con VP9, que algunas plataformas rechazan. Abrí la app en Chrome o Edge de escritorio, sacalas de la caché y la próxima tanda las
          renderiza en H.264.{" "}
          <button type="button" className="font-semibold underline" disabled={busy !== null} onClick={onDropWebm}>
            Sacarlas de la caché
          </button>
        </Notice>
      )}

      {overLimit && (
        <Notice tone="warn">
          Esta tanda ({ads.length}) supera el límite semanal: ya van {week} de {state.weeklyLimit}. Subí el límite o achicá la tanda.
        </Notice>
      )}
      {policy.length > 0 && <Notice tone="error">{policy.length} pieza(s) con promesas que la plataforma suele rechazar. Arreglalas antes de renderizar, o seguí bajo tu responsabilidad.</Notice>}

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => onRun(ads, mode, rules)} disabled={busy !== null || ads.length === 0 || overLimit}>
          {busy === "run" ? (
            <>
              <Spinner /> Renderizando…
            </>
          ) : (
            `Renderizar ${ads.length} anuncios`
          )}
        </Button>
        <span className="text-xs text-muted">
          Cada pieza se renderiza una vez (con su clip o imagen, subtítulo y titular) y los anuncios se arman uniendo piezas ya hechas. Todas comparten resolución, fps y pista de audio.
        </span>
      </div>
      {progress && (
        <div className="rounded-xl border border-line bg-white p-4 text-sm">
          <p className="font-semibold">
            {progress.stage === "pieces"
              ? "Renderizando piezas"
              : progress.stage === "ads"
                ? "Armando anuncios"
                : progress.stage === "voices"
                  ? "Generando voces"
                  : "Escribiendo el CSV"}{" "}
            · {progress.done}/{progress.total}
          </p>
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

      <div className="rounded-xl border border-line bg-white p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold">Tandas</h3>
          <span className="font-mono text-xs text-muted" title="Cada tanda es una carpeta con los videos (nombre = ID) y su CSV">
            {folder}/anuncios/
          </span>
        </div>
        {state.batches.length === 0 ? (
          <p className="mt-1 text-sm text-muted">Todavía no hay tandas.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {[...state.batches].reverse().map((b) => {
              const rendered = Object.keys(b.files).length;
              return (
                <li key={b.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                  <span className="font-mono text-xs">{b.id}</span>
                  <span>
                    {b.ads.length} anuncios · {b.seconds} s · {b.mode === "full" ? "completo" : "variar hook"}
                  </span>
                  <Tag>
                    {rendered}/{b.ads.length} videos
                  </Tag>
                  {[...new Set(b.ads.map((a) => a.level))].sort().map((l) => (
                    <LevelChip key={l} level={l} />
                  ))}
                  <span className="ml-auto flex gap-2">
                    <Button
                      variant="secondary"
                      className="px-2 py-1 text-xs"
                      onClick={async () => download(new Blob([await onBatchCsv(b.id)], { type: "text/csv" }), `${b.id}.csv`)}
                    >
                      Descargar CSV
                    </Button>
                    {rendered > 0 && (
                      <a className="rounded-lg border border-line px-2 py-1 text-xs font-semibold hover:border-ink" href={adsFileUrl(series, `anuncios/${b.id}/${Object.values(b.files)[0]}`)} target="_blank" rel="noreferrer">
                        Ver uno
                      </a>
                    )}
                    <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => confirm(`¿Borrar la tanda ${b.id} y sus videos?`) && onRemoveBatch(b.id)}>
                      Borrar
                    </Button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-2 text-xs text-muted">
          El CSV trae id, archivo, nivel, público (fría / retargeting), hook, meat, CTA, texto principal, titular, botón, tipo y formato; las versiones estáticas de los hooks de la tanda («Estáticos») van al final, como imagen, con su archivo en estaticos/. Si exportás estáticos después, volvé a descargar el CSV. Al subir el reporte de la plataforma con esos nombres, las métricas vuelven a cada pieza solas.
        </p>
      </div>
    </section>
  );
}

// "Probar un anuncio": pick a hook, a meat and a CTA and watch the ad cut from their pieces before a batch.
function TryAd({ state, rules, busy, onPreview }: { state: AdsState; rules: CombineRules; busy: string | null; onPreview: Props["onPreview"] }) {
  const hooks = state.hooks.filter((p) => p.status === "approved");
  const [hookId, setHookId] = useState("");
  const [meatId, setMeatId] = useState("");
  const [ctaId, setCtaId] = useState("");
  const [url, setUrl] = useState<string | null>(null);
  const hook = hooks.find((h) => h.id === hookId);
  // With the level rule on, only the meats and CTAs that serve the hook's level.
  const fits = (levels: number[]) => !rules.sameLevel || !hook || levels.includes(hook.level);
  const meats = state.meats.filter((p) => p.status === "approved" && fits(p.levels));
  const ctas = state.ctas.filter((p) => p.status === "approved" && fits(p.levels));
  const select = "mt-1 w-full rounded-lg border border-line bg-white px-2 py-1.5 text-sm";
  const short = (t: string) => (t.length > 60 ? `${t.slice(0, 59)}…` : t);
  return (
    <div className="rounded-xl border border-line bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">Probar un anuncio</h3>
        <span className="text-xs text-muted">Antes de la tanda: elegí las tres piezas y miralo armado.</span>
      </div>
      <div className="mt-2 grid gap-2 md:grid-cols-3">
        <label className="text-xs font-semibold">
          Hook
          <select className={select} value={hookId} onChange={(e) => setHookId(e.target.value)}>
            <option value="">Elegí…</option>
            {hooks.map((h) => (
              <option key={h.id} value={h.id}>
                {h.id} · N{h.level} · {short(h.text)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold">
          Meat
          <select className={select} value={meatId} onChange={(e) => setMeatId(e.target.value)}>
            <option value="">Elegí…</option>
            {meats.map((m) => (
              <option key={m.id} value={m.id}>
                {m.id} · {short(m.text)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold">
          CTA
          <select className={select} value={ctaId} onChange={(e) => setCtaId(e.target.value)}>
            <option value="">Elegí…</option>
            {ctas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.id} · {short(c.text)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="mt-3 flex flex-wrap items-start gap-3">
        <Button
          variant="secondary"
          disabled={busy !== null || !hookId || !meats.some((m) => m.id === meatId) || !ctas.some((c) => c.id === ctaId)}
          onClick={async () => setUrl(await onPreview(hookId, meatId, ctaId))}
        >
          {busy === "preview" ? (
            <>
              <Spinner /> Armando…
            </>
          ) : (
            "Armar y ver"
          )}
        </Button>
        {url && (
          <div className="flex items-start gap-2">
            <video src={url} controls className="max-h-80 rounded-lg border border-line bg-black" aria-label="El anuncio de prueba" />
            <a className="text-xs underline" href={url} download={`${hookId}-${meatId}-${ctaId}-prueba.mp4`}>
              Descargar
            </a>
          </div>
        )}
      </div>
      <p className="mt-2 text-xs text-muted">Las piezas que arma quedan en caché: la tanda no las vuelve a renderizar.</p>
    </div>
  );
}
