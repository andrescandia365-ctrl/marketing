# Playbook Studio

Hace contenido con historia, no publicidad: un ida y vuelta entre **el Bueno** (el producto) y **el Malo** (el dolor que el producto saca), con la estructura de *The Daily Show* y SNL: temas con duración propia, puentes entre temas y callbacks. Sigue el playbook de la casa (`PLAYBOOK.md`) y el motor de historias (`server/engine.md`).

**Brief → menú de temas → historia en rondas → storyboard → producción → video.**

1. **Brief.** La serie (IMAN, Máshogar o las que agregues; cada una es de Software o de E-commerce), las pantallas reales que puede mostrar, el largo (corto de 60–90 s con un tema, o episodio de 5–8 min con 3–4 temas), el producto del episodio (obligatorio en las series de un producto por episodio, como Máshogar), un gancho del momento, notas, tono, idioma, formato y la herramienta de imagen y video.
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

**Que se vea real.**
- **Look de la serie (cámara y defectos).** En Editar serie elegís "Celular en mano", "Compacta digital de los 2000 con flash" o lo escribís vos: cámara, flash, grano, foco y de dónde viene la luz (que nunca cambia). Va en todos los prompts. Si un prompt pide "cinematic" o "vintage", la app avisa en amarillo.
- **Hojas de referencia.** **+ Personaje con hoja** (plantilla Chica o Chico, siempre adultos inventados) y **+ Lugar con hoja** (seis paneles sin gente). La IA escribe la hoja completa y las vistas sueltas, y completa lo que dejes vacío según la serie. Hacés la hoja en Grok y la subís: queda como imagen aprobada con su `@`.
- **Toma continua (15 s).** En el brief, "Toma continua": cada toma es una escena en mano con varias líneas y sus tiempos. La primera imagen es el hero still, y el prompt de video es el de director, con el mapa de referencias `@`, los tiempos, la emoción de cada línea, los errores de cámara y las reglas duras. El diálogo lo dice Grok dentro del clip, y los subtítulos siguen los tiempos.

**Los mismos personajes en todas las tomas.** Cada serie tiene un **elenco fijo**: personajes, lugares y productos con su imagen aprobada y su referencia `@` para Grok, y, en las series de software, las **pantallas reales** de la app (capturas de celular y PC). Se cargan en Editar serie o desde Producción ("Fijar con la imagen de la toma…"). Cada toma muestra quién está en cuadro con su `@`, puede ser una **transformación** (imagen inicial, intermedia y final en un mismo clip, del Malo al Bueno) o una **pantalla real** (la captura tal cual), y cuando repite el lugar de una toma anterior trae un **prompt de edición** para partir de esa imagen. Las imágenes fijas se guardan en `biblioteca/<serie>/`.

**Audio.** Cada línea se puede escuchar de cuatro formas: solo subtítulos, **la dice Grok** dentro del clip (la app arma el prompt de video con la línea y la voz de Grok del personaje), **voz generada** (con `OPENAI_API_KEY`) o **tu voz**, grabada en la app con el micrófono o subida. Cada personaje tiene su forma por defecto en el panel **Voces** y cada toma la puede cambiar; si la voz dura más que la toma, la app avisa y la pasa a 10 o 15 s. Cada toma puede llevar un **efecto de sonido**, y la pieza una **música** (libre de derechos) que baja sola cuando alguien habla y puede mover los cortes al ritmo. Al lado de cada prompt y de cada línea hay un botón 🔊 para escucharlos con la voz del navegador.

**Todo se guarda solo** en una carpeta por pieza, `proyectos/<fecha-serie>/`: el proyecto, `pieza.md`, cada imagen y clip (`toma-01-imagen.png`, `toma-01-clip.mp4`…) y el video. En el paso Brief está la lista de **Proyectos guardados** para retomar una pieza donde quedó.

## Series

Cada serie es una marca: qué es, **lo que existe hoy** (lo único que la IA puede mostrar como real), la historia que contamos, el Malo, el Bueno, las reglas y quién mira. Se editan desde la app: en el paso **Brief**, **Editar serie** o **+ Nueva serie**. Si la marca presenta un producto distinto en cada episodio (como Máshogar), marcá esa casilla y el brief va a pedir el producto.

### Explicativos (motion graphics)

En el brief, **Pieza → Explicativo (motion graphics)** y **Empezar un explicativo**. Sirve para explicar la app (software) o el producto del episodio (e-commerce).

- **Marca de la serie** (Editar serie → Marca): logo, fondo, texto, un solo acento, fuente de títulos y fuente de interfaz (Google Fonts).
- **Duración:** automática (la IA la elige según el tema) o a mano (15 a 90 s).
- **Personajes 3D:** un personaje del elenco puede presentar el explicativo. Se arma así:
  1. En Editar serie, **+ Personaje con hoja → Personaje 3D**: la IA escribe la hoja con look 3D estilizado (una persona adulta, una mascota o un objeto que habla) y la vista **«Para el títere»**: de frente, con los brazos separados y la boca cerrada.
  2. Hacés esa vista en Grok y la cortás con **Segmentos**: cabeza, cuerpo, cada brazo, boca y ojos. Después **Descargar todo**.
  3. En la tarjeta del personaje, **Títere 3D → Subir capas**. La app reconoce cada parte por el nombre del archivo (se puede cambiar) y encuentra sola el cuello y los hombros. Una vista previa lo muestra presentando, saludando, señalando, festejando y sorprendido.
  - En la escena **Personaje 3D**, el personaje respira, parpadea, dice la línea de su escena con la boca siguiendo la voz y hace su gesto. Puede señalar o presentar una pantalla real o el producto.
  - Sin partes, usa su imagen entera como una sola pieza.
  - Siempre personajes inventados: nunca uno conocido ni "al estilo de" un estudio.
- **Guion por escenas:** la IA arma el guion con plantillas: gancho, pantalla en el celular o la compu, zoom a una función, **texto que se tipea** (un buscador o un campo de la app: se escribe letra por letra con sonido de teclas, se toca el botón y aparece el resultado), rótulos, paso a paso, antes/después, producto con precio, número grande y cierre con logo. Usa las pantallas reales, el producto recortado, los personajes y las capas de Grok que subas. Cada escena se puede editar, mover o sacar.
- **Sonido:**
  - Voz por escena: generada, grabada o subida.
  - Música sintetizada en código (tres climas y tempo) o tu tema. Los cortes caen en los beats.
  - **Efectos:** una biblioteca libre de dominio público (Kenney y sonidos de teclas, en `public/sfx/` con sus créditos), sintetizados, o ninguno. Cada efecto suena justo cuando empieza su movimiento; en los rótulos y pasos suenan el primero y el último.
  - El total queda a −14 LUFS.
- **Reglas del estudio:**
  - Cada cuadro es una función pura del tiempo, con ruido con semilla.
  - Sin los clichés (título centrado sobre degradé, todo con fundido, rótulos en las esquinas, brillos, partículas).
  - **Algo nuevo cada 2 a 4 s:** si hay un tramo quieto, la app no deja generar hasta arreglarlo o marcarlo.
  - **Se lee:** cada texto tiene que quedarse quieto unos 0,3 s por palabra (un rótulo corto, 0,8 s) una vez que entró entero; el subtítulo, lo que dura su escena. Si no llega, la app no deja generar hasta arreglarlo (entrar antes, menos palabras, escena más larga) o marcar "No es un problema".
- **Línea de tiempo** (debajo de la vista previa):
  - Las escenas en fila: arrastrás el borde de una para alargarla o acortarla (2 a 8 s).
  - Un carril por tipo de elemento (título, texto, imagen, rótulos y pasos, precio o llamado, movimientos, voz). Cada marca es el momento en que entra: la arrastrás o la movés con las flechas. Se pega a los beats; con Alt, queda libre.
  - La voz muestra cuánto dura y se pone en rojo si no entra en su escena.
  - En la vista previa tocás un elemento y lo arrastrás a donde va, o lo movés con las flechas (con Mayús, más rápido). Abajo ajustás el tamaño y los números exactos, y la app avisa si algo se sale del cuadro.
  - El lugar se guarda por formato (el 9:16 y el 16:9 tienen el suyo). El momento en que entra es el mismo en los dos.
  - **Deshacer** (o Ctrl+Z) vuelve atrás, y **Volver a como estaba** devuelve un elemento o toda la escena a la plantilla. **Cortes en los beats** se puede apagar para usar los segundos exactos.
- **Control de calidad (IA)** antes de cualquier video:
  - La app arma una **hoja de contactos** con un cuadro por beat, más los primeros 2 s cada medio segundo y el medio de cada corte (en rojo), con el segundo y la escena abajo.
  - También mide sola los cortes y entradas sobre los beats, los tramos quietos, cuándo se lee el gancho, los textos que no llegan a leerse, las voces que no entran y lo que se sale del cuadro.
  - La IA pone notas del 1 al 10 a seis cosas: gancho en los primeros 2 s, lectura en el celular, calidad del movimiento, variedad, fidelidad a la marca y sincronía con el sonido.
  - Arregla los 3 peores problemas como cambios en el guion (palabras, tamaño, cuándo entra algo, largo o plantilla), sin tocar lo que dice la voz. Repite hasta que todo esté en 8 o más, con 3 rondas como máximo.
  - Corre solo al tocar Generar, o a mano con **Revisar ahora**. Los arreglos se deshacen con Deshacer. Si cambiás la pieza, se revisa de nuevo.
  - Si después de 3 rondas queda algo bajo 8, la app lo dice y podés arreglarlo o elegir **Generar igual**. La última hoja de contactos queda en la carpeta del proyecto.
- **Portada:** el primer cuadro de cada video es la portada, porque X, Slack y Discord muestran ese cuadro como miniatura. Por defecto es el gancho entero; la IA del control de calidad elige el cuadro más fuerte, y vos podés fijar el que estás viendo (**Usar el cuadro de ahora**). Se marca con una P en la regla y se guarda también como `portada-9x16.jpg` / `portada-16x9.jpg` para las redes que piden una miniatura aparte.
- **Video:**
  - Vista previa con sonido. **Generar** arma el video en el navegador (H.264 si el navegador lo tiene), en 9:16, 16:9 o los dos.
  - **Render final:** `node render.mjs` abre la pieza en Chrome sin ventana, pinta cada cuadro con `seek(t)` y se los pasa sin pérdida a ffmpeg: H.264, yuv420p, CRF 16, sonido AAC a −14 LUFS.
  - Sale como `video-final-vertical.mp4` / `video-final-horizontal.mp4` en la carpeta del proyecto. Se hace desde la app (**Render final**) o a mano, con la app andando: `node render.mjs <proyecto> [vertical|horizontal|ambos]`.
  - Necesita ffmpeg (`bash iniciar.sh` ofrece instalarlo con Homebrew) y Google Chrome (otro navegador: `CHROME_PATH` en `.env`).

### Series de música: videos de letra

Una serie de tipo **Música** no escribe historias, sino videos de letra. Elegís la serie en el brief y tocás **Empezar un video de letra**:

1. **Canción y letra.**
   - Subís la canción y pegás la letra, en cualquier idioma: español, guaraní, japonés, coreano o romanizada.
   - Si querés, cargás una **segunda línea** más chica con la romanización o la traducción. Elegís el idioma (español, guaraní, inglés, portugués, japonés, coreano, francés, italiano u otro que escribas) y la pedís con **Traducir con IA**, o **Romanizar con IA**. Revisala, porque se puede equivocar, sobre todo en guaraní. Si la línea ya está en ese idioma, se copia.
   - Los rótulos que traen las páginas de letras («Chorus (Miku):», «Verse 2», «Estribillo:») se saltean solos; la pantalla dice cuántos. **Seguir → sincronizar** dice qué falta (la canción o la letra).
   - Confirmás que la canción es tuya o tenés licencia.
2. **Sincronizar.** Hay dos formas, y después podés ajustar cada línea:
   - **Automático:** OpenAI escucha la canción y le pone tiempo a cada palabra. Usa la misma `OPENAI_API_KEY`. El guaraní no lo conoce, así que escucha sin idioma.
   - **Tocando:** apretás **Ahora** o la barra espaciadora cuando empieza cada línea.
   - **Importar .lrc:** si ya la tenés sincronizada; si el archivo no coincide con tu letra, trae también la letra.
3. **Reloj.** Arma el reloj de la pieza en `sync/` dentro de la carpeta del proyecto. El kick (corte y acento) sale del stem de batería; la palabra sale del stem de voz y no se pega al beat. **Crítica** mira una tira de cuadros y anota los problemas.
4. **Elementos.** Después de sincronizar, gráficos que entran con un verso. **Sugerir con IA** propone de 3 a 6 (forma, movimiento, lugar y segundos). También podés agregar uno a mano y pegar un PNG, un JPG o un SVG: entra entero, sin recortar.
5. **Estilo y video.**
   - Fondo orgánico que se mueve y late con el ritmo, **capas de Grok** (cada una se mueve según su profundidad), tu foto, o hasta 4 videos que se pasan uno tras otro en loop. **Prompts para Grok** escribe los clips de fondo según la letra y los colores. Si el fondo lo hizo una IA, va el aviso al pie, y con **Cuadro completo** no se recorta.
   - Tipografía, tamaño, colores, karaoke, cómo entra cada línea y palabras clave más grandes. Tocás una palabra para marcarla, o le pedís ideas a la IA.
   - Vista previa en vivo, vertical u horizontal (o **los dos formatos de una vez**), desde y hasta qué segundo, y el crédito de la canción.
   - El estilo se puede guardar en la serie.

Cada serie se guarda como un archivo en `server/series/` (`iman.md`, `masogar.md`), que es lo que la IA lee con cada pedido.

## Cómo correrla

```bash
bash iniciar.sh        # revisa Node, crea .env, pregunta qué IA escribe, instala, ofrece ffmpeg y arranca
```

Abrí http://localhost:5173. A mano es lo mismo:

```bash
npm install
cp .env.example .env   # o cargá las claves después, en la app: Modelos
npm run dev            # http://localhost:5173
```

Producción: `npm run build && npm start` sirve la app y la API en `PORT` (8787 por defecto). Sin clave de IA corre en modo de muestra, con una historia de ejemplo fija de IMAN.

## Herramientas de imagen y video

Lo que cada herramienta puede hacer cambia seguido, así que vive en un archivo Markdown por herramienta, en `server/tools/`:

- `grok-imagine.md`: Grok Imagine (formatos, largos, cómo escribir los prompts, qué evitar). Cada línea dice **[DOCS]** (está en la documentación de xAI), **[NOT SURE]** (sin confirmar) o **[TESTED]** (lo probaste vos).
- `general.md`: valores seguros para cualquier otra herramienta.

Claude lee el archivo elegido antes de escribir los prompts. Para actualizarlo, editá el archivo y reiniciá la app. Para sumar otra herramienta (Midjourney, Seedance…), agregá otro `.md` con el mismo formato.

## Modelos y claves

El botón con el nombre de la IA, arriba a la derecha (**· Modelos**), abre la sección de modelos:

- **Quién escribe:** Claude, Kimi (Moonshot), NVIDIA, OpenRouter (o un servidor compatible configurado en `.env`). El modelo se escribe a mano o se elige de la lista en vivo del proveedor (**Ver modelos**), que marca los que ven imágenes y los que no devuelven JSON con forma fija (la app lo necesita). **Probar** hace un pedido chiquito con ese modelo. Con Claude se elige además el esfuerzo (bajo a máximo, según el modelo); Haiku 4.5 contesta sin pensamiento extendido.
- **Quién mira las imágenes:** la misma IA, u otra que vea imágenes (para la revisión de lo que subís y el control de calidad). **Probar con una imagen** le manda un cuadrado rojo y le pregunta el color.
- **Claves:** se pegan ahí una vez y se guardan en el `.env` de tu compu (permisos solo tuyos). La app nunca las devuelve: muestra los últimos 4 caracteres. Esta sección solo responde a la app abierta en tu compu (no a otra máquina de la red ni a otra página).

## Conexiones opcionales

| Qué | Variable (o Modelos en la app) | Sin ella |
|---|---|---|
| Claude (menú, historia, storyboard, revisiones) | `ANTHROPIC_API_KEY` | Otro proveedor, si hay; si no, modo de muestra |
| Kimi, NVIDIA u OpenRouter (lo mismo, en lugar de Claude) | `MOONSHOT_API_KEY`, `NVIDIA_API_KEY`, `OPENROUTER_API_KEY`; `LLM_PROVIDER` elige | Modo de muestra |
| OpenAI Images, Voz generada y letra sincronizada automática | `OPENAI_API_KEY` | Copiá los prompts y subí tus imágenes; grabá o subí la voz; sincronizá la letra tocando |
| Replicate (Flux) | `REPLICATE_API_TOKEN` | Copiá los prompts y subí tus imágenes |
| Bocetos | ninguna | Siempre disponible |

## Todavía no está

- Generar efectos de sonido con una API (por ahora se suben).
