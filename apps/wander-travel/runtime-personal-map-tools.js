(() => {
  if (window.WanderPersonalMapTools) return;

  const base = window.WanderBase;
  if (!base?.map) return;
  const map = base.map;

  function makeButton(iconName, label) {
    const button = L.DomUtil.create('button', 'wander-map-action wander-personal-map-action');
    button.type = 'button';
    button.setAttribute('aria-label', label);
    button.title = label;
    button.innerHTML = `<svg class="ui-icon" aria-hidden="true"><use href="wander-icons.svg#${iconName}"></use></svg>`;
    L.DomEvent.disableClickPropagation(button);
    L.DomEvent.disableScrollPropagation(button);
    return button;
  }

  const PersonalActions = L.Control.extend({
    options: { position: 'bottomright' },
    onAdd() {
      const wrap = L.DomUtil.create('div', 'wander-map-actions wander-personal-map-actions');
      const waypointButton = makeButton('pin', 'Seleccionar punto en el centro del mapa');
      waypointButton.addEventListener('click', (event) => {
        event.preventDefault();
        if (window.WanderMapSelectedPoint?.openAtCenter) window.WanderMapSelectedPoint.openAtCenter();
        else window.dispatchEvent(new CustomEvent('wander:open-waypoint-center'));
      });
      wrap.append(waypointButton);
      return wrap;
    },
  });

  if (!map.getContainer().querySelector('.wander-personal-map-actions')) {
    map.addControl(new PersonalActions());
    const corner = map.getContainer().querySelector('.leaflet-bottom.leaflet-right');
    const personalWrap = corner?.querySelector('.wander-personal-map-actions')?.parentElement;
    if (personalWrap && corner.firstElementChild !== personalWrap) corner.insertBefore(personalWrap, corner.firstElementChild);
  }

  window.WanderPersonalMapTools = Object.freeze({ ready: true });
  window.dispatchEvent(new CustomEvent('wander:personal-map-tools-ready'));
})();
