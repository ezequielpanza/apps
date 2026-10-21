const config = {
    name: 'windy-plugin-route-builder',
    version: '0.1.18',
    title: 'Route Builder',
    icon: '🧭',
    description: 'Añade puntos con clics en el mapa e inserta intermedios al pulsar sobre un tramo.',
    author: 'Window Finder',
    desktopUI: 'rhpane',
    desktopWidth: 380,
    mobileUI: 'fullscreen',
    routerPath: '/route-builder/:lat?/:lon?',
    addToContextmenu: true,
    listenToSingleclick: false,
};

export default config;

