(() => {
  const ui = window.WanderUI;
  const settingsPanel = document.querySelector('#settings-panel');
  if (!ui?.getMessageTimeoutMs || !ui?.setMessageTimeoutMs || !settingsPanel) return;

  const card = document.createElement('div');
  card.className = 'screen-card settings-group message-timeout-settings';
  card.innerHTML = `
    <h3>Mensajes de Wander</h3>
    <div class="message-timeout-setting-row">
      <div>
        <strong>Tiempo en pantalla</strong>
        <span>Duración de los carteles informativos antes de ocultarse.</span>
      </div>
      <select id="message-timeout-select" aria-label="Tiempo en pantalla de los mensajes">
        <option value="3000">3 segundos</option>
        <option value="5000">5 segundos</option>
        <option value="8000">8 segundos</option>
        <option value="10000">10 segundos</option>
        <option value="15000">15 segundos</option>
        <option value="0">No ocultar automáticamente</option>
      </select>
    </div>
  `;

  settingsPanel.prepend(card);

  const select = card.querySelector('#message-timeout-select');
  const current = String(ui.getMessageTimeoutMs());
  if (!Array.from(select.options).some((option) => option.value === current)) {
    const custom = document.createElement('option');
    custom.value = current;
    custom.textContent = `${Math.round(Number(current) / 1000)} segundos`;
    select.appendChild(custom);
  }
  select.value = current;

  select.addEventListener('change', () => {
    const timeoutMs = ui.setMessageTimeoutMs(Number(select.value));
    const label = timeoutMs === 0 ? 'Los mensajes permanecerán visibles hasta cerrarlos.' : `Los mensajes se ocultarán después de ${Math.round(timeoutMs / 1000)} segundos.`;
    ui.showWander('Configuración guardada', label);
  });

  window.WanderMessageTimeoutSettings = Object.freeze({
    getValue: () => ui.getMessageTimeoutMs(),
  });
})();