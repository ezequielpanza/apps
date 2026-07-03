# Wander Travel

Wander Travel es un compañero-guía inteligente de viaje. La app debe acompañar al usuario mientras descubre una ciudad o lugar, entender su contexto y ayudarlo a decidir qué hacer, qué ver, dónde ir y qué conviene saber en cada momento.

## Propósito

Wander no es un buscador de POIs. Wander debe funcionar como un compañero de viaje y guía turístico personal: saluda al usuario al llegar a una ciudad, da contexto turístico, sugiere una ruta orgánica y adapta sus recomendaciones según ubicación, horario, clima, fecha, intereses y movimiento.

## Estado actual

Versión: v0.58.1

Esta versión moderniza la entrada principal a Wander con una barra superior flotante tipo consulta. Reemplaza el header visible anterior por una cápsula con menú, frase inicial y lupa.

Incluye:

- Mapa base con Leaflet y OpenStreetMap.
- Barra superior moderna: ☰ Preguntar a Wander 🔍.
- Menú principal minimalista con iconos/emojis.
- Tarjeta Wander.
- Panel Travel.
- Panel Contexto inyectado por runtime.
- Panel de configuración.
- Panel de desarrollador/simulador.
- Grabación local de tracks.
- Exportación del último track.
- Simulación de movimiento para pruebas.
- Motor WanderContext con variables, fuente, actualización, TTL, confianza y vigencia.

## UI principal

Archivo responsable de la barra superior moderna:

```text
runtime-topbar.js
```

La barra superior usa como frase inicial:

```text
Preguntar a Wander
```

El header anterior con nombre, versión y Explorando queda oculto. La versión se mantiene en WanderContext y en la documentación, no como elemento principal del mapa.

## WanderContext

Archivo principal:

```text
runtime-context.js
```

Panel visible:

```text
runtime-context-panel.js
```

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

Cada variable puede tener:

- value
- source
- updatedAt
- ttlMs
- confidence
- status: fresh, stale, stable o pending

## Tecnología

- HTML
- CSS
- JavaScript estático
- Leaflet
- OpenStreetMap
- Cloudflare Pages
- Cloudflare Pages Functions para futuras funciones de IA

## Desarrollo local

Desde la raíz del repositorio:

```bash
python -m http.server 8000 --directory apps/wander-travel
```

Abrir:

```text
http://localhost:8000
```

## Deploy

Proyecto Cloudflare Pages: wander-travel
Carpeta publicada: apps/wander-travel
URL pública: https://wander-travel.pages.dev

## Reglas de reconstrucción

- No pasar a la siguiente feature hasta que la actual funcione bien.
- No emparchar: corregir la causa estructural.
- Mantener una UI consistente en toda la app.
- Usar iconos/emojis en botones cuando ayuden a mantener una interfaz minimalista.
- No mezclar restos de interfaces anteriores.
- No publicar secretos en el frontend.
- Actualizar versión en cada cambio relevante.
- Toda feature nueva debe leer o escribir contexto a través de WanderContext.

## Próximas capas previstas

1. Ajustes finos de UI moderna.
2. Ubicación real.
3. Contexto de ciudad/zona.
4. IA integrada leyendo WanderContext.
5. Bienvenida a ciudad.
6. Guía turística contextual.
7. Clima, fecha y eventos.
8. Ruta viva adaptativa.
