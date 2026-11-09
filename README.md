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

Clicking anywhere on a song in a list (its number, cover, title or artist) plays it; the **...** menu works as usual.

On the TV, when you pick a song (a track, Play or Shuffle on a playlist, or a song in the queue), the full-screen player opens. Whenever the player opens, the ring goes to its play/pause button.

On the on-screen keyboard, the Search / Go / Done key just closes the keyboard (Tidal's search updates as you type). The page's full-screen mode is turned off: Wave is already full screen.

## Wave Mobile

Wave Mobile is the same app for touch phones: everything below except the remote controls. It keeps the phone's status bar and navigation buttons (with gesture navigation the page reaches the bottom edge), and the full-screen player opens only when you tap the player bar.

In the full-screen player:

- **Swipe left** for the next song, **swipe right** for the previous one. The cover follows your finger.
- **Swipe down** from the upper part of the player to close it.

Swipes that start on the player bar (its buttons and seek bar) are left to Tidal.

While music plays, a notification shows the song, artist, cover and progress, with previous, play/pause and next. These buttons, the lock screen, headphone buttons and Android Auto all send Tidal's own player commands, the same ones its player buttons send.

### Android Auto

Wave Mobile shows up in Android Auto as a media app with play/pause, next and previous, a heart to add the song to (or remove it from) My Collection, and the song's title, artist and cover. When the phone connects to Android Auto, playback carries on by itself.

- Playback is Tidal's web page inside Wave, so open Wave Mobile on the phone before driving (it can stay in the background). If it isn't open, Android Auto asks you to open it.
- Android Auto only lists apps from the Play Store unless you allow others: in Android Auto's settings, tap **Version** repeatedly to unlock developer settings, then turn on **Unknown sources** in the developer settings menu.

## Spectrum analyzers

Two analyzers in the colour of the song's cover (its strongest colour):

- **Over the album art** in the full-screen player: 30% opaque bars standing on the cover's bottom edge, with the frequencies (from the lowest one Android measures, about 47 Hz, up to 20 kHz) just under the cover.
- **In the player bar**, between the time and the buttons on the right: solid bars, while music plays and the full-screen player is closed.

An analyzer hides while a menu or dialog covers it.

## Stream quality

Under the cover in the full-screen player, and in the notification, Wave shows what Tidal is actually streaming, from Tidal's own player: format, bit depth, sample rate and bit rate (for example `FLAC · 24-bit / 96 kHz · 2304 kbps`).

Tidal's streams are DRM-protected, so the page can't read them; Android's Visualizer measures the TV's sound output instead. Android asks for the microphone permission for this the first time; nothing is recorded.

When the sound goes where Android can't measure it (Android Auto, for one), the bars hide instead of standing still. Android Auto draws its own player, so the analyzers aren't shown on the car's screen.

## Fair shuffle

With shuffle on, a playlist (or album, mix...) doesn't repeat a song until every song in it has played. Wave reads Tidal's own play queue: when Tidal moves on to a song already played this round, Wave jumps to the next unplayed one in Tidal's queue. A short message shows the progress (`Fair shuffle: 2 of 3 played`).

- Rounds are remembered per playlist (the 30 most recent), across app restarts.
- A round ends when its last song plays; the next time, every song is new again.
- Songs you pick yourself, Previous, and shuffle off are left alone.
- Related music Tidal plays after a playlist ends isn't counted.
- **Hold Tidal's shuffle button** to turn fair shuffle off (Tidal's own shuffle) or back on. Wave remembers the choice.

## Wave settings

Tidal's **Settings** page gets a **Wave** tab next to General, Account and About:

- **Fair shuffle** on or off.
- **Played this round**: each list (playlist, album, mix...) with how many of its songs have played in its current fair shuffle round (`12 of 40 played`), and a **Reset** button to start that list's round over.
- **Updates**: *Check now* looks for a newer release of the app on GitHub and installs it with Android's installer (Android asks to confirm, and the first time asks to allow Wave to install apps). With **Check automatically** on, Wave checks once a day, the first time it's opened, and offers the update.
- **License**: the GPL-3.0 terms in short, with a link to the source code and the full license.

Test builds (Wave Beta) don't update themselves; the official app updates as usual.

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

Local builds without the release key are test builds: they're called **Wave Beta**, have their own app id (`com.wave.tv.beta`, `com.wave.mobile.beta`), are signed with the debug key and named `wave-beta-<version>.apk` / `wave-mobile-beta-<version>.apk`. They install alongside the official app (with their own sign-in) and don't update themselves.

## Beta

Test builds are on the [**Beta** page](https://github.com/Trevor792221/Wave/releases/tag/beta): `wave-beta-<version>.apk` (TV) and `wave-mobile-beta-<version>.apk` (phone), one per version. They're called **Wave Beta** and have their own app id, so they install alongside the official apps (with their own Tidal sign-in), and they don't update themselves. The **Beta and probes** workflow adds them when the app changes on `main`.

## Probes

[**Wave Probe**](https://github.com/Trevor792221/Wave/releases/tag/probes) (`wave-probe-<version>.apk`, source in [`probes/wave-probe`](probes/wave-probe)) is Tidal's web player at phone width with two buttons:

- **Snapshot** records how the page and Tidal's player are built: the player's state and recent commands (their names and the *shape* of what they carry), and the page's buttons, tabs and settings with their sizes and styles. Only short on-screen labels are kept: no song titles, names, ids of your lists or account details.
- **Share log** shares the snapshots and a list of the kinds of request the page makes (host and path, ids masked, no query strings, headers or bodies) as a text file.

It's how Wave's commands for Tidal's player, the settings tab and the Android Auto heart were worked out.

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
