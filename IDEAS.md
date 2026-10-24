# Ideas para construir

Lista de ideas que fueron saliendo. Se construyen solo con "go"; cada título dice si ya está construida (la lista "Construido" de abajo resume las tandas).
Cada idea dice de dónde salió y qué falta saber antes de hacerla.

## Construido
- **Subir clips en lote y próxima tanda (24 Oct 2026, idea 70):** los prompts de Grok terminan con el nombre del archivo, se suben de a muchos, y las métricas proponen qué se queda, qué se archiva y qué voces entran.

- **Variantes de voz (23 Oct 2026, idea 69):** hasta 10 voces subidas por pieza de Publicidad; el id del anuncio suma la voz solo cuando la pieza tiene más de una.

- **Tanda 1 (2 Oct 2026):** guardar proyectos en carpetas (idea 10), clic para ver con Cambiar/Quitar (12), claqueta y continuidad (19), un momento por imagen con aviso amarillo (20), largos de 6/10/15 s (6), Headline con interruptor (5), estilo de texto por serie (21), check contra "Lo que existe hoy" por historia y por toma, nota que puede cambiar la línea, check de loops con "Arreglalo" y bloqueo (22), loop de la serie editable en Editar serie.

- **Tanda 2 (3 Oct 2026):** tipo de serie Software/E-commerce (23), elenco fijo con imágenes aprobadas y referencia @ guardado con la serie (14, 2), varios setups por toma editables a mano (18), tomas de transformación con imagen inicial/intermedia/final (1), tomas de pantalla real con capturas de la app elegidas en el brief (17), prompt de edición cuando se repite el lugar (13).

- **Tanda 3 (3 Oct 2026):** las 4 formas de voz por toma y por personaje (15): solo subtítulos, la dice Grok (prompt de video con la línea y su voz), voz generada (OpenAI, `OPENAI_API_KEY`) y grabada en la app o subida; aviso y ajuste de largo si la voz no entra; botón 🔊 para escuchar prompts y líneas (16); efecto de sonido por toma, música de la pieza que baja bajo la voz y cortes al ritmo (8). Pendiente: API para generar efectos de sonido.

- **Historias reales (3 Oct 2026, idea 26):**
  - **Problema primero:** cada tema del menú y cada historia llevan primero el problema que resuelven y abajo el gancho. Se ve en el menú, la historia, el storyboard, la producción, la lista de proyectos, `pieza.md` y los nombres de archivo.
  - **"Cómo se trabaja hoy":** lista nueva en Editar serie. En IMAN arranca con lo que confirmaste: el pedido se arma mirando la góndola y el proveedor tiene horario de corte. Saqué de "El Malo" el cuaderno y el "stock que no coincide".
  - **Check "¿Pasa así de verdad?":** marca en la historia y en el storyboard toda costumbre que no esté en la serie ni en el brief, y bloquea la aprobación.
  - **Motor:** los objetos pueden hablar, pero la situación de fondo tiene que ser real; los ejemplos del playbook no se copian.
  - **Kimi:** `KIMI_TEMPERATURE`, opcional; si el modelo no la acepta, la app la saca.
  - Pendiente: cambiar el ejemplo de `PLAYBOOK.md` (con "ok") y sumar más costumbres reales a la serie.

- **Videos de letra (3 Oct 2026, idea 27):**
  - **Tipo de serie Música:** el brief pasa directo a "Video de letra".
  - **Letra en cualquier idioma** (español, guaraní, japonés, coreano, romanizada), con una segunda línea opcional (romanización o traducción, a mano o con IA).
  - **Sincronización** automática (OpenAI) o tocando, ajustable por línea.
  - **Fondo** orgánico que late con el ritmo, o foto o video propio.
  - **Letra animada:** karaoke, entrada (aparece, sube o salta) y palabras clave grandes; ideas de la IA para los colores y las palabras.
  - **Video:** vista previa en vivo, vertical u horizontal, recorte desde/hasta, crédito y confirmación de derechos.
  - Pendiente: clips de Grok en loop como fondo (3b), importar `.lrc` (2c). **Hecho después**, ver abajo.

- **Tanda 4 (3 Oct 2026):**
  - **Los dos formatos de una vez** en los videos de letra.
  - **Storyboard como la pieza terminada (25):** pantallas de celular con imagen, headline y línea; banda de temas y callbacks; **▶ Ver la pieza**.
  - **Kimi más robusto (24):** reintenta una vez si viene vacía o se corta; lee respuestas sin streaming; `KIMI_MAX_TOKENS` (lo saca si el proveedor no lo acepta); dice el motivo real.
  - **Videos de letra:** hasta 4 clips de fondo en loop, con prompts para Grok (3b); importar `.lrc` (2c).
  - **Revisión de imágenes por la IA (7):** al subir una imagen o un clip, el formato y la revisión de la IA, con un prompt de edición para corregir.
  - **Producto recortado (3):** para e-commerce; queda en el elenco.
  - **Segmentos (4):** "Cambiar un solo objeto"; se niega si es para la marca de agua.
  - **`iniciar.sh` pregunta la IA (9):** Claude, Kimi directo, NVIDIA u OpenRouter (`bash iniciar.sh --ia` para cambiar).

- **Realismo (3 Oct 2026, ideas 28 y 29):**
  - **Hojas de personaje:** Chica o Chico, solo adultos; la IA completa lo vacío. **Hojas de lugar:** 6 paneles.
  - **Look de la serie con defectos**, con aviso de look pulido.
  - **Toma continua de 15 s:** hero still, prompt de director con mapa `@`, tiempos, errores de cámara y reglas duras; subtítulos por tiempos; voz de Grok.
  - **Emoción en cada línea.**
  - **Perfil de Grok:** los puntos nuevos quedan [NOT SURE], con dos pruebas (toma continua y hojas).
  - **Elegido por defecto** (no hubo respuesta a las preguntas):
    - personajes dentro de cada serie;
    - grilla más vistas sueltas;
    - el look y la toma continua se eligen por serie y por pieza;
    - un hero still por escena.

- **Motion graphics, parte A (3 Oct 2026, idea 31):**
  - **Kit de marca por serie:** logo, fondo, texto, un acento, fuente de títulos y de interfaz.
  - **Motor:** cada cuadro es una función pura de t, con ruido con semilla, y 9 plantillas sin clichés.
  - **Explicativo en el brief:** duración automática o a mano; guion de la IA editable por escena.
  - **Sonido:** voz, música sintetizada o propia, golpes en los beats y −14 LUFS (verificado con ffmpeg).
  - **Check "algo nuevo cada 2–4 s"**, que bloquea el render.
  - **Videos de letra:** capas de Grok con parallax; la entrada por defecto pasa de "fundido" a "sube".

- **Motion graphics, parte B (3 Oct 2026, idea 31): línea de tiempo.**
  - **Escenas en fila:** el largo se cambia arrastrando el borde.
  - **Un carril por tipo de elemento:** cada marca es cuándo entra; se arrastra, se pega a los beats y con Alt queda libre.
  - **La voz en su carril:** muestra cuánto dura y se pone en rojo si no entra.
  - **Mover en la vista previa:** arrastrar o usar las flechas; tamaño y números exactos abajo; aviso si algo se sale del cuadro.
  - **El lugar se guarda por formato** (9:16 y 16:9); el momento en que entra es el mismo en los dos.
  - **Deshacer** (Ctrl+Z), "Volver a como estaba" por elemento o por escena, y "Cortes en los beats" que se puede apagar.
  - **El check de 2–4 s y los golpes de sonido** siguen los tiempos movidos a mano.

- **Motion graphics, parte C (3 Oct 2026, idea 31): control de calidad y render final.**
  - **Hoja de contactos:** un cuadro por beat (hasta 28), más los primeros 2 s cada medio segundo, con el segundo y la escena.
  - **La app mide sola:** cortes y entradas sobre los beats, tramos quietos, cuándo se lee el gancho, voces que no entran y elementos fuera del cuadro.
  - **La IA puntúa del 1 al 10** gancho, lectura en el celular, movimiento, variedad, marca y sincronía.
  - **Arregla los 3 peores** como cambios en el guion, sin tocar la voz, y repite hasta 8 o más: 3 rondas como máximo, o antes si no queda nada para cambiar.
  - **Corre solo antes de generar.** Si queda algo bajo 8: arreglarlo o "Generar igual". Los arreglos se deshacen.
  - **Render final con `node render.mjs`:** Chrome sin ventana, `window.seek(t)` por cuadro, PNG sin pérdida a ffmpeg (H.264 yuv420p, CRF 16, bt709, AAC). Desde la app o a mano.
  - **Elegido por defecto** (no hubo respuesta a las preguntas): 3 rondas, Google Fonts, y `iniciar.sh` busca ffmpeg y ofrece instalarlo con Homebrew.

- **Demucs listo para instalar (7 Oct 2026).** Lo instalás vos; la app lo encuentra y dice cuándo usarlo.
  - **Modelos → Demucs:** si lo encuentra (`DEMUCS_BIN`, `demucs` en la Terminal o `python3 -m demucs`), dónde lo usa la app y cuándo conviene, cómo instalarlo, la ruta que se guarda en `.env` sin reiniciar, **Volver a buscar** y **Probar Demucs**.
  - **Una separación por tema**, guardada en `proyectos/.demucs/`: la sincronización, el Reloj y los explicativos la reusan.
  - **Sincronizar automático:** «Escuchar solo la voz (Demucs)», y un aviso cuando la transcripción encontró menos del 70 % de la letra.
  - **Reloj:** sin Demucs avisa que falta la batería y no deja armar; con Demucs separa lo que falte (también la voz si subiste solo la batería).
  - **La voz va chica a la transcripción** (un canal, 16 kHz): la de Demucs pasaba los 25 MB de whisper-1 en un tema de más de 2 minutos y medio.
  - **Guardar algo en Modelos ya no recarga la página** en modo desarrollo (Vite no mira `.env`).
  - `iniciar.sh` avisa si está Demucs; no lo instala.

- **Errores, carga y calendario (9 Oct 2026, ideas 53, 50 y 60):** los errores dicen qué campo faltó y qué le pasa; la primera pantalla baja la cuarta parte que antes (479 kB contra 2.000 kB); "Momentos del calendario" por serie, sugeridos en el brief y leídos por el menú y Publicidad.
- **Videos de letra, historias y la app por dentro (10 Oct 2026, idea 65):** pulso con el kick, la letra que actúa el canto, sin "cinematic", proyecto en .zip, bocetos en pieza.md, descripción que llega a todas las tomas, transformación hacia la pantalla real, hoja desde Producción con recorte, aviso de música en el clip, corresponsal y Visita de campo, tokens por pedido, Episodios estudiados, fotos y capturas desde la web, archivos partidos.
- **Explicativos, lo que quedaba (10 Oct 2026, idea 64):** lectura por letras, foco de a uno, títeres con envión y expresiones, cámaras de la IA, desenfoque en los cortes, CONCEPTO en los explicativos, personaje fijo por serie, nota del director, subtítulos palabra por palabra con .srt, corte por continuidad, plantillas Avisos, Flujo y Casilleros, mundo ilustrado y storyboard.
- **Lo que se aprende de Kurzgesagt (9 Oct 2026, idea 63):** "Pasar a través" (la cámara se mete en la escena anterior y la nueva se abre desde adentro), cómo se mueve la marca (Firme, Suave, Elástica: cómo aterriza y si las imágenes respiran), "Antes / después" con un círculo que crece, y la IA que abre con la pregunta de quien mira y viaja de lo grande a lo chico.
- **20 repos de motion design (9 Oct 2026, idea 62):** zona segura 9:16 para subtítulos, avisos y rótulos; "stat" que termina en el número escrito; cifras con fuente y [VERIFY] que frena; plantilla Contradicción; contraste de la marca; la IA que revisa mide más; música que deja lugar antes del producto y el logo; efectos en su golpe; render final que se frena sin la fuente y revisa el MP4 (arregló el último cuadro que se perdía); voz con su emoción; anuncios a un mismo volumen.

## Revisión general de la app (7 Oct 2026)

Recorrí la app entera: flujo Brief → Menú → Historia → Storyboard → Producción, los checks, el motor de explicativos
(`src/lib/motion.ts`, `shared/motion.ts`, `motionAudio.ts`, `motionProject.ts`, `render.mjs`), el Reloj de letras
(`shared/clock.ts`, `syncDraw.ts`, `server/sync.ts`), el render de video y la sección nueva de Publicidad. Lo que sigue
son hallazgos y propuestas, numeradas para seguir con la lista. Casi todas ya están construidas: cada título lo dice.

**Lo que está sólido y no tocaría:** el contrato de render (cada cuadro función pura de t, ruido con semilla, el
render final por `seek(t)` + ffmpeg), los checks que bloquean la aprobación con "Arreglalo", las dos relojes del
Reloj (kick en el stem de batería, palabras en el stem de voz), el modo de muestra sin clave, y que las claves y
las rutas locales (Modelos, marca desde la web) solo respondan a la app en esta compu.

### Sincronización de los motion graphics: lo que encontré

#### 41. El reloj de la vista previa va a saltos (explicativos y videos de letra) — **Construido (7 Oct 2026, "Go 41 a 43")**
- **Qué pasa:** la vista previa dibuja en cada `requestAnimationFrame` leyendo `audio.currentTime` de un `<audio>`
  (`MotionStudio.tsx` ~l. 327, `LyricStudio.tsx` ~l. 1213). Ese valor avanza a saltos (en Chrome cada bloque de
  audio; en Safari y Firefox peor), así que entre un cuadro y el siguiente el `t` puede repetirse o saltar: el
  movimiento se ve con micro-tirones y un golpe de sonido puede verse 1 o 2 cuadros corrido respecto al render final,
  que sí es exacto. Además, cada vez que se rearma el WAV de la mezcla el `<audio>` pierde su posición (hoy se
  parcha con `timeRef`).
- **Arreglo:** reproducir la mezcla con `AudioContext` (`AudioBufferSourceNode`) y tomar el tiempo como
  `anchorT + (ctx.currentTime - anchorCtx)`: es un reloj con precisión de muestra, monótono, el mismo en cualquier
  navegador. Al rearmar la mezcla se reanuda desde el mismo `t` sin perder el lugar. Lo mismo para la letra y para
  "Ver la pieza" del storyboard cuando tenga voces.

#### 42. El check "Se lee" no cuenta el empuje entre escenas — **Construido (7 Oct 2026), con una corrección**
- **Qué pasa:** con tono Cálido la escena nueva entra deslizando 0,38 s (`cutPush`), y con Absurdo 0,2 s. Pero
  `settledAt` (cuándo un elemento quedó quieto) y `revealTimes` cuentan desde el inicio de la escena: un título que
  "entra a los 0 s" todavía se está moviendo con la escena durante el empuje. El check de lectura queda optimista
  hasta 0,38 s en cada escena menos la primera, y el efecto de sonido del título puede sonar antes de que se vea
  quieto. `posterTime` sí lo tiene en cuenta; los demás no.
- **Arreglo:** en `settledAt` y en `revealTimes`, para `index > 0`, sumar `cutPush(tone)` a todo lo que entra antes
  de que termine el empuje (`at < push` → cuenta desde `push`). Pasar el tono a esas funciones (hoy no lo reciben).

#### 43. El sonido se mueve al beat, la imagen no — **Construido (7 Oct 2026)**
- **Qué pasa:** `soundHits` lleva cada golpe al beat más cercano si está a menos de 0,06 s (`nearBeat`) y le resta
  0,02 s. La entrada visual del elemento queda donde estaba. Resultado: hasta 80 ms de corrimiento entre lo que se
  ve y lo que se oye, justo lo que la regla del playbook (§3.1) quiere evitar.
- **Arreglo:** una sola fuente de verdad. O bien los tiempos por defecto de `sceneElements` se pegan al beat
  cuando hay uno a menos de 0,1 s (y el sonido va donde va la imagen), o bien el sonido no se mueve y suena con el
  movimiento. Recomiendo lo primero: así "un acento cae en un kick" se cumple en imagen y sonido, y el check de
  sincronía de la IA deja de marcar lo que la app misma corrió.

#### 44. Los explicativos con tema propio leen los beats del master — **Construido (7 Oct 2026, "Go 44, 49, 56 y 55")**
- **Qué pasa:** `motionBeats` usa `findBeats(track)` (picos de volumen general) cuando hay un tema subido, y
  `strongBeats` aproxima los graves con un pasabajos. Es justo lo que la regla de las dos relojes prohíbe para el
  Reloj: "nunca lee picos del master". Un hat o una voz fuerte cuentan como beat y los cortes caen ahí.
- **Arreglo:** cuando el explicativo lleva un tema, pasar por el mismo camino del Reloj: stem de batería (Demucs
  si está, o el stem que subas) → `fitKicks` → `grid.kicks` para pegar escenas y `downbeats` para el producto y
  el logo. Sin stem, avisar y quedarse con la partitura sintetizada (que ya tiene grilla exacta). `findBeats`
  queda solo para los cortes de las historias, como dice CLAUDE.md.

#### 45. Pegar escenas a los beats puede dejar la siguiente demasiado corta — **Construido (7 Oct 2026, "go 45 y 46")**
- **Qué pasa:** `snapWith` mueve el corte al beat si la escena actual queda con 1,5 s o más, pero en el camino
  común no revisa que la **siguiente** escena también quede con 1,5 s (solo lo revisa en el camino de los golpes
  fuertes). Dos escenas cortas seguidas pueden quedar en 1,1 s y pisarse con su voz.
- **Arreglo:** la misma condición en los dos caminos, y si no se cumple, probar el beat anterior antes de dejar el
  corte donde estaba.

#### 46. La voz que no entra solo avisa — **Construido (7 Oct 2026)**
- **Qué pasa:** si la voz de una escena dura más que la escena, el carril de voz se pone rojo y la mezcla sigue
  sonando sobre la escena siguiente (la música no vuelve a subir hasta que la voz termina), pero el subtítulo ya
  cambió.
- **Arreglo:** botón "Ajustar al largo de la voz" (la escena pasa a durar voz + 0,4 s, redondeado al beat) y, en el
  render, cortar la voz con un fundido de 80 ms en el fin de la escena si la persona prefiere no alargar.

#### Lo construido con "go 45 y 46" (7 Oct 2026)
- **45:** el corte va al beat más cercano que deje 1,5 s a las dos escenas, la actual y la siguiente. Si no hay, prueba
  el siguiente más cercano (el del otro lado), y si ninguno sirve, el corte queda donde estaba.
  - Probado con 5000 guiones al azar, con grillas de sinte y con beats irregulares como los de un tema propio: antes,
    14 dejaban una escena por debajo de 1,5 s; ahora ninguno. Los cortes que caen en un beat pasaron de 27.346 a 27.374.
- **46:** si la voz se pasa de su escena, el aviso dice cuánto dura, cuándo entra y cuánto dura la escena, con el botón
  **"Ajustar al largo de la voz"** al lado. Está en la lista de escenas y en el inspector cuando elegís la marca de la
  voz. El botón alarga la escena a la voz más 0,4 s, con el corte en el primer beat después, hasta 8 s. Se deshace con
  Ctrl+Z.
  - Si no la alargás, la voz se apaga con un fundido de 80 ms justo en el corte, en la vista previa y en el render
    final. La boca del títere también para ahí y la música vuelve a subir en el corte. Así nunca habla encima de la
    escena siguiente.
  - Probado: en 3000 casos al azar, toda voz que entra en 8 s quedó adentro al primer intento, con el corte en un
    beat. Las voces de más de ~7,3 s no entran en 8 s y se apagan con el fundido. En un render final, la voz sonó
    hasta el corte y después hubo silencio (−91 dB).

#### 47. Lo que revisé y está bien
- `speechLevels` y `soundPlan` colocan la voz en el mismo `at` (0,25 s), así la boca del títere y el audio
  coinciden. `render.mjs` manda el cuadro f en `t = f/30` y la mezcla arranca en 0, con `-shortest`: el final
  coincide con la vista previa. La grilla sintetizada y el kick del sinte empiezan los dos en 0.

#### Lo construido con "Go 41 a 43" (7 Oct 2026)
- **41:** la vista previa del explicativo suena por Web Audio y dibuja con su reloj (`MixPlayer` en
  `src/lib/playClock.ts`). El botón pasa a ▶ / ❚❚; para ir a otro segundo se toca la regla de la línea de tiempo. Si
  cambiás algo mientras suena, la mezcla se rearma sola a los 0,45 s y sigue desde el mismo segundo. En los videos de
  letra la canción conserva su reproductor y la vista previa usa un reloj suavizado (`mediaClock`).
  - Medido en Chromium, un valor por cuadro durante 1,5 s: el `currentTime` del `<audio>` se apartó hasta 37 ms del
    reloj real en un cuadro; el reloj suavizado, 4 ms; el de Web Audio, 0 ms. Ninguno fue para atrás. En Safari y
    Firefox el `<audio>` va más a saltos que en Chrome, así que la diferencia ahí es mayor.
- **42, corrección:** el check "Se lee" no estaba equivocado. Todas las entradas duran 0,45 s o más y el empuje más
  largo es 0,38 s, así que ningún texto quedaba quieto antes de que terminara el empuje. Quedó una guarda
  (`settledAt` nunca antes del fin del empuje) por si un día hay una entrada más rápida. Lo que sí cambió: en el check
  de "algo nuevo cada 2–4 s", lo que entra mientras la escena todavía se desliza cuenta como parte del corte, no como
  algo nuevo aparte. Con tono Seco (corte seco) no cambia nada.
- **43:** `arrangeScenes` pega al beat la entrada de cada elemento cuando hay uno a menos de 0,1 s (`snapElements`).
  Los tiempos que pusiste a mano no se mueven, la voz no se mueve, y con "Cortes en los beats" apagado no se mueve
  nada. El sonido ya no se corre solo: cada efecto suena justo cuando entra su elemento.
  - En el explicativo de muestra: 24 efectos, los 24 en el segundo de su elemento; 10 entradas pasaron a caer en un
    beat. El render final (`render.mjs`, H.264) salió bien y la mezcla midió −14,1 LUFS.

### Flujo de trabajo y base del código

#### 48. Dos copias del playbook que se desvían — **Construido (7 Oct 2026, "go 54, 58 y 48"), con un cambio de diseño**
- `PLAYBOOK.md` (investigación) y `server/playbook.md` (lo que lee la IA) se mantienen a mano y ya difieren en
  estructura. **Propuesta:** un script `npm run playbook` que arma `server/playbook.md` a partir de las secciones
  operativas de `PLAYBOOK.md` (§1, §3, §3.1, §3.2, §5, §6) y un check en `typecheck`/CI que falla si el archivo
  generado no coincide con el guardado.

#### 49. Pruebas y CI — **Construido (7 Oct 2026)**
- Hoy no hay pruebas (solo `clock-check.ts`). Toda la lógica pura está en `shared/` y se prueba sin navegador:
  `checks.ts`, `motion.ts` (`snapScenes`, `readingIssues`, `quietGaps`, `posterTime`), `clock.ts`, `lyrics.ts`
  (`alignLyrics`, `splitLyrics`), `ads.ts`. **Propuesta:** `node --test` con `tsx` en `tests/`, y un workflow de
  GitHub Actions con `typecheck`, `build`, las pruebas y `clock-check`. Las pruebas de Publicidad que corrí en esta
  sesión ya sirven de arranque.

#### 50. El paquete del navegador pesa 1,9 MB — **Construido (9 Oct 2026, "Go 53, 50, 60")**
- **Construido:** los estudios, el storyboard, el panel de video, Editar serie y Modelos se cargan la primera vez que se
  abren; three.js, solo si un personaje tiene esqueleto; la página del render final va aparte. Lo que baja la primera
  pantalla pasó de 2.000 kB (555 kB comprimidos) a 479 kB (149 kB).
- **Arreglo tras la revisión:** si una parte que se baja aparte no llega (la app se actualizó con la pestaña abierta, se
  cortó la conexión), solo esa parte muestra el aviso con "Recargar la página"; lo demás y la pieza abierta siguen ahí.
- `three`, `mediabunny` y los tres estudios cargan juntos aunque se abra solo el brief. **Propuesta:** `import()`
  dinámico para `MotionStudio`, `LyricStudio`, `AdsStudio` y el actor 3D; `three` solo cuando hay un rig. La
  primera pantalla pasa a cargar en una fracción.

#### 51. Archivos de más de mil líneas — **Construido (10 Oct 2026, idea 65)**
- `App.tsx` (1455), `MotionStudio.tsx` (1428), `LyricStudio.tsx` (1604), `SeriesEditor.tsx` (1150),
  `ScriptView.tsx` (1023). **Propuesta:** sacar de `App.tsx` el autoguardado y la carga de medios a un hook
  `useProject`, y la producción a `ProductionView`; en los estudios, separar la vista previa (reloj, canvas) de los
  paneles. Sin cambiar comportamiento; antes, las pruebas de la idea 49.

#### 52. Costo de los prompts — **Medir tokens construido (10 Oct 2026, idea 65); recortar el playbook queda**
- El bloque fijo del escritor son ~2.900 palabras (motor + playbook) más el perfil de la herramienta (~1.300) y la
  biblia de la serie (~600) en cada pedido. Con Claude el bloque fijo va cacheado; con Kimi, NVIDIA y OpenRouter se
  paga entero cada vez. **Propuesta:** medir tokens por pedido en Modelos ("este pedido costó ~X tokens"), y
  recortar `server/playbook.md` a las reglas que de verdad cambian la escritura (las tablas de evidencia y las
  fuentes no hacen falta en el prompt).

#### 53. Errores que no dicen qué faltó — **Construido (9 Oct 2026, "Go 53, 50, 60")**
- **Construido:** dice el campo y qué le pasa, en castellano: "falta «state»", "«language» tiene que ser una de estas
  opciones: es, en", "«name» está vacío", y cuántos problemas más hay. También al guardar una serie y al leer el
  archivo de Publicidad.
- **Arreglo tras la revisión:** las posiciones de una lista cuentan desde 1 («shots.2.title» es la segunda toma), los
  tipos de dato siempre salen en castellano y la frase termina con un solo punto.
- Un pedido que no pasa el esquema responde "Al pedido le faltaban datos." sin decir cuál. **Propuesta:** incluir
  el primer camino del error de zod ("falta `brief.series`"), que ayuda cuando un proyecto viejo trae un campo
  cambiado.

#### 54. Publicidad: lo que sigue — **Construido (7 Oct 2026), menos las métricas por API**
- **Decidido (11 Oct 2026):** las métricas por API no hacen falta. Alcanza con subir el informe que exporta la
  plataforma ("Cargar reporte CSV" en Fuentes, que ya existe).
- Voz por pieza: `media.voice` ya existe en el esquema pero la tarjeta no la sube ni la genera. Sumar "Voz
  generada" con `/api/voice` y la voz del presentador del perfil.
- "Probar un anuncio": antes de la tanda, elegir un hook, un meat y un CTA y ver el anuncio armado en la app.
- Reforzar el límite semanal del lado del servidor (hoy lo controla la pantalla).
- Métricas por API de la plataforma, cuando haya cuenta: hoy es CSV.
- Las piezas se renderizan en el formato que da el navegador (mp4 en Chrome de escritorio, webm sin H.264); los
  anuncios salen siempre mp4. Avisar en la tarjeta qué codec quedó en caché.

### Playbook al máximo

#### 55. Las jugadas (§2.5) como dato de cada tema — **Construido (7 Oct 2026)**
- Hoy la historia no dice qué jugadas usa. **Propuesta:** cada tema devuelve `moves` (Clip Drop, Contradicción,
  Reacción lenta, Escalera, Giro, Botón, Brecha de curiosidad, Visita de campo, Callback, Corresponsal) y la app
  muestra una fila de chips por tema y una **cobertura por pieza**. El check suma "Sin Giro" (el Momento emotivo ya
  está) y "Sin Botón que vuelva al gancho". Con tres o cuatro piezas, la pizarra de la serie ve qué jugadas se
  repiten de más.

#### 56. Cinco variantes de gancho por historia (§3) — **Construido (7 Oct 2026)**
- El playbook pide entregar 5 ganchos por guion y la app entrega uno. **Propuesta:** botón "5 variantes de
  gancho" en la historia (cada una con su jugada), elegir la que va, y **"Mandar las 5 a Publicidad"**: entran al
  catálogo de hooks con su nivel. Es el puente natural entre el contenido orgánico y el 50-5-3.

#### 57. El registro de episodios (§2.6) desde la app — **Construido (10 Oct 2026, idea 65)**
- Hoy los resúmenes de episodios se pegan a mano en `PLAYBOOK.md`. **Propuesta:** un panel "Episodios estudiados":
  pegás el resumen, la IA lo vuelca en la plantilla EP-NN (tabla de temas, callbacks, observaciones), lo agrega al
  playbook con tu "ok" y, cuando una jugada se repite en 3 o más episodios, propone sumarla a `engine.md`.

#### 58. La lista de control del playbook (§7.4) como checks explícitos — **Construido (7 Oct 2026)**
- Faltan como ítems: "El cliente es el héroe" (la marca no abre la pieza), "Un solo llamado, suave", "Nada
  prestado" (nombres de programas, frases), "Detalle concreto" (objeto, número u hora en el gancho). Para video:
  "Gancho en 2 s" (la primera toma dura 6 s y su línea nombra el dolor) y "El producto en uso" (al menos una toma de
  pantalla real o producto en el Bueno). Entran en `STORY_CHECKS` y `BOARD_RULES` y la app los muestra como los
  demás.

#### 59. Un corresponsal fijo por serie y el formato "Visita de campo" — **Construido (10 Oct 2026, idea 65)**
- "The Manager" de IMAN aparece en el playbook pero no en el elenco. **Propuesta:** en el brief, "Formato: escritorio /
  con corresponsal / visita de campo" (§2.4 y §4), y el corresponsal como personaje fijo con su voz, que el escritor
  usa para la escalada y el regreso al problema real.

#### 60. Ganchos de calendario por serie — **Construido (9 Oct 2026, "Go 53, 50, 60")**
- **Construido:** "Momentos del calendario" en Editar serie, uno por línea, «cuándo: qué pasa». La app entiende fechas
  en castellano (el 1 de cada mes, los lunes, 25 de diciembre, 15/3, primera semana de junio, mediados de noviembre,
  fin de mes, último viernes del mes, julio) y muestra cuándo cae cada una; una semana o un mes que ya empezó cuenta
  como "hoy". En el brief, las tres más cercanas aparecen como sugerencia debajo de "Gancho del momento" y un clic la
  pone. El menú, la historia y los ganchos de Publicidad reciben todos los momentos, el más cercano primero. Los que no
  tienen una fecha que la app entienda ("cuando sube la nafta") igual van a la IA.
- **Arreglo tras la revisión:** "31/2" o "18/20 hs" no son fechas; "cada 15 días" es un intervalo, no el día 15; la
  hora no corta la línea ("los viernes 18:30: after office"); "1.º de mayo" se lee como fecha; una línea repetida es
  un solo momento, y la vista previa de Editar serie muestra lo mismo que se guarda.
- El brief tiene "un momento que el público ya siente", pero se escribe cada vez. **Propuesta:** una lista de
  fechas y momentos por serie (día de inventario, primera semana de frío, el 1 del mes) en Editar serie; el menú y
  los hooks de Publicidad la leen, y la app sugiere el más cercano.

#### 61. Imagen fija (idea 34) también para Publicidad
- Con el Método 50-5-3 construido, el tipo de pieza "Imagen fija" tiene un uso más: el anuncio estático sale de un
  hook aprobado (su titular en pantalla y su prompt de imagen) con el texto puesto por la app. Sigue esperando
  "go" y las 4 respuestas de la idea 34.

### Lo construido con "Go 44, 49, 56 y 55" (7 Oct 2026)
- **44:** con tema propio, la grilla del explicativo sale solo de la pista de batería: la subís (la exporta tu programa
  de música o un separador) o, si Demucs está instalado en la compu, "Separar la batería con Demucs". Los cortes y los
  acentos van a los bombos medidos y el producto y el logo a los primeros tiempos, con el mismo `fitKicks` del Reloj.
  Sin pista, el panel dice "Sin grilla" y nada se pega: nunca se miden los picos del tema entero. Al cambiar el tema,
  la grilla vieja se borra.
  - Probado con una pista sintética: los bombos quedaron a menos de 5 ms (en la app, error mediano 0,08 ms), todos
    los cortes en un bombo y el corte al producto en un primer tiempo cuando hay uno cerca.
- **49:** `npm test` corre 27 pruebas en `tests/` (tiempos de explicativos, checks y jugadas, variantes de gancho,
  pizarra, Publicidad, reloj de bombos, letras, reloj suavizado). Rompí a propósito la regla del Giro y las dos mitades
  de la 45, y las pruebas fallaron en cada caso. El workflow de GitHub Actions corre tipos, pruebas, build y el arnés
  del Reloj contra la API en modo de muestra, en cada push y PR.
- **55:** cada tema de la historia trae sus jugadas, con chips por tema y una fila de cobertura arriba (las que no se
  usaron aparecen tachadas). Si la historia tiene jugadas marcadas y le falta el Giro o el Botón, el check bloquea con
  "Sin Giro" o "Sin Botón". Las historias viejas, sin jugadas, no se juzgan por esto. La pizarra de la serie muestra
  las jugadas de todas las piezas y marca en rojo las que usan más de la mitad (con tres piezas o más), y el escritor
  recibe esa misma lista para variar.
- **56:** en la historia, "Escribir 5 variantes": cinco ganchos, cada uno con su jugada, su nivel de conciencia (N1 a
  N5) y por qué frena el scroll. "Usar como gancho" cambia el gancho de la pieza (queda en el registro de dirección), y
  "Mandar las 5 a Publicidad" las deja como hooks pendientes con su nivel, para aprobar con Sí o No. Las variantes se
  guardan con el proyecto.

### Lo construido con "go 54, 58 y 48" (7 Oct 2026)
- **54, Publicidad:**
  - **Voz por pieza:** en el perfil de oferta va la voz generada del presentador. Cada pieza puede subir su voz o
    generarla, y arriba está "Generar las N voces que faltan" para todas las aprobadas de una vez. La voz entra en el
    render de la pieza; si dura más que la pieza, la tarjeta lo avisa en rojo.
  - **"Probar un anuncio":** elegís hook, meat y CTA y lo ves armado, con descarga. Las piezas que arma quedan en la
    caché de la tanda.
  - **Límite semanal en el servidor:** una tanda que lo pasa se rechaza aunque la pantalla no la frene.
  - **Formato en caché:** cada tarjeta dice si su render es H.264 o webm. Si hay piezas en webm, un aviso explica que
    los anuncios saldrían en VP9 dentro de MP4, y "Sacarlas de la caché" deja que Chrome o Edge de escritorio las
    renderice en H.264.
  - Queda para después: métricas por API de la plataforma (hoy es CSV).
- **58, lista de control del §7.4:**
  - Lo que la app mide sola: la marca no dice la primera línea ("Cliente héroe"); ningún nombre del programa, de su
    gente o de programas vecinos en la historia ni en el storyboard ("Nada prestado"); la primera toma es el dolor y
    tiene línea o headline ("Gancho en 2 s"); y, si la serie tiene producto o pantallas reales en el elenco, alguna
    toma del Bueno lo muestra en uso ("El producto en uso").
  - Lo que califica el escritor: "Cliente héroe", "Un solo llamado" y "Nada prestado" en la lista de la historia, y
    "hook" y "product" entre los problemas del storyboard.
  - Los checks de imagen fija esperan a la idea 61.
  - En el storyboard de muestra de IMAN, el check encontró algo real: ninguna toma del Bueno muestra una pantalla real
    del producto.
- **48, cambio de diseño:** `server/playbook.md` no se puede generar desde `PLAYBOOK.md`. Es un resumen escrito a mano
  que deja afuera el nombre del programa, las personas reales y la política; copiar las secciones se lo daría todo al
  escritor. En cambio:
  - `scripts/playbook.snapshot.md` guarda las secciones §1 a §7 de `PLAYBOOK.md` (sin §2.1) tal como estaban la
    última vez que se puso al día el resumen, más la huella del resumen.
  - `npm run playbook` dice qué cambió de cada lado, con las líneas; una prueba falla mientras las dos copias no
    estén al día; `npm run playbook -- --write` las registra.
  - Al armarlo apareció un desvío real: la lista de control del resumen no tenía "portada y texto para publicar".
    Quedó agregado.

### Si tuviera que elegir el primer "go" (7 Oct 2026; ya construido todo)
1. **41 + 42 + 43:** el reloj de la vista previa, el empuje en el check y una sola fuente de verdad imagen-sonido.
   Son tres cambios chicos y arreglan lo que más se nota al sincronizar.
2. **49:** pruebas sobre `shared/` y CI, antes de tocar los archivos grandes.
3. **56 + 55:** las 5 variantes de gancho (puente a Publicidad) y las jugadas como dato: es lo que más saca del
   playbook con lo que ya existe.

## Decisiones tomadas (2 Oct 2026)
1. **Voz:** construir las 4 opciones: solo subtítulos, que Grok haga hablar al personaje, voz generada, y grabarla vos por toma. **Personajes:** usar las voces de Grok (panel Audio: Ara, Eve, Leo, Rex, Sal…, más audios subidos o grabados); cada personaje tiene una voz asignada y el prompt de video la pide. Grok no deja descargar el audio solo, así que esa voz vive dentro del clip. **Narrador:** las 4 opciones, según la escena.
2. **Escuchar en voz alta:** para escucharlos vos.
3. **Proyectos:** se guardan en una carpeta de la compu (`playbook-studio/proyectos/<pieza>/`).
4. **Setups fijos:** con la serie (personajes y locaciones), y se pueden cambiar.
5. **Largo de las tomas:** cada toma dura 6, 10 o 15 s, como los clips de Grok.
6. **Tomas de transformación:** la IA decide dónde convienen.
7. **Pantallas reales:** las capturas de celular y PC llegan en breve.
8. **Música y efectos de sonido:** (a) subir música y efectos libres de derechos por toma, y usar el sonido de Grok (prendido, sin voces) para los efectos de escena. **Pendiente (pin):** una API que genere efectos de sonido; investigar y proponer antes de construir.
9. **Sonido de Grok:** el usuario lo prende o apaga en Grok; la app indica por toma cuál conviene.
10. **Referencias:** Grok acepta hasta 14 imágenes de referencia y tiene una biblioteca de referencias con nombre (@Nombre).
11. **Modelo:** seguir con Kimi por NVIDIA y endurecer las reglas.
12. **Cartel de arriba:** opcional por toma + interruptor para todo el video; se llama **"Headline"**.
13. **Estilo del texto:** uno por serie.
14. **Si un check falla:** bloquea la aprobación **y** trae el botón "Arreglalo" (manda el problema como nota de director).
- **A (ok):** perfil de Grok actualizado.
- **B (sí):** IMAN es una serie de marketing de SaaS; los datos y reglas de cada marca se cargan en la app (brief / serie), no se escriben en el código. La regla "lo vencido se saca; lo que vence pronto pasa adelante" la carga el usuario en la serie IMAN.
- **Idea 23 (sí):** tipo de serie Software (SaaS) / E-commerce.
- **E (ok):** el PR #1 ya estaba mergeado (hasta la reforma de la historia); lo que vino después va en un PR nuevo.

### 23. Dos tipos de serie: Software (SaaS) y E-commerce
- **Idea (tuya):** el playbook sirve para dos cosas: marketing de software y de e-commerce. Todo se carga desde la app.
- **Cómo:** al crear o editar una serie se elige el tipo:
  - **Software (SaaS):** funciones que existen hoy, el loop del producto, pantallas reales (capturas de celular y PC).
  - **E-commerce:** un producto por episodio (catálogo), antes/después de la casa, producto recortado.
- Reemplaza las casillas sueltas ("Un producto distinto en cada episodio", "Es una app / tiene pantalla").

## Para construir (con "go")

### 1. Tomas de transformación: del Malo al Bueno en un solo clip
- **Qué:** una toma con tres imágenes (inicial = el Malo, intermedia = el giro, final = el Bueno) y un solo prompt de video que va de una a otra. Ej.: heladera desordenada con el yogur vencido → la mano que lo saca / el celular que avisa "Vence" → heladera ordenada.
- **Por qué:** Grok Imagine permite imagen inicial, intermedia y final en un clip. Es el Bueno contra el Malo hecho imagen.
- **Límite:** un clip dura como mucho 15 s. Sirve para el momento clave de cada tema, no para toda la historia.
- **Confirmado:** el ícono del medio en la barra del clip es la imagen intermedia.

### 2. Personajes y lugares como imágenes de referencia (`@`)
- **Qué:** cada setup del storyboard (El Desorden, Marta, la heladera) pasa a ser una imagen de referencia con nombre, para usar con `@` en Grok.
- **Por qué:** hoy la consistencia depende de repetir la misma descripción; con una imagen de referencia el personaje se ve igual en todas las tomas.
- **Confirmado:** se pueden subir imágenes propias.
- **Falta saber:** cuántas referencias se pueden usar a la vez.

### 3. Máshogar: el producto recortado
- **Qué:** una toma tipo "producto" pensada para **Eliminar fondo** en Grok: el producto del episodio limpio, para ponerlo en distintas escenas de casa.

### 4. Segmentos: cambiar un solo objeto
- **Qué:** notas de toma del estilo "cambiá solo el yogur vencido" o "sacá al Malo para el final", usando los segmentos de Grok.
- **Regla:** nunca para tapar o borrar la marca de agua.

### 5. "Texto en pantalla" más claro
- **Qué pasó:** en una toma decía "Octubre, heladera de abril… perdón" y no se entendía qué era.
- **Cómo funciona hoy:** el texto en pantalla es un cartel grande arriba (tipo zócalo de noticiero, máx. ~8 palabras). Lo que dice la voz se agrega solo como subtítulo abajo, con el nombre de quien habla. No hay que agregar nada a mano.
- **Idea:** renombrarlo "Cartel (arriba)", mostrar al lado "Subtítulo: automático, lo que dice la voz", una vista previa de cómo queda, y que la IA escriba carteles que se entiendan solos (un dato, una hora, un número), no chistes que dependen de la voz.

### 6. Largo de las tomas según Grok
- **Qué:** que la IA elija el largo de cada toma entre los que Grok ofrece de verdad, y que una línea hablada entre en el clip (~2,5 palabras por segundo: 15 s ≈ 37 palabras).
- **Confirmado:** Grok ofrece tres largos: 6, 10 y 15 s. La toma debería durar uno de esos, o la app avisa cuánto se recorta o se sostiene el último cuadro. Ej.: una toma de 8 s → clip de 10 s, se usan 8.

### 7. Revisión de imágenes por la IA (paso 5 del plan)
- **Qué:** cuando subís una imagen o un clip, la IA lo mira y dice si cumple: el personaje igual que en su setup, sin texto ni logos, el formato correcto.

### 8. Música y cortes al ritmo (paso 6 del plan)
- **Qué:** sumar música y que los cortes entre tomas caigan en el ritmo.
- **Falta saber:** si el sonido de Grok sale automático y si se puede apagar (los prompts hoy piden "sin música").

### 9. `iniciar.sh` que pregunte el proveedor
- **Qué:** que el script pregunte "¿Kimi directo, NVIDIA u OpenRouter?" y pida solo la clave y el modelo, sin tocar `.env` a mano.

### 10. Guardar proyectos — PRIORIDAD ALTA — **Construido (2 Oct 2026; el .zip, 10 Oct 2026)**
- **Qué pasó:** se generaron todas las tomas de una pieza y no había cómo guardar el trabajo. Hoy solo se guarda el brief; la historia, el storyboard, las imágenes y los clips viven en la pestaña abierta y se pierden si se cierra o se recarga.
- **Idea:**
  - **Autoguardado** mientras se trabaja (historia, rondas, storyboard, notas, imágenes y clips subidos), en el navegador.
  - **Lista de proyectos** al abrir la app: retomar una pieza donde quedó.
  - **Exportar / importar** el proyecto completo como un archivo (.zip con el .md, las imágenes, los clips y el video), para tenerlo en una carpeta o pasarlo a otra compu.
  - Aviso si querés cerrar la pestaña con trabajo sin guardar.
- **Mientras tanto:** descargar el video, "Descargar todo .md" y guardar las imágenes y los clips en una carpeta por pieza.

### 11. Voz en off
- **Qué:** hoy las líneas van solo en subtítulos. Más adelante, voz.

### 14. Setups fijos: imágenes aprobadas como fotogramas del video
- **Idea (tuya):** usar las imágenes de los setups como imagen inicial, intermedia y final al generar los videos en Grok.
- **Cómo:** cada setup (El Desorden, Marta, la heladera, el yogur) tiene **una imagen aprobada**, guardada una vez en la app. En cada toma, la app dice qué imagen de setup va como inicial, intermedia (opcional) y final, y el prompt de video describe solo el movimiento entre ellas.
- **Un paso más:** guardar los setups fijos **con la serie**, no con cada pieza. Así los personajes y lugares son los mismos en todos los episodios (como los personajes fijos de un programa); cada episodio nuevo los reusa y solo se generan imágenes nuevas para lo nuevo.
- **Confirmado:** se pueden subir imágenes propias como inicial, intermedia y final.
- **Cuidado:** las imágenes de una misma toma tienen que tener la misma forma (9:16) y luz parecida.
- **Une las ideas 1 (tomas de transformación) y 2 (referencias con `@`).**

### 36. Deploy fuera de la compu (4 Oct 2026) — **en pausa ("pin al deploy")**
- Hoy la app corre en tu compu. En Vercel no anda tal como está: el disco no guarda nada, corta los archivos de más de 4,5 MB, tiene un tiempo máximo por pedido, no puede correr el render final ni el Reloj, y la app no tiene contraseña.
- Caminos, de menos a más trabajo:
  - Tailscale para usarla desde el celular sin publicarla;
  - un servidor con disco (Railway, Render, Fly.io o un VPS), con contraseña;
  - Vercel, pasando el guardado a una base de datos y a almacenamiento.
- Se retoma con "go".

### 37. Storyboard dibujado antes de gastar en Grok (4 Oct 2026) — **Construido (4 Oct 2026, "Todo en ese orden, GO")**
- **Idea (tuya):** ver el storyboard antes de generar las imágenes o los videos con Grok.
- **Ya existe:** el paso Storyboard viene antes de Producción. Cada toma tiene su claqueta, quién está en cuadro, el prompt y **▶ Ver la pieza**, que la pasa con su duración real, las líneas y la tarjeta de color.
- **Lo que falta, un dibujo por toma:**
  - **A. Boceto de la app (gratis, al instante):** la app dibuja cada toma como un boceto en gris: los personajes como siluetas en su lugar (`setups`), el encuadre (plano general, medio, primer plano), la cámara, la pantalla real si va una, y el texto en pantalla. Sale de lo que la toma ya dice; no gasta nada. "Ver la pieza" pasaría estos bocetos en vez de la tarjeta de color.
  - **B. Boceto con IA de imagen:** un prompt "storyboard sketch, lápiz, gris, sin detalle" por toma para Grok u otra herramienta, más barato de rehacer que la imagen final. **[NOT SURE]** si Grok cobra distinto un boceto que una imagen final.
  - Con cualquiera de los dos: aprobar el storyboard dibujado antes de pasar a Producción, y que los bocetos se vean en `pieza.md`.
- **Recomendación:** empezar por A.
- **Decidido (4 Oct 2026):** los dos, A y B.

### 38. Sonido de los clips de Grok (4 Oct 2026) — **Construido (4 Oct 2026)**
- **Idea (tuya):** los videos de Grok pueden hablar y hacer sonidos.
- **Ya existe:**
  - la voz "La dice Grok" por toma: el prompt de video le pasa la línea, la voz y la emoción;
  - el prompt de video termina con una línea "Audio: …";
  - el render mezcla el sonido de cada clip.
- **Lo que falta:**
  - por toma, **qué suena dentro del clip**: diálogo, ambiente (el local, la calle), efectos (la persiana, el escáner) o nada. Va a la línea "Audio:" del prompt, en vez de que la escriba la IA sola;
  - en el render, por toma: **sonido del clip** (todo, solo ambiente bajo, o mudo), para que no choque con el narrador ni con la música;
  - aviso si el clip trae música: solo se usa si la herramienta da la licencia, como con las canciones.
- **Decidido (4 Oct 2026):** se elige por toma.

### 39. Narrador hecho en ElevenLabs (4 Oct 2026) — **A y B construidos (4 Oct 2026); C queda**
- **Decidido (11 Oct 2026):** C (ElevenLabs desde la app) no hace falta. La narración hecha afuera entra como hoy, con "Importar narración".
- **Idea (tuya):** hacer la voz del narrador en ElevenLabs y traerla a la app.
- **Ya existe:** "Grabada o subida" por toma o escena: hoy podés subir cada parte por separado.
- **Lo que falta:**
  - **A. Guion para ElevenLabs:** un botón "Copiar el guion del narrador" con todas sus líneas en orden, cada una con su emoción, listo para pegar.
  - **B. Un solo archivo para toda la pieza:** subís el audio entero de ElevenLabs. La app lo transcribe con tiempos, como en los videos de letra, lo corta por línea y pone cada parte en su toma o escena. Si una parte no entra, avisa y propone alargar la toma.
  - **C. ElevenLabs desde la app (más adelante):** como otra "Voz generada", con su clave (`ELEVENLABS_API_KEY`, en Modelos) y la voz elegida por personaje. **[NOT SURE]**: su API y sus precios de hoy.
- **Reglas:** voces de la biblioteca de ElevenLabs con su licencia, o tu propia voz. Nunca la voz clonada de una persona real sin su permiso: es la misma regla que con las caras.
- **Recomendación:** A y B primero, porque no necesitan otra clave.
- **Decidido (4 Oct 2026):** A y B. C queda para después.

### 40. Piezas sin narrador (4 Oct 2026) — **Construido (4 Oct 2026)**
- **Idea (tuya):** también tiene que haber videos sin narrador.
- **Ya existe:** el narrador es un rol más de la historia, y en los explicativos se puede elegir "Sin voz".
- **Lo que falta:** en el brief, **Narrador: con / sin**.
  - **Sin narrador, en las historias:** la IA no usa el rol narrador. Todo se cuenta con lo que dicen los personajes (Grok los hace hablar, o van subtitulados), con la acción y con el texto en pantalla. Los subtítulos siguen para lo que se dice.
  - **Sin narrador, en los explicativos:** la IA no escribe líneas de voz; el sentido va en los títulos, los rótulos y el producto en uso, con música y efectos.
  - El check de la historia revisa que se entienda sin narrador.
- **Preguntas para el "go":**
  1. Storyboard dibujado: ¿A (boceto de la app), B (boceto con IA) o los dos?
  2. ElevenLabs: ¿A y B (copiar el guion y subir un archivo), o también C (desde la app, con clave)?
  3. Sonido de Grok: ¿por toma, o una sola opción para toda la pieza?
  4. ¿Por cuál empezamos?
- **Respuestas (4 Oct 2026):** 1, los dos (A y B); 2, A y B; 3, por toma. Falta el "go".
- **Orden propuesto:** 40 (sin narrador) → 39 A y B (ElevenLabs) → 38 (sonido por toma) → 37 A y B (storyboard dibujado). Los tres primeros tocan la voz y el sonido, así que van juntos.

### 70. Subir clips en lote y próxima tanda (24 Oct 2026) — **Construido**
- **Qué es:** en Publicidad, los clips que devuelve Grok se suben de a muchos porque el nombre del archivo dice el lugar, y después de importar un CSV de métricas Combinar propone la próxima tanda. La propuesta es código: la IA no decide qué se queda.
- **El nombre:** cada prompt que copiás (video, secuencia, personaje, estático) termina con «Guardá el video como: H12.mp4» o «Guardá la imagen como: H12-img.png». Una pieza de un solo clip es `H12`. El clip 2 de un cuerpo largo es `M3-c2` (en la pantalla es 1, 2, 3; adentro el índice arranca en 0). Acepta mayúsculas, espacios, guiones y texto de más (`M3-c2 (1).mp4`). `c2` pegado a un separador es el clip, no la pieza C2. `M3c2` sin separador no adivina el clip. `H12 y C2` tiene dos piezas y pide que elijas.
- **Subir clips en lote:** en Hooks, Meats, CTAs y Combinar. Soltás archivos, los elegís, o una carpeta. Antes de subir ves el archivo, la pieza y el lugar, y el estado: nuevo, reemplaza el actual, no encontré la pieza, ese clip no existe en esta pieza, formato no válido, elegí el lugar, hay más de una pieza en el nombre, esa pieza es de otra pestaña. El que no matchea tiene un menú para elegir el lugar a mano. «Subir N clips» manda uno por uno por el mismo camino que «Subir clip» (el tipo se lee de los bytes). Uno que falla queda en la lista y el resto sigue. Se ve «k de N» y se puede parar; el que ya salió termina. Reemplazar un clip tira la caché de esa pieza, igual que una subida sola. No hay un tope de tamaño nuevo. La imagen `-img` va a la imagen de la pieza, no a Estáticos.
- **Próxima tanda:** aparece en Combinar cuando hay un CSV en Fuentes. Con menos de 1.000 impresiones (lo podés cambiar) la pieza o la voz es «sin datos suficientes»: ni ganadora ni perdedora, y queda como está. Del resto se queda el 20 % de arriba (también editable) y el resto se archiva. No hay un tercio del medio. Cada línea dice por qué, con los números del CSV y la media de la tanda. Las voces salen del id del anuncio (`H12v3`). La voz ganadora queda elegida en «Voces de esta tanda»; las que pierden se destildan. Un id viejo `H12-M3-C2` sigue encontrando las piezas y no nombra una voz.
- **Aplicar y deshacer:** nada cambia hasta Aplicar. Lo que se va pasa a archivada (no se borra y sigue en Fuentes). Lo que se queda pasa a aprobada si no lo estaba. Un id que ya no existe se saltea. Deshacer vuelve al estado anterior de esas piezas y de esas voces. Si esa pieza no tenía una elección guardada, al deshacer vuelven a estar todas abiertas. Si un pedido falla a mitad de camino, Deshacer solo toca lo que sí se escribió. En la tarjeta, debajo del texto, se ve la misma línea (ganador, perdedor o sin datos suficientes) cuando hay métricas. Una pieza que no está en el CSV dice «sin datos suficientes».
- **Variantes de los ganadores:** para cada gancho que sigue, pedís N ganchos nuevos (1 a 20, de entrada 3) con el mismo ángulo y la misma fórmula, por el escritor de ganchos que ya estaba (con clave, o copiando el prompt a claude.ai). El pedido lleva el texto, el ángulo, el nivel y los números guardados. No se inventan cifras. No se crean piezas solas: hace falta Pedirlas, o pegar la respuesta.
- **Campañas viejas:** un `campana.json` sin estos campos abre igual. `archived` es un estado más; un archivo que no lo usa sigue siendo válido.
- **No entra en esta parte:** que la IA elija qué se queda, borrar piezas al aplicar, un tope de megas distinto del de una subida sola, ni cambiar cómo se renderiza una sola voz.

### 69. Variantes de voz (23 Oct 2026) — **Construido**
- **Qué es:** la misma pieza de Publicidad (gancho, cuerpo o llamado) puede llevar hasta 10 voces o tonos. Cada una se renderiza como un video aparte y entra como un eje más de Método 50-5-3: gancho × voz, cuerpo × voz y llamado × voz.
- **De dónde salen:** las voces se hacen afuera (ElevenLabs u otra) y se suben. La app no se conecta a ElevenLabs ni a ninguna API de voz. «Generar voz» sigue siendo la de OpenAI, solo para la pieza que tiene una voz (la reemplaza) o, si ya hay varias, agrega la siguiente. «Generar las N voces que faltan» sigue llenando las aprobadas que no tienen ninguna.
- **Datos:** cada voz es v1…v10. El número no se reusa si la borrás. El nombre sale del archivo y se puede cambiar. La voz que ya estaba guardada pasa a ser v1 al abrir la campaña; una pieza con una sola voz se comporta igual que antes y su id sigue siendo `H12-M3-C2`. Los archivos van a `publicidad/<serie>/media/<pieza>-voz-<vN>.<ext>` (mp3, wav, m4a, ogg o webm, el tipo se lee de los bytes, hasta 25 MB). Un id malo, un archivo que no es audio, uno vacío, uno de más de 25 MB o la voz número 11 responden 400 en español.
- **En la tarjeta:** «Voces (N/10)». Se sueltan varios archivos; cada uno entra solo y el que falla queda listado. Cada voz se escucha, se renombra y se borra. Si, arrancando 0,15 s adentro, se pasa del largo de la pieza, dice «La voz 3 dura 4,2 s y la pieza 3 s» y no deja renderizar esa voz hasta que aceptás el corte («Cortala igual») o la reemplazás.
- **Convertir:** con una voz, «Convertir la voz» (el mismo archivo de caché de antes, `H3.l2.mp4`). Con varias, «Convertir las N voces»: el mismo cuadro, los mismos clips y el mismo texto, y cambia la voz. La caché es por pieza y por voz (`H3.v2.l2.mp4`). Se ve el avance (k de N) y se puede parar. Cada render queda en −14 LUFS.
- **Combinar:** el id suma la variante solo cuando esa pieza tiene más de una voz, aunque en esta tanda elijas una: `H12v3-M3v1-C2v2`. Antes de renderizar elegís qué voces entran (todas, o algunas por pieza). La pantalla dice el número exacto. Más de 300 avisa; más de 1000 no arranca (el servidor acepta hasta 1000). El límite semanal sigue contando anuncios y también lo controla el servidor. El CSV de la tanda suma `voz_hook`, `voz_meat` y `voz_cta` con el nombre de la voz, para cruzar el tono que ganó con las métricas de Meta. El CSV de métricas sigue encontrando el anuncio por id, incluidos los nuevos.
- **No entra en esta parte:** variantes de narración en los explicativos (hasta 10 archivos, un `video-final-<formato>-<vN>.mp4` por narración, y elegir cuál va a «Usar como cuerpo o llamado»).

### 68. Anuncios de hasta 2 minutos (23 Oct 2026) — **Construido**
- **Largo:** un anuncio dura cualquier número entero de 6 a 120 s. Los botones son 6, 10, 15, 30, 45, 60 y 90, y hay un campo para otro número. El gancho queda corto (3 s, o 4 s desde 30 s). El llamado dura 3 s hasta 15 s, 4 s hasta 45 s y 6 s después. El cuerpo se lleva el resto: 60 s = gancho 4 + cuerpo 50 + llamado 6. Un anuncio de 6 s es 2 + 2 + 2: siempre hay cuerpo. El reparto se puede editar a mano; los campos muestran lo que se está escribiendo, y si las tres partes no suman el largo, se avisa en español y no se pide el texto. Las palabras siguen a ~2,7 por segundo, así que un cuerpo de 50 s se escribe para 50 s. Una tanda solo combina piezas cuyo largo es el de esa parte.
- **Clips de Grok:** un cuerpo de más de 15 s es la menor cantidad de clips de 6, 10 o 15 s que lo cubre, los más largos primero, y solo se corta el último (22 s = 15+10, el de 10 se usa 7 s; 50 s = 15+15+10+10). En un cuerpo normal los clips van en silencio: la línea la dice la voz de la pieza. Solo «Que lo diga un personaje» habla. Cada clip sigue la acción del anterior, y desde el segundo se pide el último cuadro del clip anterior como imagen inicial. «Copiar todos los prompts» copia la secuencia y se frena si el texto tiene un [VERIFY].
- **Motion graphics:** «Hacelo como explicativo» también vale para un gancho, sin mascota. El gancho es texto cinético: las palabras se arman y, si da el tiempo de lectura, se desarman y se van desvaneciendo dentro de la zona segura. El problema del guion es el texto de la pieza, en palabras llanas. Un cuerpo largo se parte en oraciones o cláusulas de 2 o 2,5 s que suman el largo del cuerpo. «Hacer en motion graphics» arma un explicativo por pieza aprobada, saltea la que ya tiene uno y para en 20 por clic. «Usar en Publicidad» vuelve a la última pieza anotada en el brief.
- **Sugerencia:** audiencia fría (niveles 1 a 3) propone 30 a 60 s (el botón usa 45). Retargeting (niveles 4 y 5) propone 15 s. No pisa un largo ya elegido.
- **Lo que cambia en piezas nuevas de 6 s y de 10 s:** el reparto de palabras ya no es el de antes (6 s queda 2 + 2 + 2, con cuerpo; 10 s queda 3+4+3). Las piezas ya guardadas conservan sus segundos. La caché de renders se rehace (`l2`).
- **Ya estaba y no se rehízo:** ganchos con nivel 1 a 5, meats, CTAs y combinar; el perfil de oferta; la revisión antes de la tanda; el CSV de métricas; estáticos, textos de plataforma y «Que lo diga un personaje»; «Usar como cuerpo o llamado»; copiar y pegar con claude.ai sin clave. El límite semanal sigue contando anuncios, no segundos.
- **No entra en esta parte:** una sola fuente de pruebas y temas prohibidos, el botón de la historia como CTA, controles más estrictos, el detalle de una nota del director, ni puntos de restauración.

### 67. Sin clave, entradas en la palabra, metáforas, fuentes y estilo del texto (16 Oct 2026) — **Construido ("vamos con la A")**
- **Sin clave (A):** cada pedido al escritor se puede hacer con claude.ai copiando y pegando: "Copiar el prompt para claude.ai", pegás la respuesta y "Usar esta respuesta". Cubre historias (menú, historia, notas del director, storyboard, tomas, 5 ganchos, Arreglalo), explicativos (guion, nota del director, revisión de calidad con la hoja de cuadros) y Publicidad (hooks, meats y CTAs en tandas de prompts, revisión, textos de la plataforma, cortar transcripciones). "Ver un ejemplo" sigue mostrando la muestra. Si la respuesta no encaja, el error dice qué campo falla.
- **Entradas en la palabra:** en los explicativos, un título, rótulo, ítem o número entra cuando la voz lo dice. Manda la palabra sobre el golpe, pero nunca le quita tiempo de lectura.
- **Escenas metáfora:** una imagen (o clip) de Grok que explica una idea abstracta, con su línea en la letra de la marca. La app da los prompts y vos subís lo que hizo Grok; hasta entonces no deja renderizar.
- **Fuentes propias:** cada serie sube sus archivos de fuentes (varias por marca, woff2/woff/ttf/otf) en Editar serie → Marca; se usan en explicativos, render, escena de código, imagen fija, estáticos y, si lo elegís, en las historias.
- **Estilo del texto (idea 21):** color del nombre de quien habla, posición de subtítulos (abajo, centro, arriba) y del titular, y la letra (de la app, de la marca u otra), siempre dentro de la zona segura.
- **Playbook:** el ejemplo de la Contradicción quedó marcado como ilustrativo, se sumó el panel Audio de Grok, y `server/playbook.md` quedó recortado a lo que usa el escritor.
- **Decidido:** la app corre solo local (sin deploy); los efectos de sonido los ponés a mano (sin API); el personaje 3D en GLB no se sigue, lo cubre la mascota en código.
- **Revisión del código:** 10 errores confirmados y arreglados (entre ellos, textos de la plataforma viejos que podían salir con un hook cambiado, fuentes de una serie que pisaban las de otra, y clips de metáfora que no se podían adelantar).

### 66. Pantallas, escena de código, imagen fija y quien presenta (15 Oct 2026) — **Construido ("Go a los dos", "Go a los tres")**
- **Pantallas en lote:** subís muchas capturas reales de una vez y las revisás en una grilla (nombre, qué muestra, celular o PC); sin clave, se nombran pegando la respuesta de claude.ai.
- **Videos de la app funcionando** dentro del celular en los explicativos, con desde y hasta, iguales en la vista previa y en el render.
- **Escena de código:** "Copiar el prompt para Opus" y una caja donde pegás el código; corre aislado (no llega a la app, a tus archivos ni a internet) y se revisa la lectura y la zona segura.
- **Imagen fija:** analizar tus anuncios ganadores, conceptos que calman un dolor, prompt para Grok sin texto, el texto lo pone la app sin tapar la marca de agua, variantes de texto para sacar cantidad; y la versión estática de cada gancho en Publicidad.
- **Usar un explicativo como cuerpo o llamado** de Publicidad, sin bajar y subir el MP4.
- **Mascota en código** guardada en la serie, reusada en cada escena de código y como presentadora.
- **Que lo diga un personaje:** prompt para Grok con un personaje inventado del elenco diciendo el gancho, el cuerpo o el llamado, o la mascota con la voz del narrador.
- **Revisión del código:** 12 errores confirmados y arreglados; el más importante, que el código pegado podía salirse de su caja (ahora corre en un worker aislado y se probó en Chromium que no navega ni llega a la red).

### 65. Videos de letra, historias y la app por dentro (10 Oct 2026) — **Construido (10 Oct 2026, "Go a las listas")**
- **Videos de letra:**
  1. **Laten con el kick:** con el Reloj armado (stem de batería), el fondo, las capas de Grok y los elementos "al
     ritmo" laten con el kick: el movimiento grande en el primer tiempo y un acento chico en cada kick. Sin batería
     siguen los golpes de la canción entera, solo como adorno (nunca corta ni arma el Reloj), y la pestaña Video lo dice.
  2. **La letra actúa el canto:** una palabra sostenida 0,6 s o más se estira hasta un 20 % y se acomoda sin rebote;
     una gritada (el 10 % más fuerte, medido solo en la voz sola) tiembla un poco. Prendido en las piezas nuevas.
- **Historias y producción:**
  3. **Sin "cinematic still"** en las imágenes de la app (manda el look de la serie), y la emoción de la línea en el
     prompt cuando Grok la dice.
  4. **Exportar e importar un proyecto como .zip** desde la lista de proyectos; importar nunca pisa otro proyecto.
  5. **Los bocetos en pieza.md:** el subido o el lápiz de la app, enlazado en cada toma.
  6. **"Cambiar descripción"** de un personaje, lugar o producto en la pieza: llega a todas sus tomas, se puede
     guardar en la serie y se deshace.
  7. **Transformación hacia la pantalla real:** una punta del clip es la captura de la serie (nunca dibujada por IA).
  8. **Hoja de personaje desde Producción** y recorte de la cara (o de lo que elijas) como otra referencia `@`; las
     vistas sueltas se guardan.
  9. **Aviso "Este clip parece traer música"** al subir un clip, con "Mudo" o "Tiene licencia"; nunca frena.
  10. **Corresponsal y Visita de campo:** "Formato del segmento" en el brief; cada serie elige su corresponsal en
      Editar serie (si no hay, la IA inventa uno adulto y no famoso y se ofrece sumarlo al elenco).
- **La app por dentro:**
  11. **Tokens por pedido** en Modelos: los últimos 200 pedidos y el promedio por tipo, como los informa cada
      proveedor (tokens, no plata).
  12. **"Episodios estudiados":** pegás el resumen, la IA arma la ficha EP-NN de §2.6, la revisás y con tu "ok" se
      suma a PLAYBOOK.md. El playbook que lee la IA nunca recibe los episodios. Propone las jugadas que se repiten en
      3 episodios o más.
  13. **"Traer la marca desde su web"** también propone fotos de producto (e-commerce) o capturas (software) para
      el elenco; una captura entra como pantalla real solo si confirmás que la app hoy se ve así.
  14. **Archivos partidos** (idea 51): el guardado en `useProject`, Producción en su componente, y las vistas previas
      de los estudios separadas de sus paneles. Hace lo mismo que antes y la primera pantalla pesa lo mismo.
- **Revisión del código (11 Oct 2026):** se confirmaron y arreglaron 8 errores:
  - Seguridad: borrar una referencia del elenco podía borrar un archivo fuera de la biblioteca; traer la marca desde
    su web se podía engañar con un DNS que cambia entre el chequeo y la descarga; una ficha de episodio con ~~~ podía
    romper PLAYBOOK.md.
  - "Medir la voz" pisaba los tiempos que corregías mientras Demucs trabajaba.
  - Una toma podía pedir "editar la imagen" de una captura real.
  - Al sumar una foto de la web: si fallaba la subida quedaba un integrante sin imagen y reintentar lo duplicaba, y
    todas las tarjetas mostraban el reloj.
  - El corresponsal inventado podía repetir el @ de alguien del elenco.

### 64. Explicativos: lo que quedaba (10 Oct 2026) — **Construido (10 Oct 2026, "GO, Explicativos")**
- **De dónde sale:** lo que quedó "para otro go" en las ideas 62 y 63, la parte de expresiones de la 33-A y el rótulo
  de Concepto de la 31. Cada punto tiene su commit y sus pruebas.
- **Construido:**
  1. **Lectura que cuenta letras:** además de 0,3 s por palabra, 15 letras por segundo; gana la cuenta más exigente.
     "Planificación automatizada" pasa de 0,8 s a 1,7 s. La IA que escribe y la que revisa usan la misma regla.
  2. **Foco de a uno:** en "Rótulos" y "Paso a paso", cuando entra uno nuevo, los anteriores se tiñen hacia el fondo
     (nunca por debajo de 3:1 de contraste). En Editar serie se ve cuánto bajan.
  3. **Títeres con envión y cámaras de la IA:** antes de cada gesto, un amague chico para el otro lado (mínimo y sin
     pasarse en tono seco). La IA elige la cámara de cada escena: quieta donde hay que leer, se acerca al producto o a
     la pantalla, nunca el mismo movimiento tres veces seguidas. La que elegís a mano no se toca.
  4. **Desenfoque en los cortes:** solo durante el empuje entre escenas y "Pasar a través", 8 subcuadros. El
     subtítulo y el aviso de IA nunca se desenfocan. Viene prendido y se apaga en el estudio.
  5. **CONCEPTO / SIMULACIÓN en los explicativos:** por escena, arriba a la derecha y dentro de la zona segura. Si la
     IA o la revisión marcan que una escena muestra algo que no está en «Lo que existe hoy» y no tiene rótulo, el video
     no se genera hasta ponerle el rótulo, cambiarla o tocar «Lo confirmo».
  6. **Personaje fijo por serie:** "Personaje de los explicativos" en Editar serie. La IA lo usa en todas las escenas
     de personaje y lo trae al menos una vez por pieza. Las muestras usan a Mica (IMAN) y a Mara (Máshogar).
  7. **Títere con expresiones:** partes opcionales de la hoja: bocas A, O y E que siguen la voz (una décima de
     segundo cada una, sin titilar), caras contenta, sorprendida y preocupada según la emoción de la frase, y el cuerpo
     de 3/4 o de perfil cuando señala o presenta. Sin esas partes, el títere se mueve como antes.
  8. **Nota del director:** "arreglá el gancho" y la IA cambia solo eso; lo demás queda igual, con tus ajustes, tus
     cámaras y tus voces. Si cambió lo que se dice, la voz generada se saca; «Deshacer» la trae de vuelta.
  9. **Subtítulos palabra por palabra y .srt:** la frase queda quieta y se marca la palabra que suena. Los tiempos
     salen de escuchar la voz (whisper-1) o, sin clave, de lo que dura la voz y lo largo de cada palabra. Cada video
     guarda su .srt al lado, y se puede bajar desde el estudio.
  10. **Corte por continuidad:** si dos escenas seguidas muestran la misma imagen, esa imagen viaja de un lugar al
      otro mientras lo demás cambia. Pasa solo, o se elige a mano como «Continuidad».
  11. **Plantillas nuevas:** "Avisos" (notificaciones que llegan de a una), "Flujo" (un origen que se reparte a varios
      lados) y "Casilleros" (cajas vacías que se van llenando escena por escena: el loop abierto a la vista).
  12. **Mundo ilustrado:** negocio, calle, casa o escritorio, hechos con formas planas en tonos de la marca, en tres
      capas que se mueven con la cámara. Los tonos se eligen midiendo el contraste y los detalles no van detrás de
      las palabras. La IA elige el lugar.
  13. **Storyboard del explicativo:** una viñeta por escena con el cuadro, lo que se dice, lo que suena, cómo entra y
      la cámara. Se baja como .md y como una hoja .png.
- **Probado en un render real** (muestra de IMAN, 9:16): 1221 de 1221 cuadros, -14,1 LUFS, con su .srt al lado.
- **Revisión del código (10 Oct 2026):** se confirmaron y arreglaron 10 errores:
  - El mundo ilustrado dejaba detalles detrás del campo que se tipea y de los nombres de los Casilleros. Además
    quedaba el marco del monitor como un bloque liso detrás del subtítulo: ahora cada objeto sale entero o no sale.
  - Un rótulo de CONCEPTO marcado por la revisión no frenaba el render en la misma corrida, y al cambiar el personaje
    de una escena el aviso se perdía.
  - Una nota del director traía de vuelta avisos ya resueltos y borraba la segunda fila de Casilleros.
  - Una voz nueva podía pisar el archivo que «Deshacer» restaura, y una respuesta vieja de la escucha podía pisar los
    tiempos de la voz nueva.
  - Un archivo de títere con "34" en el nombre (por ejemplo, una hora) se tomaba como la vista de 3/4.

### 63. Lo que se aprende de Kurzgesagt (9 Oct 2026) — **Construido 1 a 5 (9 Oct 2026, "Go")**
- **De dónde sale:** te encanta Kurzgesagt. Tomamos su oficio, no su estética: ni su pájaro, ni su paleta, ni su nombre en una pieza, ni el brillo (el estudio lo prohíbe).
- **Lo que hacen bien:**
  - **No cortan, viajan:** la cámara se mete en una cosa y la idea siguiente vive adentro.
  - **Un mundo con física propia:** todo se mueve con el mismo material, y nada queda muerto: las cosas respiran.
  - **El cambio empieza en un punto y se extiende,** muchas veces en un círculo.
  - **Abren con la pregunta de quien mira** y van de lo grande a lo chico (o al revés): la escala cuenta la historia.
- **Construido (9 Oct 2026, "Go"):**
  1. **"Pasar a través":** una escena puede entrar con un viaje de cámara. La cámara se zambulle en lo principal de la escena anterior (la pantalla, el producto, el número, lo que pasa de verdad) y la nueva se abre desde adentro, en un círculo con borde de acento. Dura 0,7 s en cualquier tono; los checks, la portada y la hoja de contactos lo esperan; el whoosh lo acompaña. Se elige por escena ("Entrada") o lo pide la IA.
  2. **Cómo se mueve la marca** (Editar serie): Pareja (decide el tono, como hasta ahora), Firme (llega y se queda), Suave (se acomoda despacio y las imágenes flotan apenas) o Elástica (rebota un poco y las imágenes respiran). El texto nunca se mueve mientras se lee, y un tono seco nunca rebota.
  3. **"Antes / después" con un círculo que crece** desde el punto que elijas.
  4. **La IA escribe así:** abre con la pregunta que ya se hace quien mira, viaja de lo grande a lo chico con "Pasar a través" una o dos veces por pieza, y usa el círculo cuando el cambio empieza en un lugar y se extiende.
  5. **Las piezas de muestra** (sin clave) usan el viaje (IMAN) y el círculo (Máshogar).
  - **Probado en un render real** (IMAN con la marca Elástica): la escena del producto se zambulle en su imagen, el número se abre desde adentro y termina en "3 cajas"; 546 de 546 cuadros, -14,1 LUFS.
- **Para otro "go"** (**el mundo ilustrado y el personaje fijo se construyeron en la idea 64**):
  - **Un mundo ilustrado de la marca:** fondos de capas planas con profundidad (el local, los estantes, el barrio) en los colores de la marca, que se mueven con la cámara.
  - **Escenas metáfora:** una imagen simple que explica una idea (el pedido como una pila de cajas que se cae). Hacen falta imágenes del elenco hechas para eso.
  - **Un personaje fijo por serie para los explicativos,** simple y siempre igual, que vuelve en cada pieza (los títeres ya existen).
  - **La letra que actúa el canto** (una nota larga estira su palabra, un grito la sacude) y **música visual desde el kick**, de la charla del 9 Oct.
- **Lo que no:** su estética (el pájaro, la paleta, el brillo, las estrellas y partículas), su nombre o su logo en una pieza, su narrador; y "Pasar a través" en cada corte: cansa, va una o dos veces.
- **Revisión del código (9 Oct 2026):** se arreglaron los errores confirmados:
  - Con la marca Suave o Elástica respiraba también texto que está dentro de una imagen: el campo que se tipea, los nombres del antes / después, un logo hecho de letras y las pantallas reales. Ahora solo respiran las fotos y los productos (una prueba lo vigila).
  - En la mitad del viaje se veían franjas de la escena anterior dentro del círculo: ahora el círculo es la escena nueva hasta el borde.
  - Cambiar la "Entrada" no rehacía el sonido de la vista previa.
  - La curva elástica daba un saltito al terminar.
  - El dato nuevo de la marca invalidaba las revisiones de la IA ya guardadas: una marca que no eligió cómo moverse cuenta igual que antes.

### 62. Lo que sirve de 20 repos de motion design (9 Oct 2026) — **Construido 1 a 12 (9 Oct 2026, "Go")**
- **Qué son:** skills para agentes (Claude Code y otros) que hacen videos de motion graphics, los motores que usan y guías de criterio. Los mandaste diciendo que están hechos para Opus 5.5: la app ya escribe con `claude-opus-5-5` por defecto, así que no hizo falta cambiar el modelo. Se leyeron los 20 clonados, sin correr nada de ellos.
  - **Skills** (MIT salvo donde dice): `whaleyxbt/claude-motion` (criterio con números, revisa sus propios cuadros, sonido sintetizado en Python), `howseen-ai/claude-motion-design` (HTML + Playwright + ffmpeg, como nuestro render), `charlie947/motion-graphics-skills` (13 skills de lanzamiento), `haidrrrry/claude-remotion-skill` (Remotion: subtítulos, B-roll, sonido), `t3knobox/klik-anim-skill-creation` (**sin licencia**: solo ideas), `Sunwood-ai-labs/hyperframes-motion-reel-skill` (showreel a 120 bpm en HyperFrames), `AbubakrChan/product-launch-motion` (film de lanzamiento; su aviso deja afuera la película de referencia y las imágenes de ejemplo), `cth9191/animate` (un clip en un solo archivo de canvas), `iart-ai/motion-design-skills` (tiempos, color, tipografía, logos), `nateherkai/hyperframes-student-kit` (14 skills y 406 tarjetas; licencias mezcladas: MIT, un permiso propio para lo importado, Apache 2.0 de HyperFrames y la de GSAP).
  - **Motores:** `heygen-com/hyperframes` (Apache 2.0), `remotion-dev/remotion` y `remotion-dev/skills` (licencia propia: gratis para personas, organizaciones sin fines de lucro y empresas de hasta 3 empleados; arriba de eso, licencia paga), `greensock/GSAP` (gratis, pero no es código abierto: "All rights reserved" y una licencia aparte en su web).
  - **Criterio y lo que lo rodea:** `LottieFiles/motion-design-skill` (MIT), `frankxai/awesome-motion-design-agent-skills` (CC0, un mapa), `Barty-Bart/motion-graphics` (MIT, B-roll desde la transcripción de un video con cara), `199-biotechnologies/motion-dev-animations-skill` (MIT, animación de páginas web), `motiondivision/motion` (MIT) y `airbnb/lottie-web` (MIT).
- **Ya lo tenemos** (varios repos piden lo mismo): cada cuadro como función pura de t con ruido con semilla; render cuadro por cuadro en Chrome sin ventana hacia ffmpeg; una sola línea de tiempo para imagen, sonido y checks; hoja de contactos con cuadros a mitad de corte; revisión de la IA en rondas; portada en el cuadro 0; tiempo de lectura; nada fuera del cuadro; -14 LUFS medido como ffmpeg; música y golpes sintetizados; efectos al empezar el movimiento; tipeo con teclas.
- **Construido (9 Oct 2026, "Go"),** de más a menos útil:
  1. **Zona segura 9:16** (la piden 7 repos). Reels, TikTok y Shorts tapan arriba su barra, abajo el texto y el nombre de la cuenta, y a la derecha los botones. Subtítulos, aviso de IA, CONCEPTO / SIMULACIÓN, titular y créditos quedan adentro: en el explicativo, en el render de historias y anuncios y en los videos de letra. Los títulos de arriba bajan de la barra. En la vista previa del explicativo, "Ver lo que tapa la app" (nunca sale en el video). Las medidas son aproximadas [NOT SURE]: arriba 10 %, abajo 20 %, derecha 12 % del 40 % para abajo, izquierda 5 %.
  2. **"Stat" exacto.** Cuenta con los separadores del título y termina en el título tal cual. Antes "1.500" terminaba en "1500", "2,5" en "2.5" y "24/7" en "24 /7". "24/7" y "6:00" ya no cuentan. El texto de apoyo entra cuando el número paró.
  3. **Cifras con fuente.** Cada número en pantalla o en la voz tiene que estar en «Lo que existe hoy» o en el brief; si no, frena el render hasta cambiarlo o confirmarlo ("Lo confirmo"). Un [VERIFY] en pantalla frena siempre.
  4. **Plantilla "Contradicción"** (la jugada del playbook §2.5): lo que dicen, lo que pasa, y lo primero tachado. La IA la usa solo con "Cómo se trabaja hoy" y el brief.
  5. **La IA que revisa ve más, medido:** texto bajo la interfaz de la app, texto quieto encima de otro texto (con el subtítulo) y el contraste de la marca. La hoja de contactos mira 0,3 s después de cada beat, con lo que entró ya quieto.
  6. **Contraste de la marca** (WCAG): texto 4,5:1 y acento 3:1 sobre el fondo, a la vista en Editar serie.
  7. **La música deja lugar:** baja medio beat antes del producto y del logo y vuelve en el golpe. En un render de prueba: de -29 a -44 dB antes del logo y -13 dB en el golpe.
  8. **Efectos en su golpe y parejos:** arrancan en su ataque y no en el silencio del archivo (las teclas traían hasta 57 ms), y suenan al nivel de su tipo (las teclas variaban 12 dB).
  9. **Render final que se controla.** Se frena si la fuente de la marca no cargó, y ffprobe revisa cuadros, tamaño, yuv420p y el largo del sonido antes de reemplazar el video anterior. En la primera prueba encontró un error viejo: `-shortest` cortaba el último cuadro. Ahora el sonido se rellena y manda la imagen (563 de 563 cuadros, -14,1 LUFS).
  10. **Voz con su emoción:** la voz generada dice cada línea con la emoción escrita en la historia o en la escena.
  11. **Anuncios a un mismo volumen:** cada pieza de Publicidad sale a -14 LUFS, así los cortes no saltan.
  12. **Oficio:** el tono decide cómo aterriza cada cosa (seco sin rebote, absurdo con más); el logo crece desde el 60 %, nunca desde cero; el cierre del explicativo retoma el gancho; una prueba vigila que el código de dibujo no lea relojes ni `Math.random`.
- **Para otro "go"** (sirven, pero no ahora). **Construidos en la idea 64 todos menos "Entradas en la palabra":**
  - **Entradas en la palabra que las nombra** (3 repos): un rótulo entra cuando la voz lo dice. Hacen falta los tiempos de cada palabra (whisper-1), y choca con "los acentos en el beat": hay que decidir cuál manda.
  - **Desenfoque de movimiento solo en el empuje entre escenas** (4 repos): promediar 4 a 8 subcuadros durante el corte. Sigue siendo función pura de t, pero el render tarda más.
  - **Corte por continuidad:** si dos escenas muestran la misma pantalla o el mismo producto, que pase de una a otra en vez del empuje.
  - **Subtítulos palabra por palabra** con la palabra activa resaltada, y un `.srt` al lado de cada video para subirlo a la plataforma.
  - **Plantillas nuevas:** "Avisos" (notificaciones que llegan), "Flujo" (de una fuente a varios canales) y casilleros que se llenan escena por escena (el loop abierto en pantalla).
  - **Foco de a uno:** cuando entra un rótulo nuevo, los anteriores bajan.
  - **Títeres con anticipación y rebote**, y cámaras que varían por escena.
  - **Tiempo de lectura que también cuente letras** (las palabras largas del español).
  - **Storyboard del explicativo:** un panel por escena, con lo que suena y cómo corta.
  - **"Nota" para el explicativo,** como en la historia: arreglar una cosa y dejar el resto.
- **Lo que no conviene usar:**
  - **Remotion, HyperFrames o GSAP como motor:** serían un segundo motor, y el nuestro ya cumple el mismo contrato. Además Remotion pide licencia paga a empresas de más de 3 personas, y GSAP no es código abierto.
  - **Los looks de fábrica:** brillos, partículas, degradés que se mueven, aberración cromática, vidrio, sacudidas en cada kick, texto centrado. Van contra las reglas del estudio.
  - **El "modo remake" de claude-motion-design** (copiar cuadro a cuadro el anuncio de otra marca) y su consejo de recortar caras generadas "para sacar la marca de agua": van contra §3.2 y contra la regla de las marcas de agua.
  - **Música y efectos sin licencia clara:** Mixkit, Pixabay, temas "sin copyright" y generadores pagos. El MP3 del student kit no tiene licencia confirmada.
  - **Leer el beat del master** cuando falta la batería (varios scripts lo hacen): nuestra regla es solo el stem de batería.
  - **Copiar texto o código de `klik-anim`:** no tiene licencia, así que solo se tomaron ideas.
  - **Las 406 tarjetas del student kit:** sirven de muestrario, pero su licencia propia y su estética (HUD, brillo) no encajan.
- **Licencias:** no se copió código, texto ni archivos de ningún repo. Todo lo construido es propio, con ideas tomadas de ellos; las medidas de la zona segura son el promedio de lo que usan. Si algún día se copia algo MIT, va con su aviso de copyright.
- **Del mapa de `awesome-motion-design-agent-skills`, para mirar:** `greensock/gsap-skills` (MIT), `Orkas-AI/Orkas-VideoStudio` (MIT, 14 skills con un `plan.json`) y `NVIDIA/SkillSpector` (Apache 2.0, revisa paquetes de skills antes de instalarlos).
- **Revisión del código (9 Oct 2026):** una segunda pasada buscó errores en lo construido y se arreglaron los que se confirmaron:
  - Al subir el subtítulo en 9:16 quedaba encima del precio del producto, de los rótulos 3 y 4 y de los nombres del antes / después: esas plantillas ahora terminan arriba del subtítulo (el personaje y las pantallas pueden quedar detrás, como un subtítulo sobre una imagen).
  - En los videos de letra con la letra "Abajo", el aviso de IA y el crédito pisaban la última fila: la letra baja ahora termina arriba de ellos.
  - El tachado de la Contradicción sigue a "Lo que pasa" aunque lo muevas a mano, y el texto no entra en la columna de botones.
  - Cifras con fuente: mira solo lo que la plantilla dibuja, toma también "Cómo se trabaja hoy", entiende "[VERIFY: …]" y "[A VERIFICAR]", "18:00" y "18" son la misma cifra, y "mp3" o "B2B" no son cifras.
  - "0,125" cuenta como decimal; una emoción muy larga ya no frena la voz (se corta).
  - Publicidad: si el anuncio sale entero (sin copiar las piezas), cada pieza se nivela por su lado; una pieza con solo un ruido de fondo no se sube más de 20 dB; las piezas guardadas de antes se hacen de nuevo (los archivos nuevos llevan `.l1.`).
  - Si el control del MP4 falla, tampoco se cambia la portada.
- **Nota:** los primeros commits de esta tanda dicen "idea 33" por error; es esta, la 62.

### 35. Videos de letra: traducir a cualquier idioma y avisar qué falta para sincronizar (4 Oct 2026) — **Construido (4 Oct 2026, "go 35")**
- **Idea (tuya):** "Traducir al español con IA" tiene que poder traducir también al guaraní y a los demás idiomas.
  - Un selector de idioma destino al lado del botón: español, guaraní, inglés, portugués, japonés, coreano, u otro escrito a mano.
  - La IA traduce línea por línea, en el mismo orden, para que cada traducción quede debajo de su línea.
  - **[NOT SURE]** Las IAs traducen peor al guaraní que al español o al inglés: el aviso pide que lo revise alguien que lo hable.
- **Lo que pasó al probar (captura del 4 Oct):** "Seguir → sincronizar" no avanzaba porque faltaba subir la canción, y la pantalla no lo decía.
  - **Arreglo:** al lado del botón, la lista de lo que falta ("Falta: la canción").
- **Rótulos de sección:** los renglones como "Refrain (Grimes):", "Bridge (Hatsune Miku):" o "Chorus (Hatsune Miku):" hoy se muestran como letra. Solo se saltean los renglones entre [corchetes] o (paréntesis).
  - **Arreglo:** saltear también un renglón corto que termina en ":" y empieza con una palabra de sección (Chorus, Verse, Bridge, Refrain, Interlude, Intro, Outro, Estribillo, Verso, Puente…), con un aviso de cuántos se saltearon.
- **Construido:** selector de idioma con "Otro…" para escribir uno, aviso de revisión para el guaraní, "Falta subir la canción" al lado del botón, y los rótulos de sección salteados con su cuenta ("salteé 3 rótulos de sección").

### 34. Anuncios estáticos: analizar una referencia y conceptos de imagen fija (4 Oct 2026)
- **De dónde sale:** dos textos que pasaste:
  - instrucciones de un proyecto, "Direct Response Creative Director", para copiar ("swipe") anuncios de la competencia;
  - dos prompts para que Claude invente anuncios estáticos de e-commerce y escriba sus prompts para Nano Banana Pro.
- **Qué sería en la app:** un tipo de pieza nuevo, **"Imagen fija"**, al lado de historia, explicativo y video de letra. Es una sola imagen: el Malo y el Bueno en un cuadro.
- **Lo que sirve, de más a menos útil:**
  1. **Analizar una referencia ("Analizar un anuncio que funciona").** Subís un anuncio que te gusta, de la competencia o de quien sea, y la IA que mira imágenes (ya la tenemos, idea 30) lo desarma:
     - **jerarquía visual:** cómo está armado, qué se ve primero, qué después y qué al final;
     - **diseño:** colores (en hex), tipo de letra (con serifa, sin serifa, a mano, condensada, gruesa), estilo de imagen (UGC, estudio, de vida diaria, solo producto, ilustración, minimalista), contraste, aire, encuadre;
     - **texto:** todo lo que dice, separado en gancho, promesa y llamado a la acción;
     - **el ángulo:** alivio de un dolor, miedo o urgencia, estatus o identidad, curiosidad, facilidad, autoridad.
     - Sale una **ficha de estructura** que se guarda en la serie como "Referencias".
  2. **Reusar la estructura, nunca el anuncio.** Es la misma regla que ya usamos con el Daily Show (§6 del playbook): se toma la forma (dónde va el gancho, el orden en que se lee, el tipo de promesa). Se cambia todo lo demás: la marca, el producto, las palabras, la imagen y las personas.
     - La imagen de la competencia **no se manda al generador** como referencia, solo su ficha en texto.
     - Su logo, su producto, sus fotos y sus frases nunca aparecen.
  3. **Familias de conceptos** para el menú de temas de una imagen fija. Cada una se mapea a nuestro Malo/Bueno:
     - **antes y después** (ya existe como plantilla `beforeAfter` en los explicativos);
     - **la pesadilla:** el dolor llevado al absurdo, con humor y solo como el Malo, nunca vendiendo miedo;
     - **comparación** y **nosotros contra ellos:** contra el problema o "la forma de antes", nunca contra una marca con nombre ni contra personas (§2.3, regla 3);
     - **gran beneficio**, **razones por qué**, **funciones y beneficios:** solo con lo que está en "Lo que existe hoy";
     - **humor**.
  4. **Prompt con casilleros fijos.** Un orden fijo para el prompt: sujeto/acción → estilo → luz → cámara → composición → colores de la marca → cómo aparece el producto → texto exacto entre comillas, con su letra y su lugar → legibilidad → formato. Encaja con el `look` de la serie y con "un solo momento congelado" (idea 20).
  5. **Mejor que pedirle el texto a la IA:** las IAs de imagen todavía escriben mal letras y acentos. La app puede pedir la imagen **sin texto** y poner el texto encima, con las fuentes y los colores del kit de marca, como ya hace el motor de explicativos. Así la ortografía queda perfecta y se cambia el texto sin volver a generar. La opción "que la IA escriba el texto" queda para quien la quiera.
  6. **Paso 1 / paso 2 de sus prompts:** primero leer la marca y decir qué entendió, después proponer conceptos. Ya es nuestro flujo (serie → brief → menú). Lo que suma: los conceptos salen de la investigación emocional, es decir, de "Cómo se trabaja hoy" y de los dolores de la serie.
  7. **Varias marcas:** si no está claro para qué marca es, preguntar. Ya lo resuelve el selector de serie del brief.
- **Lo que no se usa (choca con las reglas del playbook):**
  - **"No reinventes anuncios ganadores" en el sentido de calcar:** copiar la composición y el texto casi igual puede ser copia del trabajo de otro (derechos de autor y marca). Se usa la estructura, no el anuncio.
  - **Prensa y "como se vio en":** solo si existe de verdad y con el link. Nunca una nota inventada.
  - **Testimonios y reseñas:** solo de clientes reales, con permiso. Si no hay, el concepto lleva `[VERIFY]` y no sale.
  - **Ofertas con urgencia o escasez inventada** ("últimas unidades", "termina hoy"): solo si la oferta es real (§5: no fabricar urgencia).
  - **Miedo, culpa o vergüenza como lo que se vende:** solo como el dolor que el producto saca (Trabajo B).
  - **Números, premios o promesas** que no estén en "Lo que existe hoy".
- **Herramientas:**
  - Ellos usan Nano Banana Pro (Google), Flux Pro, Midjourney v6 e Ideogram.
  - Hoy tenemos perfiles de Grok y uno general. Para sumar una, va su perfil en `server/tools/` con cada línea marcada [DOCS], [NOT SURE] o [TESTED].
  - **[NOT SURE]:** qué tan bien escribe texto cada una hoy, sus formatos (`--ar` es de Midjourney) y precios.
- **Preguntas:**
  1. ¿Querés el tipo de pieza "Imagen fija" (1 a 5), o solo el análisis de referencias para usarlo en historias y explicativos?
  2. ¿El texto encima lo pone la app (recomendado) o lo escribe la IA de imagen?
  3. ¿Qué herramienta de imagen usás para estáticos? ¿Nano Banana Pro?
  4. ¿Para qué serie primero: IMAN o Máshogar?
- **Integrado al playbook (4 Oct 2026, "integralo"):** el análisis de referencias, "la estructura sí, el anuncio no", las familias de conceptos con su versión nuestra, los casilleros del prompt, el texto puesto por la app y lo que no se usa están en `PLAYBOOK.md` §3.2 y en `server/playbook.md`, así la IA ya escribe con ellos. El tipo de pieza "Imagen fija" (1 a 5) sigue esperando "go" y las 4 respuestas.

### 33. Personajes 3D que funcionen con motion graphics (4 Oct 2026) — **A construido (4 Oct 2026, "decidí vos")**; expresiones de A en la idea 64; B (GLB) en parte (6 Oct, commit 1ef70d6: subir GLB, cinco tramos y mandíbula con la voz; falta la cámara que gira, saludar y festejar, y probarlo con un modelo real)
- **Decidido:**
  - camino A, el look 3D como títere;
  - personas adultas, mascotas y objetos que hablan;
  - boca con la voz.
  - B (3D de verdad) queda para cuando haya una herramienta elegida y probada.
- **Construido:**
  - **la hoja "Personaje 3D"** con la vista «Para el títere»;
  - **"Títere 3D" en la tarjeta del personaje**: las capas de Segmentos, su parte y una vista previa animada;
  - **la escena "Personaje 3D"** en los explicativos: respira, parpadea, habla con la boca siguiendo la voz (o el ritmo de la línea si no hay audio), presenta, saluda, señala, festeja o se sorprende, y puede mostrar una pantalla real o el producto;
  - **la IA lo usa** si el elenco tiene un personaje con títere o imagen;
  - **el ejemplo de muestra** lo pone después del gancho.
- **Idea (tuya):** poder crear personajes 3D y usarlos en los explicativos (motion graphics).
- **Dos caminos, de menos a más:**
  - **A. Look 3D, animado como recorte (2.5D):**
    - La app escribe la hoja del personaje con estilo 3D estilizado (como las hojas de Chica/Chico, pero para Grok u otra herramienta de imágenes): de frente, de 3/4, de perfil, 4 expresiones y 4 bocas (cerrada, A, O, E).
    - Con Segmentos de Grok separás cabeza, cuerpo y brazos (como las capas).
    - El motor los mueve como títere: respira, gira la cabeza, parpadea, saluda o señala. La boca sigue la voz (se cambia según el volumen) y la expresión, según la emoción de la línea.
    - Escena nueva **"Personaje"**: el personaje presenta, señala la pantalla real o el producto, o reacciona. Sigue siendo función pura del tiempo, así que anda en la vista previa, la línea de tiempo, el control de calidad y el render final.
    - Barato y rápido; no gira de verdad (solo cambia de vista).
  - **B. 3D de verdad (modelo .glb):**
    - Cargás un modelo 3D con esqueleto. Se hace con herramientas de imagen a 3D (Meshy, Tripo, Rodin…) y se le pone esqueleto y gestos con Mixamo u otra. **[NOT SURE]**: qué hace hoy cada una, sus precios y licencias.
    - La app lo dibuja con three.js dentro del cuadro: gira, la cámara se mueve, gestos como saludar, señalar o festejar, y la boca con la voz si el modelo la trae.
    - Sigue siendo función pura del tiempo: cada gesto se pide en el segundo t.
    - **[NOT SURE]** El render final necesita WebGL en Chrome sin ventana: hay que probar que ande y cuánto tarda.
    - Más trabajo y una herramienta externa más, pero se ve 3D de verdad.
- **Quiénes pueden ser:**
  - personas inventadas (adultas, nunca alguien real ni parecido a alguien famoso);
  - mascotas u objetos que hablan: "The Manager" de IMAN, el paquete de yerba; en Máshogar, los Malos personificados (el Frío, el Desorden, la Humedad) y el producto que llega a salvar;
  - nunca un personaje conocido ni "al estilo de" un estudio con nombre.
- **Se guardan en el elenco de la serie** (como los personajes de hoy), con su hoja, sus partes y, en B, su modelo.
- **Recomendación:** empezar por A, que sirve ya con Grok y el motor actual, y sumar B si querés giros de cámara de verdad.
- **Preguntas:**
  1. ¿A (look 3D como títere), B (3D de verdad que gira) o los dos?
  2. ¿Personas, mascotas u objetos que hablan, o todo?
  3. ¿Boca sincronizada con la voz?
  4. Para B: ¿tenés o querés usar alguna herramienta para hacer el modelo 3D?

### 32. Lo que sirve del repo `latent-spaces/brag` (4 Oct 2026)
- **Qué es:** una skill para agentes (Claude Code, Codex…) que hace un video de lanzamiento de 15–25 s de un proyecto o una web, con música, efectos y texto para publicar. Renderiza con Hyperframes (HeyGen); la versión "slim" lo hace todo con el modelo. Licencia MIT.
- **Ya lo tenemos:** cuadros como función pura del tiempo, render con navegador sin ventana + ffmpeg, grilla de beats, gancho en 2 s, "mostrar la cosa real" (pantallas reales) y nada de lenguaje SaaS genérico. No hace falta Hyperframes.
- **Lo que sirve, de más a menos útil:**
  1. **Portada en el cuadro 0.** Elegir el mejor cuadro "quieto" (texto entero, fuera de una transición), guardarlo como `portada.jpg` y ponerlo como primer cuadro del video. X, Slack y Discord toman el cuadro 0 como miniatura. Va en el render final y en el del navegador; la IA del control de calidad puede elegir el cuadro.
  2. **Tiempo de lectura.** Cada texto quieto en pantalla unos 0,3 s por palabra (un rótulo corto, 0,8 s), contado desde que está entero. Los rótulos y pasos que entran beat a beat a más de 110 bpm no se llegan a leer: uno cada dos beats, o entrar rápido y quedarse todos. Hoy nuestros rótulos pueden entrar cada 0,35 s. Sería un check más (como el de 2–4 s) y un dato más para la IA.
  3. **Cuadros a mitad de transición en la hoja de contactos.** Para ver si dos escenas se pisan feo en el corte.
  4. **Efectos de sonido CC0 (dominio público).** 228 efectos de Kenney y 32 teclas sueltas (3,5 MB), con un análisis de cada uno (brillo, riesgo de sonido chillón, para qué sirve). Reemplazan o suman a los golpes sintetizados: toques, cartas que se deslizan, un "bong" para el logo. Con eso queda una plantilla nueva: **texto que se tipea** con sonido de teclas. Responde en parte al pin de "efectos de sonido" (decisión 8).
  5. **Reglas de efectos:** el golpe va al empezar la animación (0–0,1 s antes), y en los elementos que entran uno tras otro suena el primero y el último, no todos (hoy suena cada uno).
  6. **Texto para publicar.** 1 a 3 frases listas para pegar en X, LinkedIn o Instagram, en el tono de la pieza. Para nosotros, con las reglas del playbook: nada sin verificar ([VERIFY]) y nada de "estamos felices de compartir".
  7. **Golpes fuertes de la música.** Además de los beats, medir cuáles pegan más fuerte (inicio de nota, volumen, graves) y poner ahí los 1 a 3 momentos grandes (el producto, el logo); lo chico, en beats comunes. Sirve para el tema propio. Lo de ellos está en Python; acá iría en el navegador, como `findBeats`.
  8. **Tonos para el explicativo.** Ellos tienen 7 (normal, pulido, parodia de startup, caótico, seco, de tráiler, de App Store), con cantidad de escenas, ritmo, transiciones y efectos por tono. Se podría usar el "Tono" del brief (seco, cálido, absurdo), que hoy no se usa en los explicativos. El "de tráiler, con grandes promesas" choca con la regla de no prometer de más.
  9. **Traer la marca desde una web** (lo más grande): pegar el link del producto y que la app saque colores, fuentes, logo, capturas y textos para el kit de marca y el elenco. En Máshogar, fotos y nombre del producto desde su página. Lo que diga la web va como [VERIFY] hasta que vos lo confirmes en "Lo que existe hoy", y solo con webs de la marca.
- **Lo que no conviene usar:**
  - **La música** (5 temas "Happy Beats / Business Moves" de ende.app): el repo no dice la licencia y su propio README pide verificarla antes de redistribuir. No se copia hasta confirmar los derechos, como con las canciones de los videos de letra.
  - **Hyperframes:** sería un segundo motor de video.
  - **El tono "ridículo / grandes promesas":** va contra el playbook (no inventar números, el chiste es el problema).
- **Si se construye:** se copian solo los efectos CC0 con su aviso de origen (Kenney y unicae_games) y la nota MIT del análisis, en `public/sfx/`.
- **Construido (4 Oct 2026, "go 32: 1 a 5"):** portada en el cuadro 0 (automática, de la IA o tuya; también `portada-*.jpg`), check "Se lee" que bloquea el render, cuadros a mitad de corte en la hoja de contactos, biblioteca de efectos CC0 (18 sonidos en `public/sfx/`) con la plantilla "Texto que se tipea", y efectos al empezar cada movimiento (primero y último en las series). Quedan para otro "go": 6 a 9.
- **Construido (4 Oct 2026, "go 32"): 6 a 9.** Texto para publicar en cada explicativo (editable, con aviso si tiene [VERIFY]); el producto y el logo entran en los golpes fuertes (primer tiempo del compás o los golpes más graves del tema propio) solo si no se pierde lectura; tono Seco / Cálido / Absurdo que cambia los cortes, los efectos y el nivel de la música, y el ritmo que pide la IA; traer la marca desde su web (colores, fuentes de Google Fonts, logo, nombre y frase, y lo que dice como [VERIFY] hasta confirmarlo), solo webs públicas y solo desde la app en esta compu.
- **Integrado al playbook (4 Oct 2026):** las reglas de oficio (gancho, mostrar el producto en uso, tiempo de lectura, transiciones, sonido, portada, texto para publicar, voz → ritmo) están en `PLAYBOOK.md` §3.1 y en `server/playbook.md`, así la IA ya escribe con ellas. Las funciones de la app (1 a 9) siguen esperando "go".

### 31. Motion graphics: videos de letra y videos explicativos
- **Idea (tuya):** videos con motion graphics para dos cosas:
  1. **Videos de letra.**
  2. **Videos que explican**, en series de software (SaaS) o de e-commerce (un producto).
- **La materia prima:**
  - las capas que separa Grok (Segmentos → "Descargar todo");
  - las pantallas reales de la app (IMAN);
  - el producto recortado (Máshogar);
  - íconos y texto.
- **Videos de letra:** las capas de Grok como fondo, con parallax 2.5D (el fondo se mueve menos que el frente) y elementos que entran, laten o se mueven al ritmo.
- **Videos explicativos (formato nuevo en el brief, además de la historia):**
  - **La IA escribe un guion por escenas.** Cada escena tiene el texto en pantalla, qué elementos aparecen y cómo se mueven, y la línea de la voz.
  - **Software (SaaS):** la pantalla real dentro de un celular o una compu, que entra deslizando. Zoom a la función, un círculo o flecha que la marca, un dedo que toca, paso a paso ("cómo se hace X"), siguiendo el loop de la serie.
  - **E-commerce:** el producto recortado al centro, con rótulos que salen de cada detalle (medidas, material, para qué sirve), un antes/después y el precio u oferta si lo cargás.
  - **El check de siempre:** solo se muestra como real lo que está en "Lo que existe hoy"; el resto va como Concepto.
- **Cómo se armaría:**
  - Un motor de animación en la app, el mismo para los dos usos: capas con movimientos (posición, escala, opacidad, giro), curvas suaves, texto animado y cortes al ritmo.
  - Plantillas de escenas: entrada de pantalla, zoom a detalle, rótulos, paso a paso, antes/después, cierre con logo.
  - Se renderiza en el navegador, como hoy.
- **Regla:** las capas nunca se usan para sacar o tapar la marca de agua. El aviso de IA queda si hay imágenes hechas con IA.
- **Respuestas (3 Oct 2026):**
  1. **Plantillas**, y además una **línea de tiempo** para mover cada elemento a mano.
  2. **Voz y música, sí.**
  3. **Duración:** se elige a mano o la decide la IA según el tema.
  4. **Logo y paleta de colores de marca**, por serie.
- **Reglas del estudio de motion (tuyas), y cómo entran en la app:**
  - **Contrato de render:**
    - Cada video es una función pura del tiempo: `seek(t)` pinta el cuadro t. Sin transiciones CSS, sin timers, sin estado entre cuadros.
    - Ruido con semilla (mulberry32), nunca `Math.random`.
    - En la app: el motor dibuja cada cuadro solo con t, como hoy los videos de letra.
    - Final en H.264 yuv420p, CRF 16. El navegador codifica H.264 pero no por CRF exacto, así que habría un render final por `node render.mjs` + ffmpeg en tu compu, y el del navegador queda como vista previa.
  - **Look:**
    - **Prohibido:** título centrado sobre degradé, todo apareciendo con fundido, rótulos en las esquinas y marcos, brillo en la interfaz, explosiones de partículas genéricas.
    - Una fuente de títulos y una de interfaz por serie.
    - Un solo color de acento (de la paleta de marca), salvo que el brief diga otra cosa.
    - Cada 2 a 4 s pasa algo nuevo: es un check que bloquea, como los demás.
    - (Ojo: hoy el video de letra entra con fundido por defecto. Cambiaría ese default.)
  - **Sonido:**
    - Música y efectos sintetizados en código si no subís un tema.
    - Los golpes caen en la grilla de beats medida (`beats.json`, sale de `findBeats`).
    - Volumen final a −14 LUFS.
  - **Loop de calidad antes de mostrar:**
    1. La app arma una hoja de contactos con un cuadro por beat.
    2. La IA la mira y pone notas del 1 al 10 en seis cosas: gancho en los primeros 2 s, lectura en tamaño celular, calidad del movimiento, variedad, fidelidad a la marca y sincronía con el sonido.
    3. Arregla los 3 peores problemas y repite hasta que todo esté en 8 o más (con un tope de rondas para no gastar de más).
    4. Recién ahí, el render completo.
- **Kit de marca por serie** (Editar serie): logo (archivo), paleta (fondo, texto, acento), fuente de títulos y fuente de interfaz.
- **Cómo lo dividiría (cada parte con su "go"):**
  - **A:** kit de marca, motor de motion, plantillas, el formato "Explicativo" en el brief (duración a mano o automática), voz, música sintetizada, −14 LUFS y el check de "algo nuevo cada 2–4 s". Videos de letra con el mismo motor y las capas de Grok.
  - **B:** línea de tiempo para mover cada elemento a mano. **Construido.**
  - **C:** loop de calidad (hoja de contactos y notas de la IA) y render final con ffmpeg (H.264, CRF 16). **Construido.**
- **Preguntas que quedaban** (sin respuesta; se construyó con lo sugerido, se puede cambiar):
  - ffmpeg: `iniciar.sh` lo busca y ofrece instalarlo con Homebrew.
  - Rondas del loop de calidad: 3 como máximo.
  - Fuentes de marca: Google Fonts. Si tenés archivos propios, se pueden sumar.

### 30. Varias claves de IA y un selector de modelo — **Construido (4 Oct 2026, "go idea 30")**
- **Sección Modelos** (el botón con el nombre de la IA, arriba a la derecha): quién escribe (Claude, Kimi, NVIDIA, OpenRouter), el modelo a mano o de la lista en vivo, **Probar**, el esfuerzo de Claude, quién mira las imágenes (otra IA opcional, **Probar con una imagen**) y las claves (también OpenAI y Replicate).
- **Las claves se cargan en la app** y se guardan en `.env` (solo vos podés leerlo); nunca vuelven al navegador, solo los últimos 4 caracteres. La sección solo responde a la app en tu compu.
- **Idea (tuya):** sumar más claves de IA (también la de Anthropic) y una sección en la app para elegir el modelo.
- **Cómo funcionaría:**
  - **Sección "Modelos"** en la app: muestra cada proveedor con clave cargada (✓ o falta) y deja elegir el modelo de una lista.
  - **La lista sale del proveedor:** se pide en vivo (Anthropic tiene una lista de modelos; Kimi, NVIDIA, OpenRouter y OpenAI también) y se puede escribir uno a mano.
  - **Las claves quedan en la compu:** se cargan en `.env` o desde la app, que las guarda en ese `.env` y nunca las muestra enteras. Nunca van a GitHub ni al navegador.
  - **Un modelo por tarea, opcional:** uno para escribir (historia y storyboard) y otro para mirar imágenes (la revisión necesita un modelo que vea).
  - **Opciones según el modelo:** Opus 5.5, Sonnet 5.5 y Fable 5.1 aceptan pensamiento adaptativo y esfuerzo; Haiku 4.5 no, así que la app ajusta el pedido sola.
- **Modelos de Claude hoy:**
  - `claude-opus-5-5`: el de ahora.
  - `claude-sonnet-5-5`: más barato.
  - `claude-haiku-4-5`: el más barato y rápido.
  - `claude-fable-5-1`: el más capaz, más caro.
- **Pendiente (en pausa, "pin"):** qué proveedores querés y si las claves se cargan desde la app o solo en `.env`.

### 29. Realismo: hero still, hojas y prompt de director con tiempos — **Construido (3 Oct 2026; "cinematic" y la emoción en el prompt de Grok, 10 Oct 2026)**
- **Idea (tuya, de un método que viste):** para que el video parezca real, pedir **defectos** y no "cinematic". El prompt para Seedance sirve igual para **Grok**. El método:
  1. **Hero still:** una imagen que fija el look, con cámara, defectos y luz exactos. Es el cuadro 0 del video.
  2. **Hojas de personaje** antes de cualquier movimiento: frente, tres cuartos, perfil, espalda, expresiones y detalles de tela y joyas. Es lo que evita que las caras cambien (idea 28).
  3. **Hoja de lugar:** seis paneles sin gente (exterior, ángulo principal, contraplano, detalles, la vista), para que el lugar coincida desde cualquier ángulo.
  4. **Prompt de director:** un mapa de referencias (qué imagen es cada personaje y cuál es el lugar) y una **toma continua con tiempos** (0,0–0,3 s cuadro fijo; 0,3–3,2 s gancho…), con emoción en cada línea, errores de cámara y reglas duras.
  5. **Generar sin limpiar:** los errores son lo que lo hace real.
- **Las 3 reglas:**
  1. Pedir defectos: poros, grano, pulso que tiembla, foco que se pierde.
  2. La luz nunca cambia; solo cambia la exposición automática de la cámara.
  3. Cada línea con una emoción, no solo las palabras.
- **Cómo entraría en la app:**
  - **Look de la serie (con defectos):**
    - Cámara (ej. compacta digital de los 2000, celular), flash, grano, foco y de dónde viene la luz.
    - Reemplaza el "35mm, cinematic" de hoy y va en todos los prompts.
    - Aviso amarillo si un prompt dice "cinematic" o "vintage".
  - **Hero still por pieza** (o por escena): la IA escribe el prompt, y esa imagen es la imagen inicial del clip en Grok.
  - **Hojas:** de personaje (idea 28) y de lugar (6 paneles, sin gente), guardadas en el elenco fijo como referencia `@`.
  - **Toma continua:** un tipo de toma de 15 s que junta varias líneas en un solo plano, con tiempos y errores de cámara: autofoco que busca, paneo tarde, la exposición que se ajusta.
  - **Mapa de referencias:** al principio del prompt, qué `@` es cada personaje y cuál el lugar, y la regla de que esas imágenes mandan.
  - **Reglas duras en el prompt de video:**
    - Piel nunca lisa.
    - Grano todo el tiempo.
    - Sin estabilizar, sin color grading, sin música, sin texto, sin zoom digital, sin cámara lenta.
    - El diálogo se dice una sola vez, tal cual.
    - El acento (rioplatense).
    - Audio de micrófono de celular.
  - **Emoción por línea:** cada línea de la historia trae su emoción, que pasa al prompt de video (y a la voz de Grok).
- **Lo que sigue igual:** el aviso de IA prendido. Cuanto más real se ve, más importa. Nunca se tapa la marca de agua.
- **Para el perfil de Grok (con "ok"):** que acepta un prompt de director con tiempos y referencias `@`, marcado [NOT SURE] hasta probarlo.
- **Preguntas:**
  - ¿El look con defectos va para todas las series o se elige por serie?
  - ¿La toma continua reemplaza las tomas de una línea, o se elige por pieza?
  - ¿Un hero still por pieza o uno por escena?

### 28. Construcción de personajes: hoja de personaje (chicas y chicos) — **Construido (3 Oct 2026; desde Producción y recorte de la cara, 10 Oct 2026)**
- **Idea (tuya):** un lugar en la app para construir personajes con una **hoja de personaje**, como la de referencia: cuerpo entero de frente, tres cuartos, perfil y espalda, primeros planos de la cara con distintas expresiones, y detalles (collar, manos, tela), todo sobre fondo gris liso. Hay dos plantillas, **chicas** y **chicos**, porque el personaje es parte del gancho que agarra la atención del público.
- **Cómo funcionaría:**
  - **Dónde:** en "Editar serie → Elenco fijo", un botón **+ Personaje con hoja**. También se puede abrir desde un setup en Producción.
  - **Datos:** nombre, plantilla (chica o chico), edad (siempre adulto), pelo, piel, contextura, ropa, accesorios, actitud y su papel en la serie.
  - **La IA escribe:**
    - la línea de identidad (en inglés, la que se repite en todos los prompts);
    - el prompt de la hoja completa para Grok;
    - prompts sueltos por vista, por si Grok no arma bien la grilla.
  - **Se sube la hoja** y queda como imagen aprobada del personaje (`@Ref` en Grok). Se pueden recortar partes, como la cara, para usarlas como referencias aparte (Grok acepta hasta 14).
  - **Revisión:** la revisión de imágenes compara cada toma con la hoja.
- **Reglas:**
  - Solo adultos.
  - Personajes inventados: sin parecido a personas reales ni famosos.
  - Sin poses ni ropa sexualizadas.
  - El aviso de IA sigue prendido.
  - El chiste sigue siendo el problema, nunca el personaje.
- **Preguntas:**
  - ¿Va dentro de cada serie o en un lugar aparte para usar los personajes en varias series?
  - ¿Una sola imagen con la grilla, o una imagen por vista?
  - ¿Rango de edad de cada plantilla?
  - ¿La IA propone el casting según el público de la serie?

### 27. Tercer tipo de serie: Video de letra (lyric video) — **Construido (3 Oct 2026; pulso con el kick y la letra que actúa, 10 Oct 2026)**
- **Idea (tuya):** además de Software y E-commerce, un tipo **Música**: videos de letra para canciones, con fondo orgánico en movimiento y la letra animada con motion graphics, bien mostrada.
- **Es otro flujo:** no hay Bueno contra Malo ni historia. Los pasos serían:
  1. **Canción:** subir el audio y pegar la letra.
  2. **Sincronizar:** cada línea (o cada palabra) con su tiempo.
  3. **Estilo:** fondo, tipografía, animación y colores. Se guardan con la serie, como el estilo de texto.
  4. **Video:** se renderiza en la app, como hoy.
- **Sincronizar la letra (a elegir):**
  - **Automático:** transcripción con tiempos por palabra (OpenAI, la misma `OPENAI_API_KEY`), alineada con la letra pegada.
  - **A mano tocando:** suena la canción y apretás una tecla al empezar cada línea.
  - **Importar un `.lrc`**, si ya tenés la letra sincronizada.
  - En los tres casos, después se puede corregir a mano.
- **Fondo orgánico (a elegir):**
  - **Generado en la app:** gradientes que respiran, manchas de color, ruido suave, partículas. Sin IA, gratis, sin marca de agua; puede latir con la música (`findBeats` ya existe).
  - **Clips de Grok en loop**, con prompts que arme la IA según la letra; se descargan y se suben.
  - **Una foto o un video propio.**
- **Motion graphics de la letra (a elegir):**
  - **Karaoke:** la palabra que suena se ilumina.
  - **Palabra por palabra:** entran una a una, con escala o rebote.
  - **Línea que aparece y se va:** fundido o deslizado.
  - **Palabras clave grandes:** la IA marca las palabras fuertes y salen más grandes.
- **La IA puede proponer:** la paleta y el clima del fondo según la letra, qué palabras destacar y los prompts de Grok.
- **Derechos:** solo canciones propias o con licencia. La app pide confirmarlo antes de exportar, y en el aviso al pie va el crédito de la canción.
- **Elegido:** 2a + 2b, 3a + 3c, 4a + 4c + 4d, los dos formatos. Sumado: letras en guaraní, japonés, coreano y romanizadas, con segunda línea. **Construido** (ver arriba).
- **Preguntas que quedaron:**
  - ¿De quién son las canciones?
  - ¿Cómo querés sincronizar?
  - ¿Qué fondo?
  - ¿Qué animación?
  - ¿Formato vertical, horizontal o los dos?

### 26. Historias que respeten cómo se trabaja de verdad — **Construido (3 Oct 2026); queda cambiar el ejemplo de PLAYBOOK.md con tu "ok"**
- **Qué pasó:** la historia "El cuaderno dice 40. La góndola dice 3." parte de algo que nadie hace: nadie lleva en un cuaderno cuántos paquetes de yerba quedan. En un kiosco real, el dueño o el encargado **mira la góndola** y, según si hay 3, 4 o 20, arma el pedido o no. La historia en realidad era sobre **armar bien el pedido** antes del corte del proveedor, y el título no lo dice. Que los objetos hablen está bien; lo que falla es la **práctica inventada**.
- **De dónde salió:**
  - El título está copiado casi igual del ejemplo del playbook: "Your system says 40 in stock. The shelf says 3." (`PLAYBOOK.md` y `server/playbook.md`, movida "Contradiction"). El escritor tomó el ejemplo como si fuera un dato del negocio.
  - La serie IMAN, en "El Malo", lista "el cuaderno de papel" y "el stock que no coincide con la góndola" (eso lo escribí yo, no vos).
  - La app le pide al título que "plantee la tensión, no la respuesta", y por eso sale críptico.
- **Arreglo propuesto:**
  - **"Cómo se trabaja hoy" en la serie:** una sección nueva en "Editar serie", escrita por vos, con cómo se hace cada cosa hoy sin IMAN. Por ejemplo, "el pedido se arma mirando la góndola" o "el proveedor pasa a tal hora o se le escribe por WhatsApp". El escritor solo puede usar como dolor lo que esté ahí o lo que le cuentes en el brief; no puede inventar una costumbre.
  - **Revisar "El Malo" de IMAN con vos:** sacar el cuaderno y el "stock que no coincide", y poner los dolores reales que vos confirmes.
  - **Los ejemplos del playbook no son datos:** decirle al escritor que los ejemplos del playbook muestran la forma, no hechos del negocio, y que nunca copie sus números ni sus frases. Cambiar ese ejemplo en `PLAYBOOK.md` necesita tu "ok".
  - **Check "¿Pasa así de verdad?":** el escritor marca toda costumbre, horario o herramienta que no esté en la serie o en el brief. Eso bloquea la aprobación, con "Arreglalo" o "No es un problema".
  - **El título es el problema que resuelve (pedido tuyo):** cada tema del menú y cada historia llevan primero un **título del problema**, en palabras simples. Abajo va el gancho, que tiene que entenderse sin contexto. Por ejemplo:
    - **Problema:** "Productos que vencen sin que nadie los vea" · gancho: "¿Por qué el yogur vence siempre un martes?"
    - **Problema:** "Armar el pedido antes del corte del proveedor" · gancho: "Pedir a las 18:10, diez minutos tarde"
    - **Problema:** "La caja que no cierra" · gancho: el que proponga el escritor.
  - El problema se elige de la serie: para IMAN, un paso del loop (abrir, vender, llega el pedido, vence, pedir antes del corte, cerrar la caja, sincronizar, mirar los números). Así cada pieza dice qué parte del día arregla.
  - Se ve en el menú, arriba de la historia (cada ronda), en el storyboard, en `pieza.md` y en el nombre del proyecto.
  - **Kimi más quieto:** `temperature` baja, configurable, para que invente menos.
- **Construido** (ver arriba). Falta que sumes más costumbres reales en "Cómo se trabaja hoy".

### 25. Un storyboard más lindo de ver — **Construido (3 Oct 2026)**
- **Qué pasó:** el storyboard funciona pero se ve poco estético: mucho texto de prompt, pocas imágenes.
- **Ideas (a elegir):**
  - **Viñetas de cómic / tira de película:** cada toma como un cuadro vertical 9:16 con color del momento, la claqueta grande y la línea; los prompts plegados ("ver prompts").
  - **Imagen en la viñeta:** la imagen fija del personaje (del elenco) o un boceto, en vez de texto.
  - **Vista línea de tiempo:** las tomas en fila horizontal, con su largo proporcional (6/10/15 s) y los temas marcados arriba.
  - **Menos ruido:** setups como chips con foto, íconos para transformación / pantalla real / edición, tipografía más grande.
- **Elegido (3 Oct 2026): que se vea como la pieza de contenido terminada**, más cerca del video que de una planilla:
  - **Cada toma es una pantalla de celular 9:16**, como se va a ver en Reels/TikTok/Shorts: adentro, la imagen (la subida, la del elenco o un color del momento si todavía no hay), el headline y el subtítulo dibujados **con el estilo de texto de la serie** (tamaño, color, sombra/contorno/caja), igual que en el video final.
  - **Debajo de cada pantalla, solo lo esencial:** número y título de la toma, quién habla, largo (6/10/15 s) y un ícono si es transformación, pantalla real o edición.
  - **Los prompts y los setups, plegados** ("Ver detalles"); los checks siguen arriba, como ahora.
  - **"Ver la pieza":** un botón que pasa las tomas una tras otra con su largo real y las líneas (un animatic), para sentir el ritmo antes de producir.
  - **Fila de temas arriba:** una banda con los temas y los callbacks, para ver la estructura de la pieza de un vistazo.
- **Pendiente:** el "go".

### 24. Kimi: respuestas vacías
- **Qué pasó:** "Kimi devolvió una respuesta vacía" al armar el storyboard; después funcionó. El "Gancho del momento" es opcional: dejarlo vacío no debería causar esto; lo más probable es que Kimi gastara su límite razonando o que NVIDIA cortara.
- **Arreglo propuesto:** límite de respuesta explícito (`KIMI_MAX_TOKENS`), un reintento automático si viene vacía, leer respuestas que no vienen en streaming y otros campos, un error que diga el motivo, y `KIMI_REASONING_EFFORT` para que piense menos.

### 22. Check de loops: gancho → retención → recompensa, y el loop de la serie
- **Idea (tuya):** un check que revise si la pieza tiene los **loops cerrados** y si cubre lo que promete el **loop** de la serie.
- **Check 1, loops de atención:**
  - **Gancho:** los primeros 1–3 s frenan el scroll (dolor concreto o pregunta).
  - **Retención:** se abren preguntas o tensiones que hacen seguir mirando; la escalada crece.
  - **Recompensa:** **cada loop abierto se cierra** (la pregunta del título se responde; el callback del final paga lo plantado al principio).
  - **Mapa de loops:** cada loop con dónde se abre (toma o línea) y dónde se cierra; los que quedan abiertos, en rojo.
- **Check 2, el loop de la serie:** para IMAN, abrir → vender → Llegó → Vence → pedir → cerrar caja → Sincronizar → el dueño mira los números. Revisa qué pasos aparecen, que el paso en foco se muestre completo (dolor → paso de IMAN → resultado) y que todo lo mencionado esté en "Lo que existe hoy". Cada serie define su loop en Editar serie.
- **Dónde:** en el checklist de la historia y otra vez en el storyboard.
- **Pregunta:** si falla, ¿solo avisa, bloquea la aprobación, o avisa con un botón "Arreglalo" que manda el problema como nota de director? (recomendado: lo último).

### 21. Estilo del texto en el video: tamaño y color
- **Qué pasó:** al generar el video final faltaban controles de texto, y el narrador salió sin audio (no hay voz todavía: ver idea 15).
- **Idea:** en el panel del video, controles para:
  - **Tamaño** del subtítulo (lo que se dice) y del cartel de arriba (texto en pantalla), por separado.
  - **Color** del texto y del fondo o borde que lo hace legible; color del nombre de quien habla.
  - Quizás: posición (arriba / centro / abajo) y tipografía.
  - Vista previa en vivo sobre una toma, y que la configuración quede guardada para la serie (cada marca con su estilo).

### 20. Prompt de imagen = un solo momento congelado
- **Qué pasó:** Kimi escribió un prompt de imagen con tres momentos: el yogur al frente con la etiqueta (estado), la mano de una clienta que lo levanta (acción) y la cara que "now reads indignant" (cambio en el tiempo). Además arrastró "dusty" de otra toma y sumó una clienta sin setup.
- **Regla:** la imagen es **un momento congelado**; las acciones y los cambios van al prompt de video. Palabras como *now, then, after, reaches, lifts, turns* en un prompt de imagen son señal de error.
- **Idea:** poner la regla más fuerte en las instrucciones del storyboard, y que la app marque en amarillo los prompts de imagen con esas palabras ("¿Esto es una acción? Va en el video").
- **Para comparar modelos:** anotar si Kimi respeta estas reglas peor que Claude.

### 19. Claqueta: cada toma con título, resumen y continuidad
- **Qué pasó:** en la toma 7 las imágenes y el video salieron por cualquier lado. La toma 6 era el celular avisando qué vence; la 7 tenía que ser Marta dándose cuenta de que uno se venció y el resto está bien. La tarjeta solo decía "Toma 7 · Setup C · Marta", sin decir qué pasa.
- **Idea (tuya):**
  - **Claqueta** arriba de cada toma, grande y resaltada con el color del momento: "Toma 7 · Marta se da cuenta: uno vencido, el resto bien".
  - **Resumen de la acción** en castellano, escrito por la IA; los prompts de imagen y video tienen que coincidir con ese resumen.
  - **Continuidad:** la IA revisa que cada toma siga a la anterior (6: el aviso → 7: la reacción).
- **Encontrado de paso, un error de historia:** el yogur dice "Yo vencí el martes" (toma 2), el cartel dice "Este se vence mañana" (toma 6) y Marta lo pone "al frente, en oferta" (toma 7). Si ya venció, eso es vender un producto vencido: al revés de lo que resuelve IMAN, y prohibido. El checklist de la historia tiene que detectarlo: **lo vencido se saca; lo que vence pronto se pasa adelante.** Sumarlo como regla en la serie IMAN.
- **Relacionado:** reescribir una toma con una nota hoy no cambia la línea hablada; quizás debería poder hacerlo si la nota lo pide.

### 18. Varios setups y personajes en una misma toma — **Construido (3 Oct 2026; la descripción que llega a todas las tomas, 10 Oct 2026)**
- **Qué pasó:** la toma 7 dice "Setup C · Marta", pero en la escena también están el yogur (setup B) y la heladera (setup A). Hoy cada toma tiene **un solo** setup, así que el prompt describe a los otros de nuevo y Grok los genera distintos: no es el mismo yogur del setup.
- **Idea:**
  - Cada toma lista **todos** los setups que aparecen: personajes y lugar (ej.: Marta + El Yogur + La heladera).
  - Se pueden **editar** a mano: sumar o sacar un personaje o un lugar de la toma, y cambiar la descripción de un personaje (y que el cambio llegue a todas sus tomas).
  - El prompt nombra cada setup como referencia (`@Marta`, `@Yogur`, `@Heladera`) para usar sus imágenes aprobadas (idea 14) en Grok.
- **Mientras tanto, en Grok:** partir de la imagen donde ya está el yogur (toma anterior) y sumar a Marta subiendo su imagen como referencia con `@`, en vez de generar todo de cero.

### 17. La interfaz real de la app en las imágenes y los videos (IMAN y cualquier otra) — **Construido; la transformación hacia la pantalla real, 10 Oct 2026**
- **Idea (tuya):** IMAN es software y tiene su propia interfaz; las piezas tienen que mostrarla, y los prompts tienen que tenerlo en cuenta.
- **El problema:** la IA no puede dibujar la pantalla real de IMAN (inventa botones y textos). Por eso hoy los prompts piden "pantalla en blanco, sin texto".
- **Cómo:**
  - **Tomas de pantalla real:** un tipo de toma nuevo donde la imagen es una captura o una grabación de pantalla real de IMAN, subida por vos, sin IA. Es la movida "Clip Drop" del playbook: mostrar el producto haciendo la cosa, de verdad. Y prueba que la función existe.
  - **Escenas de IA + inserto real:** la IA hace la escena (Marta con el celular, el mostrador) con la pantalla de espaldas o fuera de foco, y la toma siguiente es la captura real a pantalla completa.
  - **Transformación hacia la pantalla real:** en Grok, imagen inicial = la escena de IA con el celular; imagen final = la captura real. El clip "entra" en la pantalla.
  - **Biblioteca de capturas en la serie:** una captura o grabación por función (Vender, Stock, Llegó, Vence, Dueño, cierre de caja), guardada con la serie IMAN como los setups fijos (idea 14). La IA elige cuál va en cada toma.
- **Cuidado:** si Grok anima una captura, puede deformar los textos de la pantalla. Mejor: capturas quietas (con el acercamiento lento de la app) o grabaciones de pantalla reales.
- **Para cualquier app, no solo IMAN (tuyo):** se configura al principio:
  - **En la serie (Editar serie):** una casilla "Es una app / tiene pantalla" y una sección **"Pantallas reales"**: cada pantalla con un nombre, la función que muestra y su captura o grabación subida.
  - **En el brief:** "Usar pantallas reales en esta pieza" (sí/no) y cuáles están disponibles para este episodio.
  - **La IA lo tiene en cuenta:** en las escenas de IA la pantalla va de espaldas o fuera de foco, y pone tomas de pantalla real donde se muestra la función.
- **Pregunta para el final:** ¿tenés capturas o grabaciones de cada función de IMAN, del celular y de la caja?

### 16. Botón para escuchar los prompts en voz alta
- **Idea (tuya):** un botón al lado de cada prompt que lo lee en voz alta.
- **Cómo:** con la voz del navegador (gratis, sin clave). Los prompts están en inglés, así que se leen con voz en inglés; las líneas habladas, con voz en español.
- **Extra:** el mismo botón en "Lo que se dice" sirve para escuchar cuánto dura la línea antes de generar el clip.
- **Pregunta para el final:** ¿es para escucharlos vos, o para dictárselos a Grok por voz?

### 15. ¿Los personajes hablan o no?
- **Qué pasó:** en la toma 2 la línea es de El Yogur ("Yo vencí el martes…"), pero el prompt de video pide "no speech" y el clip sale sin que hable.
- **Cómo es hoy:** la app pide clips sin voz a propósito; quién habla y su línea aparecen como subtítulo con el nombre del personaje. No hay voz todavía.
- **Opciones a decidir:** (a) solo subtítulos, como ahora; (b) que Grok haga hablar al personaje con la línea en español (a probar: si respeta el texto y el acento); (c) voz en off generada aparte y agregada por la app (idea 11); (d) grabar la voz vos y subirla.
- **Inclinación tuya:** capaz grabarla vos. Idea: en cada toma, un botón **Grabar** que muestra la línea y graba con el micrófono (o subir un audio por toma); la app pone la voz sobre su toma, baja el sonido del clip mientras se habla, y ajusta el largo de la toma si la voz dura más.
- **Mientras tanto:** grabar cada línea con el celular y ponerla sobre el video descargado en un editor (CapCut u otro).
- **Pregunta para el final de la sesión.**

### 13. Prompt de edición cuando se repite el setup
- **Qué pasó:** la toma 3 usaba el mismo setup que la toma 2 (B · El Yogur), pero su prompt era para generar de cero y sumaba elementos nuevos (un flan adelante, el yogur más al fondo). Generando de cero, el personaje puede salir distinto.
- **Idea:** si una toma repite el setup de la anterior, la app da además un **prompt de edición**: "Partí de la imagen de la toma N y cambiá solo esto: …" (para editar la imagen en Grok, usarla con `@` o seguir desde el último fotograma). Así se mantiene la continuidad.
- **Relacionado:** la toma duraba 8 s y el recuadro de Grok decía 6 s; ver la idea 6 (largos según Grok).

### 12. Ver la imagen o el clip con un clic
- **Qué pasó:** en Producción, un clic sobre una imagen o un clip ya cargado abre el selector de archivos en vez de mostrarlo.
- **Idea:** el clic lo abre en grande encima de la página (la imagen completa, el clip reproduciéndose con controles); se cierra con Esc o con un clic afuera. Para reemplazarlo: soltar otro archivo encima o un botón "Cambiar" en la esquina. Y un botón "Quitar" para dejar la toma vacía.

## Ideas para IMAN (el producto, no esta app)
- **Etiqueta de oferta imprimible:** desde la lista de "Vence", un toque imprime una etiqueta de oferta en la impresora de tickets ("vence mañana · 30% off"). Salió de la toma 7: la historia mostraba a Marta poniendo una etiqueta de oferta como si la hiciera IMAN, y IMAN hoy no la tiene. Cuando exista, sumarla a "Lo que existe hoy" en la serie IMAN.
- **Mientras no exista:** en las piezas, IMAN avisa qué vence (real) y la etiqueta la hace Marta a mano; o la toma va marcada como "Concepto".
- **Lección para esta app:** la toma 7 estaba marcada "Real / ya existe" mostrando algo que IMAN no hace. El checklist tiene que revisar cada toma contra "Lo que existe hoy", no solo la historia.

## Para anotar en el perfil de Grok (`server/tools/grok-imagine.md`, con "ok")
- [TESTED] Largos de clip: 6, 10 o 15 s (solo esas tres opciones).
- [TESTED] Imagen inicial, intermedia y final en un mismo clip (el ícono del medio es la intermedia); acepta imágenes propias.
- `@` para referenciar imágenes (acepta imágenes subidas).
- Segmentos: cada objeto de la imagen separado y editable; "Descargar todo".
- Eliminar fondo, Relación de aspecto, Crear video.
- 720p y 10 s como valores por defecto en el editor; botón de sonido.
- [TESTED] Panel **Audio**: voces de muestra (Ara, Eve, Leo, Rex, Sal…) y audios propios subidos o grabados, para usar en los videos (ej. la voz de un personaje). El audio solo no se puede descargar. (Sumar al perfil con "ok".)
- Marcar [TESTED] lo que viste vos y [NOT SURE] lo demás.

## Contenido y datos que faltan (no es código)
- **Decidido (11 Oct 2026):** el material de IMAN (funciones al día y capturas) llega cuando IMAN esté terminado. Mientras tanto, se puede empezar por Máshogar.
- **IMAN:** la lista actualizada de funciones ("Lo que existe hoy"). Se edita en la app: Brief → Editar serie.
- **Máshogar:** ✓ nombre con acento y frase "porque el hogar es un sentimiento" (4 Oct 2026, ya en la serie).
- **IMAN:** las capturas de pantalla reales (las pasás después).
- **Prompt "content strategist":** si lo encontrás, pegalo.
- **Episodios de The Daily Show:** seguir sumando resúmenes al playbook (§2.6) para encontrar patrones.

## Decisiones pendientes
- Mergear el PR #1 para que la rama principal tenga todo.
- Kimi: probar la calidad real (rioplatense, callbacks, reglas) y si conviene bajar el razonamiento para que sea más rápido.
- Publicar la app online: hoy no hace falta (corre en tu compu, sin base de datos). Si algún día sí, hace falta un hosting para el servidor de Node.
