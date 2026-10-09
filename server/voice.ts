// Generated voice for a shot's line ("Voz generada"), through OpenAI's speech API with the same key as the
// image generator. The model and the voice are settings, since both change over time.
const BASE_URL = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
const MODEL = process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts";
export const DEFAULT_VOICE = process.env.OPENAI_TTS_VOICE || "coral";

export class VoiceError extends Error {}

export function voiceAvailable(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

// How the line is said (its written emotion: "con fastidio", "aliviada") goes into the model's instructions.
export async function speak(text: string, voice: string, language: "es" | "en", emotion = ""): Promise<Buffer> {
  if (!voiceAvailable()) throw new VoiceError("Para la voz generada falta OPENAI_API_KEY en .env.");
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/audio/speech`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        voice: voice || DEFAULT_VOICE,
        input: text,
        response_format: "mp3",
        instructions:
          (language === "es"
            ? "Hablá en español rioplatense (de Buenos Aires), con voseo, natural y cálido, como en una charla de todos los días."
            : "Speak naturally and warmly, like an everyday conversation.") +
          (emotion.trim() ? (language === "es" ? ` Decí esta línea así: ${emotion.trim()}.` : ` Say this line like this: ${emotion.trim()}.`) : ""),
      }),
    });
  } catch (error) {
    throw new VoiceError(`No se pudo conectar con OpenAI: ${(error as Error).message}`);
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new VoiceError(`La voz no se pudo generar (${res.status}): ${body.error?.message ?? res.statusText}`);
  }
  return Buffer.from(await res.arrayBuffer());
}
