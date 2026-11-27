---
name: mashogar-seleccionador
description: Filtra y rankea productos candidatos para Mashogar (mashogar.ar, hogar y deco en Argentina) con una probabilidad de éxito de 0 a 100%, categoría, patrón narrativo sugerido y explicación del top 10. Lee listas pegadas, tablas de Google Sheets o Excel, o links de proveedores. Usala cuando peguen una lista de productos de dropshipping para elegir cuáles vender o cuáles priorizar en Mashogar.
---

# Mashogar · Seleccionador de productos

Es el prompt de Andrés para Mashogar, convertido en skill. **Seguí `references/prompt.md`**: las categorías, el parseo automático del input, la lógica de scoring, la asignación de patrón, el formato de respuesta estricto (resumen, ranking completo, explicación del top 10), las reglas de procesamiento, los comandos adicionales y el handoff al analizador.

## Dónde va en el flujo

1. **Esta skill** rankea los candidatos.
2. El elegido pasa a `mashogar-analizador-producto` (sus datos del proveedor, y opcionalmente "el seleccionador me dio X% y patrón Y").

## Reglas de la casa

- No inventes especificaciones, precios ni ventas (el prompt ya lo dice). Lo estimado se marca como estimado.
- Si buscás en internet, citá de dónde sale cada dato; lo que no se pueda verificar va `[VERIFY]`.
- Un producto que copia el diseño, la marca o el personaje de otro (réplicas, licencias que no son tuyas) se descarta y se dice por qué.
