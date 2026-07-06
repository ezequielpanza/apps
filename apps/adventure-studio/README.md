# Adventure Studio

Editor web modular para crear aventuras gráficas point & click.

## Versión actual

`v0.10.0`

## Tecnología

- HTML, CSS y JavaScript con ES modules
- Sin build
- `localStorage` para árbol, configuración y metadatos
- IndexedDB para assets binarios
- Web App Manifest

## Desarrollo local

```bash
python -m http.server 8000 --directory apps/adventure-studio
```

## Deploy

- Cloudflare Pages: `adventure-studio`
- Carpeta: `apps/adventure-studio`
- URL: `https://adventure-studio.pages.dev`

## Project Tree

La estructura raíz fija es:

```text
Game
└── Settings

Rooms
Characters
Inventory
Dialogues
Audio
```

`Game` es global y fijo. No se elimina, no se renombra y no acepta recursos por drag & drop.

Los proyectos anteriores reciben automáticamente `Game / Settings` al cargarse, sin perder sus recursos existentes.

## Game Settings Editor

Doble click sobre:

```text
Game / Settings
```

abre el editor de configuración global.

Actualmente administra:

- Game Resolution Width
- Game Resolution Height

La resolución define el viewport lógico y el sistema de coordenadas del juego completo. Ya no aparece como propiedad de una Room.

Separación conceptual:

```text
Game Resolution   → global
Room Size         → propia de la Room
Background Size   → propio del Background
Camera / Scroll   → futura propiedad de Room
Room Viewport     → futura configuración de layout
```

Valores actuales:

```text
Proyecto vacío: 1280 × 720
Monkey Island 2 C: 320 × 200
```

## Arquitectura

- Workspace Host central
- Inspector contextual
- Estado `activeEditorId` persistente
- Game Settings Editor especializado
- Room Editor
- Background Editor
- shells para Character, Inventory, Dialogue y Audio
- Project Tree con subcarpetas y drag & drop tipado
- recursos separados de la estructura visual del árbol
- bootstrap genérico de proyectos empaquetados

## Demo privado

El proyecto de desarrollo vive aislado en:

```text
apps/adventure-studio/demo-projects/monkey-island-2-c/
```

Estado inicial:

- Proyecto: `Monkey Island 2 C`
- Game Resolution: `320 × 200`
- Room: `Room 007`
- Background de referencia: `784 × 144`

Para remover el demo:

1. borrar `demo-projects/monkey-island-2-c/`;
2. cambiar `startup-project.js`.

El motor no debe requerir cambios.

## Rooms

Cada Room contiene secciones fijas:

- Backgrounds
- Characters
- Objects
- Inventory
- Audio
- Dialogues
- Hotspots
- Walk Areas
- Entrances

Los recursos maestros pueden referenciarse dentro de una Room sin duplicarse.

## Backgrounds

Una Room puede contener múltiples estados visuales.

El modelo usa:

- `backgrounds[]`
- `defaultBackgroundId`

Cada background conserva nombre, asset, dimensiones, tipo, tamaño, zoom y modo de escala.

El Background Editor permite importar, previsualizar, renombrar, marcar el predeterminado y eliminar estados.

## Identidad visual

- Logo circular violeta `AS`
- favicon
- Web App Manifest
- acento violeta compartido

Assets:

```text
assets/adventure-studio-logo.svg
app.webmanifest
```

## Seguridad

No incluir secretos ni credenciales privadas en el frontend.
