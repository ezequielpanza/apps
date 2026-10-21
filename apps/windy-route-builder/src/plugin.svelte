<script lang="ts">
    import { onDestroy, onMount } from 'svelte';
    import { map } from '@windy/map';
    import config from './pluginConfig.js';

    type Waypoint = { id: number; lat: number; lon: number };

    const { name, title } = config;
    let points: Waypoint[] = [];
    let message = 'El primer clic fija el inicio. Sigue haciendo clic para trazar la ruta.';
    let distanceNm = 0;
    let nextPointId = 1;
    let waypointLayer: L.LayerGroup | null = null;
    let routeLine: L.Polyline | null = null;

    $: ordered = points.map((point, index) => ({
        ...point,
        role: index === 0 ? 'Inicio' : index === points.length - 1 ? 'Destino' : `Intermedio ${index}`,
        key: String(point.id),
    }));

    function haversineNm(a: Waypoint, b: Waypoint): number {
        const rad = (degrees: number) => degrees * Math.PI / 180;
        const dLat = rad(b.lat - a.lat);
        const dLon = rad(b.lon - a.lon);
        const lat1 = rad(a.lat);
        const lat2 = rad(b.lat);
        const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
        return 3440.065 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
    }

    function recalculate(): void {
        distanceNm = points.slice(1).reduce((sum, point, index) => {
            return sum + haversineNm(points[index], point);
        }, 0);
        redrawMap();
    }

    function redrawRouteLine(): void {
        routeLine?.removeFrom(map);
        routeLine = null;
        if (points.length > 1) {
            routeLine = L.polyline(points.map(point => [point.lat, point.lon]), {
                color: '#00a6d6', weight: 4, opacity: 0.95, interactive: false,
            }).addTo(map);
        }
    }

    function redrawMap(): void {
        if (!waypointLayer) return;
        waypointLayer.clearLayers();
        redrawRouteLine();

        points.forEach((point, index) => {
            const role = index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'via';
            const marker = L.marker([point.lat, point.lon], {
                icon: L.divIcon({
                    className: 'route-builder-marker-wrap',
                    html: `<span class="route-builder-marker route-builder-marker--${role}">${index + 1}</span>`,
                    iconSize: [30, 30], iconAnchor: [15, 15],
                }),
                draggable: true,
                bubblingMouseEvents: false,
            });
            marker.on('click', (event: any) => {
                const originalEvent = event?.originalEvent;
                if (originalEvent) L.DomEvent.stopPropagation(originalEvent);
            });
            marker.on('dragend', (event: any) => {
                const position = event.target.getLatLng();
                points = points.map(current => current.id === point.id
                    ? { ...current, lat: position.lat, lon: position.lng }
                    : current);
                message = `Punto ${index + 1} reubicado.`;
                distanceNm = points.slice(1).reduce((sum, currentPoint, currentIndex) => {
                    return sum + haversineNm(points[currentIndex], currentPoint);
                }, 0);
                redrawRouteLine();
            });
            marker.bindTooltip(`${index + 1}. ${role === 'start' ? 'Inicio' : role === 'end' ? 'Destino' : `Intermedio ${index}`}`);
            waypointLayer?.addLayer(marker);
        });
    }

    function distanceToSegment(point: L.Point, start: L.Point, end: L.Point): number {
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const lengthSquared = dx * dx + dy * dy;
        if (!lengthSquared) return point.distanceTo(start);
        const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
        return point.distanceTo(L.point(start.x + t * dx, start.y + t * dy));
    }

    function onMapClick(event: any): void {
        const lat = Number(event?.lat ?? event?.latlng?.lat);
        const lon = Number(event?.lon ?? event?.lng ?? event?.latlng?.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
            message = 'Windy no devolvió coordenadas para ese clic. Vuelve a intentarlo.';
            return;
        }
        const point: Waypoint = { id: nextPointId++, lat, lon };
        const clickedAt = map.latLngToContainerPoint([lat, lon]);
        let insertAt = -1;
        // Only treat a click as an intermediate insertion when it lands very close
        // to the visible route line. Otherwise, keep extending the route at the end.
        let closestDistance = 7;
        for (let index = 0; index < points.length - 1; index++) {
            const segmentStart = map.latLngToContainerPoint([points[index].lat, points[index].lon]);
            const segmentEnd = map.latLngToContainerPoint([points[index + 1].lat, points[index + 1].lon]);
            const distance = distanceToSegment(clickedAt, segmentStart, segmentEnd);
            if (distance <= closestDistance) {
                closestDistance = distance;
                insertAt = index + 1;
            }
        }
        if (insertAt >= 0) {
            points = [...points.slice(0, insertAt), point, ...points.slice(insertAt)];
            message = `Punto intermedio insertado en el tramo ${insertAt}.`;
        } else {
            points = [...points, point];
            message = points.length === 1 ? 'Inicio fijado. Haz clic en el mapa para continuar la ruta.'
                : `Punto ${points.length} agregado. El último punto es el destino.`;
        }
        recalculate();
    }

    function onMapDomClick(event: MouseEvent): void {
        const target = event.target as HTMLElement | null;
        if (target?.closest('.route-builder-marker-wrap, .leaflet-control')) return;
        const position = map.mouseEventToLatLng(event);
        onMapClick({ lat: position.lat, lon: position.lng });
    }

    function removePoint(key: string): void {
        points = points.filter(point => String(point.id) !== key);
        recalculate();
    }

    function moveVia(index: number, direction: -1 | 1): void {
        const target = index + direction;
        if (target < 1 || target >= points.length - 1) return;
        const next = [...points];
        [next[index], next[target]] = [next[target], next[index]];
        points = next;
        recalculate();
    }

    function clearRoute(): void {
        points = [];
        distanceNm = 0;
        message = 'El primer clic fija el inicio. Sigue haciendo clic para trazar la ruta.';
        redrawMap();
    }

    function setStartPoint(): void {
        const center = map.getCenter();
        const start: Waypoint = { id: points[0]?.id ?? nextPointId++, lat: center.lat, lon: center.lng };
        points = points.length ? [start, ...points.slice(1)] : [start];
        message = 'Punto 1 fijado como Inicio en el centro actual del mapa.';
        recalculate();
    }

    export const onopen = (location?: { lat: number; lon: number }) => {
        const center = map.getCenter();
        const lat = Number(location?.lat);
        const lon = Number(location?.lon);
        const start = Number.isFinite(lat) && Number.isFinite(lon)
            ? { lat, lon }
            : { lat: center.lat, lon: center.lng };
        points = [{ id: nextPointId++, lat: start.lat, lon: start.lon }];
        message = 'Inicio fijado en la última posición. Haz clic en el mapa para continuar la ruta.';
        recalculate();
    };

    function coordinate(point: Waypoint): string {
        return `${point.lat.toFixed(4)}, ${point.lon.toFixed(4)}`;
    }

    onMount(() => {
        waypointLayer = L.layerGroup().addTo(map);
        map.getContainer().addEventListener('click', onMapDomClick, true);
        if (points.length > 0) recalculate();
    });

    onDestroy(() => {
        map.getContainer().removeEventListener('click', onMapDomClick, true);
        waypointLayer?.removeFrom(map);
        routeLine?.removeFrom(map);
    });
</script>

<div class="plugin__mobile-header">{title}</div>
<section class="plugin__content route-builder">
    <div class="plugin__title plugin__title--chevron-back">{title}</div>
    <div class="panel-kicker"><span class="status-dot"></span><span>PLANIFICADOR DE RUTA</span><span class="beta">BETA</span></div>
    <p class="intro">Haz clic en el mapa para agregar puntos. El último será el destino; al tocar un tramo, insertas un punto intermedio.</p>

    <button class="set-start" on:click={setStartPoint}>
        <span class="start-symbol">●</span><span>Inicio</span><small>Fijar punto 1 en el centro del mapa</small>
    </button>

    <div class="map-instruction" aria-live="polite">
        <span class="instruction-icon">⌖</span><span>{message}</span>
    </div>

    <div class="route-summary">
        <div class="summary-copy"><span class="summary-label">DISTANCIA ESTIMADA</span><span class="summary-points">{ordered.length} {ordered.length === 1 ? 'punto' : 'puntos'} en ruta</span></div>
        <strong>{distanceNm.toFixed(1)} <small>Nm</small></strong>
    </div>

    <div class="waypoint-heading">
        <div class="heading-title"><h3>Recorrido</h3><span class="point-count">{ordered.length}</span></div>
        <button class="clear" on:click={clearRoute} disabled={ordered.length === 0}>Limpiar</button>
    </div>

    {#if ordered.length === 0}
        <div class="empty"><span class="empty-mark">⌖</span><strong>Tu ruta empieza aquí</strong><span>Selecciona <b>Inicio</b> y marca un punto en el mapa.</span></div>
    {:else}
        <ol class="waypoints">
            {#each ordered as point, index (point.key)}
                <li class:destination={index === points.length - 1 && index > 0} class:origin={index === 0}>
                    <span class="number" class:first={index === 0} class:last={index === points.length - 1 && index > 0}>{index + 1}</span>
                    <span class="point-info">
                        <strong>{point.role}</strong>
                        <small>{coordinate(point)}</small>
                    </span>
                    <span class="point-actions">
                        {#if index > 0 && index < points.length - 1}
                            <button class="icon-button" aria-label="Mover arriba" title="Mover arriba" on:click={() => moveVia(index, -1)} disabled={index <= 1}>↑</button>
                            <button class="icon-button" aria-label="Mover abajo" title="Mover abajo" on:click={() => moveVia(index, 1)} disabled={index >= points.length - 2}>↓</button>
                        {/if}
                        <button class="icon-button remove-button" aria-label="Eliminar punto" title="Eliminar punto" on:click={() => removePoint(point.key)}>×</button>
                    </span>
                </li>
            {/each}
        </ol>
    {/if}
    <div class="footnote"><span>ⓘ</span> La línea une los puntos en orden; no calcula navegación costera ni evita tierra.</div>
</section>

<style>
    .route-builder { color: #f2f5f6; padding: 0 12px 18px; font-family: inherit; }
    .panel-kicker { display: flex; align-items: center; gap: 7px; margin: 2px 0 9px; color: #9ca6aa; font-size: 10px; font-weight: 700; letter-spacing: .12em; }
    .status-dot { width: 7px; height: 7px; border-radius: 50%; background: #00c9a7; box-shadow: 0 0 8px #00c9a766; }
    .beta { margin-left: auto; padding: 2px 6px; border: 1px solid #50595d; border-radius: 3px; color: #aab4b8; font-size: 9px; letter-spacing: .06em; }
    .intro { color: #b4bdc0; font-size: 12px; line-height: 1.45; margin: 0 0 14px; }
    .set-start { display: flex; align-items: center; gap: 9px; width: 100%; min-height: 44px; margin: 0 0 10px; padding: 8px 11px; border: 1px solid #32785f; border-radius: 5px; background: #263f38; color: #f1f7f4; cursor: pointer; font: inherit; text-align: left; }
    .set-start:hover { border-color: #62cfaa; background: #2d5044; }
    .set-start .start-symbol { display: grid; place-items: center; flex: 0 0 22px; width: 22px; height: 22px; border-radius: 50%; background: #27aa78; color: #fff; font-size: 10px; }
    .set-start small { margin-left: auto; color: #b9cbc3; font-size: 10px; }
    .actions { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 7px; }
    .action { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 5px; min-height: 62px; padding: 8px 3px; border: 1px solid #51595c; border-radius: 5px; background: #414648; color: #e6ebed; cursor: pointer; font: inherit; transition: background .15s, border-color .15s, transform .15s; }
    .action:hover { border-color: #8b989c; background: #4b5254; }
    .action:active { transform: translateY(1px); }
    .action.start-active, .action.via-active, .action.end-active { border-color: #00b7df; background: #075a70; color: #fff; box-shadow: inset 0 0 0 1px #00b7df44; }
    .action-symbol { display: grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; background: #00a6d6; color: white; font-size: 15px; font-weight: 700; line-height: 1; }
    .start-symbol { background: #27aa78; font-size: 10px; }
    .end-symbol { background: #e36e5b; font-size: 13px; }
    .action-label { overflow: hidden; max-width: 100%; color: #f4f7f8; font-size: 11px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
    .map-instruction { display: flex; align-items: center; gap: 9px; min-height: 38px; margin: 10px 0; padding: 8px 10px; border: 1px solid #444c4f; border-radius: 4px; background: #303638; color: #c3cbce; font-size: 11px; line-height: 1.4; }
    .map-instruction.awaiting { border-color: #087f9e; background: #113e49; color: #e1f8fd; }
    .instruction-icon { display: grid; place-items: center; flex: 0 0 19px; width: 19px; height: 19px; border-radius: 50%; background: #596367; color: white; font-size: 11px; font-weight: 700; }
    .awaiting .instruction-icon { background: #00a6d6; }
    .route-summary { display: flex; align-items: center; justify-content: space-between; min-height: 66px; padding: 11px 13px; border: 1px solid #087e9d; border-left: 3px solid #00bce5; border-radius: 5px; background: linear-gradient(120deg, #124653, #2e3c40 72%); color: #fff; }
    .summary-copy { display: flex; flex-direction: column; gap: 5px; }
    .summary-label { color: #a9dbe5; font-size: 9px; font-weight: 700; letter-spacing: .11em; }
    .summary-points { color: #c5cfd2; font-size: 11px; }
    .route-summary strong { color: #fff; font-size: 24px; font-weight: 650; font-variant-numeric: tabular-nums; letter-spacing: -.03em; }
    .route-summary small { color: #b9d9df; font-size: 11px; font-weight: 500; letter-spacing: 0; }
    .waypoint-heading { display: flex; justify-content: space-between; align-items: center; margin-top: 16px; padding-bottom: 8px; border-bottom: 1px solid #4b5255; }
    .heading-title { display: flex; align-items: center; gap: 8px; }
    .waypoint-heading h3 { color: #f1f4f5; font-size: 13px; font-weight: 650; margin: 0; }
    .point-count { display: grid; place-items: center; min-width: 19px; height: 19px; padding: 0 5px; border-radius: 10px; background: #454d50; color: #d3dbde; font-size: 10px; font-weight: 700; }
    .clear { border: 0; background: transparent; color: #f08b7b; cursor: pointer; font: inherit; font-size: 11px; }
    .clear:hover:not(:disabled) { color: #ffb1a5; }
    .clear:disabled { color: #727b7e; cursor: default; }
    .empty { display: flex; flex-direction: column; align-items: center; gap: 7px; padding: 23px 12px; color: #9ba5a9; font-size: 11px; line-height: 1.45; text-align: center; }
    .empty strong { color: #e0e6e8; font-size: 12px; }
    .empty b { color: #cdebf0; font-weight: 600; }
    .empty-mark { display: grid; place-items: center; width: 32px; height: 32px; margin-bottom: 2px; border: 1px solid #596367; border-radius: 50%; color: #8ad4e4; font-size: 18px; }
    .waypoints { margin: 0; padding: 0; list-style: none; }
    .waypoints li { display: flex; align-items: center; gap: 9px; min-height: 48px; border-bottom: 1px solid #42494c; }
    .number { display: grid; place-items: center; width: 23px; height: 23px; flex: 0 0 23px; border: 1px solid #83d5e7; border-radius: 50%; background: #12657a; color: white; font-size: 10px; font-weight: 700; }
    .number.first { border-color: #62cfaa; background: #176c54; }
    .number.last { border-color: #f1a095; background: #a94e43; }
    .point-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
    .point-info strong { overflow: hidden; color: #edf1f2; font-size: 11px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
    .point-info small { color: #a1abae; font-size: 10px; font-variant-numeric: tabular-nums; }
    .point-actions { display: flex; gap: 4px; }
    .icon-button { display: grid; place-items: center; width: 25px; height: 25px; border: 1px solid #555e61; border-radius: 4px; background: #3d4446; color: #e3e8e9; cursor: pointer; font: inherit; font-size: 13px; }
    .icon-button:hover:not(:disabled) { border-color: #00a6d6; background: #125267; color: #fff; }
    .icon-button:disabled { color: #747d80; cursor: default; }
    .remove-button { color: #f09a8d; font-size: 17px; }
    .footnote { display: flex; gap: 6px; margin-top: 12px; color: #a1aaad; font-size: 10px; line-height: 1.45; }
    .footnote span { flex: 0 0 auto; color: #67b9cb; }
    :global(.route-builder-marker-wrap) { background: transparent; border: 0; }
    :global(.route-builder-marker) { position: relative; isolation: isolate; display: grid; place-items: center; width: 27px; height: 27px; border: 0; border-radius: 50%; background: transparent; color: white; font: bold 8.8px Arial,sans-serif; }
    :global(.route-builder-marker::before) { content: ''; position: absolute; inset: 6.5px; border: 1px solid #00a6d6; border-radius: 50%; background: #00a6d6; box-shadow: 0 1px 3px #0008; z-index: -1; }
    :global(.route-builder-marker--start::before) { border-color: #21a366; background: #21a366; }
    :global(.route-builder-marker--end::before) { border-color: #cf5947; background: #cf5947; }
</style>

