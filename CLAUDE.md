# Playbook Studio

A web app (Spanish interface) that turns a product brief into a 75-second marketing video, following the
playbook in `PLAYBOOK.md`. `server/playbook.md` is the operative copy of that playbook the app sends to Claude;
when `PLAYBOOK.md`'s rules change, update it there too.

## Layout
- `shared/` — zod schemas and types (`schema.ts`), the 75 s template and shot timing (`template.ts`), the example brief.
- `server/` — Hono API. `claude.ts` writes hooks, scripts and single-shot rewrites (structured output,
  prompt-cached system prompt); `tools/` holds one Markdown profile per image/video tool (`grok-imagine.md`),
  read at startup and sent to Claude so prompts match that tool; `images/` holds one file per image generator API;
  `demo.ts` is the sample output used when no Claude key is set.
- `src/` — React 19 + Tailwind v4 UI, all copy in Spanish (Rioplatense). `lib/render.ts` plays each shot's
  uploaded clip (or still, or colour card), mixes the clips' sound, draws the type on top and encodes with
  WebCodecs via mediabunny; `lib/markdown.ts` exports the script with setups, prompts and the direction log.

## Rules
- The playbook's hard rules are product requirements: roadmap features are shown only with a Concept/Simulation
  label, unverified claims are listed as `[VERIFY]`, no show names, clips or real people's likeness in images.
- Claude returns `section`/`disclosure`/`move` as plain strings; `normalizeScript()` maps them to strict values.
- API keys stay on the server. Images come back as data URLs so the video canvas is never tainted.
- Tool features change: edit the tool's `.md` in `server/tools/`, never hard-code them. Tag each line
  [DOCS], [NOT SURE] or [TESTED].
- Never crop or hide a tool's watermark: "Cuadro completo" (full frame, no zoom) is on by default for Grok.

## Commands
- `npm run dev` — API on 8787 + Vite on 5173 (proxied `/api`).
- `npm run typecheck`, `npm run build`, `npm start`.

@PLAYBOOK.md
