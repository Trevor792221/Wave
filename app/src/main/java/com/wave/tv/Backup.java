package com.wave.tv;

import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Iterator;
import java.util.Map;
import java.util.Set;

/**
 * Wave's settings in one file (Wave Mobile, the Updates tab): export, import, and an automatic
 * backup to a file picked once with Android's file picker. That can be on the phone or on any
 * cloud drive that shows up in the picker (Google Drive, Proton Drive...). The backup overwrites
 * that one file daily, weekly or monthly. Wave's own settings and stats go in, plus the page's
 * settings (Soft pause, fades, fair shuffle, quality per network). Not the Tidal sign-in.
 */
final class Backup {
    static final int REQ_EXPORT = 71, REQ_IMPORT = 72, REQ_PICK = 73;
    private static final int JOB = 7301;
    /** Not settings: the backup's own setup, and things only this install should keep. */
    private static final Set<String> SKIP = new java.util.HashSet<>(java.util.Arrays.asList("backupUri", "backupEvery", "backupAt", "backupError",
            "backupName", "updateCheckedOn", "permissionsExplained", "pageSettings", "single", "singleDnd", "singleVol"));

    private Backup() {
    }

    static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences("wave", Context.MODE_PRIVATE);
    }

    /** Everything as one JSON text. */
    static String snapshot(Context c) throws Exception {
        SharedPreferences p = prefs(c);
        JSONObject o = new JSONObject(), app = new JSONObject();
        for (Map.Entry<String, ?> e : p.getAll().entrySet()) {
            if (SKIP.contains(e.getKey())) continue;
            Object v = e.getValue();
            String t = v instanceof Boolean ? "b" : v instanceof Integer ? "i" : v instanceof Long ? "l"
                    : v instanceof Float ? "f" : v instanceof String ? "s" : null;
            if (t != null) app.put(e.getKey(), new JSONObject().put("t", t).put("v", v));
        }
        o.put("wave", "settings").put("format", 1).put("app", c.getPackageName())
                .put("version", BuildConfig.VERSION_NAME).put("saved", System.currentTimeMillis())
                .put("settings", app);
        try {
            o.put("page", new JSONObject(p.getString("pageSettings", "{}")));
        } catch (Exception ignored) {
            o.put("page", new JSONObject());
        }
        return o.toString(2);
    }

    /** A backup's settings put back. Returns the page's part (for its storage), or throws. */
    static JSONObject restore(Context c, String text) throws Exception {
        JSONObject o = new JSONObject(text);
        if (!"settings".equals(o.optString("wave"))) throw new IllegalArgumentException("not a Wave settings file");
        JSONObject app = o.optJSONObject("settings");
        SharedPreferences.Editor e = prefs(c).edit();
        if (app != null) {
            for (Iterator<String> k = app.keys(); k.hasNext(); ) {
                String key = k.next();
                if (SKIP.contains(key)) continue;
                JSONObject v = app.optJSONObject(key);
                if (v == null) continue;
                switch (v.optString("t")) {
                    case "b": e.putBoolean(key, v.optBoolean("v")); break;
                    case "i": e.putInt(key, v.optInt("v")); break;
                    case "l": e.putLong(key, v.optLong("v")); break;
                    case "f": e.putFloat(key, (float) v.optDouble("v")); break;
                    case "s": e.putString(key, v.optString("v")); break;
                    default: break;
                }
            }
        }
        JSONObject page = o.optJSONObject("page");
        if (page == null) page = new JSONObject();
        e.putString("pageSettings", page.toString());
        e.commit();
        return page;
    }

    static void write(Context c, Uri uri) throws Exception {
        byte[] data = snapshot(c).getBytes(StandardCharsets.UTF_8);
        OutputStream out;
        try {
            out = c.getContentResolver().openOutputStream(uri, "wt"); // replace what's there
        } catch (Exception notSupported) {
            out = c.getContentResolver().openOutputStream(uri, "w");
        }
        if (out == null) throw new java.io.IOException("can't write there");
        try (OutputStream o = out) {
            o.write(data);
        }
    }

    static String read(Context c, Uri uri) throws Exception {
        try (InputStream in = c.getContentResolver().openInputStream(uri)) {
            if (in == null) throw new java.io.IOException("can't read it");
            ByteArrayOutputStream b = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            for (int n; (n = in.read(buf)) > 0; ) {
                b.write(buf, 0, n);
                if (b.size() > 2_000_000) throw new java.io.IOException("too big for a settings file");
            }
            return b.toString("UTF-8");
        }
    }

    /** "wave-settings.json on Google Drive" and the like. */
    static String describe(Context c, Uri uri) {
        String name = null;
        try (Cursor q = c.getContentResolver().query(uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (q != null && q.moveToFirst()) name = q.getString(0);
        } catch (Exception ignored) {
            // The provider didn't say.
        }
        String a = String.valueOf(uri.getAuthority()), where;
        if (a.startsWith("com.google.android.apps.docs")) where = "Google Drive";
        else if (a.toLowerCase(java.util.Locale.ROOT).contains("proton")) where = "Proton Drive";
        else if (a.equals("com.android.externalstorage.documents") || a.startsWith("com.android.providers.")) where = "this phone";
        else where = a;
        return (name != null ? name : "the backup file") + " on " + where;
    }

    /** The automatic backup's schedule, from the settings (off: no job). */
    static void schedule(Context c) {
        JobScheduler js = c.getSystemService(JobScheduler.class);
        if (js == null) return;
        SharedPreferences p = prefs(c);
        int days = p.getInt("backupEvery", 0);
        if (days <= 0 || p.getString("backupUri", null) == null) {
            js.cancel(JOB);
            return;
        }
        long every = days * 86_400_000L;
        if (android.os.Build.VERSION.SDK_INT >= 24) {
            JobInfo current = js.getPendingJob(JOB);
            if (current != null && current.getIntervalMillis() == every) return; // already so
        }
        js.schedule(new JobInfo.Builder(JOB, new ComponentName(c, Job.class))
                .setPeriodic(every)
                .setRequiresBatteryNotLow(true)
                .build());
    }

    /** When Wave opens: overdue (the phone restarted, say)? Back up now. */
    static void catchUp(Context c) {
        SharedPreferences p = prefs(c);
        int days = p.getInt("backupEvery", 0);
        if (days > 0 && p.getString("backupUri", null) != null
                && System.currentTimeMillis() - p.getLong("backupAt", 0) > days * 86_400_000L) {
            new Thread(() -> run(c)).start();
        }
        schedule(c);
    }

    /** One backup to the picked file; the result kept for the Updates tab. */
    static boolean run(Context c) {
        SharedPreferences p = prefs(c);
        String u = p.getString("backupUri", null);
        if (u == null) return false;
        try {
            write(c, Uri.parse(u));
            p.edit().putLong("backupAt", System.currentTimeMillis()).remove("backupError").apply();
            return true;
        } catch (Exception e) {
            p.edit().putString("backupError", e instanceof SecurityException
                    ? "Wave can't reach the backup file any more: choose it again." : "The last backup didn't work: " + e.getMessage()).apply();
            return false;
        }
    }

    /** Android runs this on the schedule, also with Wave closed. */
    public static final class Job extends JobService {
        @Override
        public boolean onStartJob(JobParameters params) {
            new Thread(() -> {
                boolean ok = run(getApplicationContext());
                jobFinished(params, !ok); // didn't work: Android tries again later
            }).start();
            return true;
        }

        @Override
        public boolean onStopJob(JobParameters params) {
            return true;
        }
    }
}
