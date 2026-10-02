# Playbook Studio

A web app that turns a product brief into a 75-second marketing video, following the playbook in
`andrescandia365-ctrl/marketing` (`CLAUDE.md`). `server/playbook.md` is the operative copy of that playbook
the app sends to Claude; when the marketing repo's rules change, update it there.

## Layout
- `shared/` — zod schemas and types (`schema.ts`), the 75 s template and shot timing (`template.ts`), the example brief.
- `server/` — Hono API. `claude.ts` writes hooks and scripts (structured output, prompt-cached system prompt);
  `images/` holds one file per image generator; `demo.ts` is the sample output used when no Claude key is set.
- `src/` — React 19 + Tailwind v4 UI. `lib/render.ts` draws every frame on a canvas and encodes it with
  WebCodecs via mediabunny; `lib/markdown.ts` exports the script.

## Rules
- The playbook's hard rules are product requirements: roadmap features are shown only with a Concept/Simulation
  label, unverified claims are listed as `[VERIFY]`, no show names, clips or real people's likeness in images.
- Claude returns `section`/`disclosure`/`move` as plain strings; `normalizeScript()` maps them to strict values.
- API keys stay on the server. Images come back as data URLs so the video canvas is never tainted.

## Commands
- `npm run dev` — API on 8787 + Vite on 5173 (proxied `/api`).
- `npm run typecheck`, `npm run build`, `npm start`.

@PLAYBOOK.md
