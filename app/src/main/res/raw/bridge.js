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
    var e = media(), md = ms && ms.metadata, art = '';
    if (md && md.artwork && md.artwork.length) art = md.artwork[md.artwork.length - 1].src || ''; // biggest last
    WaveApp.state(!!(e && !e.paused && !e.ended), (md && md.title) || '', (md && md.artist) || '', art);
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
  function switchSongs(go) {
    var els = document.querySelectorAll('video,audio'), paused = false;
    for (var i = 0; i < els.length; i++) if (!els[i].paused) { els[i].pause(); paused = true; }
    if (!paused) return false;
    setTimeout(go, 400);
    return true;
  }

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
    if (idx >= n) return;

    var movedOn = prev && prev.src === src && (idx === prev.idx + 1 || (idx === 0 && prev.idx === n - 1));
    var started = now - shuffleStartAt < 3000;
    if (started) shuffleStartAt = 0;
    var picked = now - userPickAt < 1500;
    if (picked) userPickAt = 0; // a pick only counts for the song it started
    if (picked || started) openPlayerWhenPlaying(); // you picked something: show the player
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

  function findButton(c) {
    var bar = barButtons(), i;
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

  W.cmd = function (c) {
    var e = media();
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
