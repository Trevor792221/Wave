// Wave page bridge. Injected into the Tidal web player.
// - Hooks Media Session handlers so remote buttons can call the player's own actions.
// - Reports play state + track info to the app (WaveApp.state).
// - W.cmd(c) runs play/pause/toggle/next/prev and returns how it did it (useful when debugging).
(function () {
  if (window.__wave) return;
  var W = window.__wave = { h: {} };
  var ms = navigator.mediaSession;
  if (ms && ms.setActionHandler) {
    var orig = ms.setActionHandler.bind(ms);
    ms.setActionHandler = function (a, f) { W.h[a] = f; return orig(a, f); };
  }

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
    if (!window.WaveApp) return;
    var e = media(), md = ms && ms.metadata;
    WaveApp.state(!!(e && !e.paused && !e.ended), (md && md.title) || '', (md && md.artist) || '');
  }
  ['play', 'playing', 'pause', 'ended', 'emptied'].forEach(function (t) {
    document.addEventListener(t, report, true);
  });
  setInterval(report, 5000);

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
})();
