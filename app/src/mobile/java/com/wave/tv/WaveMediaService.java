package com.wave.tv;

import android.media.MediaDescription;
import android.media.browse.MediaBrowser;
import android.os.Bundle;
import android.service.media.MediaBrowserService;

import java.util.Collections;
import java.util.List;

/**
 * Wave Mobile's door for Android Auto: the car finds Wave as a media app here, shows its playback
 * controls (Wave's shared media session) and one item, "Resume Tidal". When Android Auto connects,
 * playback carries on by itself. Playback itself is Tidal's web page in the player screen, so Wave
 * has to be open on the phone (it can be in the background).
 */
public final class WaveMediaService extends MediaBrowserService {
    private static final String ROOT = "root", RESUME = "resume";
    private static final String ANDROID_AUTO = "com.google.android.projection.gearhead";

    @Override
    public void onCreate() {
        super.onCreate();
        setSessionToken(WaveSession.get(this).getSessionToken());
    }

    @Override
    public BrowserRoot onGetRoot(String clientPackageName, int clientUid, Bundle rootHints) {
        if (ANDROID_AUTO.equals(clientPackageName)) WaveSession.carConnected();
        return new BrowserRoot(ROOT, null);
    }

    @Override
    public void onLoadChildren(String parentId, Result<List<MediaBrowser.MediaItem>> result) {
        if (!ROOT.equals(parentId)) {
            result.sendResult(Collections.emptyList());
            return;
        }
        MediaDescription resume = new MediaDescription.Builder()
                .setMediaId(RESUME)
                .setTitle("Resume Tidal")
                .setSubtitle(WaveSession.isPlaying() ? "Playing" : "Carry on where you left off")
                .build();
        result.sendResult(Collections.singletonList(new MediaBrowser.MediaItem(resume, MediaBrowser.MediaItem.FLAG_PLAYABLE)));
    }
}
