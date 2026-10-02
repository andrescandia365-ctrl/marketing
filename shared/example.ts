import type { Brief } from "./schema.ts";

// A filled-in Job A brief so the flow can be tried end to end. Replace [PLANNER] with the real name.
export const EXAMPLE_BRIEF: Brief = {
  job: "A",
  productName: "[PLANNER]",
  whatItDoes: "A planner for corner stores: stock, orders to suppliers, shifts and expiry dates in one place.",
  buyer: "Owner-operator of one or two convenience stores who still covers the counter.",
  shippedToday: "Stock counts, supplier orders, shift schedule, expiry alerts.",
  roadmap: "A manager agent that runs the plan; later a 3D-simulated store and a robot manager.",
  pain: "The system says one thing, the shelf says another, and the owner finds out at 6 p.m.",
  offer: "Try it free for 30 days.",
  facts: "",
  offLimits: "Politics, religion.",
  tone: "dry",
  language: "en",
  format: "vertical",
  visualStyle: "Handheld documentary look, fluorescent store light, warm dawn light for the turn.",
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
  language: "en",
  format: "vertical",
  visualStyle: "",
};
