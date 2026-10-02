# Ideas para construir

Lista de ideas que fueron saliendo. **Nada de esto está construido.** Se construye solo con "go".
Cada idea dice de dónde salió y qué falta saber antes de hacerla.

## Construido
- **Tanda 1 (2 Oct 2026):** guardar proyectos en carpetas (idea 10), clic para ver con Cambiar/Quitar (12), claqueta y continuidad (19), un momento por imagen con aviso amarillo (20), largos de 6/10/15 s (6), Headline con interruptor (5), estilo de texto por serie (21), check contra "Lo que existe hoy" por historia y por toma, nota que puede cambiar la línea, check de loops con "Arreglalo" y bloqueo (22), loop de la serie editable en Editar serie.

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

### 3. Masogar: el producto recortado
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
- **Masogar:** confirmar cómo se escribe el nombre y su frase de marca.
- **Prompt "content strategist":** si lo encontrás, pegalo.
- **Episodios de The Daily Show:** seguir sumando resúmenes al playbook (§2.6) para encontrar patrones.

## Decisiones pendientes
- Mergear el PR #1 para que la rama principal tenga todo.
- Kimi: probar la calidad real (rioplatense, callbacks, reglas) y si conviene bajar el razonamiento para que sea más rápido.
- Publicar la app online: hoy no hace falta (corre en tu compu, sin base de datos). Si algún día sí, hace falta un hosting para el servidor de Node.
