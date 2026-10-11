// Production: the piece's setups, each fixable into the series' cast with an approved image, a sheet and references.
import { Suspense, lazy, useRef, useState } from "react";
import type { Board, Setup } from "../../shared/schema.ts";
import type { CastMember } from "../../shared/series.ts";
import type { SeriesInfo } from "../../shared/schema.ts";
import { timeShots } from "../../shared/template.ts";
import { CopyButton, type LibraryEntry, type MediaState } from "./ScriptView.tsx";
import { Button, Spinner } from "./ui.tsx";

// The sheet flow and the extra references open from a setup only when asked, so they load then.
const SheetBuilder = lazy(() => import("./SheetBuilder.tsx").then((m) => ({ default: m.SheetBuilder })));
const CastRefs = lazy(() => import("./CastRefs.tsx").then((m) => ({ default: m.CastRefs })));

type SetupsProps = {
  board: Board;
  media: Record<number, MediaState>;
  toolName: string;
  seriesName: string;
  library: Record<string, LibraryEntry>;
  // Saves a setup into the series' fixed cast (with an image), or replaces the image of a linked one.
  onFix: (setup: Setup, kind: CastMember["kind"], image: Blob | null) => Promise<void>;
  // Changes the setup's description in every shot that writes it (and in the series' cast when asked).
  onIdentity?: (setup: Setup, identity: string, toSeries: boolean) => Promise<SetupIdentityResult>;
  // The setup whose last description change can still be undone.
  undoSetupId?: string;
  // Undoes it; answers the shots edited by hand since, which stay as they are.
  onUndoIdentity?: () => Promise<number[]>;
  // "Hoja de personaje" from a linked setup: the series, its whole cast, the tool's cap on reference images, how a
  // member with its new sheet is saved, and the series list after a reference is added or removed.
  seriesId?: string;
  cast?: CastMember[];
  maxRefs?: number | null;
  libraryVersion?: number;
  onSaveMember?: (member: CastMember) => Promise<void>;
  onSeries?: (series: SeriesInfo[]) => void;
};

// Shot indexes (from 0) whose prompts took the new description, and those that list the setup without writing it.
export type SetupIdentityResult = { changed: number[]; missing: number[] };

const shotList = (indexes: number[]) => indexes.map((i) => i + 1).join(", ");

// One description for the setup, carried into every shot's prompts.
function IdentityEditor({
  setup,
  shots,
  member,
  seriesName,
  onIdentity,
  canUndo,
  onUndoIdentity,
}: {
  setup: Setup;
  shots: number;
  member: boolean;
  seriesName: string;
  onIdentity: NonNullable<SetupsProps["onIdentity"]>;
  canUndo: boolean;
  onUndoIdentity?: SetupsProps["onUndoIdentity"];
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(setup.identity);
  const [toSeries, setToSeries] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");

  async function apply() {
    setBusy(true);
    setError("");
    try {
      const { changed, missing } = await onIdentity(setup, text, member && toSeries);
      setResult(
        (changed.length
          ? `Listo: cambiada en ${changed.length === 1 ? "la toma" : "las tomas"} ${shotList(changed)}.`
          : "La descripción quedó cambiada, pero no estaba escrita en ningún prompt.") +
          (missing.length
            ? ` En ${missing.length === 1 ? "la toma" : "las tomas"} ${shotList(missing)} no encontré la descripción vieja: revisá ${missing.length === 1 ? "su prompt" : "sus prompts"} a mano.`
            : ""),
      );
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function undo() {
    if (!onUndoIdentity) return;
    setBusy(true);
    setError("");
    try {
      const kept = await onUndoIdentity();
      setResult(
        kept.length
          ? `Deshecho. ${kept.length === 1 ? "La toma" : "Las tomas"} ${shotList(kept)} ${kept.length === 1 ? "queda" : "quedan"} como ${kept.length === 1 ? "la editaste" : "las editaste"} después.`
          : "Deshecho: todo quedó como antes.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const same = text.trim() === setup.identity.trim();
  return (
    <div className="space-y-1">
      {open ? (
        <div className="space-y-1 rounded-lg border border-line p-2">
          <textarea
            className="w-full rounded border border-line bg-white px-2 py-1 font-mono text-xs"
            rows={3}
            value={text}
            maxLength={600}
            aria-label={`Descripción de ${setup.name}`}
            onChange={(e) => setText(e.target.value)}
          />
          <p className="text-xs text-muted">En inglés, como la escribe la IA: va palabra por palabra en cada prompt de imagen y video.</p>
          {member && (
            <label className="flex items-start gap-1 text-xs">
              <input type="checkbox" checked={toSeries} onChange={(e) => setToSeries(e.target.checked)} className="mt-0.5" />
              <span>También guardarla en el elenco de {seriesName || "la serie"} (la usan los próximos episodios)</span>
            </label>
          )}
          <div className="flex flex-wrap gap-1">
            <Button variant="secondary" className="px-2 py-1 text-xs" disabled={busy || same || !text.trim()} onClick={apply}>
              {busy ? <Spinner /> : shots > 1 ? `Cambiar en sus ${shots} tomas` : shots === 1 ? "Cambiar en su toma" : "Cambiar"}
            </Button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setOpen(false)}
              className="rounded px-2 py-1 text-xs font-semibold text-muted hover:bg-black/5 hover:text-ink"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setText(setup.identity);
              setResult("");
              setOpen(true);
            }}
            className="rounded px-2 py-1 text-xs font-semibold text-muted hover:bg-black/5 hover:text-ink"
            title="Cambiá la descripción una vez y llega a todas las tomas donde aparece"
          >
            Cambiar descripción
          </button>
          {canUndo && onUndoIdentity && (
            <button
              type="button"
              disabled={busy}
              onClick={undo}
              className="rounded px-2 py-1 text-xs font-semibold text-muted hover:bg-black/5 hover:text-ink"
            >
              {busy ? <Spinner /> : "↶ Deshacer el cambio"}
            </button>
          )}
        </div>
      )}
      {result && <p className="text-xs text-muted">{result}</p>}
      {error && <p className="text-xs text-neg">{error}</p>}
    </div>
  );
}

function SetupRow({
  setup,
  board,
  media,
  toolName,
  seriesName,
  library,
  onFix,
  onIdentity,
  undoSetupId,
  onUndoIdentity,
  seriesId,
  cast,
  maxRefs,
  libraryVersion,
  onSaveMember,
  onSeries,
}: SetupsProps & { setup: Setup }) {
  const shots = timeShots(board.shots).filter((sh) => sh.setups.includes(setup.id));
  const withImage = shots.filter((sh) => media[sh.index]?.image);
  const member = setup.castId ? library[setup.castId] : undefined;
  const [kind, setKind] = useState<CastMember["kind"]>(member?.kind ?? "character");
  const [from, setFrom] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  // Inside the panel: the sheet writer (open at first when the member has no sheet yet).
  const [writing, setWriting] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  // Characters and places of the cast can get a sheet and extra references from here; products and screens cannot.
  const sheetable = Boolean(member && seriesId && onSaveMember && onSeries && (member.kind === "character" || member.kind === "place"));

  async function saveSheet(next: CastMember) {
    setError("");
    try {
      await onSaveMember!(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function fix(image: Blob | null) {
    setBusy(true);
    setError("");
    try {
      await onFix(setup, kind, image);
      setFrom("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function fromShot(index: string) {
    const src = media[Number(index)]?.image;
    if (src) await fix(await (await fetch(src)).blob());
  }

  return (
    <li className="grid grid-cols-[56px_minmax(0,1fr)] gap-x-3 text-sm">
      {member?.url ? (
        <a href={member.url} download className="block" title="Descargar la imagen fija">
          <img src={member.url} alt="" className="aspect-[9/16] w-14 rounded-md object-cover" />
        </a>
      ) : (
        <span className="grid aspect-[9/16] w-14 place-items-center rounded-md border border-dashed border-line text-xs font-bold text-muted">
          {setup.id}
        </span>
      )}
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-1">
          <span className="font-semibold">{setup.name}</span>
          {member ? (
            <span className="font-mono text-xs text-good">@{member.ref}</span>
          ) : (
            <span className="text-xs text-muted">solo en esta pieza</span>
          )}
        </div>
        <p className="text-xs text-muted">
          Tomas {shots.map((sh) => sh.index + 1).join(", ") || "—"} · “{setup.identity}”
        </p>
        {member ? (
          <p className="text-xs text-muted">
            Fijo en {seriesName}. En {toolName}: Referencias → + Nuevo, subí esta imagen y llamala <b>@{member.ref}</b>.
          </p>
        ) : (
          <label className="flex items-center gap-1 text-xs">
            Guardar en la serie como
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as CastMember["kind"])}
              className="rounded border border-line bg-white px-1 py-0.5"
            >
              <option value="character">personaje</option>
              <option value="place">lugar</option>
              <option value="product">producto</option>
            </select>
          </label>
        )}
        <div className="flex flex-wrap items-center gap-1">
          <CopyButton text={setup.identity} idle="Copiar descripción" variant="secondary" />
          {withImage.length > 0 && (
            <select
              value={from}
              disabled={busy}
              onChange={(e) => {
                setFrom(e.target.value);
                if (e.target.value) fromShot(e.target.value);
              }}
              className="rounded-lg border border-line bg-white px-2 py-1 text-xs"
              aria-label={`Imagen fija de ${setup.name}`}
            >
              <option value="">{member ? "Cambiar por la imagen de…" : "Fijar con la imagen de…"}</option>
              {withImage.map((sh) => (
                <option key={sh.index} value={sh.index}>
                  la toma {sh.index + 1}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => input.current?.click()}
            className="rounded px-2 py-1 text-xs font-semibold text-muted hover:bg-black/5 hover:text-ink"
          >
            {busy ? <Spinner /> : member ? "Subir otra" : "Subir imagen"}
          </button>
          {!member && (
            <button
              type="button"
              disabled={busy}
              onClick={() => fix(null)}
              className="rounded px-2 py-1 text-xs font-semibold text-muted hover:bg-black/5 hover:text-ink"
              title="Guarda la descripción ahora; la imagen la sumás después"
            >
              Guardar sin imagen
            </button>
          )}
          {sheetable && (
            <button
              type="button"
              onClick={() => {
                setWriting(!member?.sheet);
                setSheetOpen((o) => !o);
              }}
              className="rounded px-2 py-1 text-xs font-semibold text-muted hover:bg-black/5 hover:text-ink"
              aria-expanded={sheetOpen}
            >
              {member!.kind === "place" ? "Hoja y referencias" : "Hoja de personaje"}
            </button>
          )}
          <input
            ref={input}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) fix(file);
              e.target.value = "";
            }}
          />
        </div>
        {sheetable && sheetOpen && member && (
          <Suspense fallback={<Spinner />}>
            <div className="space-y-2">
              {writing ? (
                <SheetBuilder
                  seriesId={seriesId!}
                  place={member.kind === "place"}
                  cast={cast ?? []}
                  member={member}
                  onAdd={saveSheet}
                  onClose={() => setWriting(false)}
                />
              ) : (
                <div className="flex flex-wrap items-center gap-1 text-xs">
                  {member.sheet && <CopyButton text={member.sheet} idle="Copiar su hoja" variant="secondary" />}
                  <button
                    type="button"
                    onClick={() => setWriting(true)}
                    className="rounded px-2 py-1 font-semibold text-muted hover:bg-black/5 hover:text-ink"
                  >
                    {member.sheet ? "Escribir otra hoja" : "Escribir su hoja"}
                  </button>
                </div>
              )}
              <div className="rounded-lg border border-line p-2">
                <CastRefs
                  seriesId={seriesId!}
                  member={member}
                  version={libraryVersion ?? 0}
                  maxRefs={maxRefs ?? null}
                  toolName={toolName}
                  onChange={(_, series) => onSeries!(series)}
                />
              </div>
            </div>
          </Suspense>
        )}
        {onIdentity && (
          <IdentityEditor
            setup={setup}
            shots={shots.length}
            member={Boolean(member)}
            seriesName={seriesName}
            onIdentity={onIdentity}
            canUndo={undoSetupId === setup.id}
            onUndoIdentity={onUndoIdentity}
          />
        )}
        {error && <p className="text-xs text-neg">{error}</p>}
      </div>
    </li>
  );
}

// The piece's setups. Each one can be fixed into the series' cast with an approved image, so every episode
// (and the image tool, through its @ reference) uses the same face, place or product.
export function SetupsPanel(props: SetupsProps) {
  if (!props.board.setups.length) return null;
  return (
    <div className="space-y-3 rounded-xl border border-line bg-white p-4">
      <div>
        <p className="text-sm font-semibold">Setups · imágenes fijas</p>
        <p className="mt-1 text-xs text-muted">
          {props.toolName} mantiene igual a un personaje o un lugar gracias a la imagen, no a las palabras. Fijá una
          imagen por setup: queda en el elenco de {props.seriesName || "la serie"} para todos los episodios y se usa
          como referencia con @ en {props.toolName}.
        </p>
      </div>
      <ul className="space-y-4">
        {props.board.setups.map((s) => (
          <SetupRow key={s.id} {...props} setup={s} />
        ))}
      </ul>
    </div>
  );
}
