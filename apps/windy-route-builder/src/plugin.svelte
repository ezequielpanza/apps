<script lang="ts">
    import { onDestroy, onMount } from 'svelte';
    import { map } from '@windy/map';
    import { singleclick } from '@windy/singleclick';
    import config from './pluginConfig.js';

    type Waypoint = { lat: number; lon: number };
    type SelectionMode = 'idle' | 'start' | 'via' | 'end';

    const { name, title } = config;
    let start: Waypoint | null = null;
    let vias: Waypoint[] = [];
    let end: Waypoint | null = null;
    let mode: SelectionMode = 'idle';
    let message = 'Elige una acción y haz clic sobre el mapa.';
    let distanceNm = 0;
    let waypointLayer: L.LayerGroup | null = null;
    let routeLine: L.Polyline | null = null;

    $: ordered = [
        ...(start ? [{ ...start, role: 'Inicio', key: 'start' }] : []),
        ...vias.map((point, index) => ({ ...point, role: `Intermedio ${index + 1}`, key: `via-${index}` })),
        ...(end ? [{ ...end, role: 'Destino', key: 'end' }] : []),
    ];

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
        distanceNm = ordered.slice(1).reduce((sum, point, index) => {
            return sum + haversineNm(ordered[index], point);
        }, 0);
        redrawMap();
    }

    function redrawMap(): void {
        if (!waypointLayer) return;
        waypointLayer.clearLayers();
        routeLine?.removeFrom(map);
        routeLine = null;

        if (ordered.length > 1) {
            routeLine = L.polyline(ordered.map(point => [point.lat, point.lon]), {
                color: '#00a6d6', weight: 4, opacity: 0.95,
            }).addTo(map);
        }

        ordered.forEach((point, index) => {
            const role = index === 0 ? 'start' : index === ordered.length - 1 && end ? 'end' : 'via';
            const marker = L.marker([point.lat, point.lon], {
                icon: L.divIcon({
                    className: 'route-builder-marker-wrap',
                    html: `<span class="route-builder-marker route-builder-marker--${role}">${index + 1}</span>`,
                    iconSize: [30, 30], iconAnchor: [15, 15],
                }),
            });
            marker.bindTooltip(`${index + 1}. ${role === 'start' ? 'Inicio' : role === 'end' ? 'Destino' : `Intermedio ${index}`}`);
            waypointLayer?.addLayer(marker);
        });
    }

    function selectMode(next: SelectionMode): void {
        if ((next === 'via' || next === 'end') && !start) {
            message = 'Primero fija el punto de inicio.';
            mode = 'idle';
            return;
        }
        mode = next;
        message = next === 'start' ? 'Haz clic en el mapa para fijar el inicio.'
            : next === 'end' ? 'Haz clic en el mapa para fijar el destino.'
            : next === 'via' ? 'Haz clic en el mapa para añadir un punto intermedio.'
            : 'Elige una acción y haz clic sobre el mapa.';
    }

    function onMapClick(event: any): void {
        if (mode === 'idle') return;
        const selectedMode = mode;
        const lat = Number(event?.lat ?? event?.latlng?.lat);
        const lon = Number(event?.lon ?? event?.lng ?? event?.latlng?.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
            message = 'Windy no devolvió coordenadas para ese clic. Vuelve a intentarlo.';
            return;
        }
        const point = { lat, lon };
        if (selectedMode === 'start') start = point;
        else if (selectedMode === 'end') end = point;
        else vias = [...vias, point];
        mode = 'idle';
        const pointLabel = selectedMode === 'start' ? 'Inicio' : selectedMode === 'end' ? 'Destino' : 'Punto intermedio';
        message = `${pointLabel} agregado: ${lat.toFixed(4)}, ${lon.toFixed(4)}.`;
        recalculate();
    }

    function removePoint(key: string): void {
        if (key === 'start') {
            start = null;
            vias = [];
            end = null;
        }
        else if (key === 'end') end = null;
        else vias = vias.filter((_, index) => key !== `via-${index}`);
        recalculate();
    }

    function moveVia(index: number, direction: -1 | 1): void {
        const target = index + direction;
        if (target < 0 || target >= vias.length) return;
        const next = [...vias];
        [next[index], next[target]] = [next[target], next[index]];
        vias = next;
        recalculate();
    }

    function clearRoute(): void {
        start = null;
        vias = [];
        end = null;
        distanceNm = 0;
        mode = 'idle';
        message = 'Ruta borrada. Elige una acción y haz clic sobre el mapa.';
        redrawMap();
    }

    function coordinate(point: Waypoint): string {
        return `${point.lat.toFixed(4)}, ${point.lon.toFixed(4)}`;
    }

    onMount(() => {
        waypointLayer = L.layerGroup().addTo(map);
        singleclick.on(name, onMapClick);
    });

    onDestroy(() => {
        singleclick.off(name, onMapClick);
        waypointLayer?.removeFrom(map);
        routeLine?.removeFrom(map);
    });
</script>

<div class="plugin__mobile-header">{title}</div>
<section class="plugin__content route-builder">
    <div class="plugin__title plugin__title--chevron-back">{title}</div>
    <p class="intro">Marca los puntos directamente en el mapa. Puedes cambiar el orden de los puntos intermedios.</p>

    <div class="actions">
        <button class:active={mode === 'start'} on:click={() => selectMode('start')}>＋ Fijar inicio</button>
        <button class:active={mode === 'via'} on:click={() => selectMode('via')}>＋ Añadir intermedio</button>
        <button class:active={mode === 'end'} on:click={() => selectMode('end')}>⚑ Fijar destino</button>
    </div>

    <div class="map-instruction" aria-live="polite">{message}</div>

    <div class="route-summary">
        <span>Distancia estimada</span>
        <strong>{distanceNm.toFixed(1)} <small>Nm</small></strong>
    </div>

    <div class="waypoint-heading">
        <h3>Puntos de la ruta</h3>
        <button class="clear" on:click={clearRoute} disabled={ordered.length === 0}>Borrar ruta</button>
    </div>

    {#if ordered.length === 0}
        <div class="empty">Todavía no hay puntos. Fija el inicio y luego agrega el destino y los puntos intermedios.</div>
    {:else}
        <ol class="waypoints">
            {#each ordered as point, index (point.key)}
                <li>
                    <span class="number" class:first={index === 0} class:last={point.key === 'end'}>{index + 1}</span>
                    <span class="point-info">
                        <strong>{point.role}</strong>
                        <small>{coordinate(point)}</small>
                    </span>
                    <span class="point-actions">
                        {#if point.key.startsWith('via-')}
                            <button aria-label="Mover arriba" title="Mover arriba" on:click={() => moveVia(index - (start ? 1 : 0), -1)} disabled={index <= (start ? 1 : 0)}>↑</button>
                            <button aria-label="Mover abajo" title="Mover abajo" on:click={() => moveVia(index - (start ? 1 : 0), 1)} disabled={index >= vias.length + (start ? 0 : -1)}>↓</button>
                        {/if}
                        <button aria-label="Eliminar punto" title="Eliminar punto" on:click={() => removePoint(point.key)}>×</button>
                    </span>
                </li>
            {/each}
        </ol>
    {/if}
    <div class="footnote">La línea conecta los puntos en el orden de la lista; es una ruta directa entre coordenadas, no navegación que evite tierra.</div>
</section>

<style>
    .route-builder { color: #3b4145; padding-bottom: 22px; }
    .intro { color: #737b80; font-size: 13px; margin: 12px 0 16px; }
    .actions { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; }
    .actions button { border: 1px solid #c8d0d4; border-radius: 4px; background: #f5f7f8; color: #47535a; padding: 9px 8px; cursor: pointer; font-size: 12px; }
    .actions button:first-child { grid-column: span 2; }
    .actions button:hover, .actions button.active { border-color: #008fbd; background: #e4f6fb; color: #087da0; }
    .map-instruction { min-height: 38px; margin: 12px 0; padding: 10px; border-left: 3px solid #00a6d6; background: #f0f8fa; color: #55636a; font-size: 12px; }
    .route-summary { display: flex; align-items: center; justify-content: space-between; border-radius: 4px; padding: 12px; background: #596367; color: white; }
    .route-summary strong { font-size: 21px; font-weight: 600; }
    .route-summary small { font-size: 12px; font-weight: 400; }
    .waypoint-heading { display: flex; justify-content: space-between; align-items: center; margin-top: 18px; border-bottom: 1px solid #e1e4e6; }
    .waypoint-heading h3 { font-size: 14px; margin: 0; padding: 8px 0; }
    .clear { border: 0; background: transparent; color: #a04436; cursor: pointer; font-size: 12px; }
    .clear:disabled { color: #aab0b4; cursor: default; }
    .empty { padding: 18px 8px; color: #889198; font-size: 12px; text-align: center; }
    .waypoints { margin: 0; padding: 0; list-style: none; }
    .waypoints li { display: flex; align-items: center; gap: 10px; min-height: 57px; border-bottom: 1px solid #edf0f1; }
    .number { display: grid; place-items: center; width: 25px; height: 25px; flex: 0 0 25px; border-radius: 50%; background: #00a6d6; color: white; font-size: 12px; font-weight: bold; }
    .number.first { background: #21a366; }
    .number.last { background: #cf5947; }
    .point-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
    .point-info strong { font-size: 12px; }
    .point-info small { color: #849097; font-size: 11px; font-variant-numeric: tabular-nums; }
    .point-actions { display: flex; gap: 3px; }
    .point-actions button { width: 25px; height: 25px; border: 1px solid #d8dddf; border-radius: 3px; background: white; color: #606c72; cursor: pointer; }
    .point-actions button:disabled { color: #cbd0d3; cursor: default; }
    .footnote { margin-top: 16px; color: #929a9f; font-size: 11px; line-height: 1.45; }
    :global(.route-builder-marker-wrap) { background: transparent; border: 0; }
    :global(.route-builder-marker) { display: grid; place-items: center; width: 27px; height: 27px; border: 2px solid white; border-radius: 50%; background: #00a6d6; color: white; font: bold 12px Arial,sans-serif; box-shadow: 0 1px 5px #0008; }
    :global(.route-builder-marker--start) { background: #21a366; }
    :global(.route-builder-marker--end) { background: #cf5947; }
</style>
