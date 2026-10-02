# Playbook Studio

Makes short marketing videos from a product brief, following the house playbook
(`andrescandia365-ctrl/marketing`, `CLAUDE.md`).

**Brief → five hooks → a 75-second script → one image per shot → a video file.**

1. **Brief.** Job A (planner for stores) or Job B (good feelings at home), the product, the buyer, what works today vs. roadmap, the pain, the offer.
2. **Hooks.** Claude writes five openings, each using a different move from the playbook (Contradiction, Clip Drop, Field Visit…). You pick one.
3. **Script.** Claude writes the 75-second piece: Hook 0:00 · Agitate 0:05 · Turn 0:25 · Resolve 0:40 · Button 1:05, runs the checklist and lists every `[VERIFY]` claim. Every line is editable.
4. **Images.** An image generator draws each shot from its prompt, with one shared style line so the shots match.
5. **Video.** The browser assembles the shots with captions, subtitles and the call to action, and saves an MP4 (WebM in browsers without an H.264 encoder). Download the script as Markdown too.

## Run it

```bash
npm install
cp .env.example .env   # add your keys
npm run dev            # http://localhost:5173
```

Production: `npm run build && npm start` serves the app and API on `PORT` (default 8787).

## Connections

| What | Env var | Without it |
|---|---|---|
| Claude (hooks + script) | `ANTHROPIC_API_KEY` | Sample mode: a fixed example script |
| OpenAI Images | `OPENAI_API_KEY` | Not offered |
| Replicate (Flux) | `REPLICATE_API_TOKEN` | Not offered |
| Placeholder cards | none | Always available |

Adding another image generator is one file in `server/images/` plus one line in `server/images/index.ts`.

## Not built yet

- Voiceover audio (the video carries the script as captions and subtitles).
- Saving projects; everything lives in the open browser tab.
- Image-to-video motion beyond the slow push-in.
