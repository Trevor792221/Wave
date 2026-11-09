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
    WaveApp.state(!!(e && !e.paused && !e.ended), n.title, n.artist, n.art, n.dur, n.pos, n.quality || '', !!n.fav);
  }
  function txt(el) { return el ? (el.textContent || '').replace(/\s+/g, ' ').trim() : ''; }
  // What's playing, for Android's media controls and notification. Android's WebView has no
  // Media Session API, so it comes from Tidal itself: the song from its player bar, the length and
  // position from its player state (else the audio). Times in milliseconds.
  function nowPlaying() {
    var md = ms && ms.metadata, title = (md && md.title) || '', artist = (md && md.artist) || '', art = '';
    if (md && md.artwork && md.artwork.length) art = md.artwork[md.artwork.length - 1].src || ''; // biggest last
    var footer = document.querySelector('[data-test="footer-player"]') || compactBar();
    if (footer) {
      if (!title) title = txt(footer.querySelector('[data-test="footer-track-title"]'));
      if (!artist) artist = txt(footer.querySelector('[data-test="footer-artist-name"]'));
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
             quality: streamQuality(pc && pc.playbackContext), fav: inCollection() };
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
      // Picking a song while another plays: pause it first (see switchSongs).
      if (a && !fairJumping && (a.type === 'playQueue/MOVE_TO' || a.type === 'playQueue/ADD_TRACK_LIST_TO_PLAY_QUEUE')) {
        var self = this, args = arguments;
        if (switchSongs(function () { real.apply(self, args); })) return a;
      }
      return real.apply(this, arguments);
    };
    st.subscribe(fairChange);
    st.subscribe(checkPlayerOpened);
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
    switchTimer = setTimeout(function () { switchTimer = 0; go(); }, 400);
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

    if (q.shuffleModeEnabled && (movedOn || started) && !picked && heard[id]) {
      for (var step = 1; step < n; step++) {
        var j = (idx + step) % n;
        if (!heard[String(q.elements[j].mediaItemId)]) { fairJumpSoon(src, idx, id, j); return; } // that song is marked then
      }
      mem.h = []; // nothing unheard left (shouldn't happen: rounds end at their last song)
      heard = {};
    }
    if (!heard[id]) { mem.h.push(id); heard[id] = 1; }
    var count = 0;
    for (i = 0; i < n; i++) if (heard[String(q.elements[i].mediaItemId)]) count++;
    if (count >= n) {
      mem.h = []; // the round is complete: the next song (or next time) starts a new one
      if (q.shuffleModeEnabled) note('Fair shuffle: all ' + n + ' played, new round next');
    } else if (q.shuffleModeEnabled) {
      note('Fair shuffle: ' + count + ' of ' + n + ' played');
    }
    fairSave();
    renderRounds();
  }
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
  function covered(r, box) {
    var pts = [[0.5, 0.5], [0.1, 0.2], [0.9, 0.2], [0.1, 0.8], [0.9, 0.8]];
    for (var i = 0; i < pts.length; i++) {
      var x = r.left + r.width * pts[i][0], y = r.top + r.height * pts[i][1];
      if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue;
      var el = document.elementFromPoint(x, y);
      if (el && !box.contains(el)) return true;
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
    if (ar && ar.top >= 0 && ar.bottom <= vh) { cover = ar; coverEl = art; best = ar.width * ar.height; }
    var imgs = cover ? [] : document.querySelectorAll('img,video,canvas');
    for (i = 0; i < imgs.length; i++) {
      var r = rectOf(imgs[i]), a = r ? r.width * r.height : 0;
      if (!r || r.top < 0 || r.bottom > vh || r.left < 0 || r.right > vw) continue;
      if (a > vw * vh * 0.5 || r.width / r.height < 0.8 || r.width / r.height > 1.25) continue;
      if (a > best) { best = a; cover = r; coverEl = imgs[i]; }
    }
    if (!cover || best < vw * vh * 0.04) return 'off';
    var h = Math.max(40, Math.min(160, cover.height * 0.22));
    var top = cover.bottom - h;
    var box = (coverEl.closest && coverEl.closest('[data-test="new-now-playing"]')) || coverEl.parentElement || coverEl;
    if (covered({ left: cover.left, top: top, width: cover.width, height: h }, box)) return 'off';
    var url = coverEl && coverEl.tagName === 'IMG' ? (coverEl.currentSrc || coverEl.src || '') : '';
    return [Math.round(cover.left), Math.round(top), Math.round(cover.width), Math.round(h), vw].join(',') + '|' + url;
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
  var wasOpen = false;
  function checkPlayerOpened() {
    var open = playerOpen() || playerTabsShown();
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
            '[role="menuitem"],[role="option"],[role="checkbox"],[role="switch"],[tabindex]:not([tabindex="-1"])';
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
  // (scroll, resize, DOM change) or for at most a second.
  var cache = null, cacheTime = 0;
  function invalidate() { cache = null; }
  function candidates() {
    var now = Date.now();
    if (cache && now - cacheTime < 1000) return cache;
    var all = document.querySelectorAll(SEL), out = [];
    for (var i = 0; i < all.length; i++) {
      var r = onScreen(all[i]);
      if (r) out.push({ el: all[i], r: r });
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
  function pick(c, d, list) {
    var scored = [], cx = (c.left + c.right) / 2, cy = (c.top + c.bottom) / 2;
    for (var i = 0; i < list.length; i++) {
      var o = list[i], r = o.r;
      if (cur && (o.el === cur || o.el.contains(cur) || cur.contains(o.el))) continue;
      var rx = (r.left + r.right) / 2, ry = (r.top + r.bottom) / 2, main, side;
      if (d === 'right') { if (rx <= cx + 1 || r.left <= c.left) continue; main = Math.max(0, r.left - c.right); side = gap(c.top, c.bottom, r.top, r.bottom); }
      else if (d === 'left') { if (rx >= cx - 1 || r.right >= c.right) continue; main = Math.max(0, c.left - r.right); side = gap(c.top, c.bottom, r.top, r.bottom); }
      else if (d === 'down') { if (ry <= cy + 1 || r.top <= c.top) continue; main = Math.max(0, r.top - c.bottom); side = gap(c.left, c.right, r.left, r.right); }
      else { if (ry >= cy - 1 || r.bottom >= c.bottom) continue; main = Math.max(0, c.top - r.bottom); side = gap(c.left, c.right, r.left, r.right); }
      var off = (d === 'left' || d === 'right') ? Math.abs(ry - cy) : Math.abs(rx - cx);
      scored.push({ el: o.el, s: main + side * 3 + off * 0.1 });
    }
    return firstUsable(scored);
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
      ring.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;border-radius:8px;border:3px solid;';
      paintRing();
      document.documentElement.appendChild(ring);
    }
    var r = cur.getBoundingClientRect();
    lastX = (r.left + r.right) / 2;
    lastY = (r.top + r.bottom) / 2;
    ring.style.display = 'block';
    ring.style.left = (r.left - 4) + 'px'; ring.style.top = (r.top - 4) + 'px';
    ring.style.width = (r.width + 2) + 'px'; ring.style.height = (r.height + 2) + 'px';
  }
  addEventListener('scroll', function () { invalidate(); if (cur && ring) drawRing(); }, true);
  addEventListener('resize', function () { invalidate(); if (cur && ring) drawRing(); });

  // Keep the ring right when the page changes under it (Tidal swaps pages without reloading):
  // follow the item if it moved, or jump to the nearest item if it's gone.
  function refresh() {
    pending = 0;
    if (!ringOn) return;
    // Stay on the item while it still exists (a tooltip briefly covering it is fine).
    if (cur && document.contains(cur) && rectOf(cur)) { drawRing(); return; }
    cur = null;
    W.nav('', lastX, lastY);
  }
  function schedule() {
    if (ringOn && !pending) pending = setTimeout(refresh, 120);
  }
  var observer = new MutationObserver(function (records) {
    for (var i = 0; i < records.length; i++) {
      if (records[i].target !== ring) { invalidate(); schedule(); return; } // ignore the ring's own redraws
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
        scored.push({ el: list[i].el, s: dx * dx + dy * dy });
      }
      var start = firstUsable(scored);
      if (!start) { cur = null; drawRing(); return ''; }
      select(start);
      return point();
    }
    var next = d ? pick(cur.getBoundingClientRect(), d, list) : null;
    if (d && !retried) {
      // Nothing that way, or the way leads out of an area that can still scroll that way:
      // scroll the area first (so long lists don't jump straight to the player bar), then retry.
      var v = d === 'up' || d === 'down', sc = scroller(cur, v);
      if (canScroll(sc, d) && (!next || !sc.contains(next))) {
        var amt = (v ? sc.clientHeight : sc.clientWidth) * 0.6;
        sc.scrollBy(v ? 0 : (d === 'left' ? -amt : amt), v ? (d === 'up' ? -amt : amt) : 0);
        invalidate(); // the scroll event comes later; positions changed now
        return W.nav(d, 0, 0, true);
      }
    }
    if (next) { select(next); return point(); }
    drawRing();
    return point();
  };
  W.target = point;
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
    if (b && usable(b)) select(b);
  };
  W.ringOff = function () { ringOn = false; cur = null; drawRing(); };
  // Turn the ring on without moving it; it appears as soon as the page has something to ring.
  W.ring = function () { ringOn = true; schedule(); };
  // ---------- Wave's own tab in Tidal's settings ----------
  // A "Wave" tab after General / Account / About (a copy of Tidal's own tab), with a page built
  // like Tidal's settings: fair shuffle, updates from GitHub, and the license. Tidal's own tabs
  // and pages are left as they are; Wave's page is shown in place of the current one while its
  // tab is picked.
  var REPO_URL = 'https://github.com/Trevor792221/Wave';
  var wavePanel = null, wavePath = '', dimmed = [];
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
      '.wv-row+.wv-row::before{content:"";position:absolute;top:0;left:16px;right:16px;height:1px;background:rgba(255,255,255,.06)}' +
      '.wv-txt{display:flex;flex-direction:column;gap:4px;min-width:0}' +
      '.wv-t{font-weight:600;line-height:18px}' +
      '.wv-s{font-size:.857em;font-weight:500;line-height:1.5;color:#afafb6}' +
      '.wv-sw{position:relative;flex:none;width:42px;height:26px;border-radius:32px;border:0;padding:0;background:#303036;cursor:pointer;transition:background .2s}' +
      '.wv-sw::after{content:"";position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#000;transition:transform .2s}' +
      '.wv-sw[aria-checked="true"]{background:#e4e4e7}' +
      '.wv-sw[aria-checked="true"]::after{transform:translateX(16px)}' +
      '.wv-btn{flex:none;border:0;border-radius:7px;padding:7px 12px;background:#18181b;color:#fff;font:inherit;font-size:.857em;font-weight:600;cursor:pointer}' +
      '.wv-btn[disabled]{opacity:.5}';
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
  var ui = {};
  function buildPanel() {
    settingsCss();
    var info = {};
    try { info = JSON.parse(WaveApp.appInfo()); } catch (e) {}
    var p = el('div');
    p.setAttribute('data-test', 'settings-page-wave');

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

    var s2 = section('Updates');
    var ver = row((info.name || 'Wave') + ' ' + (info.version || ''), 'Updates come from Wave\'s releases on GitHub.');
    ui.status = ver.sub;
    ui.check = el('button', 'wv-btn', 'Check now');
    ui.check.type = 'button';
    ui.check.onclick = function () { WaveApp.update(ui.check.getAttribute('data-install') ? 'install' : 'check'); };
    ver.appendChild(ui.check);
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
    if (lastUpdate) W.updateStatus(lastUpdate);
    return p;
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
  function showWave() {
    var page = document.querySelector('[data-test="settings-page"]'), tabs = tabRow();
    if (!page || !tabs) return;
    if (!wavePanel) wavePanel = buildPanel();
    wavePath = location.pathname;
    // Tidal's picked tab looks unpicked, Wave's looks picked (by style only; Tidal's own classes stay).
    var mine = tabs.querySelector('[data-test="settings-tab--wave"]'), lit = null, plain = null, i;
    var all = tabs.querySelectorAll('a[data-test^="settings-tab--"]');
    for (i = 0; i < all.length; i++) {
      if (all[i] === mine) continue;
      if (/_active_/.test(all[i].className)) lit = all[i]; else if (!plain) plain = all[i];
    }
    if (lit && plain && !dimmed.length) { // once: later passes would read the colours already changed
      var litSpan = lit.querySelector('span'), plainSpan = plain.querySelector('span');
      var on = getComputedStyle(lit).borderBottomColor, onText = litSpan && getComputedStyle(litSpan).color;
      var offText = plainSpan && getComputedStyle(plainSpan).color;
      lit.style.borderBottomColor = 'transparent';
      if (litSpan) litSpan.style.color = offText;
      dimmed = [lit, litSpan];
      mine.style.borderBottomColor = on;
      if (mine.querySelector('span')) mine.querySelector('span').style.color = onText;
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
  function hideWave() {
    if (!wavePanel) return;
    if (wavePanel.parentNode) wavePanel.parentNode.removeChild(wavePanel);
    wavePanel = null;
    ui = {};
    dimmed.forEach(function (e) { if (e) { e.style.borderBottomColor = ''; e.style.color = ''; } });
    dimmed = [];
    var mine = document.querySelector('[data-test="settings-tab--wave"]');
    if (mine) {
      mine.style.borderBottomColor = '';
      if (mine.querySelector('span')) mine.querySelector('span').style.color = '';
    }
    var hidden = document.querySelectorAll('[data-wave-hidden]');
    for (var i = 0; i < hidden.length; i++) { hidden[i].style.display = ''; hidden[i].removeAttribute('data-wave-hidden'); }
  }
  function settingsTick() {
    var tabs = tabRow();
    if (!tabs) { if (wavePanel) hideWave(); return; }
    if (!tabs.querySelector('[data-test="settings-tab--wave"]')) {
      var about = tabs.querySelector('[data-test="settings-tab--about"]'), tab = about.cloneNode(true);
      tab.setAttribute('data-test', 'settings-tab--wave');
      tab.removeAttribute('href');
      tab.setAttribute('role', 'link');
      tab.style.cursor = 'pointer';
      tab.style.textDecoration = 'none'; // Tidal's tabs have no text underline (a link without href gets one)
      tab.style.outline = 'none';
      stripActive(tab);
      var sp = tab.querySelector('span');
      if (sp) { stripActive(sp); sp.textContent = 'Wave'; sp.style.textDecoration = 'none'; } else tab.textContent = 'Wave';
      tabs.appendChild(tab);
    }
    if (wavePanel) {
      if (location.pathname !== wavePath) hideWave(); // Back, or a link: Tidal's page again
      else showWave(); // Tidal redrew its page: keep Wave's showing
    }
  }
  setInterval(settingsTick, 500);
  addEventListener('click', function (e) {
    var t = e.target && e.target.closest && e.target.closest('[data-test^="settings-tab--"]');
    if (!t) return;
    if (t.getAttribute('data-test') === 'settings-tab--wave') {
      e.preventDefault();
      e.stopPropagation();
      showWave();
    } else if (wavePanel) {
      hideWave(); // one of Tidal's tabs: its page comes back
    }
  }, true);

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

  W.ready = true;
})();
