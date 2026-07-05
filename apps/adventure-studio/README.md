# Adventure Studio

Editor web para crear aventuras gráficas point & click.

## Versión actual

`v0.7.0`

## Tecnología

- HTML
- CSS
- JavaScript modular con ES modules
- Sin build
- `localStorage` para estructura, metadatos y configuración
- IndexedDB para imágenes binarias importadas

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

Cada background conserva:

- nombre;
- archivo binario en IndexedDB;
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
- persistir archivos como Blob en IndexedDB.

Los proyectos anteriores con un único `background` se migran automáticamente al nuevo modelo multi-background.

## Drag & drop

- Dentro de categorías maestras, mover conserva la restricción de categoría.
- Un Character solo puede referenciarse en `Room / Characters`.
- Un Inventory Element solo puede referenciarse en `Room / Inventory`.
- Un Audio solo puede referenciarse en `Room / Audio`.
- Un Dialogue solo puede referenciarse en `Room / Dialogues`.
- No se crean referencias duplicadas del mismo recurso dentro de la misma categoría de una Room.

## Game Settings

La resolución lógica del framework se guarda globalmente.

Valor inicial:

`1280 × 720`

Esta resolución representa el viewport lógico del juego. Una Room puede usar imágenes mayores o menores.

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