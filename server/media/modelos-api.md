# Modelos por API (imágenes y video)

Last checked: 26 Nov 2026, against xAI's docs (docs.x.ai: images/generation, video/generation, image-to-video,
pricing) and fal.ai's model pages and pricing page.

Prices change: edit this table and restart the app. The app reads every row below (`shared/mediaModels.ts`); a row
whose key is missing in Modelos shows as "sin clave". Tags: **[DOCS]** in the provider's docs · **[NOT SURE]** not
confirmed, check before relying on it · **[TESTED]** tried here and it held.

- proveedor: `xai` (key XAI_API_KEY) or `fal` (key FAL_KEY).
- tipo: `imagen` or `video`.
- precio: US dollars per unidad (`imagen` or `segundo`).
- entrada (video): `texto` (prompt only), `imagen` (needs a start picture), or `ambas`.
- segundos (video): the lengths the model accepts, a range `1-15` or a list `4,6,8`.

| proveedor | tipo | modelo | nombre | precio | unidad | entrada | segundos | etiqueta |
|---|---|---|---|---|---|---|---|---|
| xai | imagen | grok-imagine-image | Grok Imagine | 0.02 | imagen | | | [DOCS] |
| xai | imagen | grok-imagine-image-2.0 | Grok Imagine 2.0 | 0.04 | imagen | | | [DOCS] |
| xai | video | grok-imagine-video-1.5-lite | Grok Imagine Video 1.5 Lite | 0.02 | segundo | ambas | 1-15 | [DOCS] |
| xai | video | grok-imagine-video | Grok Imagine Video | 0.05 | segundo | ambas | 1-15 | [DOCS] |
| xai | video | grok-imagine-video-1.5 | Grok Imagine Video 1.5 | 0.08 | segundo | ambas | 1-15 | [DOCS] |
| fal | imagen | fal-ai/flux/schnell | FLUX schnell (fal) | 0.003 | imagen | | | [DOCS] ($0.003 por megapíxel; una imagen de 1 MP) |
| fal | imagen | fal-ai/nano-banana | Nano Banana (fal) | 0.0398 | imagen | | | [DOCS] |
| fal | video | fal-ai/kling-video/o3/standard/image-to-video | Kling O3 (fal) | 0.14 | segundo | imagen | 3-15 | [DOCS] |
| fal | video | fal-ai/veo3/fast | Veo 3 Fast (fal) | 0.15 | segundo | texto | 4,6,8 | [NOT SURE] (precio de Veo 3.1 Fast en la tabla de fal) |

## Notes

- [DOCS] xAI: video resolution 480p (default), 720p or 1080p (1080p on Video 1.5). The table has one price per
  second per model; xAI says resolution also affects the cost, so higher resolutions may cost more than shown.
- [DOCS] xAI: with a start picture, the clip keeps the picture's shape (aspect ratio is ignored).
- [DOCS] xAI and fal: generated files are kept on their side only for a while. The app downloads each result right
  away into its own folder.
- [DOCS] fal: "You are not charged for server errors or for time spent waiting in the queue."
- [NOT SURE] Sound: xAI Video 1.5 makes sound by default; the app asks for a silent clip unless "Con sonido" is on.
