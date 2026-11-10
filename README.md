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

Tidal's page is drawn at the same size on every phone, whatever the phone's own font size. **Text size** in Settings → Visuals tab → Display (80–130%) makes the whole page bigger or smaller together (text, rows and buttons), so nothing overlaps. Tidal's phone layout needs the page at least 360 px wide, so a narrow screen gets as much of the size as fits (e.g. about 114% on a 412 dp phone), and a wider one, unfolded or in landscape, gets more.

### Audio quality on Wi-Fi and mobile data

In **Settings → General**, Tidal's single audio quality is replaced by two: **On Wi-Fi** and **On mobile data**, each with Low (96 or 320 kbps), High and Max. Wave tells Tidal the right one whenever the phone switches networks, also in the background and in the car. Wi-Fi and mobile data start as the quality chosen before; satellite starts at Low 96 kbps. Adaptive streaming stays as Tidal has it.

**Satellite data** (T-Mobile's T-Satellite with Starlink, and other carriers' satellite data, Android 15 and later): Android only lets apps that declare themselves satellite-ready use a satellite connection, and Wave does. On satellite, Wave uses the **On mobile data** quality with Tidal's **Adaptive streaming** always on, so the quality drops to what the slow link carries; back on Wi-Fi or mobile data, Adaptive streaming goes back to how it was. Satellite data is slow and limited, so expect slow loading; whether the carrier's plan carries an app's data is up to the carrier.

**Developer options**: tapping the version 5 times in the **Updates** tab (which also has the license) shows them: **Soft pause fades** (fade-out and fade-in length, 800 ms each to start, and the number of volume steps, 200), **Quality line** size (14 sp to start), and in Wave Beta builds **Test crash**. **Hide** puts them away again.

While music plays, a notification shows the song, artist, cover and progress, with previous, play/pause and next. These buttons, the lock screen, headphone buttons and Android Auto all send Tidal's own player commands, the same ones its player buttons send.

### Android Auto

Wave Mobile shows up in Android Auto as a media app with play/pause, next and previous, a heart to add the song to (or remove it from) My Collection, and the song's title, artist and cover. When the phone connects to Android Auto, playback carries on by itself.

- Playback is Tidal's web page inside Wave, so open Wave Mobile on the phone before driving (it can stay in the background). If it isn't open, Android Auto asks you to open it.
- Android Auto only lists apps from the Play Store unless you allow others: in Android Auto's settings, tap **Version** repeatedly to unlock developer settings, then turn on **Unknown sources** in the developer settings menu.

## Spectrum analyzers

Two analyzers in the colour of the song's cover (its strongest colour):

- **Over the album art** in the full-screen player: see-through bars (30% to start) standing on the cover's bottom edge, with the frequencies (from the lowest one Android measures, about 47 Hz, up to 20 kHz) just under the cover.
- **In the player bar**, between the time and the buttons on the right: solid bars, while music plays and the full-screen player is closed.

Both fade in when there's sound and fade out with silence (and when playback pauses). The opacity of the one over the cover is set in Settings → Visuals tab (30% to start).

### VU meters

Two needle meters sit inside the top corners of the cover in the full-screen player: **VU** (the averaged level, with a VU meter's slow needle; 0 VU = −18 dBFS) and **PEAK** (the peak level, a fast needle that falls back slowly; −40 to +3 dBFS). PEAK goes into the red only above 0 dBFS: the phone's output, after its volume, went over full scale and clipped. Android's capture is one combined signal, so they show two views of it rather than left and right. The needles take the cover's strongest colour, and the meters fade with the sound like the analyzers.

**Meter style** picks how they look: **Analog** (needles), **Digital** (LED bars in the cover's colour with a live reading, e.g. `−3.2 VU`, and the last peak held for a second), or **Deck**: a tape deck's glowing level display, L and R peak bars with the scale between them, across the top of the cover. Its red **OVER** lights only when the output clips. Android measures the mixed output, so L and R move together.

**Adaptive colour** (on by default) colours them from the album art, switched separately for the analyzers and for the meters. Whichever is off uses one fixed colour picked with Hue, Saturation and Brightness sliders; **Reset** goes back to Wave's blue (#33C3F0). The OVER and red scale marks stay red.

**Meters in the player bar** shows the deck meters in the small player at the bottom instead of its analyzer, without the display's dark background.

In Settings → **Visuals** tab (sections Spectrum analyzer, Meters and Colour): the spectrum analyzer, its **frequency numbers** (hidden by themselves wherever Tidal's player is drawn over them, like the player bar in landscape) and the VU meters can each be switched off, each has an opacity slider, and **Match the analyzer's opacity** makes the VU meters follow the analyzer's.

An analyzer hides while a menu or dialog covers it.

## Stream quality

Under the cover in the full-screen player, and in the notification, Wave shows what Tidal is actually streaming, from Tidal's own player: format, bit depth, sample rate and bit rate (for example `FLAC · 24-bit / 96 kHz · 2304 kbps`). Under the cover it has a faint glow in the quality's colour, as in Tidal's settings: white for Low, teal for High, gold for Max.

The analyzers and meters are drawn inside Tidal's page (the app measures the sound and passes it to the page each frame), so Tidal's controls and menus sit on top of them, as in landscape where the player bar's buttons lie over the bottom of the cover. Tidal's streams are DRM-protected, so the page can't read them; Android's Visualizer measures the TV's sound output instead. Android asks for the microphone permission for this the first time; nothing is recorded.

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

## The song where you left it

When Wave opens again, the song you were playing is where you left it: Tidal brings back its queue and song, and Wave moves the song to the position it was at. The position is saved every few seconds and whenever playback pauses or Wave goes to the background. Wave still opens on Tidal's home page.

## Soft pause

Pausing fades the song out over 0.8 s (in 200 small volume steps), then waits a moment for the sound already sent to the speaker to play out before stopping; playing again fades it back in over 0.8 s. It's switched on and off with **Soft pause** in Settings → General, just above Tidal's Crossfade setting (on by default). This works however it was paused or played (Tidal's buttons, the notification, headphones, Android Auto). Stopping mid-sound would click, more so with the spectrum analyzer in Android's effects chain. (From the TIDAL+ app in the Tidal- repo.)

## Background playback

Music keeps playing when you leave the app or the screen turns off. Wave runs a small foreground service while playing and releases it 10 minutes after playback pauses.

## Lighter page

Datadog usage tracking and the cookie-consent banner are answered empty without leaving the TV. Tidal's own event reporting (which feeds your history and recommendations) and its anti-bot check are left alone.

## If something goes wrong

If Tidal's page process stops (for example when the TV runs low on memory), Wave reloads the page instead of closing. If Wave itself crashes, the next launch offers to share the details.

With **Send crash reports automatically** on (Settings → Wave tab, off by default), the next time Wave opens after a crash it sends the details (app version, Android version, phone model and the error) to Wave's crash relay instead, which files them as an issue on this repository (public). The relay is a small Cloudflare Worker that holds the GitHub token, so the app never does: see [relay/README.md](relay/README.md).

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
