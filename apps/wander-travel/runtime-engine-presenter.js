(() => {
  const engine = window.WanderEngine;
  const ui = window.WanderUI;
  const fieldGuide = window.WanderFieldGuide;
  if (!engine?.subscribeEvaluation || !ui?.showWander || !fieldGuide?.markPresented) return;

  let lastPresentationKey = null;

  function presentationKey(evaluation, candidate) {
    return [
      evaluation?.type || '',
      evaluation?.contentId || candidate?.contentId || '',
      candidate?.createdAt || '',
    ].join('|');
  }

  function present(evaluation, reason = 'engine') {
    if (evaluation?.type !== 'field_guide_suggestion') return null;

    const candidate = evaluation.fieldGuideCandidate || evaluation.relevance?.fieldGuideCandidate;
    const presentation = evaluation.presentation || candidate?.presentation;
    if (!candidate?.poiId || !presentation?.title || !presentation?.message) return null;
    if (Number(candidate.expiresAt) <= Date.now()) return null;

    const key = presentationKey(evaluation, candidate);
    if (key === lastPresentationKey) return null;

    ui.showWander(presentation.title, presentation.message);
    lastPresentationKey = key;
    const remembered = fieldGuide.markPresented(candidate);

    return {
      key,
      reason,
      poiId: candidate.poiId,
      contentId: candidate.contentId || null,
      remembered,
    };
  }

  engine.subscribeEvaluation((evaluation, reason) => {
    try { present(evaluation, reason); } catch {}
  });

  window.WanderEnginePresenter = Object.freeze({
    present,
    getLastPresentationKey: () => lastPresentationKey,
  });

  setTimeout(() => {
    try { present(engine.getLastEvaluation?.(), 'presenter:init'); } catch {}
  }, 0);
})();
