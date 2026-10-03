import type { Brief } from "./schema.ts";

// A filled-in IMAN short so the flow can be tried end to end.
export const EXAMPLE_BRIEF: Brief = {
  series: "iman",
  length: "short",
  product: "",
  angle: "",
  notes: "Sin política ni religión.",
  tone: "dry",
  language: "es",
  format: "vertical",
  tool: "grok-imagine",
  screens: [],
  takes: "lines",
  piece: "story",
};

export const EMPTY_BRIEF: Brief = {
  series: "iman",
  length: "short",
  product: "",
  angle: "",
  notes: "",
  tone: "dry",
  language: "es",
  format: "vertical",
  tool: "grok-imagine",
  screens: [],
  takes: "lines",
  piece: "story",
};
