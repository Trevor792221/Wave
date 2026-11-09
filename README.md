# Wave

Small Android apps (~40 KB each, no libraries) for playing Tidal through its web player:

- **Wave** for Android TV, made for the remote.
- **Wave Mobile** for phones, with swipe gestures and Android Auto.

[![Download Wave Mobile](https://img.shields.io/badge/Download-Wave%20Mobile-33C3F0?style=for-the-badge&logo=android&logoColor=white)](https://github.com/Trevor792221/Wave/releases/download/latest-mobile/wave-mobile.apk)
[![Download Wave for TV](https://img.shields.io/badge/Download-Wave%20for%20TV-1E7FA8?style=for-the-badge&logo=android&logoColor=white)](https://github.com/Trevor792221/Wave/releases/download/latest-tv/wave.apk)

The buttons always download the newest version. Older versions are on the [releases page](https://github.com/Trevor792221/Wave/releases).

Wave opens Tidal's web player full screen and makes it work with a TV remote. Playback, sign-in and Widevine DRM are all handled by Tidal's own site; Wave only grants the DRM permission to tidal.com pages.

## Remote controls

Wave has two ways to get around, switched with **Menu**:

- **Highlight mode** (default): a ring jumps between buttons, links and other clickable things. It takes the colour of the song's cover.
- **Pointer mode**: an on-screen pointer, for things like dragging the seek bar.

| Button | Highlight mode | Pointer mode |
|---|---|---|
| D-pad | Move the ring to the nearest item that way (holding counts as one press) | Move the pointer (hold to speed up; push past an edge to scroll) |
| OK | Click the highlighted item | Click (hold for long-press) |
| Menu (press) | Switch to pointer mode | Switch to highlight mode |
| Menu (hold) | Cycle page width (1280 / 1440 / 1600 / 1920 px) | Same |
| Back | Go back a page; exits on the first page | Same |
| Channel ▲▼ / Page ▲▼ | Scroll faster | Same |
| Play/Pause, Next, Previous | Control playback, also while Wave is in the background | Same |

Fast-forward and rewind buttons act as Next and Previous. In a scrolling list the ring scrolls the list before moving on, and it follows the page when Tidal opens a new one.

When you pick a song (a track, Play or Shuffle on a playlist, or a song in the queue), the full-screen player opens. Whenever the player opens, the ring goes to its play/pause button.

On the on-screen keyboard, the Search / Go / Done key just closes the keyboard (Tidal's search updates as you type). The page's full-screen mode is turned off: Wave is already full screen.

## Wave Mobile

Wave Mobile is the same app for touch phones: everything below except the remote controls. In the full-screen player:

- **Swipe left** for the next song, **swipe right** for the previous one. The cover follows your finger.
- **Swipe down** from the upper part of the player to close it.

Swipes that start on the player bar (its buttons and seek bar) are left to Tidal.

While music plays, a notification shows the song, artist, cover and progress, with previous, play/pause and next. These buttons, the lock screen, headphone buttons and Android Auto all send Tidal's own player commands, the same ones its player buttons send.

### Android Auto

Wave Mobile shows up in Android Auto as a media app with play/pause, next and previous, and the song's title, artist and cover. When the phone connects to Android Auto, playback carries on by itself.

- Playback is Tidal's web page inside Wave, so open Wave Mobile on the phone before driving (it can stay in the background). If it isn't open, Android Auto asks you to open it.
- Android Auto only lists apps from the Play Store unless you allow others: in Android Auto's settings, tap **Version** repeatedly to unlock developer settings, then turn on **Unknown sources** in the developer settings menu.

## Spectrum analyzers

Two analyzers in the colour of the song's cover (its strongest colour):

- **Over the album art** in the full-screen player: 30% opaque bars standing on the cover's bottom edge, with the frequencies (from the lowest one Android measures, about 47 Hz, up to 20 kHz) just under the cover.
- **In the player bar**, between the time and the buttons on the right: solid bars, while music plays and the full-screen player is closed.

Tidal's streams are DRM-protected, so the page can't read them; Android's Visualizer measures the TV's sound output instead. Android asks for the microphone permission for this the first time; nothing is recorded.

## Fair shuffle

With shuffle on, a playlist (or album, mix...) doesn't repeat a song until every song in it has played. Wave reads Tidal's own play queue: when Tidal moves on to a song already played this round, Wave jumps to the next unplayed one in Tidal's queue. A short message shows the progress (`Fair shuffle: 2 of 3 played`).

- Rounds are remembered per playlist (the 30 most recent), across app restarts.
- A round ends when its last song plays; the next time, every song is new again.
- Songs you pick yourself, Previous, and shuffle off are left alone.
- Related music Tidal plays after a playlist ends isn't counted.

## Background playback

Music keeps playing when you leave the app or the screen turns off. Wave runs a small foreground service while playing and releases it 10 minutes after playback pauses.

## Lighter page

Datadog usage tracking and the cookie-consent banner are answered empty without leaving the TV. Tidal's own event reporting (which feeds your history and recommendations) and its anti-bot check are left alone.

## If something goes wrong

If Tidal's page process stops (for example when the TV runs low on memory), Wave reloads the page instead of closing. If Wave itself crashes, the next launch offers to share the details.

## Building

Requires JDK 17+ and the Android SDK (platform 35).

```sh
./gradlew assembleRelease
```

The APKs are written to `app/build/outputs/apk/tv/release/wave-<version>.apk` (TV) and `app/build/outputs/apk/mobile/release/wave-mobile-<version>.apk` (phone). They are signed with the release key when `WAVE_KEYSTORE_FILE`, `WAVE_KEYSTORE_PASSWORD`, `WAVE_KEY_ALIAS` and `WAVE_KEY_PASSWORD` are set, and with the local debug key otherwise.

## Releases

Each app has its own `versionName` and `versionCode`, in its flavor in `app/build.gradle.kts`. When a change to that file lands on `main`, the **Tag and release** workflow, for each app whose version has no release yet, creates its tag (`v<version>` for TV, `mobile-v<version>` for Wave Mobile), builds its APK signed with the release key (from the repository secrets) and publishes it as a GitHub release. It also keeps each app's download button pointing at its newest APK (the `latest-tv` and `latest-mobile` releases). An app whose version didn't change isn't rebuilt.

APKs signed with different keys can't install over each other: switching between a release-signed and a debug-signed Wave means uninstalling first.

## License

Copyright (C) 2026 Trevor792221

Wave is free software: you can redistribute it and/or modify it under the terms of the GNU
General Public License as published by the Free Software Foundation, version 3 of the License
(see [LICENSE](LICENSE)). It is distributed in the hope that it will be useful, but WITHOUT ANY
WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR
PURPOSE.

**Additional permission under GNU GPL version 3 section 7:** If you modify this Program, or any
covered work, by linking or combining it with Google Play services or other Google libraries
distributed under the Android Software Development Kit License (or a modified version of those
libraries), containing parts covered by the terms of that license, the licensors of this Program
grant you additional permission to convey the resulting work.

Wave uses no third-party libraries; the Gradle wrapper keeps its own Apache License 2.0. Wave is
not affiliated with or endorsed by TIDAL; TIDAL is a trademark of its respective owner.
