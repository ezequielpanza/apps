# Sailward

Versión: **v0.1.0 alpha**

Sailward es un simulador de navegación 2D sobre el mundo real. El jugador parte de un puerto conocido, regula las velas y el rumbo, y la travesía continúa según el reloj real aunque cierre la aplicación.

## Primera versión

- Ocho puertos de salida distribuidos por el mundo.
- Mapa vectorial interactivo con MapLibre y datos de OpenStreetMap.
- Capa náutica opcional de OpenSeaMap.
- Viento, olas y corrientes consultados en Open-Meteo.
- Velocidad calculada según viento, rumbo y porcentaje de velas.
- Posición y distancia persistentes en el dispositivo.
- Controles adaptados a escritorio y dispositivos móviles.

Sailward es un juego y no debe utilizarse para navegación real.

## Desarrollo

```bash
npm ci
npm run dev
```

## Validación

```bash
npm test
```

## Fuentes cartográficas

- Mapa base: OpenFreeMap, OpenMapTiles y colaboradores de OpenStreetMap.
- Señales náuticas: OpenSeaMap.
- Condiciones meteorológicas: Open-Meteo.
