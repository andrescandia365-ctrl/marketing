// Sample answers used when no Claude key is set, so the storyboard and video steps can be tried.
// They are written for the example brief and do not change with what the user types.
import type { HooksResult, Script } from "../shared/schema.ts";

export const DEMO_HOOKS: HooksResult = {
  hooks: [
    {
      move: "Contradiction",
      line: "Your system says 40 in stock. The shelf says 3.",
      visual: "Close-up of a nearly empty milk fridge, three cartons left, fluorescent hum.",
      why: "Every owner has lived this exact gap between the screen and the shelf.",
    },
    {
      move: "Clip Drop",
      line: "6:02 p.m. This is the bread aisle.",
      visual: "Static shot of an empty bread rack, a customer's hand reaching for nothing.",
      why: "Opens on the real mess with no setup; the time stamp makes it concrete.",
    },
    {
      move: "Field Visit",
      line: "We spent a night in a corner store. Here's 2 a.m.",
      visual: "Handheld walk through a dim stockroom, boxes stacked to the ceiling.",
      why: "Goes where the buyer lives; feels like a ride-along, not an ad.",
    },
    {
      move: "Curiosity Gap",
      line: "Why does the bread always run out at 6 p.m.?",
      visual: "Clock on the store wall ticking from 5:59 to 6:00 over an empty rack.",
      why: "States the tension as a question the owner wants answered.",
    },
    {
      move: "Remote Stand-up",
      line: "We go live to The Manager, reporting from aisle three.",
      visual: "A calm figure in a store vest holding a clipboard in front of a toppled display.",
      why: "Introduces the recurring character who can carry future pieces.",
    },
  ],
  questions: [
    "What is the product's real name?",
    "Is the 30-day free trial a real, current offer?",
    "Do you have a real owner who would share their story for the Turn?",
  ],
};

export const DEMO_SCRIPT: Script = {
  title: "Your system says 40. The shelf says 3.",
  logline: "A corner-store owner stops finding out about empty shelves at 6 p.m.",
  style:
    "Handheld documentary photo, fluorescent convenience-store light, shallow depth of field, muted colors; warm dawn light for the human moment.",
  shots: [
    {
      section: "hook",
      voiceover: "Your system says forty in stock. The shelf says three.",
      onScreenText: "System: 40. Shelf: 3.",
      visualPrompt:
        "Close-up of a nearly empty convenience-store milk fridge with only three cartons left, cold fluorescent light, glass door slightly fogged",
      disclosure: "none",
    },
    {
      section: "agitate",
      voiceover: "Six p.m. The bread is gone. Again.",
      onScreenText: "6:02 p.m.",
      visualPrompt:
        "Empty metal bread rack in a small corner store at evening, a few crumbs and a price tag holder, a customer's hand reaching in",
      disclosure: "none",
    },
    {
      section: "agitate",
      voiceover: "The schedule? On the fridge. Under a magnet. Under a coffee stain.",
      onScreenText: "The schedule.",
      visualPrompt:
        "Handwritten paper work schedule stuck to a small back-room fridge with a magnet, a brown coffee ring stain across it, harsh overhead light",
      disclosure: "none",
    },
    {
      section: "agitate",
      voiceover: "And the yogurt that expired Tuesday is still the first thing a customer sees.",
      onScreenText: "Expired Tuesday.",
      visualPrompt:
        "Row of yogurt cups at the front of a store fridge shelf, one turned to show an old date sticker, cold light, slightly unsettling framing",
      disclosure: "none",
    },
    {
      section: "turn",
      voiceover: "Marta has opened this store at six a.m. for eleven years. She would like one Sunday back.",
      onScreenText: "",
      visualPrompt:
        "A woman in her fifties unlocking the shutter of a small corner store at dawn, tired but kind face, warm golden light, quiet street",
      disclosure: "none",
    },
    {
      section: "resolve",
      voiceover: "[PLANNER] sees the shelf, the shift and the expiry date at once, and tells you before it is a problem.",
      onScreenText: "Shelf. Shift. Expiry.",
      visualPrompt:
        "Tablet leaning on a store counter next to the till, screen softly blurred, freshly restocked shelves in the background, calm morning light",
      disclosure: "none",
    },
    {
      section: "resolve",
      voiceover: "Orders go out before the supplier's cutoff. Shift gaps show up a week early, not at five fifty-five a.m.",
      onScreenText: "Know before 6 p.m.",
      visualPrompt:
        "Full, neatly faced bread rack and milk fridge in a small convenience store, everything in stock, soft daylight from the front window",
      disclosure: "none",
    },
    {
      section: "button",
      voiceover: "The shelf says forty. So does the system. Try [PLANNER] free for thirty days.",
      onScreenText: "Shelf: 40. System: 40.",
      visualPrompt:
        "The same woman behind the counter of her store holding a coffee, relaxed half smile, full shelves behind her, warm light",
      disclosure: "none",
    },
  ],
  cta: "Try [PLANNER] free for 30 days",
  callback: {
    planted: "System says 40, shelf says 3.",
    payoff: "The shelf says 40, and so does the system.",
  },
  checklist: [
    { item: "Customer is hero", pass: true, note: "Marta and her shelf are the story; the product arrives at 0:40." },
    { item: "Concrete detail", pass: true, note: "40 vs 3, 6:02 p.m., the coffee-stained schedule, Tuesday's yogurt." },
    { item: "Target is the problem", pass: true, note: "Jokes land on the shelf and the paper schedule, never the owner." },
    { item: "Turn present", pass: true, note: "Eleven years of 6 a.m. openings; one Sunday back." },
    { item: "Single CTA", pass: true, note: "Free 30-day trial only." },
    { item: "No unverified claims", pass: false, note: "Marta is illustrative; the trial offer needs confirming." },
    { item: "No borrowed IP", pass: true, note: "Original character and lines; no show assets." },
  ],
  verify: [
    "[VERIFY] Marta is an illustrative owner. Replace with a real owner who consents, or label as a dramatization.",
    "[VERIFY] The free 30-day trial is a real, current offer.",
    "[VERIFY] 'Orders go out before the supplier's cutoff' matches what the product does today.",
  ],
};
