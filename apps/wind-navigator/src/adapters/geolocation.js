export function getGPSlocation(options={}) {
  return new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(
    p=>resolve({lat:p.coords.latitude,lon:p.coords.longitude,source:'device',accuracy:p.coords.accuracy}),
    reject,{enableHighAccuracy:options.enableHighAccuracy,timeout:options.timeout,maximumAge:options.maximumAge}));
}
