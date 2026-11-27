# Veo 3.1 (Google)

Last checked: 27 Nov 2026

Used by hand in Google's own apps (Flow at labs.google/flow, the Gemini app, Google AI Studio) or in APIMart's Playground. For shots with no line in your own voice.

Source: Google's Gemini API Veo page (ai.google.dev/gemini-api/docs/veo), its pricing page, Google Cloud's Veo 3.1 docs and the Veo 3.1 Lite and "Ingredients to Video" posts on blog.google. Not tried in this app yet.

Tags: **[DOCS]** in Google's pages · **[NOT SURE]** not confirmed, don't rely on it · **[TESTED]** the person tried it and it held. When Veo changes, edit this file and restart the app (or mark a line from Modelos → Banco de pruebas).

## What it can do

- Clip lengths: 4, 6, 8
- [DOCS] Clips of 4, 6 or 8 seconds. With reference images, 1080p or 4k, the clip must be 8 s: plan those shots as 8 s.
- [DOCS] 16:9 (default) or 9:16. [NOT SURE] 9:16 together with reference images: a developer reported it failing; check it once.
- [DOCS] 720p, 1080p or 4k (Standard and Fast); Lite makes 720p and 1080p.
- [DOCS] A start image (image-to-video), a first and last frame, and at most 3 reference pictures ("Ingredients to Video") to keep a person, a place or a product the same.
- [DOCS] At most 3 reference pictures per prompt: give each character one image (the approved front, or the face crop for close shots); a shot with more cast members than that needs the fewest.
- [DOCS] Sound is generated with the clip (Standard and Fast): ambience, effects and speech. Lite: [NOT SURE] ambience only.
- [DOCS] Lip sync: only for a line written in quotes in the prompt, spoken in a voice the model invents. It takes no audio file of yours.
- [NOT SURE] Its invented voice changes from clip to clip: never let it speak a recurring character's lines. For lines in your own voice, use Seedance (or a lip-sync pass on a silent Veo clip: "Bajar kit de lip sync").
- [DOCS] Prices on the Gemini API (per second, with sound): Standard US$ 0.40 (720p/1080p), 0.60 (4k); Fast 0.10 (720p), 0.12 (1080p), 0.30 (4k); Lite 0.05 (720p), 0.08 (1080p). No free tier for Veo on the API.
- [NOT SURE] In Flow and the Gemini app, clips spend the credits of a Google AI plan; how many per clip depends on the plan and the model.
- [DOCS] Videos made with Veo carry Google's SynthID watermark (invisible). [NOT SURE] A visible watermark on some plans: check yours, and never crop or cover it.
- [DOCS] Extend continues a clip from its end (8 s steps).

## How to write prompts

- Image prompt (the start frame): one paragraph, 40 to 90 words, one frozen moment: subject (age, build, clothes) → pose → place → light → lens and framing → style. Make it in the image tool of your choice and upload it as the start frame.
- [DOCS] Video prompt: subject, action, place, camera, style and sound, in plain sentences. Google's guide suggests naming the shot (close-up, wide), the camera move and the mood.
- No dialogue in the prompt: write "nobody speaks, no music" and describe only ambience and effects in "Audio:". Lines are added by the app (subtitles or the voice) or by a lip-sync pass.
- Write cast members as @Name like in every prompt of this app; the shot kit numbers them as [Image1], [Image2]… in the order of its files. With more than 3, keep the main ones.
- Realism comes from asking for flaws, never "cinematic": the series look goes in every prompt.

## Keeping the character the same

- The same rules as for every tool: one approved front image and a sheet per character, one identity line repeated word for word, the same references in the same order, and every clip started from an approved first frame. Seeds do not keep a character.
- [DOCS] At most 3 reference pictures: for a close shot use the face crop, for a wide shot the approved front image.

## What to avoid

- [DOCS] Readable text, logos, interfaces, labels or numbers in the picture: all type is added on top by the app, and real screens come from the cast.
- [DOCS] Real people's likeness, famous characters, other brands' logos (Google's own policy blocks many of these).
- [NOT SURE] A character speaking on camera: the voice is not yours and changes between clips.

## Tests to run (turn NOT SURE into TESTED)

1. 9:16 with one reference image: does Flow (or APIMart) make it?
2. A 6 s shot with no line from an approved start frame, sound on, "nobody speaks, no music". Is there speech or music anyway?
3. Lite: does it make sound beyond ambience?
4. Two clips of the same character with the same reference image. Does the face hold?
5. Watermark: is there a visible one on your plan? Where?
