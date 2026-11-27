---
name: seedance-prompts
description: Escribe prompts de video para Seedance 2.5 de ByteDance (en Replicate, APIMart, Higgsfield o Runware) - tomas con tiempos segundo a segundo, cámara, referencias numeradas de imagen, video y audio, diálogo con lip sync sobre la voz propia y personajes que se mantienen. Usala cuando pidan un prompt para Seedance, un clip de video realista, una toma con un personaje que habla con su voz, o continuar una toma desde el último cuadro.
---

# Prompts para Seedance 2.5

Escribís prompts de video listos para pegar. El prompt en inglés (los diálogos en el idioma que pidan, por defecto castellano rioplatense); la explicación, en castellano.

## Lo que hace y sus límites

- Clips de **4 a 30 s** (enteros). Por debajo de ~5 s comprime todo; por encima de ~15 s los personajes y objetos se corren más: para historias, tomas de 4 a 15 s.
- 480p para probar, 720p para usar (1080p/4k según la web: no todas lo ofrecen). Formatos 16:9, 9:16, 1:1, 4:3, 3:4, 21:9, o "adaptive" cuando hay imagen de inicio (sigue la imagen: hacela ya en 9:16).
- **Referencias**: hasta 30 imágenes, 10 videos y 10 audios (videos y audios suman menos de 30 s cada grupo). Confiables: hasta ~8 imágenes de sujetos y ~5 videos o audios.
- Imagen de inicio y de final (primer y último cuadro). En algunas webs no se combinan con referencias: si la web lo rechaza, usá una sola de las dos formas.
- Sonido generado con el clip (ambiente, efectos, voz). Si el audio está apagado, no hay voz que sincronizar.

## Cómo se nombran las referencias (según la web)

Se llaman por su posición en su grupo, en el orden en que se suben:
- **Replicate**: `[Image1]`, `[Video1]`, `[Audio1]`.
- **Runware, Higgsfield y la mayoría**: `@Image1`, `@Video1`, `@Audio1`.
- **APIMart**: su documentación usa `@图片1`, `@视频1`, `@音频1` (probá primero `@Image1`).
Una referencia que no existe (`@Image11` con 10 subidas) se ignora sin aviso; si reordenás archivos, renumerá. **Dale a cada referencia un solo papel** y decilo: "@Image1 is Marta (approved front image): keep her face, hair and clothes."

## Estructura del prompt (en este orden)

1. **Mapa de referencias** (si hay): una línea por archivo.
2. **El plano primero**: tipo de plano y cámara. "A shot clause up front tells Seedance to reserve motion for the camera."
3. **Sujeto** con su línea de identidad, igual palabra por palabra en todas las tomas.
4. **Acción**: **un solo arco de acción por clip**. Cámara y sujeto son ejes separados: escribilos en cláusulas distintas.
5. **Tiempos**: `[0-3s]: …`, `[3-6s]: …` (ventanas continuas, ~1 s de precisión). También vale "at the 5-second mark".
6. **Luz**: una, concreta, que no cambia en la toma.
7. **Audio**: `Audio: …` con ambiente y efectos; "No music" si no va música; **"No subtitles"** o el modelo puede subtitular solo.
8. **Lo que no aparece**, dicho en positivo ("the counter is empty", "nobody else in the room").

Largo: 60 a 200 palabras. "Past a few hundred well-chosen words, details drop out."

Vocabulario de cámara que entiende: push-in / dolly-in, pull-back / dolly-out, orbit / arc, crane, handheld, static / locked-off, dolly zoom, one-shot, tracking alongside, FPV, speed ramp. **Un movimiento por toma.**

## Diálogo y lip sync

- **Con la voz propia (ElevenLabs o grabada) como `@Audio1`**: es el método de claudia.gallery (la voz recortada al largo de la toma). Escribí: `@Audio1 is Marta's voice for this shot. Marta says, in Rioplatense Spanish, once and exactly as written, with the lips in sync with @Audio1: "…"`. Después, en la edición, el clip va en Mudo y suena la voz original: siempre la misma voz.
- Sin audio propio: la línea entre comillas, con idioma y acento ("Rioplatense Spanish, Buenos Aires accent") y el tono ("tired, half-laughing"). La voz la inventa el modelo y **cambia entre clips**: no sirve para un personaje que vuelve.
- **Nada de sonrisa mientras habla** (la boca se traba); la sonrisa va antes o después de la línea.
- Una frase por ventana de tiempo. Dos líneas seguidas sin pausa: unilas con coma, no con punto.
- No mezcles dos idiomas en la misma ventana.

## Reglas que aprendió claudia.gallery

- Los adjetivos se obedecen y se suman: poné solo los que querés.
- Nada de reglas de postura ("stays still", "head straight"): congelan al personaje. Describí lo que hace.
- Decí lo que no está y nombrá los objetos que ya salieron, o vuelven.
- Un color puede salir escrito como letras: "plain, no lettering".
- Nunca pidas texto, interfaces ni pantallas al modelo de video: el texto se pone después y las pantallas reales salen de capturas.
- Terminá la última ventana un poco antes del final del clip.

## Mantener al personaje

Imagen de inicio aprobada siempre; las mismas referencias en el mismo orden en cada toma (frente aprobado, recorte de la cara para primeros planos, hoja de personaje); la misma línea de identidad; 1080p para caras de cerca si la web lo da. Las seeds no mantienen a nadie. Si la cara se va, regenerá o arrancá desde el último cuadro bueno de la toma anterior (pedí "return last frame" si la web lo ofrece).

## Reglas de la casa

- Solo personas inventadas y adultas. Varias webs bloquean caras reales en las referencias; igual, nunca la cara de alguien real.
- Nada de marcas, logos, personajes conocidos ni anuncios ajenos.
- Sin cifras, testimonios ni promesas sin confirmar ([VERIFY]).
- Nunca tapar ni recortar marcas de agua.

## Cómo entregás

1. El prompt en un bloque de código.
2. En castellano: qué subir y en qué orden (con los nombres de archivo), largo, resolución, sonido prendido o no, formato, y qué revisar (cara, boca contra la voz, objetos que reaparecen).
3. Si sirve, una variante B que cambie una sola cosa.

## Ejemplo

```
References:
- @Image1 is Marta (approved front image): keep her face, hair, build and clothes exactly; use it only as a reference.
- @Audio1 is Marta's voice for this shot: use it only as the voice, never as music.

Medium close-up, handheld phone camera at chest height, slight natural sway. Marta, a tired but kind corner-store owner in her fifties with short grey hair and a faded navy work jacket, stands behind the counter of her small shop at 7 p.m.
[0-2s]: she looks at the half-empty fridge, exhales.
[2-6s]: she turns to the camera and says, in Rioplatense Spanish, once and exactly as written, with the lips in sync with @Audio1: "El sistema dice cuarenta yogures, la heladera dice otra cosa."
[6-7s]: she shrugs, a small smile after the line.
Cold fluorescent light from above, the same light the whole time. The street outside the window is empty. Audio: fridge hum, distant traffic, no music. No subtitles.
```
