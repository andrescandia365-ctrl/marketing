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
  the browser autosaves into it. Each series has a type (software / e-commerce) and a fixed cast (characters,
  places, products, real screens) stored as JSON in its Markdown; approved images live in `biblioteca/<series>/`.
  `voice.ts` makes "Voz generada" with OpenAI's speech API (same `OPENAI_API_KEY`). `lyrics.ts` transcribes a
  song with word times (OpenAI, whisper-1) for lyric videos.
- `src/` — React 19 + Tailwind v4 UI, all copy in Spanish (Rioplatense). `MenuPicker`, `StoryView`, `BoardView`
  and `ScriptView` are the steps. `lib/render.ts` plays each shot's uploaded clip (or still, or colour card), mixes
  the clips' sound, draws the speaker and line on top and encodes with WebCodecs via mediabunny; its `drawShot` also
  draws the storyboard's phone frames and "Ver la pieza", so the board looks like the finished piece. `lib/markdown.ts`
  exports the story, storyboard, prompts and direction log.
- Production extras: uploads are checked for format and reviewed by the writer (`/api/review`, pictures sent as JPEG
  to Claude or Kimi); "Cambiar un solo objeto" writes a segment edit (`/api/shot/segment`, never on a watermark);
  e-commerce series get "Producto recortado" (`ProductPanel`, the product joins the cast). `iniciar.sh --ia` picks the
  writer (Claude, Kimi direct, NVIDIA or OpenRouter). Kimi retries an empty or dropped reply once.

## Rules
- The playbook's hard rules are product requirements: roadmap features are shown only with a Concept/Simulation
  label, unverified claims are listed as `[VERIFY]`, no show names, clips or real people's likeness in images,
  no politics.
- Claude returns `beat`/`role`/`disclosure` as plain strings; `normalizeStory()`/`normalizeBoard()` map them to
  strict values. Shots last exactly 6, 10 or 15 s (Grok's clip lengths; `snapSeconds`).
- Every menu idea and story has a `problem` (the problem it solves, plain words) shown before its hook `title`.
- The writer grades its own story (checklist, open loops, series loop, claims vs "Lo que existe hoy", practices vs
  "Cómo se trabaja hoy": pains follow how people really work, never an invented habit) and board
  (issues); `shared/checks.ts` turns that into problems that block approval until fixed ("Arreglalo") or dismissed.
- Every shot has a slate (`title`, `action`); its image prompt is one frozen moment, actions go in the video prompt.
- A shot lists every setup in frame (`setups`, main first); a setup linked to the series cast has `castId` and is
  referenced in Grok as @ref. `kind` is single, transform (initial/middle/end frames) or screen (a real screenshot
  from the cast, never drawn by AI). `editFrom`/`editPrompt` reuse an earlier shot's image. Old saved boards go
  through `migrateBoard()`.
- Series of type music make lyric videos instead of stories (`LyricStudio`): song + lyrics in any language
  (Spanish, Guaraní, Japanese, Korean, romanized) with an optional second line (romanization or translation),
  synced automatically (`alignLyrics` matches the transcription letter by letter) or by tapping, drawn by
  `lib/lyricRender.ts` on an organic background or the piece's own photo/video. The person confirms the song's
  rights before rendering; the credit and the "Fondo hecho con IA" notice are on by default.
- Realism: a series can have a `look` (camera, flash, grain, focus, light, flaws) that goes into every prompt; prompts
  ask for flaws, never "cinematic" (`polishWords` warns). Cast members can carry a reference `sheet` (character girl/boy,
  always invented adults, or a six-panel place) written by `/api/sheet`. With `brief.takes = "continuous"` each shot is
  a 15 s handheld take with a `timeline` of beats (speaker, line, emotion, camera action); its visualPrompt is the hero
  still and its videoPrompt the director's prompt; subtitles follow the timeline and its voice defaults to Grok.
  Every story line has an `emotion`.
- Motion graphics (`brief.piece = "explainer"`, `MotionStudio`): the writer returns a scene script (`shared/motion.ts`,
  templates hook/screen/zoom/callouts/steps/beforeAfter/product/stat/logo); `src/lib/motion.ts` draws frame t as a pure
  function of time (seeded mulberry32 noise, never Math.random, no timers) with the series `brand` (logo, bg, text, one
  accent, display + UI Google Fonts). Studio rules: no stock defaults (centred title on gradient, everything fading in,
  corner labels, frame borders, glow, particle bursts); something new every 2-4 s (`quietGaps` blocks rendering);
  scenes snap to the beat grid; `motionAudio.ts` synthesizes the score and hits and normalizes to -14 LUFS with the
  BS.1770 K-weighting (matches ffmpeg ebur128), peaks under -1.5 dBFS. Lyric videos can use Grok's layers (parallax).
  The timeline (`MotionTimeline`) edits each scene's `tweaks` by element key (`sceneElements`): `at` (when it enters,
  both formats) and `v`/`h` (dx, dy in units of the short side, scale) per format; `revealTimes`, the gap check and
  the sound all read the tweaked times. The preview's hit test uses the boxes `drawMotionFrame` reports to its probe.
  Quality loop (`shared/motionQuality.ts`, `src/lib/motionQuality.ts`, `/api/motion/review`): before any render, a
  contact sheet (one frame per beat) plus measured facts go to the writer, which scores six criteria 1-10 and returns
  up to 3 fixes as script edits (`applyFixes`; never the voice text); repeats to 8+ or 3 rounds. The final render is
  `render.mjs`: headless Chrome opens `/?render=<project>&format=` (`RenderPage`, `window.seek(t)`), PNG frames go to
  ffmpeg (H.264 yuv420p CRF 16, bt709, AAC); the server runs it for the app (`server/finalRender.ts`, localhost only).
  `src/lib/motionProject.ts` holds what the studio and the render page share, so both draw and mix the same.
- Audio (`shared/audio.ts`): each line is heard as subtitles only, said by Grok inside the clip (`speakingPrompt`),
  a generated voice or the person's recorded/uploaded voice; characters have a default, shots can override. Voices
  and sound effects are per-shot project media; one music track per piece ducks under speech and can pull the
  cuts onto its beats (`findBeats`/`alignCuts` in render.ts). Subtitles always stay.
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
