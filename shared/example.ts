import type { Brief } from "./schema.ts";

// A filled-in Job A brief so the flow can be tried end to end. Replace [PLANNER] with the real name.
export const EXAMPLE_BRIEF: Brief = {
  job: "A",
  productName: "[PLANNER]",
  whatItDoes: "Un planificador para kioscos y almacenes: stock, pedidos a proveedores, turnos y vencimientos en un solo lugar.",
  buyer: "Dueño de uno o dos kioscos que todavía atiende el mostrador.",
  shippedToday: "Conteo de stock, pedidos a proveedores, grilla de turnos, avisos de vencimiento.",
  roadmap: "Un agente encargado que ejecuta el plan; más adelante un local simulado en 3D y un encargado robot.",
  pain: "El sistema dice una cosa, la góndola dice otra, y el dueño se entera a las 6 de la tarde.",
  offer: "Probalo gratis 30 días.",
  facts: "",
  offLimits: "Política, religión.",
  tone: "dry",
  language: "es",
  format: "vertical",
  visualStyle: "Estilo documental cámara en mano, luz fluorescente de local, luz cálida de amanecer para el giro.",
  tool: "grok-imagine",
};

export const EMPTY_BRIEF: Brief = {
  job: "A",
  productName: "",
  whatItDoes: "",
  buyer: "",
  shippedToday: "",
  roadmap: "",
  pain: "",
  offer: "",
  facts: "",
  offLimits: "",
  tone: "dry",
  language: "es",
  format: "vertical",
  visualStyle: "",
  tool: "grok-imagine",
};
