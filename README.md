# Playbook Studio

Hace contenido con historia, no publicidad: un ida y vuelta entre **el Bueno** (el producto) y **el Malo** (el dolor que el producto saca), con la estructura de *The Daily Show* y SNL: temas con duración propia, puentes entre temas y callbacks. Sigue el playbook de la casa (`PLAYBOOK.md`) y el motor de historias (`server/engine.md`).

**Brief → menú de temas → historia en rondas → storyboard → producción → video.**

1. **Brief.** La serie (IMAN o Masogar), el largo (corto de 60–90 s con un tema, o episodio de 5–8 min con 3–4 temas), el producto del episodio (obligatorio en Masogar), un gancho del momento, notas, tono, idioma, formato y la herramienta de imagen y video.
2. **Menú.** Claude propone temas: el dolor, quién hace de Malo, cómo gana el Bueno y con qué arranca. Elegís uno (corto) o hasta cuatro en orden (episodio), o agregás uno propio.
3. **Historia.** Claude escribe la historia con personajes, diálogo marcado Negativo / Emotivo / Bueno, puentes y callbacks, y corre el checklist. Vos le dejás **notas de director** y la reescribe en otra ronda, las veces que haga falta. Cuando te cierra, la aprobás.
4. **Storyboard.** Claude la parte en tomas con *setups* (una persona o un lugar que se repite igual). Podés dejar una nota por toma y una para todo el storyboard, y revisarlo en rondas antes de aprobarlo.
5. **Producción.** Cada toma trae un prompt de imagen y uno de video en el formato de la herramienta elegida, con botón **Copiar**. Los pegás en Grok Imagine y soltás la imagen y el clip en su toma. El navegador arma el video: tus clips (o imágenes, con un acercamiento lento), el sonido de los clips si querés, quién habla y su línea, y una línea de aviso ("Imágenes ilustrativas"). Con **Cuadro completo** no se recorta nada, así la marca de agua de Grok queda visible. Sale en MP4 (WebM en navegadores sin codificador H.264). Todo se descarga en Markdown, con los prompts y el registro de dirección.

## Series

Cada serie es un archivo en `server/series/` (la biblia de la serie: qué funciona hoy, el Malo, el Bueno, quién mira):

- `iman.md`: IMAN, la app de kiosco. La historia es el loop diario que te ordena el día.
- `masogar.md`: Masogar siempre es el Bueno; el Malo es el dolor que resuelve el producto de cada episodio.

Para sumar una serie, agregá otro `.md` con las líneas `# Nombre` y `Tagline:` y reiniciá.

## Cómo correrla

```bash
npm install
cp .env.example .env   # agregá ANTHROPIC_API_KEY o KIMI_API_KEY
npm run dev            # http://localhost:5173
```

Producción: `npm run build && npm start` sirve la app y la API en `PORT` (8787 por defecto). Sin clave de IA corre en modo de muestra, con una historia de ejemplo fija de IMAN.

## Herramientas de imagen y video

Lo que cada herramienta puede hacer cambia seguido, así que vive en un archivo Markdown por herramienta, en `server/tools/`:

- `grok-imagine.md`: Grok Imagine (formatos, largos, cómo escribir los prompts, qué evitar). Cada línea dice **[DOCS]** (está en la documentación de xAI), **[NOT SURE]** (sin confirmar) o **[TESTED]** (lo probaste vos).
- `general.md`: valores seguros para cualquier otra herramienta.

Claude lee el archivo elegido antes de escribir los prompts. Para actualizarlo, editá el archivo y reiniciá la app. Para sumar otra herramienta (Midjourney, Seedance…), agregá otro `.md` con el mismo formato.

## Conexiones opcionales

| Qué | Variable | Sin ella |
|---|---|---|
| Claude (menú, historia, storyboard, revisiones) | `ANTHROPIC_API_KEY` | Kimi, si está; si no, modo de muestra |
| Kimi K3 (lo mismo, en lugar de Claude) | `KIMI_API_KEY` (`LLM_PROVIDER=kimi` si tenés las dos) | Modo de muestra |
| OpenAI Images | `OPENAI_API_KEY` | Copiá los prompts y subí tus imágenes |
| Replicate (Flux) | `REPLICATE_API_TOKEN` | Copiá los prompts y subí tus imágenes |
| Bocetos | ninguna | Siempre disponible |

## Todavía no está

- Voz en off (las líneas van en subtítulos).
- Que Claude revise las imágenes subidas (paso 5 del plan).
- Guardar proyectos: todo vive en la pestaña abierta.
- Música y cortes al ritmo (paso 6 del plan): por ahora solo el sonido que traen los clips.
