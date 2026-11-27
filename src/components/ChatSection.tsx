// "Chat": talk to Claude through the API key, outside any piece (no claude.ai plan needed). The person picks the model
// (with its price), how hard it thinks, and up to four skills from skills/ that join the conversation; pictures can go
// with a message (for example a reference photo for "escena-de-referencia"). Conversations are saved on this computer
// (server/chat.ts). With no Claude key it says where to put one and offers the same conversation as text for claude.ai.
import { useEffect, useRef, useState } from "react";
import {
  CHAT_EFFORTS,
  CHAT_EFFORT_LABEL,
  CHAT_MAX_IMAGES,
  CHAT_MAX_SKILLS,
  CHAT_MODELS,
  DEFAULT_CHAT_MODEL,
  type ChatMessage,
  type ChatModelId,
  type ChatSummary,
  type SkillInfo,
} from "../../shared/chat.ts";
import { costText } from "../../shared/mediaModels.ts";
import { api, sendChat } from "../lib/api.ts";
import { copyText, pictureForReview, readImageFile } from "../lib/files.ts";
import { takeChatHandoff } from "../lib/chatHandoff.ts";
import { Button, Notice, Spinner } from "./ui.tsx";

const PREFS_KEY = "playbook-studio.chat.v1";
type Prefs = { model: ChatModelId; effort: (typeof CHAT_EFFORTS)[number]; skills: string[] };
function readPrefs(): Prefs {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") as Partial<Prefs>;
    return {
      model: CHAT_MODELS.some((m) => m.id === p.model) ? (p.model as ChatModelId) : DEFAULT_CHAT_MODEL,
      effort: CHAT_EFFORTS.includes(p.effort as Prefs["effort"]) ? (p.effort as Prefs["effort"]) : "medium",
      skills: Array.isArray(p.skills) ? p.skills.filter((s) => typeof s === "string").slice(0, CHAT_MAX_SKILLS) : [],
    };
  } catch {
    return { model: DEFAULT_CHAT_MODEL, effort: "medium", skills: [] };
  }
}
function savePrefs(p: Prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    /* private window */
  }
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const when = (at: string) => new Date(at).toLocaleString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

// A reply as text and fenced blocks; each block gets its own copy button (prompts usually come in one).
function Reply({ text }: { text: string }) {
  const parts = text.split(/```[a-zA-Z0-9-]*\n?/);
  return (
    <div className="space-y-2">
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <div key={i} className="overflow-hidden rounded-md border border-line bg-paper">
            <div className="flex justify-end border-b border-line px-2 py-0.5">
              <CopySmall text={part.trim()} />
            </div>
            <pre className="overflow-x-auto px-3 py-2 text-xs whitespace-pre-wrap">{part.trim()}</pre>
          </div>
        ) : part.trim() ? (
          <p key={i} className="text-sm whitespace-pre-wrap">
            {part.trim()}
          </p>
        ) : null,
      )}
    </div>
  );
}

function CopySmall({ text, label = "Copiar" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="text-xs font-semibold text-muted hover:text-ink"
      onClick={async () => {
        try {
          await copyText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          /* the person can select it by hand */
        }
      }}
    >
      {done ? "Copiado ✓" : label}
    </button>
  );
}

export function ChatSection({ ready, onShowModels }: { ready: boolean; onShowModels: () => void }) {
  const [prefs, setPrefs] = useState<Prefs>(readPrefs);
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [id, setId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [streaming, setStreaming] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [spent, setSpent] = useState<number | null>(null);
  const stop = useRef<AbortController | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // "Al chat" from a shot: its prompt waits in the box with the skills that fit, in a new conversation.
    const handoff = takeChatHandoff();
    if (handoff) {
      setDraft(handoff.text);
      if (handoff.skills.length) update({ skills: handoff.skills.slice(0, CHAT_MAX_SKILLS) });
    }
    api.skills().then((r) => setSkills(r.skills), () => setSkills([]));
    api.chats().then((r) => setChats(r.chats), () => setChats([]));
  }, []);
  // Braces: newer browsers return a promise from scrollIntoView, and an effect must return nothing or a cleanup.
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages.length, streaming]);

  const update = (p: Partial<Prefs>) => {
    const next = { ...prefs, ...p };
    setPrefs(next);
    savePrefs(next);
  };
  const activeSkills = prefs.skills.filter((s) => skills.some((k) => k.id === s));

  async function open(chatId: string) {
    setError("");
    try {
      const chat = await api.chat(chatId);
      setId(chat.id);
      setMessages(chat.messages);
      setSpent(chat.usd);
      update({ skills: chat.skills.slice(0, CHAT_MAX_SKILLS) });
    } catch (e) {
      setError(message(e));
    }
  }
  function fresh() {
    stop.current?.abort();
    setId(null);
    setMessages([]);
    setSpent(null);
    setDraft("");
    setImages([]);
    setError("");
  }

  async function attach(files: FileList | null) {
    if (!files) return;
    setError("");
    try {
      const add: string[] = [];
      for (const f of [...files].slice(0, CHAT_MAX_IMAGES - images.length)) {
        const url = await readImageFile(f);
        add.push((await pictureForReview(url, 1568)).jpeg);
      }
      setImages((now) => [...now, ...add].slice(0, CHAT_MAX_IMAGES));
    } catch (e) {
      setError(message(e));
    }
  }

  async function send() {
    const text = draft.trim();
    if ((!text && !images.length) || busy) return;
    const next: ChatMessage[] = [...messages, { role: "user", text, images }];
    setMessages(next);
    setDraft("");
    setImages([]);
    setError("");
    setStreaming("");
    setBusy(true);
    const ctrl = new AbortController();
    stop.current = ctrl;
    let got = "";
    try {
      const done = await sendChat(
        { id: id ?? undefined, model: prefs.model, effort: prefs.effort, skills: activeSkills, messages: next },
        {
          onStart: (newId) => setId(newId),
          onText: (d) => {
            got += d;
            setStreaming(got);
          },
        },
        ctrl.signal,
      );
      setMessages([...next, { role: "assistant", text: done.text, images: [] }]);
      setSpent((s) => (s ?? 0) + done.usd);
      api.chats().then((r) => setChats(r.chats), () => undefined);
    } catch (e) {
      if (ctrl.signal.aborted) {
        if (got) setMessages([...next, { role: "assistant", text: `${got}\n\n(La paraste acá.)`, images: [] }]);
      } else setError(message(e));
    } finally {
      setStreaming("");
      setBusy(false);
      stop.current = null;
    }
  }

  async function copyForClaudeAi() {
    try {
      const pending: ChatMessage[] = draft.trim() || images.length ? [...messages, { role: "user", text: draft.trim(), images }] : messages;
      const { text } = await api.chatCopy(activeSkills, pending);
      await copyText(text);
      setError("");
      setStreaming("");
      alert("Copiado: pegalo en claude.ai (las imágenes se suben aparte).");
    } catch (e) {
      setError(message(e));
    }
  }

  const model = CHAT_MODELS.find((m) => m.id === prefs.model) ?? CHAT_MODELS[0];

  return (
    <section className="mt-6 grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="space-y-4">
        <Button variant="secondary" className="w-full" onClick={fresh}>
          + Conversación nueva
        </Button>
        <div className="space-y-1">
          <p className="text-xs font-semibold text-muted">Conversaciones</p>
          {chats.length === 0 && <p className="text-xs text-muted">Todavía no hay ninguna.</p>}
          <ul className="max-h-80 space-y-1 overflow-y-auto">
            {chats.map((c) => (
              <li key={c.id} className={`group flex items-start gap-1 rounded-md px-2 py-1 text-xs ${c.id === id ? "bg-ink text-white" : "hover:bg-black/5"}`}>
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => void open(c.id)}>
                  <span className="block truncate font-semibold">{c.title}</span>
                  <span className={c.id === id ? "text-white/70" : "text-muted"}>
                    {when(c.updated)} · {costText(c.usd)}
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={`Borrar «${c.title}»`}
                  className="opacity-50 hover:opacity-100"
                  onClick={async () => {
                    if (!confirm(`¿Borrar «${c.title}»?`)) return;
                    try {
                      setChats((await api.deleteChat(c.id)).chats);
                      if (c.id === id) fresh();
                    } catch (e) {
                      setError(message(e));
                    }
                  }}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="space-y-1">
          <p className="text-xs font-semibold text-muted">
            Skills ({activeSkills.length}/{CHAT_MAX_SKILLS})
          </p>
          {skills.length === 0 && <p className="text-xs text-muted">No hay skills en la carpeta skills/.</p>}
          <ul className="max-h-[55vh] space-y-1 overflow-y-auto pr-1">
            {skills.map((k) => {
              const on = activeSkills.includes(k.id);
              return (
                <li key={k.id} className="rounded-md border border-line bg-white p-1.5 text-xs">
                  <label className="flex items-start gap-1.5" title={k.description}>
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={!on && activeSkills.length >= CHAT_MAX_SKILLS}
                      onChange={(e) => update({ skills: e.target.checked ? [...activeSkills, k.id] : activeSkills.filter((s) => s !== k.id) })}
                    />
                    <span className="min-w-0">
                      <b className="font-mono">/{k.id}</b>
                      <span className="line-clamp-2 text-muted">{k.description}</span>
                    </span>
                  </label>
                  <a className="mt-0.5 block text-right text-muted underline hover:text-ink" href={api.skillZipUrl(k.id)} download={`${k.id}.zip`}>
                    Bajar .zip para claude.ai
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      </aside>

      <div className="flex h-[78vh] min-h-[420px] flex-col rounded-xl border border-line bg-white">
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-2 text-xs">
          <select
            className="rounded border border-line bg-white px-1.5 py-1"
            value={prefs.model}
            onChange={(e) => update({ model: e.target.value as ChatModelId })}
            aria-label="Modelo"
          >
            {CHAT_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label} · US$ {m.input} / {m.output} por millón
              </option>
            ))}
          </select>
          <select
            className="rounded border border-line bg-white px-1.5 py-1"
            value={prefs.effort}
            onChange={(e) => update({ effort: e.target.value as Prefs["effort"] })}
            aria-label="Cuánto piensa"
          >
            {CHAT_EFFORTS.map((e) => (
              <option key={e} value={e}>
                {CHAT_EFFORT_LABEL[e]}
              </option>
            ))}
          </select>
          {activeSkills.length > 0 && <span className="text-muted">Con: {activeSkills.map((s) => `/${s}`).join(", ")}</span>}
          {spent !== null && <span className="ml-auto text-muted">Esta conversación: ≈ {costText(spent)}</span>}
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-3">
          {!ready && (
            <Notice tone="warn">
              Para charlar acá hace falta la clave de Claude (Anthropic): se paga por uso, sin plan Pro.{" "}
              <button type="button" className="font-semibold underline" onClick={onShowModels}>
                Cargala en Modelos
              </button>
              . Mientras tanto, «Copiar para claude.ai» arma lo mismo para pegarlo allá.
            </Notice>
          )}
          {messages.length === 0 && ready && (
            <p className="text-sm text-muted">
              Preguntale lo que quieras. Para prompts, prendé la skill que toca a la izquierda (por ejemplo /seedance-prompts) y contale la toma. Para
              recrear una foto con otra persona, prendé /escena-de-referencia y adjuntá la foto. Modelo actual: {model.label}.
            </p>
          )}
          {messages.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="ml-auto max-w-[85%] space-y-1 rounded-xl bg-ink px-3 py-2 text-white">
                {m.images.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {m.images.map((img, j) => (
                      <img key={j} src={`data:image/jpeg;base64,${img}`} alt="" className="h-20 rounded object-cover" />
                    ))}
                  </div>
                )}
                {m.text && <p className="text-sm whitespace-pre-wrap">{m.text}</p>}
              </div>
            ) : (
              <div key={i} className="max-w-[95%] space-y-1">
                <Reply text={m.text} />
                <CopySmall text={m.text} label="Copiar respuesta" />
              </div>
            ),
          )}
          {busy && (
            <div className="max-w-[95%]">
              {streaming ? <Reply text={streaming} /> : <Spinner />}
            </div>
          )}
          {error && <Notice tone="error">{error}</Notice>}
          <div ref={bottom} />
        </div>

        <div className="space-y-1.5 border-t border-line p-2">
          {images.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {images.map((img, j) => (
                <span key={j} className="relative">
                  <img src={`data:image/jpeg;base64,${img}`} alt="" className="h-16 rounded object-cover" />
                  <button
                    type="button"
                    aria-label="Sacar la imagen"
                    className="absolute -top-1 -right-1 grid size-4 place-items-center rounded-full bg-white text-[10px] shadow"
                    onClick={() => setImages((now) => now.filter((_, k) => k !== j))}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          <textarea
            aria-label="Tu mensaje"
            className="block w-full resize-y rounded-md border border-line px-3 py-2 text-sm"
            rows={3}
            placeholder="Escribí… (Enter manda, Shift+Enter baja de línea)"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                if (ready) void send();
              }
            }}
          />
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <label className="cursor-pointer rounded-md border border-line px-2 py-1 font-semibold hover:border-ink">
              Adjuntar imagen
              <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => void attach(e.target.files)} />
            </label>
            <span className="text-muted">Hasta {CHAT_MAX_IMAGES} por mensaje. Solo fotos que tengas derecho a usar.</span>
            <span className="ml-auto flex items-center gap-2">
              <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => void copyForClaudeAi()}>
                Copiar para claude.ai
              </Button>
              {busy ? (
                <Button variant="secondary" className="px-3 py-1 text-xs" onClick={() => stop.current?.abort()}>
                  Parar
                </Button>
              ) : (
                <Button className="px-3 py-1 text-xs" disabled={!ready || (!draft.trim() && !images.length)} onClick={() => void send()}>
                  Mandar
                </Button>
              )}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
