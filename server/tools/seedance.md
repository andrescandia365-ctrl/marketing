# Seedance 2.5

Last checked: 26 Nov 2026

Used by hand in the web form of Replicate or APIMart (no API).

Source: Replicate's model page and README for bytedance/seedance-2.5, APIMart's Seedance 2.5 model page and API reference (docs.apimart.ai), and claudia.gallery's published workflow (an independent team that makes lip-synced music videos with it). The person pastes each prompt into the web form of Replicate (replicate.com/bytedance/seedance-2.5) or APIMart's Playground by hand and uploads the files from the app's "Kit de la toma"; the API is not used for this profile.

Tags: **[DOCS]** in Replicate's or APIMart's pages · **[NOT SURE]** not confirmed, don't rely on it · **[TESTED]** the person tried it and it held. When Seedance changes, edit this file and restart the app.

## What it can do

- Clip lengths: 4-15
- [DOCS] Clips of 4 to 30 seconds, any whole second (or "auto"). The app keeps story shots at 4 to 15 s: one line per shot, and long takes drift more.
- [DOCS] Text-to-video and image-to-video. The first frame is the `image` field on Replicate ("First Frame" on APIMart); an optional last frame too (`last_frame_image` / "Last Frame"). With a first or last frame, the aspect ratio must be "adaptive" (it follows the picture), so the still must already be 9:16.
- [DOCS] Up to 30 reference images, 10 reference videos and 10 reference audio files in one clip. The prompt calls them by number: [Image1], [Video1], [Audio1] on Replicate (APIMart's docs write @图片1, @视频1, @音频1; the bracket form is read the same way [NOT SURE]). The numbers follow the order the files are added.
- The app keeps each cast member to the strictest cap among the tools (Grok's 14), so every member fits here too.
- [DOCS] Reference audio: wav or mp3, 2 to 30 s each, 30 s in total, up to 15 MB each (APIMart's limits; Replicate's are not stated).
- [DOCS] Resolution 480p, 720p (default), 1080p, 4k. 480p is cheapest for tests; 1080p for close faces (claudia.gallery's rule).
- [DOCS] Sound is generated with the clip by default (`generate_audio`); off makes it silent.
- [DOCS] APIMart adds an "AI generated" watermark only when asked (off by default). Replicate states none. The app's own AI notice stays on in the render anyway.
- [NOT SURE] Lip sync: with the shot's voice file as [Audio1] and the line in quotes, the mouth follows that voice (claudia.gallery sings this way with the lead-vocal stem cut to the take). Neither Replicate nor APIMart says so in writing. Watch each clip; when the lips drift, regenerate or mute the clip and keep the app's voice.
- [NOT SURE] Whether the generated sound repeats the reference voice or invents another one. In the app, set the clip to Mudo and let the shot's own voice play, so the voice is always the same one.
- [DOCS] Prices on 26 Nov 2026: APIMart US$ 0.096/s at 480p, 0.216/s at 720p, 0.535/s at 1080p (Gold tier). Replicate does not show a price on the model page (claudia.gallery reports ~US$ 0.23/s at 720p). Failed runs are not charged on APIMart.
- [NOT SURE] How long the result links last: download each clip as soon as it is ready.
- [DOCS] Real human faces are blocked or must go through APIMart's asset library. This app only uses invented adults.

## How to write prompts

- [DOCS] Image prompt (the first frame): the same as for any image tool: one paragraph, roughly 40 to 90 words. Subject (age, build, clothes) → pose → place → light → lens and framing → style. One frozen moment. Make it in the image tool of your choice (GPT Image, Nano Banana, Grok…) and upload it as the first frame.
- [NOT SURE] Video prompt (claudia.gallery's order, which held for them): what the references are, the goal of the take, who is in it, the identity line, then the action second by second ("0–2 s: …; 2–5 s: …"), the camera, and a few requirements. 60 to 200 words. Timed beats are followed far better than in Grok.
- Write cast members as @Name like in every prompt of this app. The app's "Kit de la toma" turns each @Name into [Image1], [Image2]… in the order of its numbered files and adds the reference map at the top, so the person never renumbers by hand.
- [NOT SURE] A spoken line goes in quotes with the second it starts and its emotion; one phrase per time window. When lines follow each other without a breath, join them with a comma, not a full stop (a full stop makes a pause).
- [NOT SURE] Adjectives are obeyed and they stack: every "slight", "warm", "tired" shows up. Write only the ones you want.
- [NOT SURE] Say what is absent ("nobody else in the room", "the counter is empty") and name props that left the scene, or they come back.
- [NOT SURE] No smile while speaking or singing (the mouth gets stuck); a smile goes before or after the line.
- [NOT SURE] No posture rules ("stands still", "keeps the head straight"): they freeze the character and she reads as cold. Describe what she does, not how she holds herself.
- [DOCS] Camera words: slow push-in, pull back, pan, tracking alongside, over-the-shoulder, locked-off. One move per take.
- Realism comes from asking for flaws, never "cinematic": the series look goes in every prompt (camera, grain, focus that misses, where the light hits, real skin).

## Keeping the character the same

- [NOT SURE] Consistency comes from pictures plus one fixed sentence, not from seeds (claudia.gallery does not use seeds for it). Seeds only repeat the same take.
- Make the character once: an invented adult with an approved front image (face on, neutral light, plain background) and a reference sheet (Hoja de personaje: front, three-quarter, profile, back, expressions). Approve them in the series cast so they live in biblioteca/<series>/.
- Write one identity line (age, face, hair, build, clothes, one detail) and repeat it word for word in every image and video prompt with that character. The writer copies it from the cast; never paraphrase it.
- Every clip gets the same reference pictures, in the same order: first the approved front image, then the face crop (Otras referencias → cara) for close shots, then the sheet. The kit numbers them that way every time.
- Start every clip from a first frame you approved (the shot's image), never from text alone. The first frame carries the face; the references hold it while she moves.
- [NOT SURE] For close faces, add the face crop as its own reference and use 1080p: faces drift most in close-ups.
- Keep the wardrobe fixed for the whole piece. A change of clothes is a new reference image, approved before the shots that use it.
- [NOT SURE] When the face drifts in a take, do not fix it with more words: regenerate the take, or start it from the last good frame of the clip before (the app's "último cuadro").
- [NOT SURE] One person per take when possible; two characters in one take each get their own reference and their own identity line, and the prompt says who is where.

## What to avoid

- [DOCS] Readable text, logos, interfaces, labels or numbers in the picture. Never ask a video model for text or an app screen: all type is added on top by the app, and real screens come from the cast.
- [NOT SURE] Colour names can come out printed as lettering ("pink" on a wall): write "plain, no lettering" after a colour.
- [NOT SURE] A reference image can be cut to as its own shot: give each one a single role in the reference map, and end the last time window a little before the clip ends.
- [NOT SURE] Takes longer than 15 s drift (faces, props); split them.
- [DOCS] Real people's likeness, famous characters, logos of other brands.

## Tests to run (turn NOT SURE into TESTED)

1. Lip sync: a 6 s take at 480p with the character's approved image as first frame, its sheet as [Image1] and the shot's voice from the kit as [Audio1]. Do the lips follow the voice? Does the clip's own sound repeat it?
2. Silent: the same with sound off. Do the lips still follow [Audio1]?
3. Names: does "[Image1]" work on APIMart too, or only "@图片1"?
4. Consistency: three takes of the same character in different places, same references in the same order. Does the face hold?
5. Lengths: a 7 s and a 12 s take. Are they exactly that long?
