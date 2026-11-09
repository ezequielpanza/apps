export const map = L.map('map', { zoomControl:false }).setView([18.1, -66.5], 6);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom:19, attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'}).addTo(map);
export const seamarks = L.tileLayer('https://t1.openseamap.org/seamark/{z}/{x}/{y}.png', {maxZoom:18, attribution:'&copy; <a href="https://www.openseamap.org/">OpenSeaMap</a> contributors'}).addTo(map);
