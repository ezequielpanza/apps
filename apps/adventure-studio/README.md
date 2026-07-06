# Adventure Studio

Editor web modular para crear aventuras gráficas point & click.

## Versión actual

`v0.11.0`

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

### Interacción principal

El árbol usa click único:

```text
Click en raíz con hijos
→ selecciona
→ expande o contrae

Click en Settings
→ abre Game Settings Editor

Click en Room
→ abre Room Editor
→ expande o contrae sus secciones

Click en Backgrounds
→ abre Background Editor
→ expande o contrae la sección

Click en recurso hoja
→ abre su editor
```

No se usa doble click para abrir recursos y no existe renombrado retardado por click sobre el nombre.

### Acciones semánticas

```text
+   verde      → crear
✎   amarillo   → renombrar
×   rojo       → eliminar
```

Los mismos recursos que pueden eliminarse muestran también el lápiz para renombrarlos. Las secciones estructurales fijas no se renombran ni se eliminan.

El renombrado inline se activa exclusivamente con el botón `✎`.

## Game Settings Editor

Click sobre:

```text
Game / Settings
```

abre la configuración global.

Actualmente administra:

- Game Resolution Width
- Game Resolution Height

La resolución define el viewport lógico del juego completo y ya no aparece como propiedad de una Room.

Separación conceptual:

```text
Game Resolution   → global
Room Size         → propia de la Room
Background Size   → propio del Background
Camera / Scroll   → futura propiedad de Room
Room Viewport     → futura configuración de layout
```

## Arquitectura

- Workspace Host central
- Inspector contextual
- estado `activeEditorId` persistente
- Game Settings Editor
- Room Editor
- Background Editor
- shells para Character, Inventory, Dialogue y Audio
- Project Tree con drag & drop tipado
- recursos separados de la estructura visual
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
