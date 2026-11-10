package com.wave.tv;

import android.os.Build;

import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Sends a crash log to Wave's crash relay (relay/worker.js, a Cloudflare Worker), which files it
 * as an issue on Wave's GitHub repository. Only when "Send crash reports automatically" is on.
 * The relay holds the GitHub token; the app only knows its address.
 */
final class CrashReports {
    /** The relay's address (relay/README.md); empty until it's set up. */
    static final String RELAY_URL = "https://wave-crash.trevorgray022.workers.dev/report";

    private CrashReports() {
    }

    static boolean available() {
        return !RELAY_URL.isEmpty();
    }

    /** Sends the report on a background thread; done gets true when the relay accepted it. */
    static void send(String log, java.util.function.Consumer<Boolean> done) {
        new Thread(() -> {
            boolean ok = false;
            HttpURLConnection con = null;
            try {
                byte[] body = new JSONObject()
                        .put("app", Updater.appName())
                        .put("version", BuildConfig.VERSION_NAME)
                        .put("android", Build.VERSION.RELEASE)
                        .put("device", (Build.MANUFACTURER + " " + Build.MODEL).replaceAll("[^\\w .()+\\-]", "").trim())
                        .put("log", log.length() > 19000 ? log.substring(0, 19000) : log)
                        .toString().getBytes("UTF-8");
                con = (HttpURLConnection) new URL(RELAY_URL).openConnection();
                con.setConnectTimeout(10000);
                con.setReadTimeout(20000);
                con.setRequestMethod("POST");
                con.setDoOutput(true);
                con.setRequestProperty("Content-Type", "application/json");
                try (OutputStream out = con.getOutputStream()) {
                    out.write(body);
                }
                int code = con.getResponseCode();
                ok = code == 200 || code == 201 || code == 400; // 400: the relay won't take it, don't retry forever
            } catch (Exception e) {
                ok = false;
            } finally {
                if (con != null) con.disconnect();
            }
            done.accept(ok);
        }).start();
    }
}
