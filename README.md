# Wave

Small Android apps (~40 KB each, no libraries) for playing Tidal through its web player:

- **Wave** for Android TV, made for the remote.
- **Wave Mobile** for phones, with swipe gestures and Android Auto.

[![Download Wave Mobile](https://img.shields.io/badge/Download-Wave%20Mobile-33C3F0?style=for-the-badge&logo=android&logoColor=white)](https://github.com/Trevor792221/Wave/releases/download/latest-mobile/wave-mobile.apk)
[![Download Wave for TV](https://img.shields.io/badge/Download-Wave%20for%20TV-1E7FA8?style=for-the-badge&logo=android&logoColor=white)](https://github.com/Trevor792221/Wave/releases/download/latest-tv/wave.apk)

The buttons always download the newest version. Older versions are on the [releases page](https://github.com/Trevor792221/Wave/releases).

Wave opens Tidal's web player full screen and makes it work with a TV remote. Playback, sign-in and Widevine DRM are all handled by Tidal's own site; Wave only grants the DRM permission to tidal.com pages.

## Features

What Wave adds to Tidal's web player (also listed in the app: Settings → About). Marked ones are only in Wave Mobile (phone) or Wave for TV (TV).

- **Fair shuffle**: with shuffle on, no song repeats until every song in the list has played (a song counts once it has played for 10 seconds, so skipped songs stay in the round). Hold the shuffle button to switch it; the Wave tab shows how many have played this round, with a reset.
- **Soft pause**: pausing fades the music out and playing fades it back in, with no click.
- **Back where you left off**: Wave opens on the song you were playing, at the same spot.
- **Signal path** (phone): tap the quality line under the album art for the audio chain, from Tidal's stream through Tidal's volume levelling, decoding, soft pause and Android's mixer (resampling, volume) to the output. With the optional DUMP permission (`adb shell pm grant com.wave.mobile android.permission.DUMP`) it also shows the sound effects switched on, the hardware's format and the Bluetooth codec. DUMP lets an app read Android's system reports; Wave reads only the audio and Bluetooth ones. With [iAdb](https://github.com/FileContainer/iAdb-api) (ADB on the phone itself, Android 11+ Wireless debugging) installed and running, the panel's **Grant with iAdb** button grants it in one tap: iAdb asks Allow / Deny, then runs that one `pm grant`.
- **Fun facts** (on to start; Wave tab): a fact about the song from Wikipedia in a card on the album art, 10 seconds in. It sends each song's title and artist to Wikipedia; switch it off in the Wave tab to stop that.
- **Single playback**: each song stops at its end, at Max quality and full level, with crossfade, normalization and Wave's fades off and calls and notifications silenced.
- **Playlists and My Collection as spreadsheets** (phone): export the playlists you tick (one CSV file each) and My Collection, and import them back.
- **Settings backup** (phone): export and import Wave's settings, and an automatic daily, weekly or monthly backup to the phone, Google Drive, Proton Drive or any drive in Android's file picker.
- **Listening stats**: songs played, skipped and hearted, and time listened, for today, this week, this month and this year.
- **Sleep timer**: pauses the music after 30 minutes to 4 hours, also with Wave in the background.
- **Audio quality for Wi-Fi and mobile data** (phone): a quality for each, switched by itself when the phone changes networks.
- **Satellite data** (phone): plays over T-Mobile's T-Satellite and other satellite data, with Tidal's adaptive streaming on.
- **Quality line**: what's really streaming, under the album art (e.g. FLAC · 16-bit / 44.1 kHz · 1066 kbps), in the quality's colour.
- **Lighter page**: Tidal's tracking and cookie banner are blocked.
- **Spectrum analyzers**: over the album art and in the player bar, fading in and out with the sound, with a level slider for how high the bars go. The analyzers and the meters each take the album art's colours or one you pick.
- **Level meters**: VU and peak meters on the album art, in Analog 1, Analog 2, Digital 1 or Digital 2 style, and the VU meter can be switched off. Red means the sound really clipped; BT shows on Bluetooth.
- **Text size** (phone): Tidal's whole page bigger or smaller together, and song rows that fit narrow screens.
- **Swipes on the album art** (phone): swipe left or right for the next or previous song, down to close the player; tap a song to play it.
- **S Pen** (phone): press the pen's button once to play or pause, twice for the next song.
- **Remote control** (TV): a highlight ring that jumps between buttons with the arrow keys, or a pointer (hold Menu to switch). Menu opens Settings.
- **Page widths** (TV): how wide Tidal's page is drawn, a developer option.

## Remote controls

Wave has two ways to get around, switched by holding **Menu** or with **Pointer mode** in the Wave tab:

- **Highlight mode** (default): a ring jumps between buttons, links and other clickable things. It takes the colour of the song's cover.
- **Pointer mode**: an on-screen pointer, for things like dragging the seek bar.

| Button | Highlight mode | Pointer mode |
|---|---|---|
| D-pad | Move the ring to the nearest item that way (holding counts as one press) | Move the pointer (hold to speed up; push past an edge to scroll) |
| OK | Click the highlighted item | Click (hold for long-press) |
| Menu (press) | Open Tidal's Settings, where Wave's tabs are too (the music plays on); the ring goes to the Settings tabs | Open Settings |
| Menu (hold) | Switch to pointer mode | Switch to highlight mode |
| Back | Go back a page; exits on the first page | Same |
| Channel ▲▼ / Page ▲▼ | Scroll faster | Same |
| Play/Pause, Next, Previous | Control playback, also while Wave is in the background | Same |

Fast-forward and rewind buttons act as Next and Previous. For remotes without a Menu button, the developer option **Previous button acts as Menu** makes Previous do Menu's jobs (it then doesn't go to the previous song). In a scrolling list the ring scrolls the list before moving on, and it follows the page when Tidal opens a new one.

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

**Developer options**: tapping the version 5 times in the **Updates** tab (which also has the license) shows them: on TV **Page width** and **Previous button acts as Menu**; **Soft pause fades** (fade-out and fade-in length, 800 ms each to start, and the number of volume steps, 200), **Quality line** size (14 sp to start), **Loading screen** (what shows while Tidal's page loads instead of its logo: Drawn (the default), Flowing, Ripples, Levels or Sea, with a 4-second Preview), and in Wave Beta builds **Test crash**. **Hide** puts them away again.

While music plays, a notification shows the song, artist, cover and progress, with previous, play/pause and next. These buttons, the lock screen, headphone buttons and Android Auto all send Tidal's own player commands, the same ones its player buttons send.

### Sleep timer

Settings → Wave tab → **Sleep timer**: pick 30 minutes to 4 hours (in 30-minute steps) and Wave pauses the music when it's up (fading out with Soft pause), also with Wave in the background. The row shows how long is left; Off cancels it.

### Single playback

In Wave Mobile and Wave for TV (on a TV without Do Not Disturb, that part is left out).

Settings → Wave tab → **Single playback**, for listening to one song at a time with nothing in the way. While it's on:

- Switching it on stops the song that's playing and takes it back to its start, with the new settings, ready for you to press play.
- Each song stops at its end (Tidal doesn't go on to the next one). Play the next yourself; it stops at its end too.
- Tidal plays at **Max** quality, with adaptive streaming off (left on over satellite data), and its **Crossfade** and **loudness normalization** off.
- Soft pause's fades are off, so pausing cuts at once. The analyzers and meters keep running: Android's sound measurement they use only reads the sound and passes it on bit for bit, so it changes nothing.
- **Full level**: Tidal plays at full volume whatever its volume slider says. On a USB DAC, line out or wired headphones, Android's media volume goes to max too, so set the loudness on the DAC or amp. On Bluetooth, HDMI (a TV or amp can take Android's volume over HDMI-CEC) and the device's own speaker, Android's volume stays where you set it. Changing outputs while it's on follows the same rule.
- **Calls and notifications are silenced**: Do Not Disturb, alarms only (music still plays). This needs Do Not Disturb access: **Allow** gives it in one tap through iAdb when that's connected, or opens Android's page for it.
- **Android's sound effects** (Dolby Atmos, the equaliser, Adapt Sound and the like) can't be switched off by an app. With the signal path's details granted (DUMP), the section lists the ones that are on, with a button to Android's sound settings.

Switching it off puts everything back as it was: Tidal's quality, adaptive streaming, crossfade and normalization, Wave's fades, Android's volume (unless you changed it meanwhile) and Do Not Disturb. It's off to start and isn't remembered: closing Wave switches it off and puts everything back the same way.

### Playlists and My Collection

Settings → **Updates** tab → **Playlists and My Collection**. The files are CSV, which Excel, Google Sheets and Numbers open directly.

- **Export playlists** → **Choose** lists your playlists (yours and the ones you follow) with a box to tick for each, and **All playlists**. **Export** asks for a folder and saves each ticked playlist as its own file, named after it, one row per song: #, Title, Artists, Album, Length, ISRC, Tidal ID, Added. Videos in a playlist are left out. Songs Tidal no longer has (taken down, or not available in your country: the app hides them, but they stay saved) go in a separate file, `<playlist> (unavailable).csv`, with their Tidal ID and when they were added, the only things Tidal still tells about them.
- **Export My Collection** saves three files: `collection-tracks.csv` (the same columns), `collection-albums.csv` (Title, Artists, Year, Tracks, UPC, Tidal ID, Added) and `collection-artists.csv` (Name, Tidal ID, Added). Unavailable songs and albums go in `collection-tracks-unavailable.csv` and `collection-albums-unavailable.csv`, so the main files match what the app shows.
- **Import** takes one or more files and shows what each will do before **Start import**: a playlist file becomes a new playlist named after the file (unlisted, songs in the file's order); the three collection files add to My Collection. Each row's song is found by its Tidal ID, else its ISRC, else a search for its title and first artist, so rows you add in a spreadsheet with only a title and artist work too. Columns can be in any order. Duplicates are skipped: a song listed twice in a file is added once, and songs, albums or artists already in My Collection aren't added again. Afterwards Wave says how many were added, how many duplicates were skipped and which rows weren't found.

Wave does this through Tidal's own API, signed in as you with the sign-in the Tidal page already uses (kept in memory only, never saved or sent anywhere else).

### Settings backup

Settings → **Updates** tab → **Backup**:

- **Export** saves Wave's settings and stats to a file you name, wherever Android's file picker offers: the phone, Google Drive, Proton Drive (if its app adds itself to the picker) and so on. **Import** loads one; Wave starts again with those settings (the music stops for a moment).
- **Automatic backup**: pick Daily, Weekly or Monthly, then the backup file. Wave overwrites that one file on that schedule, also when it's closed (Android runs it when the battery isn't low; if the phone was off or restarted, Wave catches up the next time it opens). **Back up now** does one straight away, and the row shows when the last one was made or why it didn't work.

What's in it: every setting in Wave's tabs, the page settings (Soft pause and its fades, Fair shuffle, the quality for Wi-Fi and mobile data, developer options), the listening stats and the blocked counter. Not your Tidal sign-in, and nothing leaves the phone except to the place you pick. No extra permission is needed: Android's file picker gives Wave access to that one file only.

### Listening stats

In Wave Mobile and Wave for TV.

Settings → **Stats** tab: time listened and songs played, skipped and hearted, for today, this week, this month and this year. Tidal doesn't share a listening history, so Wave counts these itself on the phone or TV, from when the build with stats is installed. A song counts as played after 10 seconds of listening (as in Fair shuffle), as skipped when you move on with more than 10 seconds left, and as hearted when it's added to My Collection. Listening time follows the song's position, so skipping ahead within a song doesn't count. Below them, **Trackers and analytics blocked** counts the Datadog usage-tracking requests Wave has answered empty (see Lighter page). The numbers stay on the device.

### S Pen

On Galaxy phones whose S Pen has Air actions (the pen's button works away from the screen), pressing the button once plays or pauses, and twice skips to the next song, while Wave is on screen. Switch Wave on first in Settings → Advanced features → S Pen → Air actions (Samsung leaves new apps off).

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

Two needle meters sit inside the top corners of the cover in the full-screen player: **VU** (the averaged level, with a VU meter's slow needle; 0 VU = −18 dBFS) and **PEAK** (the peak level, a fast needle that falls back slowly; −40 to +3 dBFS). PEAK goes into the red only above 0 dBFS: the phone's output, after its volume, went over full scale and clipped. On Bluetooth the phone sends the sound at full level and the speaker sets the volume, so there the meters show the level sent (the song's own, whatever the volume) and say **BT** after their name. Android's capture is one combined signal, so they show two views of it rather than left and right. The needles take the cover's strongest colour, and the meters fade with the sound like the analyzers.

**Meter style** picks how they look: **Analog 1** (needles on dark glass, in the cover's colour), **Analog 2** (a classic backlit cream VU face with a black needle), **Digital 1** (LED bars in the cover's colour with a live reading, e.g. `−3.2 VU`, and the last peak held for a second) or **Digital 2** (a glowing level display across the top of the cover: a **VU** bar and a **PK** bar with the dBFS scale between them; the red **OVER** lights only when the peak goes past full scale). **VU meter** switches the VU (average) meter off, leaving the peak meter.

The analyzers and the meters each have their own colour settings. **Adaptive colour** (on by default) colours them from the album art; switched off, they use a fixed colour picked with Hue, Saturation and Brightness sliders, one for the analyzers and one for the meters. **Reset** goes back to Wave's blue (#33C3F0). The OVER and red scale marks stay red.

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

Wave Beta updates from the numbered test builds on the `test-builds` branch (`beta/<number>-wave-mobile-beta-….apk`): **Check now** finds a higher number and installs it. Its automatic check starts off; switch on **Check automatically** for a daily check. Only numbered test builds (built with `-PwaveTestBuild=<number>`) can update; the version line shows the number, e.g. `1.1.4 (test 111)`.

## The song where you left it

When Wave opens again, the song you were playing is where you left it: Tidal brings back its queue and song, and Wave moves the song to the position it was at. The position is saved every few seconds and whenever playback pauses or Wave goes to the background. Wave still opens on Tidal's home page.

## Soft pause

Pausing fades the song out over 0.8 s (in 200 small volume steps), then waits a moment for the sound already sent to the speaker to play out before stopping; playing again fades it back in over 0.8 s. It's switched on and off with **Soft pause** in Settings → General, just above Tidal's Crossfade setting (on by default). This works however it was paused or played (Tidal's buttons, the notification, headphones, Android Auto). Stopping mid-sound would click, more so with the spectrum analyzer in Android's effects chain. (From the TIDAL+ app in the Tidal- repo.)

## Background playback

Music keeps playing when you leave the app or the screen turns off. Wave runs a small foreground service while playing and releases it 10 minutes after playback pauses.

## Lighter page

Datadog usage tracking and the cookie-consent banner are answered empty without leaving the TV. Tidal's own event reporting (which feeds your history and recommendations) and its anti-bot check are left alone.

## Permissions

On its first open Wave says what the permissions Android asks about are for (Wave Mobile: microphone and notifications; Wave for TV: microphone), then asks. Settings → About (Tidal's About tab) lists them all with whether they're allowed, and a button to Android's settings for Wave.

| Permission | What for |
|---|---|
| Microphone (asked) | The spectrum analyzer and the level meters: Android's measurement of the sound the phone plays (its Visualizer) needs it. Wave never records or listens through the microphone. |
| Notifications (asked, Android 13+) | The music controls (play, pause, skip) in the notification and on the lock screen. |
| Install apps (asked the first time an update is installed) | Installing Wave's own updates from its GitHub page. Android asks before each install. |
| Internet | Tidal's web player, update checks and, if switched on, crash reports. |
| Play in the background (foreground service, media playback) | Keeps the music playing with Wave in the background, with its notification. |
| Keep awake | So the music doesn't stop when the screen turns off. |
| Change audio settings | Also needed by Android's Visualizer for the analyzer and meters. |
| See the network connection | Wi-Fi, mobile data or satellite, for the audio quality chosen for each. |
| Do Not Disturb access (you allow it in Android's settings, or on the phone with one tap through iAdb; only if you use Single playback, and only on devices that have Do Not Disturb) | Silences calls and notifications (alarms still ring) while Single playback is on, and puts Do Not Disturb back as it was afterwards. |

Wave for TV uses the same list without notifications and the network connection.

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

Each app has its own `versionName` and `versionCode`, in its flavor in `app/build.gradle.kts`. When a change to that file lands on `main`, the **Tag and release** workflow, for each app whose version has no release yet, creates its tag (`v<version>` for TV, `mobile-v<version>` for Wave Mobile), builds its APK signed with the release key (from the repository secrets) and publishes it as a GitHub release. It also keeps each app's download button pointing at its newest APK (the `latest-tv` and `latest-mobile` releases). An app whose version didn't change isn't rebuilt. What changed in each release is in [CHANGELOG.md](CHANGELOG.md).

Local builds without the release key are test builds: they're called **Wave Beta**, have their own app id (`com.wave.tv.beta`, `com.wave.mobile.beta`), are signed with the debug key and named `wave-beta-<version>.apk` / `wave-mobile-beta-<version>.apk`. They install alongside the official app (with their own sign-in); numbered ones update from the test-builds branch (above).

## Beta

Test builds are on the [**Beta** page](https://github.com/Trevor792221/Wave/releases/tag/beta): `wave-beta-<version>.apk` (TV) and `wave-mobile-beta-<version>.apk` (phone), one per version. They're called **Wave Beta** and have their own app id, so they install alongside the official apps (with their own Tidal sign-in). These are signed with the release key, so they don't update from (or to) the debug-key test builds on the test-builds branch. The **Beta and probes** workflow adds them when the app changes on `main`.

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
