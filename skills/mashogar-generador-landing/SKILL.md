---
name: mashogar-generador-landing
description: Escribe la landing de un producto de Mashogar (mashogar.ar) para WooCommerce con el Generador v8 - el headline, el nombre SEO y la descripción en HTML sobre la plantilla fija de la tienda (trust strip, acordeones, hero, bloque emocional, casos de uso, beneficios, estadísticas opcionales, garantía, especificaciones, preguntas frecuentes). Usala cuando peguen un KIT_CONTRACT del analizador de producto o datos de un proveedor y pidan la landing, la descripción HTML o el texto para WooCommerce.
---

# Mashogar · Generador de landings (v8)

Es el prompt de Andrés para Mashogar, convertido en skill. **Seguí al pie de la letra `references/prompt.md`**: los
inputs, la lógica de fallback (sin KIT_CONTRACT ni patrón, o sin DIAS_GARANTIA, devolvé el ERROR exacto), los 5
patrones con la hibridación 70/30, los límites de palabras (son duros) y las secciones que no se tocan.

La plantilla está en `references/template.html`. **Copiala entera** (el `<style>`, el `<div class="mh">` y el
`<script>`) y cambiá solo los placeholders `[ASÍ]`. No toques el CSS, el JavaScript, los íconos, el trust strip
(A), los textos de envíos (C), la garantía (J) salvo el número de días, ni los badges del pie (N).

## Dónde va en el flujo

1. `mashogar-seleccionador` rankea productos y sugiere un patrón.
2. `mashogar-analizador-producto` devuelve la FICHA con su KIT_CONTRACT (y a veces headline y bloque emocional).
3. **Esta skill** escribe la landing. El HTML se pega en WooCommerce → Producto → Descripción (pestaña «Texto» o
   «Código», nunca en la visual).
4. El mismo KIT_CONTRACT puede ir a `mashogar-analizador-ads` para que los anuncios cuenten lo mismo que la landing.

## Reglas de la casa (mandan sobre el prompt)

- **Estadísticas (sección I) solo con fuente real** (encuesta propia, reseñas contadas, informe del proveedor, dato
  técnico medido). Un stat sin fuente o con `[VERIFY]` se borra con su fila; si no queda ninguno, se borra la
  sección I entera, con su `<h2>`.
- Nada inventado: ni materiales, ni medidas, ni certificaciones, ni testimonios, ni prensa. Lo que falta en
  especificaciones va «Consultar».
- La garantía, los envíos y «Pagas cuando llega (AMBA)» son políticas reales de la tienda: no los cambies ni los
  agrandes. Si la persona dice que cambió una política, avisá que hay que cambiar la plantilla.
- BCARD_3 siempre dice honestamente lo que el producto no hace.
- Sin miedo ni culpa como venta (PREVENCIÓN es tranquilidad, no alarma); sin urgencia ni escasez inventadas.

## Marcado de las partes que escribís

Los checks de casos de uso (un emoji solo acá):

```html
<li><span class="mh-check-emoji">🧂</span>Encontrás cada especia de un vistazo, sin sacar todos los frascos</li>
```

Las filas de especificaciones (`[SPECS_FILAS]`, de 4 a 7):

```html
<tr><td>Material</td><td>Acero inoxidable</td></tr>
```

Las preguntas frecuentes (`[FAQ_DETAILS]`, de 5 a 8):

```html
<details><summary><span class="mh-faq-icon">?</span>¿Cómo se instala?<span class="mh-faq-chevron"><svg viewBox="0 0 10 6"><path d="M1 1l4 4 4-4" stroke-linecap="round" stroke-linejoin="round"/></svg></span></summary><div class="mh-faq-body"><p>La respuesta, hasta 60 palabras.</p></div></details>
```

Si falta la URL de un caso de uso, borrá su `<div class="mh-usecase-img">` entero.

## Cómo respondés

1. `HEADLINE:` y `NOMBRE_PRODUCTO:` en texto, cada uno con su «→ Pegar en».
2. La descripción en **un solo bloque de código** marcado `html`, completo de `<style>` a `</script>`: en la app,
   el Chat muestra ese bloque con «Ver la página» y «Bajar .html».
3. Debajo, en dos o tres líneas: qué patrón usaste, qué secciones borraste (por ejemplo la I por no tener stats) y
   cualquier `[VERIFY]` que quede.

En castellano rioplatense en la charla; el texto de la landing en el tono del prompt (formal/neutral, «usted» o
infinitivo).
