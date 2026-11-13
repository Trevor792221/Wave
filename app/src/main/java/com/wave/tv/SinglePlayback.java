package com.wave.tv;

import android.app.NotificationManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.media.AudioDeviceCallback;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Single playback (Wave Mobile, the Wave tab), the phone's side: Do Not Disturb (alarms only, so
 * the music keeps playing) and Android's media volume at max where something after the phone sets
 * the loudness (a USB DAC, line out, wired headphones), but not on Bluetooth or the phone's
 * speaker. What was there before is kept and put back when it's switched off. The page does
 * Tidal's part (quality, crossfade, normalization, full level, stopping at each song's end).
 * Off to start, and not kept: closing Wave (or opening it after it was stopped) switches it off. The
 * analyzers and meters keep running: Android's Visualizer only reads the sound (its output is an
 * exact copy of its input), so it changes nothing.
 */
final class SinglePlayback {
    private static AudioDeviceCallback watcher;
    private static final Handler main = new Handler(Looper.getMainLooper());

    private SinglePlayback() {
    }

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences("wave", Context.MODE_PRIVATE);
    }

    static boolean on(Context c) {
        return !BuildConfig.TV && prefs(c).getBoolean("single", false);
    }

    static void set(Context c, boolean on) {
        prefs(c).edit().putBoolean("single", on).apply();
        if (on) apply(c);
        else restore(c);
    }

    /** On (also when Wave starts with it on): Do Not Disturb and the volume. */
    static void apply(Context c) {
        if (!on(c)) return;
        Context app = c.getApplicationContext();
        dnd(app);
        volume(app);
        if (watcher == null) { // a new output: max or back, by what it is
            AudioManager am = app.getSystemService(AudioManager.class);
            if (am == null) return;
            watcher = new AudioDeviceCallback() {
                @Override public void onAudioDevicesAdded(AudioDeviceInfo[] d) { main.postDelayed(() -> volume(app), 800); }
                @Override public void onAudioDevicesRemoved(AudioDeviceInfo[] d) { main.postDelayed(() -> volume(app), 800); }
            };
            am.registerAudioDeviceCallback(watcher, main);
        }
    }

    static boolean dndAllowed(Context c) {
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        return nm != null && nm.isNotificationPolicyAccessGranted();
    }

    private static void dnd(Context c) {
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm == null || !nm.isNotificationPolicyAccessGranted()) return;
        SharedPreferences p = prefs(c);
        int now = nm.getCurrentInterruptionFilter();
        if (now == NotificationManager.INTERRUPTION_FILTER_ALARMS) return; // already
        if (!p.contains("singleDnd")) p.edit().putInt("singleDnd", now).apply();
        nm.setInterruptionFilter(NotificationManager.INTERRUPTION_FILTER_ALARMS);
    }

    /** Max on outputs whose loudness is set after the phone; the listener's own level elsewhere. */
    private static void volume(Context c) {
        if (!on(c)) return;
        AudioManager am = c.getSystemService(AudioManager.class);
        if (am == null) return;
        SharedPreferences p = prefs(c);
        int max = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC), now = am.getStreamVolume(AudioManager.STREAM_MUSIC);
        if (fullLevelOutput(output(am))) {
            if (!p.contains("singleVol")) p.edit().putInt("singleVol", now).apply();
            if (now != max) {
                try {
                    am.setStreamVolume(AudioManager.STREAM_MUSIC, max, 0);
                } catch (SecurityException ignored) {
                    // Refused (Do Not Disturb rules on some phones).
                }
            }
        } else if (p.contains("singleVol")) { // moved to Bluetooth or the speaker: their own level back
            setVolume(am, p.getInt("singleVol", now));
            p.edit().remove("singleVol").apply();
        }
    }

    private static void setVolume(AudioManager am, int v) {
        try {
            am.setStreamVolume(AudioManager.STREAM_MUSIC, v, 0);
        } catch (SecurityException ignored) {
            // Refused.
        }
    }

    /** Off: Do Not Disturb and the volume as they were (unless changed by hand meanwhile). */
    static void restore(Context c) {
        Context app = c.getApplicationContext();
        SharedPreferences p = prefs(app);
        NotificationManager nm = app.getSystemService(NotificationManager.class);
        if (p.contains("singleDnd") && nm != null && nm.isNotificationPolicyAccessGranted()
                && nm.getCurrentInterruptionFilter() == NotificationManager.INTERRUPTION_FILTER_ALARMS) {
            nm.setInterruptionFilter(p.getInt("singleDnd", NotificationManager.INTERRUPTION_FILTER_ALL));
        }
        AudioManager am = app.getSystemService(AudioManager.class);
        if (p.contains("singleVol") && am != null
                && am.getStreamVolume(AudioManager.STREAM_MUSIC) == am.getStreamMaxVolume(AudioManager.STREAM_MUSIC)) {
            setVolume(am, p.getInt("singleVol", 0));
        }
        p.edit().remove("singleDnd").remove("singleVol").apply();
        if (watcher != null && am != null) {
            am.unregisterAudioDeviceCallback(watcher);
            watcher = null;
        }
    }

    @SuppressWarnings("deprecation")
    static int output(AudioManager am) {
        if (Build.VERSION.SDK_INT >= 33) {
            android.media.AudioAttributes media = new android.media.AudioAttributes.Builder()
                    .setUsage(android.media.AudioAttributes.USAGE_MEDIA).build();
            java.util.List<AudioDeviceInfo> l = am.getAudioDevicesForAttributes(media);
            if (!l.isEmpty()) return l.get(0).getType();
        }
        int best = AudioDeviceInfo.TYPE_BUILTIN_SPEAKER, rank = 0;
        for (AudioDeviceInfo d : am.getDevices(AudioManager.GET_DEVICES_OUTPUTS)) {
            int t = d.getType(), r;
            if (t == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP || t == 26 || t == 27) r = am.isBluetoothA2dpOn() ? 5 : 0;
            else if (t == AudioDeviceInfo.TYPE_USB_DEVICE || t == AudioDeviceInfo.TYPE_USB_HEADSET) r = 4;
            else if (t == AudioDeviceInfo.TYPE_WIRED_HEADPHONES || t == AudioDeviceInfo.TYPE_WIRED_HEADSET || t == AudioDeviceInfo.TYPE_LINE_ANALOG) r = 3;
            else r = 0;
            if (r > rank) { rank = r; best = t; }
        }
        return best;
    }

    /** Not Bluetooth, not the phone itself (speaker, earpiece), not a hearing aid. */
    static boolean fullLevelOutput(int t) {
        switch (t) {
            case AudioDeviceInfo.TYPE_BLUETOOTH_A2DP: case AudioDeviceInfo.TYPE_BLUETOOTH_SCO: case 26: case 27: case 30:
            case AudioDeviceInfo.TYPE_BUILTIN_SPEAKER: case AudioDeviceInfo.TYPE_BUILTIN_EARPIECE: case 23: case 24:
            case AudioDeviceInfo.TYPE_REMOTE_SUBMIX:
                return false;
            default:
                return true;
        }
    }

    /** For the Wave tab: Do Not Disturb, the volume, and Android's sound effects that are on. */
    static String info(Context c) {
        JSONObject o = new JSONObject();
        try {
            AudioManager am = c.getSystemService(AudioManager.class);
            int t = am == null ? AudioDeviceInfo.TYPE_BUILTIN_SPEAKER : output(am);
            o.put("on", on(c)).put("dnd", dndAllowed(c)).put("fullOutput", fullLevelOutput(t));
            JSONObject chain = new JSONObject(AudioChain.info(c, ""));
            o.put("dump", chain.optBoolean("dump"));
            JSONObject dev = chain.optJSONObject("device");
            o.put("output", dev == null ? "" : dev.optString("type"));
            JSONArray fx = chain.optJSONArray("effects");
            o.put("effects", fx == null ? new JSONArray() : fx);
            o.put("iadb", IadbGrant.connected());
        } catch (Exception ignored) {
            // What there is.
        }
        return o.toString();
    }
}
