# Adventure Studio

Editor web para crear aventuras gráficas point & click.

## Versión actual

`v0.8.1`

## Tecnología

- HTML
- CSS
- JavaScript modular con ES modules
- Sin build
- `localStorage` para estructura, metadatos y configuración
- IndexedDB para imágenes binarias importadas y cacheadas

## Desarrollo local

```bash
python -m http.server 8000 --directory apps/adventure-studio
```

## Deploy

- Proyecto Cloudflare Pages: `adventure-studio`
- Carpeta publicada: `apps/adventure-studio`
- URL pública esperada: `https://adventure-studio.pages.dev`
- Workflow: `.github/workflows/deploy-adventure-studio.yml`

## Arquitectura actual

- Project Tree con categorías raíz fijas.
- Subcarpetas anidables.
- Creación contextual por carpeta.
- Renombrado inline.
- Workspace Host central.
- Estado `activeEditorId` persistente.
- Apertura de editor por doble click según tipo de recurso o sección especializada.
- Inspector contextual para el recurso o sección activa.
- Datos de recursos separados de la estructura visual del árbol.
- Configuración global del juego separada de las propiedades de Room.
- Código dividido en módulos de modelo, árbol, assets, Room Editor y Background Editor.
- Bootstrap genérico de proyectos empaquetados.
- Proyecto de arranque configurable mediante un único punto de entrada.

## Proyecto de arranque configurable

`startup-project.js` define qué proyecto empaquetado debe abrir Adventure Studio por defecto.

El cargador genérico vive en:

```text
bundled-project.js
```

El motor no contiene nombres, IDs ni condiciones específicas del proyecto demo.

Reglas de bootstrap:

- si no existe un proyecto inicializado, carga el proyecto de arranque;
- si existe un proyecto legado sin identidad de bundle, inicializa el proyecto de arranque una sola vez;
- después de la primera inicialización, las recargas preservan los cambios locales;
- el proyecto empaquetado no se vuelve a copiar sobre el trabajo del usuario en cada recarga;
- si el bundle activo declara assets empaquetados, estos se rehidratan en IndexedDB al arrancar;
- la rehidratación es idempotente y sirve también para reparar un Blob faltante o corrupto sin sobrescribir el modelo del proyecto.

## Demo privado: Monkey Island 2 C

El proyecto demo actual vive aislado en:

```text
apps/adventure-studio/demo-projects/monkey-island-2-c/
```

Estado inicial:

- Nombre: `Monkey Island 2 C`
- Resolución lógica: `320 × 200`
- Room abierta por defecto: `Room 007`
- Background inicial: `Default`
- Background de referencia: `784 × 144`

La Room 007 se abre automáticamente al inicializar el demo por primera vez.

Para remover el demo al finalizar el desarrollo:

1. eliminar `demo-projects/monkey-island-2-c/`;
2. cambiar `startup-project.js` para que deje de apuntar al demo.

No debe ser necesario modificar el motor, el Project Tree ni los editores.

## Rooms y referencias

Cada Room contiene automáticamente categorías internas fijas:

- Backgrounds
- Characters
- Objects
- Inventory
- Audio
- Dialogues
- Hotspots
- Walk Areas
- Entrances

Estas categorías internas:

- no se renombran;
- no se eliminan;
- no se mueven fuera de la Room;
- aceptan únicamente su tipo correspondiente.

Los recursos maestros continúan viviendo en sus categorías globales. Al arrastrar un recurso maestro a una categoría compatible dentro de una Room se crea una referencia, no una copia.

## Backgrounds

Una Room puede contener múltiples estados visuales completos.

Ejemplo:

```text
Room / Tavern / Backgrounds
├── Day
├── Night
├── Light On
└── Light Off
```

El modelo de Room usa:

- `backgrounds[]`
- `defaultBackgroundId`

Cada background puede conservar:

- nombre;
- `assetKey`;
- origen empaquetado opcional;
- archivo cacheado en IndexedDB;
- dimensiones;
- tipo MIME;
- tamaño;
- zoom;
- modo de escala.

El background predeterminado es el que muestra inicialmente el Room Editor.

## Background Editor

Doble click sobre:

```text
Room / Backgrounds
```

abre el Background Editor.

Funciones actuales:

- importar uno o varios backgrounds;
- ver la lista de estados;
- previsualizar el seleccionado;
- renombrar un estado;
- elegir el background predeterminado;
- eliminar un estado;
- persistir archivos como Blob en IndexedDB;
- cargar assets empaquetados y cachearlos localmente.

Los proyectos anteriores con un único `background` se migran automáticamente al nuevo modelo multi-background.

## Drag & drop

- Dentro de categorías maestras, mover conserva la restricción de categoría.
- Un Character solo puede referenciarse en `Room / Characters`.
- Un Inventory Element solo puede referenciarse en `Room / Inventory`.
- Un Audio solo puede referenciarse en `Room / Audio`.
- Un Dialogue solo puede referenciarse en `Room / Dialogues`.
- No se crean referencias duplicadas del mismo recurso dentro de la misma categoría de una Room.

## Game Settings

La resolución lógica del framework se guarda globalmente por proyecto.

Valor inicial para proyectos vacíos:

`1280 × 720`

El demo `Monkey Island 2 C` define:

`320 × 200`

Una Room puede usar imágenes mayores o menores que el viewport lógico.

## Room Editor

El Room Editor muestra el background predeterminado de la Room e incorpora:

- zoom manual entre 10% y 300%;
- Fit al viewport del editor;
- reemplazo del background predeterminado;
- eliminación del background predeterminado.

## Editores registrados

- Room Editor
- Background Editor
- Character Editor
- Inventory Editor
- Dialogue Editor
- Audio Editor

Los otros editores conservan un shell real dentro del Workspace Host y se implementarán incrementalmente.

## Seguridad

No guardar claves privadas, tokens ni secretos en el frontend.
