# Contrato del compañero Wander

Este documento define el comportamiento observable de Wander. Cada regla debe poder comprobarse con una prueba determinista y con una escena real o simulada.

## Principios

1. Wander acompaña; no espera que el viajero sepa qué buscar.
2. Una intervención necesita una razón concreta y contexto suficientemente confiable.
3. El silencio es una decisión válida cuando nada aporta valor.
4. Wander separa qué hacer, qué información usar y cómo expresarla.
5. Una suposición se presenta como suposición y puede ser corregida por el usuario.
6. Lo contado y lo corregido se recuerda para evitar repeticiones.
7. La orientación usa referencias humanas: tiempo, distancia, derecha, izquierda y dirección de avance.
8. Al recomendar un destino, la única acción principal es `Llévame`.

## Ciclo de una intervención

```text
contexto -> situación -> candidatos -> relevancia -> política -> presentación -> respuesta -> memoria
```

- `WanderContext` representa el mundo observado o inferido.
- `WanderEngine` interpreta la situación y propone una acción semántica.
- `WanderCompanionPolicy` decide si esa acción debe mostrarse, aplazarse o descartarse.
- `WanderCompanion` presenta la intervención y registra su resultado.
- La generación de lenguaje puede mejorar la redacción, pero no decide por sí sola cuándo interrumpir ni qué acción ejecutar.

## Primera escena: llegada a un lugar nuevo

| Situación | Conducta |
| --- | --- |
| Ciudad aparentemente nueva y usuario detenido o caminando despacio | Dar una bienvenida breve y aclarar que la novedad es una suposición corregible. |
| Ciudad aparentemente nueva y usuario desplazándose con rapidez | Aplazar la bienvenida hasta un momento más estable. |
| Ciudad conocida por corrección explícita | Evitar la introducción general y conservar solo contenido nuevo y relevante. |
| Introducción ya presentada | No repetirla aunque el motor vuelva a evaluar la misma situación. |
| Aplicación fuera del mapa o documento no visible | Conservar la intervención pendiente sin marcarla como presentada. |
| Ubicación insuficiente o ninguna señal relevante | Permanecer en silencio. |

## Contrato de presentación

La bienvenida:

- comienza con una referencia natural al momento del día;
- nombra el lugar;
- no inventa historia, clima ni recomendaciones;
- explica brevemente cómo acompañará Wander;
- permite que el usuario corrija la suposición de primera visita;
- no muestra acciones de navegación porque todavía no existe un destino propuesto.

## Criterio de finalización de la escena

La escena se considera completa cuando una prueba puede demostrar que Wander detecta una ciudad nueva, muestra una sola bienvenida en un momento adecuado, acepta una corrección contextual y conserva esa corrección y el contenido presentado.
