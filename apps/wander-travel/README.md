# Wander Travel

Versión: **v0.95.0**

Wander Travel combina una base técnica estable para observar el viaje con el primer ciclo funcional del compañero: interpreta la llegada a un lugar aparentemente nuevo, espera un momento apropiado, da una bienvenida contextual, acepta una corrección del usuario y recuerda lo presentado.

## Arquitectura activa

- **WanderContext** mantiene las señales observadas e inferidas del entorno.
- **WanderEngine** interpreta ubicación, movimiento, transiciones, memoria geográfica y continuidad del viaje.
- **Providers** obtienen ubicación, lugar, POIs, contenedores geográficos y simulación.
- **UI** representa únicamente funciones conectadas a datos o acciones reales.

El orden de carga está declarado de forma determinista en `index.html`. `app.js` inicializa los providers, publica `wander:app-ready` y registra el service worker; no carga módulos adicionales de forma dinámica.

## Funciones activas

- Ubicación real y posición efectiva de simulación.
- Estado de movimiento con filtrado de deriva de GPS.
- Inferencia gradual del método de desplazamiento.
- Context dashboard configurable y ordenable.
- POIs normalizados desde Google Places, OpenStreetMap y Wikidata.
- Detección de POI y contenedor actual.
- Puntos personales y selector de posición.
- Sesiones automáticas con movimiento, permanencias, historial y exportación.
- Memoria geográfica y continuidad de Journey.
- Política de intervenciones y bienvenida a ciudades o países aparentemente nuevos.
- Corrección contextual de familiaridad y memoria del contenido presentado.
- Simulador de ubicación y movimiento.
- PWA con caché offline versionado.

## Fuentes de POIs

Todas las fuentes que ingresan al pipeline deben producir `NormalizedPOI` y cumplir una política explícita.

- Google Places: conector activo mediante la función `/api/places/nearby`.
- OpenStreetMap: conector activo mediante Overpass.
- Wikidata: conector activo mediante SPARQL.
- Google Maps y Tripadvisor: políticas `external_only`; no se automatizan ni se almacenan en el pipeline.

## Desarrollo local

Desde la raíz del repositorio:

```bash
python -m http.server 8000 --directory apps/wander-travel
```

Abrir `http://localhost:8000`.

## Pruebas

```bash
for test in apps/wander-travel/tests/*.mjs; do node "$test"; done
```

Los tests cubren escenarios del engine, contrato y consolidación de POIs, conectores, NearbyProvider, dashboard y consistencia del shell PWA.

## Reglas de mantenimiento

- No incorporar placeholders ni controles sin comportamiento real.
- No conservar copias, fragmentos de importación o módulos retirados dentro del repositorio.
- Corregir la responsabilidad original antes de agregar un módulo de compensación.
- Mantener un único origen para la versión de la app: `runtime-version.js`.
- Declarar todos los scripts y estilos activos en `index.html` y en el shell offline.
- Actualizar o eliminar las pruebas cuando cambie deliberadamente un contrato.
- Actualizar la versión en cada cambio relevante.

## Deploy

Proyecto Cloudflare Pages: `wander-travel`

URL pública: `https://wander-travel.pages.dev`
