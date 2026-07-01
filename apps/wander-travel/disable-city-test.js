(() => {
  if (window.__disableCityTest) return;
  window.__disableCityTest = true;
  const card = document.querySelector('.developer-city-card');
  if (card) card.remove();
})();