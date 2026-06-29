(() => {
  const DEFAULT_CONTEXT = {
    primary_context: 'travel',
    secondary_context: null,
    state: 'discovering_place',
    confidence: 0.72,
    active_mission: 'deambular y conocer ciudades o pueblos',
    enabled_tools: ['travel_pois', 'walking_context', 'city_welcome'],
    boat_available: false,
    boat_status: 'placeholder_disabled',
    updated_at: new Date().toISOString()
  };

  function publish(partial = {}) {
    const previous = window.WanderContext || DEFAULT_CONTEXT;
    const next = {
      ...previous,
      ...partial,
      updated_at: new Date().toISOString()
    };
    window.WanderContext = next;
    window.dispatchEvent(new CustomEvent('wander:context-updated', { detail: next }));
    return next;
  }

  function inferFromMotion(detail) {
    if (!detail) return;
    const speedKnots = Number(detail.speed_knots || 0);
    const likelyBoat = Boolean(detail.likely_boat || detail.transport_mode === 'boat' || speedKnots >= 3.5);

    if (likelyBoat) {
      publish({
        primary_context: 'travel',
        secondary_context: 'boat',
        state: 'boat_context_detected_but_disabled',
        confidence: 0.78,
        active_mission: 'Travel activo con Boat reservado como contexto futuro',
        enabled_tools: ['travel_pois', 'walking_context', 'city_welcome'],
        boat_available: false,
        boat_status: 'detected_placeholder_disabled',
        last_motion_context: detail
      });
      return;
    }

    publish({
      primary_context: 'travel',
      secondary_context: null,
      state: 'discovering_place',
      confidence: detail.location ? 0.82 : 0.64,
      active_mission: 'deambular y conocer ciudades o pueblos',
      enabled_tools: ['travel_pois', 'walking_context', 'city_welcome'],
      boat_available: false,
      boat_status: 'placeholder_disabled',
      last_motion_context: detail
    });
  }

  window.WanderContextEngine = {
    publish,
    get: () => window.WanderContext || DEFAULT_CONTEXT,
    setTravel: () => publish(DEFAULT_CONTEXT),
    noteBoatPlaceholder: () => publish({
      primary_context: 'travel',
      secondary_context: 'boat',
      state: 'boat_selected_but_disabled',
      confidence: 1,
      active_mission: 'Boat reservado hasta implementar funciones náuticas',
      boat_available: false,
      boat_status: 'manual_placeholder_disabled'
    })
  };

  publish(DEFAULT_CONTEXT);
  document.addEventListener('wander:motion-context', (event) => inferFromMotion(event.detail));
  if (window.wanderMotionContext) inferFromMotion(window.wanderMotionContext);
})();