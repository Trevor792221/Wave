package com.wave.tv;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

/**
 * Keeps Wave alive while music plays in the background. It does no work itself: the WebView in
 * MainActivity keeps playing; this just holds a foreground notification and a CPU wake lock.
 */
public final class PlaybackService extends Service {
    private static final String CHANNEL = "playback";
    private static final int ID = 1;

    private PowerManager.WakeLock wakeLock;
    private android.net.wifi.WifiManager.WifiLock wifiLock;

    /** The notification's buttons. */
    private static final String ACTION_PREV = "com.wave.PREV", ACTION_TOGGLE = "com.wave.TOGGLE", ACTION_NEXT = "com.wave.NEXT";
    private boolean foreground;

    @Override
    public int onStartCommand(Intent i, int flags, int startId) {
        String action = i == null ? null : i.getAction();
        if (action != null) { // a button in the notification
            WaveSession.command(ACTION_PREV.equals(action) ? "prev" : ACTION_NEXT.equals(action) ? "next"
                    : WaveSession.isPlaying() ? "pause" : "play");
            if (!foreground) stopSelf(startId);
            return START_NOT_STICKY;
        }
        Notification n = build(this);
        foreground = true;
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        } else {
            startForeground(ID, n);
        }
        if (wakeLock == null) {
            wakeLock = ((PowerManager) getSystemService(POWER_SERVICE))
                    .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "wave:playback");
            wakeLock.acquire();
        }
        if (wifiLock == null) {
            // Keep Wi-Fi awake with the screen off so streaming doesn't stall (no-op on Ethernet).
            android.net.wifi.WifiManager wm =
                    (android.net.wifi.WifiManager) getApplicationContext().getSystemService(WIFI_SERVICE);
            if (wm != null) {
                @SuppressWarnings("deprecation")
                int mode = android.net.wifi.WifiManager.WIFI_MODE_FULL_HIGH_PERF;
                wifiLock = wm.createWifiLock(mode, "wave:playback");
                wifiLock.acquire();
            }
        }
        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        if (wifiLock != null && wifiLock.isHeld()) wifiLock.release();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent i) {
        return null;
    }

    /** Redraw the notification (song, cover, play/pause) without restarting the service. */
    static void refresh(Context ctx) {
        ((NotificationManager) ctx.getSystemService(NOTIFICATION_SERVICE)).notify(ID, build(ctx));
    }

    /**
     * A media notification: the song, artist and cover, with previous, play/pause and next. Tied to
     * Wave's media session, so the lock screen and the quick-settings media panel show it too.
     */
    @SuppressWarnings("deprecation")
    private static Notification build(Context ctx) {
        Notification.Builder b;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationManager nm = (NotificationManager) ctx.getSystemService(NOTIFICATION_SERVICE);
            nm.createNotificationChannel(new NotificationChannel(CHANNEL, "Playback", NotificationManager.IMPORTANCE_LOW));
            b = new Notification.Builder(ctx, CHANNEL);
        } else {
            b = new Notification.Builder(ctx);
        }
        PendingIntent open = PendingIntent.getActivity(ctx, 0,
                new Intent(ctx, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        boolean playing = WaveSession.isPlaying();
        String title = WaveSession.title(), artist = WaveSession.artist();
        b.setSmallIcon(R.drawable.ic_fg)
                .setContentTitle(title.isEmpty() ? "Wave" : title)
                .setContentText(artist)
                .setSubText(WaveSession.quality().isEmpty() ? null : WaveSession.quality())
                .setLargeIcon(WaveSession.art())
                .setContentIntent(open)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setOngoing(playing)
                .setShowWhen(false)
                .addAction(new Notification.Action.Builder(android.R.drawable.ic_media_previous, "Previous", button(ctx, ACTION_PREV, 1)).build())
                .addAction(new Notification.Action.Builder(playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play,
                        playing ? "Pause" : "Play", button(ctx, ACTION_TOGGLE, 2)).build())
                .addAction(new Notification.Action.Builder(android.R.drawable.ic_media_next, "Next", button(ctx, ACTION_NEXT, 3)).build());
        Notification.MediaStyle style = new Notification.MediaStyle().setShowActionsInCompactView(0, 1, 2);
        if (WaveSession.token() != null) style.setMediaSession(WaveSession.token());
        return b.setStyle(style).build();
    }

    private static PendingIntent button(Context ctx, String action, int code) {
        return PendingIntent.getService(ctx, code, new Intent(ctx, PlaybackService.class).setAction(action),
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }
}
