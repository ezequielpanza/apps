(() => {
  let endpoint = null;

  function configure(options = {}) {
    endpoint = options.endpoint ? String(options.endpoint) : null;
    return getConfig();
  }

  function getConfig() {
    return Object.freeze({ endpoint });
  }

  function policyFor(sourceId) {
    if (!window.WanderSourcePolicy) throw new Error('WanderSourcePolicy is unavailable');
    return window.WanderSourcePolicy.getOrDefault(sourceId);
  }

  async function acquire(request = {}) {
    const sourceId = String(request.sourceId || '').trim();
    const url = String(request.url || '').trim();
    if (!sourceId) throw new Error('Web acquisition sourceId is required');
    if (!url) throw new Error('Web acquisition url is required');

    const policy = window.WanderSourcePolicy.assertCapability(sourceId, 'automatedAcquisition');
    if (!endpoint) {
      const error = new Error('Web acquisition endpoint is not configured');
      error.code = 'ACQUISITION_ENDPOINT_UNAVAILABLE';
      throw error;
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sourceId,
        url,
        mode: request.mode || 'snapshot',
      }),
    });

    if (!response.ok) {
      const error = new Error(`Web acquisition failed with HTTP ${response.status}`);
      error.code = 'ACQUISITION_HTTP_ERROR';
      error.status = response.status;
      throw error;
    }

    const payload = await response.json();
    return {
      ...payload,
      sourcePolicy: {
        id: policy.id,
        mode: policy.mode,
        reviewedAt: policy.reviewedAt,
      },
    };
  }

  function canAcquire(sourceId) {
    return policyFor(sourceId).automatedAcquisition === true;
  }

  window.WanderWebAcquisition = Object.freeze({
    configure,
    getConfig,
    canAcquire,
    acquire,
  });
})();
