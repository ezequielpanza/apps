# Wander Travel

Wander Travel es un compañero-guía inteligente de viaje. Debe acompañar al usuario mientras descubre una ciudad o lugar, entender su contexto y ayudarlo a decidir qué hacer, qué ver, dónde ir y qué conviene saber en cada momento.

## Propósito

Wander no es un buscador de POIs. Funciona como compañero de viaje y guía turístico personal: recibe al usuario, da contexto turístico, propone formas de descubrir el lugar y adapta sus recomendaciones según ubicación, horario, clima, fecha, intereses y movimiento.

## Estado actual

Versión: v0.60.0

La versión 0.60.0 reconstruye estructuralmente el shell de la app para eliminar la mezcla entre UI vieja y UI inyectada por runtimes.

Incluye:

- Mapa base con Leaflet y OpenStreetMap.
- Barra superior moderna definida directamente en HTML.
- Campo editable "Preguntar a Wander".
- Botón de menú SVG.
- Envío de preguntas con Enter o lupa.
- Menú principal único.
- Panel lateral cerrado por defecto.
- Paneles Travel, Contexto, Simulador y Ajustes definidos directamente en HTML.
- Administrador central de paneles en runtime-panel.js.
- WanderContext como motor central de contexto.
- Tracks y simulador conectados al contexto.

## Arquitectura de UI

### HTML

`index.html` contiene la estructura real de la interfaz. Los runtimes no deben crear headers, botones principales, menús ni paneles que ya forman parte del shell.

### CSS

`wander-ui.css` es la hoja de estilos única del shell. Fue reconstruida para eliminar reglas heredadas y contradicciones entre móvil y escritorio.

### Runtimes

- `runtime-panel.js`: única fuente de verdad para abrir/cerrar paneles y cambiar el layout.
- `runtime-topbar.js`: comportamiento del input y envío de preguntas, sin inyectar UI ni CSS.
- `runtime-context-panel.js`: sincronización y actualización del panel Contexto, sin crear paneles.
- `runtime-context.js`: motor central WanderContext.
- `runtime-tracks.js`: recorridos.
- `runtime-simulator.js`: simulación de movimiento.

## WanderContext

Variables iniciales:

- app.version
- time.now
- time.dayPeriod
- motion.status
- motion.speedKmh
- motion.heading
- location.lat
- location.lng
- location.source
- location.updatedAt
- environment.weatherStatus
- place.city
- place.zone
- user.intent
- user.interests

Cada variable puede mantener:

- value
- source
- updatedAt
- ttlMs
- confidence
- status: fresh, stale, stable o pending

## Desarrollo local

```bash
python -m http.server 8000 --directory apps/wander-travel
```

Abrir:

```text
http://localhost:8000
```

## Deploy

Proyecto Cloudflare Pages: `wander-travel`

URL pública: `https://wander-travel.pages.dev`

## Reglas de reconstrucción

- No pasar a la siguiente feature hasta que la actual funcione bien.
- No emparchar: corregir la causa estructural.
- Eliminar código viejo o contradictorio cuando una estructura nueva lo reemplaza.
- Mantener una UI consistente en toda la app.
- Usar iconos/emojis cuando ayuden a mantener una interfaz minimalista.
- Toda feature nueva debe leer o escribir contexto a través de WanderContext cuando corresponda.
- Actualizar versión en cada cambio relevante.
