# MAGI-2 (Higgsfield)

Last checked: 27 Nov 2026

Used by hand in Higgsfield's web app (higgsfield.ai). Made by Sand.ai; launched 24 Nov 2026.

Source: Sand.ai's launch post (sand.ai/blog/magi-2), Higgsfield's MAGI-2 page and FAQ (higgsfield.ai/magi-2-intro) and its pricing page. Not tried in this app yet.

Tags: **[DOCS]** in Sand.ai's or Higgsfield's pages · **[NOT SURE]** not confirmed, don't rely on it · **[TESTED]** the person tried it and it held. When MAGI-2 changes, edit this file and restart the app (or mark a line from Modelos → Banco de pruebas).

## What it can do

- Clip lengths: 4-30
- [DOCS] Clips of 4 to 30 seconds, 1080p at 25 fps, with sound (ambience, effects, music and spoken dialogue generated with the video).
- [DOCS] A start frame and an end frame. Up to 10 images, 5 videos and 5 audio clips as references (Sand.ai's API; whether Higgsfield's web form takes all of them is not stated).
- [DOCS] Sound can be turned off.
- [DOCS] Up to 10 reference images through Sand.ai's API; the app keeps each cast member to the strictest cap among the tools (Grok's 14), so check the count per prompt.
- [NOT SURE] Lip sync: the dialogue it invents is lip-synced, but nothing says the mouth follows an audio file you give it. Use it for shots with no line, or make the shot mute and put the voice on with a lip-sync tool ("Bajar kit de lip sync"). For lines in your own voice, use Seedance.
- [NOT SURE] Its invented voice changes from clip to clip: never let it speak a recurring character's lines.
- [DOCS] "Six aspect ratios"; which ones is not listed. [NOT SURE] 9:16: check in Higgsfield's controls before planning a vertical piece.
- [DOCS] Price on Higgsfield: 2.5 credits per second at 1080p, on a monthly plan whose credits do not roll over. Higgsfield advertises US$ 0.08 per second; by plan it works out at about 0.06 (Plus, yearly) to 0.18 (Starter) per second.
- [DOCS] Higgsfield's own ranking puts Seedance 2.5 ahead of it; MAGI-2 is the cheaper one.
- [NOT SURE] Commercial use, watermark and AI labels on the output: not stated. Read Higgsfield's terms before using it in ads.
- [NOT SURE] Open weights: Sand.ai says it will open-source MAGI-2 "soon", with no date or licence.

## How to write prompts

- Image prompt (the start frame): one paragraph, 40 to 90 words, one frozen moment: subject (age, build, clothes) → pose → place → light → lens and framing → style. Make it in the image tool of your choice and upload it as the start frame.
- [NOT SURE] Video prompt: what the shot is for, who is in it with the identity line, then the action second by second ("0–3 s: …; 3–7 s: …"), one camera move, and what must not appear. Sand.ai says camera moves and cuts can be set in the prompt.
- Write cast members as @Name like in every prompt of this app; the shot kit numbers them as [Image1], [Image2]… in the order of its files.
- No dialogue in the prompt: lines are added by the app (subtitles or the voice) or by a lip-sync pass. Write "nobody speaks, no music".
- Realism comes from asking for flaws, never "cinematic": the series look goes in every prompt.

## Keeping the character the same

- The same rules as for every tool: one approved front image and a sheet per character, one identity line repeated word for word, the same references in the same order in every clip, and every clip started from an approved first frame. Seeds do not keep a character.
- [NOT SURE] Long takes (over 15 s) drift more: split them unless the shot needs the length.

## What to avoid

- [DOCS] Readable text, logos, interfaces, labels or numbers in the picture: all type is added on top by the app, and real screens come from the cast.
- [DOCS] Real people's likeness, famous characters, other brands' logos.
- [NOT SURE] Shots where a character speaks on camera: its invented voice is not yours, and it does not follow your audio.

## Tests to run (turn NOT SURE into TESTED)

1. 9:16: does Higgsfield offer it for MAGI-2?
2. A 6 s shot with no line from an approved start frame, sound off. Does the face hold? Is it exactly 6 s?
3. Lip-sync pass: that same clip through a lip-sync tool with the shot's voice (Bajar kit de lip sync). Does the mouth land?
4. Two clips of the same character, same references in the same order. Does the face hold?
5. Watermark: is there one on your plan? Where?
