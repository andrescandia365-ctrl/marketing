# Ideas para construir

Lista de ideas que fueron saliendo. **Nada de esto está construido.** Se construye solo con "go".
Cada idea dice de dónde salió y qué falta saber antes de hacerla.

## Para construir (con "go")

### 1. Tomas de transformación: del Malo al Bueno en un solo clip
- **Qué:** una toma con tres imágenes (inicial = el Malo, intermedia = el giro, final = el Bueno) y un solo prompt de video que va de una a otra. Ej.: heladera desordenada con el yogur vencido → la mano que lo saca / el celular que avisa "Vence" → heladera ordenada.
- **Por qué:** Grok Imagine permite imagen inicial, intermedia y final en un clip. Es el Bueno contra el Malo hecho imagen.
- **Límite:** un clip dura hasta ~15 s (a confirmar). Sirve para el momento clave de cada tema, no para toda la historia.
- **Falta saber:** si el ícono del medio en Grok es la imagen intermedia; qué largos ofrece (¿1 a 15 libre o 6/10/15?).

### 2. Personajes y lugares como imágenes de referencia (`@`)
- **Qué:** cada setup del storyboard (El Desorden, Marta, la heladera) pasa a ser una imagen de referencia con nombre, para usar con `@` en Grok.
- **Por qué:** hoy la consistencia depende de repetir la misma descripción; con una imagen de referencia el personaje se ve igual en todas las tomas.
- **Falta saber:** si `@` toma imágenes subidas por vos o solo las generadas en Grok; cuántas se pueden usar.

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
- **Depende de:** confirmar los largos de Grok (idea 1).

### 7. Revisión de imágenes por la IA (paso 5 del plan)
- **Qué:** cuando subís una imagen o un clip, la IA lo mira y dice si cumple: el personaje igual que en su setup, sin texto ni logos, el formato correcto.

### 8. Música y cortes al ritmo (paso 6 del plan)
- **Qué:** sumar música y que los cortes entre tomas caigan en el ritmo.
- **Falta saber:** si el sonido de Grok sale automático y si se puede apagar (los prompts hoy piden "sin música").

### 9. `iniciar.sh` que pregunte el proveedor
- **Qué:** que el script pregunte "¿Kimi directo, NVIDIA u OpenRouter?" y pida solo la clave y el modelo, sin tocar `.env` a mano.

### 10. Guardar proyectos
- **Qué:** hoy todo vive en la pestaña abierta; si la cerrás, se pierde. Guardar cada pieza (historia, storyboard, notas) para retomarla.

### 11. Voz en off
- **Qué:** hoy las líneas van solo en subtítulos. Más adelante, voz.

## Para anotar en el perfil de Grok (`server/tools/grok-imagine.md`, con "ok")
- Largo de clip de hasta 15 s (visto en la app; confirmar opciones).
- Imagen inicial, intermedia y final en un mismo clip.
- `@` para referenciar imágenes.
- Segmentos: cada objeto de la imagen separado y editable; "Descargar todo".
- Eliminar fondo, Relación de aspecto, Crear video.
- 720p y 10 s como valores por defecto en el editor; botón de sonido.
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
