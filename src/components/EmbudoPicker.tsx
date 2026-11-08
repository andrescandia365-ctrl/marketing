import { useState } from "react";
import { FLOOR_INFO, FLOORS, exactFloor, isFloor, levelsOf, type Floor } from "../../shared/funnel.ts";

const CHIPS = [
  { n: 1, label: "1 · Inconsciente" },
  { n: 2, label: "2 · Consciente del problema" },
  { n: 3, label: "3 · Consciente de la solución" },
  { n: 4, label: "4 · Consciente del producto" },
  { n: 5, label: "5 · Totalmente consciente" },
] as const;

const WIDTH: Record<Floor, string> = { arriba: "w-full", medio: "w-4/5", abajo: "w-3/5" };

export function FloorTag({ floor }: { floor?: string | null }) {
  if (!isFloor(floor)) return null;
  const info = FLOOR_INFO[floor];
  return (
    <span className="rounded border border-line bg-paper px-1.5 py-0.5 text-xs text-muted" title={`${floor}: ${info.purpose}`}>
      {info.label}
    </span>
  );
}

// Three stacked bands, widest at the top. Clicking the active band clears the floor.
// "Elegir niveles exactos" is local: an exact set picks that floor, anything else clears it and keeps the chips.
export function EmbudoPicker({ value, onPick, showExact = false }: { value?: string | null; onPick: (floor: Floor | null) => void; showExact?: boolean }) {
  const active = isFloor(value) ? value : null;
  const [open, setOpen] = useState(false);
  const [chips, setChips] = useState<number[]>([]);

  function pick(floor: Floor) {
    if (active === floor) {
      onPick(null);
      setChips([]);
      return;
    }
    onPick(floor);
    setChips(levelsOf(floor));
  }

  function toggle(n: number) {
    const next = chips.includes(n) ? chips.filter((x) => x !== n) : [...chips, n].sort((a, b) => a - b);
    setChips(next);
    onPick(exactFloor(next));
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold">Embudo</p>
      <p className="text-xs text-muted">Elegí a quién le habla esta pieza. Sin piso, se escribe como siempre.</p>
      <div className="mx-auto flex max-w-md flex-col items-center gap-1">
        {FLOORS.map((floor) => {
          const info = FLOOR_INFO[floor];
          const on = active === floor;
          return (
            <button
              key={floor}
              type="button"
              aria-pressed={on}
              aria-label={`${floor}, ${info.label}. ${info.purpose}`}
              onClick={() => pick(floor)}
              className={`${WIDTH[floor]} rounded-md border px-3 py-2 text-left text-sm ${on ? "border-ink bg-ink text-white" : "border-line bg-white text-ink hover:border-ink"}`}
            >
              <span className="font-semibold">{info.label}</span>
              <span className={`mt-0.5 block text-xs ${on ? "text-white/80" : "text-muted"}`}>{info.purpose}</span>
            </button>
          );
        })}
      </div>
      {showExact && (
        <div>
          <button
            type="button"
            className="text-xs font-semibold text-muted underline"
            onClick={() => {
              const next = !open;
              setOpen(next);
              if (next && chips.length === 0 && active) setChips(levelsOf(active));
            }}
          >
            Elegir niveles exactos
          </button>
          {open && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {CHIPS.map((chip) => {
                const on = chips.includes(chip.n);
                return (
                  <button
                    key={chip.n}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggle(chip.n)}
                    className={`rounded-md border px-2 py-1 text-xs font-semibold ${on ? "border-ink bg-ink text-white" : "border-line bg-white text-muted"}`}
                  >
                    {chip.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
