<script lang="ts">
    import { onDestroy, onMount } from 'svelte';
    import { directionalIndicatorLayout, indicatorBarMarkup, indicatorBarTextSize, readableIndicatorRotation } from './directional-indicator.js';
    import { map, getMapType, setMapType } from './adapters/map.js';
    import windyStore from './adapters/store.js';
    import { getPointForecastData } from './adapters/fetch.js';
    import colors from './adapters/colors.js';
    import { getGPSlocation } from './adapters/geolocation.js';
    import { pickerDot } from './adapters/picker.js';
import { chooseNextWaypoint, navigationMetrics, advanceWaypoint, courseFromFixes, routeProgress, averageRouteSpeed, visibleMapCenter, destinationAtBearing } from './navigation.js';
    import { earliestDeparture, coveredForecastIndex, restoredDeparture, nearestHourlyDeparture } from './departure-timeline.js';
    import { interpolateForecastDirection } from './forecast-time.js';
    import { saveTemporaryPlan, loadTemporaryPlan, clearTemporaryPlan, currentRouteSpeed, prepareLiveRefresh, liveAverageSpeed, buildLiveRoutePoints, buildLiveRouteSnapshot } from './live-route.js';
    import config from './pluginConfig.js';

    type Waypoint = { id: number; lat: number; lon: number };

    const { title, version } = config;
    const pluginTitle = `${title} v${version}`;
    let points: Waypoint[] = [];
    let distanceNm = 0;
    let speedKnots = 10;
    let departureDateTime = toLocalDateTimeInput(new Date());
    let departureTimelineScrollLeft = 0;
    let restoredDepartureTimestamp: number | null = null;
    let recenterDepartureTimeline = false;
    let departureScrollCommitTimer: number | null = null;
    let routeSnapshotActions: ('save' | 'load')[] = ['save', 'save', 'save'];
    let routeSampleIntervalHours = 3;
    let weatherSearchDays = 15;
    let departureIntervalHours = 6;
    let showSpeedSettings = false;
    let forecastDrawerMaxHeightPercent = 50;
    let forecastColumnResize: { table: HTMLTableElement; index: number; startX: number; startWidth: number } | null = null;
    type RouteForecastSample = { lat: number; lon: number; distanceNm: number; eta: Date; values?: Record<string, number | null>; icon?: number; error?: string; seaError?: string; diagnostic?: string; forecastCachedAt?: number };
    type ForecastBundle = { data: any; seaData: any; ecmwfData: any; ecmwfSeaData: any; currentsData: any; mblueData: any; iconData: any; aromeData: any; seaError?: string; ecmwfError?: string; ecmwfSeaError?: string; currentsError?: string; mblueError?: string; iconError?: string; aromeError?: string };
    type ForecastBundleResult = { bundle: ForecastBundle } | { error: string };
    const forecastDataCache = new Map<string, { expiresAt: number; promise: Promise<ForecastBundle> }>();
    type DepartureEvaluation = { departure: Date; arrival: Date; temperature: number | null; rain: number | null; windAverage: number | null; wind: number | null; ecmwfWind: number | null; mblueWind: number | null; iconWind: number | null; aromeWind: number | null; gust: number | null; direction: number | null; ecmwfWindDirection: number | null; mblueWindDirection: number | null; iconWindDirection: number | null; aromeWindDirection: number | null; waves: number | null; swell1: number | null; swell1Period: number | null; swell2: number | null; swell2Period: number | null; windWaves: number | null; windWavesPeriod: number | null; current: number | null; currentTide: number | null; wavesPeriod: number | null; wavesPower: number | null; ecmwfWaves: number | null; ecmwfSwell1: number | null; ecmwfSwell1Period: number | null; ecmwfWavesPeriod: number | null; ecmwfWavesPower: number | null; clouds: number | null; skyStates: string[] | null; icon?: number; available: boolean; passes: boolean | null; hasConstraints: boolean; qualityMargin?: number | null; qualityAverage?: number | null; qualityColor?: string; qualityRank?: number; qualityRankCount?: number; isOptimal?: boolean };
    const skyStateOptions = [
        { id: 'clear', label: 'Despejado / soleado', emoji: '☀️' },
        { id: 'partly-cloudy', label: 'Algo nublado', emoji: '🌤️' },
        { id: 'mostly-cloudy', label: 'Parcialmente nublado', emoji: '🌥️' },
        { id: 'overcast', label: 'Nublado', emoji: '☁️' },
        { id: 'fog', label: 'Niebla', emoji: '🌫️' },
        { id: 'drizzle', label: 'Llovizna', emoji: '🌦️' },
        { id: 'light-rain', label: 'Lluvia ligera', emoji: '🌦️' },
        { id: 'rain', label: 'Lluvia', emoji: '🌧️' },
        { id: 'heavy-rain', label: 'Lluvia intensa', emoji: '🌧️' },
        { id: 'thunderstorm', label: 'Tormenta', emoji: '⛈️' },
        { id: 'snow', label: 'Nieve', emoji: '🌨️' },
    ] as const;
    let routeForecast: RouteForecastSample[] = [];
    let departureEvaluations: DepartureEvaluation[] = [];
    let departureAnalysisBusy = false;
    let departureEligibilityDirty = false;
    let forecastBusy = false;
    let forecastMessage = '';
    let forecastJob = 0;
    let showWeatherSettingsMenu = false;
    let settingsTab: 'forecast' | 'navigation' | 'map' = 'forecast';
    let liveSpeedSeconds = 5;
    let liveForecastSeconds = 60;
    let liveWaypointSeconds = 5;
    let restorePreviousRouteOnNavExit = false;
    const liveSpeedOptions = [5, 10, 30, 60, 300];
    const liveForecastOptions = [60, 300, 600, 1800];
    const liveWaypointOptions = [1, 5, 10, 30, 60, 300];
    let arrivalHours: number[] = [];
    let arrivalDays: number[] = [];
    const arrivalDayLabels = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    function arrivalMatches(date: Date): boolean {
        return Number.isFinite(date.getTime()) && (!arrivalHours.length || arrivalHours.includes(date.getHours())) && (!arrivalDays.length || arrivalDays.includes(date.getDay()));
    }
    type OptionalBound = number | '';
    type NumericBounds = { min: OptionalBound; max: OptionalBound };
    let windowConstraints = {
        ecmwfSky: { states: [] as string[] },
        mblueSky: { states: [] as string[] },
        iconSky: { states: [] as string[] },
        aromeSky: { states: [] as string[] },
        skyAverage: { states: [] as string[] },
        ecmwfTemperature: { min: '', max: '' } as NumericBounds,
        mblueTemperature: { min: '', max: '' } as NumericBounds,
        iconTemperature: { min: '', max: '' } as NumericBounds,
        aromeTemperature: { min: '', max: '' } as NumericBounds,
        ecmwfFeels: { min: '', max: '' } as NumericBounds,
        mblueFeels: { min: '', max: '' } as NumericBounds,
        iconFeels: { min: '', max: '' } as NumericBounds,
        aromeFeels: { min: '', max: '' } as NumericBounds,
        ecmwfRain: { min: '', max: '' } as NumericBounds,
        mblueRain: { min: '', max: '' } as NumericBounds,
        iconRain: { min: '', max: '' } as NumericBounds,
        aromeRain: { min: '', max: '' } as NumericBounds,
        ecmwfGust: { min: '', max: '' } as NumericBounds,
        mblueGust: { min: '', max: '' } as NumericBounds,
        iconGust: { min: '', max: '' } as NumericBounds,
        aromeGust: { min: '', max: '' } as NumericBounds,
        feels: { min: '', max: '' } as NumericBounds,
        temperatureAverage: { min: '', max: '' } as NumericBounds,
        feelsAverage: { min: '', max: '' } as NumericBounds,
        rainAverage: { min: '', max: '' } as NumericBounds,
        gustAverage: { min: '', max: '' } as NumericBounds,
        gfsDew: { min: '', max: '' } as NumericBounds,
        ecmwfDew: { min: '', max: '' } as NumericBounds,
        mblueDew: { min: '', max: '' } as NumericBounds,
        iconDew: { min: '', max: '' } as NumericBounds,
        aromeDew: { min: '', max: '' } as NumericBounds,
        dewAverage: { min: '', max: '' } as NumericBounds,
        temperature: { min: '', max: '' } as NumericBounds,
        rain: { min: '', max: '' } as NumericBounds,
        windAverage: { min: '', max: '' } as NumericBounds,
        directionAverage: { min: '', max: '' } as NumericBounds,
        wavesAverage: { min: '', max: '' } as NumericBounds,
        swell1Average: { min: '', max: '' } as NumericBounds,
        swell1PeriodAverage: { min: '', max: '' } as NumericBounds,
        wavesPeriodAverage: { min: '', max: '' } as NumericBounds,
        wavesPowerAverage: { min: '', max: '' } as NumericBounds,
        wind: { min: '', max: '' } as NumericBounds,
        ecmwfWind: { min: '', max: '' } as NumericBounds,
        mblueWind: { min: '', max: '' } as NumericBounds,
        iconWind: { min: '', max: '' } as NumericBounds,
        aromeWind: { min: '', max: '' } as NumericBounds,
        ecmwfWindDirection: { min: '', max: '' } as NumericBounds,
        mblueWindDirection: { min: '', max: '' } as NumericBounds,
        iconWindDirection: { min: '', max: '' } as NumericBounds,
        aromeWindDirection: { min: '', max: '' } as NumericBounds,
        gust: { min: '', max: '' } as NumericBounds,
        direction: { min: '', max: '' } as NumericBounds,
        waves: { min: '', max: '' } as NumericBounds,
        swell1: { min: '', max: '' } as NumericBounds,
        swell2: { min: '', max: '' } as NumericBounds,
        swell1Period: { min: '', max: '' } as NumericBounds,
        swell2Period: { min: '', max: '' } as NumericBounds,
        windWaves: { min: '', max: '' } as NumericBounds,
        windWavesPeriod: { min: '', max: '' } as NumericBounds,
        current: { min: '', max: '' } as NumericBounds,
        currentTide: { min: '', max: '' } as NumericBounds,
        wavesPeriod: { min: '', max: '' } as NumericBounds,
        wavesPower: { min: '', max: '' } as NumericBounds,
        ecmwfWaves: { min: '', max: '' } as NumericBounds,
        ecmwfSwell1: { min: '', max: '' } as NumericBounds,
        ecmwfSwell1Period: { min: '', max: '' } as NumericBounds,
        ecmwfWavesPeriod: { min: '', max: '' } as NumericBounds,
        ecmwfWavesPower: { min: '', max: '' } as NumericBounds,
        clouds: { states: [] as string[] },
        arrival: { min: '', max: '' },
    };
    type WindowConditionKey = keyof typeof windowConstraints;
    let pointerFieldDrag: { field: WindowConditionKey; pointerId: number; handle: HTMLElement } | null = null;
    let activeWindowCondition: WindowConditionKey | null = null;
    const routeFieldLabels: Record<WindowConditionKey, string> = {
        ecmwfSky: 'Cielo',
        mblueSky: 'Cielo',
        iconSky: 'Cielo',
        aromeSky: 'Cielo',
        skyAverage: 'Cielo',
        gfsDew: 'Punto de rocío',
        ecmwfDew: 'Punto de rocío',
        mblueDew: 'Punto de rocío',
        iconDew: 'Punto de rocío',
        aromeDew: 'Punto de rocío',
        dewAverage: 'Punto de rocío',
        ecmwfTemperature: 'Temperatura',
        mblueTemperature: 'Temperatura',
        iconTemperature: 'Temperatura',
        aromeTemperature: 'Temperatura',
        ecmwfFeels: 'Sens. térmica',
        mblueFeels: 'Sens. térmica',
        iconFeels: 'Sens. térmica',
        aromeFeels: 'Sens. térmica',
        ecmwfRain: 'Lluvia',
        mblueRain: 'Lluvia',
        iconRain: 'Lluvia',
        aromeRain: 'Lluvia',
        ecmwfGust: 'Rachas',
        mblueGust: 'Rachas',
        iconGust: 'Rachas',
        aromeGust: 'Rachas',
        feels: 'Sens. térmica',
        temperatureAverage: 'Temperatura',
        feelsAverage: 'Sens. térmica',
        rainAverage: 'Lluvia',
        gustAverage: 'Rachas',
        directionAverage: 'Dirección viento promedio',
        wavesAverage: 'Olas promedio',
        swell1Average: 'Oleaje 1 promedio',
        swell1PeriodAverage: 'Período oleaje 1 promedio',
        wavesPeriodAverage: 'Período promedio',
        wavesPowerAverage: 'Potencia promedio',
        clouds: 'Cielo', temperature: 'Temperatura', rain: 'Lluvia', windAverage: 'Viento promedio', wind: 'Viento', ecmwfWind: 'Viento',
        mblueWind: 'Viento', iconWind: 'Viento', aromeWind: 'Viento',
        ecmwfWindDirection: 'Dirección viento', mblueWindDirection: 'Dirección viento', iconWindDirection: 'Dirección viento', aromeWindDirection: 'Dirección viento',
        gust: 'Rachas', direction: 'Dirección viento', waves: 'Olas', swell1: 'Oleaje 1', swell1Period: 'Período oleaje 1', swell2: 'Oleaje 2', swell2Period: 'Período oleaje 2', windWaves: 'Mar de viento', windWavesPeriod: 'Período mar de viento', current: 'Corriente', currentTide: 'Corriente de marea',
        wavesPeriod: 'Periodo', wavesPower: 'Potencia',
        ecmwfWaves: 'Olas', ecmwfSwell1: 'Oleaje 1', ecmwfSwell1Period: 'Período oleaje 1', ecmwfWavesPeriod: 'Periodo', ecmwfWavesPower: 'Potencia', arrival: 'Hora',
    };
    const routeFieldPickerLabels: Record<WindowConditionKey, string> = {
        ecmwfSky: 'Cielo ECMWF · 9 km',
        mblueSky: 'Cielo mBlue AI · global',
        iconSky: 'Cielo ICON · 13 km',
        aromeSky: 'Cielo AROME Antillas · 2.5 km',
        skyAverage: 'Cielo · estado predominante',
        gfsDew: 'Punto de rocío GFS · global',
        ecmwfDew: 'Punto de rocío ECMWF · 9 km',
        mblueDew: 'Punto de rocío mBlue AI · global',
        iconDew: 'Punto de rocío ICON · 13 km',
        aromeDew: 'Punto de rocío AROME Antillas · 2.5 km',
        dewAverage: 'Punto de rocío promedio · modelos agregados',
        ecmwfTemperature: 'Temperatura ECMWF · 9 km',
        mblueTemperature: 'Temperatura mBlue AI · global',
        iconTemperature: 'Temperatura ICON · 13 km',
        aromeTemperature: 'Temperatura AROME Antillas · 2.5 km',
        ecmwfFeels: 'Sens. térmica ECMWF · 9 km',
        mblueFeels: 'Sens. térmica mBlue AI · global',
        iconFeels: 'Sens. térmica ICON · 13 km',
        aromeFeels: 'Sens. térmica AROME Antillas · 2.5 km',
        ecmwfRain: 'Lluvia ECMWF · 9 km',
        mblueRain: 'Lluvia mBlue AI · global',
        iconRain: 'Lluvia ICON · 13 km',
        aromeRain: 'Lluvia AROME Antillas · 2.5 km',
        ecmwfGust: 'Rachas ECMWF · 9 km',
        mblueGust: 'Rachas mBlue AI · global',
        iconGust: 'Rachas ICON · 13 km',
        aromeGust: 'Rachas AROME Antillas · 2.5 km',
        feels: 'Sens. térmica GFS · global',
        temperatureAverage: 'Temperatura promedio · modelos agregados',
        feelsAverage: 'Sens. térmica promedio · modelos agregados',
        rainAverage: 'Lluvia promedio · modelos agregados',
        gustAverage: 'Rachas promedio · modelos agregados',
        directionAverage: 'Dirección viento promedio · modelos agregados',
        wavesAverage: 'Olas promedio · modelos agregados',
        swell1Average: 'Oleaje 1 promedio · modelos agregados',
        swell1PeriodAverage: 'Período oleaje 1 promedio · modelos agregados',
        wavesPeriodAverage: 'Período promedio · modelos agregados',
        wavesPowerAverage: 'Potencia promedio · modelos agregados',
        clouds: 'Cielo GFS global', temperature: 'Temperatura GFS global', rain: 'Lluvia GFS global', windAverage: 'Viento promedio · modelos agregados', wind: 'Viento GFS global',
        ecmwfWind: 'Viento ECMWF 9 km', mblueWind: 'Viento mBlue AI global', iconWind: 'Viento ICON 13 km', aromeWind: 'Viento AROME Antillas 2.5 km',
        ecmwfWindDirection: 'Dirección viento ECMWF 9 km', mblueWindDirection: 'Dirección viento mBlue AI global', iconWindDirection: 'Dirección viento ICON 13 km', aromeWindDirection: 'Dirección viento AROME Antillas 2.5 km',
        gust: 'Rachas GFS global', direction: 'Dirección viento GFS global', waves: 'Olas GFS Waves 0.25°', swell1: 'Oleaje 1 GFS Waves 0.25°',
        swell2: 'Oleaje 2 GFS Waves 0.25°', swell1Period: 'Período oleaje 1 GFS Waves 0.25°', swell2Period: 'Período oleaje 2 GFS Waves 0.25°', windWaves: 'Mar de viento GFS Waves 0.25°', windWavesPeriod: 'Período mar de viento GFS Waves 0.25°', current: 'Corriente CMEMS 8 km', currentTide: 'Corriente de marea CMEMS 8 km',
        wavesPeriod: 'Periodo GFS Waves 0.25°', wavesPower: 'Potencia GFS Waves 0.25°',
        ecmwfWaves: 'Olas ECMWF WAM', ecmwfSwell1: 'Oleaje 1 ECMWF WAM', ecmwfSwell1Period: 'Período oleaje 1 ECMWF WAM', ecmwfWavesPeriod: 'Período ECMWF WAM', ecmwfWavesPower: 'Potencia ECMWF WAM', arrival: 'Hora de paso',
    };
    const windowFieldKeys: WindowConditionKey[] = ['skyAverage', 'ecmwfSky', 'mblueSky', 'iconSky', 'aromeSky', 'gfsDew', 'ecmwfDew', 'mblueDew', 'iconDew', 'aromeDew', 'dewAverage', 'ecmwfTemperature', 'mblueTemperature', 'iconTemperature', 'aromeTemperature', 'ecmwfFeels', 'mblueFeels', 'iconFeels', 'aromeFeels', 'ecmwfRain', 'mblueRain', 'iconRain', 'aromeRain', 'ecmwfGust', 'mblueGust', 'iconGust', 'aromeGust', 'feels', 'temperatureAverage', 'feelsAverage', 'rainAverage', 'gustAverage', 'dewAverage', 'directionAverage', 'wavesAverage', 'swell1Average', 'swell1PeriodAverage', 'wavesPeriodAverage', 'wavesPowerAverage', 'arrival', 'clouds', 'temperature', 'rain', 'windAverage', 'wind', 'ecmwfWind', 'mblueWind', 'iconWind', 'aromeWind', 'ecmwfWindDirection', 'mblueWindDirection', 'iconWindDirection', 'aromeWindDirection', 'gust', 'direction', 'waves', 'swell1', 'swell1Period', 'swell2', 'swell2Period', 'windWaves', 'windWavesPeriod', 'current', 'currentTide', 'wavesPeriod', 'wavesPower', 'ecmwfWaves', 'ecmwfSwell1', 'ecmwfSwell1Period', 'ecmwfWavesPeriod', 'ecmwfWavesPower'];
    // Campos sin proveedor validado se excluyen de selectores y condiciones.
    const unsupportedFields = new Set(['skyAverage', 'clouds', 'ecmwfSky', 'mblueSky', 'iconSky', 'aromeSky', 'current', 'currentTide', 'ecmwfSwell1', 'ecmwfSwell1Period', 'wavesPower', 'ecmwfWavesPower', 'wavesPowerAverage']);
    for (let i = windowFieldKeys.length - 1; i >= 0; i--) {
        const field = windowFieldKeys[i];
        if (field.startsWith('mblue') || field.startsWith('arome') || unsupportedFields.has(field)) windowFieldKeys.splice(i, 1);
    }
    const windModelFieldKeys: WindowConditionKey[] = ['wind', 'ecmwfWind', 'iconWind'];
    const additionalGroups: Partial<Record<WindowConditionKey, { fields: WindowConditionKey[]; label: string; unit: string; decimals: number; circular: boolean }>> = {
        skyAverage: { fields: ['clouds', 'ecmwfSky', 'mblueSky', 'iconSky', 'aromeSky'], label: 'Cielo', unit: '', decimals: 0, circular: false },
        dewAverage: { fields: ['gfsDew', 'ecmwfDew', 'mblueDew', 'iconDew', 'aromeDew'], label: 'Punto de rocío', unit: ' °C', decimals: 1, circular: false },
        temperatureAverage: { fields: ['temperature', 'ecmwfTemperature', 'mblueTemperature', 'iconTemperature', 'aromeTemperature'], label: 'Temperatura', unit: ' °C', decimals: 1, circular: false },
        feelsAverage: { fields: ['feels', 'ecmwfFeels', 'mblueFeels', 'iconFeels', 'aromeFeels'], label: 'Sens. térmica', unit: ' °C', decimals: 1, circular: false },
        rainAverage: { fields: ['rain', 'ecmwfRain', 'mblueRain', 'iconRain', 'aromeRain'], label: 'Lluvia', unit: ' in', decimals: 2, circular: false },
        gustAverage: { fields: ['gust', 'ecmwfGust', 'mblueGust', 'iconGust', 'aromeGust'], label: 'Rachas', unit: ' kt', decimals: 0, circular: false },
        directionAverage: { fields: ['direction', 'ecmwfWindDirection', 'mblueWindDirection', 'iconWindDirection', 'aromeWindDirection'], label: 'Dirección viento', unit: '°', decimals: 0, circular: true },
        wavesAverage: { fields: ['waves', 'ecmwfWaves'], label: 'Olas', unit: ' m', decimals: 1, circular: false },
        swell1Average: { fields: ['swell1', 'ecmwfSwell1'], label: 'Oleaje 1', unit: ' m', decimals: 1, circular: false },
        swell1PeriodAverage: { fields: ['swell1Period', 'ecmwfSwell1Period'], label: 'Período oleaje 1', unit: ' s', decimals: 1, circular: false },
        wavesPeriodAverage: { fields: ['wavesPeriod', 'ecmwfWavesPeriod'], label: 'Período', unit: ' s', decimals: 1, circular: false },
        wavesPowerAverage: { fields: ['wavesPower', 'ecmwfWavesPower'], label: 'Potencia', unit: ' kW/m', decimals: 0, circular: false },
    };
    let collapsedGroups: Partial<Record<WindowConditionKey, boolean>> = {};
    function activeGroupFields(key: WindowConditionKey): WindowConditionKey[] {
        const group = additionalGroups[key];
        return group ? routeFieldOrder.filter(field => group.fields.includes(field) && !hiddenRouteFields.has(field)) : [];
    }
    function groupValue(key: WindowConditionKey, values?: Record<string, any>): number | null {
        const group = additionalGroups[key];
        if (!group) return null;
        const readings = activeGroupFields(key).map(field => values?.[field]).filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
        if (!readings.length) return null;
        return group.circular ? averageDirection(readings) : readings.reduce((a, b) => a + b, 0) / readings.length;
    }
    const directionNames = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
    const windDirectionConditionKeys: WindowConditionKey[] = ['directionAverage', 'direction', 'ecmwfWindDirection', 'mblueWindDirection', 'iconWindDirection', 'aromeWindDirection'];
    const directionFields: Partial<Record<WindowConditionKey, string>> = {
        direction: 'direction', ecmwfWindDirection: 'ecmwfWindDirection', mblueWindDirection: 'mblueWindDirection', iconWindDirection: 'iconWindDirection', aromeWindDirection: 'aromeWindDirection',
        waves: 'wavesDir', ecmwfWaves: 'ecmwfWavesDir', swell1: 'swell1Dir', ecmwfSwell1: 'ecmwfSwell1Dir', swell2: 'swell2Dir', windWaves: 'windWavesDir', current: 'currentDir', currentTide: 'currentTideDir',
    };
    const directionGroups: WindowConditionKey[] = ['directionAverage', 'wavesAverage', 'swell1Average'];
    let directionSelections: Partial<Record<WindowConditionKey, number[]>> = {};
    function hasDirectionWheel(key: WindowConditionKey): boolean { return Boolean(directionFields[key]) || directionGroups.includes(key); }
    function selectedDirections(key: WindowConditionKey): number[] { return hasDirectionWheel(key) ? directionSelections[key] || [] : []; }
    function fieldDirection(key: WindowConditionKey, values?: Record<string, any>): number | null {
        const direct = directionFields[key];
        if (direct) { const value = values?.[direct]; return typeof value === 'number' && Number.isFinite(value) ? ((value % 360) + 360) % 360 : null; }
        const members = key === 'windAverage' ? activeWindModelFields() : additionalGroups[key] ? activeGroupFields(key) : [];
        if (!members.length) return null;
        const directions = members.map(member => fieldDirection(member, values)).filter((value): value is number => value !== null);
        if (!directions.length) return null;
        const radians = directions.map(value => value * Math.PI / 180);
        const x = radians.reduce((sum, value) => sum + Math.cos(value), 0), y = radians.reduce((sum, value) => sum + Math.sin(value), 0);
        return Math.hypot(x, y) > 1e-10 ? averageDirection(directions) : null;
    }
    function directionMatches(key: WindowConditionKey, values?: Record<string, any>): boolean | null {
        const selected = selectedDirections(key);
        if (!selected.length) return true;
        const bearing = fieldDirection(key, values);
        return bearing === null ? null : selected.includes(Math.floor((bearing + 22.5) / 45) % 8);
    }
    function directionWheel(key: WindowConditionKey): string {
        if (!hasDirectionWheel(key)) return '';
        const selected = selectedDirections(key);
        const buttons = directionNames.map((name, index) => {
            const angle = index * Math.PI / 4, delta = Math.PI / 8;
            const x1 = 50 + 50 * Math.sin(angle - delta), y1 = 50 - 50 * Math.cos(angle - delta);
            const x2 = 50 + 50 * Math.sin(angle + delta), y2 = 50 - 50 * Math.cos(angle + delta);
            const x = 50 + 33 * Math.sin(angle), y = 50 - 33 * Math.cos(angle);
            return `<button type="button" class="direction-sector${selected.includes(index) ? ' is-selected' : ''}" data-direction-sector="${index}" aria-label="${name}" aria-pressed="${selected.includes(index)}" style="clip-path:polygon(50% 50%,${x1}% ${y1}%,${x2}% ${y2}%);"><span style="left:${x}%;top:${y}%">${name}</span></button>`;
        }).join('');
        const meaning = key === 'current' || key === 'currentTide' ? 'Dirección de la corriente' : 'Dirección del pronóstico';
        return `<div class="direction-wheel-box"><strong>${meaning}</strong><div class="direction-wheel" aria-label="Direcciones aceptadas">${buttons}</div><button type="button" class="forecast-button" data-direction-all>Seleccionar todas</button><small>Sin selección: se aceptan todas las direcciones.</small></div>`;
    }
    let indicatorAppearance = { size: 5, height: Math.sqrt(100 - 2.5 * 2.5), barWidth: 30, tipHeight: 14, dataLength: 60, nameLength: 36, distance: 80, pointDistance: 80, textSize: 10, textMargin: 2, showDirection: true, showValue: true, windColor: '#087bd1', waveColor: '#f4d03f', windLetter: 'T', waveLetter: 'W', windValue: 'wind', waveValue: 'waves' };
    try {
        const saved = JSON.parse(localStorage.getItem('route-builder-indicator-appearance-v1') || '{}');
        for (const key of ['size', 'distance', 'pointDistance', 'textSize', 'textMargin']) if (Number.isFinite(Number(saved[key]))) (indicatorAppearance as any)[key] = Number(saved[key]);
        indicatorAppearance.height = typeof saved.height === 'number' && Number.isFinite(saved.height) && saved.height >= 5 && saved.height <= 250 ? saved.height : indicatorAppearance.size * Math.sqrt(100 - 2.5 * 2.5) / 5;
        if (!Number.isFinite(Number(saved.pointDistance))) { const legacy = Number(localStorage.getItem('route-builder-waypoint-wind-indicator-distance')); if (legacy >= 20 && legacy <= 200) indicatorAppearance.pointDistance = legacy; }
        for (const key of ['barWidth', 'tipHeight', 'dataLength', 'nameLength']) {
            if (typeof saved[key] === 'number' && Number.isFinite(saved[key]) && saved[key] > 0) (indicatorAppearance as any)[key] = saved[key];
        }
        for (const key of ['showDirection', 'showValue']) if (typeof saved[key] === 'boolean') (indicatorAppearance as any)[key] = saved[key];
        for (const key of ['windColor', 'waveColor']) if (/^#[0-9a-f]{6}$/i.test(saved[key] || '')) (indicatorAppearance as any)[key] = saved[key];
        for (const key of ['windLetter', 'waveLetter']) if (typeof saved[key] === 'string') (indicatorAppearance as any)[key] = saved[key];
        for (const key of ['windValue', 'waveValue']) if (typeof saved[key] === 'string') (indicatorAppearance as any)[key] = saved[key];
    } catch { /* Use the defaults. */ }
    let windModelRowsCollapsed = true;
    let windIndicatorField: WindowConditionKey | '' = '';
    let windIndicatorUserChoice = false;
    let windIndicatorDistance = 80;
    let windIndicatorSize = 20;
    let windIndicatorTextSize = 10;
    let windIndicatorDegreesEnabled = true;
    let waveIndicatorField: WindowConditionKey | '' = '';
    let waveIndicatorUserChoice = false;
    let waveIndicatorDistance = 80;
    let waveIndicatorSize = 20;
    let waveIndicatorTextSize = 10;
    let waveIndicatorDegreesEnabled = true;
    let routeWindIndicatorsEnabled = false;
    let routeWindIndicatorDistance = 80;
    let routeWaveIndicatorsEnabled = false;
    let routeWaveIndicatorDistance = 80;
    let windRoseEnabled = true;
    let windRoseRadius = 50;
    let windRoseLineWidth = 10;
    let windRoseFontSize = 7;
    let windRoseTransparency = 25;
    let windRoseLabelMode: 'cardinal' | 'degrees' = 'degrees';
    let windRoseSignature = '';
    let headingDegreesEnabled = false;
    let headingDegreesFontSize = 14;
    let headingDegreesWidth = 58;
    let headingDegreesHeight = 26;
    let laylineMode: 'none' | 'upwind' | 'downwind' | 'both' | 'automatic' = 'none';
    let upwindLaylineAngle = 45;
    let downwindLaylineAngle = 135;
    let portWindLaylineColor = '#68dc89';
    let starboardWindLaylineColor = '#e53935';
    let visualAidsOpen = false;
    let windIndicatorSettingsOpen = false;
    let waveIndicatorSettingsOpen = false;
    let laylinesSettingsOpen = false;
    let windRoseSettingsOpen = false;
    function activeWindModelFields(): WindowConditionKey[] {
        return routeFieldOrder.filter(key => windModelFieldKeys.includes(key) && !hiddenRouteFields.has(key));
    }
    function windIndicatorOptions(): WindowConditionKey[] {
        const fields = activeGroupFields('directionAverage');
        return fields.length > 1 ? ['directionAverage', ...fields] : fields;
    }
    function waveIndicatorOptions(): WindowConditionKey[] {
        const directFields = routeFieldOrder.filter(key => ['waves', 'ecmwfWaves', 'swell1', 'ecmwfSwell1', 'swell2', 'windWaves'].includes(key) && !hiddenRouteFields.has(key));
        const averages: WindowConditionKey[] = [];
        if (activeGroupFields('wavesAverage').length > 1) averages.push('wavesAverage');
        if (activeGroupFields('swell1Average').length > 1) averages.push('swell1Average');
        return [...averages, ...directFields];
    }
    // Keep indicator sources in sync with the currently visible forecast fields.
    function syncIndicatorSources(): void {
        const windDirections = windIndicatorOptions();
        const waves = waveIndicatorOptions();
        const windValues = activeWindModelFields();
        const windValueOptions: WindowConditionKey[] = windValues.length > 1 ? ['windAverage', ...windValues] : windValues;
        const resolve = (selected: string, options: WindowConditionKey[], members: WindowConditionKey[]): string => {
            if (!selected) return '';
            if (options.includes(selected as WindowConditionKey)) return selected;
            return members.length === 1 ? members[0] : '';
        };
        const oldWind = windIndicatorField, oldWave = waveIndicatorField;
        const oldWindValue = indicatorAppearance.windValue, oldWaveValue = indicatorAppearance.waveValue;
        if (!windIndicatorUserChoice) windIndicatorField = (windDirections.includes('directionAverage') ? 'directionAverage' : windDirections[0] ?? '') as WindowConditionKey | '';
        else windIndicatorField = resolve(windIndicatorField, windDirections, windIndicatorField === 'directionAverage' ? activeGroupFields('directionAverage') : []) as WindowConditionKey | '';
        if (!waveIndicatorUserChoice) waveIndicatorField = (waves.includes('wavesAverage') ? 'wavesAverage' : waves.includes('swell1Average') ? 'swell1Average' : waves[0] ?? '') as WindowConditionKey | '';
        else waveIndicatorField = resolve(waveIndicatorField, waves, waveIndicatorField === 'wavesAverage' || waveIndicatorField === 'swell1Average' ? activeGroupFields(waveIndicatorField) : []) as WindowConditionKey | '';
        indicatorAppearance.windValue = resolve(oldWindValue, windValueOptions, oldWindValue === 'windAverage' ? windValues : []);
        indicatorAppearance.waveValue = resolve(oldWaveValue, waves, oldWaveValue === 'wavesAverage' || oldWaveValue === 'swell1Average' ? activeGroupFields(oldWaveValue as WindowConditionKey) : []);
        try {
            if (oldWind !== windIndicatorField && windIndicatorUserChoice) localStorage.setItem('route-builder-wind-indicator-field', windIndicatorField);
            if (oldWave !== waveIndicatorField && waveIndicatorUserChoice) localStorage.setItem('route-builder-wave-indicator-field', waveIndicatorField);
            if (oldWindValue !== indicatorAppearance.windValue || oldWaveValue !== indicatorAppearance.waveValue) localStorage.setItem('route-builder-indicator-appearance-v1', JSON.stringify(indicatorAppearance));
        } catch { /* Keep the current settings in memory. */ }
    }
    function averageWindForValues(values?: Record<string, number | null>): number | null {
        const readings = activeWindModelFields().map(key => values?.[key]).filter((value): value is number => value !== null && value !== undefined && Number.isFinite(value));
        return readings.length ? readings.reduce((sum, value) => sum + value, 0) / readings.length : null;
    }
    function numericConditionDomain(key: WindowConditionKey): { min: number; max: number } | null {
        const field = key.toLowerCase();
        if (field.includes('rain')) return { min: 0, max: 20 };
        if (field.includes('gust')) return { min: 0, max: 120 };
        if (field.includes('wind')) return { min: 0, max: 40 };
        if (field.includes('temperature') || field.includes('feels') || field.includes('dew')) return { min: -60, max: 60 };
        if (field.includes('period')) return { min: 0, max: 30 };
        if (field.includes('power')) return { min: 0, max: 20 };
        if (field.includes('current')) return { min: 0, max: 10 };
        if (field.includes('waves') || field.includes('swell')) return { min: 0, max: 10 };
        return null;
    }
    function departureQualityMetrics(routeValues: Array<Record<string, any>>): { margin: number; average: number } | null {
        const margins: number[] = [];
        const averageScores: number[] = [];
        for (const key of new Set(windowFieldKeys)) {
            if (key === 'arrival' || isSkyField(key) || windDirectionConditionKeys.includes(key) || additionalGroups[key]?.circular) continue;
            const bounds = windowConstraints[key] as Partial<NumericBounds>;
            const parseBound = (value: unknown): number | null => value === '' || value === null || value === undefined || !Number.isFinite(Number(value)) ? null : Number(value);
            const domain = numericConditionDomain(key);
            let min = parseBound(bounds.min);
            let max = parseBound(bounds.max);
            // Slider endpoints represent an open side of the range.
            if (min !== null && domain && min <= domain.min) min = null;
            if (max !== null && domain && max >= domain.max) max = null;
            if (min === null && max === null) continue;

            const values = routeValues.map(row => {
                if (key === 'windAverage') return averageWindForValues(row);
                if (additionalGroups[key]) return groupValue(key, row);
                const value = row[key];
                return typeof value === 'number' && Number.isFinite(value) ? value : null;
            });
            if (!values.length || values.some(value => value === null)) continue;
            const readings = values as number[];
            const observedMin = Math.min(...readings);
            const observedMax = Math.max(...readings);
            const observedAverage = readings.reduce((sum, value) => sum + value, 0) / readings.length;
            const domainWidth = Math.max(1, (domain?.max ?? 0) - (domain?.min ?? 0));

            if (min !== null && max !== null) {
                const width = max - min;
                if (width > 0) {
                    margins.push(Math.min(observedMin - min, max - observedMax) / width);
                    const center = (min + max) / 2;
                    averageScores.push(1 - Math.abs(observedAverage - center) / (width / 2));
                } else {
                    margins.push(-Math.max(Math.abs(observedMin - min), Math.abs(observedMax - max)) / domainWidth);
                    averageScores.push(-Math.abs(observedAverage - min) / domainWidth);
                }
            } else if (min !== null) {
                margins.push((observedMin - min) / domainWidth);
                averageScores.push((observedAverage - min) / domainWidth);
            } else if (max !== null) {
                margins.push((max - observedMax) / domainWidth);
                averageScores.push((max - observedAverage) / domainWidth);
            }
        }
        if (!margins.length) return null;
        return {
            margin: Math.min(...margins),
            average: averageScores.reduce((sum, score) => sum + score, 0) / averageScores.length,
        };
    }
    function departureQualityColor(position: number): string {
        const stops = [
            { at: 0, rgb: [255, 216, 77] },
            { at: 0.25, rgb: [217, 232, 74] },
            { at: 0.5, rgb: [168, 217, 77] },
            { at: 0.75, rgb: [99, 198, 83] },
            { at: 1, rgb: [24, 165, 88] },
        ];
        const value = Math.max(0, Math.min(1, position));
        const upperIndex = stops.findIndex(stop => stop.at >= value);
        const upper = stops[Math.max(0, upperIndex)];
        const lower = stops[Math.max(0, upperIndex - 1)];
        const ratio = upper.at === lower.at ? 0 : (value - lower.at) / (upper.at - lower.at);
        const rgb = lower.rgb.map((channel, index) => Math.round(channel + (upper.rgb[index] - channel) * ratio));
        return `#${rgb.map(channel => channel.toString(16).padStart(2, '0')).join('')}`;
    }
    function rankPassingDepartures(evaluations: DepartureEvaluation[]): void {
        const ranked = evaluations.filter(item => item.passes === true && Number.isFinite(item.qualityMargin) && Number.isFinite(item.qualityAverage));
        if (!ranked.length) return;
        const compareQuality = (a: DepartureEvaluation, b: DepartureEvaluation): number => {
            const marginDifference = (a.qualityMargin as number) - (b.qualityMargin as number);
            if (Math.abs(marginDifference) > 1e-8) return marginDifference;
            return (a.qualityAverage as number) - (b.qualityAverage as number);
        };
        ranked.sort(compareQuality);
        const groups: DepartureEvaluation[][] = [];
        for (const item of ranked) {
            const group = groups[groups.length - 1];
            if (group && Math.abs(compareQuality(group[0], item)) <= 1e-8) group.push(item);
            else groups.push([item]);
        }
        groups.forEach((group, index) => {
            const position = groups.length === 1 ? 1 : index / (groups.length - 1);
            const qualityRank = groups.length - index;
            group.forEach(item => {
                item.qualityColor = departureQualityColor(position);
                item.qualityRank = qualityRank;
                item.qualityRankCount = groups.length;
                item.isOptimal = index === groups.length - 1;
            });
        });
    }
    let routeFieldOrder: WindowConditionKey[] = [...windowFieldKeys];
    for (const key of Object.keys(additionalGroups) as WindowConditionKey[]) {
        if (!windowFieldKeys.includes(key)) continue;
        routeFieldOrder = routeFieldOrder.filter(field => field !== key);
        const index = routeFieldOrder.findIndex(field => additionalGroups[key]!.fields.includes(field));
        routeFieldOrder.splice(Math.max(0, index), 0, key);
    }
    const newModelFields: WindowConditionKey[] = ['gfsDew', 'ecmwfDew', 'mblueDew', 'iconDew', 'aromeDew', 'ecmwfTemperature', 'mblueTemperature', 'iconTemperature', 'aromeTemperature', 'ecmwfFeels', 'mblueFeels', 'iconFeels', 'aromeFeels', 'ecmwfRain', 'mblueRain', 'iconRain', 'aromeRain', 'ecmwfGust', 'mblueGust', 'iconGust', 'aromeGust', 'feels'];
    const skyModelFields: WindowConditionKey[] = ['ecmwfSky', 'mblueSky', 'iconSky', 'aromeSky'];
    function isSkyField(key: WindowConditionKey): boolean { return key === 'clouds' || key === 'skyAverage' || skyModelFields.includes(key); }
    const defaultRouteFields = new Set<WindowConditionKey>(['arrival', 'wind', 'direction', 'waves']);
    let hiddenRouteFields = new Set<WindowConditionKey>(windowFieldKeys.filter(field => !defaultRouteFields.has(field)));
    let showRouteFieldPicker = false;
    let selectedRouteFields = new Set<WindowConditionKey>();
    let draggedRouteField: WindowConditionKey | null = null;
    let windowConditionsDirty = false;
    type DistanceFont = 'system' | 'roboto' | 'arial' | 'segoe';
    type DistanceUnit = 'km' | 'nm';
    type LabelPosition = 'above' | 'below';
    let distanceFont: DistanceFont = 'system';
    let distanceUnit: DistanceUnit = 'km';
    let waypointSize = 18;
    let waypointLabelFontSize = 10;
    let segmentLabelFontSize = 11;
    let showWaypointDate = true;
    let showWaypointHour = true;
    let showWaypointDistanceAccumulated = true;
    let showWaypointTimeAccumulated = true;
    let showWaypointDistanceRemaining = true;
    let showWaypointTimeRemaining = true;
    let waypointDatePosition: LabelPosition = 'below';
    let waypointHourPosition: LabelPosition = 'below';
    let showSegmentTime = true;
    let showSegmentBearing = true;
    let showSegmentDistance = true;
    let segmentTimePosition: LabelPosition = 'above';
    let segmentBearingPosition: LabelPosition = 'above';
    let segmentDistancePosition: LabelPosition = 'above';
    const waypointLabelFields = ['waypoint-date', 'waypoint-hour', 'waypoint-distance-accumulated', 'waypoint-time-accumulated', 'waypoint-distance-remaining', 'waypoint-time-remaining'];
    let pointerLabelDrag: { field: string; group: 'waypoint' | 'segment'; pointerId: number; handle: HTMLElement } | null = null;
    let waypointFieldPositions: Record<string, LabelPosition> = {
        'waypoint-date': 'below', 'waypoint-hour': 'below',
        'waypoint-distance-accumulated': 'below', 'waypoint-time-accumulated': 'below',
        'waypoint-distance-remaining': 'below', 'waypoint-time-remaining': 'below',
    };
    let waypointFieldOrder = [...waypointLabelFields];
    let segmentFieldOrder = ['segment-time', 'segment-bearing', 'segment-distance'];
    const fieldNames: Record<string, string> = {
        'waypoint-date': 'Fecha', 'waypoint-hour': 'Hora',
        'waypoint-distance-accumulated': 'Distancia acumulada', 'waypoint-time-accumulated': 'Tiempo acumulado',
        'waypoint-distance-remaining': 'Distancia restante', 'waypoint-time-remaining': 'Tiempo restante',
        'segment-time': 'Tiempo', 'segment-bearing': 'Rumbo verdadero', 'segment-distance': 'Distancia',
    };
    let waypointLabelRows: { field: string; position: LabelPosition | null }[] = [];
    let segmentLabelRows: { field: string; position: LabelPosition | null }[] = [];
    function isWaypointFieldVisible(field: string): boolean {
        if (field === 'waypoint-date') return showWaypointDate;
        if (field === 'waypoint-hour') return showWaypointHour;
        if (field === 'waypoint-distance-accumulated') return showWaypointDistanceAccumulated;
        if (field === 'waypoint-time-accumulated') return showWaypointTimeAccumulated;
        if (field === 'waypoint-distance-remaining') return showWaypointDistanceRemaining;
        if (field === 'waypoint-time-remaining') return showWaypointTimeRemaining;
        return false;
    }
    $: waypointLabelRows = [showWaypointDate, showWaypointHour, showWaypointDistanceAccumulated, showWaypointTimeAccumulated, showWaypointDistanceRemaining, showWaypointTimeRemaining, waypointFieldPositions, waypointFieldOrder] && waypointFieldOrder.map(field => ({ field, position: isWaypointFieldVisible(field) ? waypointFieldPositions[field] ?? 'below' : null }));
    $: segmentLabelRows = [showSegmentTime, showSegmentBearing, showSegmentDistance, segmentTimePosition, segmentBearingPosition, segmentDistancePosition, segmentFieldOrder] && segmentFieldOrder.map(field => {
        const active = field === 'segment-time' ? showSegmentTime : field === 'segment-bearing' ? showSegmentBearing : showSegmentDistance;
        const position = field === 'segment-time' ? segmentTimePosition : field === 'segment-bearing' ? segmentBearingPosition : segmentDistancePosition;
        return { field, position: active ? position : null };
    });
    function labelFieldPosition(group: 'waypoint' | 'segment', field: string): LabelPosition | null {
        if (group === 'waypoint') return isWaypointFieldVisible(field) ? waypointFieldPositions[field] ?? 'below' : null;
        const active = field === 'segment-time' ? showSegmentTime : field === 'segment-bearing' ? showSegmentBearing : showSegmentDistance;
        if (!active) return null;
        return field === 'segment-time' ? segmentTimePosition : field === 'segment-bearing' ? segmentBearingPosition : segmentDistancePosition;
    }
    function setLabelFieldPosition(group: 'waypoint' | 'segment', field: string, side: LabelPosition, checked: boolean): void {
        const current = labelFieldPosition(group, field);
        const enabled = checked || (current !== null && current !== side);
        if (group === 'waypoint') {
            if (field === 'waypoint-date') showWaypointDate = enabled;
            else if (field === 'waypoint-hour') showWaypointHour = enabled;
            else if (field === 'waypoint-distance-accumulated') showWaypointDistanceAccumulated = enabled;
            else if (field === 'waypoint-time-accumulated') showWaypointTimeAccumulated = enabled;
            else if (field === 'waypoint-distance-remaining') showWaypointDistanceRemaining = enabled;
            else if (field === 'waypoint-time-remaining') showWaypointTimeRemaining = enabled;
            if (checked) waypointFieldPositions = { ...waypointFieldPositions, [field]: side };
        } else if (field === 'segment-time') {
            showSegmentTime = enabled;
            if (checked) segmentTimePosition = side;
        } else if (field === 'segment-bearing') {
            showSegmentBearing = enabled;
            if (checked) segmentBearingPosition = side;
        } else if (field === 'segment-distance') {
            showSegmentDistance = enabled;
            if (checked) segmentDistancePosition = side;
        }
        applyLabelSettings();
    }
    function handleLabelPositionChange(event: Event, group: 'waypoint' | 'segment', field: string, side: LabelPosition): void {
        setLabelFieldPosition(group, field, side, (event.currentTarget as HTMLInputElement).checked);
    }
    const distanceFontStacks: Record<DistanceFont, string> = {
        system: '-apple-system, system-ui, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
        roboto: 'Roboto, Arial, sans-serif',
        arial: 'Arial, sans-serif',
        segoe: '"Segoe UI", sans-serif',
    };
    let nextPointId = 1;
    let recentlyDraggedWaypoint: { id: number; expiresAt: number } | null = null;
    let waypointDragInProgress = false;
    let waypointLayer: L.LayerGroup | null = null;
    let pastWaypointLayer: L.LayerGroup | null = null;
    let pastRouteLine: L.Polyline | null = null;
    let livePastWaypoints: Array<{ point: Waypoint; number: number }> = [];
    let liveOriginalWaypointNumbers = new Map<number, number>();
    const waypointMarkers = new Map<number, L.Marker>();
    const waypointMarkerSizes = new WeakMap<L.Marker, number>();
    const waypointMarkerLabelLayouts = new WeakMap<L.Marker, string>();
    const segmentLabelGroups = new Map<string, { element: HTMLDivElement; layout: string }>();
    let distanceLabelOverlay: HTMLDivElement | null = null;
    let routeLine: L.Polyline | null = null;
    let forecastHighlightMarker: L.Marker | null = null;
    let hoverRestoreTimestamp: number | null = null;
    let hoveredForecastTimestamp: number | null = null;
    let forecastDrawer: HTMLDivElement | null = null;
    let forecastReopenButton: HTMLButtonElement | null = null;
    let gpsButton: HTMLButtonElement | null = null;
    let liveButton: HTMLButtonElement | null = null;
    let centerButton: HTMLButtonElement | null = null;
    let mapTypeControl: HTMLDivElement | null = null;
    let zoomInButton: HTMLButtonElement | null = null;
    let zoomOutButton: HTMLButtonElement | null = null;
    let centerLayoutObserver: ResizeObserver | null = null;
    let centerLayoutFrame: number | null = null;
    let centerRequestVersion = 0;
    let routeFitRequestVersion = 0;
    let gpsPositionMarker: L.Marker | null = null;
    let gpsCourseOverlay: HTMLDivElement | null = null;
    let gpsCourseLine: HTMLDivElement | null = null;
    let windIndicatorOverlay: HTMLDivElement | null = null;
    let waveIndicatorOverlay: HTMLDivElement | null = null;
    const routePointIndicatorOverlays = new Map<string, HTMLDivElement>();
    let windRoseOverlay: HTMLDivElement | null = null;
    let headingDegreesOverlay: HTMLDivElement | null = null;
    let upwindLaylineLayers: L.Polyline[] = [];
    let downwindLaylineLayers: L.Polyline[] = [];
    let gpsRequestGeneration = 0;
    let gpsWatchId: number | null = null;
    let passiveWatchId: number | null = null;
    let passivePositionMarker: L.Marker | null = null;
    let passiveFix: { lat: number; lon: number; speed: number | null; heading: number | null; timestamp: number; accuracy: number } | null = null;
    let passivePositionRequestPending = false;
    const gpsPositionDotHtml = '<span class="gps-position-halo"></span><span class="gps-position-dot"></span>';
    let hasInitiallyCentered = false;
    let localForecast: RouteForecastSample | null = null;
    let localForecastPending = false;
    let localForecastLastAttempt = 0;
    let passiveTrackingDisposed = false;
    function visualFix() {
        return navigationActive && navigationFix && Date.now() - navigationFix.timestamp <= 30000 ? navigationFix : passiveFix;
    }

    let navigationActive = false;
    let followBoat = false;
    let liveRouteActive = false;
    let navigationPlanBackupActive = false;
    let autoLivePending = false;
    let liveRefreshTimer: number | null = null;
    let liveWaypointTimer: number | null = null;
    let liveDisplayPoints: Waypoint[] | null = null;
    let liveRouteUpdatedAt = 0;
    let navigationPanel: HTMLElement | null = null;
    let navigationFix: { lat: number; lon: number; speed: number | null; heading: number | null; timestamp: number } | null = null;
    let recentGpsSpeeds: { timestamp: number; speed: number }[] = [];
    let navigationRefreshTimer: number | null = null;
    let navigationTargetId: number | null = null;
    let waypointArrivalConfirmations = 0;
    let lastNavigationFixTimestamp = 0;
    let gpsCourseAnchor: { lat: number; lon: number; accuracy: number; timestamp: number } | null = null;
    let gpsCourse: { heading: number; timestamp: number } | null = null;
    let windyControlsStyles: HTMLStyleElement[] = [];
    let hiddenWindyCrosshair: HTMLElement | null = null;
    let crosshairStyle: HTMLStyleElement | null = null;
    let mapLabelSettings: HTMLDetailsElement | null = null;
    const routeStorageKey = 'route-builder-saved-route-v1';
    const routeStorageBackupKey = 'route-builder-saved-route-backup-v1';
    const routeSnapshotKey = 'route-builder-route-snapshot-v1';
    const routeSnapshotKeys = [routeSnapshotKey, `${routeSnapshotKey}-2`, `${routeSnapshotKey}-3`];

    function toLocalDateTimeInput(date: Date): string {
        return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    }

    function resetCleanRouteDeparture(): void {
        const rounded = nearestHourlyDeparture(new Date());
        if (!rounded) return;
        departureDateTime = toLocalDateTimeInput(rounded);
        restoredDepartureTimestamp = null;
        recenterDepartureTimeline = true;
    }

    function hasValidCoordinates(lat: unknown, lon: unknown): boolean {
        return typeof lat === 'number' && Number.isFinite(lat) && lat >= -90 && lat <= 90
            && typeof lon === 'number' && Number.isFinite(lon) && lon >= -180 && lon <= 180;
    }

    async function getForecastRequest(model: 'gfs' | 'ecmwf' | 'gfsWaves' | 'ecmwfWaves' | 'cmems' | 'mblue' | 'icon' | 'aromeAntilles', lat: number, lon: number): Promise<any> {
        if (!hasValidCoordinates(lat, lon)) {
            throw new Error(`Coordenadas inválidas para la consulta: lat ${lat}, lon ${lon}.`);
        }
        const days = Math.max(1, Math.min(15, Math.floor(Number(weatherSearchDays) || 7)));
        let timeoutId = 0;
        const timeout = new Promise<never>((_, reject) => {
            timeoutId = window.setTimeout(() => reject(new Error(`Windy no respondió a la consulta ${model} en 20 segundos.`)), 20000);
        });
        try {
            return await Promise.race([
                (async () => {
                    const options = { lat, lon, step: 1 as const, days, extended: true, interpolate: true, source: 'multiload' as const };
                    const atmospheric = ['gfs', 'ecmwf', 'mblue', 'icon', 'aromeAntilles'].includes(model);
                    if (!atmospheric) return getPointForecastData(model, options);
                    try { return await getPointForecastData(model, options, { meteogram: true }); }
                    catch { return getPointForecastData(model, options); }
                })(),
                timeout,
            ]);
        } finally {
            window.clearTimeout(timeoutId);
        }
    }

    async function getCachedForecastBundle(lat: number, lon: number): Promise<ForecastBundle> {
        const days = Math.max(1, Math.min(15, Math.floor(Number(weatherSearchDays) || 7)));
        const key = `gfs+ecmwf+gfsWaves+ecmwfWaves+cmems+mblue+icon+aromeAntilles:${days}:${lat.toFixed(5)}:${lon.toFixed(5)}`;
        const existing = forecastDataCache.get(key);
        if (existing && existing.expiresAt > Date.now()) return existing.promise;
        if (existing) forecastDataCache.delete(key);
        const promise = (async () => {
            const optionalForecast = async (model: 'gfs' | 'ecmwf' | 'gfsWaves' | 'ecmwfWaves' | 'cmems' | 'mblue' | 'icon' | 'aromeAntilles') => {
                try {
                    const response: any = await getForecastRequest(model, lat, lon);
                    const forecast = response?.data?.data || response?.data;
                    if (forecast && response?.data?.meteogram) forecast.__meteogram = response.data.meteogram;
                    if (!forecast || !Array.isArray(forecast.ts)) throw new Error(`${model} respondió sin una serie temporal utilizable.`);
                    return { forecast, error: undefined as string | undefined };
                } catch (error) {
                    return { forecast: null, error: error instanceof Error ? error.message : String(error) };
                }
            };
            const [gfsResult, ecmwfResult, seaResult, ecmwfSeaResult, currentsResult, mblueResult, iconResult, aromeResult] = await Promise.all([
                optionalForecast('gfs'), optionalForecast('ecmwf'), optionalForecast('gfsWaves'), optionalForecast('ecmwfWaves'),
                optionalForecast('cmems'), optionalForecast('mblue'), optionalForecast('icon'), optionalForecast('aromeAntilles'),
            ]);
            if (![gfsResult, ecmwfResult, seaResult, ecmwfSeaResult, currentsResult, mblueResult, iconResult, aromeResult].some(result => result.forecast)) {
                throw new Error('Ningún modelo devolvió datos para esta ubicación.');
            }
            const data = gfsResult.forecast || { ts: [] };
            const ecmwfData = ecmwfResult.forecast;
            const seaData = seaResult.forecast;
            const ecmwfSeaData = ecmwfSeaResult.forecast;
            const currentsData = currentsResult.forecast;
            const mblueData = mblueResult.forecast;
            const iconData = iconResult.forecast;
            const aromeData = aromeResult.forecast;
            const mblueError = mblueData ? undefined : mblueResult.error || 'mBlue AI respondió sin una serie horaria de viento utilizable.';
            const iconError = iconData ? undefined : iconResult.error || 'ICON respondió sin una serie horaria de viento utilizable.';
            const aromeError = aromeData ? undefined : aromeResult.error || 'AROME Antillas respondió sin una serie horaria de viento utilizable.';
            const currentsError = currentsData ? undefined : currentsResult.error || 'CMEMS respondió sin una serie temporal de corrientes utilizable.';
            const ecmwfError = ecmwfData ? undefined : ecmwfResult.error || 'ECMWF respondió sin una serie horaria de viento utilizable.';
            const seaError = seaResult.error;
            const ecmwfSeaError = ecmwfSeaResult.error;
            return { data, seaData, ecmwfData, ecmwfSeaData, currentsData, mblueData, iconData, aromeData, seaError, ecmwfError, ecmwfSeaError, currentsError, mblueError, iconError, aromeError };
        })();
        forecastDataCache.set(key, { expiresAt: Date.now() + 30 * 60 * 1000, promise });
        while (forecastDataCache.size > 240) forecastDataCache.delete(forecastDataCache.keys().next().value as string);
        try {
            return await promise;
        } catch (error) {
            if (forecastDataCache.get(key)?.promise === promise) forecastDataCache.delete(key);
            throw error;
        }
    }

    async function loadForecastBundles(
        samples: RouteForecastSample[],
        job: number,
        onBundleLoaded: (index: number, result: ForecastBundleResult) => void,
    ): Promise<void> {
        let next = 0;
        let completed = 0;
        const yieldToBrowser = () => new Promise<void>(resolve => window.setTimeout(resolve, 0));
        const worker = async () => {
            while (next < samples.length && job === forecastJob) {
                const index = next++;
                const sample = samples[index];
                try {
                    const bundle = await getCachedForecastBundle(sample.lat, sample.lon);
                    if (job !== forecastJob) return;
                    onBundleLoaded(index, { bundle });
                } catch (error) {
                    if (job !== forecastJob) return;
                    onBundleLoaded(index, { error: error instanceof Error ? error.message : 'No se pudo consultar el pronóstico de Windy.' });
                }
                completed++;
                // Cached responses can all resolve in the same microtask burst. Yield
                // periodically so map gestures and paints get time on the main thread.
                if (completed % 4 === 0) await yieldToBrowser();
                if (job !== forecastJob) return;
            }
        };
        await Promise.all(Array.from({ length: Math.min(4, samples.length) }, worker));
    }

    function selectDepartureTime(value: Date | number): void {
        if (liveRouteActive) return;
        const selected = value instanceof Date ? value : new Date(value);
        if (!Number.isFinite(selected.getTime())) return;
        restoredDepartureTimestamp = null;
        departureDateTime = toLocalDateTimeInput(selected);
        updateNavigationPanel();
        saveRoute();
        updateQuickDepartureFields(selected.getTime());
        redrawMap();
        // The selected departure changes each route sample's ETA, so refresh
        // the route forecast and, when configured, re-evaluate all candidate
        // departures against their new passage times.
        if (forecastDrawer?.classList.contains('is-open')) void calculateRouteForecast();
    }

    function departureTimestampAtTimelineCenter(scroller: HTMLElement): number | null {
        const timelineStart = Number(scroller.dataset.timelineStart);
        const pixelsPerHour = Number(scroller.dataset.pixelsPerHour);
        const leftPad = Number(scroller.dataset.timebarLeftPad);
        const minDeparture = Number(scroller.dataset.minDeparture);
        const maxDeparture = Number(scroller.dataset.maxDeparture);
        if (!scroller.clientWidth || ![timelineStart, pixelsPerHour, leftPad, minDeparture, maxDeparture].every(Number.isFinite) || pixelsPerHour <= 0) return null;
        const xForTime = (timestamp: number) => leftPad + (timestamp - timelineStart) / 3600000 * pixelsPerHour;
        const minScroll = Math.max(0, xForTime(minDeparture) - scroller.clientWidth / 2);
        const maxScroll = Math.max(minScroll, xForTime(maxDeparture) - scroller.clientWidth / 2);
        const clampedScroll = Math.max(minScroll, Math.min(maxScroll, scroller.scrollLeft));
        if (Math.abs(clampedScroll - scroller.scrollLeft) > 1) scroller.scrollLeft = clampedScroll;
        const centerX = clampedScroll + scroller.clientWidth / 2;
        const timestamp = timelineStart + (centerX - leftPad) / pixelsPerHour * 3600000;
        return Math.round(Math.max(minDeparture, Math.min(maxDeparture, timestamp)) / 60000) * 60000;
    }

    function snapDepartureTimestamp(timestamp: number, minDeparture: number, maxDeparture: number): number {
        const interval = Math.max(1, Number(departureIntervalHours) || 1);
        const input = new Date(timestamp);
        const midnight = new Date(input);
        midnight.setHours(0, 0, 0, 0);
        let closest = Math.max(minDeparture, Math.min(maxDeparture, timestamp));
        let closestDelta = Number.POSITIVE_INFINITY;
        for (let dayOffset = -1; dayOffset <= 1; dayOffset++) {
            const day = new Date(midnight);
            day.setDate(day.getDate() + dayOffset);
            for (let hour = 0; hour < 24; hour += interval) {
                const candidate = new Date(day);
                candidate.setHours(hour, 0, 0, 0);
                const candidateTime = candidate.getTime();
                if (candidateTime < minDeparture || candidateTime > maxDeparture) continue;
                const delta = Math.abs(candidateTime - timestamp);
                if (delta < closestDelta) {
                    closest = candidateTime;
                    closestDelta = delta;
                }
            }
        }
        return closest;
    }

    function updateQuickDepartureFields(departureTimestamp: number): void {
        if (!forecastDrawer) return;
        const durationHours = points.slice(1).reduce((hours, point, index) => hours + haversineNm(points[index], point) / Math.max(0.1, speedKnots), 0);
        const distanceNm = points.slice(1).reduce((distance, point, index) => distance + haversineNm(points[index], point), 0);
        const arrivalTimestamp = departureTimestamp + durationHours * 3600000;
        const compactDate = new Intl.DateTimeFormat('es', { day: '2-digit', month: '2-digit' });
        const formatDateTime = (timestamp: number) => `${compactDate.format(new Date(timestamp))} · ${formatWaypointHour(new Date(timestamp))}`;
        const timebarScroll = forecastDrawer.querySelector<HTMLElement>('.departure-timebar-scroll');
        const callout = forecastDrawer.querySelector<HTMLElement>('.departure-timebar-callout');
        if (callout && timebarScroll) {
            const distanceLabel = distanceUnit === 'km' ? `${(distanceNm * 1.852).toFixed(1)} km` : `${distanceNm.toFixed(1)} Nm`;
            callout.innerHTML = `<span>Inicio ${formatDateTime(departureTimestamp)} → Llega ${formatDateTime(arrivalTimestamp)}</span><small>Duración: ${formatDuration(durationHours)} · ${distanceLabel}</small>`;
        }

        const arrivalRow = forecastDrawer.querySelector<HTMLElement>('tr[data-route-field-row="arrival"]');
        const summary = arrivalRow?.querySelectorAll<HTMLElement>('.forecast-stat-cell b');
        if (summary?.length === 3) {
            summary[0].textContent = formatDateTime(departureTimestamp);
            summary[1].textContent = formatDateTime(arrivalTimestamp);
            summary[2].textContent = formatDuration(durationHours);
        }
    }

    function updateLiveDrawerTimes(timestamp: number): void {
        if (!forecastDrawer || forecastDrawer.hidden) return;
        const arrivalRow = forecastDrawer.querySelector<HTMLElement>('tr[data-route-field-row="arrival"]');
        const dateFormat = new Intl.DateTimeFormat('es', { day: '2-digit', month: '2-digit' });
        arrivalRow?.querySelectorAll<HTMLElement>('td[data-forecast-index]').forEach(cell => {
            const sample = routeForecast[Number(cell.dataset.forecastIndex)];
            const dateTime = cell.querySelector<HTMLElement>('.forecast-date-time');
            if (!sample || !dateTime) return;
            dateTime.innerHTML = `<small>${dateFormat.format(sample.eta)}</small><b>${formatWaypointHour(sample.eta)}</b>`;
        });
        const distances = [0];
        for (let index = 1; index < points.length; index++) {
            distances.push(distances[index - 1] + haversineNm(points[index - 1], points[index]));
        }
        const totalDistance = distances[distances.length - 1] || 0;
        const visibleIndices = points.map((_, index) => index).filter(index => !liveRouteActive || index !== 0);
        forecastDrawer.querySelectorAll<HTMLElement>('.route-waypoint-dot').forEach((dot, dotIndex) => {
            const index = visibleIndices[dotIndex];
            if (index === undefined) return;
            const number = waypointNumber(index);
            const name = index === 0 ? 'Inicio' : index === points.length - 1 ? 'Destino' : `Intermedio ${index}`;
            dot.style.left = `${totalDistance > 0 ? distances[index] / totalDistance * 100 : 50}%`;
            dot.title = `P${number} · ${name}`;
            dot.textContent = String(number);
        });
        updateQuickDepartureFields(timestamp);
    }

    function saveRoute(): void {
        if (liveRouteActive) return;
        try {
            const serialized = JSON.stringify({
                version: 1,
                points,
                nextPointId,
                departureDateTime,
                speedKnots,
            });
            localStorage.setItem(routeStorageKey, serialized);
            localStorage.setItem(routeStorageBackupKey, serialized);
        } catch { /* Keep the current route for this session if storage is unavailable. */ }
    }

    function parseRouteSnapshot(serialized: string | null): { points: Waypoint[]; nextPointId: number; departureDateTime?: string; speedKnots?: number } | null {
        if (!serialized) return null;
        try {
            const snapshot = JSON.parse(serialized);
            if (snapshot?.version !== 1 || !Array.isArray(snapshot.points)) return null;
            const ids = snapshot.points.map((point: any) => point?.id);
            const validIds = ids.every((id: unknown) => Number.isSafeInteger(id) && Number(id) > 0)
                && new Set(ids).size === ids.length;
            const validPoints = validIds && snapshot.points.every((point: any) => hasValidCoordinates(point?.lat, point?.lon));
            if (!validPoints) return null;
            const points = snapshot.points.map((point: Waypoint) => ({ id: point.id, lat: point.lat, lon: point.lon }));
            const maxId = points.reduce((max, point) => Math.max(max, point.id), 0);
            const storedNextId = Number(snapshot.nextPointId);
            return {
                points,
                nextPointId: Math.max(maxId + 1, Number.isSafeInteger(storedNextId) && storedNextId > 0 ? storedNextId : 1),
                departureDateTime: typeof snapshot.departureDateTime === 'string'
                    && Number.isFinite(new Date(snapshot.departureDateTime).getTime()) ? snapshot.departureDateTime : undefined,
                speedKnots: snapshot.speedKnots !== null && Number.isFinite(Number(snapshot.speedKnots)) && Number(snapshot.speedKnots) >= 0
                    ? Math.min(20, Number(snapshot.speedKnots)) : undefined,
            };
        } catch { return null; }
    }

    function restoreRoute(): boolean {
        try {
            const snapshot = parseRouteSnapshot(localStorage.getItem(routeStorageKey))
                || parseRouteSnapshot(localStorage.getItem(routeStorageBackupKey));
            if (!snapshot) return false;
            points = snapshot.points;
            nextPointId = snapshot.nextPointId;
            if (snapshot.departureDateTime) {
                departureDateTime = snapshot.departureDateTime;
                restoredDepartureTimestamp = new Date(snapshot.departureDateTime).getTime();
                recenterDepartureTimeline = true;
            }
            if (points.length === 0) resetCleanRouteDeparture();
            if (snapshot.speedKnots !== undefined) speedKnots = Math.max(0, Math.min(20, snapshot.speedKnots));
            return true;
        } catch { return false; }
    }

    function saveRouteSnapshot(slot: number): void {
        if (!liveRouteActive && points.length === 0) {
            forecastMessage = 'No hay una ruta para guardar.';
            renderForecastDrawer();
            return;
        }
        const savedPoints = liveRouteActive ? buildLiveRouteSnapshot(livePastWaypoints, points, navigationFix, navigationTargetId, Date.now()) : points;
        if (!savedPoints) {
            updateForecastStatus('No se pudo guardar: espera una posición GPS reciente y un próximo waypoint válido.');
            return;
        }
        try {
            localStorage.setItem(routeSnapshotKeys[slot], JSON.stringify({
                version: 1,
                points: savedPoints,
                nextPointId: Math.max(nextPointId, ...savedPoints.map(point => point.id + 1)),
                departureDateTime,
                speedKnots,
            }));
            routeSnapshotActions[slot] = 'load';
            forecastMessage = `Ruta ${slot + 1} guardada en el plugin.`;
            renderForecastDrawer();
        } catch {
            forecastMessage = 'No se pudo guardar la ruta en el almacenamiento del navegador.';
            renderForecastDrawer();
        }
    }

    function loadRouteSnapshot(slot: number): void {
        let snapshot: ReturnType<typeof parseRouteSnapshot> = null;
        try { snapshot = parseRouteSnapshot(localStorage.getItem(routeSnapshotKeys[slot])); } catch { /* Storage can be unavailable in private browsing. */ }
        if (!snapshot) {
            forecastMessage = `No hay una ruta guardada válida en el espacio ${slot + 1}.`;
            routeSnapshotActions[slot] = 'save';
            renderForecastDrawer();
            return;
        }
        if (liveRouteActive) {
            const now = Date.now();
            const fix = navigationFix;
            const fixIsCurrent = !!fix && fix.timestamp <= now && now - fix.timestamp <= 30000 && hasValidCoordinates(fix.lat, fix.lon);
            const currentSpeed = currentRouteSpeed(liveAverageSpeed(recentGpsSpeeds, now, liveSpeedSeconds * 1000));
            if (!fixIsCurrent || currentSpeed === null || snapshot.points.length < 2) {
                updateForecastStatus(!fixIsCurrent
                    ? 'No se pudo cargar en VIVO: espera una posición GPS reciente.'
                    : currentSpeed === null
                        ? 'No se pudo cargar en VIVO: espera una velocidad GPS válida.'
                        : 'No se pudo cargar en VIVO: la ruta necesita al menos dos waypoints.');
                return;
            }
            const targetIndex = chooseNextWaypoint(fix, snapshot.points);
            if (targetIndex < 0 || targetIndex >= snapshot.points.length) {
                updateForecastStatus('No se pudo ubicar la posición actual en la ruta cargada.');
                return;
            }
            const loadedPoints = snapshot.points.map(point => ({ ...point }));
            liveOriginalWaypointNumbers = new Map(loadedPoints.map((point, index) => [point.id, index + 1]));
            livePastWaypoints = loadedPoints.slice(0, targetIndex).map((point, index) => ({ point, number: index + 1 }));
            const boatPointId = Math.max(snapshot.nextPointId, nextPointId, ...loadedPoints.map(point => point.id + 1));
            points = [{ id: boatPointId, lat: fix.lat, lon: fix.lon }, ...loadedPoints.slice(targetIndex)];
            nextPointId = boatPointId + 1;
            navigationTargetId = loadedPoints[targetIndex].id;
            waypointArrivalConfirmations = 0;
            liveDisplayPoints = null;
            liveRouteUpdatedAt = now;
            speedKnots = currentSpeed;
            departureDateTime = toLocalDateTimeInput(new Date(now));
            restoredDepartureTimestamp = new Date(departureDateTime).getTime();
            recenterDepartureTimeline = true;
            try { localStorage.setItem('route-builder-speed-knots', String(speedKnots)); } catch { /* Keep the live speed for this session. */ }
            recalculate(true);
            fitLoadedRoute(points);
            restartLiveTimers();
            return;
        }
        points = snapshot.points;
        nextPointId = snapshot.nextPointId;
        navigationTargetId = null;
        waypointArrivalConfirmations = 0;
        const departure = restoredDeparture(snapshot.departureDateTime);
        departureDateTime = toLocalDateTimeInput(new Date(departure));
        restoredDepartureTimestamp = departure;
        recenterDepartureTimeline = true;
        if (snapshot.speedKnots !== undefined) {
            speedKnots = Math.max(0, Math.min(20, snapshot.speedKnots));
            try { localStorage.setItem('route-builder-speed-knots', String(speedKnots)); } catch { /* Current session still uses the restored speed. */ }
        }
        recalculate(true);
        fitLoadedRoute(points);
    }

    function leaveLiveRoute(restorePreviousRoute = false, clearNavigationBackup = true): boolean {
        let snapshot: ReturnType<typeof parseRouteSnapshot> = null;
        let restorePreviousWarning = false;
        if (restorePreviousRoute) {
            snapshot = navigationPlanBackupActive ? loadTemporaryPlan(localStorage, parseRouteSnapshot) : null;
            if (!snapshot || !snapshot.departureDateTime || snapshot.speedKnots === undefined) {
                snapshot = null;
                restorePreviousRoute = false;
                restorePreviousWarning = true;
            }
        }
        let preservedPoints: Waypoint[] | null = null;
        if (!restorePreviousRoute && liveRouteActive) {
            preservedPoints = points.length
                ? buildLiveRoutePoints(livePastWaypoints, points, navigationTargetId, points[0])
                : [];
            if (!preservedPoints) {
                updateForecastStatus('No se pudo conservar la ruta actual. Comprueba que tenga un próximo waypoint válido.');
                return false;
            }
        }
        if (snapshot) {
            points = snapshot.points;
            nextPointId = snapshot.nextPointId;
            departureDateTime = snapshot.departureDateTime!;
            restoredDepartureTimestamp = new Date(departureDateTime).getTime();
            recenterDepartureTimeline = true;
            speedKnots = snapshot.speedKnots!;
        } else if (preservedPoints) {
            points = preservedPoints;
            nextPointId = Math.max(nextPointId, ...preservedPoints.map(point => point.id + 1));
            const departure = new Date(departureDateTime).getTime();
            restoredDepartureTimestamp = Number.isFinite(departure) ? departure : null;
            recenterDepartureTimeline = true;
        }
        navigationTargetId = null;
        waypointArrivalConfirmations = 0;
        liveRouteActive = false;
        liveRouteUpdatedAt = 0;
        livePastWaypoints = [];
        liveOriginalWaypointNumbers.clear();
        pastWaypointLayer?.removeFrom(map);
        pastWaypointLayer = null;
        pastRouteLine?.removeFrom(map);
        pastRouteLine = null;
        liveDisplayPoints = null;
        if (liveRefreshTimer !== null) window.clearInterval(liveRefreshTimer);
        liveRefreshTimer = null;
        if (liveWaypointTimer !== null) window.clearInterval(liveWaypointTimer);
        liveWaypointTimer = null;
        liveButton?.setAttribute('aria-pressed', 'false');
        recalculate(true);
        if (clearNavigationBackup) {
            clearTemporaryPlan(localStorage);
            navigationPlanBackupActive = false;
        }
        if (restorePreviousWarning) updateForecastStatus('No se encontró la ruta anterior; se conservó la ruta actual.');
        return true;
    }

    function enterLiveRoute(): void {
        const fix = navigationFix;
        const now = Date.now();
        const targetIndex = points.findIndex(point => point.id === navigationTargetId);
        if (!fix || now - fix.timestamp > 30000 || fix.timestamp > now || targetIndex < 0 || points.length < 2) {
            updateForecastStatus('Se necesita una posición GPS reciente y una ruta con próximo waypoint.');
            return;
        }
        const currentSpeed = currentRouteSpeed(liveAverageSpeed(recentGpsSpeeds, now, liveSpeedSeconds * 1000));
        if (currentSpeed === null) {
            updateForecastStatus('Se necesita una velocidad GPS reciente de al menos 0,1 kt para activar EN VIVO.');
            return;
        }
        if (!navigationPlanBackupActive) {
            if (!saveTemporaryPlan(localStorage, { points, nextPointId, departureDateTime, speedKnots })) {
                updateForecastStatus('No se pudo guardar la ruta anterior; EN VIVO no se activó.');
                return;
            }
            navigationPlanBackupActive = true;
        }
        if (departureScrollCommitTimer !== null) {
            window.clearTimeout(departureScrollCommitTimer);
            departureScrollCommitTimer = null;
        }
        const destinationId = points[targetIndex].id;
        liveOriginalWaypointNumbers = new Map(points.map((point, index) => [point.id, index + 1]));
        livePastWaypoints = points.slice(0, targetIndex).map((point, index) => ({ point: { ...point }, number: index + 1 }));
        points = [{ id: nextPointId++, lat: fix.lat, lon: fix.lon }, ...points.slice(targetIndex).map(point => ({ ...point }))];
        speedKnots = currentSpeed;
        departureDateTime = toLocalDateTimeInput(new Date(now));
        restoredDepartureTimestamp = new Date(departureDateTime).getTime();
        recenterDepartureTimeline = true;
        navigationTargetId = destinationId;
        waypointArrivalConfirmations = 0;
        liveRouteActive = true;
        liveRouteUpdatedAt = now;
        liveButton?.setAttribute('aria-pressed', 'true');
        recalculate(true);
        restartLiveTimers();
    }

    function tryStartAutomaticLive(): void {
        if (!autoLivePending || !navigationActive || liveRouteActive || !navigationFix || points.length < 2) return;
        const now = Date.now();
        if (navigationFix.timestamp > now || now - navigationFix.timestamp > 30000 ||
            points.findIndex(point => point.id === navigationTargetId) < 0 ||
            currentRouteSpeed(liveAverageSpeed(recentGpsSpeeds, now, liveSpeedSeconds * 1000)) === null) return;
        autoLivePending = false;
        enterLiveRoute();
    }

    function restartLiveTimers(): void {
        if (liveRefreshTimer !== null) window.clearInterval(liveRefreshTimer);
        if (liveWaypointTimer !== null) window.clearInterval(liveWaypointTimer);
        liveRefreshTimer = null;
        liveWaypointTimer = null;
        if (!liveRouteActive) return;
        liveRefreshTimer = window.setInterval(refreshLiveRoute, liveForecastSeconds * 1000);
        liveWaypointTimer = window.setInterval(refreshLiveWaypoints, liveWaypointSeconds * 1000);
    }

    function refreshLiveWaypoints(): void {
        if (!liveRouteActive || !navigationActive || !navigationFix || Date.now() - navigationFix.timestamp > 30000 || points.length < 2) return;
        const targetIndex = points.findIndex(point => point.id === navigationTargetId);
        if (targetIndex < 1) return;
        if (targetIndex > 1 && !forecastBusy) {
            refreshLiveRoute();
            return;
        }
        if (!forecastBusy) refreshLiveRoute(false);
    }

    function refreshLiveRoute(updateForecast = true): void {
        if (!liveRouteActive || !navigationActive || forecastBusy) return;
        const now = Date.now();
        const averageSpeed = liveAverageSpeed(recentGpsSpeeds, now, liveSpeedSeconds * 1000);
        const next = prepareLiveRefresh(navigationFix ? { ...navigationFix, speed: averageSpeed } : null, points, navigationTargetId, now);
        if (!next) {
            updateForecastStatus('EN VIVO sin actualizar: espera una posición y velocidad GPS válidas.');
            return;
        }
        const targetIndex = points.findIndex(point => point.id === navigationTargetId);
        const knownPastIds = new Set(livePastWaypoints.map(entry => entry.point.id));
        for (const point of points.slice(1, targetIndex)) {
            const number = liveOriginalWaypointNumbers.get(point.id);
            if (number !== undefined && !knownPastIds.has(point.id)) {
                livePastWaypoints.push({ point: { ...point }, number });
                knownPastIds.add(point.id);
            }
        }
        points = next.points;
        liveDisplayPoints = null;
        speedKnots = next.speed;
        liveRouteUpdatedAt = now;
        departureDateTime = toLocalDateTimeInput(new Date(now));
        restoredDepartureTimestamp = new Date(departureDateTime).getTime();
        recenterDepartureTimeline = true;
        if (updateForecast) forecastDataCache.clear();
        else updateLiveForecastSampleTimes(now);
        recalculate(updateForecast, !updateForecast);
        if (!updateForecast && forecastDrawer?.classList.contains('is-open')) updateLiveDrawerTimes(now);
    }

    function haversineNm(a: Waypoint, b: Waypoint): number {
        const rad = (degrees: number) => degrees * Math.PI / 180;
        const dLat = rad(b.lat - a.lat);
        const dLon = rad(b.lon - a.lon);
        const lat1 = rad(a.lat);
        const lat2 = rad(b.lat);
        const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
        return 3440.065 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
    }

    function updateLiveForecastSampleTimes(baseTimestamp: number): void {
        if (!routeForecast.length || points.length < 2) return;
        const cumulative = [0];
        for (let index = 1; index < points.length; index++) {
            cumulative.push(cumulative[index - 1] + haversineNm(points[index - 1], points[index]));
        }
        const speed = Math.max(0.1, speedKnots);
        for (const sample of routeForecast) {
            let closestDistance = 0;
            let closestOffset = Number.POSITIVE_INFINITY;
            for (let index = 1; index < points.length; index++) {
                const start = points[index - 1];
                const end = points[index];
                const referenceLat = (start.lat + end.lat + sample.lat) / 3 * Math.PI / 180;
                const longitudeScale = Math.max(1e-6, Math.cos(referenceLat));
                const dx = (end.lon - start.lon) * longitudeScale;
                const dy = end.lat - start.lat;
                const sampleX = (sample.lon - start.lon) * longitudeScale;
                const sampleY = sample.lat - start.lat;
                const lengthSquared = dx * dx + dy * dy;
                const fraction = lengthSquared > 1e-12
                    ? Math.max(0, Math.min(1, (sampleX * dx + sampleY * dy) / lengthSquared))
                    : 0;
                const offset = Math.hypot(sampleX - dx * fraction, sampleY - dy * fraction);
                if (offset < closestOffset) {
                    closestOffset = offset;
                    closestDistance = cumulative[index - 1] + (cumulative[index] - cumulative[index - 1]) * fraction;
                }
            }
            sample.distanceNm = closestDistance;
            sample.eta = new Date(baseTimestamp + closestDistance / speed * 3600000);
        }
    }

    function recalculate(refreshForecast = false, preserveForecastPrefix = false): void {
        distanceNm = calculateDistanceNm();
        updateNavigationPanel();
        invalidateForecast(preserveForecastPrefix);
        redrawMap();
        saveRoute();
        if (refreshForecast && points.length >= 2 && forecastDrawer?.classList.contains('is-open')) {
            void calculateRouteForecast();
        } else if (points.length < 2 && forecastDrawer?.classList.contains('is-open')) {
            forecastMessage = 'Agrega al menos dos Waypoints para consultar el pronóstico.';
            renderForecastDrawer();
        }
    }

    function invalidateForecast(preserveRouteForecast = false): void {
        forecastJob++;
        forecastBusy = false;
        departureAnalysisBusy = false;
        departureEvaluations = [];
        if (!preserveRouteForecast) routeForecast = [];
        forecastMessage = '';
        hideRouteForecastHighlight();
    }

    function calculateDistanceNm(): number {
        return points.slice(1).reduce((sum, point, index) => {
            return sum + haversineNm(points[index], point);
        }, 0);
    }

    function calculateWaypointTimes(routePoints: Waypoint[] = points, departureTimestamp?: number): Date[] {
        const departure = new Date(departureTimestamp ?? (liveRouteActive && liveRouteUpdatedAt ? liveRouteUpdatedAt : departureDateTime));
        if (!Number.isFinite(departure.getTime())) return [];
        let elapsedHours = 0;
        return routePoints.map((point, index) => {
            if (index > 0) elapsedHours += haversineNm(routePoints[index - 1], point) / Math.max(0.1, speedKnots);
            return new Date(departure.getTime() + elapsedHours * 3600000);
        });
    }

    function formatWaypointDate(date: Date): string {
        return new Intl.DateTimeFormat('es', { day: '2-digit', month: 'short' }).format(date).replace('.', '');
    }

    function formatWaypointHour(date: Date): string {
        return new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date);
    }

    function formatTimelineDateTime(timestamp: number): string {
        if (!Number.isFinite(timestamp)) return '—';
        const date = new Date(timestamp);
        const dateLabel = new Intl.DateTimeFormat('es', { day: '2-digit', month: '2-digit' }).format(date);
        return `${dateLabel} · ${formatWaypointHour(date)}`;
    }

    function formatDuration(hours: number): string {
        const totalMinutes = Math.max(0, Math.round(hours * 60));
        const days = Math.floor(totalMinutes / 1440);
        const remainingMinutes = totalMinutes % 1440;
        const wholeHours = Math.floor(remainingMinutes / 60);
        const minutes = remainingMinutes % 60;
        if (days) return `${days}d ${wholeHours}h`;
        if (wholeHours) return `${wholeHours}h ${String(minutes).padStart(2, '0')}m`;
        return `${minutes} min`;
    }

    function trueBearing(from: Waypoint, to: Waypoint): number {
        const rad = (degrees: number) => degrees * Math.PI / 180;
        const lat1 = rad(from.lat);
        const lat2 = rad(to.lat);
        const deltaLon = rad(to.lon - from.lon);
        const y = Math.sin(deltaLon) * Math.cos(lat2);
        const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon);
        return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
    }

    function waypointNumber(index: number): number {
        if (liveRouteActive) {
            if (index === 0) return 0;
            const point = points[index];
            if (point) {
                let number = liveOriginalWaypointNumbers.get(point.id);
                if (number === undefined) {
                    number = Math.max(0, ...liveOriginalWaypointNumbers.values()) + 1;
                    liveOriginalWaypointNumbers.set(point.id, number);
                }
                return number;
            }
        }
        return index + 1;
    }

    function renumberLiveWaypointInsertion(insertAt: number, newPointId: number): void {
        if (!liveRouteActive || insertAt < 1 || insertAt >= points.length) return;
        const newNumber = waypointNumber(insertAt);
        const shifted = points.slice(insertAt).map((point, offset) => ({
            id: point.id,
            number: waypointNumber(insertAt + offset) + 1,
        }));
        liveOriginalWaypointNumbers.set(newPointId, newNumber);
        for (const entry of shifted) liveOriginalWaypointNumbers.set(entry.id, entry.number);
        const targetIndex = points.findIndex(point => point.id === navigationTargetId);
        if (targetIndex >= insertAt) navigationTargetId = newPointId;
    }

    function updateNavigationPanel(freshFix = false): void {
        if (!navigationPanel) return;
        redrawGpsCourseLine();
        redrawWindIndicator();
        const fix = navigationFix && Date.now() - navigationFix.timestamp <= 30000 ? navigationFix : null;
        let index = points.findIndex(point => point.id === navigationTargetId);
        if (fix && index < 0 && points.length) {
            index = chooseNextWaypoint(fix, points);
            navigationTargetId = points[index]?.id ?? null;
            waypointArrivalConfirmations = 0;
        }
        if (fix && freshFix && fix.timestamp > lastNavigationFixTimestamp && index >= 0) {
            lastNavigationFixTimestamp = fix.timestamp;
            const progress = advanceWaypoint(fix, points, index, waypointArrivalConfirmations);
            index = progress.index;
            waypointArrivalConfirmations = progress.confirmations;
            navigationTargetId = points[index]?.id ?? null;
        }
        const waypointSelect = navigationPanel.querySelector<HTMLSelectElement>('[data-nav-waypoint-select]');
        if (waypointSelect) {
            const signature = `${liveRouteActive}:${points.map(point => point.id).join(',')}`;
            if (waypointSelect.dataset.routeSignature !== signature) {
                waypointSelect.innerHTML = points.map((point, i) => liveRouteActive && i === 0 ? '' : `<option value="${point.id}">Waypoint ${waypointNumber(i)}</option>`).join('');
                waypointSelect.dataset.routeSignature = signature;
            }
            waypointSelect.disabled = !points.length;
            if (index >= 0) waypointSelect.value = String(points[index].id);
        }
        const metrics = fix ? navigationMetrics(fix, points, index, fix.speed) : null;
        const averageSpeed = fix ? averageRouteSpeed(fix, points, index, new Date(departureDateTime).getTime(), fix.timestamp) : null;
        const degrees = (value: number | null | undefined) => typeof value === 'number' && Number.isFinite(value) ? `${String(Math.round(value) % 360).padStart(3, '0')}°` : '—';
        const distance = (value: number | null | undefined) => typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(1)} Nm` : '—';
        const duration = (value: number | null | undefined) => typeof value === 'number' && Number.isFinite(value) ? formatDuration(value) : '—';
        const eta = metrics?.hoursFinal != null ? formatTimelineDateTime(Date.now() + metrics.hoursFinal * 3600000).replace(' · ', ' ') : '—';
        const data: Record<string, string> = { waypoint: index >= 0 ? `Waypoint ${waypointNumber(index)}` : 'Waypoint', bearing: degrees(metrics?.bearing), nextDistance: distance(metrics?.distanceNext), nextTime: duration(metrics?.hoursNext), speed: fix?.speed != null ? fix.speed.toFixed(1) : '—', averageSpeed: averageSpeed !== null ? averageSpeed.toFixed(1) : '—', heading: degrees(fix?.heading), finalTime: duration(metrics?.hoursFinal), finalDistance: distance(metrics?.distanceFinal), eta };
        for (const [key, value] of Object.entries(data)) { const element = navigationPanel.querySelector<HTMLElement>(`[data-nav-value="${key}"]`); if (element) element.textContent = value; }
        updateBoatTrackMarker();
        redrawWindIndicator();
    }

    function updateBoatTrackMarker(): void {
        const marker = forecastDrawer?.querySelector<HTMLElement>('.route-waypoint-boat');
        if (!marker) return;
        const fix = navigationFix && Date.now() - navigationFix.timestamp <= 30000 ? navigationFix : null;
        const index = points.findIndex(point => point.id === navigationTargetId);
        const progress = routeProgress(fix, points, index);
        marker.hidden = progress === null;
        if (progress !== null) marker.style.left = `${progress * 100}%`;
    }

    function highlightRouteForecast(index: number): void {
        const sample = routeForecast[index];
        if (!sample) return;
        const icon = L.divIcon({
            className: 'route-builder-forecast-highlight-wrap',
            html: '<span class="route-builder-forecast-highlight"></span>',
            iconSize: [28, 28], iconAnchor: [14, 14],
        });
        if (!forecastHighlightMarker) forecastHighlightMarker = L.marker([sample.lat, sample.lon], { icon, interactive: false, zIndexOffset: 1200 }).addTo(map);
        else forecastHighlightMarker.setLatLng([sample.lat, sample.lon]);
        forecastHighlightMarker.setIcon(icon);
        forecastHighlightMarker.setZIndexOffset(1200);
    }

    function hideRouteForecastHighlight(): void {
        forecastHighlightMarker?.removeFrom(map);
        forecastHighlightMarker = null;
        if (hoverRestoreTimestamp !== null) {
            windyStore.set('timestamp', hoverRestoreTimestamp);
            hoverRestoreTimestamp = null;
            hoveredForecastTimestamp = null;
        }
    }

    function renderForecastDrawer(): void {
        if (!forecastDrawer) return;
        syncIndicatorSources();
        const visualAids = forecastDrawer.querySelector<HTMLDetailsElement>('.navigation-visual-aids');
        if (visualAids) visualAidsOpen = visualAids.open;
        const windSettings = forecastDrawer.querySelector<HTMLDetailsElement>('[data-visual-group="wind"]');
        const waveSettings = forecastDrawer.querySelector<HTMLDetailsElement>('[data-visual-group="wave"]');
        const laylineSettings = forecastDrawer.querySelector<HTMLDetailsElement>('[data-visual-group="laylines"]');
        const roseSettings = forecastDrawer.querySelector<HTMLDetailsElement>('[data-visual-group="rose"]');
        if (windSettings) windIndicatorSettingsOpen = windSettings.open;
        if (waveSettings) waveIndicatorSettingsOpen = waveSettings.open;
        if (laylineSettings) laylinesSettingsOpen = laylineSettings.open;
        if (roseSettings) windRoseSettingsOpen = roseSettings.open;
        applyForecastDrawerHeightLimit();
        const existingScroll = forecastDrawer.querySelector<HTMLElement>('.forecast-table-scroll')?.scrollLeft || 0;
        const pickerScroll = forecastDrawer.querySelector<HTMLElement>('.forecast-field-picker')?.scrollTop || 0;
        const previousTimebar = forecastDrawer.querySelector<HTMLElement>('.departure-timebar-scroll');
        const existingTimebarScroll = previousTimebar?.scrollLeft ?? departureTimelineScrollLeft;
        const routeDurationHours = points.slice(1).reduce((hours, point, index) => hours + haversineNm(points[index], point) / Math.max(0.1, speedKnots), 0);
        const departureSlots = candidateDepartureTimes().map(departure => departure.getTime());
        const firstSlot = departureSlots[0] ?? Math.floor(Date.now() / 60000) * 60000;
        const minDeparture = earliestDeparture(new Date(), restoredDepartureTimestamp);
        const maxDeparture = Math.max(departureSlots[departureSlots.length - 1] ?? minDeparture + 24 * 3600000, minDeparture, restoredDepartureTimestamp ?? minDeparture);
        const actualDeparture = new Date(departureDateTime).getTime();
        const cleanRouteDeparture = points.length === 0 ? nearestHourlyDeparture(Number.isFinite(actualDeparture) ? actualDeparture : new Date())?.getTime() : null;
        const selectedDeparture = cleanRouteDeparture !== null && cleanRouteDeparture !== undefined
            ? Math.max(minDeparture, Math.min(maxDeparture, cleanRouteDeparture))
            : restoredDepartureTimestamp !== null && actualDeparture === restoredDepartureTimestamp ? restoredDepartureTimestamp : snapDepartureTimestamp(Number.isFinite(actualDeparture) ? actualDeparture : minDeparture, minDeparture, maxDeparture);
        const alignedDepartureValue = toLocalDateTimeInput(new Date(selectedDeparture));
        if (departureDateTime !== alignedDepartureValue) {
            departureDateTime = alignedDepartureValue;
            saveRoute();
        }
        const pixelsPerHour = 10;
        const timelineStartDate = new Date(minDeparture);
        timelineStartDate.setHours(0, 0, 0, 0);
        timelineStartDate.setDate(timelineStartDate.getDate() - 7);
        const timelineStart = timelineStartDate.getTime();
        const latestArrival = maxDeparture + routeDurationHours * 3600000;
        const timelineEndDate = new Date(latestArrival);
        timelineEndDate.setHours(24, 0, 0, 0);
        const timelineEnd = timelineEndDate.getTime();
        const timelinePadding = Math.ceil(Math.max(window.innerWidth, window.screen?.width || 0, window.screen?.height || 0) / 2) + 8;
        const timelineX = (timestamp: number) => timelinePadding + (timestamp - timelineStart) / 3600000 * pixelsPerHour;
        const timebarWidth = Math.ceil(timelineX(timelineEnd) + timelinePadding);
        const formatTimelineDate = (timestamp: number) => new Intl.DateTimeFormat('es', { weekday: 'short', day: 'numeric' }).format(new Date(timestamp)).replace('.', '');
        const formatCompactDate = (date: Date) => new Intl.DateTimeFormat('es', { day: '2-digit', month: '2-digit' }).format(date);
        const dayBands: string[] = [];
        const hourTicks: string[] = [];
        let dayStart = new Date(timelineStart);
        dayStart.setHours(0, 0, 0, 0);
        while (dayStart.getTime() < timelineEnd) {
            const currentDayStart = dayStart.getTime();
            const nextDay = new Date(dayStart);
            nextDay.setDate(nextDay.getDate() + 1);
            nextDay.setHours(0, 0, 0, 0);
            const bandWidth = (nextDay.getTime() - currentDayStart) / 3600000 * pixelsPerHour;
            dayBands.push(`<span class="departure-day-band" style="left:${timelineX(currentDayStart)}px;width:${bandWidth}px">${formatTimelineDate(currentDayStart)}</span>`);
            for (let hour = 0; hour < 24; hour += Math.max(1, departureIntervalHours)) {
                const tickDate = new Date(currentDayStart);
                tickDate.setHours(hour, 0, 0, 0);
                const tickTime = tickDate.getTime();
                if (tickTime <= latestArrival) {
                    const label = hour === 0 || hour % 3 === 0 ? `<small>${String(hour).padStart(2, '0')}</small>` : '';
                    hourTicks.push(`<span class="departure-hour-tick" style="left:${timelineX(tickTime)}px"><i></i>${label}</span>`);
                }
            }
            dayStart = nextDay;
        }
        const selectedPosition = timelineX(selectedDeparture);
        const arrivalTimestamp = selectedDeparture + routeDurationHours * 3600000;
        const cells = (render: (sample: RouteForecastSample) => string, colorize?: (sample: RouteForecastSample) => string) => {
            const palette = colorize ? routeForecast.map(sample => colorize(sample) || '#e9eded') : [];
            return routeForecast.map((sample, index) => {
            const color = palette[index];
            const leftColor = index > 0 ? palette[index - 1] : color;
            const rightColor = index < palette.length - 1 ? palette[index + 1] : color;
            const style = color ? `background:linear-gradient(90deg,${mixForecastColors(leftColor, color)} 0%,${color} 50%,${mixForecastColors(color, rightColor)} 100%);color:${forecastTextColor(color)};` : '';
            return `<td data-column-index="${index + 4}" data-forecast-index="${index}"${style ? ` style="${style}"` : ''}>${render(sample)}<span class="forecast-column-resize-handle" data-resize-column="${index + 4}" role="separator" tabindex="0" aria-label="Redimensionar columna de pronóstico ${index + 1}" title="Arrastrar para cambiar el ancho"></span></td>`;
            }).join('');
        };
        const statCell = (label: string, value: number | string | null, suffix = '', decimals = 0, resizeColumn?: number, columnIndex?: number, bearing?: number | null) => {
            const rendered = value === null || typeof value === 'number' && !Number.isFinite(value)
                ? '—' : typeof value === 'number' ? `${value.toFixed(decimals)}${suffix}` : value;
            const arrow = typeof bearing === 'number' && Number.isFinite(bearing) && value !== null ? `<span class="forecast-arrow" style="transform:rotate(${bearing + 90}deg)">➤</span>` : '';
            const index = columnIndex ?? resizeColumn ?? 1;
            const resizeHandle = `<span class="forecast-column-resize-handle" data-resize-column="${index}" role="separator" tabindex="0" aria-label="Redimensionar columna ${label}" title="Arrastrar para cambiar el ancho"></span>`;
            return `<td class="forecast-stat-cell" data-column-index="${index}"><small>${label}</small><b>${arrow}${rendered}</b>${resizeHandle}</td>`;
        };
        const circularBearing = (directions: number[]): number | null => {
            if (!directions.length) return null;
            const x = directions.reduce((sum, angle) => sum + Math.cos(angle * Math.PI / 180), 0);
            const y = directions.reduce((sum, angle) => sum + Math.sin(angle * Math.PI / 180), 0);
            return Math.hypot(x, y) > 1e-10 ? averageDirection(directions) : null;
        };
        const statistics = (key: string, suffix = '', decimals = 0, circularMean = false, directionKey?: string) => {
            const values = routeForecast.map(sample => sample.values?.[key]).filter((value): value is number => value !== null && value !== undefined && Number.isFinite(value));
            if (!values.length) return statCell('Min', null, '', 0, undefined, 1) + statCell('Max', null, '', 0, undefined, 2) + statCell('Prom', null, '', 0, undefined, 3);
            const min = Math.min(...values), max = Math.max(...values);
            const mean = circularMean ? averageDirection(values) : values.reduce((sum, value) => sum + value, 0) / values.length;
            const paired = directionKey ? routeForecast.filter(sample => typeof sample.values?.[key] === 'number' && Number.isFinite(sample.values[key]) && typeof sample.values?.[directionKey] === 'number' && Number.isFinite(sample.values[directionKey])) : [];
            const minSample = directionKey ? routeForecast.find(sample => sample.values?.[key] === min) : undefined;
            const maxSample = directionKey ? routeForecast.find(sample => sample.values?.[key] === max) : undefined;
            const minBearing = circularMean ? min : directionKey ? minSample?.values?.[directionKey] : null;
            const maxBearing = circularMean ? max : directionKey ? maxSample?.values?.[directionKey] : null;
            const meanBearing = circularMean ? circularBearing(values) : directionKey ? circularBearing(paired.map(sample => sample.values![directionKey] as number)) : null;
            return statCell('Min', min, suffix, decimals, undefined, 1, minBearing) + statCell('Max', max, suffix, decimals, undefined, 2, maxBearing) + statCell('Prom', mean, suffix, decimals, undefined, 3, meanBearing);
        };
        const groupWaveDirection = (field: WindowConditionKey, sample: RouteForecastSample): number | null => {
            const directions = activeGroupFields(field).map(model => {
                const height = sample.values?.[model];
                const directionKey = field === 'wavesAverage' ? (model === 'waves' ? 'wavesDir' : 'ecmwfWavesDir') : (model === 'swell1' ? 'swell1Dir' : 'ecmwfSwell1Dir');
                const bearing = sample.values?.[directionKey];
                return typeof height === 'number' && Number.isFinite(height) && typeof bearing === 'number' && Number.isFinite(bearing) ? bearing : null;
            }).filter((bearing): bearing is number => bearing !== null);
            return circularBearing(directions);
        };
        const skyStatistics = () => {
            const values = routeForecast.map(sample => sample.values?.clouds)
                .filter((value): value is number => value !== null && value !== undefined && Number.isFinite(value))
                .map(value => value <= 1 ? value * 100 : value);
            if (!values.length) return statCell('Min', null, '', 0, undefined, 1) + statCell('Max', null, '', 0, undefined, 2) + statCell('Prom', null, '', 0, undefined, 3);
            const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
            return statCell('Min', Math.min(...values), '%', 0, undefined, 1) + statCell('Max', Math.max(...values), '%', 0, undefined, 2) + statCell('Prom', mean, '%', 0, undefined, 3);
        };
        const row = (label: string, render: (sample: RouteForecastSample) => string, colorize?: (sample: RouteForecastSample) => string, stats = '', conditionKey?: WindowConditionKey) => {
            const configured = conditionKey ? windowConditionConfigured(conditionKey) : false;
            const conditionStatus = conditionKey ? routeConditionResult(conditionKey) : null;
            const key = conditionKey || '';
            const group = additionalGroups[key as WindowConditionKey];
            const modelPrefix = key.match(/^(ecmwf|mblue|icon|arome)(Temperature|Feels|Rain|Gust|Dew|Sky)$/)?.[1];
            const extraModelInfo: Record<string, string[]> = { ecmwf: ['ECMWF · 9 km', 'is-ecmwf'], mblue: ['mBlue AI · global', 'is-mblue'], icon: ['ICON · 13 km', 'is-icon'], arome: ['AROME Antillas · 2.5 km', 'is-arome'] };
            const modelInfo = modelPrefix ? extraModelInfo[modelPrefix] : group ? [`${key === 'skyAverage' ? 'Predominante' : 'Promedio'} · ${activeGroupFields(key as WindowConditionKey).length} modelos`, 'is-wind-average'] : key === 'arrival' ? null
                : key === 'windAverage' ? [`Promedio · ${activeWindModelFields().length} modelos`, 'is-wind-average']
                : ['ecmwfWind', 'ecmwfWindDirection'].includes(key) ? ['ECMWF · 9 km', 'is-ecmwf']
                : ['mblueWind', 'mblueWindDirection'].includes(key) ? ['mBlue AI · global', 'is-mblue']
                : ['iconWind', 'iconWindDirection'].includes(key) ? ['ICON · 13 km', 'is-icon']
                : ['aromeWind', 'aromeWindDirection'].includes(key) ? ['AROME · 2.5 km', 'is-arome']
                : ['current', 'currentTide'].includes(key) ? ['CMEMS · 8 km', 'is-cmems']
                : ['ecmwfWaves', 'ecmwfSwell1', 'ecmwfSwell1Period', 'ecmwfWavesPeriod', 'ecmwfWavesPower'].includes(key) ? ['ECMWF WAM', 'is-ecmwf-waves']
                : ['waves', 'swell1', 'swell1Period', 'swell2', 'swell2Period', 'windWaves', 'windWavesPeriod', 'wavesPeriod', 'wavesPower'].includes(key) ? ['GFS Waves · 0.25°', 'is-gfs-waves']
                : ['wind', 'gust', 'direction'].includes(key) ? ['GFS · global', 'is-gfs']
                : ['GFS · global', 'is-gfs'];
            const modelBadge = modelInfo ? `<span class="forecast-model-badge ${modelInfo[1]}">${modelInfo[0]}</span>` : '';
            const windToggle = group ? `<button type="button" class="forecast-wind-group-toggle" data-group-toggle="${key}" aria-expanded="${collapsedGroups[key as WindowConditionKey] === false}" aria-label="${collapsedGroups[key as WindowConditionKey] === false ? 'Plegar' : 'Desplegar'} modelos">${collapsedGroups[key as WindowConditionKey] === false ? '▾' : '▸'}</button>` : key === 'windAverage' ? `<button type="button" class="forecast-wind-group-toggle" data-wind-models-toggle aria-expanded="${!windModelRowsCollapsed}" aria-label="${windModelRowsCollapsed ? 'Desplegar' : 'Plegar'} pronósticos de viento por modelo" title="${windModelRowsCollapsed ? 'Desplegar modelos' : 'Plegar modelos'}">${windModelRowsCollapsed ? '▸' : '▾'}</button>` : '';
            const removeButton = group ? `<button type="button" class="forecast-field-remove" data-route-field-remove="${key}" aria-label="Eliminar grupo ${label} y sus modelos" title="Eliminar todos los modelos del grupo">×</button>` : key === 'windAverage'
                ? `<button type="button" class="forecast-field-remove" data-route-field-remove="windAverage" aria-label="Eliminar el grupo de viento y todos sus modelos" title="Eliminar todos los modelos del grupo">×</button>`
                : `<button type="button" class="forecast-field-remove" data-route-field-remove="${conditionKey}" aria-label="Ocultar ${label}" title="Ocultar campo">×</button>`;
            const rowLabel = conditionKey ? `<span class="forecast-condition-row-label"><span class="forecast-field-drag" aria-hidden="true">⠿</span><span class="forecast-field-meta"><span class="forecast-field-name">${label}</span>${modelBadge}</span>${windToggle}<button type="button" class="window-condition-open${configured ? ' is-configured' : ''}${conditionStatus === true ? ' is-pass' : conditionStatus === false ? ' is-fail' : ''}" data-window-condition="${conditionKey}" aria-label="Configurar condición de ${label}" title="Configurar condición">⚙</button>${removeButton}</span>` : label;
            return `<tr${conditionKey ? ` class="forecast-field-row" draggable="true" data-route-field-row="${conditionKey}"` : colorize ? ' class="forecast-scale-row"' : ''}><th class="forecast-row-label" data-column-index="0">${rowLabel}<span class="forecast-column-resize-handle" data-resize-column="0" role="separator" tabindex="0" aria-label="Redimensionar columna de nombres de campo" title="Arrastrar para cambiar el ancho"></span></th>${stats}${cells(render, colorize)}</tr>`;
        };
        const direction = (sample: RouteForecastSample) => sample.values?.direction === null || sample.values?.direction === undefined
            ? '—' : `<span class="forecast-arrow" style="transform:rotate(${sample.values.direction + 90}deg)">➤</span>${Math.round(sample.values.direction)}°`;
        const directionFor = (sample: RouteForecastSample, key: string) => {
            const bearing = sample.values?.[key];
            return bearing === null || bearing === undefined ? '—' : `<span class="forecast-arrow" style="transform:rotate(${bearing + 90}deg)">➤</span>${Math.round(bearing)}°`;
        };
        const waveValue = (sample: RouteForecastSample, heightKey: string, directionKey: string) => {
            const height = sample.values?.[heightKey];
            const bearing = sample.values?.[directionKey];
            if (height === null || height === undefined) return '—';
            const arrow = bearing === null || bearing === undefined ? '' : `<span class="forecast-arrow" style="transform:rotate(${bearing + 90}deg)">➤</span>`;
            return `${arrow}${Number(height).toFixed(1)}`;
        };
        const directionalValue = (sample: RouteForecastSample, valueKey: string, directionKey: string, decimals = 1) => {
            const value = sample.values?.[valueKey];
            const bearing = sample.values?.[directionKey];
            if (value === null || value === undefined) return '—';
            const arrow = bearing === null || bearing === undefined ? '' : `<span class="forecast-arrow" style="transform:rotate(${bearing + 90}deg)">➤</span>`;
            return `${arrow}${Number(value).toFixed(decimals)}`;
        };
        const departureStats = routeForecast.length ? statCell('Inicio', formatTimelineDateTime(routeForecast[0].eta.getTime()), '', 0, 1) + statCell('Fin', formatTimelineDateTime(arrivalTimestamp), '', 0, 2) + statCell('Duración', formatDuration(routeDurationHours), '', 0, 3) : statCell('Inicio', null, '', 0, 1) + statCell('Fin', null, '', 0, 2) + statCell('Duración', null, '', 0, 3);
        const routeFieldAddControl = renderRouteFieldAddControl();
        const routeRows: Record<WindowConditionKey, string> = {
            gfsDew: row('Punto de rocío', sample => forecastValue(sample, 'gfsDew', 1), undefined, statistics('gfsDew', ' °C', 1), 'gfsDew'),
            ecmwfDew: row('Punto de rocío', sample => forecastValue(sample, 'ecmwfDew', 1), undefined, statistics('ecmwfDew', ' °C', 1), 'ecmwfDew'),
            mblueDew: row('Punto de rocío', sample => forecastValue(sample, 'mblueDew', 1), undefined, statistics('mblueDew', ' °C', 1), 'mblueDew'),
            iconDew: row('Punto de rocío', sample => forecastValue(sample, 'iconDew', 1), undefined, statistics('iconDew', ' °C', 1), 'iconDew'),
            aromeDew: row('Punto de rocío', sample => forecastValue(sample, 'aromeDew', 1), undefined, statistics('aromeDew', ' °C', 1), 'aromeDew'),
            ecmwfTemperature: row('Temperatura', sample => forecastValue(sample, 'ecmwfTemperature', 1), undefined, statistics('ecmwfTemperature', ' °C', 1), 'ecmwfTemperature'),
            mblueTemperature: row('Temperatura', sample => forecastValue(sample, 'mblueTemperature', 1), undefined, statistics('mblueTemperature', ' °C', 1), 'mblueTemperature'),
            iconTemperature: row('Temperatura', sample => forecastValue(sample, 'iconTemperature', 1), undefined, statistics('iconTemperature', ' °C', 1), 'iconTemperature'),
            aromeTemperature: row('Temperatura', sample => forecastValue(sample, 'aromeTemperature', 1), undefined, statistics('aromeTemperature', ' °C', 1), 'aromeTemperature'),
            ecmwfFeels: row('Sens. térmica', sample => forecastValue(sample, 'ecmwfFeels', 1), undefined, statistics('ecmwfFeels', ' °C', 1), 'ecmwfFeels'),
            mblueFeels: row('Sens. térmica', sample => forecastValue(sample, 'mblueFeels', 1), undefined, statistics('mblueFeels', ' °C', 1), 'mblueFeels'),
            iconFeels: row('Sens. térmica', sample => forecastValue(sample, 'iconFeels', 1), undefined, statistics('iconFeels', ' °C', 1), 'iconFeels'),
            aromeFeels: row('Sens. térmica', sample => forecastValue(sample, 'aromeFeels', 1), undefined, statistics('aromeFeels', ' °C', 1), 'aromeFeels'),
            ecmwfRain: row('Lluvia', sample => forecastValue(sample, 'ecmwfRain', 2), undefined, statistics('ecmwfRain', ' in', 2), 'ecmwfRain'),
            mblueRain: row('Lluvia', sample => forecastValue(sample, 'mblueRain', 2), undefined, statistics('mblueRain', ' in', 2), 'mblueRain'),
            iconRain: row('Lluvia', sample => forecastValue(sample, 'iconRain', 2), undefined, statistics('iconRain', ' in', 2), 'iconRain'),
            aromeRain: row('Lluvia', sample => forecastValue(sample, 'aromeRain', 2), undefined, statistics('aromeRain', ' in', 2), 'aromeRain'),
            ecmwfGust: row('Rachas', sample => forecastValue(sample, 'ecmwfGust', 0), sample => forecastColorStyle('wind', sample.values?.ecmwfGust, 1 / 1.94384), statistics('ecmwfGust', ' kt', 0), 'ecmwfGust'),
            mblueGust: row('Rachas', sample => forecastValue(sample, 'mblueGust', 0), sample => forecastColorStyle('wind', sample.values?.mblueGust, 1 / 1.94384), statistics('mblueGust', ' kt', 0), 'mblueGust'),
            iconGust: row('Rachas', sample => forecastValue(sample, 'iconGust', 0), sample => forecastColorStyle('wind', sample.values?.iconGust, 1 / 1.94384), statistics('iconGust', ' kt', 0), 'iconGust'),
            aromeGust: row('Rachas', sample => forecastValue(sample, 'aromeGust', 0), sample => forecastColorStyle('wind', sample.values?.aromeGust, 1 / 1.94384), statistics('aromeGust', ' kt', 0), 'aromeGust'),
            feels: row('Sens. térmica', sample => forecastValue(sample, 'feels', 1), undefined, statistics('feels', ' °C', 1), 'feels'),
            ...Object.fromEntries(Object.entries(additionalGroups).map(([key, group]) => {
                const field = key as WindowConditionKey;
                if (field === 'skyAverage') { const stats = statCell('Min', null, '', 0, undefined, 1) + statCell('Max', null, '', 0, undefined, 2) + statCell('Prom', null, '', 0, undefined, 3); return [field, row('Cielo', sample => skyFieldIcon(field, sample.values), undefined, stats, field)]; }
                const values = routeForecast.map(sample => groupValue(field, sample.values)).filter((value): value is number => value !== null);
                const mean = group.circular ? averageDirection(values) : values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
                const min = values.length ? Math.min(...values) : null, max = values.length ? Math.max(...values) : null;
                const waveGroup = field === 'swell1Average' || field === 'wavesAverage';
                const minSample = waveGroup ? routeForecast.find(sample => groupValue(field, sample.values) === min) : undefined;
                const maxSample = waveGroup ? routeForecast.find(sample => groupValue(field, sample.values) === max) : undefined;
                const groupDirections = waveGroup ? routeForecast.filter(sample => groupValue(field, sample.values) !== null).map(sample => groupWaveDirection(field, sample)).filter((value): value is number => value !== null) : [];
                const stats = statCell('Min', min, group.unit, group.decimals, undefined, 1, group.circular ? min : minSample ? groupWaveDirection(field, minSample) : null) + statCell('Max', max, group.unit, group.decimals, undefined, 2, group.circular ? max : maxSample ? groupWaveDirection(field, maxSample) : null) + statCell('Prom', mean, group.unit, group.decimals, undefined, 3, group.circular ? circularBearing(values) : circularBearing(groupDirections));
                return [field, row(group.label, sample => {
                    const value = groupValue(field, sample.values);
                    if (value === null) return '—';
                    if (field === 'rainAverage' && Number(value.toFixed(2)) === 0) return '';
                    if (field === 'swell1Average' || field === 'wavesAverage') {
                        const bearing = groupWaveDirection(field, sample);
                        const arrow = bearing === null ? '' : `<span class="forecast-arrow" style="transform:rotate(${bearing + 90}deg)">➤</span>`;
                        return `${arrow}${value.toFixed(group.decimals)}`;
                    }
                    return group.circular ? `<span class="forecast-arrow" style="transform:rotate(${value + 90}deg)">➤</span>${Math.round(value)}°` : value.toFixed(group.decimals);
                }, field === 'gustAverage' ? sample => forecastColorStyle('wind', groupValue(field, sample.values), 1 / 1.94384)
                    : undefined, stats, field)];
            })) as Partial<Record<WindowConditionKey, string>>,
            arrival: row('Hora', sample => `<span class="forecast-date-time"><small>${formatCompactDate(sample.eta)}</small><b>${formatWaypointHour(sample.eta)}</b></span>`, undefined, departureStats, 'arrival'),
            clouds: row('Cielo', sample => windyWeatherIcon(sample.icon), undefined, skyStatistics(), 'clouds'),
            ecmwfSky: row('Cielo', sample => skyFieldIcon('ecmwfSky', sample.values), undefined, statCell('Min', null, '', 0, undefined, 1) + statCell('Max', null, '', 0, undefined, 2) + statCell('Prom', null, '', 0, undefined, 3), 'ecmwfSky'),
            mblueSky: row('Cielo', sample => skyFieldIcon('mblueSky', sample.values), undefined, statCell('Min', null, '', 0, undefined, 1) + statCell('Max', null, '', 0, undefined, 2) + statCell('Prom', null, '', 0, undefined, 3), 'mblueSky'),
            iconSky: row('Cielo', sample => skyFieldIcon('iconSky', sample.values), undefined, statCell('Min', null, '', 0, undefined, 1) + statCell('Max', null, '', 0, undefined, 2) + statCell('Prom', null, '', 0, undefined, 3), 'iconSky'),
            aromeSky: row('Cielo', sample => skyFieldIcon('aromeSky', sample.values), undefined, statCell('Min', null, '', 0, undefined, 1) + statCell('Max', null, '', 0, undefined, 2) + statCell('Prom', null, '', 0, undefined, 3), 'aromeSky'),
            temperature: row('Temperatura', sample => forecastValue(sample, 'temperature'), undefined, statistics('temperature', '°C', 1), 'temperature'),
            rain: row('Lluvia', sample => forecastValue(sample, 'rain', 2), undefined, statistics('rain', ' in', 2), 'rain'),
            windAverage: row('Viento', sample => { const value = averageWindForValues(sample.values); return value === null ? '—' : `${Math.round(value)}`; }, sample => forecastColorStyle('wind', averageWindForValues(sample.values), 1 / 1.94384), (() => {
                const values = routeForecast.map(sample => averageWindForValues(sample.values)).filter((value): value is number => value !== null);
                if (!values.length) return statCell('Min', null, '', 0, undefined, 1) + statCell('Max', null, '', 0, undefined, 2) + statCell('Prom', null, '', 0, undefined, 3);
                const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
                return statCell('Min', Math.min(...values), ' kt', 0, undefined, 1) + statCell('Max', Math.max(...values), ' kt', 0, undefined, 2) + statCell('Prom', mean, ' kt', 0, undefined, 3);
            })(), 'windAverage'),
            wind: row('Viento', sample => forecastValue(sample, 'wind'), sample => forecastColorStyle('wind', sample.values?.wind, 1 / 1.94384), statistics('wind', ' kt'), 'wind'),
            ecmwfWind: row('Viento', sample => forecastValue(sample, 'ecmwfWind'), sample => forecastColorStyle('wind', sample.values?.ecmwfWind, 1 / 1.94384), statistics('ecmwfWind', ' kt'), 'ecmwfWind'),
            mblueWind: row('Viento', sample => forecastValue(sample, 'mblueWind'), sample => forecastColorStyle('wind', sample.values?.mblueWind, 1 / 1.94384), statistics('mblueWind', ' kt'), 'mblueWind'),
            iconWind: row('Viento', sample => forecastValue(sample, 'iconWind'), sample => forecastColorStyle('wind', sample.values?.iconWind, 1 / 1.94384), statistics('iconWind', ' kt'), 'iconWind'),
            aromeWind: row('Viento', sample => forecastValue(sample, 'aromeWind'), sample => forecastColorStyle('wind', sample.values?.aromeWind, 1 / 1.94384), statistics('aromeWind', ' kt'), 'aromeWind'),
            ecmwfWindDirection: row('Dirección viento', sample => directionFor(sample, 'ecmwfWindDirection'), undefined, statistics('ecmwfWindDirection', '°', 0, true), 'ecmwfWindDirection'),
            mblueWindDirection: row('Dirección viento', sample => directionFor(sample, 'mblueWindDirection'), undefined, statistics('mblueWindDirection', '°', 0, true), 'mblueWindDirection'),
            iconWindDirection: row('Dirección viento', sample => directionFor(sample, 'iconWindDirection'), undefined, statistics('iconWindDirection', '°', 0, true), 'iconWindDirection'),
            aromeWindDirection: row('Dirección viento', sample => directionFor(sample, 'aromeWindDirection'), undefined, statistics('aromeWindDirection', '°', 0, true), 'aromeWindDirection'),
            gust: row('Rachas', sample => forecastValue(sample, 'gust'), sample => forecastColorStyle('wind', sample.values?.gust, 1 / 1.94384), statistics('gust', ' kt'), 'gust'),
            direction: row('Dirección viento', direction, undefined, statistics('direction', '°', 0, true), 'direction'),
            waves: row('Olas', sample => waveValue(sample, 'waves', 'wavesDir'), undefined, statistics('waves', ' m', 1, false, 'wavesDir'), 'waves'),
            swell1: row('Oleaje 1', sample => waveValue(sample, 'swell1', 'swell1Dir'), undefined, statistics('swell1', ' m', 1, false, 'swell1Dir'), 'swell1'),
            swell1Period: row('Período oleaje 1', sample => forecastValue(sample, 'swell1Period', 1), undefined, statistics('swell1Period', ' s', 1), 'swell1Period'),
            swell2: row('Oleaje 2', sample => waveValue(sample, 'swell2', 'swell2Dir'), undefined, statistics('swell2', ' m', 1, false, 'swell2Dir'), 'swell2'),
            swell2Period: row('Período oleaje 2', sample => forecastValue(sample, 'swell2Period', 1), undefined, statistics('swell2Period', ' s', 1), 'swell2Period'),
            windWaves: row('Mar de viento', sample => directionalValue(sample, 'windWaves', 'windWavesDir'), undefined, statistics('windWaves', ' m', 1, false, 'windWavesDir'), 'windWaves'),
            windWavesPeriod: row('Período mar de viento', sample => forecastValue(sample, 'windWavesPeriod', 1), undefined, statistics('windWavesPeriod', ' s', 1), 'windWavesPeriod'),
            current: row('Corriente', sample => directionalValue(sample, 'current', 'currentDir'), sample => forecastColorStyle('wind', sample.values?.current, 1 / 1.94384), statistics('current', ' kt', 0, false, 'currentDir'), 'current'),
            currentTide: row('Corriente de marea', sample => directionalValue(sample, 'currentTide', 'currentTideDir'), sample => forecastColorStyle('wind', sample.values?.currentTide, 1 / 1.94384), statistics('currentTide', ' kt', 0, false, 'currentTideDir'), 'currentTide'),
            wavesPeriod: row('Periodo', sample => forecastValue(sample, 'wavesPeriod', 1), undefined, statistics('wavesPeriod', ' s', 1), 'wavesPeriod'),
            wavesPower: row('Potencia', sample => forecastValue(sample, 'wavesPower', 0), undefined, statistics('wavesPower', ' kW/m'), 'wavesPower'),
            ecmwfWaves: row('Olas', sample => waveValue(sample, 'ecmwfWaves', 'ecmwfWavesDir'), undefined, statistics('ecmwfWaves', ' m', 1, false, 'ecmwfWavesDir'), 'ecmwfWaves'),
            ecmwfSwell1: row('Oleaje 1', sample => waveValue(sample, 'ecmwfSwell1', 'ecmwfSwell1Dir'), undefined, statistics('ecmwfSwell1', ' m', 1, false, 'ecmwfSwell1Dir'), 'ecmwfSwell1'),
            ecmwfSwell1Period: row('Período oleaje 1', sample => forecastValue(sample, 'ecmwfSwell1Period', 1), undefined, statistics('ecmwfSwell1Period', ' s', 1), 'ecmwfSwell1Period'),
            ecmwfWavesPeriod: row('Periodo', sample => forecastValue(sample, 'ecmwfWavesPeriod', 1), undefined, statistics('ecmwfWavesPeriod', ' s', 1), 'ecmwfWavesPeriod'),
            ecmwfWavesPower: row('Potencia', sample => forecastValue(sample, 'ecmwfWavesPower', 0), undefined, statistics('ecmwfWavesPower', ' kW/m'), 'ecmwfWavesPower'),
        };
        const visibleWindFields = activeWindModelFields();
        const showWindAverage = visibleWindFields.length > 1;
        const visibleRouteRows = routeFieldOrder.filter(key => key === 'windAverage' ? showWindAverage : additionalGroups[key] ? activeGroupFields(key).length > 1 : !hiddenRouteFields.has(key)).map(key => {
            const group = additionalGroups[key];
            if (group) { const fields = activeGroupFields(key); return fields.length > 1 ? `${routeRows[key]}${collapsedGroups[key] === false ? fields.map(field => routeRows[field].replace('class="forecast-field-row"', 'class="forecast-field-row forecast-wind-model-detail"')).join('') : ''}` : ''; }
            if (Object.entries(additionalGroups).some(([groupKey, item]) => item.fields.includes(key) && activeGroupFields(groupKey as WindowConditionKey).length > 1)) return '';
            if (windModelFieldKeys.includes(key) && showWindAverage) return '';
            if (key === 'windAverage') return showWindAverage ? `${routeRows.windAverage}${windModelRowsCollapsed ? '' : visibleWindFields.map(field => routeRows[field].replace('class="forecast-field-row"', 'class="forecast-field-row forecast-wind-model-detail"')).join('')}` : '';
            return routeRows[key];
        }).join('');
        const departurePassSegments = (liveRouteActive ? [] : departureEvaluations).map(item => {
            const itemTime = item.departure.getTime();
            const left = timelineX(itemTime);
            const status = !item.hasConstraints || item.passes === null ? 'is-unknown' : item.passes ? 'is-pass' : 'is-fail';
            const qualityClass = item.qualityColor ? ' has-quality' : '';
            const optimalClass = item.isOptimal ? ' is-optimal' : '';
            const rankLabel = item.qualityRank === undefined ? '' : item.isOptimal
                ? ` · óptima${(item.qualityRankCount || 0) > 1 ? ' (empate)' : ''}`
                : ` · rango ${item.qualityRank} de ${item.qualityRankCount}`;
            const label = item.passes === true ? `cumple las condiciones${rankLabel}` : item.passes === false ? 'no cumple las condiciones' : 'sin evaluación disponible';
            const colorStyle = item.qualityColor ? `--departure-quality-color:${item.qualityColor};` : '';
            return `<span class="route-analysis-slot ${status}${qualityClass}${optimalClass}" style="left:${left}px;${colorStyle}transform:translateX(-50%)" title="Salida ${formatTimelineDateTime(item.departure)}: ${label}"></span>`;
        }).join('');
        const speedLabel = Number(speedKnots).toFixed(1);
        const speedControl = `<button type="button" class="forecast-bottom-action forecast-bottom-speed" data-route-speed-open aria-haspopup="dialog" aria-expanded="${showSpeedSettings}" aria-label="Velocidad ${speedLabel} nudos. Toca para modificar"><span>Velocidad</span><span class="forecast-speed-reading"><strong data-route-speed-label>${speedLabel}</strong><small>kt</small></span></button>`;
        const speedDialog = `<div class="speed-settings-backdrop" data-route-speed-backdrop${showSpeedSettings ? '' : ' hidden'}><section class="speed-settings-dialog" role="dialog" aria-modal="true" aria-label="Velocidad de navegación"><header><strong>Velocidad de navegación</strong><button type="button" data-route-speed-dismiss aria-label="Cerrar velocidad">×</button></header><div class="speed-settings-reading"><output data-route-speed-value>${speedLabel}</output><small>kt</small></div><label class="speed-settings-label" for="route-speed-slider">Velocidad estimada</label><input id="route-speed-slider" type="range" min="0" max="20" step="0.1" value="${speedLabel}" data-route-speed-slider aria-label="Velocidad estimada en nudos"><div class="speed-settings-endpoints"><span>0 kt</span><span>20 kt</span></div><button type="button" class="speed-settings-done" data-route-speed-dismiss>Listo</button></section></div>`;
        const waypointDistances = [0];
        for (let index = 1; index < points.length; index++) waypointDistances.push(waypointDistances[index - 1] + haversineNm(points[index - 1], points[index]));
        const waypointTrackLength = waypointDistances[waypointDistances.length - 1] || 0;
        const waypointTrackMarkers = points.map((_, index) => {
            if (liveRouteActive && index === 0) return '';
            const markerType = index === 0 ? 'is-start' : index === points.length - 1 ? 'is-destination' : 'is-intermediate';
            const left = waypointTrackLength > 0 ? waypointDistances[index] / waypointTrackLength * 100 : 50;
            const name = index === 0 ? 'Inicio' : index === points.length - 1 ? 'Destino' : `Intermedio ${index}`;
            return `<span class="route-waypoint-dot ${markerType}" style="left:${left}%" title="P${waypointNumber(index)} · ${name}">${waypointNumber(index)}</span>`;
        }).join('');
        const routeWaypointRow = routeForecast.length ? `<tr class="route-waypoint-row"><th class="route-waypoint-label" colspan="4" data-column-index="0" data-column-span="4">Waypoints</th><td class="route-waypoint-track" colspan="${routeForecast.length}">${waypointTrackMarkers}<span class="route-waypoint-boat" hidden title="Posición GPS aproximada en la ruta" aria-label="Posición GPS aproximada en la ruta"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4 L21 12 L3 20 L7 12 Z" fill="#087bd1" stroke="white" stroke-width="1.5" stroke-linejoin="round"/></svg></span></td></tr>` : '';
        const distanceNm = points.slice(1).reduce((distance, point, index) => distance + haversineNm(points[index], point), 0);
        const distanceLabel = distanceUnit === 'km' ? `${(distanceNm * 1.852).toFixed(1)} km` : `${distanceNm.toFixed(1)} Nm`;
        const routeDepartureFooter = `<div class="forecast-departure-control${liveRouteActive ? ' is-live' : ''}"><div class="departure-timebar-frame"><div class="departure-timebar-scroll" data-timeline-start="${timelineStart}" data-pixels-per-hour="${pixelsPerHour}" data-timebar-left-pad="${timelinePadding}" data-min-departure="${minDeparture}" data-max-departure="${maxDeparture}" data-departure-interval-hours="${departureIntervalHours}" aria-label="${liveRouteActive ? 'Hora de salida bloqueada en modo EN VIVO' : 'Desplazar los días para elegir la hora de salida'}"><div class="departure-timebar" style="width:${timebarWidth}px"><div class="departure-timebar-days">${dayBands.join('')}</div><div class="departure-timebar-hours">${hourTicks.join('')}</div><div class="route-analysis-track" style="width:${timebarWidth}px">${departurePassSegments}</div></div></div><div class="departure-timebar-indicator"><span class="departure-timebar-cursor"></span><span class="departure-timebar-callout"><span>Inicio ${formatTimelineDateTime(selectedDeparture)} → Llega ${formatTimelineDateTime(arrivalTimestamp)}</span><small>Duración: ${formatDuration(routeDurationHours)} · ${distanceLabel}</small></span><span class="departure-timebar-callout-tail"></span></div></div></div>`;
        const routeColumnCount = routeForecast.length + 4;
        const routeColgroup = `<colgroup>${Array.from({ length: routeColumnCount }, (_, index) => `<col data-forecast-col="${index}">`).join('')}</colgroup>`;
        const routeTable = `${routeDepartureFooter}<div class="forecast-table-scroll"><table class="forecast-table">${routeColgroup}<thead>${routeWaypointRow}</thead><tbody>${visibleRouteRows}</tbody></table></div>`;
        forecastDrawer.innerHTML = `<div class="forecast-drawer"><header class="forecast-drawer-header"><span class="forecast-drawer-header-actions"><button type="button" class="forecast-drawer-close" aria-label="Cerrar pronóstico">×</button></span></header>${renderWindowConditionDialog()}${speedDialog}${routeTable}<footer class="forecast-drawer-bottom-bar"><div class="forecast-bottom-add-field">${routeFieldAddControl}</div><button type="button" class="forecast-bottom-action" data-route-clear aria-label="Limpiar ruta">Limpiar ruta</button>${renderWeatherSettingsMenu()}${speedControl}<div class="forecast-saved-routes">${routeSnapshotActions.map((action, slot) => `<button type="button" class="forecast-bottom-action${action === 'load' ? ' route-snapshot-saved' : ''}" data-route-save-load="${slot}" aria-label="${action === 'save' ? 'Guardar' : 'Cargar'} ruta ${slot + 1}" title="${action === 'save' ? 'Toca para guardar' : 'Toca para cargar; mantén apretado para reemplazar o borrar'}">${action === 'save' ? 'Guardar' : 'Cargar'} ${slot + 1}</button>`).join('')}</div></footer></div>`;
        if (gpsButton) forecastDrawer.appendChild(gpsButton);
        if (liveButton) forecastDrawer.appendChild(liveButton);
        if (centerButton) forecastDrawer.appendChild(centerButton);
        if (mapTypeControl) forecastDrawer.appendChild(mapTypeControl);
        if (zoomInButton) forecastDrawer.appendChild(zoomInButton);
        if (zoomOutButton) forecastDrawer.appendChild(zoomOutButton);
        updateBoatTrackMarker();
        redrawMapOverlays();
        const mapSettingsTab = forecastDrawer.querySelector<HTMLElement>('.forecast-settings-map-tab');
        if (mapLabelSettings && mapSettingsTab) {
            mapLabelSettings.classList.add('label-settings--settings-tab');
            mapLabelSettings.style.maxHeight = '';
            mapLabelSettings.open = true;
            mapSettingsTab.appendChild(mapLabelSettings);
        }
        forecastDrawer.querySelectorAll<HTMLInputElement>('[data-condition-slider="min"]').forEach(updateConditionRangeSlider);
        forecastDrawer.hidden = !forecastDrawer.classList.contains('is-open');
        const scrollContainer = forecastDrawer.querySelector<HTMLElement>('.forecast-table-scroll');
        if (scrollContainer) scrollContainer.scrollLeft = existingScroll;
        const timebarScroll = forecastDrawer.querySelector<HTMLElement>('.departure-timebar-scroll');
        if (timebarScroll) {
            const restoredScroll = previousTimebar && !recenterDepartureTimeline ? existingTimebarScroll : Math.max(0, selectedPosition - timebarScroll.clientWidth / 2);
            recenterDepartureTimeline = false;
            timebarScroll.dataset.programmaticScroll = String(restoredScroll);
            timebarScroll.scrollLeft = restoredScroll;
            departureTimelineScrollLeft = timebarScroll.scrollLeft;
        }
        if (timebarScroll) updateQuickDepartureFields(selectedDeparture);
        forecastDrawer.querySelectorAll<HTMLElement>('.forecast-field-picker').forEach(picker => { forecastDrawer?.append(picker); picker.scrollTop = pickerScroll; });
        positionForecastFieldPickers();
        applyForecastColumnWidths();
        sizeDeparturePassMarkers();
    }

    function pickerGroupAvailableFields(key: WindowConditionKey): WindowConditionKey[] {
        const fields = key === 'windAverage' ? windModelFieldKeys : additionalGroups[key]?.fields || [];
        return fields.filter(field => hiddenRouteFields.has(field) && routeFieldOrder.includes(field));
    }

    function pickerGroupSelection(key: WindowConditionKey): 'true' | 'false' | 'mixed' {
        const fields = pickerGroupAvailableFields(key);
        const count = fields.filter(field => selectedRouteFields.has(field)).length;
        return count === 0 ? 'false' : count === fields.length ? 'true' : 'mixed';
    }

    function refreshRoutePickerSelection(): void {
        if (!forecastDrawer) return;
        forecastDrawer.querySelectorAll<HTMLButtonElement>('[data-route-field-add]').forEach(button => {
            const selected = selectedRouteFields.has(button.dataset.routeFieldAdd as WindowConditionKey);
            button.setAttribute('aria-checked', String(selected));
            const check = button.querySelector<HTMLElement>('.forecast-field-check');
            if (check) check.textContent = selected ? '☑' : '☐';
        });
        forecastDrawer.querySelectorAll<HTMLButtonElement>('[data-route-field-add-group]').forEach(button => {
            const status = pickerGroupSelection(button.dataset.routeFieldAddGroup as WindowConditionKey);
            button.setAttribute('aria-checked', status);
            const check = button.querySelector<HTMLElement>('.forecast-field-check');
            if (check) check.textContent = status === 'true' ? '☑' : status === 'mixed' ? '▣' : '☐';
        });
        const submit = forecastDrawer.querySelector<HTMLButtonElement>('[data-route-field-commit]');
        if (submit) { submit.disabled = selectedRouteFields.size === 0; submit.textContent = `Agregar campos (${selectedRouteFields.size})`; }
    }

    function renderRouteFieldAddControl(): string {
        const hiddenFields = routeFieldOrder.filter(key => key !== 'windAverage' && !additionalGroups[key] && hiddenRouteFields.has(key));
        const groupDefinitions = [{ key: 'windAverage' as WindowConditionKey, label: 'Viento', fields: windModelFieldKeys },
            ...Object.entries(additionalGroups).map(([key, group]) => ({ key: key as WindowConditionKey, label: group!.label, fields: group!.fields }))];
        const groupedFields = new Set(groupDefinitions.flatMap(group => group.fields));
        const compare = (left: string, right: string) => left.localeCompare(right, 'es', { sensitivity: 'base' });
        const fieldButton = (field: WindowConditionKey, nested = false) => {
            const selected = selectedRouteFields.has(field);
            return `<button type="button" class="forecast-field-select${nested ? ' forecast-field-group-item' : ''}" role="menuitemcheckbox" aria-checked="${selected}" data-route-field-add="${field}"><span class="forecast-field-check" aria-hidden="true">${selected ? '☑' : '☐'}</span>${routeFieldPickerLabels[field]}</button>`;
        };
        const entries = groupDefinitions.map(group => ({ ...group, available: group.fields.filter(field => hiddenFields.includes(field)) }))
            .filter(group => group.available.length > 0)
            .map(group => {
                const state = pickerGroupSelection(group.key);
                return { label: group.label, html: `<button type="button" class="forecast-field-group" role="menuitemcheckbox" aria-checked="${state}" data-route-field-add-group="${group.key}" aria-label="Seleccionar modelos de ${group.label}"><span class="forecast-field-check" aria-hidden="true">${state === 'true' ? '☑' : state === 'mixed' ? '▣' : '☐'}</span>${group.label}</button>${group.available.sort((a, b) => compare(routeFieldPickerLabels[a], routeFieldPickerLabels[b])).map(field => fieldButton(field, true)).join('')}` };
            });
        hiddenFields.filter(field => !groupedFields.has(field)).forEach(field => entries.push({ label: routeFieldPickerLabels[field], html: fieldButton(field) }));
        entries.sort((a, b) => compare(a.label, b.label));
        return `<span class="forecast-field-add-wrap"><button type="button" class="forecast-field-add" data-route-field-add-toggle aria-expanded="${showRouteFieldPicker}" aria-label="Agregar campo" title="Agregar campo">+</button>${showRouteFieldPicker ? `<span class="forecast-field-picker" data-field-picker-kind="route" role="menu">${entries.length ? entries.map(entry => entry.html).join('') : '<span>Todos los campos están visibles</span>'}<button type="button" class="forecast-field-commit" data-route-field-commit ${selectedRouteFields.size ? '' : 'disabled'}>Agregar campos (${selectedRouteFields.size})</button></span>` : ''}</span>`;
    }

    function saveRouteFieldLayout(): void {
        try {
            localStorage.setItem('route-builder-forecast-field-order', JSON.stringify(routeFieldOrder));
            localStorage.setItem('route-builder-forecast-hidden-fields', JSON.stringify([...hiddenRouteFields]));
        } catch { /* Keep the current layout for this session. */ }
    }

    function getForecastColumnWidths(table: HTMLTableElement): number[] {
        const columns = [...table.querySelectorAll<HTMLTableColElement>('colgroup col')];
        const defaults = columns.map((_, index) => index === 0 ? 170 : index < 4 ? 42 : 36);
        let saved: number[] = [];
        try {
            const parsed = JSON.parse(localStorage.getItem('route-builder-route-column-widths') || '[]');
            if (Array.isArray(parsed)) saved = parsed.map(Number);
        } catch { /* Use the standard widths when saved layout data is invalid. */ }

        const widths = defaults.map((width, index) => {
            const inlineWidth = Number.parseFloat(columns[index]?.style.width || '');
            // The summary and forecast columns have fixed widths. Only the row-label
            // column can be resized, matching the table's visible resize handle.
            const candidate = index === 0
                ? Number.isFinite(inlineWidth) && inlineWidth > 0 ? inlineWidth : saved[index]
                : Number.NaN;
            return Number.isFinite(candidate) && candidate > 0
                ? Math.max(170, Math.min(forecastLabelMaxWidth(), candidate))
                : width;
        });
        if (widths.length > 4) widths.fill(widths[4], 4);
        return widths;
    }

    function forecastLabelMaxWidth(): number {
        return window.innerWidth <= 600 ? 190 : 420;
    }

    function setForecastColumnWidth(table: HTMLTableElement, index: number, width: number): void {
        if (index !== 0) return;
        const column = table.querySelector<HTMLTableColElement>('colgroup col[data-forecast-col="0"]');
        if (column) column.style.width = `${Math.max(170, Math.min(forecastLabelMaxWidth(), width))}px`;
    }

    function applyForecastColumnWidths(): void {
        const table = forecastDrawer?.querySelector<HTMLTableElement>('.forecast-table');
        if (!table) return;
        const widths = getForecastColumnWidths(table);
        [...table.querySelectorAll<HTMLTableColElement>('colgroup col')].forEach((column, index) => {
            if (widths[index] !== undefined) column.style.width = `${widths[index]}px`;
        });
        table.querySelectorAll<HTMLElement>('[data-column-index]').forEach(cell => {
            const index = Number(cell.dataset.columnIndex);
            if (!Number.isInteger(index) || widths[index] === undefined) return;
            const span = Number(cell.dataset.columnSpan) || 1;
            const width = widths.slice(index, index + span).reduce((sum, value) => sum + value, 0);
            cell.style.width = `${width}px`;
            cell.style.minWidth = `${width}px`;
            cell.style.maxWidth = `${width}px`;
            if (cell.classList.contains('forecast-row-label')) cell.style.left = '0px';
        });
    }

    function saveForecastColumnWidths(table: HTMLTableElement): void {
        const columns = [...table.querySelectorAll<HTMLTableColElement>('colgroup col')];
        try {
            localStorage.setItem('route-builder-route-column-widths', JSON.stringify(columns.map((column, index) =>
                index === 0 ? Number.parseFloat(column.style.width) : null,
            )));
        } catch { /* Keep the current layout for this session. */ }
    }

    function reorderForecastField(source: WindowConditionKey, target: WindowConditionKey, insertAfter: boolean): void {
        if (source === target) return;
        const order = routeFieldOrder.filter(key => key !== source);
        const targetIndex = order.indexOf(target);
        if (targetIndex < 0) return;
        order.splice(targetIndex + (insertAfter ? 1 : 0), 0, source);
        routeFieldOrder = order;
        saveRouteFieldLayout();
        renderForecastDrawer();
    }

    function windowConditionConfigured(key: WindowConditionKey): boolean {
        if (key === 'arrival') return arrivalHours.length > 0 || arrivalDays.length > 0;
        if (isSkyField(key)) { if (key === 'skyAverage' && activeGroupFields(key).length < 2) return false; return (windowConstraints[key] as { states: string[] }).states.length > 0; }
        if (key === 'windAverage' && activeWindModelFields().length < 2) return false;
        if (additionalGroups[key] && activeGroupFields(key).length < 2) return false;
        if (windDirectionConditionKeys.includes(key)) return selectedDirections(key).length > 0;
        return selectedDirections(key).length > 0 || Object.values(windowConstraints[key]).some(value => value !== '' && value !== null && value !== undefined);
    }

    function hasConfiguredWindowConditions(): boolean {
        return windowFieldKeys.some(windowConditionConfigured);
    }

    function routeConditionResult(key: WindowConditionKey): boolean | null {
        if (!windowConditionConfigured(key) || !routeForecast.length) return null;
        if (key === 'arrival') return arrivalMatches(routeForecast[routeForecast.length - 1].eta);
        if (isSkyField(key)) {
            const allowed = (windowConstraints[key] as { states: string[] }).states;
            const states = routeForecast.map(sample => skyStateForField(key, sample.values));
            if (states.some(state => state === null)) return null;
            return states.every(state => allowed.includes(state as string));
        }
        const selections = selectedDirections(key);
        const bounds = windowConstraints[key] as any;
        const hasRange = !windDirectionConditionKeys.includes(key) && (key === 'clouds' || bounds.min !== '' && bounds.min != null || bounds.max !== '' && bounds.max != null);
        const magnitude = hasRange ? routeMagnitudeConditionResult(key) : true;
        if (magnitude === false) return false;
        if (!selections.length) return magnitude;
        const matches = routeForecast.map(sample => directionMatches(key, sample.values));
        if (matches.some(value => value === false)) return false;
        return magnitude === null || matches.some(value => value === null) ? null : true;
    }
    function routeMagnitudeConditionResult(key: WindowConditionKey): boolean | null {
        if (!windowConditionConfigured(key) || !routeForecast.length) return null;
        if (key === 'clouds') {
            const allowedStates = windowConstraints.clouds.states;
            const forecastStates = routeForecast.map(sample => sample.values?.skyState);
            if (forecastStates.some(state => typeof state !== 'string')) return null;
            return forecastStates.every(state => allowedStates.includes(state as string));
        }
        const numericBounds = windowConstraints[key] as NumericBounds | { min: string; max: string };
        const bound = (value: OptionalBound | string) => value === '' || value === null || value === undefined || !Number.isFinite(Number(value)) ? null : Number(value);
        const min = bound(numericBounds.min), max = bound(numericBounds.max);
        if (newModelFields.includes(key) || ['temperatureAverage', 'feelsAverage', 'rainAverage', 'gustAverage', 'dewAverage'].includes(key)) {
            const values = routeForecast.map(sample => additionalGroups[key] ? groupValue(key, sample.values) : sample.values?.[key]);
            if (values.some(item => typeof item !== 'number' || !Number.isFinite(item))) return null;
            return (values as number[]).every(item => (min === null || item >= min) && (max === null || item <= max));
        }
        let value: number | null = null;
        if (additionalGroups[key]) {
            const averages = routeForecast.map(sample => groupValue(key, sample.values));
            if (averages.some(item => item === null)) return null;
            value = additionalGroups[key]!.circular ? averageDirection(averages as number[]) : Math.max(...averages as number[]);
            if (value === null) return null;
            if (additionalGroups[key]!.circular && min !== null && max !== null && min > max) return value >= min || value <= max;
        } else if (key === 'windAverage') {
            const averages = routeForecast.map(sample => averageWindForValues(sample.values));
            if (averages.some(item => item === null)) return null;
            value = Math.max(...averages as number[]);
        } else if (['directionAverage', 'direction', 'ecmwfWindDirection', 'mblueWindDirection', 'iconWindDirection', 'aromeWindDirection'].includes(key)) {
            const directionKey = key as 'direction' | 'ecmwfWindDirection' | 'mblueWindDirection' | 'iconWindDirection' | 'aromeWindDirection';
            const directions = routeForecast.map(sample => sample.values?.[directionKey]).filter((item): item is number => item !== null && item !== undefined && Number.isFinite(item));
            if (directions.length !== routeForecast.length) return null;
            value = averageDirection(directions);
            if (value === null) return null;
            value = ((value % 360) + 360) % 360;
            if (min !== null && max !== null && min > max) return value >= min || value <= max;
        } else if (key === 'rain') {
            if (routeForecast.some(sample => !Number.isFinite(sample.values?.rain))) return null;
            value = routeForecast.reduce((total, sample, index) => {
                const previous = routeForecast[index - 1]?.distanceNm ?? sample.distanceNm;
                const next = routeForecast[index + 1]?.distanceNm ?? sample.distanceNm;
                const hours = Math.max(0, (next - previous) / (2 * Math.max(0.1, speedKnots)));
                return total + Number(sample.values?.rain) * hours;
            }, 0);
        } else {
            const metricByCondition: Partial<Record<WindowConditionKey, keyof NonNullable<(typeof routeForecast)[number]['values']>>> = {
                temperature: 'temperature', wind: 'wind', ecmwfWind: 'ecmwfWind', mblueWind: 'mblueWind', iconWind: 'iconWind', aromeWind: 'aromeWind', gust: 'gust', waves: 'waves', swell1: 'swell1', swell1Period: 'swell1Period', swell2: 'swell2', swell2Period: 'swell2Period', windWaves: 'windWaves', windWavesPeriod: 'windWavesPeriod', current: 'current', currentTide: 'currentTide',
                ecmwfWindDirection: 'ecmwfWindDirection', mblueWindDirection: 'mblueWindDirection', iconWindDirection: 'iconWindDirection', aromeWindDirection: 'aromeWindDirection',
                wavesPeriod: 'wavesPeriod', wavesPower: 'wavesPower', ecmwfWaves: 'ecmwfWaves', ecmwfSwell1: 'ecmwfSwell1', ecmwfSwell1Period: 'ecmwfSwell1Period',
                ecmwfWavesPeriod: 'ecmwfWavesPeriod', ecmwfWavesPower: 'ecmwfWavesPower',
            };
            const metric = metricByCondition[key];
            if (!metric) return null;
            const values = routeForecast.map(sample => sample.values?.[metric]).filter((item): item is number => item !== null && item !== undefined && Number.isFinite(item));
            if (values.length !== routeForecast.length) return null;
            value = ['ecmwfWindDirection', 'mblueWindDirection', 'iconWindDirection', 'aromeWindDirection'].includes(key)
                ? averageDirection(values) ?? null
                : key === 'temperature' ? values.reduce((sum, item) => sum + item, 0) / values.length : Math.max(...values);
        }
        return value !== null && (min === null || value >= min) && (max === null || value <= max);
    }

    function updateConditionButtonStatus(key: WindowConditionKey): void {
        const status = routeConditionResult(key);
        forecastDrawer?.querySelectorAll<HTMLButtonElement>(`[data-window-condition="${key}"]`).forEach(button => {
            button.classList.toggle('is-configured', windowConditionConfigured(key));
            button.classList.toggle('is-pass', status === true);
            button.classList.toggle('is-fail', status === false);
        });
    }

    function updateConditionRangeSlider(slider: HTMLInputElement): void {
        const control = slider.closest<HTMLElement>('.condition-slider-control');
        const container = slider.closest<HTMLElement>('.condition-slider');
        const minSlider = control?.querySelector<HTMLInputElement>('[data-condition-slider="min"]');
        const maxSlider = control?.querySelector<HTMLInputElement>('[data-condition-slider="max"]');
        if (!control || !container || !minSlider || !maxSlider) return;
        // Both thumbs and the fill must use the same fixed scale. Clamp the
        // opposite value when handles meet instead of changing its input range.
        const domainMin = Number(container.dataset.conditionDomainMin ?? minSlider.min);
        const domainMax = Number(container.dataset.conditionDomainMax ?? maxSlider.max);
        if (slider === minSlider) {
            const minValue = Number(minSlider.value);
            if (Number(maxSlider.value) < minValue) maxSlider.value = String(minValue);
        } else {
            const maxValue = Number(maxSlider.value);
            if (Number(minSlider.value) > maxValue) minSlider.value = String(maxValue);
        }
        const minValue = Number(minSlider.value);
        const maxValue = Number(maxSlider.value);
        const span = Math.max(1, domainMax - domainMin);
        const left = (minValue - domainMin) / span * 100;
        const width = (maxValue - minValue) / span * 100;
        const fill = control.querySelector<HTMLElement>('[data-condition-fill]');
        if (fill) {
            const thumbInset = 9;
            const trackWidth = Math.max(0, control.clientWidth - thumbInset * 2);
            fill.style.left = `${thumbInset + left / 100 * trackWidth}px`;
            fill.style.width = `${width / 100 * trackWidth}px`;
        }
        const unit = container.dataset.conditionUnit || '';
        const format = (value: number) => Number.isInteger(value) ? String(value) : String(Number(value.toFixed(1)));
        const summary = container.querySelector<HTMLElement>('[data-condition-range-summary]');
        if (summary) summary.textContent = `${container.dataset.conditionLabel || ''} de ${format(minValue)} a ${format(maxValue)} ${unit}`.trim();
    }

    function renderWindowConditionDialog(): string {
        const key = activeWindowCondition;
        if (!key) return '';
        const title = routeFieldLabels[key];
        const escapeAttr = (value: unknown) => String(value ?? '').replace(/[&"<>]/g, char => ({ '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;' }[char] || char));
        const range = (min: number, max: number, step: number, unit: string) => {
            const bounds = windowConstraints[key] as NumericBounds;
            if (bounds.min !== '') bounds.min = Math.max(min, Math.min(max, Number(bounds.min)));
            if (bounds.max !== '') bounds.max = Math.max(min, Math.min(max, Number(bounds.max)));
            const selectedMin = bounds.min === '' ? min : Math.max(min, Math.min(max, Number(bounds.min)));
            const selectedMax = bounds.max === '' ? max : Math.max(min, Math.min(max, Number(bounds.max)));
            const safeMin = Math.min(selectedMin, selectedMax);
            const safeMax = Math.max(selectedMin, selectedMax);
            const label = routeFieldLabels[key];
            return `<div class="condition-slider" data-condition-label="${escapeAttr(label)}" data-condition-unit="${escapeAttr(unit)}" data-condition-domain-min="${min}" data-condition-domain-max="${max}"><div class="condition-slider-summary" data-condition-range-summary>${escapeAttr(label)} de ${safeMin} a ${safeMax} ${unit}</div><div class="condition-slider-control"><div class="condition-slider-track"></div><div class="condition-slider-fill" data-condition-fill></div><input type="range" min="${min}" max="${max}" step="${step}" value="${safeMin}" data-condition-slider="min" data-condition-bound="min" aria-label="Límite mínimo de ${escapeAttr(label)}" /><input type="range" min="${min}" max="${max}" step="${step}" value="${safeMax}" data-condition-slider="max" data-condition-bound="max" aria-label="Límite máximo de ${escapeAttr(label)}" /></div><div class="condition-slider-ticks"><span>${min} ${unit}</span><span>${Number((min + (max - min) / 3).toFixed(1))}</span><span>${Number((min + 2 * (max - min) / 3).toFixed(1))}</span><span>${max} ${unit}</span></div></div>`;
        };
        let controls = '';
        if (isSkyField(key)) {
            const selectedStates = (windowConstraints[key] as { states: string[] }).states;
            const stateToggles = skyStateOptions.map(state => {
                const example = routeForecast.find(sample => sample.values?.skyState === state.id && Number.isFinite(sample.icon));
                const icon = example ? windyWeatherIcon(example.icon) : `<span class="sky-state-emoji" aria-hidden="true">${state.emoji}</span>`;
                return `<label class="sky-state-toggle"><input type="checkbox" data-sky-state="${state.id}" ${selectedStates.includes(state.id) ? 'checked' : ''} /><span class="sky-state-toggle-icon">${icon}</span><span>${state.label}</span></label>`;
            }).join('');
            controls = `<div class="sky-state-options">${stateToggles}</div><small>Activa los estados aceptables. Cada punto de la ruta debe coincidir con uno de los estados seleccionados.${key === 'skyAverage' ? ' El grupo muestra el estado más frecuente; si hay empate o faltan datos, se muestra —.' : ''}</small>`;
        } else if (newModelFields.includes(key) || ['temperatureAverage', 'feelsAverage', 'rainAverage', 'gustAverage', 'dewAverage'].includes(key)) {
            if (key.toLowerCase().includes('rain')) controls = range(0, 20, 0.01, 'in');
            else if (key.toLowerCase().includes('gust')) controls = range(0, 120, 1, 'kt');
            else controls = range(-60, 60, 1, '°C');
        } else if (key === 'temperature') controls = range(-60, 60, 1, '°C');
        else if (key === 'rain') controls = range(0, 20, 0.1, 'in');
        else if (['windAverage', 'wind', 'ecmwfWind', 'mblueWind', 'iconWind', 'aromeWind'].includes(key)) controls = range(0, 40, 1, 'kt');
        else if (key === 'gust') controls = range(0, 120, 1, 'kt');
        else if (windDirectionConditionKeys.includes(key)) controls = '';
        else if (['wavesAverage', 'swell1Average', 'waves', 'ecmwfWaves', 'swell1', 'swell2', 'windWaves', 'ecmwfSwell1'].includes(key)) controls = range(0, 10, 0.1, 'm');
        else if (['swell1PeriodAverage', 'wavesPeriodAverage', 'swell1Period', 'swell2Period', 'windWavesPeriod', 'wavesPeriod', 'ecmwfSwell1Period', 'ecmwfWavesPeriod'].includes(key)) controls = range(0, 30, 0.1, 's');
        else if (key === 'current' || key === 'currentTide') controls = range(0, 10, 0.1, 'kt');
        else if (key === 'wavesPowerAverage' || key === 'wavesPower' || key === 'ecmwfWavesPower') controls = range(0, 20, 1, 'kW/m');
        else if (key === 'arrival') {
            const hours = Array.from({ length: 24 }, (_, hour) => `<button type="button" class="arrival-choice${arrivalHours.includes(hour) ? ' is-selected' : ''}" data-arrival-hour="${hour}" aria-pressed="${arrivalHours.includes(hour)}">${String(hour).padStart(2, '0')}–${String(hour + 1).padStart(2, '0')}</button>`).join('');
            const days = [1, 2, 3, 4, 5, 6, 0].map(day => `<button type="button" class="arrival-choice${arrivalDays.includes(day) ? ' is-selected' : ''}" data-arrival-day="${day}" aria-pressed="${arrivalDays.includes(day)}">${arrivalDayLabels[day]}</button>`).join('');
            controls = `<strong>Hora de llegada</strong><div class="arrival-hours-grid">${hours}</div><button type="button" class="forecast-button arrival-day-preset" data-arrival-day-preset>Día (06–18)</button><strong>Día de llegada</strong><div class="arrival-days-grid">${days}</div><small>Sin selección se aceptan todas las horas o todos los días. Se usa la hora local del dispositivo.</small>`;
        }

        return `<div class="window-condition-backdrop" data-window-condition-dismiss><section class="window-condition-dialog" role="dialog" aria-modal="true" aria-label="Condición de ${escapeAttr(title)}"><header><strong>${escapeAttr(title)}</strong><button type="button" data-window-condition-dismiss aria-label="Cerrar condición">×</button></header><div class="condition-content">${controls}${directionWheel(key)}${isSkyField(key) || windDirectionConditionKeys.includes(key) || key === 'arrival' ? '' : '<small>Usa los controles del rango para definir los límites.</small>'}</div><footer><button type="button" class="condition-clear-button" data-window-condition-clear="${key}">Limpiar condición</button><button type="button" class="forecast-button" data-window-condition-dismiss>Listo</button></footer></section></div>`;
    }

    function closeForecastDrawer(): void {
        forecastDrawer?.classList.remove('is-open');
        if (forecastDrawer) forecastDrawer.hidden = true;
        showWeatherSettingsMenu = false;
        setForecastOpenState(false);
        if (forecastReopenButton) forecastReopenButton.hidden = false;
        hideRouteForecastHighlight();
    }

    function closeNavigatorPlugin(): void {
        const pluginCloseButton = document.getElementById(`plugin-${config.name}`)?.querySelector<HTMLElement>('.closing-x');
        if (pluginCloseButton) pluginCloseButton.click();
        else closeForecastDrawer();
    }

    function positionForecastDrawer(): void {
        if (!forecastDrawer) return;
        setForecastOpenState(!forecastDrawer.hidden && forecastDrawer.classList.contains('is-open'));
        const bounds = map.getContainer().getBoundingClientRect();
        const sidePanel = document.querySelector<HTMLElement>('.plugin-rhpane');
        const sidePanelBounds = sidePanel?.getBoundingClientRect();
        const sidePanelVisible = !!sidePanel && getComputedStyle(sidePanel).display !== 'none' && (sidePanelBounds?.width || 0) > 0;
        const sidePanelLeft = sidePanelVisible ? sidePanelBounds!.left : window.innerWidth;
        const drawerLeft = Math.max(0, bounds.left);
        const drawerRight = sidePanelVisible
            ? Math.max(drawerLeft, Math.min(bounds.right, sidePanelLeft, window.innerWidth))
            : window.innerWidth;
        forecastDrawer.style.left = `${drawerLeft}px`;
        forecastDrawer.style.right = `${Math.max(0, window.innerWidth - drawerRight)}px`;
        sizeDeparturePassMarkers();
    }

    function sizeDeparturePassMarkers(): void {
        const track = forecastDrawer?.querySelector<HTMLElement>('.route-analysis-track');
        if (!track || track.clientWidth <= 0) return;
        const markers = [...track.querySelectorAll<HTMLElement>('.route-analysis-slot')];
        markers.forEach(marker => {
            const diameter = marker.classList.contains('is-optimal') ? 10 : 6;
            marker.style.setProperty('--departure-marker-size', `${diameter}px`);
            marker.style.top = `${(track.clientHeight - diameter) / 2}px`;
        });
    }
    function positionForecastFieldPickers(): void {
        if (!forecastDrawer || forecastDrawer.hidden) return;
        forecastDrawer.querySelectorAll<HTMLElement>('.forecast-field-picker').forEach(picker => {
            const button = forecastDrawer.querySelector<HTMLElement>('[data-route-field-add-toggle]');
            if (!button) return;
            const rect = button.getBoundingClientRect();
            const width = Math.min(220, window.innerWidth - 16);
            const left = Math.max(8, Math.min(window.innerWidth - width - 8, rect.right - width));
            const availableAbove = Math.max(60, rect.top - 12);
            picker.style.position = 'fixed';
            picker.style.top = 'auto';
            picker.style.bottom = `${Math.max(8, window.innerHeight - rect.top + 4)}px`;
            picker.style.left = `${left}px`;
            picker.style.right = 'auto';
            picker.style.maxHeight = `${Math.min(240, availableAbove)}px`;
        });
    }

    function redrawMap(): void {
        pastWaypointLayer?.removeFrom(map);
        pastWaypointLayer = null;
        if (liveRouteActive && livePastWaypoints.length) {
            pastWaypointLayer = L.layerGroup().addTo(map);
            for (const { point, number } of livePastWaypoints) {
                const size = waypointSize + 13;
                const icon = L.divIcon({
                    className: 'route-builder-past-marker-wrap',
                    html: `<span class="route-builder-past-marker" style="--route-marker-size:${waypointSize}px;--route-marker-font-size:${Math.round(waypointSize * 0.63)}px">${number}</span>`,
                    iconSize: [size, size], iconAnchor: [size / 2, size / 2],
                });
                L.marker([point.lat, point.lon], { icon, draggable: false, interactive: true, bubblingMouseEvents: false }).addTo(pastWaypointLayer);
            }
        }
        if (points.length === 0) {
            for (const marker of waypointMarkers.values()) {
                marker.dragging?.disable();
                marker.off();
            }
            waypointMarkers.clear();
            waypointLayer?.removeFrom(map);
            waypointLayer = null;
            redrawRouteGeometry(points);
            redrawRoutePointIndicators();
            return;
        }
        if (!waypointLayer) waypointLayer = L.layerGroup().addTo(map);
        const activeIds = new Set(points.filter((_, index) => !liveRouteActive || index !== 0).map(point => point.id));
        for (const [id, marker] of waypointMarkers) {
            if (!activeIds.has(id)) {
                marker.dragging?.disable();
                marker.off();
                waypointLayer.removeLayer(marker);
                waypointMarkers.delete(id);
            }
        }
        const liveFix = liveRouteActive && navigationFix && Date.now() - navigationFix.timestamp <= 30000
            ? navigationFix : null;
        const metricPoints = liveFix && points.length
            ? [{ ...points[0], lat: liveFix.lat, lon: liveFix.lon }, ...points.slice(1)]
            : points;
        const metricDistanceNm = metricPoints.slice(1).reduce((sum, point, index) => sum + haversineNm(metricPoints[index], point), 0);
        const waypointTimes = calculateWaypointTimes(metricPoints, liveRouteActive ? Date.now() : undefined);

        points.forEach((point, index) => {
            if (liveRouteActive && index === 0) return;
            const role = index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'via';
            const eta = waypointTimes[index];
            const etaDate = eta ? formatWaypointDate(eta) : '--';
            const etaHour = eta ? formatWaypointHour(eta) : '--:--';
            const cumulativeNm = metricPoints.slice(1, index + 1).reduce((sum, current, segmentIndex) => sum + haversineNm(metricPoints[segmentIndex], current), 0);
            const remainingNm = Math.max(0, metricDistanceNm - cumulativeNm);
            const distanceLabel = (nm: number) => `${(distanceUnit === 'km' ? nm * 1.852 : nm).toFixed(1)} ${distanceUnit === 'km' ? 'km' : 'Nm'}`;
            const waypointValues: Record<string, string> = {
                'waypoint-date': etaDate, 'waypoint-hour': etaHour,
                'waypoint-distance-accumulated': distanceLabel(cumulativeNm),
                'waypoint-time-accumulated': formatDuration(cumulativeNm / Math.max(0.1, speedKnots)),
                'waypoint-distance-remaining': distanceLabel(remainingNm),
                'waypoint-time-remaining': formatDuration(remainingNm / Math.max(0.1, speedKnots)),
            };
            const hasWaypointData = waypointFieldOrder.some(isWaypointFieldVisible);
            const waypointData = (['above', 'below'] as LabelPosition[]).map(position => {
                const fields = waypointFieldOrder.map(field => {
                    if (isWaypointFieldVisible(field) && waypointFieldPositions[field] === position) return `<span class="route-builder-marker-${field}">${waypointValues[field]}</span>`;
                    return '';
                }).filter(Boolean).join('<span class="route-builder-marker-separator">·</span>');
                return fields ? `<span class="route-builder-marker-time-line route-builder-marker-time-line--${position}">${fields}</span>` : '';
            }).join('');
            const icon = L.divIcon({
                    className: 'route-builder-marker-wrap',
                    html: `<span class="route-builder-marker route-builder-marker--${role}" data-point-id="${point.id}" style="--route-marker-size:${waypointSize}px;--route-marker-font-size:${Math.round(waypointSize * 0.63)}px;--route-waypoint-label-font-size:${waypointLabelFontSize}px"><span class="route-builder-marker-number">${waypointNumber(index)}</span><span class="route-builder-marker-time" title="Hora local estimada de llegada" style="display:${hasWaypointData ? 'block' : 'none'}">${waypointData}</span></span>`,
                    iconSize: [waypointSize + 13, waypointSize + 13],
                    iconAnchor: [(waypointSize + 13) / 2, (waypointSize + 13) / 2],
            });
            let marker = waypointMarkers.get(point.id);
            if (!marker) {
                marker = L.marker([point.lat, point.lon], {
                    icon,
                    draggable: true,
                    interactive: true,
                    bubblingMouseEvents: false,
                });
                marker.on('dragstart', () => {
                    waypointDragInProgress = true;
                    redrawRoutePointIndicators();
                    recentlyDraggedWaypoint = { id: point.id, expiresAt: Date.now() + 5000 };
                });
                marker.on('drag', (event: any) => {
                    const position = event.target.getLatLng();
                    redrawRouteGeometry(points.map(current => current.id === point.id
                        ? { ...current, lat: position.lat, lon: position.lng } : current));
                });
                marker.on('dragend', (event: any) => {
                    waypointDragInProgress = false;
                    recentlyDraggedWaypoint = { id: point.id, expiresAt: Date.now() + 500 };
                    const position = event.target.getLatLng();
                    points = points.map(current => current.id === point.id
                        ? { ...current, lat: position.lat, lon: position.lng }
                        : current);
                    // Reuse forecasts for samples whose position and ETA stay
                    // unchanged before the moved waypoint; the affected leg
                    // and everything after it will get fresh samples.
                    recalculate(true, true);
                });
                waypointMarkerSizes.set(marker, waypointSize);
                waypointMarkerLabelLayouts.set(marker, waypointFieldOrder.filter(field => isWaypointFieldVisible(field)).join('|')
                    + `:${JSON.stringify(waypointFieldPositions)}`);
                waypointMarkers.set(point.id, marker);
                waypointLayer.addLayer(marker);
            } else {
                const currentPosition = marker.getLatLng();
                if (currentPosition.lat !== point.lat || currentPosition.lng !== point.lon) {
                    marker.setLatLng([point.lat, point.lon]);
                }
                if (waypointMarkerSizes.get(marker) !== waypointSize) {
                    marker.setIcon(icon);
                    waypointMarkerSizes.set(marker, waypointSize);
                } else {
                    const element = marker.getElement();
                    const badge = element?.querySelector<HTMLElement>('.route-builder-marker');
                    const number = element?.querySelector<HTMLElement>('.route-builder-marker-number');
                    const time = element?.querySelector<HTMLElement>('.route-builder-marker-time');
                    if (badge && number && time) {
                        const nextBadgeClass = `route-builder-marker route-builder-marker--${role}`;
                        if (badge.className !== nextBadgeClass) badge.className = nextBadgeClass;
                        badge.style.setProperty('--route-marker-size', `${waypointSize}px`);
                        badge.style.setProperty('--route-marker-font-size', `${Math.round(waypointSize * 0.63)}px`);
                        badge.style.setProperty('--route-waypoint-label-font-size', `${waypointLabelFontSize}px`);
                        const nextNumber = String(waypointNumber(index));
                        if (number.textContent !== nextNumber) number.textContent = nextNumber;
                        const nextDisplay = hasWaypointData ? 'block' : 'none';
                        if (time.style.display !== nextDisplay) time.style.display = nextDisplay;
                        const labelLayout = waypointFieldOrder.filter(field => isWaypointFieldVisible(field)).join('|')
                            + `:${JSON.stringify(waypointFieldPositions)}`;
                        if (waypointMarkerLabelLayouts.get(marker) !== labelLayout) {
                            time.innerHTML = waypointData;
                            waypointMarkerLabelLayouts.set(marker, labelLayout);
                        } else {
                            for (const [field, value] of Object.entries(waypointValues)) {
                                const valueElement = time.querySelector<HTMLElement>(`.route-builder-marker-${field}`);
                                if (valueElement && valueElement.textContent !== value) valueElement.textContent = value;
                            }
                        }
                    } else {
                        marker.setIcon(icon);
                    }
                }
            }
        });

        redrawRouteGeometry(points);
        redrawRoutePointIndicators();
    }

    function redrawRouteGeometry(routePoints: Waypoint[]): void {
        if (liveRouteActive && livePastWaypoints.length && routePoints.length) {
            const pastLatLngs: [number, number][] = livePastWaypoints.map(({ point }) => [point.lat, point.lon]);
            pastLatLngs.push([routePoints[0].lat, routePoints[0].lon]);
            if (pastRouteLine) pastRouteLine.setLatLngs(pastLatLngs);
            else pastRouteLine = L.polyline(pastLatLngs, { color: '#7b8588', weight: 3, opacity: 0.95, interactive: false }).addTo(map);
        } else if (pastRouteLine) {
            pastRouteLine.removeFrom(map);
            pastRouteLine = null;
        }
        if (routePoints.length > 1) {
            const latLngs = routePoints.map(point => [point.lat, point.lon] as [number, number]);
            if (routeLine) routeLine.setLatLngs(latLngs);
            else routeLine = L.polyline(latLngs, { color: '#ffffff', weight: 3, opacity: 0.95, interactive: false }).addTo(map);
        } else if (routeLine) {
            routeLine.removeFrom(map);
            routeLine = null;
        }
        redrawDistanceLabels(routePoints);
    }

    function redrawDistanceLabels(routePoints: Waypoint[] = points): void {
        if (!distanceLabelOverlay) return;
        const activeSegments = new Set<string>();
        routePoints.slice(1).forEach((point, index) => {
            try {
                const previous = routePoints[index];
                const segmentKey = `${previous.id}:${point.id}`;
                activeSegments.add(segmentKey);
                const from = map.latLngToContainerPoint([previous.lat, previous.lon]);
                const to = map.latLngToContainerPoint([point.lat, point.lon]);
                let angle = Math.atan2(to.y - from.y, to.x - from.x) * 180 / Math.PI;
                if (angle > 90) angle -= 180;
                else if (angle < -90) angle += 180;
                const segmentKm = haversineNm(previous, point) * 1.852;
                const segmentNm = haversineNm(previous, point);
                const segmentDuration = formatDuration(segmentNm / Math.max(0.1, speedKnots));
                const bearing = String(Math.round(trueBearing(previous, point))).padStart(3, '0');
                const position = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
                const angleRadians = angle * Math.PI / 180;
                const normalX = -Math.sin(angleRadians);
                const normalY = Math.cos(angleRadians);
                const segmentData = [
                    showSegmentTime ? { field: 'segment-time', text: segmentDuration, position: segmentTimePosition, font: `700 ${segmentLabelFontSize}px/1.2 Arial,sans-serif` } : null,
                    showSegmentBearing ? { field: 'segment-bearing', text: `${bearing}°T`, position: segmentBearingPosition, font: `700 ${segmentLabelFontSize}px/1.2 Arial,sans-serif` } : null,
                    showSegmentDistance ? { field: 'segment-distance', text: `${(distanceUnit === 'km' ? segmentKm : segmentNm).toFixed(1)}${distanceUnit}`, position: segmentDistancePosition, font: `700 ${segmentLabelFontSize}px/1.2 ${distanceFontStacks[distanceFont]}` } : null,
                ].filter((item): item is { field: string; text: string; position: LabelPosition; font: string } => item !== null);
                segmentData.sort((a, b) => segmentFieldOrder.indexOf(a.field) - segmentFieldOrder.indexOf(b.field));
                const layout = segmentData.map(item => `${item.field}:${item.position}:${item.font}`).join('|');
                let group = segmentLabelGroups.get(segmentKey);
                if (!segmentData.length) {
                    group?.element.remove();
                    segmentLabelGroups.delete(segmentKey);
                    return;
                }
                if (!group) {
                    const element = document.createElement('div');
                    Object.assign(element.style, { position: 'absolute', width: '0', height: '0', overflow: 'visible' });
                    group = { element, layout: '' };
                    segmentLabelGroups.set(segmentKey, group);
                    distanceLabelOverlay.appendChild(element);
                }
                group.element.style.left = `${position.x}px`;
                group.element.style.top = `${position.y}px`;
                const layoutChanged = group.layout !== layout;
                if (layoutChanged) group.element.replaceChildren();
                const sideItems: Record<LabelPosition, typeof segmentData> = { above: [], below: [] };
                segmentData.forEach(item => sideItems[item.position].push(item));
                for (const side of ['above', 'below'] as LabelPosition[]) {
                    const items = sideItems[side];
                    if (!items.length) continue;
                    let labelContainer = group!.element.querySelector<HTMLElement>(`.route-builder-segment-label--${side}`);
                    if (layoutChanged || !labelContainer) {
                        labelContainer = document.createElement('div');
                        labelContainer.className = `route-builder-segment-label route-builder-segment-label--${side}`;
                        Object.assign(labelContainer.style, { position: 'absolute', display: 'flex', alignItems: 'center', gap: '4px', width: 'max-content', transformOrigin: 'center' });
                        group!.element.appendChild(labelContainer);
                    }
                    const offset = side === 'above' ? -12 : 12;
                    Object.assign(labelContainer.style, {
                        left: `${normalX * offset}px`, top: `${normalY * offset}px`,
                        transform: `translate(-50%,-50%) rotate(${angle}deg)`,
                    });
                    for (const item of items) {
                        let label = labelContainer.querySelector<HTMLElement>(`[data-segment-field="${item.field}"]`);
                        if (!label) {
                            label = document.createElement('span');
                            label.dataset.segmentField = item.field;
                            Object.assign(label.style, { display: 'block', whiteSpace: 'nowrap', textAlign: 'center', color: '#fff', textShadow: '0 1px 3px #526575, 0 0 5px #526575' });
                            labelContainer.appendChild(label);
                        }
                        label.textContent = item.text;
                        label.style.font = item.font;
                    }
                }
                group.layout = layout;
            } catch (error) {
                console.warn('No se pudo mostrar la distancia de este tramo.', error);
            }
        });
        for (const [key, group] of segmentLabelGroups) {
            if (!activeSegments.has(key)) {
                group.element.remove();
                segmentLabelGroups.delete(key);
            }
        }
    }

    function nearestRouteSegment(position: L.Point): number {
        let closest = -1;
        let distance = 12;
        for (let index = 0; index < points.length - 1; index++) {
            const start = map.latLngToContainerPoint([points[index].lat, points[index].lon]);
            const end = map.latLngToContainerPoint([points[index + 1].lat, points[index + 1].lon]);
            const dx = end.x - start.x;
            const dy = end.y - start.y;
            const length = dx * dx + dy * dy;
            const fraction = length ? Math.max(0, Math.min(1,
                ((position.x - start.x) * dx + (position.y - start.y) * dy) / length)) : 0;
            const offset = Math.hypot(position.x - start.x - fraction * dx,
                position.y - start.y - fraction * dy);
            if (offset < distance) {
                distance = offset;
                closest = index;
            }
        }
        return closest;
    }

    function stopMapClick(event: MouseEvent): void {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
    }

    function onWaypointClickCapture(event: MouseEvent): void {
        const wrapper = (event.target as Element | null)?.closest<HTMLElement>('.route-builder-marker-wrap');
        if (!wrapper || !map.getContainer().contains(wrapper)) return;
        const badge = wrapper.querySelector<HTMLElement>('.route-builder-marker');
        if (!badge) return;
        stopMapClick(event);
        const id = Number(badge.dataset.pointId);
        if (recentlyDraggedWaypoint?.id === id && Date.now() < recentlyDraggedWaypoint.expiresAt) return;
        window.requestAnimationFrame(() => openWaypointMenu(id));
    }

    function openWaypointMenu(id: number): void {
        const index = points.findIndex(point => point.id === id);
        if (index < 0) return;
        document.querySelector('.route-waypoint-dialog-backdrop')?.remove();
        const point = points[index];
        const values = { lat: point.lat, lon: point.lon };
        let mode: 'minutes' | 'decimal' = 'minutes';
        const dirty = { lat: false, lon: false };
        const backdrop = document.createElement('div');
        backdrop.className = 'route-waypoint-dialog-backdrop';
        backdrop.innerHTML = `<section class="route-waypoint-dialog" role="dialog" aria-modal="true" aria-label="Waypoint ${waypointNumber(index)}"><h3>Waypoint ${waypointNumber(index)}</h3><button type="button" class="coordinate-mode" data-action="mode"></button><div class="coordinate-editors"></div><p class="route-waypoint-error" hidden>Coordenada fuera de rango.</p><div class="coordinate-actions"><button type="button" data-action="delete">Borrar</button><button type="button" data-action="cancel">Cancelar</button><button type="button" data-action="save">Guardar</button></div></section>`;
        const editors = backdrop.querySelector<HTMLElement>('.coordinate-editors')!;
        const error = backdrop.querySelector<HTMLElement>('.route-waypoint-error')!;
        const rowHeight = 32;
        const wheel = (axis: string, part: string, label: string, items: string[], selected: number, showLabel = true) => `<div class="coordinate-column">${showLabel ? `<span>${label}</span>` : ''}<div class="coordinate-wheel" tabindex="0" role="listbox" aria-label="${axis === 'lat' ? 'Latitud' : 'Longitud'} ${label}" data-axis="${axis}" data-part="${part}" data-initial="${selected}">${items.map((value, i) => `<div role="option" data-index="${i}">${value}</div>`).join('')}</div></div>`;
        const range = (count: number, width: number) => Array.from({ length: count }, (_, i) => String(i).padStart(width, '0'));
        function render(): void {
            (backdrop.querySelector('[data-action="mode"]') as HTMLButtonElement).textContent = mode === 'minutes' ? 'Formato: GG° MM.MMM′ · Cambiar' : 'Formato: GG.GGG° · Cambiar';
            editors.innerHTML = (['lat', 'lon'] as const).map(axis => {
                const latitude = axis === 'lat';
                const max = latitude ? 90 : 180;
                const absolute = Math.abs(values[axis]);
                const units = Math.min(max * (mode === 'minutes' ? 60000 : 1000), Math.round(absolute * (mode === 'minutes' ? 60000 : 1000)));
                const degrees = Math.floor(units / (mode === 'minutes' ? 60000 : 1000));
                const minutes = mode === 'minutes' ? Math.floor(units % 60000 / 1000) : 0;
                const decimals = units % 1000;
                const hemispheres = latitude ? ['N', 'S'] : ['E', 'O'];
                const signIndex = values[axis] < 0 || Object.is(values[axis], -0) ? 1 : 0;
                const fraction = `<div class="coordinate-fraction"><span>Decimales</span><div class="coordinate-fraction-wheels">${wheel(axis, 'tenths', 'Décimas', range(10, 1), Math.floor(decimals / 100), false)}${wheel(axis, 'hundredths', 'Centésimas', range(10, 1), Math.floor(decimals / 10) % 10, false)}${wheel(axis, 'thousandths', 'Milésimas', range(10, 1), decimals % 10, false)}</div></div>`;
                return `<section class="coordinate-section"><strong>${latitude ? 'Latitud' : 'Longitud'}</strong><div class="coordinate-columns">${wheel(axis, 'degrees', 'Grados', range(max + 1, latitude ? 2 : 3), degrees)}${mode === 'minutes' ? wheel(axis, 'minutes', 'Minutos', range(60, 2), minutes) : ''}${fraction}${wheel(axis, 'hemisphere', 'Hemisferio', hemispheres, signIndex)}</div><div class="coordinate-preview" data-preview="${axis}"></div></section>`;
            }).join('');
            editors.querySelectorAll<HTMLElement>('.coordinate-wheel').forEach(element => {
                element.scrollTop = Number(element.dataset.initial) * rowHeight;
                let interacted = false;
                element.addEventListener('pointerdown', () => { interacted = true; });
                element.addEventListener('wheel', () => { interacted = true; }, { passive: true });
                element.addEventListener('keydown', () => { interacted = true; });
                element.addEventListener('scroll', () => {
                    if (interacted && Math.round(element.scrollTop / rowHeight) !== Number(element.dataset.initial)) dirty[element.dataset.axis as 'lat' | 'lon'] = true;
                    updatePreview();
                });
                element.addEventListener('click', event => {
                    const option = (event.target as HTMLElement).closest<HTMLElement>('[data-index]');
                    if (option) element.scrollTo({ top: Number(option.dataset.index) * rowHeight, behavior: 'smooth' });
                });
            });
            updatePreview();
        }
        function getValue(axis: 'lat' | 'lon'): number | null {
            const find = (part: string) => {
                const el = editors.querySelector<HTMLElement>(`.coordinate-wheel[data-axis="${axis}"][data-part="${part}"]`);
                return el ? Math.max(0, Math.min(el.children.length - 1, Math.round(el.scrollTop / rowHeight))) : 0;
            };
            const degrees = find('degrees'), minutes = find('minutes');
            const fraction = find('tenths') * 100 + find('hundredths') * 10 + find('thousandths');
            const magnitude = degrees + (mode === 'minutes' ? (minutes + fraction / 1000) / 60 : fraction / 1000);
            if (magnitude > (axis === 'lat' ? 90 : 180)) return null;
            return magnitude * (find('hemisphere') ? -1 : 1);
        }
        function updatePreview(): void {
            for (const axis of ['lat', 'lon'] as const) {
                const coordinate = getValue(axis);
                const preview = editors.querySelector<HTMLElement>(`[data-preview="${axis}"]`);
                if (preview) preview.textContent = coordinate === null ? 'Fuera de rango' : `${Math.abs(coordinate).toFixed(6)}° ${coordinate < 0 || Object.is(coordinate, -0) ? (axis === 'lat' ? 'S' : 'O') : (axis === 'lat' ? 'N' : 'E')}`;
            }
        }
        function commitEdits(): boolean {
            for (const axis of ['lat', 'lon'] as const) {
                if (Array.from(editors.querySelectorAll<HTMLElement>(`.coordinate-wheel[data-axis="${axis}"]`)).some(el => Math.round(el.scrollTop / rowHeight) !== Number(el.dataset.initial))) dirty[axis] = true;
                if (!dirty[axis]) continue;
                const coordinate = getValue(axis);
                if (coordinate === null) { error.hidden = false; return false; }
            }
            for (const axis of ['lat', 'lon'] as const) {
                if (dirty[axis]) values[axis] = getValue(axis)!;
                dirty[axis] = false;
            }
            error.hidden = true;
            return true;
        }
        backdrop.addEventListener('click', event => {
            const target = event.target as HTMLElement;
            if (target === backdrop || target.dataset.action === 'cancel') { backdrop.remove(); return; }
            if (target.dataset.action === 'delete') { backdrop.remove(); removePoint(String(id)); return; }
            if (target.dataset.action === 'mode') { if (commitEdits()) { mode = mode === 'minutes' ? 'decimal' : 'minutes'; render(); } return; }
            if (target.dataset.action !== 'save' || !commitEdits()) return;
            if (!points.some(current => current.id === id)) { backdrop.remove(); return; }
            points = points.map(current => current.id === id ? { ...current, lat: values.lat, lon: values.lon } : current);
            backdrop.remove();
            recalculate(true, true);
        });
        document.body.appendChild(backdrop);
        render();
    }

    let mapMouseGesture: { x: number; y: number; moved: boolean } | null = null;
    let mapMouseDown = false;

    function onMapMouseDown(event: MouseEvent): void {
        const target = event.target as Element | null;
        mapMouseDown = event.button === 0 && !!target && map.getContainer().contains(target);
        mapMouseGesture = mapMouseDown ? { x: event.clientX, y: event.clientY, moved: false } : null;
    }

    function onMapMouseMove(event: MouseEvent): void {
        if (mapMouseDown && mapMouseGesture && Math.hypot(event.clientX - mapMouseGesture.x, event.clientY - mapMouseGesture.y) > 5) mapMouseGesture.moved = true;
    }

    function onMapMouseUp(event: MouseEvent): void {
        onMapMouseMove(event);
        mapMouseDown = false;
    }

    function onMapDomClick(event: MouseEvent): void {
        if (event.button !== 0) return;
        const dragged = mapMouseGesture?.moved === true;
        mapMouseGesture = null;
        if (dragged) return;
        const target = event.target as Element | null;
        if (!target || !map.getContainer().contains(target)) return;
        if (target.closest('.route-builder-past-marker-wrap')) { stopMapClick(event); return; }
        if (target.closest('.route-builder-marker-wrap')) {
            onWaypointClickCapture(event);
            return;
        }
        if (target.closest('.leaflet-control, .leaflet-popup, .leaflet-tooltip, button, a, input, select, textarea, [role="button"], [role="link"], [role="menuitem"], .button, .close')) return;
        const location = map.mouseEventToLatLng(event);
        if (!hasValidCoordinates(location.lat, location.lng)) return;
        const pixel = map.latLngToContainerPoint(location);
        if (points.some(point => map.latLngToContainerPoint([point.lat, point.lon])
            .distanceTo(pixel) <= Math.max(18, waypointSize / 2 + 8))) {
            stopMapClick(event);
            return;
        }
        const segment = nearestRouteSegment(pixel);
        stopMapClick(event);
        window.requestAnimationFrame(() => {
            const point = { id: nextPointId++, lat: location.lat, lon: location.lng };
            const next = [...points];
            if (segment >= 0 && segment < next.length - 1) {
                const insertAt = segment + 1;
                renumberLiveWaypointInsertion(insertAt, point.id);
                next.splice(insertAt, 0, point);
            }
            else next.push(point);
            points = next;
            recalculate(true, true);
        });
    }

    function onMapDomDoubleClick(event: MouseEvent): void {
        const target = event.target as HTMLElement | null;
        if (!target?.closest('.route-builder-marker-wrap')) return;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
    }

    function nearbyForecast(fix: { lat: number; lon: number }, now: number): RouteForecastSample | null {
        if (localForecast && localForecast.values && now - localForecast.eta.getTime() <= 30 * 60000 && now >= localForecast.eta.getTime() && haversineNm(fix as Waypoint, localForecast as Waypoint) <= 10) return localForecast;
        return routeForecast.filter(item => item.values && Math.abs(item.eta.getTime() - now) <= 90 * 60000 && haversineNm(fix as Waypoint, item as Waypoint) <= 10)
            .sort((a, b) => haversineNm(fix as Waypoint, a as Waypoint) - haversineNm(fix as Waypoint, b as Waypoint))[0] ?? null;
    }

    async function refreshLocalForecast(): Promise<void> {
        const fix = visualFix();
        const now = Date.now();
        if (!fix || now - fix.timestamp > 30000 || localForecastPending || now - localForecastLastAttempt < 60000) return;
        if (!windIndicatorField && !waveIndicatorField && laylineMode === 'none') return;
        if (localForecast && now - localForecast.eta.getTime() < 300000 && haversineNm(fix as Waypoint, localForecast as Waypoint) < 2) return;
        localForecastPending = true;
        localForecastLastAttempt = now;
        const lat = fix.lat, lon = fix.lon;
        try {
            const b = await getCachedForecastBundle(lat, lon);
            if (passiveTrackingDisposed) return;
            const t = Date.now();
            const val = (d: any, key: string) => { const index = d ? coveredForecastIndex(d.ts, t) : -1; return index >= 0 ? forecastNumber(d, key, index) : null; };
            const direction = (d: any, key: string) => forecastDirectionValue(d, key, t, d ? coveredForecastIndex(d.ts, t) : -1);
            localForecast = { lat, lon, distanceNm: 0, eta: new Date(t), values: {
                wind: val(b.data, 'wind') === null ? null : (val(b.data, 'wind') as number) * 1.94384,
                ecmwfWind: val(b.ecmwfData, 'wind') === null ? null : (val(b.ecmwfData, 'wind') as number) * 1.94384,
                iconWind: val(b.iconData, 'wind') === null ? null : (val(b.iconData, 'wind') as number) * 1.94384,
                waves: val(b.seaData, 'waves'), ecmwfWaves: val(b.ecmwfSeaData, 'waves'), swell1: val(b.seaData, 'swell1'), ecmwfSwell1: val(b.ecmwfSeaData, 'swell1'), swell2: val(b.seaData, 'swell2'), windWaves: val(b.seaData, 'windWaves'),
                direction: direction(b.data, 'windDir'), ecmwfWindDirection: direction(b.ecmwfData, 'windDir'), iconWindDirection: direction(b.iconData, 'windDir'),
                wavesDir: direction(b.seaData, 'wavesDir'), ecmwfWavesDir: direction(b.ecmwfSeaData, 'wavesDir'), swell1Dir: direction(b.seaData, 'swell1Dir'),
                ecmwfSwell1Dir: direction(b.ecmwfSeaData, 'swell1Dir'), swell2Dir: direction(b.seaData, 'swell2Dir'),
                windWavesDir: forecastDirectionFirstValue(b.seaData, ['windWavesDir', 'wwavesDir', 'wwaves_direction', 'wwaves_direction-surface', 'windwavesDir'], t, b.seaData ? coveredForecastIndex(b.seaData.ts, t) : -1)
            }};
            redrawWindIndicator(); redrawWaveIndicator(); redrawLaylines();
        } catch { localForecast = null; }
        finally { localForecastPending = false; }
    }

    function applyPassivePosition(position: GeolocationPosition): void {
        if (passiveTrackingDisposed) return;
        const { latitude, longitude, accuracy, speed, heading } = position.coords;
        if (!hasValidCoordinates(latitude, longitude) || !Number.isFinite(accuracy)) return;
        if (passiveFix && position.timestamp < passiveFix.timestamp) return;
        const course = typeof heading === 'number' && Number.isFinite(heading) && typeof speed === 'number' && speed >= 0.5 ? heading : null;
        passiveFix = { lat: latitude, lon: longitude, accuracy, speed: typeof speed === 'number' && Number.isFinite(speed) && speed >= 0 ? speed * 1.943844 : null, heading: course, timestamp: position.timestamp };
        const icon = L.divIcon({ className: 'route-builder-gps-position-icon', html: gpsPositionDotHtml, iconSize: [34, 34], iconAnchor: [17, 17] });
        if (!passivePositionMarker) passivePositionMarker = L.marker([latitude, longitude], { icon, interactive: false, zIndexOffset: 10000 }).addTo(map);
        else {
            passivePositionMarker.setLatLng([latitude, longitude]);
            passivePositionMarker.setIcon(icon);
        }
        passivePositionMarker.setZIndexOffset(10000);
        passivePositionMarker.setOpacity(navigationActive ? 0 : 1);
        if (!hasInitiallyCentered) {
            hasInitiallyCentered = true;
            map.setView([latitude, longitude], Math.max(map.getZoom(), 8), { animate: false });
            const rect = map.getContainer().getBoundingClientRect(), view = window.visualViewport;
            const viewport = { left: view?.offsetLeft ?? 0, top: view?.offsetTop ?? 0, right: (view?.offsetLeft ?? 0) + (view?.width ?? window.innerWidth), bottom: (view?.offsetTop ?? 0) + (view?.height ?? window.innerHeight) };
            const drawer = forecastDrawer && !forecastDrawer.hidden && forecastDrawer.classList.contains('is-open') ? forecastDrawer.getBoundingClientRect() : null;
            const target = visibleMapCenter(rect, viewport, null, drawer);
            if (target) { const point = map.latLngToContainerPoint([latitude, longitude]); map.panBy(L.point(point.x - target.x, point.y - target.y), { animate: false }); }
            updateForecastStatus(`Ubicación obtenida (precisión estimada: ${Math.round(accuracy)} m).`);
        }
        redrawMapOverlays();
        if (followBoat) centerBoatInVisibleMap();
        void refreshLocalForecast();
    }

    function reportPassiveLocationFailure(): void {
        if (!passiveTrackingDisposed && !passiveFix) updateForecastStatus('No se pudo obtener la ubicación. Comprobá los permisos de ubicación.');
    }

    function requestPassiveLocation(): void {
        if (!navigator.geolocation || passivePositionRequestPending) return;
        passivePositionRequestPending = true;
        navigator.geolocation.getCurrentPosition(position => {
            passivePositionRequestPending = false;
            applyPassivePosition(position);
        }, () => {
            passivePositionRequestPending = false;
            reportPassiveLocationFailure();
        }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 30000 });
    }

    function startPassiveLocation(): void {
        if (!navigator.geolocation) {
            updateForecastStatus('Este dispositivo no ofrece ubicación GPS en el navegador.');
            return;
        }
        if (passiveWatchId === null) passiveWatchId = navigator.geolocation.watchPosition(applyPassivePosition, reportPassiveLocationFailure, { enableHighAccuracy: true, timeout: 30000, maximumAge: 30000 });
        requestPassiveLocation();
    }

    function redrawMapOverlays(): void {
        redrawDistanceLabels(liveDisplayPoints ?? points);
        redrawGpsCourseLine();
        redrawWindIndicator();
        redrawWaveIndicator();
        redrawLaylines();
        redrawWindRose();
        redrawRoutePointIndicators();
    }

    function indicatorValue(field: string, values?: Record<string, number | null>): number | null {
        if (!field || !values) return null;
        if (field === 'windAverage') return averageWindForValues(values);
        if (field === 'wavesAverage' || field === 'swell1Average') return groupValue(field as WindowConditionKey, values);
        const value = values[field];
        return typeof value === 'number' && Number.isFinite(value) ? value : null;
    }
    function routePointValueAtDistance(field: string, distance: number): number | null {
        const samples = routeForecast.map(sample => ({ distance: sample.distanceNm, value: indicatorValue(field, sample.values) }))
            .filter((sample): sample is { distance: number; value: number } => Number.isFinite(sample.distance) && sample.value !== null)
            .sort((a, b) => a.distance - b.distance);
        const exact = samples.find(sample => Math.abs(sample.distance - distance) < 0.001);
        if (exact) return exact.value;
        let before: { distance: number; value: number } | undefined;
        let after: { distance: number; value: number } | undefined;
        for (const sample of samples) { if (sample.distance < distance) before = sample; else { after = sample; break; } }
        return before && after && after.distance > before.distance ? before.value + (after.value - before.value) * (distance - before.distance) / (after.distance - before.distance) : null;
    }
    const indicatorTextCanvas = document.createElement('canvas');
    function renderBarIndicator(overlay: HTMLDivElement, kind: 'wind' | 'wave', direction: number, value: number | null, rotation: number): void {
        const a = indicatorAppearance;
        const marker = overlay.querySelector<HTMLElement>('.bar-indicator');
        const nameBox = overlay.querySelector<HTMLElement>('.bar-indicator-name');
        const dataBox = overlay.querySelector<HTMLElement>('.bar-indicator-data');
        const tipPath = overlay.querySelector<SVGPathElement>('.bar-indicator-tip path');
        const name = overlay.querySelector<HTMLElement>('.bar-indicator-name-text');
        const directionText = overlay.querySelector<HTMLElement>('.bar-indicator-direction');
        const valueText = overlay.querySelector<HTMLElement>('.bar-indicator-value');
        if (!marker || !nameBox || !dataBox || !tipPath || !name || !directionText || !valueText) return;
        const color = kind === 'wind' ? a.windColor : a.waveColor;
        const title = kind === 'wind' ? a.windLetter : a.waveLetter;
        const formattedValue = value === null ? '' : kind === 'wind' ? value.toFixed(1) + ' kn' : value.toFixed(1) + ' m';
        marker.style.transform = 'rotate(' + rotation + 'deg)';
        marker.style.setProperty('--bar-width', a.barWidth + 'px');
        marker.style.setProperty('--bar-tip-height', a.tipHeight + 'px');
        marker.style.setProperty('--bar-data-length', a.dataLength + 'px');
        marker.style.setProperty('--bar-name-length', a.nameLength + 'px');
        dataBox.style.backgroundColor = color;
        tipPath.setAttribute('fill', color);
        name.textContent = title;
        directionText.textContent = String(Math.round(direction) % 360).padStart(3, '0') + '°';
        valueText.textContent = formattedValue;
        directionText.hidden = !a.showDirection;
        valueText.hidden = !a.showValue || value === null;
        const ctx = indicatorTextCanvas.getContext('2d');
        const margin = Math.max(0, a.textMargin);
        const textWidth = (text: string) => {
            if (!ctx || !text) return 0;
            ctx.font = '700 100px Arial, sans-serif';
            return ctx.measureText(text).width / 100;
        };
        const shown = [!directionText.hidden ? directionText.textContent : '', !valueText.hidden ? valueText.textContent : ''].filter(Boolean) as string[];
        const lineWidth = shown.reduce((total, text) => total + textWidth(text), 0) + Math.max(0, shown.length - 1) * 0.35;
        const dataFont = shown.length ? indicatorBarTextSize(a.dataLength, a.barWidth, margin, a.textSize, lineWidth, 1) : 0;
        const nameFont = indicatorBarTextSize(a.nameLength, a.barWidth, margin, a.textSize, textWidth(title), 1);
        dataBox.style.setProperty('--bar-text-size', dataFont + 'px');
        nameBox.style.setProperty('--bar-text-size', nameFont + 'px');
        directionText.style.visibility = dataFont > 0 ? 'visible' : 'hidden';
        valueText.style.visibility = dataFont > 0 ? 'visible' : 'hidden';
        name.style.visibility = nameFont > 0 ? 'visible' : 'hidden';
        let dataLine = dataBox.querySelector<HTMLElement>('.bar-indicator-data-line');
        if (!dataLine) {
            dataLine = document.createElement('div');
            dataLine.className = 'bar-indicator-data-line';
            dataLine.append(directionText, valueText);
            dataBox.append(dataLine);
        }
        const textRotation = rotation - 90;
        const normalized = ((textRotation + 180) % 360 + 360) % 360 - 180;
        const flip = Math.abs(normalized - readableIndicatorRotation(textRotation)) > 90 ? 180 : 0;
        dataLine.style.transform = 'translate(-50%, -50%) rotate(' + (-90 + flip) + 'deg)';
        name.style.transform = 'translate(-50%, -50%) rotate(' + (-90 + flip) + 'deg)';
    }

    function routePointDirectionAtDistance(field: WindowConditionKey, distanceNm: number): number | null {
        const samples = routeForecast
            .filter(sample => sample.values && Number.isFinite(sample.distanceNm))
            .map(sample => ({ distanceNm: sample.distanceNm, direction: fieldDirection(field, sample.values) }))
            .filter((sample): sample is { distanceNm: number; direction: number } => sample.direction !== null && Number.isFinite(sample.direction))
            .sort((a, b) => a.distanceNm - b.distanceNm);
        const exact = samples.find(sample => Math.abs(sample.distanceNm - distanceNm) < 0.001);
        if (exact) return exact.direction;
        let before: { distanceNm: number; direction: number } | null = null;
        let after: { distanceNm: number; direction: number } | null = null;
        for (const sample of samples) {
            if (sample.distanceNm < distanceNm) before = sample;
            else if (sample.distanceNm > distanceNm) { after = sample; break; }
        }
        if (!before || !after) return null;
        const span = after.distanceNm - before.distanceNm;
        if (!(span > 0)) return before.direction;
        const delta = ((after.direction - before.direction + 540) % 360) - 180;
        const fraction = (distanceNm - before.distanceNm) / span;
        return ((before.direction + delta * fraction) % 360 + 360) % 360;
    }

    function redrawRoutePointIndicators(): void {
        if (waypointDragInProgress) {
            for (const overlay of routePointIndicatorOverlays.values()) overlay.hidden = true;
            return;
        }
        const activeKeys = new Set<string>();
        if (points.length >= 2 && routeForecast.length) {
            const cumulativeDistances = [0];
            for (let index = 1; index < points.length; index++) {
                cumulativeDistances.push(cumulativeDistances[index - 1] + haversineNm(points[index - 1], points[index]));
            }
            const configs = [
                { kind: 'wind' as const, enabled: routeWindIndicatorsEnabled, field: windIndicatorField, distance: indicatorAppearance.pointDistance, size: indicatorAppearance.size, textSize: indicatorAppearance.textSize, degreesEnabled: indicatorAppearance.showDirection, fill: indicatorAppearance.windColor, letter: indicatorAppearance.windLetter },
                { kind: 'wave' as const, enabled: routeWaveIndicatorsEnabled, field: waveIndicatorField, distance: indicatorAppearance.pointDistance, size: indicatorAppearance.size, textSize: indicatorAppearance.textSize, degreesEnabled: indicatorAppearance.showDirection, fill: indicatorAppearance.waveColor, letter: indicatorAppearance.waveLetter },
            ];
            const bearing = map.maplibreMap?.getBearing?.() ?? 0;
            points.forEach((point, index) => {
                if (liveRouteActive && index === 0) return;
                for (const config of configs) {
                    if (!config.enabled || !config.field) continue;
                    const direction = routePointDirectionAtDistance(config.field, cumulativeDistances[index]);
                    if (direction === null || !Number.isFinite(direction)) continue;
                    const key = String(point.id) + ':' + config.kind;
                    activeKeys.add(key);
                    let overlay = routePointIndicatorOverlays.get(key);
                    if (!overlay) {
                        overlay = document.createElement('div');
                        overlay.className = 'route-wind-indicator route-waypoint-direction-indicator';
                        overlay.innerHTML = indicatorBarMarkup();
                        map.getContainer().appendChild(overlay);
                        routePointIndicatorOverlays.set(key, overlay);
                    }
                    const origin = map.latLngToContainerPoint([point.lat, point.lon]);
                    const totalLength = indicatorAppearance.tipHeight + indicatorAppearance.dataLength + indicatorAppearance.nameLength;
                    const layout = directionalIndicatorLayout(origin, direction, bearing, config.distance, indicatorAppearance.barWidth, totalLength);
                    overlay.style.left = layout.x + 'px';
                    overlay.style.top = layout.y + 'px';
                    overlay.style.setProperty('--wind-indicator-size', layout.width + 'px');
                    overlay.style.setProperty('--wind-indicator-height', layout.height + 'px');
                    const value = routePointValueAtDistance(config.kind === 'wind' ? indicatorAppearance.windValue : indicatorAppearance.waveValue, cumulativeDistances[index]);
                    renderBarIndicator(overlay, config.kind, direction, value, layout.rotation);
                    overlay.title = (config.kind === 'wave' ? 'Olas' : 'Viento') + ' en waypoint ' + String(index + 1) + ' desde ' + Math.round(direction) + '°';
                    overlay.hidden = false;
                }
            });
        }
        for (const [key, overlay] of routePointIndicatorOverlays) {
            if (activeKeys.has(key)) continue;
            overlay.remove();
            routePointIndicatorOverlays.delete(key);
        }
    }

    function redrawDirectionalIndicator(kind: 'wind' | 'wave'): void {
        const isWave = kind === 'wave';
        const field = isWave ? waveIndicatorField : windIndicatorField;
        const fix = visualFix();
        const now = Date.now();
        let overlay = isWave ? waveIndicatorOverlay : windIndicatorOverlay;
        if (!fix || now - fix.timestamp > 30000 || !field) {
            if (overlay) overlay.hidden = true;
            return;
        }
        const sample = nearbyForecast(fix, now);
        const direction = sample ? (!isWave && field === 'directionAverage'
            ? groupValue('directionAverage', sample.values)
            : fieldDirection(field, sample.values)) : null;
        if (direction === null || !Number.isFinite(direction)) {
            if (overlay) overlay.hidden = true;
            return;
        }
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'route-wind-indicator';
            const fill = isWave ? '#f4d03f' : '#087bd1';
            const label = isWave ? 'W' : 'T';
            overlay.innerHTML = indicatorBarMarkup();
            map.getContainer().appendChild(overlay);
            if (isWave) waveIndicatorOverlay = overlay;
            else windIndicatorOverlay = overlay;
        }
        const distance = indicatorAppearance.distance;
        const totalLength = indicatorAppearance.tipHeight + indicatorAppearance.dataLength + indicatorAppearance.nameLength;
        const origin = map.latLngToContainerPoint([fix.lat, fix.lon]);
        const bearing = map.maplibreMap?.getBearing?.() ?? 0;
        const layout = directionalIndicatorLayout(origin, direction, bearing, distance, indicatorAppearance.barWidth, totalLength);
        overlay.style.left = `${layout.x}px`;
        overlay.style.top = `${layout.y}px`;
        overlay.style.setProperty('--wind-indicator-size', layout.width + 'px');
        overlay.style.setProperty('--wind-indicator-height', layout.height + 'px');
        renderBarIndicator(overlay, kind, direction, indicatorValue(isWave ? indicatorAppearance.waveValue : indicatorAppearance.windValue, sample?.values), layout.rotation);
        overlay.title = isWave ? `Olas desde ${Math.round(direction)}°` : `Viento previsto desde ${Math.round(direction)}°`;
        overlay.hidden = false;
    }

    function redrawWindIndicator(): void { redrawDirectionalIndicator('wind'); }
    function redrawWaveIndicator(): void { redrawDirectionalIndicator('wave'); }

    function syncIndicatorGeometryControls(setting: 'distance' | 'size' | 'text-size'): void {
        const value = setting === 'distance' ? windIndicatorDistance : setting === 'size' ? windIndicatorSize : windIndicatorTextSize;
        for (const input of document.querySelectorAll<HTMLInputElement>(`[data-wind-indicator-setting="${setting}"], [data-wave-indicator-setting="${setting}"]`)) input.value = String(value);
        try {
            localStorage.setItem(`route-builder-wind-indicator-${setting}`, String(value));
            localStorage.setItem(`route-builder-wave-indicator-${setting}`, String(value));
        } catch { /* Keep the shared setting for this session. */ }
    }

    function syncIndicatorDegreesControls(): void {
        for (const input of document.querySelectorAll<HTMLInputElement>('[data-wind-indicator-degrees], [data-wave-indicator-degrees]')) input.checked = windIndicatorDegreesEnabled;
        try {
            localStorage.setItem('route-builder-wind-indicator-degrees', String(windIndicatorDegreesEnabled));
            localStorage.setItem('route-builder-wave-indicator-degrees', String(windIndicatorDegreesEnabled));
        } catch { /* Keep the shared setting for this session. */ }
    }

    function redrawWindRose(): void {
        const fix = visualFix();
        const hasCurrentFix = !!fix && Date.now() - fix.timestamp <= 30000;
        if (!hasCurrentFix) {
            if (windRoseOverlay) windRoseOverlay.hidden = true;
            if (headingDegreesOverlay) headingDegreesOverlay.hidden = true;
            return;
        }
        if (windRoseEnabled && !windRoseOverlay) {
            windRoseOverlay = document.createElement('div');
            windRoseOverlay.className = 'route-wind-rose';
            map.getContainer().appendChild(windRoseOverlay);
        }
        const radius = windRoseRadius;
        const center = radius;
        const labels = windRoseLabelMode === 'cardinal'
            ? ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO']
            : Array.from({ length: 12 }, (_, index) => String(index * 30).padStart(3, '0'));
        const labelStepDegrees = windRoseLabelMode === 'cardinal' ? 22.5 : 30;
        const bearing = map.maplibreMap?.getBearing?.() ?? 0;
        const signature = `${radius}|${windRoseLineWidth}|${windRoseFontSize}|${windRoseTransparency}|${windRoseLabelMode}`;
        if (windRoseEnabled && windRoseOverlay && signature !== windRoseSignature) {
            const tickLength = Math.max(4, Math.min(9, windRoseFontSize * 0.9));
            const marks = labels.map((label, index) => {
                const angleDegrees = index * labelStepDegrees;
                const angle = angleDegrees * Math.PI / 180;
                const outer = radius - windRoseLineWidth / 2;
                const inner = outer - tickLength;
                const x1 = center + inner * Math.sin(angle), y1 = center - inner * Math.cos(angle);
                const x2 = center + outer * Math.sin(angle), y2 = center - outer * Math.cos(angle);
                const labelRadius = Math.max(2, radius - windRoseLineWidth / 2);
                const x = center + labelRadius * Math.sin(angle), y = center - labelRadius * Math.cos(angle);
                return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#fff" stroke-width="${Math.max(1, windRoseLineWidth * 0.3)}"/><text x="${x}" y="${y}" transform="rotate(${angleDegrees} ${x} ${y})" text-anchor="middle" dominant-baseline="central" fill="#000" font-family="Arial,sans-serif" font-size="${windRoseFontSize}" font-weight="700">${label}</text>`;
            }).join('');
            const separators = windRoseLabelMode === 'degrees' ? Array.from({ length: 12 }, (_, index) => {
                const angle = (index * 30 + 15) * Math.PI / 180;
                const separatorRadius = Math.max(1, radius - windRoseLineWidth / 2);
                const x = center + separatorRadius * Math.sin(angle), y = center - separatorRadius * Math.cos(angle);
                return `<circle cx="${x}" cy="${y}" r="${Math.max(0.8, windRoseFontSize * 0.12)}" fill="#000"/>`;
            }).join('') : '';
            windRoseOverlay.innerHTML = `<svg width="${radius * 2}" height="${radius * 2}" viewBox="0 0 ${radius * 2} ${radius * 2}" style="opacity:${1 - windRoseTransparency / 100}" aria-hidden="true"><circle cx="${center}" cy="${center}" r="${Math.max(1, radius - windRoseLineWidth / 2)}" fill="none" stroke="#fff" stroke-width="${windRoseLineWidth}"/><g class="route-wind-rose-marks">${marks}${separators}</g></svg>`;
            windRoseSignature = signature;
        }
        const origin = map.latLngToContainerPoint([fix.lat, fix.lon]);
        if (windRoseOverlay) {
            windRoseOverlay.querySelector<SVGGElement>('.route-wind-rose-marks')?.setAttribute('transform', `rotate(${-bearing} ${center} ${center})`);
            windRoseOverlay.style.left = `${origin.x}px`;
            windRoseOverlay.style.top = `${origin.y}px`;
            windRoseOverlay.hidden = !windRoseEnabled;
        }
        if (!headingDegreesEnabled || fix.heading === null || !Number.isFinite(fix.heading)) {
            if (headingDegreesOverlay) headingDegreesOverlay.hidden = true;
            return;
        }
        if (!headingDegreesOverlay) {
            headingDegreesOverlay = document.createElement('div');
            headingDegreesOverlay.className = 'route-heading-degrees';
            map.getContainer().appendChild(headingDegreesOverlay);
        }
        const screenHeading = (fix.heading - bearing) * Math.PI / 180;
        headingDegreesOverlay.textContent = String(Math.round(fix.heading) % 360).padStart(3, '0');
        headingDegreesOverlay.title = `Rumbo GPS ${Math.round(fix.heading)}°`;
        const headingRadius = Math.max(1, radius - windRoseLineWidth / 2);
        headingDegreesOverlay.style.left = `${origin.x + headingRadius * Math.sin(screenHeading)}px`;
        headingDegreesOverlay.style.top = `${origin.y - headingRadius * Math.cos(screenHeading)}px`;
        headingDegreesOverlay.style.width = `${headingDegreesWidth}px`;
        headingDegreesOverlay.style.height = `${headingDegreesHeight}px`;
        headingDegreesOverlay.style.fontSize = `${headingDegreesFontSize}px`;
        headingDegreesOverlay.style.transform = `translate(-50%, -50%) rotate(${fix.heading - bearing}deg)`;
        headingDegreesOverlay.hidden = false;
    }

    function redrawLaylines(): void {
        const removeLayers = (layers: L.Polyline[]) => {
            for (const layer of layers) layer.removeFrom(map);
            layers.length = 0;
        };
        removeLayers(upwindLaylineLayers);
        removeLayers(downwindLaylineLayers);
        const fix = visualFix();
        const now = Date.now();
        if (laylineMode === 'none' || !fix || now - fix.timestamp > 30000 || !windIndicatorField) return;
        const sample = nearbyForecast(fix, now);
        const windFrom = sample ? (windIndicatorField === 'directionAverage'
            ? groupValue('directionAverage', sample.values)
            : fieldDirection(windIndicatorField, sample.values)) : null;
        if (windFrom === null) return;
        let showUpwind = laylineMode === 'upwind' || laylineMode === 'both';
        let showDownwind = laylineMode === 'downwind' || laylineMode === 'both';
        if (laylineMode === 'automatic') {
            const course = fix.heading;
            if (course === null || course === undefined || !Number.isFinite(course)) return;
            const windAngle = Math.abs(((course - windFrom + 540) % 360) - 180);
            showUpwind = windAngle <= 90;
            showDownwind = !showUpwind;
        }
        const drawPair = (angle: number, layers: L.Polyline[]) => {
            // Colors are relative to the selected wind axis: babor green, estribor red.
            for (const [bearing, color] of [[windFrom - angle, portWindLaylineColor], [windFrom + angle, starboardWindLaylineColor]] as const) {
                const end = destinationAtBearing(fix, (bearing + 360) % 360, 600);
                layers.push(L.polyline([[fix.lat, fix.lon], [end.lat, end.lon]], { color, weight: 2, opacity: 0.95, interactive: false }).addTo(map));
            }
        };
        if (showUpwind) drawPair(upwindLaylineAngle, upwindLaylineLayers);
        if (showDownwind) drawPair(downwindLaylineAngle, downwindLaylineLayers);
    }

    function redrawGpsCourseLine(): void {
        const fix = visualFix();
        if (!fix || Date.now() - fix.timestamp > 30000 || fix.heading === null || !Number.isFinite(fix.heading)) {
            if (gpsCourseOverlay) gpsCourseOverlay.hidden = true;
            return;
        }
        if (!gpsCourseOverlay) {
            gpsCourseOverlay = document.createElement('div');
            Object.assign(gpsCourseOverlay.style, { position: 'absolute', inset: '0', overflow: 'hidden', pointerEvents: 'none', zIndex: '450' });
            gpsCourseLine = document.createElement('div');
            Object.assign(gpsCourseLine.style, { position: 'absolute', height: '2px', background: '#800020', opacity: '0.95', transformOrigin: '0 50%', pointerEvents: 'none' });
            gpsCourseOverlay.appendChild(gpsCourseLine);
            map.getContainer().appendChild(gpsCourseOverlay);
        }
        gpsCourseOverlay.hidden = false;
        const origin = map.latLngToContainerPoint([fix.lat, fix.lon]);
        const size = map.getSize();
        const length = Math.hypot(size.x, size.y) + Math.hypot(origin.x, origin.y) + 2;
        if (gpsCourseLine) {
            gpsCourseLine.style.left = `${origin.x}px`;
            gpsCourseLine.style.top = `${origin.y - 1}px`;
            gpsCourseLine.style.width = `${length}px`;
            gpsCourseLine.style.transform = `rotate(${fix.heading - 90}deg)`;
        }
    }

    function centerBoatInVisibleMap(): void {
        const requestVersion = ++centerRequestVersion;
        const fix = visualFix();
        if (!fix || Date.now() - fix.timestamp > 30000) {
            updateForecastStatus('No hay una posición GPS reciente para centrar el mapa.');
            return;
        }
        const rect = map.getContainer().getBoundingClientRect();
        const view = window.visualViewport;
        const viewport = { left: view?.offsetLeft ?? 0, top: view?.offsetTop ?? 0, right: (view?.offsetLeft ?? 0) + (view?.width ?? window.innerWidth), bottom: (view?.offsetTop ?? 0) + (view?.height ?? window.innerHeight) };
        const nav = navigationPanel && !navigationPanel.hidden ? navigationPanel.getBoundingClientRect() : null;
        let drawer: { left: number; right: number; top: number; bottom: number } | null = forecastDrawer && !forecastDrawer.hidden && forecastDrawer.classList.contains('is-open') ? forecastDrawer.getBoundingClientRect() : null;
        const callout = forecastDrawer?.querySelector<HTMLElement>('.departure-timebar-callout');
        if (drawer && callout && callout.getClientRects().length) {
            const label = callout.getBoundingClientRect();
            drawer = { left: drawer.left, right: drawer.right, top: Math.min(drawer.top, label.top), bottom: drawer.bottom };
        }
        const target = visibleMapCenter(rect, viewport, nav, drawer);
        if (!target) { updateForecastStatus('No hay espacio visible suficiente para centrar el barco.'); return; }
        // Windy's Leaflet-compatible map is backed by MapLibre. Move its camera
        // and apply the offset together, avoiding a separate pan being lost.
        const camera = map.maplibreMap;
        if (camera && typeof camera.easeTo === 'function') {
            const cameraRect = camera.getContainer().getBoundingClientRect();
            const desiredX = rect.left + target.x - cameraRect.left;
            const desiredY = rect.top + target.y - cameraRect.top;
            const projected = camera.project([fix.lon, fix.lat]);
            if (Math.hypot(projected.x - desiredX, projected.y - desiredY) < 2) return;
            camera.easeTo({
                center: [fix.lon, fix.lat],
                offset: [desiredX - cameraRect.width / 2, desiredY - cameraRect.height / 2],
                duration: 0,
            });
            return;
        }
        const boat = map.latLngToContainerPoint([fix.lat, fix.lon]);
        if (Math.hypot(boat.x - target.x, boat.y - target.y) < 2) return;
        // First move the Windy camera directly to GPS, then offset its center
        // so the boat lands in the unobscured portion of the map.
        map.setView([fix.lat, fix.lon], map.getZoom(), { animate: false });
        window.requestAnimationFrame(() => {
            const latestFix = visualFix();
            if (requestVersion !== centerRequestVersion || !followBoat || !latestFix || Date.now() - latestFix.timestamp > 30000) return;
            const actual = map.latLngToContainerPoint([latestFix.lat, latestFix.lon]);
            map.panBy(L.point(actual.x - target.x, actual.y - target.y), { animate: false });
        });
    }

    function fitLoadedRoute(routePoints: Waypoint[]): void {
        if (!routePoints.length) return;
        const requestVersion = ++routeFitRequestVersion;
        const routeCoordinates = routePoints.map(point => [point.lat, point.lon] as [number, number]);
        window.requestAnimationFrame(() => {
            if (requestVersion !== routeFitRequestVersion) return;
            map.invalidateSize?.({ pan: false });
            const mapRect = map.getContainer().getBoundingClientRect();
            const view = window.visualViewport;
            const viewport = {
                left: view?.offsetLeft ?? 0,
                top: view?.offsetTop ?? 0,
                right: (view?.offsetLeft ?? 0) + (view?.width ?? window.innerWidth),
                bottom: (view?.offsetTop ?? 0) + (view?.height ?? window.innerHeight),
            };
            const size = map.getSize();
            let left = Math.max(mapRect.left, viewport.left);
            let right = Math.min(mapRect.right, viewport.right);
            let top = Math.max(mapRect.top, viewport.top);
            let bottom = Math.min(mapRect.bottom, viewport.bottom);
            const nav = navigationPanel && !navigationPanel.hidden ? navigationPanel.getBoundingClientRect() : null;
            let drawer: { left: number; right: number; top: number; bottom: number } | null = forecastDrawer && !forecastDrawer.hidden && forecastDrawer.classList.contains('is-open')
                ? forecastDrawer.getBoundingClientRect() : null;
            const callout = forecastDrawer?.querySelector<HTMLElement>('.departure-timebar-callout');
            if (drawer && callout && callout.getClientRects().length) {
                drawer = { left: drawer.left, right: drawer.right, top: Math.min(drawer.top, callout.getBoundingClientRect().top), bottom: drawer.bottom };
            }
            if (nav && nav.right > left && nav.left < right && nav.bottom > top && nav.top < bottom) top = Math.min(bottom, nav.bottom);
            if (drawer && drawer.right > left && drawer.left < right && drawer.bottom > top && drawer.top < bottom) bottom = Math.max(top, drawer.top);
            const sidePanel = document.querySelector<HTMLElement>('.plugin-rhpane');
            const sidePanelBounds = sidePanel?.getBoundingClientRect();
            if (sidePanel && getComputedStyle(sidePanel).display !== 'none' && (sidePanelBounds?.width || 0) > 0 && sidePanelBounds!.left > left && sidePanelBounds!.left < right) {
                right = sidePanelBounds!.left;
            }
            if (right <= left || bottom <= top) return;

            const margin = 24;
            const fitPadding = (before: number, after: number, extent: number): [number, number] => {
                const first = Math.max(margin, before + margin);
                const second = Math.max(margin, after + margin);
                const maxTotal = Math.max(0, extent - 80);
                if (first + second <= maxTotal) return [first, second];
                const scale = maxTotal / (first + second || 1);
                return [first * scale, second * scale];
            };
            const [padLeft, padRight] = fitPadding(left - mapRect.left, mapRect.right - right, size.x);
            const [padTop, padBottom] = fitPadding(top - mapRect.top, mapRect.bottom - bottom, size.y);
            const bounds = L.latLngBounds(routeCoordinates);
            const southWest = bounds.getSouthWest();
            const northEast = bounds.getNorthEast();
            const isPointRoute = routeCoordinates.length === 1
                || (Math.abs(northEast.lat - southWest.lat) < 0.0001 && Math.abs(northEast.lng - southWest.lng) < 0.0001);
            if (isPointRoute) {
                const center = routeCoordinates[0];
                map.setView(center, Math.min(13, Math.max(9, map.getZoom())), { animate: false });
                return;
            }
            map.fitBounds(bounds, {
                paddingTopLeft: L.point(padLeft, padTop),
                paddingBottomRight: L.point(padRight, padBottom),
                maxZoom: 13,
                animate: false,
            });
        });
    }

    function setFollowBoat(enabled: boolean): void {
        followBoat = enabled;
        if (!enabled) centerRequestVersion++;
        centerButton?.setAttribute('aria-pressed', String(enabled));
        if (centerButton) {
            centerButton.title = enabled ? 'Desactivar seguimiento GPS' : 'Centrar y seguir la ubicación GPS';
            centerButton.setAttribute('aria-label', centerButton.title);
        }
    }

    function stopFollowingOnMapDrag(): void {
        if (followBoat) setFollowBoat(false);
    }

    function scheduleCenterForLayoutChange(): void {
        if (!followBoat || centerLayoutFrame !== null) return;
        centerLayoutFrame = window.requestAnimationFrame(() => {
            centerLayoutFrame = null;
            if (followBoat) centerBoatInVisibleMap();
        });
    }

    function removePoint(key: string): void {
        const index = points.findIndex(point => String(point.id) === key);
        if (index < 0) return;
        points = points.filter(point => String(point.id) !== key);
        if (points.length === 0) resetCleanRouteDeparture();
        // Removing a waypoint only invalidates samples whose route position or
        // passage time changed. Keep the prior samples available for matching.
        recalculate(true, true);
    }

    function clearRoute(): void {
        points = [];
        resetCleanRouteDeparture();
        navigationTargetId = null;
        waypointArrivalConfirmations = 0;
        updateNavigationPanel();
        distanceNm = 0;
        invalidateForecast();
        redrawMap();
        saveRoute();
        forecastMessage = 'Agrega al menos dos Waypoints para consultar el pronóstico.';
        renderForecastDrawer();
    }

    export const onopen = (location?: { lat: number; lon: number }) => {
        const restored = restoreRoute();
        if (!restored) {
            const center = map.getCenter();
            const lat = Number(location?.lat);
            const lon = Number(location?.lon);
            const start = hasValidCoordinates(lat, lon)
                ? { lat, lon }
                : { lat: center.lat, lon: center.lng };
            points = [{ id: nextPointId++, lat: start.lat, lon: start.lon }];
        }
        recalculate();
        activeWindowCondition = null;
        if (forecastDrawer) {
            forecastDrawer.classList.add('is-open');
            forecastDrawer.hidden = false;
            if (forecastReopenButton) forecastReopenButton.hidden = true;
            if (points.length >= 2) void calculateRouteForecast();
            else {
                forecastMessage = 'Agrega al menos dos Waypoints para consultar el pronóstico.';
                renderForecastDrawer();
            }
        }
    };

    function getWindyDocuments(): Document[] {
        const documents = [document];
        try {
            const mapDocument = map.getContainer().ownerDocument;
            if (mapDocument && !documents.includes(mapDocument)) documents.push(mapDocument);
        } catch {
            // The map may not be mounted yet during plugin initialization.
        }
        try {
            const parentDocument = window.parent.document;
            if (parentDocument && !documents.includes(parentDocument)) documents.push(parentDocument);
        } catch {
            // Windy may isolate the plugin in a cross-origin frame.
        }
        return documents;
    }

    function setForecastOpenState(open: boolean): void {
        for (const windyDocument of getWindyDocuments()) {
            windyDocument.body?.classList.toggle('route-builder-forecast-open', open);
            windyDocument.documentElement?.classList.toggle('route-builder-forecast-open', open);
        }
    }

    onMount(() => {
        const crosshair = pickerDot?.pickerDotEl;
        if (crosshair) {
            hiddenWindyCrosshair = crosshair;
            crosshair.classList.add('route-builder-hide-crosshair');
            crosshairStyle = crosshair.ownerDocument.createElement('style');
            crosshairStyle.textContent = '.route-builder-hide-crosshair { visibility: hidden !important; }';
            crosshair.ownerDocument.head?.appendChild(crosshairStyle);
        }
        const controlsCss = `
            #home, #mobile-home, #home-button, #search, #logo-wrapper, #menu,
            #mobile-ovr-select, #embed-zoom,
            [data-plugin="bottom-controls-mobile"],
            [data-plugin="bottom-controls-desktop"],
            [data-plugin="home"], [data-plugin="search"], [data-plugin="menu"],
            .plugin-home, .mobile-home, .mobile-home-button,
            .leaflet-top.leaflet-right, .maplibregl-ctrl-top-right {
                display: none !important;
            }
        `;
        for (const windyDocument of getWindyDocuments()) {
            let style = windyDocument.getElementById('route-builder-windy-controls-style') as HTMLStyleElement | null;
            if (!style) {
                style = windyDocument.createElement('style');
                style.id = 'route-builder-windy-controls-style';
                style.textContent = controlsCss;
                windyDocument.head?.appendChild(style);
            }
            windyControlsStyles.push(style);
        }
        try {
            routeSnapshotActions = routeSnapshotKeys.map(key => parseRouteSnapshot(localStorage.getItem(key)) ? 'load' : 'save');
            try {
                const storedArrival = JSON.parse(localStorage.getItem('route-builder-arrival-selection-v1') || '{}');
                if (Array.isArray(storedArrival.hours)) arrivalHours = [...new Set<number>(storedArrival.hours.filter((v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 24))];
                if (Array.isArray(storedArrival.days)) arrivalDays = [...new Set<number>(storedArrival.days.filter((v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 7))];
            } catch { arrivalHours = []; arrivalDays = []; }
            try {
                const savedDirections = JSON.parse(localStorage.getItem('route-builder-direction-selections-v1') || '{}');
                for (const key of windowFieldKeys) if (hasDirectionWheel(key) && Array.isArray(savedDirections[key])) directionSelections[key] = [...new Set<number>(savedDirections[key].filter((item: unknown): item is number => typeof item === 'number' && Number.isInteger(item) && item >= 0 && item < 8))];
            } catch { directionSelections = {}; }
            showWaypointDate = localStorage.getItem('route-builder-show-waypoint-date') !== 'false';
            showWaypointHour = localStorage.getItem('route-builder-show-waypoint-hour') !== 'false';
            const legacyWaypointPosition = localStorage.getItem('route-builder-waypoint-label-position');
            waypointDatePosition = localStorage.getItem('route-builder-waypoint-date-position')
                === 'above' || (!localStorage.getItem('route-builder-waypoint-date-position') && legacyWaypointPosition === 'above') ? 'above' : 'below';
            waypointHourPosition = localStorage.getItem('route-builder-waypoint-hour-position')
                === 'above' || (!localStorage.getItem('route-builder-waypoint-hour-position') && legacyWaypointPosition === 'above') ? 'above' : 'below';
            showSegmentTime = localStorage.getItem('route-builder-show-segment-time') !== 'false';
            showSegmentBearing = localStorage.getItem('route-builder-show-segment-bearing') !== 'false';
            showSegmentDistance = localStorage.getItem('route-builder-show-segment-distance') !== 'false';
            const legacySegmentPosition = localStorage.getItem('route-builder-segment-label-position');
            segmentTimePosition = localStorage.getItem('route-builder-segment-time-position') === 'below'
                || (!localStorage.getItem('route-builder-segment-time-position') && legacySegmentPosition === 'below') ? 'below' : 'above';
            segmentBearingPosition = localStorage.getItem('route-builder-segment-bearing-position') === 'below'
                || (!localStorage.getItem('route-builder-segment-bearing-position') && legacySegmentPosition === 'below') ? 'below' : 'above';
            segmentDistancePosition = localStorage.getItem('route-builder-segment-distance-position') === 'below'
                || (!localStorage.getItem('route-builder-segment-distance-position') && legacySegmentPosition === 'below') ? 'below' : 'above';
            showWaypointDistanceAccumulated = localStorage.getItem('route-builder-show-waypoint-distance-accumulated') !== 'false';
            showWaypointTimeAccumulated = localStorage.getItem('route-builder-show-waypoint-time-accumulated') !== 'false';
            showWaypointDistanceRemaining = localStorage.getItem('route-builder-show-waypoint-distance-remaining') !== 'false';
            showWaypointTimeRemaining = localStorage.getItem('route-builder-show-waypoint-time-remaining') !== 'false';
            waypointDatePosition = localStorage.getItem('route-builder-waypoint-date-position') === 'above' ? 'above' : 'below';
            waypointHourPosition = localStorage.getItem('route-builder-waypoint-hour-position') === 'above' ? 'above' : 'below';
            waypointFieldPositions['waypoint-date'] = waypointDatePosition;
            waypointFieldPositions['waypoint-hour'] = waypointHourPosition;
            for (const field of waypointLabelFields.slice(2)) {
                waypointFieldPositions[field] = localStorage.getItem(`route-builder-${field}-position`) === 'above' ? 'above' : 'below';
            }
            const waypointOrder = JSON.parse(localStorage.getItem('route-builder-waypoint-field-order') || 'null');
            if (Array.isArray(waypointOrder)) {
                const validOrder = waypointOrder.filter((field: string, index: number) => waypointLabelFields.includes(field) && waypointOrder.indexOf(field) === index);
                waypointFieldOrder = [...validOrder, ...waypointLabelFields.filter(field => !validOrder.includes(field))];
            }
            const segmentOrder = JSON.parse(localStorage.getItem('route-builder-segment-field-order') || 'null');
            if (Array.isArray(segmentOrder) && segmentOrder.length === 3 && segmentOrder.every((field: string) => ['segment-time', 'segment-bearing', 'segment-distance'].includes(field))) segmentFieldOrder = segmentOrder;
            const savedRouteFieldOrder = JSON.parse(localStorage.getItem('route-builder-forecast-field-order') || 'null');
            if (Array.isArray(savedRouteFieldOrder)) {
                const validOrder = savedRouteFieldOrder.filter((field: string, index: number) => windowFieldKeys.includes(field as WindowConditionKey) && savedRouteFieldOrder.indexOf(field) === index) as WindowConditionKey[];
                routeFieldOrder = [...validOrder, ...windowFieldKeys.filter(field => !validOrder.includes(field))];
                const averageIndex = routeFieldOrder.indexOf('windAverage');
                const firstWindIndex = routeFieldOrder.findIndex(field => windModelFieldKeys.includes(field));
                if (averageIndex >= 0 && firstWindIndex >= 0 && averageIndex > firstWindIndex) {
                    routeFieldOrder.splice(averageIndex, 1);
                    routeFieldOrder.splice(firstWindIndex, 0, 'windAverage');
                }
            }
            try { collapsedGroups = JSON.parse(localStorage.getItem('route-builder-model-groups-collapsed') || '{}'); } catch { collapsedGroups = {}; }
            for (const groupKey of Object.keys(additionalGroups) as WindowConditionKey[]) {
                if (!windowFieldKeys.includes(groupKey)) continue;
                if (!savedRouteFieldOrder?.includes(groupKey)) {
                    routeFieldOrder = routeFieldOrder.filter(field => field !== groupKey);
                    const index = routeFieldOrder.findIndex(field => additionalGroups[groupKey]!.fields.includes(field));
                    routeFieldOrder.splice(Math.max(0, index), 0, groupKey);
                }
            }
            windModelRowsCollapsed = localStorage.getItem('route-builder-wind-model-rows-collapsed') !== 'false';
            const savedHiddenRouteFieldsRaw = localStorage.getItem('route-builder-forecast-hidden-fields');
            const savedHiddenRouteFields = savedHiddenRouteFieldsRaw === null ? null : JSON.parse(savedHiddenRouteFieldsRaw);
            if (Array.isArray(savedHiddenRouteFields)) {
                hiddenRouteFields = new Set(savedHiddenRouteFields.filter((field: string) => field !== 'windAverage' && !additionalGroups[field as WindowConditionKey] && windowFieldKeys.includes(field as WindowConditionKey)));
                for (const field of [...newModelFields, ...skyModelFields]) if (!savedRouteFieldOrder?.includes(field)) hiddenRouteFields.add(field);
            }
            const savedWindIndicator = localStorage.getItem('route-builder-wind-indicator-field') as WindowConditionKey | null;
            windIndicatorUserChoice = savedWindIndicator !== null;
            const legacyWindIndicator: Partial<Record<WindowConditionKey, WindowConditionKey>> = { wind: 'direction', ecmwfWind: 'ecmwfWindDirection', mblueWind: 'mblueWindDirection', iconWind: 'iconWindDirection', aromeWind: 'aromeWindDirection', windAverage: 'directionAverage' };
            const directionIndicator = savedWindIndicator ? legacyWindIndicator[savedWindIndicator] ?? savedWindIndicator : null;
            windIndicatorField = directionIndicator || '';
            const savedWindDistance = Number(localStorage.getItem('route-builder-wind-indicator-distance'));
            const savedWindSize = Number(localStorage.getItem('route-builder-wind-indicator-size'));
            const savedWindTextSize = Number(localStorage.getItem('route-builder-wind-indicator-text-size'));
            if (savedWindDistance >= 20 && savedWindDistance <= 200) windIndicatorDistance = savedWindDistance;
            if (savedWindSize >= 16 && savedWindSize <= 80) windIndicatorSize = savedWindSize;
            if (savedWindTextSize >= 6 && savedWindTextSize <= 40) windIndicatorTextSize = savedWindTextSize;
            const savedWindDegrees = localStorage.getItem('route-builder-wind-indicator-degrees');
            if (savedWindDegrees !== null) windIndicatorDegreesEnabled = savedWindDegrees !== 'false';
            const savedWaveIndicator = localStorage.getItem('route-builder-wave-indicator-field') as WindowConditionKey | null;
            waveIndicatorUserChoice = savedWaveIndicator !== null;
            waveIndicatorField = savedWaveIndicator || '';
            const savedWaveDistance = Number(localStorage.getItem('route-builder-wave-indicator-distance'));
            const savedWaveSize = Number(localStorage.getItem('route-builder-wave-indicator-size'));
            const savedWaveTextSize = Number(localStorage.getItem('route-builder-wave-indicator-text-size'));
            if (savedWaveDistance >= 20 && savedWaveDistance <= 200) waveIndicatorDistance = savedWaveDistance;
            if (savedWaveSize >= 16 && savedWaveSize <= 80) waveIndicatorSize = savedWaveSize;
            if (savedWaveTextSize >= 6 && savedWaveTextSize <= 40) waveIndicatorTextSize = savedWaveTextSize;
            const savedWaveDegrees = localStorage.getItem('route-builder-wave-indicator-degrees');
            if (savedWaveDegrees !== null) waveIndicatorDegreesEnabled = savedWaveDegrees !== 'false';
            const savedRouteWindEnabled = localStorage.getItem('route-builder-waypoint-wind-indicator-enabled');
            if (savedRouteWindEnabled !== null) routeWindIndicatorsEnabled = savedRouteWindEnabled === 'true';
            const savedRouteWindDistance = Number(localStorage.getItem('route-builder-waypoint-wind-indicator-distance'));
            if (savedRouteWindDistance >= 20 && savedRouteWindDistance <= 200) routeWindIndicatorDistance = savedRouteWindDistance;
            const savedRouteWaveEnabled = localStorage.getItem('route-builder-waypoint-wave-indicator-enabled');
            if (savedRouteWaveEnabled !== null) routeWaveIndicatorsEnabled = savedRouteWaveEnabled === 'true';
            const savedRouteWaveDistance = Number(localStorage.getItem('route-builder-waypoint-wave-indicator-distance'));
            if (savedRouteWaveDistance >= 20 && savedRouteWaveDistance <= 200) routeWaveIndicatorDistance = savedRouteWaveDistance;
            if (!(savedWindDistance >= 20 && savedWindDistance <= 200) && savedWaveDistance >= 20 && savedWaveDistance <= 200) windIndicatorDistance = savedWaveDistance;
            if (!(savedWindSize >= 16 && savedWindSize <= 80) && savedWaveSize >= 16 && savedWaveSize <= 80) windIndicatorSize = savedWaveSize;
            if (!(savedWindTextSize >= 6 && savedWindTextSize <= 40) && savedWaveTextSize >= 6 && savedWaveTextSize <= 40) windIndicatorTextSize = savedWaveTextSize;
            if (savedWindDegrees === null && savedWaveDegrees !== null) windIndicatorDegreesEnabled = savedWaveDegrees !== 'false';
            waveIndicatorDistance = windIndicatorDistance;
            waveIndicatorSize = windIndicatorSize;
            waveIndicatorTextSize = windIndicatorTextSize;
            waveIndicatorDegreesEnabled = windIndicatorDegreesEnabled;
            // One-time migration: place both arrows at the requested 80 px radius,
            // then let future user adjustments persist normally.
            if (localStorage.getItem('route-builder-shared-indicator-geometry-v1') !== 'true') {
                windIndicatorDistance = waveIndicatorDistance = 80;
                localStorage.setItem('route-builder-wind-indicator-distance', '80');
                localStorage.setItem('route-builder-wave-indicator-distance', '80');
                localStorage.setItem('route-builder-shared-indicator-geometry-v1', 'true');
            }
            const savedWindRoseEnabled = localStorage.getItem('route-builder-wind-rose-enabled');
            if (savedWindRoseEnabled !== null) windRoseEnabled = savedWindRoseEnabled === 'true';
            const savedHeadingDegreesEnabled = localStorage.getItem('route-builder-heading-degrees-enabled');
            if (savedHeadingDegreesEnabled !== null) headingDegreesEnabled = savedHeadingDegreesEnabled === 'true';
            const savedHeadingDegreesFontSize = Number(localStorage.getItem('route-builder-heading-degrees-font-size'));
            const savedHeadingDegreesWidth = Number(localStorage.getItem('route-builder-heading-degrees-width'));
            const savedHeadingDegreesHeight = Number(localStorage.getItem('route-builder-heading-degrees-height'));
            if (Number.isFinite(savedHeadingDegreesFontSize) && savedHeadingDegreesFontSize >= 6 && savedHeadingDegreesFontSize <= 40) headingDegreesFontSize = savedHeadingDegreesFontSize;
            if (Number.isFinite(savedHeadingDegreesWidth) && savedHeadingDegreesWidth >= 30 && savedHeadingDegreesWidth <= 200) headingDegreesWidth = savedHeadingDegreesWidth;
            if (Number.isFinite(savedHeadingDegreesHeight) && savedHeadingDegreesHeight >= 16 && savedHeadingDegreesHeight <= 100) headingDegreesHeight = savedHeadingDegreesHeight;
            const savedWindSettingsOpen = localStorage.getItem('route-builder-wind-settings-open');
            const savedWaveSettingsOpen = localStorage.getItem('route-builder-wave-settings-open');
            const savedLaylineSettingsOpen = localStorage.getItem('route-builder-layline-settings-open');
            const savedRoseSettingsOpen = localStorage.getItem('route-builder-wind-rose-settings-open');
            if (savedWindSettingsOpen !== null) windIndicatorSettingsOpen = savedWindSettingsOpen === 'true';
            if (savedWaveSettingsOpen !== null) waveIndicatorSettingsOpen = savedWaveSettingsOpen === 'true';
            if (savedLaylineSettingsOpen !== null) laylinesSettingsOpen = savedLaylineSettingsOpen === 'true';
            if (savedRoseSettingsOpen !== null) windRoseSettingsOpen = savedRoseSettingsOpen === 'true';
            const savedWindRoseRadius = Number(localStorage.getItem('route-builder-wind-rose-radius'));
            const savedWindRoseWidth = Number(localStorage.getItem('route-builder-wind-rose-width'));
            const savedWindRoseFontSize = Number(localStorage.getItem('route-builder-wind-rose-font-size'));
            const savedWindRoseTransparencyValue = localStorage.getItem('route-builder-wind-rose-transparency');
            const savedWindRoseTransparency = savedWindRoseTransparencyValue === null ? NaN : Number(savedWindRoseTransparencyValue);
            if (Number.isFinite(savedWindRoseRadius) && savedWindRoseRadius >= 20 && savedWindRoseRadius <= 200) windRoseRadius = savedWindRoseRadius;
            if (Number.isFinite(savedWindRoseWidth) && savedWindRoseWidth >= 1 && savedWindRoseWidth <= 20) windRoseLineWidth = savedWindRoseWidth;
            if (Number.isFinite(savedWindRoseFontSize) && savedWindRoseFontSize >= 4 && savedWindRoseFontSize <= 24) windRoseFontSize = savedWindRoseFontSize;
            if (Number.isFinite(savedWindRoseTransparency) && savedWindRoseTransparency >= 0 && savedWindRoseTransparency <= 100) windRoseTransparency = savedWindRoseTransparency;
            const savedWindRoseLabelMode = localStorage.getItem('route-builder-wind-rose-label-mode');
            if (savedWindRoseLabelMode === 'cardinal' || savedWindRoseLabelMode === 'degrees') windRoseLabelMode = savedWindRoseLabelMode;
            const storedLaylineMode = localStorage.getItem('route-builder-layline-mode') as typeof laylineMode | null;
            if (storedLaylineMode && ['none', 'upwind', 'downwind', 'both', 'automatic'].includes(storedLaylineMode)) laylineMode = storedLaylineMode;
            const storedPortWindLaylineColor = localStorage.getItem('route-builder-layline-port-color');
            const storedStarboardWindLaylineColor = localStorage.getItem('route-builder-layline-starboard-color');
            if (storedPortWindLaylineColor && /^#[\da-f]{6}$/i.test(storedPortWindLaylineColor)) portWindLaylineColor = storedPortWindLaylineColor;
            if (storedStarboardWindLaylineColor && /^#[\da-f]{6}$/i.test(storedStarboardWindLaylineColor)) starboardWindLaylineColor = storedStarboardWindLaylineColor;
            const savedUpwindAngleValue = localStorage.getItem('route-builder-upwind-angle');
            const savedDownwindAngleValue = localStorage.getItem('route-builder-downwind-angle');
            const savedUpwindAngle = savedUpwindAngleValue === null ? NaN : Number(savedUpwindAngleValue);
            const savedDownwindAngle = savedDownwindAngleValue === null ? NaN : Number(savedDownwindAngleValue);
            if (Number.isFinite(savedUpwindAngle) && savedUpwindAngle >= 0 && savedUpwindAngle <= 90) upwindLaylineAngle = savedUpwindAngle;
            if (Number.isFinite(savedDownwindAngle) && savedDownwindAngle >= 90 && savedDownwindAngle <= 180) downwindLaylineAngle = savedDownwindAngle;
            const savedFont = localStorage.getItem('route-builder-distance-font') as DistanceFont | null;
            if (savedFont && savedFont in distanceFontStacks) distanceFont = savedFont;
            const savedDistanceUnit = localStorage.getItem('route-builder-distance-unit') as DistanceUnit | null;
            if (savedDistanceUnit === 'km' || savedDistanceUnit === 'nm') distanceUnit = savedDistanceUnit;
            const savedWaypointLabelFontSize = Number(localStorage.getItem('route-builder-waypoint-label-font-size'));
            if (Number.isFinite(savedWaypointLabelFontSize) && savedWaypointLabelFontSize >= 8 && savedWaypointLabelFontSize <= 18) waypointLabelFontSize = savedWaypointLabelFontSize;
            const savedSegmentLabelFontSize = Number(localStorage.getItem('route-builder-segment-label-font-size'));
            if (Number.isFinite(savedSegmentLabelFontSize) && savedSegmentLabelFontSize >= 8 && savedSegmentLabelFontSize <= 18) segmentLabelFontSize = savedSegmentLabelFontSize;
            const savedWaypointSize = Number(localStorage.getItem('route-builder-waypoint-size'));
            if (Number.isFinite(savedWaypointSize) && savedWaypointSize >= 14 && savedWaypointSize <= 40) {
                waypointSize = savedWaypointSize;
            }
            const savedSpeed = Number(localStorage.getItem('route-builder-speed-knots'));
            if (Number.isFinite(savedSpeed) && savedSpeed >= 0) speedKnots = Math.max(0, Math.min(20, savedSpeed));
            const savedSampleIntervalHours = Number(localStorage.getItem('route-builder-sample-interval-hours'));
            const storedLiveSpeed = Number(localStorage.getItem('route-builder-live-speed-seconds'));
            const storedLiveForecast = Number(localStorage.getItem('route-builder-live-forecast-seconds'));
            const storedLiveWaypoints = Number(localStorage.getItem('route-builder-live-waypoint-seconds'));
            restorePreviousRouteOnNavExit = localStorage.getItem('route-builder-restore-previous-route-on-nav-exit') === 'true';
            if (liveSpeedOptions.includes(storedLiveSpeed)) liveSpeedSeconds = storedLiveSpeed;
            if (liveForecastOptions.includes(storedLiveForecast)) liveForecastSeconds = storedLiveForecast;
            if (liveWaypointOptions.includes(storedLiveWaypoints)) liveWaypointSeconds = storedLiveWaypoints;
            if ([1, 3, 6, 12].includes(savedSampleIntervalHours)) routeSampleIntervalHours = savedSampleIntervalHours;
            const savedSearchDays = Number(localStorage.getItem('route-builder-weather-search-days'));
            if (savedSearchDays === 7) weatherSearchDays = 15;
            else if ([3, 5, 10, 15].includes(savedSearchDays)) weatherSearchDays = savedSearchDays;
            const savedDrawerHeightRaw = localStorage.getItem('route-builder-drawer-max-height-percent');
            const savedDrawerHeight = Number(savedDrawerHeightRaw);
            if (savedDrawerHeightRaw !== null && savedDrawerHeightRaw.trim() !== '' && Number.isFinite(savedDrawerHeight) && savedDrawerHeight >= 0 && savedDrawerHeight <= 100) forecastDrawerMaxHeightPercent = savedDrawerHeight;
            const savedDepartureInterval = Number(localStorage.getItem('route-builder-departure-interval-hours'));
            if ([1, 2, 3, 6, 12, 24].includes(savedDepartureInterval)) departureIntervalHours = savedDepartureInterval;
            const savedConstraints = JSON.parse(localStorage.getItem('route-builder-window-constraints') || 'null');
            if (savedConstraints && typeof savedConstraints === 'object') {
                windowConstraints = {
                    ...windowConstraints,
                    ...savedConstraints,
                    temperature: { ...windowConstraints.temperature, ...savedConstraints.temperature },
                    rain: { ...windowConstraints.rain, ...savedConstraints.rain },
                    windAverage: { ...windowConstraints.windAverage, ...savedConstraints.windAverage },
                    wind: { ...windowConstraints.wind, ...savedConstraints.wind },
                    ecmwfWind: { ...windowConstraints.ecmwfWind, ...savedConstraints.ecmwfWind },
                    mblueWind: { ...windowConstraints.mblueWind, ...savedConstraints.mblueWind },
                    iconWind: { ...windowConstraints.iconWind, ...savedConstraints.iconWind },
                    aromeWind: { ...windowConstraints.aromeWind, ...savedConstraints.aromeWind },
                    ecmwfWindDirection: { ...windowConstraints.ecmwfWindDirection, ...savedConstraints.ecmwfWindDirection },
                    mblueWindDirection: { ...windowConstraints.mblueWindDirection, ...savedConstraints.mblueWindDirection },
                    iconWindDirection: { ...windowConstraints.iconWindDirection, ...savedConstraints.iconWindDirection },
                    aromeWindDirection: { ...windowConstraints.aromeWindDirection, ...savedConstraints.aromeWindDirection },
                    gust: { ...windowConstraints.gust, ...savedConstraints.gust },
                    direction: { ...windowConstraints.direction, ...savedConstraints.direction },
                    waves: { ...windowConstraints.waves, ...savedConstraints.waves },
                    ecmwfWaves: { ...windowConstraints.ecmwfWaves, ...savedConstraints.ecmwfWaves },
                    ecmwfSwell1: { ...windowConstraints.ecmwfSwell1, ...savedConstraints.ecmwfSwell1 },
                    ecmwfWavesPeriod: { ...windowConstraints.ecmwfWavesPeriod, ...savedConstraints.ecmwfWavesPeriod },
                    ecmwfWavesPower: { ...windowConstraints.ecmwfWavesPower, ...savedConstraints.ecmwfWavesPower },
                    clouds: { states: Array.isArray(savedConstraints.clouds?.states) ? savedConstraints.clouds.states.filter((state: string) => skyStateOptions.some(option => option.id === state)) : [] },
                    arrival: { ...windowConstraints.arrival, ...savedConstraints.arrival },
                };
                const powerBoundsList = [windowConstraints.wavesPower, windowConstraints.ecmwfWavesPower];
                for (const powerBounds of powerBoundsList) for (const bound of ['min', 'max'] as const) {
                    const value = powerBounds[bound];
                    if (value !== '' && value !== null && value !== undefined && Number.isFinite(Number(value))) {
                        powerBounds[bound] = Math.max(0, Math.min(20, Number(value)));
                    }
                }
            } else {
                const legacyConditions = JSON.parse(localStorage.getItem('route-builder-weather-conditions') || 'null');
                if (legacyConditions?.temperature?.enabled) windowConstraints.temperature = { min: legacyConditions.temperature.min, max: legacyConditions.temperature.max };
                if (legacyConditions?.rain?.enabled) windowConstraints.rain = { min: legacyConditions.rain.min, max: legacyConditions.rain.max };
                if (legacyConditions?.wind?.enabled) windowConstraints.wind = { min: legacyConditions.wind.min, max: legacyConditions.wind.max };
                if (legacyConditions?.waves?.enabled) windowConstraints.waves = { min: legacyConditions.waves.min, max: legacyConditions.waves.max };
                if (legacyConditions?.clouds?.enabled) windowConstraints.clouds.states = ['clear', 'partly-cloudy', 'mostly-cloudy', 'overcast'];
            }
        } catch { /* Storage may be unavailable in some browser modes. */ }
        // Restore after preferences load so the autosaved route and its speed
        // take precedence even when Windy remounts without calling onopen.
        restoreRoute();
        waypointLayer = L.layerGroup().addTo(map);
        distanceLabelOverlay = document.createElement('div');
        distanceLabelOverlay.className = 'route-builder-label-overlay';
        Object.assign(distanceLabelOverlay.style, {
            position: 'absolute', inset: '0', zIndex: '650', pointerEvents: 'none', overflow: 'hidden',
        });
        map.getContainer().appendChild(distanceLabelOverlay);
        forecastDrawer = document.createElement('div');
        forecastDrawer.className = 'route-builder-forecast-drawer-host';
        applyForecastDrawerHeightLimit();
        forecastDrawer.classList.add('is-open');
        forecastDrawer.hidden = false;
        document.body.appendChild(forecastDrawer);
        navigationPanel = document.createElement('section');
        navigationPanel.className = 'route-navigation-dashboard';
        navigationPanel.hidden = true;
        navigationPanel.setAttribute('aria-label', 'Datos de navegación GPS');
        navigationPanel.innerHTML = `<label class="route-nav-waypoint-picker" title="Cambiar waypoint"><span class="route-nav-side-label" data-nav-value="waypoint">Waypoint</span><select data-nav-waypoint-select aria-label="Elegir próximo waypoint"></select></label><div class="route-nav-side"><div title="Rumbo al waypoint">➤ <b data-nav-value="bearing">—</b></div><div title="Distancia al waypoint">↔ <b data-nav-value="nextDistance">—</b></div><div title="Tiempo al waypoint">◷ <b data-nav-value="nextTime">—</b></div></div><div class="route-nav-center"><div class="route-nav-speed"><div class="route-nav-speed-current"><b data-nav-value="speed">—</b><small>kt</small></div><div class="route-nav-speed-average" title="Velocidad promedio estimada desde la salida sobre la ruta">Prom. <b data-nav-value="averageSpeed">—</b> kt</div></div><div class="route-nav-heading" title="Rumbo GPS" data-nav-value="heading">—</div></div><div class="route-nav-side"><div title="Tiempo a destino">◷ <b data-nav-value="finalTime">—</b></div><div title="Distancia a destino">↔ <b data-nav-value="finalDistance">—</b></div><div title="Llegada estimada">▣ <b data-nav-value="eta">—</b></div></div><span class="route-nav-side-label">Destino</span>`;
        navigationPanel.querySelector<HTMLSelectElement>('[data-nav-waypoint-select]')?.addEventListener('change', event => {
            const id = Number((event.currentTarget as HTMLSelectElement).value);
            if (!points.some(point => point.id === id)) return;
            navigationTargetId = id;
            waypointArrivalConfirmations = 0;
            updateNavigationPanel();
            if (liveRouteActive) refreshLiveRoute();
        });
        document.body.appendChild(navigationPanel);
        if (typeof ResizeObserver !== 'undefined') {
            centerLayoutObserver = new ResizeObserver(scheduleCenterForLayoutChange);
            centerLayoutObserver.observe(forecastDrawer);
            centerLayoutObserver.observe(navigationPanel);
        }
        navigationRefreshTimer = window.setInterval(updateNavigationPanel, 5000);
        gpsButton = document.createElement('button');
        gpsButton.type = 'button';
        gpsButton.className = 'route-builder-gps-label-button';
        const navigationButtonIcon = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v8m0 4v8M2 12h8m4 0h8M5 5l5.6 5.6m2.8 2.8L19 19M19 5l-5.6 5.6m-2.8 2.8L5 19"/></svg>';
        gpsButton.innerHTML = navigationButtonIcon;
        gpsButton.setAttribute('aria-label', 'Modo navegación');
        gpsButton.setAttribute('aria-pressed', 'false');
        gpsButton.title = 'Activar modo Navegación';
        liveButton = document.createElement('button');
        liveButton.type = 'button';
        liveButton.className = 'route-builder-gps-label-button route-builder-live-button';
        liveButton.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M19.07 4.93l-1.42 1.42M6.35 17.65l-1.42 1.42"/></svg>';
        liveButton.setAttribute('aria-label', 'Pronóstico en vivo');
        liveButton.setAttribute('aria-pressed', 'false');
        liveButton.title = 'Cargar ruta desde la posición GPS';
        liveButton.hidden = true;
        centerButton = document.createElement('button');
        centerButton.type = 'button';
        centerButton.className = 'route-builder-gps-label-button route-builder-center-button';
        centerButton.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2" fill="currentColor"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>';
        centerButton.title = 'Centrar el barco en el mapa visible';
        centerButton.setAttribute('aria-label', 'Centrar el barco en el mapa visible');
        centerButton.setAttribute('aria-pressed', 'false');
        centerButton.hidden = false;
        centerButton.addEventListener('click', event => {
            event.stopPropagation();
            if (followBoat) { setFollowBoat(false); return; }
            setFollowBoat(true);
            const fix = visualFix();
            if (!fix || Date.now() - fix.timestamp > 30000) {
                updateForecastStatus('Esperando una posición GPS reciente para centrar y seguir.');
                requestPassiveLocation();
                return;
            }
            centerBoatInVisibleMap();
        });
        mapTypeControl = document.createElement('div');
        mapTypeControl.className = 'route-builder-map-type';
        mapTypeControl.innerHTML = `<button type="button" class="route-builder-gps-label-button route-builder-map-type-button" aria-label="Tipo de mapa" aria-expanded="false" title="Tipo de mapa"><svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 2 8l10 5 10-5-10-5Zm-10 9 10 5 10-5M2 16l10 5 10-5"/></svg></button><div class="route-builder-map-type-menu" role="group" aria-label="Tipo de mapa" hidden><button type="button" data-map-type="standard">Estándar</button><button type="button" data-map-type="satellite">Satélite</button><button type="button" data-map-type="topographic">Topográfico</button><button type="button" data-map-type="nautical">Náutico (con marcas)</button></div>`;
        const mapTypeButton = mapTypeControl.querySelector<HTMLButtonElement>('.route-builder-map-type-button')!;
        const mapTypeMenu = mapTypeControl.querySelector<HTMLDivElement>('.route-builder-map-type-menu')!;
        const syncMapType = () => mapTypeMenu.querySelectorAll<HTMLButtonElement>('[data-map-type]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mapType === getMapType())));
        syncMapType();
        mapTypeButton.addEventListener('click', event => { event.stopPropagation(); mapTypeMenu.hidden = !mapTypeMenu.hidden; mapTypeButton.setAttribute('aria-expanded', String(!mapTypeMenu.hidden)); });
        mapTypeMenu.addEventListener('click', event => {
            event.stopPropagation();
            const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-map-type]');
            if (!button?.dataset.mapType) return;
            setMapType(button.dataset.mapType); syncMapType(); mapTypeMenu.hidden = true; mapTypeButton.setAttribute('aria-expanded', 'false');
        });
        const makeZoomButton = (label: string, symbol: string, className: string, delta: number): HTMLButtonElement => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = `route-builder-gps-label-button route-builder-zoom-button ${className}`;
            button.textContent = symbol;
            button.title = label;
            button.setAttribute('aria-label', label);
            button.addEventListener('click', event => {
                event.stopPropagation();
                if (delta > 0) map.zoomIn(1, { animate: false });
                else map.zoomOut(1, { animate: false });
                scheduleCenterForLayoutChange();
            });
            return button;
        };
        zoomInButton = makeZoomButton('Acercar mapa', '+', 'route-builder-zoom-in', 1);
        zoomOutButton = makeZoomButton('Alejar mapa', '−', 'route-builder-zoom-out', -1);
        liveButton.addEventListener('click', event => {
            event.stopPropagation();
            if (autoLivePending) {
                autoLivePending = false;
                updateForecastStatus('Activación automática de EN VIVO cancelada.');
                return;
            }
            if (liveRouteActive) leaveLiveRoute(false, false);
            else enterLiveRoute();
        });
        gpsButton.addEventListener('click', async event => {
            event.stopPropagation();
            if (!gpsButton || gpsButton.disabled) return;
            if (navigationActive) {
                if (!leaveLiveRoute(restorePreviousRouteOnNavExit, true)) return;
                navigationActive = false;
                passivePositionMarker?.setOpacity(1);
                autoLivePending = false;
                if (liveButton) liveButton.hidden = true;
                if (centerButton) centerButton.hidden = false;
                gpsRequestGeneration++;
                if (gpsWatchId !== null && navigator.geolocation) navigator.geolocation.clearWatch(gpsWatchId);
                gpsWatchId = null;
                gpsPositionMarker?.removeFrom(map);
                gpsPositionMarker = null;
                navigationFix = null;
                redrawMapOverlays();
                recentGpsSpeeds = [];
                gpsCourse = null;
                gpsCourseAnchor = null;
                waypointArrivalConfirmations = 0;
                lastNavigationFixTimestamp = 0;
                if (navigationPanel) navigationPanel.hidden = true;
                gpsButton.setAttribute('aria-pressed', 'false');
                gpsButton.title = 'Activar modo Navegación';
                updateBoatTrackMarker();
                updateForecastStatus('Navegación GPS detenida.');
                return;
            }
            const requestGeneration = ++gpsRequestGeneration;
            gpsButton.disabled = true;
            gpsButton.textContent = '...';
            try {
                const position = await getGPSlocation({ enableHighAccuracy: true, timeout: 20000, maximumAge: 10000, getMeFallbackGps: false, doNotShowFailureMessage: true });
                if (requestGeneration !== gpsRequestGeneration) return;
                const lat = Number(position?.lat), lon = Number(position?.lon);
                if (position?.source !== 'device' || !hasValidCoordinates(lat, lon)) {
                    updateForecastStatus('No se pudo obtener una posición GPS. Comprueba la ubicación y sus permisos.');
                    return;
                }
                navigationFix = { lat, lon, speed: null, heading: null, timestamp: Date.now() };
                navigationPlanBackupActive = saveTemporaryPlan(localStorage, { points, nextPointId, departureDateTime, speedKnots });
                navigationActive = true;
                passivePositionMarker?.setOpacity(0);
                autoLivePending = true;
                if (liveButton) liveButton.hidden = false;
                if (centerButton) centerButton.hidden = false;
                gpsButton.setAttribute('aria-pressed', 'true');
                gpsButton.title = 'Desactivar modo Navegación';
                if (navigationPanel) navigationPanel.hidden = false;
                updateNavigationPanel();
                const icon = L.divIcon({ className: 'route-builder-gps-position-icon', html: gpsPositionDotHtml, iconSize: [34, 34], iconAnchor: [17, 17] });
                if (!gpsPositionMarker) gpsPositionMarker = L.marker([lat, lon], { icon, interactive: false, zIndexOffset: 10000 }).addTo(map);
                else gpsPositionMarker.setLatLng([lat, lon]);
                gpsPositionMarker.setZIndexOffset(10000);
                map.setView([lat, lon], Math.max(map.getZoom(), 8));
                setFollowBoat(true);
                centerBoatInVisibleMap();
                updateForecastStatus('Posición GPS actualizada. EN VIVO espera una ruta y velocidad GPS válidas.');
                if (gpsWatchId === null && navigator.geolocation) {
                    gpsWatchId = navigator.geolocation.watchPosition(update => {
                        if (!navigationActive || requestGeneration !== gpsRequestGeneration) return;
                        const { latitude, longitude, accuracy, speed } = update.coords;
                        if (!gpsPositionMarker || !hasValidCoordinates(latitude, longitude) || !Number.isFinite(accuracy) || accuracy > 100) return;
                        const currentFix = { lat: latitude, lon: longitude, accuracy, timestamp: update.timestamp };
                        if (typeof speed === 'number' && Number.isFinite(speed) && speed < 0.5) {
                            gpsCourse = null;
                            gpsCourseAnchor = currentFix;
                        } else if (!gpsCourseAnchor || currentFix.timestamp <= gpsCourseAnchor.timestamp || currentFix.timestamp - gpsCourseAnchor.timestamp > 120000) {
                            gpsCourseAnchor = currentFix;
                            gpsCourse = null;
                        } else {
                            const bearing = courseFromFixes(gpsCourseAnchor, currentFix);
                            if (bearing !== null) { gpsCourse = { heading: bearing, timestamp: currentFix.timestamp }; gpsCourseAnchor = currentFix; }
                        }
                        const heading = gpsCourse && currentFix.timestamp - gpsCourse.timestamp <= 30000 ? gpsCourse.heading : null;
                        const hasCourse = heading !== null;
                        navigationFix = { lat: latitude, lon: longitude, speed: typeof speed === 'number' && Number.isFinite(speed) && speed >= 0 ? speed * 1.943844 : null, heading, timestamp: update.timestamp };
                        recentGpsSpeeds = recentGpsSpeeds.filter(sample => sample.timestamp >= update.timestamp - 300000 && sample.timestamp <= update.timestamp);
                        if (navigationFix.speed !== null) recentGpsSpeeds.push({ timestamp: update.timestamp, speed: navigationFix.speed });
                        const previousTargetId = navigationTargetId;
                        updateNavigationPanel(true);
                        if (liveRouteActive && navigationTargetId !== previousTargetId) refreshLiveRoute();
                        tryStartAutomaticLive();
                        const markerHtml = hasCourse
                            ? `<svg viewBox="0 0 24 24" width="30" height="30" style="transform:rotate(${heading}deg)" aria-label="Rumbo GPS"><path d="M12 2 L21 21 L12 17 L3 21 Z" fill="#087bd1" stroke="white" stroke-width="2" stroke-linejoin="round"/></svg>`
                            : gpsPositionDotHtml;
                        gpsPositionMarker.setLatLng([latitude, longitude]);
                        gpsPositionMarker.setIcon(L.divIcon({ className: 'route-builder-gps-position-icon', html: markerHtml, iconSize: [34, 34], iconAnchor: [17, 17] }));
                        gpsPositionMarker.setZIndexOffset(10000);
                        if (followBoat) centerBoatInVisibleMap();
                    }, () => {
                        if (!navigationActive || requestGeneration !== gpsRequestGeneration) return;
                        if (gpsPositionMarker) updateForecastStatus('No se pudo actualizar el seguimiento GPS.');
                    }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 5000 });
                }
            } catch {
                if (requestGeneration === gpsRequestGeneration) updateForecastStatus('No se pudo obtener una posición GPS. Comprueba la ubicación y sus permisos.');
            } finally {
                if (requestGeneration === gpsRequestGeneration && gpsButton) { gpsButton.disabled = false; gpsButton.innerHTML = navigationButtonIcon; }
            }
        });
        forecastDrawer.appendChild(gpsButton);
        forecastDrawer.appendChild(liveButton);
        forecastDrawer.appendChild(centerButton);
        forecastDrawer.appendChild(mapTypeControl);
        forecastDrawer.appendChild(zoomInButton);
        forecastDrawer.appendChild(zoomOutButton);
        forecastDrawer.addEventListener('toggle', event => {
            const details = event.target as HTMLDetailsElement;
            const group = details.dataset.visualGroup;
            if (!group) return;
            if (group === 'wind') windIndicatorSettingsOpen = details.open;
            else if (group === 'wave') waveIndicatorSettingsOpen = details.open;
            else if (group === 'laylines') laylinesSettingsOpen = details.open;
            else if (group === 'rose') windRoseSettingsOpen = details.open;
            else return;
            try { localStorage.setItem(`route-builder-${group === 'wind' ? 'wind' : group === 'wave' ? 'wave' : group === 'laylines' ? 'layline' : 'wind-rose'}-settings-open`, String(details.open)); } catch { /* Keep the setting in memory. */ }
        }, true);
        forecastDrawer.addEventListener('scroll', positionForecastFieldPickers, true);
        let panelHeightDrag: { pointerId: number; startY: number; startHeight: number; viewportHeight: number } | null = null;
        forecastDrawer.addEventListener('pointerdown', event => {
            const target = event.target as HTMLElement;
            if (!target.closest('.departure-timebar-callout') || (event.pointerType === 'mouse' && event.button !== 0)) return;
            event.preventDefault();
            event.stopPropagation();
            panelHeightDrag = { pointerId: event.pointerId, startY: event.clientY, startHeight: forecastDrawerMaxHeightPercent, viewportHeight: window.visualViewport?.height || window.innerHeight };
            forecastDrawer!.setPointerCapture(event.pointerId);
            forecastDrawer!.classList.add('is-panel-height-dragging');
        });
        forecastDrawer.addEventListener('pointermove', event => {
            if (!panelHeightDrag || event.pointerId !== panelHeightDrag.pointerId) return;
            event.preventDefault();
            forecastDrawerMaxHeightPercent = Math.max(0, Math.min(100, Math.round(panelHeightDrag.startHeight + (panelHeightDrag.startY - event.clientY) * 100 / panelHeightDrag.viewportHeight)));
            applyForecastDrawerHeightLimit();
            scheduleCenterForLayoutChange();
            const input = forecastDrawer?.querySelector<HTMLInputElement>('[data-forecast-drawer-height]');
            const label = forecastDrawer?.querySelector<HTMLElement>('[data-forecast-drawer-height-value]');
            if (input) input.value = String(forecastDrawerMaxHeightPercent);
            if (label) label.textContent = `${forecastDrawerMaxHeightPercent}%`;
        });
        const finishPanelHeightDrag = (event: PointerEvent) => {
            if (!panelHeightDrag || event.pointerId !== panelHeightDrag.pointerId) return;
            panelHeightDrag = null;
            forecastDrawer?.classList.remove('is-panel-height-dragging');
            scheduleCenterForLayoutChange();
            try { localStorage.setItem('route-builder-drawer-max-height-percent', String(forecastDrawerMaxHeightPercent)); } catch { /* Keep the current session setting. */ }
        };
        forecastDrawer.addEventListener('pointerup', finishPanelHeightDrag);
        forecastDrawer.addEventListener('pointercancel', finishPanelHeightDrag);
        let timelineMouseDrag: { scroller: HTMLElement; pointerId: number; startX: number; scrollLeft: number } | null = null;
        forecastDrawer.addEventListener('pointerdown', event => {
            if (event.pointerType !== 'mouse' || event.button !== 0) return;
            const scroller = (event.target as HTMLElement).closest<HTMLElement>('.departure-timebar-scroll');
            if (!scroller) return;
            if (liveRouteActive) { event.preventDefault(); return; }
            event.preventDefault();
            if (departureScrollCommitTimer !== null) { window.clearTimeout(departureScrollCommitTimer); departureScrollCommitTimer = null; }
            timelineMouseDrag = { scroller, pointerId: event.pointerId, startX: event.clientX, scrollLeft: scroller.scrollLeft };
            scroller.setPointerCapture(event.pointerId);
            scroller.classList.add('is-dragging');
        });
        forecastDrawer.addEventListener('pointermove', event => {
            if (!timelineMouseDrag || event.pointerId !== timelineMouseDrag.pointerId) return;
            timelineMouseDrag.scroller.scrollLeft = timelineMouseDrag.scrollLeft - (event.clientX - timelineMouseDrag.startX);
        });
        const finishTimelineMouseDrag = (event: PointerEvent) => {
            if (!timelineMouseDrag || event.pointerId !== timelineMouseDrag.pointerId) return;
            const scroller = timelineMouseDrag.scroller;
            timelineMouseDrag = null;
            scroller.classList.remove('is-dragging');
            scroller.dispatchEvent(new Event('scroll'));
        };
        forecastDrawer.addEventListener('pointerup', finishTimelineMouseDrag);
        forecastDrawer.addEventListener('pointercancel', finishTimelineMouseDrag);
        forecastDrawer.addEventListener('scroll', event => {
            const target = event.target as HTMLElement;
            if (target.matches('.departure-timebar-scroll')) {
                const programmaticScroll = Number(target.dataset.programmaticScroll);
                if (Number.isFinite(programmaticScroll) && Math.abs(target.scrollLeft - programmaticScroll) < 1) {
                    delete target.dataset.programmaticScroll;
                    return;
                }
                delete target.dataset.programmaticScroll;
                if (liveRouteActive) return;
                departureTimelineScrollLeft = target.scrollLeft;
                const departureTimestamp = departureTimestampAtTimelineCenter(target);
                if (departureTimestamp === null) return;
                updateQuickDepartureFields(snapDepartureTimestamp(departureTimestamp, Number(target.dataset.minDeparture), Number(target.dataset.maxDeparture)));
                if (departureScrollCommitTimer !== null) window.clearTimeout(departureScrollCommitTimer);
                departureScrollCommitTimer = window.setTimeout(() => {
                    if (liveRouteActive) { departureScrollCommitTimer = null; return; }
                    if (timelineMouseDrag?.scroller === target) { departureScrollCommitTimer = null; return; }
                    const settledTimestamp = departureTimestampAtTimelineCenter(target);
                    if (settledTimestamp !== null) {
                        const minDeparture = Number(target.dataset.minDeparture);
                        const maxDeparture = Number(target.dataset.maxDeparture);
                        const snappedTimestamp = snapDepartureTimestamp(settledTimestamp, minDeparture, maxDeparture);
                        const timelineStart = Number(target.dataset.timelineStart);
                        const pixelsPerHour = Number(target.dataset.pixelsPerHour);
                        const leftPad = Number(target.dataset.timebarLeftPad);
                        const desiredScroll = leftPad + (snappedTimestamp - timelineStart) / 3600000 * pixelsPerHour - target.clientWidth / 2;
                        const minScroll = Math.max(0, leftPad + (minDeparture - timelineStart) / 3600000 * pixelsPerHour - target.clientWidth / 2);
                        const maxScroll = Math.max(minScroll, leftPad + (maxDeparture - timelineStart) / 3600000 * pixelsPerHour - target.clientWidth / 2);
                        const snappedScroll = Math.max(minScroll, Math.min(maxScroll, desiredScroll));
                        if (Math.abs(snappedScroll - target.scrollLeft) > 0.1) target.scrollLeft = snappedScroll;
                        if (toLocalDateTimeInput(new Date(snappedTimestamp)) !== departureDateTime) selectDepartureTime(snappedTimestamp);
                    }
                    departureScrollCommitTimer = null;
                }, 1000);
            }
        }, true);
        forecastDrawer.addEventListener('pointerdown', event => {
            const handle = (event.target as HTMLElement).closest<HTMLElement>('[data-resize-column]');
            const table = handle?.closest<HTMLTableElement>('.forecast-table');
            if (!handle || !table || Number(handle.dataset.resizeColumn) !== 0) return;
            const index = Number(handle.dataset.resizeColumn);
            const column = table.querySelector<HTMLTableColElement>(`colgroup col[data-forecast-col="${index}"]`);
            if (!column) return;
            event.preventDefault();
            forecastColumnResize = { table, index, startX: event.clientX, startWidth: Number.parseFloat(column.style.width) || column.getBoundingClientRect().width };
            handle.setPointerCapture?.(event.pointerId);
            document.body.classList.add('forecast-column-resizing');
        });
        forecastDrawer.addEventListener('pointerdown', event => {
            const pointerEvent = event as PointerEvent;
            const labelHandle = (pointerEvent.target as HTMLElement).closest<HTMLElement>('.label-sort-handle');
            if (labelHandle) {
                const row = labelHandle.closest<HTMLElement>('.label-field-row');
                const field = row?.dataset.labelField;
                const group = row?.dataset.labelGroup as 'waypoint' | 'segment' | undefined;
                if (!field || !group) return;
                pointerEvent.preventDefault();
                pointerLabelDrag = { field, group, pointerId: pointerEvent.pointerId, handle: labelHandle };
                row.classList.add('is-label-dragging');
                labelHandle.setPointerCapture?.(pointerEvent.pointerId);
                return;
            }
            if (pointerEvent.pointerType === 'mouse') return;
            const handle = (pointerEvent.target as HTMLElement).closest<HTMLElement>('.forecast-field-drag');
            const row = handle?.closest<HTMLElement>('[data-route-field-row]');
            const field = row?.dataset.routeFieldRow as WindowConditionKey | undefined;
            if (!handle || !row || !field) return;
            pointerEvent.preventDefault();
            pointerFieldDrag = { field, pointerId: pointerEvent.pointerId, handle };
            draggedRouteField = field;
            row.classList.add('is-dragging');
            handle.setPointerCapture?.(pointerEvent.pointerId);
        });
        window.addEventListener('pointermove', event => {
            if (pointerLabelDrag && event.pointerId === pointerLabelDrag.pointerId) {
                forecastDrawer?.querySelectorAll<HTMLElement>('.label-field-row.is-drop-target').forEach(row => row.classList.remove('is-drop-target'));
                const targetRow = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('.label-field-row');
                if (targetRow?.dataset.labelGroup === pointerLabelDrag.group && targetRow.dataset.labelField !== pointerLabelDrag.field) targetRow.classList.add('is-drop-target');
                event.preventDefault();
                return;
            }
            if (pointerFieldDrag && event.pointerId === pointerFieldDrag.pointerId) {
                const rowSelector = '[data-route-field-row]';
                forecastDrawer?.querySelectorAll<HTMLElement>('.is-drop-target').forEach(row => row.classList.remove('is-drop-target'));
                const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>(rowSelector);
                if (target && target !== pointerFieldDrag.handle.closest(rowSelector)) target.classList.add('is-drop-target');
                event.preventDefault();
                return;
            }
            if (!forecastColumnResize) return;
            const { table, index, startX, startWidth } = forecastColumnResize;
            const isRtl = getComputedStyle(table).direction === 'rtl';
            const delta = (event.clientX - startX) * (isRtl ? -1 : 1);
            const isRouteSummary = index > 0 && index < 4;
            const width = Math.max(isRouteSummary ? 42 : 36, Math.min(420, startWidth + delta));
            setForecastColumnWidth(table, index, width);
            applyForecastColumnWidths();
        });
        const finishForecastColumnResize = () => {
            if (!forecastColumnResize) return;
            saveForecastColumnWidths(forecastColumnResize.table);
            forecastColumnResize = null;
            document.body.classList.remove('forecast-column-resizing');
        };
        window.addEventListener('pointerup', finishForecastColumnResize);
        window.addEventListener('pointercancel', finishForecastColumnResize);
        window.addEventListener('pointerup', event => {
            const labelDrag = pointerLabelDrag;
            if (labelDrag && event.pointerId === labelDrag.pointerId) {
                const hit = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null;
                const targetRow = hit?.closest<HTMLElement>('.label-field-row') || null;
                const targetField = targetRow?.dataset.labelField;
                targetRow?.classList.remove('is-drop-target');
                labelDrag.handle.closest<HTMLElement>('.label-field-row')?.classList.remove('is-label-dragging');
                forecastDrawer?.querySelectorAll<HTMLElement>('.label-field-row.is-drop-target').forEach(row => row.classList.remove('is-drop-target'));
                pointerLabelDrag = null;
                if (!targetRow || targetRow.dataset.labelGroup !== labelDrag.group || !targetField || targetField === labelDrag.field) return;
                const order = labelDrag.group === 'waypoint' ? [...waypointFieldOrder] : [...segmentFieldOrder];
                const oldIndex = order.indexOf(labelDrag.field);
                const targetIndex = order.indexOf(targetField);
                if (oldIndex < 0 || targetIndex < 0) return;
                order.splice(oldIndex, 1);
                let insertAt = order.indexOf(targetField);
                if (event.clientY > targetRow.getBoundingClientRect().top + targetRow.getBoundingClientRect().height / 2) insertAt += 1;
                order.splice(insertAt, 0, labelDrag.field);
                if (labelDrag.group === 'waypoint') waypointFieldOrder = order;
                else segmentFieldOrder = order;
                applyLabelSettings();
                return;
            }
            const drag = pointerFieldDrag;
            if (!drag || event.pointerId !== drag.pointerId) return;
            const rowSelector = '[data-route-field-row]';
            const targetRow = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>(rowSelector);
            const target = targetRow?.dataset.routeFieldRow as WindowConditionKey | undefined;
            const insertAfter = !!targetRow && event.clientY > targetRow.getBoundingClientRect().top + targetRow.getBoundingClientRect().height / 2;
            forecastDrawer?.querySelectorAll<HTMLElement>('.is-dragging, .is-drop-target').forEach(row => row.classList.remove('is-dragging', 'is-drop-target'));
            pointerFieldDrag = null;
            draggedRouteField = null;
            if (target) reorderForecastField(drag.field, target, insertAfter);
        });
        window.addEventListener('pointercancel', event => {
            if (pointerLabelDrag && event.pointerId === pointerLabelDrag.pointerId) {
                pointerLabelDrag.handle.closest<HTMLElement>('.label-field-row')?.classList.remove('is-label-dragging');
                pointerLabelDrag = null;
                forecastDrawer?.querySelectorAll<HTMLElement>('.label-field-row.is-drop-target').forEach(row => row.classList.remove('is-drop-target'));
            }
            if (!pointerFieldDrag || event.pointerId !== pointerFieldDrag.pointerId) return;
            forecastDrawer?.querySelectorAll<HTMLElement>('.is-dragging, .is-drop-target').forEach(row => row.classList.remove('is-dragging', 'is-drop-target'));
            pointerFieldDrag = null;
            draggedRouteField = null;
        });
        forecastDrawer.addEventListener('keydown', event => {
            const handle = (event.target as HTMLElement).closest<HTMLElement>('[data-resize-column]');
            const table = handle?.closest<HTMLTableElement>('.forecast-table');
            if (!handle || !table || Number(handle.dataset.resizeColumn) !== 0 || !['ArrowLeft', 'ArrowRight'].includes((event as KeyboardEvent).key)) return;
            const keyEvent = event as KeyboardEvent;
            keyEvent.preventDefault();
            const index = Number(handle.dataset.resizeColumn);
            const column = table.querySelector<HTMLTableColElement>(`colgroup col[data-forecast-col="${index}"]`);
            if (!column) return;
            const direction = keyEvent.key === 'ArrowRight' ? 1 : -1;
            const amount = keyEvent.shiftKey ? 24 : 8;
            setForecastColumnWidth(table, index, (Number.parseFloat(column.style.width) || column.getBoundingClientRect().width) + direction * amount);
            applyForecastColumnWidths();
            saveForecastColumnWidths(table);
        });
        forecastDrawer.addEventListener('mousemove', event => {
            const target = (event.target as HTMLElement).closest<HTMLElement>('[data-forecast-index]');
            if (!target) return;
            const index = Number(target.dataset.forecastIndex);
            highlightRouteForecast(index);
            const sample = routeForecast[index];
            if (!sample) return;
            // Touch browsers synthesize mousemove events after taps. Changing
            // Windy's global forecast timestamp from those events forces a
            // full map redraw while a waypoint is selected or removed.
            if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
            const timestamp = sample.eta.getTime();
            if (hoveredForecastTimestamp === timestamp) return;
            if (hoverRestoreTimestamp === null) {
                const currentTimestamp = Number(windyStore.get('timestamp'));
                if (Number.isFinite(currentTimestamp)) hoverRestoreTimestamp = currentTimestamp;
            }
            if (windyStore.set('timestamp', timestamp)) hoveredForecastTimestamp = timestamp;
        });
        forecastDrawer.addEventListener('mouseleave', hideRouteForecastHighlight);
        let tableMouseDrag: { scroller: HTMLElement; pointerId: number; startX: number; scrollLeft: number } | null = null;
        forecastDrawer.addEventListener('pointerdown', event => {
            if (event.pointerType !== 'mouse' || event.button !== 0) return;
            const target = event.target as HTMLElement;
            if (!target.closest('td[data-forecast-index]') || target.closest('button, a, input, select, textarea, [data-resize-column]')) return;
            const scroller = target.closest<HTMLElement>('.forecast-table-scroll');
            if (!scroller) return;
            event.preventDefault();
            tableMouseDrag = { scroller, pointerId: event.pointerId, startX: event.clientX, scrollLeft: scroller.scrollLeft };
            scroller.setPointerCapture(event.pointerId);
            scroller.classList.add('is-table-dragging');
        });
        forecastDrawer.addEventListener('pointermove', event => {
            if (!tableMouseDrag || event.pointerId !== tableMouseDrag.pointerId) return;
            tableMouseDrag.scroller.scrollLeft = tableMouseDrag.scrollLeft - (event.clientX - tableMouseDrag.startX);
        });
        const finishTableMouseDrag = (event: PointerEvent) => {
            if (!tableMouseDrag || event.pointerId !== tableMouseDrag.pointerId) return;
            tableMouseDrag.scroller.classList.remove('is-table-dragging');
            tableMouseDrag = null;
        };
        forecastDrawer.addEventListener('pointerup', finishTableMouseDrag);
        forecastDrawer.addEventListener('pointercancel', finishTableMouseDrag);
        forecastDrawer.addEventListener('dragstart', event => {
            const row = (event.target as HTMLElement).closest<HTMLElement>('[data-route-field-row]');
            const field = row?.dataset.routeFieldRow as WindowConditionKey | undefined;
            if (!row || !field) return;
            draggedRouteField = field;
            event.dataTransfer?.setData('text/plain', field);
            if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
            row.classList.add('is-dragging');
        });
        forecastDrawer.addEventListener('dragover', event => {
            if ((event.target as HTMLElement).closest('[data-route-field-row]')) event.preventDefault();
        });
        forecastDrawer.addEventListener('drop', event => {
            const targetRow = (event.target as HTMLElement).closest<HTMLElement>('[data-route-field-row]');
            const source = draggedRouteField || event.dataTransfer?.getData('text/plain') as WindowConditionKey;
            const target = targetRow?.dataset.routeFieldRow as WindowConditionKey | undefined;
            if (!targetRow || !source || !target || source === target) return;
            event.preventDefault();
            const order = routeFieldOrder.filter(key => key !== source);
            const targetIndex = order.indexOf(target);
            if (targetIndex < 0) return;
            const insertAfter = event.clientY > targetRow.getBoundingClientRect().top + targetRow.getBoundingClientRect().height / 2;
            order.splice(targetIndex + (insertAfter ? 1 : 0), 0, source);
            routeFieldOrder = order;
            saveRouteFieldLayout();
            draggedRouteField = null;
            renderForecastDrawer();
        });
        forecastDrawer.addEventListener('dragend', event => {
            (event.target as HTMLElement).closest('[data-route-field-row]')?.classList.remove('is-dragging');
            draggedRouteField = null;
        });
        let routeSnapshotPress: { slot: number; pointerId: number; startX: number; startY: number; timer: number } | null = null;
        let suppressedRouteSnapshotClick: { slot: number; expiresAt: number } | null = null;
        const cancelRouteSnapshotPress = (pointerId: number) => {
            if (!routeSnapshotPress || routeSnapshotPress.pointerId !== pointerId) return;
            window.clearTimeout(routeSnapshotPress.timer);
            routeSnapshotPress = null;
        };
        forecastDrawer.addEventListener('pointerdown', event => {
            if ((event.pointerType === 'mouse' && event.button !== 0) || !event.isPrimary || routeSnapshotPress) return;
            const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-route-save-load]');
            const slot = Number(button?.dataset.routeSaveLoad);
            if (!button || !Number.isInteger(slot) || slot < 0 || slot >= routeSnapshotKeys.length || routeSnapshotActions[slot] !== 'load') return;
            try { button.setPointerCapture(event.pointerId); } catch { /* Continue without pointer capture when the browser does not support it. */ }
            const press = { slot, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, timer: 0 };
            press.timer = window.setTimeout(() => {
                if (routeSnapshotPress !== press) return;
                if (!button.isConnected) { routeSnapshotPress = null; return; }
                routeSnapshotPress = null;
                suppressedRouteSnapshotClick = { slot, expiresAt: Date.now() + 750 };
                if (!points.length) {
                    try {
                        localStorage.removeItem(routeSnapshotKeys[slot]);
                        routeSnapshotActions[slot] = 'save';
                        forecastMessage = `Ruta ${slot + 1} eliminada del espacio guardado.`;
                    } catch {
                        forecastMessage = 'No se pudo borrar la ruta del almacenamiento del navegador.';
                    }
                    renderForecastDrawer();
                    return;
                }
                saveRouteSnapshot(slot);
            }, 650);
            routeSnapshotPress = press;
        });
        forecastDrawer.addEventListener('pointermove', event => {
            if (!routeSnapshotPress || event.pointerId !== routeSnapshotPress.pointerId) return;
            if (Math.hypot(event.clientX - routeSnapshotPress.startX, event.clientY - routeSnapshotPress.startY) > 12) cancelRouteSnapshotPress(event.pointerId);
        });
        forecastDrawer.addEventListener('pointerup', event => cancelRouteSnapshotPress(event.pointerId));
        forecastDrawer.addEventListener('pointercancel', event => cancelRouteSnapshotPress(event.pointerId));
        forecastDrawer.addEventListener('contextmenu', event => {
            if ((event.target as HTMLElement).closest('[data-route-save-load]')) event.preventDefault();
        });
        forecastDrawer.addEventListener('click', event => {
            const target = event.target as HTMLElement;
            if (target.closest('[data-route-speed-open]')) {
                showSpeedSettings = true;
                renderForecastDrawer();
                requestAnimationFrame(() => forecastDrawer?.querySelector<HTMLInputElement>('[data-route-speed-slider]')?.focus());
                return;
            }
            if (target.matches('[data-route-speed-backdrop]') || target.closest('[data-route-speed-dismiss]')) {
                showSpeedSettings = false;
                renderForecastDrawer();
                requestAnimationFrame(() => forecastDrawer?.querySelector<HTMLButtonElement>('[data-route-speed-open]')?.focus());
                return;
            }
            const groupToggle = target.closest<HTMLButtonElement>('[data-group-toggle]');
            if (groupToggle) {
                const key = groupToggle.dataset.groupToggle as WindowConditionKey;
                collapsedGroups[key] = collapsedGroups[key] === false;
                try { localStorage.setItem('route-builder-model-groups-collapsed', JSON.stringify(collapsedGroups)); } catch {}
                renderForecastDrawer();
                return;
            }
            if (target.closest('[data-wind-models-toggle]')) {
                windModelRowsCollapsed = !windModelRowsCollapsed;
                try { localStorage.setItem('route-builder-wind-model-rows-collapsed', String(windModelRowsCollapsed)); } catch { /* Keep the current display state. */ }
                renderForecastDrawer();
                return;
            }
            if (target.closest('.forecast-drawer-close')) {
                closeNavigatorPlugin();
                return;
            }
            if (target.matches('.forecast-settings-backdrop') || target.closest('[data-weather-settings-dismiss]')) {
                showWeatherSettingsMenu = false;
                renderForecastDrawer();
                return;
            }
            if (showWeatherSettingsMenu && !target.closest('.forecast-weather-settings-menu')) {
                showWeatherSettingsMenu = false;
                const backdrop = forecastDrawer?.querySelector<HTMLElement>('.forecast-settings-backdrop');
                const toggle = forecastDrawer?.querySelector<HTMLButtonElement>('[data-weather-settings-toggle]');
                if (backdrop) backdrop.hidden = true;
                toggle?.setAttribute('aria-expanded', 'false');
            }
            if (target.closest('[data-weather-settings-toggle]')) {
                showWeatherSettingsMenu = !showWeatherSettingsMenu;
                renderForecastDrawer();
                return;
            }
            const settingsTabButton = target.closest<HTMLButtonElement>('[data-settings-tab]');
            if (settingsTabButton) {
                settingsTab = settingsTabButton.dataset.settingsTab === 'map' ? 'map' : settingsTabButton.dataset.settingsTab === 'navigation' ? 'navigation' : 'forecast';
                renderForecastDrawer();
                return;
            }
            if (target.closest('[data-route-clear]')) {
                clearRoute();
                return;
            }
            const routeSlotButton = target.closest<HTMLButtonElement>('[data-route-save-load]');
            if (routeSlotButton) {
                const slot = Number(routeSlotButton.dataset.routeSaveLoad);
                if (!Number.isInteger(slot) || slot < 0 || slot >= routeSnapshotKeys.length) return;
                if (suppressedRouteSnapshotClick && suppressedRouteSnapshotClick.expiresAt >= Date.now() && suppressedRouteSnapshotClick.slot === slot) {
                    suppressedRouteSnapshotClick = null;
                    event.preventDefault();
                    return;
                }
                if (suppressedRouteSnapshotClick && suppressedRouteSnapshotClick.expiresAt < Date.now()) suppressedRouteSnapshotClick = null;
                if (routeSnapshotActions[slot] === 'save') saveRouteSnapshot(slot);
                else loadRouteSnapshot(slot);
                return;
            }
            if (target.closest('[data-route-field-add-toggle]')) {
                showRouteFieldPicker = !showRouteFieldPicker;
                selectedRouteFields.clear();
                renderForecastDrawer();
                return;
            }
            if (target.closest('[data-route-field-commit]')) {
                if (!selectedRouteFields.size) return;
                hiddenRouteFields = new Set(hiddenRouteFields);
                selectedRouteFields.forEach(field => hiddenRouteFields.delete(field));
                selectedRouteFields.clear();
                showRouteFieldPicker = false;
                saveRouteFieldLayout();
                departureEligibilityDirty = true;
                renderForecastDrawer();
                redrawMapOverlays();
                void calculateDepartureEligibility();
                return;
            }
            const addRouteGroup = target.closest<HTMLButtonElement>('[data-route-field-add-group]');
            if (addRouteGroup) {
                const key = addRouteGroup.dataset.routeFieldAddGroup as WindowConditionKey;
                const fields = pickerGroupAvailableFields(key);
                if (!fields.length) return;
                const allSelected = fields.every(field => selectedRouteFields.has(field));
                fields.forEach(field => allSelected ? selectedRouteFields.delete(field) : selectedRouteFields.add(field));
                refreshRoutePickerSelection();
                return;
            }
            const addRouteField = target.closest<HTMLButtonElement>('[data-route-field-add]');
            if (addRouteField) {
                const field = addRouteField.dataset.routeFieldAdd as WindowConditionKey;
                if (!hiddenRouteFields.has(field)) return;
                if (selectedRouteFields.has(field)) selectedRouteFields.delete(field);
                else selectedRouteFields.add(field);
                refreshRoutePickerSelection();
                return;
            }
            const arrivalHourButton = target.closest<HTMLButtonElement>('[data-arrival-hour]');
            const arrivalDayButton = target.closest<HTMLButtonElement>('[data-arrival-day]');
            const arrivalPresetButton = target.closest<HTMLButtonElement>('[data-arrival-day-preset]');
            if ((arrivalHourButton || arrivalDayButton || arrivalPresetButton) && activeWindowCondition === 'arrival') {
                if (arrivalPresetButton) arrivalHours = Array.from({ length: 12 }, (_, index) => index + 6);
                else if (arrivalHourButton) {
                    const hour = Number(arrivalHourButton.dataset.arrivalHour);
                    if (!Number.isInteger(hour) || hour < 0 || hour > 23) return;
                    arrivalHours = arrivalHours.includes(hour) ? arrivalHours.filter(value => value !== hour) : [...arrivalHours, hour];
                } else if (arrivalDayButton) {
                    const day = Number(arrivalDayButton.dataset.arrivalDay);
                    if (!Number.isInteger(day) || day < 0 || day > 6) return;
                    arrivalDays = arrivalDays.includes(day) ? arrivalDays.filter(value => value !== day) : [...arrivalDays, day];
                }
                saveWindowConstraints();
                windowConditionsDirty = true;
                departureEligibilityDirty = true;
                renderForecastDrawer();
                void calculateDepartureEligibility();
                return;
            }
            const sectorButton = target.closest<HTMLButtonElement>('[data-direction-sector]');
            const allDirectionsButton = target.closest<HTMLButtonElement>('[data-direction-all]');
            if ((sectorButton || allDirectionsButton) && activeWindowCondition && hasDirectionWheel(activeWindowCondition)) {
                const key = activeWindowCondition;
                if (allDirectionsButton) directionSelections[key] = directionNames.map((_, index) => index);
                else {
                    const sector = Number(sectorButton!.dataset.directionSector);
                    if (!Number.isInteger(sector) || sector < 0 || sector > 7) return;
                    const selected = selectedDirections(key);
                    directionSelections[key] = selected.includes(sector) ? selected.filter(value => value !== sector) : [...selected, sector];
                }
                saveWindowConstraints();
                windowConditionsDirty = true;
                departureEligibilityDirty = true;
                renderForecastDrawer();
                void calculateDepartureEligibility();
                return;
            }
            const removeRouteField = target.closest<HTMLButtonElement>('[data-route-field-remove]');
            if (removeRouteField) {
                const key = removeRouteField.dataset.routeFieldRemove as WindowConditionKey;
                hiddenRouteFields = new Set(hiddenRouteFields);
                const fieldsToRemove = key === 'windAverage' ? windModelFieldKeys : additionalGroups[key] ? additionalGroups[key]!.fields : [key];
                fieldsToRemove.forEach(field => {
                    if (field === 'arrival') { arrivalHours = []; arrivalDays = []; }
                    delete directionSelections[field];
                    if (field !== 'windAverage') hiddenRouteFields.add(field);
                    if (isSkyField(field)) (windowConstraints[field] as { states: string[] }).states = [];
                    else {
                        (windowConstraints[field] as any).min = '';
                        (windowConstraints[field] as any).max = '';
                    }
                });
                delete directionSelections[key];
                if (key === 'skyAverage') windowConstraints.skyAverage.states = [];
                else if (additionalGroups[key]) { (windowConstraints[key] as NumericBounds).min = ''; (windowConstraints[key] as NumericBounds).max = ''; }
                if (key === 'windAverage') {
                    windowConstraints.windAverage.min = '';
                    windowConstraints.windAverage.max = '';
                }
                saveWindowConstraints();
                windowConditionsDirty = true;
                departureEligibilityDirty = true;
                showRouteFieldPicker = false;
                saveRouteFieldLayout();
                renderForecastDrawer();
                redrawMapOverlays();
                windowConditionsDirty = false;
                void calculateDepartureEligibility();
                return;
            }
            const clearConditionButton = target.closest<HTMLButtonElement>('[data-window-condition-clear]');
            if (clearConditionButton) {
                const key = clearConditionButton.dataset.windowConditionClear as WindowConditionKey;
                delete directionSelections[key];
                if (key === 'arrival') { arrivalHours = []; arrivalDays = []; }
                if (isSkyField(key)) (windowConstraints[key] as { states: string[] }).states = [];
                if (!isSkyField(key)) {
                    (windowConstraints[key] as any).min = '';
                    (windowConstraints[key] as any).max = '';
                }
                saveWindowConstraints();
                forecastDrawer.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-condition-bound]').forEach(input => input.value = '');
                forecastDrawer.querySelector(`[data-window-condition="${key}"]`)?.classList.remove('is-configured');
                updateConditionButtonStatus(key);
                windowConditionsDirty = true;
                departureEligibilityDirty = true;
                activeWindowCondition = null;
                windowConditionsDirty = false;
                renderForecastDrawer();
                void calculateDepartureEligibility();
                return;
            }
            // The backdrop surrounds the whole dialog, so only dismiss when the
            // backdrop itself is clicked or an explicit dismiss button is used.
            if (target.matches('.window-condition-backdrop') || target.closest('button[data-window-condition-dismiss]')) {
                activeWindowCondition = null;
                renderForecastDrawer();
                if (windowConditionsDirty) {
                    windowConditionsDirty = false;
                    void calculateDepartureEligibility();
                }
                return;
            }
            const conditionButton = target.closest<HTMLButtonElement>('[data-window-condition]');
            if (conditionButton) {
                activeWindowCondition = conditionButton.dataset.windowCondition as WindowConditionKey;
                renderForecastDrawer();
                return;
            }
        });
        forecastDrawer.addEventListener('keydown', event => {
            if (event.key !== 'Escape' || !showSpeedSettings) return;
            event.preventDefault();
            showSpeedSettings = false;
            renderForecastDrawer();
        });
        forecastDrawer.addEventListener('input', event => {
            const target = event.target as HTMLElement;
            const speedSlider = target.closest<HTMLInputElement>('[data-route-speed-slider]');
            if (speedSlider) {
                const value = Number(speedSlider.value);
                if (!Number.isFinite(value)) return;
                speedKnots = Math.max(0, Math.min(20, Math.round(value * 10) / 10));
                const formatted = speedKnots.toFixed(1);
                const output = forecastDrawer?.querySelector<HTMLOutputElement>('[data-route-speed-value]');
                const label = forecastDrawer?.querySelector<HTMLElement>('[data-route-speed-label]');
                const button = forecastDrawer?.querySelector<HTMLButtonElement>('[data-route-speed-open]');
                if (output) output.value = formatted;
                if (label) label.textContent = formatted;
                button?.setAttribute('aria-label', `Velocidad ${formatted} nudos. Toca para modificar`);
                return;
            }
            const drawerHeightInput = target.closest<HTMLInputElement>('[data-forecast-drawer-height]');
            if (drawerHeightInput) {
                forecastDrawerMaxHeightPercent = Number(drawerHeightInput.value);
                applyForecastDrawerHeightLimit();
                scheduleCenterForLayoutChange();
                const value = forecastDrawer?.querySelector<HTMLElement>('[data-forecast-drawer-height-value]');
                if (value) value.textContent = `${forecastDrawerMaxHeightPercent}%`;
                return;
            }
            const conditionSlider = target.closest<HTMLInputElement>('[data-condition-slider]');
            if (conditionSlider) {
                updateConditionRangeSlider(conditionSlider);
                return;
            }
        });
        forecastDrawer.addEventListener('change', event => {
            const target = event.target as HTMLElement;
            const speedSlider = target.closest<HTMLInputElement>('[data-route-speed-slider]');
            if (speedSlider) {
                applyRouteSettings();
                return;
            }
            const indicatorControl = target.closest<HTMLInputElement | HTMLSelectElement>('[data-indicator-common], [data-indicator-individual]');
            if (indicatorControl) {
                const key = indicatorControl.dataset.indicatorCommon || indicatorControl.dataset.indicatorIndividual || '';
                const allowed = ['size', 'height', 'barWidth', 'tipHeight', 'dataLength', 'nameLength', 'distance', 'pointDistance', 'textSize', 'textMargin', 'showDirection', 'showValue', 'windColor', 'waveColor', 'windLetter', 'waveLetter', 'windValue', 'waveValue'];
                if (!allowed.includes(key)) return;
                let value: any = indicatorControl.value;
                if (key === 'showDirection' || key === 'showValue') value = (indicatorControl as HTMLInputElement).checked;
                else if (key === 'size' || key === 'height' || key === 'barWidth' || key === 'tipHeight' || key === 'dataLength' || key === 'nameLength' || key === 'distance' || key === 'pointDistance' || key === 'textSize' || key === 'textMargin') {
                    const n = Number(value);
                    if (!Number.isFinite(n)) return;
                    value = key === 'barWidth' ? Math.max(0.1, n) : key === 'tipHeight' ? Math.max(5, Math.min(100, n)) : key === 'dataLength' ? Math.max(12, Math.min(250, n)) : key === 'nameLength' ? Math.max(12, Math.min(150, n)) : key === 'size' ? Math.max(5, Math.min(80, n)) : key === 'height' ? Math.max(5, Math.min(250, n)) : key === 'pointDistance' ? Math.max(0, n) : key === 'distance' ? Math.max(20, Math.min(200, n)) : key === 'textMargin' ? Math.max(0, Math.min(40, n)) : Math.max(6, Math.min(40, n));
                    indicatorControl.value = String(value);
                } else if (key.endsWith('Letter')) { value = value.replace(/[\r\n]/g, ' '); indicatorControl.value = value; }
                else if (key.endsWith('Color') && !/^#[0-9a-f]{6}$/i.test(value)) return;
                else if (key === 'windValue' && value && !(['windAverage', ...activeWindModelFields()] as string[]).includes(value)) return;
                else if (key === 'waveValue' && value && !(waveIndicatorOptions() as string[]).includes(value)) return;
                (indicatorAppearance as any)[key] = value;
                try { localStorage.setItem('route-builder-indicator-appearance-v1', JSON.stringify(indicatorAppearance)); } catch { /* Keep settings in memory. */ }
                redrawMapOverlays();
                return;
            }
            const windIndicatorSelect = target.closest<HTMLSelectElement>('[data-wind-indicator-field]');
            if (windIndicatorSelect) {
                const field = windIndicatorSelect.value as WindowConditionKey | '';
                windIndicatorField = field && windIndicatorOptions().includes(field) ? field : '';
                windIndicatorUserChoice = true;
                try { localStorage.setItem('route-builder-wind-indicator-field', windIndicatorField); } catch { /* Keep current setting in memory. */ }
                redrawMapOverlays();
                return;
            }
            const waveIndicatorSelect = target.closest<HTMLSelectElement>('[data-wave-indicator-field]');
            if (waveIndicatorSelect) {
                const field = waveIndicatorSelect.value as WindowConditionKey | '';
                waveIndicatorField = field && waveIndicatorOptions().includes(field) ? field : '';
                waveIndicatorUserChoice = true;
                try { localStorage.setItem('route-builder-wave-indicator-field', waveIndicatorField); } catch { /* Keep current setting in memory. */ }
                redrawMapOverlays();
                return;
            }
            const waypointIndicatorToggle = target.closest<HTMLInputElement>('[data-waypoint-indicator-enabled]');
            if (waypointIndicatorToggle) {
                const kind = waypointIndicatorToggle.dataset.waypointIndicatorEnabled;
                if (kind === 'wind') routeWindIndicatorsEnabled = waypointIndicatorToggle.checked;
                else if (kind === 'wave') routeWaveIndicatorsEnabled = waypointIndicatorToggle.checked;
                else return;
                try { localStorage.setItem('route-builder-waypoint-' + kind + '-indicator-enabled', String(waypointIndicatorToggle.checked)); } catch { /* Keep the setting in memory. */ }
                redrawRoutePointIndicators();
                return;
            }
            const waypointIndicatorDistanceInput = target.closest<HTMLInputElement>('[data-waypoint-indicator-distance]');
            if (waypointIndicatorDistanceInput) {
                const value = Number(waypointIndicatorDistanceInput.value);
                if (!Number.isFinite(value)) return;
                const kind = waypointIndicatorDistanceInput.dataset.waypointIndicatorDistance;
                const distance = Math.max(20, Math.min(200, value));
                waypointIndicatorDistanceInput.value = String(distance);
                if (kind === 'wind') routeWindIndicatorDistance = distance;
                else if (kind === 'wave') routeWaveIndicatorDistance = distance;
                else return;
                try { localStorage.setItem('route-builder-waypoint-' + kind + '-indicator-distance', String(distance)); } catch { /* Keep the setting in memory. */ }
                redrawRoutePointIndicators();
                return;
            }
            const waveVisualInput = target.closest<HTMLInputElement>('[data-wave-indicator-setting]');
            if (waveVisualInput) {
                const value = Number(waveVisualInput.value);
                if (!Number.isFinite(value)) return;
                const setting = waveVisualInput.dataset.waveIndicatorSetting;
                if (setting === 'distance') windIndicatorDistance = waveIndicatorDistance = Math.max(20, Math.min(200, value));
                else if (setting === 'size') windIndicatorSize = waveIndicatorSize = Math.max(16, Math.min(80, value));
                else if (setting === 'text-size') windIndicatorTextSize = waveIndicatorTextSize = Math.max(6, Math.min(40, value));
                else return;
                syncIndicatorGeometryControls(setting);
                redrawMapOverlays();
                return;
            }
            const waveDegreesToggle = target.closest<HTMLInputElement>('[data-wave-indicator-degrees]');
            if (waveDegreesToggle) {
                windIndicatorDegreesEnabled = waveIndicatorDegreesEnabled = waveDegreesToggle.checked;
                syncIndicatorDegreesControls();
                redrawMapOverlays();
                return;
            }
            const windVisualInput = target.closest<HTMLInputElement>('[data-wind-indicator-setting]');
            if (windVisualInput) {
                const value = Number(windVisualInput.value);
                if (!Number.isFinite(value)) return;
                const setting = windVisualInput.dataset.windIndicatorSetting;
                if (setting === 'distance') windIndicatorDistance = waveIndicatorDistance = Math.max(20, Math.min(200, value));
                else if (setting === 'size') windIndicatorSize = waveIndicatorSize = Math.max(16, Math.min(80, value));
                else if (setting === 'text-size') windIndicatorTextSize = waveIndicatorTextSize = Math.max(6, Math.min(40, value));
                else return;
                syncIndicatorGeometryControls(setting);
                redrawMapOverlays();
                return;
            }
            const windDegreesToggle = target.closest<HTMLInputElement>('[data-wind-indicator-degrees]');
            if (windDegreesToggle) {
                windIndicatorDegreesEnabled = waveIndicatorDegreesEnabled = windDegreesToggle.checked;
                syncIndicatorDegreesControls();
                redrawMapOverlays();
                return;
            }
            const windRoseToggle = target.closest<HTMLInputElement>('[data-wind-rose-enabled]');
            if (windRoseToggle) {
                windRoseEnabled = windRoseToggle.checked;
                try { localStorage.setItem('route-builder-wind-rose-enabled', String(windRoseEnabled)); } catch { /* Keep the setting in memory. */ }
                redrawWindRose();
                return;
            }
            const headingDegreesToggle = target.closest<HTMLInputElement>('[data-heading-degrees-enabled]');
            if (headingDegreesToggle) {
                headingDegreesEnabled = headingDegreesToggle.checked;
                try { localStorage.setItem('route-builder-heading-degrees-enabled', String(headingDegreesEnabled)); } catch { /* Keep the setting in memory. */ }
                redrawWindRose();
                return;
            }
            const headingDegreesInput = target.closest<HTMLInputElement>('[data-heading-degrees-setting]');
            if (headingDegreesInput) {
                const value = Number(headingDegreesInput.value);
                if (!Number.isFinite(value)) return;
                const setting = headingDegreesInput.dataset.headingDegreesSetting;
                if (setting === 'font-size') headingDegreesFontSize = Math.max(6, Math.min(40, value));
                else if (setting === 'width') headingDegreesWidth = Math.max(30, Math.min(200, value));
                else if (setting === 'height') headingDegreesHeight = Math.max(16, Math.min(100, value));
                else return;
                const actual = setting === 'font-size' ? headingDegreesFontSize : setting === 'width' ? headingDegreesWidth : headingDegreesHeight;
                headingDegreesInput.value = String(actual);
                try { localStorage.setItem(`route-builder-heading-degrees-${setting}`, String(actual)); } catch { /* Keep the setting in memory. */ }
                redrawWindRose();
                return;
            }
            const windRoseModeSelect = target.closest<HTMLSelectElement>('[data-wind-rose-label-mode]');
            if (windRoseModeSelect) {
                windRoseLabelMode = windRoseModeSelect.value === 'degrees' ? 'degrees' : 'cardinal';
                try { localStorage.setItem('route-builder-wind-rose-label-mode', windRoseLabelMode); } catch { /* Keep the setting in memory. */ }
                redrawWindRose();
                return;
            }
            const windRoseInput = target.closest<HTMLInputElement>('[data-wind-rose-setting]');
            if (windRoseInput) {
                const value = Number(windRoseInput.value);
                if (!Number.isFinite(value)) return;
                const setting = windRoseInput.dataset.windRoseSetting;
                if (setting === 'radius') windRoseRadius = Math.max(20, Math.min(200, value));
                else if (setting === 'width') windRoseLineWidth = Math.max(1, Math.min(20, value));
                else if (setting === 'font-size') windRoseFontSize = Math.max(4, Math.min(24, value));
                else if (setting === 'transparency') windRoseTransparency = Math.max(0, Math.min(100, value));
                else return;
                const actual = setting === 'radius' ? windRoseRadius : setting === 'width' ? windRoseLineWidth : setting === 'font-size' ? windRoseFontSize : windRoseTransparency;
                windRoseInput.value = String(actual);
                try { localStorage.setItem(`route-builder-wind-rose-${setting}`, String(actual)); } catch { /* Keep the setting in memory. */ }
                redrawWindRose();
                return;
            }
            const laylineModeSelect = target.closest<HTMLSelectElement>('[data-layline-mode]');
            if (laylineModeSelect) {
                if (['none', 'upwind', 'downwind', 'both', 'automatic'].includes(laylineModeSelect.value)) laylineMode = laylineModeSelect.value as typeof laylineMode;
                try { localStorage.setItem('route-builder-layline-mode', laylineMode); } catch { /* Keep the setting in memory. */ }
                redrawLaylines();
                return;
            }
            const laylineSetting = target.closest<HTMLInputElement>('[data-layline-setting]');
            if (laylineSetting) {
                const setting = laylineSetting.dataset.laylineSetting;
                const value = Number(laylineSetting.value);
                if (!Number.isFinite(value)) return;
                if (setting === 'upwind-angle') upwindLaylineAngle = Math.max(0, Math.min(90, value));
                else if (setting === 'downwind-angle') downwindLaylineAngle = Math.max(90, Math.min(180, value));
                else return;
                laylineSetting.value = String(setting === 'upwind-angle' ? upwindLaylineAngle : downwindLaylineAngle);
                try { localStorage.setItem(`route-builder-${setting}`, laylineSetting.value); } catch { /* Keep the setting in memory. */ }
                redrawLaylines();
                return;
            }
            const laylineColorInput = target.closest<HTMLInputElement>('[data-layline-color]');
            if (laylineColorInput) {
                const setting = laylineColorInput.dataset.laylineColor;
                const color = laylineColorInput.value;
                if (!/^#[\da-f]{6}$/i.test(color)) return;
                if (setting === 'port') portWindLaylineColor = color;
                else if (setting === 'starboard') starboardWindLaylineColor = color;
                else return;
                try { localStorage.setItem(`route-builder-layline-${setting}-color`, color); } catch { /* Keep the selected color for this session. */ }
                redrawLaylines();
                return;
            }
            const drawerHeightInput = target.closest<HTMLInputElement>('[data-forecast-drawer-height]');
            if (drawerHeightInput) {
                forecastDrawerMaxHeightPercent = Math.max(0, Math.min(100, Number(drawerHeightInput.value)));
                try { localStorage.setItem('route-builder-drawer-max-height-percent', String(forecastDrawerMaxHeightPercent)); } catch { /* Keep the current session setting. */ }
                applyForecastDrawerHeightLimit();
                scheduleCenterForLayoutChange();
                return;
            }
            const liveSetting = target.closest<HTMLSelectElement>('[data-live-setting]');
            if (liveSetting) {
                const value = Number(liveSetting.value);
                const name = liveSetting.dataset.liveSetting;
                if (name === 'speed' && liveSpeedOptions.includes(value)) liveSpeedSeconds = value;
                else if (name === 'forecast' && liveForecastOptions.includes(value)) liveForecastSeconds = value;
                else if (name === 'waypoints' && liveWaypointOptions.includes(value)) liveWaypointSeconds = value;
                else return;
                try {
                    localStorage.setItem('route-builder-live-speed-seconds', String(liveSpeedSeconds));
                    localStorage.setItem('route-builder-live-forecast-seconds', String(liveForecastSeconds));
                    localStorage.setItem('route-builder-live-waypoint-seconds', String(liveWaypointSeconds));
                } catch { /* Keep current settings in memory. */ }
                restartLiveTimers();
                return;
            }
            const restorePreviousRouteToggle = target.closest<HTMLInputElement>('[data-nav-restore-previous-route]');
            if (restorePreviousRouteToggle) {
                restorePreviousRouteOnNavExit = restorePreviousRouteToggle.checked;
                try { localStorage.setItem('route-builder-restore-previous-route-on-nav-exit', String(restorePreviousRouteOnNavExit)); } catch { /* Keep the setting for this session. */ }
                return;
            }
            const weatherSetting = target.closest<HTMLSelectElement>('[data-weather-setting]');
            if (weatherSetting) {
                const value = Number(weatherSetting.value);
                if (weatherSetting.dataset.weatherSetting === 'sample-interval') routeSampleIntervalHours = value;
                else if (weatherSetting.dataset.weatherSetting === 'search-days') weatherSearchDays = value;
                else if (weatherSetting.dataset.weatherSetting === 'departure-interval') departureIntervalHours = value;
                saveWeatherWindowSettings();
                departureEligibilityDirty = hasConfiguredWindowConditions();
                void calculateRouteForecast();
                return;
            }
            const conditionInput = target.closest<HTMLInputElement | HTMLSelectElement>('[data-condition-bound]');
            if (conditionInput && activeWindowCondition) {
                const bound = conditionInput.dataset.conditionBound as 'min' | 'max';
                const conditionBounds = windowConstraints[activeWindowCondition] as any;
                conditionBounds[bound] = conditionInput.value === '' ? '' : conditionInput instanceof HTMLInputElement && ['number', 'range'].includes(conditionInput.type) ? Number(conditionInput.value) : conditionInput.value;
                if (conditionInput instanceof HTMLInputElement && conditionInput.type === 'range') {
                    const sliderControl = conditionInput.closest('.condition-slider-control');
                    sliderControl?.querySelectorAll<HTMLInputElement>('[data-condition-slider][data-condition-bound]').forEach(slider => {
                        const sliderBound = slider.dataset.conditionBound as 'min' | 'max';
                        conditionBounds[sliderBound] = Number(slider.value);
                    });
                }
                saveWindowConstraints();
                windowConditionsDirty = true;
                departureEligibilityDirty = true;
                updateConditionButtonStatus(activeWindowCondition);
                void calculateDepartureEligibility();
                return;
            }
            const skyStateToggle = target.closest<HTMLInputElement>('[data-sky-state]');
            if (skyStateToggle && activeWindowCondition && isSkyField(activeWindowCondition)) {
                const skyKey = activeWindowCondition;
                (windowConstraints[skyKey] as { states: string[] }).states = [...forecastDrawer.querySelectorAll<HTMLInputElement>('[data-sky-state]:checked')]
                    .map(input => input.dataset.skyState || '').filter(Boolean);
                saveWindowConstraints();
                windowConditionsDirty = true;
                departureEligibilityDirty = true;
                updateConditionButtonStatus(skyKey);
                void calculateDepartureEligibility();
                return;
            }
        });
        forecastReopenButton = document.createElement('button');
        forecastReopenButton.type = 'button';
        forecastReopenButton.className = 'route-builder-reopen-button';
        forecastReopenButton.textContent = 'Pronóstico de la ruta';
        forecastReopenButton.setAttribute('aria-label', 'Abrir pronóstico de la ruta');
        forecastReopenButton.hidden = true;
        forecastReopenButton.addEventListener('click', () => {
            if (forecastDrawer && !forecastDrawer.hidden && forecastDrawerMaxHeightPercent < 20) {
                forecastDrawerMaxHeightPercent = 50;
                try { localStorage.setItem('route-builder-drawer-max-height-percent', '50'); } catch { /* Current session still uses the restored height. */ }
                applyForecastDrawerHeightLimit();
                renderForecastDrawer();
            } else void calculateRouteForecast();
        });
        document.body.appendChild(forecastReopenButton);
        applyForecastDrawerHeightLimit();
        document.body.classList.add('route-builder-fullscreen');
        activeWindowCondition = null;
        window.addEventListener('resize', positionForecastDrawer);
        window.addEventListener('resize', scheduleCenterForLayoutChange);
        map.on('resize', positionForecastDrawer);
        map.on('resize', scheduleCenterForLayoutChange);
        map.on('resize', redrawGpsCourseLine);
        map.on('move zoomend', redrawMapOverlays);
        map.on('dragstart', stopFollowingOnMapDrag);
        window.addEventListener('mousedown', onMapMouseDown, true);
        window.addEventListener('mousemove', onMapMouseMove, true);
        window.addEventListener('mouseup', onMapMouseUp, true);
        window.addEventListener('click', onMapDomClick, true);
        window.addEventListener('dblclick', onMapDomDoubleClick, true);
        if (points.length > 0) recalculate();
        forecastDrawer.classList.add('is-open');
        forecastDrawer.hidden = false;
        forecastReopenButton.hidden = true;
        requestAnimationFrame(() => {
            map.invalidateSize?.();
            positionForecastDrawer();
        });
        if (points.length >= 2) void calculateRouteForecast();
        else {
            forecastMessage = 'Agrega al menos dos Waypoints para consultar el pronóstico.';
            renderForecastDrawer();
        }
        startPassiveLocation();
    });

    function applyDistanceFont(): void {
        try { localStorage.setItem('route-builder-distance-font', distanceFont); } catch { /* Keep the current selection for this session. */ }
        redrawMap();
    }

    function applyDistanceUnit(): void {
        try { localStorage.setItem('route-builder-distance-unit', distanceUnit); } catch { /* Keep the current selection for this session. */ }
        redrawDistanceLabels();
    }

    function applyLabelSettings(): void {
        try {
            localStorage.setItem('route-builder-show-waypoint-date', String(showWaypointDate));
            localStorage.setItem('route-builder-show-waypoint-hour', String(showWaypointHour));
            waypointDatePosition = waypointFieldPositions['waypoint-date'];
            waypointHourPosition = waypointFieldPositions['waypoint-hour'];
            localStorage.setItem('route-builder-waypoint-date-position', waypointDatePosition);
            localStorage.setItem('route-builder-waypoint-hour-position', waypointHourPosition);
            for (const field of waypointLabelFields.slice(2)) localStorage.setItem(`route-builder-${field}-position`, waypointFieldPositions[field]);
            localStorage.setItem('route-builder-show-waypoint-distance-accumulated', String(showWaypointDistanceAccumulated));
            localStorage.setItem('route-builder-show-waypoint-time-accumulated', String(showWaypointTimeAccumulated));
            localStorage.setItem('route-builder-show-waypoint-distance-remaining', String(showWaypointDistanceRemaining));
            localStorage.setItem('route-builder-show-waypoint-time-remaining', String(showWaypointTimeRemaining));
            localStorage.setItem('route-builder-show-segment-time', String(showSegmentTime));
            localStorage.setItem('route-builder-show-segment-bearing', String(showSegmentBearing));
            localStorage.setItem('route-builder-show-segment-distance', String(showSegmentDistance));
            localStorage.setItem('route-builder-segment-time-position', segmentTimePosition);
            localStorage.setItem('route-builder-segment-bearing-position', segmentBearingPosition);
            localStorage.setItem('route-builder-segment-distance-position', segmentDistancePosition);
            localStorage.setItem('route-builder-waypoint-field-order', JSON.stringify(waypointFieldOrder));
            localStorage.setItem('route-builder-segment-field-order', JSON.stringify(segmentFieldOrder));
        } catch { /* Keep the current settings for this session. */ }
        redrawMap();
    }

    function saveWeatherWindowSettings(): void {
        try {
            localStorage.setItem('route-builder-sample-interval-hours', String(routeSampleIntervalHours));
            localStorage.setItem('route-builder-weather-search-days', String(weatherSearchDays));
            localStorage.setItem('route-builder-departure-interval-hours', String(departureIntervalHours));
        } catch { /* Keep the current settings for this session. */ }
        invalidateForecast();
    }

    function applyForecastDrawerHeightLimit(): void {
        if (!forecastDrawer) return;
        const rawHeight = Number(forecastDrawerMaxHeightPercent);
        const height = Number.isFinite(rawHeight) ? Math.max(0, Math.min(100, rawHeight)) : 50;
        forecastDrawer.classList.toggle('is-height-collapsed', height < 20);
        forecastDrawer.style.setProperty('--route-drawer-max-height-vh', `${height}vh`);
        forecastDrawer.style.setProperty('--route-drawer-max-height-dvh', `${height}dvh`);
        if (forecastReopenButton && !forecastDrawer.hidden) {
            forecastReopenButton.hidden = height >= 20;
            forecastReopenButton.textContent = height < 20 ? 'Restablecer panel' : 'Pronóstico de la ruta';
            forecastReopenButton.setAttribute('aria-label', height < 20 ? 'Restablecer panel' : 'Abrir pronóstico de la ruta');
        }
    }

    function renderRouteForecastSettingsControls(extraClass = ''): string {
        const option = (value: number, current: number, label: string) => `<option value="${value}"${value === current ? ' selected' : ''}>${label}</option>`;
        return `<div class="route-forecast-settings${extraClass ? ` ${extraClass}` : ''}"><label>Intervalo de puntos<select data-weather-setting="sample-interval" aria-label="Intervalo temporal de los puntos de pronóstico">${[1, 3, 6, 12].map(value => option(value, routeSampleIntervalHours, `Cada ${value} h`)).join('')}</select></label><label>Ventana de búsqueda<select data-weather-setting="search-days" aria-label="Días de anticipación de búsqueda">${[3, 5, 7, 10, 15].map(value => option(value, weatherSearchDays, `${value} días`)).join('')}</select></label><label>Intervalo de salidas<select data-weather-setting="departure-interval" aria-label="Intervalo entre horas de salida">${[1, 2, 3, 6, 12, 24].map(value => option(value, departureIntervalHours, `Cada ${value} h`)).join('')}</select></label><label class="forecast-drawer-height-setting">Alto máximo del panel <span data-forecast-drawer-height-value>${forecastDrawerMaxHeightPercent}%</span><input type="range" min="0" max="100" step="1" value="${forecastDrawerMaxHeightPercent}" data-forecast-drawer-height aria-label="Alto máximo del panel en porcentaje de pantalla"></label></div>`;
    }

    function escapeIndicatorAttribute(value: string): string {
        return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
    function renderWeatherSettingsMenu(): string {
        const option = (value: number, current: number) => `<option value="${value}"${value === current ? ' selected' : ''}>${value >= 60 ? `${value / 60} min` : `${value} s`}</option>`;
        const windFields = windIndicatorOptions();
        const windOptions = windFields.map(field => `<option value="${field}"${field === windIndicatorField ? ' selected' : ''}>${field === 'directionAverage' ? 'Promedio' : routeFieldPickerLabels[field]}</option>`).join('');
        const waveFields = waveIndicatorOptions();
        const waveOptions = waveFields.map(field => `<option value="${field}"${field === waveIndicatorField ? ' selected' : ''}>${field === 'wavesAverage' || field === 'swell1Average' ? 'Promedio' : routeFieldPickerLabels[field]}</option>`).join('');
        const laylineModes = [['none', 'Ninguno'], ['upwind', 'Solo Upwind'], ['downwind', 'Solo Downwind'], ['both', 'Ambos'], ['automatic', 'Automático']] as const;
        const windValueFields = activeWindModelFields();
        const windValueOptions: WindowConditionKey[] = windValueFields.length > 1 ? ['windAverage', ...windValueFields] : windValueFields;
        const valueOptions = (fields: WindowConditionKey[], selected: string) => fields.map(field => `<option value="${field}"${field === selected ? ' selected' : ''}>${field === 'windAverage' || field === 'wavesAverage' || field === 'swell1Average' ? 'Promedio' : routeFieldPickerLabels[field]}</option>`).join('');
        const commonIndicatorSettings = `<details class="navigation-visual-group"><summary>Formato de indicadores</summary><div class="navigation-visual-group-body"><label>Distancia al barco (px)<input type="number" min="20" max="200" step="1" data-indicator-common="distance" value="${indicatorAppearance.distance}"></label><label>Distancia al punto (px)<input type="number" min="0" step="1" data-indicator-common="pointDistance" value="${indicatorAppearance.pointDistance}"></label><label>Alto del triángulo (px)<input type="number" min="5" max="100" step="1" data-indicator-common="tipHeight" value="${indicatorAppearance.tipHeight}"></label><label>Ancho del campo de datos (px)<input type="number" min="0.1" step="0.1" data-indicator-common="barWidth" value="${indicatorAppearance.barWidth}"></label><label>Largo del campo de datos (px)<input type="number" min="12" max="250" step="1" data-indicator-common="dataLength" value="${indicatorAppearance.dataLength}"></label><label>Largo del campo de nombre (px)<input type="number" min="12" max="150" step="1" data-indicator-common="nameLength" value="${indicatorAppearance.nameLength}"></label><label>Margen del texto (px)<input type="number" min="0" max="40" step="0.5" data-indicator-common="textMargin" value="${indicatorAppearance.textMargin}"></label><label>Tamaño máximo de texto (px)<input type="number" min="6" max="40" step="1" data-indicator-common="textSize" value="${indicatorAppearance.textSize}"></label><label>Mostrar dirección<input type="checkbox" data-indicator-common="showDirection"${indicatorAppearance.showDirection ? ' checked' : ''}></label><label>Mostrar valor<input type="checkbox" data-indicator-common="showValue"${indicatorAppearance.showValue ? ' checked' : ''}></label></div></details>`;
        const windIndicatorSettings = `<details class="navigation-visual-group" data-visual-group="wind"${windIndicatorSettingsOpen ? ' open' : ''}><summary>Indicador de viento</summary><div class="navigation-visual-group-body"><label>Fuente de dirección<select data-wind-indicator-field><option value="">Ninguno</option>${windOptions}</select></label><label>Fuente de valor<select data-indicator-individual="windValue"><option value="">Ninguno</option>${valueOptions(windValueOptions, indicatorAppearance.windValue)}</select></label><label>Color<input type="color" data-indicator-individual="windColor" value="${indicatorAppearance.windColor}"></label><label>Nombre<input type="text" data-indicator-individual="windLetter" value="${escapeIndicatorAttribute(indicatorAppearance.windLetter)}"></label><label>Mostrar en cada punto de ruta<input type="checkbox" data-waypoint-indicator-enabled="wind"${routeWindIndicatorsEnabled ? ' checked' : ''}></label></div></details>`;
        const waveIndicatorSettings = `<details class="navigation-visual-group" data-visual-group="wave"${waveIndicatorSettingsOpen ? ' open' : ''}><summary>Indicador de olas</summary><div class="navigation-visual-group-body"><label>Fuente de dirección<select data-wave-indicator-field><option value="">Ninguno</option>${waveOptions}</select></label><label>Fuente de valor<select data-indicator-individual="waveValue"><option value="">Ninguno</option>${valueOptions(waveFields, indicatorAppearance.waveValue)}</select></label><label>Color<input type="color" data-indicator-individual="waveColor" value="${indicatorAppearance.waveColor}"></label><label>Nombre<input type="text" data-indicator-individual="waveLetter" value="${escapeIndicatorAttribute(indicatorAppearance.waveLetter)}"></label><label>Mostrar en cada punto de ruta<input type="checkbox" data-waypoint-indicator-enabled="wave"${routeWaveIndicatorsEnabled ? ' checked' : ''}></label></div></details>`;
        const laylinesSettings = `<details class="navigation-visual-group" data-visual-group="laylines"${laylinesSettingsOpen ? ' open' : ''}><summary>Laylines</summary><div class="navigation-visual-group-body"><label>Modo<select data-layline-mode>${laylineModes.map(([value, label]) => `<option value="${value}"${value === laylineMode ? ' selected' : ''}>${label}</option>`).join('')}</select></label><label>Ángulo Upwind (0–90°)<input type="number" min="0" max="90" step="1" value="${upwindLaylineAngle}" data-layline-setting="upwind-angle"></label><label>Ángulo Downwind (90–180°)<input type="number" min="90" max="180" step="1" value="${downwindLaylineAngle}" data-layline-setting="downwind-angle"></label><label>Color babor del viento<input type="color" data-layline-color="port" value="${portWindLaylineColor}" aria-label="Color de las laylines por babor del viento"></label><label>Color estribor del viento<input type="color" data-layline-color="starboard" value="${starboardWindLaylineColor}" aria-label="Color de las laylines por estribor del viento"></label><small>Los ángulos se miden respecto a la dirección de donde viene el viento. Automático compara el viento seleccionado con el rumbo GPS del barco.</small></div></details>`;
        const windRoseSettings = `<details class="navigation-visual-group" data-visual-group="rose"${windRoseSettingsOpen ? ' open' : ''}><summary>Rosa de los vientos</summary><div class="navigation-visual-group-body"><label class="wind-rose-toggle">Mostrar rosa<input type="checkbox" data-wind-rose-enabled${windRoseEnabled ? ' checked' : ''}></label><label>Radio del círculo (px)<input type="number" min="20" max="200" step="1" value="${windRoseRadius}" data-wind-rose-setting="radius"></label><label>Ancho (px)<input type="number" min="1" max="20" step="1" value="${windRoseLineWidth}" data-wind-rose-setting="width" title="Grosor de las líneas de la rosa"></label><label>Tamaño de fuente (px)<input type="number" min="4" max="24" step="1" value="${windRoseFontSize}" data-wind-rose-setting="font-size"></label><label>Transparencia (%)<input type="number" min="0" max="100" step="1" value="${windRoseTransparency}" data-wind-rose-setting="transparency"></label><label>Etiquetas<select data-wind-rose-label-mode><option value="cardinal"${windRoseLabelMode === 'cardinal' ? ' selected' : ''}>Signos cardinales</option><option value="degrees"${windRoseLabelMode === 'degrees' ? ' selected' : ''}>Grados</option></select></label><hr><strong>Indicador de grados del heading</strong><label class="wind-rose-toggle">Mostrar grados<input type="checkbox" data-heading-degrees-enabled${headingDegreesEnabled ? ' checked' : ''}></label><label>Tamaño de letra (px)<input type="number" min="6" max="40" step="1" value="${headingDegreesFontSize}" data-heading-degrees-setting="font-size"></label><label>Ancho (px)<input type="number" min="30" max="200" step="1" value="${headingDegreesWidth}" data-heading-degrees-setting="width"></label><label>Alto (px)<input type="number" min="16" max="100" step="1" value="${headingDegreesHeight}" data-heading-degrees-setting="height"></label></div></details>`;
        const navigationSettings = `<div class="route-forecast-settings"><strong>Ubicación</strong><label>Fuente de ubicación<select aria-label="Fuente de ubicación"><option selected>Automática (alta precisión)</option><option disabled>Solo GPS (solo en la App de celular)</option></select></label><small>La ubicación es proporcionada por el celular o el navegador.</small><strong>En vivo</strong><label>Promedio de velocidad<select data-live-setting="speed">${liveSpeedOptions.map(value => option(value, liveSpeedSeconds)).join('')}</select></label><label>Actualizar pronóstico<select data-live-setting="forecast">${liveForecastOptions.map(value => option(value, liveForecastSeconds)).join('')}</select></label><label>Refrescar waypoints<select data-live-setting="waypoints">${liveWaypointOptions.map(value => option(value, liveWaypointSeconds)).join('')}</select></label><label class="nav-restore-route-setting">Cargar ruta anterior al salir del modo NAV<input type="checkbox" data-nav-restore-previous-route${restorePreviousRouteOnNavExit ? ' checked' : ''}></label><small>Apagado: conserva la ruta que estabas navegando.</small><details class="navigation-visual-aids"${visualAidsOpen ? ' open' : ''}><summary>Ayudas visuales</summary><div class="navigation-visual-aids-list">${commonIndicatorSettings}${windIndicatorSettings}${waveIndicatorSettings}${laylinesSettings}${windRoseSettings}</div></details></div>`;
        const settingsContent = settingsTab === 'forecast'
            ? renderRouteForecastSettingsControls('route-forecast-settings')
            : settingsTab === 'navigation' ? navigationSettings : '<div class="forecast-settings-map-tab"></div>';
        return `<div class="forecast-weather-settings-menu"><button type="button" class="forecast-settings-toggle" data-weather-settings-toggle aria-expanded="${showWeatherSettingsMenu}" aria-label="Ajustes, versión ${version}" title="Ajustes">⚙ Ajustes<small class="forecast-version">v${version}</small></button><div class="forecast-settings-backdrop"${showWeatherSettingsMenu ? '' : ' hidden'}><section class="forecast-settings-dialog" role="dialog" aria-modal="true" aria-label="Ajustes"><header><strong>Ajustes</strong><button type="button" data-weather-settings-dismiss aria-label="Cerrar ajustes">×</button></header><nav class="forecast-settings-tabs" aria-label="Secciones de ajustes"><button type="button" data-settings-tab="forecast" aria-pressed="${settingsTab === 'forecast'}">Pronóstico</button><button type="button" data-settings-tab="navigation" aria-pressed="${settingsTab === 'navigation'}">Navegación</button><button type="button" data-settings-tab="map" aria-pressed="${settingsTab === 'map'}">Datos en el mapa</button></nav>${settingsContent}</section></div></div>`;
    }

    function interpolatePoint(a: Waypoint, b: Waypoint, fraction: number): Waypoint {
        const rad = (degrees: number) => degrees * Math.PI / 180;
        const lat1 = rad(a.lat), lon1 = rad(a.lon), lat2 = rad(b.lat), lon2 = rad(b.lon);
        const delta = 2 * Math.asin(Math.sqrt(Math.sin((lat2 - lat1) / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2));
        if (delta < 1e-8) return { id: 0, lat: a.lat, lon: a.lon };
        const left = Math.sin((1 - fraction) * delta) / Math.sin(delta);
        const right = Math.sin(fraction * delta) / Math.sin(delta);
        const x = left * Math.cos(lat1) * Math.cos(lon1) + right * Math.cos(lat2) * Math.cos(lon2);
        const y = left * Math.cos(lat1) * Math.sin(lon1) + right * Math.cos(lat2) * Math.sin(lon2);
        const z = left * Math.sin(lat1) + right * Math.sin(lat2);
        return { id: 0, lat: Math.atan2(z, Math.sqrt(x * x + y * y)) * 180 / Math.PI, lon: Math.atan2(y, x) * 180 / Math.PI };
    }

    function buildRouteForecastSamples(departureInput: string | Date = departureDateTime): RouteForecastSample[] {
        if (points.length < 2) return [];
        const departure = departureInput instanceof Date ? departureInput : new Date(departureInput);
        if (!Number.isFinite(departure.getTime())) return [];
        const cumulative = [0];
        for (let i = 1; i < points.length; i++) cumulative.push(cumulative[i - 1] + haversineNm(points[i - 1], points[i]));
        const totalDistance = cumulative[cumulative.length - 1];
        const speed = Math.max(0.1, speedKnots);
        const totalHours = totalDistance / speed;
        const intervalHours = Math.max(1, Number(routeSampleIntervalHours) || 3);
        const maxRegularIntervals = 119;
        const effectiveInterval = Math.max(intervalHours, totalHours / maxRegularIntervals);
        const intervalCount = Math.floor(totalHours / effectiveInterval + 1e-9);
        const distances = Array.from({ length: intervalCount + 1 }, (_, index) => Math.min(totalDistance, index * effectiveInterval * speed));
        if (distances[distances.length - 1] < totalDistance - 0.01) distances.push(totalDistance);
        return distances.map(distanceNm => {
            let segmentIndex = cumulative.findIndex((distance, index) => index > 0 && distance >= distanceNm);
            if (distanceNm <= 0) segmentIndex = 1;
            if (segmentIndex < 1) segmentIndex = points.length - 1;
            const startDistance = cumulative[segmentIndex - 1];
            const segmentDistance = Math.max(0.0001, cumulative[segmentIndex] - startDistance);
            const position = interpolatePoint(points[segmentIndex - 1], points[segmentIndex], Math.max(0, Math.min(1, (distanceNm - startDistance) / segmentDistance)));
            return {
                lat: position.lat, lon: position.lon, distanceNm,
                eta: new Date(departure.getTime() + distanceNm / speed * 3600000),
            };
        });
    }

    function forecastNumber(source: any, key: string, index: number): number | null {
        const raw = source?.[key]?.[index];
        if (raw === null || raw === undefined || raw === '') return null;
        const value = Number(raw);
        return Number.isFinite(value) ? value : null;
    }

    function forecastDirectionValue(source: any, key: string, target: number, fallbackIndex: number): number | null {
        if (!source) return null;
        const interpolated = interpolateForecastDirection(source.ts, source[key], target);
        return interpolated !== null ? interpolated : forecastNumber(source, key, fallbackIndex);
    }

    function forecastDirectionFirstValue(source: any, keys: string[], target: number, fallbackIndex: number): number | null {
        if (!source) return null;
        for (const key of keys) {
            if (!Array.isArray(source[key])) continue;
            const interpolated = interpolateForecastDirection(source.ts, source[key], target);
            if (interpolated !== null) return interpolated;
            const fallback = forecastNumber(source, key, fallbackIndex);
            if (fallback !== null) return fallback;
        }
        return null;
    }

    function forecastFirstNumber(source: any, keys: string[], index: number): number | null {
        for (const key of keys) {
            const value = forecastNumber(source, key, index);
            if (value !== null) return value;
        }
        return null;
    }

    function extraForecastValues(sources: Record<string, { data: any; index: number }>): Record<string, number | null> {
        const result: Record<string, number | null> = {};
        const specs: Record<string, { input: string; scale: number; offset: number }> = {
            Temperature: { input: 'temperature', scale: 1, offset: -273.15 },
            Feels: { input: 'feelTemperature', scale: 1, offset: -273.15 },
            Rain: { input: 'precipAmount', scale: 1 / 25.4, offset: 0 },
            Gust: { input: 'windGust', scale: 1.94384, offset: 0 },
        };
        for (const [model, source] of Object.entries(sources)) for (const [name, spec] of Object.entries(specs)) {
            const raw = source.index < 0 ? null : forecastNumber(source.data, spec.input, source.index);
            result[model === 'gfs' && name === 'Feels' ? 'feels' : model + name] = raw === null ? null : raw * spec.scale + spec.offset;
        }
        for (const [model, source] of Object.entries(sources)) {
            result[model + 'Sky'] = source.index < 0 ? null : forecastNumber(source.data, 'icon', source.index);
            const meteo = source.data?.__meteogram;
            const time = source.index < 0 ? null : source.data?.ts?.[source.index];
            const target = typeof time === 'number' ? (time < 1e12 ? time * 1000 : time) : NaN;
            const index = meteo ? coveredForecastIndex(meteo.ts, target) : -1;
            const raw = index < 0 ? null : forecastNumber(meteo, 'dewPoint', index);
            result[model + 'Dew'] = raw === null ? null : raw - 273.15;
        }
        return result;
    }

    function skyStateForModel(key: WindowConditionKey, values?: Record<string, any>): string | null {
        const model = key === 'clouds' ? 'gfs' : key.replace(/Sky$/, '');
        const code = values?.[model + 'Sky'];
        if (typeof code !== 'number' || !Number.isFinite(code)) return null;
        const n = Math.round(code);
        if ([14, 15, 16, 21, 23, 24].includes(n)) return 'thunderstorm';
        if ([8, 9, 10, 11, 12, 13].includes(n)) return 'snow';
        if ([17, 22].includes(n)) return 'fog';
        if ([5, 6, 7, 18, 19, 20].includes(n)) {
            const inches = values?.[model === 'gfs' ? 'rain' : model + 'Rain'];
            if (typeof inches !== 'number' || !Number.isFinite(inches) || inches <= 0) return 'rain';
            const mm = inches * 25.4;
            return mm <= 0.2 ? 'drizzle' : mm <= 2.5 ? 'light-rain' : mm <= 7.5 ? 'rain' : 'heavy-rain';
        }
        return ({ 1: 'clear', 2: 'partly-cloudy', 3: 'mostly-cloudy', 4: 'overcast' } as Record<number, string>)[n] || null;
    }
    function skyStateForField(key: WindowConditionKey, values?: Record<string, any>): string | null {
        if (key !== 'skyAverage') return skyStateForModel(key, values);
        const members = activeGroupFields(key);
        const states = members.map(member => skyStateForModel(member, values)).filter((state): state is string => state !== null);
        const counts = new Map<string, number>();
        for (const state of states) counts.set(state, (counts.get(state) || 0) + 1);
        const ordered = [...counts.entries()].sort((a, b) => b[1] - a[1]);
        return !ordered.length || ordered.length > 1 && ordered[0][1] === ordered[1][1] ? null : ordered[0][0];
    }
    function skyFieldIcon(key: WindowConditionKey, values?: Record<string, any>): string {
        const state = skyStateForField(key, values);
        if (!state) return '—';
        const member = key === 'skyAverage' ? activeGroupFields(key).find(item => skyStateForModel(item, values) === state) : key;
        const model = member === 'clouds' ? 'gfs' : String(member).replace(/Sky$/, '');
        const code = values?.[model + 'Sky'];
        return typeof code === 'number' ? windyWeatherIcon(code) : '—';
    }
    function forecastSkyState(source: any, index: number): string | null {
        const cloudCover = forecastNumber(source, 'clouds', index);
        const precipitation = forecastFirstNumber(source, ['precipAmount', 'rain'], index);
        const snow = forecastFirstNumber(source, ['precipSnowAmount', 'snowPrecip'], index);
        const convective = forecastFirstNumber(source, ['precipConvectiveAmount', 'convPrecip'], index);
        const fog = forecastFirstNumber(source, ['fog', 'fog-surface'], index);
        const visibility = forecastNumber(source, 'visibility', index);
        if (fog !== null && fog > 0 || visibility !== null && visibility > 0 && visibility < 1000) return 'fog';
        if (snow !== null && snow > 0) return 'snow';
        if (convective !== null && convective >= 0.5) return 'thunderstorm';
        if (precipitation !== null && precipitation > 0) {
            if (precipitation <= 0.2) return 'drizzle';
            if (precipitation <= 2.5) return 'light-rain';
            if (precipitation <= 7.5) return 'rain';
            return 'heavy-rain';
        }
        const category = cloudCategory(cloudCover);
        if (category === null) return null;
        return ['clear', 'partly-cloudy', 'mostly-cloudy', 'overcast'][category];
    }

    function forecastCurrentVector(source: any, index: number, tidal = false): { speedKnots: number | null; direction: number | null } {
        if (index < 0) return { speedKnots: null, direction: null };
        const u = forecastFirstNumber(source, tidal
            ? ['currentsTide_u', 'currentsTideU', 'currents_tide_u', 'seacurrents_tide_u', 'seacurrents_tide_u-surface']
            : ['currents_u', 'currentsU', 'current_u', 'seacurrents_u', 'seacurrents_u-surface', 'u'], index);
        const v = forecastFirstNumber(source, tidal
            ? ['currentsTide_v', 'currentsTideV', 'currents_tide_v', 'seacurrents_tide_v', 'seacurrents_tide_v-surface']
            : ['currents_v', 'currentsV', 'current_v', 'seacurrents_v', 'seacurrents_v-surface', 'v'], index);
        if (u !== null && v !== null) {
            return {
                speedKnots: Math.hypot(u, v) * 1.94384,
                direction: (Math.atan2(u, v) * 180 / Math.PI + 360) % 360,
            };
        }
        const speed = forecastFirstNumber(source, tidal
            ? ['currentsTide', 'currentTide', 'currents_tide']
            : ['currents', 'current', 'currentSpeed', 'currentsSpeed'], index);
        const direction = forecastFirstNumber(source, tidal
            ? ['currentsTideDir', 'currentTideDir', 'currents_tide_dir']
            : ['currentsDir', 'currentDir', 'currents_direction'], index);
        return { speedKnots: speed === null ? null : speed * 1.94384, direction };
    }

    function routeForecastSampleKey(sample: RouteForecastSample): string {
        const days = Math.max(1, Math.min(15, Math.floor(Number(weatherSearchDays) || 7)));
        return `forecast-models-v3:${days}:${sample.distanceNm.toFixed(4)}:${sample.lat.toFixed(5)}:${sample.lon.toFixed(5)}:${sample.eta.getTime()}`;
    }

    async function calculateRouteForecast(): Promise<void> {
        if (points.length < 2) {
            invalidateForecast();
            forecastMessage = 'Agrega al menos dos Waypoints para consultar el pronóstico.';
            if (forecastDrawer) {
                forecastDrawer.classList.add('is-open');
                if (forecastReopenButton) forecastReopenButton.hidden = true;
                renderForecastDrawer();
                positionForecastDrawer();
            }
            return;
        }
        const job = ++forecastJob;
        departureAnalysisBusy = false;
        forecastDrawer?.classList.remove('is-calculating');
        const previousSamples = new Map(routeForecast
            .filter(sample => sample.forecastCachedAt && Date.now() - sample.forecastCachedAt < 30 * 60 * 1000)
            .map(sample => [routeForecastSampleKey(sample), sample] as const));
        const samples = buildRouteForecastSamples();
        const pendingSamples: RouteForecastSample[] = [];
        const pendingRouteIndexes: number[] = [];
        samples.forEach((sample, index) => {
            const previous = previousSamples.get(routeForecastSampleKey(sample));
            if (previous && (previous.values || previous.error)) {
                sample.values = previous.values ? { ...previous.values } : undefined;
                sample.icon = previous.icon;
                sample.error = previous.error;
                sample.seaError = previous.seaError;
                sample.forecastCachedAt = previous.forecastCachedAt;
            } else {
                pendingSamples.push(sample);
                pendingRouteIndexes.push(index);
            }
        });
        routeForecast = samples;
        if (forecastDrawer) forecastDrawer.classList.add('is-open');
        if (forecastReopenButton) forecastReopenButton.hidden = true;
        positionForecastDrawer();
        if (samples.length === 0) { forecastMessage = 'Agrega al menos dos Waypoints para consultar el pronóstico.'; return; }
        const reusedCount = samples.length - pendingSamples.length;
        forecastMessage = pendingSamples.length
            ? `Actualizando ${pendingSamples.length} puntos del pronóstico; se reutilizan ${reusedCount} resultados compatibles…`
            : `Reutilizando los ${reusedCount} pronósticos de la ruta; actualizando sus horas de paso…`;
        forecastBusy = true;
        if (!showWeatherSettingsMenu) renderForecastDrawer();
        requestAnimationFrame(() => positionForecastDrawer());
        try {
            await loadForecastBundles(pendingSamples, job, (pendingIndex, result) => {
                if (job !== forecastJob) return;
                const index = pendingRouteIndexes[pendingIndex];
                const sample = samples[index];
                if (!sample) return;
                if ('error' in result) {
                    sample.error = result.error;
                } else {
                    const { data, seaData, ecmwfData, ecmwfSeaData, currentsData, mblueData, iconData, aromeData, seaError, ecmwfError, ecmwfSeaError, currentsError, mblueError, iconError, aromeError } = result.bundle;
                    const rowIndex = coveredForecastIndex(data.ts, sample.eta.getTime());
                    {
                        sample.forecastCachedAt = Date.now();
                        const numeric = (key: string) => forecastNumber(data, key, rowIndex);
                        const ecmwfIndex = ecmwfData ? coveredForecastIndex(ecmwfData.ts, sample.eta.getTime()) : -1;
                        const ecmwfWind = ecmwfIndex >= 0 ? forecastNumber(ecmwfData, 'wind', ecmwfIndex) : null;
                        const mblueIndex = mblueData ? coveredForecastIndex(mblueData.ts, sample.eta.getTime()) : -1;
                        const iconIndex = iconData ? coveredForecastIndex(iconData.ts, sample.eta.getTime()) : -1;
                        const aromeIndex = aromeData ? coveredForecastIndex(aromeData.ts, sample.eta.getTime()) : -1;
                        const ecmwfSeaIndex = ecmwfSeaData ? coveredForecastIndex(ecmwfSeaData.ts, sample.eta.getTime()) : -1;
                        const ecmwfSeaNumeric = (key: string) => ecmwfSeaIndex >= 0 ? forecastNumber(ecmwfSeaData, key, ecmwfSeaIndex) : null;
                        const currentIndex = currentsData ? coveredForecastIndex(currentsData.ts, sample.eta.getTime()) : -1;
                        const current = forecastCurrentVector(currentsData, currentIndex);
                        const currentTide = forecastCurrentVector(currentsData, currentIndex, true);
                        const modelWindKnots = (source: any, index: number) => { const value = index >= 0 ? forecastNumber(source, 'wind', index) : null; return value === null ? null : value * 1.94384; };
                        const seaIndex = seaData ? coveredForecastIndex(seaData.ts, sample.eta.getTime()) : -1;
                        const seaNumeric = (key: string) => seaIndex >= 0 ? forecastNumber(seaData, key, seaIndex) : null;
                        sample.values = {
                            ...extraForecastValues({ gfs: { data, index: rowIndex }, ecmwf: { data: ecmwfData, index: ecmwfIndex }, mblue: { data: mblueData, index: mblueIndex }, icon: { data: iconData, index: iconIndex }, arome: { data: aromeData, index: aromeIndex } }),
                            temperature: numeric('temperature') === null ? null : (numeric('temperature') as number) - 273.15,
                            rain: numeric('precipAmount') === null ? null : (numeric('precipAmount') as number) / 25.4,
                            wind: numeric('wind') === null ? null : (numeric('wind') as number) * 1.94384,
                            ecmwfWind: ecmwfWind === null ? null : ecmwfWind * 1.94384,
                            mblueWind: modelWindKnots(mblueData, mblueIndex),
                            iconWind: modelWindKnots(iconData, iconIndex),
                            aromeWind: modelWindKnots(aromeData, aromeIndex),
                            ecmwfWindDirection: forecastDirectionValue(ecmwfData, 'windDir', sample.eta.getTime(), ecmwfIndex),
                            mblueWindDirection: forecastDirectionValue(mblueData, 'windDir', sample.eta.getTime(), mblueIndex),
                            iconWindDirection: forecastDirectionValue(iconData, 'windDir', sample.eta.getTime(), iconIndex),
                            aromeWindDirection: forecastDirectionValue(aromeData, 'windDir', sample.eta.getTime(), aromeIndex),
                            gust: numeric('windGust') === null ? null : (numeric('windGust') as number) * 1.94384,
                            direction: forecastDirectionValue(data, 'windDir', sample.eta.getTime(), rowIndex),
                            waves: seaIndex >= 0 ? seaNumeric('waves') : null,
                            wavesDir: forecastDirectionValue(seaData, 'wavesDir', sample.eta.getTime(), seaIndex),
                            swell1: seaIndex >= 0 ? seaNumeric('swell1') : null,
                            swell1Dir: forecastDirectionValue(seaData, 'swell1Dir', sample.eta.getTime(), seaIndex),
                            swell1Period: seaIndex >= 0 ? seaNumeric('swell1Period') : null,
                            swell2: seaIndex >= 0 ? seaNumeric('swell2') : null,
                            swell2Dir: forecastDirectionValue(seaData, 'swell2Dir', sample.eta.getTime(), seaIndex),
                            swell2Period: seaIndex >= 0 ? seaNumeric('swell2Period') : null,
                            windWaves: seaIndex >= 0 ? forecastFirstNumber(seaData, ['windWaves', 'windWavesHeight', 'wwaves', 'wwaves_height', 'wwaves_height-surface', 'windwaves'], seaIndex) : null,
                            windWavesDir: forecastDirectionFirstValue(seaData, ['windWavesDir', 'wwavesDir', 'wwaves_direction', 'wwaves_direction-surface', 'windwavesDir'], sample.eta.getTime(), seaIndex),
                            windWavesPeriod: seaIndex >= 0 ? forecastFirstNumber(seaData, ['windWavesPeriod', 'wwavesPeriod', 'wwaves_period', 'wwaves_period-surface', 'windwavesPeriod'], seaIndex) : null,
                            current: current.speedKnots,
                            currentDir: current.direction,
                            currentTide: currentTide.speedKnots,
                            currentTideDir: currentTide.direction,
                            wavesPeriod: seaIndex >= 0 ? seaNumeric('wavesPeriod') : null,
                            wavesPower: seaIndex >= 0 ? seaNumeric('wavesPower') : null,
                            ecmwfWaves: ecmwfSeaIndex >= 0 ? ecmwfSeaNumeric('waves') : null,
                            ecmwfWavesDir: forecastDirectionValue(ecmwfSeaData, 'wavesDir', sample.eta.getTime(), ecmwfSeaIndex),
                            ecmwfSwell1: ecmwfSeaIndex >= 0 ? ecmwfSeaNumeric('swell1') : null,
                            ecmwfSwell1Dir: forecastDirectionValue(ecmwfSeaData, 'swell1Dir', sample.eta.getTime(), ecmwfSeaIndex),
                            ecmwfSwell1Period: ecmwfSeaIndex >= 0 ? ecmwfSeaNumeric('swell1Period') : null,
                            ecmwfWavesPeriod: ecmwfSeaIndex >= 0 ? ecmwfSeaNumeric('wavesPeriod') : null,
                            ecmwfWavesPower: ecmwfSeaIndex >= 0 ? ecmwfSeaNumeric('wavesPower') : null,
                            clouds: numeric('clouds'),
                            skyState: forecastSkyState(data, rowIndex),
                            convPrecip: numeric('convPrecip'),
                            weatherWarnings: numeric('weatherWarnings'),
                        };
                        sample.icon = data.icon?.[rowIndex];
                        if (sample.values.wind === null) sample.error = 'GFS no devolvió viento para esta ubicación y hora.';
                        if (seaError || seaIndex < 0) sample.seaError = seaError || 'GFS Waves no tiene datos para esta hora y ubicación.';
                        if (ecmwfError || ecmwfSeaError || currentsError || mblueError || iconError || aromeError) sample.diagnostic = [ecmwfError && `ECMWF: ${ecmwfError}`, ecmwfSeaError && `ECMWF Waves: ${ecmwfSeaError}`, currentsError && `CMEMS: ${currentsError}`, mblueError && `mBlue AI: ${mblueError}`, iconError && `ICON: ${iconError}`, aromeError && `AROME Antillas: ${aromeError}`].filter(Boolean).join(' · ');
                    }
                }
                // Keep forecast results in the current sample objects and paint once
                // after the batch. Rebuilding the full forecast table for every point
                // starves Leaflet's pan and zoom handlers on mobile devices.
            });
            if (job !== forecastJob) return;
            const unavailable = samples.filter(sample => sample.error).length;
            const unavailableWaves = samples.filter(sample => sample.seaError).length;
            const unavailableEcmwfWind = samples.filter(sample => !Number.isFinite(sample.values?.ecmwfWind)).length;
            const unavailableEcmwfWaves = samples.filter(sample => !Number.isFinite(sample.values?.ecmwfWaves)).length;
            const unavailableMblue = samples.filter(sample => !Number.isFinite(sample.values?.mblueWind)).length;
            const unavailableIcon = samples.filter(sample => !Number.isFinite(sample.values?.iconWind)).length;
            const unavailableArome = samples.filter(sample => !Number.isFinite(sample.values?.aromeWind)).length;
            const unavailableCurrents = samples.filter(sample => !Number.isFinite(sample.values?.current)).length;
            const forecastHorizonEnd = Date.now() + Math.max(1, Number(weatherSearchDays) || 7) * 86400000;
            const arrivalOutsideForecast = (samples[samples.length - 1]?.eta.getTime() ?? 0) > forecastHorizonEnd;
            const horizonNote = arrivalOutsideForecast
                ? ` La llegada queda fuera de los ${weatherSearchDays} días seleccionados, así que ese tramo puede no tener pronóstico.`
                : '';
            forecastMessage = `${samples.length - unavailable} de ${samples.length} ubicaciones con datos GFS; ${unavailable} sin dato para su hora. Viento ECMWF disponible en ${samples.length - unavailableEcmwfWind}/${samples.length}; olas ECMWF en ${samples.length - unavailableEcmwfWaves}/${samples.length}; mBlue AI ${samples.length - unavailableMblue}/${samples.length}, ICON ${samples.length - unavailableIcon}/${samples.length}, AROME Antillas ${samples.length - unavailableArome}/${samples.length} y corrientes CMEMS ${samples.length - unavailableCurrents}/${samples.length}.${unavailableWaves ? ` Olas sin dato en ${unavailableWaves} ubicaciones.` : ' Olas GFS Waves consultadas.'}${horizonNote}`;
        } finally {
            if (job === forecastJob) {
                forecastBusy = false;
                redrawRoutePointIndicators();
                if (!showWeatherSettingsMenu) renderForecastDrawer();
                // Updating the route forecast invalidates any eligibility run
                // that was in progress (both jobs share the forecast cache
                // generation). Re-evaluate the departure slots after the route
                // data is complete so the timeline cannot be left without dots.
                if (!liveRouteActive && points.length >= 2 && (hasConfiguredWindowConditions() || departureEligibilityDirty || windowConditionsDirty)) {
                    void calculateDepartureEligibility();
                }
            }
        }
    }

    function candidateDepartureTimes(): Date[] {
        const interval = Math.max(1, Number(departureIntervalHours) || 6);
        const now = new Date();
        const day = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const candidates: Date[] = [];
        const horizon = Math.max(1, Number(weatherSearchDays) || 7);
        // The selected horizon is the departure-search window. Do not shorten it
        // by the route duration: that was hiding the final day of departure slots.
        for (let offset = 0; offset <= horizon + 1; offset++) {
            for (let hour = 0; hour < 24; hour += interval) {
                const departure = new Date(day.getFullYear(), day.getMonth(), day.getDate() + offset, hour);
                if (departure.getTime() >= now.getTime() - 30 * 60000) candidates.push(departure);
            }
        }
        const firstDeparture = candidates[0];
        if (!firstDeparture) return [];
        const searchEnd = new Date(firstDeparture);
        searchEnd.setDate(searchEnd.getDate() + horizon);
        return candidates.filter(departure => departure.getTime() < searchEnd.getTime());
    }

    function averageDirection(values: number[]): number | null {
        if (!values.length) return null;
        const radians = values.map(value => value * Math.PI / 180);
        const x = radians.reduce((sum, value) => sum + Math.cos(value), 0);
        const y = radians.reduce((sum, value) => sum + Math.sin(value), 0);
        return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
    }

    function cloudCategory(value: number | null): number | null {
        if (value === null || !Number.isFinite(value)) return null;
        const percent = value <= 1 ? value * 100 : value;
        return percent <= 10 ? 0 : percent <= 35 ? 1 : percent <= 65 ? 2 : 3;
    }

    async function calculateDepartureEligibility(): Promise<void> {
        if (liveRouteActive) return;
        if (points.length < 2) return;
        if (!hasConfiguredWindowConditions()) {
            departureEligibilityDirty = false;
            if (departureAnalysisBusy && !forecastBusy) {
                forecastJob++;
                departureAnalysisBusy = false;
                forecastDrawer?.classList.remove('is-calculating');
            }
            departureEvaluations = [];
            updateForecastStatus('Búsqueda de ventana inactiva: no hay condiciones activas.');
            if (!activeWindowCondition) renderForecastDrawer();
            return;
        }
        if (departureAnalysisBusy) {
            departureEligibilityDirty = true;
            return;
        }
        // A route refresh owns the shared forecast generation. Defer this
        // evaluation until its finally block, which will start it again with
        // the latest conditions and search settings.
        if (forecastBusy) {
            departureEligibilityDirty = true;
            windowConditionsDirty = true;
            return;
        }
        departureEligibilityDirty = true;
        windowConditionsDirty = false;
        const job = ++forecastJob;
        forecastBusy = false;
        departureAnalysisBusy = true;
        forecastDrawer?.classList.add('is-calculating');
        const departures = candidateDepartureTimes();
        const baseDeparture = departures[0] || new Date();
        const baseSamples = buildRouteForecastSamples(baseDeparture);
        if (!baseSamples.length) {
            departureAnalysisBusy = false;
            forecastDrawer?.classList.remove('is-calculating');
            updateForecastStatus('No se pudo iniciar la búsqueda de salidas: no hay ubicaciones de pronóstico en la ruta.');
            if (!activeWindowCondition) renderForecastDrawer();
            return;
        }
        let completedLocations = 0;
        updateForecastStatus(`Buscando la ventana de salida: 0/${baseSamples.length} ubicaciones consultadas; evaluando ${departures.length} horarios…`);
        const dataBySample: any[] = new Array(baseSamples.length);
        await loadForecastBundles(baseSamples, job, (index, result) => {
            dataBySample[index] = 'bundle' in result
                ? { data: result.bundle.data, seaData: result.bundle.seaData, ecmwfData: result.bundle.ecmwfData, ecmwfSeaData: result.bundle.ecmwfSeaData, currentsData: result.bundle.currentsData, mblueData: result.bundle.mblueData, iconData: result.bundle.iconData, aromeData: result.bundle.aromeData }
                : null;
            completedLocations++;
            updateForecastStatus(`Buscando la ventana de salida: ${completedLocations}/${baseSamples.length} ubicaciones consultadas; evaluando ${departures.length} horarios…`);
        });
        if (job !== forecastJob) return;
        const durationHours = points.slice(1).reduce((total, point, index) => total + haversineNm(points[index], point) / Math.max(0.1, speedKnots), 0);
        const conditions = windowConstraints;
        const nextEvaluations: DepartureEvaluation[] = [];
        let lastYieldAt = performance.now();
        let lastProgressUpdateAt = lastYieldAt;
        const yieldToBrowser = () => new Promise<void>(resolve => window.setTimeout(resolve, 0));
        for (let departureIndex = 0; departureIndex < departures.length; departureIndex++) {
            const departure = departures[departureIndex];
            const routeValues: { [key: string]: any; temperature: number | null; rain: number | null; wind: number | null; ecmwfWind: number | null; mblueWind: number | null; iconWind: number | null; aromeWind: number | null; gust: number | null; direction: number | null; ecmwfWindDirection: number | null; mblueWindDirection: number | null; iconWindDirection: number | null; aromeWindDirection: number | null; waves: number | null; swell1: number | null; swell1Period: number | null; swell2: number | null; swell2Period: number | null; windWaves: number | null; windWavesPeriod: number | null; current: number | null; currentTide: number | null; wavesPeriod: number | null; wavesPower: number | null; ecmwfWaves: number | null; ecmwfSwell1: number | null; ecmwfSwell1Period: number | null; ecmwfWavesPeriod: number | null; ecmwfWavesPower: number | null; clouds: number | null; skyState: string | null; icon?: number; hours: number }[] = [];
            let available = true;
            for (let index = 0; index < baseSamples.length; index++) {
                const sample = baseSamples[index];
                const bundle = dataBySample[index];
                const data = bundle?.data;
                if (!data) { available = false; continue; }
                const target = departure.getTime() + sample.distanceNm / Math.max(0.1, speedKnots) * 3600000;
                const rowIndex = coveredForecastIndex(data.ts, target);
                const numeric = (source: any, key: string, at = rowIndex) => Number.isFinite(source?.[key]?.[at]) ? Number(source[key][at]) : null;
                const direction = (source: any, key: string, at: number) => forecastDirectionValue(source, key, target, at);
                const ecmwfIndex = bundle.ecmwfData ? coveredForecastIndex(bundle.ecmwfData.ts, target) : -1;
                const mblueIndex = bundle.mblueData ? coveredForecastIndex(bundle.mblueData.ts, target) : -1;
                const iconIndex = bundle.iconData ? coveredForecastIndex(bundle.iconData.ts, target) : -1;
                const aromeIndex = bundle.aromeData ? coveredForecastIndex(bundle.aromeData.ts, target) : -1;
                const ecmwfSeaIndex = bundle.ecmwfSeaData ? coveredForecastIndex(bundle.ecmwfSeaData.ts, target) : -1;
                const seaIndex = bundle.seaData ? coveredForecastIndex(bundle.seaData.ts, target) : -1;
                const currentIndex = bundle.currentsData ? coveredForecastIndex(bundle.currentsData.ts, target) : -1;
                if ([rowIndex, ecmwfIndex, mblueIndex, iconIndex, aromeIndex, ecmwfSeaIndex, seaIndex, currentIndex].every(index => index < 0)) available = false;
                const current = forecastCurrentVector(bundle.currentsData, currentIndex);
                const currentTide = forecastCurrentVector(bundle.currentsData, currentIndex, true);
                const waves = seaIndex >= 0 ? numeric(bundle.seaData, 'waves', seaIndex) : null;
                const previousDistance = baseSamples[index - 1]?.distanceNm ?? sample.distanceNm;
                const nextDistance = baseSamples[index + 1]?.distanceNm ?? sample.distanceNm;
                const hours = Math.max(0, (nextDistance - previousDistance) / (2 * Math.max(0.1, speedKnots)));
                routeValues.push({
                    ...extraForecastValues({ gfs: { data, index: rowIndex }, ecmwf: { data: bundle.ecmwfData, index: ecmwfIndex }, mblue: { data: bundle.mblueData, index: mblueIndex }, icon: { data: bundle.iconData, index: iconIndex }, arome: { data: bundle.aromeData, index: aromeIndex } }),
                    temperature: numeric(data, 'temperature') === null ? null : (numeric(data, 'temperature') as number) - 273.15,
                    rain: numeric(data, 'precipAmount') === null ? null : (numeric(data, 'precipAmount') as number) / 25.4,
                    wind: numeric(data, 'wind') === null ? null : (numeric(data, 'wind') as number) * 1.94384,
                    ecmwfWind: ecmwfIndex < 0 || numeric(bundle.ecmwfData, 'wind', ecmwfIndex) === null ? null : (numeric(bundle.ecmwfData, 'wind', ecmwfIndex) as number) * 1.94384,
                    mblueWind: mblueIndex < 0 || numeric(bundle.mblueData, 'wind', mblueIndex) === null ? null : (numeric(bundle.mblueData, 'wind', mblueIndex) as number) * 1.94384,
                    iconWind: iconIndex < 0 || numeric(bundle.iconData, 'wind', iconIndex) === null ? null : (numeric(bundle.iconData, 'wind', iconIndex) as number) * 1.94384,
                    aromeWind: aromeIndex < 0 || numeric(bundle.aromeData, 'wind', aromeIndex) === null ? null : (numeric(bundle.aromeData, 'wind', aromeIndex) as number) * 1.94384,
                    gust: numeric(data, 'windGust') === null ? null : (numeric(data, 'windGust') as number) * 1.94384,
                    direction: direction(data, 'windDir', rowIndex), waves,
                    wavesDir: direction(bundle.seaData, 'wavesDir', seaIndex),
                    swell1Dir: direction(bundle.seaData, 'swell1Dir', seaIndex),
                    swell2Dir: direction(bundle.seaData, 'swell2Dir', seaIndex),
                    windWavesDir: forecastDirectionFirstValue(bundle.seaData, ['windWavesDir', 'wwavesDir', 'wwaves_direction', 'wwaves_direction-surface', 'windwavesDir'], target, seaIndex),
                    currentDir: current.direction, currentTideDir: currentTide.direction,
                    ecmwfWavesDir: direction(bundle.ecmwfSeaData, 'wavesDir', ecmwfSeaIndex),
                    ecmwfSwell1Dir: direction(bundle.ecmwfSeaData, 'swell1Dir', ecmwfSeaIndex),
                    ecmwfWindDirection: direction(bundle.ecmwfData, 'windDir', ecmwfIndex),
                    mblueWindDirection: direction(bundle.mblueData, 'windDir', mblueIndex),
                    iconWindDirection: direction(bundle.iconData, 'windDir', iconIndex),
                    aromeWindDirection: direction(bundle.aromeData, 'windDir', aromeIndex),
                    swell1: seaIndex >= 0 ? numeric(bundle.seaData, 'swell1', seaIndex) : null,
                    swell1Period: seaIndex >= 0 ? numeric(bundle.seaData, 'swell1Period', seaIndex) : null,
                    swell2: seaIndex >= 0 ? numeric(bundle.seaData, 'swell2', seaIndex) : null,
                    swell2Period: seaIndex >= 0 ? numeric(bundle.seaData, 'swell2Period', seaIndex) : null,
                    windWaves: seaIndex >= 0 ? forecastFirstNumber(bundle.seaData, ['windWaves', 'windWavesHeight', 'wwaves', 'wwaves_height', 'wwaves_height-surface', 'windwaves'], seaIndex) : null,
                    windWavesPeriod: seaIndex >= 0 ? forecastFirstNumber(bundle.seaData, ['windWavesPeriod', 'wwavesPeriod', 'wwaves_period', 'wwaves_period-surface', 'windwavesPeriod'], seaIndex) : null,
                    current: current.speedKnots,
                    currentTide: currentTide.speedKnots,
                    wavesPeriod: seaIndex >= 0 ? numeric(bundle.seaData, 'wavesPeriod', seaIndex) : null,
                    wavesPower: seaIndex >= 0 ? numeric(bundle.seaData, 'wavesPower', seaIndex) : null,
                    ecmwfWaves: ecmwfSeaIndex >= 0 ? numeric(bundle.ecmwfSeaData, 'waves', ecmwfSeaIndex) : null,
                    ecmwfSwell1: ecmwfSeaIndex >= 0 ? numeric(bundle.ecmwfSeaData, 'swell1', ecmwfSeaIndex) : null,
                    ecmwfSwell1Period: ecmwfSeaIndex >= 0 ? numeric(bundle.ecmwfSeaData, 'swell1Period', ecmwfSeaIndex) : null,
                    ecmwfWavesPeriod: ecmwfSeaIndex >= 0 ? numeric(bundle.ecmwfSeaData, 'wavesPeriod', ecmwfSeaIndex) : null,
                    ecmwfWavesPower: ecmwfSeaIndex >= 0 ? numeric(bundle.ecmwfSeaData, 'wavesPower', ecmwfSeaIndex) : null,
                    clouds: numeric(data, 'clouds'), skyState: forecastSkyState(data, rowIndex), icon: data.icon?.[rowIndex], hours,
                });
                // A single departure can include many route samples. Yield inside
                // that loop too, so long routes never monopolize the map's UI thread.
                if ((index + 1) % 8 === 0 && performance.now() - lastYieldAt >= 8) {
                    const now = performance.now();
                    if (now - lastProgressUpdateAt >= 250) {
                        updateForecastStatus(`Evaluando salida ${departureIndex + 1}/${departures.length}; tramo ${index + 1}/${baseSamples.length}…`);
                        lastProgressUpdateAt = now;
                    }
                    await yieldToBrowser();
                    if (job !== forecastJob) return;
                    lastYieldAt = performance.now();
                }
            }
            const average = (key: 'temperature') => {
                const values = routeValues.map(value => value[key]).filter((value): value is number => value !== null);
                return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
            };
            const windAverages = routeValues.map(value => averageWindForValues(value as any));
            const windAverage = windAverages.length === baseSamples.length && windAverages.every((value): value is number => value !== null)
                ? Math.max(...windAverages) : null;
            const maximum = (key: 'wind' | 'ecmwfWind' | 'mblueWind' | 'iconWind' | 'aromeWind' | 'gust' | 'waves' | 'swell1' | 'swell1Period' | 'swell2' | 'swell2Period' | 'windWaves' | 'windWavesPeriod' | 'current' | 'currentTide' | 'wavesPeriod' | 'wavesPower' | 'ecmwfWaves' | 'ecmwfSwell1' | 'ecmwfSwell1Period' | 'ecmwfWavesPeriod' | 'ecmwfWavesPower') => {
                const values = routeValues.map(value => value[key]).filter((value): value is number => value !== null);
                return values.length ? Math.max(...values) : null;
            };
            const rain = routeValues.some(value => value.rain !== null) ? routeValues.reduce((sum, value) => sum + (value.rain || 0) * value.hours, 0) : null;
            const direction = averageDirection(routeValues.map(value => value.direction).filter((value): value is number => value !== null));
            const ecmwfWindDirection = averageDirection(routeValues.map(value => value.ecmwfWindDirection).filter((value): value is number => value !== null));
            const mblueWindDirection = averageDirection(routeValues.map(value => value.mblueWindDirection).filter((value): value is number => value !== null));
            const iconWindDirection = averageDirection(routeValues.map(value => value.iconWindDirection).filter((value): value is number => value !== null));
            const aromeWindDirection = averageDirection(routeValues.map(value => value.aromeWindDirection).filter((value): value is number => value !== null));
            const clouds = Math.max(-1, ...routeValues.map(value => cloudCategory(value.clouds) ?? -1));
            const cloudMax = clouds < 0 ? null : clouds;
            const skyStates = available && routeValues.every(value => value.skyState !== null)
                ? routeValues.map(value => value.skyState as string) : null;
            const result: DepartureEvaluation = {
                departure, arrival: new Date(departure.getTime() + durationHours * 3600000),
                temperature: average('temperature'), rain, windAverage, wind: maximum('wind'), ecmwfWind: maximum('ecmwfWind'), mblueWind: maximum('mblueWind'), iconWind: maximum('iconWind'), aromeWind: maximum('aromeWind'), gust: maximum('gust'),
                direction, ecmwfWindDirection, mblueWindDirection, iconWindDirection, aromeWindDirection, skyStates,
                waves: maximum('waves'), swell1: maximum('swell1'), swell1Period: maximum('swell1Period'), swell2: maximum('swell2'), swell2Period: maximum('swell2Period'), windWaves: maximum('windWaves'), windWavesPeriod: maximum('windWavesPeriod'), current: maximum('current'), currentTide: maximum('currentTide'), wavesPeriod: maximum('wavesPeriod'), wavesPower: maximum('wavesPower'),
                ecmwfWaves: maximum('ecmwfWaves'), ecmwfSwell1: maximum('ecmwfSwell1'), ecmwfSwell1Period: maximum('ecmwfSwell1Period'), ecmwfWavesPeriod: maximum('ecmwfWavesPeriod'), ecmwfWavesPower: maximum('ecmwfWavesPower'), clouds: cloudMax, icon: routeValues[0]?.icon, available,
                passes: null, hasConstraints: false,
            };
            const checks: boolean[] = [];
            let needsForecastData = false;
            let directionUnknown = false;
            const boundNumber = (value: OptionalBound | string): number | null => value === '' || value === null || value === undefined || !Number.isFinite(Number(value)) ? null : Number(value);
            const checkRange = (value: number | null, bounds: NumericBounds | { min: string; max: string }) => {
                const min = boundNumber(bounds.min), max = boundNumber(bounds.max);
                if (min !== null || max !== null) {
                    needsForecastData = true;
                    checks.push(value !== null && (min === null || value >= min) && (max === null || value <= max));
                }
            };
            for (const key of Object.keys(additionalGroups) as WindowConditionKey[]) {
                if (activeGroupFields(key).length < 2) continue;
                if (['temperatureAverage', 'feelsAverage', 'rainAverage', 'gustAverage', 'dewAverage', 'skyAverage', 'directionAverage'].includes(key)) continue;
                const bounds = conditions[key] as NumericBounds;
                const min = boundNumber(bounds.min), max = boundNumber(bounds.max);
                if (min === null && max === null) continue;
                needsForecastData = true;
                const values = routeValues.map(value => groupValue(key, value));
                const complete = values.length === baseSamples.length && values.every((value): value is number => value !== null);
                const resultValue = complete ? (additionalGroups[key]!.circular ? averageDirection(values as number[]) : Math.max(...values as number[])) : null;
                checks.push(resultValue !== null && (additionalGroups[key]!.circular && min !== null && max !== null && min > max ? resultValue >= min || resultValue <= max : (min === null || resultValue >= min) && (max === null || resultValue <= max)));
            }
            for (const key of [...newModelFields, 'temperatureAverage', 'feelsAverage', 'rainAverage', 'gustAverage', 'dewAverage'] as WindowConditionKey[]) {
                if (!windowConditionConfigured(key)) continue;
                const bounds = conditions[key] as NumericBounds;
                const min = boundNumber(bounds.min), max = boundNumber(bounds.max);
                needsForecastData = true;
                const values = routeValues.map(value => additionalGroups[key] ? groupValue(key, value) : value[key]);
                checks.push(values.length === baseSamples.length && values.every(value => typeof value === 'number' && Number.isFinite(value) && (min === null || value >= min) && (max === null || value <= max)));
            }
            for (const key of windowFieldKeys) {
                if (!hasDirectionWheel(key) || !windowConditionConfigured(key) || !selectedDirections(key).length) continue;
                needsForecastData = true;
                const matches = routeValues.map(value => directionMatches(key, value));
                if (matches.length !== baseSamples.length || matches.some(value => value === null)) directionUnknown = true;
                checks.push(!matches.some(value => value === false));
            }
            checkRange(result.temperature, conditions.temperature);
            checkRange(result.rain, conditions.rain);
            if (activeWindModelFields().length > 1) checkRange(result.windAverage, conditions.windAverage);
            checkRange(result.wind, conditions.wind);
            checkRange(result.ecmwfWind, conditions.ecmwfWind);
            checkRange(result.mblueWind, conditions.mblueWind);
            checkRange(result.iconWind, conditions.iconWind);
            checkRange(result.aromeWind, conditions.aromeWind);
            checkRange(result.gust, conditions.gust);
            checkRange(result.waves, conditions.waves);
            checkRange(result.swell1, conditions.swell1);
            checkRange(result.swell1Period, conditions.swell1Period);
            checkRange(result.swell2, conditions.swell2);
            checkRange(result.swell2Period, conditions.swell2Period);
            checkRange(result.windWaves, conditions.windWaves);
            checkRange(result.windWavesPeriod, conditions.windWavesPeriod);
            checkRange(result.current, conditions.current);
            checkRange(result.currentTide, conditions.currentTide);
            checkRange(result.wavesPeriod, conditions.wavesPeriod);
            checkRange(result.wavesPower, conditions.wavesPower);
            checkRange(result.ecmwfWaves, conditions.ecmwfWaves);
            checkRange(result.ecmwfSwell1, conditions.ecmwfSwell1);
            checkRange(result.ecmwfSwell1Period, conditions.ecmwfSwell1Period);
            checkRange(result.ecmwfWavesPeriod, conditions.ecmwfWavesPeriod);
            checkRange(result.ecmwfWavesPower, conditions.ecmwfWavesPower);
            for (const skyKey of ['clouds', ...skyModelFields, 'skyAverage'] as WindowConditionKey[]) {
                if (!windowConditionConfigured(skyKey)) continue;
                needsForecastData = true;
                const states = routeValues.map(value => skyStateForField(skyKey, value));
                if (states.length !== baseSamples.length || states.some(state => state === null)) directionUnknown = true;
                const allowed = (conditions[skyKey] as { states: string[] }).states;
                checks.push(!states.some(state => state !== null && !allowed.includes(state)));
            }
            if (windowConditionConfigured('arrival')) checks.push(arrivalMatches(result.arrival));
            result.hasConstraints = checks.length > 0;
            result.passes = checks.length ? (checks.some(value => !value) ? false : needsForecastData && (!available || directionUnknown) ? null : true) : null;
            if (result.passes === true) {
                const quality = departureQualityMetrics(routeValues);
                result.qualityMargin = quality?.margin ?? null;
                result.qualityAverage = quality?.average ?? null;
            }
            nextEvaluations.push(result);
            const now = performance.now();
            if (now - lastYieldAt >= 8) {
                if (now - lastProgressUpdateAt >= 250) {
                    updateForecastStatus(`Evaluando salidas: ${departureIndex + 1}/${departures.length} horarios calculados…`);
                    lastProgressUpdateAt = now;
                }
                await yieldToBrowser();
                if (job !== forecastJob) return;
                lastYieldAt = performance.now();
            }
        }
        departureEvaluations = nextEvaluations;
        rankPassingDepartures(departureEvaluations);
        departureAnalysisBusy = false;
        departureEligibilityDirty = false;
        forecastDrawer?.classList.remove('is-calculating');
        const passing = departureEvaluations.filter(item => item.passes === true).length;
        const failing = departureEvaluations.filter(item => item.passes === false).length;
        const unknown = departureEvaluations.length - passing - failing;
        updateForecastStatus(`Ventana evaluada: ${passing}/${departureEvaluations.length} salidas cumplen; ${failing} no cumplen; ${unknown} sin datos suficientes.`);
        if (!activeWindowCondition) renderForecastDrawer();
    }

    function forecastValue(sample: RouteForecastSample, key: string, decimals = 0): string {
        const value = sample.values?.[key];
        if (value === null || value === undefined) return '—';
        const formatted = Number(value).toFixed(decimals);
        return /rain$/i.test(key) && Number(formatted) === 0 ? '' : formatted;
    }

    function windyWeatherIcon(code?: number): string {
        if (code === undefined || !Number.isFinite(code)) return '·';
        const iconCode = Math.round(code);
        return `<img class="forecast-icon" src="https://www.windy.com/img/icons6/png_25@2x/${iconCode}.png" alt="" loading="lazy">`;
    }

    function forecastColorStyle(ident: 'wind' | 'rain', value: number | null | undefined, factor: number): string {
        if (value === null || value === undefined || !Number.isFinite(value)) return '';
        return colors[ident]?.color(value * factor) || '';
    }

    function updateForecastStatus(message: string): void {
        forecastMessage = message;
    }

    function forecastTextColor(color: string): string {
        const channels = forecastColorChannels(color);
        const luminance = channels?.length === 3 ? channels[0] * 0.299 + channels[1] * 0.587 + channels[2] * 0.114 : 255;
        return luminance > 155 ? '#263238' : '#fff';
    }

    function forecastColorChannels(color: string): number[] | null {
        const rgb = color.match(/^rgba?\(([^)]+)\)$/i)?.[1].match(/[\d.]+/g)?.slice(0, 3).map(Number);
        if (rgb?.length === 3) return rgb;
        const hex = color.match(/^#([\da-f]{3}|[\da-f]{6})$/i)?.[1];
        if (!hex) return null;
        const fullHex = hex.length === 3 ? hex.split('').map(channel => channel + channel).join('') : hex;
        return [0, 2, 4].map(index => parseInt(fullHex.slice(index, index + 2), 16));
    }

    function mixForecastColors(first: string | undefined, second: string | undefined): string {
        if (!first) return second || '#e9eded';
        if (!second) return first;
        const a = forecastColorChannels(first), b = forecastColorChannels(second);
        if (!a || !b) return first;
        return `rgb(${a.map((channel, index) => Math.round((channel + b[index]) / 2)).join(',')})`;
    }

    function saveWindowConstraints(): void {
        try { localStorage.setItem('route-builder-window-constraints', JSON.stringify(windowConstraints)); localStorage.setItem('route-builder-direction-selections-v1', JSON.stringify(directionSelections)); localStorage.setItem('route-builder-arrival-selection-v1', JSON.stringify({ hours: arrivalHours, days: arrivalDays })); }
        catch { /* Keep the current conditions for this session. */ }
    }

    function applyLabelFontSizes(): void {
        waypointLabelFontSize = Math.min(18, Math.max(8, Number(waypointLabelFontSize) || 10));
        segmentLabelFontSize = Math.min(18, Math.max(8, Number(segmentLabelFontSize) || 11));
        try {
            localStorage.setItem('route-builder-waypoint-label-font-size', String(waypointLabelFontSize));
            localStorage.setItem('route-builder-segment-label-font-size', String(segmentLabelFontSize));
        } catch { /* Keep the current sizes for this session. */ }
        redrawMap();
    }

    function applyWaypointSize(): void {
        waypointSize = Math.min(40, Math.max(14, Number(waypointSize) || 18));
        try { localStorage.setItem('route-builder-waypoint-size', String(waypointSize)); } catch { /* Keep the current size for this session. */ }
        redrawMap();
    }

    function applyRouteSettings(): void {
        const parsedSpeed = Number(speedKnots);
        speedKnots = Number.isFinite(parsedSpeed) ? Math.max(0, Math.min(20, parsedSpeed)) : 10;
        try {
            localStorage.setItem('route-builder-speed-knots', String(speedKnots));
        } catch { /* Keep the current settings for this session. */ }
        departureEvaluations = [];
        saveRoute();
        redrawMap();
        if (forecastDrawer?.classList.contains('is-open')) {
            void calculateRouteForecast();
        }
    }

    onDestroy(() => {
        routeFitRequestVersion++;
        hiddenWindyCrosshair?.classList.remove('route-builder-hide-crosshair');
        crosshairStyle?.remove();
        gpsRequestGeneration++;
        passiveTrackingDisposed = true;
        if (passiveWatchId !== null && navigator.geolocation) navigator.geolocation.clearWatch(passiveWatchId);
        passiveWatchId = null;
        passivePositionMarker?.removeFrom(map);
        if (liveRefreshTimer !== null) window.clearInterval(liveRefreshTimer);
        if (liveWaypointTimer !== null) window.clearInterval(liveWaypointTimer);
        if (navigationRefreshTimer !== null) window.clearInterval(navigationRefreshTimer);
        centerLayoutObserver?.disconnect();
        if (centerLayoutFrame !== null) window.cancelAnimationFrame(centerLayoutFrame);
        navigationPanel?.remove();
        if (gpsWatchId !== null && navigator.geolocation) navigator.geolocation.clearWatch(gpsWatchId);
        gpsWatchId = null;
        gpsPositionMarker?.removeFrom(map);
        gpsCourseOverlay?.remove();
        windIndicatorOverlay?.remove();
        waveIndicatorOverlay?.remove();
        windRoseOverlay?.remove();
        headingDegreesOverlay?.remove();
        upwindLaylineLayers.forEach(layer => layer.removeFrom(map));
        downwindLaylineLayers.forEach(layer => layer.removeFrom(map));
        if (departureScrollCommitTimer !== null) window.clearTimeout(departureScrollCommitTimer);
        window.removeEventListener('mousedown', onMapMouseDown, true);
        window.removeEventListener('mousemove', onMapMouseMove, true);
        window.removeEventListener('mouseup', onMapMouseUp, true);
        window.removeEventListener('click', onMapDomClick, true);
        window.removeEventListener('dblclick', onMapDomDoubleClick, true);
        waypointLayer?.removeFrom(map);
        pastWaypointLayer?.removeFrom(map);
        pastRouteLine?.removeFrom(map);
        map.off('move zoomend', redrawMapOverlays);
        map.off('dragstart', stopFollowingOnMapDrag);
        map.off('resize', positionForecastDrawer);
        map.off('resize', scheduleCenterForLayoutChange);
        map.off('resize', redrawGpsCourseLine);
        window.removeEventListener('resize', positionForecastDrawer);
        window.removeEventListener('resize', scheduleCenterForLayoutChange);
        distanceLabelOverlay?.remove();
        routeLine?.removeFrom(map);
        forecastHighlightMarker?.removeFrom(map);
        forecastDrawer?.remove();
        forecastReopenButton?.remove();
        gpsButton?.remove();
        liveButton?.remove();
        centerButton?.remove();
        mapTypeControl?.remove();
        zoomInButton?.remove();
        zoomOutButton?.remove();
        windyControlsStyles.forEach(style => style.remove());
        windyControlsStyles = [];
        document.body.classList.remove('route-builder-fullscreen');
        setForecastOpenState(false);
    });
</script>

<div class="plugin__mobile-header">{pluginTitle}</div>
<section class="plugin__content route-builder">
    <div class="plugin__title plugin__title--chevron-back">{pluginTitle}</div>
    <div class="panel-kicker"><span class="status-dot"></span><span>PLANIFICADOR DE RUTA</span></div>
    <div class="forecast-launcher">
        <button class="forecast-button" on:click={calculateRouteForecast} disabled={forecastBusy || points.length < 2}>{forecastBusy ? 'Calculando…' : 'Pronóstico de la ruta'}</button>
    </div>
    {#if forecastMessage}<p class="forecast-message" aria-live="polite">{forecastMessage}</p>{/if}

    <details class="label-settings" bind:this={mapLabelSettings}>
        <summary>Datos en el mapa</summary>
        <div class="label-settings-grid">
            <div class="label-setting-group">
                <strong>Waypoint</strong>
                <label class="label-font-size"><span>Tamaño de letra</span><output>{waypointLabelFontSize}px</output>
                    <input type="range" min="8" max="18" step="1" bind:value={waypointLabelFontSize} on:input={applyLabelFontSizes} aria-label="Tamaño de letra de los datos de waypoint en píxeles" />
                </label>
                <div class="label-field-list" data-label-group="waypoint">
                    <div class="label-field-list-heading"><span>Campo</span><span>Arriba</span><span>Abajo</span></div>
                    {#each waypointLabelRows as row (row.field)}
                        <div class="label-field-row" data-label-field={row.field} data-label-group="waypoint">
                            <button type="button" class="label-sort-handle" aria-label={`Ordenar ${fieldNames[row.field]}`} title="Arrastra para ordenar">⠿</button>
                            <span class="label-field-name">{fieldNames[row.field]}</span>
                            <label class="label-position-box"><input type="checkbox" checked={row.position === 'above'} aria-label={`${fieldNames[row.field]}, arriba de la línea`} on:change={(event) => handleLabelPositionChange(event, 'waypoint', row.field, 'above')} /></label>
                            <label class="label-position-box"><input type="checkbox" checked={row.position === 'below'} aria-label={`${fieldNames[row.field]}, abajo de la línea`} on:change={(event) => handleLabelPositionChange(event, 'waypoint', row.field, 'below')} /></label>
                        </div>
                    {/each}
                </div>
            </div>
            <div class="label-setting-group">
                <strong>Segmento</strong>
                <label class="label-font-size"><span>Tamaño de letra</span><output>{segmentLabelFontSize}px</output>
                    <input type="range" min="8" max="18" step="1" bind:value={segmentLabelFontSize} on:input={applyLabelFontSizes} aria-label="Tamaño de letra de los datos de segmento en píxeles" />
                </label>
                <div class="label-field-list" data-label-group="segment">
                    <div class="label-field-list-heading"><span>Campo</span><span>Arriba</span><span>Abajo</span></div>
                    {#each segmentLabelRows as row (row.field)}
                        <div class="label-field-row" data-label-field={row.field} data-label-group="segment">
                            <button type="button" class="label-sort-handle" aria-label={`Ordenar ${fieldNames[row.field]}`} title="Arrastra para ordenar">⠿</button>
                            <span class="label-field-name">{fieldNames[row.field]}</span>
                            <label class="label-position-box"><input type="checkbox" checked={row.position === 'above'} aria-label={`${fieldNames[row.field]}, arriba de la línea`} on:change={(event) => handleLabelPositionChange(event, 'segment', row.field, 'above')} /></label>
                            <label class="label-position-box"><input type="checkbox" checked={row.position === 'below'} aria-label={`${fieldNames[row.field]}, abajo de la línea`} on:change={(event) => handleLabelPositionChange(event, 'segment', row.field, 'below')} /></label>
                        </div>
                    {/each}
                    <label class="label-unit"><span>Unidad de distancia</span>
                        <select bind:value={distanceUnit} on:change={applyDistanceUnit} aria-label="Unidad de la distancia de los segmentos">
                            <option value="km">km</option><option value="nm">Nm</option>
                        </select>
                    </label>
                </div>
                <label class="label-unit label-unit--stacked"><span>Fuente de distancia</span>
                    <select class="distance-font-select" bind:value={distanceFont} on:change={applyDistanceFont} aria-label="Fuente para la distancia de los tramos">
                        <option value="system">Windy / sistema</option>
                        <option value="roboto">Roboto</option>
                        <option value="arial">Arial</option>
                        <option value="segoe">Segoe UI</option>
                    </select>
                </label>
            </div>
            <label class="size-picker"><span>Tamaño de los puntos</span>
                <input type="range" min="14" max="40" step="1" bind:value={waypointSize} on:input={applyWaypointSize} aria-label="Tamaño de los puntos en píxeles" />
                <output>{waypointSize}px</output>
            </label>
        </div>    </details>

    <div class="footnote"><span>ⓘ</span> La línea une los puntos en orden; no calcula navegación costera ni evita tierra.</div>
</section>

<style>
    .route-builder { color: #f2f5f6; padding: 0 12px 18px; font-family: inherit; }
    .panel-kicker { display: flex; align-items: center; gap: 7px; margin: 2px 0 9px; color: #9ca6aa; font-size: 10px; font-weight: 700; letter-spacing: .12em; }
    .status-dot { width: 7px; height: 7px; border-radius: 50%; background: #00c9a7; box-shadow: 0 0 8px #00c9a766; }
    .beta { margin-left: auto; padding: 2px 6px; border: 1px solid #50595d; border-radius: 3px; color: #aab4b8; font-size: 9px; letter-spacing: .06em; }
    .route-settings { display: grid; grid-template-columns: minmax(95px, .75fr) minmax(150px, 1.25fr); gap: 9px; margin: 8px 0 12px; }
    .route-setting { display: flex; flex-direction: column; gap: 5px; min-width: 0; color: #b4bdc0; font-size: 10px; }
    .route-setting > input, .route-setting-input { box-sizing: border-box; display: flex; align-items: center; min-width: 0; height: 30px; padding: 0 7px; border: 1px solid #51595c; border-radius: 4px; background: #303638; color: #edf1f2; }
    .route-setting input { color-scheme: dark; font: inherit; }
    .route-setting > input { width: 100%; }
    .route-setting-input input { width: 100%; min-width: 0; border: 0; outline: 0; background: transparent; color: #edf1f2; font: inherit; font-variant-numeric: tabular-nums; }
    .route-setting-input small { color: #a9dbe5; font-size: 10px; }
    .departure-time-control { display: flex; align-items: center; gap: 3px; min-width: 0; height: 30px; }
    .departure-time-control input { flex: 1 1 auto; width: 0; min-width: 0; height: 30px; padding: 0 5px; border: 1px solid #51595c; border-radius: 4px; background: #303638; color: #edf1f2; }
    .departure-adjust { flex: 0 0 25px; width: 25px; height: 30px; padding: 0; border: 1px solid #51595c; border-radius: 4px; background: #303638; color: #edf1f2; font: 16px/1 Arial,sans-serif; cursor: pointer; }
    .departure-adjust:hover { border-color: #1689a6; background: #394346; }
    .forecast-launcher { display: flex; gap: 7px; margin: 0 0 10px; }
    .forecast-launcher .forecast-button { flex: 1 1 0; min-width: 0; }
    .label-settings { margin: 0 0 8px; border: 1px solid #4e585b; border-radius: 5px; background: #303638; color: #dce3e5; }
    .label-settings > summary { padding: 8px 10px; color: #edf1f2; cursor: pointer; font-size: 11px; font-weight: 650; }
    .weather-window-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 9px; padding: 0 10px 10px; }
    .route-forecast-content { padding: 0 9px 9px; }
    .forecast-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 7px; color: #b9c5c8; font-size: 9px; line-height: 1.35; }
    .forecast-button { flex: 0 0 auto; padding: 6px 8px; border: 1px solid #1689a6; border-radius: 4px; background: #07566a; color: #f0fbfd; font: inherit; font-size: 10px; cursor: pointer; }
    .forecast-button:hover:not(:disabled) { background: #08738d; }
    .forecast-button:disabled { opacity: .55; cursor: default; }
    .forecast-view-tabs { display: flex; gap: 4px; border-bottom: 1px solid #c3cbcd; }
    .forecast-view-tabs button { padding: 4px 9px; border: 0; border-bottom: 2px solid transparent; background: transparent; color: #596365; font: 10px Arial,sans-serif; cursor: pointer; }
    .forecast-view-tabs button.is-active { border-bottom-color: #1689a6; color: #07566a; font-weight: 700; }
    :global(.forecast-field-add-wrap) { position: relative; }
    :global(.window-filter-button) { min-height: 23px; padding: 2px 6px; border: 1px solid #879496; border-radius: 4px; background: #eef2f2; color: #405052; font: 9px Arial,sans-serif; cursor: pointer; white-space: nowrap; }
    :global(.window-filter-button.is-active) { border-color: #1689a6; background: #d8eef2; color: #07566a; }
    :global(.window-filter-button:disabled) { opacity: .55; cursor: default; }
    :global(.forecast-field-add) { display: grid; place-items: center; width: 23px; height: 23px; padding: 0; border: 1px solid #1689a6; border-radius: 4px; background: #07566a; color: #f0fbfd; font: 18px/1 Arial,sans-serif; cursor: pointer; }
    :global(.forecast-field-picker) { position: fixed; z-index: 2147483647; pointer-events: auto; display: grid; min-width: 165px; max-width: calc(100vw - 16px); max-height: 240px; overflow: auto; padding: 4px; border: 1px solid #899597; border-radius: 4px; background: #f7f9f9; box-shadow: 0 4px 12px #0004; }
    :global(.forecast-field-picker button) { padding: 6px 8px; border: 0; background: transparent; color: #364144; text-align: left; font: 10px Arial,sans-serif; cursor: pointer; }
    :global(.forecast-field-picker button:hover) { background: #dcebed; }
    :global(.forecast-field-picker button.forecast-field-group) { display: flex; justify-content: space-between; gap: 8px; align-items: center; margin-top: 3px; padding: 7px 8px; border-radius: 3px; background: #e1eded; color: #28525a; font-weight: 700; }
    :global(.forecast-field-picker .forecast-field-group small) { color: #50696e; font: 9px Arial,sans-serif; }
    :global(.forecast-field-picker button.forecast-field-group-item) { padding-left: 19px; }
    :global(.forecast-field-picker span) { padding: 6px 8px; color: #697477; font: 10px Arial,sans-serif; }
    :global(.forecast-field-picker button.forecast-field-group), :global(.forecast-field-picker button.forecast-field-select) { display: flex; justify-content: flex-start; align-items: center; gap: 6px; min-height: 32px; }
    :global(.forecast-field-picker span.forecast-field-check) { display: inline-block; flex: 0 0 16px; padding: 0; color: #087f95; font: 17px/1 Arial,sans-serif; }
    :global(.forecast-field-picker button.forecast-field-commit) { position: sticky; bottom: -4px; z-index: 1; min-height: 38px; margin: 4px -4px -4px; padding: 8px; border-radius: 0 0 3px 3px; background: #087f95; color: #fff; text-align: center; font-weight: 700; }
    :global(.forecast-field-picker button.forecast-field-commit:disabled) { opacity: .55; cursor: default; }

    .forecast-message { margin: 7px 0 0; color: #a9dbe5; font-size: 9px; line-height: 1.4; }
    .forecast-table-scroll { max-width: 100%; margin-top: 8px; overflow: auto; border: 1px solid #485356; border-radius: 4px; scrollbar-color: #687477 #292f31; }
    .forecast-table { width: max-content; min-width: 100%; border-collapse: separate; border-spacing: 0; color: #edf1f2; font-size: 9px; font-variant-numeric: tabular-nums; text-align: center; }
    .forecast-table th, .forecast-table td { min-width: 54px; padding: 5px 4px; border-right: 1px solid #454d4f; border-bottom: 1px solid #454d4f; white-space: nowrap; }
    .forecast-table thead th { background: #41494b; color: #f2f5f6; }
    .forecast-table .forecast-row-label { position: sticky; left: 0; z-index: 1; min-width: 64px; background: #303638; color: #b7c3c6; text-align: left; }
    .forecast-table thead .forecast-row-label { z-index: 2; background: #41494b; }
    .forecast-sample-head { display: flex; flex-direction: column; align-items: center; gap: 2px; }
    .forecast-sample-head > span { color: #a9dbe5; font-weight: 700; }
    .forecast-sample-head small { color: #d5dcde; font-size: 8px; }
    .forecast-table tbody tr:nth-child(even) td { background: #373e40; }
    .forecast-icon { font-size: 15px; }
    .forecast-arrow { display: inline-block; margin-right: 3px; color: #99d6e5; font-size: 13px; }
    .forecast-footnote { margin: 7px 0 0; color: #99a6a9; font-size: 8px; line-height: 1.4; }
    .weather-forecast-field { display: flex; flex-direction: column; gap: 5px; min-width: 0; color: #c7d0d2; font-size: 10px; }
    .weather-forecast-field select { width: 100%; min-width: 0; padding: 6px 7px; border: 1px solid #596467; border-radius: 4px; background: #252b2d; color: #edf1f2; font: inherit; cursor: pointer; }
    .weather-window-note { grid-column: 1 / -1; margin: 0; color: #9ba8ab; font-size: 9px; line-height: 1.4; }
    .weather-condition-list { grid-column: 1 / -1; display: grid; gap: 5px; }
    .weather-condition { border: 1px solid #4e585b; border-radius: 4px; background: #343a3c; }
    .weather-condition > summary { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 31px; padding: 4px 8px; color: #edf1f2; cursor: pointer; font-size: 11px; }
    .condition-title { display: inline-flex; align-items: center; gap: 7px; }
    .weather-condition > summary { justify-content: flex-start; }
    .condition-content { display: grid; gap: 7px; padding: 7px 9px 9px; border-top: 1px solid #4e585b; color: #dce3e5; font-size: 10px; }
    .condition-content > strong { color: #a9dbe5; font-size: 10px; font-weight: 600; }
    .condition-range { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .condition-range label { display: flex; align-items: center; gap: 4px; min-width: 0; color: #bac4c6; }
    .condition-range input, .condition-range select { box-sizing: border-box; width: 100%; min-width: 0; padding: 5px 6px; border: 1px solid #596467; border-radius: 3px; background: #252b2d; color: #edf1f2; font: inherit; }
    .condition-range select { padding-right: 2px; }
    .condition-content small { color: #9eabad; line-height: 1.35; }
    .condition-period { display: flex; align-items: center; justify-content: space-between; gap: 8px; color: #c7d0d2; }
    .condition-period select { max-width: 62%; padding: 5px 7px; border: 1px solid #596467; border-radius: 3px; background: #252b2d; color: #edf1f2; font: inherit; }
    .direction-options { display: grid; grid-template-columns: repeat(4, 1fr); gap: 5px; }
    .direction-options label { display: flex; align-items: center; gap: 4px; color: #dce3e5; }
    .direction-options input { margin: 0; accent-color: #00a6d6; }
    .label-settings-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding: 0 8px 8px; }
    .label-setting-group { display: grid; grid-template-rows: auto auto minmax(0, 1fr); gap: 6px; min-width: 0; padding: 7px; border: 1px solid #465053; border-radius: 4px; }
    .label-setting-group > strong { margin-bottom: 1px; color: #a9dbe5; font-size: 10px; text-transform: uppercase; letter-spacing: .06em; }
    .label-field-list { display: grid; gap: 2px; min-width: 0; padding: 4px; border: 1px solid #596467; border-radius: 4px; background: #282e30; }
    .label-field-list-heading, .label-field-row { display: grid; grid-template-columns: 20px minmax(0, 1fr) 28px 28px; align-items: center; gap: 1px; }
    .label-field-list-heading { padding: 2px 3px 4px; color: #91cddb; font-size: 8px; font-weight: 700; text-align: center; text-transform: uppercase; }
    .label-field-list-heading > span:first-child { grid-column: 1 / span 2; text-align: left; }
    .label-field-row { min-height: 30px; border-top: 1px solid #3e484b; color: #dce3e5; font-size: 9px; transition: background .12s ease, opacity .12s ease; }
    .label-field-row.is-drop-target { background: #00a6d644; box-shadow: inset 0 1px #39b8d7; }
    .label-field-row.is-label-dragging { opacity: .45; }
    .label-sort-handle { display: grid; place-items: center; width: 20px; height: 28px; padding: 0; border: 0; background: transparent; color: #91cddb; font-size: 15px; line-height: 1; cursor: grab; touch-action: none; }
    .label-sort-handle:active { cursor: grabbing; }
    .label-field-name { overflow-wrap: anywhere; min-width: 0; }
    .label-position-box { display: grid; place-items: center; min-height: 28px; cursor: pointer; }
    .label-position-box input { width: 15px; height: 15px; margin: 0; accent-color: #00a6d6; cursor: pointer; }
    .label-font-size { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 3px 6px; color: #c7d0d2; font-size: 10px; }
    .label-font-size output { color: #edf1f2; font-variant-numeric: tabular-nums; }
    .label-font-size input { grid-column: 1 / -1; width: 100%; margin: 0; accent-color: #00a6d6; cursor: pointer; }
    .label-unit { display: flex; align-items: center; justify-content: space-between; gap: 5px; color: #c7d0d2; font-size: 10px; }
    .label-unit--stacked { display: grid; grid-template-columns: minmax(0, 1fr); gap: 4px; }
    .label-unit select { max-width: 75px; padding: 3px 4px; border: 1px solid #596467; border-radius: 3px; background: #252b2d; color: #edf1f2; font: inherit; }
    .label-unit .distance-font-select { box-sizing: border-box; width: 100%; max-width: none; padding: 4px 20px 4px 6px; cursor: pointer; }
    .actions { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 7px; }
    .action { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 5px; min-height: 62px; padding: 8px 3px; border: 1px solid #51595c; border-radius: 5px; background: #414648; color: #e6ebed; cursor: pointer; font: inherit; transition: background .15s, border-color .15s, transform .15s; }
    .action:hover { border-color: #8b989c; background: #4b5254; }
    .action:active { transform: translateY(1px); }
    .action.start-active, .action.via-active, .action.end-active { border-color: #00b7df; background: #075a70; color: #fff; box-shadow: inset 0 0 0 1px #00b7df44; }
    .action-symbol { display: grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; background: #00a6d6; color: white; font-size: 15px; font-weight: 700; line-height: 1; }
    .start-symbol { background: #27aa78; font-size: 10px; }
    .end-symbol { background: #e36e5b; font-size: 13px; }
    .action-label { overflow: hidden; max-width: 100%; color: #f4f7f8; font-size: 11px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
    .route-summary { display: flex; align-items: center; justify-content: space-between; min-height: 66px; margin-top: 12px; padding: 11px 13px; border: 1px solid #087e9d; border-left: 3px solid #00bce5; border-radius: 5px; background: linear-gradient(120deg, #124653, #2e3c40 72%); color: #fff; }
    .summary-copy { display: flex; flex-direction: column; gap: 5px; }
    .summary-label { color: #a9dbe5; font-size: 9px; font-weight: 700; letter-spacing: .11em; }
    .summary-points { color: #c5cfd2; font-size: 11px; }
    .route-summary strong { color: #fff; font-size: 24px; font-weight: 650; font-variant-numeric: tabular-nums; letter-spacing: -.03em; }
    .route-summary small { color: #b9d9df; font-size: 11px; font-weight: 500; letter-spacing: 0; }
    .size-picker { grid-column: 1 / -1; display: grid; grid-template-columns: 1fr auto; align-items: center; column-gap: 10px; margin: 0; color: #b4bdc0; font-size: 11px; }
    .size-picker input { grid-column: 1; width: 100%; margin: 5px 0 0; accent-color: #00a6d6; cursor: pointer; }
    .size-picker output { grid-column: 2; grid-row: 1 / span 2; min-width: 36px; color: #edf1f2; font-variant-numeric: tabular-nums; text-align: right; }
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
    :global(.route-builder-marker-wrap) { background: transparent; border: 0; overflow: visible; pointer-events: auto !important; touch-action: none; }
    :global(.route-builder-marker) { position: relative; isolation: isolate; display: grid; place-items: center; width: calc(var(--route-marker-size) + 13px); height: calc(var(--route-marker-size) + 13px); border: 0; border-radius: 50%; background: transparent; color: white; font: bold var(--route-marker-font-size) Arial,sans-serif; cursor: grab; pointer-events: auto; touch-action: none; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; }
    :global(.route-builder-marker:active) { cursor: pointer; }
    :global(.route-builder-marker::before) { content: ''; position: absolute; inset: 6.5px; border: 1px solid #00a6d6; border-radius: 50%; background: #00a6d6; box-shadow: 0 1px 3px #0008; pointer-events: none; z-index: 1; }
    :global(.route-builder-marker-number) { position: absolute; inset: 0; z-index: 2; display: grid; place-items: center; line-height: 1; text-align: center; pointer-events: none; }
    :global(.route-builder-marker-time) { position: static; padding: 0; background: transparent; color: #fff; font: var(--route-waypoint-label-font-size)/1.2 Arial,sans-serif; white-space: nowrap; text-shadow: 0 1px 2px #000; pointer-events: none; }
    :global(.route-builder-marker-time-line) { position: absolute; left: 50%; z-index: 2; display: flex; align-items: center; gap: 3px; width: max-content; padding: 2px 4px; border-radius: 3px; background: #263236df; transform: translateX(-50%); }
    :global(.route-builder-marker-time-line--above) { top: -14px; }
    :global(.route-builder-marker-time-line--below) { top: calc(var(--route-marker-size) + 8px); }
    :global(.route-builder-marker-separator) { opacity: .72; }
    :global(.route-builder-marker--start::before) { border-color: #21a366; background: #21a366; }
    :global(.route-builder-marker--end::before) { border-color: #cf5947; background: #cf5947; }
    :global(.route-builder-past-marker-wrap) { background: transparent; border: 0; }
    :global(.route-builder-past-marker) { display: grid; place-items: center; box-sizing: border-box; width: var(--route-marker-size); height: var(--route-marker-size); margin: 6.5px; border: 1px solid #7b8588; border-radius: 50%; background: #7b8588; box-shadow: 0 1px 3px #0008; color: #fff; font: bold var(--route-marker-font-size) Arial,sans-serif; cursor: default; user-select: none; }
    :global(.route-builder-insert-preview-wrap) { background: transparent; border: 0; }
    :global(.route-builder-insert-preview) { display: grid; place-items: center; width: 22px; height: 22px; border: 1px solid #d8f7ff; border-radius: 50%; background: #087e9d; box-shadow: 0 1px 4px #0008; color: #fff; font: 700 18px/1 Arial,sans-serif; }
    :global(.route-builder-distance-wrap) { overflow: visible !important; border: 0 !important; background: transparent !important; }
    :global(.route-builder-forecast-highlight-wrap) { background: transparent; border: 0; }
    :global(.route-builder-forecast-highlight) { position: absolute; inset: 3px; border: 2px solid #fff; border-radius: 50%; background: #ffffff55; box-shadow: 0 0 0 5px #ffffff35, 0 1px 8px #15282caa; }
    :global(.route-builder-forecast-drawer-host) { position: fixed; z-index: 2147483647; bottom: 0; max-height: 70vh; pointer-events: none; }
    :global(.route-builder-forecast-drawer-host[hidden]) { display: none !important; }
    :global(.forecast-drawer) { position: relative; display: flex; flex-direction: column; gap: 2px; width: 100%; height: 55vh; min-width: min(360px, 100%); min-height: 320px; max-width: 100%; max-height: 70vh; overflow: visible; resize: none; box-sizing: border-box; padding: 0 5px 10px; border: 1px solid #555f62; border-top: 0; border-radius: 0; background: #f4f6f6fa; box-shadow: 0 3px 16px #12242c66; color: #30383a; pointer-events: auto; }
    :global(.route-builder-forecast-drawer-host) { max-height: 70vh; }
    :global(.route-builder-forecast-drawer-host .forecast-drawer) { height: auto; min-height: 0; max-height: 70vh; }
    :global(.route-builder-forecast-drawer-host .forecast-drawer) { padding: 0 5px 10px; }
    :global(.route-builder-forecast-drawer-host .forecast-drawer-header) { position: absolute; top: 0; left: 0; right: 0; z-index: 2; }
    :global(.route-builder-forecast-drawer-host .forecast-table-scroll) { width: 100%; height: auto; max-height: calc(70vh - 160px); flex: 0 1 auto; margin: 0; box-sizing: border-box; overflow-y: auto; }
        :global(.route-forecast-settings) { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 6px; padding: 7px 9px; border-bottom: 1px solid #d1d9da; background: #e7eded; }
    :global(.forecast-weather-settings-menu) { position: relative; display: inline-flex; align-items: center; flex: 0 0 auto; }
    :global(.forecast-settings-toggle) { display: inline-flex; align-items: center; gap: 4px; min-height: 24px; padding: 4px 7px; border: 1px solid #a5b1b3; border-radius: 4px; background: #edf1f1; color: #465255; font: 9px Arial,sans-serif; white-space: nowrap; cursor: pointer; }
    :global(.forecast-settings-toggle[aria-expanded="true"]) { border-color: #1385a0; background: #d8eef2; color: #07566a; }
    :global(.forecast-settings-backdrop) { position: fixed; inset: 0; z-index: 2147483647; display: grid; place-items: center; box-sizing: border-box; padding: 12px; background: #16212688; }
    :global(.forecast-settings-backdrop[hidden]) { display: none !important; }
    :global(.forecast-settings-dialog) { width: min(420px, calc(100vw - 24px)); max-height: min(80vh, calc(100dvh - 24px)); overflow: auto; box-sizing: border-box; border: 1px solid #b6c1c2; border-radius: 9px; background: #f4f6f6; box-shadow: 0 8px 26px #17252966; }
    :global(.speed-settings-backdrop) { position: fixed; inset: 0; z-index: 2147483647; display: grid; place-items: center; box-sizing: border-box; padding: 16px; background: #16212688; }
    :global(.speed-settings-backdrop[hidden]) { display: none !important; }
    :global(.speed-settings-dialog) { width: min(340px, calc(100vw - 32px)); box-sizing: border-box; padding: 0 18px 18px; border: 1px solid #b6c1c2; border-radius: 14px; background: #f4f6f6; color: #354043; box-shadow: 0 8px 26px #17252966; }
    :global(.speed-settings-dialog > header) { display: flex; align-items: center; justify-content: space-between; min-height: 52px; margin: 0 -18px; padding: 0 15px; border-bottom: 1px solid #d3dcdd; font: 700 16px Arial,sans-serif; }
    :global(.speed-settings-dialog > header button) { display: grid; place-items: center; width: 30px; height: 30px; padding: 0; border: 1px solid #a5b1b3; border-radius: 50%; background: #fff; color: #465255; font: 22px/1 Arial,sans-serif; cursor: pointer; }
    :global(.speed-settings-reading) { display: flex; align-items: baseline; justify-content: center; gap: 6px; margin: 22px 0 12px; color: #16363d; }
    :global(.speed-settings-reading output) { font: 700 48px/1 Arial,sans-serif; font-variant-numeric: tabular-nums; }
    :global(.speed-settings-reading small) { font: 600 16px Arial,sans-serif; }
    :global(.speed-settings-label) { display: block; margin: 0 0 10px; color: #536164; font: 12px Arial,sans-serif; }
    :global(.speed-settings-dialog input[type="range"]) { display: block; width: 100%; margin: 0; accent-color: #087f95; touch-action: pan-x; }
    :global(.speed-settings-endpoints) { display: flex; justify-content: space-between; margin-top: 7px; color: #667477; font: 11px Arial,sans-serif; }
    :global(.speed-settings-done) { display: block; width: 100%; min-height: 42px; margin-top: 22px; border: 0; border-radius: 7px; background: #087f95; color: #fff; font: 700 14px Arial,sans-serif; cursor: pointer; }
    :global(.forecast-settings-dialog > header) { position: sticky; top: 0; z-index: 5; display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 50px; box-sizing: border-box; padding: 10px 12px; border-bottom: 1px solid #d3dcdd; background: #f4f6f6; color: #354043; font: 700 13px Arial,sans-serif; }
    :global(.forecast-settings-dialog > header button) { display: grid; place-items: center; width: 28px; height: 28px; padding: 0; border: 1px solid #a5b1b3; border-radius: 50%; background: #fff; color: #465255; font: 21px/1 Arial,sans-serif; cursor: pointer; }
    :global(.forecast-settings-tabs) { position: sticky; top: 50px; z-index: 4; display: flex; gap: 6px; padding: 10px 12px; border-bottom: 1px solid #d3dcdd; background: #f4f6f6; }
    :global(.forecast-settings-tabs button) { flex: 1 1 0; min-width: 0; min-height: 38px; padding: 4px 3px; border: 1px solid #9aa7a9; border-radius: 4px; background: #e7eded; color: #465255; font: 600 10px Arial,sans-serif; }
    :global(.forecast-settings-tabs button[aria-pressed="true"]) { background: #087f95; border-color: #087f95; color: #fff; }
    :global(.forecast-settings-dialog .route-forecast-settings) { display: grid; grid-template-columns: minmax(0,1fr); width: 100%; min-width: 0; box-sizing: border-box; gap: 10px; padding: 12px; border: 0; background: transparent; }
    :global(.forecast-settings-dialog .route-forecast-settings label) { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr); width: 100%; min-width: 0; box-sizing: border-box; align-items: center; gap: 10px; color: #465255; font-size: 11px; }
    :global(.forecast-settings-dialog .route-forecast-settings select) { width: 100%; min-width: 0; box-sizing: border-box; min-height: 34px; padding: 5px 7px; font-size: 11px; }
    :global(.forecast-settings-dialog .nav-restore-route-setting) { grid-template-columns: minmax(0,1fr) auto !important; }
    :global(.forecast-settings-dialog .nav-restore-route-setting input[type="checkbox"]) { width: 18px; height: 18px; margin: 0; accent-color: #087f95; }
    :global(.forecast-settings-dialog .route-forecast-settings > small) { color: #788587; font-size: 10px; }
    :global(.forecast-settings-dialog input[type="color"][data-layline-color]) { box-sizing: border-box; width: 52px; height: 32px; padding: 2px; justify-self: end; border: 1px solid #abb8ba; border-radius: 4px; background: #fff; }
    :global(.navigation-visual-aids-list input[type="number"]) { box-sizing: border-box; width: 100%; min-height: 38px; padding: 5px 7px; border: 1px solid #abb8ba; border-radius: 3px; background: #fff; color: #354145; font: 14px Arial,sans-serif; }
    :global(.forecast-settings-dialog .wind-degrees-setting), :global(.forecast-settings-dialog .wind-rose-toggle) { grid-template-columns: minmax(120px,1fr) auto; }
    :global(.wind-degrees-setting input[type="checkbox"]), :global(.wind-rose-toggle input[type="checkbox"]) { width: 18px; height: 18px; margin: 0; accent-color: #087f95; }
    :global(.navigation-visual-aids) { border-top: 1px solid #d3dcdd; padding-top: 10px; color: #465255; font: 11px Arial,sans-serif; }
    :global(.navigation-visual-aids summary) { min-height: 34px; display: flex; align-items: center; justify-content: space-between; font-weight: 700; cursor: pointer; list-style: none; }
    :global(.navigation-visual-aids summary::-webkit-details-marker) { display: none; }
    :global(.navigation-visual-aids summary::after) { content: '▾'; font-size: 14px; }
    :global(.navigation-visual-aids[open] summary::after) { content: '▴'; }
    :global(.navigation-visual-aids-list) { display: grid; gap: 10px; padding: 4px 0 6px; }
    :global(.navigation-visual-aids-list small) { color: #788587; }
    :global(.navigation-visual-group) { padding: 0 8px; border: 1px solid #d3dcdd; border-radius: 5px; background: #f8f9f9; }
    :global(.navigation-visual-group summary) { display: flex; align-items: center; justify-content: space-between; min-height: 36px; color: #465255; font-weight: 700; cursor: pointer; list-style: none; }
    :global(.navigation-visual-group summary::-webkit-details-marker) { display: none; }
    :global(.navigation-visual-group summary::after) { content: '▾'; font-size: 14px; }
    :global(.navigation-visual-group[open] summary::after) { content: '▴'; }
    :global(.navigation-visual-group-body) { display: grid; gap: 10px; padding: 0 0 10px; }
    :global(.navigation-visual-group-body > hr), :global(.navigation-visual-group-body > strong) { grid-column: 1 / -1; }
    :global(.forecast-settings-dialog .forecast-drawer-height-setting) { grid-template-columns: 1fr auto !important; }
    :global(.forecast-settings-dialog .forecast-drawer-height-setting input) { grid-column: 1 / -1; width: 100%; height: 48px; margin: 0; padding: 0; background: transparent; cursor: pointer; -webkit-appearance: none; appearance: none; }
    :global(.forecast-settings-dialog .forecast-drawer-height-setting input::-webkit-slider-runnable-track) { height: 6px; border-radius: 3px; background: #aebcbf; }
    :global(.forecast-settings-dialog .forecast-drawer-height-setting input::-webkit-slider-thumb) { -webkit-appearance: none; width: 44px; height: 44px; margin-top: -19px; border: 7px solid transparent; border-radius: 50%; background: #087f95; background-clip: padding-box; box-sizing: border-box; box-shadow: 0 1px 4px #17252955; }
    :global(.forecast-settings-dialog .forecast-drawer-height-setting input::-moz-range-track) { height: 6px; border-radius: 3px; background: #aebcbf; }
    :global(.forecast-settings-dialog .forecast-drawer-height-setting input::-moz-range-thumb) { width: 30px; height: 30px; border: 7px solid transparent; border-radius: 50%; background: #087f95; background-clip: padding-box; box-sizing: content-box; box-shadow: 0 1px 4px #17252955; }
    :global(.forecast-settings-dialog .forecast-drawer-height-setting input:focus-visible) { outline: 2px solid #087f95; outline-offset: 2px; }
    :global(.forecast-drawer-height-setting span) { color: #087f95; font-weight: 700; }
    :global( .route-forecast-settings label) { display: flex; flex-direction: column; gap: 3px; min-width: 0; color: #526166; font: 10px Arial,sans-serif; }
    :global( .route-forecast-settings select) { width: 100%; min-width: 0; padding: 4px; border: 1px solid #abb8ba; border-radius: 3px; background: #fff; color: #354145; font: 10px Arial,sans-serif; }
    :global(.route-forecast-settings) { flex: 0 1 426px; grid-template-columns: repeat(3,minmax(0,1fr)); width: min(426px,100%); min-width: 0; gap: 4px; padding: 0; border: 0; background: transparent; }
    :global(.route-forecast-settings label) { font-size: 9px; }
    :global(.route-forecast-settings select) { padding: 3px; font-size: 9px; }
    :global(body.onwindy-plugin-navigator [data-plugin="bottom-right"]),
    :global(body.onwindy-plugin-navigator [data-plugin="bottom-controls-mobile"]),
    :global(body.onwindy-plugin-navigator [data-plugin="bottom-below-controls-mobile"]),
    :global(body.onwindy-plugin-navigator [data-plugin="mobile-ui"]),
    :global(body.route-builder-fullscreen [data-plugin="bottom-right"]),
    :global(body.route-builder-fullscreen [data-plugin="bottom-controls-mobile"]),
    :global(body.route-builder-fullscreen [data-plugin="bottom-below-controls-mobile"]),
    :global(body.route-builder-fullscreen [data-plugin="mobile-ui"]) { display: none !important; }
    :global(body.route-builder-forecast-open #windy .leaflet-top.leaflet-right),
    :global(body.route-builder-forecast-open .leaflet-top.leaflet-right) { display: none !important; }
    :global(body.route-builder-forecast-open #logo-wrapper),
    :global(body.route-builder-forecast-open #search),
    :global(body.route-builder-forecast-open #mobile-ovr-select),
    :global(body.route-builder-forecast-open #embed-zoom) { display: none !important; }
    :global(body.route-builder-fullscreen .rhpane), :global(body.route-builder-fullscreen .plugin-rhpane) { display: none !important; }
    :global(body.route-builder-fullscreen #plugin-windy-plugin-navigator),
    :global(body.route-builder-fullscreen .plugin__content.route-builder),
    :global(body.route-builder-fullscreen .plugin__mobile-header) { display: none !important; }
    :global(body.route-builder-fullscreen > section:first-of-type:not(.route-navigation-dashboard)) { transform: none !important; width: 100vw !important; }
    :global(body.route-builder-fullscreen .route-builder-forecast-drawer-host) { left: 0 !important; right: 0 !important; }
    :global(.route-builder-reopen-button) { position: fixed; left: 16px; bottom: calc(64px + env(safe-area-inset-bottom, 0px)); z-index: 2147483647; padding: 8px 12px; border: 1px solid #1689a6; border-radius: 5px; background: #07566a; color: #fff; font: 12px Arial,sans-serif; cursor: pointer; box-shadow: 0 2px 8px #0005; }
    :global(.route-builder-reopen-button[hidden]) { display: none !important; }
    :global(.forecast-drawer-header) { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-right: 38px; color: #3c4446; }
    :global(.forecast-drawer-header > div) { display: flex; flex-direction: column; gap: 2px; }
    :global(.forecast-drawer-header strong) { font-size: 12px; }
    :global(.forecast-drawer-header small) { color: #687174; font-size: 9px; }
    :global(.forecast-drawer-header-actions) { display: inline-flex; align-items: center; gap: 6px; flex: 0 0 auto; }
    :global(.route-waypoint-dialog-backdrop) { position: fixed; inset: 0; z-index: 2147483647; display: flex; align-items: center; justify-content: center; box-sizing: border-box; padding: max(16px, env(safe-area-inset-top, 0px)) 16px max(64px, calc(16px + env(safe-area-inset-bottom, 0px))); background: #0009; }
    :global(.route-waypoint-dialog) { box-sizing: border-box; width: min(100%, 360px); padding: 20px; border-radius: 8px; background: #f1f4f4; color: #344044; box-shadow: 0 4px 20px #0005; font: 14px Arial,sans-serif; }
    :global(.route-waypoint-dialog h3) { margin: 0 0 16px; font-size: 19px; }
    :global(.route-waypoint-dialog label) { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 10px 0; }
    :global(.route-waypoint-dialog input) { box-sizing: border-box; width: 60%; padding: 8px; border: 1px solid #9aa7a9; border-radius: 4px; font: inherit; }
    :global(.route-waypoint-dialog > div) { display: flex; justify-content: space-between; gap: 6px; margin-top: 16px; }
    :global(.route-waypoint-dialog button) { padding: 8px; border: 1px solid #9aa7a9; border-radius: 4px; background: #e7eded; color: #344044; font: inherit; cursor: pointer; }
    :global(.route-waypoint-dialog) { max-height: 100%; overflow-y: auto; }
    :global(.route-waypoint-dialog > .coordinate-editors) { display: block; margin: 12px 0; }
    :global(.route-waypoint-dialog .coordinate-mode) { width: 100%; color: #066c7b; }
    :global(.coordinate-section) { margin: 10px 0; }
    :global(.coordinate-section > strong) { display: block; margin-bottom: 6px; }
    :global(.coordinate-columns) { display: flex; gap: 4px; }
    :global(.coordinate-column) { flex: 1 1 0; min-width: 0; text-align: center; }
    :global(.coordinate-column > span) { display: block; font-size: 10px; overflow: hidden; text-overflow: ellipsis; }
    :global(.coordinate-fraction) { flex: 2 1 0; min-width: 0; text-align: center; }
    :global(.coordinate-fraction > span) { display: block; font-size: 10px; }
    :global(.coordinate-fraction-wheels) { display: flex; gap: 2px; }
    :global(.coordinate-wheel) { height: 96px; box-sizing: border-box; overflow-y: auto; overscroll-behavior: contain; scroll-snap-type: y mandatory; scrollbar-width: none; border: 1px solid #bdc9c9; border-radius: 5px; padding: 32px 0; background: linear-gradient(to bottom, #e4eaea 0 33.33%, #b8dddd 33.33% 66.66%, #e4eaea 66.66%); touch-action: pan-y; }
    :global(.coordinate-wheel::-webkit-scrollbar) { display: none; }
    :global(.coordinate-wheel > div) { box-sizing: border-box; height: 32px; line-height: 32px; scroll-snap-align: center; color: #23494b; font-size: 16px; }
    :global(.coordinate-preview) { margin-top: 5px; text-align: center; font-size: 12px; color: #416264; }
    :global(.route-waypoint-dialog > .coordinate-actions) { display: flex; margin-top: 12px; }
    :global(.route-waypoint-error) { color: #a32121; }
    :global(.forecast-drawer-bottom-bar) { display: grid; grid-template-columns: repeat(5,minmax(0,1fr)); align-items: stretch; gap: 5px; flex: 0 0 auto; width: 100%; margin-top: auto; padding-top: 2px; border-top: 1px solid #d0d8d9; }
    :global(.route-builder-forecast-drawer-host .forecast-drawer-bottom-bar) { grid-template-columns: 30px repeat(6,minmax(0,1fr)); gap: 3px; }
    :global(.forecast-saved-routes) { grid-column: 1 / -1; display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 5px; }
    :global(.route-builder-forecast-drawer-host .forecast-saved-routes) { display: contents; }
    :global(.forecast-bottom-add-field) { display: grid; place-items: center; min-width: 0; }
    :global(.forecast-bottom-add-field .forecast-field-add) { width: 30px; height: 32px; font-size: 22px; }
    :global(.forecast-bottom-action), :global(.forecast-drawer-bottom-bar .forecast-settings-toggle) { display: flex; align-items: center; justify-content: center; width: 100%; min-width: 0; min-height: 32px; box-sizing: border-box; padding: 4px 5px; border: 1px solid #9aa7a9; border-radius: 4px; background: #e7eded; color: #465255; font: 9px Arial,sans-serif; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer; }
    :global(.forecast-bottom-action[aria-expanded="true"]), :global(.forecast-drawer-bottom-bar .forecast-settings-toggle[aria-expanded="true"]) { border-color: #1385a0; background: #d8eef2; color: #07566a; }
    :global(.forecast-saved-routes .route-snapshot-saved) { border-color: #16764f; background: #178653; color: #fff; font-weight: 600; touch-action: manipulation; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; }
    :global(.forecast-saved-routes .route-snapshot-saved:active) { background: #116d43; }
    :global(.forecast-bottom-action:disabled) { opacity: .48; cursor: default; }
    :global(.forecast-bottom-speed) { flex-direction: column; gap: 1px; padding: 2px; cursor: pointer; }
    :global(.forecast-bottom-speed > span:first-child) { font-size: 8px; line-height: 1; }
    :global(.forecast-speed-reading) { display: inline-flex; align-items: baseline; justify-content: center; gap: 2px; line-height: 1; }
    :global(.forecast-speed-reading strong) { color: #26383c; font: 700 17px/1 Arial,sans-serif; font-variant-numeric: tabular-nums; }
    :global(.forecast-speed-reading small) { color: #687477; font: 9px Arial,sans-serif; }
    :global(.route-builder-forecast-drawer-host .forecast-drawer-bottom-bar > .forecast-bottom-action), :global(.route-builder-forecast-drawer-host .forecast-drawer-bottom-bar > .forecast-weather-settings-menu .forecast-settings-toggle), :global(.route-builder-forecast-drawer-host .forecast-saved-routes > .forecast-bottom-action) { min-height: 32px; padding: 2px 1px; font-size: 8px; }
    :global(.route-builder-forecast-drawer-host .forecast-bottom-speed) { gap: 2px; padding: 2px 1px; }
    :global(.route-builder-forecast-drawer-host .forecast-bottom-speed > span:first-child) { font-size: 7px; }
    :global(.route-builder-forecast-drawer-host .forecast-speed-reading strong) { font-size: 16px; }
    :global(.forecast-drawer-bottom-bar .forecast-weather-settings-menu) { display: block; width: 100%; min-width: 0; }
    :global(.forecast-drawer-bottom-bar .forecast-settings-toggle) { font-size: 9px; }
    :global(.forecast-drawer-bottom-bar .forecast-settings-toggle) { flex-direction: column; gap: 1px; line-height: 1.05; }
    :global(.forecast-drawer-bottom-bar .forecast-settings-toggle .forecast-version) { font: 7px/1 Arial,sans-serif; opacity: .78; }
    :global(.forecast-settings-map-tab) { padding: 8px 12px 12px; }
    :global(.label-settings--settings-tab) { position: static; display: block; width: auto; max-height: none; overflow: visible; margin: 0; transform: none; box-shadow: none; }
    :global(.label-settings--settings-tab > summary) { display: none; }
    :global(.label-settings--settings-tab) { border: 0; border-radius: 0; background: transparent; color: #465255; }
    :global(.label-settings--settings-tab .label-settings-grid) { grid-template-columns: minmax(0,1fr) minmax(0,1fr); gap: 8px; padding: 0; }
    :global(.label-settings--settings-tab .label-setting-group) { padding: 8px; border-color: #d3dcdd; border-radius: 5px; background: #f8f9f9; }
    :global(.label-settings--settings-tab .label-setting-group > strong) { color: #087f95; }
    :global(.label-settings--settings-tab .label-field-list) { border-color: #d3dcdd; background: #fff; }
    :global(.label-settings--settings-tab .label-field-list-heading) { color: #617477; }
    :global(.label-settings--settings-tab .label-field-row) { border-top-color: #e1e6e7; color: #465255; }
    :global(.label-settings--settings-tab .label-sort-handle) { color: #708386; }
    :global(.label-settings--settings-tab .label-position-box input) { accent-color: #087f95; }
    :global(.label-settings--settings-tab .label-font-size), :global(.label-settings--settings-tab .label-unit) { color: #465255; }
    :global(.label-settings--settings-tab .label-font-size output) { color: #354043; }
    :global(.label-settings--settings-tab .label-font-size input) { accent-color: #087f95; }
    :global(.label-settings--settings-tab .label-font-size input) { height: 32px; appearance: none; background: transparent; }
    :global(.label-settings--settings-tab .label-font-size input::-webkit-slider-runnable-track) { height: 4px; border-radius: 2px; background: #aebcbf; }
    :global(.label-settings--settings-tab .label-font-size input::-webkit-slider-thumb) { -webkit-appearance: none; width: 18px; height: 18px; margin-top: -7px; border: 0; border-radius: 50%; background: #087f95; box-shadow: 0 1px 4px #17252955; }
    :global(.label-settings--settings-tab .label-font-size input::-moz-range-track) { height: 4px; border-radius: 2px; background: #aebcbf; }
    :global(.label-settings--settings-tab .label-font-size input::-moz-range-thumb) { width: 18px; height: 18px; border: 0; border-radius: 50%; background: #087f95; box-shadow: 0 1px 4px #17252955; }
    :global(.label-settings--settings-tab .label-unit select) { border-color: #abb8ba; background: #fff; color: #354043; }
    :global(.label-settings--settings-tab .label-unit .distance-font-select) { min-height: 34px; }
    :global(.label-settings--settings-tab .label-sort-handle:focus-visible), :global(.label-settings--settings-tab input:focus-visible), :global(.label-settings--settings-tab select:focus-visible) { outline: 2px solid #087f95; outline-offset: 2px; }
    /* The settings node is moved out of the plugin panel; override its dark panel styles. */
    :global(.forecast-settings-map-tab .label-settings--settings-tab) { background: transparent !important; border: 0 !important; color: #465255 !important; }
    :global(.forecast-settings-map-tab .label-settings--settings-tab .label-settings-grid) { gap: 8px; padding: 0; }
    :global(.forecast-settings-map-tab .label-settings--settings-tab .label-setting-group) { align-content: start; grid-template-rows: auto auto auto; gap: 7px; padding: 8px; border: 1px solid #d4dddd; background: #fff; }
    :global(.forecast-settings-map-tab .label-settings--settings-tab .label-setting-group > strong) { color: #087f95; font-size: 10px; }
    :global(.forecast-settings-map-tab .label-settings--settings-tab .label-field-list) { padding: 4px; border: 1px solid #d5dede; background: #f6f8f8; }
    :global(.forecast-settings-map-tab .label-settings--settings-tab .label-field-list-heading) { color: #536c70; font-size: 8px; }
    :global(.forecast-settings-map-tab .label-settings--settings-tab .label-field-row) { min-height: 32px; border-top-color: #dce4e4; color: #354346; }
    :global(.forecast-settings-map-tab .label-settings--settings-tab .label-sort-handle) { color: #678c91; }
    :global(.forecast-settings-map-tab .label-settings--settings-tab .label-font-size), :global(.forecast-settings-map-tab .label-settings--settings-tab .label-unit), :global(.forecast-settings-map-tab .label-settings--settings-tab .size-picker) { color: #465255; }
    :global(.forecast-settings-map-tab .label-settings--settings-tab .label-font-size output), :global(.forecast-settings-map-tab .label-settings--settings-tab .size-picker output) { color: #354043; }
    :global(.forecast-settings-map-tab .label-settings--settings-tab .label-unit select) { background: #fff; border-color: #abb8ba; color: #354043; color-scheme: light; }
    :global(.forecast-settings-map-tab .label-settings--settings-tab .size-picker input) { accent-color: #087f95; }
    :global(.forecast-route-statistics) { flex: 0 0 auto; border: 1px solid #c5cfd0; border-radius: 4px; background: #e9eeee; color: #3d494b; }
    :global(.forecast-route-statistics > summary) { padding: 5px 8px; cursor: pointer; font: 700 10px Arial,sans-serif; }
    :global(.forecast-route-statistics-content) { display: flex; align-items: center; gap: 12px; padding: 0 8px 7px; color: #536164; font: 9px Arial,sans-serif; }
    :global(.forecast-route-statistics-content strong) { color: #26383c; font-size: 16px; font-variant-numeric: tabular-nums; }
    :global(.forecast-route-statistics-content strong small) { color: #536164; font-size: 9px; font-weight: 500; }
    :global(.forecast-drawer-close) { position: absolute; top: 8px; right: 8px; z-index: 2; display: grid; place-items: center; width: 32px; height: 32px; padding: 0; border: 1px solid #8b0000; border-radius: 50%; background: #b00000; color: #fff; font: 24px/1 Arial,sans-serif; cursor: pointer; box-shadow: 0 1px 4px #0005; }
    :global(.forecast-departure-control) { display: flex; flex-direction: column; gap: 5px; flex: 0 0 auto; padding: 2px 2px 0; border: 0; background: transparent; }
    :global(.forecast-departure-labels) { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    :global(.forecast-departure-labels > span) { flex: 0 0 auto; max-width: 25%; padding: 3px 7px; border-radius: 4px; background: #c69b2d; color: #fff; font-size: 10px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    :global(.forecast-departure-start-group) { display: flex; align-items: center; gap: 4px; flex: 0 0 auto; max-width: none !important; padding: 0 !important; background: transparent !important; overflow: visible !important; }
    :global(.forecast-departure-labels .forecast-departure-start) { max-width: none; padding: 3px 7px; border-radius: 4px; background: #c69b2d; color: #fff; font-size: 10px; font-weight: 700; white-space: nowrap; }
    :global(.forecast-departure-step) { display: inline-grid; place-items: center; width: 22px; height: 22px; flex: 0 0 22px; padding: 0; border: 1px solid #a98224; border-radius: 50%; background: #c69b2d; color: #fff; font: 700 15px/1 Arial,sans-serif; cursor: pointer; }
    :global(.forecast-departure-step:hover:not(:disabled)), :global(.forecast-departure-step:focus-visible) { border-color: #87691c; background: #ae8522; outline: 2px solid #e8d69d; outline-offset: 1px; }
    :global(.forecast-departure-step:disabled) { opacity: .45; cursor: default; }
    :global(.forecast-valid-departure-controls) { display: inline-flex; align-items: center; gap: 3px; flex: 0 0 auto; }
    :global(.forecast-valid-departure-step) { display: inline-grid; place-items: center; width: 20px; height: 22px; padding: 0; border: 1px solid #a98224; border-radius: 4px; background: #c69b2d; color: #fff; font: 700 14px/1 Arial,sans-serif; cursor: pointer; }
    :global(.forecast-valid-departure-step:hover:not(:disabled)), :global(.forecast-valid-departure-step:focus-visible) { border-color: #87691c; background: #ae8522; outline: 2px solid #e8d69d; outline-offset: 1px; }
    :global(.forecast-valid-departure-step:disabled) { opacity: .4; cursor: default; }
    :global(.forecast-departure-speed) { display: inline-flex; align-items: center; gap: 4px; flex: 0 0 auto; color: #586366; font: 9px Arial,sans-serif; white-space: nowrap; }
    :global(.forecast-departure-speed-input) { display: inline-flex; align-items: center; width: 65px; height: 22px; padding: 0 5px; border: 1px solid #c3cbcd; border-radius: 4px; background: #fff; }
    :global(.forecast-departure-speed-input input) { box-sizing: border-box; width: 100%; min-width: 0; padding: 0; border: 0; outline: 0; background: transparent; color: #354043; font: 10px Arial,sans-serif; font-variant-numeric: tabular-nums; }
    :global(.forecast-departure-speed-input small) { color: #687477; font: 9px Arial,sans-serif; }
    :global(.route-analysis-ruler) { position: absolute; z-index: 1; top: -25px; left: 0; right: 0; height: 16px; margin: 0; border-bottom: 1px solid #7e888a; pointer-events: none; }
    :global(.route-analysis-day-label) { position: absolute; bottom: 2px; padding: 0 !important; border: 0 !important; border-radius: 0 !important; background: transparent !important; color: #50595b !important; font-size: 8px; font-weight: 400; white-space: nowrap; transform: translateX(-50%); }
    :global(.route-analysis-track) { position: relative; align-self: stretch; width: 100%; flex: 0 0 14px; min-width: 44px; height: 14px; margin: 27px 0 0; border-radius: 8px; background: #45484a; }
    :global(.route-analysis-grid) { position: absolute; z-index: 1; inset: 0; pointer-events: none; }
    :global(.route-analysis-track span.route-analysis-division) { position: absolute; top: 1px; bottom: 1px; width: 1px !important; min-width: 0 !important; max-width: none !important; height: auto; padding: 0 !important; border: 0 !important; border-radius: 0 !important; background: #cbd2d4 !important; opacity: .32; transform: translateX(-.5px); }
    :global(.route-analysis-track span.route-analysis-day-boundary) { position: absolute; top: 0; bottom: 0; width: 2px !important; min-width: 0 !important; max-width: none !important; height: auto; padding: 0 !important; border: 0 !important; border-radius: 0 !important; background: #f5f7f7 !important; opacity: .95; box-shadow: 0 0 1px #192225; transform: translateX(-1px); }
    :global(.route-analysis-track span.route-analysis-slot) { position: absolute; z-index: 2; top: 4px; display: block; width: var(--departure-marker-size, 5px) !important; min-width: 0 !important; max-width: none !important; height: var(--departure-marker-size, 5px) !important; padding: 0 !important; border: 0 !important; border-radius: 50% !important; pointer-events: none; }
    :global(.route-analysis-track span.route-analysis-slot.is-pass) { background: var(--departure-quality-color, #45c768) !important; border: 1px solid #23463b !important; box-shadow: 0 0 0 1px #ffffffb8; }
    :global(.route-analysis-track span.route-analysis-slot.is-optimal) { z-index: 4; box-shadow: 0 0 0 2px #fff, 0 0 6px #18232699; }
    :global(.route-analysis-track span.route-analysis-slot.is-fail), :global(.route-analysis-track span.route-analysis-slot.is-unknown) { display: none !important; }
    :global(.forecast-departure-control) { position: relative; gap: 2px; padding: 0; border: 0; box-sizing: border-box; }
    :global(.route-builder-forecast-drawer-host .forecast-departure-control) { margin-right: -5px; margin-left: -5px; }
    :global(.departure-timebar-frame) { position: relative; width: 100%; min-width: 0; }
    :global(.departure-timebar-scroll) { width: 100%; min-width: 0; overflow-x: auto; overflow-y: hidden; scrollbar-width: none; touch-action: pan-x; }
    :global(.departure-timebar-scroll) { cursor: grab; }
    :global(.departure-timebar-scroll.is-dragging) { cursor: grabbing; }
    :global(.departure-timebar-scroll::-webkit-scrollbar) { display: none; width: 0; height: 0; }
    :global(.departure-timebar) { position: relative; height: 58px; box-sizing: border-box; user-select: none; -webkit-user-select: none; }
    :global(.departure-timebar-indicator) { position: absolute; z-index: 6; inset: 0; pointer-events: none; }
    :global(.departure-timebar-callout) { position: absolute; top: auto; bottom: calc(100% + 1px); left: 50%; z-index: 4; display: grid; gap: 2px; width: max-content; max-width: min(310px, calc(100vw - 48px)); overflow: hidden; padding: 4px 8px; border-radius: 5px; background: #c69b2d; color: #fff; font: 700 9px/1.2 Arial,sans-serif; text-align: center; text-overflow: ellipsis; white-space: normal; box-shadow: 0 1px 4px #0003; transform: translateX(-50%); pointer-events: none; }
    :global(.departure-timebar-callout) { pointer-events: auto; cursor: ns-resize; touch-action: none; user-select: none; -webkit-user-select: none; }
    :global(.departure-timebar-callout small) { font: 700 8px/1.1 Arial,sans-serif; opacity: .95; }
    :global(.departure-timebar-callout-tail) { position: absolute; top: -7px; left: 50%; z-index: 4; width: 0; height: 0; border-top: 6px solid #c69b2d; border-right: 6px solid transparent; border-left: 6px solid transparent; transform: translateX(-50%); }
    :global(.departure-timebar-days) { position: absolute; top: 0; left: 0; right: 0; height: 21px; }
    :global(.departure-day-band) { position: absolute; top: 0; display: grid; place-items: center; height: 21px; box-sizing: border-box; padding: 0 3px; border-right: 2px solid #697174; background: #45484a; color: #f1f3f3; font: 700 12px Arial,sans-serif; white-space: nowrap; overflow: hidden; }
    :global(.departure-timebar-hours) { position: absolute; top: 22px; left: 0; right: 0; height: 22px; background: #e1e5e5; }
    :global(.departure-hour-tick) { position: absolute; top: 0; display: flex; flex-direction: column; align-items: center; width: 20px; color: #657073; font: 10px/1 Arial,sans-serif; transform: translateX(-50%); }
    :global(.departure-hour-tick i) { display: block; width: 1px; height: 5px; margin-bottom: 2px; background: #788184; }
    :global(.departure-timebar .route-analysis-track) { position: absolute; top: 44px; left: 0; height: 8px; min-width: 0; margin: 0; border-radius: 0; background: #e1e5e5; }
    :global(.departure-timebar .route-analysis-grid) { position: absolute; inset: 0; pointer-events: none; }
    :global(.departure-timebar .route-analysis-slot) { top: 1px; height: 6px; z-index: 2; }
    :global(.departure-timebar .route-analysis-track span.route-analysis-slot.is-pass) { background: var(--departure-quality-color, #1eaa51) !important; }
    :global(.departure-timebar-cursor) { position: absolute; top: 0; bottom: 16px; left: 50%; z-index: 3; width: 2px; background: #c69b2d; box-shadow: 0 0 2px #fff; transform: translateX(-1px); }
    :global(.departure-timebar-cursor::after) { content: ''; position: absolute; bottom: -12px; left: 50%; box-sizing: border-box; width: 12px; height: 12px; border: 2px solid #fff; border-radius: 50%; background: #c69b2d; box-shadow: 0 1px 4px #18232666; transform: translateX(-50%); }
    :global(.forecast-departure-control.is-live .departure-timebar-scroll) { overflow-x: hidden; touch-action: none; cursor: default; }
    :global(.forecast-departure-control.is-live .departure-timebar-callout), :global(.forecast-departure-control.is-live .departure-timebar-cursor), :global(.forecast-departure-control.is-live .departure-timebar-cursor::after) { background: #188b67; }
    :global(.forecast-departure-control.is-live .departure-timebar-callout-tail) { border-top-color: #188b67; }
    :global(.forecast-departure-control.is-live .departure-day-band) { background: #286f59; border-right-color: #78a79a; }
    :global(.forecast-departure-control.is-live .departure-timebar-hours), :global(.forecast-departure-control.is-live .route-analysis-track) { background: #d5eade; }
    :global(.forecast-table-scroll) { flex: 1 1 auto; width: 100%; max-width: 100%; min-width: 0; min-height: 0; overflow-x: auto; overflow-y: auto; border: 1px solid #c3cbcd; border-radius: 3px; scrollbar-color: #899597 #dce1e2; scrollbar-width: thin; }
    :global(.forecast-table-scroll) { scrollbar-width: none; }
    :global(.forecast-table-scroll::-webkit-scrollbar) { display: none; width: 0; height: 0; }
    :global(.forecast-table-scroll td[data-forecast-index]) { cursor: grab; user-select: none; }
    :global(.forecast-table-scroll.is-table-dragging td[data-forecast-index]) { cursor: grabbing; }
    :global(.forecast-table) { width: max-content; min-width: 100%; table-layout: fixed; border-collapse: separate; border-spacing: 0; color: #454d4f; font: 11px/1.25 Arial,sans-serif; font-variant-numeric: tabular-nums; text-align: center; }
    :global(.forecast-table th), :global(.forecast-table td) { box-sizing: border-box; padding: 4px 5px; border-right: 1px solid #d5dcdd; border-bottom: 1px solid #d5dcdd; white-space: nowrap; }
    :global(.forecast-table .forecast-sample-head), :global(.forecast-table tbody td[data-forecast-index]) { padding: 3px 2px; }
    :global(.forecast-table thead th) { background: #d6dcdd; color: #354043; }
    :global(.forecast-table .forecast-row-label) { position: sticky; left: 0; z-index: 1; background: #e5e9ea; color: #596365; text-align: left; }
    :global(.forecast-table thead .forecast-row-label) { z-index: 2; background: #d6dcdd; }
    :global(.forecast-table .forecast-row-label) { min-width: 72px; }
    :global(.forecast-table tbody tr.forecast-field-row th), :global(.forecast-table tbody tr.forecast-field-row td) { padding-top: 2px; padding-bottom: 2px; }
    :global(.forecast-table tbody .forecast-row-label) { height: 28px; max-height: 28px; overflow: hidden; }
    :global(.forecast-table .forecast-stat-heading) { text-align: left; }
    :global(.forecast-table .forecast-stat-cell) { padding: 4px 3px; background: #e5e9ea; white-space: normal; vertical-align: middle; }
    :global(.forecast-table .forecast-stat-cell small), :global(.forecast-table .forecast-stat-cell b) { display: block; }
    :global(.forecast-table .forecast-stat-cell small) { margin-bottom: 1px; color: #738083; font-size: 8px; line-height: 1; }
    :global(.forecast-table .forecast-stat-cell b) { color: #3e484a; font-size: 10px; line-height: 1; overflow-wrap: anywhere; }
    :global(.forecast-condition-row-label) { display: flex; align-items: center; justify-content: space-between; gap: 4px; width: 100%; }
    :global(.forecast-field-meta) { display: flex; flex: 1 1 auto; min-width: 0; flex-direction: column; align-items: flex-start; justify-content: center; gap: 1px; overflow: hidden; }
    :global(.window-condition-row-label) { display: flex; align-items: center; gap: 4px; width: 100%; }
    :global(.forecast-field-drag) { display: inline-grid; place-items: center; width: 24px; min-width: 24px; height: 20px; flex: 0 0 24px; margin: -3px 0; color: #718083; font-size: 15px; cursor: grab; touch-action: none; user-select: none; -webkit-user-select: none; }
    :global(.forecast-field-name) { display: block; flex: 0 0 auto; min-width: 42px; max-width: 100%; overflow: hidden; color: inherit; font-size: 9px; line-height: 1.05; text-overflow: ellipsis; white-space: nowrap; }
    :global(.forecast-model-badge) { display: inline-flex; align-items: center; max-width: 100%; flex: 0 0 auto; padding: 1px 3px; border-radius: 3px; font: 700 7px/1 Arial,sans-serif; white-space: nowrap; }
    :global(.forecast-model-badge.is-gfs) { background: #fff0c2; color: #946300; }
    :global(.forecast-model-badge.is-gfs-waves) { background: #dcecf2; color: #24677c; }
    :global(.forecast-model-badge.is-ecmwf) { background: #eadcf5; color: #63328a; }
    :global(.forecast-model-badge.is-ecmwf-waves) { background: #f3dce9; color: #8a315b; }
    :global(.forecast-model-badge.is-mblue) { background: #dcefe9; color: #236b55; }
    :global(.forecast-model-badge.is-icon) { background: #e1e8fb; color: #354d9b; }
    :global(.forecast-model-badge.is-arome) { background: #fae6d6; color: #9a5420; }
    :global(.forecast-model-badge.is-cmems) { background: #d9eafb; color: #245b8a; }
    :global(.window-condition-open) { display: inline-grid; place-items: center; width: 19px; height: 19px; flex: 0 0 19px; padding: 0; border: 1px solid #9ca9ab; border-radius: 50%; background: #f7f9f9; color: #596568; font: 13px/1 Arial,sans-serif; cursor: pointer; }
    :global(.window-condition-open:hover), :global(.window-condition-open:focus-visible) { border-color: #078caf; color: #007d9e; outline: none; }
    :global(.window-condition-open.is-configured) { border-color: #078caf; background: #d8f4fa; color: #006b87; }
    :global(.window-condition-open.is-pass) { border-color: #22974b; background: #d8f3df; color: #16843c; }
    :global(.window-condition-open.is-fail) { border-color: #c74337; background: #f8deda; color: #b72f25; }
    :global(.forecast-wind-group-toggle) { display: inline-grid; place-items: center; width: 19px; height: 19px; flex: 0 0 19px; padding: 0; border: 1px solid #9ca9ab; border-radius: 50%; background: #f7f9f9; color: #596568; font: 12px/1 Arial,sans-serif; cursor: pointer; }
    :global(.forecast-wind-group-toggle[aria-expanded="true"]) { border-color: #078caf; background: #d8eef2; color: #07566a; }
    :global(.forecast-model-badge.is-wind-average) { color: #07566a; background: #d7eef2; }
    :global(.forecast-field-remove) { display: inline-grid; place-items: center; width: 17px; height: 19px; flex: 0 0 17px; padding: 0; border: 1px solid #bd7769; border-radius: 3px; background: transparent; color: #a54a3c; font: 15px/1 Arial,sans-serif; cursor: pointer; }
    :global(.forecast-field-remove:hover) { background: #f7dfda; }
    :global(.forecast-field-row) { cursor: grab; }
    :global(.forecast-table tr.forecast-wind-model-detail > .forecast-row-label) { padding-left: 15px !important; }
    :global(.forecast-field-row.is-dragging) { opacity: .45; }
    :global(.forecast-field-row.is-drop-target) { outline: 2px dashed #078caf; outline-offset: -2px; }
    :global(.window-condition-backdrop) { position: fixed; inset: 0; z-index: 2147483647; display: grid; place-items: center; padding: 12px; background: #16212688; }
    :global(.direction-wheel-box) { display: grid; justify-items: center; gap: 6px; margin: 8px 0; }
    :global(.direction-wheel) { width: 190px; height: 190px; position: relative; border-radius: 50%; overflow: hidden; background: #778387; }
    :global(.direction-sector) { position: absolute; inset: 0; width: 100%; height: 100%; padding: 0; border: 0; background: #c6d0d1; color: #263238; cursor: pointer; }
    :global(.direction-sector.is-selected) { background: #56bfd0; color: #102d31; }
    :global(.direction-sector span) { position: absolute; transform: translate(-50%, -50%); font: bold 13px Arial,sans-serif; pointer-events: none; }
    :global(.direction-sector:focus-visible) { outline: 3px solid #ffbc42; outline-offset: -4px; }
    :global(.arrival-hours-grid) { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 4px; }
    :global(.arrival-days-grid) { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px; }
    :global(.window-condition-dialog .arrival-choice) { min-width: 0; min-height: 36px; padding: 4px 1px; border: 1px solid #69777a; border-radius: 4px; background: #252b2d; color: #edf1f2; font: 10px Arial,sans-serif; cursor: pointer; }
    :global(.window-condition-dialog .arrival-choice.is-selected) { border-color: #28aa6c; background: #146347; color: #fff; }
    :global(.window-condition-dialog .arrival-day-preset) { justify-self: start; min-height: 32px; }
    :global(.window-condition-dialog) { box-sizing: border-box; width: min(360px, 100%); max-width: calc(100vw - 24px); max-height: calc(100vh - 24px); overflow-x: hidden; overflow-y: auto; border: 1px solid #536064; border-radius: 7px; background: #343b3e; color: #edf1f2; box-shadow: 0 8px 28px #0008; }
    :global(.window-condition-dialog > header) { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 9px 11px; border-bottom: 1px solid #4e585b; font-size: 12px; }
    :global(.window-condition-dialog > header button) { width: 23px; height: 23px; border: 1px solid #687477; border-radius: 50%; background: #252b2d; color: #e8eeee; font: 18px/1 Arial,sans-serif; cursor: pointer; }
    :global(.window-condition-dialog .condition-content) { display: grid; gap: 8px; padding: 10px; color: #dce3e5; font: 10px Arial,sans-serif; }
    :global(.window-condition-dialog .condition-range) { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    :global(.window-condition-dialog .condition-range label) { display: flex; align-items: center; gap: 4px; min-width: 0; color: #bac4c6; }
    :global(.window-condition-dialog .condition-range select), :global(.window-condition-dialog .condition-range input[type="time"]) { box-sizing: border-box; width: 100%; min-width: 0; padding: 6px; border: 1px solid #596467; border-radius: 3px; background: #252b2d; color: #edf1f2; font: inherit; }
    :global(.sky-state-options) { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 5px; }
    :global(.sky-state-toggle) { display: flex; align-items: center; gap: 6px; min-width: 0; padding: 6px; border: 1px solid #596467; border-radius: 4px; background: #252b2d; color: #edf1f2; font-size: 10px; cursor: pointer; }
    :global(.sky-state-toggle:has(input:checked)) { border-color: #27a967; background: #153a31; }
    :global(.sky-state-toggle input) { width: 15px; height: 15px; margin: 0; accent-color: #18a65b; }
    :global(.sky-state-toggle-icon) { display: grid; place-items: center; width: 24px; height: 24px; flex: 0 0 24px; }
    :global(.sky-state-toggle-icon .forecast-icon) { width: 24px; height: 24px; }
    :global(.sky-state-emoji) { font-size: 19px; line-height: 1; }
    :global(.condition-slider-summary) { color: #e4e8e9; font-size: 12px; font-weight: 700; }
    :global(.condition-slider-control) { position: relative; height: 24px; margin: 4px 8px 0; touch-action: none; }
    :global(.condition-slider-track), :global(.condition-slider-fill) { position: absolute; top: 8px; height: 8px; border-radius: 8px; }
    :global(.condition-slider-track) { left: 9px; right: 9px; background: #f7f8f7; }
    :global(.condition-slider-fill) { background: #b58c42; }
    :global(.condition-slider-control input[type="range"]) { position: absolute; inset: 0; width: 100%; height: 24px; margin: 0; appearance: none; background: transparent; pointer-events: none; }
    :global(.condition-slider-control input[data-condition-slider="min"]) { z-index: 2; }
    :global(.condition-slider-control input[data-condition-slider="max"]) { z-index: 3; }
    :global(.condition-slider-control input[type="range"]::-webkit-slider-runnable-track) { height: 8px; background: transparent; }
    :global(.condition-slider-control input[type="range"]::-moz-range-track) { height: 8px; background: transparent; }
    :global(.condition-slider-control input[type="range"]::-webkit-slider-thumb) { width: 18px; height: 18px; margin-top: -5px; appearance: none; border: 0; border-radius: 50%; background: #c49a3c; box-shadow: 0 1px 4px #0008; cursor: grab; pointer-events: auto; }
    :global(.condition-slider-control input[type="range"]::-moz-range-thumb) { width: 18px; height: 18px; border: 0; border-radius: 50%; background: #c49a3c; box-shadow: 0 1px 4px #0008; cursor: grab; pointer-events: auto; }
    :global(.condition-slider-control input[type="range"]:active::-webkit-slider-thumb), :global(.condition-slider-control input[type="range"]:active::-moz-range-thumb) { cursor: grabbing; }
    :global(.condition-slider-ticks) { display: flex; justify-content: space-between; margin: 0 8px; color: #aab5b7; font-size: 9px; }
    :global(.window-condition-dialog small) { color: #aab5b7; line-height: 1.4; }
    :global(.window-condition-dialog > footer) { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 0 10px 10px; }
    :global(.condition-clear-button) { padding: 6px 8px; border: 1px solid #687477; border-radius: 4px; background: #303638; color: #d5dddf; font: 10px Arial,sans-serif; cursor: pointer; }
    :global(.condition-clear-button:hover) { border-color: #98a5a8; background: #41494c; }
    :global(.forecast-sample-head) { position: relative; }
    :global(.forecast-table td[data-column-index]) { position: relative; }
    :global(.forecast-column-resize-handle) { position: absolute; top: 0; right: -5px; z-index: 5; display: block; width: 10px; height: 100%; min-width: 0; padding: 0; border: 0; background: transparent; cursor: col-resize; touch-action: none; }
    :global(.forecast-column-resize-handle[data-resize-column]:not([data-resize-column="0"])) { display: none !important; }
    :global(.route-builder-gps-label-button) { position: absolute; z-index: 2147483646; top: -52px; right: 8px; width: 42px; min-width: 42px; height: 42px; padding: 0; border: 1px solid #fff; border-radius: 50%; background: #087bd1; color: #fff; font: 700 14px/1 Arial,sans-serif; box-shadow: 0 2px 7px #14252c88; cursor: default; pointer-events: auto; touch-action: manipulation; }
    :global(.route-builder-gps-label-button[aria-pressed="true"]) { background: #188b67; }
    :global(.route-builder-gps-label-button svg) { vertical-align: middle; }
    :global(.route-builder-live-button) { left: 8px; right: auto; }
    :global(.route-builder-live-button[hidden]) { display: none; }
    :global(.route-builder-center-button) { top: -100px; width: 42px; min-width: 42px; padding: 0; display: grid; place-items: center; }
    :global(.route-builder-center-button[hidden]) { display: none; }
    :global(.route-builder-zoom-button) { font-size: 27px; font-weight: 400; }
    :global(.route-builder-map-type) { position: absolute; z-index: 2147483646; top: -152px; right: 8px; width: 42px; height: 42px; pointer-events: auto; touch-action: manipulation; }
    :global(.route-builder-map-type-button) { position: static; display: grid; place-items: center; }
    :global(.route-builder-map-type-menu) { position: absolute; right: 50px; top: 0; z-index: 2; width: 176px; padding: 4px; border-radius: 8px; background: #f4f6f6; box-shadow: 0 2px 8px #14252c88; pointer-events: auto; touch-action: manipulation; }
    :global(.route-builder-map-type-menu[hidden]) { display: none; }
    :global(.route-builder-map-type-menu button) { display: block; width: 100%; box-sizing: border-box; padding: 10px; border: 0; border-radius: 5px; background: transparent; color: #27383d; text-align: left; white-space: nowrap; font: 14px Arial,sans-serif; pointer-events: auto; touch-action: manipulation; }
    :global(.route-builder-map-type-menu button[aria-pressed="true"]) { background: #d5ece9; color: #066d63; font-weight: 700; }
    :global(.route-builder-zoom-in) { top: -256px; }
    :global(.route-builder-zoom-out) { top: -204px; }
    :global(.route-builder-gps-position-icon) { border: 0; background: transparent; }
    :global(.route-builder-gps-position-icon .gps-position-halo) { position: absolute; inset: 0; display: block; border: 2px solid #fff; border-radius: 50%; background: #087bd133; box-shadow: 0 0 0 2px #087bd1, 0 1px 8px #102b3b99; }
    :global(.route-builder-gps-position-icon .gps-position-dot) { position: absolute; inset: 9px; display: block; border: 2px solid #fff; border-radius: 50%; background: #087bd1; box-shadow: 0 1px 3px #102b3b99; }
    :global(.route-builder-gps-position-icon svg) { display: block; filter: drop-shadow(0 1px 2px #102b3b99); }
    :global(.route-wind-indicator) { position: absolute; z-index: 650; width: var(--wind-indicator-size, 26px); height: var(--wind-indicator-height, 30px); transform: translate(-50%, -50%); pointer-events: none; }
    :global(.bar-indicator) { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: stretch; transform-origin: center; pointer-events: none; }
    :global(.bar-indicator-name) { position: relative; height: var(--bar-name-length); flex: none; overflow: hidden; background: #111; }
    :global(.bar-indicator-data) { position: relative; height: var(--bar-data-length); flex: none; overflow: hidden; }
    :global(.bar-indicator-data-line) { position: absolute; left: 50%; top: 50%; display: flex; align-items: center; gap: 0.35em; width: max-content; white-space: nowrap; font-size: var(--bar-text-size, 10px); }
    :global(.bar-indicator-name-text), :global(.bar-indicator-direction), :global(.bar-indicator-value) { display: block; flex: none; white-space: nowrap; font: 700 var(--bar-text-size, 10px)/1.1 Arial,sans-serif; }
    :global(.bar-indicator-name-text) { position: absolute; left: 50%; top: 50%; color: #fff; }
    :global(.bar-indicator-direction), :global(.bar-indicator-value) { color: #000; }
    :global(.bar-indicator-direction[hidden]), :global(.bar-indicator-value[hidden]) { display: none; }
    :global(.bar-indicator-tip) { width: 100%; height: var(--bar-tip-height); flex: none; display: block; overflow: visible; }
    :global(.route-wind-rose) { position: absolute; z-index: 640; transform: translate(-50%, -50%); pointer-events: none; }
    :global(.route-wind-rose[hidden]) { display: none; }
    :global(.route-heading-degrees) { position: absolute; z-index: 645; display: grid; place-items: center; box-sizing: border-box; transform: translate(-50%, -50%); overflow: hidden; border: 2px solid #202426; border-radius: 6px; background: #f7f7f2; color: #202426; font-family: Arial,sans-serif; font-weight: 700; line-height: 1; font-variant-numeric: tabular-nums; white-space: nowrap; box-shadow: 0 1px 3px #17252988; pointer-events: none; }
    :global(.route-heading-degrees[hidden]) { display: none; }
    :global(.route-wind-indicator[hidden]) { display: none; }
    :global(.route-wind-indicator > svg), :global(.route-indicator-letter) { position: absolute; inset: 0; width: 100%; height: 100%; }
    :global(.route-wind-indicator span) { position: absolute; inset: 0; display: block; pointer-events: none; }
    :global(.route-wind-indicator .route-wind-degrees) { position: absolute; top: 50%; left: 50%; padding: 1px 3px; border-radius: 3px; background: #263238cc; color: #fff; font: 700 var(--wind-indicator-text-size, 10px)/1.2 Arial,sans-serif; white-space: nowrap; text-shadow: 0 1px 1px #000; }
    :global(.route-wind-indicator .route-wind-degrees[hidden]) { display: none; }
    :global(.route-indicator-value) { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); white-space: nowrap; padding: 1px 3px; border-radius: 3px; background: #263238cc; color: #fff; font: 700 var(--wind-indicator-text-size, 10px)/1.2 Arial,sans-serif; }
    :global(.route-indicator-value[hidden]) { display: none; }
    :global(.route-navigation-dashboard) { position: fixed; z-index: 2147483000; top: max(8px, env(safe-area-inset-top)); left: 50%; transform: translateX(-50%); box-sizing: border-box; display: grid; grid-template-columns: 24px minmax(0,1fr) minmax(0,1.08fr) minmax(0,1fr) 14px; width: min(520px, calc(100vw - 12px)); min-height: 92px; padding: 3px 2px; border: 1px solid #aab5b8; border-radius: 10px; background: #edf0f0f5; color: #343c3e; box-shadow: 0 2px 7px #14252c66; font-family: Arial,sans-serif; }
    :global(.route-navigation-dashboard[hidden]) { display: none; }
    :global(.route-nav-side-label) { writing-mode: vertical-rl; transform: rotate(180deg); align-self: center; justify-self: center; font-size: 9px; font-weight: 700; color: #566467; white-space: nowrap; }
    :global(.route-nav-waypoint-picker) { position: relative; display: grid; place-items: center; cursor: pointer; }
    :global(.route-nav-waypoint-picker select) { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; }
    :global(.route-nav-side) { display: grid; grid-template-rows: repeat(3,1fr); min-width: 0; }
    :global(.route-nav-side div) { display: flex; align-items: center; justify-content: center; text-align: center; gap: 4px; min-width: 0; padding: 0 2px; border-bottom: 1px solid #cbd3d4; color: #378c82; font-size: 13px; }
    :global(.route-nav-side div:last-child) { border-bottom: 0; }
    :global(.route-nav-side b) { min-width: 0; color: #343c3e; white-space: nowrap; font-size: clamp(10px, 3vw, 15px); }
    :global(.route-nav-center) { display: flex; flex-direction: column; align-items: stretch; text-align: center; }
    :global(.route-nav-speed) { display: flex; flex: 1; flex-direction: column; justify-content: center; align-items: center; border: 1px solid #839195; border-radius: 7px; line-height: 1; }
    :global(.route-nav-speed-current) { display: flex; justify-content: center; align-items: center; gap: 2px; font-size: clamp(25px, 8vw, 42px); font-weight: bold; }
    :global(.route-nav-speed-average) { padding: 2px 0 3px; color: #566467; font-size: 10px; white-space: nowrap; }
    :global(.route-nav-speed small) { align-self: flex-start; padding-top: 8px; font-size: 10px; }
    :global(.route-nav-heading) { padding: 2px 0; font-size: clamp(20px, 5.8vw, 30px); font-weight: bold; line-height: 1; }
    :global(.forecast-column-resize-handle:hover), :global(.forecast-column-resize-handle:focus-visible) { background: transparent; outline: none; }
    :global(body.forecast-column-resizing), :global(body.forecast-column-resizing *) { cursor: col-resize !important; user-select: none !important; }
    :global(.forecast-sample-head b), :global(.forecast-sample-head small), :global(.forecast-sample-head em) { display: block; }
    :global(.forecast-sample-head b) { color: #9d3426; font-size: 8px; }
    :global(.forecast-sample-head small) { margin-top: 1px; color: #485254; font-size: 7px; line-height: 1.1; }
    :global(.forecast-date-time) { display: grid; justify-items: center; gap: 1px; line-height: 1.1; }
    :global(.forecast-date-time small) { color: #687477; font: 8px/1.1 Arial,sans-serif; }
    :global(.forecast-date-time b) { color: inherit; font: 700 9px/1.1 Arial,sans-serif; }
    :global(.forecast-table tbody tr:nth-child(even) td) { background: #e9eded; }
    :global(.forecast-table tr[data-route-field-row="rain"] td[data-forecast-index]), :global(.forecast-table tr[data-route-field-row="ecmwfRain"] td[data-forecast-index]), :global(.forecast-table tr[data-route-field-row="mblueRain"] td[data-forecast-index]), :global(.forecast-table tr[data-route-field-row="iconRain"] td[data-forecast-index]), :global(.forecast-table tr[data-route-field-row="aromeRain"] td[data-forecast-index]), :global(.forecast-table tr[data-route-field-row="rainAverage"] td[data-forecast-index]) { background: #e9eded; color: #314ba9; }
    :global(.forecast-icon) { display: inline-block; width: 24px; height: 24px; object-fit: contain; vertical-align: middle; }
    :global(.forecast-arrow) { display: inline-block; margin-right: 1px; color: #388d80; font-size: 10px; }
    :global(.forecast-location-message) { margin: -4px 0 0; color: #0874bf; font: 9px/1.25 Arial,sans-serif; }
    :global(.forecast-location-message[hidden]) { display: none; }
    :global(.forecast-table .route-waypoint-label), :global(.forecast-table .route-waypoint-track) { box-sizing: border-box; height: 22px; padding: 2px 3px; border-right: 1px solid #727a7c; border-bottom: 0; background: #45484a; color: #e9eded; }
    :global(.forecast-table .route-waypoint-label) { padding-left: 8px; text-align: left; font-size: 9px; font-weight: 600; }
    :global(.forecast-table .route-waypoint-track) { position: relative; padding: 0; }
    :global(.forecast-table .route-waypoint-dot) { position: absolute; top: 50%; display: inline-grid; place-items: center; width: 13px; height: 13px; border: 1px solid #fff; border-radius: 50%; color: #fff; font: 700 8px/1 Arial,sans-serif; box-shadow: 0 0 2px #0008; transform: translate(-50%, -50%); }
    :global(.forecast-table .route-waypoint-dot.is-start) { background: #1da875; }
    :global(.forecast-table .route-waypoint-dot.is-intermediate) { background: #078bab; }
    :global(.forecast-table .route-waypoint-dot.is-destination) { background: #d75b4c; }
    :global(.forecast-table .route-waypoint-boat) { position: absolute; z-index: 2; top: 50%; width: 20px; height: 20px; transform: translate(-50%, -50%); pointer-events: none; filter: drop-shadow(0 1px 2px #0009); }
    :global(.forecast-table .route-waypoint-boat[hidden]) { display: none; }
    :global(.forecast-table .route-waypoint-boat svg) { display: block; width: 100%; height: 100%; }
    :global(.route-builder-segment-info) { position: absolute; top: -12px; left: 0; display: block; width: max-content; color: #fff; font: 700 11px/20px Arial,sans-serif; text-align: center; white-space: nowrap; text-shadow: 0 1px 3px #526575, 0 0 5px #526575; transform-origin: center; }
    :global(.route-builder-distance-label) { position: absolute; top: 10px; left: 0; display: block; width: max-content; color: #fff; font-family: var(--route-distance-font, Roboto, Arial, sans-serif); font-size: 12px; font-weight: 700; font-style: normal; line-height: 22px; text-align: center; white-space: nowrap; text-shadow: 0 1px 3px #526575, 0 0 5px #526575; transform-origin: center; }


    /* Respect the user height setting on desktop, tablet and mobile. */
    :global(body.route-builder-forecast-open .route-builder-forecast-drawer-host) {
        height: auto !important;
        max-height: var(--route-drawer-max-height-vh, 58vh) !important;
        max-height: var(--route-drawer-max-height-dvh, 58dvh) !important;
    }
    :global(body.route-builder-forecast-open .route-builder-forecast-drawer-host .forecast-drawer) {
        height: auto !important;
        min-height: 0 !important;
        max-height: var(--route-drawer-max-height-vh, 58vh) !important;
        max-height: var(--route-drawer-max-height-dvh, 58dvh) !important;
        overflow: visible;
    }
    :global(body.route-builder-forecast-open .route-builder-forecast-drawer-host.is-height-collapsed .forecast-drawer) { overflow: hidden; }
    :global(body.route-builder-forecast-open .route-builder-forecast-drawer-host .forecast-table-scroll) {
        min-height: 0 !important;
        flex: 0 1 auto !important;
        max-height: max(0px, calc(var(--route-drawer-max-height-vh, 58vh) - 160px)) !important;
        max-height: max(0px, calc(var(--route-drawer-max-height-dvh, 58dvh) - 160px)) !important;
        overflow-y: auto !important;
    }

    /* On Windy's mobile fullscreen UI, the forecast replaces the route panel. */
    @media (max-width: 767px) {
        :global(body.route-builder-forecast-open .route-builder-forecast-drawer-host) {
            position: fixed !important;
            inset: auto 0 0 0 !important;
            width: 100vw !important;
            height: 33.333vh !important;
            height: 33.333dvh !important;
            max-width: none !important;
            max-height: 33.333vh !important;
            max-height: 33.333dvh !important;
        }
        :global(body.route-builder-forecast-open .forecast-drawer) {
            width: 100% !important;
            height: 100% !important;
            min-width: 0 !important;
            min-height: 0 !important;
            max-height: 100% !important;
            border-radius: 12px 12px 0 0 !important;
            padding: 0 5px 10px !important;
        }
        :global(body.route-builder-forecast-open .route-builder-forecast-drawer-host .forecast-drawer) {
            border-radius: 0 !important;
            padding: 0 5px max(48px, calc(10px + env(safe-area-inset-bottom, 0px))) !important;
        }
        :global(body.route-builder-forecast-open .forecast-departure-labels) {
            flex-wrap: wrap;
            justify-content: flex-start;
            gap: 4px 6px;
        }
        :global(body.route-builder-forecast-open .route-forecast-settings) {
            order: 5;
            flex: 1 1 100%;
            width: 100%;
            max-width: none;
        }
        :global(body.route-builder-forecast-open .forecast-departure-end) {
            order: 6;
            flex: 0 1 100%;
            max-width: none !important;
            text-align: right;
        }
        :global(body.route-builder-forecast-open .forecast-table-scroll) {
            flex: 1 1 auto !important;
            min-height: 0 !important;
            max-height: none !important;
        }
        :global(body.route-builder-forecast-open .route-builder-forecast-drawer-host) {
            height: auto !important;
            max-height: var(--route-drawer-max-height-vh, 58vh) !important;
            max-height: var(--route-drawer-max-height-dvh, 58dvh) !important;
        }
        :global(body.route-builder-forecast-open .route-builder-forecast-drawer-host .forecast-drawer) {
            height: auto !important;
            min-height: 0 !important;
            max-height: var(--route-drawer-max-height-vh, 58vh) !important;
            max-height: var(--route-drawer-max-height-dvh, 58dvh) !important;
        }
        :global(body.route-builder-forecast-open .route-builder-forecast-drawer-host .forecast-table-scroll) {
            flex: 0 1 auto !important;
            max-height: max(0px, calc(var(--route-drawer-max-height-vh, 58vh) - 160px)) !important;
            max-height: max(0px, calc(var(--route-drawer-max-height-dvh, 58dvh) - 160px)) !important;
            overflow-y: auto !important;
        }
    }

</style>
