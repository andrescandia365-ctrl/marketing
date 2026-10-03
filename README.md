# Playbook Studio

Hace contenido con historia, no publicidad: un ida y vuelta entre **el Bueno** (el producto) y **el Malo** (el dolor que el producto saca), con la estructura de *The Daily Show* y SNL: temas con duración propia, puentes entre temas y callbacks. Sigue el playbook de la casa (`PLAYBOOK.md`) y el motor de historias (`server/engine.md`).

**Brief → menú de temas → historia en rondas → storyboard → producción → video.**

1. **Brief.** La serie (IMAN, Masogar o las que agregues; cada una es de Software o de E-commerce), las pantallas reales que puede mostrar, el largo (corto de 60–90 s con un tema, o episodio de 5–8 min con 3–4 temas), el producto del episodio (obligatorio en las series de un producto por episodio, como Masogar), un gancho del momento, notas, tono, idioma, formato y la herramienta de imagen y video.
2. **Menú.** La IA propone temas, cada uno con **el problema que resuelve** como título y abajo el gancho: el dolor, quién hace de Malo, cómo gana el Bueno y con qué arranca. Elegís uno (corto) o hasta cuatro en orden (episodio), o agregás uno propio.
3. **Historia.** La IA escribe la historia con personajes, diálogo marcado Negativo / Emotivo / Bueno, puentes y callbacks. Vos le dejás **notas de director** y la reescribe en otra ronda. Un **check** revisa el gancho, la retención y la recompensa (que cada loop abierto se cierre), el loop de la serie, que la marca solo haga lo que existe hoy y **¿Pasa así de verdad?**: que la gente trabaje como dice "Cómo se trabaja hoy" en la serie (o las notas del brief), sin costumbres inventadas. Si algo falla, no se puede aprobar hasta arreglarlo (**Arreglalo** se lo pasa a la IA) o marcarlo como "no es un problema".
4. **Storyboard.** La historia en tomas de 6, 10 o 15 s (los largos de Grok), vista **como la pieza terminada**:
   - Cada toma es una pantalla de celular con su imagen (o la imagen aprobada del elenco, o el color del momento), el headline y la línea, igual que en el video final.
   - Abajo, el título de la toma, quién habla, el largo y un ícono si es transformación, pantalla real o edición. Los prompts quedan en **Ver detalles**.
   - Arriba, una banda con los temas y los callbacks.
   - **▶ Ver la pieza** pasa las tomas con su largo real y lee las líneas con la voz del navegador.
   - Notas por toma y para todo el storyboard, rondas, y el mismo check (continuidad, lo que existe hoy, imágenes con más de un momento).
5. **Producción.** Cada toma trae un prompt de imagen (un solo momento; si aparece una acción, la app avisa en amarillo) y uno de video, con botón **Copiar**. Soltás la imagen y el clip en su toma; un clic los muestra en grande, con **Cambiar** y **Quitar**. El navegador arma el video con tus clips, el sonido si querés, el **headline** arriba (se puede apagar) y quién habla con su línea abajo. Tamaño y color del texto, y sombra, borde o caja para que se lea, se guardan como estilo de la serie. Con **Cuadro completo** la marca de agua de Grok queda visible.
   - Al subir una imagen o un clip, la app avisa si no tiene el formato del video, y la IA lo **revisa** contra la toma: el momento, los personajes como en su referencia, que no tenga texto ni logos, ni personas reales. Si algo falla, te da un prompt de edición para corregirlo.
   - **Cambiar un solo objeto:** escribís qué cambiar ("solo el yogur vencido") y la IA te dice qué seleccionar con los segmentos de Grok y el prompt de edición. Nunca para tapar la marca de agua.
   - En las series de **e-commerce**, **Producto recortado:** la IA escribe el prompt del producto limpio; lo hacés en Grok, usás **Eliminar fondo** y soltás el PNG, que queda en el elenco de la serie como producto (`@`).

**Los mismos personajes en todas las tomas.** Cada serie tiene un **elenco fijo**: personajes, lugares y productos con su imagen aprobada y su referencia `@` para Grok, y, en las series de software, las **pantallas reales** de la app (capturas de celular y PC). Se cargan en Editar serie o desde Producción ("Fijar con la imagen de la toma…"). Cada toma muestra quién está en cuadro con su `@`, puede ser una **transformación** (imagen inicial, intermedia y final en un mismo clip, del Malo al Bueno) o una **pantalla real** (la captura tal cual), y cuando repite el lugar de una toma anterior trae un **prompt de edición** para partir de esa imagen. Las imágenes fijas se guardan en `biblioteca/<serie>/`.

**Audio.** Cada línea se puede escuchar de cuatro formas: solo subtítulos, **la dice Grok** dentro del clip (la app arma el prompt de video con la línea y la voz de Grok del personaje), **voz generada** (con `OPENAI_API_KEY`) o **tu voz**, grabada en la app con el micrófono o subida. Cada personaje tiene su forma por defecto en el panel **Voces** y cada toma la puede cambiar; si la voz dura más que la toma, la app avisa y la pasa a 10 o 15 s. Cada toma puede llevar un **efecto de sonido**, y la pieza una **música** (libre de derechos) que baja sola cuando alguien habla y puede mover los cortes al ritmo. Al lado de cada prompt y de cada línea hay un botón 🔊 para escucharlos con la voz del navegador.

**Todo se guarda solo** en una carpeta por pieza, `proyectos/<fecha-serie>/`: el proyecto, `pieza.md`, cada imagen y clip (`toma-01-imagen.png`, `toma-01-clip.mp4`…) y el video. En el paso Brief está la lista de **Proyectos guardados** para retomar una pieza donde quedó.

## Series

Cada serie es una marca: qué es, **lo que existe hoy** (lo único que la IA puede mostrar como real), la historia que contamos, el Malo, el Bueno, las reglas y quién mira. Se editan desde la app: en el paso **Brief**, **Editar serie** o **+ Nueva serie**. Si la marca presenta un producto distinto en cada episodio (como Masogar), marcá esa casilla y el brief va a pedir el producto.

### Series de música: videos de letra

Una serie de tipo **Música** no escribe historias, sino videos de letra. Elegís la serie en el brief y tocás **Empezar un video de letra**:

1. **Canción y letra.**
   - Subís la canción y pegás la letra, en cualquier idioma: español, guaraní, japonés, coreano o romanizada.
   - Si querés, cargás una **segunda línea** más chica con la romanización o la traducción. La podés escribir vos o pedírsela a la IA (**Romanizar con IA** o **Traducir al español con IA**); revisala, porque se puede equivocar.
   - Confirmás que la canción es tuya o tenés licencia.
2. **Sincronizar.** Hay dos formas, y después podés ajustar cada línea:
   - **Automático:** OpenAI escucha la canción y le pone tiempo a cada palabra. Usa la misma `OPENAI_API_KEY`. El guaraní no lo conoce, así que escucha sin idioma.
   - **Tocando:** apretás **Ahora** o la barra espaciadora cuando empieza cada línea.
   - **Importar .lrc:** si ya la tenés sincronizada; si el archivo no coincide con tu letra, trae también la letra.
3. **Estilo y video.**
   - Fondo orgánico que se mueve y late con el ritmo, o tu foto, o hasta 4 videos que se pasan uno tras otro en loop. **Prompts para Grok** escribe los clips de fondo según la letra y los colores. Si el fondo lo hizo una IA, va el aviso al pie, y con **Cuadro completo** no se recorta.
   - Tipografía, tamaño, colores, karaoke, cómo entra cada línea y palabras clave más grandes. Tocás una palabra para marcarla, o le pedís ideas a la IA.
   - Vista previa en vivo, vertical u horizontal (o **los dos formatos de una vez**), desde y hasta qué segundo, y el crédito de la canción.
   - El estilo se puede guardar en la serie.

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
| OpenAI Images, Voz generada y letra sincronizada automática | `OPENAI_API_KEY` | Copiá los prompts y subí tus imágenes; grabá o subí la voz; sincronizá la letra tocando |
| Replicate (Flux) | `REPLICATE_API_TOKEN` | Copiá los prompts y subí tus imágenes |
| Bocetos | ninguna | Siempre disponible |

## Todavía no está

- Generar efectos de sonido con una API (por ahora se suben).
