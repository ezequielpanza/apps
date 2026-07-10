# Contextum

Primera versión experimental de una capa personal de contexto para ampliar las capacidades de ChatGPT.

## Versión

v0.1.0

## Objetivo de esta versión

Validar en un teléfono Android una PWA instalada y utilizada en pantalla dividida junto a ChatGPT.

Incluye:

- GPS continuo con `watchPosition()`.
- Latitud, longitud y precisión.
- Velocidad y rumbo, con estimación de respaldo entre lecturas.
- Altitud cuando el dispositivo la entrega.
- Diagnóstico de visibilidad, foco, estado del GPS y última lectura.
- Companion Mode con interfaz compacta y Screen Wake Lock cuando está disponible.
- Nota de contexto activa persistida localmente.
- Persistencia local de la última posición.
- PWA instalable y service worker.

## Alcance deliberadamente fuera de v0.1.0

- Backend.
- Cloudflare D1.
- Sincronización multi-dispositivo.
- MCP / conexión con ChatGPT.
- OpenAI API.
- POIs, clima, routing, navegación o aprendizaje de rutinas.

## Tecnología

- HTML
- CSS
- JavaScript
- Web App Manifest
- Service Worker
- Geolocation API
- Screen Wake Lock API

## Desarrollo local

```bash
python -m http.server 8000 --directory apps/contextum
```

Para probar Geolocation fuera de `localhost` se requiere un contexto HTTPS.

## Deploy

- Carpeta: `apps/contextum`
- Proyecto Cloudflare Pages: `contextum`
- URL esperada: `https://contextum.pages.dev`

## Seguridad y privacidad

En v0.1.0 los datos de GPS y la nota activa se guardan únicamente en `localStorage` del dispositivo. No se incluyen claves privadas ni secretos en el frontend.
