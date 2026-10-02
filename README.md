# Playbook Studio

Hace videos de marketing cortos a partir de un brief, siguiendo el playbook de la casa (`PLAYBOOK.md`).

**Brief → cinco ganchos → guion de 75 segundos → imágenes y clips de Grok Imagine → video.**

1. **Brief.** Trabajo A (planificador para locales) o B (sentirse bien en casa), el producto, quién lo compra, qué funciona hoy y qué viene después, el dolor, la oferta y la herramienta de imagen y video.
2. **Ganchos.** Claude escribe cinco aperturas, cada una con una movida distinta del playbook. Elegís una.
3. **Guion.** Claude escribe la pieza de 75 segundos (Gancho 0:00 · Agitar 0:05 · Giro 0:25 · Resolución 0:40 · Remate 1:05), agrupa las tomas en *setups* (una persona o un lugar que se repite), corre el checklist y marca cada afirmación a verificar con `[VERIFY]`.
4. **Imágenes y clips.** Cada toma trae un prompt de imagen y uno de video en el formato de la herramienta elegida, con botón **Copiar**. Los pegás en Grok Imagine, y soltás la imagen y el clip en su toma. Si algo no te gusta, escribís una **nota para Claude** y reescribe solo esa toma.
5. **Video.** El navegador arma el video: tus clips (o imágenes, con un acercamiento lento), el sonido de los clips si querés, los textos, los subtítulos, el llamado a la acción y una línea de aviso ("Imágenes ilustrativas"). Con **Cuadro completo** no se recorta nada, así la marca de agua de Grok queda visible. Sale en MP4 (WebM en navegadores sin codificador H.264). El guion se descarga en Markdown, con los prompts y el registro de dirección.

## Cómo correrla

```bash
npm install
cp .env.example .env   # agregá ANTHROPIC_API_KEY
npm run dev            # http://localhost:5173
```

Producción: `npm run build && npm start` sirve la app y la API en `PORT` (8787 por defecto). Sin clave de Claude corre en modo de muestra, con un guion de ejemplo fijo.

## Herramientas de imagen y video

Lo que cada herramienta puede hacer cambia seguido, así que vive en un archivo Markdown por herramienta, en `server/tools/`:

- `grok-imagine.md`: Grok Imagine (formatos, largos, cómo escribir los prompts, qué evitar). Cada línea dice **[DOCS]** (está en la documentación de xAI), **[NOT SURE]** (sin confirmar) o **[TESTED]** (lo probaste vos).
- `general.md`: valores seguros para cualquier otra herramienta.

Claude lee el archivo elegido antes de escribir los prompts. Para actualizarlo, editá el archivo y reiniciá la app. Para sumar otra herramienta (Midjourney, Seedance…), agregá otro `.md` con el mismo formato.

## Conexiones opcionales

| Qué | Variable | Sin ella |
|---|---|---|
| Claude (ganchos, guion, reescrituras) | `ANTHROPIC_API_KEY` | Modo de muestra |
| OpenAI Images | `OPENAI_API_KEY` | Copiá los prompts y subí tus imágenes |
| Replicate (Flux) | `REPLICATE_API_TOKEN` | Copiá los prompts y subí tus imágenes |
| Bocetos | ninguna | Siempre disponible |

## Todavía no está

- Voz en off (el guion va en textos y subtítulos).
- Guardar proyectos: todo vive en la pestaña abierta.
- Música propia: solo el sonido que traen los clips.
