# Adventure Studio

Editor web modular para crear aventuras gráficas point & click.

## Versión actual

`v0.12.0`

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

## Modelo Project → Games

Un Project puede contener uno o varios Games.

La estructura base es:

```text
Games
├── Game A
│   ├── Settings
│   ├── Rooms
│   ├── Characters
│   ├── Inventory
│   ├── Dialogues
│   └── Audio
│
└── Game B
    ├── Settings
    ├── Rooms
    ├── Characters
    ├── Inventory
    ├── Dialogues
    └── Audio
```

`Games` es la única raíz estructural fija del Project.

Cada Game:

- se puede crear con `+`;
- se puede renombrar con `✎`;
- se puede eliminar con `×`;
- tiene configuración propia;
- tiene sus propios Rooms, Characters, Inventory, Dialogues y Audio.

Los recursos de un Game no pertenecen globalmente al Project.

## Recursos por Game

El modelo de recursos usa:

```text
resources.games[gameId]
```

Cada Game contiene:

```text
settings
rooms
characters
inventory
dialogues
audio
```

Esto evita que dos Games compartan accidentalmente recursos o resolución.

## Game Settings Editor

Click sobre:

```text
Games / <Game> / Settings
```

abre la configuración del Game activo.

Actualmente administra:

- Game Resolution Width
- Game Resolution Height

La resolución es propia de cada Game.

Ejemplo:

```text
Game A → 320 × 200
Game B → 1280 × 720
```

## Project Tree

El árbol usa click único:

```text
Click en Games
→ expande o contrae

Click en un Game
→ expande o contrae sus secciones

Click en Settings
→ abre Game Settings Editor

Click en Rooms / Characters / Inventory / Dialogues / Audio
→ expande o contrae esa sección

Click en Room
→ abre Room Editor
→ expande o contrae sus subramas

Click en Backgrounds
→ abre Background Editor
→ expande o contrae la sección

Click en recurso hoja
→ abre su editor
```

No se usa doble click para abrir recursos.

## Acciones semánticas

```text
+   verde      → crear
✎   amarillo   → renombrar
×   rojo       → eliminar
```

Los recursos borrables muestran también el lápiz para renombrarlos.

## Drag & drop

Los recursos solo se mueven dentro de:

- el mismo Game;
- la misma sección tipada.

Las referencias de recursos dentro de una Room solo pueden apuntar a recursos del mismo Game.

## Migración automática

Los proyectos anteriores con estructura global:

```text
Game
Rooms
Characters
Inventory
Dialogues
Audio
```

se migran automáticamente a:

```text
Games
└── <Game actual>
    ├── Settings
    ├── Rooms
    ├── Characters
    ├── Inventory
    ├── Dialogues
    └── Audio
```

La migración conserva:

- Rooms existentes;
- recursos;
- referencias;
- resolución previa;
- selección activa cuando el ID sigue siendo válido.

No debería ser necesario borrar `localStorage` ni IndexedDB.

## Demo privado

El proyecto de desarrollo vive en:

```text
apps/adventure-studio/demo-projects/monkey-island-2-c/
```

Estado inicial:

- Project: `Monkey Island 2 C`
- Game: `Monkey Island 2 C`
- Game Resolution: `320 × 200`
- Room: `Room 007`
- Background de referencia: `784 × 144`

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

Los recursos maestros pueden referenciarse dentro de una Room sin duplicarse, siempre dentro del mismo Game.

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
