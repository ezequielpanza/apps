(() => {
  function svg(name, className = 'ui-icon') {
    const safeName = String(name || '').replace(/[^a-z0-9-]/gi, '');
    const safeClass = String(className || 'ui-icon').replace(/[^a-z0-9 _-]/gi, '');
    return '<svg class="' + safeClass + '" aria-hidden="true"><use href="#icon-' + safeName + '"></use></svg>';
  }

  window.WanderIcons = { svg };
})();
