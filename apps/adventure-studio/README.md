# Adventure Studio

Editor web para crear aventuras gráficas point & click.

## Versión actual

`v0.6.0`

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
- Apertura de editor por doble click según tipo de recurso.
- Inspector contextual para el recurso activo.
- Datos de recursos separados de la estructura visual del árbol.
- Configuración global del juego separada de las propiedades de Room.
- Código dividido en módulos de modelo, árbol, assets y Room Editor.

## Rooms y referencias

Cada Room contiene automáticamente categorías internas fijas:

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

Ejemplo:

```text
Characters / Guybrush
        ↓ drag
Rooms / Tavern / Characters
```

Resultado:

```text
Rooms / Tavern / Characters / Guybrush ↗
```

La referencia conserva `resourceId` y apunta al recurso maestro. El mismo recurso puede ser usado por varias Rooms sin duplicarse.

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

Esta resolución representa el viewport lógico del juego. Una Room puede usar una imagen mayor o menor.

## Room Editor

El Room Editor incorpora:

- Importación real de imágenes PNG, JPEG, WebP y GIF.
- Persistencia del archivo como Blob en IndexedDB.
- Metadatos de background separados del árbol del proyecto.
- Lectura de dimensiones reales de la imagen.
- Zoom manual entre 10% y 300%.
- Fit al viewport del editor.
- Reemplazo y eliminación de background.

## Editores registrados

- Room Editor
- Character Editor
- Inventory Editor
- Dialogue Editor
- Audio Editor

Los otros editores conservan un shell real dentro del Workspace Host y se implementarán incrementalmente.

## Seguridad

No guardar claves privadas, tokens ni secretos en el frontend.