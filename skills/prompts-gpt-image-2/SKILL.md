---
name: prompts-gpt-image-2
description: Escribe prompts para generar o editar imágenes con GPT Image de OpenAI (GPT Image 2, 2.5 y 2.6, en ChatGPT, la API o webs como APIMart). Usala cuando pidan un prompt para GPT Image o ChatGPT imágenes, una foto realista, un anuncio con texto exacto en la imagen, una edición que cambie una sola cosa sin tocar el resto, o combinar varias imágenes.
---

# Prompts para GPT Image 2 (OpenAI)

Escribís prompts listos para pegar en GPT Image (ChatGPT, la API, APIMart u otra web). El prompt en inglés; la explicación, en castellano rioplatense.

## Antes de escribir

Si falta algo clave, preguntá una vez y corto: para qué es (anuncio, post, primer cuadro de video, diagrama), formato, quién o qué aparece, y si lleva texto. Si no contestan, decidí y decí qué supusiste.

## Qué modelo y qué ajustes

- **GPT Image 2**: el de base. OpenAI hoy recomienda probar **GPT Image 2.6 Flare** (rápido) o **Sunburst** (más calidad) si están disponibles.
- **Calidad**: medium para casi todo; high para texto chico, diagramas o etiquetas. No subas la calidad "por las dudas": cuesta más y no siempre mejora.
- **Tamaños**: 1024x1536 (vertical), 1536x1024 (horizontal), 1024x1024 (cuadrado); en 2.5/2.6 hay tamaños más grandes (hasta 3840 de lado, lados múltiplos de 16, proporción entre 1:3 y 3:1).
- **Fondo transparente**: background transparent con PNG o WebP. Un tablero de ajedrez dibujado no es transparencia: revisalo.

## Cómo se escribe (lo que dice OpenAI)

1. **Definí el resultado**: qué es, para qué se usa (foto, anuncio, diagrama), composición, formato y dónde va cada cosa.
2. **Para pedidos complejos, secciones con etiqueta**: `Scene:`, `Subject:`, `Details:`, `Style:`, `Constraints:`. Para simples, prosa de 2 a 5 oraciones.
3. **Foto real**: pedí explícitamente "a real photograph" / "photorealistic", y describí encuadre, textura y materiales. La cámara y el lente orientan el look, no lo garantizan.
   - Ejemplo oficial: "Shot like a 35mm film photograph, medium close-up at eye level, using a 50mm lens. Soft coastal daylight, shallow depth of field, subtle film grain, natural color balance."
   - Contra el look de IA: "Avoid cinematic lighting, dramatic color grading, or stylized composition. No glamorization, no heavy retouching."
4. **Escenas de noche, lluvia, neón o muy amplias**: describí escala, atmósfera y color; las palabras de "clima" solas no alcanzan.

## Texto en la imagen (el punto fuerte de GPT Image)

- Texto exacto **entre comillas**, cuántas veces aparece, dónde y con qué tipografía.
- Frases que funcionan: `Render the headline exactly once, clearly and legibly.` / `Include ONLY this text (verbatim): "…"`.
- Palabras raras o nombres de marca: deletrealas si hace falta.
- **Siempre revisá la ortografía** (tildes y ñ) antes de usar la imagen. Si la marca tiene tipografía propia, mejor dejar el espacio vacío y poner el texto después.

## Edición

- Patrón: qué cambia (**solo** eso) → lista de lo que queda igual → exclusiones.
  - `In this photo, replace ONLY the white chairs with chairs made of light oak wood. Preserve camera angle, room lighting, floor shadows, and all other objects.`
  - `Remove the flower from the man's hand. Do not change anything else.`
- **Un cambio por vuelta**; pasá la salida como nueva entrada y repetí la lista de "queda igual".
- Si una zona tiene que quedar idéntica al píxel, no confíes solo en el prompt: componé la parte editada sobre el original.
- Varias imágenes: numeralas por función. `Place the dog from image 2 into the setting of image 1.`

## Personajes constantes

- Hacé una imagen de referencia aprobada del personaje y reusala siempre.
- Repetí la línea de identidad completa y agregá: `Do not redesign the character.`
- Para editar sin cambiar a la persona (inventada): `Do not change her face, facial features, skin tone, body shape or identity.`

## Reglas de la casa

- **Solo personas inventadas y adultas.** No se editan fotos de personas reales para ponerlas en otra escena, ni caras de famosos o personajes conocidos, ni "en el estilo de" un artista vivo. Para tomar la escena de una foto real sin la persona, usá la skill escena-de-referencia.
- **Sin marcas ajenas, logos ni personajes con derechos.** OpenAI mismo usa: "No trademarks. No logos. Original character (no copyrighted characters)."
- Cifras, testimonios, prensa o premios sin confirmar: [VERIFY], no se inventan.
- No propongas borrar marcas de agua ni metadatos de IA.

## Cómo entregás

1. El prompt en un bloque de código.
2. En castellano: modelo, tamaño, calidad, qué subir (y en qué orden) y qué revisar (texto, manos, cara).
3. Opcional: una variante B que cambie una sola cosa.

## Ejemplos

Anuncio estático con texto exacto:
```
Scene: a cramped home office at night, a laptop showing a blurred spreadsheet, three empty coffee cups, sticky notes on the monitor edge.
Subject: a man in his forties with a grey beard and reading glasses pushed up on his forehead, rubbing his eyes.
Style: a real photograph shot on a phone, warm desk lamp as the only light, visible grain, no retouching.
Text: in the top third, on the dark wall, render exactly once in bold white sans-serif: "¿Otra vez cerrando caja a las 23?" Clearly legible, no other text.
Constraints: vertical 1024x1536, no logos, no brand names.
```

Edición puntual:
```
In this photo, replace ONLY the empty fridge shelves with shelves fully stocked with plain unbranded yogurt cups. Keep the people, the lighting, the camera angle, the reflections and every other object exactly as they are.
```
