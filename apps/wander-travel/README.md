# Wander Travel

Wander Travel es un compañero-guía inteligente de viaje. La app debe acompañar al usuario mientras descubre una ciudad o lugar, entender su contexto y ayudarlo a decidir qué hacer, qué ver, dónde ir y qué conviene saber en cada momento.

## Propósito

Wander no es un buscador de POIs. Wander debe funcionar como un compañero de viaje y guía turístico personal: saluda al usuario al llegar a una ciudad, da contexto turístico, sugiere una ruta orgánica y adapta sus recomendaciones según ubicación, horario, clima, fecha, intereses y movimiento.

## Estado actual

Versión: v0.57.2

Esta versión estabiliza el shell base antes de reactivar nuevas funciones. Incluye:

- Mapa base con Leaflet y OpenStreetMap.
- Header con versión visible.
- Menú principal minimalista con iconos/emojis.
- Tarjeta Wander.
- Panel Travel.
- Panel de configuración.
- Panel de desarrollador/simulador.
- Grabación local de tracks.
- Exportación del último track.
- Simulación de movimiento para pruebas.

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

## Próximas capas previstas

1. Shell estable.
2. Wander como compañero contextual.
3. IA integrada.
4. Bienvenida a ciudad.
5. Guía turística contextual.
6. Clima, fecha y eventos.
7. Ruta viva adaptativa.
