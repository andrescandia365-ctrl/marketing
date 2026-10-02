# Grok Imagine

Last checked: 2 Oct 2026

Source: Grok's own answer, checked against xAI's Imagine docs (image generation, video generation, image-to-video, reference-to-video, extension; docs dated through 29 Sep 2026). The person pastes every prompt into the Grok app or grok.com/imagine by hand; the API is not used.

Tags: **[DOCS]** in xAI's docs · **[NOT SURE]** not confirmed, don't rely on it · **[TESTED]** the person tried it in Grok and it held. When Grok changes, edit this file and restart the app.

## What it can do

- [DOCS] Images in 9:16 (also 1:1, 16:9, 4:3, 3:4, 2:3, 3:2 and more). The shape is set in Grok's controls; the prompt only reminds.
- [DOCS] Image size 1k or 2k.
- [DOCS] Text-to-video and image-to-video. In image-to-video the still is the pinned first frame and the prompt animates it.
- [DOCS] Video in 9:16. Image-to-video keeps the still's shape, so the still must already be 9:16 or it gets stretched.
- [DOCS] Clips of 1 to 15 seconds (API). Length is a control in Grok, not something the prompt sets.
- [NOT SURE] Which lengths the app offers today (older builds: 6 s and 10 s; newer posts: up to 15 s).
- [DOCS] Video resolution 480p, 720p or 1080p (1080p for text-to-video and image-to-video on Video 1.5).
- [DOCS] Sound is generated with the clip by default: ambience, effects and speech.
- [NOT SURE] Whether "no music, no speech" in the prompt is always obeyed.
- [DOCS] Extend continues a clip from its last frame, adding 2 to 10 seconds, capped at 720p.
- [DOCS] Reference images (up to 7) keep a person or place the same across clips.
- [NOT SURE] The app's exact limit on reference images.

## How to write prompts

- [DOCS] Image prompt: one paragraph, roughly 40 to 90 words. Order: subject (age, build, clothes) → action or pose → place → time and light → lens and framing → style. Front-load the subject. No shot lists.
- [DOCS] Video prompt (animating a still): roughly 25 to 60 words. Do not describe the person again. One action, one camera move, what must stay still, then a sound line: "Audio: …".
- [NOT SURE] Timed beats inside a clip ("0–2 s: she turns; 2–4 s: push in") are not documented. Write one action per clip; a second beat is a separate clip made with Extend.
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

## Example (from Grok)

Image: "A tired but kind corner-store owner in his 50s, short graying hair, faded navy work jacket over a gray shirt, unlocking a corrugated metal shop shutter at dawn. One hand on the lock, body angled toward the door. Narrow quiet street, closed shops opposite, no cars, no pedestrians. Warm low golden sunlight from the left, long soft shadows, cool blue shade in the doorway. Eye-level medium shot, 35mm photo, shallow depth of field, natural skin, realistic film still. Bare shutter, no signage, no lettering."

Video: "He slowly lifts the metal shutter a short way; the slats clack and catch the light. His head stays down, expression unchanged. Slow push-in, no other camera move. Warm dawn light holds. Audio: a few metal clacks, distant birds, no music, no speech."

## Tests to run (turn NOT SURE into TESTED)

1. Timed beats: animate one still with "0–2 s: the door swings shut; 2–4 s: the light flickers." Do both happen, in order?
2. Silence: add "Audio: fridge hum only, no music, no speech." Is there music or a voice anyway?
3. Lengths: write down the clip lengths the Grok app offers today.
