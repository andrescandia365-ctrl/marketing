// "Sin clave": next to a writer button, when no AI key is set. The person copies the exact prompt the writer would
// get, pastes it into claude.ai, and pastes the reply back; the app reads it as if the writer had answered
// (shared/handoff.ts on the server: same schema, same post-processing).
import { useState } from "react";
import { LONG_PROMPT, promptSizeText, type PromptOnly } from "../../shared/handoff.ts";
import { copyText } from "../lib/files.ts";
import { Button, Spinner, inputClass } from "./ui.tsx";

// What a writer button offers without a key: the prompt for claude.ai, and what to do with the pasted reply
// (resolves when it was used; a rejection's message is shown under the box).
export type Handoff = { prompt: () => Promise<PromptOnly>; paste: (reply: string) => Promise<unknown> };

type Props = {
  via: Handoff;
  // What the reply makes, for the box's label ("el menú", "la historia").
  what: string;
  // A short heading when the box is not right next to its button ("Aprobar → storyboard").
  title?: string;
  disabled?: boolean;
  className?: string;
};

export function ClaudeHandoff({ via, what, title, disabled = false, className = "" }: Props) {
  const [prompt, setPrompt] = useState<PromptOnly | null>(null);
  const [copied, setCopied] = useState(false);
  const [show, setShow] = useState(false);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState<"" | "prompt" | "paste">("");
  const [error, setError] = useState("");

  async function copy() {
    setBusy("prompt");
    setError("");
    setCopied(false);
    try {
      const p = await via.prompt();
      setPrompt(p);
      try {
        await copyText(p.prompt);
        setCopied(true);
      } catch {
        // Without the clipboard the prompt shows below to copy by hand.
        setShow(true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }

  async function use() {
    setBusy("paste");
    setError("");
    try {
      await via.paste(reply);
      setReply("");
      setPrompt(null);
      setCopied(false);
      setShow(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }

  return (
    <div className={`space-y-1.5 rounded-lg border border-dashed border-line bg-white p-2 text-xs ${className}`} aria-label="Con claude.ai, sin clave">
      <p className="font-semibold">{title ? `${title}, con claude.ai` : "Con claude.ai (sin clave)"}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" className="px-3 py-1 text-xs" onClick={copy} disabled={disabled || busy !== ""}>
          {busy === "prompt" ? <Spinner /> : null}
          {copied ? "Copiado ✓ (copiar de nuevo)" : "Copiar el prompt para claude.ai"}
        </Button>
        {prompt && (
          <button type="button" className="text-muted underline hover:text-ink" onClick={() => setShow((s) => !s)}>
            {show ? "Ocultar el prompt" : "Ver el prompt"}
          </button>
        )}
      </div>
      {prompt && <p className={prompt.chars > LONG_PROMPT ? "text-amber-700" : "text-muted"}>{promptSizeText(prompt.chars)}</p>}
      {show && prompt && (
        <textarea
          className={`${inputClass} font-mono text-[11px]`}
          rows={6}
          readOnly
          value={prompt.prompt}
          aria-label="Prompt para claude.ai"
          onFocus={(e) => e.target.select()}
        />
      )}
      <textarea
        className={`${inputClass} text-xs`}
        rows={2}
        value={reply}
        placeholder={`Pegá la respuesta de claude.ai (${what})`}
        aria-label={`Pegá la respuesta de claude.ai (${what})`}
        onChange={(e) => setReply(e.target.value)}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button className="px-3 py-1 text-xs" onClick={use} disabled={disabled || busy !== "" || !reply.trim()}>
          {busy === "paste" ? <Spinner /> : null} Usar esta respuesta
        </Button>
      </div>
      {error && (
        <p className="text-red-700" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
