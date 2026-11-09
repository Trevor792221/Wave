package com.wave.probe;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.KeyEvent;
import android.webkit.CookieManager;
import android.webkit.PermissionRequest;
import android.webkit.ServiceWorkerClient;
import android.webkit.ServiceWorkerController;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.Map;
import java.util.TreeMap;

/**
 * Wave Probe: Tidal's web player the way Wave loads it, recording which hosts and paths the page
 * requests (ids masked; no query strings, headers, cookies or bodies), plus page snapshots on
 * request. Share the log to send it back.
 */
public final class MainActivity extends Activity {
    private static final String HOME = "https://listen.tidal.com/";

    private WebView web;
    private TextView status;
    private String probeJs;
    private final Handler handler = new Handler(Looper.getMainLooper());
    /** "METHOD host/path [kind]" -> count. */
    private final Map<String, Integer> requests = new TreeMap<>();
    private final StringBuilder snapshots = new StringBuilder();
    private int snapshotCount;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        probeJs = readRaw(R.raw.probe);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        web = new WebView(this);
        root.addView(web, new LinearLayout.LayoutParams(-1, 0, 1));

        LinearLayout bar = new LinearLayout(this);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setBackgroundColor(Color.BLACK);
        status = new TextView(this);
        status.setTextColor(Color.WHITE);
        status.setPadding(16, 0, 16, 0);
        bar.addView(status, new LinearLayout.LayoutParams(0, -2, 1));
        bar.addView(button("Snapshot", v -> snapshot()));
        bar.addView(button("Share log", v -> share()));
        bar.addView(button("Clear", v -> {
            synchronized (requests) { requests.clear(); }
            snapshots.setLength(0);
            snapshotCount = 0;
            updateStatus();
        }));
        root.addView(bar, new LinearLayout.LayoutParams(-1, -2));
        setContentView(root);

        // Same as Wave: real WebView user agent, desktop-width page, Widevine for tidal.com.
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setSupportZoom(true);
        s.setBuiltInZoomControls(true);
        s.setDisplayZoomControls(false);
        s.setSupportMultipleWindows(false);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true);

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
                record(r, r.isForMainFrame() ? "page" : "");
                return null; // never changes anything: just notes it
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                String scheme = r.getUrl().getScheme();
                return !("https".equals(scheme) || "http".equals(scheme));
            }

            @Override
            public void onPageFinished(WebView v, String url) {
                v.evaluateJavascript("(function(w){var m=document.querySelector('meta[name=viewport]');"
                        + "if(!m){m=document.createElement('meta');m.name='viewport';document.head.appendChild(m);}"
                        + "m.content='width=device-width,initial-scale=1';})(0)", null); // as Wave Mobile
                v.evaluateJavascript(probeJs, null);
            }
        });
        if (Build.VERSION.SDK_INT >= 24) {
            ServiceWorkerController.getInstance().setServiceWorkerClient(new ServiceWorkerClient() {
                @Override
                public WebResourceResponse shouldInterceptRequest(WebResourceRequest r) {
                    record(r, "service worker");
                    return null;
                }
            });
        }
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(PermissionRequest req) {
                Uri origin = req.getOrigin();
                String host = origin == null ? null : origin.getHost();
                boolean tidal = host != null && (host.equals("tidal.com") || host.endsWith(".tidal.com"));
                if (tidal) req.grant(new String[]{PermissionRequest.RESOURCE_PROTECTED_MEDIA_ID});
                else req.deny();
            }
        });
        web.loadUrl(HOME);
        updateStatus();
    }

    private Button button(String text, android.view.View.OnClickListener l) {
        Button b = new Button(this);
        b.setText(text);
        b.setAllCaps(false);
        b.setOnClickListener(l);
        return b;
    }

    /** Called on WebView threads. */
    private void record(WebResourceRequest r, String kind) {
        Uri u = r.getUrl();
        String scheme = u.getScheme();
        if (!"https".equals(scheme) && !"http".equals(scheme)) return;
        String key = r.getMethod() + " " + u.getHost() + mask(u.getPath()) + (kind.isEmpty() ? "" : "  [" + kind + "]");
        synchronized (requests) {
            Integer n = requests.get(key);
            requests.put(key, n == null ? 1 : n + 1);
        }
        handler.post(this::updateStatus);
    }

    /** Path with anything id-like replaced by ":id"; no query string. */
    private static String mask(String path) {
        if (path == null || path.isEmpty()) return "/";
        StringBuilder b = new StringBuilder();
        for (String part : path.split("/")) {
            if (part.isEmpty()) continue;
            boolean id = part.length() > 40 || part.matches(".*\\d{3,}.*") || part.matches("(?i)[0-9a-f-]{16,}.*");
            b.append('/').append(id ? ":id" : part);
        }
        return b.length() == 0 ? "/" : b.toString();
    }

    private void updateStatus() {
        int n;
        synchronized (requests) { n = requests.size(); }
        status.setText(n + " kinds of request, " + snapshotCount + " snapshots");
    }

    private void snapshot() {
        web.evaluateJavascript("window.__probe?__probe.snapshot():'probe not loaded yet'", res -> {
            String text = unquote(res);
            snapshotCount++;
            snapshots.append("\n===== Snapshot ").append(snapshotCount).append(" (")
                    .append(new SimpleDateFormat("HH:mm:ss", Locale.US).format(new Date())).append(") =====\n")
                    .append(text).append('\n');
            updateStatus();
            Toast.makeText(this, "Snapshot " + snapshotCount + " taken", Toast.LENGTH_SHORT).show();
        });
    }

    /** evaluateJavascript returns a JSON string literal. */
    private static String unquote(String json) {
        if (json == null || json.length() < 2 || json.charAt(0) != '"') return String.valueOf(json);
        try {
            return new org.json.JSONArray("[" + json + "]").getString(0);
        } catch (org.json.JSONException e) {
            return json;
        }
    }

    private void share() {
        StringBuilder b = new StringBuilder("Wave Probe log\n");
        b.append("WebView: ").append(web.getSettings().getUserAgentString()).append('\n');
        b.append("\n===== Requests (method host/path [kind]  x count); ids masked, no queries =====\n");
        StringBuilder tidal = new StringBuilder(), other = new StringBuilder();
        synchronized (requests) {
            for (Map.Entry<String, Integer> e : requests.entrySet()) {
                String host = e.getKey().split(" ")[1].split("/")[0];
                boolean own = host.equals("tidal.com") || host.endsWith(".tidal.com");
                (own ? tidal : other).append(e.getKey()).append("  x").append(e.getValue()).append('\n');
            }
        }
        b.append("\n--- Not tidal.com ---\n").append(other).append("\n--- tidal.com ---\n").append(tidal);
        b.append(snapshots);
        // Shared as a file: a big log doesn't fit in a share message.
        try (java.io.FileOutputStream out = new java.io.FileOutputStream(LogProvider.file(this))) {
            out.write(b.toString().getBytes("UTF-8"));
        } catch (java.io.IOException e) {
            Toast.makeText(this, "Couldn't save the log: " + e.getMessage(), Toast.LENGTH_LONG).show();
            return;
        }
        android.net.Uri uri = android.net.Uri.parse("content://com.wave.probe.log/" + LogProvider.NAME);
        Intent send = new Intent(Intent.ACTION_SEND).setType("text/plain")
                .putExtra(Intent.EXTRA_SUBJECT, "Wave Probe log")
                .putExtra(Intent.EXTRA_STREAM, uri)
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        send.setClipData(android.content.ClipData.newRawUri("Wave Probe log", uri));
        try {
            startActivity(Intent.createChooser(send, "Share log").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION));
        } catch (RuntimeException e) {
            Toast.makeText(this, "Couldn't share: " + e.getMessage(), Toast.LENGTH_LONG).show();
        }
    }

    @Override
    public boolean onKeyDown(int code, KeyEvent e) {
        if (code == KeyEvent.KEYCODE_BACK && web.canGoBack()) {
            web.goBack();
            return true;
        }
        return super.onKeyDown(code, e);
    }

    private String readRaw(int id) {
        try (InputStream in = getResources().openRawResource(id)) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[4096];
            for (int n; (n = in.read(buf)) > 0; ) out.write(buf, 0, n);
            return out.toString("UTF-8");
        } catch (java.io.IOException e) {
            throw new IllegalStateException(e);
        }
    }
}
