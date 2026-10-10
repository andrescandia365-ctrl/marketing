// Sample answers used when no Claude key is set, so every step can be tried. They are written for one
// IMAN short and do not change with what the person types; revisions in sample mode return them unchanged.
import type { MotionReview } from "../shared/motionQuality.ts";
import { normalizeMotion, type MotionScript } from "../shared/motion.ts";
import { explainerHost } from "../shared/series.ts";
import type { Board, Brief, HookVariant, Menu, Story } from "../shared/schema.ts";
import { getSeries } from "./series.ts";

export const DEMO_MENU: Menu = {
  ideas: [
    {
      problem: "Quedarse sin mercadería a la tarde",
      title: "¿Por qué el pan siempre se termina a las seis?",
      pain: "A las 18:02 el estante del pan está vacío y el dueño se entera cuando un cliente lo pide.",
      bad: "El Desorden se presenta: “Hoy vine a esconderte el pan”.",
      good: "El loop: Llegó marca el pedido con el celu y el stock queda al día.",
      peg: "El reloj de la pared marcando las 18:02 sobre un estante vacío.",
      why: "El estante vacío a la tarde es venta perdida delante del cliente.",
    },
    {
      problem: "Productos que vencen sin que nadie los vea",
      title: "El yogur que venció el martes sigue adelante",
      pain: "Lo vencido aparece cuando lo ve el cliente, no cuando lo ve el dueño.",
      bad: "El Desorden acomoda lo vencido adelante “para que se vea”.",
      good: "Vence muestra lo que vence esta semana, antes de que llegue el cliente.",
      peg: "Un vasito de yogur girado hacia cámara, con la fecha del martes.",
      why: "Es plata tirada y vergüenza delante del cliente.",
    },
    {
      problem: "Armar el pedido antes del corte del proveedor",
      title: "El proveedor cerró hace diez minutos",
      pain: "El pedido se arma mirando la góndola a las apuradas y sale después del corte.",
      bad: "El Desorden adelanta el reloj del proveedor.",
      good: "Pedidos arma la lista con lo que falta, antes del cierre.",
      peg: "El celular con la hora: 10:10. El cierre era a las 10:00.",
      why: "Perder un día de mercadería es perder un día de ventas.",
    },
    {
      problem: "La caja que no cierra",
      title: "La caja que nunca cierra",
      pain: "A la noche faltan 3.000 pesos y nadie sabe dónde quedaron.",
      bad: "El Desorden esconde un billete abajo de la bandeja de la caja.",
      good: "El cierre de caja cuadra el efectivo con la planilla del mes.",
      peg: "La caja abierta sobre el mostrador a las 23 hs.",
      why: "La duda de la caja se lleva a casa todas las noches.",
    },
    {
      problem: "Vender cuando se corta internet",
      title: "Se cortó internet y el kiosco sigue",
      pain: "Sin señal, el miedo es no poder vender.",
      bad: "El Desorden desenchufa el router y se ríe.",
      good: "IMAN sigue vendiendo sin internet; Sincronizar pone todo al día después.",
      peg: "El router con las lucecitas apagadas.",
      why: "En los barrios la señal se corta seguido.",
    },
    {
      problem: "No poder tomarse un domingo",
      title: "Un domingo libre",
      pain: "El dueño no puede faltar porque solo él sabe cómo está el local.",
      bad: "El Desorden solo aparece cuando el dueño no está.",
      good: "Desde el celu, Dueño muestra cómo va el local sin estar ahí.",
      peg: "Un mate en una plaza un domingo a la mañana.",
      why: "Es el deseo más simple y el más difícil de cumplir.",
    },
  ],
  questions: [
    "¿Hay un dueño o dueña real que quiera aparecer en el momento emotivo?",
    "¿Querés cerrar con una invitación a probar IMAN o sin llamado a la acción?",
  ],
};

export const DEMO_STORY: Story = {
  problem: "Quedarse sin mercadería a la tarde",
  title: "¿Por qué el pan siempre se termina a las seis?",
  logline: "El Desorden le esconde el pan a Marta todas las tardes, hasta que el loop de IMAN lo deja sin trabajo.",
  characters: [
    {
      id: "desorden",
      name: "El Desorden",
      role: "bad",
      voice: "Canchero, sobrador, se ríe de sus propias excusas.",
      identity: "a lanky man in a rumpled gray suit covered in crumpled paper receipts, messy hair, sly grin",
    },
    {
      id: "iman",
      name: "IMAN",
      role: "good",
      voice: "Tranquilo, corto, concreto. Nunca levanta la voz.",
      identity: "a calm phone resting upright on the store counter, its screen glowing softly, out of focus",
    },
    {
      id: "marta",
      name: "Marta",
      role: "human",
      voice: "Dueña de kiosco, cansada pero con humor.",
      identity: "a tired but kind corner-store owner in her fifties, short graying hair, faded navy work jacket over a gray sweater",
    },
  ],
  topics: [
    {
      id: "T1",
      title: "¿Por qué el pan siempre se termina a las seis?",
      bridge: "El reloj de la pared pasa a las 18:02 sobre un estante de pan vacío.",
      lines: [
        { beat: "negative", speaker: "desorden", text: "Buenas tardes. Soy el Desorden. Hoy vine a esconderte el pan.", emotion: "canchero, sobrador", direction: "El Desorden apoyado en el estante vacío, reloj a las 18:02." },
        { beat: "negative", speaker: "marta", text: "El sistema dice cuarenta yogures.", emotion: "cansada", direction: "Marta mira la heladera casi vacía." },
        { beat: "negative", speaker: "desorden", text: "Y la góndola dice tres. Los otros treinta y siete se fueron de vacaciones.", emotion: "divertido", direction: "El Desorden sostiene un cartón de leche como si fuera un trofeo." },
        { beat: "negative", speaker: "desorden", text: "Y el yogur que venció el martes lo dejé adelante. Para que se vea.", emotion: "orgulloso de su maldad", direction: "Un vasito girado hacia cámara, adelante de todo." },
        { beat: "touching", speaker: "marta", text: "Hace once años que abro a las seis de la mañana. Me gustaría un domingo.", emotion: "sincera, en voz baja", direction: "Marta levanta la persiana al amanecer, luz dorada." },
        { beat: "good", speaker: "iman", text: "Llegó el pedido: lo marcás con el celu y ya está en el stock.", emotion: "tranquilo", direction: "Marta toca el celu mientras entran los cajones." },
        { beat: "good", speaker: "iman", text: "Vence te muestra lo que vence esta semana, antes que el cliente.", emotion: "tranquilo", direction: "Marta saca un yogur del frente y lo aparta." },
        { beat: "good", speaker: "iman", text: "Y a la noche, la caja cuadra con la planilla.", emotion: "tranquilo", direction: "La caja cerrada, el mostrador ordenado." },
        { beat: "good", speaker: "desorden", text: "¿Y yo qué hago?", emotion: "desconcertado", direction: "El Desorden solo en un estante lleno, sin nada que esconder." },
        { beat: "good", speaker: "marta", text: "Vos andá a esconderle el pan a otro.", emotion: "con una sonrisa", direction: "Marta con un mate detrás del mostrador, estantes llenos." },
      ],
      moves: ["clipDrop", "escalator", "turn", "callback", "button"],
    },
  ],
  callbacks: [
    {
      planted: "“Hoy vine a esconderte el pan” (primera línea del Desorden).",
      payoff: "“Vos andá a esconderle el pan a otro” (última línea de Marta).",
    },
  ],
  close: "Vos andá a esconderle el pan a otro.",
  runner: { bit: "", open: "", middle: "", tag: "" },
  tease: "El Desorden se fue a otro local. No se vio a cuál.",
  canon: [{ fact: "Marta aparta lo que vence antes de que lo vea el cliente." }],
  checklist: [
    { item: "Bueno contra Malo", pass: true, note: "El Desorden habla y se queda sin trabajo; IMAN gana mostrando el loop." },
    { item: "Tres tiempos", pass: true, note: "Tres golpes negativos, un momento emotivo, el loop resolviendo." },
    { item: "Detalle concreto", pass: true, note: "18:02, 40 contra 3, el yogur del martes." },
    { item: "Callback", pass: true, note: "La primera línea vuelve en la última." },
    { item: "Sin afirmaciones inventadas", pass: false, note: "Marta es ilustrativa." },
    { item: "El chiste es el problema", pass: true, note: "Se ríen del Desorden, nunca de Marta." },
  ],
  loops: [
    {
      question: "¿Por qué el pan siempre se termina a las seis?",
      opens: "Tema 1, “Hoy vine a esconderte el pan”",
      closes: "Tema 1, “Llegó el pedido…”: el stock se carga al llegar",
      closed: true,
    },
    {
      question: "¿Qué hace el Desorden cuando ya no puede esconder nada?",
      opens: "Tema 1, “Hoy vine a esconderte el pan”",
      closes: "Tema 1, “Vos andá a esconderle el pan a otro”",
      closed: true,
    },
  ],
  seriesLoop: [
    { step: "Abrir el local", appears: true, complete: true, note: "Marta levanta la persiana: el momento emotivo." },
    { step: "Vender en el mostrador (escanear, ticket)", appears: false, complete: false, note: "Queda afuera: el foco es el stock." },
    { step: "Llega el pedido (Llegó)", appears: true, complete: true, note: "Dolor: el sistema dice 40; paso: lo marca al llegar; resultado: está en el stock." },
    { step: "Revisar lo que vence (Vence)", appears: true, complete: true, note: "Dolor: el yogur vencido adelante; paso: Vence avisa; resultado: lo saca." },
    { step: "Pedirle a los proveedores antes del corte", appears: false, complete: false, note: "Queda para otro episodio." },
    { step: "Cerrar la caja", appears: true, complete: true, note: "La caja cuadra con la planilla." },
    { step: "Sincronizar", appears: false, complete: false, note: "No hace falta en esta historia." },
    { step: "El dueño mira los números", appears: false, complete: false, note: "Queda para otro episodio." },
  ],
  claims: [
    { claim: "Marcar el pedido con el celular al llegar (Llegó)", real: true, concept: false, note: "Está en la lista." },
    { claim: "Ver lo que vence esta semana (Vence)", real: true, concept: false, note: "Está en la lista." },
    { claim: "La caja cuadra con la planilla mensual", real: true, concept: false, note: "Está en la lista." },
  ],
  practices: [
    { practice: "Marta se entera de que falta pan cuando ve el estante vacío.", known: true, note: "Se arma el pedido mirando la góndola." },
    {
      practice: "Un sistema le dice a Marta que tiene cuarenta yogures.",
      known: false,
      note: "Sale del ejemplo del playbook.",
    },
  ],
  verify: ["[VERIFY] Marta es ilustrativa: reemplazala por una dueña real que dé su consentimiento, o etiquetalo como dramatización."],
};

export const DEMO_BOARD: Board = {
  style: "35mm photo, shallow depth of field, muted colors, realistic film still",
  setups: [
    { id: "A", name: "El Desorden", identity: "a lanky man in a rumpled gray suit covered in crumpled paper receipts, messy hair, sly grin", castId: "" },
    { id: "B", name: "Marta", identity: "a tired but kind corner-store owner in her fifties, short graying hair, faded navy work jacket over a gray sweater", castId: "" },
    { id: "C", name: "Kiosco, de tarde", identity: "a small corner store at six in the evening, cold fluorescent light, half-empty metal shelves", castId: "" },
    { id: "D", name: "Kiosco, de mañana", identity: "the same small corner store in the morning, shelves fully stocked, soft daylight from the front window", castId: "" },
  ],
  shots: [
    {
      title: "El Desorden se presenta",
      action: "A las 18:02, el Desorden se presenta apoyado en el estante vacío del pan.",
      topic: "T1", beat: "negative", speaker: "desorden", seconds: 6, setups: ["A"], kind: "single", screen: "", middlePrompt: "", endPrompt: "", editFrom: 0, editPrompt: "", disclosure: "none", timeline: [],
      voiceover: "Buenas tardes. Soy el Desorden. Hoy vine a esconderte el pan.", onScreenText: "18:02",
      visualPrompt: "A lanky man in a rumpled gray suit covered in crumpled paper receipts, messy hair, sly grin, leaning against an empty metal bread rack in a small corner store at six in the evening, cold fluorescent light, half-empty metal shelves, a wall clock behind him. Eye-level medium shot, 35mm photo, shallow depth of field, muted colors, realistic film still. Blank clock face, no signage.",
      videoPrompt: "He tips an imaginary hat toward the camera and smirks; the empty rack stays still. Slow push-in, no other camera move. Audio: fluorescent hum, a soft chuckle, no music.",
      toolSettings: "9:16 · 6 s",
    },
    {
      title: "Marta mira la heladera",
      action: "Marta abre la heladera y la encuentra casi vacía.",
      topic: "T1", beat: "negative", speaker: "marta", seconds: 6, setups: ["B"], kind: "single", screen: "", middlePrompt: "", endPrompt: "", editFrom: 0, editPrompt: "", disclosure: "none", timeline: [],
      voiceover: "El sistema dice cuarenta yogures.", onScreenText: "Sistema: 40",
      visualPrompt: "A tired but kind corner-store owner in her fifties, short graying hair, faded navy work jacket over a gray sweater, staring into a nearly empty glass-door fridge in a small corner store at six in the evening, cold fluorescent light, half-empty metal shelves. Over-the-shoulder shot, 35mm photo, shallow depth of field, muted colors, realistic film still. Blank labels, no signage.",
      videoPrompt: "She slowly opens the fridge door and pauses, looking at the bare shelves. Locked-off camera. Audio: fridge hum, door seal, no music.",
      toolSettings: "9:16 · 6 s",
    },
    {
      title: "Los 37 yogures que faltan",
      action: "El Desorden muestra un cartón de leche como trofeo.",
      topic: "T1", beat: "negative", speaker: "desorden", seconds: 6, setups: ["A", "C"], kind: "single", screen: "", middlePrompt: "", endPrompt: "", editFrom: 1,
      editPrompt: "Replace the empty bread rack with a nearly empty fridge and put a single plain milk carton in his raised hand, held like a trophy. Keep him, the light and the store exactly the same.",
      disclosure: "none", timeline: [],
      voiceover: "Y la góndola dice tres. Los otros treinta y siete se fueron de vacaciones.", onScreenText: "Góndola: 3",
      visualPrompt: "A lanky man in a rumpled gray suit covered in crumpled paper receipts, messy hair, sly grin, holding up a single plain milk carton like a trophy beside a nearly empty fridge in a small corner store at six in the evening, cold fluorescent light, half-empty metal shelves. Medium shot, 35mm photo, shallow depth of field, muted colors, realistic film still. Blank carton, no signage.",
      videoPrompt: "He lifts the carton higher, proud, then shrugs. Slow push-in. The fridge stays still. Audio: fridge hum, no music.",
      toolSettings: "9:16 · 6 s",
    },
    {
      title: "El yogur vencido, adelante",
      action: "Un yogur vencido quedó al frente de la heladera, a la vista.",
      topic: "T1", beat: "negative", speaker: "desorden", seconds: 6, setups: ["C"], kind: "single", screen: "", middlePrompt: "", endPrompt: "", editFrom: 0, editPrompt: "", disclosure: "none", timeline: [],
      voiceover: "Y el yogur que venció el martes lo dejé adelante. Para que se vea.", onScreenText: "Venció el martes",
      visualPrompt: "A row of plain white yogurt cups at the very front of a fridge shelf in a small corner store at six in the evening, cold fluorescent light, half-empty metal shelves, one cup turned toward the lens. Low close shot, 35mm photo, shallow depth of field, muted colors, realistic film still. Blank lids and labels.",
      videoPrompt: "A gloved hand made of crumpled receipts nudges the turned cup a little further forward. Locked-off camera. Audio: soft plastic tap, fridge hum, no music.",
      toolSettings: "9:16 · 6 s",
    },
    {
      title: "Marta abre al amanecer",
      action: "Marta levanta la persiana al amanecer: once años abriendo a las seis.",
      topic: "T1", beat: "touching", speaker: "marta", seconds: 10, setups: ["B"], kind: "single", screen: "", middlePrompt: "", endPrompt: "", editFrom: 0, editPrompt: "", disclosure: "none", timeline: [],
      voiceover: "Hace once años que abro a las seis de la mañana. Me gustaría un domingo.", onScreenText: "",
      visualPrompt: "A tired but kind corner-store owner in her fifties, short graying hair, faded navy work jacket over a gray sweater, lifting a corrugated metal shop shutter at dawn, narrow quiet street, warm low golden sunlight from the left, long soft shadows. Eye-level medium shot, 35mm photo, shallow depth of field, realistic film still. Bare shutter, no signage.",
      videoPrompt: "She slowly lifts the shutter a short way; the slats clack and catch the light. Her head stays down. Slow push-in, no other camera move. Audio: metal clacks, distant birds, no music.",
      toolSettings: "9:16 · 10 s",
    },
    {
      title: "Llegó el pedido",
      action: "Entran los cajones y Marta marca el pedido con el celular.",
      topic: "T1", beat: "good", speaker: "iman", seconds: 6, setups: ["D"], kind: "single", screen: "", middlePrompt: "", endPrompt: "", editFrom: 0, editPrompt: "", disclosure: "none", timeline: [],
      voiceover: "Llegó el pedido: lo marcás con el celu y ya está en el stock.", onScreenText: "Llegó",
      visualPrompt: "A tired but kind corner-store owner in her fifties, short graying hair, faded navy work jacket over a gray sweater, tapping a phone while a delivery man sets plastic crates on the floor of the same small corner store in the morning, shelves fully stocked, soft daylight from the front window. Medium shot, 35mm photo, shallow depth of field, realistic film still. Blank phone glow, plain crates.",
      videoPrompt: "She taps the phone once and nods; the crates settle. Slow push-in. Audio: crates on the floor, morning street, no music.",
      toolSettings: "9:16 · 6 s",
    },
    {
      title: "Vence: lo vencido se saca",
      action: "Con el aviso de Vence, Marta saca el yogur vencido de la heladera.",
      topic: "T1", beat: "good", speaker: "iman", seconds: 10, setups: ["D"], kind: "transform", screen: "",
      middlePrompt: "",
      endPrompt: "A fully stocked fridge in the same small corner store in the morning, the front row neat and in date, the old yogurt cup gone, soft daylight from the front window. Close shot, 35mm photo, shallow depth of field, muted colors, realistic film still. Blank lids and labels.", editFrom: 0, editPrompt: "", disclosure: "none", timeline: [],
      voiceover: "Vence te muestra lo que vence esta semana, antes que el cliente.", onScreenText: "Vence",
      visualPrompt: "A hand taking one plain white yogurt cup from the front of a fully stocked fridge in the same small corner store in the morning, shelves fully stocked, soft daylight from the front window. Close shot, 35mm photo, shallow depth of field, muted colors, realistic film still. Blank lids and labels.",
      videoPrompt: "The hand sets the cup aside on the counter; the full shelf behind stays still. Locked-off camera. Audio: soft plastic tap, quiet store, no music.",
      toolSettings: "9:16 · 10 s",
    },
    {
      title: "La caja cuadra",
      action: "De noche, la caja cerrada y el mostrador ordenado.",
      topic: "T1", beat: "good", speaker: "iman", seconds: 6, setups: ["D"], kind: "single", screen: "", middlePrompt: "", endPrompt: "", editFrom: 0, editPrompt: "", disclosure: "none", timeline: [],
      voiceover: "Y a la noche, la caja cuadra con la planilla.", onScreenText: "Caja ✓",
      visualPrompt: "A tidy shop counter at night with a closed cash drawer and a calm phone resting upright on the store counter, its screen glowing softly, out of focus, warm lamp light, fully stocked shelves behind. Medium close shot, 35mm photo, shallow depth of field, realistic film still. No readable screen, no signage.",
      videoPrompt: "The cash drawer slides shut with a soft click; the phone glow steadies. Locked-off camera. Audio: drawer click, quiet night, no music.",
      toolSettings: "9:16 · 6 s",
    },
    {
      title: "El Desorden sin trabajo",
      action: "El Desorden, solo frente a estantes llenos, no tiene nada que esconder.",
      topic: "T1", beat: "good", speaker: "desorden", seconds: 6, setups: ["A"], kind: "single", screen: "", middlePrompt: "", endPrompt: "", editFrom: 0, editPrompt: "", disclosure: "none", timeline: [],
      voiceover: "¿Y yo qué hago?", onScreenText: "",
      visualPrompt: "A lanky man in a rumpled gray suit covered in crumpled paper receipts, messy hair, his sly grin gone, standing alone in front of fully stocked shelves in the same small corner store in the morning, soft daylight from the front window, looking lost. Medium shot, 35mm photo, shallow depth of field, realistic film still. Plain packaging, no signage.",
      videoPrompt: "He looks left, then right, finding nothing to hide; his shoulders drop. Locked-off camera. Audio: quiet store, a single receipt rustles, no music.",
      toolSettings: "9:16 · 6 s",
    },
    {
      title: "Marta, con un mate",
      action: "Marta toma mate detrás del mostrador y lo despide.",
      topic: "T1", beat: "good", speaker: "marta", seconds: 6, setups: ["B"], kind: "single", screen: "", middlePrompt: "", endPrompt: "", editFrom: 0, editPrompt: "", disclosure: "none", timeline: [],
      voiceover: "Vos andá a esconderle el pan a otro.", onScreenText: "",
      visualPrompt: "A tired but kind corner-store owner in her fifties, short graying hair, faded navy work jacket over a gray sweater, behind the counter of her store sipping mate with a relaxed half smile, fully stocked shelves behind her, warm morning light. Eye-level medium shot, 35mm photo, shallow depth of field, realistic film still. Plain gourd, no signage.",
      videoPrompt: "She takes a slow sip of mate and glances off to the side, amused. Locked-off camera. Audio: quiet morning store, no music.",
      toolSettings: "9:16 · 6 s",
    },
  ],
  issues: [],
};

// Sample explainer: built from the series' cast so it shows real screens or the product when they exist.
export function demoMotion(brief: Brief, target: number | null): MotionScript {
  const series = getSeries(brief.series);
  const cast = series?.cast ?? [];
  const screen = cast.find((m) => m.kind === "screen")?.id ?? "";
  const product = cast.find((m) => m.kind === "product")?.id ?? "";
  const shop = series?.type === "ecommerce";
  const scenes = shop
    ? [
        // The product, then its callouts on the same picture: the cut carries it across by itself ("Continuidad"), as
        // it does from the host presenting the product or the screen to the next scene showing it.
        { template: "hook", seconds: 3.5, title: "Entra frío por abajo", text: "La puerta deja pasar el aire.", items: [], asset: "", camera: "hold", voice: "¿Sentís el frío que entra por abajo de la puerta?", emotion: "cercana" },
        { template: "product", seconds: 3, title: brief.product.split(/[,.:]/)[0] || "El producto", text: "", items: ["Precio [VERIFY]"], asset: product, camera: "push", voice: "Esto lo frena.", emotion: "segura" },
        { template: "callouts", seconds: 4, title: "Cómo es", text: "", items: ["Se pega en un minuto", "Para cualquier puerta", "Se lava"], asset: product, camera: "hold", voice: "Se pega en un minuto y sirve para cualquier puerta.", emotion: "clara" },
        { template: "beforeAfter", seconds: 3.5, title: "Antes y después", text: "", items: ["Antes", "Después"], asset: "", assetB: product, reveal: "iris", focusX: 0.5, focusY: 0.85, camera: "pull", voice: "Antes entraba el aire; ahora no.", emotion: "aliviada" },
        { template: "logo", seconds: 3.5, title: series?.name ?? "", text: series?.tagline ?? "", items: ["Mirá el link"], asset: "", camera: "hold", voice: "Tu casa, más tibia.", emotion: "cálida" },
      ]
    : [
        { template: "hook", seconds: 3.5, title: "El corte es a las 18", text: "Y se arma a ojo.", items: [], asset: "", camera: "hold", voice: "El proveedor corta a las seis.", emotion: "apurada" },
        { template: "screen", seconds: 3.5, title: "Stock en el celular", text: "Lo que queda, sin contar.", items: [], asset: screen, camera: "push", voice: "En el celular ves lo que queda.", emotion: "tranquila" },
        // "Casilleros": the two things the piece promises to settle, named empty here; each fills later, after the
        // scene that settles it (the open loop on screen).
        { template: "slots", seconds: 3.5, title: "Antes del corte", text: "", items: ["Qué queda", "Qué falta"], asset: "", voice: "Dos cosas: qué queda y qué falta.", emotion: "clara" },
        { template: "type", seconds: 4.5, title: "yerba 1 kg", text: "Quedan 3: pedila antes del corte.", items: ["Buscar producto", "Buscar"], asset: "", voice: "Buscás la yerba y ves cuántas quedan.", emotion: "clara" },
        // "Lo que falta aparece arriba" is not on IMAN's "Lo que existe hoy": the sample shows it as a concept, labelled.
        { template: "zoom", seconds: 3.5, title: "Lo que falta", text: "", items: [], asset: screen, focusX: 0.5, focusY: 0.35, zoom: 2.2, entry: "through", voice: "Lo que falta aparece arriba.", emotion: "clara", disclosure: "concept", beyondToday: "La lista de lo que falta arriba de todo" },
        { template: "slots", seconds: 3, title: "Ya sabés qué queda", text: "", items: [], asset: "", voice: "Una menos.", emotion: "segura" },
        { template: "steps", seconds: 4, title: "Pedí antes del corte", text: "", items: ["Abrí Stock", "Marcá lo que falta", "Mandá el pedido"], asset: "", voice: "Tres pasos y el pedido sale.", emotion: "segura" },
        { template: "slots", seconds: 3, title: "Y lo que falta, pedido", text: "", items: [], asset: "", voice: "Y lo que falta, pedido.", emotion: "aliviada" },
        { template: "stat", seconds: 4, title: "3 minutos", text: "para armar el pedido [VERIFY]", items: [], asset: "", voice: "", emotion: "" },
        { template: "logo", seconds: 4, title: series?.name ?? "IMAN", text: series?.tagline ?? "", items: ["Probalo en tu kiosco"], asset: "", voice: "Números claros.", emotion: "cálida" },
      ];
  // The series' explainer character (or else a character with a 3D puppet, or at least an image) presents what comes
  // next, right after the hook.
  const host =
    (series ? explainerHost(series) : null) ??
    cast.find((m) => m.kind === "character" && m.puppet.layers.length) ??
    cast.find((m) => m.kind === "character" && m.image);
  const withCharacter = host
    ? [
        scenes[0],
        shop
          ? { template: "character", seconds: 4, title: "Yo te lo explico", text: "", items: [], asset: host.id, assetB: product, gesture: "present", camera: "drift", voice: "Te muestro cómo se frena el frío.", emotion: "cálida" }
          : { template: "character", seconds: 4, title: "Mirá esto", text: "", items: [], asset: host.id, assetB: screen, gesture: "point", camera: "pan", voice: "Mirá: lo que queda está acá.", emotion: "segura" },
        ...scenes.slice(1),
      ]
    : scenes;
  const scale = target ? target / withCharacter.reduce((n, s) => n + s.seconds, 0) : 1;
  const motion = normalizeMotion(
    {
      problem: shop ? "El frío que entra por abajo de la puerta" : "Armar el pedido antes del corte del proveedor",
      title: shop ? "El burlete en 15 segundos" : "Pedir antes del corte",
      durationNote: "Ejemplo de muestra, sin clave de IA.",
      scenes: withCharacter.map((s) => ({ assetB: "", gesture: "", focusX: 0.5, focusY: 0.5, zoom: 2, ...s, seconds: s.seconds * scale })),
      music: { mood: "drive", bpm: 112 },
      note: "Guion de muestra. Los datos marcados [VERIFY] hay que confirmarlos.",
      caption: shop
        ? "El frío no entra por la ventana: entra por abajo de la puerta. Un burlete y la casa vuelve a ser casa."
        : "Son las 17:50 y el proveedor cierra a las 18. Así se arma el pedido sin contar la góndola a mano. [VERIFY]",
    },
    brief.tone,
  );
  // Without a narrator the sample has no voice lines either.
  const scenesOut = brief.narrator === "without" ? motion.scenes.map((s) => ({ ...s, voice: "", emotion: "" })) : motion.scenes;
  return { ...motion, scenes: scenesOut, tone: brief.tone };
}

// Sample review: the first round finds the hook title small and makes it bigger; later rounds pass. It never looks
// at the frames.
export function demoMotionReview(round: number): MotionReview {
  const note = "Revisión de muestra: sin clave de IA, no miró los cuadros.";
  const score = (n: number) => ({ score: n, note });
  return {
    scores: {
      hook: score(round === 1 ? 7 : 8),
      readability: score(8),
      motion: score(8),
      variety: score(9),
      brand: score(9),
      sync: score(8),
    },
    fixes:
      round === 1
        ? [
            {
              criterion: "hook",
              problem: "El título del gancho se lee chico en el primer segundo.",
              scene: 1,
              title: "",
              text: "",
              items: [],
              seconds: 0,
              template: "",
              element: "title",
              at: -1,
              scale: 1.12,
              dx: 0,
              dy: 0,
              format: "both",
            },
          ]
        : [],
    summary: note,
    poster: 1.5,
  };
}

// Sample mode: five variants on five moves, so the panel can be tried. The fourth carries the story's own problem.
export function demoHookVariants(story: Story): HookVariant[] {
  const problem = (story.problem || story.title).replace(/\.+$/, "");
  return [
    { title: "18:02. El estante del pan, vacío otra vez.", move: "clipDrop", level: 2, why: "Abre con el objeto real y la hora." },
    { title: "El cartel dice «abierto hasta las 22». A las 21:40 ya no hay pan.", move: "contradiction", level: 2, why: "Lo que se promete contra lo que pasa." },
    { title: "Primero falta el pan. Después la leche. Después las ganas.", move: "escalator", level: 1, why: "Cada golpe es peor que el anterior." },
    { title: `¿Por qué nadie te avisa? ${problem}`.slice(0, 120), move: "curiosityGap", level: 3, why: "Promete una respuesta que llega al final." },
    { title: "Fuimos a un almacén a las seis de la mañana, a ver quién levanta la persiana.", move: "fieldVisit", level: 1, why: "Gente real, en su lugar, a una hora concreta." },
  ];
}
