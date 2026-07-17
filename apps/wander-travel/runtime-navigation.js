(() => {
  const context = window.WanderContext;
  const ui = window.WanderUI;
  const mapCore = window.WanderMapCore;
  if (!context || !ui || !mapCore?.route) return;

  let active = null;
  let lastInstructionIndex = -1;

  function finite(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function decodePolyline(encoded) {
    const text = String(encoded || '');
    const points = [];
    let index = 0;
    let lat = 0;
    let lng = 0;
    while (index < text.length) {
      let shift = 0;
      let result = 0;
      let byte;
      do {
        byte = text.charCodeAt(index++) - 63;
        result |= (byte & 31) << shift;
        shift += 5;
      } while (byte >= 32 && index <= text.length);
      lat += (result & 1) ? ~(result >> 1) : result >> 1;

      shift = 0;
      result = 0;
      do {
        byte = text.charCodeAt(index++) - 63;
        result |= (byte & 31) << shift;
        shift += 5;
      } while (byte >= 32 && index <= text.length);
      lng += (result & 1) ? ~(result >> 1) : result >> 1;
      points.push([lat / 1e5, lng / 1e5]);
    }
    return points;
  }

  function distanceMeters(left, right) {
    if (!left || !right) return Infinity;
    const radius = 6371008.8;
    const toRad = (value) => value * Math.PI / 180;
    const dLat = toRad(right.lat - left.lat);
    const dLng = toRad(right.lng - left.lng);
    const lat1 = toRad(left.lat);
    const lat2 = toRad(right.lat);
    const value = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return radius * 2 * Math.asin(Math.min(1, Math.sqrt(value)));
  }

  function currentLocation() {
    const location = context.getEffectiveLocation?.();
    const lat = finite(location?.lat);
    const lng = finite(location?.lng);
    return lat === null || lng === null ? null : { lat, lng };
  }

  function formatDistance(distanceM) {
    const distance = Math.max(0, Math.round(Number(distanceM) || 0));
    if (distance < 1000) return `${Math.max(10, Math.round(distance / 10) * 10)} metros`;
    return `${(distance / 1000).toFixed(distance < 10000 ? 1 : 0)} km`;
  }

  function formatDuration(seconds) {
    const minutes = Math.max(1, Math.round((Number(seconds) || 0) / 60));
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    return remainder ? `${hours} h ${remainder} min` : `${hours} h`;
  }

  function maneuverText(maneuver) {
    const value = String(maneuver || 'STRAIGHT').toUpperCase();
    if (value.includes('UTURN')) return 'Da la vuelta cuando sea seguro';
    if (value.includes('LEFT')) return value.includes('SLIGHT') ? 'Mantenete ligeramente a la izquierda' : 'Girá a la izquierda';
    if (value.includes('RIGHT')) return value.includes('SLIGHT') ? 'Mantenete ligeramente a la derecha' : 'Girá a la derecha';
    if (value.includes('ROUNDABOUT')) return 'Entrá en la rotonda y seguí la ruta';
    if (value.includes('FERRY')) return 'Continuá hacia el embarque';
    return 'Seguí de frente';
  }

  function stepEndpoint(step) {
    const point = decodePolyline(step?.encodedPolyline).at(-1);
    return point ? { lat: point[0], lng: point[1] } : null;
  }

  function writeNavigation(status, extra = {}) {
    context.set('navigation.current', {
      status,
      destination: active?.destination || null,
      stepIndex: active?.stepIndex ?? null,
      ...extra,
    }, {
      source: 'navigation',
      kind: 'derived',
      ttlMs: 5 * 60 * 1000,
      confidence: 0.95,
    });
  }

  function showStep() {
    if (!active || active.stepIndex === lastInstructionIndex) return;
    const step = active.route.steps[active.stepIndex];
    if (!step) return;
    lastInstructionIndex = active.stepIndex;
    ui.showWander(
      `En camino a ${active.destination.name}`,
      `${maneuverText(step.maneuver)} durante ${formatDistance(step.distanceM)}.`,
      { persistent: true },
    );
  }

  function observeProgress() {
    if (!active) return;
    const location = currentLocation();
    if (!location) return;
    const destinationDistance = distanceMeters(location, active.destination);
    if (destinationDistance <= 30) {
      ui.showWander('Llegaste', `Estás en ${active.destination.name}.`, { timeoutMs: 8000 });
      writeNavigation('arrived', { distanceToDestinationM: Math.round(destinationDistance) });
      active = null;
      lastInstructionIndex = -1;
      return;
    }

    const step = active.route.steps[active.stepIndex];
    const endpoint = stepEndpoint(step);
    if (endpoint && distanceMeters(location, endpoint) <= 24 && active.stepIndex < active.route.steps.length - 1) {
      active.stepIndex += 1;
      showStep();
    }
    writeNavigation('active', { distanceToDestinationM: Math.round(destinationDistance) });
  }

  async function start(destination) {
    const origin = currentLocation();
    const lat = finite(destination?.lat);
    const lng = finite(destination?.lng);
    if (!origin || lat === null || lng === null) {
      ui.showWander('No puedo crear la ruta todavía', 'Necesito una ubicación y un destino confiables.', { timeoutMs: 7000 });
      return null;
    }

    const target = { id: destination.id || null, name: destination.name || 'el destino', lat, lng };
    ui.showWander('Preparando la ruta', `Buscando el mejor recorrido a pie hasta ${target.name}.`, { persistent: true });
    try {
      const response = await fetch('/api/routes/walking', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ origin, destination: target }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok || !payload.route?.encodedPolyline) {
        throw new Error(payload?.error || 'No se pudo calcular la ruta.');
      }

      const points = decodePolyline(payload.route.encodedPolyline);
      if (points.length < 2) throw new Error('La ruta recibida no contiene un recorrido válido.');
      mapCore.route.setLatLngs(points);
      const bounds = mapCore.route.getBounds?.();
      if (bounds?.isValid?.()) mapCore.map?.fitBounds?.(bounds, { padding: [36, 36] });

      active = { destination: target, route: payload.route, stepIndex: 0, startedAt: new Date().toISOString() };
      lastInstructionIndex = -1;
      writeNavigation('active', {
        distanceM: payload.route.distanceM,
        durationSeconds: payload.route.durationSeconds,
      });
      ui.showWander(
        `En camino a ${target.name}`,
        `${formatDuration(payload.route.durationSeconds)} · ${formatDistance(payload.route.distanceM)}. ` +
          'La ruta a pie puede no reflejar todas las condiciones de aceras o senderos.',
        { persistent: true },
      );
      setTimeout(showStep, 3500);
      return active;
    } catch (error) {
      ui.showWander('No pude crear la ruta', error?.message || 'La solicitud de ruta falló.', { timeoutMs: 8000 });
      return null;
    }
  }

  context.subscribe((key) => {
    if (key === 'location.effective' || key.startsWith('location.effective.')) observeProgress();
  });

  window.WanderNavigation = {
    start,
    observeProgress,
    decodePolyline,
    maneuverText,
    getActive: () => active,
  };
})();
