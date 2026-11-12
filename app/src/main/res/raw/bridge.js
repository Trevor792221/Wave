// Wave page bridge. Injected into the Tidal web player.
// - Hooks Media Session handlers so remote buttons can call the player's own actions.
// - Reports play state + track info to the app (WaveApp.state).
// - W.cmd(c) runs play/pause/toggle/next/prev and returns how it did it (useful when debugging).
// - W.nav(dir) moves a highlight ring between clickable things (spatial navigation).
// - Fair shuffle: with shuffle on, songs already played in this round of a playlist are skipped.
// - Reports where the spectrum analyzer goes while Tidal's full-screen player is open.
// - Wave Mobile: swipe gestures in the full-screen player (W.enableSwipes).
(function () {
  // Installed only once fully set up (W.ready). A run that broke halfway gets replaced,
  // keeping any Media Session handlers it already captured.
  if (window.__wave && window.__wave.ready) return;
  var W = window.__wave = { h: (window.__wave && window.__wave.h) || {} };
  var ms = navigator.mediaSession;
  if (ms && ms.setActionHandler && !ms.setActionHandler.__wave) {
    var orig = ms.setActionHandler.bind(ms);
    ms.setActionHandler = function (a, f) { window.__wave.h[a] = f; return orig(a, f); };
    ms.setActionHandler.__wave = true;
  }

  // Pause and play fade instead of cutting (from TIDAL+'s audio.js, in the Tidal- repo): a short
  // fade out before the song stops, then a moment for the sound already handed to Android to
  // play out, and a fade back in when it starts again, however it was paused or played (Tidal's
  // buttons, the notification, headphones, Android Auto). Cutting the sound off mid-wave clicks,
  // more so with Wave's analyzer in Android's effects chain. Tidal never sees the fades: reading
  // the volume gives what Tidal set. Installed once (a re-run of this script leaves it be).
  (function () {
    var proto = HTMLMediaElement.prototype;
    if (proto.pause.__waveFade) return;
    var OUTPUT_TAIL_MS = 250, STEP_MS = 8;
    // 0.8 s each way in 200 even volume steps (one every 4 ms: as smooth as the page can go).
    // Developer options can change them (wave.fadeOut / wave.fadeIn in ms, wave.fadeSteps).
    var fadeSetting = function (k, def, lo, hi) {
      var v = NaN;
      try { v = parseInt(localStorage.getItem('wave.' + k), 10); } catch (e) {}
      return isFinite(v) ? Math.max(lo, Math.min(hi, v)) : def;
    };
    var outMs = function () { return fadeSetting('fadeOut', 800, 50, 6000); };
    var inMs = function () { return fadeSetting('fadeIn', 800, 50, 6000); };
    var fadeSteps = function () { return fadeSetting('fadeSteps', 200, 10, 400); };
    // On or off: the "Soft pause" switch above Tidal's Crossfade setting (on by default).
    var softOn = function () { try { return localStorage.getItem('wave.softPause') !== '0'; } catch (e) { return true; } };
    var clamp = function (v) { return Math.max(0, Math.min(1, v)); };
    // Raised-cosine curve: eases into and out of silence in tiny steps.
    var curve = function (x) { return (1 - Math.cos(Math.PI * clamp(x))) / 2; };
    var uncurve = function (l) { return Math.acos(1 - 2 * clamp(l)) / Math.PI; };
    var realPlay = proto.play, realPause = proto.pause;
    var volumeDesc = Object.getOwnPropertyDescriptor(proto, 'volume');
    var states = new WeakMap(), gains = new WeakMap(), players = new Set();

    function state(el) {
      var st = states.get(el);
      if (!st) {
        st = { base: volumeDesc.get.call(el), mult: 1, fade: null, newTrack: true };
        states.set(el, st);
        el.addEventListener('loadstart', function () { st.newTrack = true; st.resumeIn = false; stopFade(el); setMult(el, 1); });
        el.addEventListener('playing', function () { if (st.newTrack || el.currentTime <= 1) st.newTrack = false; st.playingAt = Date.now(); });
      }
      return st;
    }
    function apply(el) {
      var st = state(el), gain = gains.get(el);
      if (gain) { gain.gain.value = st.mult; volumeDesc.set.call(el, st.base); }
      else volumeDesc.set.call(el, clamp(st.base * st.mult));
    }
    function setMult(el, m) { var st = state(el); if (st.mult !== m) { st.mult = clamp(m); apply(el); } }
    Object.defineProperty(proto, 'volume', {
      configurable: true, enumerable: true,
      get: function () { var st = states.get(this); return st ? st.base : volumeDesc.get.call(this); },
      set: function (v) { var st = state(this); st.base = clamp(Number(v)); apply(this); }
    });
    // Played through Web Audio: a gain node of Wave's own between the element and Tidal's chain.
    [window.AudioContext, window.webkitAudioContext].forEach(function (Ctx) {
      if (!Ctx || !Ctx.prototype.createMediaElementSource) return;
      var realCreate = Ctx.prototype.createMediaElementSource;
      Ctx.prototype.createMediaElementSource = function (el) {
        var source = realCreate.call(this, el);
        try {
          var gain = this.createGain();
          AudioNode.prototype.connect.call(source, gain);
          source.connect = function () { return gain.connect.apply(gain, arguments); };
          source.disconnect = function () { return gain.disconnect.apply(gain, arguments); };
          gains.set(el, gain);
          apply(el);
        } catch (e) {}
        return source;
      };
    });
    function stopFade(el) { var st = state(el); if (st.fade) { clearInterval(st.fade.timer); clearTimeout(st.fade.timer); st.fade = null; } }
    // Moves the fade level to `to` over `ms` in `steps` even volume steps (more steps: smoother).
    function ramp(el, to, ms, kind, done, steps) {
      stopFade(el);
      var st = state(el), x0 = uncurve(st.mult), x1 = uncurve(to), start = performance.now(), fade = { kind: kind, timer: 0 };
      var n = Math.max(1, Math.round(steps || ms / STEP_MS)), every = Math.max(4, ms / n);
      st.fade = fade;
      var step = function () {
        if (st.fade !== fade) return;
        var k = ms > 0 ? Math.min(n, Math.floor((performance.now() - start) / every + 1e-6)) : n;
        var t = k / n;
        setMult(el, curve(x0 + (x1 - x0) * t));
        if (t >= 1) { clearInterval(fade.timer); st.fade = null; if (done) done(); }
      };
      fade.timer = setInterval(step, every);
      step();
    }
    function fadeOutThenPause(el) {
      var st = state(el);
      ramp(el, 0, outMs(), 'pause', fadeOutDone, fadeSteps());
      function fadeOutDone() {
        var fade = { kind: 'pause', timer: 0 };
        st.fade = fade;
        fade.timer = setTimeout(function () {
          if (st.fade === fade) { st.fade = null; realPause.call(el); st.resumeIn = true; }
        }, OUTPUT_TAIL_MS);
      }
    }
    var isSong = function (el) { return isFinite(el.duration) && el.duration > 1; };
    var audible = function (el) { return !el.muted && state(el).base > 0.01; };
    // Pausing during a crossfade (Tidal's own setting): both songs pause, with the same fade.
    function pausePartners(el) {
      players.forEach(function (o) {
        if (o === el || o.paused || !isSong(o)) return;
        // Just started: that's the next song taking over (Tidal plays it on another player),
        // not a song to pause along with this one.
        if (Date.now() - (state(o).playingAt || 0) < 4000) return;
        var so = state(o);
        so.pausedWith = el;
        if (so.fade && so.fade.kind === 'pause') return;
        if (!audible(o) || so.mult < 0.05) { stopFade(o); realPause.call(o); } else fadeOutThenPause(o);
      });
    }
    proto.pause = function () {
      var st = state(this);
      players.add(this);
      if (!softOn()) { stopFade(this); setMult(this, 1); return realPause.call(this); }
      // At the very end of a song Tidal stops it as the next one starts: a handover, not the
      // listener pausing. It stops at once, and the next song is left playing.
      if (isSong(this) && this.duration - this.currentTime < 2) { stopFade(this); return realPause.call(this); }
      if (!this.paused && audible(this) && st.mult >= 0.05) pausePartners(this);
      if (st.fade && st.fade.kind === 'pause') return undefined; // already fading out
      if (this.paused || this.ended || !audible(this) || !isSong(this) || this.currentTime < 0.5 || st.mult < 0.05) {
        stopFade(this);
        return realPause.call(this);
      }
      fadeOutThenPause(this);
      return undefined;
    };
    proto.pause.__waveFade = true;
    proto.play = function () {
      var st = state(this), self = this;
      players.add(this);
      if (!softOn()) { stopFade(this); setMult(this, 1); st.resumeIn = false; return realPlay.call(this); }
      st.pausedWith = null;
      players.forEach(function (other) { // resumed mid-crossfade: the other song carries on too
        var so = state(other);
        if (other === self || so.pausedWith !== self) return;
        so.pausedWith = null;
        if (so.fade && so.fade.kind === 'pause') ramp(other, 1, inMs(), 'in', null, fadeSteps());
        else if (other.paused) {
          so.resumeIn = false;
          setMult(other, 0);
          var p = realPlay.call(other);
          ramp(other, 1, inMs(), 'in', null, fadeSteps());
          if (p && p.catch) p.catch(function () {});
        }
      });
      if (st.fade && st.fade.kind === 'pause') { // played again while fading out: never stopped
        ramp(this, 1, inMs(), 'in', null, fadeSteps());
        return Promise.resolve();
      }
      if (this.paused && st.resumeIn && !st.newTrack && audible(this) && this.currentTime >= 0.5) {
        st.resumeIn = false;
        setMult(this, 0);
        var result = realPlay.call(this);
        ramp(this, 1, inMs(), 'in', null, fadeSteps());
        if (result && result.catch) result.catch(function () { stopFade(self); setMult(self, 1); });
        return result;
      }
      return realPlay.call(this);
    };
    W.fadeMs = function () { return softOn() ? outMs() + OUTPUT_TAIL_MS : 0; }; // how long a pause takes to really stop
  })();

  // Full screen is refused (Wave is already full screen; the player's full-screen button only
  // broke navigation): requests resolve without doing anything, and the ring skips those buttons.
  (function () {
    var no = function () { return Promise.resolve(); };
    var E = Element.prototype;
    ['requestFullscreen', 'webkitRequestFullscreen', 'webkitRequestFullScreen'].forEach(function (m) {
      if (E[m]) E[m] = no;
    });
    // Say full screen isn't available, so Tidal doesn't offer its button.
    ['fullscreenEnabled', 'webkitFullscreenEnabled'].forEach(function (k) {
      try { Object.defineProperty(Document.prototype, k, { configurable: true, get: function () { return false; } }); } catch (e) {}
    });
  })();

  // The element that's actually playing; Tidal may keep others around (e.g. preloading).
  function media() {
    var e = document.querySelectorAll('video,audio'), loaded = null;
    for (var i = 0; i < e.length; i++) {
      if (!e[i].paused && !e[i].ended) return e[i];
      if (!loaded && e[i].currentSrc) loaded = e[i];
    }
    return loaded || e[0];
  }

  function report() {
    fairAttach();
    if (!window.WaveApp) return;
    var e = media(), n = { title: '', artist: '', art: '', dur: 0, pos: 0, quality: '', fav: false };
    try { n = nowPlaying(); } catch (x) {} // play/pause is reported even if the song details can't be read
    WaveApp.state(!!(e && !e.paused && !e.ended), n.title, n.artist, n.art, n.dur, n.pos, n.quality || '', !!n.fav, n.tier || '');
  }
  function txt(el) { return el ? (el.textContent || '').replace(/\s+/g, ' ').trim() : ''; }
  // The artists, one link each in Tidal's player bar (seen with Wave Probe 3), as "A, B".
  function artists(el) {
    if (!el) return '';
    var links = el.querySelectorAll('[data-test="grid-item-detail-text-title-artist"]'), names = [];
    for (var i = 0; i < links.length; i++) { var n = txt(links[i]); if (n && names.indexOf(n) < 0) names.push(n); }
    return names.length ? names.join(', ') : txt(el);
  }
  // What's playing, for Android's media controls and notification. Android's WebView has no
  // Media Session API, so it comes from Tidal itself: the song from its player bar, the length and
  // position from its player state (else the audio). Times in milliseconds.
  function nowPlaying() {
    var md = ms && ms.metadata, title = (md && md.title) || '', artist = (md && md.artist) || '', art = '';
    if (md && md.artwork && md.artwork.length) art = md.artwork[md.artwork.length - 1].src || ''; // biggest last
    var footer = document.querySelector('[data-test="footer-player"]') || compactBar();
    if (footer) {
      if (!title) title = txt(footer.querySelector('[data-test="footer-track-title"]'));
      if (!artist) artist = artists(footer.querySelector('[data-test="footer-artist-name"]'));
      if (!title || !artist) { // no markers: the first two lines of text in the bar
        var texts = [], w = document.createTreeWalker(footer, NodeFilter.SHOW_TEXT), t;
        while ((t = w.nextNode()) && texts.length < 2) {
          var v = t.nodeValue.trim();
          if (v && v.length > 1 && !t.parentElement.closest('button,[role="button"],time') && texts.indexOf(v) < 0) texts.push(v);
        }
        title = title || texts[0] || '';
        artist = artist || texts[1] || '';
      }
      if (!art) {
        var im = footer.querySelector('[data-test="current-media-imagery"] img') || footer.querySelector('img');
        if (im) art = (im.currentSrc || im.src || '').replace(/\/\d+x\d+(\.\w+)$/, '/640x640$1'); // a bigger copy
      }
    }
    var pc = null, e = media(), dur = 0, pos = 0;
    try { pc = fairStore && fairStore.getState().playbackControls; } catch (x) {}
    if (pc && pc.playbackContext && pc.playbackContext.actualDuration) dur = pc.playbackContext.actualDuration;
    else if (e && isFinite(e.duration)) dur = e.duration;
    if (pc && typeof pc.latestCurrentTime === 'number') {
      pos = pc.latestCurrentTime;
      if (pc.playbackState === 'PLAYING' && pc.latestCurrentTimeSyncTimestamp) pos += (Date.now() - pc.latestCurrentTimeSyncTimestamp) / 1000;
    } else if (e) {
      pos = e.currentTime || 0;
    }
    if (dur) pos = Math.min(pos, dur);
    return { title: title, artist: artist, art: art, dur: Math.round(dur * 1000), pos: Math.round(pos * 1000),
             quality: streamQuality(pc && pc.playbackContext), fav: inCollection(),
             tier: String((pc && pc.playbackContext && pc.playbackContext.actualAudioQuality) || '') };
  }
  // The playing track's id: from Tidal's play queue, else its player state.
  function currentTrackId() {
    try {
      var st = fairStore.getState(), q = st.playQueue, el = q && q.elements && q.elements[q.currentIndex];
      var id = el && el.mediaItemId;
      if (!id && st.playbackControls && st.playbackControls.mediaProduct) id = st.playbackControls.mediaProduct.productId;
      id = Number(id);
      return id > 0 ? id : 0;
    } catch (e) { return 0; }
  }
  // Whether the song is in My Collection: Tidal's own list of favourite tracks, else its heart button.
  function inCollection() {
    var id = currentTrackId();
    if (fairStore && id) {
      try {
        var f = fairStore.getState().favorites;
        if (f && Array.isArray(f.tracks)) {
          for (var i = 0; i < f.tracks.length; i++) if (Number(f.tracks[i]) === id) return true;
          return false;
        }
      } catch (e) {}
    }
    var h = document.querySelector('[data-test="footer-favorite-button"]');
    return !!h && h.getAttribute('aria-checked') === 'true';
  }
  // What Tidal is actually streaming, from its player state: "FLAC · 24-bit / 96 kHz · 2304 kbps".
  function streamQuality(c) {
    if (!c) return '';
    var out = [], codec = String(c.codec || '').trim().toUpperCase();
    if (/^(AACL|MP4A|HEAAC)/.test(codec)) codec = 'AAC';
    if (codec) out.push(codec);
    if (c.bitDepth && c.sampleRate) out.push(c.bitDepth + '-bit / ' + Math.round(c.sampleRate / 100) / 10 + ' kHz');
    else if (c.sampleRate) out.push(Math.round(c.sampleRate / 100) / 10 + ' kHz');
    if (c.bandwidth) out.push(Math.round(c.bandwidth / 1000) + ' kbps');
    return out.join(' \u00b7 ');
  }
  ['play', 'playing', 'pause', 'ended', 'emptied'].forEach(function (t) {
    document.addEventListener(t, report, true);
  });
  setInterval(report, 5000);

  // ---------- Fair shuffle ----------
  // With shuffle on, a playlist (album, mix...) doesn't repeat a song until every song in it has
  // played. Works with Tidal's own state store (React + Redux): its play queue says which list is
  // playing, the songs' ids, the current one and whether shuffle is on. When Tidal moves on to a
  // song already heard this round, Wave jumps to the next unheard song in Tidal's queue with
  // Tidal's own action. Songs you pick, Previous and repeat-one are left alone.
  var FAIR_KEY = 'wave.fair', fairStore = null, fairLast = null, fairJumping = false;
  var userPickAt = 0, shuffleStartAt = 0, fairTries = 0, fairMem = {}, fairCountNext = false;
  try { fairMem = JSON.parse(localStorage.getItem(FAIR_KEY)) || {}; } catch (e) {}

  function isStore(v) {
    return v && typeof v === 'object' && typeof v.getState === 'function' &&
      typeof v.dispatch === 'function' && typeof v.subscribe === 'function';
  }
  // React keeps its internal tree on the page's elements; walk up to the root, then look for the
  // component that was handed the store.
  function findStore() {
    var els = document.querySelectorAll('button,a'), f = null;
    for (var i = 0; i < els.length && i < 30 && !f; i++) {
      var ks = Object.keys(els[i]);
      for (var k = 0; k < ks.length; k++) {
        if (ks[k].indexOf('__reactFiber$') === 0 || ks[k].indexOf('__reactInternalInstance$') === 0) { f = els[i][ks[k]]; break; }
      }
    }
    if (!f) return null;
    while (f.return) f = f.return;
    var stack = [f], seen = 0;
    while (stack.length && seen++ < 20000) {
      var x = stack.pop(), pr = x.memoizedProps;
      if (pr && typeof pr === 'object') {
        if (isStore(pr.store)) return pr.store;
        if (pr.value && isStore(pr.value.store)) return pr.value.store;
        if (isStore(pr.value)) return pr.value;
      }
      if (x.sibling) stack.push(x.sibling);
      if (x.child) stack.push(x.child);
    }
    return null;
  }
  function fairAttach() {
    if (fairStore || fairTries > 60 || !document.body) return;
    fairTries++;
    var st = null;
    try { st = findStore(); } catch (e) {}
    if (!st) return;
    fairStore = st;
    var real = st.dispatch;
    st.dispatch = function (a) {
      try {
        if (a && /^view\/(ENTER|EXIT)(ED)?_NOWPLAYING$/.test(a.type)) { // the full-screen player
          npAction = /ENTER/.test(a.type);
          npActionAt = Date.now();
          setTimeout(spot, 50);
        }
        if (a && a.type === 'playQueue/MOVE_TO' && !fairJumping) userPickAt = Date.now(); // picked in the queue
        else if (a && a.type === 'playQueue/ADD_TRACK_LIST_TO_PLAY_QUEUE') {
          fairCountNext = true; // the list's own size = the queue right after it's added
          if (a.payload && a.payload.forceShuffle) shuffleStartAt = Date.now(); // shuffle-play a list
          else userPickAt = Date.now();                                          // a song tapped in a list
        }
      } catch (e) {}
      // Tidal's quality changed by something other than Wave: that's the choice for this network.
      if (a && a.type === 'settings/SET_STREAMING_QUALITY' && !settingQuality && a.payload && QUALITIES[a.payload.to]) saveQuality(net, a.payload.to);
      // Picking a song while another plays: pause it first (see switchSongs).
      if (a && !fairJumping && (a.type === 'playQueue/MOVE_TO' || a.type === 'playQueue/ADD_TRACK_LIST_TO_PLAY_QUEUE')) {
        var self = this, args = arguments;
        if (switchSongs(function () { real.apply(self, args); })) return a;
      }
      return real.apply(this, arguments);
    };
    st.subscribe(fairChange);
    st.subscribe(checkPlayerOpened);
    st.subscribe(resumeCheck);
    applyQuality();
    setTimeout(resumeWhereLeft, 1500); // once Tidal has restored its queue
    fairChange();
    npAction = false; // Tidal starts with its player closed
  }
  // TVs decode Tidal's protected audio on hardware that can't start a new stream while the old
  // one is still playing: switching songs mid-play left Tidal's player stuck at 0:00 with the
  // loading ring. So the playing song is paused first and the switch happens 0.4 s later.
  // Returns false (nothing to wait for) when nothing is playing.
  // Phones don't need it. A newer pick made while one is waiting replaces it (the last one wins).
  var switchTimer = 0;
  function switchSongs(go) {
    if (W.phone) return false;
    var els = document.querySelectorAll('video,audio'), paused = false;
    for (var i = 0; i < els.length; i++) if (!els[i].paused) { els[i].pause(); paused = true; }
    if (switchTimer) { clearTimeout(switchTimer); paused = true; } // an earlier pick still waiting: drop it
    if (!paused) return false;
    switchTimer = setTimeout(function () { switchTimer = 0; go(); }, 400 + (W.fadeMs ? W.fadeMs() : 0)); // after the fade-out
    return true;
  }

  // Fair shuffle on/off: hold Tidal's shuffle button. Remembered across restarts.
  var FAIR_OFF_KEY = 'wave.fairOff', fairOn = true;
  try { fairOn = localStorage.getItem(FAIR_OFF_KEY) !== '1'; } catch (e) {}
  function setFair(on, quiet) {
    fairOn = on;
    try { if (on) localStorage.removeItem(FAIR_OFF_KEY); else localStorage.setItem(FAIR_OFF_KEY, '1'); } catch (e) {}
    syncSettings();
    if (!quiet) note(on ? 'Fair shuffle on: no repeats until every song has played' : 'Fair shuffle off: Tidal\'s own shuffle');
  }
  W.setFair = setFair;
  function shuffleButton(t) {
    var b = t && t.closest && t.closest('button,[role="button"]');
    return b && /shuffle/i.test(label(b)) ? b : null;
  }
  (function () {
    var timer = 0, held = null, fired = false;
    function cancel() { clearTimeout(timer); timer = 0; }
    addEventListener('touchstart', function (e) {
      held = shuffleButton(e.target);
      fired = false;
      cancel();
      if (held) timer = setTimeout(function () { fired = true; setFair(!fairOn); }, 600);
    }, true);
    ['touchend', 'touchcancel', 'touchmove'].forEach(function (t) { addEventListener(t, cancel, true); });
    function swallow(e) {
      if (fired && shuffleButton(e.target) === held) { e.preventDefault(); e.stopPropagation(); if (e.type === 'click') fired = false; }
    }
    addEventListener('click', swallow, true);       // the hold doesn't also flip Tidal's shuffle
    addEventListener('contextmenu', function (e) { if (shuffleButton(e.target)) e.preventDefault(); }, true);
  })();

  function fairQueue() {
    try { var q = fairStore.getState().playQueue; return q && Array.isArray(q.elements) ? q : null; } catch (e) { return null; }
  }
  function fairSave() {
    var keys = Object.keys(fairMem).sort(function (a, b) { return fairMem[b].t - fairMem[a].t; });
    for (var i = 30; i < keys.length; i++) delete fairMem[keys[i]]; // remember the 30 latest lists
    try { localStorage.setItem(FAIR_KEY, JSON.stringify(fairMem)); } catch (e) {}
  }
  function fairChange() {
    var q = fairQueue();
    if (!q) return;
    var idx = q.currentIndex, el = q.elements[idx];
    if (!el || el.mediaItemId === undefined) return;
    var src = (q.sourceEntityType || '?') + ':' + (q.sourceEntityId || '?'), id = String(el.mediaItemId);
    if (fairLast && fairLast.src === src && fairLast.idx === idx && fairLast.id === id) return; // nothing moved
    var prev = fairLast, now = Date.now();
    fairLast = { src: src, idx: idx, id: id };

    var mem = fairMem[src] || (fairMem[src] = { h: [], t: 0 });
    mem.t = now;
    if (fairCountNext) { fairCountNext = false; mem.n = q.elements.length; }
    // Songs Tidal adds after the list (autoplay / related music) aren't part of the round.
    var n = mem.n && mem.n <= q.elements.length ? mem.n : q.elements.length;
    if (q.sourceName) mem.name = String(q.sourceName).slice(0, 80); // for the Wave tab
    mem.size = n;
    if (idx >= n) return;

    var movedOn = prev && prev.src === src && (idx === prev.idx + 1 || (idx === 0 && prev.idx === n - 1));
    var started = now - shuffleStartAt < 3000;
    if (started) shuffleStartAt = 0;
    // A song you pick counts as yours if it starts within 5 s (slow connections included).
    var picked = now - userPickAt < 5000;
    if (picked) userPickAt = 0; // a pick only counts for the song it started
    if ((picked || started) && !W.phone) openPlayerWhenPlaying(); // you picked something: show the player (TV)
    if (!fairOn) return; // fair shuffle switched off: Tidal's own shuffle
    var heard = {}, i;
    for (i = 0; i < mem.h.length; i++) heard[mem.h[i]] = 1;
    fairPending = null; // the song before this one: counted already, or played too short to count

    if (q.shuffleModeEnabled && (movedOn || started) && !picked && heard[id]) {
      for (var step = 1; step < n; step++) {
        var j = (idx + step) % n;
        if (!heard[String(q.elements[j].mediaItemId)]) { fairJumpSoon(src, idx, id, j); return; } // that song counts once it has played 10 s
      }
      mem.h = []; // nothing unheard left (shouldn't happen: rounds end at their last song)
      heard = {};
    }
    // The song counts as played once it has really played for 10 s (fairListen): skipped sooner,
    // it stays in the round.
    fairPending = heard[id] ? null : { src: src, id: id, ms: 0, at: 0 };
    fairSave();
    renderRounds();
  }
  var fairPending = null, FAIR_LISTEN_MS = 10000;
  // Once a second: playing time of the song that's on, while it plays (not while paused or after a
  // seek ahead). At 10 s it's marked played in its list's round.
  function fairListen() {
    var pd = fairPending, q = fairQueue();
    if (!pd || !q || !fairOn) { if (pd) pd.at = 0; return; }
    var el = q.elements[q.currentIndex];
    if (!el || String(el.mediaItemId) !== pd.id || !fairLast || fairLast.src !== pd.src) { fairPending = null; return; }
    var playing = false;
    try { playing = fairStore.getState().playbackControls.playbackState === 'PLAYING'; } catch (e) {}
    var now = Date.now();
    if (playing && pd.at) pd.ms += Math.min(now - pd.at, 5000); // a late tick counts for at most 5 s
    pd.at = playing ? now : 0;
    if (pd.ms < FAIR_LISTEN_MS) return;
    fairPending = null;
    var mem = fairMem[pd.src];
    if (!mem) return;
    var n = mem.size || q.elements.length, heard = {}, i, count = 0;
    if (mem.h.indexOf(pd.id) < 0) mem.h.push(pd.id);
    for (i = 0; i < mem.h.length; i++) heard[mem.h[i]] = 1;
    for (i = 0; i < n && i < q.elements.length; i++) if (heard[String(q.elements[i].mediaItemId)]) count++;
    if (count >= n) {
      mem.h = []; // the round is complete: the next song (or next time) starts a new one
      if (q.shuffleModeEnabled) note('Fair shuffle: all ' + n + ' played, new round next');
    } else if (q.shuffleModeEnabled) {
      note('Fair shuffle: ' + count + ' of ' + n + ' played');
    }
    fairSave();
    renderRounds();
  }
  setInterval(fairListen, 1000);
  // ---------- Spectrum analyzer placement ----------
  // While Tidal's full-screen player is open, tell the app where the analyzer's bars go: over the
  // lower part of the cover art, standing on the cover's bottom edge and as wide as the cover
  // ("l,t,w,h,viewportWidth|coverUrl" in CSS px, or "off"). The app puts the frequency labels just
  // under the cover and colours the bars from the cover.
  var npAction = null, npActionAt = 0, lastSpot = '';
  function playerOpen() {
    var open = npAction;
    try {
      var v = fairStore.getState().view;
      // Tidal's own flag, unless an open/close action just happened (the flag can lag its animation).
      if (v && typeof v === 'object' && Date.now() - npActionAt > 2000) {
        if (typeof v.isNowPlaying === 'boolean') open = v.isNowPlaying || v.showNowPlaying === true;
        else for (var k in v) if (/now_?playing/i.test(k) && typeof v[k] === 'boolean') { open = v[k]; break; }
      }
    } catch (e) {}
    return !!open;
  }
  // Fallback when Tidal's state doesn't say: the player's own tabs (Credits, Lyrics) near the top.
  function playerTabsShown() {
    var els = document.querySelectorAll('button,a,[role="tab"]'), seen = 0;
    for (var i = 0; i < els.length && seen < 2; i++) {
      var t = (els[i].textContent || '').trim();
      if (t !== 'Credits' && t !== 'Lyrics') continue;
      var r = rectOf(els[i]);
      if (r && r.top >= 0 && r.top < innerHeight * 0.25) seen++;
    }
    return seen >= 2;
  }
  // Something else (a menu, a dialog) is on top of part of r: the analyzer there hides.
  function covered(r, box, also) {
    var pts = [[0.5, 0.5], [0.1, 0.2], [0.9, 0.2], [0.1, 0.8], [0.9, 0.8]];
    for (var i = 0; i < pts.length; i++) {
      var x = r.left + r.width * pts[i][0], y = r.top + r.height * pts[i][1];
      if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue;
      var el = document.elementFromPoint(x, y);
      if (el && !box.contains(el) && !(also && also.contains(el))) return true; // `also`: allowed on top
    }
    return false;
  }
  function spotRect() {
    if (!(fairStore && playerOpen()) && !playerTabsShown()) return 'off';
    var vw = innerWidth, vh = innerHeight, cover = null, best = 0, i;
    // Tidal's player cover; if it's ever not found, the biggest roughly square picture fully on
    // screen that isn't a full-screen backdrop.
    var art = document.querySelector('[data-test="now-playing-artwork"]'), ar = art && rectOf(art);
    var coverEl = null;
    // Partly off screen counts too (landscape: the cover can be taller than the screen); the
    // visible part is used.
    if (ar && ar.width > 0 && Math.min(ar.bottom, vh) - Math.max(ar.top, 0) >= ar.height * 0.4) { cover = ar; coverEl = art; best = ar.width * ar.height; }
    var imgs = cover ? [] : document.querySelectorAll('img,video,canvas');
    for (i = 0; i < imgs.length; i++) {
      var r = rectOf(imgs[i]), a = r ? r.width * r.height : 0;
      if (!r || r.top < 0 || r.bottom > vh || r.left < 0 || r.right > vw) continue;
      if (a > vw * vh * 0.5 || r.width / r.height < 0.8 || r.width / r.height > 1.25) continue;
      if (a > best) { best = a; cover = r; coverEl = imgs[i]; }
    }
    if (!cover || best < vw * vh * 0.04) return 'off';
    var h = Math.max(40, Math.min(160, cover.height * 0.22));
    var visTop = Math.max(cover.top, 0), visBottom = Math.min(cover.bottom, vh), clipped = visBottom < cover.bottom;
    // Tidal's wide layout (landscape) keeps its player bar over the bottom of the full-screen
    // player (seen with Wave Probe 7): no room for the quality line under the cover then.
    var bar = document.querySelector('[data-test="footer-player"]'), br = bar && rectOf(bar), onBar = false;
    if (br && br.top < visBottom && br.bottom > visTop && br.left < cover.right && br.right > cover.left) {
      onBar = true;
      clipped = true;
    }
    if (visBottom - visTop < cover.height * 0.4) return 'off';
    var top = visBottom - h; // on the cover's (visible) bottom edge
    var box = (coverEl.closest && coverEl.closest('[data-test="new-now-playing"]')) || coverEl.parentElement || coverEl;
    if (covered({ left: cover.left, top: top, width: cover.width, height: h }, box, onBar ? bar : null)) return 'off';
    var url = coverEl && coverEl.tagName === 'IMG' ? (coverEl.currentSrc || coverEl.src || '') : '';
    // l,t,w,h (the analyzer's box), page width, and the top of the cover's visible part (for the meters).
    // ...and whether the cover's bottom is hidden (then there's no room for the quality line under it),
    // and (TV) the top of the player's controls below the cover, to centre the quality line between.
    var ctl = !W.phone && document.querySelector('[data-test="play-controls"]'), cr = ctl && rectOf(ctl);
    var ctlTop = cr && cr.top > cover.bottom ? Math.round(cr.top) : 0;
    return [Math.round(cover.left), Math.round(top), Math.round(cover.width), Math.round(h), vw, Math.round(visTop), clipped ? 1 : 0, ctlTop].join(',') + '|' + url;
  }
  // The small analyzer in Tidal's player bar: between the time readout (or the play controls)
  // and the buttons on the right, coloured from the bar's own small cover, while the full-screen
  // player is closed. Same format.
  function miniRect() {
    // Not while the full-screen player is open: the analyzer over the cover takes over there.
    if ((fairStore && playerOpen()) || playerTabsShown()) return 'off';
    var footer = document.querySelector('[data-test="footer-player"]') || compactBar(), fr = footer && rectOf(footer);
    if (!fr || fr.top >= innerHeight) return 'off';
    var img = footer.querySelector('[data-test="current-media-imagery"] img') || footer.querySelector('img');
    var url = img ? (img.currentSrc || img.src || '') : '';
    var r = wideBarSpot(footer, fr) || compactBarSpot(footer, img);
    if (r && covered({ left: r[0], top: r[1], width: r[2], height: r[3] }, footer)) return 'off';
    return r ? r.map(Math.round).concat(innerWidth).join(',') + '|' + url : 'off';
  }
  // The desktop-style player bar (TV): between the time readout and the queue/volume buttons.
  function wideBarSpot(footer, fr) {
    var left = 0, el, er;
    ['play-controls', 'duration', 'progress-bar'].forEach(function (t) {
      el = footer.querySelector('[data-test="' + t + '"]'); er = el && rectOf(el);
      if (er) left = Math.max(left, er.right);
    });
    var right = footer.querySelector('[data-test="play-queue-button"],[data-test="volume"]');
    var rr = right && rectOf(right);
    if (!left || !rr) return null;
    var l = left + 16, w = rr.left - 16 - l, top = fr.top + 14, h = fr.height - 28;
    return w >= 60 && h >= 20 ? [l, top, w, h] : null;
  }
  // The compact player (phones): cover, title/artist, then play/pause and next. The analyzer goes
  // in the gap between the end of the title/artist text and the first button, at the cover's height.
  function compactBarSpot(footer, img) {
    var ir = img && rectOf(img);
    if (!ir) return null;
    var btns = footer.querySelectorAll('button,[role="button"]'), right = Infinity, i;
    for (i = 0; i < btns.length; i++) {
      var br = rectOf(btns[i]);
      if (br && br.left > ir.right && /play|pause|next|previous/i.test(label(btns[i]) + ' ' + (btns[i].textContent || ''))) right = Math.min(right, br.left);
    }
    if (right === Infinity) return null;
    // Where the title/artist text really ends (not its box): measure the text itself.
    var textRight = ir.right, walker = document.createTreeWalker(footer, NodeFilter.SHOW_TEXT), n, range = document.createRange();
    while ((n = walker.nextNode())) {
      if (!n.nodeValue.trim()) continue;
      range.selectNodeContents(n);
      var tr = range.getBoundingClientRect(), box = n.parentElement && rectOf(n.parentElement);
      if (!tr.width || tr.left < ir.right - 2 || tr.left >= right || tr.bottom <= ir.top || tr.top >= ir.bottom) continue;
      // A long title cut off with "…" is measured to where it shows, not its full length.
      textRight = Math.max(textRight, box ? Math.min(tr.right, box.right) : tr.right);
    }
    // Small marks after the title (the explicit "E", upload or quality badges) count as text too.
    var marks = footer.querySelectorAll('i,svg,img,[data-test*="badge"]');
    for (var m = 0; m < marks.length; m++) {
      if (marks[m] === img || marks[m].closest('button,[role="button"]')) continue;
      var mr = rectOf(marks[m]);
      if (mr && mr.width < 60 && mr.left >= ir.right - 2 && mr.left < right && mr.bottom > ir.top && mr.top < ir.bottom) textRight = Math.max(textRight, mr.right);
    }
    var l = textRight + 12, w = right - 12 - l, top = ir.top + ir.height * 0.15, h = ir.height * 0.7;
    return w >= 40 && h >= 16 ? [l, top, w, h] : null;
  }
  // No footer-player marker: the bar around a play/pause button near the bottom of the screen.
  function compactBar() {
    var btns = document.querySelectorAll('button,[role="button"]');
    for (var i = 0; i < btns.length; i++) {
      var br = rectOf(btns[i]);
      if (!br || br.top < innerHeight * 0.7 || !/\b(play|pause)\b/i.test(label(btns[i]))) continue;
      for (var e = btns[i].parentElement; e && e !== document.body; e = e.parentElement) {
        var er = rectOf(e);
        if (er && er.width >= innerWidth * 0.8) return e;
      }
    }
    return null;
  }
  var lastMini = '';
  function spot() {
    if (!fairStore) checkPlayerOpened();
    var m = 'off';
    try { m = miniRect(); } catch (e) {}
    if (m !== lastMini && window.WaveApp && WaveApp.miniSpectrum) { lastMini = m; WaveApp.miniSpectrum(m); }
    var s = 'off';
    try { s = spotRect(); } catch (e) {}
    if (s !== lastSpot && window.WaveApp && WaveApp.spectrum) { lastSpot = s; WaveApp.spectrum(s); }
  }
  setInterval(spot, 1000); // follows layout changes (resize, animations); cheap while closed
  // A tap can open or close a menu over an analyzer: look again as it slides in or out.
  addEventListener('click', function () { setTimeout(spot, 50); setTimeout(spot, 350); }, true);
  addEventListener('resize', function () { setTimeout(spot, 100); });
  W.spot = function () { lastSpot = lastMini = ''; spot(); }; // the app asks again (e.g. when it comes back)

  // Opens the player once Tidal says the new song is actually playing: opening it while Tidal is
  // still starting the song can leave its player stuck at 0:00 with the loading ring. Gives up
  // after 6 s.
  var openWait = 0;
  function openPlayerWhenPlaying() {
    clearInterval(openWait);
    var tries = 0;
    openWait = setInterval(function () {
      var pc = null;
      try { pc = fairStore.getState().playbackControls; } catch (e) {}
      var playing = pc && pc.playbackState ? pc.playbackState === 'PLAYING' : (function () { var e = media(); return e && !e.paused; })();
      if (playing || ++tries > 30) {
        clearInterval(openWait);
        if (playing) setTimeout(openPlayer, 300); // a moment more for its first frames
      }
    }, 200);
  }
  // Opens Tidal's full-screen player with its own "Now Playing" button in the player bar.
  function openPlayer() {
    if (playerOpen()) return;
    var b = document.querySelector('[data-test="player-details-toggle-now-playing"]');
    if (b) b.click();
  }
  // Phones: tapping anywhere in the player bar outside its buttons (the cover, the song's title
  // and artist, the space beside them) opens the full-screen player, instead of the song's or the
  // artist's page.
  addEventListener('click', function (e) {
    if (!W.phone) return;
    var t = e.target && e.target.closest ? e.target : null;
    if (!t || !t.closest('[data-test="footer-player"]')) return;
    var b = document.querySelector('[data-test="player-details-toggle-now-playing"]');
    if (!b || b.contains(t)) return; // the cover: Tidal opens it itself
    if (t.closest('button,[role="button"],[role="slider"],input,[data-test="play-controls"],[data-test="progress-bar"]')) return;
    // Only the song's own row: Tidal's bottom tabs (Home, Feed, Upload, Collection, Search) are in
    // the same box, below it, and must work as usual.
    var br = b.getBoundingClientRect(), y = e.clientY;
    if (!br.height || y < br.top - 12 || y > br.bottom + 12) return;
    if (t.closest('a[href]') && !t.closest('[data-test="footer-track-title"],[data-test="footer-artist-name"]')) return;
    e.preventDefault();
    e.stopPropagation();
    b.click();
  }, true);
  var wasOpen = false;
  function checkPlayerOpened() {
    var open = playerOpen() || playerTabsShown();
    // TV: no volume control while the full-screen player shows (the remote sets the volume).
    if (!W.phone && document.documentElement) {
      if (!document.getElementById('wave-np-css')) {
        var st = document.createElement('style');
        st.id = 'wave-np-css';
        st.textContent = '.wave-np [data-test="volume"]{display:none!important}'; // gone, so the ring can't land on it
        (document.head || document.documentElement).appendChild(st);
      }
      document.documentElement.classList.toggle('wave-np', !!open);
    }
    if (open && !wasOpen) setTimeout(function () { W.ringToPlay(); }, 300); // after it has drawn
    wasOpen = open;
  }

  // Jumps once Tidal has finished starting the song it moved to (not in the middle of its own
  // update, which could leave its player showing 0:00 and "loading"), and only if that song is
  // still the current one.
  function fairJumpSoon(src, idx, id, index) {
    setMuted(true); // don't let the repeat be heard for a moment
    setTimeout(function () {
      var q = fairQueue(), el = q && q.elements[q.currentIndex];
      var still = q && q.currentIndex === idx && el && String(el.mediaItemId) === id &&
        (q.sourceEntityType || '?') + ':' + (q.sourceEntityId || '?') === src;
      if (still) {
        fairJumping = true;
        try { fairStore.dispatch({ type: 'playQueue/MOVE_TO', payload: index }); } finally { fairJumping = false; }
      }
      setTimeout(function () { setMuted(false); }, still ? 1200 : 0);
    }, 150);
  }
  function note(m) { if (window.WaveApp && WaveApp.note) WaveApp.note(m); }
  // Mute while jumping; never stays muted for more than 4 s.
  // Mutes only what's playing out loud, and later unmutes only that (never anything Tidal muted
  // itself). Never stays muted for more than 4 s.
  var muteTimer = 0, mutedByWave = [];
  function setMuted(on) {
    var i;
    if (on) {
      var all = document.querySelectorAll('video,audio');
      for (i = 0; i < all.length; i++) if (!all[i].muted) { all[i].muted = true; mutedByWave.push(all[i]); }
    } else {
      for (i = 0; i < mutedByWave.length; i++) mutedByWave[i].muted = false;
      mutedByWave = [];
    }
    clearTimeout(muteTimer);
    if (on) muteTimer = setTimeout(function () { setMuted(false); }, 4000);
  }

  function label(b) {
    return [b.getAttribute('data-test'), b.getAttribute('aria-label'), b.getAttribute('title'),
            b.getAttribute('data-type'), b.id].join(' ');
  }
  function visible(b) {
    var r = b.getBoundingClientRect();
    return r.width > 0 && r.height > 0 ? r : null;
  }
  // Visible buttons in the bottom 35% of the screen: the player bar.
  function barButtons() {
    var all = document.querySelectorAll('button,[role="button"]'), out = [];
    for (var i = 0; i < all.length; i++) {
      var r = visible(all[i]);
      if (r && r.top > window.innerHeight * 0.65) out.push({ el: all[i], r: r });
    }
    return out;
  }
  function describe(b) {
    var l = label(b).replace(/\s+/g, ' ').trim();
    return l ? '"' + l.slice(0, 40) + '"' : '<' + b.tagName.toLowerCase() + '>';
  }

  var RE = {
    play: /\bplay\b/i,
    pause: /\bpause\b/i,
    next: /\bnext\b|skip.?(forward|next)|nexttrack/i,
    prev: /\bprev(ious)?\b|skip.?(back|prev)|previoustrack/i
  };

  // Buttons in Tidal's player bar only (desktop-style or the phone's compact one). Never the rest
  // of the page: song rows have their own "Play" buttons and carousels their own "Next" arrows.
  function playerBarButtons() {
    var bar = document.querySelector('[data-test="footer-player"]') || compactBar(), out = [];
    if (!bar) return out;
    var all = bar.querySelectorAll('button,[role="button"]');
    for (var i = 0; i < all.length; i++) {
      var r = visible(all[i]);
      if (r) out.push({ el: all[i], r: r });
    }
    return out;
  }

  function findButton(c) {
    var bar = playerBarButtons(), i;
    // 1) By label (data-test / aria-label / title).
    for (i = 0; i < bar.length; i++) if (RE[c].test(label(bar[i].el))) return bar[i].el;
    if (c !== 'next' && c !== 'prev') return null;
    // 2) By position: nearest button left (prev) or right (next) of play/pause, same row.
    var p = null;
    for (i = 0; i < bar.length; i++) {
      if (RE.play.test(label(bar[i].el)) || RE.pause.test(label(bar[i].el))) { p = bar[i]; break; }
    }
    if (!p) return null;
    var cy = p.r.top + p.r.height / 2, best = null, bestD = 1e9;
    for (i = 0; i < bar.length; i++) {
      var b = bar[i];
      if (b === p) continue;
      if (Math.abs(b.r.top + b.r.height / 2 - cy) > p.r.height / 2) continue;
      var d = c === 'next' ? b.r.left - p.r.right : p.r.left - b.r.right;
      if (d >= -2 && d < bestD) { bestD = d; best = b.el; }
    }
    return best;
  }

  // Tidal's own player actions, the same ones its buttons send (seen with Wave Probe).
  var PLAYER_ACTIONS = {
    play: 'playbackControls/PLAY', pause: 'playbackControls/PAUSE',
    next: 'playbackControls/SKIP_NEXT', prev: 'playbackControls/SKIP_PREVIOUS'
  };

  W.cmd = function (c) {
    if (c === 'favorite') { // Add to / Remove from My Collection
      var how = 'no song';
      var id = currentTrackId();
      if (fairStore && id) {
        // Tidal's own command, the one its heart sends (seen with Wave Probe); Tidal saves it to the account.
        try {
          fairStore.dispatch({ type: 'content/TOGGLE_FAVORITE_ITEMS',
            payload: { from: 'heart', items: [{ itemId: id, itemType: 'track' }], moduleId: 'NOW_PLAYING' } });
          how = 'Tidal';
        } catch (x) {}
      }
      if (how !== 'Tidal') { // Tidal's store not reachable: its heart button in the player bar
        var h = document.querySelector('[data-test="footer-favorite-button"],[data-test="mobile-now-playing-favorite"]');
        if (h) { h.click(); how = 'clicked'; }
      }
      setTimeout(report, 400); // tell the app the new state
      setTimeout(report, 1500);
      return 'favorite: ' + how;
    }
    var e = media();
    if (fairStore) { // straight to Tidal's player
      if (c === 'toggle') {
        var pc = null;
        try { pc = fairStore.getState().playbackControls; } catch (x) {}
        var on = pc && pc.playbackState ? pc.playbackState === 'PLAYING' : (e && !e.paused);
        c = on ? 'pause' : 'play';
      }
      try { fairStore.dispatch({ type: PLAYER_ACTIONS[c], payload: undefined }); return c + ': Tidal player'; } catch (x) {}
    }
    // Tidal's player not reachable: its buttons in the player bar, else the audio itself.
    if (c === 'toggle') c = (e && !e.paused) ? 'pause' : 'play';
    var action = { play: 'play', pause: 'pause', next: 'nexttrack', prev: 'previoustrack' }[c];
    if (W.h[action]) {
      try { W.h[action]({ action: action }); return c + ': media session'; } catch (x) {}
    }
    var b = findButton(c);
    if (b) { b.click(); return c + ': clicked ' + describe(b); }
    if (e && c === 'play') { e.play(); return c + ': media element'; }
    if (e && c === 'pause') { e.pause(); return c + ': media element'; }
    return c + ': no control found';
  };

  // ---------- Spatial navigation: a ring that jumps between clickable things ----------
  var SEL = 'a[href],button,input,select,textarea,[role="button"],[role="link"],[role="tab"],' +
            '[role="menuitem"],[role="option"],[role="checkbox"],[role="switch"],[role="slider"],[tabindex]:not([tabindex="-1"])';
  // Things that act by themselves. A box that's only focusable (tabindex) or a menu around other
  // items is left out when it holds them, so the ring goes to each item inside (the profile
  // menu's entries; a song row's menu, add and heart buttons) instead of ringing the whole box.
  var ACTS = 'a[href],button,input,select,textarea,[role="button"],[role="link"],[role="tab"],[role="menuitem"],[role="option"],[role="checkbox"],[role="switch"],[role="slider"]';
  var ringColor = '#33C3F0'; // the analyzer's colour (the cover's strongest), set by the app
  var cur = null, ring = null, ringOn = false, lastX = 0, lastY = 0, pending = 0;

  function rectOf(el) {
    var r = el.getBoundingClientRect();
    return (r.width > 1 && r.height > 1) ? r : null;
  }
  // Cheap check: has a size, is on screen, and isn't a page-sized container.
  function onScreen(el) {
    var r = rectOf(el), vw = innerWidth, vh = innerHeight;
    if (!r || r.right <= 0 || r.bottom <= 0 || r.left >= vw || r.top >= vh) return null;
    return r.width * r.height > vw * vh * 0.6 ? null : r;
  }
  // Full check (slower): also enabled and not hidden behind something else (e.g. a dialog).
  function usable(el) {
    var r = onScreen(el), vw = innerWidth, vh = innerHeight;
    if (!r || el.disabled || el.closest('[aria-hidden="true"],[inert]')) return null;
    if (getComputedStyle(el).visibility === 'hidden') return null; // there, but not shown
    if (/full.?screen/i.test(label(el))) return null; // refused anyway (see above)
    // Probe the centre and two inner corners, so items half-cut by a scrolling area still count.
    var pts = [[(r.left + r.right) / 2, (r.top + r.bottom) / 2], [r.left + 3, r.top + 3], [r.right - 3, r.bottom - 3]];
    for (var i = 0; i < pts.length; i++) {
      var x = Math.min(Math.max(pts[i][0], 1), vw - 1), y = Math.min(Math.max(pts[i][1], 1), vh - 1);
      var hit = document.elementFromPoint(x, y);
      if (hit && (hit === el || el.contains(hit) || hit.contains(el))) return r;
    }
    return null;
  }
  // On-screen items by geometry only; the expensive hit test runs later, best-first, on a few.
  // Measuring every item is the slow part, so the list is reused until something can move items
  // (scroll, resize, a change to the page that matters) or for at most 5 seconds.
  var cache = null, cacheTime = 0;
  var cacheShift = { x: 0, y: 0 };
  function invalidate() { cache = null; cacheShift = { x: 0, y: 0 }; }
  function candidates() {
    var now = Date.now();
    if (cache && now - cacheTime < 5000) return cache; // kept until something that matters changes (or 5 s)
    // Items up to a screen beyond each edge are kept too, so after a scroll their positions are
    // just moved along (see the scroll listener) instead of everything being measured again.
    var all = document.querySelectorAll(SEL), out = [], vw = innerWidth, vh = innerHeight;
    for (var i = 0; i < all.length; i++) {
      if (!all[i].matches(ACTS) && all[i].querySelector(SEL)) continue; // a box around items: its items instead
      var r = rectOf(all[i]);
      if (!r || r.bottom <= -vh || r.top >= 2 * vh || r.right <= -vw || r.left >= 2 * vw || r.width * r.height > vw * vh * 0.6) continue;
      out.push({ el: all[i], r: { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height } });
    }
    cache = out;
    cacheTime = now;
    return out;
  }
  // Lowest score first; return the first one that passes the full check.
  function firstUsable(scored) {
    scored.sort(function (a, b) { return a.s - b.s; });
    for (var i = 0; i < scored.length; i++) if (usable(scored[i].el)) return scored[i].el;
    return null;
  }
  function gap(a1, a2, b1, b2) { return b1 > a2 ? b1 - a2 : a1 > b2 ? a1 - b2 : 0; }

  // Best candidate from rect c in direction d: nearest along d, strongly preferring the same row/column.
  // Left and right stay in the row: anything on the ring's own line that way wins, however far
  // along it is (a song's title far to the left of its buttons), before nearer things above or
  // below are considered.
  function pick(c, d, list) {
    var scored = [], inRow = [], side2 = d === 'left' || d === 'right', cx = (c.left + c.right) / 2, cy = (c.top + c.bottom) / 2;
    for (var i = 0; i < list.length; i++) {
      var o = list[i], r = o.r;
      if (r.right <= 0 || r.bottom <= 0 || r.left >= innerWidth || r.top >= innerHeight) continue; // off screen
      if (cur && (o.el === cur || o.el.contains(cur) || cur.contains(o.el))) continue;
      var rx = (r.left + r.right) / 2, ry = (r.top + r.bottom) / 2, main, side;
      if (d === 'right') { if (rx <= cx + 1 || r.left <= c.left) continue; main = Math.max(0, r.left - c.right); side = gap(c.top, c.bottom, r.top, r.bottom); }
      else if (d === 'left') { if (rx >= cx - 1 || r.right >= c.right) continue; main = Math.max(0, c.left - r.right); side = gap(c.top, c.bottom, r.top, r.bottom); }
      else if (d === 'down') { if (ry <= cy + 1 || r.top <= c.top) continue; main = Math.max(0, r.top - c.bottom); side = gap(c.left, c.right, r.left, r.right); }
      else { if (ry >= cy - 1 || r.bottom >= c.bottom) continue; main = Math.max(0, c.top - r.bottom); side = gap(c.left, c.right, r.left, r.right); }
      var off = (d === 'left' || d === 'right') ? Math.abs(ry - cy) : Math.abs(rx - cx);
      scored.push({ el: o.el, s: main + side * 3 + off * 0.1 });
      if (side2) { // on the same line: they overlap by at least half of the lower one's height
        var over = Math.min(c.bottom, r.bottom) - Math.max(c.top, r.top);
        if (over >= Math.min(c.bottom - c.top, r.bottom - r.top) * 0.5) inRow.push({ el: o.el, s: main + off * 0.1 });
      }
    }
    return (inRow.length && firstUsable(inRow)) || firstUsable(scored);
  }
  function canScroll(sc, d) {
    if (d === 'down') return sc.scrollTop + sc.clientHeight < sc.scrollHeight - 1;
    if (d === 'up') return sc.scrollTop > 0;
    if (d === 'right') return sc.scrollLeft + sc.clientWidth < sc.scrollWidth - 1;
    return sc.scrollLeft > 0;
  }
  function scroller(el, vertical) {
    for (var n = el; n && n !== document.body; n = n.parentElement) {
      var st = getComputedStyle(n), ov = vertical ? st.overflowY : st.overflowX;
      if ((ov === 'auto' || ov === 'scroll') &&
          (vertical ? n.scrollHeight > n.clientHeight : n.scrollWidth > n.clientWidth)) return n;
    }
    return document.scrollingElement;
  }
  function drawRing() {
    if (!cur) { if (ring) ring.style.display = 'none'; return; }
    if (!ring) {
      ring = document.createElement('div');
      ring.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;border-radius:8px;border:3px solid;box-sizing:border-box;margin:0;';
      paintRing();
      document.documentElement.appendChild(ring);
    }
    var r = cur.getBoundingClientRect();
    lastX = (r.left + r.right) / 2;
    lastY = (r.top + r.bottom) / 2;
    ring.style.display = 'block';
    // 4 px of room on every side, the border included (so it's centred on the item).
    ring.style.left = (r.left - 4) + 'px'; ring.style.top = (r.top - 4) + 'px';
    ring.style.width = (r.width + 8) + 'px'; ring.style.height = (r.height + 8) + 'px';
  }
  // A scroll inside the page (Tidal's lists scroll in their own box): the kept positions of what's
  // in that box move by the same amount. The whole page scrolling (fixed bars stay put) or a box
  // not seen before: measured again.
  var scrolled = new WeakMap();
  function followScroll(sc) {
    var was = scrolled.get(sc), now = { x: sc.scrollLeft, y: sc.scrollTop };
    scrolled.set(sc, now);
    if (!cache || !was || sc === document.scrollingElement || sc === document.documentElement || sc === document.body) { invalidate(); return; }
    var dx = was.x - now.x, dy = was.y - now.y;
    if (!dx && !dy) return;
    // The kept items reach a screen beyond each edge: once the scrolling adds up to most of a
    // screen, what's coming into view wasn't kept, so everything is measured again.
    cacheShift.x += dx; cacheShift.y += dy;
    if (Math.abs(cacheShift.x) > innerWidth * 0.8 || Math.abs(cacheShift.y) > innerHeight * 0.8) { invalidate(); return; }
    for (var i = 0; i < cache.length; i++) {
      var o = cache[i];
      if (!sc.contains(o.el)) continue;
      o.r.left += dx; o.r.right += dx; o.r.top += dy; o.r.bottom += dy;
    }
  }
  function rememberScroll(sc) { if (sc && sc.nodeType === 1 && !scrolled.has(sc)) scrolled.set(sc, { x: sc.scrollLeft, y: sc.scrollTop }); }
  addEventListener('scroll', function (e) {
    var t = e.target && e.target.nodeType === 1 ? e.target : document.scrollingElement;
    followScroll(t);
    if (cur && ring) drawRing();
  }, true);
  addEventListener('resize', function () { invalidate(); if (cur && ring) drawRing(); });

  // Keep the ring right when the page changes under it (Tidal swaps pages without reloading):
  // follow the item if it moved, or jump to the nearest item if it's gone.
  function refresh() {
    pending = 0;
    if (!ringOn) return;
    // Stay on the item while it still exists (a tooltip briefly covering it is fine).
    if (cur && document.contains(cur) && rectOf(cur)) { drawRing(); return; }
    cur = null;
    var p = W.nav('', lastX, lastY);
    if (p) { try { WaveApp.ringMoved(p); } catch (e) {} }
  }
  function schedule() {
    if (ringOn && !pending) pending = setTimeout(refresh, 120);
  }
  // Only changes that can move or add buttons count: elements added or removed, something shown or
  // hidden, a box's class or style changing. Not the ticking song time (text only), nor the progress
  // bar and other plain shapes restyling (no buttons inside them), nor the ring's own redraws.
  function matters(rec) {
    var t = rec.target;
    if (t === ring) return false;
    if (rec.type === 'childList') {
      var lists = [rec.addedNodes, rec.removedNodes];
      for (var l = 0; l < 2; l++) for (var k = 0; k < lists[l].length; k++) if (lists[l][k].nodeType === 1) return true;
      return false; // only text changed
    }
    if (rec.attributeName === 'class' || rec.attributeName === 'style') {
      return t.nodeType === 1 && (t.matches(SEL) || !!t.querySelector(SEL));
    }
    return true; // hidden, aria-hidden, open
  }
  var observer = new MutationObserver(function (records) {
    for (var i = 0; i < records.length; i++) {
      if (matters(records[i])) { invalidate(); schedule(); return; }
    }
  });
  // Injected as the page starts loading, <html> may not exist yet: wait for it.
  (function watch() {
    if (!document.documentElement) { setTimeout(watch, 50); return; }
    observer.observe(document.documentElement, {
      childList: true, subtree: true, attributes: true,
      attributeFilter: ['class', 'style', 'hidden', 'aria-hidden', 'open']
    });
  })();
  addEventListener('popstate', function () { invalidate(); schedule(); });

  // "x,y,viewportWidth" of the ring target's centre, for the app to touch/hover there.
  function point() {
    if (!cur) return '';
    var r = cur.getBoundingClientRect();
    return Math.round((r.left + r.right) / 2) + ',' + Math.round((r.top + r.bottom) / 2) + ',' + innerWidth;
  }
  function select(el) {
    cur = el;
    var r = el.getBoundingClientRect();
    if (r.top < 0 || r.bottom > innerHeight || r.left < 0 || r.right > innerWidth) {
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      invalidate();
    }
    drawRing();
  }

  // Move the ring. With no ring yet (or its element gone), start at the item nearest (x, y).
  W.nav = function (d, x, y, retried) {
    ringOn = true;
    var list = candidates();
    if (!list.length) { cur = null; drawRing(); return ''; }
    if (!cur || !document.contains(cur) || !usable(cur)) {
      var px = x || innerWidth / 2, py = y || innerHeight / 2, scored = [];
      for (var i = 0; i < list.length; i++) {
        var r = list[i].r, dx = gap(r.left, r.right, px, px), dy = gap(r.top, r.bottom, py, py);
        if (r.right <= 0 || r.bottom <= 0 || r.left >= innerWidth || r.top >= innerHeight) continue;
        scored.push({ el: list[i].el, s: dx * dx + dy * dy });
      }
      var start = firstUsable(scored);
      if (!start) { cur = null; drawRing(); return ''; }
      select(start);
      return point();
    }
    if ((d === 'left' || d === 'right') && isSlider(cur)) { var adj = adjust(cur, d === 'right' ? 1 : -1); if (adj) return adj; }
    var next = d ? pick(cur.getBoundingClientRect(), d, list) : null;
    if (d && !retried) {
      // Nothing that way, or the way leads out of an area that can still scroll that way:
      // scroll the area first (so long lists don't jump straight to the player bar), then retry.
      var v = d === 'up' || d === 'down', sc = scroller(cur, v);
      if (canScroll(sc, d) && (!next || !sc.contains(next))) {
        var amt = (v ? sc.clientHeight : sc.clientWidth) * 0.6;
        rememberScroll(sc);
        sc.scrollBy(v ? 0 : (d === 'left' ? -amt : amt), v ? (d === 'up' ? -amt : amt) : 0);
        followScroll(sc); // the scroll event comes later; positions changed now
        return W.nav(d, 0, 0, true);
      }
    }
    if (next) { select(next); return point(); }
    drawRing();
    return point();
  };
  W.target = point;
  // Sliders: left and right change the value (up and down leave). Wave's own sliders and other
  // range inputs step by a twentieth; Tidal's song position seeks 10 s with its own command;
  // other sliders get a tap a twentieth further along (the app taps where this says).
  function isSlider(el) { return el.matches('input[type="range"],[role="slider"],[data-test="progress-bar"]'); }
  function adjust(el, dir) {
    if (el.matches('input[type="range"]')) {
      var min = parseFloat(el.min) || 0, max = parseFloat(el.max), step = parseFloat(el.step) || 1;
      if (!isFinite(max)) max = 100;
      var stepBy = Math.max(step, Math.round((max - min) / 20 / step) * step);
      var v = Math.max(min, Math.min(max, parseFloat(el.value) + dir * stepBy));
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, String(v)); // React sees it too
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      drawRing();
      return point();
    }
    if (el.closest('[data-test="progress-bar"]') || el.matches('[data-test="progress-bar"]')) {
      try {
        var pc = fairStore.getState().playbackControls, at = (pc.latestCurrentTime || 0) + dir * 10;
        fairStore.dispatch({ type: 'playbackControls/SEEK', payload: Math.max(0, at) });
        return point();
      } catch (e) {}
    }
    var r = el.getBoundingClientRect(), now = parseFloat(el.getAttribute('aria-valuenow')),
      lo = parseFloat(el.getAttribute('aria-valuemin')) || 0, hi = parseFloat(el.getAttribute('aria-valuemax'));
    if (!r.width || !isFinite(now) || !isFinite(hi) || hi <= lo) return '';
    var f = Math.max(0, Math.min(1, (now - lo) / (hi - lo) + dir * 0.05));
    return Math.round(r.left + f * r.width) + ',' + Math.round((r.top + r.bottom) / 2) + ',' + innerWidth + ',tap';
  }
  function paintRing() {
    if (!ring) return;
    ring.style.borderColor = ringColor;
    ring.style.boxShadow = '0 0 0 2px rgba(0,0,0,.7),0 0 12px ' + ringColor;
  }
  W.setRingColor = function (c) { ringColor = c; paintRing(); };
  // When the full-screen player opens, the ring goes to its play/pause button.
  W.ringToPlay = function () {
    if (!ringOn) return; // pointer mode
    var b = document.querySelector('[data-test="footer-player"] [data-test="pause"],[data-test="footer-player"] [data-test="play"]');
    if (b && usable(b)) {
      select(b);
      try { WaveApp.ringMoved(point()); } catch (e) {} // the pointer too: no hover card left behind
    }
  };
  W.ringOff = function () { ringOn = false; cur = null; drawRing(); };
  // Turn the ring on without moving it; it appears as soon as the page has something to ring.
  W.ring = function () { ringOn = true; schedule(); };
  // ---------- The song's position, kept when you leave ----------
  // Tidal brings back its play queue and song when it opens, paused, but from 0:00 (seen with Wave
  // Probe). Wave keeps the song's position and puts it back: Tidal's own seek
  // (playbackControls/SEEK, in seconds) once it has the song, and again when it starts playing if
  // it began from the start anyway. Wave opens on Tidal's home page as usual.
  var RESUME_KEY = 'wave.resume', resumeReady = false, resumeAt = null;
  function playPos() {
    try {
      var pc = fairStore.getState().playbackControls, pos = pc.latestCurrentTime || 0;
      if (pc.playbackState === 'PLAYING' && pc.latestCurrentTimeSyncTimestamp) pos += (Date.now() - pc.latestCurrentTimeSyncTimestamp) / 1000;
      return pos;
    } catch (e) { return 0; }
  }
  function saveResume() {
    if (!resumeReady || !fairStore) return; // not before the last one has been put back
    var id = currentTrackId();
    if (!id) return;
    try { localStorage.setItem(RESUME_KEY, JSON.stringify({ id: id, pos: Math.round(playPos() * 10) / 10 })); } catch (e) {}
  }
  function seekTo(s) {
    try { fairStore.dispatch({ type: 'playbackControls/SEEK', payload: s }); } catch (e) {}
  }
  function resumeWhereLeft() {
    if (resumeReady) return;
    var r = null;
    try { r = JSON.parse(localStorage.getItem(RESUME_KEY) || 'null'); } catch (e) {}
    resumeReady = true;
    if (!r || !fairStore || currentTrackId() !== r.id) return; // a different song now: nothing to put back
    if (r.pos > 2 && playPos() < 1) { seekTo(r.pos); resumeAt = { id: r.id, pos: r.pos }; }
  }
  // Started from 0:00 after all: go to the saved position (once, for that song).
  function resumeCheck() {
    if (!resumeAt || !fairStore) return;
    var pc = null;
    try { pc = fairStore.getState().playbackControls; } catch (e) {}
    if (!pc || pc.playbackState !== 'PLAYING') return;
    var want = resumeAt;
    resumeAt = null;
    setTimeout(function () { if (currentTrackId() === want.id && playPos() < want.pos - 3) seekTo(want.pos); }, 300);
  }
  setInterval(saveResume, 5000);
  addEventListener('pause', saveResume, true);
  document.addEventListener('visibilitychange', function () { if (document.hidden) saveResume(); });
  addEventListener('pagehide', saveResume);
  W.saveResume = saveResume; // the app calls it when it goes to the background

  // ---------- Audio quality for Wi-Fi and for mobile data (Wave Mobile) ----------
  // Tidal has one streaming quality (settings.quality.streaming). Wave keeps one for Wi-Fi and one
  // for mobile data, and sends Tidal's own command (settings/SET_STREAMING_QUALITY, seen with
  // Wave Probe) whenever the network or the choice changes. Both start as Tidal's current choice.
  // A satellite connection (T-Mobile's T-Satellite and others) counts as mobile data, always with
  // Tidal's adaptive streaming on (settings/SET_ADAPTIVE_AUDIO_STREAMING_ENABLED, seen with Wave
  // Probe 5), so the quality drops to what the slow link carries; leaving it puts the adaptive
  // streaming switch back as it was.
  var QUALITIES = { LOW: 1, HIGH: 1, LOSSLESS: 1, HI_RES_LOSSLESS: 1 };
  var net = 'wifi', netKnown = false, settingQuality = false;
  function tidalQuality() {
    try { return fairStore.getState().settings.quality.streaming; } catch (e) { return null; }
  }
  function savedQuality(n) {
    var q = null;
    try { q = localStorage.getItem('wave.quality.' + n); } catch (e) {}
    return QUALITIES[q] ? q : null;
  }
  function saveQuality(n, q) {
    try { localStorage.setItem('wave.quality.' + n, q); } catch (e) {}
    renderQuality();
  }
  function applyQuality() {
    if (!W.phone || !netKnown || !fairStore) return;
    applyAdaptive();
    var cur = tidalQuality(), want = savedQuality(net);
    if (!want) { // first time: both networks start from Tidal's current choice
      if (!QUALITIES[cur]) return;
      if (!savedQuality('wifi')) saveQuality('wifi', cur);
      if (!savedQuality('cell')) saveQuality('cell', cur);
      return;
    }
    if (cur === want) return;
    settingQuality = true;
    try { fairStore.dispatch({ type: 'settings/SET_STREAMING_QUALITY', payload: { from: cur, to: want } }); } catch (e) {}
    settingQuality = false;
  }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }
  function devOn() { return lsGet('wave.dev') === '1'; } // developer options (Wave tab)
  var onSat = false;
  function applyAdaptive() {
    var on;
    try { on = fairStore.getState().settings.adaptiveAudioStreamingEnabled; } catch (e) { return; }
    if (typeof on !== 'boolean') return;
    var before = lsGet('wave.adaptive.before'); // the switch before satellite (kept across restarts)
    var want = onSat ? true : before === null ? on : before === '1';
    if (onSat && before === null) lsSet('wave.adaptive.before', on ? '1' : '0');
    if (!onSat) lsSet('wave.adaptive.before', null);
    if (want !== on) {
      try { fairStore.dispatch({ type: 'settings/SET_ADAPTIVE_AUDIO_STREAMING_ENABLED', payload: want }); } catch (e) {}
    }
  }
  W.setNetwork = function (n) {
    onSat = n === 'sat';
    if (onSat) n = 'cell';
    net = n === 'cell' ? 'cell' : 'wifi';
    netKnown = true;
    applyQuality();
    renderQuality();
  };
  function chooseQuality(n, q) {
    saveQuality(n, q);
    if (n === net) applyQuality();
  }

  // The General tab on phones: Tidal's Low / High / Max rows make way for two cards, one per
  // network, built like Tidal's; its Adaptive streaming row stays.
  var OPTIONS = [
    { title: 'Low', sub: 'Balance audio quality and data consumption', values: ['LOW', 'HIGH'] },
    { title: 'High', sub: '16-bit, 44.1 kHz', values: ['LOSSLESS'] },
    { title: 'Max', sub: 'Up to 24-bit, 192 kHz', values: ['HI_RES_LOSSLESS'] }
  ];
  var qualityBox = null;
  function qualityCss() {
    settingsCss();
    if (document.getElementById('wave-quality-css')) return;
    var st = el('style');
    st.id = 'wave-quality-css';
    st.textContent =
      '.wv-q{display:flex;flex-direction:column;gap:16px;margin-bottom:16px}.wv-q .wv-card+.wv-card{margin-top:0}' +
      '.wv-opt{cursor:pointer}' +
      '.wv-radio{flex:none;position:relative;width:24px;height:24px;border-radius:50%;background:rgba(48,48,54,.4)}' +
      '.wv-radio::after{content:"";position:absolute;top:7px;left:7px;width:10px;height:10px;border-radius:50%;background:transparent}' +
      // The picked option's colour, as on Tidal's page: Low white, High teal, Max gold, with a
      // faint glow of it from the left of the row and a tinted ring around the dot.
      '.wv-opt[aria-checked="true"]{--q:255,255,255}' +
      '.wv-opt[data-q="high"][aria-checked="true"]{--q:92,242,220}' +
      '.wv-opt[data-q="max"][aria-checked="true"]{--q:255,212,50}' +
      '.wv-opt[aria-checked="true"]{--g:.16;background:radial-gradient(ellipse 55% 140% at 0% 50%,rgba(var(--q),var(--g)),rgba(var(--q),0)),rgba(24,24,27,.6)}' +
      '.wv-opt[data-q="low"][aria-checked="true"]{--g:.09}' +
      '.wv-opt[aria-checked="true"] .wv-radio{background:rgba(var(--q),.14)}' +
      '.wv-opt[aria-checked="true"] .wv-radio::after{background:rgb(var(--q))}' +
      '.wv-opt .wv-txt{flex:1}' +
      '.wv-left{display:flex;align-items:center;gap:16px;flex:1;min-width:0}' +
      '.wv-sel{flex:none;border:0;border-radius:7px;padding:7px 10px;background:#18181b;color:#fff;font:inherit;font-size:.857em;font-weight:600}';
    (document.head || document.documentElement).appendChild(st);
  }
  function qualityCard(n, title) {
    var c = el('div', 'wv-card');
    c.setAttribute('data-net', n);
    var head = row(title, '');
    c.appendChild(head);
    c.head = head;
    OPTIONS.forEach(function (o, i) {
      var r = el('div', 'wv-row wv-opt'), left = el('div', 'wv-left'), t = el('div', 'wv-txt');
      r.setAttribute('role', 'radio');
      r.setAttribute('tabindex', '0');
      r.setAttribute('data-q', o.title.toLowerCase());
      left.appendChild(el('span', 'wv-radio'));
      t.appendChild(el('span', 'wv-t', o.title));
      t.appendChild(el('span', 'wv-s', o.sub));
      left.appendChild(t);
      r.appendChild(left);
      var sel = null;
      if (o.values.length > 1) { // Low: 96 or 320 kbps, as in Tidal
        sel = el('select', 'wv-sel');
        [['LOW', '96 kbps'], ['HIGH', '320 kbps']].forEach(function (v) {
          var op = el('option', '', v[1]);
          op.value = v[0];
          sel.appendChild(op);
        });
        sel.onclick = function (e) { e.stopPropagation(); };
        sel.onchange = function () { chooseQuality(n, sel.value); };
        r.appendChild(sel);
      }
      r.onclick = function () { chooseQuality(n, sel ? sel.value : o.values[0]); };
      r.opt = o;
      r.sel = sel;
      c.appendChild(r);
    });
    return c;
  }
  function renderQuality() {
    if (!qualityBox || !qualityBox.isConnected) return;
    var cards = qualityBox.querySelectorAll('.wv-card');
    for (var i = 0; i < cards.length; i++) {
      var c = cards[i], n = c.getAttribute('data-net');
      c.head.sub.textContent = netKnown && n === net ? (onSat ? 'In use now, by satellite (adaptive streaming on)' : 'In use now') :
        (n === 'cell' ? 'When the phone uses mobile data or satellite' : 'When the phone is on Wi-Fi');
      var q = savedQuality(n) || tidalQuality();
      var opts = c.querySelectorAll('.wv-opt');
      for (var k = 0; k < opts.length; k++) {
        var o = opts[k].opt, on = o.values.indexOf(q) >= 0;
        opts[k].setAttribute('aria-checked', String(on));
        if (opts[k].sel && on) opts[k].sel.value = q;
      }
    }
  }
  function qualityTick() {
    if (!W.phone) return;
    var low = document.querySelector('[data-test="audio-quality-low"]');
    if (!low) { qualityBox = null; return; }
    var lowRow = low.parentElement, card = lowRow && lowRow.parentElement;
    if (!card) return;
    // Tidal's own Low / High / Max rows: hidden (Wave's cards below set the quality).
    ['low', 'high', 'max'].forEach(function (k) {
      var b = document.querySelector('[data-test="audio-quality-' + k + '"]'), r = b && b.parentElement;
      if (r && r.style.display !== 'none') r.style.display = 'none';
    });
    card.style.overflow = 'hidden'; // Adaptive streaming is now its only row: keep its corners round
    if (!qualityBox || !qualityBox.isConnected || qualityBox.nextSibling !== card) {
      qualityCss();
      qualityBox = el('div', 'wv-q');
      qualityBox.appendChild(qualityCard('wifi', 'On Wi-Fi'));
      qualityBox.appendChild(qualityCard('cell', 'On mobile data'));
      card.parentNode.insertBefore(qualityBox, card);
    }
    renderQuality();
  }

  // ---------- Soft pause switch, above Tidal's Crossfade setting (General tab) ----------
  var softRow = null;
  function softPauseTick() {
    // Tidal's Crossfade row (seen with Wave Probe 6): the Soft pause row goes right above it, in
    // the same Playback card.
    var cf = document.querySelector('[data-test="crossfade-settings"]');
    if (!cf || !cf.parentNode) { softRow = null; return; }
    if (softRow && softRow.isConnected && softRow.nextSibling === cf) return;
    settingsCss();
    softRow = row('Soft pause', 'Fade out for 0.8 s before pausing, and back in when playing again');
    softRow.classList.add('wv-soft');
    softRow.style.borderRadius = '0';
    var on = true;
    try { on = localStorage.getItem('wave.softPause') !== '0'; } catch (x) {}
    softRow.appendChild(toggle(on, function (v) {
      try { localStorage.setItem('wave.softPause', v ? '1' : '0'); } catch (x) {}
    }));
    cf.parentNode.insertBefore(softRow, cf);
  }

  // ---------- Wave's own tab in Tidal's settings ----------
  // A "Wave" tab after General / Account / About (a copy of Tidal's own tab), with a page built
  // like Tidal's settings: fair shuffle, updates from GitHub, and the license. Tidal's own tabs
  // and pages are left as they are; Wave's page is shown in place of the current one while its
  // tab is picked.
  var REPO_URL = 'https://github.com/Trevor792221/Wave';
  var wavePanel = null, waveTab = '', wavePath = '', dimmed = [], tabLook = null;
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    return e;
  }
  function settingsCss() {
    if (document.getElementById('wave-settings-css')) return;
    var st = el('style');
    st.id = 'wave-settings-css';
    st.textContent =
      '.wv-sec{display:flex;flex-direction:column;margin-top:48px}' +
      '.wv-h{margin:0 0 16px 16px;font-size:1.143em;font-weight:600;line-height:1.5}' +
      '.wv-card{display:flex;flex-direction:column;border-radius:16px;border-bottom:1px solid #18181b;overflow:hidden}' +
      '.wv-card+.wv-card{margin-top:16px}' +
      '.wv-row{position:relative;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px;background:rgba(24,24,27,.6)}' +
      '.wv-row+.wv-row::before,.wv-soft::before,.wv-soft::after{content:"";position:absolute;left:16px;right:16px;height:1px;background:rgba(255,255,255,.06)}' +
      '.wv-row+.wv-row::before{top:0}.wv-soft::before{top:0}.wv-soft::after{bottom:0}' +
      '.wv-txt{display:flex;flex-direction:column;gap:4px;min-width:0}' +
      '.wv-t{font-weight:600;line-height:18px}' +
      '.wv-s{font-size:.857em;font-weight:500;line-height:1.5;color:#afafb6}' +
      '.wv-sw{position:relative;flex:none;width:42px;height:26px;border-radius:32px;border:0;padding:0;background:#303036;cursor:pointer;transition:background .2s}' +
      '.wv-sw::after{content:"";position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#000;transition:transform .2s}' +
      '.wv-sw[aria-checked="true"]{background:#e4e4e7}' +
      '.wv-sw[aria-checked="true"]::after{transform:translateX(16px)}' +
      '.wv-btn{flex:none;border:0;border-radius:7px;padding:7px 12px;background:#18181b;color:#fff;font:inherit;font-size:.857em;font-weight:600;cursor:pointer}' +
      '.wv-btn[disabled]{opacity:.5}' +
      '.wv-sel{flex:none;border:0;border-radius:7px;padding:7px 10px;background:#18181b;color:#fff;font:inherit;font-size:.857em;font-weight:600}' +
      '.wv-range{width:100%;margin:4px 0 0;accent-color:#fff}' +
      '.wv-col{-webkit-appearance:none;appearance:none;height:14px;border-radius:7px;margin:10px 0 4px}' +
      '.wv-col::-webkit-slider-thumb{-webkit-appearance:none;width:22px;height:22px;border-radius:50%;background:#fff;border:2px solid #18181b}';
    (document.head || document.documentElement).appendChild(st);
  }
  function row(title, sub) {
    var r = el('div', 'wv-row'), t = el('div', 'wv-txt');
    t.appendChild(el('span', 'wv-t', title));
    var s = el('span', 'wv-s', sub);
    t.appendChild(s);
    r.appendChild(t);
    r.sub = s;
    return r;
  }
  function toggle(on, change) {
    var b = el('button', 'wv-sw');
    b.type = 'button';
    b.setAttribute('role', 'switch');
    b.setAttribute('aria-checked', String(!!on));
    b.onclick = function () {
      var v = b.getAttribute('aria-checked') !== 'true';
      b.setAttribute('aria-checked', String(v));
      change(v);
    };
    return b;
  }
  function section(title) {
    var s = el('div', 'wv-sec');
    s.appendChild(el('h2', 'wv-h', title));
    return s;
  }
  function card(rows) {
    var c = el('div', 'wv-card');
    rows.forEach(function (r) { c.appendChild(r); });
    return c;
  }
  // The colour of the analyzers and of all the meters: each can take the album art's (adaptive)
  // or the fixed one picked with hue, saturation and brightness sliders. Reset goes back to
  // Wave's blue.
  var VIZ_DEFAULT = '#33C3F0';
  function hexToHsv(hex) {
    var v = parseInt(hex.slice(1), 16), r = (v >> 16 & 255) / 255, g = (v >> 8 & 255) / 255, b = (v & 255) / 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, h = 0;
    if (d) h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [Math.round(h * 60), mx ? Math.round(d / mx * 100) : 0, Math.round(mx * 100)];
  }
  function hsvToHex(h, s, v) {
    s /= 100; v /= 100;
    var f = function (n) { var k = (n + h / 60) % 6; return Math.round(255 * (v - v * s * Math.max(0, Math.min(k, 4 - k, 1)))); };
    return '#' + ((1 << 24) + (f(5) << 16) + (f(3) << 8) + f(1)).toString(16).slice(1).toUpperCase();
  }
  function colorCard(info) {
    var anaA = info.anaAdaptive !== false, metA = info.vizAdaptive !== false, color = /^#[0-9a-f]{6}$/i.test(info.vizColor || '') ? info.vizColor : VIZ_DEFAULT;
    var hsv = hexToHsv(color);
    var aRow = row('Analyzer: adaptive colour', 'The analyzers take the album art\'s colours. Off: the colour below.');
    var mRow = row('Meters: adaptive colour', 'The meters take the album art\'s colours. Off: the colour below.');
    var pick = row('Colour', ''), swatch = el('span');
    swatch.style.cssText = 'flex:none;width:32px;height:32px;border-radius:7px;border:1px solid rgba(255,255,255,.3)';
    pick.appendChild(swatch);
    var reset = el('button', 'wv-btn', 'Reset');
    reset.type = 'button';
    reset.style.marginLeft = '10px';
    pick.appendChild(reset);
    var sliders = [['Hue', 360], ['Saturation', 100], ['Brightness', 100]].map(function (d, i) {
      var r = row(d[0], ''), sl = el('input', 'wv-range wv-col');
      r.querySelector('.wv-s').style.display = 'none';
      r.style.flexDirection = 'column';
      r.style.alignItems = 'stretch';
      sl.type = 'range'; sl.min = '0'; sl.max = String(d[1]); sl.step = '1';
      sl.oninput = function () { hsv[i] = Number(sl.value); show(); save(); };
      r.appendChild(sl);
      r.sl = sl;
      return r;
    });
    var saveWait = 0;
    function save() { // after the slider stops for a moment
      clearTimeout(saveWait);
      saveWait = setTimeout(function () { try { WaveApp.setSetting('vizColor', parseInt(color.slice(1), 16)); } catch (e) {} }, 300);
    }
    function show(exact) {
      color = exact || hsvToHex(hsv[0], hsv[1], hsv[2]);
      W.vizConfig('vizColor', color);
      swatch.style.background = color;
      pick.sub.textContent = color;
      sliders.forEach(function (r, i) { r.sl.value = String(hsv[i]); });
      // Each slider's track shows the colours it goes through.
      var hues = [0, 60, 120, 180, 240, 300, 360].map(function (h) { return hsvToHex(h, hsv[1], Math.max(hsv[2], 30)); });
      sliders[0].sl.style.background = 'linear-gradient(90deg,' + hues.join(',') + ')';
      sliders[1].sl.style.background = 'linear-gradient(90deg,' + hsvToHex(hsv[0], 0, hsv[2]) + ',' + hsvToHex(hsv[0], 100, hsv[2]) + ')';
      sliders[2].sl.style.background = 'linear-gradient(90deg,#000,' + hsvToHex(hsv[0], hsv[1], 100) + ')';
    }
    function enable() {
      var adaptive = anaA && metA; // the colour is in use while either is off
      [pick].concat(sliders).forEach(function (r) { r.style.opacity = adaptive ? '.4' : ''; });
      sliders.forEach(function (r) { r.sl.disabled = adaptive; });
      reset.disabled = adaptive;
    }
    reset.onclick = function () { hsv = hexToHsv(VIZ_DEFAULT); show(VIZ_DEFAULT); save(); };
    aRow.appendChild(toggle(anaA, function (v) {
      anaA = v;
      try { WaveApp.setSetting('anaAdaptive', v ? 1 : 0); } catch (e) {}
      W.vizConfig('anaAdaptive', v);
      enable();
    }));
    mRow.appendChild(toggle(metA, function (v) {
      metA = v;
      try { WaveApp.setSetting('vizAdaptive', v ? 1 : 0); } catch (e) {}
      W.vizConfig('vizAdaptive', v);
      enable();
    }));
    show(color);
    enable();
    return card([aRow, mRow, pick].concat(sliders));
  }
  // The Visuals tab: the analyzers, the meters and their colour.
  function buildVisuals(p, info) {
    var setting = function (k, v) {
      try { WaveApp.setSetting(k, Number(v)); } catch (e) {}
      if (k === 'vuStyle' || k === 'vuOpacity') W.vizConfig(k, Number(v)); else W.vizConfig(k, !!Number(v));
    };
    function slider(label, value, change) {
      var r = row(label + ': ' + value + '%', ''), t = r.querySelector('.wv-t');
      r.querySelector('.wv-s').style.display = 'none';
      r.style.flexDirection = 'column';
      r.style.alignItems = 'stretch';
      var sl = el('input', 'wv-range');
      sl.type = 'range'; sl.min = '0'; sl.max = '100'; sl.step = '5'; sl.value = String(value);
      sl.oninput = function () { t.textContent = label + ': ' + sl.value + '%'; change(Number(sl.value)); };
      r.appendChild(sl);
      r.set = function (v) { sl.value = String(v); t.textContent = label + ': ' + v + '%'; };
      r.enable = function (on) { sl.disabled = !on; r.style.opacity = on ? '' : '.5'; };
      return r;
    }
    var aOn = row('Spectrum analyzer', 'Bars over the bottom of the album art');
    aOn.appendChild(toggle(info.analyzerOn !== false, function (v) { setting('analyzerOn', v ? 1 : 0); }));
    var aLabels = row('Frequency numbers', 'The 50 … 20k scale under the album art (hidden when the player is over it)');
    aLabels.appendChild(toggle(info.labelsOn !== false, function (v) { setting('labelsOn', v ? 1 : 0); }));
    var aOp = isFinite(info.analyzerOpacity) ? info.analyzerOpacity : 30, vOp = isFinite(info.vuOpacity) ? info.vuOpacity : 60;
    var match = !!info.vuMatch, vSl;
    var aSl = slider('Analyzer opacity', aOp, function (v) {
      aOp = v;
      try { WaveApp.setAnalyzerOpacity(v); } catch (e) {}
      W.vizConfig('analyzerOpacity', v);
      if (match) vSl.set(v);
    });
    var vOn = row('VU meters', 'A VU meter and a peak meter in the top corners of the album art (Deck: one display across the top)');
    vOn.appendChild(toggle(info.vuOn !== false, function (v) { setting('vuOn', v ? 1 : 0); }));
    var vStyle = row('Meter style', 'Needle meters, LED bars with a number, or a tape deck\'s glowing VU and peak (PK) level display');
    var styleSel = el('select', 'wv-sel');
    [['0', 'Analog'], ['1', 'Digital'], ['2', 'Deck']].forEach(function (o) { var op = el('option', '', o[1]); op.value = o[0]; styleSel.appendChild(op); });
    styleSel.value = String(info.vuStyle === 1 || info.vuStyle === 2 ? info.vuStyle : 0);
    styleSel.onchange = function () { setting('vuStyle', styleSel.value); };
    vStyle.appendChild(styleSel);
    vSl = slider('VU meter opacity', match ? aOp : vOp, function (v) { vOp = v; setting('vuOpacity', v); });
    vSl.enable(!match);
    var vMatch = row('Match the analyzer\'s opacity', 'The VU meters use the analyzer opacity');
    vMatch.appendChild(toggle(match, function (v) {
      match = v;
      setting('vuMatch', v ? 1 : 0);
      vSl.set(v ? aOp : vOp);
      vSl.enable(!v);
    }));
    var sa = section('Spectrum analyzer');
    sa.appendChild(card([aOn, aLabels, aSl]));
    p.appendChild(sa);
    var vMini = row('Meters in the player bar', 'The small player at the bottom shows VU and peak (PK) level meters instead of the analyzer');
    vMini.appendChild(toggle(!!info.miniMeters, function (v) { setting('miniMeters', v ? 1 : 0); }));
    var sm = section('Meters');
    sm.appendChild(card([vOn, vStyle, vSl, vMatch, vMini]));
    p.appendChild(sm);
    var sc = section('Colour');
    sc.appendChild(colorCard(info));
    p.appendChild(sc);
  }
  // The Visuals tab's Display section (phones): how big Tidal's page is drawn (the TV has
  // Menu-hold page widths).
  function buildDisplay(p, info) {
    if (info.phone) {
      var sd = section('Display');
      var ts = isFinite(info.textSize) ? info.textSize : 100, tmax = isFinite(info.textSizeMax) ? info.textSizeMax : 130;
      // What applies on this screen: Tidal's layout can't get narrower than the app allows.
      var tlabel = function (v) { return 'Text size: ' + v + '%' + (v > tmax ? ' (' + tmax + '% on this screen)' : ''); };
      var trow = row(tlabel(ts), 'Tidal\'s text, rows and buttons, all together. A narrow screen gets as much as fits.'), tt = trow.querySelector('.wv-t');
      trow.style.flexDirection = 'column';
      trow.style.alignItems = 'stretch';
      var tsl = el('input', 'wv-range');
      tsl.type = 'range'; tsl.min = '80'; tsl.max = '130'; tsl.step = '5'; tsl.value = String(ts);
      tsl.oninput = function () { tt.textContent = tlabel(Number(tsl.value)); };
      // Applied when the slider is let go (the page redraws at the new size).
      tsl.onchange = function () { try { WaveApp.setSetting('textSize', Number(tsl.value)); } catch (e) {} };
      trow.appendChild(tsl);
      sd.appendChild(card([trow]));
      p.appendChild(sd);
    }
  }
  // The Updates tab: the version and updates, the developer options (tap the version 5 times)
  // and the license.
  function buildUpdates(p, info) {
    var s2 = section('Updates');
    var ver = row((info.name || 'Wave') + ' ' + (info.version || ''), info.beta ? 'Updates come from the numbered test builds on GitHub.' : 'Updates come from Wave\'s releases on GitHub.');
    ui.status = ver.sub;
    ui.check = el('button', 'wv-btn', 'Check now');
    ui.check.type = 'button';
    ui.check.onclick = function () { WaveApp.update(ui.check.getAttribute('data-install') ? 'install' : 'check'); };
    ver.appendChild(ui.check);
    // Tapping the version 5 times turns on the developer options (below).
    var taps = 0, tapAt = 0, verTitle = ver.querySelector('.wv-t');
    verTitle.style.cursor = 'pointer';
    verTitle.setAttribute('role', 'button'); // the TV's highlight ring can land on it (OK taps it)
    verTitle.setAttribute('tabindex', '0');
    verTitle.style.outline = 'none';
    verTitle.onclick = function () {
      var now = Date.now();
      taps = now - tapAt < 1500 ? taps + 1 : 1;
      tapAt = now;
      if (devOn()) { if (taps === 1) note('Developer options are already on'); return; }
      if (taps >= 5) {
        lsSet('wave.dev', '1');
        taps = 0;
        note('Developer options are on');
        showDev(p, s3, info);
      } else if (taps >= 2) note((5 - taps) + (5 - taps === 1 ? ' more tap' : ' more taps') + ' for developer options');
    };
    var auto = row('Check automatically', 'Once a day, the first time you open Wave.');
    auto.appendChild(toggle(info.auto !== false, function (v) { WaveApp.setAutoUpdate(v); }));
    s2.appendChild(card([ver]));
    s2.appendChild(card([auto]));
    p.appendChild(s2);

    var s3 = section('License');
    var lic = row('GNU General Public License, version 3',
      'Wave is free software: you can redistribute it and/or modify it under the terms of the GNU GPL version 3. ' +
      'It comes with no warranty. Copyright (C) 2026 Trevor792221.');
    var perm = row('Additional permission (section 7)',
      'Combining Wave with Google Play services or other Google libraries under the Android SDK License is permitted.');
    var src = row('Source code and full license', 'github.com/Trevor792221/Wave');
    var open = el('button', 'wv-btn', 'Open');
    open.type = 'button';
    open.onclick = function () { WaveApp.openLink(REPO_URL); };
    src.appendChild(open);
    var tm = row('Not affiliated with TIDAL', 'Wave is not affiliated with or endorsed by TIDAL. TIDAL is a trademark of its respective owner.');
    s3.appendChild(card([lic, perm, src]));
    s3.appendChild(card([tm]));
    p.appendChild(s3);
    if (devOn()) showDev(p, s3, info);
    if (lastUpdate) W.updateStatus(lastUpdate);
  }
  var ui = {};
  function buildPanel(which) {
    settingsCss();
    var info = {};
    try { info = JSON.parse(WaveApp.appInfo()); } catch (e) {}
    var p = el('div');
    p.setAttribute('data-test', 'settings-page-' + which);
    if (which === 'visuals') { buildVisuals(p, info); buildDisplay(p, info); return p; }
    if (which === 'updates') { buildUpdates(p, info); return p; }

    var s1 = section('Shuffle'), fair = row('Fair shuffle',
      'With shuffle on, no song repeats until every song in the list has played. Holding the shuffle button switches it too.');
    ui.fair = toggle(fairOn, function (v) { setFair(v, true); });
    fair.appendChild(ui.fair);
    s1.appendChild(card([fair]));
    p.appendChild(s1);

    // Each list's fair shuffle round: how many of its songs have played, with a reset.
    var s1b = section('Played this round');
    ui.rounds = el('div', 'wv-card');
    s1b.appendChild(ui.rounds);
    p.appendChild(s1b);
    renderRounds();

    // Sleep timer: the app pauses the music after the chosen time (also in the background).
    // Fun facts: a Wikipedia fact about the song on the album art.
    var sf = section('Fun facts');
    var ff = row('Fun facts', 'A fact about the song from Wikipedia, on the album art 10 seconds in. Sends the song\'s title and artist to Wikipedia to look it up.');
    ff.appendChild(toggle(info.funFacts !== false, function (v) { try { WaveApp.setSetting('funFacts', v ? 1 : 0); } catch (e) {} if (!v) { fact = null; hideFact(); } }));
    sf.appendChild(card([ff]));
    p.appendChild(sf);

    var ss = section('Sleep timer');
    var sleep = row('Sleep timer', ''), sleepSel = el('select', 'wv-sel');
    var sleepTimes = [[0, 'Off']]; // 30 min to 4 hours, every 30 min
    for (var sm = 30; sm <= 240; sm += 30) sleepTimes.push([sm, sm < 60 ? '30 min' : (sm / 60) + (sm === 60 ? ' hour' : ' hours')]);
    sleepTimes.forEach(function (o) {
      var op = el('option', '', o[1]); op.value = String(o[0]); sleepSel.appendChild(op);
    });
    sleepSel.onchange = function () {
      sleepChoice = sleepSel.value;
      try { WaveApp.setSleepTimer(Number(sleepSel.value)); } catch (e) {}
      setTimeout(showSleep, 100);
    };
    sleep.appendChild(sleepSel);
    ui.sleep = { row: sleep, sel: sleepSel };
    ss.appendChild(card([sleep]));
    p.appendChild(ss);
    showSleep();

    if (!info.phone) { // TV: the pointer instead of the ring (holding Menu switches too)
      var sr = section('Remote');
      var pm = row('Pointer mode', 'The arrow keys move a pointer instead of the highlight ring that jumps between buttons. Holding Menu switches too.');
      pm.appendChild(toggle(!!info.pointerMode, function (v) { try { WaveApp.setSetting('pointerMode', v ? 1 : 0); } catch (e) {} }));
      sr.appendChild(card([pm]));
      p.appendChild(sr);
    }

    var sc = section('Crash reports');
    var cr = row('Send crash reports automatically',
      'After a crash, the next time Wave opens it posts the details (app version, Android version, phone model and the error) ' +
      'as an issue on Wave\'s GitHub page, where they\'re public.' + (info.crashRelay ? '' : ' Not set up in this build yet.'));
    cr.appendChild(toggle(!!info.crashAuto, function (v) { WaveApp.setCrashAuto(v); }));
    var crashCard = [cr];
    sc.appendChild(card(crashCard));
    p.appendChild(sc);

    return p;
  }
  // The sleep timer's line: how long until it pauses, kept up to date while the Wave tab shows.
  var sleepTick = 0, sleepChoice = '0';
  function showSleep() {
    clearTimeout(sleepTick);
    var s = ui.sleep;
    if (!s || !s.row.isConnected) return;
    var left = 0;
    try { left = Number(WaveApp.sleepLeft()) || 0; } catch (e) {}
    if (left > 0) {
      var m = Math.ceil(left / 60000);
      s.sel.value = sleepChoice;
      s.row.sub.textContent = 'Pauses the music in ' + (m >= 60 ? Math.floor(m / 60) + ' h ' + (m % 60) + ' min' : m + ' min');
    } else {
      s.row.sub.textContent = 'Pauses the music after the time you pick, also with Wave in the background';
      s.sel.value = '0';
    }
    sleepTick = setTimeout(showSleep, 15000);
  }

  // Developer options: hidden until the version is tapped 5 times (Updates tab).
  function devSlider(label, unit, min, max, step, value, change) {
    var r = row(label + ': ' + value + unit, ''), t = r.querySelector('.wv-t');
    r.querySelector('.wv-s').style.display = 'none';
    r.style.flexDirection = 'column';
    r.style.alignItems = 'stretch';
    var sl = el('input', 'wv-range');
    sl.type = 'range'; sl.min = String(min); sl.max = String(max); sl.step = String(step); sl.value = String(value);
    sl.oninput = function () { t.textContent = label + ': ' + sl.value + unit; };
    sl.onchange = function () { change(Number(sl.value)); }; // when let go
    r.appendChild(sl);
    r.set = function (v) { sl.value = String(v); t.textContent = label + ': ' + v + unit; };
    return r;
  }
  function showDev(p, before, info) {
    if (p.querySelector('[data-wave-dev]')) return;
    var sd = section('Developer options');
    sd.setAttribute('data-wave-dev', '1');
    // Soft pause's fades (General tab → Soft pause): their lengths and how many volume steps.
    var fade = function (k, def) { var v = parseInt(lsGet('wave.' + k), 10); return isFinite(v) ? v : def; };
    var fOut = devSlider('Fade out', ' ms', 50, 6000, 50, fade('fadeOut', 800), function (v) { lsSet('wave.fadeOut', String(v)); });
    var fIn = devSlider('Fade in', ' ms', 50, 6000, 50, fade('fadeIn', 800), function (v) { lsSet('wave.fadeIn', String(v)); });
    var fSteps = devSlider('Fade steps', '', 10, 400, 10, fade('fadeSteps', 200), function (v) { lsSet('wave.fadeSteps', String(v)); });
    var fHead = row('Soft pause fades', 'How long pausing fades out and playing fades in, and in how many volume steps (more: smoother).');
    var fReset = el('button', 'wv-btn', 'Reset');
    fReset.type = 'button';
    fReset.onclick = function () {
      ['fadeOut', 'fadeIn', 'fadeSteps'].forEach(function (k) { lsSet('wave.' + k, null); });
      fOut.set(800); fIn.set(800); fSteps.set(200);
    };
    fHead.appendChild(fReset);
    sd.appendChild(card([fHead, fOut, fIn, fSteps]));
    // The quality line under the album art (FLAC · 16-bit / 44.1 kHz …).
    var qDef = isFinite(info.qualitySizeDefault) ? info.qualitySizeDefault : 14, qs = isFinite(info.qualitySize) ? info.qualitySize : qDef;
    var qSize = devSlider('Quality line size', ' sp', 6, 24, 1, qs, function (v) { try { WaveApp.setSetting('qualitySize', v); } catch (e) {} });
    var qHead = row('Quality line', 'The size of the line under the album art that shows the song\'s quality.');
    var qReset = el('button', 'wv-btn', 'Reset');
    qReset.type = 'button';
    qReset.onclick = function () { qSize.set(qDef); try { WaveApp.setSetting('qualitySize', qDef); } catch (e) {} };
    qHead.appendChild(qReset);
    sd.appendChild(card([qHead, qSize]));
    if (!info.phone) { // TV: page width and the Previous button as Menu
      var pw = row('Page width', 'How wide Tidal\'s page is laid out: wider fits more on screen, narrower makes everything bigger.');
      var pwSel = el('select', 'wv-sel');
      [1280, 1440, 1600, 1920].forEach(function (w) { var op = el('option', '', w + ' px'); op.value = String(w); pwSel.appendChild(op); });
      pwSel.value = String(info.pageWidth || 1440);
      pwSel.onchange = function () { try { WaveApp.setSetting('pageWidth', Number(pwSel.value)); } catch (e) {} };
      pw.appendChild(pwSel);
      var pv = row('Previous button acts as Menu', 'For remotes without a Menu button: Previous opens Settings, and holding it switches between the ring and the pointer (it no longer goes to the previous song).');
      pv.appendChild(toggle(!!info.prevAsMenu, function (v) { try { WaveApp.setSetting('prevAsMenu', v ? 1 : 0); } catch (e) {} }));
      sd.appendChild(card([pw, pv]));
    }
    if (info.beta) { // test builds: crash on purpose to try it
      var tc = row('Test crash', 'Stops Wave on purpose and opens it again, to try the crash report. Wave Beta only.');
      var tb = el('button', 'wv-btn', 'Crash');
      tb.type = 'button';
      tb.onclick = function () { tb.disabled = true; tb.textContent = 'Crashing…'; WaveApp.testCrash(); };
      tc.appendChild(tb);
      sd.appendChild(card([tc]));
    }
    var off = row('Hide developer options', 'Turns these off and hides them again. Tap the version 5 times to bring them back.');
    var ob = el('button', 'wv-btn', 'Hide');
    ob.type = 'button';
    ob.onclick = function () {
      lsSet('wave.dev', null);
      if (sd.parentNode) sd.parentNode.removeChild(sd);
    };
    off.appendChild(ob);
    sd.appendChild(card([off]));
    p.insertBefore(sd, before);
  }
  var lastUpdate = null;
  W.updateStatus = function (u) {
    lastUpdate = u;
    if (!ui.status || !wavePanel) return;
    ui.status.textContent = u.text;
    var available = u.state === 'available', busy = /checking|downloading|installing/.test(u.state);
    ui.check.textContent = available ? 'Install' : 'Check now';
    if (available) ui.check.setAttribute('data-install', '1'); else ui.check.removeAttribute('data-install');
    ui.check.disabled = busy;
  };
  function renderRounds() {
    var box = ui && ui.rounds; // only while Wave's page is up (it's cleared when the page closes)
    if (!box) return;
    box.textContent = '';
    var keys = Object.keys(fairMem).filter(function (k) { return fairMem[k].h && fairMem[k].h.length; })
      .sort(function (a, b) { return fairMem[b].t - fairMem[a].t; });
    if (!keys.length) {
      box.appendChild(row('Nothing played yet', 'Lists you play appear here with how many of their songs have played this round.'));
      return;
    }
    keys.forEach(function (k) {
      var m = fairMem[k], type = k.split(':')[0].toLowerCase().replace(/_/g, ' ');
      var played = m.h.length, size = m.size || m.n || 0;
      var r = row(m.name || (type ? type.charAt(0).toUpperCase() + type.slice(1) : 'A list'),
        size ? played + ' of ' + size + ' played' : played + ' played');
      var reset = el('button', 'wv-btn', 'Reset');
      reset.type = 'button';
      reset.onclick = function () {
        m.h = []; // a new round: every song is new again
        if (fairLast && fairLast.src === k) fairLast = null;
        fairSave();
        renderRounds();
      };
      r.appendChild(reset);
      box.appendChild(r);
    });
  }
  function syncSettings() {
    if (ui.fair && wavePanel) ui.fair.setAttribute('aria-checked', String(fairOn));
  }
  function tabRow() {
    var about = document.querySelector('[data-test="settings-tab--about"]');
    return about && about.parentElement;
  }
  function stripActive(e) {
    e.className = String(e.className).split(/\s+/).filter(function (c) { return !/_active_/.test(c); }).join(' ');
  }
  // Wave's tabs after Tidal's: Visuals (the analyzers, meters and text size), Wave (shuffle and
  // crash reports) and Updates (updates, developer options, license).
  var WAVE_TABS = [['visuals', 'Visuals'], ['wave', 'Wave'], ['updates', 'Updates']];
  function isWaveTab(e) { return /^settings-tab--(wave|visuals|updates)$/.test(e.getAttribute('data-test') || ''); }
  function showWave(which) {
    which = which || waveTab || 'wave';
    var page = document.querySelector('[data-test="settings-page"]'), tabs = tabRow();
    if (!page || !tabs) return;
    if (wavePanel && waveTab !== which) { // from the other of Wave's tabs: Tidal's tab stays dimmed
      if (wavePanel.parentNode) wavePanel.parentNode.removeChild(wavePanel);
      wavePanel = null;
      ui = {};
      unlightWaveTabs();
    }
    if (!wavePanel) { wavePanel = buildPanel(which); waveTab = which; }
    wavePath = location.pathname;
    // Tidal's picked tab looks unpicked, Wave's looks picked (by style only; Tidal's own classes stay).
    var mine = tabs.querySelector('[data-test="settings-tab--' + which + '"]'), lit = null, plain = null, i;
    var all = tabs.querySelectorAll('a[data-test^="settings-tab--"]');
    for (i = 0; i < all.length; i++) {
      if (isWaveTab(all[i])) continue;
      if (/_active_/.test(all[i].className)) lit = all[i]; else if (!plain) plain = all[i];
    }
    if (lit && plain && !dimmed.length) { // once: later passes would read the colours already changed
      var litSpan = lit.querySelector('span'), plainSpan = plain.querySelector('span');
      // Tidal's tab colours, read the first time only: going from one of Wave's tabs to the other,
      // Tidal's tab is still fading back and would give its in-between colour.
      if (!tabLook) tabLook = { on: getComputedStyle(lit).borderBottomColor, onText: litSpan && getComputedStyle(litSpan).color,
        offText: plainSpan && getComputedStyle(plainSpan).color };
      lit.style.borderBottomColor = 'transparent';
      if (litSpan) litSpan.style.color = tabLook.offText;
      dimmed = [lit, litSpan];
    }
    if (tabLook && mine) {
      mine.style.borderBottomColor = tabLook.on;
      if (mine.querySelector('span')) mine.querySelector('span').style.color = tabLook.onText;
    }
    hideTidalPages(page);
    if (wavePanel.parentNode !== page) page.appendChild(wavePanel);
  }
  function hideTidalPages(page) {
    var pages = page.querySelectorAll('[data-test^="settings-page-"]');
    for (var i = 0; i < pages.length; i++) {
      if (pages[i] === wavePanel || pages[i].getAttribute('data-wave-hidden')) continue;
      pages[i].setAttribute('data-wave-hidden', '1');
      pages[i].style.display = 'none';
    }
  }
  function unlightWaveTabs() {
    WAVE_TABS.forEach(function (t) {
      var mine = document.querySelector('[data-test="settings-tab--' + t[0] + '"]');
      if (!mine) return;
      mine.style.borderBottomColor = '';
      if (mine.querySelector('span')) mine.querySelector('span').style.color = '';
    });
  }
  function hideWave() {
    if (!wavePanel) return;
    if (wavePanel.parentNode) wavePanel.parentNode.removeChild(wavePanel);
    wavePanel = null;
    waveTab = '';
    ui = {};
    dimmed.forEach(function (e) { if (e) { e.style.borderBottomColor = ''; e.style.color = ''; } });
    dimmed = [];
    unlightWaveTabs();
    var hidden = document.querySelectorAll('[data-wave-hidden]');
    for (var i = 0; i < hidden.length; i++) { hidden[i].style.display = ''; hidden[i].removeAttribute('data-wave-hidden'); }
  }
  // Six tabs don't fit a phone at a big Text size: the row first draws its tabs closer together
  // (down to half the gap), and if that's still too wide it scrolls sideways, with the picked tab
  // brought into view.
  var tabGap = null;
  function fitTabs(tabs) {
    var cs = getComputedStyle(tabs);
    if (tabGap === null) tabGap = parseFloat(cs.columnGap) || 0;
    if (tabs.style.overflowX !== 'auto') {
      tabs.style.overflowX = 'auto';
      tabs.style.overflowY = 'hidden';
      tabs.style.scrollbarWidth = 'none';
      tabs.style.flexWrap = 'nowrap';
      for (var c = tabs.firstElementChild; c; c = c.nextElementSibling) { c.style.flexShrink = '0'; c.style.whiteSpace = 'nowrap'; }
    }
    var over = tabs.scrollWidth - tabs.clientWidth, n = Math.max(1, tabs.children.length - 1);
    var gap = tabGap ? Math.max(tabGap / 2, Math.min(tabGap, (parseFloat(cs.columnGap) || tabGap) - over / n)) : 0;
    if (tabGap && Math.abs(gap - (parseFloat(cs.columnGap) || 0)) > 0.5) tabs.style.columnGap = gap + 'px';
    var picked = tabs.querySelector('[data-test="settings-tab--' + (waveTab || '') + '"]');
    if (picked && picked.getBoundingClientRect().right > tabs.getBoundingClientRect().right + 1) {
      tabs.scrollLeft += picked.getBoundingClientRect().right - tabs.getBoundingClientRect().right + 4;
    }
  }
  // ---------- Tidal's About tab: the permissions Wave uses and what for ----------
  // Tidal's About page (seen with Wave Probe 3): its first card (logo, version, release notes),
  // then its license title and frame. Wave's Permissions section goes right after that first card.
  var PERMS = [
    ['mic', 'Microphone (asked)', 'For the spectrum analyzer and the level meters: Android\'s measurement of the music playing needs it. Wave never records or listens through the microphone.'],
    ['notifications', 'Notifications (asked, Android 13 and later)', 'The music controls (play, pause, skip) in the notification and on the lock screen.'],
    ['install', 'Install apps (asked the first time you install an update)', 'Installing Wave\'s own updates from its GitHub page. Android asks before each install.'],
    [null, 'Internet', 'Tidal\'s web player, update checks and, if switched on, crash reports.'],
    [null, 'Play in the background (foreground service, media playback)', 'Keeps the music playing with Wave in the background, with its notification showing.'],
    [null, 'Keep awake', 'So the music doesn\'t stop when the screen turns off.'],
    [null, 'Change audio settings', 'Also needed by Android\'s sound measurement for the analyzer and meters.'],
    ['phone', 'See the network connection', 'Wi-Fi, mobile data or satellite, for the audio quality chosen for each.']
  ];
  // What Wave adds to Tidal (the same list is in the README), before the permissions.
  var FEATURES = [
    ['Fair shuffle', 'With shuffle on, no song repeats until every song in the list has played (a song counts after 10 seconds of playing). Hold the shuffle button to switch it; the Wave tab shows how many have played this round, with a reset.'],
    ['Soft pause', 'Pausing fades the music out and playing fades it back in, with no click.'],
    ['Back where you left off', 'Wave opens on the song you were playing, at the same spot.'],
    ['Fun facts', 'A fact about the song from Wikipedia on the album art, 10 seconds in (a switch in the Wave tab).'],
    ['Sleep timer', 'Pauses the music after 30 minutes to 4 hours, also with Wave in the background.'],
    ['Audio quality for Wi-Fi and mobile data (phone)', 'A quality for each, switched by itself when the phone changes networks.'],
    ['Satellite data (phone)', 'Plays over T-Mobile\'s T-Satellite and other satellite data, with Tidal\'s adaptive streaming on.'],
    ['Quality line', 'What\'s really streaming, under the album art (e.g. FLAC · 16-bit / 44.1 kHz · 1066 kbps), in the quality\'s colour.'],
    ['Lighter page', 'Tidal\'s tracking and cookie banner are blocked.'],
    ['Spectrum analyzers', 'Over the album art and in the player bar, fading in and out with the sound.'],
    ['Level meters', 'VU and peak meters on the album art, in Analog, Digital or Deck style. Red means the sound really clipped; BT shows on Bluetooth.'],
    ['Text size (phone)', 'Tidal\'s whole page bigger or smaller together, and song rows that fit narrow screens.'],
    ['Swipes on the album art (phone)', 'Swipe left or right for the next or previous song, down to close the player; tap a song to play it.'],
    ['S Pen (phone)', 'Press the pen\'s button once to play or pause, twice for the next song.'],
    ['Remote control (TV)', 'A highlight ring that jumps between buttons with the arrow keys, or a pointer (hold Menu to switch). Menu opens Settings.'],
    ['Page widths (TV)', 'How wide Tidal\'s page is drawn: a developer option.']
  ];
  var featBox = null;
  function featuresTick(page, first) {
    if (featBox && featBox.isConnected && featBox.previousElementSibling === first) return;
    if (featBox && featBox.parentNode) featBox.parentNode.removeChild(featBox);
    settingsCss();
    featBox = section('What Wave adds');
    featBox.setAttribute('data-wave-features', '1');
    featBox.appendChild(card(FEATURES.map(function (f) { return row(f[0], f[1]); })));
    page.insertBefore(featBox, first.nextSibling);
  }
  var permBox = null;
  function permissionsTick() {
    var page = document.querySelector('[data-test="settings-page-about"]'), first = page && page.firstElementChild;
    if (!first) { permBox = featBox = null; return; }
    featuresTick(page, first);
    first = featBox; // the permissions come after the features
    var st = {};
    try { st = JSON.parse(WaveApp.permissions()) || {}; } catch (e) {}
    if (!permBox || !permBox.isConnected || permBox.previousElementSibling !== first) {
      if (permBox && permBox.parentNode) permBox.parentNode.removeChild(permBox);
      settingsCss();
      permBox = section('Permissions');
      permBox.setAttribute('data-wave-permissions', '1');
      var rows = [];
      PERMS.forEach(function (pm) {
        var r = row(pm[1], pm[2]);
        if (pm[0] === 'phone') { if (!W.phone) return; } // Wave Mobile only
        else if (pm[0]) {
          var tag = el('span', 'wv-perm');
          tag.style.cssText = 'flex:none;font-size:.857em;font-weight:600';
          r.appendChild(tag);
          r.permKey = pm[0];
          r.tag = tag;
        }
        rows.push(r);
      });
      var open = row('Change these', 'Android\'s settings for Wave: allow or take back the microphone, notifications and installing updates.');
      var ob = el('button', 'wv-btn', 'Settings');
      ob.type = 'button';
      ob.onclick = function () { try { WaveApp.openAppSettings(); } catch (e) {} };
      open.appendChild(ob);
      permBox.appendChild(card(rows));
      permBox.appendChild(card([open]));
      permBox.rows = rows;
      page.insertBefore(permBox, first.nextSibling);
    }
    permBox.rows.forEach(function (r) {
      if (!r.permKey) return;
      var v = st[r.permKey];
      r.style.display = v === undefined ? 'none' : ''; // not asked on this Android version
      var later = !v && r.permKey === 'install'; // Android asks when an update is installed
      var text = v ? 'Allowed' : later ? 'Asked later' : 'Not allowed', color = v || later ? 'rgba(255,255,255,.7)' : '#E5484D';
      if (r.tag.textContent !== text) { r.tag.textContent = text; r.tag.style.color = color; }
    });
  }
  function settingsTick() {
    try { qualityTick(); } catch (e) {}
    try { softPauseTick(); } catch (e) {}
    try { permissionsTick(); } catch (e) {}
    var tabs = tabRow();
    if (!tabs) { if (wavePanel) hideWave(); return; }
    WAVE_TABS.forEach(function (t) {
      if (tabs.querySelector('[data-test="settings-tab--' + t[0] + '"]')) return;
      var about = tabs.querySelector('[data-test="settings-tab--about"]'), tab = about.cloneNode(true);
      tab.setAttribute('data-test', 'settings-tab--' + t[0]);
      tab.removeAttribute('href');
      tab.setAttribute('role', 'link');
      tab.style.cursor = 'pointer';
      tab.style.textDecoration = 'none'; // Tidal's tabs have no text underline (a link without href gets one)
      tab.style.outline = 'none';
      stripActive(tab);
      var sp = tab.querySelector('span');
      if (sp) { stripActive(sp); sp.textContent = t[1]; sp.style.textDecoration = 'none'; } else tab.textContent = t[1];
      tabs.appendChild(tab);
    });
    fitTabs(tabs);
    if (wavePanel) {
      if (location.pathname !== wavePath) hideWave(); // Back, or a link: Tidal's page again
      else showWave(); // Tidal redrew its page: keep Wave's showing
    }
  }
  setInterval(settingsTick, 500);
  addEventListener('click', function (e) {
    var t = e.target && e.target.closest && e.target.closest('[data-test^="settings-tab--"]');
    if (!t) return;
    if (isWaveTab(t)) {
      e.preventDefault();
      e.stopPropagation();
      showWave(t.getAttribute('data-test').slice('settings-tab--'.length));
    } else if (wavePanel) {
      hideWave(); // one of Tidal's tabs: its page comes back
    }
  }, true);

  // Text size (phones): the page has to fill the screen's width at the chosen size. If it doesn't
  // (part of it cut off), the size goes back to 100% so nothing (like the settings) is out of reach.
  W.checkFit = function () {
    setTimeout(function () {
      var vv = window.visualViewport, layout = document.documentElement.clientWidth;
      if (!vv || !layout) return;
      if (vv.width < layout * 0.95 || document.documentElement.scrollWidth > layout * 1.05) {
        try { WaveApp.setSetting('textSize', 100); } catch (e) {}
        note('Text size is back to 100%: the page didn\'t fit the screen at that size');
      }
    }, 900);
  };

  // ---------- Analyzers and meters, drawn in the page ----------
  // The app measures the sound (Android's capture of the output) and picks the cover colours;
  // the page draws, on canvases inside Tidal's own layout, so Tidal's controls and menus are on
  // top of them by themselves:
  // - over the cover in the full-screen player: the spectrum analyzer on the cover's bottom edge
  //   (frequency labels just under the cover) and the VU and PEAK meters in its top corners;
  // - in the player bar, between the song and the buttons: a small solid analyzer while playing.
  // Each fades in with sound and out with silence. Settings: the Visuals tab.
  var VZ = { cfg: { analyzerOn: true, labelsOn: true, vuOn: true, analyzerOpacity: 30, vuOpacity: 60, vuMatch: false, vuStyle: 0, miniMeters: false, vizAdaptive: true, anaAdaptive: true, vizColor: '#33C3F0' },
    color: { cover: '#33C3F0', mini: '#33C3F0' }, cover: null, mini: null, wanted: false, lastMini: null, miniAt: 0 };
  try {
    var vinfo = JSON.parse(WaveApp.appInfo());
    for (var vk in VZ.cfg) if (vinfo[vk] !== undefined) VZ.cfg[vk] = vinfo[vk];
  } catch (e) {}
  W.setVizColor = function (which, hex) { VZ.color[which === 'mini' ? 'mini' : 'cover'] = hex; };
  W.vizConfig = function (k, v) { VZ.cfg[k] = v; };
  // The analyzers' and the meters' colours: the album art's (adaptive, switched separately for
  // each) or the one picked in the Visuals tab.
  function vizColor(which, analyzer) { return (analyzer ? VZ.cfg.anaAdaptive : VZ.cfg.vizAdaptive) ? VZ.color[which] : VZ.cfg.vizColor; }
  var FLOOR = -50, LABEL_HZ = [50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000], LABELS = ['50', '100', '200', '500', '1k', '2k', '5k', '10k', '20k'];
  function vizBars(n) {
    var b = { n: n, shown: [], peak: [], peakAt: [], level: 0 };
    for (var i = 0; i < n; i++) { b.shown.push(FLOOR); b.peak.push(FLOOR); b.peakAt.push(0); }
    return b;
  }
  function rgba(hex, a) {
    var v = parseInt(hex.slice(1), 16);
    return 'rgba(' + (v >> 16 & 255) + ',' + (v >> 8 & 255) + ',' + (v & 255) + ',' + a + ')';
  }
  function lighten(hex) { // the peak markers: the colour halfway to white
    var v = parseInt(hex.slice(1), 16), r = ((v >> 16 & 255) + 255) >> 1, g = ((v >> 8 & 255) + 255) >> 1, b2 = ((v & 255) + 255) >> 1;
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b2).toString(16).slice(1);
  }
  function canvasIn(parent, name, after) {
    var c = document.createElement('canvas');
    c.setAttribute('data-wave', name);
    c.style.cssText = 'position:absolute;pointer-events:none;z-index:auto;left:0;top:0';
    if (!after && getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
    if (after) parent.insertBefore(c, after.nextSibling); else parent.appendChild(c);
    return c;
  }
  function fit(c, w, h) { // canvas pixels for its CSS size
    var d = window.devicePixelRatio || 1, pw = Math.max(1, Math.round(w * d)), ph = Math.max(1, Math.round(h * d));
    if (c.width !== pw || c.height !== ph) { c.width = pw; c.height = ph; }
    c.style.width = w + 'px';
    c.style.height = h + 'px';
    var x = c.getContext('2d');
    x.setTransform(d, 0, 0, d, 0, 0);
    x.clearRect(0, 0, w, h);
    return x;
  }
  // Bars rise at once and fall smoothly; a peak marker holds briefly.
  function stepBars(b, target, dt, now, hearing) {
    b.level = hearing ? Math.min(1, b.level + dt / 0.4) : Math.max(0, b.level - dt / 0.6);
    for (var i = 0; i < b.n; i++) {
      var t = target && target[i] !== undefined ? target[i] : FLOOR;
      b.shown[i] = t >= b.shown[i] ? t : Math.max(t, b.shown[i] - 45 * dt);
      if (b.shown[i] >= b.peak[i]) { b.peak[i] = b.shown[i]; b.peakAt[i] = now; }
      else if (now - b.peakAt[i] > 400) b.peak[i] = Math.max(b.shown[i], b.peak[i] - 25 * dt);
    }
    var l = b.level;
    return l * l * (3 - 2 * l);
  }
  function drawBars(x, b, left, top, w, h, color, alpha) {
    var slot = w / b.n, gap = Math.max(1, slot * 0.2), cap = 2;
    x.fillStyle = rgba(color, alpha);
    for (var i = 0; i < b.n; i++) {
      var bx = left + i * slot + gap / 2, bw = slot - gap, lv = (b.shown[i] - FLOOR) / -FLOOR;
      var bh = Math.max(cap, lv * (h - cap * 2));
      x.fillRect(bx, top + h - bh, bw, bh);
    }
    x.fillStyle = rgba(lighten(color), Math.min(1, alpha + 0.1));
    for (var k = 0; k < b.n; k++) {
      var px = left + k * slot + gap / 2, pl = (b.peak[k] - FLOOR) / -FLOOR, py = top + h - cap * 2 - pl * (h - cap * 2);
      x.fillRect(px, py, slot - gap, cap);
    }
  }
  // ---- The meters: VU (averaged, slow needle; 0 VU = -18 dBFS) and PEAK (fast, falls back) ----
  function vuMeter(kind) { return { kind: kind, pos: 0, reading: -60, held: 0, heldAt: 0 }; }
  function place(kind, m) { // where a mark sits on the scale, 0..1
    if (kind === 'VU') {
      var v = Math.pow(10, Math.max(-30, Math.min(4, m)) / 20), lo = Math.pow(10, -1), hi = Math.pow(10, 3 / 20);
      return Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
    }
    return Math.max(0, Math.min(1, (m + 40) / 43)); // PEAK: -40 to +3 dBFS, above 0 is clipping
  }
  function stepMeter(m, rms, peak, dt, now, hearing) {
    var target = hearing ? (m.kind === 'VU' ? place('VU', rms + 18) : place('PEAK', peak)) : 0;
    if (m.kind === 'VU') m.pos += (target - m.pos) * (1 - Math.exp(-dt / 0.09));
    else m.pos = target >= m.pos ? target : Math.max(target, m.pos - dt * 13 / 43);
    var value = m.kind === 'VU' ? rms + 18 : peak;
    m.reading += (Math.max(-60, value) - m.reading) * (1 - Math.exp(-dt / (m.kind === 'VU' ? 0.09 : 0.03)));
    if (m.pos >= m.held || now - m.heldAt > 1000) { m.held = m.pos; m.heldAt = now; }
  }
  var RED = '#E5484D';
  // "BT" after the meter's name on Bluetooth: there the speaker sets the volume, so the meters show
  // the level the phone sends (the song's own), not how loud it plays.
  function btNote(x, left, base, size) {
    if (!VZ.bt) return;
    x.save();
    x.font = '700 ' + size + 'px sans-serif';
    x.textAlign = 'left';
    x.fillStyle = 'rgba(120,180,255,.9)';
    x.fillText('BT', left, base);
    x.restore();
  }
  function drawMeter(x, m, left, top, w, h, color, alpha, digital) {
    if (alpha < 0.004) return;
    x.save();
    x.globalAlpha = alpha;
    x.beginPath();
    if (x.roundRect) x.roundRect(left, top, w, h, 6); else x.rect(left, top, w, h);
    x.fillStyle = 'rgba(0,0,0,.55)';
    x.fill();
    x.strokeStyle = 'rgba(255,255,255,.25)';
    x.lineWidth = 0.75;
    x.stroke();
    x.clip();
    var marks = m.kind === 'VU' ? [-20, -10, -7, -5, -3, -1, 0, 1, 2, 3] : [-40, -30, -20, -10, -6, -3, 0, 3];
    // PEAK goes red only past 0 dBFS: the phone's output (after its volume) went over full scale and clipped.
    var redFrom = place(m.kind, 0), isRed = function (v) { return m.kind === 'VU' ? v >= 0 : v > 0; };
    if (digital) {
      var pad = h * 0.1, ts = Math.max(7, h * 0.15);
      x.font = '500 ' + ts + 'px sans-serif';
      x.textAlign = 'left';
      x.fillStyle = 'rgba(255,255,255,.8)';
      x.fillText(m.kind, left + pad, top + pad + ts * 0.8);
      btNote(x, left + pad + x.measureText(m.kind + ' ').width, top + pad + ts * 0.8, ts * 0.8);
      var sv = Math.max(m.kind === 'VU' ? -20 : -40, m.reading);
      x.textAlign = 'right';
      x.fillStyle = (m.kind === 'VU' ? sv >= 0 : sv > 0.05) ? RED : 'rgba(255,255,255,.9)';
      x.fillText((sv > 0.05 ? '+' : sv < -0.05 ? '−' : '') + Math.abs(sv).toFixed(1) + (m.kind === 'VU' ? ' VU' : ' dB'), left + w - pad, top + pad + ts * 0.8);
      var N = 24, st = top + h * 0.42, sb = top + h * 0.66, sl = left + pad, sr = left + w - pad, gap = 1.2, sw = (sr - sl - gap * (N - 1)) / N;
      // PEAK: the bars up to the last one cover −40 to 0 dBFS; the last one alone is red and lights only
      // above 0 (the output clipped). VU: red from 0 VU, as on its scale.
      var pk = m.kind !== 'VU', over = place(m.kind, 0.05);
      var barAt = function (pos) { return !pk ? pos * N : pos <= redFrom ? pos / redFrom * (N - 1) : N - 1 + (pos - redFrom) / (1 - redFrom); };
      var hs = pk && m.held >= over ? N - 1 : Math.min(pk ? N - 2 : N - 1, Math.floor(barAt(m.held))); // the held peak: the red bar only for an over
      for (var i = 0; i < N; i++) {
        var mid = (i + 0.5) / N, red = pk ? i === N - 1 : mid >= redFrom;
        var lit = (pk && i === N - 1 ? m.pos >= over : barAt(m.pos) >= i + 0.5) || (i === hs && m.held > 0.02);
        x.fillStyle = red ? (lit ? RED : 'rgba(229,72,77,.15)') : (lit ? color : rgba(color, 0.15));
        x.fillRect(sl + i * (sw + gap), st, sw, sb - st);
      }
      x.font = '500 ' + ts * 0.85 + 'px sans-serif';
      x.textAlign = 'center';
      (m.kind === 'VU' ? [-20, -5, 0, 3] : [-40, -20, -10, 0]).forEach(function (v) {
        var half = x.measureText('+3').width / 2, px = sl + (sr - sl) * barAt(place(m.kind, v)) / N;
        x.fillStyle = isRed(v) ? RED : 'rgba(255,255,255,.7)';
        x.fillText((v > 0 ? '+' : '') + v, Math.max(sl + half, Math.min(sr - half, px)), sb + ts * 1.15);
      });
    } else {
      var S = 40 * Math.PI / 180, cx = left + w / 2, cy = top + h * 1.15, r = h * 0.92, ts2 = Math.max(7, h * 0.13);
      x.beginPath();
      x.arc(cx, cy, r, -Math.PI / 2 - S + 2 * S * redFrom, -Math.PI / 2 + S);
      x.strokeStyle = RED;
      x.lineWidth = Math.max(2, h * 0.035);
      x.stroke();
      x.font = '500 ' + ts2 + 'px sans-serif';
      x.textAlign = 'center';
      x.lineCap = 'round';
      marks.forEach(function (v) {
        var a = -S + 2 * S * place(m.kind, v), sx = Math.sin(a), sy = -Math.cos(a);
        var major = m.kind === 'VU' ? [-20, -5, 0, 3].indexOf(v) >= 0 : [-40, -20, -10, 0].indexOf(v) >= 0, inn = r - (major ? h * 0.12 : h * 0.07);
        x.strokeStyle = isRed(v) ? RED : 'rgba(255,255,255,.8)';
        x.lineWidth = 0.9;
        x.beginPath(); x.moveTo(cx + sx * inn, cy + sy * inn); x.lineTo(cx + sx * r, cy + sy * r); x.stroke();
        if (major) {
          var tr = r - h * 0.22;
          x.fillStyle = 'rgba(255,255,255,.8)';
          x.fillText((v > 0 ? '+' : '') + v, cx + sx * tr, cy + sy * tr + ts2 * 0.35);
        }
      });
      x.textAlign = 'left';
      x.font = '500 ' + ts2 * 0.95 + 'px sans-serif';
      x.fillStyle = 'rgba(255,255,255,.8)';
      x.fillText(m.kind, left + h * 0.1, top + h - ts2 * 0.55);
      btNote(x, left + h * 0.1 + x.measureText(m.kind + ' ').width, top + h - ts2 * 0.55, ts2 * 0.8);
      var na = -S + 2 * S * m.pos, nx = Math.sin(na), ny = -Math.cos(na);
      x.strokeStyle = color;
      x.lineWidth = 1.6;
      x.beginPath(); x.moveTo(cx + nx * h * 0.45, cy + ny * h * 0.45); x.lineTo(cx + nx * (r + h * 0.02), cy + ny * (r + h * 0.02)); x.stroke();
    }
    x.restore();
  }
  // ---- The deck meters: a tape deck's glowing level display, a VU (average) bar and a PK (peak)
  // bar with the dBFS scale between them and an OVER mark that lights only when the peak goes past
  // full scale (clipping). ----
  var DECK_DB = [-40, -35, -30, -26, -23, -20, -18, -16, -14, -12, -10, -9, -8, -7, -6, -5, -4, -3, -2, -1, 0];
  var DECK_SMALL = [-40, -30, -20, -14, -10, -8, -6, -4, -3, -2, -1, 0]; // when it's narrow (the player bar)
  var DECK_LABELS = [-40, -30, -20, -10, -6, -3, 0];
  function deckMeter() { return { db: -96, vu: -96, hold: -96, holdAt: 0, overAt: -1e9, f: 0 }; }
  // Top row VU: the average level (RMS) in dBFS, with a VU meter's slower movement. Bottom row PK:
  // the peak level, with its peak held and OVER when it goes past full scale.
  function stepDeck(d, peak, dt, now, on, rms) {
    d.vu += ((on ? Math.max(-96, rms) : -96) - d.vu) * (1 - Math.exp(-dt / 0.3));
    var v = on ? peak : -96;
    d.db = v >= d.db ? v : Math.max(v, d.db - dt * 24); // falls 24 dB a second
    if (d.db >= d.hold || now - d.holdAt > 1500) { d.hold = d.db; d.holdAt = now; }
    if (on && peak > 0.05) d.overAt = now;
    d.f += ((on ? 1 : 0) - d.f) * (1 - Math.exp(-dt / 0.25));
    return d.f;
  }
  function drawDeck(x, d, left, top, w, h, alpha, now, panel, VFD) {
    if (alpha < 0.004) return;
    x.save();
    x.globalAlpha = alpha;
    x.beginPath();
    if (x.roundRect) x.roundRect(left, top, w, h, 6); else x.rect(left, top, w, h);
    if (panel) { // the display window (not in the player bar, which is dark already)
      x.fillStyle = 'rgba(4,10,12,.82)';
      x.fill();
      x.strokeStyle = 'rgba(255,255,255,.18)';
      x.lineWidth = 0.75;
      x.stroke();
    }
    x.clip();
    var scale = h >= 40, pad = Math.max(4, h * 0.13), ts = Math.max(7, Math.min(11, h * 0.17));
    x.font = '600 ' + ts + 'px sans-serif';
    var nameW = Math.max(x.measureText('VU').width, x.measureText('PK').width) + pad * 0.8, overW = x.measureText('OVER').width;
    var sl = left + pad + nameW, sr = left + w - pad, dbs = (sr - sl) / (DECK_DB.length + 1) >= 4 ? DECK_DB : DECK_SMALL, N = dbs.length + 1, gap = Math.max(1, (sr - sl) / N * 0.22);
    var segW = (sr - sl - gap * (N - 1)) / N;
    var barH = scale ? h * 0.2 : (h - pad * 2 - pad * 0.6) / 2;
    var rows = scale ? [top + pad, top + h - pad - barH] : [top + pad, top + h - pad - barH];
    var over = now - d.overAt < 1000, holdI = -1, i;
    for (i = 0; i < dbs.length; i++) if (d.hold >= dbs[i]) holdI = i;
    x.shadowColor = VFD;
    rows.forEach(function (ry, ri) {
      x.shadowBlur = 0;
      x.fillStyle = VFD;
      x.globalAlpha = alpha * 0.9;
      x.textAlign = 'left';
      x.fillText(ri ? 'PK' : 'VU', left + pad, ry + barH / 2 + ts * 0.36);
      for (var k = 0; k < N; k++) { // the VU row's OVER stays dark: an average can't show clipping
        var isOver = k === N - 1, lit = isOver ? over && ri === 1 : ri ? (d.db >= dbs[k] || k === holdI) : d.vu >= dbs[k];
        var col = isOver ? '#FF5A4E' : VFD;
        x.globalAlpha = alpha * (lit ? 1 : 0.13);
        x.shadowBlur = lit ? 6 : 0;
        x.shadowColor = col;
        x.fillStyle = col;
        x.fillRect(sl + k * (segW + gap), ry, segW, barH);
      }
    });
    if (scale) { // the numbers between the bars, each under its own segment
      x.shadowBlur = 0;
      x.globalAlpha = alpha * 0.85;
      btNote(x, left + pad * 0.6, top + h / 2 + ts * 0.32, ts * 0.75);
      x.font = '500 ' + ts * 0.9 + 'px sans-serif';
      x.textAlign = 'center';
      var my = top + h / 2 + ts * 0.32, lastRight = -1e9;
      var overX = sl + (N - 1) * (segW + gap) + segW / 2, overL = Math.min(overX - overW / 2, sr - overW);
      DECK_LABELS.forEach(function (v) {
        if (dbs.indexOf(v) < 0) return;
        var cx = sl + dbs.indexOf(v) * (segW + gap) + segW / 2, t = String(v), tw = x.measureText(t).width;
        if (cx - tw / 2 < lastRight + 3 || cx + tw / 2 > overL - 3) return; // no room: skipped
        x.fillStyle = VFD;
        x.fillText(t, cx, my);
        lastRight = cx + tw / 2;
      });
      x.textAlign = 'left';
      x.globalAlpha = alpha * (over ? 1 : 0.3);
      x.shadowBlur = over ? 6 : 0;
      x.shadowColor = '#FF5A4E';
      x.fillStyle = '#FF5A4E';
      x.fillText('OVER', overL, my);
    }
    x.restore();
  }
  // Is the strip under the cover (where the numbers go) free of Tidal's player? Not when the
  // player bar overlaps it, or when a button, text or picture of Tidal's is there.
  function labelsFree(arc, labelH) {
    var top = arc.bottom, bottom = arc.bottom + labelH;
    if (bottom > innerHeight || top < 0) return false; // not fully on screen
    var bar = document.querySelector('[data-test="footer-player"]'), br = bar && rectOf(bar);
    if (br && br.top < bottom && br.bottom > top && br.left < arc.right && br.right > arc.left) return false;
    for (var i = 0; i < 7; i++) {
      var px = arc.left + arc.width * (i + 0.5) / 7, py = top + labelH / 2;
      if (px < 0 || py < 0 || px >= innerWidth || py >= innerHeight) continue;
      var el = document.elementFromPoint(px, py);
      if (!el || el.tagName === 'CANVAS') continue;
      if (el.closest('button,a,time,input,img,svg,[role="slider"],[data-test="progress-bar"]')) return false;
      for (var c = el.firstChild; c; c = c.nextSibling) if (c.nodeType === 3 && c.nodeValue.trim()) return false;
    }
    return true;
  }
  // How far down the cover something of Tidal's (its header) lies over its top corners, in CSS
  // px from the cover's top: the first height where both corners show the cover itself.
  function shownTop(art, arc) {
    var xs = [arc.left + arc.width * 0.12, arc.right - arc.width * 0.12];
    for (var y = Math.max(arc.top, 0) + 1; y < arc.top + arc.height * 0.5; y += 4) {
      if (y >= innerHeight) break;
      var clear = true;
      for (var i = 0; i < 2 && clear; i++) {
        var el = document.elementFromPoint(xs[i], y);
        if (el && el !== art && !art.contains(el) && !el.contains(art)) clear = false;
      }
      if (clear) return Math.max(0, y - 1 - arc.top);
    }
    return 0;
  }
  // What lies over the cover (Tidal's header over its top, its player bar over the numbers) is
  // looked at when the player opens and when the screen changes size (rotating, unfolding, Text
  // size): right away and again once Tidal's layout has settled. Not on a timer.
  var layoutTimers = [];
  function layoutSoon() {
    layoutTimers.forEach(clearTimeout);
    VZ.layoutDue = true;
    layoutTimers = [300, 900].map(function (ms) { return setTimeout(function () { VZ.layoutDue = true; }, ms); });
  }
  addEventListener('resize', layoutSoon);
  if (window.visualViewport) visualViewport.addEventListener('resize', layoutSoon);
  // ...and when the player scrolls (landscape: the cover can slide under the header). Only once
  // the scrolling stops.
  var scrollWait = 0;
  addEventListener('scroll', function () {
    if (!VZ.cover) return;
    clearTimeout(scrollWait);
    scrollWait = setTimeout(function () { VZ.layoutDue = true; }, 150);
  }, { capture: true, passive: true });
  // ---- Each frame ----
  var vizLast = 0, vizTimer = 0;
  function vizCover() { // the full-screen player's cover, if it's showing
    if (!((fairStore && playerOpen()) || playerTabsShown())) return null;
    var art = document.querySelector('[data-test="now-playing-artwork"]');
    return art && art.offsetWidth > 40 && art.parentElement ? art : null;
  }
  function vizFrame() {
    vizTimer = 0;
    var now = performance.now(), dt = vizLast ? Math.min(0.1, (now - vizLast) / 1000) : 0;
    vizLast = now;
    var cfg = VZ.cfg, art = vizCover(), playing = false;
    try { playing = fairStore.getState().playbackControls.playbackState === 'PLAYING'; } catch (e) { var me = media(); playing = !!(me && !me.paused); }
    // The player bar's spot (worked out twice a second: it measures the bar's text).
    if (now - VZ.miniAt > 500) {
      VZ.miniAt = now;
      var mr = 'off';
      try { mr = miniRect(); } catch (e) {}
      VZ.lastMini = mr === 'off' ? null : mr.split('|')[0].split(',').map(Number);
    }
    if (playing) VZ.miniPlayedAt = now;
    var wantCover = !!art && (cfg.analyzerOn || cfg.vuOn), wantMini = !!VZ.lastMini && now - (VZ.miniPlayedAt || 0) < 3000;
    var want = (wantCover || wantMini) && !document.hidden;
    if (want !== VZ.wanted) { VZ.wanted = want; try { WaveApp.capture(want); } catch (e) {} }
    var data = null;
    if (want) { try { data = String(WaveApp.levels(wantCover && cfg.analyzerOn ? 40 : 0, wantMini && !cfg.miniMeters ? 32 : 0)).split('|'); } catch (e) {} }
    var hearing = !!data && data[0] === '1', lowHz = data ? parseFloat(data[1]) || 46.9 : 46.9;
    var rms = data ? parseFloat(data[2]) : -96, pk = data ? parseFloat(data[3]) : -96;
    VZ.bt = !!data && data[6] === '1'; // Bluetooth: the speaker sets the volume, the meters show what's sent
    var coverDb = data && data[4] ? data[4].split(',').map(Number) : null, miniDb = data && data[5] ? data[5].split(',').map(Number) : null;
    // Over the cover.
    var cv = VZ.cover;
    if (wantCover) {
      // Right after the cover, in the same parent, at the cover's own offsets: the same containing
      // block, so it's always exactly on the cover however Tidal scrolls or moves its player
      // (at 130% in landscape it's moved up). A swipe's movement is copied over.
      if (!cv || !cv.canvas.isConnected || cv.canvas.previousElementSibling !== art) {
        if (cv && cv.canvas.parentElement) cv.canvas.parentElement.removeChild(cv.canvas);
        cv = VZ.cover = { canvas: canvasIn(art.parentElement, 'cover', art), bars: vizBars(40), vu: vuMeter('VU'), pk: vuMeter('PEAK'), level: 0 };
        layoutSoon(); // the player just opened: look at what's over the cover (again once it has settled)
      }
      if (VZ.layoutDue) {
        VZ.layoutDue = false;
        cv.shownTop = shownTop(art, art.getBoundingClientRect());
        cv.labelsFree = labelsFree(art.getBoundingClientRect(), 16);
      }
      var arc = art.getBoundingClientRect();
      var aw = art.offsetWidth, ah = art.offsetHeight, labelH = 16;
      cv.canvas.style.left = art.offsetLeft + 'px';
      cv.canvas.style.top = art.offsetTop + 'px';
      cv.canvas.style.transform = art.style.transform || '';
      cv.canvas.style.opacity = art.style.opacity || '';
      var x = fit(cv.canvas, aw, ah + labelH);
      var f = stepBars(cv.bars, coverDb, dt, now, hearing);
      if (cfg.analyzerOn && f > 0.003) {
        var bh = Math.max(40, Math.min(160, ah * 0.22));
        drawBars(x, cv.bars, 0, ah - bh, aw, bh, vizColor('cover', true), (cfg.analyzerOpacity / 100) * f);
        // The frequency numbers under the cover: switched on in the Visuals tab, and only where
        // nothing of Tidal's player is drawn over them (landscape: the player bar).
        x.font = '500 10px sans-serif';
        x.textAlign = 'center';
        x.fillStyle = 'rgba(255,255,255,' + (0.7 * f) + ')';
        var range = Math.log(20000 / lowHz);
        for (var li = 0; cfg.labelsOn && cv.labelsFree && li < LABEL_HZ.length; li++) {
          if (LABEL_HZ[li] < lowHz) continue;
          var half = x.measureText(LABELS[li]).width / 2, lx = aw * Math.log(LABEL_HZ[li] / lowHz) / range;
          x.fillText(LABELS[li], Math.max(half, Math.min(aw - half, lx)), ah + 12);
        }
      }
      if (cfg.vuOn) {
        // In the top of the part of the cover that shows: Tidal's header can lie over the top of
        // it (130% in landscape), so the meters go just below it.
        var mw = aw * 0.3, mh = mw * 0.62, inset = aw * 0.035, va = ((cfg.vuMatch ? cfg.analyzerOpacity : cfg.vuOpacity) / 100) * f;
        var my = Math.min((cv.shownTop || 0) + inset, ah * 0.5);
        if (cfg.vuStyle === 2) { // Deck: one display across the top, L above R
          if (!cv.deck) cv.deck = deckMeter();
          stepDeck(cv.deck, pk, dt, now, hearing, rms);
          drawDeck(x, cv.deck, inset, my, aw - inset * 2, Math.max(44, Math.min(80, aw * 0.15)), va, now, true, vizColor('cover'));
        } else {
          stepMeter(cv.vu, rms, pk, dt, now, hearing);
          stepMeter(cv.pk, rms, pk, dt, now, hearing);
          drawMeter(x, cv.vu, inset, my, mw, mh, vizColor('cover'), va, cfg.vuStyle === 1);
          drawMeter(x, cv.pk, aw - inset - mw, my, mw, mh, vizColor('cover'), va, cfg.vuStyle === 1);
        }
      }
    } else if (cv) {
      if (cv.canvas.parentElement) cv.canvas.parentElement.removeChild(cv.canvas);
      VZ.cover = null;
    }
    // In the player bar.
    var mv = VZ.mini, footer = document.querySelector('[data-test="footer-player"]');
    if (wantMini && footer) {
      if (!mv || !mv.canvas.isConnected || mv.canvas.parentElement !== footer) {
        if (mv && mv.canvas.parentElement) mv.canvas.parentElement.removeChild(mv.canvas);
        mv = VZ.mini = { canvas: canvasIn(footer, 'mini'), bars: vizBars(32), m: deckMeter() };
      }
      var fr = footer.getBoundingClientRect(), r = VZ.lastMini;
      mv.canvas.style.left = (r[0] - fr.left - footer.clientLeft) + 'px';
      mv.canvas.style.top = (r[1] - fr.top - footer.clientTop) + 'px';
      var mx = fit(mv.canvas, r[2], r[3]);
      if (cfg.miniMeters) drawDeck(mx, mv.m, 0, 0, r[2], r[3], stepDeck(mv.m, pk, dt, now, hearing && playing, rms), now, false, vizColor('mini'));
      else {
        var mf = stepBars(mv.bars, miniDb, dt, now, hearing && playing);
        if (mf > 0.003) drawBars(mx, mv.bars, 0, 0, r[2], r[3], vizColor('mini', true), mf);
      }
    } else if (mv) {
      if (mv.canvas.parentElement) mv.canvas.parentElement.removeChild(mv.canvas);
      VZ.mini = null;
    }
    // Every frame while something shows; otherwise a look twice a second.
    if (want) requestAnimationFrame(vizFrame); else { vizLast = 0; vizTimer = setTimeout(vizFrame, 500); }
  }
  vizTimer = setTimeout(vizFrame, 500);

  // ---------- Song rows that fit ----------
  // In Tidal's wide layout (side panel open) on a narrow page (a bigger Text size on a foldable),
  // the song list can be narrower than a row: the title column keeps its width and pushes the
  // row's ... menu off the edge (seen with Wave Probe 7). Here the title column shrinks instead,
  // and a long title ends in "…".
  (function () {
    function add() {
      if (document.getElementById('wave-rows-css') || !document.head) return !!document.getElementById('wave-rows-css');
      var st = document.createElement('style');
      st.id = 'wave-rows-css';
      st.textContent =
        '[data-test="tracklist-row"]{min-width:0!important;max-width:100%!important}' +
        // Only allowed to shrink: rows that fit stay exactly as Tidal draws them.
        '[data-test="tracklist-row"]>[data-test="table-row-title"]{flex-shrink:1!important;min-width:0!important;overflow:hidden}' +
        '[data-test="table-row-title"]>*{min-width:0!important;overflow:hidden}' +
        '[data-test="table-cell-title"]{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}';
      document.head.appendChild(st);
      return true;
    }
    if (!add()) { var t = setInterval(function () { if (add()) clearInterval(t); }, 300); }
  })();

  // ---------- Tap a song to play it (Wave Mobile) ----------
  // A tap anywhere on a song in a list (number, cover, title, artist) plays it, instead of
  // opening the artist or album. Its other buttons (the ... menu) work as usual.
  // Phones: no pause-before-switching (that's for TVs) and no automatic full-screen player.
  W.phoneMode = function () { W.phone = true; };
  W.enableTapToPlay = function () {
    if (W.tapToPlay) return;
    W.tapToPlay = true;
    var playing = false;
    addEventListener('click', function (e) {
      if (playing || !e.isTrusted) return;
      var t = e.target, row = t && t.closest && t.closest('[data-test="tracklist-row"]');
      if (!row) return;
      var ctl = t.closest('button,[role="button"],input');
      if (ctl && row.contains(ctl) && ctl.getAttribute('data-test') !== 'play-button') return; // its own buttons
      var play = row.querySelector('[data-test="play-button"]');
      e.preventDefault();
      e.stopPropagation();
      playing = true;
      try {
        if (play) play.click();
        else row.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
      } finally { playing = false; }
    }, true);
  };

  // ---------- Swipe gestures (Wave Mobile) ----------
  // In the full-screen player: swipe left for the next song, right for the previous one (the cover
  // follows your finger), and down from the upper part of the player to close it. Swipes that
  // start on the player bar (controls, seek bar) are left to Tidal.
  W.enableSwipes = function () {
    if (W.swipes) return;
    W.swipes = true;
    var sx = 0, sy = 0, active = false, art = null;
    function inPlayer() { return (fairStore && playerOpen()) || playerTabsShown(); }
    function settle(el) {
      if (!el) return;
      el.style.transition = 'transform .2s, opacity .2s';
      el.style.transform = '';
      el.style.opacity = '';
    }
    addEventListener('touchstart', function (e) {
      active = false;
      if (e.touches.length !== 1 || !inPlayer()) return;
      var t = e.touches[0], f = document.querySelector('[data-test="footer-player"]'), fr = f && rectOf(f);
      if (fr && t.clientY >= fr.top) return; // the player bar: Tidal's own controls and seek bar
      sx = t.clientX; sy = t.clientY; active = true;
      art = document.querySelector('[data-test="now-playing-artwork"]');
    }, { passive: true, capture: true });
    addEventListener('touchmove', function (e) {
      if (!active || !art || e.touches.length !== 1) return;
      var dx = e.touches[0].clientX - sx, dy = e.touches[0].clientY - sy;
      if (Math.abs(dx) <= Math.abs(dy)) return;
      art.style.transition = 'none';
      art.style.transform = 'translateX(' + dx + 'px)';
      art.style.opacity = String(Math.max(0.3, 1 - Math.abs(dx) / innerWidth));
    }, { passive: true, capture: true });
    function end(e) {
      if (!active) return;
      active = false;
      var t = e.changedTouches && e.changedTouches[0];
      if (!t) { settle(art); return; }
      var dx = t.clientX - sx, dy = t.clientY - sy, w = innerWidth, el = art;
      if (Math.abs(dx) > w * 0.18 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        if (el) { // slide the cover away, then back once the next song is in
          el.style.transition = 'transform .15s, opacity .15s';
          el.style.transform = 'translateX(' + (dx < 0 ? -w : w) + 'px)';
          el.style.opacity = '0';
          setTimeout(function () { settle(el); }, 300);
        }
        W.cmd(dx < 0 ? 'next' : 'prev');
      } else if (dy > innerHeight * 0.15 && dy > Math.abs(dx) * 1.5 && sy < innerHeight * 0.6) {
        settle(el);
        var close = document.querySelector('[data-test="new-now-playing-close"]');
        if (close) close.click();
      } else {
        settle(el);
      }
    }
    addEventListener('touchend', end, { passive: true, capture: true });
    addEventListener('touchcancel', function () { active = false; settle(art); }, { passive: true, capture: true });
  };

  // Back (the phone's back button or gesture): the full-screen player closes, as its own close
  // button does. Says whether it did (otherwise the app goes back a page).
  W.back = function () {
    if (!((fairStore && playerOpen()) || playerTabsShown())) return false;
    var close = document.querySelector('[data-test="new-now-playing-close"]');
    if (!close) return false;
    close.click();
    return true;
  };

  // ---------- Fun facts: a card on the album art ----------
  // The app looks the song up on Wikipedia (Fun facts on, in the Wave tab) and hands the fact over
  // here. It shows at the bottom right of the full-screen player's cover once the song has played
  // 10 s, for 12 s, then fades out; once per song. Opening the player later in the song still shows
  // it (not in its last 15 s). Phones: a tap closes it. TV: the ring never lands on it.
  var fact = null, factCard = null, FACT_AFTER = 10, FACT_FOR = 12000;
  W.fact = function (key, text, article) { fact = { key: key, text: text, article: article, at: 0, done: false }; };
  function songKey() { try { var n = nowPlaying(); return n.title + '|' + n.artist; } catch (e) { return ''; } }
  function hideFact(now) {
    if (!factCard) return;
    var c = factCard;
    factCard = null;
    c.style.opacity = '0';
    setTimeout(function () { if (c.parentNode) c.parentNode.removeChild(c); }, now ? 0 : 450);
  }
  function factTick() {
    if (!fact || fact.done) { if (factCard && (!fact || fact.done)) hideFact(); return; }
    if (songKey() !== fact.key) { fact.done = true; hideFact(true); return; } // another song now
    var art = vizCover(), pos = 0, dur = 0, playing = false;
    try {
      var pc = fairStore.getState().playbackControls;
      playing = pc.playbackState === 'PLAYING';
      pos = pc.latestCurrentTime || 0;
    } catch (e) {}
    var me = media();
    if (me) { if (!pos) pos = me.currentTime || 0; dur = isFinite(me.duration) ? me.duration : 0; if (!playing) playing = !me.paused; }
    var now = Date.now();
    if (fact.at && now - fact.at > FACT_FOR) { fact.done = true; hideFact(); return; }
    if (!art) { if (factCard) hideFact(true); return; } // the player closed: back if it opens again in time
    if (!fact.at) {
      if (!playing || pos < FACT_AFTER || (dur && dur - pos < 15)) return;
      fact.at = now;
    }
    if (!factCard || !factCard.isConnected || factCard.parentNode !== art.parentElement) {
      if (factCard && factCard.parentNode) factCard.parentNode.removeChild(factCard);
      var c = factCard = document.createElement('div');
      c.setAttribute('data-wave', 'fact');
      c.style.cssText = 'position:absolute;z-index:3;box-sizing:border-box;border-radius:12px;padding:10px 12px 8px;' +
        'background:rgba(10,10,12,.86);color:#fff;font:500 12.5px/1.4 sans-serif;box-shadow:0 4px 18px rgba(0,0,0,.45);' +
        'opacity:0;transition:opacity .45s;' + (W.phone ? 'pointer-events:auto' : 'pointer-events:none');
      var h = document.createElement('div'), t = document.createElement('div'), src = document.createElement('div');
      h.textContent = 'Did you know?';
      h.style.cssText = 'font-weight:700;font-size:11px;letter-spacing:.04em;text-transform:uppercase;margin-bottom:4px';
      t.textContent = fact.text;
      src.textContent = 'Wikipedia: ' + fact.article;
      src.style.cssText = 'margin-top:6px;font-size:10px;opacity:.55';
      c.appendChild(h); c.appendChild(t); c.appendChild(src);
      if (W.phone) c.addEventListener('click', function (e) { e.stopPropagation(); e.preventDefault(); fact.done = true; hideFact(); }, true);
      art.parentElement.insertBefore(c, art.nextSibling);
      setTimeout(function () { if (factCard === c) c.style.opacity = '1'; }, 30);
    }
    // At the cover's bottom right, a little in from its edges, at most 70% of its width.
    var cw = art.offsetWidth, ch = art.offsetHeight, m = Math.max(8, cw * 0.035), col = (VZ && VZ.color && vizColor('cover')) || '#33C3F0';
    factCard.style.maxWidth = Math.min(cw * 0.7, 340) + 'px';
    factCard.style.borderLeft = '3px solid ' + col;
    factCard.querySelector('div').style.color = col;
    factCard.style.left = (art.offsetLeft + cw - factCard.offsetWidth - m) + 'px';
    factCard.style.top = (art.offsetTop + ch - factCard.offsetHeight - m) + 'px';
    factCard.style.transform = art.style.transform || '';
  }
  setInterval(factTick, 500);

  // ---------- Menu (the remote): Tidal's Settings page ----------
  // Opened inside Tidal's player, so the music plays on. With Tidal's own router command, as its
  // profile menu's Settings sends it (seen with Wave Probe 9: router/PUSH, payload "/settings");
  // should the address not change, through the browser's history, which a page's router follows. Never by loading the
  // address: that would restart the player. The full-screen player is closed first, and the ring
  // then goes to the Settings tabs. Already on Settings: the ring just goes back to its tabs.
  var SETTINGS_PATH = '/settings', settingsPoll = 0, settingsAt = 0;
  function onSettings() { return /^\/settings(\/|$)/.test(location.pathname); }
  function settingsTab() { // the picked tab (Tidal marks it with an "active" class), else the first
    var tabs = document.querySelectorAll('[data-test^="settings-tab--"]');
    for (var i = 0; i < tabs.length; i++) if (/_active_/.test(tabs[i].className)) return tabs[i];
    return tabs[0] || null;
  }
  // Waits for the Settings page to show (its tabs), then puts the ring on the picked tab.
  function ringToSettings(failed) {
    clearInterval(settingsPoll);
    var tries = 0;
    settingsPoll = setInterval(function () {
      var tab = onSettings() ? settingsTab() : null;
      if (tab && rectOf(tab)) {
        clearInterval(settingsPoll);
        if (ringOn && usable(tab)) {
          select(tab);
          try { WaveApp.ringMoved(point()); } catch (e) {}
        }
      } else if (++tries > 53) { // 8 s
        clearInterval(settingsPoll);
        if (failed) failed();
      }
    }, 150);
  }
  // A new entry in the browser's history plus the event a router listens for (as Back/Forward
  // send it). The entry keeps the shape of the router's own (its index one further along).
  function pushByHistory(path) {
    try {
      var st = history.state, ns = st && typeof st === 'object' ? Object.assign({}, st) : null;
      if (ns) {
        delete ns.usr; delete ns.state; // the last page's own data doesn't come along
        if (typeof ns.idx === 'number') ns.idx++;
        if (typeof ns.key === 'string') ns.key = 'wave' + Date.now().toString(36);
      }
      history.pushState(ns, '', path);
      dispatchEvent(new PopStateEvent('popstate', { state: ns }));
      return true;
    } catch (e) { return false; }
  }
  W.openSettings = function () {
    if (onSettings()) { ringToSettings(); return; }
    var now = Date.now();
    if (now - settingsAt < 1500) return; // a second press while it's opening
    settingsAt = now;
    try { fairAttach(); } catch (e) {}
    try { W.back(); } catch (e) {} // the full-screen player, if it's open
    try {
      if (fairStore) fairStore.dispatch({ type: 'router/PUSH', payload: SETTINGS_PATH });
    } catch (e) {}
    setTimeout(function () {
      var byHistory = !onSettings() && pushByHistory(SETTINGS_PATH);
      ringToSettings(function () { // no Settings page after 8 s
        if (byHistory && onSettings()) { try { history.back(); } catch (e) {} } // take the entry back out
        note('Couldn\'t open Settings with the remote\'s Menu button. It\'s also in the profile menu (top right).');
      });
    }, 600);
  };

  // Signed out: straight to Tidal's login page, by Tidal's own "Log in / Create a free account"
  // button (seen with Wave Probe 8: signed out, session.userId is null; the button starts the
  // login at login.tidal.com). Once per app start, so going back from the login page stays on the
  // home page.
  (function () {
    var tries = 0, KEY = 'wave.loginShown';
    try { if (sessionStorage.getItem(KEY)) return; } catch (e) {}
    var timer = setInterval(function () {
      if (++tries > 40) { clearInterval(timer); return; } // 20 s: Tidal didn't settle; leave it
      var sess = null;
      try { fairAttach(); sess = fairStore && fairStore.getState().session; } catch (e) {}
      if (!sess || !sess.isInitialized || sess.isLoading) return; // not known yet
      if (sess.userId) { clearInterval(timer); return; } // signed in
      var b = document.querySelector('[data-test="combined-login-signup-button"]');
      if (!b) return;
      clearInterval(timer);
      try { sessionStorage.setItem(KEY, '1'); } catch (e) {}
      b.click();
    }, 500);
  })();

  // TV: once, Tidal's Uploads tab hidden and My Collection pinned to the sidebar, with the
  // commands its own Settings switches send (seen with Wave Probe 8: settings/SET_HIDE_UPLOAD_TAB
  // and settings/SET_PIN_COLLECTION_TO_SIDEBAR, payload true/false). Afterwards those switches work
  // as usual and Wave leaves them be.
  (function () {
    var KEY = 'wave.tvDefaults', tries = 0;
    try { if (localStorage.getItem(KEY)) return; } catch (e) {}
    var timer = setInterval(function () {
      if (W.phone || ++tries > 60) { clearInterval(timer); return; } // phones; or Tidal not ready in 30 s: next start
      var set;
      try { fairAttach(); set = fairStore && fairStore.getState().settings; } catch (e) {}
      if (!set || typeof set.hideUploadTab !== 'boolean') return;
      clearInterval(timer);
      try {
        if (!set.hideUploadTab) fairStore.dispatch({ type: 'settings/SET_HIDE_UPLOAD_TAB', payload: true });
        if (!set.pinCollectionToSidebar) fairStore.dispatch({ type: 'settings/SET_PIN_COLLECTION_TO_SIDEBAR', payload: true });
        localStorage.setItem(KEY, '1');
      } catch (e) {}
    }, 500);
  })();

  W.ready = true;
})();
