# Boat Station Core — Arquitectura definitiva y roadmap

Este documento es la referencia canónica para cualquier cambio futuro en el Core Android de Boat Station.

## Principio rector

**Android accede. La PWA entiende.**

La APK debe contener únicamente capacidades nativas, acceso a hardware, permisos, lifecycle Android y transporte de datos de bajo nivel.

La PWA contiene la lógica de producto, drivers de dispositivos, protocolos, parsers, reglas, configuración funcional, históricos, automatizaciones y UI.

Si un cambio modifica el significado de los datos, debe resolverse en la PWA.
Si un cambio modifica cómo Android accede físicamente al hardware o mantiene una capacidad nativa, pertenece a la APK.

## Arquitectura objetivo

### APK / Core nativo

La APK expone APIs genéricas y estables:

- `CoreBLE`
  - permisos Bluetooth
  - scan
  - connect / disconnect
  - reconexión
  - discovery de services/characteristics
  - request MTU
  - subscribe / unsubscribe notifications e indications
  - read / write bytes
  - RSSI
  - errores GATT
  - persistencia de conexiones de bajo nivel

- `CoreLocation`
  - permisos de ubicación
  - posición
  - precisión
  - velocidad
  - bearing
  - altitude
  - timestamps
  - operación en background

- `CoreSensors`
  - acelerómetro
  - giroscopio
  - rotation vector / orientación
  - magnetómetro
  - barómetro y otros sensores disponibles
  - timestamps

- `CoreUSB`
  - detección de dispositivos
  - permisos
  - apertura/cierre de puerto
  - configuración serial
  - read/write bytes

- `CoreNetwork`
  - conectividad
  - sockets cuando sean necesarios
  - descubrimiento local cuando sea necesario
  - transporte de bytes/datos sin interpretar protocolos de producto

- `CoreStorage`
  - import/export de archivos
  - acceso a almacenamiento Android
  - almacenamiento nativo cuando haga falta

- `CoreNotifications`
  - notificaciones Android
  - sonidos
  - TTS
  - alarmas nativas

- `CoreBackground`
  - foreground service
  - wake locks
  - lifecycle persistente
  - mantener BLE/GPS/otros transports activos con pantalla apagada

- Capacidades adicionales futuras siguen la misma regla: cámara, micrófono, NFC, etc. La APK expone la capacidad; la PWA define su uso.

### PWA / Boat Station

La PWA contiene:

- drivers específicos de dispositivos
- UUIDs y protocolos BLE
- parsers y checksums
- secuencias de inicialización
- polling específico
- interpretación de bytes
- SOC, voltaje, corriente, temperatura, etc.
- protocolos NMEA / Signal K / otros
- grabación y gestión de rutas
- Sea State y cálculos derivados
- configuración funcional
- históricos
- alarmas y reglas
- UI completa
- Remote

Ejemplo de drivers PWA:

```text
drivers/
  ble/
    humsienk.js
    jbd.js
    daly.js
    victron.js
  serial/
    nmea0183.js
  network/
    signalk.js
```

## Contrato general APK ↔ PWA

Los bridges nativos deben usar comandos y eventos genéricos. Ejemplo BLE:

```javascript
CoreBLE.scan()
CoreBLE.connect(deviceId)
CoreBLE.requestMtu(deviceId, 247)
CoreBLE.getServices(deviceId)
CoreBLE.subscribe(deviceId, serviceUuid, characteristicUuid)
CoreBLE.write(deviceId, serviceUuid, characteristicUuid, bytes)
CoreBLE.read(deviceId, serviceUuid, characteristicUuid)
CoreBLE.disconnect(deviceId)
```

Eventos:

```text
ble-device
ble-connected
ble-disconnected
ble-services
ble-mtu
ble-notification
ble-read
ble-write
ble-error
```

La APK nunca debe emitir eventos como `battery-soc` o `humsienk-data`: eso ya es interpretación de producto y pertenece a la PWA.

## Migración — orden obligatorio

### Fase 0 — Estabilizar la versión actual

- [ ] Validar Core 1.2.3 en S24.
- [ ] Validar Core 1.2.3 en A50.
- [ ] Confirmar que BLE transmite datos correctamente en ambos.
- [ ] No retirar todavía el camino BLE legado hasta tener el nuevo transporte validado.

### Fase 1 — CoreBLE genérico

- [ ] Crear API nativa `CoreBLE` independiente de baterías.
- [ ] Implementar scan genérico.
- [ ] Implementar connect/disconnect genérico.
- [ ] Implementar request MTU por callbacks.
- [ ] Implementar service/characteristic discovery.
- [ ] Implementar subscribe/unsubscribe genérico.
- [ ] Implementar read/write bytes.
- [ ] Implementar eventos de datos/error/lifecycle.
- [ ] Implementar reconexión robusta sin lógica específica de BMS.
- [ ] Crear `drivers/ble/humsienk.js` en la PWA.
- [ ] Mover UUIDs, frames, checksum, parser y polling Humsienk a la PWA.
- [ ] Probar simultáneamente en S24 y A50.
- [ ] Solo después eliminar lógica Humsienk de Java.

### Fase 2 — Background Service

- [ ] Crear `BoatStationCoreService` como foreground service.
- [ ] Hacer que el service sea dueño de transports persistentes.
- [ ] Desacoplar BLE/GPS de la Activity/WebView.
- [ ] Mantener conexiones aunque la Activity se pause/recree.
- [ ] Implementar wake lock únicamente cuando sea necesario.
- [ ] Validar pantalla apagada y retorno a foreground.

### Fase 3 — CoreLocation

- [ ] Exponer ubicación nativa genérica.
- [ ] La APK entrega únicamente datos normalizados y timestamps.
- [ ] Mover grabación de rutas, filtros y lógica GPS totalmente a PWA.
- [ ] Integrar lifecycle con `BoatStationCoreService`.

### Fase 4 — CoreSensors

- [ ] Exponer sensores disponibles de forma genérica.
- [ ] Implementar rate/subscription configurable desde PWA.
- [ ] Mover cálculos de Compass/Sea State y derivados a PWA.
- [ ] Evitar llamadas JS por evento sin throttling/batching.

### Fase 5 — CoreStorage / Notifications / TTS

- [ ] Generalizar import/export de archivos.
- [ ] Mantener GPX como interpretación PWA, no nativa.
- [ ] Generalizar notificaciones/TTS/alarmas.
- [ ] La PWA define contenido, prioridad y reglas.

### Fase 6 — CoreUSB / CoreNetwork / NFC / Camera / Audio

- [ ] Agregar únicamente cuando Boat Station necesite la capacidad.
- [ ] Siempre exponer transporte/capacidad genérica.
- [ ] Nunca incorporar el protocolo específico del dispositivo dentro de Java/Kotlin.

### Fase 7 — Eliminar arquitectura heredada

Actualmente existe herencia entre actividades/versiones. La arquitectura final debe eliminarla.

Objetivo:

```text
BoatStationActivity
  ↕
BoatStationCoreService
  ├── BleTransport
  ├── LocationTransport
  ├── SensorTransport
  ├── UsbTransport
  ├── NetworkTransport
  ├── StorageTransport
  └── NotificationTransport
```

- [ ] Migrar responsabilidades fuera de `MainActivity`.
- [ ] Eliminar `MainActivityV100` cuando ya no tenga responsabilidades.
- [ ] Eliminar `MainActivityCore` como capa de patches/herencia.
- [ ] Dejar una sola Activity fina de producción.
- [ ] No mantener versiones de comportamiento mediante herencia de Activities.

## Reglas de implementación

1. No agregar patches temporales a la arquitectura. Si aparece una incompatibilidad, corregir la abstracción correspondiente.
2. No duplicar caminos para la misma operación. Una acción local y una remota deben terminar en la misma función de dominio PWA.
3. No poner protocolos específicos en Java/Kotlin.
4. No reconstruir UI debido a datos nativos; los transports publican datos y la PWA decide cómo renderizarlos.
5. Todo transporte debe tener estados explícitos, errores explícitos y lifecycle explícito.
6. Las operaciones Android asíncronas deben encadenarse por callbacks/estado real, no mediante delays arbitrarios salvo timeouts de seguridad.
7. La APK debe poder permanecer estable durante largos períodos. Una APK nueva debería ser necesaria solo por una nueva capacidad Android, una corrección del transporte nativo o requisitos del sistema operativo.
8. Los drivers PWA deben poder actualizarse sin recompilar la APK.
9. Antes de eliminar una implementación antigua, validar la nueva en al menos S24 y A50 para las capacidades que ambos soporten.
10. Este archivo debe revisarse antes de cualquier refactor importante del Core y actualizarse al completar cada fase.

## Criterio de finalización

La migración estará terminada cuando:

- la APK no contenga nombres, UUIDs, parsers o comandos de dispositivos específicos;
- la Activity no sea dueña de conexiones persistentes;
- la PWA pueda agregar/corregir drivers sin nueva APK;
- BLE, GPS y sensores continúen funcionando con pantalla apagada según configuración;
- la UI pueda reiniciarse sin perder las conexiones nativas activas;
- no queden Activities heredadas usadas como parches de versiones anteriores.
