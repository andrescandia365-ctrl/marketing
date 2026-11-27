---
name: omni-ugc-prompts
description: Escribe prompts de Gemini Omni (Omni Flash) para videos estilo UGC - la persona con su celular - testimonio a cámara, unboxing, demo en uso, antes y después, con un creador inventado, look de celular real y gancho en los primeros 2 segundos. Usala cuando pidan un UGC, un video tipo creador o testimonio para Gemini Omni.
---

# Prompts UGC para Gemini Omni

Se apoya en `omni-prompts` (seis capas, tiempos, límites). Acá, lo que cambia para que parezca hecho con un celular.

## Límite importante

Omni **no sigue un audio tuyo**: la voz del creador la inventa el modelo y cambia entre clips. Para un creador que vuelve en varios videos con la misma voz: hacé el clip en Omni **sin que hable** (o en plano donde no se ve la boca) y poné la voz después con una pasada de lip sync, o usá Seedance con la voz como @Audio1. Para un video único, la voz de Omni sirve.

## Reglas de la casa

- Creador inventado y adulto, siempre. Nunca un influencer o cliente real ni "parecido a".
- Si cuenta "lo usé", es una dramatización: va el aviso de IA ("Personaje hecho con IA"), sin nombre ni ciudad inventados presentados como reales, sin reseñas falsas.
- Lo que dice del producto sale de lo que el producto hace hoy; cifras sin fuente, [VERIFY].
- Sin marcas ajenas a la vista.

## Look de celular

- "Vertical 9:16 selfie video, phone held at arm's length, slight handheld drift", o "phone propped on the counter". Google entiende "natural smartphone zoom" y "webcam style".
- Luz de casa (ventana, lámpara), nunca de estudio; lugar real con un poco de desorden, dicho con objetos concretos.
- Piel real, ropa de entrecasa, mira a la lente cuando habla.
- Una o dos imperfecciones: se ríe a mitad de frase, mueve el celular, aparece su mano.
- "Single continuous shot, no scene cuts" salvo que quieras el corte (y entonces "Cut to …" con timecode).

## Estructuras

1. **Testimonio** (8-10 s): dolor en 2 s → el producto en uso, en cuadro → cómo quedó → una invitación.
2. **Unboxing** (6-10 s): abrir, girar el producto hacia la lente, reacción honesta; no mostrar todo al principio.
3. **Demo** (6-8 s): resultado o problema primero, después la acción.
4. **Antes / después** (6-8 s): mismo lugar y luz, cambia una cosa.

## El gancho

En la primera ventana (`[0-2s]`), dicho y mostrado: un objeto, una hora, un número real. Nada de saludo ni marca primero.

## Ejemplo (8 s, 9:16)

```
Vertical 9:16 selfie video, phone held at arm's length with slight handheld drift, natural smartphone look. Lucía, a woman in her early thirties with wavy chestnut hair in a loose clip and a grey oversized sweatshirt, stands in a small cluttered kitchen at night. Warm ceiling lamp, the light never changes.
[0-2s] She tilts the phone toward a sink full of plates and says to the camera, in Rioplatense Spanish, half laughing: Tercera vez esta semana.
[2-6s] She turns the phone to a plain white dish rack on the counter, the plates lined up in it, her free hand pointing at it.
[6-8s] Back to her face, she looks into the lens, relieved, and nods once.
Audio: kitchen room tone and a plate clinking in the background. No music. No subtitles. No on-screen text.
```

## Cómo entregás

1. El prompt en un bloque de código.
2. En castellano: formato 9:16, largo, resolución, qué referencia subir (la imagen aprobada del creador o una foto limpia del producto), qué revisar (cortes no pedidos, texto en pantalla, manos con el producto).
3. El aviso de IA para el video si el creador habla de su experiencia.
