# Skills de Playbook Studio

Cada carpeta es una skill con el formato estándar (un `SKILL.md` con `name` y `description`, y archivos de referencia).
Sirven en tres lugares:

- **En la app**: sección **Chat** → prendé hasta 4 skills a la izquierda. Charla con Claude por la API (se paga por uso,
  sin plan Pro). En cada toma, «Al chat» lleva el prompt de imagen o de video con la skill que corresponde.
- **En claude.ai** (planes Pro o más): «Bajar .zip para claude.ai» en el Chat, y subilo en Configuración → Capacidades → Skills.
- **En Claude Code**: copiá la carpeta a `~/.claude/skills/`.

Para crear una nueva: una carpeta con nombre en minúsculas y guiones (sin "claude" ni "anthropic"), un `SKILL.md` que
empiece con:

```
---
name: el-nombre-de-la-carpeta
description: Qué hace y cuándo usarla (hasta 1024 caracteres).
---
```

La app la lee sola (no hace falta reiniciar). `tests/chat.test.ts` revisa que cada skill sea válida.

Las cuatro de Mashogar (seleccionador, analizador de producto, generador de landings y analizador de ads) son los prompts de Andrés (`references/prompt.md`), con cambios solo donde chocaban con las reglas
de la casa: los números necesitan fuente real, los testimonios y la prensa tienen que ser reales.
