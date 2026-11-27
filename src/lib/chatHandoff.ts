// "Al chat": a prompt from a shot (or anywhere) goes to the Chat section with the skills that fit, ready to send. The
// text waits in sessionStorage so the lazily loaded chat finds it when it opens; the event tells App to switch.
const KEY = "playbook-studio.chat-handoff";
export const CHAT_EVENT = "playbook-open-chat";

export type ChatHandoff = { text: string; skills: string[] };

export function openChat(handoff: ChatHandoff) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(handoff));
  } catch {
    /* private window: the chat opens empty */
  }
  window.dispatchEvent(new CustomEvent(CHAT_EVENT));
}

// Read once: the chat takes it and it is gone.
export function takeChatHandoff(): ChatHandoff | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    if (!raw) return null;
    const h = JSON.parse(raw) as Partial<ChatHandoff>;
    return typeof h.text === "string" ? { text: h.text, skills: Array.isArray(h.skills) ? h.skills.filter((s) => typeof s === "string") : [] } : null;
  } catch {
    return null;
  }
}
