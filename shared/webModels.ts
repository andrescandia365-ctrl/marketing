// Models the person runs by hand on a website (Replicate's or APIMart's web form), with the price per second or per
// image at each resolution (server/media/modelos-web.md). The app does not call them: "Lo generé afuera" notes what
// was made where, and the spend log adds it up with this table. Pure: parsed and priced here, tested.

export type WebSite = "replicate" | "apimart" | "higgsfield" | "google" | "otro";
export const WEB_SITES: WebSite[] = ["replicate", "apimart", "higgsfield", "google", "otro"];
export const WEB_SITE_LABEL: Record<WebSite, string> = {
  replicate: "Replicate",
  apimart: "APIMart",
  higgsfield: "Higgsfield",
  google: "Google (Flow, AI Studio)",
  otro: "Otra web",
};

export type WebModel = {
  site: WebSite;
  kind: "imagen" | "video";
  model: string;
  label: string;
  // "480p", "720p"…, or "" when the price does not depend on it.
  resolution: string;
  price: number;
  unit: "imagen" | "segundo";
  tag: string;
};

export const webModelId = (m: Pick<WebModel, "site" | "model" | "resolution">) => `${m.site}:${m.model}:${m.resolution}`;

const cells = (line: string) =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());

// The first pipe table whose header names "sitio". Rows that do not read are skipped and listed.
export function parseWebTable(md: string): { models: WebModel[]; skipped: string[] } {
  const lines = md.split("\n");
  const start = lines.findIndex((l) => l.trim().startsWith("|") && /\bsitio\b/i.test(l));
  if (start < 0) return { models: [], skipped: [] };
  const header = cells(lines[start]).map((h) => h.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""));
  const col = (name: string) => header.indexOf(name);
  const models: WebModel[] = [];
  const skipped: string[] = [];
  const ids = new Set<string>();
  for (const line of lines.slice(start + 1)) {
    if (!line.trim().startsWith("|")) break;
    const c = cells(line);
    if (c.every((x) => /^:?-+:?$/.test(x) || x === "")) continue;
    const get = (name: string) => (col(name) >= 0 ? (c[col(name)] ?? "") : "");
    const site = get("sitio").toLowerCase() as WebSite;
    const kind = get("tipo").toLowerCase();
    const unit = get("unidad").toLowerCase();
    const price = Number(get("precio").replace(",", "."));
    const model = get("modelo");
    const resolution = get("resolucion").toLowerCase();
    const entry = { site, kind, model, label: get("nombre") || model, resolution, price, unit, tag: get("etiqueta") } as WebModel;
    if (!WEB_SITES.includes(site) || (kind !== "imagen" && kind !== "video") || !model || !(price >= 0) || (unit !== "imagen" && unit !== "segundo") || ids.has(webModelId(entry))) {
      skipped.push(line.trim());
      continue;
    }
    ids.add(webModelId(entry));
    models.push(entry);
  }
  return { models, skipped };
}

// What one generation cost by the table, in US dollars.
export function webCost(model: Pick<WebModel, "price" | "unit">, seconds: number, count = 1): number {
  const n = Math.max(1, Math.round(count));
  return (model.unit === "segundo" ? model.price * Math.max(0, seconds) : model.price) * n;
}

// "APIMart · Seedance 2.5 · 720p"
export function webModelText(m: Pick<WebModel, "site" | "label" | "resolution">): string {
  return [WEB_SITE_LABEL[m.site], m.label, m.resolution].filter(Boolean).join(" · ");
}
