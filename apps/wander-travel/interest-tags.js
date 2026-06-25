(() => {
  const container = document.querySelector('#interest-selector');
  const input = document.querySelector('#interest-input');
  const customInput = document.querySelector('#custom-interest-input');
  const addButton = document.querySelector('#add-custom-interest');
  const selectedSummary = document.querySelector('#selected-interest-summary');

  if (!container || !input) return;

  const defaultInterests = ['Cafés', 'Restaurantes', 'Sitios históricos', 'Naturaleza', 'Museos'];
  const selected = new Set(defaultInterests);
  const normalize = (value) => value.trim().replace(/\s+/g, ' ');

  function syncInput() {
    const values = [...selected];
    input.value = values.join(', ');
    input.dataset.tags = input.value;
    if (selectedSummary) {
      selectedSummary.textContent = values.length
        ? `${values.length} intereses seleccionados`
        : 'Sin intereses seleccionados';
    }
    input.dispatchEvent(new Event('change', { bubbles: true }));
    document.dispatchEvent(new CustomEvent('wander:interests-changed', { detail: { interests: values } }));
  }

  function render() {
    container.querySelectorAll('[data-interest-tag]').forEach((button) => {
      const value = normalize(button.dataset.interestTag || button.textContent);
      const active = selected.has(value);
      button.classList.toggle('is-selected', active);
      button.setAttribute('aria-pressed', String(active));
    });

    const customContainer = document.querySelector('#custom-interest-tags');
    if (customContainer) {
      const presetValues = new Set([...container.querySelectorAll('[data-interest-tag]')].map((button) => normalize(button.dataset.interestTag || button.textContent)));
      const customValues = [...selected].filter((value) => !presetValues.has(value));
      customContainer.innerHTML = customValues.map((value) => `<button type="button" class="interest-chip is-selected custom-interest-chip" data-custom-interest="${value.replace(/"/g, '&quot;')}" aria-pressed="true">${value}<span aria-hidden="true">×</span></button>`).join('');
      customContainer.querySelectorAll('[data-custom-interest]').forEach((button) => {
        button.addEventListener('click', () => {
          selected.delete(button.dataset.customInterest);
          render();
          syncInput();
        });
      });
    }
  }

  container.querySelectorAll('[data-interest-tag]').forEach((button) => {
    button.setAttribute('aria-pressed', 'true');
    button.addEventListener('click', () => {
      const value = normalize(button.dataset.interestTag || button.textContent);
      if (selected.has(value)) selected.delete(value);
      else selected.add(value);
      render();
      syncInput();
    });
  });

  function addCustomInterest() {
    const value = normalize(customInput?.value || '');
    if (!value) return;
    selected.add(value);
    if (customInput) customInput.value = '';
    render();
    syncInput();
  }

  addButton?.addEventListener('click', addCustomInterest);
  customInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      addCustomInterest();
    }
  });

  const style = document.createElement('style');
  style.textContent = `
    .interest-section{display:grid;gap:12px}.interest-section-header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.interest-section-header h2{margin:0}.interest-help{margin:4px 0 0;color:#6f756f;font-size:.78rem;line-height:1.35}.selected-interest-summary{flex:0 0 auto;padding:5px 8px;border-radius:999px;background:rgba(20,125,120,.09);color:#147d78;font-size:.66rem;font-weight:800}.interest-chip-grid,.custom-interest-tags{display:flex;flex-wrap:wrap;gap:8px}.interest-chip{display:inline-flex;align-items:center;gap:6px;padding:8px 11px;border:1px solid rgba(24,32,27,.14);border-radius:999px;background:#fff;color:#4f554f;font-size:.76rem;font-weight:750;cursor:pointer;transition:background .15s ease,border-color .15s ease,color .15s ease,transform .15s ease}.interest-chip:hover{transform:translateY(-1px);border-color:rgba(20,125,120,.35)}.interest-chip.is-selected{border-color:rgba(20,125,120,.45);background:rgba(20,125,120,.11);color:#116a66;box-shadow:inset 0 0 0 1px rgba(20,125,120,.05)}.interest-chip.is-selected::before{content:'✓';font-size:.68rem}.custom-interest-chip span{font-size:.9rem;line-height:1}.interest-custom-row{display:grid;grid-template-columns:1fr auto;gap:8px}.interest-custom-row input{min-width:0;padding:10px 12px;border:1px solid rgba(24,32,27,.14);border-radius:11px;background:#fff}.interest-custom-row button{padding:10px 13px;border:0;border-radius:11px;background:#173f3b;color:#fff;font-weight:800;cursor:pointer}.interest-input-hidden{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}
  `;
  document.head.appendChild(style);

  render();
  syncInput();
})();
