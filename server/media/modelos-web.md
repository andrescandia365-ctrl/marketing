# Modelos que se usan a mano en una web (Replicate, APIMart)

Last checked: 26 Nov 2026, against Replicate's model pages (replicate.com) and APIMart's model and pricing pages
(apimart.ai). The app never calls these: the person generates in the website and, under each clip, notes «Lo generé
afuera». The spend log adds it up with this table. Prices change: edit the table and restart the app.

Tags: **[DOCS]** on the site's own page · **[NOT SURE]** not shown on the site, taken from another source or a guess
· **[TESTED]** checked against the site's own bill.

- sitio: `replicate`, `apimart` or `otro`.
- tipo: `imagen` or `video`.
- precio: US dollars per unidad (`imagen` or `segundo`) at that resolución.
- resolución: `480p`, `720p`, `1080p`…, or empty when the price does not depend on it.

| sitio | tipo | modelo | nombre | resolución | precio | unidad | etiqueta |
|---|---|---|---|---|---|---|---|
| apimart | video | seedance-2.5 | Seedance 2.5 | 480p | 0.0961 | segundo | [DOCS] (precio Gold) |
| apimart | video | seedance-2.5 | Seedance 2.5 | 720p | 0.216 | segundo | [DOCS] (precio Gold) |
| apimart | video | seedance-2.5 | Seedance 2.5 | 1080p | 0.5346 | segundo | [DOCS] (precio Gold) |
| apimart | video | kling-4.0 | Kling 4.0 | 720p | 0.14 | segundo | [DOCS] (sin audio de referencia) |
| apimart | video | wan-3.0 | Wan 3.0 | 1080p | 0.1315 | segundo | [DOCS] (sin audio de referencia) |
| replicate | video | bytedance/seedance-2.5 | Seedance 2.5 | 720p | 0.2312 | segundo | [NOT SURE] (Replicate no lo muestra en la página; lo publica claudia.gallery) |
| replicate | video | bytedance/seedance-2.5 | Seedance 2.5 | 1080p | 0.9676 | segundo | [NOT SURE] (claudia.gallery, con video de entrada) |
| replicate | video | kwaivgi/kling-v4.0 | Kling 4.0 | 720p | 0.157 | segundo | [DOCS] (sin audio de referencia) |
| replicate | video | kwaivgi/kling-v4.0 | Kling 4.0 | 1080p | 0.235 | segundo | [DOCS] (sin audio de referencia) |
| replicate | video | xai/grok-imagine-video | Grok Imagine Video | 720p | 0.08 | segundo | [NOT SURE] (claudia.gallery; sin audio de referencia) |
| apimart | imagen | nano-banana-2 | Nano Banana 2 | | 0.015 | imagen | [DOCS] (desde) |
| apimart | imagen | nano-banana-pro | Nano Banana Pro | | 0.02 | imagen | [DOCS] (desde) |
| apimart | imagen | gpt-image-2 | GPT Image 2 | | 0.0085 | imagen | [DOCS] (desde) |

## Notes

- [DOCS] APIMart does not charge failed runs. Replicate bills by the run; check its own bill for the real number.
- [NOT SURE] With a reference video, APIMart bills the reference's seconds plus the clip's at the "input" price; the
  kit of a story shot never sends a video, so the table has the plain prices.
