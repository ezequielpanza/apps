# Windy Route Builder

Plugin experimental para Windy que permite fijar un inicio, un destino y puntos intermedios sobre el mapa. Reordena o elimina puntos y consulta la distancia aproximada en millas náuticas.

## Probar

1. Abre [Windy Developer Mode](https://www.windy.com/developer-mode).
2. Instala el plugin desde `https://windy-route-builder.pages.dev/plugin.min.js`.
3. Activa **Fijar inicio**, coloca los puntos intermedios si los necesitas y fija el destino.

La línea conecta los puntos en su orden. Esta versión no busca rutas navegables ni evita tierra.

El código fuente Svelte está en `src/`; `plugin.min.js` es el bundle compilado según la plantilla oficial de plugins de Windy.
