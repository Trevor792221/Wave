# Changelog

Wave for TV and Wave Mobile releases, newest first. Each version is on the [Releases](https://github.com/Trevor792221/Wave/releases) page. Wave Beta test builds have their own changelog on the `test-builds` branch.

## Wave Mobile 1.2.7 (2026-11-13)

No more Tidal error S3015 after a long pause.

- After the page has slept a while (a song paused 10+ minutes with Wave in the background), playing that song reloads Tidal's page first (with Wave's loading screen), back on the same song at the same spot and screen, then plays. From the page, the notification, the lock screen, headphones or a remote. Browsing and picking other songs work straight away, without a reload

## Wave Mobile 1.2.6 (2026-11-13)

Clean CSV files, fair shuffle rounds of each song once.

- Exported CSV files without the UTF-8 marker that Google Sheets showed as text
- Fair shuffle counts each song once in a round, and for My Collection only the songs in the collection

## Wave for TV 2.1.6 and Wave Mobile 1.2.5 (2026-11-13)

Loading screen, stats and single playback on TV.

- Wave's own loading screen instead of Tidal's logo (Drawn; other styles in the developer options, with a preview)
- Wave for TV: Stats tab with the blocked counter, Single playback, meter styles Analog 1 / Analog 2 / Digital 1 / Digital 2, VU meter switch, Analyzer level, separate analyzer and meter colours
- Single playback keeps Android's volume on HDMI (a TV or amp can take it over CEC); Do Not Disturb only where the device has it
- About tab: features list updated

## Wave Mobile 1.2.4 (2026-11-13)

Stats, backups, playlists as spreadsheets, single playback.

- Single playback (Wave tab): each song stops at its end, Max quality, crossfade, normalization and fades off, full level, Do Not Disturb; off to start, not remembered
- Playlists and My Collection (Updates tab): export ticked playlists and My Collection as CSV (unavailable songs in their own file), import them back, duplicates skipped
- Settings backup (Updates tab): export / import, automatic daily, weekly or monthly
- Stats tab: time listened, songs played, skipped and hearted; trackers blocked
- Signal path panel (tap the quality line), with one-tap DUMP grant through iAdb
- Meter styles Analog 1 / Analog 2 / Digital 1 / Digital 2, VU meter switch, Analyzer level, separate colours for the analyzer and the meters

## Wave Mobile 1.2.3 (2026-11-12)

Fun facts.

- Fun facts (on to start; a switch in the Wave tab): a fact about the song from Wikipedia (its article, else the artist's) in a card at the bottom right of the album art, 10 s into the song, for 12 s; tap to close. It sends each song's title and artist to Wikipedia

## Wave for TV 2.1.5 (2026-11-12)

Fun facts.

- Fun facts (on to start; a switch in the Wave tab): a fact about the song from Wikipedia (its article, else the artist's) in a card at the bottom right of the album art, 10 s into the song, for 12 s. It sends each song's title and artist to Wikipedia; the ring never lands on the card
- Also in Wave Mobile's code (not released yet), on by default there too

## Wave for TV 2.1.4 and Wave Mobile 1.2.2 (2026-11-12)

- Fair shuffle: a song counts toward the round only after 10 s of playing
- Updates: Check now downloads the update and checks it straight away ("Safety check passed", or "Update verification failed" and once more by itself), then Install opens Android's prompt
- Pointer mode is a switch in the Wave tab again (holding Menu switches too)
- Developer options: Page width (moved there), and "Previous button acts as Menu" for remotes without one (off by default)
- The highlight ring can reach the version in the Updates tab, so OK x5 opens Developer options

## Wave for TV 2.1.3 and Wave Mobile 1.2.1 (2026-11-12)

One red bar on the Digital PEAK meter.

- Digital PEAK meter: the bars up to the last cover -40 to 0 dBFS; only the last bar is red, and it lights only above 0 dBFS (the output clipped). The held peak marker lands on it only for an over

## Wave for TV 2.1.2 and Wave Mobile 1.2.0 (2026-11-12)

- Menu opens Tidal's Settings inside the page (the music plays on), with Tidal's own command (router/PUSH "/settings", seen with Wave Probe 9); the ring goes to the Settings tabs
- Holding Menu switches between the highlight ring and the pointer; the page width is a setting in the Wave tab (Display)
- Faster ring: positions kept until something that matters changes, moved along when a list scrolls; presses queued (2 at most) instead of dropped
- Left and right stay on the ring's own line
- The volume button is really gone in the full-screen player; the ring skips invisible items
- The quality line is centred between the cover and the player's controls
- Wave's own short messages with the wave mark, instead of Android's toasts
- In Wave Beta test builds, Previous stands in for Menu (for remotes without one)
- Tidal's bottom tabs work again (tapping the player bar caught them too)

## Wave for TV 2.1.1 (2026-11-12)

Ring fixes, Uploads hidden, Collection in the sidebar.

- The ring goes to each item inside a box instead of ringing the box: the profile menu's entries, and a song row's menu, add and heart buttons one at a time
- The ring is centred on every button (4 px all round)
- Sliders: left and right change them (Wave's own sliders by a twentieth, the song position by 10 s, Tidal's other sliders by a tap further along); up and down leave
- No volume control in the full-screen player (the remote sets the volume)
- Smaller quality line (9 sp to start; developer options from 6 sp)
- When the player opens and the ring jumps to play/pause, the pointer follows, so no artist card is left open
- First start: Tidal's Uploads tab hidden and My Collection pinned to the sidebar, with Tidal's own commands (settings/SET_HIDE_UPLOAD_TAB, settings/SET_PIN_COLLECTION_TO_SIDEBAR; Wave Probe 8)
- Also from Wave Mobile 1.1.8–1.1.9: login page when signed out, artists as "A, B", updates checked by Wave before installing

## Wave Mobile 1.1.9 (2026-11-11)

Wave checks each update before installing it.

- An update is downloaded first and checked by Wave: the same app id, signed with the same key as the installed Wave. Only then does Android's installer get it (and check it again). A failed check shows "Update verification failed" and retries once by itself; a second failure stops until Check now

## Wave Mobile 1.1.8 (2026-11-11)

Login page when signed out, player bar opens the player, artist commas.

- Signed out: Wave opens Tidal's login page (by Tidal's own Log in button, once per start; signed out means session.userId is empty, seen with Wave Probe 8)
- Tapping the player bar outside its buttons (cover, title, artist, the space beside them) opens the full-screen player instead of the song's or artist's page
- Several artists show as "A, B" in the notification, lock screen and Android Auto
- Wave Probe 8: records the shape of Tidal's sign-in state (no names, ids or tokens)

## Wave for TV 2.1.0 and Wave Mobile 1.1.7 (2026-11-11)

Permissions and features explained.

- First open: what the permissions Android asks about are for (TV: microphone; phone: microphone and notifications), then the requests
- Tidal's About tab: "What Wave adds" (the features) and Permissions (each one, what for, whether it's allowed, and a button to Android's settings); the same lists in the README
- Wave for TV gets everything since 2.0.4 that applies to a TV: the Visuals tab (analyzers, meters in three styles, colours), soft pause, sleep timer, back where you left off, the Updates tab and developer options, crash reports, the fix for music stopping between songs

## Wave Mobile 1.1.6 (2026-11-11)

Soft pause fades up to 6 seconds.

- Developer options: the soft pause fade-out and fade-in lengths go up to 6 s (were 3 s)

## Wave Mobile 1.1.5 (2026-11-10)

No stop between songs; Wave Beta updates from test builds.

- Soft pause no longer pauses the next song when Tidal stops the old one at the end of a song (the music could stop between songs)
- Wave Beta updates itself from the numbered test builds on the test-builds branch; its automatic update check starts off. Test builds carry their number (-PwaveTestBuild)

## Wave Mobile 1.1.4 (2026-11-10)

Sleep timer and S Pen.

- Sleep timer in the Wave tab: 30 minutes to 4 hours in 30-minute steps; the app pauses the music when it's up, also in the background
- S Pen Air actions: press the pen's button once to play or pause, twice for the next song, while Wave is on screen (switch Wave on in the S Pen Air actions settings)

## Wave Mobile 1.1.3 (2026-11-10)

Back button, deck VU/PK, BT note, faster analyzer.

- Back closes the full-screen player; on the first page Wave goes to the background and keeps playing instead of closing
- Deck meters: a VU (average) bar and a PK (peak) bar instead of L and R
- The meters say BT on Bluetooth, where the speaker sets the volume and they show the level sent
- The analyzers read Android's newest capture every screen frame instead of ~20 times a second

## Wave Mobile 1.1.2 (2026-11-10)

Settings tabs fit at big text sizes.

- When Tidal's and Wave's six settings tabs don't fit (a big Text size or a narrow screen), they move closer together, then the row scrolls sideways with the picked tab in view

## Wave Mobile 1.1.1 (2026-11-10)

Satellite data, developer options, Updates tab.

- Satellite data (T-Mobile's T-Satellite and others, Android 15+): Wave declares itself satellite-ready; on satellite it uses the mobile data quality with Tidal's adaptive streaming on, and puts adaptive streaming back as it was afterwards
- Developer options, shown by tapping the version 5 times: soft pause fade lengths and steps, quality line size, and Test crash (Wave Beta only)
- An Updates tab in Settings with updates, developer options and the license
- Text size moved to the Visuals tab

## Wave Mobile 1.1.0 (2026-11-10)

Deck meters, Visuals tab, meter colours, PEAK red means clipping.

- PEAK meter runs to +3 dBFS and goes red only above 0, when the phone's output clips
- Deck meter style: glowing L/R peak bars with an OVER mark, across the top of the album art
- Meters in the player bar: deck meters in place of the small analyzer, without a background
- Adaptive colour switched separately for the analyzers and the meters, with a fixed colour picker (hue, saturation, brightness) and Reset
- A Visuals tab in Settings for the analyzer, meter and colour settings
- The picked tab stays highlighted going between the Visuals and Wave tabs

## Wave Mobile 1.0.9 (2026-11-10)

Quality per network, soft pause, VU meters in the page, crash reports.

- Audio quality on Wi-Fi and on mobile data (General tab), applied with Tidal's own command when the network changes.
- Soft pause: 0.8 s fades out and in (200 steps), switched in the General tab above Tidal's Crossfade.
- The song's position is kept when Wave closes, and put back the next time.
- Spectrum analyzers and VU / PEAK meters (analog or digital) drawn inside Tidal's page, so its controls and menus sit on top; they fade with the sound. Player settings in the Wave tab: analyzer, frequency numbers, VU meters, opacities, match, meter style.
- The stream quality line at 14 sp with a glow in the quality's colour.
- Text size (80-130%, as much as fits the screen); the phone's font size no longer enlarges Tidal's page; song rows fit narrow lists.
- Unfolding or rotating no longer restarts Wave; analyzers and meters in landscape.
- Crash reports: an optional switch sends them to the crash relay (relay/worker.js, a Cloudflare Worker holding the GitHub token), which files them as issues. Release builds keep names so reports are readable. Wave Beta has a Test crash button.
- Wave Probe 7: Text size and song-row records.

## Wave Mobile 1.0.8 (2026-11-09)

Heart in Android Auto, played-this-round list, Wave Beta test builds.

- Android Auto gets a heart button: it sends Tidal's own Add to / Remove from My Collection command (content/TOGGLE_FAVORITE_ITEMS) for the playing track, and shows filled or empty from Tidal's own favourites list.
- The Wave tab lists each list's fair shuffle round (how many of its songs have played) with a Reset button for each.
- Builds without the release key are test builds: "Wave Beta", their own app id (com.wave.*.beta), named wave-beta-<ver>.apk / wave-mobile-beta-<ver>.apk, so they install alongside the official app. They don't update themselves.

## Wave for TV 2.0.4 (2026-11-09)

Wave settings tab, updates, stream quality, click a song to play.

- A Wave tab in Tidal's settings: fair shuffle on/off, updates from the GitHub releases (check now, or once a day), and the license.
- Clicking anywhere on a song in a list plays it; its ... menu works as usual.
- The remote's buttons send Tidal's own player commands, and keep working after a pause.
- A newer pick replaces one still waiting to switch; fair shuffle can be switched by holding OK on the shuffle button, and picks count as yours for 5 s.
- Stream quality (format, bit depth, sample rate, bit rate) under the cover.
- The analyzers hide under menus and while they hear nothing.

## Wave Mobile 1.0.7 (2026-11-09)

A Wave tab in Tidal's settings, with updates from GitHub.

- Tidal's Settings page gets a Wave tab after General / Account / About, built like Tidal's own: fair shuffle on/off, updates and the license.
- Updates: "Check now" finds the newest release of this app on GitHub and installs it with Android's installer (it asks first). "Check automatically" does this once a day, the first time Wave opens, and offers the update.
- License: GPL-3.0 in short, the section 7 permission, a link to the source code and full license, and the not-affiliated-with-TIDAL note.

## Wave Mobile 1.0.6 (2026-11-09)

Tap a song to play it, stream quality, fair shuffle switch.

- Tapping anywhere on a song in a list (number, cover, title, artist) plays it; its ... menu works as usual.
- Picking a song no longer opens the full-screen player on phones.
- Keeps the status bar and navigation buttons; with gesture navigation the page reaches the bottom edge. Tidal's page isn't told about the bars, so it no longer adds an empty strip over the top of its player.
- Picks go straight to Tidal on phones (the TV's pause-before-switching is TV only), and on the TV a newer pick replaces one still waiting: no more wrong songs from quick taps.
- Fair shuffle: hold the shuffle button to switch it off or on; a pick counts as yours if it starts within 5 s.
- Shows what Tidal streams (format, bit depth, sample rate, bit rate) under the cover and in the notification.
- The analyzers hide while a menu covers them, and idle while they hear nothing.

## Wave Mobile 1.0.5 (2026-11-09)

Controls work after a phone call; analyzer and Android Auto.

- The page stays awake for 10 minutes after playback pauses (a phone call, a stop) and for a moment after any button press, so the car, headphone and notification buttons can start Tidal again without reopening Wave.
- The analyzers restart their capture when the sound moves to another output, and hide when they hear nothing (Android Auto takes the sound where it can't be measured).

## Wave Mobile 1.0.4 (2026-11-09)

Media notification; buttons send Tidal's own player commands.

- A media notification with the song, artist, cover and progress, read from Tidal's page and player state, with previous, play/pause and next.
- The notification, lock screen, headphone buttons and Android Auto send Tidal's own player actions (play, pause, skip next, skip previous); play/pause follows Tidal's playing state. Clicking the player bar's buttons is only a fallback.
- Asks for the notification and microphone permissions together on the first song.

## Wave Mobile 1.0.0 (2026-11-09)

Phones and Android Auto, from the same code as Wave for TV.

- Two apps from one codebase (product flavors): Wave for TV (com.wave.tv, unchanged at 2.0.3) and Wave Mobile (com.wave.mobile, 1.0.0), each with its own version. Wave Mobile is named "Wave" in the app drawer.
- Wave Mobile: the page at the phone's own width; no ring or pointer; the screen times out normally; swipes in the full-screen player (left/right for next/previous with the cover following the finger, down to close).
- The player-bar analyzer fits Tidal's compact phone player: between the end of the title/artist text (and badges like "E") and the play button.
- Android Auto: a media browser service and car declaration; one shared media session (with the cover) that stays active while Wave is open; playback carries on by itself when the phone connects to Android Auto.
- Analyzer scale starts at the lowest frequency Android measures (~47 Hz) with labels where their frequencies are; narrow bass bars interpolate between bins; fixes the 20 Hz bar that never moved at 48 kHz.
- Release workflow: per app (tags v<version> for TV, mobile-v<version> for Wave Mobile), only apps whose version changed are built; fixed download links (latest-tv, latest-mobile) for the README's new download buttons.

## Wave 2.0.3 (2026-11-08)

Pause the playing song before switching to a picked one.

## Wave 2.0.2 (2026-11-08)

Player opens after the song starts; steadier fair-shuffle jumps.

- Picking a song opens the full-screen player only once Tidal reports it playing (gives up after 6 s). Opening it while Tidal was still starting the song could leave its player stuck at 0:00 with the loading ring.
- Fair shuffle jumps once Tidal has finished moving to a song, and only if that song is still current; it unmutes only what it muted.

## Wave 2.0.0 (2026-11-08)

Spectrum analyzers, auto-opening player, cover-coloured ring.

- Two spectrum analyzers in the cover's strongest colour (Android's Visualizer on the TV's output; microphone permission, nothing recorded): 30% bars standing on the album art's bottom edge in the full-screen player with frequency labels just below, and solid bars in the player bar between the time and the right-hand buttons (while playing, hidden while the full-screen player is open). One capture is shared.
- Picking a song opens the full-screen player; whenever it opens, the highlight ring goes to play/pause. The ring takes the cover colour.
- Fair shuffle shows "N of X played" on each song, ignores autoplay songs after a playlist ends, and ends a round at its last song.
- The page's full-screen mode is off (Tidal then hides its button).
- Datadog usage tracking and the cookie-consent banner are answered empty; Tidal's own event reporting and anti-bot check are untouched.
- If Tidal's page process dies, Wave reloads the page instead of closing; crashes are logged and offered for sharing on next launch.
- README covers the new features.

## Wave 1.0.0 (2026-11-08)

Highlight ring navigation and fair shuffle.

- Highlight mode (default): the D-pad moves a ring between clickable items; OK clicks the highlighted item. Menu switches to the pointer, holding Menu changes the page width. The ring scrolls lists before leaving them, follows page changes, ignores held-key repeats, and reuses measured positions between presses so moving it stays fast on large pages.
- The on-screen keyboard's Search / Go / Done key just closes the keyboard.
- Fair shuffle: with shuffle on, a playlist doesn't repeat a song until every song has played. Uses Tidal's own play queue (found through React) to jump to the next unplayed song; rounds are saved per playlist, end at their last song, and ignore autoplay. Shows "N of X played" messages.
- Fix: the page script no longer breaks when injected before the page has a root element.

## Wave 0.9 (2026-11-08)

Lightweight Android TV player for Tidal's web player.

- D-pad pointer for using the site with a TV remote
- Widevine (protected media) granted to tidal.com pages only
- Background playback via a small foreground media service
- Play/pause, next and previous from the remote, in and out of the app
- Gradle wrapper, versioned APK names, and a workflow that tags v<versionName>
