package com.wave.tv;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
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


    private TvWebView web;
    private CursorView cursor;
    private FrameLayout root;
    private View fullscreenView;
    private WebChromeClient.CustomViewCallback fullscreenCallback;
    private SharedPreferences prefs;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable hideCursor = () -> cursor.setVisibility(View.INVISIBLE);
    private float cx, cy, density;
    private long touchDownTime;
    private int widthIndex;
    private String bridgeJs;
    private MediaSession session;
    private boolean playing, serviceOn, visible;
    private String title = "", artist = "";
    private final Runnable stopService = this::stopPlaybackService;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        prefs = getSharedPreferences("wave", MODE_PRIVATE);
        widthIndex = prefs.getInt("width", 1);
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
            public void onPageFinished(WebView v, String url) {
                applyViewport();
                v.evaluateJavascript(bridgeJs, null); // no-op if already installed
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

            @Override
            public void onShowCustomView(View view, CustomViewCallback cb) {
                // Fullscreen video.
                if (fullscreenView != null) { cb.onCustomViewHidden(); return; }
                fullscreenView = view;
                fullscreenCallback = cb;
                root.addView(view, root.indexOfChild(cursor), new FrameLayout.LayoutParams(-1, -1));
            }

            @Override
            public void onHideCustomView() {
                if (fullscreenView == null) return;
                root.removeView(fullscreenView);
                fullscreenView = null;
                fullscreenCallback = null;
            }
        });

        if (state == null || web.restoreState(state) == null) web.loadUrl(HOME);

        root.post(() -> {
            cx = root.getWidth() / 2f;
            cy = root.getHeight() / 2f;
            cursor.moveTo(cx, cy);
            pokeCursor();
        });
    }

    /** Lay the site out at a desktop width and let the WebView scale it to the TV. */
    private void applyViewport() {
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
                if (down) movePointer(code, e.getRepeatCount());
                return true;
            case KeyEvent.KEYCODE_DPAD_CENTER:
            case KeyEvent.KEYCODE_ENTER:
            case KeyEvent.KEYCODE_NUMPAD_ENTER:
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
                if (!down) cycleViewport();
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
        if (fullscreenView != null && fullscreenCallback != null) {
            fullscreenCallback.onCustomViewHidden();
        } else if (web.canGoBack()) {
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

    private void cycleViewport() {
        widthIndex = (widthIndex + 1) % VIEWPORT_WIDTHS.length;
        prefs.edit().putInt("width", widthIndex).apply();
        applyViewport();
        Toast.makeText(this, "Page width " + VIEWPORT_WIDTHS[widthIndex] + "px", Toast.LENGTH_SHORT).show();
    }

    private void pokeCursor() {
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

    @SuppressWarnings("deprecation")
    private void setupMediaSession() {
        session = new MediaSession(this, "Wave");
        session.setFlags(MediaSession.FLAG_HANDLES_MEDIA_BUTTONS | MediaSession.FLAG_HANDLES_TRANSPORT_CONTROLS);
        session.setCallback(new MediaSession.Callback() {
            @Override public void onPlay() { command("play"); }
            @Override public void onPause() { command("pause"); }
            @Override public void onStop() { command("pause"); }
            @Override public void onSkipToNext() { command("next"); }
            @Override public void onSkipToPrevious() { command("prev"); }
        });
        publishSessionState();
    }

    /** Runs a player command inside the page (works in the background too). */
    private void command(String c) {
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
    private void onPageState(boolean nowPlaying, String t, String a) {
        if (nowPlaying == playing && t.equals(title) && a.equals(artist)) return;
        boolean trackChanged = !t.equals(title) || !a.equals(artist);
        playing = nowPlaying;
        title = t;
        artist = a;
        if (trackChanged) {
            session.setMetadata(new MediaMetadata.Builder()
                    .putString(MediaMetadata.METADATA_KEY_TITLE, t)
                    .putString(MediaMetadata.METADATA_KEY_ARTIST, a)
                    .build());
        }
        publishSessionState();

        handler.removeCallbacks(stopService);
        web.setKeepVisible(playing);
        if (playing) {
            session.setActive(true);
            if (!serviceOn) startPlaybackService();
            else PlaybackService.update(this, t, a);
        } else if (serviceOn) {
            PlaybackService.update(this, t, "Paused");
            handler.postDelayed(stopService, IDLE_STOP_MS);
        }
    }

    private void publishSessionState() {
        session.setPlaybackState(new PlaybackState.Builder()
                .setActions(PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE
                        | PlaybackState.ACTION_PLAY_PAUSE | PlaybackState.ACTION_STOP
                        | PlaybackState.ACTION_SKIP_TO_NEXT | PlaybackState.ACTION_SKIP_TO_PREVIOUS)
                .setState(playing ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED,
                        PlaybackState.PLAYBACK_POSITION_UNKNOWN, 1f)
                .build());
    }

    private void startPlaybackService() {
        Intent i = new Intent(this, PlaybackService.class)
                .putExtra(PlaybackService.EXTRA_TITLE, title)
                .putExtra(PlaybackService.EXTRA_TEXT, artist);
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
        web.setKeepVisible(false);
        if (!visible) {
            web.onPause();
            web.pauseTimers();
        }
    }

    /** JS -> Java. Called on a WebView thread, so hop to the main thread. */
    private final class Bridge {
        @JavascriptInterface
        public void state(boolean nowPlaying, String t, String a) {
            handler.post(() -> onPageState(nowPlaying, t == null ? "" : t, a == null ? "" : a));
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
        web.onResume();
        web.resumeTimers();
    }

    @Override
    protected void onStop() {
        super.onStop();
        visible = false;
        CookieManager.getInstance().flush(); // keep the Tidal login
        // Keep the page running while music plays; otherwise let it sleep.
        if (!playing) {
            web.onPause();
            web.pauseTimers();
        }
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        stopPlaybackService();
        session.release();
        ((ViewGroup) web.getParent()).removeView(web);
        web.destroy();
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
    }
}
