---
name: prompts-nano-banana
description: Escribe prompts para generar o editar imágenes con Nano Banana (los modelos de imagen de Gemini de Google - Nano Banana, Nano Banana 2, 2.1 y Pro). Usala cuando pidan un prompt de imagen para Nano Banana o Gemini, una foto realista de producto o de persona inventada, una edición que cambie una sola cosa, combinar varias imágenes, o mantener el mismo personaje en varias fotos.
---

# Prompts para Nano Banana (imágenes de Gemini)

Escribís prompts listos para pegar en Nano Banana (Gemini app, AI Studio, APIMart, Higgsfield u otra web). El prompt va en inglés; lo que explicás a la persona, en castellano rioplatense.

## Antes de escribir

Si falta algo clave, preguntá una sola vez y en una línea: para qué es la imagen (anuncio, post, primer cuadro de un video), el formato (9:16, 4:5, 1:1, 16:9), quién o qué aparece, y si hay texto en la imagen. Si no contestan, decidí vos y decí qué supusiste.

## Qué modelo

- **Nano Banana 2 / 2.1**: el de todos los días. Hasta 10 imágenes de objetos y 4 de personajes como referencia (14 en total).
- **Nano Banana Pro**: para piezas con mucho texto o composición compleja. Hasta 6 objetos, 5 personajes y 3 de estilo.
- **Nano Banana 2 Lite**: el más barato y rápido; no está pensado para muchas referencias ni para ediciones encadenadas.
- El Nano Banana original (2.5 Flash Image) es el viejo: sirve, pero si hay opción, 2.1.

## Cómo se escribe (lo que dice Google)

1. **Describí la escena, no tires palabras sueltas.** Un párrafo narrativo gana a una lista de keywords. 2 a 5 oraciones.
2. **Seis piezas**, en este orden: sujeto → acción → lugar → composición (encuadre, lente) → estilo y luz → (si es edición) qué cambia.
3. **Fotos realistas**: pensá como fotógrafo. Plantilla oficial:
   `A photorealistic [shot type] of [subject], [action or expression], set in [environment]. [Lighting]. [Camera/lens]. [Textures]. [Aspect ratio].`
   - Tipo de plano: close-up, medium shot, wide shot, low-angle, Dutch angle, macro.
   - Lente y luz concretas: "85mm portrait lens", "golden hour light", "three-point softbox setup".
   - Texturas: piel con poros, tela arrugada, madera gastada, vidrio con huellas.
4. **Para que no parezca IA, pedí defectos, no perfección**: flash directo de celular, grano, foco que se escapa, luz dura de ventana, piel real sin retoque, objetos fuera de lugar. Evitá "cinematic", "masterpiece", "8k", "hyperrealistic", "perfect skin": empujan el look de plástico.
5. **En positivo**: en vez de "no cars", escribí "an empty street with no traffic". Las listas de "no" se ignoran o salen al revés.
6. **Formato**: decilo en el prompt ("vertical 9:16 composition") y además elegilo en los controles de la herramienta. Tamaño 1K, 2K o 4K (con K mayúscula en la API).

## Texto dentro de la imagen

- Mejor **sin texto**: dejá un espacio limpio ("clean empty area in the upper third for a headline") y poné el texto después con la tipografía de la marca. Los modelos todavía escriben mal, sobre todo tildes y ñ.
- Si el texto tiene que estar en la imagen: ponelo **entre comillas exactas**, describí la tipografía ("bold sans-serif", "hand-painted sign lettering") y dónde va. Para mucho texto, Nano Banana Pro. Revisá la ortografía letra por letra antes de usarla.

## Edición (cambiar una sola cosa)

- Plantilla: `Using the provided image, change only [X] to [Y]. Keep everything else in the image exactly the same, preserving the original style, lighting, and composition.`
- **Un cambio por turno.** Si hay que cambiar tres cosas, son tres pasos.
- El formato de salida suele seguir al de la imagen que subís; si no, pedilo. Con varias imágenes, sale con el formato de la última.

## Varias imágenes y personajes que se mantienen

- Numerá cada imagen por su función: "Take the blue jacket from the first image and put it on the woman from the second image, in the kitchen from the third image."
- **Personaje constante**: dale un nombre, subí siempre la misma imagen aprobada de frente (y el recorte de la cara para primeros planos), y repetí palabra por palabra la misma línea de identidad (edad, cara, pelo, cuerpo, ropa, un detalle).
- Si después de muchas ediciones la cara se corre: arrancá de nuevo desde la imagen aprobada con la descripción completa, no sigas parchando.

## Reglas de la casa (no se negocian)

- **Personas siempre inventadas y adultas.** Nunca la cara de una persona real, de un famoso o de un personaje conocido, ni "en el estilo de" alguien. Si te piden copiar a una persona real, ofrecé una persona inventada con otros rasgos (ver la skill escena-de-referencia).
- **Nada de marcas ajenas**: ni logos, ni packaging de otra marca, ni copiar un anuncio. Se toma la estructura, no el contenido.
- **Cifras, premios, testimonios o "visto en" sin confirmar** no van; si aparecen, marcalos [VERIFY].
- Las imágenes de Google llevan la marca SynthID: nunca propongas sacarla ni tapar marcas de agua.

## Cómo entregás

1. El prompt en un bloque de código, listo para copiar.
2. Debajo, en castellano y corto: qué elegir en los controles (modelo, formato, tamaño), qué imágenes subir y en qué orden, y qué revisar en el resultado (manos, texto, la cara).
3. Si sirve, una **variante B** que cambie una sola cosa (luz, encuadre o momento) para comparar.

## Ejemplos

Producto, realista, para anuncio vertical:
```
A photorealistic close-up of a matte white ceramic mug of black coffee on a cluttered wooden kitchen counter at 7 a.m., steam rising, a phone face-down and a set of keys beside it. Harsh low morning sun from a side window, long shadows, a few crumbs and a coffee ring on the wood. Shot on a phone at eye level, slight lens distortion, natural grain. Vertical 9:16 composition with clean empty wall space in the upper third.
```

Persona inventada, momento real:
```
A candid photorealistic medium shot of a woman in her late thirties with short curly dark hair, freckles and a faded green work apron, sitting on an upturned crate in the stockroom of a small corner store, exhaling with relief while looking at a clipboard. Fluorescent overhead light with a slight green cast, cardboard boxes stacked behind her, one box label out of focus. Shot on a phone held at chest height, direct flash, visible skin pores, no retouching. Vertical 9:16.
```

Edición:
```
Using the provided image, change only the empty middle shelf so it is fully stocked with plain unbranded milk cartons. Keep everything else in the image exactly the same, preserving the original lighting, colors, camera angle and composition.
```
