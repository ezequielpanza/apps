(() => {
  if (window.__wanderPhoneGazeContext) return;
  window.__wanderPhoneGazeContext = true;

  const MIN_VERTICAL_BETA = 38;
  const MAX_VERTICAL_BETA = 125;
  const MIN_STABLE_MS = 650;
  const MIN_HEADING_DELTA = 4;
  const HEADING_ALPHA = 0.34;
  let lastHeading = null;
  let smoothedHeading = null;
  let verticalSince = null;
  let lastPublishedHeading = null;

  function normalize(value) {
    return ((Number(value) || 0) % 360 + 360) % 360;
  }

  function delta(from, to) {
    return ((normalize(to) - normalize(from) + 540) % 360) - 180;
  }

  function smooth(previous, next, alpha) {
    if (!Number.isFinite(previous)) return normalize(next);
    return normalize(previous + delta(previous, next) * alpha);
  }

  function getHeading(event) {
    if (Number.isFinite(event.webkitCompassHeading)) return normalize(event.webkitCompassHeading);
    if (Number.isFinite(event.alpha)) return normalize(event.absolute ? event.alpha : 360 - event.alpha);
    return null;
  }

  function isPhoneRaised(event) {
    const beta = Math.abs(Number(event.beta) || 0);
    return beta >= MIN_VERTICAL_BETA && beta <= MAX_VERTICAL_BETA;
  }

  function publish(event) {
    const heading = getHeading(event);
    if (!Number.isFinite(heading)) return;

    const now = Date.now();
    if (!isPhoneRaised(event)) {
      verticalSince = null;
      window.WanderPhoneGaze = {
        active: false,
        reason: 'phone_not_vertical',
        updated_at: new Date().toISOString(),
      };
      document.dispatchEvent(new CustomEvent('wander:phone-gaze', { detail: window.WanderPhoneGaze }));
      return;
    }

    if (!verticalSince) verticalSince = now;
    if (now - verticalSince < MIN_STABLE_MS) return;

    lastHeading = heading;
    smoothedHeading = smooth(smoothedHeading, heading, HEADING_ALPHA);

    if (Number.isFinite(lastPublishedHeading) && Math.abs(delta(lastPublishedHeading, smoothedHeading)) < MIN_HEADING_DELTA) return;
    lastPublishedHeading = smoothedHeading;

    window.WanderPhoneGaze = {
      active: true,
      heading_degrees: normalize(smoothedHeading),
      raw_heading_degrees: normalize(lastHeading),
      phone_vertical: true,
      beta: Number(event.beta) || 0,
      gamma: Number(event.gamma) || 0,
      meaning: 'user_is_probably_looking_toward_this_direction',
      updated_at: new Date().toISOString(),
    };
    document.dispatchEvent(new CustomEvent('wander:phone-gaze', { detail: window.WanderPhoneGaze }));
  }

  async function requestPermissionIfNeeded() {
    try {
      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        const permission = await DeviceOrientationEvent.requestPermission();
        return permission === 'granted';
      }
      return true;
    } catch {
      return false;
    }
  }

  async function start() {
    const ok = await requestPermissionIfNeeded();
    if (!ok) return;
    window.addEventListener('deviceorientationabsolute', publish);
    window.addEventListener('deviceorientation', publish);
  }

  document.addEventListener('click', (event) => {
    if (event.target?.closest?.('#locate-button')) start();
  }, true);

  start();
})();