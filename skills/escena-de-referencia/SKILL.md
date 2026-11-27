---
name: escena-de-referencia
description: Mira una foto real de referencia (por ejemplo una persona haciendo una pose en un lugar) y escribe un prompt de imagen que recrea la escena, la pose, el encuadre, la luz y el realismo fotográfico, pero con una persona inventada y adulta de rasgos claramente distintos - nunca la identidad de la persona de la foto. Usala cuando adjunten una foto y pidan "hacé un prompt para recrear esta foto", "algo así pero con otra persona" o "copiá la vibra de esta imagen".
---

# Escena de referencia → prompt con otra persona

Se copia **la realidad alrededor**, nunca **la identidad**. Respondés en castellano; el prompt, en inglés.

## Primero, tres chequeos (en una línea cada uno, solo si aplican)

- **Si la persona de la foto es famosa, conocida o claramente identificable** (una celebridad, un influencer, alguien de una campaña conocida): avisá que no se recrea su imagen ni algo "parecido a" ella, y ofrecé la escena con una persona inventada muy distinta.
- **Si la foto es una pieza conocida** (una campaña famosa, una portada, una foto artística reconocible): se toma la estructura (pose, encuadre, luz), no la composición exacta ni sus elementos distintivos.
- **Si aparece un menor**: la persona inventada es siempre adulta, y en escenas íntimas, de dormitorio o con poca ropa, no se hace.

## Paso 1 · Leé la foto (y escribilo, corto, en castellano)

- **Plano y cámara**: tipo de plano, altura y ángulo, lente aparente (gran angular de celular, 35 mm, 85 mm), si es selfie, espejo, trípode o alguien sacando la foto; profundidad de campo; formato.
- **Pose y gesto**: posición del cuerpo, manos, mirada (a cámara o no), expresión **genérica** (relajada, riéndose), lo que hace.
- **Lugar**: qué es, qué objetos hay, el desorden o el orden, la hora aparente.
- **Luz**: de dónde viene, dura o suave, color, flash o no, sombras.
- **Ropa como tipo**: prenda, color, textura, calce — **sin logos, marcas ni estampas reconocibles**.
- **Look de foto**: celular o cámara, grano, ruido, desenfoque, retoque o no, colores.

## Paso 2 · Inventá a la persona nueva

Cambiá **a propósito** todo lo que identifica: rostro, forma de cara, nariz, ojos, cejas, boca, tono de piel, pelo (color, largo, textura, peinado), edad aparente (siempre adulta) y contextura. Tiene que ser **otra persona**, no un parecido ni una "versión". Escribila como una línea de identidad para poder repetirla igual:

`A woman in her early forties with a round face, olive skin, short wavy black hair with grey streaks, thick eyebrows and a small scar on her chin, medium build.`

**Nunca** copies: tatuajes, lunares, cicatrices, piercings, accesorios distintivos, ni la misma combinación de rasgos de la persona de la foto. Si la persona trae algo muy distintivo (un tatuaje grande), la nueva no lo tiene.

## Paso 3 · Escribí el prompt

Orden: persona nueva (su línea de identidad) → pose y acción → lugar y objetos → ropa (tipo, sin marcas) → luz → cámara y encuadre → look de foto con defectos reales → formato.

- Descripción narrativa (no lista de palabras).
- Realismo con defectos, no con "cinematic": flash de celular, grano, foco que se escapa, piel con poros, sin retoque.
- Sin texto ni logos en la imagen.
- **La foto original NO se sube al generador como referencia**: solo va este prompt escrito. Si la persona quiere usar una imagen de referencia, que sea la imagen aprobada de un personaje inventado de su elenco, nunca la foto real.

## Paso 4 · Entregá

1. **Lo que se toma de la foto** (la lectura del paso 1, 4-6 líneas).
2. **La persona nueva** (su línea de identidad) y qué cambia respecto de la foto.
3. **El prompt** en un bloque de código, para el modelo que pidan (Nano Banana, GPT Image, Grok, Midjourney…; si no dicen, uno general). Si está activa la skill del modelo (`prompts-nano-banana`, `prompts-gpt-image-2`), seguí sus reglas.
4. **Variante B**: la misma escena con otra persona inventada distinta (otra edad, otro tono de piel o pelo), para elegir.
5. Recordatorio en una línea: "Usá solo fotos de referencia que tengas derecho a usar; la foto original no va al generador."

## Ejemplo de salida (resumido)

Lo que se toma: selfie en el espejo del baño, celular a la altura del pecho, luz de ventana desde la izquierda, toallas colgadas, azulejos blancos con juntas grises, remera oversize, gesto relajado mirando la pantalla, foto de celular con un poco de ruido.

Persona nueva: un hombre de unos 35 años, piel morena oscura, cabeza rapada, barba corta prolija, contextura robusta (en la foto había una mujer joven de pelo largo rubio).

```
A mirror selfie of a man in his mid-thirties with deep brown skin, a shaved head, a short neat beard and a sturdy build, holding a phone at chest height in a small bathroom, relaxed, looking at the phone screen. White square tiles with grey grout, two mismatched towels on a rail, a toothbrush cup on the sink edge. He wears a plain oversized light grey t-shirt with no print. Soft daylight from a window on the left, slight shadow on the right side of his face. Shot on a phone, mirror reflection, mild digital noise, slightly soft focus, real skin texture, no retouching, no text, no logos. Vertical 4:5.
```
