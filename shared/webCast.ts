// "Traer la marca desde su web" → cast: product photos (e-commerce) and screenshots (software) found on the brand's
// own page, offered for the person to pick. A picked one joins the cast like any member with an approved image, and
// its note says it came from the website. A site screenshot is marketing, not proof of the app's current UI: it joins
// as a real screen only after the person confirms the app looks like that today.
import { CAST_KIND_LABEL, castRef, type CastMember, type SeriesType } from "./series.ts";

export type WebPictureKind = "product" | "screen";
// Where on the page it was found: the product's schema.org data, the page's share image, or an image in the page.
export type WebPictureSource = "jsonld" | "og" | "page";

export const WEB_PICTURE_SOURCE_LABEL: Record<WebPictureSource, string> = {
  jsonld: "datos del producto de la página",
  og: "imagen para compartir de la página",
  page: "imagen de la página",
};

// One picture offered for the cast, as the server fetched it (a data URL, checked by its bytes).
export type WebCastPick = {
  kind: WebPictureKind;
  name: string;
  // The picture's own address on the site.
  url: string;
  source: WebPictureSource;
  image: string;
  width: number;
  height: number;
};

// Which kinds a series type asks for: e-commerce wants product photos, software real screens, music neither. No type
// (an older client) gets both.
export function webPictureKinds(type: SeriesType | undefined): WebPictureKind[] {
  if (type === "ecommerce") return ["product"];
  if (type === "software") return ["screen"];
  if (type === "music") return [];
  return ["product", "screen"];
}

export const CAST_MAX = 60;

const host = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return "la web de la marca";
  }
};

// The cast member a picked picture becomes (its image is uploaded right after, like any approved image). A screen
// needs `confirmed`: the person says the app looks like that today.
export function webCastMember(
  pick: Pick<WebCastPick, "kind" | "name" | "url">,
  cast: Pick<CastMember, "id" | "ref">[],
  opts: { confirmed: boolean; date: string },
): CastMember {
  if (cast.length >= CAST_MAX) throw new Error(`El elenco ya tiene ${CAST_MAX} integrantes: sacá alguno antes de sumar otro.`);
  if (pick.kind === "screen" && !opts.confirmed) {
    throw new Error("Una captura de la web entra como pantalla real solo si confirmás que la app hoy se ve así.");
  }
  const base = pick.kind === "product" ? "producto" : "pantalla";
  let n = cast.filter((m) => m.id.startsWith(`${base}-`)).length + 1;
  while (cast.some((m) => m.id === `${base}-${n}`)) n++;
  const name = (pick.name.replace(/\s+/g, " ").trim() || `${CAST_KIND_LABEL[pick.kind]} ${n}`).slice(0, 60);
  const stem = castRef(name).slice(0, 27);
  let ref = stem;
  for (let k = 2; cast.some((m) => m.ref === ref); k++) ref = `${stem}${k}`;
  const from = host(pick.url);
  const note =
    pick.kind === "product"
      ? `Foto de la web de la marca (${from}).`
      : `Captura de la web de la marca (${from}). Confirmaste el ${opts.date} que la app hoy se ve así; si cambia, subí una captura nueva.`;
  return {
    id: `${base}-${n}`,
    name,
    ref,
    kind: pick.kind,
    // A product's identity is the English line every prompt repeats; a screen's says what it shows, in Spanish.
    identity: pick.kind === "product" ? name : `${name} (captura de la web)`,
    note,
    image: "",
    sheet: "",
    puppet: { layers: [] },
    rig: { file: "", clips: { idle: "", walk: "", turnL: "", turnR: "", point: "" } },
    refs: [],
    views: [],
  };
}
