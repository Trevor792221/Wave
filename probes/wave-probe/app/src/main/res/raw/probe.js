// Wave Probe: records the names of Tidal's player actions and, on request, a snapshot of the
// page's layout. Keeps only structure: field names, on/off values, short codes, element types,
// short button labels and positions. No song titles, names, ids or other content.
(function () {
  if (window.__probe) return;
  var P = window.__probe = { actions: [], player: [] }, store = null;
  var PLAYER = /^(playQueue|playbackControls|player|activePlayer|remotePlayback|cloudQueue|cloudQueueV2)\/|favou?rite|collection|tidalApi\/(executeMutation|mutations)|^settings\/|quality/i;

  function isStore(v) {
    return v && typeof v === 'object' && typeof v.getState === 'function' &&
      typeof v.dispatch === 'function' && typeof v.subscribe === 'function';
  }
  // The same lookup Wave uses: React's data on a button, up to the root, down to the store.
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
  function attach() {
    if (store) return;
    try { store = findStore(); } catch (e) {}
    if (!store) return;
    var real = store.dispatch;
    store.dispatch = function (a) {
      try {
        if (a && typeof a.type === 'string') {
          P.actions.push(a.type.slice(0, 80));
          if (P.actions.length > 200) P.actions.shift();
          if (PLAYER.test(a.type)) { // player actions in detail: the shape of what they carry, no values
            var rest = {};
            for (var k in a) if (k !== 'type') rest[k] = a[k];
            P.player.push(new Date().toTimeString().slice(0, 8) + '  ' + a.type.slice(0, 80) + '  ' +
              (/FAVORITE|^settings\/|QUALITY/i.test(a.type) ? deep(rest, 0) : shape(rest, 0)));
            if (P.player.length > 60) P.player.shift();
          }
        } else if (typeof a === 'function') {
          P.actions.push('(function ' + (a.name || 'anonymous') + ')');
          // A thunk: note when one comes from a heart press (what it does shows in the actions after it)
          if (Date.now() - heartAt < 1500) {
            P.player.push(new Date().toTimeString().slice(0, 8) + '  (function ' + (a.name || 'anonymous') + ') after the heart: ' + short(String(a), 300));
          }
          if (P.actions.length > 200) P.actions.shift();
        }
      } catch (e) {}
      return real.apply(this, arguments);
    };
  }
  setInterval(attach, 2000);
  // The Low quality's 96 / 320 kbps choice is a list, not a click.
  addEventListener('change', function (e) {
    var t = e.target;
    if (t && t.getAttribute && /^audio-quality/.test(t.getAttribute('data-test') || ''))
      P.player.push(new Date().toTimeString().slice(0, 8) + '  SETTING CHANGED: ' + t.getAttribute('data-test') + ' = ' + String(t.value).slice(0, 30));
  }, true);
  // Heart presses (Add to / Remove from My Collection), to tie the actions to them.
  var heartAt = 0;
  addEventListener('click', function (e) {
    var q = e.target && e.target.closest && e.target.closest('[data-test^="audio-quality"],[data-test^="switch-"]');
    if (q) P.player.push(new Date().toTimeString().slice(0, 8) + '  SETTING PRESSED: ' + q.getAttribute('data-test'));
    var b = e.target && e.target.closest && e.target.closest('[data-test*="favorite"],[aria-label*="Collection"]');
    if (b) { heartAt = Date.now(); P.player.push(new Date().toTimeString().slice(0, 8) + '  HEART PRESSED: ' + (b.getAttribute('data-test') || '') + ' ' + (b.getAttribute('aria-label') || '') + ' checked=' + b.getAttribute('aria-checked')); }
  }, true);

  // Layout of a value: names and types; values only for on/off, numbers and short CODES.
  function shape(v, depth) {
    if (v === null || v === undefined) return String(v);
    var t = typeof v;
    if (t === 'boolean' || t === 'number') return String(v);
    if (t === 'string') return /^[A-Z0-9_]{1,24}$/.test(v) ? '"' + v + '"' : 'str(' + v.length + ')';
    if (t === 'function') return 'fn';
    if (depth >= 3) return Array.isArray(v) ? '[' + v.length + ']' : '{...}';
    if (Array.isArray(v)) return '[' + v.length + (v.length ? ': ' + shape(v[0], depth + 1) : '') + ']';
    var ks = Object.keys(v);
    return '{' + ks.slice(0, 50).map(function (k) { return k + ': ' + shape(v[k], depth + 1); }).join(', ') +
      (ks.length > 50 ? ', ...' : '') + '}';
  }
  // The heart's command in full depth: field names, numbers, on/off, and the values of a few
  // type-like fields (from, type, itemType, moduleId...); other text only as its length.
  var KEEP = /^(from|type|itemType|contentType|moduleId|source|sourceType|action|kind)$/;
  function deep(v, depth, key) {
    if (v === null || v === undefined) return String(v);
    var t = typeof v;
    if (t === 'boolean' || t === 'number') return String(v);
    if (t === 'string') return KEEP.test(key || '') || /^[A-Z0-9_]{1,24}$/.test(v) ? '"' + v.slice(0, 30) + '"' : 'str(' + v.length + ')';
    if (t === 'function') return 'fn';
    if (depth >= 6) return Array.isArray(v) ? '[' + v.length + ']' : '{...}';
    if (Array.isArray(v)) return '[' + v.length + (v.length ? ': ' + deep(v[0], depth + 1, key) : '') + ']';
    var ks = Object.keys(v);
    return '{' + ks.slice(0, 40).map(function (k) { return k + ': ' + deep(v[k], depth + 1, k); }).join(', ') + (ks.length > 40 ? ', ...' : '') + '}';
  }
  function short(s, n) { s = (s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n) + '...' : s; }

  // ---- How a page is built (for drawing Wave's own settings tab like Tidal's) ----
  // Tags, data-test, roles, classes, sizes and a few style values; text only for short labels.
  var STYLE = ['display', 'flexDirection', 'alignItems', 'justifyContent', 'gap', 'padding', 'margin',
    'backgroundColor', 'color', 'borderRadius', 'borderBottom', 'fontSize', 'fontWeight', 'lineHeight', 'fontFamily'];
  function desc(el, withStyle) {
    var r = el.getBoundingClientRect(), own = '';
    for (var c = el.firstChild; c; c = c.nextSibling) if (c.nodeType === 3) own += c.nodeValue;
    own = short(own, 30);
    var s = [el.tagName.toLowerCase()];
    ['data-test', 'role', 'aria-selected', 'aria-checked', 'aria-controls', 'aria-labelledby', 'id', 'type', 'href'].forEach(function (a) {
      var v = el.getAttribute(a); if (v !== null) s.push(a + '=' + short(a === 'href' ? v.replace(/[0-9a-f-]{8,}|\d{3,}/gi, ':id') : v, 40));
    });
    if (typeof el.className === 'string' && el.className) s.push('.' + short(el.className, 70));
    s.push('@' + [r.left, r.top, r.width, r.height].map(Math.round).join(','));
    if (own) s.push('"' + own + '"');
    if (withStyle) {
      var cs = getComputedStyle(el), st = [];
      STYLE.forEach(function (k) { var v = cs[k]; if (v && v !== 'normal' && v !== 'none' && v !== '0px' && v !== 'rgba(0, 0, 0, 0)') st.push(k + ':' + short(v, 40)); });
      s.push('{' + st.join('; ') + '}');
    }
    return s.join(' ');
  }
  function tree(el, depth, max, out, pre) {
    out.push(pre + desc(el, true));
    if (depth >= max) { if (el.children.length) out.push(pre + '  (' + el.children.length + ' children)'); return; }
    for (var i = 0; i < el.children.length && i < 12; i++) tree(el.children[i], depth + 1, max, out, pre + '  ');
    if (el.children.length > 12) out.push(pre + '  ...' + (el.children.length - 12) + ' more');
  }
  function byText(t) {
    var all = document.querySelectorAll('body *');
    for (var i = 0; i < all.length; i++) {
      var own = '';
      for (var c = all[i].firstChild; c; c = c.nextSibling) if (c.nodeType === 3) own += c.nodeValue;
      if (own.trim() === t) return all[i];
    }
    return null;
  }
  function structure() {
    var out = ['---- page structure ----'];
    var tab = byText('General') || byText('About');
    if (tab) {
      out.push('tab row (from the "General" tab up):');
      var e = tab, up = [];
      for (var k = 0; k < 6 && e && e !== document.body; k++, e = e.parentElement) up.push(e);
      up.forEach(function (x, i) { out.push('  ^' + i + ' ' + desc(x, true)); });
      out.push('tab row, built:');
      tree(up[Math.min(3, up.length - 1)], 0, 4, out, '  ');
    } else out.push('no "General" tab on this page');
    var head = byText('Audio quality') || byText('Playback');
    if (head) {
      var e2 = head, chain = [];
      for (var k2 = 0; k2 < 8 && e2 && e2 !== document.body; k2++, e2 = e2.parentElement) chain.push(e2);
      out.push('settings content (from "Audio quality" up):');
      chain.forEach(function (x, i) { out.push('  ^' + i + ' ' + desc(x, false)); });
      out.push('settings content, built (from ^3):');
      tree(chain[Math.min(3, chain.length - 1)], 0, 6, out, '  ');
    }
    // The song rows: the first one, how it's built, and the panels it sits in (which is cut off).
    out.push('size: layout ' + document.documentElement.clientWidth + ' px, visible ' + Math.round(window.visualViewport ? visualViewport.width : innerWidth) +
      ' px, zoom ' + (window.visualViewport ? visualViewport.scale.toFixed(2) : '?') + ', scrollWidth ' + document.documentElement.scrollWidth);
    var tr = document.querySelector('[data-test="tracklist-row"]');
    if (tr) {
      out.push('a song row, built:');
      tree(tr, 0, 4, out, '  ');
      out.push('the panels around it:');
      for (var up = tr.parentElement, k4 = 0; up && up !== document.body && k4 < 10; up = up.parentElement, k4++) out.push('  ^' + (k4 + 1) + ' ' + desc(up, true));
    } else out.push('no song rows on this page');
    // Every switch on the page: its markers and the elements around it (its row and card).
    var sws = document.querySelectorAll('[data-test^="switch-"],[role="switch"],input[type="checkbox"]');
    for (var w = 0; w < sws.length && w < 20; w++) {
      out.push('switch ' + (w + 1) + ': ' + desc(sws[w], false));
      var up = sws[w], chain = [];
      for (var k3 = 0; k3 < 5 && up.parentElement; k3++) { up = up.parentElement; chain.push(up); }
      chain.forEach(function (x, i) { out.push('  ^' + (i + 1) + ' ' + desc(x, i >= 1)); });
      out.push('  its row and card, built (from ^3):');
      tree(chain[Math.min(2, chain.length - 1)], 0, 4, out, '    ');
    }
    return out.join('\n');
  }

  P.snapshot = function () {
    attach();
    var out = [];
    out.push('page: ' + location.pathname.replace(/[0-9a-f-]{8,}|\d{3,}/gi, ':id'));
    out.push('viewport: ' + innerWidth + 'x' + innerHeight + ', fullscreenEnabled=' + document.fullscreenEnabled);
    if (store) {
      try {
        var s = store.getState();
        out.push('state keys: ' + Object.keys(s).join(', '));
        ['view', 'playQueue', 'player', 'playbackControls', 'settings', 'ui', 'favorites'].forEach(function (k) {
          if (s[k]) out.push('state.' + k + ': ' + shape(s[k], 0));
        });
      } catch (e) { out.push('state error: ' + e.message); }
      out.push('recent actions: ' + (P.actions.slice(-80).join(' | ') || 'none'));
      out.push('player actions (time, name, what they carry):');
      out.push(P.player.length ? P.player.join('\n') : '  none yet');
    } else {
      out.push('store: not found');
    }
    try { out.push(structure()); } catch (e) { out.push('structure error: ' + e.message); }
    out.push('elements on screen (tag | data-test | aria-label | title | button text | class | x,y,w,h):');
    var els = document.querySelectorAll('button,a,[role="button"],[role="tab"],img,video,canvas,picture,[data-test]');
    var n = 0;
    for (var i = 0; i < els.length && n < 500; i++) {
      var el = els[i], r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth) continue;
      var tag = el.tagName.toLowerCase(), isBtn = tag === 'button' || /button|tab/.test(el.getAttribute('role') || '');
      out.push([tag, el.getAttribute('data-test') || '', short(el.getAttribute('aria-label'), 40), short(el.getAttribute('title'), 40),
        isBtn ? short(el.textContent, 20) : '', short(typeof el.className === 'string' ? el.className : '', 60),
        [r.left, r.top, r.width, r.height].map(Math.round).join(',')].join(' | '));
      n++;
    }
    return out.join('\n');
  };
})();
