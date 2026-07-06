# Wander Travel

Wander Travel es un compañero-guía inteligente de viaje. Acompaña al usuario mientras descubre un lugar, entiende lo que sucede alrededor y decide qué conviene ofrecer, contar, preguntar o dejar pasar en cada momento.

## Propósito

Wander no es un buscador de POIs. Funciona como compañero de viaje y guía turístico personal: recibe al usuario, aporta contexto turístico, propone formas de descubrir el lugar y adapta sus intervenciones según la realidad presente, el viajero y la historia del viaje.

## Estado actual

Versión: v0.72.0

La versión 0.72.0 fija la arquitectura central de Wander en tres estratos:

- `WanderBody`: cuerpo físico/digital de la app. Capta señales del dispositivo y ejecuta acciones visibles.
- `WanderContext`: puente con la realidad. Integra, normaliza e interpreta lo que está sucediendo y lo que existe alrededor.
- `WanderEngine`: cerebro cognitivo. Mantiene memoria del viajero y del viaje, aprende y decide cómo acompañar.

## Principio arquitectónico

```text
Mundo físico ──> WanderBody ──> WanderContext ──> WanderEngine
                     ^                                |
                     |                                v
                     +──────── ejecuta acciones ──────+
```

También existen entradas digitales directas al contexto:

```text
OSM / Web / clima / eventos / otras fuentes
                    |
                    v
             WanderContext
                    |
                    v
             WanderEngine
```

Y una respuesta directa del usuario puede viajar del cuerpo al cerebro sin convertirse en contexto ambiental:

```text
Usuario ──> WanderBody ──> WanderEngine
```

## WanderBody

Responsabilidad: captar y ejecutar.

Incluye, según el dispositivo:

- UI, mapa, botones, menús y pantallas.
- mouse, touch y gestos.
- GPS y permisos del dispositivo.
- simulador como fuente física alternativa de prueba.
- audio, voz, micrófono, vibración y notificaciones futuras.
- PWA, Tauri, Android y Windows como cuerpos concretos futuros.

Runtimes actuales vinculados al cuerpo:

- `runtime-body-location.js`: adaptador de geolocalización del dispositivo.
- `runtime-body-simulator.js`: controles físicos de simulación y generación de ubicación override.
- `runtime-map-*.js`: representación e interacción del mapa.
- `runtime-ui.js`, `runtime-panel.js`, `runtime-topbar.js`: interfaz.

## WanderContext

Responsabilidad: representar la realidad conocida por Wander.

El contexto no guarda gustos, intereses ni planes del usuario. Eso pertenece al cerebro.

Runtimes:

- `runtime-context-store.js`: store contextual, metadata, freshness y suscripciones.
- `runtime-context-location.js`: ramas `real`, `override` y `effective`.
- `runtime-context-init.js`: estado contextual inicial.
- `runtime-context-inference.js`: interpretación contextual derivada, por ejemplo movimiento a partir de ubicación efectiva.

Áreas actuales y previstas:

```text
time.*
location.real.*
location.override.*
location.effective.*
motion.*
environment.*
place.*
places.items
simulation.status
```

Cada entrada puede mantener:

- `value`
- `source`
- `kind`
- `updatedAt`
- `ttlMs`
- `confidence`
- estado calculado: `fresh`, `stale`, `stable` o `pending`

Los lugares y POIs forman parte de la realidad disponible para Wander y entrarán normalizados en `places.items`, independientemente de su fuente original.

## WanderEngine

Responsabilidad: comprender, recordar, aprender y decidir.

`runtime-engine.js` establece el núcleo cognitivo persistente con estas áreas iniciales:

```text
traveler
profile
travel
memory
```

API mínima actual:

```text
WanderEngine.getState()
WanderEngine.subscribe(...)
WanderEngine.update(...)
WanderEngine.observe(...)
WanderEngine.answer(...)
WanderEngine.evaluate(...)
```

En esta etapa `evaluate()` devuelve `wait` mientras no exista una regla cognitiva concreta. No se simula inteligencia inexistente.

## Arquitectura de UI

### HTML

`index.html` contiene la estructura real de la interfaz. Los runtimes no deben recrear headers, botones principales, menús ni pantallas que ya forman parte del shell.

### CSS

`wander-ui.css` es la hoja de estilos única del shell.

### Runtimes de interfaz

- `runtime-panel.js`: apertura/cierre de pantallas y layout.
- `runtime-topbar.js`: comportamiento de consulta.
- `runtime-context-panel.js`: visualización del estado de `WanderContext`.
- `runtime-tracks.js`: recorridos.

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
- Toda señal física debe entrar por `WanderBody` cuando corresponda.
- Toda representación del mundo debe vivir en `WanderContext`.
- Todo aprendizaje, memoria o decisión debe vivir en `WanderEngine`.
- Actualizar versión en cada cambio relevante.
