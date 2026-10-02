# Playbook Studio

Hace contenido con historia, no publicidad: un ida y vuelta entre **el Bueno** (el producto) y **el Malo** (el dolor que el producto saca), con la estructura de *The Daily Show* y SNL: temas con duración propia, puentes entre temas y callbacks. Sigue el playbook de la casa (`PLAYBOOK.md`) y el motor de historias (`server/engine.md`).

**Brief → menú de temas → historia en rondas → storyboard → producción → video.**

1. **Brief.** La serie (IMAN, Masogar o las que agregues; cada una es de Software o de E-commerce), las pantallas reales que puede mostrar, el largo (corto de 60–90 s con un tema, o episodio de 5–8 min con 3–4 temas), el producto del episodio (obligatorio en las series de un producto por episodio, como Masogar), un gancho del momento, notas, tono, idioma, formato y la herramienta de imagen y video.
2. **Menú.** Claude propone temas: el dolor, quién hace de Malo, cómo gana el Bueno y con qué arranca. Elegís uno (corto) o hasta cuatro en orden (episodio), o agregás uno propio.
3. **Historia.** La IA escribe la historia con personajes, diálogo marcado Negativo / Emotivo / Bueno, puentes y callbacks. Vos le dejás **notas de director** y la reescribe en otra ronda. Un **check** revisa el gancho, la retención y la recompensa (que cada loop abierto se cierre), el loop de la serie y que la marca solo haga lo que existe hoy. Si algo falla, no se puede aprobar hasta arreglarlo (**Arreglalo** se lo pasa a la IA) o marcarlo como "no es un problema".
4. **Storyboard.** La historia en tomas de 6, 10 o 15 s (los largos de Grok). Cada toma tiene su **claqueta**: título y qué pasa. Notas por toma y para todo el storyboard, rondas, y el mismo check (continuidad, lo que existe hoy, imágenes con más de un momento).
5. **Producción.** Cada toma trae un prompt de imagen (un solo momento; si aparece una acción, la app avisa en amarillo) y uno de video, con botón **Copiar**. Soltás la imagen y el clip en su toma; un clic los muestra en grande, con **Cambiar** y **Quitar**. El navegador arma el video con tus clips, el sonido si querés, el **headline** arriba (se puede apagar) y quién habla con su línea abajo. Tamaño y color del texto, y sombra, borde o caja para que se lea, se guardan como estilo de la serie. Con **Cuadro completo** la marca de agua de Grok queda visible.

**Los mismos personajes en todas las tomas.** Cada serie tiene un **elenco fijo**: personajes, lugares y productos con su imagen aprobada y su referencia `@` para Grok, y, en las series de software, las **pantallas reales** de la app (capturas de celular y PC). Se cargan en Editar serie o desde Producción ("Fijar con la imagen de la toma…"). Cada toma muestra quién está en cuadro con su `@`, puede ser una **transformación** (imagen inicial, intermedia y final en un mismo clip, del Malo al Bueno) o una **pantalla real** (la captura tal cual), y cuando repite el lugar de una toma anterior trae un **prompt de edición** para partir de esa imagen. Las imágenes fijas se guardan en `biblioteca/<serie>/`.

**Audio.** Cada línea se puede escuchar de cuatro formas: solo subtítulos, **la dice Grok** dentro del clip (la app arma el prompt de video con la línea y la voz de Grok del personaje), **voz generada** (con `OPENAI_API_KEY`) o **tu voz**, grabada en la app con el micrófono o subida. Cada personaje tiene su forma por defecto en el panel **Voces** y cada toma la puede cambiar; si la voz dura más que la toma, la app avisa y la pasa a 10 o 15 s. Cada toma puede llevar un **efecto de sonido**, y la pieza una **música** (libre de derechos) que baja sola cuando alguien habla y puede mover los cortes al ritmo. Al lado de cada prompt y de cada línea hay un botón 🔊 para escucharlos con la voz del navegador.

**Todo se guarda solo** en una carpeta por pieza, `proyectos/<fecha-serie>/`: el proyecto, `pieza.md`, cada imagen y clip (`toma-01-imagen.png`, `toma-01-clip.mp4`…) y el video. En el paso Brief está la lista de **Proyectos guardados** para retomar una pieza donde quedó.

## Series

Cada serie es una marca: qué es, **lo que existe hoy** (lo único que la IA puede mostrar como real), la historia que contamos, el Malo, el Bueno, las reglas y quién mira. Se editan desde la app: en el paso **Brief**, **Editar serie** o **+ Nueva serie**. Si la marca presenta un producto distinto en cada episodio (como Masogar), marcá esa casilla y el brief va a pedir el producto.

Cada serie se guarda como un archivo en `server/series/` (`iman.md`, `masogar.md`), que es lo que la IA lee con cada pedido.

## Cómo correrla

```bash
bash iniciar.sh        # revisa Node, crea .env, pide la clave de Kimi, instala y arranca
```

Abrí http://localhost:5173. A mano es lo mismo:

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
| OpenAI Images y Voz generada | `OPENAI_API_KEY` | Copiá los prompts y subí tus imágenes; grabá o subí la voz |
| Replicate (Flux) | `REPLICATE_API_TOKEN` | Copiá los prompts y subí tus imágenes |
| Bocetos | ninguna | Siempre disponible |

## Todavía no está

- Que Claude revise las imágenes subidas (paso 5 del plan).
- Generar efectos de sonido con una API (por ahora se suben).
