---
name: omni-prompts
description: Escribe prompts de video para Gemini Omni de Google (Omni Flash 1.1 y 1.2, en Gemini, Flow, AI Studio, Runware o APIMart) - plano, acción, lugar, cámara, luz y sonido, tiempos con timecodes y "Cut to", diálogo, referencias de imagen o video, primer y último cuadro, y extender un clip. Usala cuando pidan un prompt para Gemini Omni u Omni Flash, o un clip de video de Google que no sea Veo.
---

# Prompts para Gemini Omni (Omni Flash)

Prompts de video listos para pegar. El prompt en inglés; los diálogos en el idioma pedido; la explicación, en castellano.

## Lo que hace y sus límites (Omni Flash 1.2)

- Clips de **3 a 15 s** solo con texto o con un primer cuadro; **3 a 10 s** con primer y último cuadro o con referencias. Extender: suma 3 a 10 s a un clip de hasta 27 s.
- **Solo 16:9 o 9:16**, en 360p, 720p, 1080p o 4K.
- **Referencias**: hasta 10 imágenes y hasta 3 videos (mejor uno). Del video de referencia toma solo la imagen, no el sonido.
- **Primer/último cuadro y referencias son modos separados**: no se mezclan en el mismo pedido.
- No hay parámetro de audio ni prompt negativo: **el prompt decide todo**. Sin dirección, el modelo elige la cámara y puede cortar solo.
- Las referencias de voz propias están cerradas (solo con permiso de Google): **no sigue tu audio**. Para que un personaje hable con tu voz, Seedance o una pasada de lip sync aparte.

## Estructura (seis capas, en este orden)

1. **Sujeto** (con su línea de identidad).
2. **Acción**.
3. **Lugar**.
4. **Cámara**: plano y movimiento en la misma oración. Si es una sola toma: "single continuous shot, no scene cuts".
5. **Luz**.
6. **Audio**: en oraciones aparte. Música con género y ánimo, o "No music"; ambiente "in the background"; "No subtitles".
Lo que no se pide queda a criterio del modelo.

## Tiempos y cortes

- Timecodes, **uno por línea**:
  ```
  [0-3s] Wide shot of …
  [3-6s] Close-up of …
  ```
- O en palabras: "After three seconds, cut to …", "For the last two seconds, cut to …".
- Google Cloud recomienda **una escena por clip**: encadenar A, B y C en un prompt suele salir confuso. Para piezas largas, varios clips.
- Con imagen de inicio: la imagen ya trae sujeto, lugar y estilo; **describí solo el movimiento**, no la vuelvas a describir.

## Cámara (vocabulario que entiende)

Static / locked-off / fixed, push in, punch in, pan, tilt, dolly in/out, truck, crane, handheld, whip pan, arc shot, dolly zoom, "one continuous shot". Looks de dispositivo: "natural smartphone zoom", "webcam style", "film camera". Ángulos: eye-level, low-angle, high-angle, over-the-shoulder, POV. Un movimiento por toma.

## Diálogo

- Nombrá a quien habla y la línea después de "says to the camera:". Que entre en el clip (dos oraciones cortas en 8 s).
- Las guías no coinciden en las comillas: Google Cloud recomienda **dos puntos sin comillas** ("the woman says: My name is Clara") para que no aparezca escrito en pantalla; Runware usa comillas. Si aparece texto en pantalla, probá sin comillas.
- La voz la inventa el modelo: decí idioma, acento y tono ("in Rioplatense Spanish, warm and unhurried"). Cambia entre clips.
- Voz en off: decí de quién es y que la persona en cuadro "does not speak".

## Lo que no se quiere

Google Cloud sugiere no usar "no"/"don't" sino describir lo que se evita como lista; Runware usa oraciones ("No on-screen text."). Lo seguro: describir en positivo lo que sí hay ("an empty counter") y cerrar con "No subtitles. No on-screen text." Probá y anotá qué funcionó en el Banco de pruebas.

## Mantener al personaje

Una referencia de imagen aprobada (o creada con Nano Banana) por personaje, con nombre; la misma descripción fija pegada igual en cada prompt (edad, cuerpo, pelo, cara, ojos, marcas, ropa); varias tomas y quedarse con la mejor.

## Reglas de la casa

- Solo personas inventadas y adultas; nunca una cara real ni un personaje conocido.
- Sin marcas, logos ni anuncios ajenos. Sin cifras ni testimonios sin confirmar ([VERIFY]).
- No le pidas texto ni pantallas de una app al modelo: el texto se pone después y las pantallas salen de capturas reales.
- Nunca tapar marcas de agua (Google pone SynthID).

## Cómo entregás

1. El prompt en un bloque de código.
2. En castellano: modo (solo texto, primer cuadro, referencias), largo, formato (9:16), resolución, qué subir, y qué revisar (cortes que no pediste, texto en pantalla, la cara).
3. Opcional: variante B con un solo cambio.

## Ejemplo

```
A woman in her late thirties with short curly dark hair and a faded green apron restocks a fridge in a small corner store at closing time. Single continuous shot, no scene cuts: medium shot at eye level, slow push in toward the fridge door. Cold fluorescent light from above.
[0-3s] She lines up the last yogurt cups on the middle shelf.
[3-6s] She steps back, looks at the full shelf and exhales.
[6-8s] She says to the camera, in Rioplatense Spanish, tired but relieved: Por fin cierra.
Audio: fridge hum and street noise in the background. No music. No subtitles. No on-screen text.
```
