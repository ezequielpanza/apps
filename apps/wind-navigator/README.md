# Wind Navigator

Aplicación independiente adaptada del plugin Navigator 0.1.431. Usa OpenStreetMap y OpenSeaMap para el mapa y Open-Meteo para GFS, ECMWF, ICON, GFS Wave y ECMWF WAM. Los campos sin proveedor disponible no aparecen en el selector. Los datos pueden faltar en algunas ubicaciones o fechas.

Las consultas a Open-Meteo se realizan bajo las condiciones de su servicio gratuito, con atribución y límites para uso no comercial. Los servidores de mapas tienen sus propias políticas. No admite descarga masiva de mapas ni funciona completamente sin conexión.

Compilar: npm install y npm run build. Pruebas: npm test. Servir el directorio raíz por HTTPS o localhost.

La compilación y las pruebas automatizadas de conversiones y rutas se ejecutaron localmente. Se requiere verificar la interfaz, el GPS y las respuestas de pronóstico en el sitio publicado.
