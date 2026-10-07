# Ideas para construir

Lista de ideas que fueron saliendo. **Nada de esto está construido.** Se construye solo con "go".
Cada idea dice de dónde salió y qué falta saber antes de hacerla.

## Construido
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

## Revisión general de la app (7 Oct 2026)

Recorrí la app entera: flujo Brief → Menú → Historia → Storyboard → Producción, los checks, el motor de explicativos
(`src/lib/motion.ts`, `shared/motion.ts`, `motionAudio.ts`, `motionProject.ts`, `render.mjs`), el Reloj de letras
(`shared/clock.ts`, `syncDraw.ts`, `server/sync.ts`), el render de video y la sección nueva de Publicidad. Lo que sigue
son hallazgos y propuestas, numeradas para seguir con la lista. **Nada está construido:** se construye con "go".

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

#### 44. Los explicativos con tema propio leen los beats del master
- **Qué pasa:** `motionBeats` usa `findBeats(track)` (picos de volumen general) cuando hay un tema subido, y
  `strongBeats` aproxima los graves con un pasabajos. Es justo lo que la regla de las dos relojes prohíbe para el
  Reloj: "nunca lee picos del master". Un hat o una voz fuerte cuentan como beat y los cortes caen ahí.
- **Arreglo:** cuando el explicativo lleva un tema, pasar por el mismo camino del Reloj: stem de batería (Demucs
  si está, o el stem que subas) → `fitKicks` → `grid.kicks` para pegar escenas y `downbeats` para el producto y
  el logo. Sin stem, avisar y quedarse con la partitura sintetizada (que ya tiene grilla exacta). `findBeats`
  queda solo para los cortes de las historias, como dice CLAUDE.md.

#### 45. Pegar escenas a los beats puede dejar la siguiente demasiado corta
- **Qué pasa:** `snapWith` mueve el corte al beat si la escena actual queda con 1,5 s o más, pero en el camino
  común no revisa que la **siguiente** escena también quede con 1,5 s (solo lo revisa en el camino de los golpes
  fuertes). Dos escenas cortas seguidas pueden quedar en 1,1 s y pisarse con su voz.
- **Arreglo:** la misma condición en los dos caminos, y si no se cumple, probar el beat anterior antes de dejar el
  corte donde estaba.

#### 46. La voz que no entra solo avisa
- **Qué pasa:** si la voz de una escena dura más que la escena, el carril de voz se pone rojo y la mezcla sigue
  sonando sobre la escena siguiente (la música no vuelve a subir hasta que la voz termina), pero el subtítulo ya
  cambió.
- **Arreglo:** botón "Ajustar al largo de la voz" (la escena pasa a durar voz + 0,4 s, redondeado al beat) y, en el
  render, cortar la voz con un fundido de 80 ms en el fin de la escena si la persona prefiere no alargar.

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

#### 48. Dos copias del playbook que se desvían
- `PLAYBOOK.md` (investigación) y `server/playbook.md` (lo que lee la IA) se mantienen a mano y ya difieren en
  estructura. **Propuesta:** un script `npm run playbook` que arma `server/playbook.md` a partir de las secciones
  operativas de `PLAYBOOK.md` (§1, §3, §3.1, §3.2, §5, §6) y un check en `typecheck`/CI que falla si el archivo
  generado no coincide con el guardado.

#### 49. Pruebas y CI
- Hoy no hay pruebas (solo `clock-check.ts`). Toda la lógica pura está en `shared/` y se prueba sin navegador:
  `checks.ts`, `motion.ts` (`snapScenes`, `readingIssues`, `quietGaps`, `posterTime`), `clock.ts`, `lyrics.ts`
  (`alignLyrics`, `splitLyrics`), `ads.ts`. **Propuesta:** `node --test` con `tsx` en `tests/`, y un workflow de
  GitHub Actions con `typecheck`, `build`, las pruebas y `clock-check`. Las pruebas de Publicidad que corrí en esta
  sesión ya sirven de arranque.

#### 50. El paquete del navegador pesa 1,9 MB
- `three`, `mediabunny` y los tres estudios cargan juntos aunque se abra solo el brief. **Propuesta:** `import()`
  dinámico para `MotionStudio`, `LyricStudio`, `AdsStudio` y el actor 3D; `three` solo cuando hay un rig. La
  primera pantalla pasa a cargar en una fracción.

#### 51. Archivos de más de mil líneas
- `App.tsx` (1455), `MotionStudio.tsx` (1428), `LyricStudio.tsx` (1604), `SeriesEditor.tsx` (1150),
  `ScriptView.tsx` (1023). **Propuesta:** sacar de `App.tsx` el autoguardado y la carga de medios a un hook
  `useProject`, y la producción a `ProductionView`; en los estudios, separar la vista previa (reloj, canvas) de los
  paneles. Sin cambiar comportamiento; antes, las pruebas de la idea 49.

#### 52. Costo de los prompts
- El bloque fijo del escritor son ~2.900 palabras (motor + playbook) más el perfil de la herramienta (~1.300) y la
  biblia de la serie (~600) en cada pedido. Con Claude el bloque fijo va cacheado; con Kimi, NVIDIA y OpenRouter se
  paga entero cada vez. **Propuesta:** medir tokens por pedido en Modelos ("este pedido costó ~X tokens"), y
  recortar `server/playbook.md` a las reglas que de verdad cambian la escritura (las tablas de evidencia y las
  fuentes no hacen falta en el prompt).

#### 53. Errores que no dicen qué faltó
- Un pedido que no pasa el esquema responde "Al pedido le faltaban datos." sin decir cuál. **Propuesta:** incluir
  el primer camino del error de zod ("falta `brief.series`"), que ayuda cuando un proyecto viejo trae un campo
  cambiado.

#### 54. Publicidad: lo que sigue
- Voz por pieza: `media.voice` ya existe en el esquema pero la tarjeta no la sube ni la genera. Sumar "Voz
  generada" con `/api/voice` y la voz del presentador del perfil.
- "Probar un anuncio": antes de la tanda, elegir un hook, un meat y un CTA y ver el anuncio armado en la app.
- Reforzar el límite semanal del lado del servidor (hoy lo controla la pantalla).
- Métricas por API de la plataforma, cuando haya cuenta: hoy es CSV.
- Las piezas se renderizan en el formato que da el navegador (mp4 en Chrome de escritorio, webm sin H.264); los
  anuncios salen siempre mp4. Avisar en la tarjeta qué codec quedó en caché.

### Playbook al máximo

#### 55. Las jugadas (§2.5) como dato de cada tema
- Hoy la historia no dice qué jugadas usa. **Propuesta:** cada tema devuelve `moves` (Clip Drop, Contradicción,
  Reacción lenta, Escalera, Giro, Botón, Brecha de curiosidad, Visita de campo, Callback, Corresponsal) y la app
  muestra una fila de chips por tema y una **cobertura por pieza**. El check suma "Sin Giro" (el Momento emotivo ya
  está) y "Sin Botón que vuelva al gancho". Con tres o cuatro piezas, la pizarra de la serie ve qué jugadas se
  repiten de más.

#### 56. Cinco variantes de gancho por historia (§3)
- El playbook pide entregar 5 ganchos por guion y la app entrega uno. **Propuesta:** botón "5 variantes de
  gancho" en la historia (cada una con su jugada), elegir la que va, y **"Mandar las 5 a Publicidad"**: entran al
  catálogo de hooks con su nivel. Es el puente natural entre el contenido orgánico y el 50-5-3.

#### 57. El registro de episodios (§2.6) desde la app
- Hoy los resúmenes de episodios se pegan a mano en `PLAYBOOK.md`. **Propuesta:** un panel "Episodios estudiados":
  pegás el resumen, la IA lo vuelca en la plantilla EP-NN (tabla de temas, callbacks, observaciones), lo agrega al
  playbook con tu "ok" y, cuando una jugada se repite en 3 o más episodios, propone sumarla a `engine.md`.

#### 58. La lista de control del playbook (§7.4) como checks explícitos
- Faltan como ítems: "El cliente es el héroe" (la marca no abre la pieza), "Un solo llamado, suave", "Nada
  prestado" (nombres de programas, frases), "Detalle concreto" (objeto, número u hora en el gancho). Para video:
  "Gancho en 2 s" (la primera toma dura 6 s y su línea nombra el dolor) y "El producto en uso" (al menos una toma de
  pantalla real o producto en el Bueno). Entran en `STORY_CHECKS` y `BOARD_RULES` y la app los muestra como los
  demás.

#### 59. Un corresponsal fijo por serie y el formato "Visita de campo"
- "The Manager" de IMAN aparece en el playbook pero no en el elenco. **Propuesta:** en el brief, "Formato: escritorio /
  con corresponsal / visita de campo" (§2.4 y §4), y el corresponsal como personaje fijo con su voz, que el escritor
  usa para la escalada y el regreso al problema real.

#### 60. Ganchos de calendario por serie
- El brief tiene "un momento que el público ya siente", pero se escribe cada vez. **Propuesta:** una lista de
  fechas y momentos por serie (día de inventario, primera semana de frío, el 1 del mes) en Editar serie; el menú y
  los hooks de Publicidad la leen, y la app sugiere el más cercano.

#### 61. Imagen fija (idea 34) también para Publicidad
- Con el Método 50-5-3 construido, el tipo de pieza "Imagen fija" tiene un uso más: el anuncio estático sale de un
  hook aprobado (su titular en pantalla y su prompt de imagen) con el texto puesto por la app. Sigue esperando
  "go" y las 4 respuestas de la idea 34.

### Si tuviera que elegir el primer "go"
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

### 10. Guardar proyectos — PRIORIDAD ALTA
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

### 33. Personajes 3D que funcionen con motion graphics (4 Oct 2026) — **A construido (4 Oct 2026, "decidí vos")**
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

### 29. Realismo: hero still, hojas y prompt de director con tiempos
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

### 28. Construcción de personajes: hoja de personaje (chicas y chicos)
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

### 27. Tercer tipo de serie: Video de letra (lyric video)
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

### 26. Historias que respeten cómo se trabaja de verdad
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

### 25. Un storyboard más lindo de ver
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

### 18. Varios setups y personajes en una misma toma
- **Qué pasó:** la toma 7 dice "Setup C · Marta", pero en la escena también están el yogur (setup B) y la heladera (setup A). Hoy cada toma tiene **un solo** setup, así que el prompt describe a los otros de nuevo y Grok los genera distintos: no es el mismo yogur del setup.
- **Idea:**
  - Cada toma lista **todos** los setups que aparecen: personajes y lugar (ej.: Marta + El Yogur + La heladera).
  - Se pueden **editar** a mano: sumar o sacar un personaje o un lugar de la toma, y cambiar la descripción de un personaje (y que el cambio llegue a todas sus tomas).
  - El prompt nombra cada setup como referencia (`@Marta`, `@Yogur`, `@Heladera`) para usar sus imágenes aprobadas (idea 14) en Grok.
- **Mientras tanto, en Grok:** partir de la imagen donde ya está el yogur (toma anterior) y sumar a Marta subiendo su imagen como referencia con `@`, en vez de generar todo de cero.

### 17. La interfaz real de la app en las imágenes y los videos (IMAN y cualquier otra)
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
- **IMAN:** la lista actualizada de funciones ("Lo que existe hoy"). Se edita en la app: Brief → Editar serie.
- **Máshogar:** ✓ nombre con acento y frase "porque el hogar es un sentimiento" (4 Oct 2026, ya en la serie).
- **IMAN:** las capturas de pantalla reales (las pasás después).
- **Prompt "content strategist":** si lo encontrás, pegalo.
- **Episodios de The Daily Show:** seguir sumando resúmenes al playbook (§2.6) para encontrar patrones.

## Decisiones pendientes
- Mergear el PR #1 para que la rama principal tenga todo.
- Kimi: probar la calidad real (rioplatense, callbacks, reglas) y si conviene bajar el razonamiento para que sea más rápido.
- Publicar la app online: hoy no hace falta (corre en tu compu, sin base de datos). Si algún día sí, hace falta un hosting para el servidor de Node.
