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
    static final String EXTRA_TITLE = "title";
    static final String EXTRA_TEXT = "text";

    private PowerManager.WakeLock wakeLock;
    private android.net.wifi.WifiManager.WifiLock wifiLock;

    @Override
    public int onStartCommand(Intent i, int flags, int startId) {
        Notification n = build(this, i == null ? null : i.getStringExtra(EXTRA_TITLE),
                i == null ? null : i.getStringExtra(EXTRA_TEXT));
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

    /** Refresh the notification text without restarting the service. */
    static void update(Context ctx, String title, String text) {
        ((NotificationManager) ctx.getSystemService(NOTIFICATION_SERVICE)).notify(ID, build(ctx, title, text));
    }

    @SuppressWarnings("deprecation")
    private static Notification build(Context ctx, String title, String text) {
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
        return b.setSmallIcon(R.drawable.ic_fg)
                .setContentTitle(title == null || title.isEmpty() ? "Wave" : title)
                .setContentText(text == null ? "" : text)
                .setContentIntent(open)
                .setOngoing(true)
                .setShowWhen(false)
                .build();
    }
}
