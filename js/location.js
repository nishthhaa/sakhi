/* ============================================================
   location.js — real GPS, continuously watched
   Uses navigator.geolocation.watchPosition so every alert is
   built from the newest fix, not a cached one.
   ============================================================ */
var Geo = (function () {
  var watchId = null;
  var listeners = [];
  var lastGeocodeAt = 0;
  var lastGeocodeKey = '';
  var failReason = '';

  function notify() { listeners.forEach(function (fn) { try { fn(State.pos); } catch (e) {} }); }

  function onFix(p) {
    failReason = '';
    State.pos = {
      lat: p.coords.latitude,
      lng: p.coords.longitude,
      acc: p.coords.accuracy,
      speed: p.coords.speed,
      heading: p.coords.heading,
      ts: p.timestamp || Date.now()
    };
    notify();
    reverseGeocode();
  }

  function onFail(err) {
    var map = {
      1: 'Location permission is blocked. Open the padlock in the address bar and allow location, then reload.',
      2: 'No position available. Turn on device GPS and step near a window.',
      3: 'Location timed out. Trying again…'
    };
    failReason = map[err.code] || err.message || 'Location unavailable.';
    notify();
  }

  function start() {
    if (!navigator.geolocation) {
      failReason = 'This browser has no geolocation support.';
      notify();
      return;
    }
    if (!window.isSecureContext) {
      failReason = 'Browsers only give GPS to https:// pages or localhost. Host these files (GitHub Pages, Netlify) or run a local server.';
    }
    navigator.geolocation.getCurrentPosition(onFix, onFail, {
      enableHighAccuracy: true, timeout: 12000, maximumAge: 0
    });
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    watchId = navigator.geolocation.watchPosition(onFix, onFail, {
      enableHighAccuracy: true, timeout: 20000, maximumAge: 4000
    });
  }

  /* one-shot high accuracy refresh, resolves with the fix */
  function refresh() {
    return new Promise(function (resolve) {
      if (!navigator.geolocation) return resolve(State.pos);
      navigator.geolocation.getCurrentPosition(
        function (p) { onFix(p); resolve(State.pos); },
        function (e) { onFail(e); resolve(State.pos); },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    });
  }

  /* street address from OpenStreetMap; silently skipped when offline */
  function reverseGeocode() {
    if (!State.pos) return;
    var key = State.pos.lat.toFixed(4) + ',' + State.pos.lng.toFixed(4);
    if (key === lastGeocodeKey) return;
    if (Date.now() - lastGeocodeAt < 8000) return;
    lastGeocodeAt = Date.now();
    lastGeocodeKey = key;
    var url = 'https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=17&lat=' +
              State.pos.lat + '&lon=' + State.pos.lng;
    fetch(url, { headers: { 'Accept': 'application/json' } })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (j && j.display_name) {
          State.address = j.display_name.split(',').slice(0, 5).join(',').trim();
          notify();
        }
      })
      .catch(function () { /* offline is fine, coordinates still work */ });
  }

  function mapsLink(pos) {
    pos = pos || State.pos;
    if (!pos) return '';
    return 'https://maps.google.com/?q=' + pos.lat.toFixed(6) + ',' + pos.lng.toFixed(6);
  }

  function coordText(pos) {
    pos = pos || State.pos;
    return pos ? pos.lat.toFixed(6) + ', ' + pos.lng.toFixed(6) : 'unknown';
  }

  /* metres between two points */
  function distance(a, b) {
    var R = 6371000, toRad = Math.PI / 180;
    var dLat = (b.lat - a.lat) * toRad;
    var dLng = (b.lng - a.lng) * toRad;
    var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.sqrt(s));
  }

  return {
    start: start,
    refresh: refresh,
    mapsLink: mapsLink,
    coordText: coordText,
    distance: distance,
    onUpdate: function (fn) { listeners.push(fn); },
    problem: function () { return failReason; }
  };
})();
