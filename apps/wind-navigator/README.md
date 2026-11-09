# Wind Navigator (desarrollo)

Adaptación independiente del plugin Navigator 0.1.431. Estado: **incompleto, no usar para navegación ni publicar como versión final**.

La interfaz y los cálculos proceden del plugin; el mapa base es OpenStreetMap con señales OpenSeaMap. El adaptador experimental consulta Open-Meteo para GFS, ECMWF, ICON, GFS Wave y ECMWF WAM; todavía hay que comprobar cobertura, resolución, unidades y resultados reales frente al plugin.

No están implementados mBlue AI, AROME Antillas, CMEMS, corrientes de marea ni el mapa meteorológico de Windy. Algunos campos, paletas e iconos tampoco están adaptados. Las APIs externas, el GPS, los gestos, la instalación y el funcionamiento fuera de línea no se han probado en un navegador.

Open-Meteo ofrece su servicio gratuito para uso no comercial sujeto a límites. Los servidores de mapas también tienen políticas de uso. No se permite descargar zonas masivamente del servidor de OpenStreetMap.

Compilar: `npm install` y `npm run build`. Pruebas: `npm test`. Servir el directorio raíz por HTTPS o localhost.
