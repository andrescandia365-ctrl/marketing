// Sample answers used when no Claude key is set, so the storyboard and video steps can be tried.
// They are written for the example brief and do not change with what the user types.
import type { HooksResult, Script } from "../shared/schema.ts";

export const DEMO_HOOKS: HooksResult = {
  hooks: [
    {
      move: "Contradiction",
      line: "Tu sistema dice 40 en stock. La góndola dice 3.",
      visual: "Primer plano de una heladera de leche casi vacía, quedan tres cartones, zumbido de tubo fluorescente.",
      why: "Todo dueño vivió esta diferencia exacta entre la pantalla y la góndola.",
    },
    {
      move: "Clip Drop",
      line: "18:02. Esta es la góndola del pan.",
      visual: "Plano fijo de un estante de pan vacío; la mano de un cliente busca y no encuentra nada.",
      why: "Abre con el desorden real, sin preámbulo; la hora lo vuelve concreto.",
    },
    {
      move: "Field Visit",
      line: "Pasamos una noche en un kiosco. Estas son las 2 de la mañana.",
      visual: "Recorrido cámara en mano por un depósito en penumbra, cajas apiladas hasta el techo.",
      why: "Va adonde vive el comprador; se siente como acompañarlo, no como un aviso.",
    },
    {
      move: "Curiosity Gap",
      line: "¿Por qué el pan siempre se termina a las 6 de la tarde?",
      visual: "El reloj de la pared pasa de 17:59 a 18:00 sobre un estante vacío.",
      why: "Plantea la tensión como una pregunta que el dueño quiere responder.",
    },
    {
      move: "Remote Stand-up",
      line: "Vamos en vivo con El Encargado, desde la góndola tres.",
      visual: "Una figura tranquila con chaleco de local y planilla en mano, frente a un exhibidor caído.",
      why: "Presenta al personaje fijo que puede sostener próximas piezas.",
    },
  ],
  questions: [
    "¿Cuál es el nombre real del producto?",
    "¿La prueba gratis de 30 días es una oferta real y vigente?",
    "¿Hay un dueño real que quiera contar su historia para el Giro?",
  ],
};

export const DEMO_SCRIPT: Script = {
  title: "Tu sistema dice 40. La góndola dice 3.",
  logline: "Una dueña de kiosco deja de enterarse de las góndolas vacías a las 6 de la tarde.",
  style: "35mm photo, shallow depth of field, muted colors, realistic film still",
  setups: [
    { id: "A", name: "Marta", identity: "a tired but kind corner-store owner in her fifties, short graying hair, faded navy work jacket over a gray sweater" },
    { id: "B", name: "Góndolas, de tarde", identity: "a small corner store at six in the evening, cold fluorescent light, half-empty metal shelves" },
    { id: "C", name: "Trastienda", identity: "the store's cramped back room, a small white fridge, harsh overhead bulb" },
    { id: "D", name: "Local, de mañana", identity: "the same small corner store in the morning, shelves fully stocked, soft daylight from the front window" },
  ],
  shots: [
    {
      section: "hook",
      setup: "B",
      voiceover: "Tu sistema dice cuarenta en stock. La góndola dice tres.",
      onScreenText: "Sistema: 40. Góndola: 3.",
      visualPrompt:
        "A nearly empty glass-door milk fridge in a small corner store at six in the evening, cold fluorescent light, half-empty metal shelves, three plain white cartons left on the middle shelf, faint fog on the glass. Eye-level close shot, 35mm photo, shallow depth of field, muted colors, realistic film still. Blank carton labels, bare metal shelves, no signage.",
      videoPrompt:
        "The glass door drifts shut on its own and seals with a soft thud; the three cartons stay put. Slow push-in toward the middle shelf, no other camera move. The tube light flickers once. Audio: fridge hum, one soft thud, no music, no speech.",
      toolSettings: "9:16 · 6 s",
      disclosure: "none",
    },
    {
      section: "agitate",
      setup: "B",
      voiceover: "Seis de la tarde. No hay pan. Otra vez.",
      onScreenText: "18:02",
      visualPrompt:
        "An empty metal bread rack in a small corner store at six in the evening, cold fluorescent light, half-empty metal shelves, crumbs on the rack and an empty price-tag rail, one customer's hand reaching in from the right and finding nothing. Eye-level medium shot, 35mm photo, shallow depth of field, muted colors, realistic film still. Blank tags, no signage.",
      videoPrompt:
        "The hand pauses over the empty rack, then slowly pulls back out of frame. Locked-off camera, no movement. The rack stays still. Audio: low store hum, a plastic bag rustles, no music, no speech.",
      toolSettings: "9:16 · 10 s",
      disclosure: "none",
    },
    {
      section: "agitate",
      setup: "C",
      voiceover: "¿La grilla de turnos? En la heladera. Bajo un imán. Bajo una mancha de café.",
      onScreenText: "La grilla.",
      visualPrompt:
        "A handwritten paper work schedule stuck to a fridge door with one magnet, a brown coffee ring stain across it, in the store's cramped back room, a small white fridge, harsh overhead bulb. Close shot, 35mm photo, shallow depth of field, muted colors, realistic film still. Scribbled lines too blurry to read, no printed text.",
      videoPrompt:
        "The paper flutters slightly as if a door opened somewhere; the magnet holds. Slow push-in toward the coffee stain, no other camera move. Audio: fridge hum, a distant door, no music, no speech.",
      toolSettings: "9:16 · 6 s",
      disclosure: "none",
    },
    {
      section: "agitate",
      setup: "B",
      voiceover: "Y el yogur que venció el martes sigue siendo lo primero que ve el cliente.",
      onScreenText: "Venció el martes.",
      visualPrompt:
        "A row of plain white yogurt cups at the very front of a store fridge shelf in a small corner store at six in the evening, cold fluorescent light, half-empty metal shelves, one cup turned slightly toward the lens. Low close shot, 35mm photo, shallow depth of field, muted colors, realistic film still. Blank lids and labels, no signage.",
      videoPrompt:
        "A customer's hand reaches in, picks up the turned cup, hesitates, and puts it back. Locked-off camera. The other cups stay still. Audio: fridge hum, a soft plastic tap, no music, no speech.",
      toolSettings: "9:16 · 10 s",
      disclosure: "none",
    },
    {
      section: "turn",
      setup: "A",
      voiceover: "Marta abre este kiosco a las seis de la mañana hace once años. Le gustaría recuperar un domingo.",
      onScreenText: "",
      visualPrompt:
        "A tired but kind corner-store owner in her fifties, short graying hair, faded navy work jacket over a gray sweater, unlocking a corrugated metal shop shutter at dawn. One hand on the lock, body angled toward the door. Narrow quiet street, closed shops opposite, no cars. Warm low golden sunlight from the left, long soft shadows. Eye-level medium shot, 35mm photo, shallow depth of field, realistic film still. Bare shutter, no signage.",
      videoPrompt:
        "She slowly lifts the metal shutter a short way; the slats clack and catch the light. Her head stays down, expression unchanged. Slow push-in, no other camera move. Warm dawn light holds. Audio: a few metal clacks, distant birds, no music, no speech.",
      toolSettings: "9:16 · 15 s",
      disclosure: "none",
    },
    {
      section: "resolve",
      setup: "D",
      voiceover: "[PLANNER] ve la góndola, el turno y el vencimiento a la vez, y te avisa antes de que sea un problema.",
      onScreenText: "Góndola. Turno. Vencimiento.",
      visualPrompt:
        "A tablet leaning against the till on a shop counter, its screen glowing softly and out of focus, in the same small corner store in the morning, shelves fully stocked, soft daylight from the front window. Medium shot over the counter, 35mm photo, shallow depth of field, muted colors, realistic film still. Blank screen glow, no readable text, no signage.",
      videoPrompt:
        "The tablet screen brightens gently; behind it a hand slides one last loaf onto the full bread rack. Slow push-in toward the counter. The shelves stay still. Audio: quiet morning store, a paper bag rustle, no music, no speech.",
      toolSettings: "9:16 · 15 s",
      disclosure: "none",
    },
    {
      section: "resolve",
      setup: "D",
      voiceover: "Los pedidos salen antes del cierre del proveedor. Los huecos de turno aparecen una semana antes, no a las cinco y cincuenta y cinco.",
      onScreenText: "Enterate antes de las 18.",
      visualPrompt:
        "A full, neatly faced bread rack next to a fully stocked milk fridge in the same small corner store in the morning, shelves fully stocked, soft daylight from the front window. Eye-level wide shot, 35mm photo, shallow depth of field, muted colors, realistic film still. Plain packaging, blank labels, no signage.",
      videoPrompt:
        "Daylight slowly strengthens across the full shelves; dust drifts in the sunbeam. Slow pan from the bread rack to the fridge, no other camera move. Audio: soft street sounds through the window, no music, no speech.",
      toolSettings: "9:16 · 15 s",
      disclosure: "none",
    },
    {
      section: "button",
      setup: "A",
      voiceover: "La góndola dice cuarenta. El sistema también. Probá [PLANNER] gratis treinta días.",
      onScreenText: "Góndola: 40. Sistema: 40.",
      visualPrompt:
        "A tired but kind corner-store owner in her fifties, short graying hair, faded navy work jacket over a gray sweater, standing behind the counter of her store holding a mug of coffee, a relaxed half smile, full shelves behind her, warm morning light. Eye-level medium shot, 35mm photo, shallow depth of field, realistic film still. Plain mug, no signage.",
      videoPrompt:
        "She takes a slow sip of coffee and looks out the front window, calm. Locked-off camera. The shelves behind her stay still. Audio: quiet morning store, a cup set down on the counter, no music, no speech.",
      toolSettings: "9:16 · 10 s",
      disclosure: "none",
    },
  ],
  cta: "Probá [PLANNER] gratis 30 días",
  callback: {
    planted: "El sistema dice 40, la góndola dice 3.",
    payoff: "La góndola dice 40, y el sistema también.",
  },
  checklist: [
    { item: "El cliente es el héroe", pass: true, note: "Marta y su góndola son la historia; el producto llega en 0:40." },
    { item: "Detalle concreto", pass: true, note: "40 contra 3, las 18:02, la grilla manchada de café, el yogur del martes." },
    { item: "El blanco es el problema", pass: true, note: "Los chistes caen sobre la góndola y la grilla de papel, nunca sobre la dueña." },
    { item: "Hay Giro", pass: true, note: "Once años abriendo a las 6; recuperar un domingo." },
    { item: "Un solo llamado a la acción", pass: true, note: "Solo la prueba gratis de 30 días." },
    { item: "Sin afirmaciones sin verificar", pass: false, note: "Marta es ilustrativa; hay que confirmar la oferta de prueba." },
    { item: "Sin propiedad ajena", pass: true, note: "Personaje y textos originales; nada del programa." },
  ],
  verify: [
    "[VERIFY] Marta es una dueña ilustrativa. Reemplazala por una dueña real que dé su consentimiento, o etiquetalo como dramatización.",
    "[VERIFY] La prueba gratis de 30 días es una oferta real y vigente.",
    "[VERIFY] 'Los pedidos salen antes del cierre del proveedor' coincide con lo que el producto hace hoy.",
  ],
};
