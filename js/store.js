/* ============================================================
   store.js — persistence + shared state + small helpers
   Falls back to memory if localStorage is unavailable (private
   mode, sandboxed iframe) so the app never dies on startup.
   ============================================================ */
var DB = (function () {
  var mem = {};
  var ok = false;
  try {
    localStorage.setItem('__sakhi_test', '1');
    localStorage.removeItem('__sakhi_test');
    ok = true;
  } catch (e) { ok = false; }

  return {
    persistent: ok,
    get: function (k, fallback) {
      try {
        var raw = ok ? localStorage.getItem(k) : mem[k];
        return raw == null ? fallback : JSON.parse(raw);
      } catch (e) { return fallback; }
    },
    set: function (k, v) {
      var s = JSON.stringify(v);
      try { ok ? localStorage.setItem(k, s) : (mem[k] = s); }
      catch (e) { mem[k] = s; }
    },
    del: function (k) {
      try { ok ? localStorage.removeItem(k) : delete mem[k]; } catch (e) {}
    },
    wipe: function () {
      mem = {};
      try {
        if (!ok) return;
        Object.keys(localStorage)
          .filter(function (k) { return k.indexOf('sakhi.') === 0; })
          .forEach(function (k) { localStorage.removeItem(k); });
      } catch (e) {}
    }
  };
})();

var DEFAULT_MSG =
  'EMERGENCY — this is {name}.\n' +
  'I need help right now. My live location:\n' +
  '{maps}\n' +
  'Near: {address}\n' +
  'Fix accuracy: {accuracy} · Sent at {time} · Battery {battery}\n' +
  'Please call me or reach the nearest police (112).';

var State = {
  guardians: DB.get('sakhi.guardians', []),
  zones: DB.get('sakhi.zones', []),
  journeys: DB.get('sakhi.journeys', []),
  settings: DB.get('sakhi.settings', {
    name: '',
    msg: DEFAULT_MSG,
    ping: 180,
    unlock: '1234',
    panic: '911',
    autoStealth: false,
    wa: true,
    sms: true,
    call: true,
    shake: false,
    scream: false,
    follow: true
  }),
  pos: null,          // latest GeolocationPosition-like object
  address: '',        // reverse-geocoded street address
  alertLive: false,   // an SOS is currently active
  walk: DB.get('sakhi.walk', null),
  evidence: []        // blobs, session only
};

function saveGuardians() { DB.set('sakhi.guardians', State.guardians); }
function saveZones()     { DB.set('sakhi.zones', State.zones); }
function saveJourneys()  { DB.set('sakhi.journeys', State.journeys.slice(-40)); }
function saveSettings()  { DB.set('sakhi.settings', State.settings); }
function saveWalk()      { State.walk ? DB.set('sakhi.walk', State.walk) : DB.del('sakhi.walk'); }

/* ---------- helpers ---------- */
function $(sel, root) { return (root || document).querySelector(sel); }
function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function pad2(n) { return (n < 10 ? '0' : '') + n; }

function clockTime(d) {
  d = d || new Date();
  return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
}

function stamp(ts) {
  var d = new Date(ts);
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function mmss(sec) {
  sec = Math.max(0, Math.round(sec));
  return pad2(Math.floor(sec / 60)) + ':' + pad2(sec % 60);
}

var toastTimer = null;
function toast(text, ms) {
  var el = $('#toast');
  if (!el) return;
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { el.hidden = true; }, ms || 3200);
}

function buzz(pattern) {
  try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) {}
}

function download(blob, filename) {
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
}

/* shared audio context, created on first user gesture */
var AC = null;
function audioCtx() {
  try {
    if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)();
    if (AC.state === 'suspended') AC.resume();
    return AC;
  } catch (e) { return null; }
}

var batteryLevel = null;
if (navigator.getBattery) {
  navigator.getBattery().then(function (b) {
    batteryLevel = Math.round(b.level * 100);
    b.addEventListener('levelchange', function () { batteryLevel = Math.round(b.level * 100); });
  }).catch(function () {});
}
