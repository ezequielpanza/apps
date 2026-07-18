(() => {
  const context = window.WanderContext;
  const capacitor = window.Capacitor;
  const plugin = capacitor?.Plugins?.WanderLocation;
  if (!context || !capacitor?.isNativePlatform?.() || !plugin?.addListener) return;

  const WINDOW_MS = 8000;
  const samples = [];
  let lastPublishedAt = 0;

  function finite(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function rounded(value, digits = 3) {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
  }

  function publishSummary(sample) {
    const values = samples.map((item) => item.activity);
    if (!values.length) return;
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
    const rms = Math.sqrt(values.reduce((sum, value) => sum + value ** 2, 0) / values.length);
    const activityThreshold = sample.linear ? .35 : .25;
    const activeCount = values.filter((value) => value >= activityThreshold).length;
    const summary = {
      sensor: sample.linear ? 'linear_acceleration' : 'accelerometer',
      sampleCount: values.length,
      windowMs: Math.max(0, samples.at(-1).at - samples[0].at),
      mean: rounded(mean),
      rms: rounded(rms),
      variance: rounded(variance),
      peak: rounded(Math.max(...values)),
      activityThreshold,
      activeCount,
      activeRatio: rounded(activeCount / values.length),
      last: {
        x: rounded(sample.x),
        y: rounded(sample.y),
        z: rounded(sample.z),
        magnitude: rounded(sample.magnitude),
        activity: rounded(sample.activity),
      },
      updatedAt: new Date(sample.at).toISOString(),
    };
    const options = { source: 'android-motion-sensor', ttlMs: 5000, confidence: .9 };
    context.set('motion.sensor.status', 'available', { ...options, kind: 'observed' });
    context.set('motion.sensor.summary', summary, { ...options, kind: 'derived' });
  }

  plugin.addListener('motionSensor', (event) => {
    const sample = {
      x: finite(event?.x) ?? 0,
      y: finite(event?.y) ?? 0,
      z: finite(event?.z) ?? 0,
      magnitude: Math.max(0, finite(event?.magnitude) ?? 0),
      activity: Math.max(0, finite(event?.activity) ?? 0),
      linear: event?.linear === true,
      at: finite(event?.timestamp) ?? Date.now(),
    };
    samples.push(sample);
    while (samples.length > 2 && sample.at - samples[0].at > WINDOW_MS) samples.shift();
    if (sample.at - lastPublishedAt < 1000) return;
    lastPublishedAt = sample.at;
    publishSummary(sample);
  });

  plugin.addListener('motionSensorError', () => {
    context.set('motion.sensor.status', 'unavailable', {
      source: 'android-motion-sensor', kind: 'observed', ttlMs: 5000, confidence: 1,
    });
  });

  window.WanderNativeMotion = Object.freeze({
    isSupported: () => true,
    getSummary: () => context.value('motion.sensor.summary', null),
  });
})();
