package com.wave.tv;

import android.content.Context;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Handler;
import android.os.Looper;

import java.lang.ref.WeakReference;

/**
 * Wave's one media session, shared by the player screen and (in Wave Mobile) the Android Auto
 * service. Remote buttons, the car and the lock screen all send their commands here; they reach
 * Tidal's page through the player screen when it's running.
 */
final class WaveSession {
    private static MediaSession session;
    private static WeakReference<MainActivity> player = new WeakReference<>(null);
    private static boolean playing;
    private static String title = "", artist = "", quality = "";
    private static android.graphics.Bitmap art;
    /** Where the song was (ms) at a moment (elapsedRealtime); Android moves the progress bar on from there. */
    private static long position = PlaybackState.PLAYBACK_POSITION_UNKNOWN, positionAt;
    private static final Handler handler = new Handler(Looper.getMainLooper());

    private WaveSession() {
    }

    @SuppressWarnings("deprecation")
    static MediaSession get(Context ctx) {
        if (session == null) {
            session = new MediaSession(ctx.getApplicationContext(), "Wave");
            session.setFlags(MediaSession.FLAG_HANDLES_MEDIA_BUTTONS | MediaSession.FLAG_HANDLES_TRANSPORT_CONTROLS);
            session.setCallback(new MediaSession.Callback() {
                @Override public void onPlay() { command("play"); }
                @Override public void onPause() { command("pause"); }
                @Override public void onStop() { command("pause"); }
                @Override public void onSkipToNext() { command("next"); }
                @Override public void onSkipToPrevious() { command("prev"); }
                @Override public void onPlayFromMediaId(String id, android.os.Bundle extras) { command("play"); }
            });
            publish(null);
        }
        return session;
    }

    /** The player screen is up: commands go to its page. */
    static void attach(MainActivity a) {
        player = new WeakReference<>(a);
        // Active while Wave is open, playing or not: Android Auto then shows Wave's controls
        // instead of "Press to open".
        if (session != null) session.setActive(true);
        publish(null);
    }

    static void detach(MainActivity a) {
        if (player.get() == a) player = new WeakReference<>(null);
        playing = false;
        publish(null);
    }

    static void setPlaying(boolean p) {
        playing = p;
        publish(null);
    }

    /** The song's position from the page; re-published only when it's off by more than 2 s (a seek, a new song). */
    static void setPosition(long ms, boolean nowPlaying) {
        long now = android.os.SystemClock.elapsedRealtime();
        long expected = position == PlaybackState.PLAYBACK_POSITION_UNKNOWN ? -10000
                : position + (playing ? now - positionAt : 0);
        position = ms;
        positionAt = now;
        if (Math.abs(expected - ms) > 2000 && nowPlaying == playing) publish(null);
    }

    static boolean isPlaying() {
        return playing;
    }

    static void setMetadata(MediaMetadata m) {
        title = m.getString(MediaMetadata.METADATA_KEY_TITLE);
        artist = m.getString(MediaMetadata.METADATA_KEY_ARTIST);
        art = m.getBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART);
        if (session != null) session.setMetadata(m);
    }

    static String title() { return title == null ? "" : title; }

    /** What Tidal streams ("FLAC · 16-bit / 44.1 kHz · 905 kbps"), or "". */
    static String quality() { return quality; }

    static void setQuality(String q) { quality = q == null ? "" : q; }

    static String artist() { return artist == null ? "" : artist; }

    static android.graphics.Bitmap art() { return art; }

    static MediaSession.Token token() { return session == null ? null : session.getSessionToken(); }

    static void command(String c) {
        MainActivity a = player.get();
        if (a != null) {
            a.command(c);
        } else if (session != null) {
            // Playback is Tidal's web page in the player screen: it has to be open on the phone.
            publish("Open Wave on your phone to start playing");
        }
    }

    /** Android Auto connected: carry on playing (after a moment for the car to settle). */
    static void carConnected() {
        handler.postDelayed(() -> {
            if (!playing && player.get() != null) command("play");
        }, 1500);
    }

    private static void publish(String error) {
        if (session == null) return;
        PlaybackState.Builder b = new PlaybackState.Builder()
                .setActions(PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE
                        | PlaybackState.ACTION_PLAY_PAUSE | PlaybackState.ACTION_STOP
                        | PlaybackState.ACTION_SKIP_TO_NEXT | PlaybackState.ACTION_SKIP_TO_PREVIOUS
                        | PlaybackState.ACTION_PLAY_FROM_MEDIA_ID);
        if (error != null) {
            b.setState(PlaybackState.STATE_ERROR, PlaybackState.PLAYBACK_POSITION_UNKNOWN, 0f).setErrorMessage(error);
        } else {
            long pos = position == PlaybackState.PLAYBACK_POSITION_UNKNOWN ? position
                    : position + (playing ? android.os.SystemClock.elapsedRealtime() - positionAt : 0);
            b.setState(playing ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED, pos, 1f);
        }
        session.setPlaybackState(b.build());
    }
}
