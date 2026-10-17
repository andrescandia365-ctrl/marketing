# Grok Imagine

Last checked: 2 Oct 2026 (app tested by the person the same day)

Source: Grok's own answer, checked against xAI's Imagine docs (image generation, video generation, image-to-video, reference-to-video, extension; docs dated through 29 Sep 2026). The person pastes every prompt into the Grok app or grok.com/imagine by hand; the API is not used.

Tags: **[DOCS]** in xAI's docs · **[NOT SURE]** not confirmed, don't rely on it · **[TESTED]** the person tried it in Grok and it held. When Grok changes, edit this file and restart the app.

## What it can do

- [DOCS] Images in 9:16 (also 1:1, 16:9, 4:3, 3:4, 2:3, 3:2 and more). The shape is set in Grok's controls; the prompt only reminds.
- [DOCS] Image size 1k or 2k.
- [DOCS] Text-to-video and image-to-video. In image-to-video the still is the pinned first frame and the prompt animates it.
- [DOCS] Video in 9:16. Image-to-video keeps the still's shape, so the still must already be 9:16 or it gets stretched.
- [DOCS] Clips of 1 to 15 seconds (API). Length is a control in Grok, not something the prompt sets.
- [TESTED] The Grok app offers exactly three clip lengths: 6, 10 or 15 seconds. Plan every shot as one of these.
- [DOCS] Video resolution 480p, 720p or 1080p (1080p for text-to-video and image-to-video on Video 1.5).
- [DOCS] Sound is generated with the clip by default: ambience, effects and speech.
- [TESTED] Sound on or off is a control the person sets in Grok for each clip.
- [NOT SURE] Lip sync: whether a character called by its @reference says a quoted line with the mouth matching the words (Publicidad's "Que lo diga un personaje"). Watch each clip; when the lips drift, mute the clip and play the generated or uploaded voice instead.
- [NOT SURE] Whether "no music, no speech" in the prompt is always obeyed.
- [DOCS] Extend continues a clip from its last frame, adding 2 to 10 seconds, capped at 720p.
- [DOCS] Reference images keep a person or place the same across clips.
- [TESTED] The Grok app keeps a library of named references ("Referencias", "+ Nuevo"); a prompt calls one with @name (e.g. @Marta). Up to 14 reference images. Own uploaded images work. References must be invented characters, never a real person's likeness.
- [NOT SURE] Whether that cap counts per prompt or for the whole library. The app reads the number from the line above: a cast member never carries more images than that (its approved image plus extra ones, like the face cut from its sheet or a loose view, each its own @name), and a shot that calls more gets a warning.
- [TESTED] A clip can take an initial, a middle and a final image (the middle icon in the clip bar is the middle frame), so one clip can move from one state to another. Own uploaded images work as frames; frames should share the shape (9:16) and similar light.
- [TESTED] Editing tools on a generated image: Segmentos (every object separated and editable on its own, "Descargar todo"), Eliminar fondo (remove background), Relación de aspecto, Crear video. Never use them to cover or remove the watermark.
- [TESTED] The video editor defaults to 720p and 10 s.
- [TESTED] Audio panel: sample voices (Ara, Eve, Leo, Rex, Sal and more) and the person's own audio, uploaded or recorded, can be used in videos (for example, a character's voice).
- [TESTED] The audio alone cannot be downloaded from Grok. A voice wanted as its own file (for the app's mix or subtitles) is made outside Grok or recorded by the person.

## How to write prompts

- [DOCS] Image prompt: one paragraph, roughly 40 to 90 words. Order: subject (age, build, clothes) → action or pose → place → time and light → lens and framing → style. Front-load the subject. No shot lists.
- [DOCS] Video prompt (animating a still): roughly 25 to 60 words. Do not describe the person again. One action, one camera move, what must stay still, then a sound line: "Audio: …".
- [NOT SURE] Timed beats inside a clip ("0–2 s: she turns; 2–4 s: push in") are not documented. Write one action per clip; a second beat is a separate clip made with Extend. Exception: when the brief asks for continuous takes, write the director's prompt below anyway (the person chose it to test).
- [NOT SURE] Director's prompt for a continuous 15 s take (the same prompt used for Seedance 2.5): a reference map first (the initial frame is the hero still; each character is its @ref sheet; the place is its @ref sheet, environment only; the images are law), then "one continuous handheld take, no cuts", then timed beats with each line, its emotion and the camera's mistakes (late pan, autofocus hunt, auto-exposure rolling), then hard rules (real skin with pores, grain throughout, no stabilization, no grade, no music, no text, no zoom, no slow motion, the light never changes, each line spoken once as written, raw phone-mic audio).
- [NOT SURE] Reference sheets as references: one 16:9 image with the character's views (front, three-quarter, profile, back, face close-ups with expressions, insets) or a place's six panels, saved as a named reference. If Grok does not hold the grid, make each view on its own.
- [NOT SURE] Realism comes from asking for flaws, not polish: name the camera, its flash, the grain, focus that misses and where the light hits; skin with pores and freckles. "Cinematic", "vintage" or "film still" make it look fake.
- [DOCS] Camera words that match xAI's examples: slow push-in, slow zoom out, pan, over-the-shoulder, tracking alongside, locked-off / static. Use one move. Slow beats fast.
- [NOT SURE] Handheld, dolly and close-up are reasonable words; their reliability is unknown.
- [NOT SURE] Negative lists may be ignored. Write the wanted state positively: "bare shutter, blank labels, no signage" instead of "no text, no logos".
- [DOCS] Consistency comes from the image, not the words: make one hero still per person or place, then animate from it or attach it as a reference. Also repeat one short identity line (age, hair, clothes, shopfront colour) in every prompt with that person or place.
- [DOCS] Put the shape and length in Grok's controls; mention them in the prompt only as a reminder.

## What to avoid

- [DOCS] Readable text, logos and labels in images or video. All type is added on top by the app.
- [NOT SURE] Weak spots and workarounds: hands on small objects (keep hands small in frame, or shoot over the shoulder); face drift once motion starts (start from a still you like, one slow head move); fast motion and crowds (one person, slow action, empty street); two actions in one short clip (split the shot or extend).
- [DOCS] Overloaded prompts, conflicting camera moves and requests for readable text are common soft failures.
- [DOCS] Images and videos from the Grok site and apps carry a Grok watermark. xAI's rules forbid removing or hiding it, so the app keeps the full frame visible.
- [NOT SURE] Watermark keep-out: bottom-right, 22% of the width, 7% of the height. "Imagen fija" never puts its words there and never crops it; the corner is a guess, so the person checks it on each picture (the studio lets them move it).

## Example (from Grok)

Image: "A tired but kind corner-store owner in his 50s, short graying hair, faded navy work jacket over a gray shirt, unlocking a corrugated metal shop shutter at dawn. One hand on the lock, body angled toward the door. Narrow quiet street, closed shops opposite, no cars, no pedestrians. Warm low golden sunlight from the left, long soft shadows, cool blue shade in the doorway. Eye-level medium shot, 35mm photo, shallow depth of field, natural skin, realistic film still. Bare shutter, no signage, no lettering."

Video: "He slowly lifts the metal shutter a short way; the slats clack and catch the light. His head stays down, expression unchanged. Slow push-in, no other camera move. Warm dawn light holds. Audio: a few metal clacks, distant birds, no music, no speech."

## Tests to run (turn NOT SURE into TESTED)

1. Timed beats: animate one still with "0–2 s: the door swings shut; 2–4 s: the light flickers." Do both happen, in order?
2. Silence: add "Audio: fridge hum only, no music, no speech." Is there music or a voice anyway?
3. Lengths: done: 6, 10 or 15 s.
4. Continuous take: a 15 s director's prompt with a hero still as the initial frame, two @ref sheets and three timed lines. Do the beats land near their times, and do the faces hold?
5. Sheets: does Grok draw a 16:9 character sheet with the same face in every panel? Does attaching it as a reference keep the face?
6. Lip sync: a 6 s clip from a character's @reference saying one quoted Spanish line. Do the lips match the words, and does it say the line once, as written?
