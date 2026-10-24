# TapSense Restaurant

Primera versión navegable de la webapp, pensada para clientes que entran desde un QR o una etiqueta NFC. La demo incluye menú por categorías, búsqueda, carrito, envío de pedidos, llamado al mozo, panel de cocina/servicio y disponibilidad básica de platos.

## Abrir

Se puede abrir `index.html` directamente en un navegador. Para probar la instalación como PWA y el modo sin conexión, servir esta carpeta por HTTP, por ejemplo:

```sh
python3 -m http.server 4173
```

Luego visitar `http://localhost:4173/?table=08`. Cambiá `08` por el número de mesa que corresponda al QR o NFC; ambos abren el mismo servicio web.

## Alcance de esta versión

Esta es una demo de interfaz. El carrito y los pedidos se guardan en el almacenamiento local del dispositivo; por eso el panel no sincroniza pedidos entre celulares. Los pedidos, mesas, llamado al mozo, login, persistencia compartida y pagos requieren conectar un backend antes de operar en un restaurante real. Los platos y el restaurante son datos de muestra.
