// The API image and video models (modelos-api.md next to this file), read at startup. Which ones can run depends
// on the keys set in Modelos (XAI_API_KEY, FAL_KEY), checked on every call so a key saved from the app counts at once.
import { readFileSync } from "node:fs";
import { MEDIA_KEYS, parseModelTable, type MediaModel, type MediaModelInfo, type MediaProvider } from "../../shared/mediaModels.ts";

function load(): MediaModel[] {
  try {
    const { models, skipped } = parseModelTable(readFileSync(new URL("./modelos-api.md", import.meta.url), "utf8"));
    if (skipped.length) console.warn(`modelos-api.md: ${skipped.length} fila(s) no se pudieron leer y se saltean.`);
    return models;
  } catch {
    return [];
  }
}

const MODELS = load();

export const mediaKey = (provider: MediaProvider): string | undefined => process.env[MEDIA_KEYS[provider]]?.trim() || undefined;

export function mediaModels(): MediaModelInfo[] {
  return MODELS.map((m) => ({ ...m, available: Boolean(mediaKey(m.provider)) }));
}

export function findModel(provider: string, model: string): MediaModel | undefined {
  return MODELS.find((m) => m.provider === provider && m.model === model);
}
