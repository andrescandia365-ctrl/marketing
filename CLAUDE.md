# Playbook Studio

A web app (Spanish interface) for story-driven content, not ads: each piece is a back-and-forth between the Good
(the product) and the Bad (the pain it removes), built with Daily Show/SNL structure (topics, bridges, callbacks).
Flow: brief → topic menu → story in rounds with director notes → storyboard review → production (prompts, uploads,
render). `server/engine.md` is the storytelling engine; `server/series/*.md` holds one bible per series (IMAN,
Masogar); `server/playbook.md` is the operative copy of `PLAYBOOK.md` the app sends to Claude. When `PLAYBOOK.md`'s
rules change, update it there too. The playbook's 75 s ad template does not drive the app.

## Layout
- `shared/` — zod schemas and types (`schema.ts`), beats/roles/lengths and shot timing (`template.ts`), the
  checks that gate approval (`checks.ts`), the series format and text style (`series.ts`), the example brief.
- `server/` — Hono API. `claude.ts` writes the menu, the story, the storyboard, revisions and single-shot rewrites
  (structured output, prompt-cached system prompt; series and tool blocks go after the cache). `series.ts` loads,
  saves, creates and deletes `series/*.md` (the app's "Editar serie" form; `shared/series.ts` maps the
  Markdown to form fields and back); `tools/` holds one Markdown profile per image/video tool, read at startup; `images/` holds one file
  per image generator API; `demo.ts` is the sample output used when no model key is set. The writer is Claude
  (Anthropic SDK) or Kimi (`kimi.ts`, OpenAI-compatible Chat Completions, streamed, strict `json_schema` with a
  JSON-mode fallback and one retry on a schema mismatch); `LLM_PROVIDER` picks when both keys are set.
  `projects.ts` saves each piece as a folder in `proyectos/` (project.json, pieza.md, toma-NN-imagen/clip, video);
  the browser autosaves into it.
- `src/` — React 19 + Tailwind v4 UI, all copy in Spanish (Rioplatense). `MenuPicker`, `StoryView`, `BoardView`
  and `ScriptView` are the steps. `lib/render.ts` plays each shot's uploaded clip (or still, or colour card), mixes
  the clips' sound, draws the speaker and line on top and encodes with WebCodecs via mediabunny; `lib/markdown.ts`
  exports the story, storyboard, prompts and direction log.

## Rules
- The playbook's hard rules are product requirements: roadmap features are shown only with a Concept/Simulation
  label, unverified claims are listed as `[VERIFY]`, no show names, clips or real people's likeness in images,
  no politics.
- Claude returns `beat`/`role`/`disclosure` as plain strings; `normalizeStory()`/`normalizeBoard()` map them to
  strict values. Shots last exactly 6, 10 or 15 s (Grok's clip lengths; `snapSeconds`).
- The writer grades its own story (checklist, open loops, series loop, claims vs "Lo que existe hoy") and board
  (issues); `shared/checks.ts` turns that into problems that block approval until fixed ("Arreglalo") or dismissed.
- Every shot has a slate (`title`, `action`); its image prompt is one frozen moment, actions go in the video prompt.
- API keys stay on the server. Images come back as data URLs so the video canvas is never tainted.
- Tool features change: edit the tool's `.md` in `server/tools/`, never hard-code them. Tag each line
  [DOCS], [NOT SURE] or [TESTED]. Series are edited in the app (Brief → Editar serie / + Nueva serie); their files are in Spanish, and the
  "Lo que existe hoy" list is the only thing the writer may show as real (heading name in `shared/series.ts`).
- Never crop or hide a tool's watermark: "Cuadro completo" (full frame, no zoom) is on by default for Grok.
  Never add features that strip AI metadata or provenance; the disclosure line is on by default.

## Commands
- `npm run dev` — API on 8787 + Vite on 5173 (proxied `/api`).
- `npm run typecheck`, `npm run build`, `npm start`.

@PLAYBOOK.md
