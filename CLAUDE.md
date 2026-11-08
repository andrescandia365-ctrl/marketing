# Playbook Studio

A web app (Spanish interface) for story-driven content, not ads: each piece is a back-and-forth between the Good
(the product) and the Bad (the pain it removes), built with Daily Show/SNL structure (topics, bridges, callbacks).
Flow: brief → topic menu → story in rounds with director notes → storyboard review → production (prompts, uploads,
render). `server/engine.md` is the storytelling engine; `server/series/*.md` holds one bible per series (IMAN,
Máshogar); `server/playbook.md` is the operative copy of `PLAYBOOK.md` the app sends to Claude. When `PLAYBOOK.md`'s
rules change, update it there too, then record it with `npm run playbook -- --write`: `scripts/playbook.snapshot.md`
keeps the PLAYBOOK.md sections (§1–§7, not §2.1) the summary follows, plus the summary's fingerprint, and a test fails
while either side changed alone. The summary is written by hand, never generated: it leaves out the show's name, real
people and politics. The playbook's 75 s ad template does not drive the app.

## Layout
- `shared/` — zod schemas and types (`schema.ts`), beats/roles/lengths and shot timing (`template.ts`), the
  checks that gate approval (`checks.ts`), the series format and text style (`series.ts`, with `brandContrast`), the
  9:16 platform safe zone (`safeZone.ts`), pure mix helpers (`sound.ts`), the example brief.
- `server/` — Hono API. `claude.ts` writes the menu, the story, the storyboard, revisions and single-shot rewrites
  (structured output, prompt-cached system prompt; series and tool blocks go after the cache). `series.ts` loads,
  saves, creates and deletes `series/*.md` (the app's "Editar serie" form; `shared/series.ts` maps the
  Markdown to form fields and back); `tools/` holds one Markdown profile per image/video tool, read at startup; `images/` holds one file
  per image generator API; `demo.ts` is the sample output used when no model key is set. The writer is Claude
  (Anthropic SDK) or Kimi (`kimi.ts`, OpenAI-compatible Chat Completions, streamed, strict `json_schema` with a
  JSON-mode fallback and one retry on a schema mismatch; the schema also goes in the prompt, since some providers
  ignore `json_schema`, and `<think>` blocks or a wrapper around the object are tolerated). The "Modelos" panel (`ModelsPanel`, `server/settings.ts`,
  `/api/settings/*`, localhost-only) picks the writer (Claude, Moonshot, NVIDIA, OpenRouter, or a legacy KIMI_BASE_URL
  gateway), an optional vision model for picture requests, Claude's effort, and saves keys to `.env` (mode 600;
  only the last 4 characters are ever sent back). Claude options follow the Models API capabilities (adaptive
  thinking, effort levels, structured outputs; refusal fallbacks only on the models that take them).
  `ads.ts`/`adsRoutes.ts`/`adsWriter.ts` are Publicidad (see Rules). `projects.ts` saves each piece as a folder in `proyectos/` (project.json, pieza.md, toma-NN-imagen/clip, video);
  the browser autosaves into it. Each series has a type (software / e-commerce) and a fixed cast (characters,
  places, products, real screens) stored as JSON in its Markdown; approved images live in `biblioteca/<series>/`.
  `voice.ts` makes "Voz generada" with OpenAI's speech API (same `OPENAI_API_KEY`). `lyrics.ts` transcribes a
  song with word times (OpenAI, whisper-1) for lyric videos. `sync.ts` (with `shared/clock.ts`) writes the lyric
  clock into `proyectos/<id>/sync/`: kick grid from the drums stem, word times from the vocal stem. `demucs.ts` runs
  Demucs, which the person installs (found by `DEMUCS_BIN`, which must name a file called demucs, else `demucs` on the
  login PATH, else `python3 -m demucs`; not found is looked up again after 15 s): each song is split once into
  `PROJECTS_DIR/.demucs/<model>-<hash>/` (drums, vocals), shared by the lyric sync (`voice=demucs`), the Reloj and an
  explainer's grid; vocal stems go to whisper-1 as 16 kHz mono (`speechWav`, under its 25 MB). "Modelos → Demucs"
  (`/api/tools/demucs`, localhost-only: status, the path saved to `.env`, a 4 s test run) shows `shared/demucs.ts`:
  where the app uses it and when to turn it on; the studios show the line that applies. `iniciar.sh` only says
  whether it is there. Vite has `envDir: false`, so saving `.env` from Modelos never reloads the page.
- `src/` — React 19 + Tailwind v4 UI, all copy in Spanish (Rioplatense). `MenuPicker`, `StoryView`, `BoardView`
  and `ScriptView` are the steps. `lib/render.ts` plays each shot's uploaded clip (or still, or colour card), mixes
  the clips' sound, draws the speaker and line on top and encodes with WebCodecs via mediabunny; its `drawShot` also
  draws the storyboard's phone frames and "Ver la pieza", so the board looks like the finished piece. `lib/markdown.ts`
  exports the story, storyboard, prompts and direction log. The first screen stays light: `main.tsx` loads `App` and
  `RenderPage` lazily, `App` lazy-loads the studios, `BoardView`, `VideoPanel`, `SeriesEditor` and `ModelsPanel`, and
  three.js comes in only for a rigged character (`import("./actor.ts")`). Pieces the first screen needs stay out of
  heavy modules (`components/shotBits.tsx`, `lib/wav.ts`). Each lazy part sits in `<Lazy>` (`PartBoundary`): a part
  that fails to download shows a notice with "Recargar la página" and the rest of the app stays.
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
- Every story topic tags the playbook moves it really uses (`moves`, ids from `shared/moves.ts`, PLAYBOOK §2.5;
  `normalizeStory` maps names, old stories get `[]`). The story shows them per topic and as the piece's coverage; a
  tagged story with no Turn or no Button is blocked ("Sin Giro", "Sin Botón"); the writers' room counts moves across
  the series (`overusedMoves`, also in `roomBrief`). With no published piece that count is every saved piece, as before.
  Once one is published, only the published pieces are counted and an unpublished canon line is still in drafts
  (`publishedIds`; the published list itself belongs to a later phase). "5 variantes de gancho" (`POST /api/story/hooks`,
  `HookVariants`, PLAYBOOK §3) writes five hooks, each with its move and the viewer's awareness level 1–5: one can
  become the story's hook, and the five go to Publicidad as pending hooks.
- The writer grades its own story (checklist, open loops, series loop, claims vs "Lo que existe hoy", practices vs
  "Cómo se trabaja hoy": pains follow how people really work, never an invented habit) and board
  (issues); `shared/checks.ts` turns that into problems that block approval until fixed ("Arreglalo") or dismissed.
  The checklist of PLAYBOOK §7.4 is part of it: the writer grades Cliente héroe, Un solo llamado and Nada prestado
  (and board issues `hook`, `product`), and the app measures what it can on its own: the brand never says the first
  line (`cliente-heroe`), no show or host names in the story or the board (`borrowedNames`), the first shot is the
  pain with a line or a headline (Gancho en 2 s) and, when the series has a product or a real screen in its cast, a
  Good shot shows it in use (`boardChecks(board, castKinds)`).
- Every shot has a slate (`title`, `action`); its image prompt is one frozen moment, actions go in the video prompt.
  The storyboard opens on "Bocetos": the app's pencil sketch of each shot (`lib/sketch.ts`, from its setups, the cast
  kinds and the framing in its prompt; deterministic) or a sketch the person made with `sketchPrompt` and uploaded
  (image slot `SKETCH_BASE` + shot, saved as boceto-NN).
- A shot lists every setup in frame (`setups`, main first); a setup linked to the series cast has `castId` and is
  referenced in Grok as @ref. `kind` is single, transform (initial/middle/end frames) or screen (a real screenshot
  from the cast, never drawn by AI). `editFrom`/`editPrompt` reuse an earlier shot's image. Old saved boards go
  through `migrateBoard()`.
- Series of type music make lyric videos instead of stories (`LyricStudio`): song + lyrics in any language
  (Spanish, Guaraní, Japanese, Korean, romanized) with an optional second line (romanization, or a translation
  into Spanish, Guaraní, English, Portuguese, Japanese, Korean, French, Italian or a language the person types;
  `piece.secondLanguage`/`secondOther`; section headers like "Chorus (X):" are skipped by `splitLyrics`), synced
  automatically (`alignLyrics` matches the transcription letter by letter) or by tapping, drawn by `lib/lyricRender.ts`
  on an organic background or the piece's own photo/video. After sync, the Elementos tab times up to six graphics to a
  line (an app-drawn motif, or a pasted PNG, JPG or SVG rasterized with scripts removed, drawn whole). The person confirms the song's
  rights before rendering; the credit and the "Fondo hecho con IA" notice are on by default.
  The Reloj tab is the timing contract on top of that renderer (`ClockPanel`, `POST /api/projects/:id/sync`).
- Lyric and motion timing has two clocks and no third (`shared/clock.ts`, `shared/syncDraw.ts`). Cuts, clicks and
  body accents sit on the kick, measured on the drums stem only (low-pass ~150 Hz, hat onsets dropped). If Demucs
  and a drums stem are both missing, the clock stops: it never reads peaks off the master (the Reloj says so and
  "Armar reloj" stays off). The automatic lyric sync reports the lyric words it really heard (`alignLyrics`' `share`);
  under 70 % (`voiceStemHelps`) it suggests hearing the Demucs vocal stem. Lyrics sit on the word,
  aligned on the vocal stem (WhisperX, stable-ts, or whisper-1 on that stem), and are never snapped to the beat.
  A missing vocal time stays missing. Dance is written onto the kick, not extracted from audio or a pose detector.
  Every frame of the mute preview is a pure function of t (`drawSyncFrame`: no timers, no Math.random, no state
  between frames). Colour and type come from the series brand. Banned default: centred text, a gradient, a fade-in,
  an end logo. A big cut lands on a downbeat. An accent lands on a kick. Before a shot is accepted, critique
  (`POST .../sync/critique`, or `npx tsx server/clock-cli.ts critique --project ID`) renders a contact sheet
  (start, middle, end, and 12 frames on the hit), names the worst problems and applies one pass. A failed pass
  is not "nothing to fix". It is not done while the lyric gate is short of N/N or a hit sits outside one frame.
  `findBeats` on the master stays the story-cut helper only.
- Realism: a series can have a `look` (camera, flash, grain, focus, light, flaws) that goes into every prompt; prompts
  ask for flaws, never "cinematic" (`polishWords` warns). Cast members can carry a reference `sheet` (character girl/boy,
  always invented adults, or a six-panel place) written by `/api/sheet`. With `brief.takes = "continuous"` each shot is
  a 15 s handheld take with a `timeline` of beats (speaker, line, emotion, camera action); its visualPrompt is the hero
  still and its videoPrompt the director's prompt; subtitles follow the timeline and its voice defaults to Grok.
  Every story line has an `emotion`.
- Motion graphics (`brief.piece = "explainer"`, `MotionStudio`): the writer returns a scene script (`shared/motion.ts`,
  templates hook/screen/zoom/type/character/callouts/steps/beforeAfter/contradiction/product/stat/logo; contradiction is
  PLAYBOOK §2.5's move: what is said, what happens, the first struck through, built only on "Cómo se trabaja hoy"); `src/lib/motion.ts` draws frame t as a pure
  function of time (seeded mulberry32 noise, never Math.random, no timers) with the series `brand` (logo, bg, text, one
  accent, display + UI Google Fonts). Studio rules: no stock defaults (centred title on gradient, everything fading in,
  corner labels, frame borders, glow, particle bursts); something new every 2-4 s (`quietGaps` blocks rendering);
  scenes snap to the beat grid (a cut moves only to a beat that leaves both its scenes `MIN_SCENE` 1.5 s, trying the
  next-nearest before giving up), and `arrangeScenes` also moves each element's template time onto a beat within 0.1 s
  (`snapElements`, kept in `onBeat` on the arranged copy only; hand-set times never move), so the drawing, the sound and
  the checks read one time and each effect lands exactly with its element. The checks take the tone's push between
  scenes (`readingIssues`/`quietGaps(scenes, cutPush)`): an entrance inside the push arrives with the cut. The preview
  plays the mix through Web Audio and draws from its clock (`MixPlayer`, `lib/playClock.ts`; an edit while playing
  rebuilds the mix and carries on from the same second); lyric videos keep the song's player and smooth its time
  (`mediaClock`). A voice longer than its scene is faded out on the cut (80 ms, `VOICE_FADE`; the mouth stops there
  too); "Ajustar al largo de la voz" (`voiceFitSeconds`, `voiceOverrun`) lengthens the scene to the voice plus 0.4 s,
  its cut on a beat, up to 8 s. `motionAudio.ts` synthesizes the score and hits and normalizes to -14 LUFS with the
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
  The stat counts in its title's own format and settles on the title exactly (`statCountText`); "24/7" does not count.
  Numbers the template draws or the voice says need a source in "Lo que existe hoy", "Cómo se trabaja hoy" or the brief
  (`figureIssues`, blocks the render until changed or confirmed); "[VERIFY…]" on screen always blocks. On 9:16 the
  templates' words end above the subtitle band (`floor` in drawScene). How things land comes from the series brand's
  `motion` (even/solid/soft/springy, `landFor`) or else the tone (dry no overshoot, absurdist more); a dry piece never
  bounces; soft and springy brands let pictures breathe once in (`idleLife`, never text); nothing grows from scale 0.
  A scene can enter by a camera journey (`entry: "through"`, `THROUGH` 0.7 s in any tone): the camera dives into the
  previous scene's main thing (`anchorOf`) and the new one opens from inside in a growing circle; every check that
  waits for a scene to arrive reads `pushOf(scene, push)`. "Antes / después" can reveal in a circle from focusX,
  focusY (`reveal: "iris"`). The bed dips half a beat before the product and the logo
  (`roomWindows`); library effects start on their attack at their kind's level (`sampleShape`). The contact sheet looks
  0.3 s after each beat and also measures text under the platform UI, settled text over text (with the subtitle) and
  the brand's WCAG contrast (text 4.5:1, accent 3:1) for the reviewer. `render.mjs` stops when a brand font did not
  load (`fontLoaded`), pads the sound so the picture sets the length, and checks the MP4 with ffprobe
  (`scripts/renderCheck.mjs`: frames, size, yuv420p, sound length) before it replaces the last render.
  Frame 0 of every render is the poster (`posterTime`: the person's, the AI's or the hook's settled frame; saved as
  portada-*.jpg). `readingIssues` blocks rendering when a line stays on screen less than ~0.3 s per word. Effects
  come from `public/sfx` (CC0, credited in CREDITOS.md) or are synthesized; `soundHits` puts them at the start of
  each motion, first and last of a sequence only. The `type` template types the title into a field with key sounds.
  The script's `tone` (from brief.tone) sets the cut (`cutPush`: dry hard cut, warm 0.38 s push, absurdist 0.2 s),
  the effects (dry: no whoosh or pops) and the music bed (`TONE_BED`); its `caption` is the share text. The cuts into
  the product and the logo go to `strongBeats` (the synth's bar starts, or the downbeats of the track's drums stem)
  only when `readingIssues` and `quietGaps` do not get worse. An explainer's own track gets its beat grid only from
  its drums stem (`piece.kickGrid` from `trackKicks` = `fitKicks`: a stem the person uploads, or Demucs through
  `PUT /api/motion/kicks`); with no stem it has no grid and nothing snaps, never peaks off the track. "Traer la marca desde su web" (`server/brandWeb.ts`,
  `/api/brand/from-web`, localhost-only, public addresses only, checked on every redirect) proposes the brand kit.
  A series that is not saved yet is sent with no id, so that request does not read IMAN's bible.
  Page claims stay [VERIFY] until the person confirms them into "Lo que existe hoy".
  3D-look characters are cut-out puppets (`src/lib/puppet.ts`): a cast character's `puppet.layers` (roles
  body/head/armL/armR/mouth/eyes/extra; Carpeta de Segmentos splits the front figure into head and body on one canvas)
  or its image as one piece. Grok's Segments crops each part to its own size, so a loose part has a `place` (x, y, w on
  the body's canvas) set in "Armar a mano" (`PuppetArranger`, PATCH .../puppet) or a starting place by role
  (`layerRects`); pivots come from the alpha box or are dragged. The `character` template poses it as a pure function of time (breath, seeded blink, gesture
  present/wave/point/cheer/surprise, mouth from `speechLevels` of the voice file or the line's rhythm). The sheet
  template "puppet" (`/api/sheet`) writes the 3D-look sheet and the "Para el títere" view; never a known character.
- Explainer craft (idea 64):
  - `readingNeed` (shared/motion.ts) takes the larger of the word rule (0.3 s per word, a sentence 1.2 s, a 1-3 word
    label 0.8 s) and the letters: `READ_LETTERS_PER_SECOND` (15 letters or digits a second, rounded to the tenth), so
    long Spanish words get more time. The explainer writer and reviewer prompts and the measured facts quote the same
    constant.
  - "Foco de a uno": in callouts and steps only the newest label is at full strength. Earlier ones (with their line,
    dot or number) mix toward the background while a newer one enters (`stepDownShare`/`focusShare` in
    shared/motion.ts, `STEP_DOWN_OVER`), and `stepDownColour` (shared/series.ts) never takes them under 3:1
    (`STEP_DOWN_CONTRAST`; a colour already under it does not dim). The contact sheet marks stepped-down labels in
    overlaps, and measureFacts reports their contrast so the reviewer does not treat them as a fault.
  - Puppet gestures anticipate: a small opposite move `lead` 0.12–0.2 s before the main move (`windUp`), sized by
    `actingFor(tone, brand.motion)` like `landFor` (dry small and never overshoots, absurdist/springy further); the
    main move still starts on the gesture's beat. The explainer writer chooses each scene's `camera` (`pickCamera`,
    `cameraBy: "ai"`), and `planCameras` keeps those choices within the rules (reading scenes and zoom hold,
    callouts/beforeAfter only hold, push or pull, product/screen push in, dry hold or push, never the same move three
    scenes in a row); it runs in `normalizeMotion`, `applyFixes` and every studio edit and never changes a camera the
    person picked.
  - "Desenfoque en los cortes" (`MotionPiece.cutBlur`, on by default, old pieces count as on via `cutBlurOn`; reaches
    the drawing as `MotionWorld.cutBlur` through `makeWorld`): inside a push window (`pushWindowAt`/`pushWindows`, the
    tone's cutPush or THROUGH) `drawMotionFrame` averages `blurSamples` — 8 subframes (`BLUR_SUBFRAMES`) over the 1/60
    s before t (`BLUR_SHUTTER`, 180° at 30 fps), never before the push starts — drawn on a scratch canvas that is
    reset for every subframe and blended as a running mean; outside pushes and on hard cuts the frame is drawn once,
    as before, the subtitle and AI notice are always drawn once on top, and the probe hears only the frame at t.
  - Explainer scenes have an optional `disclosure` (real/concept/simulation, `pickDisclosure`). `src/lib/motion.ts`
    draws CONCEPTO / SIMULACIÓN in the top right of the safe zone while the scene is on screen (`disclosureAt`, and
    through the push out of it), and a labelled scene's titles start under it (`labelFloor`). The writer grades each
    scene (`beyondToday`) and the reviewer can add flags (`flagBeyond`); a flagged scene with no label blocks the
    render (`conceptIssues`, "Lo que existe hoy" panel) until it is labelled, changed (`showsSig`) or confirmed
    (`piece.conceptsOk`, `conceptKey`).
  - A series can name its explainer host ("Personaje de los explicativos", `explainerCharacter` in `shared/series.ts`,
    stored as one header line of the bible, read back by id; `explainerHost` returns it only if it is a drawable cast
    character). When it is set, the explainer writer is told who it is and `hostScenes` (shared/motion.ts) gives it
    every character scene (server: always; studio template switch and applied fixes: only scenes with no character
    yet), and the sample pieces use it (IMAN: Mica, Máshogar: Mara).
  - A puppet can also carry the sheet's alternates (`mouthA`/`mouthO`/`mouthE`,
    `faceHappy`/`faceSurprised`/`faceWorried`, `view34`/`viewSide`, up to `PUPPET_MAX_LAYERS` 20). `puppetPose` picks
    them as pure selectors in `src/lib/puppet.ts`: the mouth shape from the voice held per 0.1 s block (`mouthShape`,
    `mouthBlockStart`; closed under `MOUTH_CLOSED`), the face from the scene's emotion (`expressionFor`,
    Spanish/English, neutral fallback; the surprise and cheer gestures override it) and the view while it points or
    presents (`viewFor`; the views face screen right and are mirrored). Without those layers the puppet draws exactly
    as before.
  - "Nota del director" for an explainer (`POST /api/motion/revise`, `reviseMotion`, `shared/motionNote.ts`): the
    writer returns the whole script, each scene naming its current id in `from` (`MotionNoteSchema`), and `mergeNote`
    keeps untouched scenes as they were (ids, hand tweaks, the person's cameras, voices), keeps a changed scene's id
    and its tweaks on elements it still has, and reports changed/added/removed/voiceChanged. The studio drops a
    generated voice (`generatedVoice`) whose line changed and «Deshacer» restores it; sample mode changes nothing and
    says so.
  - Explainer subtitles are word by word ("Palabra por palabra", `piece.wordByWord`, on by default via
    `wordByWordOn`): `shared/subtitles.ts` `subtitleCues` (via `pieceSubtitles` into `world.subtitles`) shows the line
    in chunks of up to two 37-character lines, each chunk still while the word being said is lit (`litWord`) and
    nothing outliving its scene. Word times come from whisper-1 (`POST /api/voice/words`, `alignWordTimes`, stored in
    `piece.wordTimes` while the line and the file still match, `wordTimesFresh`), or else are estimated by letters
    from the voice's length (`estimateWordTimes`). The same cues go out as an .srt (`toSrt`): it can be downloaded in
    the studio, and it is saved next to each video as `<video base>.srt`, by render.mjs for the final render and by
    `PUT /api/projects/:id/subtitles` for in-browser renders.
  - "Continuidad" (entry "match", `SCENE_ENTRY_LABEL`): when two scenes in a row show the same main picture
    (`carriedAsset`: the picture of hook/screen/zoom/callouts/product, a character's assetB), the cut carries it from
    its last box in the old scene to its box in the new one (`carryBox` from `mediaLayout`, `lerpBox`, `carryCurve`;
    drawn once, both scenes hide their copy with `Frame.hide`) while the rest of the old scene leaves and the new
    scene's other elements enter. It applies by itself when the person picked no entry (`entryOf`; timeScenes marks it
    `carryIn`), a hand "cut" never carries and a hand "match" falls back to the cut; `pushOf` gives it `carryOf(push)`
    (dry 0.32 s with no overshoot, absurdist 0.42 s, warm 0.6 s), and the carry sounds a soft "glide" cue (none for
    dry).
  - Avisos, Flujo y Casilleros (templates `notify`, `flow`, `slots`): their items go through `itemsOf` (empty lines
    dropped, capped by `LIST_MAX`: 3 notifications written "title | body" via `noticeParts`, 4 places, 5 boxes) and
    arrive by `sequenceTimes`, laid out by `noticeLayout`/`flowLayout`/`slotsLayout` in src/lib/motion.ts with Foco de
    a uno. In Casilleros the first slots scene with items names the boxes and each later slots scene without items
    fills the next one, from the script's order alone (`slotsPlan`, attached by `timeScenes` as `TimedScene.slots`;
    `normalizeMotion` clears the items of later slots scenes; the reviewer gets `slotsFacts`).
  - Explainer scenes can sit in a flat illustrated place ("Mundo ilustrado", `shared/world.ts`:
    store/street/home/desk, `script.world` for the piece, `scene.world` to override or "none"; `worldOf`, `pickWorld`,
    the writer leans store/desk for software and home for e-commerce, `worldLean`), seeded flat shapes (`worldShapes`)
    in three layers that take the camera by depth (`WORLD_DEPTH`) and travel with the scene's push, carry and "Pasar a
    través"; its tones keep the brand's text 4.5:1 and accent 3:1 (`worldPalette`/`worldSafe`, labels step down with
    `worldStepDown`), and busy shapes are left out wherever a measuring pass of the scene finds words, the subtitle or
    the AI notice, at every camera position (`busyClear`, `wordBoxes` in src/lib/motion.ts).
  - "Storyboard" in MotionStudio (`MotionStoryboard`, lazy-loaded only when opened): `storyboardPanels(arranged
    script, {music, effects, voice})` in `src/lib/motionStoryboard.ts` builds one panel per scene from the scenes as
    they play. Each panel has the settled frame time (past `pushOf`, every element's `settledAt`) drawn by
    `drawMotionFrame`, the range, template, on-screen words (`shownText`), the voice, the `soundHits` in the scene
    plus the bed's `roomWindows` dip, the entry (tone cut with seconds, hard cut, through, Continuidad), the camera
    and CONCEPTO / SIMULACIÓN. It downloads as Markdown (`storyboardMarkdown`, which links the sheet) and as one PNG
    sheet (`storyboardSheet`).
- Lyric, story and app additions (idea 65):
  - Lyric videos pulse (organic background, Grok layers, "beat" elements) on the Reloj's kick grid when it has one
    (`shared/lyricPulse.ts`: `lyricPulse`, `pulseAt` = downbeats for the big move, kicks for small accents,
    `layerHits` = downbeats); with no drums stem they fall back to `findBeats` on the master as decoration only (never
    a cut, never the Reloj) and the Video tab says so (`pulseNote`).
  - Lyric videos: "La letra actúa el canto" (`piece.act`, on for new pieces and off for old ones that already have
    lyrics; `shared/lyricAct.ts`): a word that was heard by the auto sync (`LyricWord.heard`, set by `alignLyrics`)
    and held at least 0.6 s stretches horizontally while it is sung (`stretchAt`, at most +20 %, rows break on the
    peak width), and a word in the song's loudest tenth and at least 3 dB over its median (`loudCut`) shakes slightly
    (`shakeAt`, half on calm). Loudness is `LyricWord.level`, the vocal-stem RMS from `wordLevels` (Demucs in
    `/api/lyrics/sync` voice=demucs or `/api/lyrics/levels`, or a stem uploaded and measured in the browser), never
    the master.
  - Generated image prompts close with the series look (`lookPhrase`, sent as `look` to /api/image) or, without one,
    the plain `PLAIN_PHOTO` line, never "cinematic" (`buildImagePrompt` in shared/prompt.ts); Grok's speaking prompt
    carries the line's written emotion as "tone: …" (`speakingPrompt`, `lineEmotion` in shared/audio.ts).
  - "Exportar .zip" / "Importar .zip" in ProjectsPanel (`server/projectZip.ts`, localhost-only `GET
    /api/projects/:id/export` and `POST /api/projects/import`): a node:zlib zip32 reader/writer that allows only a
    project folder's own paths (`projectPathAllowed`) and rejects traversal, symlinks, encryption and zip64; sizes are
    capped as files inflate. project.json is checked with `ProjectFileSchema` (errors via checkErrorText), and an
    import always lands in a new free id (id-2, id-3…), never overwriting.
  - pieza.md shows each shot's sketch: the uploaded boceto-NN (MediaState.imageFile) or the app's pencil sketch, which
    App writes as boceto-app-NN.png (`src/lib/sketchFiles.ts` `sketchJobs`/`sketchPng`, `PUT/DELETE
    /api/projects/:id/sketches`, `saveAppSketch`/`pruneAppSketches`, `appSketchFile` in shared/prompt.ts) only when
    its drawn inputs change. `pieceToMarkdown(..., SketchLinks)` links them relatively, and "Descargar todo .md" adds
    a note that the images are in the project folder.
  - "Cambiar descripción" in the setups panel (`SetupsPanel`) carries a setup's new identity line into every shot's
    prompts (`propagateSetupIdentity` in `shared/setupEdit.ts`: matches the old line word for word, reports shots that
    list the setup without it). It can also save the line to the series cast, and the last change can be undone
    (`undoSetupIdentity` keeps prompts edited by hand since).
  - A transform shot can start or end on a real cast screen (`screenAt` "start"/"end" + `screen`;
    `shared/transformScreen.ts`: `shotFrames`, `generatesImage`, `withScreenMove` puts a "Frames (real screen):"
    sentence before "Audio:" in the video prompt, `settleScreenShot` runs after the writer). That frame is the cast
    screenshot, never generated, and is chosen in Producción with "Pantalla real en la transformación".
  - Cast members carry extra references (`refs`: a crop of the sheet such as the face, or a loose view, each its own
    @ref, e.g. @MartaCara, saved in biblioteca/<series>/ by `POST/DELETE /api/series/:id/cast/:castId/refs`, server-
    owned like puppet files) and the sheet's loose views (`views`). The crop math, the naming and the cap
    (`referenceCap` reads "Up to N reference images" from server/tools/*.md) are in `shared/castRefs.ts`, the cropper
    is `CastRefs.tsx`, and a linked setup in Producción opens `SheetBuilder` prefilled with its member ("Hoja de
    personaje").
  - "Este clip parece traer música": uploadClip listens to each new story clip once (`src/lib/clipMusic.ts`, the pure,
    conservative [NOT SURE] heuristic `musicFeatures`/`likelyMusic` in `shared/musicLike.ts`: tonal coverage, held
    notes, distinct pitches, beat regularity) and marks `audio.clipMusic` ("likely"/"ok", `withClipMusic`). The shot
    shows the notice (`clipMusicNotice`) with "Ponerlo en Mudo" (clipLevel mute) or "Tiene licencia / no es música";
    it never blocks.
  - "Formato del segmento" (`brief.segment`: desk/correspondent/field, default desk; `shared/segment.ts`) stages a
    story at the desk, with the series' correspondent "on location" (PLAYBOOK §2.5 Remote Stand-up, roadmap only as a
    labelled concept gag) or as a Field Visit. `segmentRules` goes into `describeBrief`, `storyProblems` blocks a
    tagged story without the format's move (`SEGMENT_MOVE`), and `demoStory` shows it in sample mode. A series names
    its correspondent in Editar serie (`correspondent`, header line "Corresponsal: id", `seriesCorrespondent`); when
    there is none, the writer invents one with the id "corresponsal" and `CorrespondentOffer`
    (`inventedCorrespondent`, `correspondentMember`, `POST /api/series/:id/correspondent`) offers to add it to the
    cast.
  - "Tokens por pedido" in Modelos: every writer reply's usage (Claude's and the OpenAI-compatible providers',
    streamed ones asking stream_options.include_usage and dropping it if rejected) is normalised by
    `claudeUsage`/`chatUsage`/`chunkUsage` (`shared/usage.ts`) and logged per askWith call by `meter`
    (`server/usage.ts`; last 200 in memory and PROJECTS_DIR/.tokens.json, kind from the route via
    `usageScope`/`usageKind`), shown from `GET /api/settings/usage` (localhost-only) with per-kind averages
    (`usageAverages`); tokens only, a price only when the provider returns one.
  - "Episodios estudiados" (`EpisodesPanel`, `server/episodes.ts`, `shared/episodes.ts`, `/api/episodes*`, localhost-
    only) drafts a PLAYBOOK §2.6 EP-NN entry from a pasted summary (`EpisodeWireSchema` → `episodeMarkdown`), and with
    the person's ok appends it as the next number (`appendEpisode`, `prepareEntry`); the snapshot records only that
    append (`recordAppend` in scripts/playbookSync.ts: full rewrite if in step, else §2.6 only, never over a hand edit
    to §2.6), server/playbook.md never gets episodes, and moves on each entry's **Moves** line that repeat in 3+
    episodes and are new to §2.5 are only proposed (`moveTally`).
  - "Traer la marca desde su web" also offers cast pictures by series type (`sitePictures`, `bringPictures`,
    `fetchPicture`/`checkPicture` in server/brandWeb.ts: JSON-LD Product/SoftwareApplication, product og:image,
    hero/feature/gallery images; same address/redirect checks, 2.5 MB, type read from the bytes, returned as data URLs
    in `BrandFromWeb.cast`). A picked one joins the cast via `webCastMember` (shared/webCast.ts) as Producto, or as
    Pantalla real only after the person confirms the app looks like that today, with a note saying it came from the
    website.
  - The open story piece's project folder (autosave of project.json/pieza.md/boceto-app, each shot's media and music,
    `loadMedia`/`clearMedia`/`keep`) lives in the hook `useProject` (src/useProject.ts), and step 5 is
    `ProductionView` (lazy VideoPanel; `Lazy` is in ui.tsx). The studios are split by role: MotionStudio's preview
    (clock, canvas, playback) is `useMotionPreview`/`MotionPreview` and its panels are
    MotionChecks/MotionSettings/MotionOutputs/MotionSceneList/MotionScriptBar/MotionToggles/MotionStoryboardPanel
    (lazy MotionStoryboard), with `useHeardWords` and `pieceMarkdown` (src/lib/motionMarkdown.ts). LyricStudio's are
    LyricPreview/LyricVideoTab/LyricSync, SeriesEditor's are CastCard/SeriesBrandLook, and ScriptView's SetupsPanel is
    its own file (lazy SheetBuilder/CastRefs). tests/splitFiles.test.ts guards these lazy boundaries.
- Screens, code scenes, statics and presenters (idea 66):
  - "Pantallas en lote" (`shared/screenBatch.ts`, `ScreenBatch.tsx` in Editar serie → "Pantallas reales de la app",
    software and e-commerce): many screenshots at once (drop, files, or a folder via webkitdirectory). Each one is
    sent on its own (`PUT /api/series/:id/screens`, `addScreen`: PNG/JPEG/WebP read from the bytes, `SCREEN_MAX_BYTES`
    15 MB) and becomes a `pending` screen with its image in biblioteca/<series>/. It is named from the file
    (`cleanScreenName`; names a camera or computer made up become "Pantalla N", `nextScreenNumber`), with unique ids
    and @refs (`uniqueScreenId`, `uniqueScreenRef` via `extraRefName`), a device guessed from its shape
    (`guessDevice`), and the original file name kept in its note (`batchFileName`). A failed file does not stop the
    rest and is listed. "Revisá las pantallas" edits name, function (`identity`), device (`CastMember.device`
    phone/pc), order (`reorderSubset`) and removal. Naming with no key: "Copiar prompt para nombrarlas en claude.ai"
    (`screenNamingPrompt`, batches of `PROMPT_BATCH` 20), whose answer, one line per file `archivo | nombre | qué
    muestra | celular o pc`, is pasted back and read by `parseScreenNames`, then matched by file name
    (`matchScreenNames`). With a key, "Que la IA las nombre" sends each screenshot as a small JPEG to the vision model
    (`POST /api/screens/name`, `nameScreen`). "Confirmar" (`POST .../screens/confirm`, `confirmScreens`) clears
    `pending`, saves names, order and removals at once, and offers each function as an unchecked "Lo que existe hoy"
    line (`worksTodayOffers`). Pending screens never reach the writers, the brief or the sample output. The story and
    explainer writers get the confirmed screens as a list of id, @ref, device, name and function (`screensForWriter`
    in `contextBlocks`). The cast holds up to `CAST_MAX` 150 members.
  - "Videos de la app funcionando": a real screen of the cast can carry a screen recording (`video` on the cast
    member: file, poster, seconds, width, height, name; `ScreenVideoSchema` in shared/series.ts; server-owned like
    puppet files).   - Upload: Editar serie → `ScreenVideoBox`. It goes to `PUT /api/series/:id/cast/:castId/video`
    (streamed, `SCREEN_VIDEO_MAX_BYTES` 200 MB, type read from the bytes by `videoTypeOf`: mp4/webm/mov), then
    `.../video/poster` with a JPEG taken by the browser (`probeScreenVideo`, which refuses what this browser cannot
    play). `DELETE .../video` removes it.   - Serving: library videos are served with Range (`libraryVideo`).   -
    Explainer scenes: hook/screen/zoom/callouts (asset) and a character's assetB can play it (`scene.recording` {from,
    to?, rate, end?: "loop"}; the wire field is `clip`, "2-7 x1.5", read by `pickClip`, written by `clipText`;
    `settleClips` keeps it only on a screen with a recording, clamped). It is muted. It starts at its element's time.
    - Timing (`clipTime` in shared/screenVideo.ts): the recording time follows the scene time at its rate and then
    holds the last frame before `to` (`HOLD_BACK`) or loops. `videoPlan`/`drawnAt` say which scene players a frame
    needs (the previous scene at its last moment during a push or carry).   - Players: src/lib/screenVideo.ts
    `VideoDeck` keeps one player per scene. The engine only reads them (`assetOf` in src/lib/motion.ts; the poster
    stands in, at the recording's size). `world.videos` is the deck.   - Exact captures `await deck.ready(script, t)`
    before drawing (`drawReady`, each with its own `fork()` via `withOwnVideos`): the render page's `window.seek` (now
    async), the in-browser render, the poster, the contact sheet and the storyboard (`storyboardSheet`/`storyboardPng`
    take a `prepare`). The preview calls `deck.follow(script, t, playing)` (plays at the rate, re-seeks past
    `PLAY_DRIFT`).   - Unreadable recordings: the still with `VIDEO_FAILED_NOTE`. Renders stop instead (`check(used)`,
    `unreadableVideos`).   - Writer and reviewer: the writer's screen list says "has a screen recording of N s".
    `describeScenes`, `noteView`/`mergeNote` and the storyboard panel (`recording`) name the stretch.   - Stories: a
    screen shot can use the recording as its clip ("Usar el video de la app como clip", `LibraryEntry.videoUrl`).
  - "Escena de código" (explainer template `code`, idea 66): the scene's animation is JavaScript the person pastes
    (written by Opus in claude.ai).   - Contract in one constant (`CODE_CONTRACT`, shared/codeScene.ts) used by the
    prompt and the runner:     - the code defines `draw(ctx, t, info)`, a pure function of t on an OffscreenCanvas at
    full size (1080x1920 / 1920x1080);     - no Date, performance, Math.random, timers, network or async;
    `info.random(seed)` is mulberry32;     - it returns the texts it drew as `[{text, x, y, w, h}]`;     - `info`
    holds width, height, format, duration, fps, brand, tone, voice, words (scene time, from the subtitle cues),
    emotion, assets (ImageBitmaps by cast id or `layer:N`), safe and floor.   - "Copiar el prompt para Opus"
    (`codePrompt`, shared/codePrompt.ts):     - a Spanish note, then the technical brief in English: the contract and
    `CODE_EXAMPLE`;     - the scene, the brand, the picked pictures with their sizes, and the scenes around it;     -
    `MOTION_VOCABULARY` (idea 62's moves), `EMOTION_MOTION` (surprise pops, frustration shakes and crumbles, relief
    settles and breathes);     - the house rules with each text's `readingNeed` and the safe zone and floor in pixels.
    - "Pegá acá el código" (`CodeScenePanel`):     - `stripFences`, then `validateSource` (static check, Spanish, with
    the line);     - `testCode` in a fresh sandbox at every `CODE_SAMPLE_STEP` (0.1 s), then saved as `scene.code =
    {source, assets, samples}`, with samples as frame shares and a sig from `samplesSig`.   - Sandbox
    (src/lib/codeSandbox.ts):     - an iframe with `sandbox="allow-scripts"` and a srcdoc with a CSP meta (`default-
    src 'none'; script-src 'unsafe-inline'; img-src blob: data:; font-src blob: data:`);     - a runtime script blocks
    clocks, randomness, timers and network, then the code runs as its own inline script (`sandboxDoc` knows its first
    line, so errors give the person's line);     - only postMessage, with a per-instance token (`CodeRunner`: ready →
    init with fonts as ArrayBuffers via `fontBytes` and pictures transferred → frames one at a time, each an
    ImageBitmap plus the texts);     - `CODE_FRAME_MS` 250 ms per frame; a request with no answer in `CODE_HANG_MS`
    tears the iframe down.   - Drawing:     - `CodeDeck` (one sandbox per scene and format, rebuilt when its code,
    pictures or info change) is `world.code`;     - drawMotionFrame stays synchronous and paints the frame full size,
    with the subtitle and AI notice on top;     - `drawReady(world, script, t, draw, size?)` awaits `world.code.ready`
    (duck-typed; `codeNeeds` covers the push and blur subframes), and the preview calls `follow` and shows the latest
    frame;     - renders (RenderPage, MotionStudio.render) use a strict fork (`fork(true)`) and `check()` first: no
    code, a failed test or a failing frame stops the render.   - Checks:     - `codeHolds` feeds `readingIssues`
    (`codeReadingIssues`, key `code:<text>`, dismissible);     - drawn texts feed `figureIssues` ([VERIFY] blocks),
    `revealTimes` (`codeReveals`) and the contact sheet facts (`codeFacts`);     - `codeIssues` blocks the render (no
    code, `code.error`, stale samples, which the studio re-tests by itself once per sig, or `codeBreaches` out of the
    9:16 safe zone or over the subtitle floor), shown in MotionChecks.   - With a key, "Que la IA escriba la
    animación" sends the same prompt to `POST /api/motion/code` (`writeSceneCode`; sample mode answers demo).   -
    pieza.md includes the code.   - The writer never picks `code` for a new scene.
  - Add under Rules (after the Publicidad or explainer bullets): - "Imagen fija" (`brief.piece = "still"`,
    `StillStudio`, lazy; IDEAS 34 points 3-5, PLAYBOOK §3.2/§5/§7.4): one picture with the pain and the relief.
    Concepts by family (`shared/still.ts`: STILL_FAMILIES, each names pain, relief, touching detail;
    offer/press/testimonial need a real `proof` the person confirms (`proofOk`, press needs its link), else [VERIFY]
    and `conceptBlocks` blocks export). The picked concept's Grok prompt follows §3.2's 10 slots
    (`stillPromptSlots`/`stillImagePrompt`): no text in the picture, clear space where the words go, 9:16. No key:
    "Copiar el prompt para Opus" (`stillMenuPrompt`, `stillCopyPrompt`) and a paste box read by `parseStillPaste`
    (strict "## Concepto N" / "## Texto N" blocks of "campo: valor", errors per block); sample is Máshogar
    (`shared/stillSample.ts`); with a key `POST /api/still/ask` sends the same prompt and the reply goes through the
    same parser. The app sets the words (`shared/stillLayout.ts`, `src/lib/stillDraw.ts`): brand fonts (blocked if not
    loaded), inside the 9:16 safe zone, never in the watermark band (`watermarkKeepOut` reads "Watermark keep-out:"
    from the tool profile, editable per picture), a brand colour at 4.5:1 on the picture's 10th percentile or a solid
    box only when needed (`pickTextStyle`; no gradient, no glow). Exports at full resolution (`exportSize`) in 9:16,
    4:5, 1:1 ("Cuadro completo" by default; "crop" anchors on the watermark's corner so it is never cut). "Variantes
    de texto": headlines × CTAs × placements (`variantGrid`, MAX_VARIANTS 48) exported in one click as a stored zip
    (`shared/storeZip.ts`) and into the project as fija-NN-<format>.<png|jpg> (`PUT /api/projects/:id/still/:name`,
    `POST .../still/prune`); the picture is media slot 500 (fija-imagen). `stillChecks` gates export (§7.4 static).
  - En el párrafo de Publicidad, agregar: "«Estáticos» (`StaticsPanel`, carga diferida; `shared/adsStatic.ts`; Imagen
    fija paso 3): cada hook aprobado como imagen fija. `hookConcept` → `stillImagePrompt` da el prompt para Grok sin
    texto, con lugar libre donde va la frase. La persona sube la imagen a `estaticos/<hookId>-imagen.<ext>`. La app
    pone la frase en pantalla del hook (y opcional el llamado de un CTA aprobado, `ctaId`) con `drawStill`, y exporta
    9:16/4:5/1:1 a `publicidad/<serie>/estaticos/<hookId>-<formato>.png` (variantes de texto `-vN-`,
    `staticFile`/`STATIC_FILE`). `AdsState.statics` guarda los ajustes por hook. Los controles son los de Imagen fija
    (`staticChecks`) más hook sin aprobar y claim/policy de la revisión. El CSV de la tanda (`campaignCsv`) suma las
    columnas tipo/formato y lista los estáticos de sus hooks después de los videos; `estaticos/estaticos.csv`
    (`staticsCsv`) lista todos. Anda sin clave: los prompts se copian (también todos seguidos) y las imágenes se suben
    a mano."
  - Add under Publicidad (or under the explainer craft list): - "Usar como cuerpo o llamado"
    (`shared/adsFromExplainer.ts`, `ExplainerToAds` in MotionStudio, `POST /api/ads/:series/pieces/from-explainer`,
    `GET /api/ads/:series/explainers/:project`): a finished explainer's saved render
    (`explainerVideos`/`pickExplainerVideo`: video-final-<format>.mp4 first, else the browser's video-<format>)
    becomes the clip of an approved meat or CTA of the same series (`explainerTargets`) or of a new one
    (`explainerPiece`: approved, manual, all levels, its seconds `pieceSecondsFor` the ad length, its text the voice
    said in the stretch, `voiceInRange`), copied on the server into publicidad/<series>/media/ and the piece's cached
    render dropped. The piece keeps its budget: `fitClip` plays a longer explainer from an in point
    (`media.clip.from`, clamped) for the piece's seconds (up to 120 s), a shorter one holds its last frame. The render
    plays a clip from `ShotMedia.clipFrom` and draws nothing over an explainer clip (`media.clip.explainer` →
    `ShotMedia.finished`: it brings its own words, subtitles and notice). The way back: a hook, meat or CTA with no
    clip shows "Hacelo como explicativo" (`onToExplainer`). A hook is one kinetic title (`kineticExit` on the hook
    template: the words assemble and, when `readingNeed` still fits, fall apart; `kineticHookSeconds` rounds up with
    about half a beat of margin and may run past the 3 or 4 s slot, and `fitClip` uses the first seconds). The scene
    also fits the voice (`readingNeed(voice) + 0.25`). When the ad's share is longer than the capped scene, the words
    do not fall, so the held frame is not a scatter of words. A meat longer than 15 s is one short hook-template
    scene per sentence or clause (`meatScenePlan`: 2 or 2.5 s, and those scenes add up to the meat). A short meat or
    CTA stays one line per sentence, and a CTA closes on the logo. The script's problem is the piece's text in plain
    words (`problemOf`); the id stays in the title and the project slug. The script is built with no AI
    (`starterScript`/`starterPiece`); the brief notes the piece (`seedNotes`, and `withSeedNotes` replaces an earlier
    "Desde Publicidad" line) and "Usar en Publicidad" opens on that piece (`seedPieceId` takes the last match,
    applied once). "Hacer en motion graphics" does the same for every approved piece of the open tab, skips a piece
    that already has a project (`projectForPiece`), deletes the empty folder when the save fails, and stops at 20
    per click (`MOTION_BATCH_MAX`). A new hook is not created from this
    panel (`kind === "hook"` still saves a meat); an existing approved hook is the target.
  - "Mascota en código" (`shared/mascot.ts`, `MascotPanel` lazy in SeriesEditor, `GET/PUT/DELETE
    /api/series/:id/mascot`, `POST /api/mascot/code` with a key): a series can hold one original mascot as code,
    `drawMascot(ctx, t, pose)` (`MASCOT_CONTRACT`; pose = x, y feet, scale 1 = 400 px tall, facing ±1, expression
    neutral|happy|surprised|worried|talking, mouth 0..1, gesture idle|wave|point|present|cheer, reach 0..1, lookAt;
    `normalizePose`, the same as `MASCOT_POSE_JS` in the sandbox). "Copiar el prompt para Opus" (`mascotPrompt`:
    invented, never a known character or "in the style of"; brand palette only; flat or halftone/dither; blink and
    breath pure in t; NOMBRE/DESCRIPCIÓN + one js block, `mascotFromReply`). The paste box runs it in the code-scene
    sandbox (`testMascot`, `MASCOT_STUB` + `{source, main: true}`, "pose" messages measured) at `MASCOT_SAMPLES` and
    shows a contact sheet; `checkMascotSamples` blocks errors, slow calls, nothing drawn, a background, impure frames
    and a figure off its pose, and warns on faces, gestures, mouth, facing, scale, x, lookAt or t that change nothing
    (`offBrandColours` warns too). The code lives in biblioteca/<series>/mascota.js (server-owned); the bible keeps
    only "Mascota en código: {file,name,description,sig}" (`mascotLine`/`readMascotLine`; old series have none). Every
    code scene's sandbox gets it (`sandboxDoc(..., {source})`: its own wrapped script before the scene's code;
    `info.mascot.draw` and `drawMascot`, posed safely with save/restore; a scene that defines drawMascot is refused;
    the code prompt says "reuse drawMascot, never redraw the character"; `samplesSig` includes the mascot's sig). With
    no drawable host character, the mascot hosts the character scenes (asset `MASCOT_ASSET` "mascota:codigo", in
    hostScenes and the writer's cast): `CodeDeck` draws it on `MASCOT_FRAME` at `mascotPoseAt` (mouth from the voice,
    face from `expressionFor`, gesture eased in on its beat; `mascotNeeds`, `mascotKey`), frame-exact for renders,
    which stop on a missing or failing mascot (`NO_MASCOT`). "Descargar la hoja de la mascota (PNG)" exports
    `SHEET_SAMPLES` with no words, for Grok as an @ref.
  - Under Publicidad (or as an idea-65-style bullet) add: - "Que lo diga un personaje" (`shared/adsSpeaker.ts`,
    `SpeakerPanel`, `SpeakerBatch`): each hook/meat/CTA can be said on camera by an invented adult of the cast with an
    approved image (`speakerCandidates`). `speakerPrompt` writes the Grok video prompt with no key: @ref + identity,
    place by series type (`defaultPlace`), one action, locked camera, the series look or `PLAIN_VIDEO`, the line in
    quotes via `speakingPrompt` (emotion as tone, `spokenLine` strips inner double quotes), `audioLine` with no music,
    and the clip that fits the words (`speakerFit`: words/2.7 + 0.4 s, at least the piece, 6/10/15). A meat longer than
    15 s is several of those clips (`sequenceSpeakerPrompts`): the same character, place and look, each stretch of the
    line, and «Copiar todos los prompts» copies the sequence. [VERIFY], an empty line, or a line that does not fit the
    piece's seconds blocks the copy (`speakerIssues`). The choice is saved as `piece.speaker` (PieceSpeakerSchema in
    shared/ads.ts; PATCH .../pieces/:id, null removes it; a change drops the cached render) with `sound` (clip's
    voice, or clip muted via `clipGain` with the piece's voice as fallback) and `from` (the clip's in point). The
    render's notice becomes `speakerDisclosure` ("Personaje (y voz) hechos con IA", `pieceDisclosure` in adsRender).
    Lip sync is read from the tool profile's "Lip sync:" line (`lipSyncNote`, ToolInfo.lipSync; Grok: [NOT SURE]).
    "Que lo digan los personajes (lote)" copies or downloads the approved pieces' prompts in order, with a quantity
    (`speakerBatch`/`speakerBatchText`). "Que lo diga la mascota" (series with a code mascot) opens an explainer from
    `AdSeed.presenter = "mascot"` (`mascotScript`: one character scene per sentence with MASCOT_ASSET); "Usar en
    Publicidad" can also target an approved hook (`TARGET_KINDS`).
- No key, word entrances, metaphors, fonts and text style (idea 67):
  - "Sin clave" (`shared/handoff.ts`, `ClaudeHandoff.tsx`): with no AI key every writer task goes to claude.ai by copy
    and paste. A writer request is data (`WriterTask` {system, prompt, schema, finish} in server/claude.ts:
    `menuTask`, `storyTask`, `reviseStoryTask`, `hookVariantsTask`, `boardTask`, `reviseBoardTask`, `rewriteShotTask`,
    `motionTask`, `reviseMotionTask`, `reviewMotionTask`; server/adsWriter.ts: `hooksTask`, `meatsTask`, `ctasTask`,
    `clipTask`, `reviewTask`, `copiesTask`; `runTask` runs one on the writer). Routes take an optional `handoff`
    (`HandoffSchema`, `viaWriter`): `{mode: "prompt"}` → `{prompt, chars}` (`taskPrompt`/`assemblePrompt`: system
    blocks, request, `ANSWER_LINE`, JSON schema); `{mode: "paste", reply}` → `readReply` (fences, prose, <think>, a
    wrapper, trailing commas; the same helpers kimi.ts uses), the same schema and `finish`, answered like the writer
    (`demo: false`, `pasted: true`); a bad paste is `PasteError` (400, names the field). Client: `asks`/`sendAsk`/
    `askPrompt` in src/lib/api.ts. With no key each writer button reads "Ver un ejemplo" (the sample) with
    ClaudeHandoff next to it (`promptSizeText`: long over 40k, very long over 150k); with a key nothing changes.
    Explainer review by paste attaches the contact sheet by hand (`sheetFileName`, `NO_SHEET_REPLY`, `takeReview`,
    `ReviewHandoff`/`ManualRound`). Publicidad splits long requests into prompts (`PASTE_PER_PROMPT`, `part`/`parts`,
    `PartsHandoff`, walk state in src/lib/handoffWalk.ts); pasted platform texts carry their hook/CTA sig and only
    fresh ones are used (`withSigs`/`freshCopies`, shared/adsHandoff.ts).
  - "Entrar con la palabra" (`shared/wordEntry.ts`, `MotionPiece.enterOnWord`, on for new pieces, `enterOnWordOn`): an
    element whose words the scene's voice says enters on that word's start (`voiceWordSpans`, the subtitles' word
    times; tolerant `findSaid`). `arrangeScenes(..., words)` runs `enterOnWords` before `snapElements`; precedence
    tweaks.at > onWord > onBeat > template (`placedAt`), `onWord` on the arranged copy only. The word wins over the
    beat but never costs reading time: `readableOnWords` drops an entry that adds or worsens a `readingIssues` or
    `quietGaps` problem.
  - "Escenas metáfora" (template `metaphor`, `shared/metaphor.ts`): one Grok picture (or muted clip) that explains an
    abstract idea, with the scene title as its line; `scene.metaphor` {image, video, cast} (`pickMetaphor`, cast from
    `metaphorCastOf`, never a screen), prompts `metaphorImagePrompt` (no text, 1:1, look or PLAIN_PHOTO) /
    `metaphorVideoPrompt`, by paste `metaphorOpusPrompt`/`parseMetaphorReply`, batch `metaphorBatch`. Uploads go to
    project slot `METAPHOR_BASE` 600 + N (`metaphorUploadSlot`, asset "metafora:N", played from a blob URL); until
    then a placeholder draws and `metaphorIssues` blocks the render. Drawn whole (watermark never cut) by
    `metaphorLayout` (9:16 budgets the real text block above the floor) and `metaphorSettle`; it turns the AI notice on.
  - "Fuentes propias de la marca" (`shared/brandFonts.ts`, `BrandFontsBox` in Editar serie → Marca): font files
    (woff2/woff/ttf/otf by bytes, `FONT_MAX_BYTES` 8 MB, `BRAND_FONT_MAX` 24) in biblioteca/<series>/fuentes/
    (`PUT/GET/DELETE /api/series/:id/fonts`), faces in `brand.fonts` {file, family, role, weight, style, name};
    displayFont/uiFont naming an uploaded family load from its files (`resolveBrandFont`), else Google Fonts. The
    browser registry (src/lib/fonts.ts) is per series (`registerBrandFonts`, `ensureBrandFonts(seriesId, brand)`,
    `fontBytes(seriesId)`), used by MotionStudio, RenderPage's font gate, the code sandbox, Imagen fija, Estáticos and
    stories with `TextStyle.font = "brand"`. The UI says "Usá fuentes que tengas permiso de usar".
  - Story text style (`TextStyleSchema`, VideoPanel "Texto · estilo"): `nameColor` ("role" or a hex),
    `subtitlePosition` bottom/center/top, `headlinePosition` top/center, `font` app/brand/other with `fontFamily`.
    `storyTextLayout` (shared/storyText.ts) places both blocks for `drawOverlay` inside the safe zone, below CONCEPTO,
    above the AI notice, never subtitle over headline; defaults give the old look.
  - `server/playbook.md` is the trimmed operative summary (no sources, tags or 75 s template, nothing the app enforces
    in code); `tests/playbookTrim.test.ts` keeps it under 1800 words with every hard rule. Playbook examples are
    shapes, not business facts (the Contradiction example is marked illustrative).
  - Decided: the app runs locally only (no deploy), sound effects are added by hand (no API), no GLB character (the
    code mascot covers it).
- Publicidad (Método 50-5-3, `src/components/ads/`, `server/ads*.ts`, `shared/ads.ts`): the second section of the app,
  paid ads next to Playbook's organic content (header toggle). An ad = Hook + Meat + CTA; pieces are written and
  rendered separately and the combination hook × meat × CTA is pure code (`combine`, `varyHook`), never the AI. Per
  series, `publicidad/<series>/campana.json` holds the offer profile (product, audience, problem, promise, objections,
  proofs, tone, forbidden, landing, the audience's words, presenter: the Playbook writer reads the same profile via
  `offerOf`), the catalogue, the clips, the metrics and the batches; `clips/`, `media/`, `piezas/` (one render per
  piece, the cache) and `anuncios/<tanda>/` (videos named by id `H12-M3-C2` plus `anuncios.csv`). Every hook carries an
  awareness level 1–5 (`LEVEL_INFO`; 1–3 cold, 4–5 retargeting), an angle and a formula; meats have a format (demo,
  testimonial, education, story, faceless), the levels they serve and a neutral opening; CTAs say what, why, when and
  how easy. An ad lasts any whole number of seconds from 6 to 120 (`AD_MIN_SECONDS` / `AD_MAX_SECONDS`; presets 6, 10,
  15, 30, 45, 60, 90, or a typed length). `defaultSplit` gives the hook 3 s (4 s from 30 s up), the CTA 3 s up to a
  15 s ad, 4 s up to 45 s and 6 s above, and the meat the rest (60 s = 4 + 50 + 6). A 6 s ad is the exception:
  2 + 2 + 2, so every ad has a meat. A hand `split` on the batch is
  kept when the three parts are whole seconds from 0 to 120 and add up (`splitIssue`, in Spanish). The length fields
  show the raw draft (`split ?? defaultSplit`), so one edit does not snap back to the default. Words still follow
  `WORDS_PER_SECOND` (~2.7) through `wordsFor`. A share under 1 s is not asked of the writer (`noShareNote`,
  `lengthsForKind`). `combine` and `varyHook` only use pieces whose seconds match that batch's share. A meat longer
  than 15 s is a sequence of Grok clips of 6, 10 or 15 s (`grokSequence`, `shared/adsSequence.ts`): the fewest clips
  first, then the least waste, longer clips first, and only the last one is cut. One prompt and one
  upload per clip, the same place and look (`PLAIN_VIDEO` when the series has none), each clip continuing the action
  instead of restarting it. A normal meat's clips stay silent: the piece's voice says the line. Only "Que lo diga un
  personaje" clips speak (`speakingPrompt` per stretch). Each clip after the first says to use the last frame of the
  previous one (`continuityNote`). The render plays them in order
  and cuts the last to the meat (`expandPiece`, a hard cut only inside the sequence). A missing slot uses the piece's
  image, and a batch warns before it runs. A clip index outside the sequence is a 400 in Spanish. The piece's voice
  ducks every shot it covers, and loudness is measured per piece, not per clip. `estimate` adds the seconds of the
  pieces still to render. `RENDER_VERSION` is `l2`, so
  older caches render again. Piece `seconds` stay a number (old pieces may be 2.5 s); batch seconds are integers.
  Newly written 6 s pieces are 2 + 2 + 2 and 10 s pieces are 3 + 4 + 3. Levels 1–3 suggest
  45 s and levels 4–5 suggest 15 s (`suggestedSeconds`); the suggestion never replaces a length the person already
  touched (`lengthTouched`). "Hacer en motion graphics" writes one explainer project per approved piece of the open
  tab, skips one that already exists and stops at 20 per click. A single clip of 15 s or less is
  still `clipSecondsFor`. "Fuentes" ranks winning hooks: a
  platform CSV (`parseMetricsCsv`, Meta headers in Spanish or English; hook = 3 s views / impressions, meat = average
  watch time, CTA = clicks and conversions). A header that starts with "Costo por" or "Cost per", and ThruPlay, are never
  3-second views. Meta's "3-second video views" and "video views at 3 seconds" are. TikTok's 2-second views, 6-second
  views, Cost and Clicks (including "Clicks (Destination)") stay in their own columns. When the 3-second column is
  missing and 2-second views exist, the hook rate uses those and is labelled "2 s" in Fuentes and in the pattern sent
  to the writer (never "0% ven 3 s"). Under the impression
  minimum (1000, editable in Fuentes, not saved) the row says "sin datos suficientes" and is not sent as a winner. A hook
  that arrived from Playbook with no impressions stays "del orgánico, sin medir"; one with some impressions under the
  minimum says "sin datos suficientes". The CSV's id is the platform
  name `{ID de la serie}_N{nivel}_{anuncio}_{segundos}s_9x16` (the series id in upper case without accents, for example
  IMAN_N2_H12-M3-C2_45s_9x16, or H12v3 when that hook has several voices). The file on disk keeps the raw ad id. Import
  matches the token in any case, still reads an old name with no prefix, still reads the id when Meta added
  " - Copy" or " – Copia" or when words sit in front, and drops a name from another series (the count
  is shown in Spanish). Hooks sent from Playbook ("Enviar a Publicidad") and uploaded clips
  transcribed with whisper-1 (`transcribeClip`, same OPENAI_API_KEY; or a pasted transcript) and split by the writer.
  "Generar tanda" chains hooks → meats → CTAs → combine with a yes/no approval pause per stage. Before a run: local
  flags (length, near-duplicates) plus the writer's review (policy, mismatch, claims), the estimate and a weekly
  limit. The run renders each piece once with `renderPiece` (render.ts, `alwaysAudio`) and cuts the ads with
  `concatPieces` (encoded packets copied, no re-encode). `renderAdWhole` runs only when that cut itself failed, and
  only after the same voice-cut check; an ad that uses a piece whose render failed is skipped. Every piece's mix is
  brought to -14 LUFS (`loudness`; per piece in the whole-ad fallback, raised 20 dB at most), so the cuts never jump
  in level, and
  cached piece renders carry `RENDER_VERSION` in their name (older ones are rendered again); the platform texts (primary,
  headline, button) come from one writer call per 50 hook+CTA pairs. `server/ads.md` is the method the writer reads.
  Each piece can carry up to 10 voices (`VOICE_VARIANTS_MAX`, `shared/voiceVariants.ts`). The existing single voice
  (uploaded, or generated with the presenter's voice `offer.ttsVoice`) is v1 with `cutOk` when old data loads, so a
  voice that already ran past the piece still renders, and a piece with one voice keeps the old ad id (`H12-M3-C2`)
  and the old cache name (`H3.l2.mp4`); "Generar las N voces que faltan" still fills approved pieces that have none,
  and "Generar voz" on a piece with one voice replaces that voice. Extra voices are files the person made outside the
  app (mp3, wav, m4a, ogg or webm, type read from the bytes, 25 MB): the app does not call ElevenLabs or any voice API.
  A new voice is `POST .../voices`: the server allocates v1–v10 inside the save lock. `PUT .../voices/:vid` only
  replaces an id that exists (404 in Spanish otherwise). Ids are not reused after a delete while a batch still names
  that variant; when the piece has no voices left and no batch names one, `voiceSeq` goes back to 0. Files live in
  `publicidad/<series>/media/<pieceId>-voz-<vN>.<ext>` (a `.webm` voice is served as `audio/webm`). A voice starts
  0.15 s into the piece and is cut at its end. One that runs past the piece shows "La voz N dura X s y la pieza Y s"
  and blocks a fresh render until the person accepts the cut (`cutOk`) or replaces the file. A current cache
  (session or a file whose name carries `.l2.`) is not blocked, and a blocked variant is left out of the count and
  the estimate. Several voices render one video each (`H3.v2.l2.mp4`, still `RENDER_VERSION` l2, −14 LUFS) and the
  ad id adds the variant only while the piece has more than one voice (`H12v3-M3v1-C2v2`). A piece whose speaker
  sound is `clip` stays off that axis: its render does not play the piece voice and is saved as the single piece file
  even when that piece has several voices. Ad ids and file names stay
  uppercase; `parseAdId` still reads either case from a metrics file. Going from one voice to two moves the cache
  only when that file is already current. Before a batch the person picks which variants enter (saved with the batch
  settings); over 300 ads warns and over 1000 blocks. The weekly limit still counts ads and is enforced on the
  server. A stopped run keeps only the ads that were uploaded (`POST .../batches/:id/kept`), or removes the batch
  when none were. `campaignCsv` and the batch CSV add `voz_hook`, `voz_meat` and `voz_cta` (the variant's name).
  `parseMetricsCsv` matches the new ids. "Probar un anuncio" cuts one ad from three chosen pieces (the same cache;
  a voice select only when that piece has more than one and the clip is not the one speaking). A
  piece's cache shows its format: webm means this browser has no H.264 encoder (the ads would be VP9 in MP4), and
  "Sacarlas de la caché" (DELETE .../pieces/:id/render) lets a browser that has one render them again.
  "Subir clips en lote" (`shared/adsBulk.ts`, `BulkUpload`; the queue lives in AdsStudio and is shared by Hooks, Meats,
  CTAs and Combinar): the file name sits next to the copy button and, in a batch, on its own line above each prompt
  (`speakerBatchText`, `allStaticPrompts`, `sequencePromptText`). It is never inside the text Grok reads. A single clip
  is the piece id (H12.mp4). Clip 2 of a longer meat is M3-c2.mp4 (1-based; the route index stays 0-based). The piece
  image is H12-img.png, H12-image.png or H12-imagen. An estático is H12-estatico.png and is not a bulk slot (its picture
  lives at estaticos/<hookId>-imagen). On a multi-clip piece the one "Copiar prompt de video" copies the piece prompt
  with no save line; only the per-clip prompts name their file, in the header. A finished explainer clip is one slot
  even when the meat is longer than 15 s. `parseSlotName` takes any case, spaces, dashes or underscores, and extra text
  after a single code (`M3-c2 (1).mp4`). A letter stuck to letters, digits or "_" (a Grok download, DSC_M100) is not a
  piece id. A `c` plus digits right after a separator is the clip marker; `M3c2` stays piece M3; two codes with words
  between them stay ambiguous. A whole ad id in the name (H12-M3-C2, with or without a series prefix like
  IMAN_N2_, a voice suffix, the _45s_9x16 ending, or Meta's " - Copy" / " – Copia") is ambiguous too, so it is
  not uploaded as one piece's clip. The table says nuevo, reemplaza el actual, no encontré la pieza, ese clip no existe en
  esta pieza, formato no válido, elegí el lugar, hay más de una pieza en el nombre, esa pieza es de otra pestaña, or
  repetido. Two files for one slot: every later one is repetido and waits for a hand pick. A row already listo is not
  uploaded again. A file that is not a picture or a video (a .txt, M4A, HEIC, AVIF, or a WebM with no video track) says
  formato no válido before the name is read. ftyp counts as video only for the video brands (isom, mp41, qt, 3gp…).
  "Subir N clips" sends one file at a time through the piece-media route. Parar and the progress stay up when the tab
  changes, and a second upload does not start. Replacing a clip drops that piece's cached renders. An -img file goes
  to the piece image, not to estáticos. "Próxima tanda" (`shared/adsNext.ts`, Combinar, once a metrics CSV is in): pure
  code ranks pending, approved and archived pieces, plus the voices named on the ad id. A rejected piece is left out of
  the ranking, the "N de M con datos" count and the mean, and `planApply` never changes it. Under MIN_IMPRESSIONS
  (1000, the person's own setting, never below 1; 0 impressions is always sin datos) a piece or voice is left as it is.
  With at least 3 pieces of that kind that have data, and a keep share above 0 (DEFAULT_KEEP_SHARE 0.2, saved as
  keepPercent in campana.json), the top share is kept and the rest with data are archived. A tie with the last kept
  score stays too, and the why says so. Ids sort by number (H2 before H10). Fewer than 3 with data, or a keep of 0 %,
  only shows the ranking: nothing is archived, Aplicar stays off at 0 %, and a pending winner can still be approved
  when the share is above 0. A missing ranking column (avgWatch for meats, clicks and conversions for CTAs), or every
  row of it at 0, is "sin datos suficientes: el CSV no trae la columna X" and is not ranked by zeros. CTA reasons show
  the conversion rate and the CTR as percentages, and the mean of those rates. A speaker piece whose sound is the clip
  has no voice pick. `hookPatterns` and `measuredWinners` skip archived and rejected hooks as winners and still leave
  their text in `existing`, so the writer does not repeat them. Fuentes shows archivado or descartado instead of a
  winner rate. Nothing is written until Aplicar: a drop becomes status "archived" (not deleted; old campana.json
  without that status, keepPercent or nextUndo still loads), a keep becomes approved, and the winning voice of a piece
  is ticked in "Voces de esta tanda" while a losing voice is unticked. A missing id is skipped. Aplicar saves the undo
  record (`nextUndo`) in campana.json, calls PATCH /api/ads/:series/pieces one status at a time, then writes the voice
  picks; if a later call fails, the record keeps only what succeeded. Deshacer reverts a piece only while its status
  is still the one Aplicar wrote, and a voice only while the pick still matches; it names the ones it skipped. A pick
  that was absent (`before: null`) is removed, so every voice of that piece is open again. "Variantes de los
  ganadores" refuses a rejected or archived hook, and a hook this ranking would archive. It asks the existing hook
  writer for N new hooks (1–20) in that winner's angle and formula, with the stored text, level and stats in the
  request (never invented numbers), by the same copy-and-paste handoff. With a CSV imported, each piece card shows
  that same verdict under the text; a piece absent from the CSV says "sin datos suficientes". An older ad id without
  a voice suffix (H12-M3-C2) still matches its pieces and does not name a voice.
- Embudo (`shared/funnel.ts`, `EmbudoPicker`): three floors on top of awareness levels 1–5. Arriba (Descubrir) is 1–2, medio (Considerar) is 3, abajo (Decidir) is 4–5. The brief saves an optional `brief.funnel` for Historia, Explicativo and Imagen fija (missing means today's behaviour and the writers get no funnel block). Publicidad picks a floor above the level chips and on the first step of Generar tanda; the chips stay. The guidance block is English and goes after the prompt cache only when a floor is set (`funnelBlock` in `contextBlocks` and ads `blocks()`). Abajo without a confirmed proof or a real offer, a hard sell on arriba, and a brand that speaks before the pain on arriba block approval until fixed or dismissed (`embudo:prueba`, `embudo:venta`, `embudo:marca`). Old pieces with no floor are not checked. The floor shows as a tag, a line in pieza.md when it is set, the `embudo` column of anuncios.csv (empty when the level does not map), and a per-series count in the writers' room and the projects list. `levelsOf` for a floor lives only in `shared/funnel.ts`; `shared/ads.ts` keeps `levelsOf(chosen)`.
- Audio (`shared/audio.ts`): each line is heard as subtitles only, said by Grok inside the clip (`speakingPrompt`),
  a generated voice (said with the line's written emotion) or the person's recorded/uploaded voice; characters have a
  default, shots can override. Per shot,
  `audio.clipSound` (dialogue/ambient/effects + what is heard) rewrites the video prompt's "Audio:" line only when the
  person set it (`clipPrompt`; never music), and `audio.clipLevel` (full/low/mute) sets the clip's own sound in the
  render. A narration made outside (ElevenLabs) comes in as one file (`NarrationImport`, `lib/narration.ts`): cut by
  the words (whisper-1 via /api/lyrics/sync) or by the pauses, each cut on the quietest frame, one part per shot or
  scene. `brief.narrator = "without"`: no narrator role in the story (a story check blocks it) and no explainer voice. Voices
  and sound effects are per-shot project media; one music track per piece ducks under speech and can pull the
  cuts onto its beats (`findBeats`/`alignCuts` in render.ts). Subtitles always stay.
- 9:16 safe zone (`shared/safeZone.ts`): Reels, TikTok and Shorts cover the top bar, the caption at the bottom and the
  buttons on the right. The app's own text (subtitles, the AI notice, CONCEPTO / SIMULACIÓN, the headline, lyric
  credits) stays inside it in every renderer, and a low lyric ends above the notes; explainer titles start below the
  top bar; the explainer preview can show
  the bands ("Ver lo que tapa la app", never in the video). The values are [NOT SURE] approximations: check them
  against the apps when they change.
- A request or a saved file that fails its zod check answers with the first problem in Spanish, the field and what is
  wrong (`checkErrorText`, `shared/errors.ts`), never a bare "faltaban datos".
- Each series can list "Momentos del calendario" ("cuándo: qué pasa"); `shared/calendar.ts` reads the "cuándo" in
  Spanish and finds its next date (a week or month that has begun is today). The brief suggests the three nearest
  for "Gancho del momento"; the story writer and Publicidad get them all, nearest first (`momentsForWriter`, after the
  prompt cache since it changes daily). A moment with no date it understands still goes to the writer.
- API keys stay on the server. Images come back as data URLs so the video canvas is never tainted.
- Tool features change: edit the tool's `.md` in `server/tools/`, never hard-code them. Tag each line
  [DOCS], [NOT SURE] or [TESTED]. Series are edited in the app (Brief → Editar serie / + Nueva serie); their files are in Spanish, and the
  "Lo que existe hoy" list is the only thing the writer may show as real (heading name in `shared/series.ts`).
- Never crop or hide a tool's watermark: "Cuadro completo" (full frame, no zoom) is on by default for Grok.
  Never add features that strip AI metadata or provenance; the disclosure line is on by default.

## Commands
- `npm run dev` — API on 8787 + Vite on 5173 (proxied `/api`).
- `npm run typecheck`, `npm run build`, `npm start`.
- `npm test` — `node:test` + tsx over `tests/` (the pure logic in `shared/` and the timing in `src/lib`, plus a guard
  that the drawing code never reads a clock or `Math.random`).
- `npm run e2e` — Playwright (`playwright-core`) starts the API and Vite on free ports, with temporary project, ads and
  library folders and no writer keys, and walks Playbook, one explainer, and a Publicidad batch of 2 ads plus the
  Meta (Spanish and English) and TikTok CSVs. It tries `CHROME_PATH`, Chrome, Edge, then Chromium already installed
  under `PLAYWRIGHT_BROWSERS_PATH` (`chromium-*/chrome-linux*/chrome`). `npx playwright-core install chromium` puts one there.
- `npm run playbook` — says whether `PLAYBOOK.md` and `server/playbook.md` drifted; `-- --write` records them in step.
- `npx tsx server/clock-check.ts` — lyric clock harness (kick grid, lyric gate, frames 100 and 400); needs the API on
  8787 and the same `PROJECTS_DIR`.
- CI (`.github/workflows/ci.yml`) runs typecheck, tests, build, clock-check against the API in sample mode, then the
  browser walk (`npm run e2e`, after installing Playwright's Chromium).
- `npx tsx server/clock-cli.ts sync|critique --project ID` — write or critique `proyectos/<id>/sync/`.

@PLAYBOOK.md
