/* ============================================================
   app.js — routing, rendering, and every wire between them
   ============================================================ */
var App = (function () {

  var HELPLINES = [
    { n: '112', t: 'Emergency response', d: 'One number for police, fire and ambulance across India. Works even with no balance.' },
    { n: '1091', t: 'Women helpline (police)', d: 'Police control room dedicated to crimes against women.' },
    { n: '181', t: 'Women helpline (government)', d: 'Counselling, shelter and legal support for domestic abuse and harassment.' },
    { n: '1098', t: 'Childline', d: 'For anyone under 18 in danger or distress.' },
    { n: '108', t: 'Ambulance', d: 'Free emergency medical transport in most states.' },
    { n: '15100', t: 'Free legal aid', d: 'District Legal Services Authority — a lawyer at no cost.' },
    { n: '1930', t: 'Cyber crime', d: 'Online fraud, blackmail, and photos shared without consent.' }
  ];

  var views = ['home', 'walk', 'guardians', 'evidence', 'zones', 'help', 'settings'];

  /* ---------------- routing ---------------- */
  function route() {
    var name = (location.hash || '#/home').replace('#/', '');
    if (views.indexOf(name) < 0) name = 'home';
    views.forEach(function (v) { $('#v-' + v).hidden = (v !== name); });
    $$('[data-nav]').forEach(function (a) { a.classList.toggle('on', a.getAttribute('data-nav') === name); });
    window.scrollTo(0, 0);
  }

  /* ---------------- the alert ---------------- */
  function sos(source) {
    var fromTap = (source === 'dial' || source === 'tile' || source === 'stealth-panic');
    var silent = (source === 'stealth-panic');

    if (!State.guardians.length) {
      toast('Add a guardian first — go to the Guardians page.');
      location.hash = '#/guardians';
      return;
    }

    if (!silent) {
      buzz([600, 150, 600]);
      Alerts.sirenOn();
    }

    var titles = {
      shake: 'Shake detected',
      scream: 'Loud noise detected',
      'walk-missed': 'Check-in missed',
      'stealth-panic': 'Silent alert'
    };
    var kind = source === 'walk-missed' ? 'walk-missed' : 'sos';
    var extra = kind === 'walk-missed' && State.walk
      ? { dest: State.walk.dest, eta: clockTime(new Date(State.walk.due)) } : {};

    Geo.refresh().then(function () {
      if (silent) {
        var g = Alerts.ordered()[0];
        if (g) Alerts.whatsapp(g, Alerts.build('sos', {}));
        buzz([80, 60, 80]);
        return;
      }
      Alerts.openSheet(kind, extra, {
        auto: fromTap,
        title: titles[source] || 'Emergency alert ready',
        sub: 'Tap a guardian. The message is already typed — you only press send.'
      });
      Alerts.startPings();
    });
  }

  /* ---------------- painting ---------------- */
  function paintFix(pos) {
    var problem = Geo.problem();
    var dot = $('#fixDot'), txt = $('#fixText');

    if (pos) {
      var good = pos.acc <= 40;
      dot.className = 'dot ' + (good ? 'good' : '');
      txt.textContent = (good ? 'Located · ' : 'Rough fix · ') + Math.round(pos.acc) + ' m';
      $('#kLat').textContent = pos.lat.toFixed(6);
      $('#kLng').textContent = pos.lng.toFixed(6);
      $('#kAcc').textContent = Math.round(pos.acc) + ' m';
      $('#kTime').textContent = clockTime(new Date(pos.ts));
      $('#addrLine').textContent = State.address || 'Address lookup needs internet — the coordinates below still work.';
      $('#mapsLink').href = Geo.mapsLink();
      $('#dialMeta').textContent = 'Accuracy ' + Math.round(pos.acc) + ' m · updated ' + clockTime(new Date(pos.ts));
      $('#geoNote').hidden = !problem;
      if (problem) $('#geoNote').textContent = problem;
    } else {
      dot.className = 'dot bad';
      txt.textContent = problem ? 'Location blocked' : 'Getting your location…';
      $('#dialMeta').textContent = problem || 'Waiting for GPS…';
      $('#geoNote').hidden = !problem;
      if (problem) $('#geoNote').textContent = problem;
    }
  }

  function paintGuardians() {
    var box = $('#gList');
    if (!State.guardians.length) {
      box.innerHTML = '<div class="empty">No guardians yet. Add the person you would actually call at 2am.</div>';
      return;
    }
    box.innerHTML = Alerts.ordered().map(function (g) {
      return '<div class="item">' +
        '<div class="avatar' + (g.primary ? ' first' : '') + '">' + esc((g.name || '?').charAt(0).toUpperCase()) + '</div>' +
        '<div class="who"><b>' + esc(g.name) + (g.primary ? ' <span class="pill hot">alerted first</span>' : '') + '</b>' +
        '<small>' + esc(g.rel || 'Guardian') + ' · ' + esc(g.code + ' ' + g.phone) + '</small></div>' +
        '<button class="mini" data-test="' + g.id + '">Test</button>' +
        '<button class="mini" data-del="' + g.id + '">Remove</button>' +
        '</div>';
    }).join('');
  }

  function paintZones() {
    var box = $('#zList');
    if (!State.zones.length) {
      box.innerHTML = '<div class="empty">Nothing pinned yet. Mark a spot the next time somewhere feels wrong.</div>';
      return;
    }
    box.innerHTML = State.zones.map(function (z) {
      var away = State.pos ? Math.round(Geo.distance(State.pos, z)) : null;
      return '<div class="item">' +
        '<div class="who"><b>' + esc(z.type) +
        ' <span class="pill' + (z.type === 'Felt safe' ? ' cool' : '') + '">' +
        (away == null ? stamp(z.ts) : (away > 1200 ? (away / 1000).toFixed(1) + ' km away' : away + ' m away')) +
        '</span></b><small>' + esc(z.note || z.lat.toFixed(4) + ', ' + z.lng.toFixed(4)) + '</small></div>' +
        '<a class="mini" target="_blank" rel="noopener" href="https://maps.google.com/?q=' + z.lat + ',' + z.lng + '">Map</a>' +
        '<button class="mini" data-zdel="' + z.id + '">Remove</button>' +
        '</div>';
    }).join('');
  }

  function paintWalk() {
    var w = State.walk;
    $('#walkSetup').hidden = !!w;
    $('#walkLive').hidden = !w;
    if (w) {
      var left = (w.due - Date.now()) / 1000;
      var total = (w.due - w.start) / 1000;
      var c = $('#wClock');
      c.textContent = (left < 0 ? '-' : '') + mmss(Math.abs(left));
      c.className = 'clock' + (left < 0 ? ' late' : left < 180 ? ' warn' : '');
      $('#wSub').textContent = 'Heading to ' + (w.dest || 'your destination') +
        ' · due ' + clockTime(new Date(w.due));
      $('#wBar').style.width = Math.max(0, Math.min(100, (left / total) * 100)) + '%';
      $('#wDist').textContent = (w.dist / 1000).toFixed(2) + ' km';
      $('#wPts').textContent = w.trail.length;
    }
    var h = $('#wHistory');
    if (!State.journeys.length) {
      h.innerHTML = '<div class="empty">Completed journeys show up here.</div>';
    } else {
      h.innerHTML = State.journeys.slice().reverse().slice(0, 8).map(function (j) {
        return '<div class="item"><div class="who"><b>' + esc(j.dest || 'Journey') +
          ' <span class="pill' + (j.status === 'arrived' ? ' cool' : j.status === 'missed' ? ' hot' : '') + '">' + j.status + '</span></b>' +
          '<small>' + stamp(j.start) + ' · ' + (j.dist / 1000).toFixed(2) + ' km · ' + j.mode + '</small></div></div>';
      }).join('');
    }
  }

  function paintEvidence() {
    var box = $('#evList');
    if (!State.evidence.length) {
      box.innerHTML = '<div class="empty">Nothing recorded in this session. Recordings are lost if you close the tab, so download what matters.</div>';
      return;
    }
    box.innerHTML = '';
    State.evidence.slice().reverse().forEach(function (e) {
      var wrap = document.createElement('div');
      wrap.className = 'shot';
      var url = URL.createObjectURL(e.blob);
      var media = e.kind === 'audio'
        ? '<audio controls src="' + url + '"></audio>'
        : '<img src="' + url + '" alt="Captured photo">';
      wrap.innerHTML = media +
        '<div class="item"><div class="who"><b>' + esc(e.label) + '</b><small>' +
        stamp(e.ts) + (e.place ? ' · ' + esc(e.place) : '') + '</small></div>' +
        '<button class="mini" data-ev="' + e.ts + '">Download</button></div>';
      box.appendChild(wrap);
    });
  }

  function paintHelp() {
    $('#helpList').innerHTML = HELPLINES.map(function (h) {
      return '<div class="item"><div class="who"><b>' + h.t + '</b><small>' + h.d + '</small></div>' +
        '<a class="mini call" href="tel:' + h.n + '">' + h.n + '</a></div>';
    }).join('');
  }

  function paintSettings() {
    var s = State.settings;
    $('#sName').value = s.name;
    $('#sMsg').value = s.msg;
    $('#sUnlock').value = s.unlock;
    $('#sPanic').value = s.panic;
    $('#sAutoStealth').checked = s.autoStealth;
    $('#sWA').checked = s.wa;
    $('#sSMS').checked = s.sms;
    $('#sCall').checked = s.call;
    $('#tgFollow').checked = s.follow;
    $$('#sPing .chip').forEach(function (c) { c.classList.toggle('on', +c.dataset.p === s.ping); });
    $('#diag').textContent =
      'Page origin: ' + (window.isSecureContext ? 'secure (GPS allowed)' : 'not secure — GPS will be refused') +
      ' · Storage: ' + (DB.persistent ? 'saved on this device' : 'session only') +
      ' · Guardians: ' + State.guardians.length;
  }

  /* ---------------- evidence ---------------- */
  function addEvidence(e) {
    State.evidence.push(e);
    paintEvidence();
  }

  /* ---------------- stealth ---------------- */
  function stealth(on) {
    $('#stealth').hidden = !on;
    $('#app').style.display = on ? 'none' : '';
    if (on) Calc.paint();
  }

  /* ---------------- hold-to-arm dial ---------------- */
  function wireDial() {
    var HOLD = 2000, CIRC = 339.3;
    var t0 = 0, raf = null;
    var dial = $('#sosDial'), bar = $('#dialBar'), hint = $('#dialHint');

    function frame() {
      var p = Math.min(1, (Date.now() - t0) / HOLD);
      bar.style.strokeDashoffset = CIRC * (1 - p);
      if (p >= 1) { release(true); return; }
      raf = requestAnimationFrame(frame);
    }
    function press(e) {
      e.preventDefault();
      audioCtx();
      t0 = Date.now();
      dial.classList.add('armed');
      hint.textContent = 'Keep holding…';
      buzz(30);
      raf = requestAnimationFrame(frame);
    }
    function release(fired) {
      cancelAnimationFrame(raf);
      bar.style.strokeDashoffset = CIRC;
      dial.classList.remove('armed');
      hint.textContent = 'Hold 2s';
      if (fired) sos('dial');
    }
    dial.addEventListener('pointerdown', press);
    dial.addEventListener('pointerup', function () { release(false); });
    dial.addEventListener('pointerleave', function () { release(false); });
    dial.addEventListener('pointercancel', function () { release(false); });
    dial.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); sos('dial'); }
    });
  }

  /* ---------------- wiring ---------------- */
  function wire() {
    window.addEventListener('hashchange', route);

    /* home tiles */
    $$('.tile').forEach(function (t) {
      t.addEventListener('click', function () {
        var a = t.dataset.act;
        if (a === 'share') {
          if (!State.guardians.length) { toast('Add a guardian first.'); location.hash = '#/guardians'; return; }
          Geo.refresh().then(function () {
            Alerts.openSheet('update', {}, { auto: true, title: 'Location ready', sub: 'Pick who should get it.' });
          });
        }
        if (a === 'siren') { toast(Alerts.sirenToggle() ? 'Siren on. Tap again to stop.' : 'Siren off.'); }
        if (a === 'fakecall') { FakeCall.schedule(10, 'Papa'); toast('Your phone will ring in 10 seconds.'); }
        if (a === 'record') { location.hash = '#/evidence'; Recorder.start(); }
      });
    });

    $('#refreshLoc').addEventListener('click', function () {
      toast('Asking the GPS again…');
      Geo.refresh();
    });
    $('#copyLoc').addEventListener('click', function () {
      var txt = Geo.coordText() + ' · ' + Geo.mapsLink();
      navigator.clipboard ? navigator.clipboard.writeText(txt).then(function () { toast('Location copied.'); })
                          : toast(txt);
    });
    $('#fixChip').addEventListener('click', function () { Geo.refresh(); toast('Refreshing your fix…'); });

    /* sensors */
    $('#tgShake').addEventListener('change', function () {
      if (this.checked) { if (!Shake.start()) this.checked = false; } else Shake.stop();
      State.settings.shake = this.checked; saveSettings();
    });
    $('#tgScream').addEventListener('change', function () {
      this.checked ? Listener.start() : Listener.stop();
      State.settings.scream = this.checked; saveSettings();
    });
    $('#tgFollow').addEventListener('change', function () {
      State.settings.follow = this.checked; saveSettings();
      if (!this.checked) Alerts.stopPings();
    });

    /* dispatch sheet */
    $('#dClose').addEventListener('click', function () {
      Alerts.closeSheet(); Alerts.sirenOff(); Alerts.stopPings();
    });
    $('#dCopy').addEventListener('click', function () {
      var t = $('#dMsg').textContent;
      navigator.clipboard ? navigator.clipboard.writeText(t).then(function () { toast('Message copied.'); }) : toast('Select and copy the text above.');
    });
    $('#dSMSAll').addEventListener('click', function () {
      Alerts.sms(Alerts.ordered(), $('#dMsg').textContent);
    });
    $('#dRefresh').addEventListener('click', function () {
      Geo.refresh().then(function () { Alerts.refreshSheet(); toast('Location updated in the message.'); });
    });
    $('#dList').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-send]');
      if (!btn) return;
      var g = State.guardians.filter(function (x) { return x.id === btn.dataset.id; })[0];
      if (!g) return;
      var msg = $('#dMsg').textContent;
      var ch = btn.dataset.send;
      if (ch === 'wa') Alerts.whatsapp(g, msg);
      if (ch === 'sms') Alerts.sms([g], msg);
      if (ch === 'call') Alerts.call(g);
      Alerts.markSent(g.id, ch);
      btn.classList.add('done');
    });

    /* fake call */
    $('#fcAccept').addEventListener('click', FakeCall.accept);
    $('#fcDecline').addEventListener('click', FakeCall.end);
    $('#fcEnd').addEventListener('click', FakeCall.end);

    /* guardians */
    $('#gAdd').addEventListener('click', function () {
      var name = $('#gName').value.trim();
      var phone = $('#gPhone').value.replace(/[^\d]/g, '');
      var code = $('#gCode').value.trim() || '+91';
      if (!name || phone.length < 7) { toast('Enter a name and a full phone number.'); return; }
      State.guardians.push({
        id: 'g' + Date.now(), name: name, rel: $('#gRel').value.trim(),
        code: code, phone: phone, primary: $('#gPrimary').checked
      });
      saveGuardians();
      $('#gName').value = ''; $('#gRel').value = ''; $('#gPhone').value = ''; $('#gPrimary').checked = false;
      paintGuardians(); paintSettings();
      toast(name + ' will be alerted from now on.');
    });
    $('#gList').addEventListener('click', function (e) {
      var del = e.target.closest('[data-del]'), test = e.target.closest('[data-test]');
      if (del) {
        State.guardians = State.guardians.filter(function (g) { return g.id !== del.dataset.del; });
        saveGuardians(); paintGuardians(); paintSettings();
      }
      if (test) {
        var g = State.guardians.filter(function (x) { return x.id === test.dataset.test; })[0];
        Alerts.whatsapp(g, 'Test from Sakhi — if a real emergency happens, this is the number that will get my location. No action needed right now.');
      }
    });

    /* safe walk */
    var mins = 20, mode = 'Walking';
    $('#wMins').addEventListener('click', function (e) {
      var c = e.target.closest('.chip'); if (!c) return;
      $$('#wMins .chip').forEach(function (x) { x.classList.remove('on'); });
      c.classList.add('on'); mins = +c.dataset.min;
    });
    $('#wMode').addEventListener('click', function (e) {
      var c = e.target.closest('.chip'); if (!c) return;
      $$('#wMode .chip').forEach(function (x) { x.classList.remove('on'); });
      c.classList.add('on'); mode = c.dataset.mode;
      $('#cabWrap').hidden = (mode !== 'Cab' && mode !== 'Auto');
    });
    $('#wStart').addEventListener('click', function () {
      var dest = $('#wDest').value.trim();
      if (!dest) { toast('Where are you going?'); return; }
      var msg = Walk.start(dest, mins, mode, $('#wPlate').value.trim());
      if (State.guardians.length) {
        Alerts.openSheet('walk-start', { dest: dest, mode: mode, plate: $('#wPlate').value.trim(), eta: clockTime(new Date(State.walk.due)) },
          { auto: false, title: 'Tell your guardians', sub: 'Send the journey details before you set off.' });
      } else { toast('Journey started. Add guardians so they get told too.'); }
    });
    $('#wArrived').addEventListener('click', function () {
      var dest = Walk.finish('arrived');
      Alerts.openSheet('walk-arrived', { dest: dest }, { auto: false, title: 'Let them know you are safe', sub: 'Send the all-clear.' });
    });
    $('#wExtend').addEventListener('click', function () { Walk.extend(10); toast('Ten more minutes added.'); });
    $('#wCancel').addEventListener('click', function () { Walk.finish('cancelled'); toast('Journey cancelled.'); });
    $('#wExport').addEventListener('click', function () {
      if (!State.journeys.length) { toast('No journeys to export yet.'); return; }
      var rows = [['destination', 'mode', 'started', 'ended', 'km', 'status']].concat(
        State.journeys.map(function (j) {
          return [j.dest, j.mode, new Date(j.start).toISOString(), new Date(j.end).toISOString(), (j.dist / 1000).toFixed(3), j.status];
        }));
      download(new Blob([rows.map(function (r) { return r.join(','); }).join('\n')], { type: 'text/csv' }), 'sakhi-journeys.csv');
    });

    /* evidence */
    $('#recStart').addEventListener('click', Recorder.start);
    $('#recStop').addEventListener('click', Recorder.stop);
    $('#camOn').addEventListener('click', Camera.on);
    $('#camShot').addEventListener('click', Camera.shot);
    $('#camOff').addEventListener('click', Camera.off);
    $('#evList').addEventListener('click', function (e) {
      var b = e.target.closest('[data-ev]'); if (!b) return;
      var item = State.evidence.filter(function (x) { return String(x.ts) === b.dataset.ev; })[0];
      if (!item) return;
      var ext = item.kind === 'audio' ? 'webm' : 'jpg';
      download(item.blob, 'sakhi-' + item.kind + '-' + item.ts + '.' + ext);
    });

    /* zones */
    var ztype = 'Poor lighting';
    $('#zType').addEventListener('click', function (e) {
      var c = e.target.closest('.chip'); if (!c) return;
      $$('#zType .chip').forEach(function (x) { x.classList.remove('on'); });
      c.classList.add('on'); ztype = c.dataset.z;
    });
    $('#zAdd').addEventListener('click', function () {
      if (Zones.add(ztype, $('#zNote').value.trim())) {
        $('#zNote').value = '';
        paintZones();
        toast('Pinned. You will be warned within 300 m of it.');
      }
    });
    $('#zList').addEventListener('click', function (e) {
      var b = e.target.closest('[data-zdel]'); if (!b) return;
      Zones.remove(b.dataset.zdel); paintZones();
    });

    /* settings */
    $('#sName').addEventListener('input', function () { State.settings.name = this.value; saveSettings(); });
    $('#sMsg').addEventListener('input', function () { State.settings.msg = this.value; saveSettings(); });
    $('#sUnlock').addEventListener('input', function () { State.settings.unlock = this.value.replace(/\D/g, ''); saveSettings(); });
    $('#sPanic').addEventListener('input', function () { State.settings.panic = this.value.replace(/\D/g, ''); saveSettings(); });
    $('#sAutoStealth').addEventListener('change', function () { State.settings.autoStealth = this.checked; saveSettings(); });
    $('#sWA').addEventListener('change', function () { State.settings.wa = this.checked; saveSettings(); });
    $('#sSMS').addEventListener('change', function () { State.settings.sms = this.checked; saveSettings(); });
    $('#sCall').addEventListener('change', function () { State.settings.call = this.checked; saveSettings(); });
    $('#sPing').addEventListener('click', function (e) {
      var c = e.target.closest('.chip'); if (!c) return;
      $$('#sPing .chip').forEach(function (x) { x.classList.remove('on'); });
      c.classList.add('on');
      State.settings.ping = +c.dataset.p; saveSettings();
    });
    $('#dExport').addEventListener('click', function () {
      download(new Blob([JSON.stringify({
        guardians: State.guardians, zones: State.zones,
        journeys: State.journeys, settings: State.settings
      }, null, 2)], { type: 'application/json' }), 'sakhi-backup.json');
    });
    $('#dWipe').addEventListener('click', function () {
      if (!confirm('Erase guardians, pinned spots and journeys from this device?')) return;
      DB.wipe();
      State.guardians = []; State.zones = []; State.journeys = []; State.walk = null;
      paintGuardians(); paintZones(); paintWalk(); paintSettings();
      toast('Everything erased.');
    });

    /* stealth */
    $('#stealthBtn').addEventListener('click', function () {
      $('#toast').hidden = true;
      stealth(true);
    });
    $('.calc-pad').addEventListener('click', function (e) {
      var k = e.target.closest('.k'); if (!k) return;
      Calc.press(k.dataset.k);
    });
  }

  /* ---------------- boot ---------------- */
  function init() {
    wire();
    wireDial();
    route();
    paintGuardians(); paintZones(); paintWalk(); paintEvidence(); paintHelp(); paintSettings();

    Geo.onUpdate(function (pos) {
      paintFix(pos);
      if (pos) {
        Zones.check(pos);
        Walk.addPoint(pos);
        if (!$('#v-zones').hidden) paintZones();
      }
    });
    Geo.start();

    if (State.walk) Walk.run();
    if (State.settings.autoStealth) stealth(true);

    if ('serviceWorker' in navigator && window.isSecureContext) {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    }

    if (!State.guardians.length) {
      setTimeout(function () { toast('Start by adding one guardian — alerts need somewhere to go.', 5200); }, 1400);
    }
  }

  return {
    init: init, sos: sos, stealth: stealth,
    paintWalk: paintWalk, addEvidence: addEvidence
  };
})();

document.addEventListener('DOMContentLoaded', App.init);
