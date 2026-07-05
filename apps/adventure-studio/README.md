# Adventure Studio

Editor web para crear aventuras gráficas point & click.

## Versión actual

`v0.4.0`

## Tecnología

- HTML
- CSS
- JavaScript
- Sin build
- Persistencia local mediante `localStorage`

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

## Editores registrados

- Room Editor
- Character Editor
- Inventory Editor
- Dialogue Editor
- Audio Editor

En `v0.4.0` estos editores tienen un shell real dentro del Workspace Host. Sus herramientas específicas se implementarán de forma incremental.

## Seguridad

No guardar claves privadas, tokens ni secretos en el frontend.