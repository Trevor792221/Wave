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
    private Updater updater;
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
        prefs.edit().remove("textSize").apply(); // the first Text size test build's setting (it cut the page off)
        coverAnalyzer.alpha = prefs.getInt("analyzerOpacity", 30) / 100f; // the Wave tab's settings
        coverAnalyzer.enabled = prefs.getBoolean("analyzerOn", true);
        updater = new Updater(this);
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
        // The page's width follows the screen's (rotating, unfolding) when Text size isn't 100%.
        web.addOnLayoutChangeListener((v, l, t, r, b, ol, ot, or, ob) -> {
            if (!BuildConfig.TV && r - l != or - ol && prefs.getInt("pageScale", 100) != 100) applyViewport();
        });
        handler.post(this::autoCheckForUpdates); // once everything is set up
        if (!BuildConfig.TV) keepClearOfSystemBars();

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        // Tidal's page as designed on every phone: Android otherwise enlarges a page's text with the
        // phone's font size setting, and Tidal's fixed-height song rows then run into each other.
        s.setTextZoom(100);
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
                v.evaluateJavascript("window.__wave&&__wave.enableTapToPlay()", null); // TV and phone
                if (!BuildConfig.TV) {
                    v.evaluateJavascript("window.__wave&&(__wave.phoneMode(),__wave.enableSwipes())", null);
                    tellNetwork();
                }
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
            // Phones: the page at the phone's own width (Tidal's layout adapts), scaled by the Wave
            // tab's Text size: a narrower page drawn to fill the screen makes everything bigger
            // together (text, rows, buttons), so nothing runs into anything else.
            // The zoom is fixed at exactly that size (minimum = maximum), so the page always fills the
            // screen's width: the WebView only fits a page to the screen by itself when it loads.
            int pct = Math.min(prefs.getInt("pageScale", 100), maxPageScale());
            String content;
            if (pct == 100) {
                content = "width=device-width,initial-scale=1,minimum-scale=1,maximum-scale=1";
            } else {
                float dp = (web.getWidth() > 0 ? web.getWidth() : getResources().getDisplayMetrics().widthPixels) / density;
                String sc = String.format(java.util.Locale.US, "%.2f", pct / 100f);
                content = "width=" + Math.round(dp * 100f / pct) + ",initial-scale=" + sc + ",minimum-scale=" + sc
                        + ",maximum-scale=" + sc + ",user-scalable=no";
            }
            web.evaluateJavascript("(function(c){var m=document.querySelector('meta[name=viewport]');"
                    + "if(!m){m=document.createElement('meta');m.name='viewport';document.head.appendChild(m);}"
                    + "m.content=c;})('" + content + "')", null);
            // A page that still doesn't fill the screen's width goes back to 100% (and says so).
            if (pct != 100) web.evaluateJavascript("window.__wave&&__wave.checkFit&&__wave.checkFit()", null);
            return;
        }
        int w = VIEWPORT_WIDTHS[widthIndex];
        web.evaluateJavascript(
                "(function(w){var m=document.querySelector('meta[name=viewport]');"
                        + "if(!m){m=document.createElement('meta');m.name='viewport';document.head.appendChild(m);}"
                        + "m.content='width='+w;})(" + w + ")", null);
    }

    /**
     * Tidal's phone layout needs the page at least MIN_PAGE_WIDTH CSS px wide: narrower, its fixed
     * player bar and tabs run off the screen. So Text size goes only as high as this screen allows
     * (the size picked is kept: a wider screen, unfolded or in landscape, gets more of it).
     */
    private static final int MIN_PAGE_WIDTH = 360;

    private int maxPageScale() {
        float dp = (web.getWidth() > 0 ? web.getWidth() : getResources().getDisplayMetrics().widthPixels) / density;
        return Math.max(100, (int) Math.floor(dp * 100f / MIN_PAGE_WIDTH));
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
        // The full-screen player isn't a page of its own: back closes it first (the page says
        // whether it did). Then Tidal's previous page; on the first page, Wave Mobile goes to the
        // background so the music keeps playing (the TV app closes, as before).
        web.evaluateJavascript("!!(window.__wave&&__wave.back&&__wave.back())", v -> {
            if ("true".equals(v)) return;
            if (web.canGoBack()) web.goBack();
            else if (!BuildConfig.TV) moveTaskToBack(true);
            else finish();
        });
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
        watchNetwork();
    }

    // ---------- Wi-Fi, mobile data or satellite (Wave Mobile) ----------
    // The page picks Tidal's audio quality for the network in use ("wifi" or "cell"; "sat" is
    // mobile data with adaptive streaming forced on); anything else (Wi-Fi, Ethernet...) counts as Wi-Fi.
    private static final int TRANSPORT_SATELLITE = 10; // NetworkCapabilities, Android 15
    private static final int NOT_BANDWIDTH_CONSTRAINED = 37; // NetworkCapabilities, Android 16
    private String network = "wifi";
    private android.net.ConnectivityManager.NetworkCallback networkCallback;

    private void watchNetwork() {
        if (BuildConfig.TV || Build.VERSION.SDK_INT < 24) return;
        android.net.ConnectivityManager cm = getSystemService(android.net.ConnectivityManager.class);
        if (cm == null) return;
        networkCallback = new android.net.ConnectivityManager.NetworkCallback() {
            @Override
            public void onCapabilitiesChanged(android.net.Network n, android.net.NetworkCapabilities caps) {
                // Satellite: its own transport, or (Android 16) a bandwidth-constrained network.
                boolean sat = caps.hasTransport(TRANSPORT_SATELLITE)
                        || (Build.VERSION.SDK_INT >= 36 && !caps.hasCapability(NOT_BANDWIDTH_CONSTRAINED));
                String now = sat ? "sat" : caps.hasTransport(android.net.NetworkCapabilities.TRANSPORT_CELLULAR)
                        && !caps.hasTransport(android.net.NetworkCapabilities.TRANSPORT_WIFI) ? "cell" : "wifi";
                handler.post(() -> {
                    if (now.equals(network)) return;
                    network = now;
                    tellNetwork();
                });
            }
        };
        try {
            cm.registerDefaultNetworkCallback(networkCallback, handler);
        } catch (RuntimeException e) {
            networkCallback = null;
        }
    }

    private void tellNetwork() {
        if (web != null) web.evaluateJavascript("window.__wave&&__wave.setNetwork('" + network + "')", null);
    }

    // ---------- Bluetooth output (for the meters' BT note) ----------
    // On Bluetooth the phone sends the sound at full level and the speaker sets the volume
    // (absolute volume), so the meters don't follow the phone's volume there: they say "BT".
    private long btCheckedAt;
    private boolean btOut;

    @SuppressWarnings("deprecation")
    private boolean bluetoothOut() {
        long now = android.os.SystemClock.uptimeMillis();
        if (now - btCheckedAt < 1000) return btOut;
        btCheckedAt = now;
        boolean bt = false;
        try {
            android.media.AudioManager am = getSystemService(android.media.AudioManager.class);
            if (am != null && Build.VERSION.SDK_INT >= 33) {
                android.media.AudioAttributes media = new android.media.AudioAttributes.Builder()
                        .setUsage(android.media.AudioAttributes.USAGE_MEDIA).build();
                for (android.media.AudioDeviceInfo d : am.getAudioDevicesForAttributes(media)) {
                    int t = d.getType();
                    if (t == android.media.AudioDeviceInfo.TYPE_BLUETOOTH_A2DP || t == 26 || t == 27 || t == 30) bt = true; // A2DP, LE Audio headset, speaker, broadcast
                }
            } else if (am != null) {
                bt = am.isBluetoothA2dpOn();
            }
        } catch (RuntimeException ignored) {
            // Unknown: no note.
        }
        btOut = bt;
        return bt;
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

    /**
     * Wave Mobile shows the status bar and navigation buttons; the page sits between them (and
     * above the keyboard). Android 15 draws apps under the bars unless they make room themselves.
     */
    @SuppressWarnings("deprecation")
    private void keepClearOfSystemBars() {
        root.setBackgroundColor(0xFF000000); // behind the bars
        root.setOnApplyWindowInsetsListener((v, in) -> {
            int l, t, r, b;
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets bars = in.getInsets(android.view.WindowInsets.Type.systemBars()
                        | android.view.WindowInsets.Type.displayCutout());
                android.graphics.Insets ime = in.getInsets(android.view.WindowInsets.Type.ime());
                // With gesture navigation only the thin handle is there: the page goes under it
                // (it's see-through). Room is made only for real navigation buttons.
                android.graphics.Insets buttons = in.getInsets(android.view.WindowInsets.Type.tappableElement());
                l = bars.left; t = bars.top; r = bars.right; b = Math.max(buttons.bottom, ime.bottom);
            } else {
                l = in.getSystemWindowInsetLeft(); t = in.getSystemWindowInsetTop();
                r = in.getSystemWindowInsetRight(); b = in.getSystemWindowInsetBottom();
                if (Build.VERSION.SDK_INT >= 29 && in.getTappableElementInsets().bottom == 0
                        && in.getStableInsetBottom() >= b) b = 0; // gestures, keyboard closed
            }
            v.setPadding(l, t, r, b);
            // Room is made here, so the page isn't told about the bars too: otherwise Tidal adds
            // its own empty strip of the same height at the top (over its player's top row).
            return Build.VERSION.SDK_INT >= 30 ? android.view.WindowInsets.CONSUMED : in.consumeSystemWindowInsets();
        });
        if (Build.VERSION.SDK_INT < 35) getWindow().getDecorView().setSystemUiVisibility(
                android.view.View.SYSTEM_UI_FLAG_LAYOUT_STABLE | android.view.View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | android.view.View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
        if (Build.VERSION.SDK_INT >= 21) {
            getWindow().setStatusBarColor(0xFF000000);
            getWindow().setNavigationBarColor(0); // see-through: the page or the black room for buttons shows
            if (Build.VERSION.SDK_INT >= 29) getWindow().setNavigationBarContrastEnforced(false);
        }
    }

    /** Runs a player command inside the page (works in the background too). */
    // ---------- Sleep timer (Wave tab) ----------
    private volatile long sleepAt; // uptimeMillis when it pauses, 0: off
    private final Runnable sleepNow = () -> {
        sleepAt = 0;
        command("pause"); // soft pause fades it out when that's on
    };

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
        public void state(boolean nowPlaying, String t, String a, String art, double durMs, double posMs, String q, boolean fav, String tier) {
            handler.post(() -> {
                qualityTier = tier == null ? "" : tier;
                setQuality(q == null ? "" : q);
                WaveSession.setFavorite(fav);
                onPageState(nowPlaying, t == null ? "" : t, a == null ? "" : a, art == null ? "" : art,
                        Math.max(0, (long) durMs), Math.max(0, (long) posMs));
            });
        }

        /** Where the cover analyzer goes while Tidal's full-screen player is open, or "off". */
        @JavascriptInterface
        public void spectrum(String spot) {
            handler.post(() -> {
                coverAnalyzer.spot = spot == null ? "off" : spot;
                coverAnalyzer.update();
                placeQuality();
            });
        }

        // ---- Wave's settings tab ----
        /** {"name","version","auto"} for the settings tab. */
        @JavascriptInterface
        public String appInfo() {
            try {
                return new org.json.JSONObject().put("name", Updater.appName()).put("version", BuildConfig.VERSION_NAME + (BuildConfig.TEST_BUILD > 0 ? " (" + Updater.testName(BuildConfig.TEST_BUILD) + ")" : ""))
                        .put("auto", prefs.getBoolean("autoUpdate", !BuildConfig.BETA))
                        .put("crashAuto", prefs.getBoolean("crashAuto", false))
                        .put("analyzerOpacity", prefs.getInt("analyzerOpacity", 30))
                        .put("analyzerOn", prefs.getBoolean("analyzerOn", true))
                        .put("labelsOn", prefs.getBoolean("labelsOn", true))
                        .put("vuOn", prefs.getBoolean("vuOn", true))
                        .put("vuOpacity", prefs.getInt("vuOpacity", 60))
                        .put("vuMatch", prefs.getBoolean("vuMatch", false))
                        .put("vuStyle", prefs.getInt("vuStyle", 0))
                        .put("miniMeters", prefs.getBoolean("miniMeters", false))
                        .put("vizAdaptive", prefs.getBoolean("vizAdaptive", true))
                        .put("qualitySize", prefs.getInt("qualitySize", 14))
                        .put("anaAdaptive", prefs.getBoolean("anaAdaptive", true))
                        .put("vizColor", String.format("#%06X", prefs.getInt("vizColor", 0x33C3F0) & 0xFFFFFF))
                        .put("textSize", prefs.getInt("pageScale", 100))
                        .put("textSizeMax", maxPageScale())
                        .put("phone", !BuildConfig.TV)
                        .put("beta", BuildConfig.BETA)
                        .put("crashRelay", CrashReports.available()).toString();
            } catch (org.json.JSONException e) {
                return "{}";
            }
        }

        /** Wave Beta only: crashes on purpose (and opens again), to try the crash reports. */
        @JavascriptInterface
        public void testCrash() {
            if (!BuildConfig.BETA) return;
            restartAfterCrash = true;
            handler.postDelayed(() -> {
                throw new IllegalStateException("Test crash from the developer options (Wave Beta)");
            }, 300);
        }

        /** Opacity of the analyzer over the cover, in percent (the Wave tab's slider). */
        @JavascriptInterface
        public void setAnalyzerOpacity(int pct) {
            int v = Math.max(0, Math.min(100, pct));
            prefs.edit().putInt("analyzerOpacity", v).apply();
            handler.post(() -> {
                coverAnalyzer.alpha = v / 100f;
                if (coverAnalyzer.view != null) coverAnalyzer.view.setBarAlpha(v / 100f);
            });
        }

        // ---- Analyzers and meters drawn by the page ----
        /** The latest sound measurement for the page's analyzers and meters (see SpectrumView.frame). */
        @JavascriptInterface
        public String levels(int coverBars, int miniBars) {
            return SpectrumView.frame(Math.max(0, Math.min(64, coverBars)), Math.max(0, Math.min(64, miniBars)))
                    + "|" + (bluetoothOut() ? 1 : 0);
        }

        /** The page is drawing analyzers or meters (true) or not: the capture runs only then. */
        @JavascriptInterface
        public void capture(boolean on) {
            handler.post(() -> {
                captureWanted = on;
                updateCapture();
            });
        }

        /** The Wave tab's player settings: analyzerOn, vuOn, vuMatch (0/1), vuOpacity (percent), vuStyle (0 analog, 1 digital, 2 deck), miniMeters (0/1), vizAdaptive (meters) and anaAdaptive (analyzers) (0/1), vizColor (RGB). */
        @JavascriptInterface
        public void setSetting(String key, int value) {
            SharedPreferences.Editor e = prefs.edit();
            switch (key == null ? "" : key) {
                case "analyzerOn": case "labelsOn": case "vuOn": case "vuMatch": case "miniMeters": case "vizAdaptive": case "anaAdaptive": e.putBoolean(key, value != 0); break;
                case "vuOpacity": e.putInt(key, Math.max(0, Math.min(100, value))); break;
                case "vuStyle": e.putInt(key, value == 1 || value == 2 ? value : 0); break;
                case "vizColor": e.putInt(key, value & 0xFFFFFF); break;
                case "textSize": e.putInt("pageScale", Math.max(80, Math.min(130, value))); break;
                case "qualitySize": e.putInt(key, Math.max(10, Math.min(24, value))); break; // sp (developer options)
                default: return;
            }
            e.apply();
            handler.post(() -> {
                coverAnalyzer.enabled = prefs.getBoolean("analyzerOn", true);
                updateSpectrum();
                if ("textSize".equals(key)) applyViewport();
                if ("qualitySize".equals(key) && qualityView != null) {
                    qualityView.setTextSize(android.util.TypedValue.COMPLEX_UNIT_SP, prefs.getInt("qualitySize", 14));
                    placeQuality();
                }
            });
        }

        /** Sleep timer: pause after this many minutes (0: off). Kept by the app, not the page,
         *  whose timers stop while Wave is in the background. */
        @JavascriptInterface
        public void setSleepTimer(int minutes) {
            handler.post(() -> {
                handler.removeCallbacks(sleepNow);
                sleepAt = 0;
                if (minutes > 0) {
                    sleepAt = android.os.SystemClock.uptimeMillis() + Math.min(minutes, 24 * 60) * 60000L;
                    handler.postAtTime(sleepNow, sleepAt);
                }
            });
        }

        /** Milliseconds until the sleep timer pauses (0: off). */
        @JavascriptInterface
        public long sleepLeft() {
            long at = sleepAt;
            return at == 0 ? 0 : Math.max(0, at - android.os.SystemClock.uptimeMillis());
        }

        @JavascriptInterface
        public void setCrashAuto(boolean on) {
            prefs.edit().putBoolean("crashAuto", on).apply();
        }

        @JavascriptInterface
        public void setAutoUpdate(boolean on) {
            prefs.edit().putBoolean("autoUpdate", on).apply();
        }

        /** "check" looks for a newer release; "install" installs the one found. Answers via __wave.updateStatus. */
        @JavascriptInterface
        public void update(String what) {
            handler.post(() -> {
                Updater.Listener l = MainActivity.this::showUpdateStatus;
                if ("install".equals(what)) updater.install(l); else updater.check(l);
            });
        }

        /** Opens Wave's GitHub page (source code, license) in the browser. */
        @JavascriptInterface
        public void openLink(String url) {
            if (url == null || !url.startsWith("https://github.com/" + Updater.REPO)) return;
            handler.post(() -> {
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
                } catch (RuntimeException e) {
                    Toast.makeText(MainActivity.this, url, Toast.LENGTH_LONG).show();
                }
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
        updateCapture();
    }

    // ---------- The sound capture for the page's analyzers and meters ----------
    /** The page draws the analyzers and meters; the app measures the sound while it wants it. */
    private boolean captureWanted;
    private final Object captureUser = new Object();

    private void updateCapture() {
        if (captureWanted && visible && micAllowed()) SpectrumView.acquire(this, captureUser);
        else SpectrumView.release(captureUser);
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
    // ---------- Updates ----------
    private void showUpdateStatus(String state, String text) {
        if (web == null) return;
        try {
            String json = new org.json.JSONObject().put("state", state).put("text", text).toString();
            web.evaluateJavascript("window.__wave&&__wave.updateStatus(" + json + ")", null);
        } catch (org.json.JSONException ignored) {
            // Never happens with plain strings.
        }
    }

    /** Once a day, the first time Wave opens: look for an update and offer it. */
    private void autoCheckForUpdates() {
        if (!prefs.getBoolean("autoUpdate", !BuildConfig.BETA)) return; // off by default in Wave Beta
        String today = new java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US).format(new java.util.Date());
        if (today.equals(prefs.getString("updateCheckedOn", ""))) return;
        prefs.edit().putString("updateCheckedOn", today).apply();
        updater.check((state, text) -> {
            showUpdateStatus(state, text);
            if (!"available".equals(state) || isFinishing()) return;
            new android.app.AlertDialog.Builder(this)
                    .setTitle(text)
                    .setMessage("Install it now? Android will ask to confirm.")
                    .setPositiveButton("Install", (d, w) -> updater.install(this::showUpdateStatus))
                    .setNegativeButton("Later", null)
                    .show();
        });
    }

    // ---------- Stream quality ----------
    // Under the cover in the full-screen player (below the analyzer's frequencies), and in the
    // notification: what Tidal is actually streaming.
    private android.widget.TextView qualityView;
    /** Tidal's quality code for what's streaming (LOW, HIGH, LOSSLESS, HI_RES_LOSSLESS). */
    private String qualityTier = "", shownTier = null;

    /** The quality's colour, as in Tidal's settings: Low white, High teal, Max gold (0 = none). */
    private static int tierColor(String tier) {
        switch (tier) {
            case "HI_RES_LOSSLESS": case "HI_RES": return 0xFFFFD432;
            case "LOSSLESS": return 0xFF5CF2DC;
            case "HIGH": case "LOW": return 0xFFFFFFFF;
            default: return 0;
        }
    }

    /** A faint elliptical glow of a colour, fading out to the edges of the view. */
    private static final class Glow extends android.graphics.drawable.Drawable {
        private final android.graphics.Paint paint = new android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG);
        private final int color;

        Glow(int color) {
            this.color = color;
        }

        @Override
        public void draw(android.graphics.Canvas c) {
            android.graphics.Rect b = getBounds();
            if (b.isEmpty()) return;
            android.graphics.RadialGradient g = new android.graphics.RadialGradient(0, 0, 1,
                    new int[]{(0x38 << 24) | (color & 0xFFFFFF), (0x14 << 24) | (color & 0xFFFFFF), color & 0xFFFFFF},
                    new float[]{0f, 0.55f, 1f}, android.graphics.Shader.TileMode.CLAMP);
            android.graphics.Matrix m = new android.graphics.Matrix();
            m.setScale(b.width() / 2f, b.height() / 2f);
            m.postTranslate(b.exactCenterX(), b.exactCenterY());
            g.setLocalMatrix(m);
            paint.setShader(g);
            c.drawRect(b, paint);
        }

        @Override public void setAlpha(int a) { }
        @Override public void setColorFilter(android.graphics.ColorFilter f) { }
        @Override public int getOpacity() { return android.graphics.PixelFormat.TRANSLUCENT; }
    }

    private void setQuality(String q) {
        if (q.equals(WaveSession.quality()) && qualityTier.equals(shownTier)) return;
        WaveSession.setQuality(q);
        placeQuality();
        if (serviceOn) PlaybackService.refresh(this);
    }

    private void placeQuality() {
        String q = WaveSession.quality();
        String[] p = coverAnalyzer.spot.split("\\|", 2)[0].split(",");
        // Not when the cover's bottom is hidden (by the player bar in landscape): no room under it.
        if (!visible || q.isEmpty() || p.length < 5 || (p.length > 6 && "1".equals(p[6]))) {
            if (qualityView != null) qualityView.setVisibility(View.GONE);
            return;
        }
        if (qualityView == null) {
            qualityView = new android.widget.TextView(this);
            qualityView.setTextColor(0xB3FFFFFF);
            qualityView.setTextSize(android.util.TypedValue.COMPLEX_UNIT_SP, prefs.getInt("qualitySize", 14));
            int ph = Math.round(28 * density), pv = Math.round(8 * density);
            qualityView.setPadding(ph, pv, ph, pv); // room for the glow around the text
            qualityView.setGravity(android.view.Gravity.CENTER);
            qualityView.setSingleLine(true);
            root.addView(qualityView, 1);
        }
        try {
            float scale = web.getWidth() / Float.parseFloat(p[4]);
            int l = Math.round(Float.parseFloat(p[0]) * scale), w = Math.round(Float.parseFloat(p[2]) * scale);
            int bottom = Math.round((Float.parseFloat(p[1]) + Float.parseFloat(p[3])) * scale);
            // Below the frequency labels (12sp + a little) whether or not the analyzer is showing.
            int labels = Math.round(10 * getResources().getDisplayMetrics().scaledDensity + 4 * density);
            // As wide as the text (plus the glow's room), centred under the cover.
            qualityView.setText(q);
            qualityView.measure(View.MeasureSpec.makeMeasureSpec(w, View.MeasureSpec.AT_MOST), View.MeasureSpec.UNSPECIFIED);
            int qw = qualityView.getMeasuredWidth();
            FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(qw, -2);
            lp.leftMargin = l + (w - qw) / 2;
            lp.topMargin = bottom + labels; // the padding keeps the text where it was
            qualityView.setLayoutParams(lp);
        } catch (NumberFormatException e) {
            return;
        }
        if (!qualityTier.equals(shownTier)) {
            shownTier = qualityTier;
            int c = tierColor(qualityTier);
            qualityView.setBackground(c == 0 ? null : new Glow(c));
        }
        qualityView.setVisibility(View.VISIBLE);
    }

    private final class Analyzer {
        final int bars;
        final boolean labels, onlyWhilePlaying;
        float alpha;
        /** Switched on in the Wave tab (the analyzer over the cover can be switched off). */
        boolean enabled = true;
        /** Asked to hide: fades out after a moment (unless it's wanted again by then). */
        boolean hiding;
        /** "l,t,w,h,viewportWidth|coverUrl" in CSS px, or "off". */
        String spot = "off";
        String coverUrl = "";
        SpectrumView view;
        private static final long PAUSED_STOP_MS = 3000;
        private final Runnable hideSoon = () -> {
            if (!hiding || view == null) return;
            SpectrumView v = view;
            v.animate().cancel();
            v.animate().alpha(0f).setDuration(300).withEndAction(() -> {
                if (hiding && view == v) hideNow();
            }).start();
        };
        /** Paused for a while: the bars have faded with the sound by now, so stop measuring. */
        private boolean stopPending;
        private final Runnable stopWhenPaused = () -> {
            stopPending = false;
            if (!playing && view != null && view.getVisibility() == View.VISIBLE) hideNow();
        };

        void hideNow() {
            hiding = false;
            if (view == null) return;
            view.animate().cancel();
            view.setAlpha(1f);
            view.stop();
            view.setVisibility(View.GONE);
        }

        Analyzer(int bars, boolean labels, float alpha, boolean onlyWhilePlaying) {
            this.bars = bars;
            this.labels = labels;
            this.alpha = alpha;
            this.onlyWhilePlaying = onlyWhilePlaying;
        }

        void update() {
            String[] parts = spot.split("\\|", 3);
            String[] p = parts[0].split(",");
            // What's seen is the sound: the bars fade in with it and out with silence (SpectrumView).
            // Paused, the analyzer just goes quiet and fades with the sound; it's stopped a few
            // seconds later, once it has faded. Anything else that hides it (the full-screen player,
            // a menu, Tidal redrawing its bar) has to last a moment before it fades out, so a quick
            // redraw doesn't make it blink.
            if (onlyWhilePlaying && playing) {
                handler.removeCallbacks(stopWhenPaused);
                stopPending = false;
            } else if (onlyWhilePlaying && !stopPending && view != null && view.getVisibility() == View.VISIBLE) {
                stopPending = true; // once per pause, not pushed back by every update
                handler.postDelayed(stopWhenPaused, PAUSED_STOP_MS);
            }
            // The page draws the analyzers now; here only the cover's colour is worked out (for
            // the page's bars and needles and the highlight ring).
            if (p.length >= 5) colorFromCover(parts.length > 1 ? parts[1] : "");
            if (p.length >= 0) return;
            boolean show = enabled && visible && p.length >= 5 && micAllowed() && (playing || !onlyWhilePlaying
                    || (view != null && view.getVisibility() == View.VISIBLE));
            if (!show) {
                if (view == null || view.getVisibility() != View.VISIBLE) return;
                if (!visible || !micAllowed() || !enabled) { // left the screen or switched off: no fade
                    handler.removeCallbacks(hideSoon);
                    hideNow();
                    return;
                }
                if (!hiding) {
                    hiding = true;
                    handler.postDelayed(hideSoon, 300);
                }
                return;
            }
            if (hiding) { // wanted again: still showing (or fading back from a short fade)
                hiding = false;
                handler.removeCallbacks(hideSoon);
                if (view != null) {
                    view.animate().cancel();
                    view.animate().alpha(1f).setDuration(200).start();
                }
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

        /** The cover's colour: the page's bars and needles, and the highlight ring. */
        private void coverColor(int c) {
            setRingColor(c);
            web.evaluateJavascript(String.format(java.util.Locale.US,
                    "window.__wave&&__wave.setVizColor&&__wave.setVizColor('%s','#%06X')",
                    this == coverAnalyzer ? "cover" : "mini", c & 0xFFFFFF), null);
        }

        /** Downloads a small copy of the cover and gives the bars its strongest colour. */
        private void colorFromCover(String url) {
            if (url.equals(coverUrl)) return;
            coverUrl = url;
            if (!url.startsWith("https://")) {
                coverColor(SpectrumView.DEFAULT_COLOR);
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
                    if (url.equals(coverUrl)) coverColor(color);
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
    /** A test crash (Wave Beta's developer options): Wave opens again right after it. */
    private static volatile boolean restartAfterCrash;

    private void installCrashLog() {
        if (!crashLogInstalled) {
            crashLogInstalled = true;
            Thread.UncaughtExceptionHandler previous = Thread.getDefaultUncaughtExceptionHandler();
            android.content.Context app = getApplicationContext();
            Thread.setDefaultUncaughtExceptionHandler((thread, e) -> {
                java.io.StringWriter sw = new java.io.StringWriter();
                e.printStackTrace(new java.io.PrintWriter(sw));
                writeCrashLog(app, "Crash on thread " + thread.getName() + ":\n" + sw);
                if (restartAfterCrash) {
                    // Open Wave again (it's still on screen, so Android allows it), then end this process.
                    try {
                        app.startActivity(new Intent(app, MainActivity.class)
                                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK));
                    } catch (RuntimeException ignored) {
                        // Opened by hand then.
                    }
                    android.os.Process.killProcess(android.os.Process.myPid());
                    System.exit(10);
                }
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
        String report = text;
        // Sent to Wave's issues by itself (Wave tab switch): the file stays until the relay has it,
        // so a failed send is tried again next time.
        if (CrashReports.available() && getSharedPreferences("wave", MODE_PRIVATE).getBoolean("crashAuto", false)) {
            CrashReports.send(report, ok -> runOnUiThread(() -> {
                if (!ok) return;
                f.delete();
                Toast.makeText(this, "Wave stopped last time: the crash report was sent", Toast.LENGTH_SHORT).show();
            }));
            return;
        }
        f.delete();
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

    /**
     * Rotating, unfolding or folding: Wave keeps running (the music doesn't stop); the page just
     * resizes. Once it has, the analyzers, meters and quality line are placed again.
     */
    @Override
    public void onConfigurationChanged(android.content.res.Configuration c) {
        super.onConfigurationChanged(c);
        handler.postDelayed(() -> web.evaluateJavascript("window.__wave&&__wave.spot&&__wave.spot()", null), 400);
        handler.postDelayed(() -> web.evaluateJavascript("window.__wave&&__wave.spot&&__wave.spot()", null), 1200);
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
        web.evaluateJavascript("window.__wave&&__wave.saveResume&&__wave.saveResume()", null); // the song's position
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
        updater.release();
        stopPlaybackService();
        WaveSession.detach(this);
        if (carReceiver != null) unregisterReceiver(carReceiver);
        if (networkCallback != null) {
            try {
                getSystemService(android.net.ConnectivityManager.class).unregisterNetworkCallback(networkCallback);
            } catch (RuntimeException ignored) {
                // Already gone.
            }
        }
        // The analyzers share one capture across activities: let it go with this one.
        if (coverAnalyzer.view != null) coverAnalyzer.view.stop();
        SpectrumView.release(captureUser);
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
