// "Modelos": which AI writes and with which model, which one looks at pictures, and the API keys. Keys are typed
// here once and saved in the .env file on this computer; the app only ever shows their last four characters.
import { useEffect, useMemo, useState } from "react";
import type { ListedModel, SettingsView } from "../../shared/schema.ts";
import { DEMUCS_COST, DEMUCS_ENV, DEMUCS_INSTALL, DEMUCS_INSTALL_NEWER, DEMUCS_NOT_NEEDED, DEMUCS_USES } from "../../shared/demucs.ts";
import { api, type DemucsStatus } from "../lib/api.ts";
import { totalTokens, type KindAverage, type UsageEntry } from "../../shared/usage.ts";
import { Button, Notice, Spinner, inputClass } from "./ui.tsx";

const EFFORT_LABEL: Record<string, string> = { low: "Bajo", medium: "Medio", high: "Alto", xhigh: "Muy alto", max: "Máximo" };
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

type Choice = { provider: string; model: string };

export function ModelsPanel({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const [view, setView] = useState<SettingsView | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  useEffect(() => {
    api.settings().then(setView).catch((e) => setError(message(e)));
  }, []);

  async function run(label: string, fn: () => Promise<SettingsView | void>) {
    setError("");
    setBusy(label);
    try {
      const next = await fn();
      if (next) {
        setView(next);
        onChanged();
      }
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <aside
        role="dialog"
        aria-label="Modelos"
        className="h-full w-full max-w-2xl space-y-6 overflow-y-auto bg-paper p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">Modelos</h2>
          <Button variant="ghost" className="px-2 py-1 text-xs" onClick={onClose}>
            Cerrar
          </Button>
        </div>
        {error && <Notice tone="error">{error}</Notice>}
        {!view ? (
          <p className="text-sm text-muted">
            <Spinner /> Cargando…
          </p>
        ) : (
          <>
            <WriterSection view={view} busy={busy} run={run} />
            <VisionSection view={view} busy={busy} run={run} />
            <KeysSection view={view} busy={busy} run={run} />
          </>
        )}
        <DemucsSection onChanged={onChanged} />
        <UsageSection />
      </aside>
    </div>
  );
}

type SectionProps = { view: SettingsView; busy: string; run: (label: string, fn: () => Promise<SettingsView | void>) => Promise<void> };

function WriterSection({ view, busy, run }: SectionProps) {
  const [choice, setChoice] = useState<Choice>(() => view.writer ?? { provider: view.providers.find((p) => p.ready)?.id ?? "claude", model: "" });
  const [efforts, setEfforts] = useState<string[]>([]);
  const provider = view.providers.find((p) => p.id === choice.provider);
  const model = choice.model || provider?.model || "";
  const changed = !view.writer || view.writer.provider !== choice.provider || view.writer.model !== model;

  useEffect(() => {
    if (choice.provider !== "claude" || !model) return setEfforts([]);
    api
      .efforts(model)
      .then((r) => setEfforts(r.efforts))
      .catch(() => setEfforts([]));
  }, [choice.provider, model]);

  return (
    <section className="space-y-3 rounded-xl border border-line bg-white p-4">
      <div>
        <h3 className="font-bold">Quién escribe</h3>
        <p className="text-xs text-muted">Menú, historia, storyboard, explicativos y revisiones. Ahora: {view.writer ? `${label(view, view.writer.provider)} · ${view.writer.model}` : "nadie (modo de muestra)"}.</p>
      </div>
      <ModelPicker view={view} value={{ provider: choice.provider, model }} onChange={setChoice} />
      {choice.provider === "claude" && efforts.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-semibold">Esfuerzo</span>
          {efforts.map((e) => (
            <button
              key={e}
              type="button"
              disabled={busy !== ""}
              onClick={() => run("effort", () => api.saveEffort(e))}
              className={`rounded-full border px-2.5 py-1 ${view.effort === e ? "border-ink bg-ink text-white" : "border-line bg-white hover:border-ink"}`}
            >
              {EFFORT_LABEL[e] ?? e}
            </button>
          ))}
          <span className="text-muted">Más esfuerzo piensa más: tarda y cuesta más.</span>
        </div>
      )}
      {choice.provider === "claude" && model && efforts.length === 0 && (
        <p className="text-xs text-muted">Este modelo no tiene niveles de esfuerzo: contesta sin pensamiento extendido.</p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={!provider?.ready || !model || !changed || busy !== ""} onClick={() => run("writer", () => api.saveWriter(choice.provider, model))}>
          {busy === "writer" ? <Spinner /> : null} Usar para escribir
        </Button>
        <TestButton provider={choice.provider} model={model} vision={false} disabled={!provider?.ready || !model} />
      </div>
    </section>
  );
}

function VisionSection({ view, busy, run }: SectionProps) {
  const [separate, setSeparate] = useState(Boolean(view.vision));
  const [choice, setChoice] = useState<Choice>(() => view.vision ?? view.writer ?? { provider: "claude", model: "" });
  const provider = view.providers.find((p) => p.id === choice.provider);
  const model = choice.model || provider?.model || "";
  return (
    <section className="space-y-3 rounded-xl border border-line bg-white p-4">
      <div>
        <h3 className="font-bold">Quién mira las imágenes</h3>
        <p className="text-xs text-muted">La revisión de lo que subís y el control de calidad de los explicativos le mandan fotos. Necesita un modelo que vea imágenes.</p>
      </div>
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-1.5">
          <input
            type="radio"
            checked={!separate}
            onChange={() => {
              setSeparate(false);
              if (view.vision) run("vision", () => api.saveVision(null, null));
            }}
          />
          La misma IA que escribe
        </label>
        <label className="flex items-center gap-1.5">
          <input type="radio" checked={separate} onChange={() => setSeparate(true)} />
          Otra
        </label>
      </div>
      {separate && (
        <>
          <ModelPicker view={view} value={{ provider: choice.provider, model }} onChange={setChoice} visionHint />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              disabled={!provider?.ready || !model || busy !== "" || (view.vision?.provider === choice.provider && view.vision.model === model)}
              onClick={() => run("vision", () => api.saveVision(choice.provider, model))}
            >
              {busy === "vision" ? <Spinner /> : null} Usar para mirar imágenes
            </Button>
            <TestButton provider={choice.provider} model={model} vision disabled={!provider?.ready || !model} />
          </div>
        </>
      )}
      {!separate && <TestButton provider={view.writer?.provider ?? ""} model={view.writer?.model ?? ""} vision disabled={!view.writer} />}
    </section>
  );
}

const label = (view: SettingsView, id: string) => view.providers.find((p) => p.id === id)?.label ?? id;

// Provider buttons, the model name (typed, or picked from the provider's live list).
function ModelPicker({ view, value, onChange, visionHint }: { view: SettingsView; value: Choice; onChange: (c: Choice) => void; visionHint?: boolean }) {
  const [list, setList] = useState<ListedModel[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState("");
  const [filter, setFilter] = useState("");
  const provider = view.providers.find((p) => p.id === value.provider);

  useEffect(() => {
    setList(null);
    setListError("");
    setFilter("");
  }, [value.provider]);

  const shown = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return (list ?? []).filter((m) => !f || m.id.toLowerCase().includes(f) || m.name.toLowerCase().includes(f)).slice(0, 60);
  }, [list, filter]);

  async function load() {
    setLoading(true);
    setListError("");
    try {
      setList((await api.models(value.provider)).models);
    } catch (e) {
      setListError(message(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {view.providers.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onChange({ provider: p.id, model: p.model })}
            title={p.ready ? "" : "Falta su clave (abajo)"}
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${
              value.provider === p.id ? "border-ink bg-ink text-white" : p.ready ? "border-line bg-white hover:border-ink" : "border-dashed border-line bg-white text-muted"
            }`}
          >
            {p.label}
            {p.ready ? "" : " · sin clave"}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          className={`${inputClass} min-w-0 flex-1 py-1.5 font-mono text-sm`}
          value={value.model}
          placeholder={provider?.model ?? "nombre del modelo"}
          aria-label="Modelo"
          onChange={(e) => onChange({ ...value, model: e.target.value.trim() })}
        />
        <Button variant="secondary" className="px-3 py-1.5 text-xs" disabled={!provider?.ready || loading} onClick={load}>
          {loading ? <Spinner /> : null} Ver modelos
        </Button>
      </div>
      {listError && <p className="text-xs text-neg">{listError}</p>}
      {list && (
        <div className="rounded-lg border border-line bg-paper p-2">
          <input className={`${inputClass} mb-2 py-1 text-xs`} value={filter} placeholder={`Buscar entre ${list.length} modelos…`} aria-label="Buscar modelo" onChange={(e) => setFilter(e.target.value)} />
          <ul className="max-h-56 space-y-0.5 overflow-y-auto text-xs">
            {shown.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => onChange({ ...value, model: m.id })}
                  className={`flex w-full flex-wrap items-center gap-2 rounded px-2 py-1 text-left hover:bg-white ${value.model === m.id ? "bg-white font-semibold" : ""}`}
                >
                  <span className="font-mono">{m.id}</span>
                  {m.name !== m.id && <span className="text-muted">{m.name}</span>}
                  {m.vision === true && <span className="rounded bg-good-soft px-1 text-good">ve imágenes</span>}
                  {m.vision === false && visionHint && <span className="rounded bg-neg-soft px-1 text-neg">no ve imágenes</span>}
                  {m.structured === false && <span className="rounded bg-neg-soft px-1 text-neg">sin JSON con forma fija</span>}
                </button>
              </li>
            ))}
            {!shown.length && <li className="px-2 py-1 text-muted">Ninguno coincide.</li>}
          </ul>
          {list.length > shown.length && <p className="mt-1 text-[11px] text-muted">Se ven los primeros 60; buscá para achicar la lista.</p>}
        </div>
      )}
    </div>
  );
}

function TestButton({ provider, model, vision, disabled }: { provider: string; model: string; vision: boolean; disabled: boolean }) {
  const [state, setState] = useState<{ busy: boolean; text: string; ok: boolean } | null>(null);
  useEffect(() => setState(null), [provider, model]);
  return (
    <span className="flex flex-wrap items-center gap-2 text-xs">
      <Button
        variant="secondary"
        className="px-3 py-1.5 text-xs"
        disabled={disabled || state?.busy}
        onClick={async () => {
          setState({ busy: true, text: "", ok: false });
          try {
            setState({ busy: false, text: (await api.testModel(provider, model, vision)).result, ok: true });
          } catch (e) {
            setState({ busy: false, text: message(e), ok: false });
          }
        }}
      >
        {state?.busy ? <Spinner /> : null} {vision ? "Probar con una imagen" : "Probar"}
      </Button>
      {state && !state.busy && <span className={state.ok ? "text-good" : "text-neg"}>{state.ok ? `✓ ${state.text}` : state.text}</span>}
    </span>
  );
}

function KeysSection({ view, busy, run }: SectionProps) {
  const rows = [
    ...view.providers.map((p) => ({ name: p.id, label: p.label, use: "Escribir y mirar imágenes", hint: p.hint, set: p.ready, keyEnd: p.keyEnd, editable: p.editable })),
    ...view.keys.map((k) => ({ ...k, editable: true })),
  ];
  return (
    <section className="space-y-3 rounded-xl border border-line bg-white p-4">
      <div>
        <h3 className="font-bold">Claves</h3>
        <p className="text-xs text-muted">
          Se guardan en el archivo <code>.env</code> de esta compu (nunca van a GitHub ni al navegador). Acá solo se ven los últimos 4 caracteres. No las pegues en ningún chat.
        </p>
      </div>
      <ul className="space-y-3">
        {rows.map((r) => (
          <KeyRow key={r.name} row={r} busy={busy} run={run} />
        ))}
      </ul>
    </section>
  );
}

function KeyRow({
  row,
  busy,
  run,
}: {
  row: { name: string; label: string; use: string; hint: string; set: boolean; keyEnd: string; editable: boolean };
  busy: string;
  run: SectionProps["run"];
}) {
  const [value, setValue] = useState("");
  return (
    <li className="space-y-1.5 border-t border-line/60 pt-3 first:border-0 first:pt-0">
      <div className="flex flex-wrap items-baseline gap-2 text-sm">
        <b>{row.label}</b>
        <span className="text-xs text-muted">{row.use}</span>
        <span className={`ml-auto text-xs font-semibold ${row.set ? "text-good" : "text-muted"}`}>{row.set ? `✓ ${row.keyEnd}` : "Falta"}</span>
      </div>
      {row.editable ? (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!value.trim()) return;
            run(`key-${row.name}`, async () => {
              const next = await api.saveKey(row.name, value.trim());
              setValue("");
              return next;
            });
          }}
        >
          <input
            type="password"
            autoComplete="off"
            className={`${inputClass} min-w-0 flex-1 py-1.5 text-sm`}
            value={value}
            placeholder={row.set ? "Pegá otra para cambiarla" : row.hint}
            aria-label={`Clave de ${row.label}`}
            onChange={(e) => setValue(e.target.value)}
          />
          <Button type="submit" variant="secondary" className="px-3 py-1.5 text-xs" disabled={!value.trim() || busy !== ""}>
            {busy === `key-${row.name}` ? <Spinner /> : null} Guardar
          </Button>
          {row.set && row.keyEnd && !row.keyEnd.startsWith("(") && (
            <Button
              type="button"
              variant="ghost"
              className="px-2 py-1.5 text-xs text-neg"
              disabled={busy !== ""}
              onClick={() => {
                if (confirm(`¿Borrar la clave de ${row.label} de esta compu?`)) run(`key-${row.name}`, () => api.saveKey(row.name, null));
              }}
            >
              Borrar
            </Button>
          )}
        </form>
      ) : (
        <p className="text-xs text-muted">{row.hint}</p>
      )}
    </li>
  );
}

// Demucs, installed by the person on this computer: whether the app finds it, where it helps and when to turn it on,
// how to install it, and a four-second test run.
function DemucsSection({ onChanged }: { onChanged: () => void }) {
  const [state, setState] = useState<{ demucs: DemucsStatus; ffmpeg: boolean } | null>(null);
  const [bin, setBin] = useState("");
  const [busy, setBusy] = useState<"" | "look" | "save" | "test">("");
  const [error, setError] = useState("");
  const [tested, setTested] = useState("");

  async function act(label: "look" | "save" | "test", fn: () => Promise<void>) {
    setBusy(label);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy("");
    }
  }
  const look = () =>
    act("look", async () => {
      setState(await api.demucs());
      onChanged();
    });

  useEffect(() => {
    api.demucs().then(setState, (e) => setError(message(e)));
  }, []);

  const ready = state?.demucs.ready ?? false;
  return (
    <section className="space-y-3 rounded-xl border border-line bg-white p-4" aria-label="Demucs">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-bold">Demucs · separar batería y voz</h3>
          <p className="text-xs text-muted">
            Opcional, lo instalás vos en esta compu. Separa un tema en pistas para los dos relojes: el corte va al bombo de la batería y la
            palabra a la voz. Sin Demucs todo anda igual subiendo esas pistas a mano.
          </p>
        </div>
        {state && (
          <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${ready ? "border-good/40 bg-good-soft text-good" : "border-line text-muted"}`}>
            {ready ? "Instalado" : "No está en esta compu"}
          </span>
        )}
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      {state && ready && (
        <p className="text-xs">
          La app lo llama con <code>{state.demucs.command}</code> · modelo <code>{state.demucs.model}</code> ·{" "}
          {state.demucs.songs === 1 ? "1 tema ya separado" : `${state.demucs.songs} temas ya separados`}.
        </p>
      )}
      {state && ready && !state.ffmpeg && (
        <Notice tone="warn">Sin ffmpeg, Demucs solo lee WAV: un mp3 o un m4a no se puede separar. Instalá ffmpeg (bash iniciar.sh lo ofrece).</Notice>
      )}

      <div className="space-y-1.5">
        <p className="text-sm font-semibold">Cuándo activarlo</p>
        <ul className="space-y-2 text-sm">
          {DEMUCS_USES.map((use) => (
            <li key={use.where}>
              <b>{use.where}.</b> {use.when} <span className="text-muted">{use.how}</span>
            </li>
          ))}
        </ul>
        <p className="pt-1 text-sm font-semibold">No hace falta</p>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
          {DEMUCS_NOT_NEEDED.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p className="text-xs text-muted">{DEMUCS_COST}</p>
      </div>

      {state && !ready && (
        <div className="space-y-2 rounded-lg border border-line p-3 text-sm">
          <p className="font-semibold">Cómo instalarlo</p>
          <p className="text-xs text-muted">En la Terminal, en su propio entorno de Python:</p>
          <pre className="overflow-x-auto rounded-lg bg-paper p-2 font-mono text-xs">{DEMUCS_INSTALL.join("\n")}</pre>
          <p className="text-xs text-muted">
            Si pip no encuentra <code>torchaudio&lt;2.9</code> (pasa con un Python muy nuevo), la segunda línea es <code>{DEMUCS_INSTALL_NEWER}</code>.
          </p>
          <p className="text-xs text-muted">
            Después decile a la app dónde quedó (se guarda en .env como <code>{DEMUCS_ENV}</code>). Si <code>demucs</code> ya anda en la
            Terminal (por ejemplo con pipx), alcanza con «Volver a buscar».
          </p>
          <div className="flex flex-wrap gap-2">
            <input
              className={`${inputClass} flex-1 font-mono text-xs`}
              placeholder="~/demucs/bin/demucs"
              aria-label="Dónde está Demucs"
              value={bin}
              onChange={(e) => setBin(e.target.value)}
            />
            <Button
              variant="secondary"
              disabled={busy !== "" || !bin.trim()}
              onClick={() =>
                act("save", async () => {
                  setState(await api.saveDemucsBin(bin.trim()));
                  onChanged();
                })
              }
            >
              {busy === "save" ? <Spinner /> : "Guardar"}
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" disabled={busy !== ""} onClick={() => void look()}>
          {busy === "look" ? <Spinner /> : "Volver a buscar"}
        </Button>
        {ready && (
          <Button
            variant="secondary"
            disabled={busy !== ""}
            onClick={() =>
              act("test", async () => {
                setTested("");
                const result = await api.testDemucs();
                setTested(`Anduvo: separó 4 segundos de prueba en ${result.seconds} s.`);
              })
            }
          >
            {busy === "test" ? (
              <>
                <Spinner /> Probando (la primera vez baja el modelo)…
              </>
            ) : (
              "Probar Demucs"
            )}
          </Button>
        )}
        {state?.demucs.envBin && (
          <Button
            variant="ghost"
            className="text-xs"
            disabled={busy !== ""}
            onClick={() =>
              act("save", async () => {
                setState(await api.saveDemucsBin(null));
                onChanged();
              })
            }
          >
            Olvidar la ruta
          </Button>
        )}
        {tested && <span className="text-sm text-good">{tested}</span>}
      </div>
    </section>
  );
}

// Tokens of the last writer requests, as each provider reported them, and what each kind of request uses on average.
// Tokens, not money: a price only when the provider sends one.
const tokensText = (n: number) => n.toLocaleString("es-AR");
const roughTokens = (n: number) => (n >= 1000 ? `~${(Math.round(n / 100) * 100).toLocaleString("es-AR")}` : tokensText(n));
const timeText = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
};

function UsageSection() {
  const [data, setData] = useState<{ entries: UsageEntry[]; averages: KindAverage[] } | null>(null);
  const [error, setError] = useState("");
  const [all, setAll] = useState(false);
  const load = () => {
    setError("");
    api.usage().then(setData, (e) => setError(message(e)));
  };
  useEffect(load, []);
  const shown = data ? (all ? data.entries : data.entries.slice(0, 12)) : [];
  return (
    <section className="space-y-3 rounded-xl border border-line bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-bold">Tokens por pedido</h3>
          <p className="text-xs text-muted">
            Lo que cada pedido a la IA usó, según lo que devuelve el proveedor (los últimos 200). Con Claude, la parte fija va en caché y sale más
            barata; con los demás se manda entera cada vez. Son tokens, no plata: el precio aparece solo si el proveedor lo dice.
          </p>
        </div>
        <Button variant="ghost" className="shrink-0 px-2 py-1 text-xs" onClick={load}>
          Actualizar
        </Button>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      {!data ? (
        !error && (
          <p className="text-sm text-muted">
            <Spinner /> Cargando…
          </p>
        )
      ) : data.entries.length === 0 ? (
        <p className="text-sm text-muted">Todavía no hay pedidos. Aparecen acá cuando la IA escribe algo (en modo de muestra no se usa ninguna).</p>
      ) : (
        <>
          {data.averages.length > 0 && (
            <div className="space-y-1">
              <h4 className="text-sm font-semibold">En promedio</h4>
              <ul className="grid gap-x-4 gap-y-0.5 text-xs sm:grid-cols-2">
                {data.averages.map((a) => (
                  <li key={a.kind} className="flex justify-between gap-2" title={`Entrada ${tokensText(a.input)} · caché ${tokensText(a.cacheRead + a.cacheWrite)} · salida ${tokensText(a.output)}`}>
                    <span>{a.kind}</span>
                    <span className="tabular-nums text-muted">
                      {roughTokens(a.total)} tokens{a.count > 1 ? ` (${a.count} pedidos)` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-xs tabular-nums">
              <thead className="text-left text-muted">
                <tr>
                  <th className="py-1 pr-2 font-semibold">Cuándo</th>
                  <th className="py-1 pr-2 font-semibold">Qué</th>
                  <th className="py-1 pr-2 text-right font-semibold" title="Lo que se mandó y se leyó entero">Entrada</th>
                  <th className="py-1 pr-2 text-right font-semibold" title="Leído de la caché + escrito en la caché">Caché</th>
                  <th className="py-1 pr-2 text-right font-semibold" title="La respuesta, con lo que pensó">Salida</th>
                  <th className="py-1 text-right font-semibold">Total</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((e, i) => (
                  <tr key={`${e.at}-${i}`} className="border-t border-line/60 align-top">
                    <td className="whitespace-nowrap py-1 pr-2 text-muted">{timeText(e.at)}</td>
                    <td className="py-1 pr-2">
                      {e.kind}
                      <span className="block text-[11px] text-muted">
                        {e.model}
                        {e.calls > 1 ? ` · ${e.calls} intentos` : ""}
                        {e.ok ? "" : " · terminó con error"}
                        {e.cost !== undefined ? ` · US$ ${e.cost.toFixed(4)} según el proveedor` : ""}
                      </span>
                    </td>
                    {e.tokens ? (
                      <>
                        <td className="py-1 pr-2 text-right">{tokensText(e.tokens.input)}</td>
                        <td className="py-1 pr-2 text-right" title={`Leído ${tokensText(e.tokens.cacheRead)} · escrito ${tokensText(e.tokens.cacheWrite)}`}>
                          {tokensText(e.tokens.cacheRead + e.tokens.cacheWrite)}
                        </td>
                        <td className="py-1 pr-2 text-right" title={e.tokens.reasoning ? `${tokensText(e.tokens.reasoning)} pensando` : undefined}>
                          {tokensText(e.tokens.output)}
                        </td>
                        <td className="py-1 text-right font-semibold">{tokensText(totalTokens(e.tokens))}</td>
                      </>
                    ) : (
                      <td colSpan={4} className="py-1 text-right text-muted">
                        El proveedor no dijo cuántos
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.entries.length > 12 && (
            <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => setAll(!all)}>
              {all ? "Ver menos" : `Ver los ${data.entries.length}`}
            </Button>
          )}
        </>
      )}
    </section>
  );
}
