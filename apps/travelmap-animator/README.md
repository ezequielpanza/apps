# TravelMap Animator

Editor web para crear recorridos de viaje animados y exportarlos como video para edición en Premiere.

## Funciones actuales

- Mapa satelital inicial con estilos de calles OSM, relieve y noche.
- Ruta multipunto: agregar puntos en el mapa, insertar sobre un segmento y arrastrar puntos.
- Reordenar y nombrar escalas.
- Importar GPX, KML y GeoJSON.
- Vehículos, curva, color y grosor de ruta configurables.
- Vista previa con cámara de seguimiento.
- Guardar y abrir proyectos JSON en el dispositivo.
- Exportar PNG y MP4 H.264 cuando el navegador admite `VideoEncoder`.

## Desarrollo

Es una app estática sin paso de build. Servir esta carpeta con cualquier servidor HTTP local.

## Despliegue

- Cloudflare Pages: `travelmap-animator`
- Directorio publicado: esta carpeta
- URL de Pages: `https://travelmap-animator.pages.dev`
- El workflow de GitHub publica cambios al actualizar archivos de esta carpeta en `main`.

Los mapas usan teselas de OpenStreetMap, Esri, OpenTopoMap o CARTO según el estilo seleccionado y conservan la atribución correspondiente.
