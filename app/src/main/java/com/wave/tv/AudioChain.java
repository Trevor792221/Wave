package com.wave.tv;

import android.content.Context;
import android.content.pm.PackageManager;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.os.Build;
import android.os.SystemClock;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The audio chain's system side, for the page's signal-path panel: Android's mixer rate, the
 * volume, where the sound goes (and what that device takes). With android.permission.DUMP granted
 * over ADB (adb shell pm grant <app id> android.permission.DUMP), also from Android's own reports
 * (dumpsys): the rate and format the hardware really runs at, the sound effects switched on, and
 * the Bluetooth codec. Those reports differ between makers and versions: read best-effort, anything
 * not understood is left out. Only the audio and Bluetooth reports are read.
 */
final class AudioChain {
    private static volatile JSONObject dumped = new JSONObject();
    private static volatile long dumpedAt;
    private static volatile boolean dumping;

    static boolean dumpAllowed(Context c) {
        return c.checkSelfPermission("android.permission.DUMP") == PackageManager.PERMISSION_GRANTED;
    }

    /** What's known now, as JSON (the dumpsys part from the last read, refreshed in the background). */
    static String info(Context c, String quality) {
        JSONObject o = new JSONObject();
        try {
            AudioManager am = c.getSystemService(AudioManager.class);
            o.put("quality", quality == null ? "" : quality);
            o.put("app", c.getPackageName());
            if (am != null) {
                String rate = am.getProperty(AudioManager.PROPERTY_OUTPUT_SAMPLE_RATE);
                if (rate != null) o.put("mixerRate", Integer.parseInt(rate));
                int v = am.getStreamVolume(AudioManager.STREAM_MUSIC), max = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
                o.put("volPct", max > 0 ? Math.round(v * 100f / max) : 0);
                AudioDeviceInfo d = output(am);
                if (Build.VERSION.SDK_INT >= 28) {
                    try { // the volume curve of the device in use
                        float db = am.getStreamVolumeDb(AudioManager.STREAM_MUSIC, v, d != null ? d.getType() : AudioDeviceInfo.TYPE_BUILTIN_SPEAKER);
                        if (!Float.isNaN(db) && !Float.isInfinite(db)) o.put("volDb", Math.round(db * 10) / 10.0);
                    } catch (RuntimeException ignored) {
                        // No curve for that device.
                    }
                }
                if (d != null) {
                    JSONObject dev = new JSONObject().put("type", typeName(d.getType()))
                            .put("name", String.valueOf(d.getProductName()));
                    JSONArray rates = new JSONArray();
                    for (int r : d.getSampleRates()) rates.put(r);
                    dev.put("rates", rates);
                    o.put("device", dev);
                }
            }
            boolean dump = dumpAllowed(c);
            o.put("dump", dump);
            if (dump) {
                JSONObject dd = dumped;
                for (java.util.Iterator<String> k = dd.keys(); k.hasNext(); ) {
                    String key = k.next();
                    o.put(key, dd.get(key));
                }
                if (!dumping && SystemClock.uptimeMillis() - dumpedAt > 3000) readDumps();
            }
        } catch (Exception ignored) {
            // Whatever was gathered so far.
        }
        return o.toString();
    }

    /** Where media plays now (Android 13+ says it; before, the likeliest connected output). */
    @SuppressWarnings("deprecation")
    private static AudioDeviceInfo output(AudioManager am) {
        if (Build.VERSION.SDK_INT >= 33) {
            android.media.AudioAttributes media = new android.media.AudioAttributes.Builder()
                    .setUsage(android.media.AudioAttributes.USAGE_MEDIA).build();
            java.util.List<AudioDeviceInfo> list = am.getAudioDevicesForAttributes(media);
            if (!list.isEmpty()) return list.get(0);
        }
        AudioDeviceInfo best = null;
        int rank = -1;
        for (AudioDeviceInfo d : am.getDevices(AudioManager.GET_DEVICES_OUTPUTS)) {
            int t = d.getType(), r;
            if (t == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP || t == 26 || t == 27) r = am.isBluetoothA2dpOn() ? 5 : 0;
            else if (t == AudioDeviceInfo.TYPE_USB_DEVICE || t == AudioDeviceInfo.TYPE_USB_HEADSET) r = 4;
            else if (t == AudioDeviceInfo.TYPE_WIRED_HEADPHONES || t == AudioDeviceInfo.TYPE_WIRED_HEADSET) r = 3;
            else if (t == AudioDeviceInfo.TYPE_HDMI || t == AudioDeviceInfo.TYPE_HDMI_ARC || t == 29) r = 2;
            else if (t == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER) r = 1;
            else r = 0;
            if (r > rank) { rank = r; best = d; }
        }
        return best;
    }

    private static String typeName(int t) {
        switch (t) {
            case AudioDeviceInfo.TYPE_BUILTIN_SPEAKER: return "Phone speaker";
            case AudioDeviceInfo.TYPE_BUILTIN_EARPIECE: return "Earpiece";
            case AudioDeviceInfo.TYPE_WIRED_HEADPHONES: return "Wired headphones";
            case AudioDeviceInfo.TYPE_WIRED_HEADSET: return "Wired headset";
            case AudioDeviceInfo.TYPE_BLUETOOTH_A2DP: return "Bluetooth";
            case 26: return "Bluetooth LE Audio";
            case 27: return "Bluetooth LE speaker";
            case 30: return "Bluetooth LE broadcast";
            case AudioDeviceInfo.TYPE_USB_DEVICE: return "USB audio (DAC)";
            case AudioDeviceInfo.TYPE_USB_HEADSET: return "USB headset";
            case AudioDeviceInfo.TYPE_USB_ACCESSORY: return "USB accessory";
            case AudioDeviceInfo.TYPE_HDMI: return "HDMI";
            case AudioDeviceInfo.TYPE_HDMI_ARC: return "HDMI ARC";
            case 29: return "HDMI eARC";
            case AudioDeviceInfo.TYPE_LINE_ANALOG: return "Line out";
            case AudioDeviceInfo.TYPE_LINE_DIGITAL: return "Digital out";
            case AudioDeviceInfo.TYPE_DOCK: return "Dock";
            case AudioDeviceInfo.TYPE_REMOTE_SUBMIX: return "Cast / remote";
            case 23: return "Hearing aid";
            case 24: return "Phone speaker (safe)";
            case 28: return "Echo reference";
            case 31: return "Dock (analog)";
            case 32: return "Multichannel group";
            default: return "Output (type " + t + ")";
        }
    }

    // ---- With DUMP: Android's own reports ----

    private static final Pattern RATE = Pattern.compile("(?i)sample ?rate:? *(\\d{4,6})");
    private static final Pattern FORMAT = Pattern.compile("(?i)HAL format:? *\\S* *\\(?(AUDIO_FORMAT_[A-Z0-9_]+)");
    private static final Pattern EFFECT = Pattern.compile("(?i)^\\s*(?:name|Effect name)\\s*[:=]\\s*(.+?)\\s*$");
    private static final Pattern CODEC = Pattern.compile("(?i)(?:current codec|codec ?type|codecName|mCodecType|codec)\\s*[:=]\\s*(SBC|AAC|LDAC|LC3(?:plus)?|Opus|aptX[ -]?(?:HD|Adaptive|LL|Lossless)?|SSC|LHDC\\w*|Samsung \\w+)", Pattern.MULTILINE);
    private static final Pattern LDAC_RATE = Pattern.compile("(?i)(990|660|330)\\s*kbps|LDAC.*?(?:quality|bitrate)\\D{0,20}(990|660|330|ABR|best effort)");

    private static void readDumps() {
        dumping = true;
        new Thread(() -> {
            JSONObject d = new JSONObject();
            try {
                String af = run("media.audio_flinger");
                if (af != null) {
                    // The first mixer output thread that's active (or the first one there is).
                    String part = section(af);
                    Matcher m = RATE.matcher(part);
                    if (m.find()) d.put("halRate", Integer.parseInt(m.group(1)));
                    m = FORMAT.matcher(part);
                    if (m.find()) d.put("halFormat", m.group(1).replace("AUDIO_FORMAT_", "").replace('_', ' '));
                    Set<String> fx = new LinkedHashSet<>();
                    boolean inChains = false;
                    for (String line : af.split("\n")) {
                        if (line.contains("Effect Chains") || line.contains("Effect chains")) inChains = true;
                        else if (line.matches("\\S.*")) inChains = false; // a new top-level section
                        if (!inChains) continue;
                        Matcher e = EFFECT.matcher(line);
                        if (e.find() && e.group(1).length() < 60) fx.add(e.group(1));
                    }
                    d.put("effects", new JSONArray(fx));
                }
                String bt = run("bluetooth_manager");
                if (bt != null) {
                    Matcher m = CODEC.matcher(bt);
                    if (m.find()) d.put("btCodec", m.group(1));
                    m = LDAC_RATE.matcher(bt);
                    if (m.find()) d.put("btRate", m.group(1) != null ? m.group(1) + " kbps" : m.group(2));
                }
                d.put("dumpOk", af != null);
            } catch (Exception ignored) {
                // Unreadable this time.
            }
            dumped = d;
            dumpedAt = SystemClock.uptimeMillis();
            dumping = false;
        }).start();
    }

    /** The part of the audio report about the first playing mixer output (else the first output). */
    private static String section(String af) {
        String[] parts = af.split("(?=\\n\\s*Output thread )");
        String first = null;
        for (String p : parts) {
            if (!p.contains("Output thread")) continue;
            if (first == null) first = p;
            if (p.matches("(?s).*(\\d+ active tracks?|Active Tracks?:\\s*[1-9]|state: ?active).*")) return p;
        }
        return first == null ? af : first;
    }

    private static String run(String service) {
        Process p = null;
        try {
            p = new ProcessBuilder("dumpsys", service).redirectErrorStream(true).start();
            StringBuilder out = new StringBuilder();
            try (BufferedReader r = new BufferedReader(new InputStreamReader(p.getInputStream()))) {
                String line;
                while ((line = r.readLine()) != null && out.length() < 400_000) out.append(line).append('\n');
            }
            String s = out.toString();
            if (s.contains("Permission Denial") || s.length() < 50) return null;
            return s;
        } catch (Exception e) {
            return null;
        } finally {
            if (p != null) p.destroy();
        }
    }
}
