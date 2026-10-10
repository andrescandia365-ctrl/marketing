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
  the series (`overusedMoves`, also in `roomBrief`). "5 variantes de gancho" (`POST /api/story/hooks`,
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
  `/api/brand/from-web`, localhost-only, public addresses only, checked on every redirect) proposes the brand kit;
  page claims stay [VERIFY] until the person confirms them into "Lo que existe hoy".
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
- Publicidad (Método 50-5-3, `src/components/ads/`, `server/ads*.ts`, `shared/ads.ts`): the second section of the app,
  paid ads next to Playbook's organic content (header toggle). An ad = Hook + Meat + CTA; pieces are written and
  rendered separately and the combination hook × meat × CTA is pure code (`combine`, `varyHook`), never the AI. Per
  series, `publicidad/<series>/campana.json` holds the offer profile (product, audience, problem, promise, objections,
  proofs, tone, forbidden, landing, the audience's words, presenter: the Playbook writer reads the same profile via
  `offerOf`), the catalogue, the clips, the metrics and the batches; `clips/`, `media/`, `piezas/` (one render per
  piece, the cache) and `anuncios/<tanda>/` (videos named by id `H12-M3-C2` plus `anuncios.csv`). Every hook carries an
  awareness level 1–5 (`LEVEL_INFO`; 1–3 cold, 4–5 retargeting), an angle and a formula; meats have a format (demo,
  testimonial, education, story, faceless), the levels they serve and a neutral opening; CTAs say what, why, when and
  how easy. An ad lasts 6, 10 or 15 s and `BUDGETS` splits it (15 s: hook 3, meat 9, CTA 3) at ~2.7 words/s; a piece's
  clip is the next 6/10/15 s length (`clipSecondsFor`) and the render cuts it. "Fuentes" ranks winning hooks: a
  platform CSV (`parseMetricsCsv`, Meta headers in Spanish or English; hook = 3 s views / impressions, meat = average
  watch time, CTA = clicks and conversions), hooks sent from Playbook ("Enviar a Publicidad") and uploaded clips
  transcribed with whisper-1 (`transcribeClip`, same OPENAI_API_KEY; or a pasted transcript) and split by the writer.
  "Generar tanda" chains hooks → meats → CTAs → combine with a yes/no approval pause per stage. Before a run: local
  flags (length, near-duplicates) plus the writer's review (policy, mismatch, claims), the estimate and a weekly
  limit. The run renders each piece once with `renderPiece` (render.ts, `alwaysAudio`) and cuts the ads with
  `concatPieces` (encoded packets copied, no re-encode; falls back to `renderAdWhole`); every piece's mix is brought to
  -14 LUFS (`loudness`; per piece in the whole-ad fallback, raised 20 dB at most), so the cuts never jump in level, and
  cached piece renders carry `RENDER_VERSION` in their name (older ones are rendered again); the platform texts (primary,
  headline, button) come from one writer call per 50 hook+CTA pairs. `server/ads.md` is the method the writer reads.
  Each piece can carry a voice (uploaded, or generated with the presenter's voice `offer.ttsVoice`; "Generar las N
  voces que faltan" does every approved piece); it starts 0.15 s into the piece and is cut at its end. "Probar un
  anuncio" cuts one ad from three chosen pieces (the same cache). The weekly limit is enforced by the server too. A
  piece's cache shows its format: webm means this browser has no H.264 encoder (the ads would be VP9 in MP4), and
  "Sacarlas de la caché" (DELETE .../pieces/:id/render) lets a browser that has one render them again.
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
- `npm run playbook` — says whether `PLAYBOOK.md` and `server/playbook.md` drifted; `-- --write` records them in step.
- `npx tsx server/clock-check.ts` — lyric clock harness (kick grid, lyric gate, frames 100 and 400); needs the API on
  8787 and the same `PROJECTS_DIR`.
- CI (`.github/workflows/ci.yml`) runs typecheck, tests, build, and clock-check against the API in sample mode.
- `npx tsx server/clock-cli.ts sync|critique --project ID` — write or critique `proyectos/<id>/sync/`.

@PLAYBOOK.md
