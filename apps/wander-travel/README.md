# Wander Travel

Versión: **v0.101.0**

Wander Travel combina una base técnica estable para observar el viaje con el primer ciclo funcional del compañero: interpreta la llegada a un lugar aparentemente nuevo, espera un momento apropiado, da una bienvenida contextual, acepta una corrección del usuario y recuerda lo presentado.

La versión v0.96.0 añade el primer descubrimiento contextual: durante una caminata o permanencia, Wander puede seleccionar un POI turístico cercano, describir su posición con lenguaje humano y aportar únicamente información respaldada por los datos normalizados disponibles.

La versión v0.97.0 conecta la acción `Llévame` con rutas peatonales reales. La clave permanece en Cloudflare, la ruta se representa sobre el mapa y Wander ofrece instrucciones de maniobra sin referencias a la posición visual del mapa.

La versión v0.98.0 incorpora un presupuesto persistente de intervenciones: separa mensajes consecutivos, limita descubrimientos no solicitados, guarda los descartes y suspende nuevas sugerencias mientras existe una navegación activa.

La versión v0.99.1 corrige la integridad del contexto observado en uso real: el simulador ya no hereda el estado estacionario del GPS, las permanencias abiertas se reconcilian al reaparecer lejos de su centro y Contexto presenta valores humanos en español.

La versión v0.99.2 separa el proveedor de contexto del origen de ubicación. La web continúa usando Geolocation y una futura aplicación móvil puede conectar un origen nativo sin duplicar el motor ni alterar el simulador. El contrato establece que Wander acompaña en primer y segundo plano, y se detiene cuando el usuario cierra explícitamente la aplicación.

La versión v0.100.1 alinea el ícono y la pantalla de inicio de Android con la identidad visual de Wander y conserva el centrado seleccionado durante el zoom con dos dedos. Mantiene además el contenedor Android incorporado en v0.100.0: un servicio de ubicación visible conserva el contexto mientras la aplicación está en primer o segundo plano, y quitar Wander de las aplicaciones recientes detiene el acompañamiento.

La versión v0.100.2 reemplaza la respuesta escrita de familiaridad por decisiones explícitas y presenta todas las intervenciones del compañero desde el borde superior, cubriendo por completo la W y el dashboard mientras están activas.

La versión v0.101.0 convierte Android en un contenedor nativo estable: carga la web publicada cuando existe conexión y conserva el último shell íntegro para uso sin red, con la versión incluida en la APK como recuperación. También incorpora el acelerómetro nativo como evidencia auxiliar de movimiento en primer y segundo plano.

## Arquitectura activa

- **WanderContext** mantiene las señales observadas e inferidas del entorno.
- **WanderEngine** interpreta ubicación, movimiento, transiciones, memoria geográfica y continuidad del viaje.
- **Providers** obtienen ubicación, lugar, POIs, contenedores geográficos y simulación.
- **LocationSources** selecciona la captura web actual o un origen nativo compatible con segundo plano.
- **UI** representa únicamente funciones conectadas a datos o acciones reales.

El orden de carga está declarado de forma determinista en `index.html`. `app.js` inicializa los providers, publica `wander:app-ready` y registra el service worker; no carga módulos adicionales de forma dinámica.

## Funciones activas

- Ubicación real y posición efectiva de simulación.
- Estado de movimiento con filtrado de deriva de GPS.
- Inferencia gradual del método de desplazamiento.
- Context dashboard configurable y ordenable.
- POIs normalizados desde Google Places, OpenStreetMap y Wikidata.
- Detección de POI y contenedor actual.
- Puntos personales y selector de posición.
- Sesiones automáticas con movimiento, permanencias, historial y exportación.
- Memoria geográfica y continuidad de Journey.
- Política de intervenciones y bienvenida a ciudades o países aparentemente nuevos.
- Corrección contextual de familiaridad y memoria del contenido presentado.
- Descubrimiento silencioso de POIs relevantes, con distancia y dirección humanas.
- Rutas peatonales mediante Google Routes y seguimiento básico de pasos.
- Simulador de ubicación y movimiento.
- PWA con caché offline versionado.

## Fuentes de POIs

Todas las fuentes que ingresan al pipeline deben producir `NormalizedPOI` y cumplir una política explícita.

- Google Places: conector activo mediante la función `/api/places/nearby`.
- OpenStreetMap: conector activo mediante Overpass.
- Wikidata: conector activo mediante SPARQL.
- Google Maps y Tripadvisor: políticas `external_only`; no se automatizan ni se almacenan en el pipeline.

## Desarrollo local

Desde la raíz del repositorio:

```bash
python -m http.server 8000 --directory apps/wander-travel
```

Abrir `http://localhost:8000`.

## Android

La aplicación móvil usa Capacitor y conserva el runtime web como única implementación de la interfaz y del motor contextual.

```bash
cd apps/wander-travel
npm ci
npm run android:apk
```

El APK de depuración queda en `android/app/build/outputs/apk/debug/app-debug.apk`. El workflow `Build Wander Android` ejecuta el mismo proceso y publica el APK como artefacto descargable.

## Pruebas

```bash
for test in apps/wander-travel/tests/*.mjs; do node "$test"; done
```

Los tests cubren escenarios del engine, contrato y consolidación de POIs, conectores, NearbyProvider, dashboard y consistencia del shell PWA.

## Reglas de mantenimiento

- No incorporar placeholders ni controles sin comportamiento real.
- No conservar copias, fragmentos de importación o módulos retirados dentro del repositorio.
- Corregir la responsabilidad original antes de agregar un módulo de compensación.
- Mantener un único origen para la versión de la app: `runtime-version.js`.
- Declarar todos los scripts y estilos activos en `index.html` y en el shell offline.
- Actualizar o eliminar las pruebas cuando cambie deliberadamente un contrato.
- Actualizar la versión en cada cambio relevante.

## Deploy

Proyecto Cloudflare Pages: `wander-travel`

URL pública: `https://wander-travel.pages.dev`
