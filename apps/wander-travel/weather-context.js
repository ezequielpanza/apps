(() => {
  if (typeof marker === 'undefined' || typeof map === 'undefined') return;

  const contextItems = [...document.querySelectorAll('.context-list > div')];
  const timeValue = contextItems[0]?.querySelector('strong');
  const weatherValue = contextItems[1]?.querySelector('strong');
  const nextHourValue = contextItems[2]?.querySelector('strong');
  const nextHourLabel = contextItems[2]?.querySelector('span');

  if (!timeValue || !weatherValue || !nextHourValue) return;

  const WEATHER_LABELS = {
    0: 'Despejado',
    1: 'Mayormente despejado',
    2: 'Parcialmente nublado',
    3: 'Nublado',
    45: 'Niebla',
    48: 'Niebla con escarcha',
    51: 'Llovizna leve',
    53: 'Llovizna',
    55: 'Llovizna intensa',
    56: 'Llovizna helada leve',
    57: 'Llovizna helada',
    61: 'Lluvia leve',
    63: 'Lluvia',
    65: 'Lluvia intensa',
    66: 'Lluvia helada leve',
    67: 'Lluvia helada',
    71: 'Nieve leve',
    73: 'Nieve',
    75: 'Nieve intensa',
    77: 'Granizo fino',
    80: 'Chaparrones leves',
    81: 'Chaparrones',
    82: 'Chaparrones intensos',
    85: 'Nevadas leves',
    86: 'Nevadas intensas',
    95: 'Tormenta',
    96: 'Tormenta con granizo',
    99: 'Tormenta fuerte con granizo',
  };

  let timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  let lastFetchPosition = null;
  let lastFetchAt = 0;
  let loading = false;

  function weatherLabel(code) {
    return WEATHER_LABELS[Number(code)] || 'Condición variable';
  }

  function roundTemperature(value) {
    return Number.isFinite(Number(value)) ? `${Math.round(Number(value))} °C` : 'Sin dato';
  }

  function updateClock() {
    try {
      timeValue.textContent = new Intl.DateTimeFormat('es-AR', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(new Date());
    } catch {
      timeValue.textContent = new Intl.DateTimeFormat('es-AR', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(new Date());
    }
  }

  function findNextHour(data) {
    const times = data?.hourly?.time || [];
    if (!times.length) return null;

    const currentTime = data?.current?.time ? new Date(data.current.time).getTime() : Date.now();
    let index = times.findIndex((time) => new Date(time).getTime() > currentTime);
    if (index < 0) index = Math.min(1, times.length - 1);

    return {
      time: times[index],
      temperature: data.hourly.temperature_2m?.[index],
      weatherCode: data.hourly.weather_code?.[index],
      precipitationProbability: data.hourly.precipitation_probability?.[index],
    };
  }

  function renderWeather(data) {
    timezone = data.timezone || timezone;
    updateClock();

    const current = data.current || {};
    const currentDescription = weatherLabel(current.weather_code);
    weatherValue.textContent = `${roundTemperature(current.temperature_2m)}, ${currentDescription.toLowerCase()}`;

    const next = findNextHour(data);
    if (!next) {
      if (nextHourLabel) nextHourLabel.textContent = 'Próxima hora';
      nextHourValue.textContent = 'Sin pronóstico';
    } else {
      const hour = new Intl.DateTimeFormat('es-AR', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(new Date(next.time));
      const rain = Number.isFinite(Number(next.precipitationProbability))
        ? ` · lluvia ${Math.round(Number(next.precipitationProbability))}%`
        : '';
      if (nextHourLabel) nextHourLabel.textContent = `A las ${hour}`;
      nextHourValue.textContent = `${roundTemperature(next.temperature)}, ${weatherLabel(next.weatherCode).toLowerCase()}${rain}`;
    }

    window.wanderWeatherContext = {
      timezone,
      current: {
        time: current.time || null,
        temperature_c: current.temperature_2m ?? null,
        weather_code: current.weather_code ?? null,
        description: currentDescription,
        precipitation_mm: current.precipitation ?? null,
        wind_speed_kmh: current.wind_speed_10m ?? null,
      },
      next_hour: next,
      updated_at: new Date().toISOString(),
    };

    document.dispatchEvent(new CustomEvent('wander:weather-updated', {
      detail: window.wanderWeatherContext,
    }));
  }

  async function refreshWeather(force = false) {
    if (loading) return;

    const point = marker.getLatLng();
    const moved = lastFetchPosition ? map.distance(lastFetchPosition, point) : Infinity;
    const stale = Date.now() - lastFetchAt > 10 * 60 * 1000;
    if (!force && moved < 2000 && !stale) return;

    loading = true;
    weatherValue.textContent = 'Actualizando clima...';
    nextHourValue.textContent = 'Consultando pronóstico...';

    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude', point.lat.toFixed(5));
    url.searchParams.set('longitude', point.lng.toFixed(5));
    url.searchParams.set('current', 'temperature_2m,weather_code,precipitation,wind_speed_10m');
    url.searchParams.set('hourly', 'temperature_2m,weather_code,precipitation_probability');
    url.searchParams.set('forecast_hours', '4');
    url.searchParams.set('timezone', 'auto');

    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Weather ${response.status}`);
      const data = await response.json();
      renderWeather(data);
      lastFetchPosition = L.latLng(point.lat, point.lng);
      lastFetchAt = Date.now();
    } catch {
      weatherValue.textContent = 'Clima no disponible';
      nextHourValue.textContent = 'Pronóstico no disponible';
    } finally {
      loading = false;
    }
  }

  updateClock();
  window.setInterval(updateClock, 30000);
  window.setInterval(() => refreshWeather(false), 60000);
  map.on('moveend', () => refreshWeather(false));
  marker.on('moveend', () => refreshWeather(false));
  window.setTimeout(() => refreshWeather(true), 400);
})();
