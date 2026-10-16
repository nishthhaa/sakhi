/* ============================================================
   features.js — the individual tools
   ============================================================ */

/* ---------------------------------------------------------
   1. Fake call — a convincing way out of a bad conversation
   --------------------------------------------------------- */
var FakeCall = (function () {
  var ringTimer = null, ringNodes = null, delayTimer = null, callTimer = null, scriptTimer = null;
  var seconds = 0;

  var LINES = [
    "Beta, where have you reached?",
    "Okay, I'm already outside in the car.",
    "Stay exactly where you are, I can see the shop.",
    "Two minutes. Keep talking to me.",
    "Yes, uncle is with me also."
  ];

  function ringOn() {
    var ctx = audioCtx();
    if (!ctx) return;
    function tone(freq, at, dur) {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = freq; o.type = 'sine';
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.3, at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      o.connect(g).connect(ctx.destination);
      o.start(at); o.stop(at + dur + 0.05);
    }
    function burst() {
      var t = ctx.currentTime;
      tone(440, t, 0.38); tone(480, t, 0.38);
      tone(440, t + 0.6, 0.38); tone(480, t + 0.6, 0.38);
      buzz([400, 200, 400]);
    }
    burst();
    ringTimer = setInterval(burst, 3000);
  }

  function ringOff() { clearInterval(ringTimer); ringTimer = null; buzz(0); }

  function show(name) {
    var el = $('#fakecall');
    $('#fcName').textContent = name;
    $('#fcAv').textContent = (name || '?').charAt(0).toUpperCase();
    $('#fcNum').textContent = 'mobile · +91 98••• ••210';
    $('#fcLive').hidden = true;
    $('.fc-actions').hidden = false;
    el.hidden = false;
    ringOn();
  }

  function accept() {
    ringOff();
    $('.fc-actions').hidden = true;
    $('#fcLive').hidden = false;
    seconds = 0;
    $('#fcTimer').textContent = '00:00';
    callTimer = setInterval(function () {
      seconds++;
      $('#fcTimer').textContent = mmss(seconds);
    }, 1000);

    var i = 0;
    function speak() {
      if (i >= LINES.length) i = 0;
      var line = LINES[i++];
      $('#fcScript').textContent = line;
      try {
        var u = new SpeechSynthesisUtterance(line);
        u.rate = 0.95; u.pitch = 0.85; u.lang = 'en-IN';
        speechSynthesis.speak(u);
      } catch (e) {}
    }
    speak();
    scriptTimer = setInterval(speak, 7000);
  }

  function end() {
    ringOff();
    clearInterval(callTimer); clearInterval(scriptTimer); clearTimeout(delayTimer);
    try { speechSynthesis.cancel(); } catch (e) {}
    $('#fakecall').hidden = true;
  }

  function schedule(delaySec, name) {
    audioCtx();                       // unlock audio inside the tap
    clearTimeout(delayTimer);
    delayTimer = setTimeout(function () { show(name || 'Papa'); }, delaySec * 1000);
    return delaySec;
  }

  return { schedule: schedule, accept: accept, end: end };
})();


/* ---------------------------------------------------------
   2. Recorder — audio evidence, kept on the device
   --------------------------------------------------------- */
var Recorder = (function () {
  var mr = null, chunks = [], stream = null, timer = null, sec = 0;

  function start() {
    if (!navigator.mediaDevices || !window.MediaRecorder) {
      toast('This browser cannot record audio.'); return;
    }
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (s) {
      stream = s; chunks = []; sec = 0;
      mr = new MediaRecorder(s);
      mr.ondataavailable = function (e) { if (e.data.size) chunks.push(e.data); };
      mr.onstop = function () {
        var blob = new Blob(chunks, { type: mr.mimeType || 'audio/webm' });
        App.addEvidence({
          kind: 'audio', blob: blob, ts: Date.now(),
          label: 'Recording · ' + mmss(sec),
          place: State.address || (State.pos ? Geo.coordText() : '')
        });
        stream.getTracks().forEach(function (t) { t.stop(); });
        stream = null;
      };
      mr.start();
      timer = setInterval(function () {
        sec++; $('#recTime').textContent = mmss(sec);
      }, 1000);
      $('#recLight').classList.add('on');
      $('#recStart').disabled = true;
      $('#recStop').disabled = false;
      toast('Recording. It keeps going while you use other pages.');
    }).catch(function () {
      toast('Microphone permission was refused.');
    });
  }

  function stop() {
    if (mr && mr.state !== 'inactive') mr.stop();
    clearInterval(timer);
    $('#recLight').classList.remove('on');
    $('#recStart').disabled = false;
    $('#recStop').disabled = true;
  }

  return { start: start, stop: stop, busy: function () { return !!(mr && mr.state === 'recording'); } };
})();


/* ---------------------------------------------------------
   3. Camera — a quick photo of the vehicle, the plate, the face
   --------------------------------------------------------- */
var Camera = (function () {
  var stream = null;

  function on() {
    if (!navigator.mediaDevices) { toast('No camera access in this browser.'); return; }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }).then(function (s) {
      stream = s;
      var v = $('#cam');
      v.srcObject = s; v.hidden = false; v.play();
      $('#camShot').disabled = false; $('#camOff').disabled = false; $('#camOn').disabled = true;
    }).catch(function () { toast('Camera permission was refused.'); });
  }

  function shot() {
    var v = $('#cam'), c = $('#camCanvas');
    if (!v.videoWidth) return;
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0);
    c.toBlob(function (blob) {
      App.addEvidence({
        kind: 'photo', blob: blob, ts: Date.now(),
        label: 'Photo', place: State.address || (State.pos ? Geo.coordText() : '')
      });
      buzz(40);
      toast('Photo saved to the locker.');
    }, 'image/jpeg', 0.9);
  }

  function off() {
    if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
    stream = null;
    var v = $('#cam'); v.hidden = true; v.srcObject = null;
    $('#camShot').disabled = true; $('#camOff').disabled = true; $('#camOn').disabled = false;
  }

  return { on: on, shot: shot, off: off };
})();


/* ---------------------------------------------------------
   4. Scream detection — sustained loud noise fires the alert
   --------------------------------------------------------- */
var Listener = (function () {
  var stream = null, raf = null, analyser = null, loudSince = 0;
  var THRESHOLD = 0.30, HOLD_MS = 1200;

  function start() {
    if (!navigator.mediaDevices) { toast('No microphone access here.'); return false; }
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (s) {
      var ctx = audioCtx();
      if (!ctx) return;
      stream = s;
      var src = ctx.createMediaStreamSource(s);
      analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      src.connect(analyser);
      var buf = new Uint8Array(analyser.fftSize);
      $('#micMeter').hidden = false;

      (function loop() {
        analyser.getByteTimeDomainData(buf);
        var sum = 0;
        for (var i = 0; i < buf.length; i++) {
          var v = (buf[i] - 128) / 128;
          sum += v * v;
        }
        var rms = Math.sqrt(sum / buf.length);
        $('#micFill').style.width = Math.min(100, rms * 260) + '%';

        if (rms > THRESHOLD) {
          if (!loudSince) loudSince = Date.now();
          if (Date.now() - loudSince > HOLD_MS) {
            loudSince = 0;
            App.sos('scream');
          }
        } else { loudSince = 0; }
        raf = requestAnimationFrame(loop);
      })();
      toast('Listening. A sustained scream will fire the alert.');
    }).catch(function () { toast('Microphone permission was refused.'); });
    return true;
  }

  function stop() {
    cancelAnimationFrame(raf);
    if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
    stream = null; analyser = null; loudSince = 0;
    $('#micMeter').hidden = true;
    $('#micFill').style.width = '0%';
  }

  return { start: start, stop: stop };
})();


/* ---------------------------------------------------------
   5. Shake detection — three hard shakes
   --------------------------------------------------------- */
var Shake = (function () {
  var on = false, hits = [], last = 0;

  function handler(e) {
    var a = e.accelerationIncludingGravity;
    if (!a) return;
    var mag = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
    var now = Date.now();
    if (mag > 26 && now - last > 320) {
      last = now;
      hits.push(now);
      hits = hits.filter(function (t) { return now - t < 2600; });
      if (hits.length >= 3) { hits = []; App.sos('shake'); }
    }
  }

  function start() {
    function attach() {
      window.addEventListener('devicemotion', handler);
      on = true;
      toast('Shake detection is on.');
    }
    if (typeof DeviceMotionEvent !== 'undefined' && DeviceMotionEvent.requestPermission) {
      DeviceMotionEvent.requestPermission().then(function (r) {
        if (r === 'granted') attach();
        else toast('Motion permission refused.');
      }).catch(function () { toast('Motion permission refused.'); });
    } else if ('ondevicemotion' in window) {
      attach();
    } else {
      toast('This device has no motion sensor. Use the SOS dial instead.');
      return false;
    }
    return true;
  }

  function stop() { window.removeEventListener('devicemotion', handler); on = false; hits = []; }

  return { start: start, stop: stop };
})();


/* ---------------------------------------------------------
   6. Safe walk — the check-in that alerts on its own
   --------------------------------------------------------- */
var Walk = (function () {
  var tick = null;

  function start(dest, mins, mode, plate) {
    var now = Date.now();
    State.walk = {
      dest: dest, mode: mode, plate: plate,
      start: now, due: now + mins * 60000,
      trail: State.pos ? [{ lat: State.pos.lat, lng: State.pos.lng, t: now }] : [],
      dist: 0, fired: false
    };
    saveWalk();
    run();
    return Alerts.build('walk-start', {
      dest: dest, mode: mode, plate: plate,
      eta: clockTime(new Date(State.walk.due))
    });
  }

  function addPoint(pos) {
    var w = State.walk;
    if (!w || !pos) return;
    var prev = w.trail[w.trail.length - 1];
    if (prev) {
      var d = Geo.distance(prev, pos);
      if (d < 12) return;              // ignore GPS jitter
      w.dist += d;
    }
    w.trail.push({ lat: pos.lat, lng: pos.lng, t: Date.now() });
    if (w.trail.length > 400) w.trail.shift();
    saveWalk();
    App.paintWalk();
  }

  function run() {
    clearInterval(tick);
    tick = setInterval(function () {
      var w = State.walk;
      if (!w) { clearInterval(tick); return; }
      App.paintWalk();
      if (!w.fired && Date.now() > w.due) {
        w.fired = true;
        saveWalk();
        buzz([500, 200, 500, 200, 500]);
        App.sos('walk-missed');
      }
    }, 1000);
    App.paintWalk();
  }

  function finish(status) {
    var w = State.walk;
    if (!w) return null;
    State.journeys.push({
      dest: w.dest, mode: w.mode, start: w.start, end: Date.now(),
      dist: w.dist, status: status, points: w.trail.length
    });
    saveJourneys();
    var d = w.dest;
    State.walk = null;
    saveWalk();
    clearInterval(tick);
    App.paintWalk();
    return d;
  }

  function extend(mins) {
    if (!State.walk) return;
    State.walk.due += mins * 60000;
    State.walk.fired = false;
    saveWalk();
    App.paintWalk();
  }

  return { start: start, run: run, finish: finish, extend: extend, addPoint: addPoint };
})();


/* ---------------------------------------------------------
   7. Zones — places you marked, and the warning when you return
   --------------------------------------------------------- */
var Zones = (function () {
  var warnedId = null;

  function add(type, note) {
    if (!State.pos) { toast('Waiting for a GPS fix before pinning this spot.'); return false; }
    State.zones.unshift({
      id: 'z' + Date.now(), type: type, note: note,
      lat: State.pos.lat, lng: State.pos.lng, ts: Date.now()
    });
    saveZones();
    return true;
  }

  function remove(id) {
    State.zones = State.zones.filter(function (z) { return z.id !== id; });
    saveZones();
  }

  function check(pos) {
    var box = $('#zoneWarn');
    if (!pos || !State.zones.length) { box.hidden = true; return; }
    var near = null, best = 1e9;
    State.zones.forEach(function (z) {
      if (z.type === 'Felt safe') return;
      var d = Geo.distance(pos, z);
      if (d < 300 && d < best) { best = d; near = z; }
    });
    if (near) {
      box.hidden = false;
      box.textContent = 'You are about ' + Math.round(best) + ' m from a spot you marked as "' +
                        near.type.toLowerCase() + '"' + (near.note ? ' — ' + near.note : '') + '.';
      if (warnedId !== near.id) { warnedId = near.id; buzz([120, 80, 120]); }
    } else {
      box.hidden = true;
      warnedId = null;
    }
  }

  return { add: add, remove: remove, check: check };
})();


/* ---------------------------------------------------------
   8. Calculator — the disguise, and a working calculator
   --------------------------------------------------------- */
var Calc = (function () {
  var cur = '0', prev = null, op = null, fresh = true, typed = '';

  function paint() {
    $('#calcMain').textContent = cur.length > 12 ? Number(cur).toPrecision(9) : cur;
    $('#calcSub').textContent = prev !== null ? prev + ' ' + (op === '*' ? '×' : op === '/' ? '÷' : op) : '';
  }

  function compute() {
    var a = parseFloat(prev), b = parseFloat(cur), r = b;
    if (op === '+') r = a + b;
    if (op === '-') r = a - b;
    if (op === '*') r = a * b;
    if (op === '/') r = b === 0 ? NaN : a / b;
    return isFinite(r) ? String(Math.round(r * 1e10) / 1e10) : 'Error';
  }

  function press(k) {
    if (/^[0-9]$/.test(k)) {
      typed += k;
      cur = (fresh || cur === '0') ? k : cur + k;
      fresh = false;
    } else if (k === '.') {
      if (fresh) { cur = '0.'; fresh = false; }
      else if (cur.indexOf('.') < 0) cur += '.';
    } else if (k === 'AC') {
      cur = '0'; prev = null; op = null; fresh = true; typed = '';
    } else if (k === '+/-') {
      cur = cur.charAt(0) === '-' ? cur.slice(1) : '-' + cur;
    } else if (k === '%') {
      cur = String(parseFloat(cur) / 100);
    } else if (k === '=') {
      var s = State.settings;
      if (typed === s.panic) { typed = ''; cur = '0'; paint(); App.sos('stealth-panic'); return; }
      if (typed === s.unlock) { typed = ''; cur = '0'; paint(); App.stealth(false); return; }
      typed = '';
      if (op && prev !== null) { cur = compute(); prev = null; op = null; fresh = true; }
    } else {
      if (op && prev !== null && !fresh) cur = compute();
      prev = cur; op = k; fresh = true; typed = '';
    }
    paint();
  }

  return { press: press, paint: paint };
})();
