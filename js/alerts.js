/* ============================================================
   alerts.js — turning a position into a message someone receives
   WhatsApp: wa.me deep link, one chat per guardian, text prefilled.
   SMS:      sms: link with every guardian on it at once.
   Both are handed to the phone's own apps, so nothing is blocked
   by CORS and no server or paid gateway is needed.
   ============================================================ */
var Alerts = (function () {
  var pingTimer = null;
  var sent = {};        // guardian id -> channels already used
  var currentKind = 'sos';

  var IOS = /iP(hone|ad|od)/.test(navigator.userAgent);

  function digits(g) { return String(g.code + g.phone).replace(/[^\d]/g, ''); }

  /* ---------------- message ---------------- */
  function build(kind, extra) {
    var s = State.settings;
    var pos = State.pos;
    var body;

    if (kind === 'walk-start') {
      body = '{name} has started a journey.\nGoing to: ' + (extra.dest || 'not given') +
             '\nBy: ' + (extra.mode || '—') + (extra.plate ? ' (' + extra.plate + ')' : '') +
             '\nShould arrive by ' + extra.eta +
             '\nStarting point: {maps}\nIf you do not get an "arrived safely" message after that time, please call me.';
    } else if (kind === 'walk-arrived') {
      body = '{name} reached ' + (extra.dest || 'the destination') + ' safely at {time}. No action needed.';
    } else if (kind === 'walk-missed') {
      body = 'CHECK-IN MISSED — {name} did not confirm arrival at ' + (extra.dest || 'the destination') +
             ' by ' + extra.eta + '.\nLast known location:\n{maps}\nNear: {address}\nSent at {time}. Please call now.';
    } else if (kind === 'update') {
      body = 'LOCATION UPDATE for {name} — {time}\n{maps}\nNear: {address}\nAccuracy {accuracy}, battery {battery}.';
    } else {
      body = s.msg || DEFAULT_MSG;
    }

    return body
      .replace(/{name}/g, s.name || 'Someone using Sakhi')
      .replace(/{time}/g, new Date().toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' }))
      .replace(/{maps}/g, pos ? Geo.mapsLink() : 'location not available yet')
      .replace(/{address}/g, State.address || (pos ? Geo.coordText() : 'unknown'))
      .replace(/{accuracy}/g, pos ? Math.round(pos.acc) + ' m' : 'unknown')
      .replace(/{battery}/g, batteryLevel == null ? 'unknown' : batteryLevel + '%');
  }

  /* ---------------- channels ---------------- */
  function openExternal(url) {
    var a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function whatsapp(g, msg) {
    openExternal('https://wa.me/' + digits(g) + '?text=' + encodeURIComponent(msg));
  }

  function smsLink(list, msg) {
    var nums = list.map(digits).map(function (d) { return '+' + d; }).join(',');
    return 'sms:' + nums + (IOS ? '&' : '?') + 'body=' + encodeURIComponent(msg);
  }

  function sms(list, msg) {
    if (!list.length) return;
    window.location.href = smsLink(list, msg);
  }

  function call(g) { window.location.href = 'tel:+' + digits(g); }

  function ordered() {
    return State.guardians.slice().sort(function (a, b) { return (b.primary ? 1 : 0) - (a.primary ? 1 : 0); });
  }

  /* ---------------- dispatch sheet ---------------- */
  function renderSheet(msg, title, sub) {
    $('#dTitle').textContent = title;
    $('#dSub').textContent = sub;
    $('#dMsg').textContent = msg;

    var list = ordered();
    var box = $('#dList');
    if (!list.length) {
      box.innerHTML = '<div class="empty">No guardians saved yet. Add at least one on the Guardians page so alerts have somewhere to go.</div>';
    } else {
      box.innerHTML = list.map(function (g) {
        var done = sent[g.id] || {};
        return '<div class="dispatch-row">' +
          '<div class="avatar' + (g.primary ? ' first' : '') + '">' + esc((g.name || '?').charAt(0).toUpperCase()) + '</div>' +
          '<div class="who"><b>' + esc(g.name) + '</b><small>' + esc(g.code + ' ' + g.phone) + (g.primary ? ' · first' : '') + '</small></div>' +
          (State.settings.wa ? '<button class="mini wa' + (done.wa ? ' done' : '') + '" data-send="wa" data-id="' + g.id + '">WhatsApp</button>' : '') +
          (State.settings.sms ? '<button class="mini sms' + (done.sms ? ' done' : '') + '" data-send="sms" data-id="' + g.id + '">SMS</button>' : '') +
          (State.settings.call ? '<button class="mini call" data-send="call" data-id="' + g.id + '">Call</button>' : '') +
          '</div>';
      }).join('');
    }
    $('#dNote').textContent = State.pos
      ? 'Location fixed to ' + Math.round(State.pos.acc) + ' m at ' + clockTime(new Date(State.pos.ts)) + '.'
      : 'No GPS fix yet — the message will say so. Tap "Refresh location" once your phone locks on.';
  }

  function openSheet(kind, extra, opts) {
    opts = opts || {};
    currentKind = kind;
    sent = {};
    var msg = build(kind, extra || {});
    renderSheet(msg,
      opts.title || 'Alert ready to send',
      opts.sub || 'Tap a guardian. The message is already typed — you only press send.');
    $('#dispatch').hidden = false;
    document.body.style.overflow = 'hidden';

    /* first guardian on WhatsApp is opened automatically when this
       came from a real tap; browsers block it otherwise, and the
       sheet is the fallback either way */
    if (opts.auto && State.settings.wa && ordered()[0]) {
      var g = ordered()[0];
      whatsapp(g, msg);
      sent[g.id] = { wa: true };
      renderSheet(msg, opts.title || 'Alert ready to send', 'WhatsApp opened for ' + g.name + '. Press send there, then come back for the rest.');
    }
    return msg;
  }

  function closeSheet() {
    $('#dispatch').hidden = true;
    document.body.style.overflow = '';
  }

  function refreshSheet() {
    var msg = build(currentKind, {});
    renderSheet(msg, $('#dTitle').textContent, 'Location refreshed at ' + clockTime() + '.');
    return msg;
  }

  /* ---------------- follow-up pings ---------------- */
  function startPings() {
    stopPings();
    if (!State.settings.follow) return;
    State.alertLive = true;
    pingTimer = setInterval(function () {
      Geo.refresh().then(function () {
        if ($('#dispatch').hidden) {
          toast('New location ready for your guardians — open the alert to send it.');
        } else {
          refreshSheet();
        }
      });
    }, Math.max(60, State.settings.ping) * 1000);
  }

  function stopPings() {
    clearInterval(pingTimer);
    pingTimer = null;
    State.alertLive = false;
  }

  /* ---------------- siren + strobe ---------------- */
  var sirenNodes = null, strobeTimer = null;

  function sirenOn() {
    var ctx = audioCtx();
    if (!ctx || sirenNodes) return;
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    var lfo = ctx.createOscillator();
    var lfoGain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.value = 900;
    lfo.frequency.value = 2.4;      // wail speed
    lfoGain.gain.value = 380;       // wail depth
    lfo.connect(lfoGain).connect(osc.frequency);
    gain.gain.value = 0.0001;
    gain.gain.exponentialRampToValueAtTime(0.55, ctx.currentTime + 0.4);
    osc.connect(gain).connect(ctx.destination);
    osc.start(); lfo.start();
    sirenNodes = { osc: osc, lfo: lfo, gain: gain };

    var s = $('#strobe');
    var on = false;
    s.hidden = false;
    s.style.opacity = '0';
    strobeTimer = setInterval(function () {
      on = !on;
      s.style.opacity = on ? '0.92' : '0';
    }, 110);
    buzz([300, 120, 300, 120, 300]);
  }

  function sirenOff() {
    if (sirenNodes) {
      try { sirenNodes.osc.stop(); sirenNodes.lfo.stop(); } catch (e) {}
      sirenNodes = null;
    }
    clearInterval(strobeTimer);
    strobeTimer = null;
    var s = $('#strobe');
    s.hidden = true;
    s.style.opacity = '0';
    buzz(0);
  }

  function sirenToggle() {
    sirenNodes ? sirenOff() : sirenOn();
    return !!sirenNodes;
  }

  return {
    build: build,
    openSheet: openSheet,
    closeSheet: closeSheet,
    refreshSheet: refreshSheet,
    whatsapp: whatsapp,
    sms: sms,
    smsLink: smsLink,
    call: call,
    ordered: ordered,
    markSent: function (id, ch) { sent[id] = sent[id] || {}; sent[id][ch] = true; },
    startPings: startPings,
    stopPings: stopPings,
    sirenOn: sirenOn,
    sirenOff: sirenOff,
    sirenToggle: sirenToggle,
    isSiren: function () { return !!sirenNodes; }
  };
})();
