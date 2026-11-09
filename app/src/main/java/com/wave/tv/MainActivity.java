package com.wave.tv;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.media.MediaMetadata;
import android.os.Build;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.graphics.Bitmap;
import android.widget.FrameLayout;
import android.widget.Toast;

/**
 * Wave: a minimal TV browser for Tidal's web player.
 * Lays the web player out at desktop width, grants Widevine (protected media) to tidal.com only,
 * and turns the D-pad into a mouse pointer so the site is usable with a remote.
 */
public final class MainActivity extends Activity {
    private static final String HOME = "https://listen.tidal.com/";
    /** CSS widths the MENU key cycles through: bigger = smaller UI. */
    private static final int[] VIEWPORT_WIDTHS = {1280, 1440, 1600, 1920};
    private static final long CURSOR_HIDE_MS = 4000;
    /** Release the background service this long after playback pauses. */
    private static final long IDLE_STOP_MS = 10 * 60 * 1000;
    private static final long WAKE_MS = 15 * 1000;


    private TvWebView web;
    private CursorView cursor;
    private boolean askedMicPermission;
    /** Over the bottom of the cover in the full-screen player: 30% bars with frequency labels. */
    private final Analyzer coverAnalyzer = new Analyzer(40, true, 0.30f, false);
    /** In the player bar, between the time and the right-hand buttons: solid, while playing. */
    private final Analyzer barAnalyzer = new Analyzer(32, false, 1f, true);
    private FrameLayout root;
    private SharedPreferences prefs;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable hideCursor = () -> cursor.setVisibility(View.INVISIBLE);
    private float cx, cy, density;
    private long touchDownTime;
    private int widthIndex;
    /** Highlight mode: the D-pad moves a ring between clickable items. Otherwise it moves a pointer. */
    private boolean ringMode;
    private boolean menuLongPress, okDownSent, okUpPending;
    private String bridgeJs;
    private boolean playing, serviceOn, visible;
    private String title = "", artist = "";
    private final Runnable stopService = this::stopPlaybackService;
    /** Until when (elapsedRealtime) the page stays awake after a button press. */
    private long wakeUntil;
    private final Runnable applyWake = this::applyWake;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        installCrashLog();
        // A TV shouldn't dim while Wave is up; a phone keeps its normal screen timeout.
        if (BuildConfig.TV) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        prefs = getSharedPreferences("wave", MODE_PRIVATE);
        widthIndex = prefs.getInt("width", 1);
        ringMode = prefs.getBoolean("ring", BuildConfig.TV); // touch phones start without the ring
        density = getResources().getDisplayMetrics().density;

        root = new FrameLayout(this);
        web = new TvWebView(this);
        if (Build.VERSION.SDK_INT >= 26) {
            // Renderer keeps the app's priority even when the WebView isn't on screen.
            web.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false);
        }
        cursor = new CursorView(this);
        root.addView(web, new FrameLayout.LayoutParams(-1, -1));
        root.addView(cursor, new FrameLayout.LayoutParams(-1, -1));
        setContentView(root);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setSupportZoom(false);
        s.setSupportMultipleWindows(false); // window.open / target=_blank load in place
        // Use the WebView's real user agent. A fake desktop UA conflicts with the other signals
        // Android WebView sends, which trips Tidal's bot protection. Desktop layout comes from the
        // viewport width set in applyViewport(), not from the UA.
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true);

        bridgeJs = readRaw(R.raw.bridge);
        web.addJavascriptInterface(new Bridge(), "WaveApp");
        setupMediaSession();

        web.setWebViewClient(new WebViewClient() {
            @Override
            public android.webkit.WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
                String host = r.getUrl().getHost();
                if (host != null && isBlocked(host)) {
                    return new android.webkit.WebResourceResponse("text/plain", "utf-8", 204, "No Content",
                            null, new java.io.ByteArrayInputStream(new byte[0]));
                }
                return null;
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                String scheme = r.getUrl().getScheme();
                // Stay in the WebView for web pages; ignore app-store / intent links.
                return !("https".equals(scheme) || "http".equals(scheme));
            }

            @Override
            public void onPageStarted(WebView v, String url, Bitmap icon) {
                v.evaluateJavascript(bridgeJs, null); // early, to catch Media Session handlers
            }

            @Override
            public boolean onRenderProcessGone(WebView v, android.webkit.RenderProcessGoneDetail d) {
                // The page's process died (often memory). Without this Android closes Wave too;
                // instead note it and start over with a fresh page.
                boolean crashed = Build.VERSION.SDK_INT >= 26 && d.didCrash();
                writeCrashLog("Page process " + (crashed ? "crashed" : "was stopped by Android (low memory?)")
                        + "; Wave reloaded the page.\n");
                ((ViewGroup) v.getParent()).removeView(v);
                v.destroy();
                recreate();
                return true;
            }

            @Override
            public void onPageFinished(WebView v, String url) {
                applyViewport();
                v.evaluateJavascript(bridgeJs, null); // no-op if already installed
                if (ringMode) v.evaluateJavascript("window.__wave&&__wave.ring()", null);
                if (!BuildConfig.TV) v.evaluateJavascript("window.__wave&&__wave.enableSwipes()", null);
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(PermissionRequest req) {
                // Widevine via EME needs PROTECTED_MEDIA_ID. Only Tidal gets it; nothing else is granted.
                Uri origin = req.getOrigin();
                String host = origin == null ? null : origin.getHost();
                boolean tidal = host != null && (host.equals("tidal.com") || host.endsWith(".tidal.com"));
                boolean wantsDrm = false;
                for (String r : req.getResources()) {
                    if (PermissionRequest.RESOURCE_PROTECTED_MEDIA_ID.equals(r)) wantsDrm = true;
                }
                if (tidal && wantsDrm) {
                    req.grant(new String[]{PermissionRequest.RESOURCE_PROTECTED_MEDIA_ID});
                } else {
                    req.deny();
                }
            }

            // No onShowCustomView: the page then can't go full screen (Wave already is), so
            // Tidal's full-screen button, which broke navigation, has nothing to do.
        });

        if (state == null || web.restoreState(state) == null) web.loadUrl(HOME);

        root.post(() -> {
            cx = root.getWidth() / 2f;
            cy = root.getHeight() / 2f;
            cursor.moveTo(cx, cy);
            // The pointer shows once the D-pad is used; on a touch phone that's normally never.
            if (ringMode || !BuildConfig.TV) cursor.setVisibility(View.INVISIBLE);
            else pokeCursor();
        });
    }

    /**
     * Requests not needed on a TV, answered empty without going out: Datadog usage tracking and
     * the cookie-consent banner. (Tidal's own event reporting and its anti-bot check stay.)
     */
    private static boolean isBlocked(String host) {
        return host.equals("browser-intake-datadoghq.com") || host.endsWith(".browser-intake-datadoghq.com")
                || host.equals("cdn.cookielaw.org");
    }

    /** Lay the site out at a desktop width and let the WebView scale it to the TV. */
    private void applyViewport() {
        if (!BuildConfig.TV) {
            // Phones: the page at the phone's own width and normal size (Tidal's layout adapts).
            web.evaluateJavascript("(function(){var m=document.querySelector('meta[name=viewport]');"
                    + "if(!m){m=document.createElement('meta');m.name='viewport';document.head.appendChild(m);}"
                    + "m.content='width=device-width,initial-scale=1';})()", null);
            return;
        }
        int w = VIEWPORT_WIDTHS[widthIndex];
        web.evaluateJavascript(
                "(function(w){var m=document.querySelector('meta[name=viewport]');"
                        + "if(!m){m=document.createElement('meta');m.name='viewport';document.head.appendChild(m);}"
                        + "m.content='width='+w;})(" + w + ")", null);
    }

    // ---------- Remote control -> pointer ----------

    @Override
    public boolean dispatchKeyEvent(KeyEvent e) {
        int code = e.getKeyCode();
        boolean down = e.getAction() == KeyEvent.ACTION_DOWN;
        switch (code) {
            case KeyEvent.KEYCODE_DPAD_UP:
            case KeyEvent.KEYCODE_DPAD_DOWN:
            case KeyEvent.KEYCODE_DPAD_LEFT:
            case KeyEvent.KEYCODE_DPAD_RIGHT:
                if (down) {
                    // Highlight mode: a held direction counts once (auto-repeat is ignored).
                    if (ringMode) {
                        if (e.getRepeatCount() == 0) moveRing(direction(code));
                    } else {
                        movePointer(code, e.getRepeatCount());
                    }
                }
                return true;
            case KeyEvent.KEYCODE_DPAD_CENTER:
            case KeyEvent.KEYCODE_ENTER:
            case KeyEvent.KEYCODE_NUMPAD_ENTER:
                if (ringMode) {
                    ringClick(down, e.getRepeatCount());
                    return true;
                }
                // Down/up map to touch down/up, so holding the button is a long-press.
                if (down && e.getRepeatCount() == 0) {
                    touchDownTime = SystemClock.uptimeMillis();
                    touch(MotionEvent.ACTION_DOWN);
                } else if (!down) {
                    touch(MotionEvent.ACTION_UP);
                }
                pokeCursor();
                return true;
            case KeyEvent.KEYCODE_PAGE_UP:
            case KeyEvent.KEYCODE_CHANNEL_UP:
                if (down) wheel(0, 6);
                return true;
            case KeyEvent.KEYCODE_PAGE_DOWN:
            case KeyEvent.KEYCODE_CHANNEL_DOWN:
                if (down) wheel(0, -6);
                return true;
            case KeyEvent.KEYCODE_MENU:
                // Press: switch highlight/pointer mode. Hold: change page width.
                if (down && e.getRepeatCount() == 1) {
                    menuLongPress = true;
                    cycleViewport();
                } else if (!down) {
                    if (!menuLongPress) toggleMode();
                    menuLongPress = false;
                }
                return true;
            case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE:
            case KeyEvent.KEYCODE_HEADSETHOOK:
                if (down && e.getRepeatCount() == 0) command("toggle");
                return true;
            case KeyEvent.KEYCODE_MEDIA_PLAY:
                if (down && e.getRepeatCount() == 0) command("play");
                return true;
            case KeyEvent.KEYCODE_MEDIA_PAUSE:
            case KeyEvent.KEYCODE_MEDIA_STOP:
                if (down && e.getRepeatCount() == 0) command("pause");
                return true;
            case KeyEvent.KEYCODE_MEDIA_NEXT:
            case KeyEvent.KEYCODE_MEDIA_FAST_FORWARD:
            case KeyEvent.KEYCODE_MEDIA_SKIP_FORWARD:
            case KeyEvent.KEYCODE_MEDIA_STEP_FORWARD:
                if (down && e.getRepeatCount() == 0) command("next");
                return true;
            case KeyEvent.KEYCODE_MEDIA_PREVIOUS:
            case KeyEvent.KEYCODE_MEDIA_REWIND:
            case KeyEvent.KEYCODE_MEDIA_SKIP_BACKWARD:
            case KeyEvent.KEYCODE_MEDIA_STEP_BACKWARD:
                if (down && e.getRepeatCount() == 0) command("prev");
                return true;
            case KeyEvent.KEYCODE_BACK:
                if (!down) goBack();
                return true;
            case KeyEvent.KEYCODE_VOLUME_UP:
            case KeyEvent.KEYCODE_VOLUME_DOWN:
            case KeyEvent.KEYCODE_VOLUME_MUTE:
                return super.dispatchKeyEvent(e);
            default:
                return super.dispatchKeyEvent(e);
        }
    }

    private void goBack() {
        if (web.canGoBack()) {
            web.goBack();
        } else {
            finish();
        }
    }

    private void movePointer(int code, int repeat) {
        // Accelerate while held: 5dp steps up to 40dp.
        float step = Math.min(5 + repeat * 3, 40) * density;
        float dx = 0, dy = 0;
        if (code == KeyEvent.KEYCODE_DPAD_LEFT) dx = -step;
        if (code == KeyEvent.KEYCODE_DPAD_RIGHT) dx = step;
        if (code == KeyEvent.KEYCODE_DPAD_UP) dy = -step;
        if (code == KeyEvent.KEYCODE_DPAD_DOWN) dy = step;

        float maxX = root.getWidth() - 1, maxY = root.getHeight() - 1;
        float nx = cx + dx, ny = cy + dy;
        // Pushing past an edge scrolls whatever is under the pointer instead.
        if (ny < 0 || ny > maxY) wheel(0, ny < 0 ? 1 : -1);
        if (nx < 0 || nx > maxX) wheel(nx < 0 ? -1 : 1, 0);
        cx = Math.max(0, Math.min(maxX, nx));
        cy = Math.max(0, Math.min(maxY, ny));
        cursor.moveTo(cx, cy);
        pokeCursor();
        mouse(MotionEvent.ACTION_HOVER_MOVE, 0, 0);
    }

    // ---------- Highlight ring ----------

    private static String direction(int code) {
        if (code == KeyEvent.KEYCODE_DPAD_UP) return "up";
        if (code == KeyEvent.KEYCODE_DPAD_DOWN) return "down";
        if (code == KeyEvent.KEYCODE_DPAD_LEFT) return "left";
        return "right";
    }

    /** Ask the page to move the ring; it answers with the new item's centre ("x,y,viewportWidth"). */
    private boolean ringBusy;

    private void moveRing(String dir) {
        if (ringBusy) return; // previous move still running in the page: drop this press
        ringBusy = true;
        web.evaluateJavascript("window.__wave?__wave.nav('" + dir + "'," + cssX() + "," + cssY() + "):''",
                res -> {
                    ringBusy = false;
                    onRingPoint(res);
                });
    }

    private float cssScale = 0;

    private float cssX() { return cssScale > 0 ? cx / cssScale : 0; }

    private float cssY() { return cssScale > 0 ? cy / cssScale : 0; }

    /** Parse "x,y,viewportWidth" (CSS px) and put the invisible pointer there. Returns false if empty. */
    private boolean onRingPoint(String json) {
        String v = json == null ? "" : json.replace("\"", "");
        String[] p = v.split(",");
        if (p.length != 3) return false;
        try {
            float x = Float.parseFloat(p[0]), y = Float.parseFloat(p[1]), vw = Float.parseFloat(p[2]);
            if (vw > 0) cssScale = web.getWidth() / vw;
            cx = x * cssScale;
            cy = y * cssScale;
        } catch (NumberFormatException ex) {
            return false;
        }
        cursor.moveTo(cx, cy);
        mouse(MotionEvent.ACTION_HOVER_MOVE, 0, 0); // reveals hover-only buttons (e.g. track row play)
        return true;
    }

    /** OK in highlight mode: real touch down/up on the ringed item (fresh position, in case it moved). */
    private void ringClick(boolean down, int repeat) {
        if (down && repeat == 0) {
            okDownSent = false;
            okUpPending = false;
            web.evaluateJavascript("window.__wave?__wave.target():''", res -> {
                if (!onRingPoint(res)) { // no ring yet: show it instead of clicking
                    okUpPending = false;
                    moveRing("");
                    return;
                }
                touchDownTime = SystemClock.uptimeMillis();
                touch(MotionEvent.ACTION_DOWN);
                okDownSent = true;
                if (okUpPending) {
                    touch(MotionEvent.ACTION_UP);
                    okDownSent = okUpPending = false;
                }
            });
        } else if (!down) {
            if (okDownSent) {
                touch(MotionEvent.ACTION_UP);
                okDownSent = false;
            } else {
                okUpPending = true;
            }
        }
    }

    private void toggleMode() {
        ringMode = !ringMode;
        prefs.edit().putBoolean("ring", ringMode).apply();
        if (ringMode) {
            handler.removeCallbacks(hideCursor);
            cursor.setVisibility(View.INVISIBLE);
            moveRing("");
        } else {
            web.evaluateJavascript("window.__wave&&__wave.ringOff()", null);
            pokeCursor();
        }
        Toast.makeText(this, ringMode ? "Highlight mode" : "Pointer mode", Toast.LENGTH_SHORT).show();
    }

    private void cycleViewport() {
        widthIndex = (widthIndex + 1) % VIEWPORT_WIDTHS.length;
        prefs.edit().putInt("width", widthIndex).apply();
        applyViewport();
        Toast.makeText(this, "Page width " + VIEWPORT_WIDTHS[widthIndex] + "px", Toast.LENGTH_SHORT).show();
    }

    private void pokeCursor() {
        if (ringMode) return; // the pointer stays hidden in highlight mode
        cursor.setVisibility(View.VISIBLE);
        handler.removeCallbacks(hideCursor);
        handler.postDelayed(hideCursor, CURSOR_HIDE_MS);
    }

    private void touch(int action) {
        MotionEvent ev = event(touchDownTime, action, MotionEvent.TOOL_TYPE_FINGER,
                android.view.InputDevice.SOURCE_TOUCHSCREEN, 0, 0);
        web.dispatchTouchEvent(ev);
        ev.recycle();
    }

    private void wheel(float h, float v) {
        pokeCursor();
        mouse(MotionEvent.ACTION_SCROLL, h, v);
    }

    private void mouse(int action, float h, float v) {
        long now = SystemClock.uptimeMillis();
        MotionEvent ev = event(now, action, MotionEvent.TOOL_TYPE_MOUSE,
                android.view.InputDevice.SOURCE_MOUSE, h, v);
        web.dispatchGenericMotionEvent(ev);
        ev.recycle();
    }

    private MotionEvent event(long downTime, int action, int tool, int source, float h, float v) {
        MotionEvent.PointerProperties p = new MotionEvent.PointerProperties();
        p.id = 0;
        p.toolType = tool;
        MotionEvent.PointerCoords c = new MotionEvent.PointerCoords();
        c.x = cx;
        c.y = cy;
        c.pressure = 1;
        c.size = 1;
        c.setAxisValue(MotionEvent.AXIS_HSCROLL, h);
        c.setAxisValue(MotionEvent.AXIS_VSCROLL, v);
        return MotionEvent.obtain(downTime, SystemClock.uptimeMillis(), action, 1,
                new MotionEvent.PointerProperties[]{p}, new MotionEvent.PointerCoords[]{c},
                0, 0, 1, 1, 0, 0, source, 0);
    }

    // ---------- Playback: media session, page bridge, background service ----------

    private void setupMediaSession() {
        WaveSession.get(this);
        WaveSession.attach(this);
        watchCarConnection();
    }

    // ---------- Android Auto (Wave Mobile) ----------
    // Android Auto tells apps it connected the way Google's car library listens for it: a broadcast,
    // then its connection provider says the state (0 = not connected). On connecting, playback
    // carries on by itself.
    private static final String CAR_UPDATED = "androidx.car.app.connection.action.CAR_CONNECTION_UPDATED";
    private android.content.BroadcastReceiver carReceiver;
    private boolean inCar;

    private void watchCarConnection() {
        if (BuildConfig.TV) return;
        carReceiver = new android.content.BroadcastReceiver() {
            @Override
            public void onReceive(android.content.Context c, Intent i) {
                checkCar();
            }
        };
        android.content.IntentFilter f = new android.content.IntentFilter(CAR_UPDATED);
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(carReceiver, f, android.content.Context.RECEIVER_EXPORTED);
        else registerReceiver(carReceiver, f);
        checkCar(); // already in the car when Wave opens
    }

    private void checkCar() {
        new Thread(() -> {
            int state = 0;
            try (android.database.Cursor c = getContentResolver().query(Uri.parse("content://androidx.car.app.connection"),
                    new String[]{"CarConnectionState"}, null, null, null)) {
                if (c != null && c.moveToFirst()) state = c.getInt(0);
            } catch (RuntimeException e) {
                // No Android Auto on this phone.
            }
            boolean now = state != 0;
            handler.post(() -> {
                if (now && !inCar) WaveSession.carConnected();
                inCar = now;
            });
        }).start();
    }

    /** Runs a player command inside the page (works in the background too). */
    void command(String c) {
        // Wake the page fully, as if it were on screen, so Tidal can start the song even after a
        // phone call paused it; it goes back to sleep if nothing plays.
        wakeUntil = android.os.SystemClock.elapsedRealtime() + WAKE_MS;
        applyWake();
        handler.removeCallbacks(applyWake);
        handler.postDelayed(applyWake, WAKE_MS);
        web.onResume();
        web.resumeTimers();
        web.evaluateJavascript("window.__wave&&window.__wave.cmd('" + c + "')", null);
    }

    private String readRaw(int id) {
        try (java.io.InputStream in = getResources().openRawResource(id)) {
            java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
            byte[] buf = new byte[4096];
            for (int n; (n = in.read(buf)) > 0; ) out.write(buf, 0, n);
            return out.toString("UTF-8");
        } catch (java.io.IOException e) {
            throw new IllegalStateException(e);
        }
    }

    /** Called (via the bridge) whenever the page's play state or track changes. */
    private String artUrl = "";

    private long durationMs;

    private void onPageState(boolean nowPlaying, String t, String a, String art, long durMs, long posMs) {
        WaveSession.setPosition(posMs, nowPlaying); // re-published only when it drifts or jumps
        if (nowPlaying == playing && t.equals(title) && a.equals(artist) && art.equals(artUrl) && durMs == durationMs) return;
        boolean trackChanged = !t.equals(title) || !a.equals(artist) || !art.equals(artUrl) || durMs != durationMs;
        playing = nowPlaying;
        title = t;
        artist = a;
        artUrl = art;
        durationMs = durMs;
        if (trackChanged) publishMetadata(t, a, art);
        publishSessionState();
        barAnalyzer.update(); // runs only while playing

        handler.removeCallbacks(stopService);
        applyWake();
        if (playing) {
            WaveSession.get(this).setActive(true);
            askPhonePermissions();
            if (!serviceOn) startPlaybackService();
            else PlaybackService.refresh(this);
        } else if (serviceOn) {
            PlaybackService.refresh(this);
            handler.postDelayed(stopService, IDLE_STOP_MS);
        }
    }

    /**
     * The page is kept awake, as if on screen, while music plays, for 10 minutes after it pauses
     * (while the notification is up) and for a moment after any button press.
     */
    private boolean awake() {
        return playing || serviceOn || android.os.SystemClock.elapsedRealtime() < wakeUntil;
    }

    private void applyWake() {
        boolean on = awake();
        web.setKeepVisible(on);
        if (!on && !visible) {
            web.onPause();
            web.pauseTimers();
        }
    }

    private void publishSessionState() {
        WaveSession.setPlaying(playing);
    }

    /** Title and artist at once; the cover (for Android Auto and the lock screen) once downloaded. */
    private void publishMetadata(String t, String a, String art) {
        long dur = durationMs;
        MediaMetadata.Builder m = new MediaMetadata.Builder()
                .putString(MediaMetadata.METADATA_KEY_TITLE, t)
                .putString(MediaMetadata.METADATA_KEY_ARTIST, a)
                .putLong(MediaMetadata.METADATA_KEY_DURATION, dur); // the progress bar and times
        WaveSession.setMetadata(m.build());
        if (!art.startsWith("https://")) return;
        new Thread(() -> {
            android.graphics.Bitmap bmp = download(art);
            if (bmp == null) return;
            android.graphics.Bitmap small = android.graphics.Bitmap.createScaledBitmap(bmp, 320, 320 * bmp.getHeight() / Math.max(1, bmp.getWidth()), true);
            handler.post(() -> {
                if (!art.equals(artUrl)) return; // the song changed meanwhile
                WaveSession.setMetadata(new MediaMetadata.Builder()
                        .putString(MediaMetadata.METADATA_KEY_TITLE, t)
                        .putString(MediaMetadata.METADATA_KEY_ARTIST, a)
                        .putLong(MediaMetadata.METADATA_KEY_DURATION, dur)
                        .putBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART, small)
                        .build());
                if (serviceOn) PlaybackService.refresh(this); // the cover arrived
            });
        }).start();
    }

    private void startPlaybackService() {
        Intent i = new Intent(this, PlaybackService.class); // it reads the song from WaveSession
        try {
            if (Build.VERSION.SDK_INT >= 26) startForegroundService(i); else startService(i);
            serviceOn = true;
        } catch (RuntimeException e) {
            // Android 12+ can refuse a background start; playback continues while the app is alive.
        }
    }

    private void stopPlaybackService() {
        if (!serviceOn) return;
        stopService(new Intent(this, PlaybackService.class));
        serviceOn = false;
        applyWake(); // the page sleeps now, unless it's on screen
    }

    /** JS -> Java. Called on a WebView thread, so hop to the main thread. */
    private final class Bridge {
        @JavascriptInterface
        public void state(boolean nowPlaying, String t, String a, String art, double durMs, double posMs) {
            handler.post(() -> onPageState(nowPlaying, t == null ? "" : t, a == null ? "" : a, art == null ? "" : art,
                    Math.max(0, (long) durMs), Math.max(0, (long) posMs)));
        }

        /** Where the cover analyzer goes while Tidal's full-screen player is open, or "off". */
        @JavascriptInterface
        public void spectrum(String spot) {
            handler.post(() -> {
                coverAnalyzer.spot = spot == null ? "off" : spot;
                coverAnalyzer.update();
            });
        }

        /** Where the player-bar analyzer goes, or "off". */
        @JavascriptInterface
        public void miniSpectrum(String spot) {
            handler.post(() -> {
                barAnalyzer.spot = spot == null ? "off" : spot;
                barAnalyzer.update();
            });
        }

        /** Short on-screen message from the page (fair shuffle status). */
        @JavascriptInterface
        public void note(String msg) {
            if (msg != null && visible) handler.post(() -> Toast.makeText(MainActivity.this, msg, Toast.LENGTH_SHORT).show());
        }
    }

    // ---------- Spectrum analyzers ----------

    private void updateSpectrum() {
        coverAnalyzer.update();
        barAnalyzer.update();
    }

    /** The highlight ring takes the analyzers' colour (the cover's strongest). */
    private void setRingColor(int rgb) {
        web.evaluateJavascript(String.format(java.util.Locale.US,
                "window.__wave&&__wave.setRingColor&&__wave.setRingColor('#%06X')", rgb & 0xFFFFFF), null);
    }

    /**
     * Wave Mobile, when music first plays: notifications (Android 13+ asks for them; the media
     * controls live there) and the microphone (the analyzers) in one request, since Android shows
     * one permission prompt at a time.
     */
    private void askPhonePermissions() {
        if (BuildConfig.TV || Build.VERSION.SDK_INT < 23 || askedMicPermission) return;
        java.util.List<String> want = new java.util.ArrayList<>();
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission("android.permission.POST_NOTIFICATIONS") != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            want.add("android.permission.POST_NOTIFICATIONS");
        }
        if (checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            want.add(android.Manifest.permission.RECORD_AUDIO);
        }
        if (want.isEmpty()) return;
        askedMicPermission = true; // this covers the microphone request too
        requestPermissions(want.toArray(new String[0]), 2);
    }

    /** True once the microphone permission (needed by Android's Visualizer) is granted; asks once per launch. */
    private boolean micAllowed() {
        if (Build.VERSION.SDK_INT < 23
                || checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) == android.content.pm.PackageManager.PERMISSION_GRANTED) {
            return true;
        }
        if (!askedMicPermission) {
            askedMicPermission = true;
            requestPermissions(new String[]{android.Manifest.permission.RECORD_AUDIO}, 1);
        }
        return false;
    }

    /** One analyzer on screen: where the page says it goes, and the cover it takes its colour from. */
    private final class Analyzer {
        final int bars;
        final boolean labels, onlyWhilePlaying;
        final float alpha;
        /** "l,t,w,h,viewportWidth|coverUrl" in CSS px, or "off". */
        String spot = "off";
        String coverUrl = "";
        SpectrumView view;

        Analyzer(int bars, boolean labels, float alpha, boolean onlyWhilePlaying) {
            this.bars = bars;
            this.labels = labels;
            this.alpha = alpha;
            this.onlyWhilePlaying = onlyWhilePlaying;
        }

        void update() {
            String[] parts = spot.split("\\|", 2);
            String[] p = parts[0].split(",");
            if (!visible || p.length != 5 || (onlyWhilePlaying && !playing) || !micAllowed()) {
                if (view != null) {
                    view.stop();
                    view.setVisibility(View.GONE);
                }
                return;
            }
            int l, t, w, h;
            try {
                float scale = web.getWidth() / Float.parseFloat(p[4]);
                l = Math.round(Float.parseFloat(p[0]) * scale);
                t = Math.round(Float.parseFloat(p[1]) * scale);
                w = Math.round(Float.parseFloat(p[2]) * scale);
                h = Math.round(Float.parseFloat(p[3]) * scale);
            } catch (NumberFormatException e) {
                return;
            }
            if (view == null) {
                view = new SpectrumView(MainActivity.this, bars, labels, alpha);
                root.addView(view, 1); // over the page, under the pointer
            }
            // Bars in the given box; any label row goes just under it.
            FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(w, h + view.labelHeight());
            lp.leftMargin = l;
            lp.topMargin = t;
            view.setLayoutParams(lp);
            view.setVisibility(View.VISIBLE);
            view.start();
            colorFromCover(parts.length > 1 ? parts[1] : "");
        }

        /** Downloads a small copy of the cover and gives the bars its strongest colour. */
        private void colorFromCover(String url) {
            if (url.equals(coverUrl)) return;
            coverUrl = url;
            if (!url.startsWith("https://")) {
                view.setColor(SpectrumView.DEFAULT_COLOR);
                setRingColor(SpectrumView.DEFAULT_COLOR);
                return;
            }
            // Tidal serves covers in several sizes; 160x160 is plenty for picking a colour.
            String small = url.replaceAll("/\\d+x\\d+\\.(jpg|png|webp)$", "/160x160.$1");
            new Thread(() -> {
                int c = SpectrumView.DEFAULT_COLOR;
                android.graphics.Bitmap bmp = download(small);
                if (bmp == null && !small.equals(url)) bmp = download(url);
                if (bmp != null) c = SpectrumView.strongestColor(bmp);
                int color = c;
                handler.post(() -> {
                    if (url.equals(coverUrl) && view != null) {
                        view.setColor(color);
                        setRingColor(color);
                    }
                });
            }).start();
        }
    }

    private static android.graphics.Bitmap download(String url) {
        java.net.HttpURLConnection con = null;
        try {
            con = (java.net.HttpURLConnection) new java.net.URL(url).openConnection();
            con.setConnectTimeout(5000);
            con.setReadTimeout(5000);
            if (con.getResponseCode() != 200) return null;
            try (java.io.InputStream in = con.getInputStream()) {
                return android.graphics.BitmapFactory.decodeStream(in);
            }
        } catch (java.io.IOException | RuntimeException e) {
            return null;
        } finally {
            if (con != null) con.disconnect();
        }
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] perms, int[] results) {
        super.onRequestPermissionsResult(code, perms, results);
        updateSpectrum();
    }

    // ---------- Crash log ----------
    // A crash's details are kept in a file; next launch offers to share them (then deletes them).

    private static boolean crashLogInstalled;

    private void installCrashLog() {
        if (!crashLogInstalled) {
            crashLogInstalled = true;
            Thread.UncaughtExceptionHandler previous = Thread.getDefaultUncaughtExceptionHandler();
            android.content.Context app = getApplicationContext();
            Thread.setDefaultUncaughtExceptionHandler((thread, e) -> {
                java.io.StringWriter sw = new java.io.StringWriter();
                e.printStackTrace(new java.io.PrintWriter(sw));
                writeCrashLog(app, "Crash on thread " + thread.getName() + ":\n" + sw);
                if (previous != null) previous.uncaughtException(thread, e);
            });
        }
        java.io.File f = new java.io.File(getFilesDir(), "crash.txt");
        if (!f.exists()) return;
        String text;
        try (java.io.InputStream in = new java.io.FileInputStream(f)) {
            byte[] b = new byte[(int) Math.min(f.length(), 64000)];
            int n = in.read(b);
            text = new String(b, 0, Math.max(0, n), "UTF-8");
        } catch (java.io.IOException e) {
            text = "(couldn't read the crash log)";
        }
        f.delete();
        String report = text;
        new android.app.AlertDialog.Builder(this)
                .setTitle("Wave stopped last time")
                .setMessage("Share the details so it can be fixed?")
                .setPositiveButton("Share", (d, w) -> startActivity(Intent.createChooser(
                        new Intent(Intent.ACTION_SEND).setType("text/plain")
                                .putExtra(Intent.EXTRA_SUBJECT, "Wave crash log")
                                .putExtra(Intent.EXTRA_TEXT, report), "Share crash log")))
                .setNegativeButton("Not now", null)
                .show();
    }

    private void writeCrashLog(String text) {
        writeCrashLog(getApplicationContext(), text);
    }

    private static void writeCrashLog(android.content.Context ctx, String text) {
        String head = "Wave " + versionName(ctx) + ", Android " + Build.VERSION.RELEASE + ", " + Build.MANUFACTURER + " " + Build.MODEL
                + ", " + new java.text.SimpleDateFormat("yyyy-MM-dd HH:mm:ss", java.util.Locale.US).format(new java.util.Date()) + "\n";
        try (java.io.FileOutputStream out = new java.io.FileOutputStream(new java.io.File(ctx.getFilesDir(), "crash.txt"), true)) {
            out.write((head + text + "\n").getBytes("UTF-8"));
        } catch (java.io.IOException ignored) {
            // Nothing more to do.
        }
    }

    private static String versionName(android.content.Context ctx) {
        try {
            return ctx.getPackageManager().getPackageInfo(ctx.getPackageName(), 0).versionName;
        } catch (android.content.pm.PackageManager.NameNotFoundException e) {
            return "?";
        }
    }

    // ---------- Lifecycle ----------

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    protected void onResume() {
        super.onResume();
        visible = true;
        updateSpectrum();
        web.onResume();
        web.resumeTimers();
    }

    @Override
    protected void onStop() {
        super.onStop();
        visible = false;
        updateSpectrum(); // stops it: nothing to draw while Wave isn't on screen
        CookieManager.getInstance().flush(); // keep the Tidal login
        // Keep the page running while music plays or was paused only a short while ago (a phone
        // call, a stop at the shop): the car and headphone buttons can then carry on.
        if (!awake()) {
            web.onPause();
            web.pauseTimers();
        }
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        stopPlaybackService();
        WaveSession.detach(this);
        if (carReceiver != null) unregisterReceiver(carReceiver);
        // The analyzers share one capture across activities: let it go with this one.
        if (coverAnalyzer.view != null) coverAnalyzer.view.stop();
        if (barAnalyzer.view != null) barAnalyzer.view.stop();
        // Already removed and destroyed if the page's process died (see onRenderProcessGone).
        if (web.getParent() != null) {
            ((ViewGroup) web.getParent()).removeView(web);
            web.destroy();
        }
        super.onDestroy();
    }

    /**
     * WebView that can keep telling Chromium it's visible while music plays in the background.
     * A hidden WebView page gets throttled/suspended, which starves the stream after the buffer
     * (30-60s) runs out.
     */
    static final class TvWebView extends WebView {
        private boolean keepVisible;

        TvWebView(android.content.Context c) {
            super(c);
        }

        void setKeepVisible(boolean keep) {
            if (keep == keepVisible) return;
            keepVisible = keep;
            onWindowVisibilityChanged(getWindowVisibility());
        }

        @Override
        protected void onWindowVisibilityChanged(int v) {
            super.onWindowVisibilityChanged(keepVisible ? View.VISIBLE : v);
        }

        /**
         * The on-screen keyboard's action key (Search / Go / Done) and Enter just close the
         * keyboard instead of submitting. Next/Previous still move between form fields.
         */
        @Override
        public android.view.inputmethod.InputConnection onCreateInputConnection(
                android.view.inputmethod.EditorInfo info) {
            android.view.inputmethod.InputConnection ic = super.onCreateInputConnection(info);
            if (ic == null) return null;
            return new android.view.inputmethod.InputConnectionWrapper(ic, true) {
                @Override
                public boolean performEditorAction(int action) {
                    if (action == android.view.inputmethod.EditorInfo.IME_ACTION_NEXT
                            || action == android.view.inputmethod.EditorInfo.IME_ACTION_PREVIOUS) {
                        return super.performEditorAction(action);
                    }
                    hideKeyboard();
                    return true;
                }

                @Override
                public boolean sendKeyEvent(KeyEvent e) {
                    int k = e.getKeyCode();
                    if (k == KeyEvent.KEYCODE_ENTER || k == KeyEvent.KEYCODE_NUMPAD_ENTER) {
                        if (e.getAction() == KeyEvent.ACTION_UP) hideKeyboard();
                        return true;
                    }
                    return super.sendKeyEvent(e);
                }
            };
        }

        /** May be called from the keyboard's thread, so hop to the UI thread. */
        private void hideKeyboard() {
            post(() -> {
                android.view.inputmethod.InputMethodManager imm = (android.view.inputmethod.InputMethodManager)
                        getContext().getSystemService(android.content.Context.INPUT_METHOD_SERVICE);
                if (imm != null) imm.hideSoftInputFromWindow(getWindowToken(), 0);
            });
        }
    }
}
