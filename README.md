# Wave

A small Android TV app (~40 KB, no libraries) for playing Tidal through its web player.

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

## Spectrum analyzers

Two analyzers in the colour of the song's cover (its strongest colour):

- **Over the album art** in the full-screen player: 30% opaque bars standing on the cover's bottom edge, with the frequencies (20 Hz – 20 kHz) just under the cover.
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

The APK is written to `app/build/outputs/apk/release/wave-<version>.apk`. It is signed with the release key when `WAVE_KEYSTORE_FILE`, `WAVE_KEYSTORE_PASSWORD`, `WAVE_KEY_ALIAS` and `WAVE_KEY_PASSWORD` are set, and with the local debug key otherwise.

## Releases

Set `versionName` and `versionCode` in `app/build.gradle.kts`. When a change to `versionName` lands on `main`, the **Tag and release** workflow creates the `v<versionName>` tag, builds the APK signed with the release key (from the repository secrets) and publishes it as a GitHub release.

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
