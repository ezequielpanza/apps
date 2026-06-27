(() => {
  const STATE_KEY = 'wander-travel-city-welcome-state';
  const originalFetch = window.fetch.bind(window);

  function welcomeState() {
    try { return JSON.parse(localStorage.getItem(STATE_KEY) || '{}'); }
    catch { return {}; }
  }

  function isPoiGuidePrompt(payload) {
    const text = String(payload?.message || '').toLowerCase();
    if (payload?.context?.mode !== 'tour_guide') return false;
    if (text.includes('dale la bienvenida') || text.includes('bienvenido a')) return false;
    return text.includes('poi') || text.includes('lugares') || text.includes('guía de turismo') || text.includes('información y lugares');
  }

  function shouldHoldPoiTalk() {
    const state = welcomeState();
    if (!state.city) return true;
    if (state.status === 'pending') return true;
    if (Number.isFinite(state.poiAllowedAt) && Date.now() < state.poiAllowedAt) return true;
    return false;
  }

  window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input?.url;
    if (url === '/api/assistant' && init?.body) {
      try {
        const payload = JSON.parse(init.body);
        if (isPoiGuidePrompt(payload) && shouldHoldPoiTalk()) {
          return new Response(JSON.stringify({ ok: true, message: 'SILENCIO' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
      } catch {
        return originalFetch(input, init);
      }
    }
    return originalFetch(input, init);
  };
})();
