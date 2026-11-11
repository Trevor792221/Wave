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
 * Updates from GitHub: finds the newest release of this app (tags v<version> for Wave for TV,
 * mobile-v<version> for Wave Mobile) and installs its APK with Android's own installer, which
 * asks before installing. Wave Beta updates from the numbered test builds on the test-builds
 * branch instead (beta/<number>-wave[-mobile]-beta-….apk), signed with the same key as it.
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

    /** The test build's number as shown ("test 110"), or the version for releases. */
    static String testName(int n) {
        return "test " + n;
    }

    static String appName() {
        return (BuildConfig.TV ? "Wave" : "Wave Mobile") + (BuildConfig.BETA ? " Beta" : "");
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
                if (BuildConfig.BETA) findTestBuild(); else find();
                if (BuildConfig.BETA && BuildConfig.TEST_BUILD == 0) { // not numbered: can't tell what's newer
                    state = "latest";
                    text = "Test build without a number: install a numbered test build to get updates.";
                } else if (BuildConfig.BETA) {
                    boolean newer = newest != null && Integer.parseInt(newest) > BuildConfig.TEST_BUILD;
                    state = newer ? "available" : "latest";
                    text = newer ? appName() + " " + testName(Integer.parseInt(newest)) + " is available"
                            : "You have the newest test build (" + testName(BuildConfig.TEST_BUILD) + ")";
                } else if (newest != null && compare(newest, BuildConfig.VERSION_NAME) > 0) {
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

    /** Wave Beta: the highest-numbered test build of this app on the test-builds branch. */
    private void findTestBuild() throws Exception {
        String apk = BuildConfig.TV ? "-wave-beta-" : "-wave-mobile-beta-";
        JSONArray files = new JSONArray(get("https://api.github.com/repos/" + REPO + "/contents/beta?ref=test-builds"));
        newest = null;
        newestUrl = null;
        int best = 0;
        for (int i = 0; i < files.length(); i++) {
            JSONObject f = files.getJSONObject(i);
            String name = f.optString("name");
            int dash = name.indexOf('-');
            if (dash < 1 || !name.endsWith(".apk") || !name.startsWith(apk, dash)) continue;
            int n;
            try {
                n = Integer.parseInt(name.substring(0, dash));
            } catch (NumberFormatException e) {
                continue;
            }
            String url = f.optString("download_url");
            if (n > best && url.startsWith("https://")) {
                best = n;
                newest = String.valueOf(n);
                newestUrl = url;
            }
        }
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

    /**
     * Downloads the newest APK, checks it's really Wave (this app's id, signed with this app's
     * key), then hands it to Android's installer, which checks the same again and asks to install
     * it. A download that fails the check is thrown away and tried once more by itself; after a
     * second failure it stops (Check now starts over).
     */
    void install(Listener l) {
        install(l, 1);
    }

    private void install(Listener l, int attempt) {
        if (busy || newestUrl == null) return;
        busy = true;
        String what = appName() + " " + (BuildConfig.BETA ? testName(Integer.parseInt(newest)) : newest);
        l.status("downloading", "Downloading " + what + "…");
        watchResult(l);
        String url = newestUrl;
        new Thread(() -> {
            java.io.File apk = new java.io.File(activity.getCacheDir(), "update.apk");
            PackageInstaller.Session session = null;
            try {
                HttpURLConnection con = open(url);
                try (InputStream in = con.getInputStream(); OutputStream out = new java.io.FileOutputStream(apk)) {
                    byte[] buf = new byte[65536];
                    for (int n; (n = in.read(buf)) > 0; ) out.write(buf, 0, n);
                } finally {
                    con.disconnect();
                }
                if (!isWave(apk)) {
                    apk.delete();
                    main.post(() -> {
                        busy = false;
                        android.widget.Toast.makeText(activity, "Update verification failed", android.widget.Toast.LENGTH_LONG).show();
                        if (attempt < 2) {
                            install(l, attempt + 1); // once more, by itself
                        } else {
                            l.status("error", "Update verification failed twice, so it wasn't installed. Check now tries again.");
                        }
                    });
                    return;
                }
                PackageInstaller pi = activity.getPackageManager().getPackageInstaller();
                PackageInstaller.SessionParams params = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
                params.setAppPackageName(activity.getPackageName());
                int id = pi.createSession(params);
                session = pi.openSession(id);
                try (InputStream in = new java.io.FileInputStream(apk);
                     OutputStream out = session.openWrite("wave.apk", 0, apk.length())) {
                    byte[] buf = new byte[65536];
                    for (int n; (n = in.read(buf)) > 0; ) out.write(buf, 0, n);
                    session.fsync(out);
                }
                apk.delete();
                Intent done = new Intent(ACTION_DONE).setPackage(activity.getPackageName());
                int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0);
                session.commit(PendingIntent.getBroadcast(activity, 0, done, flags).getIntentSender());
                session.close();
                main.post(() -> l.status("installing", "Installing " + what + "…"));
            } catch (Exception e) {
                apk.delete();
                if (session != null) session.abandon();
                main.post(() -> {
                    busy = false;
                    l.status("error", "Couldn't download the update. Check the connection and try again.");
                });
            }
        }).start();
    }

    /** The downloaded APK is this app (same app id) and signed with the same key as this app. */
    @SuppressWarnings("deprecation")
    private boolean isWave(java.io.File apk) {
        try {
            android.content.pm.PackageManager pm = activity.getPackageManager();
            int flag = Build.VERSION.SDK_INT >= 28 ? android.content.pm.PackageManager.GET_SIGNING_CERTIFICATES
                    : android.content.pm.PackageManager.GET_SIGNATURES;
            android.content.pm.PackageInfo theirs = pm.getPackageArchiveInfo(apk.getPath(), flag);
            android.content.pm.PackageInfo mine = pm.getPackageInfo(activity.getPackageName(), flag);
            if (theirs == null || !activity.getPackageName().equals(theirs.packageName)) return false;
            android.content.pm.Signature[] a = signers(theirs), b = signers(mine);
            if (a == null || b == null || a.length == 0) return false;
            return new java.util.HashSet<>(java.util.Arrays.asList(a)).equals(new java.util.HashSet<>(java.util.Arrays.asList(b)));
        } catch (Exception e) {
            return false;
        }
    }

    @SuppressWarnings("deprecation")
    private static android.content.pm.Signature[] signers(android.content.pm.PackageInfo p) {
        if (Build.VERSION.SDK_INT >= 28) {
            if (p.signingInfo == null) return null;
            return p.signingInfo.hasMultipleSigners() ? p.signingInfo.getApkContentsSigners() : p.signingInfo.getSigningCertificateHistory();
        }
        return p.signatures;
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
                    l.status("available", appName() + " " + (BuildConfig.BETA ? testName(Integer.parseInt(newest)) : newest) + " is available");
                } else if (status == PackageInstaller.STATUS_FAILURE_CONFLICT || status == PackageInstaller.STATUS_FAILURE_INCOMPATIBLE) {
                    l.status("error", "This update is signed with a different key than the Wave installed: uninstall it, then install the update from GitHub.");
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
