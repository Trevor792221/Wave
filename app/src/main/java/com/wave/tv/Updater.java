package com.wave.tv;

import android.app.Activity;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageInstaller;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Updates from the GitHub releases: finds the newest release of this app (tags v<version> for
 * Wave for TV, mobile-v<version> for Wave Mobile) and installs its APK with Android's own
 * installer, which asks before installing.
 */
final class Updater {
    static final String REPO = "Trevor792221/Wave";
    private static final String ACTION_DONE = "com.wave.INSTALL_DONE";

    interface Listener {
        /** state: checking, latest, available, downloading, installing, error. */
        void status(String state, String text);
    }

    private final Activity activity;
    private final Handler main = new Handler(Looper.getMainLooper());
    private String newest, newestUrl;
    private boolean busy;

    Updater(Activity a) {
        activity = a;
    }

    static String appName() {
        return BuildConfig.TV ? "Wave" : "Wave Mobile";
    }

    String newest() {
        return newest;
    }

    /** Looks for a newer release (on a background thread); reports on the main thread. */
    void check(Listener l) {
        if (busy) return;
        busy = true;
        l.status("checking", "Checking for updates…");
        new Thread(() -> {
            String state, text;
            try {
                find();
                if (newest != null && compare(newest, BuildConfig.VERSION_NAME) > 0) {
                    state = "available";
                    text = appName() + " " + newest + " is available";
                } else {
                    state = "latest";
                    text = "You have the newest version";
                }
            } catch (Exception e) {
                state = "error";
                text = "Couldn't check for updates. Check the connection and try again.";
            }
            String s = state, t = text;
            main.post(() -> {
                busy = false;
                l.status(s, t);
            });
        }).start();
    }

    private void find() throws Exception {
        String prefix = BuildConfig.TV ? "v" : "mobile-v";
        String apk = BuildConfig.TV ? "wave-" : "wave-mobile-";
        JSONArray releases = new JSONArray(get("https://api.github.com/repos/" + REPO + "/releases?per_page=50"));
        newest = null;
        newestUrl = null;
        for (int i = 0; i < releases.length(); i++) {
            JSONObject r = releases.getJSONObject(i);
            if (r.optBoolean("draft") || r.optBoolean("prerelease")) continue;
            String tag = r.optString("tag_name");
            if (!tag.startsWith(prefix)) continue;
            String v = tag.substring(prefix.length());
            if (!v.matches("\\d+(\\.\\d+)*")) continue;
            if (newest != null && compare(v, newest) <= 0) continue;
            JSONArray assets = r.optJSONArray("assets");
            for (int k = 0; assets != null && k < assets.length(); k++) {
                JSONObject a = assets.getJSONObject(k);
                if ((apk + v + ".apk").equals(a.optString("name"))) {
                    newest = v;
                    newestUrl = a.optString("browser_download_url");
                }
            }
        }
    }

    /** Downloads the newest APK straight into Android's installer, which then asks to install it. */
    void install(Listener l) {
        if (busy || newestUrl == null) return;
        busy = true;
        l.status("downloading", "Downloading " + appName() + " " + newest + "…");
        watchResult(l);
        String url = newestUrl;
        new Thread(() -> {
            PackageInstaller.Session session = null;
            try {
                PackageInstaller pi = activity.getPackageManager().getPackageInstaller();
                PackageInstaller.SessionParams params = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
                params.setAppPackageName(activity.getPackageName());
                int id = pi.createSession(params);
                session = pi.openSession(id);
                HttpURLConnection con = open(url);
                try (InputStream in = con.getInputStream();
                     OutputStream out = session.openWrite("wave.apk", 0, con.getContentLengthLong())) {
                    byte[] buf = new byte[65536];
                    for (int n; (n = in.read(buf)) > 0; ) out.write(buf, 0, n);
                    session.fsync(out);
                } finally {
                    con.disconnect();
                }
                Intent done = new Intent(ACTION_DONE).setPackage(activity.getPackageName());
                int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0);
                session.commit(PendingIntent.getBroadcast(activity, 0, done, flags).getIntentSender());
                session.close();
                main.post(() -> l.status("installing", "Installing " + appName() + " " + newest + "…"));
            } catch (Exception e) {
                if (session != null) session.abandon();
                main.post(() -> {
                    busy = false;
                    l.status("error", "Couldn't download the update. Check the connection and try again.");
                });
            }
        }).start();
    }

    private BroadcastReceiver receiver;

    @SuppressWarnings("deprecation")
    private void watchResult(Listener l) {
        if (receiver != null) return;
        receiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context c, Intent i) {
                int status = i.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
                if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
                    Intent ask = i.getParcelableExtra(Intent.EXTRA_INTENT); // Android's "Install this update?"
                    if (ask != null) activity.startActivity(ask.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
                    return;
                }
                busy = false;
                if (status == PackageInstaller.STATUS_SUCCESS) {
                    l.status("latest", "Updated");
                } else if (status == PackageInstaller.STATUS_FAILURE_ABORTED) {
                    l.status("available", appName() + " " + newest + " is available");
                } else if (status == PackageInstaller.STATUS_FAILURE_CONFLICT || status == PackageInstaller.STATUS_FAILURE_INCOMPATIBLE) {
                    l.status("error", "This Wave is a test build signed with a different key: uninstall it, then install the update from GitHub.");
                } else {
                    l.status("error", "Android didn't install the update (" + status + ").");
                }
            }
        };
        IntentFilter f = new IntentFilter(ACTION_DONE);
        if (Build.VERSION.SDK_INT >= 33) activity.registerReceiver(receiver, f, Context.RECEIVER_NOT_EXPORTED);
        else activity.registerReceiver(receiver, f);
    }

    void release() {
        if (receiver != null) {
            try {
                activity.unregisterReceiver(receiver);
            } catch (RuntimeException ignored) {
                // Already gone.
            }
            receiver = null;
        }
    }

    private static HttpURLConnection open(String url) throws java.io.IOException {
        HttpURLConnection con = (HttpURLConnection) new URL(url).openConnection();
        con.setConnectTimeout(10000);
        con.setReadTimeout(20000);
        con.setRequestProperty("User-Agent", "Wave-app");
        if (url.startsWith("https://api.github.com/")) con.setRequestProperty("Accept", "application/vnd.github+json");
        con.setInstanceFollowRedirects(true); // release downloads redirect to GitHub's file host
        if (con.getResponseCode() != 200) {
            con.disconnect();
            throw new java.io.IOException("HTTP " + con.getResponseCode());
        }
        return con;
    }

    private static String get(String url) throws java.io.IOException {
        HttpURLConnection con = open(url);
        try (InputStream in = con.getInputStream()) {
            java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            for (int n; (n = in.read(buf)) > 0; ) out.write(buf, 0, n);
            return out.toString("UTF-8");
        } finally {
            con.disconnect();
        }
    }

    /** Compares versions like 1.0.10 and 1.0.9 by their numbers. */
    static int compare(String a, String b) {
        String[] x = a.split("\\."), y = b.split("\\.");
        for (int i = 0; i < Math.max(x.length, y.length); i++) {
            long p = i < x.length ? parse(x[i]) : 0, q = i < y.length ? parse(y[i]) : 0;
            if (p != q) return p < q ? -1 : 1;
        }
        return 0;
    }

    private static long parse(String s) {
        try {
            return Long.parseLong(s.replaceAll("\\D.*", ""));
        } catch (NumberFormatException e) {
            return 0;
        }
    }
}
