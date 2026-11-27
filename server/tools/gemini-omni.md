# Gemini Omni (Google)

Last checked: 27 Nov 2026

Used by hand in Google's apps (Gemini, Flow, AI Studio) or in Runware or APIMart. Omni Flash 1.2.

Source: Google DeepMind's Gemini Omni prompt guide, Google Cloud's video best practices and video prompt guide, and Runware's Omni Flash 1.2 guides (prompting, references, first and last frame, resolution and duration, extending). Not tried in this app yet. The chat skill "omni-prompts" carries the same rules for the person.

Tags: **[DOCS]** in Google's or Runware's pages · **[NOT SURE]** not confirmed, don't rely on it · **[TESTED]** the person tried it and it held. When Omni changes, edit this file and restart the app (or mark a line from Modelos → Banco de pruebas).

## What it can do

- Clip lengths: 4-10
- [DOCS] Clips of 3 to 15 s from text or a first frame; 3 to 10 s with a first and last frame or with reference pictures. The app keeps story shots at 4 to 10 s so every mode fits.
- [DOCS] Only 16:9 or 9:16, at 360p, 720p, 1080p or 4K.
- [DOCS] At most 10 reference pictures and 3 reference videos (one works best); a reference video gives only its picture, never its sound.
- [DOCS] A first frame (and optionally a last frame) or references, never both in the same request.
- [DOCS] Sound and speech are generated with the clip; there is no audio setting and no negative prompt, so the prompt decides everything.
- [NOT SURE] Lip sync: it lip-syncs the dialogue it invents, but your own voice as a reference is closed (allowlist only). Never let it speak a recurring character's lines; for those use Seedance or a lip-sync pass ("Bajar kit de lip sync").
- [DOCS] Extend adds 3 to 10 s to a clip of up to 27 s; new dialogue is not supported when extending.
- [DOCS] Every video carries Google's SynthID watermark. Never crop or cover it.

## How to write prompts

- [DOCS] Six layers in order: subject, action, setting, camera, lighting, audio. What is left out is the model's choice.
- [DOCS] Without camera direction the model picks the camera and may cut: write "single continuous shot, no scene cuts" and the camera move in the same sentence.
- [DOCS] Timing: bracketed timecodes, one per line ("[0-3s] …"), or "After three seconds, cut to …".
- [DOCS] Google recommends one scene per clip: A then B then C in one prompt often comes out muddled.
- [DOCS] From a first frame, describe only the motion: the picture already gives the subject, place and style.
- [DOCS] Audio in its own sentences: ambience "in the background", music with genre and mood, or "No music"; "No subtitles" and "No on-screen text".
- [NOT SURE] Dialogue: Google Cloud writes it after a colon with no quotes ("the woman says: …") so it is not printed on screen; other guides quote it. Lines are added by the app, so write "nobody speaks" unless the person asked for Omni's own voice.
- [DOCS] Camera words: static / locked-off, push in, punch in, pan, tilt, dolly, truck, crane, handheld, whip pan, arc shot; "natural smartphone zoom" and "webcam style" for a phone look.
- Write cast members as @Name like in every prompt of this app; the shot kit numbers them as [Image1], [Image2]… Omni reads references by what they show, so the kit's reference map ("[Image1] is Marta…") also names each one in words.
- Realism comes from asking for flaws, never "cinematic": the series look goes in every prompt.

## What to avoid

- [DOCS] Readable text, logos, app interfaces in the picture: all type is added by the app and real screens come from the cast.
- [DOCS] Real people's likeness, famous characters, other brands' logos.
- [NOT SURE] A recurring character speaking on camera with Omni's invented voice: it changes between clips.

## Tests to run (turn NOT SURE into TESTED)

1. A 6 s shot from an approved first frame, "single continuous shot, no scene cuts", "nobody speaks, no music". Any cut, speech or music anyway?
2. Dialogue with a colon and with quotes: does either print the words on screen?
3. One reference picture of a cast character in two clips: does the face hold?
4. 9:16 at 1080p from a first frame: does it keep the frame?
