(() => {
  const version = 'v0.12.2';
  document.title = `Wander Travel ${version}`;
  const badge = document.querySelector('.app-version');
  if (badge) badge.textContent = version;
})();
