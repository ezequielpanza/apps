# Adventure Studio

Editor web para crear aventuras gráficas point & click.

## Versión actual

`v0.5.0`

## Tecnología

- HTML
- CSS
- JavaScript
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
- Drag & drop restringido a la categoría de origen.
- Selección y expansión separadas.
- Workspace Host central.
- Estado `activeEditorId` persistente.
- Apertura de editor por doble click según tipo de recurso.
- Inspector contextual para el recurso activo.
- Datos de recursos separados de la estructura visual del árbol.
- Configuración global del juego separada de las propiedades de Room.

## Game Settings

La resolución lógica del framework se guarda globalmente:

- Width
- Height

Valor inicial:

`1280 × 720`

Esta resolución representa el viewport lógico del juego. Una Room puede usar una imagen mayor o menor.

## Room Editor

La versión `v0.5.0` incorpora:

- Importación real de imágenes PNG, JPEG, WebP y GIF.
- Persistencia del archivo como Blob en IndexedDB.
- Metadatos de background separados del árbol del proyecto.
- Lectura de dimensiones reales de la imagen.
- Zoom manual entre 10% y 300%.
- Fit al viewport del editor.
- Reemplazo de background.
- Eliminación de background.
- Inspector de imagen y zoom.

## Editores registrados

- Room Editor
- Character Editor
- Inventory Editor
- Dialogue Editor
- Audio Editor

Los otros editores conservan un shell real dentro del Workspace Host y se implementarán incrementalmente.

## Seguridad

No guardar claves privadas, tokens ni secretos en el frontend.