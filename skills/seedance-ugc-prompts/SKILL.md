---
name: seedance-ugc-prompts
description: Escribe prompts de Seedance 2.5 para videos estilo UGC (contenido que parece hecho por una persona con su celular) - testimonio a cámara, unboxing, demo del producto en uso, antes y después, "un día con" - para anuncios y orgánico, con un creador inventado, gancho en los primeros 2 segundos y lip sync con la voz propia. Usala cuando pidan un UGC, un video tipo testimonio, unboxing o creador para Seedance.
---

# Prompts UGC para Seedance 2.5

Esta skill se apoya en `seedance-prompts` (estructura, referencias, lip sync). Acá está lo que cambia para que el video parezca hecho por una persona con su celular, no por una productora.

## Reglas de la casa primero (UGC es donde más se rompen)

- **El creador es inventado y adulto**, siempre. Nunca la cara de un influencer real, de un cliente real ni de alguien "parecido a".
- **Si el creador dice que usó el producto, es una dramatización**: no se presenta como testimonio real. En el anuncio va el aviso de IA ("Personaje hecho con IA") y nada de "clienta real", nombres y ciudades inventados, ni reseñas falsas.
- Lo que el creador afirma del producto sale de lo que el producto hace hoy (la lista "Lo que existe hoy" de la serie o la ficha del producto). Cifras sin fuente: [VERIFY].
- Nada de marcas ajenas a la vista, ni el producto de otro.

## Cómo se ve "hecho con el celular"

- **Cámara**: selfie con el brazo extendido o celular apoyado ("phone propped against a mug"), vertical 9:16, gran angular de celular, leve deriva de mano, autofoco que busca un instante, exposición que se ajusta al moverse hacia la ventana.
- **Luz**: la de la casa (ventana, lámpara, tubo de la cocina), nunca de estudio. Algo de ruido en las sombras.
- **Lugar real y un poco desordenado**: la cama sin hacer, la mesada con cosas, el baño con toallas. Decí qué hay.
- **Persona**: piel real con poros, pelo como está, ropa de entrecasa. Mira a la lente (contacto visual) cuando habla, y se distrae un instante cuando no.
- **Imperfecciones a propósito** (una o dos): se ríe a mitad de frase, se corrige, mueve el celular, aparece una mano, se escucha la calle. No las cinco a la vez.
- Evitá "cinematic", "studio lighting", "commercial", "perfect skin", "smooth gimbal".

## Estructuras que funcionan (una por clip o por secuencia)

1. **Testimonio** (8-15 s): gancho con el dolor en 2 s → qué pasaba → el momento en que cambió (el producto en uso, en cuadro) → cómo está ahora → una sola invitación.
2. **Unboxing** (8-12 s): no muestres todo en el primer segundo; abrí, girá el producto hacia la lente, una reacción honesta.
3. **Demo en uso** (6-12 s): el resultado o el problema primero, después la acción. Mostrar, no explicar.
4. **Antes / después** (6-10 s): mismo lugar, misma luz, cambia una cosa; el "después" puede ir primero como gancho.
5. **"Un día con"** (secuencia de clips cortos): mismos referencias y look, cada clip sigue del anterior (último cuadro como inicio).

## El gancho (primeros 2 segundos)

Dicho y mostrado a la vez. Concreto: un objeto, una hora, un número real. Ejemplos de forma: "Tercera vez esta semana que…", "Si tenés [situación], mirá esto", empezar a mitad de la acción. Nada de "Hola, ¿cómo están?" ni la marca primero.

## Dentro del prompt

- El creador con su línea de identidad y `@Image1` (su imagen aprobada) siempre igual.
- El producto con `@Image2` (foto limpia del producto, sin logos ajenos) y su papel: "@Image2 is the product: keep its shape, colour and size exactly."
- La voz: `@Audio1` con la línea exacta para el lip sync (ver `seedance-prompts`). Sin voz propia, la voz inventada cambia entre clips: no la uses para un creador que vuelve.
- Tiempos `[0-2s]`, `[2-6s]`… con el gancho en la primera ventana.
- `Audio: …, no music. No subtitles.` La música y los subtítulos se ponen después.

## Cómo entregás

1. El prompt en un bloque de código (o varios, si es una secuencia, cada uno con su número de clip).
2. En castellano: qué subir y en qué orden, largo, 480p para probar, y qué mirar (boca contra la voz, manos con el producto, que el producto no cambie de forma).
3. El texto del aviso para el video ("Personaje hecho con IA") si el creador habla de su experiencia.

## Ejemplo (testimonio, 10 s, 9:16)

```
References:
- @Image1 is Lucía (approved front image): keep her face, hair and clothes exactly; reference only.
- @Image2 is the product, a plain white dish rack: keep its shape, size and colour exactly.
- @Audio1 is Lucía's voice for this clip: use it only as the voice.

Vertical selfie video, phone held at arm's length with slight natural drift, small wide-angle distortion. Lucía, a woman in her early thirties with wavy chestnut hair in a loose clip and a grey oversized sweatshirt, stands in a small cluttered kitchen at night, a stack of drying plates behind her.
[0-2s]: she tilts the phone toward the overflowing sink and says, with the lips in sync with @Audio1: "Tercera vez esta semana que lavo con la mesada llena."
[2-7s]: she turns the phone to @Image2 standing on the counter, the plates now lined up in it, and keeps talking in sync with @Audio1, a quick laugh mid-sentence.
[7-9s]: back to her face, she looks into the lens, relieved, no smile while speaking, a small smile after.
Warm ceiling lamp, the light never changes; autofocus hunts for a moment when the phone moves. Real skin with pores, no retouching. Audio: kitchen room tone, a plate clinking, no music. No subtitles.
```
