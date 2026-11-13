# Changelog

Every test build and probe on this branch, newest first, with what changed in it. The files are in [`beta/`](beta) and [`probes/`](probes); released versions are on the [releases page](https://github.com/Trevor792221/Wave/releases). A test build's version is the one it was built on: its changes come out in the next release.

## Nov 13

- **Probe 12** · Wave Probe 10 · [`12-wave-probe-10.apk`](probes/12-wave-probe-10.apk): Records Tidal's playlist and My Collection requests (path, field names and shapes only; no token, titles or ids), for playlist export / import
- **Test 165** · Wave Mobile Beta 1.2.3 · [`165-wave-mobile-beta-1.2.3-single-restart.apk`](beta/165-wave-mobile-beta-1.2.3-single-restart.apk): Switching Single playback on stops the current song and takes it back to its start, ready to play
- **Test 164** · Wave Mobile Beta 1.2.3 · [`164-wave-mobile-beta-1.2.3-single-meters-on.apk`](beta/164-wave-mobile-beta-1.2.3-single-meters-on.apk): Single playback keeps the analyzers and meters running (they only read the sound); wording fixed
- **Test 163** · Wave Mobile Beta 1.2.3 · [`163-wave-mobile-beta-1.2.3-single-playback.apk`](beta/163-wave-mobile-beta-1.2.3-single-playback.apk): Wave tab → Single playback: each song stops at its end, Max quality, crossfade / normalization / fades / meters off, full level (Android max on USB, line out, wired), Do Not Disturb alarms-only; all put back when off
- **Test 162** · Wave Mobile Beta 1.2.3 · [`162-wave-mobile-beta-1.2.3-import-duplicates.apk`](beta/162-wave-mobile-beta-1.2.3-import-duplicates.apk): Import skips duplicates (twice in a file, or already in My Collection) and says how many
- **Test 161** · Wave Mobile Beta 1.2.3 · [`161-wave-mobile-beta-1.2.3-unavailable-csv.apk`](beta/161-wave-mobile-beta-1.2.3-unavailable-csv.apk): Export: songs/albums no longer on Tidal go in separate (unavailable) CSVs; import skips songs Tidal turns down instead of stopping
- **Test 160** · Wave Mobile Beta 1.2.3 · [`160-wave-mobile-beta-1.2.3-playlists-fix.apk`](beta/160-wave-mobile-beta-1.2.3-playlists-fix.apk): Playlists / My Collection: fixes Tidal's 400 on include (comma), retries when Tidal can't be reached, uses only the API's sign-in, errors name the step
- **Test 159** · Wave Mobile Beta 1.2.3 · [`159-wave-mobile-beta-1.2.3-playlists-csv.apk`](beta/159-wave-mobile-beta-1.2.3-playlists-csv.apk): Updates tab → Playlists and My Collection: export ticked playlists (one CSV each) and My Collection (3 CSVs); import CSVs as new playlists / into My Collection (by Tidal ID, ISRC or search). Built on 158
- **Test 158** · Wave Mobile Beta 1.2.3 · [`158-wave-mobile-beta-1.2.3-settings-backup.apk`](beta/158-wave-mobile-beta-1.2.3-settings-backup.apk): Updates tab → Backup: export / import settings, automatic daily / weekly / monthly backup to a picked file (phone, Google Drive, Proton Drive)
- **Test 157** · Wave Mobile Beta 1.2.3 · [`157-wave-mobile-beta-1.2.3-volume-undone.apk`](beta/157-wave-mobile-beta-1.2.3-volume-undone.apk): Fine volume steps removed again (as 155)
- **Test 156** · Wave Mobile Beta 1.2.3 · [`156-wave-mobile-beta-1.2.3-fine-volume.apk`](beta/156-wave-mobile-beta-1.2.3-fine-volume.apk): Fine volume steps (Wave tab → Volume, off by default): volume buttons move 0–100% everywhere, 1–10% per press; Android's step above plus a trim in Wave's player
- **Test 155** · Wave Mobile Beta 1.2.3 · [`155-wave-mobile-beta-1.2.3-separate-colours.apk`](beta/155-wave-mobile-beta-1.2.3-separate-colours.apk): Visuals: separate colour settings for the analyzer and the meters (each its own adaptive switch, picker and reset)
- **Test 154** · Wave Mobile Beta 1.2.3 · [`154-wave-mobile-beta-1.2.3-blocked-above.apk`](beta/154-wave-mobile-beta-1.2.3-blocked-above.apk): Stats: the blocked counter moved above About these numbers
- **Test 153** · Wave Mobile Beta 1.2.3 · [`153-wave-mobile-beta-1.2.3-blocked-counter.apk`](beta/153-wave-mobile-beta-1.2.3-blocked-counter.apk): Stats: a Trackers and analytics blocked counter at the bottom
- **Test 152** · Wave Mobile Beta 1.2.3 · [`152-wave-mobile-beta-1.2.3-stats.apk`](beta/152-wave-mobile-beta-1.2.3-stats.apk): Stats tab: time listened and songs played, skipped and hearted for today, this week, month and year (counted by Wave on the phone)
- **Test 151** · Wave for TV Beta 2.1.5 · [`151-wave-beta-2.1.5-analyzer-level.apk`](beta/151-wave-beta-2.1.5-analyzer-level.apk): TV: the same Analyzer level slider
- **Test 150** · Wave Mobile Beta 1.2.3 · [`150-wave-mobile-beta-1.2.3-analyzer-level.apk`](beta/150-wave-mobile-beta-1.2.3-analyzer-level.apk): Mobile: Analyzer level slider (Visuals → Spectrum analyzer, −12 to +12 dB)
- **Test 149** · Wave for TV Beta 2.1.5 · [`149-wave-beta-2.1.5-meter-styles.apk`](beta/149-wave-beta-2.1.5-meter-styles.apk): TV: the same meter styles and VU meter switch
- **Test 148** · Wave Mobile Beta 1.2.3 · [`148-wave-mobile-beta-1.2.3-meter-styles.apk`](beta/148-wave-mobile-beta-1.2.3-meter-styles.apk): Meter styles Analog 1, Analog 2 (new: classic backlit cream VU face), Digital 1, Digital 2 (was Deck); a VU meter switch (off: the peak meter only)
- **Test 147** · Wave Mobile Beta 1.2.3 · [`147-wave-mobile-beta-1.2.3-resampling-note.apk`](beta/147-wave-mobile-beta-1.2.3-resampling-note.apk): Signal path: the note says what Chrome's resampling does to the song (measured: unchanged to 15 kHz, top end a few dB quieter, added error ~80 dB below the music)
- **Test 146** · Wave Mobile Beta 1.2.3 · [`146-wave-mobile-beta-1.2.3-iadb-permission.apk`](beta/146-wave-mobile-beta-1.2.3-iadb-permission.apk): Grant with iAdb: Wave now declares iAdb's own permission (how iAdb finds apps to connect to); Output names more device types and shows the volume in dB
- **Test 145** · Wave Mobile Beta 1.2.3 · [`145-wave-mobile-beta-1.2.3-iadb-grant.apk`](beta/145-wave-mobile-beta-1.2.3-iadb-grant.apk): Signal path: "Grant with iAdb" grants the DUMP permission in one tap through iAdb (written by hand, no libraries)

## Nov 12

- **Probe 11** · Wave Probe 9 · [`11-wave-probe-9.apk`](probes/11-wave-probe-9.apk): Records Tidal's page-change commands (router/…) in full, with ids in addresses masked, and the browser history's entry, for opening Settings with Menu
- **Test 144** · Wave Mobile Beta 1.2.3 · [`144-wave-mobile-beta-1.2.3-signal-path.apk`](beta/144-wave-mobile-beta-1.2.3-signal-path.apk): Signal path: tap the quality line for the audio chain (Tidal stream, levelling, decoding, soft pause, Android mixer, output); more with the DUMP permission granted over ADB
- **Test 143** · Wave Mobile Beta 1.2.2 · [`143-wave-mobile-beta-1.2.2-fun-facts.apk`](beta/143-wave-mobile-beta-1.2.2-fun-facts.apk): Fun facts (Wave tab, off to start): a Wikipedia fact about the song (else the artist) in a card at the bottom right of the album art, 10 s in, for 12 s; tap to close
- **Test 142** · Wave for TV Beta 2.1.3 · [`142-wave-beta-2.1.3-version-ring.apk`](beta/142-wave-beta-2.1.3-version-ring.apk): TV: the highlight ring can land on the version in the Updates tab, so pressing OK 5 times there opens Developer options
- **Test 141** · Wave for TV Beta 2.1.3 · [`141-wave-beta-2.1.3-prev-as-menu-option.apk`](beta/141-wave-beta-2.1.3-prev-as-menu-option.apk): TV: Pointer mode back in the Wave tab (holding Menu still switches); developer options: Page width, and "Previous button acts as Menu" (off by default, all builds; Wave Beta no longer does it by itself); fair shuffle 10 s; safety check right after the download
- **Test 140** · Wave Mobile Beta 1.2.1 · [`140-wave-mobile-beta-1.2.1-check-on-download-2.apk`](beta/140-wave-mobile-beta-1.2.1-check-on-download-2.apk): Same as 139, to try it: from 139, Check now downloads and checks this one
- **Test 139** · Wave Mobile Beta 1.2.1 · [`139-wave-mobile-beta-1.2.1-check-on-download.apk`](beta/139-wave-mobile-beta-1.2.1-check-on-download.apk): Updates: Check now downloads the update and runs the safety check straight away ("Safety check passed"), then offers Install, which opens Android's prompt at once
- **Test 138** · Wave Mobile Beta 1.2.1 · [`138-wave-mobile-beta-1.2.1-safety-check-2.apk`](beta/138-wave-mobile-beta-1.2.1-safety-check-2.apk): Same as 136, to try the "Safety check passed" message: from 136, Check now installs this one
- **Test 137** · Wave for TV Beta 2.1.3 · [`137-wave-beta-2.1.3-safety-check.apk`](beta/137-wave-beta-2.1.3-safety-check.apk): TV: the same "Safety check passed" message
- **Test 136** · Wave Mobile Beta 1.2.1 · [`136-wave-mobile-beta-1.2.1-safety-check.apk`](beta/136-wave-mobile-beta-1.2.1-safety-check.apk): Updates: "Safety check passed" shows once Wave has checked the download (its app id and key), before Android's installer
- **Test 135** · Wave for TV Beta 2.1.3 · [`135-wave-beta-2.1.3-fair-10s.apk`](beta/135-wave-beta-2.1.3-fair-10s.apk): TV: the same fair shuffle change
- **Test 134** · Wave Mobile Beta 1.2.1 · [`134-wave-mobile-beta-1.2.1-fair-10s.apk`](beta/134-wave-mobile-beta-1.2.1-fair-10s.apk): Fair shuffle: a song counts toward the round only after 10 s of playing (skipped sooner, it stays in the round)
- **Test 133** · Wave Mobile Beta 1.2.0 · [`133-wave-mobile-beta-1.2.0-peak-red-bar.apk`](beta/133-wave-mobile-beta-1.2.0-peak-red-bar.apk): Phone: the same Digital PEAK meter change
- **Test 132** · Wave for TV Beta 2.1.2 · [`132-wave-beta-2.1.2-peak-red-bar.apk`](beta/132-wave-beta-2.1.2-peak-red-bar.apk): TV: Digital PEAK meter: only the last bar is red, lit only above 0 dBFS (the bars before it cover −40 to 0)
- **Test 131** · Wave for TV Beta 2.1.1 · [`131-wave-beta-2.1.1-quality-centred.apk`](beta/131-wave-beta-2.1.1-quality-centred.apk): TV: the quality line is centred between the cover's frequency numbers and the player's controls (it touched the controls)
- **Test 130** · Wave Mobile Beta 1.1.9 · [`130-wave-mobile-beta-1.1.9-bottom-tabs.apk`](beta/130-wave-mobile-beta-1.1.9-bottom-tabs.apk): Phone: Tidal's bottom tabs work again (tapping the player bar opened the player for them too); the bar's song row still opens the player
- **Test 129** · Wave for TV Beta 2.1.1 · [`129-wave-beta-2.1.1-menu-hold-pointer.apk`](beta/129-wave-beta-2.1.1-menu-hold-pointer.apk): TV: holding Menu (Previous in Wave Beta) switches between the ring and the pointer; page width is a setting in the Wave tab (Display)
- **Test 128** · Wave for TV Beta 2.1.1 · [`128-wave-beta-2.1.1-own-messages.apk`](beta/128-wave-beta-2.1.1-own-messages.apk): Wave draws its own short messages (with the wave mark) instead of Android's toasts, which showed a stock icon on the TV
- **Test 127** · Wave for TV Beta 2.1.1 · [`127-wave-beta-2.1.1-menu-settings-probed.apk`](beta/127-wave-beta-2.1.1-menu-settings-probed.apk): TV: Menu (Previous in Wave Beta) opens Settings with Tidal's exact command (seen with Wave Probe 9: router/PUSH "/settings")
- **Test 126** · Wave for TV Beta 2.1.1 · [`126-wave-beta-2.1.1-menu-settings.apk`](beta/126-wave-beta-2.1.1-menu-settings.apk): TV: Menu opens Tidal's Settings inside the page (music plays on), ring to the Settings tabs; in Wave Beta the Previous button stands in for Menu; highlight/pointer mode is now a switch in the Wave tab
- **Test 125** · Wave for TV Beta 2.1.1 · [`125-wave-beta-2.1.1-stay-in-row.apk`](beta/125-wave-beta-2.1.1-stay-in-row.apk): TV: left and right stay on the ring's own line, however far the next item is (no jumping up or down to something nearer)
- **Test 124** · Wave for TV Beta 2.1.1 · [`124-wave-beta-2.1.1-no-volume-ring.apk`](beta/124-wave-beta-2.1.1-no-volume-ring.apk): TV: the volume button is really gone in the full-screen player (the ring could still land on the hidden one); the ring skips invisible items
- **Test 123** · Wave for TV Beta 2.1.1 · [`123-wave-beta-2.1.1-faster-ring.apk`](beta/123-wave-beta-2.1.1-faster-ring.apk): TV: faster ring (positions kept until something that matters changes, moved along when a list scrolls), presses queued (2 at most) instead of dropped

## Nov 11

- **Probe 10** · Wave Probe 8 · [`10-wave-probe-8.apk`](probes/10-wave-probe-8.apk): Records Tidal's sign-in state (auth, session, user: their shape only, no names, ids or tokens), for opening the login page when signed out
- **Test 122** · Wave for TV Beta 2.1.0 · [`122-wave-beta-2.1.0-tv-defaults-probed.apk`](beta/122-wave-beta-2.1.0-tv-defaults-probed.apk): TV: Uploads hidden and Collection pinned with Tidal's exact commands (seen with Wave Probe 8: SET_HIDE_UPLOAD_TAB, SET_PIN_COLLECTION_TO_SIDEBAR)
- **Test 121** · Wave for TV Beta 2.1.0 · [`121-wave-beta-2.1.0-tv-defaults.apk`](beta/121-wave-beta-2.1.0-tv-defaults.apk): TV: Uploads tab hidden and My Collection pinned to the sidebar the first time (Tidal's own settings, changeable after); ring fixes from 120
- **Test 120** · Wave for TV Beta 2.1.0 · [`120-wave-beta-2.1.0-ring-fixes.apk`](beta/120-wave-beta-2.1.0-ring-fixes.apk): TV: ring reaches items inside menus and rows (profile menu; a song's menu, add and heart), ring centred, sliders move with left/right, no volume in the full-screen player, smaller quality line, no artist card left open
- **Test 119** · Wave Mobile Beta 1.1.8 · [`119-wave-mobile-beta-1.1.8-verify-update-2.apk`](beta/119-wave-mobile-beta-1.1.8-verify-update-2.apk): Same as 118, to try the check: from 118, Check now installs this one
- **Test 118** · Wave Mobile Beta 1.1.8 · [`118-wave-mobile-beta-1.1.8-verify-update.apk`](beta/118-wave-mobile-beta-1.1.8-verify-update.apk): Updates are checked by Wave before installing (its app id, signed with its key); failed check: toast, one automatic retry
- **Test 117** · Wave Mobile Beta 1.1.7 · [`117-wave-mobile-beta-1.1.7-login-first.apk`](beta/117-wave-mobile-beta-1.1.7-login-first.apk): Signed out: opens Tidal's login page (its own Log in button, once per start); player bar tap, artist commas
- **Test 116** · Wave Mobile Beta 1.1.7 · [`116-wave-mobile-beta-1.1.7-bar-opens-player.apk`](beta/116-wave-mobile-beta-1.1.7-bar-opens-player.apk): Tapping the player bar (cover, title, artist, the space beside them) opens the full-screen player; artists with commas
- **Test 115** · Wave Mobile Beta 1.1.7 · [`115-wave-mobile-beta-1.1.7-artist-commas.apk`](beta/115-wave-mobile-beta-1.1.7-artist-commas.apk): Notification, lock screen and Android Auto show several artists as "A, B"
- **Test 114** · Wave Mobile Beta 1.1.6 · [`114-wave-mobile-beta-1.1.6-features.apk`](beta/114-wave-mobile-beta-1.1.6-features.apk): Tidal's About tab lists what Wave adds (features), above the permissions
- **Test 113** · Wave Mobile Beta 1.1.6 · [`113-wave-mobile-beta-1.1.6-permissions.apk`](beta/113-wave-mobile-beta-1.1.6-permissions.apk): First open explains and asks for the permissions; Tidal's About tab lists every permission and what for
- **Test 112** · Wave Mobile Beta 1.1.5 · [`112-wave-mobile-beta-1.1.5-6s-fades.apk`](beta/112-wave-mobile-beta-1.1.5-6s-fades.apk): Developer options: soft pause fades up to 6 s (was 3 s)

## Nov 10

- **Probe 09** · Wave Probe 7 · [`09-wave-probe-7.apk`](probes/09-wave-probe-7.apk): Wave Mobile's Text size (Size button) and a record of the song rows and their panels
- **Test 111** · Wave Mobile Beta 1.1.4 · [`111-wave-mobile-beta-1.1.4-beta-updates.apk`](beta/111-wave-mobile-beta-1.1.4-beta-updates.apk): Wave Beta updates itself from the numbered test builds here (Check now; automatic check off by default). First numbered build: install this one by hand
- **Test 110** · Wave Mobile Beta 1.1.4 · [`110-wave-mobile-beta-1.1.4-song-handover.apk`](beta/110-wave-mobile-beta-1.1.4-song-handover.apk): Soft pause no longer pauses the next song when Tidal hands over at the end of a song (music stopping between songs)
- **Test 109** · Wave Mobile Beta 1.1.3 · [`109-wave-mobile-beta-1.1.3-sleep-4h.apk`](beta/109-wave-mobile-beta-1.1.3-sleep-4h.apk): Sleep timer: 30 min to 4 hours in 30-minute steps
- **Test 108** · Wave Mobile Beta 1.1.3 · [`108-wave-mobile-beta-1.1.3-sleep-timer.apk`](beta/108-wave-mobile-beta-1.1.3-sleep-timer.apk): Sleep timer in the Wave tab (15 min to 2 hours; pauses also in the background); S Pen kept
- **Test 107** · Wave Mobile Beta 1.1.3 · [`107-wave-mobile-beta-1.1.3-s-pen.apk`](beta/107-wave-mobile-beta-1.1.3-s-pen.apk): S Pen Air actions: press once to play or pause, twice for the next song (switch Wave on in the S Pen Air actions settings)
- **Test 106** · Wave Mobile Beta 1.1.2 · [`106-wave-mobile-beta-1.1.2-every-frame.apk`](beta/106-wave-mobile-beta-1.1.2-every-frame.apk): Analyzers read Android's newest capture every screen frame (not ~20 updates a second)
- **Test 105** · Wave Mobile Beta 1.1.2 · [`105-wave-mobile-beta-1.1.2-back-button.apk`](beta/105-wave-mobile-beta-1.1.2-back-button.apk): Back closes the full-screen player; on the first page Wave goes to the background and keeps playing instead of closing
- **Test 104** · Wave Mobile Beta 1.1.2 · [`104-wave-mobile-beta-1.1.2-deck-vu-pk.apk`](beta/104-wave-mobile-beta-1.1.2-deck-vu-pk.apk): Deck meters: VU (average) and PK (peak) bars instead of L and R; BT note kept
- **Test 103** · Wave Mobile Beta 1.1.2 · [`103-wave-mobile-beta-1.1.2-bluetooth-note.apk`](beta/103-wave-mobile-beta-1.1.2-bluetooth-note.apk): Meters say BT on Bluetooth (the speaker sets the volume there, so they show the level sent)
- **Test 102** · Wave Mobile Beta 1.1.1 · [`102-wave-mobile-beta-1.1.1-tabs-fit.apk`](beta/102-wave-mobile-beta-1.1.1-tabs-fit.apk): Settings tabs fit at big Text sizes: closer together, then the row scrolls sideways with the picked tab in view
- **Test 101** · Wave Mobile Beta 1.1.0 · [`101-wave-mobile-beta-1.1.0-updates-tab.apk`](beta/101-wave-mobile-beta-1.1.0-updates-tab.apk): Updates tab (updates, developer options, license); Text size moved to the Visuals tab
- **Test 100** · Wave Mobile Beta 1.1.0 · [`100-wave-mobile-beta-1.1.0-dev-options.apk`](beta/100-wave-mobile-beta-1.1.0-dev-options.apk): Developer options: soft pause fade lengths and steps, quality line size, Test crash (Beta only)
- **Test 99** · Wave Mobile Beta 1.1.0 · [`99-wave-mobile-beta-1.1.0-satellite-adaptive.apk`](beta/99-wave-mobile-beta-1.1.0-satellite-adaptive.apk): Satellite: no setting or card; it uses the mobile data quality with Tidal's adaptive streaming always on (put back as it was afterwards)
- **Test 98** · Wave Mobile Beta 1.1.0 · [`98-wave-mobile-beta-1.1.0-developer-options.apk`](beta/98-wave-mobile-beta-1.1.0-developer-options.apk): Satellite data moved into Developer options (tap the version 5 times in the Wave tab); off, satellite counts as mobile data
- **Test 97** · Wave Mobile Beta 1.1.0 · [`97-wave-mobile-beta-1.1.0-satellite.apk`](beta/97-wave-mobile-beta-1.1.0-satellite.apk): 1.1.0 + satellite data: Wave declares itself satellite-ready (T-Satellite), detects satellite and uses its own "On satellite" quality (starts at Low 96 kbps)
- **Test 96** · Wave Mobile Beta 1.0.9 · [`96-wave-mobile-beta-1.0.9-tab-highlight.apk`](beta/96-wave-mobile-beta-1.0.9-tab-highlight.apk): Going between the Visuals and Wave tabs keeps the picked tab's text highlighted
- **Test 95** · Wave Mobile Beta 1.0.9 · [`95-wave-mobile-beta-1.0.9-visuals-tab.apk`](beta/95-wave-mobile-beta-1.0.9-visuals-tab.apk): A Visuals tab in Settings with the analyzer, meter and colour settings (moved from the Wave tab)
- **Test 94** · Wave Mobile Beta 1.0.9 · [`94-wave-mobile-beta-1.0.9-adaptive-separate.apk`](beta/94-wave-mobile-beta-1.0.9-adaptive-separate.apk): Adaptive colour switched separately for the analyzers and for the meters (one shared fixed colour)
- **Test 93** · Wave Mobile Beta 1.0.9 · [`93-wave-mobile-beta-1.0.9-meter-colour.apk`](beta/93-wave-mobile-beta-1.0.9-meter-colour.apk): Adaptive colour for the deck meters too; a fixed colour (hue, saturation, brightness, Reset) for the analyzers and all meters
- **Test 92** · Wave Mobile Beta 1.0.9 · [`92-wave-mobile-beta-1.0.9-deck-on-cover.apk`](beta/92-wave-mobile-beta-1.0.9-deck-on-cover.apk): Deck meters across the top of the album art (like the other styles); no dark background in the player bar
- **Test 91** · Wave Mobile Beta 1.0.9 · [`91-wave-mobile-beta-1.0.9-deck-meters.apk`](beta/91-wave-mobile-beta-1.0.9-deck-meters.apk): 1.0.9 + test 90: Meter style Deck (glowing L/R peak bars with OVER, beside the song title) and Meters in the player bar
- **Test 90** · Wave Mobile Beta 1.0.9 · [`90-wave-mobile-beta-1.0.9-red-means-clipping.apk`](beta/90-wave-mobile-beta-1.0.9-red-means-clipping.apk): 1.0.9 as released, with only the PEAK scale changed: it runs to +3 dBFS and goes red only above 0, when the phone's output clips
- **Test 89** · Wave Mobile Beta 1.0.9 · [`89-wave-mobile-beta-1.0.9-clip-light.apk`](beta/89-wave-mobile-beta-1.0.9-clip-light.apk): 1.0.9: meters follow phone volume; CLIP lights only when the phone's output goes over full scale; PEAK scale to +3, red from 0; VU reference −18/−14
- **Test 88** · Wave Mobile Beta 1.0.9 · [`88-wave-mobile-beta-1.0.9-text-size-fits.apk`](beta/88-wave-mobile-beta-1.0.9-text-size-fits.apk): 1.0.9: Text size capped to what fits the screen (page at least 360 px wide), so the player bar and tabs aren't cut off
- **Test 87** · Wave Mobile Beta 1.0.9 · [`87-wave-mobile-beta-1.0.9-layout-on-events.apk`](beta/87-wave-mobile-beta-1.0.9-layout-on-events.apk): 1.0.9: what covers the cover is checked when the player opens, the screen resizes or the player scrolls (no timer)
- **Test 86** · Wave Mobile Beta 1.0.9 · [`86-wave-mobile-beta-1.0.9-meters-below-header.apk`](beta/86-wave-mobile-beta-1.0.9-meters-below-header.apk): 1.0.9: meters placed below Tidal's header where it covers the top of the cover (130% landscape)
- **Test 85** · Wave Mobile Beta 1.0.9 · [`85-wave-mobile-beta-1.0.9-cover-canvas-fix.apk`](beta/85-wave-mobile-beta-1.0.9-cover-canvas-fix.apk): 1.0.9: cover canvas sits next to the cover (meters show at 130% landscape); numbers hidden when cut off by the screen edge
- **Test 84** · Wave Mobile Beta 1.0.9 · [`84-wave-mobile-beta-1.0.9-frequency-numbers.apk`](beta/84-wave-mobile-beta-1.0.9-frequency-numbers.apk): 1.0.9: frequency numbers hidden where Tidal's player covers them, and a switch for them
- **Test 83** · Wave Mobile Beta 1.0.9 · [`83-wave-mobile-beta-1.0.9-embedded-meters.apk`](beta/83-wave-mobile-beta-1.0.9-embedded-meters.apk): 1.0.9: analyzers and VU meters drawn inside Tidal's page (its controls on top); app only measures
- **Test 82** · Wave Mobile Beta 1.0.9 · [`82-wave-mobile-beta-1.0.9-landscape-own-controls.apk`](beta/82-wave-mobile-beta-1.0.9-landscape-own-controls.apk): 1.0.9: landscape: Tidal's play controls invisible (still tappable) and redrawn by Wave over the analyzer
- **Test 81** · Wave Mobile Beta 1.0.9 · [`81-wave-mobile-beta-1.0.9-landscape-under-controls.apk`](beta/81-wave-mobile-beta-1.0.9-landscape-under-controls.apk): 1.0.9: landscape analyzer on the cover's bottom edge, leaving out the player bar's controls (drawn under them, over the art)
- **Test 80** · Wave Mobile Beta 1.0.9 · [`80-wave-mobile-beta-1.0.9-landscape-bar.apk`](beta/80-wave-mobile-beta-1.0.9-landscape-bar.apk): 1.0.9: in landscape the analyzer sits above Tidal's player bar (which covers the cover's bottom), so it and the meters show
- **Test 79** · Wave Mobile Beta 1.0.9 · [`79-wave-mobile-beta-1.0.9-landscape-unfold.apk`](beta/79-wave-mobile-beta-1.0.9-landscape-unfold.apk): 1.0.9: meters and analyzer in landscape (visible part of the cover); unfolding no longer restarts Wave or stops the music
- **Test 78** · Wave Mobile Beta 1.0.9 · [`78-wave-mobile-beta-1.0.9-rows-fit.apk`](beta/78-wave-mobile-beta-1.0.9-rows-fit.apk): 1.0.9: song rows fit narrow lists (title shrinks, the ... menu stays on screen)
- **Test 77** · Wave Mobile Beta 1.0.9 · [`77-wave-mobile-beta-1.0.9-text-size-fit.apk`](beta/77-wave-mobile-beta-1.0.9-text-size-fit.apk): 1.0.9: Text size locks the zoom so the page fills the screen; resets to 100% if it ever doesn't fit (the previous build's setting is dropped)
- **Test 76** · Wave Mobile Beta 1.0.9 · [`76-wave-mobile-beta-1.0.9-text-size-slider.apk`](beta/76-wave-mobile-beta-1.0.9-text-size-slider.apk): 1.0.9: Text size slider (Wave tab → Display) scaling Tidal's whole page
- **Test 75** · Wave Mobile Beta 1.0.9 · [`75-wave-mobile-beta-1.0.9-text-size.apk`](beta/75-wave-mobile-beta-1.0.9-text-size.apk): 1.0.9: Tidal's text no longer enlarged by the phone's font size (rows don't overlap)
- **Test 74** · Wave Mobile Beta 1.0.9 · [`74-wave-mobile-beta-1.0.9-digital-meters.apk`](beta/74-wave-mobile-beta-1.0.9-digital-meters.apk): 1.0.9: digital (LED bar) VU meters and a Meter style setting
- **Test 73** · Wave Mobile Beta 1.0.9 · [`73-wave-mobile-beta-1.0.9-vu-meters.apk`](beta/73-wave-mobile-beta-1.0.9-vu-meters.apk): 1.0.9: VU and PEAK meters in the cover's top corners; Player settings (analyzer/VU on-off, opacities, match)
- **Test 72** · Wave Mobile Beta 1.0.9 · [`72-wave-mobile-beta-1.0.9-bar-fade-by-sound.apk`](beta/72-wave-mobile-beta-1.0.9-bar-fade-by-sound.apk): 1.0.9: the player-bar analyzer fades with the sound on pause (no flicker); short page redraws ignored
- **Test 71** · Wave Mobile Beta 1.0.9 · [`71-wave-mobile-beta-1.0.9-bar-fade-fix.apk`](beta/71-wave-mobile-beta-1.0.9-bar-fade-fix.apk): 1.0.9: the player-bar analyzer always fades out (no disappear-and-return on stop)
- **Test 70** · Wave Mobile Beta 1.0.9 · [`70-wave-mobile-beta-1.0.9-analyzer-fades.apk`](beta/70-wave-mobile-beta-1.0.9-analyzer-fades.apk): 1.0.9: analyzers fade in with sound and out with silence; opacity slider for the cover analyzer (Wave tab)
- **Test 69** · Wave Mobile Beta 1.0.9 · [`69-wave-mobile-beta-1.0.9-readable-crashes.apk`](beta/69-wave-mobile-beta-1.0.9-readable-crashes.apk): 1.0.9: Wave's names kept in the build, so crash reports say where the crash was
- **Test 68** · Wave Mobile Beta 1.0.9 · [`68-wave-mobile-beta-1.0.9-test-crash.apk`](beta/68-wave-mobile-beta-1.0.9-test-crash.apk): 1.0.9: Test crash button in the Wave tab (Wave Beta only); Wave opens again after it
- **Test 67** · Wave Mobile Beta 1.0.9 · [`67-wave-mobile-beta-1.0.9-crash-relay.apk`](beta/67-wave-mobile-beta-1.0.9-crash-relay.apk): 1.0.9: crash reports go to the relay (wave-crash.trevorgray022.workers.dev) when the switch is on
- **Test 66** · Wave Mobile Beta 1.0.9 · [`66-wave-mobile-beta-1.0.9-crash-reports.apk`](beta/66-wave-mobile-beta-1.0.9-crash-reports.apk): 1.0.9: Send crash reports automatically switch (Wave tab); relay address not set yet
- **Test 65** · Wave Mobile Beta 1.0.9 · [`65-wave-mobile-beta-1.0.9-song-position.apk`](beta/65-wave-mobile-beta-1.0.9-song-position.apk): 1.0.9: keeps only the song and its position (opens on Tidal's home page)
- **Test 64** · Wave Mobile Beta 1.0.9 · [`64-wave-mobile-beta-1.0.9-resume.apk`](beta/64-wave-mobile-beta-1.0.9-resume.apk): 1.0.9: back where you left off (last page, song position, full-screen player)
- **Test 63** · Wave Mobile Beta 1.0.9 · [`63-wave-mobile-beta-1.0.9-quality-14sp.apk`](beta/63-wave-mobile-beta-1.0.9-quality-14sp.apk): 1.0.9: quality line at 14 sp with its glow; slider removed
- **Test 62** · Wave Mobile Beta 1.0.9 · [`62-wave-mobile-beta-1.0.9-quality-size.apk`](beta/62-wave-mobile-beta-1.0.9-quality-size.apk): 1.0.9: quality line size slider (Wave tab) and a glow in the quality's colour

## Nov 9

- **Probe 08** · Wave Probe 6 · [`08-wave-probe-6.apk`](probes/08-wave-probe-6.apk): Records every switch on the page with its row and card (for placing Soft pause above Crossfade)
- **Probe 07** · Wave Probe 5 · [`07-wave-probe-5.apk`](probes/07-wave-probe-5.apk): Records Tidal's settings commands (audio quality) in full
- **Probe 06** · Wave Probe 4.1 · [`06-wave-probe-4.1.apk`](probes/06-wave-probe-4.1.apk): Records the heart's command in full
- **Probe 05** · Wave Probe 4 · [`05-wave-probe-4.apk`](probes/05-wave-probe-4.apk): Records what Tidal's heart button sends (rebuilt)
- **Probe 04** · Wave Probe 3.1 · [`04-wave-probe-3.1.apk`](probes/04-wave-probe-3.1.apk): Shares the log as a file (rebuilt)
- **Probe 03** · Wave Probe 3 · [`03-wave-probe-3.apk`](probes/03-wave-probe-3.apk): Phone width; records how the settings page is built (rebuilt)
- **Probe 02** · Wave Probe 2 · [`02-wave-probe-2.apk`](probes/02-wave-probe-2.apk): Records the commands Tidal's player buttons send
- **Test 61** · Wave Mobile Beta 1.0.9 · [`61-wave-mobile-beta-1.0.9-soft-pause-switch.apk`](beta/61-wave-mobile-beta-1.0.9-soft-pause-switch.apk): 1.0.9: 800 ms fades in 200 steps; Soft pause switch above Tidal's Crossfade (General tab)
- **Test 60** · Wave Mobile Beta 1.0.9 · [`60-wave-mobile-beta-1.0.9-fade-steps.apk`](beta/60-wave-mobile-beta-1.0.9-fade-steps.apk): 1.0.9 with sliders for the fade lengths and their number of volume steps
- **Test 59** · Wave Mobile Beta 1.0.9 · [`59-wave-mobile-beta-1.0.9-fade-sliders.apk`](beta/59-wave-mobile-beta-1.0.9-fade-sliders.apk): 1.0.9 with fade-out and fade-in sliders (ms) in the Wave tab, for trying fade lengths
- **Test 58** · Wave Mobile Beta 1.0.9 · [`58-wave-mobile-beta-1.0.9-analyzer-as-1.0.8.apk`](beta/58-wave-mobile-beta-1.0.9-analyzer-as-1.0.8.apk): 1.0.9 with soft pause; the analyzer works as in 1.0.8 again (the delayed release made it freeze on pause)
- **Test 57** · Wave Mobile Beta 1.0.9 · [`57-wave-mobile-beta-1.0.9-soft-pause.apk`](beta/57-wave-mobile-beta-1.0.9-soft-pause.apk): 1.0.9: pause fades out (and waits for the output) before stopping, play fades in — no click
- **Test 56** · Wave Mobile Beta 1.0.9 · [`56-wave-mobile-beta-1.0.9-no-click.apk`](beta/56-wave-mobile-beta-1.0.9-no-click.apk): 1.0.9: no click when playback stops (the analyzer's capture is released a few seconds later)
- **Test 55** · Wave Mobile Beta 1.0.9 · [`55-wave-mobile-beta-1.0.9-colours.apk`](beta/55-wave-mobile-beta-1.0.9-colours.apk): 1.0.9 with Tidal's colour and glow on each picked quality
- **Test 54** · Wave Mobile Beta 1.0.9 · [`54-wave-mobile-beta-1.0.9.apk`](beta/54-wave-mobile-beta-1.0.9.apk): Separate audio quality on Wi-Fi and on mobile data (General tab)
- **Test 53** · Wave Mobile Beta 1.0.8 · [`53-wave-mobile-beta-1.0.8.apk`](beta/53-wave-mobile-beta-1.0.8.apk): First Wave Beta: Android Auto heart, played-this-round list (as released)
- **Test 52** · Wave for TV 2.0.4 · [`52-wave-2.0.4-test-2.apk`](beta/52-wave-2.0.4-test-2.apk): TV 2.0.4 with the mobile fixes and features (as released)
- **Test 51** · Wave Mobile 1.0.7 · [`51-wave-mobile-1.0.7.apk`](beta/51-wave-mobile-1.0.7.apk): Wave tab in Tidal's settings (rebuilt from its commit)
- **Test 50** · Wave for TV 2.0.4 · [`50-wave-2.0.4-test-1.apk`](beta/50-wave-2.0.4-test-1.apk): First TV 2.0.4 test (rebuilt: same code as Wave Mobile 1.0.6)
- **Test 49** · Wave Mobile 1.0.6 · [`49-wave-mobile-1.0.6.apk`](beta/49-wave-mobile-1.0.6.apk): Tap to play, stream quality, fair shuffle switch, bars (rebuilt from its commit)
- **Test 48** · Wave Mobile 1.0.5 · [`48-wave-mobile-1.0.5.apk`](beta/48-wave-mobile-1.0.5.apk): Controls after a phone call; analyzer and Android Auto (rebuilt from its commit)
- **Test 47** · Wave Mobile 1.0.4 · [`47-wave-mobile-1.0.4.apk`](beta/47-wave-mobile-1.0.4.apk): Buttons send Tidal's own player commands (rebuilt from its commit)
- **Test 46** · Wave Mobile 1.0.3 · [`46-wave-mobile-1.0.3.apk`](beta/46-wave-mobile-1.0.3.apk): Notification buttons use the player bar's buttons
- **Test 45** · Wave Mobile 1.0.2 · [`45-wave-mobile-1.0.2.apk`](beta/45-wave-mobile-1.0.2.apk): Song, artist, cover, progress in the notification
- **Test 44** · Wave Mobile 1.0.1 · [`44-wave-mobile-1.0.1.apk`](beta/44-wave-mobile-1.0.1.apk): Media notification

## Nov 8

- **Probe 01** · Wave Probe 1 · [`01-wave-probe-1.apk`](probes/01-wave-probe-1.apk): Logs the kinds of request Tidal's page makes (desktop width)
- **Test 43** · Wave Mobile 2.1.6 · [`43-wave-mobile-2.1.6.apk`](beta/43-wave-mobile-2.1.6.apk): Analyzer stops before the E badge; Android Auto connection
- **Test 42** · Wave for TV 2.1.6 · [`42-wave-2.1.6.apk`](beta/42-wave-2.1.6.apk): Analyzer stops before the E badge
- **Test 41** · Wave Mobile 2.1.5 · [`41-wave-mobile-2.1.5.apk`](beta/41-wave-mobile-2.1.5.apk): Shows as "Wave" in the app drawer
- **Test 40** · Wave Mobile 2.1.4 · [`40-wave-mobile-2.1.4.apk`](beta/40-wave-mobile-2.1.4.apk): Frequency scale starts where the measurement does
- **Test 39** · Wave for TV 2.1.4 · [`39-wave-2.1.4.apk`](beta/39-wave-2.1.4.apk): Frequency scale starts where the measurement does
- **Test 38** · Wave Mobile 2.1.3 · [`38-wave-mobile-2.1.3.apk`](beta/38-wave-mobile-2.1.3.apk): The lowest bar moves again
- **Test 37** · Wave for TV 2.1.3 · [`37-wave-2.1.3.apk`](beta/37-wave-2.1.3.apk): The lowest bar moves again
- **Test 36** · Wave Mobile 2.1.2 · [`36-wave-mobile-2.1.2.apk`](beta/36-wave-mobile-2.1.2.apk): Analyzer between the song text and the buttons
- **Test 35** · Wave Mobile 2.1.1 · [`35-wave-mobile-2.1.1.apk`](beta/35-wave-mobile-2.1.1.apk): Phone-width page
- **Test 34** · Wave Mobile 2.1.0 · [`34-wave-mobile-2.1.0.apk`](beta/34-wave-mobile-2.1.0.apk): First Wave Mobile: swipes, Android Auto
- **Test 33** · Wave for TV 2.1.0 · [`33-wave-2.1.0.apk`](beta/33-wave-2.1.0.apk): TV build alongside the first Wave Mobile
- **Test 32** · Wave for TV 2.0.3 · [`32-wave-2.0.3.apk`](beta/32-wave-2.0.3.apk): 2.0.2 + pause before switching (as released)
- **Test 31** · Wave for TV 2.0.4 · [`31-wave-2.0.4-test-D.apk`](beta/31-wave-2.0.4-test-D.apk): Test D: pause before switching songs (the fix)
- **Test 30** · Wave for TV 2.0.4 · [`30-wave-2.0.4-test-C.apk`](beta/30-wave-2.0.4-test-C.apk): Test C: OK clicks like a mouse
- **Test 29** · Wave for TV 2.0.4 · [`29-wave-2.0.4-test-X2.apk`](beta/29-wave-2.0.4-test-X2.apk): Test X2: no analyzers
- **Test 28** · Wave for TV 2.0.4 · [`28-wave-2.0.4-test-X1.apk`](beta/28-wave-2.0.4-test-X1.apk): Test X1: Wave leaves Tidal's player alone
- **Test 27** · Wave for TV 2.0.4 · [`27-wave-2.0.4-test-wait.apk`](beta/27-wave-2.0.4-test-wait.apk): Switching songs waits for the new song (not released; the later 2.0.4 is different)
- **Test 26** · Wave for TV 2.0.3 · [`26-wave-2.0.3-test-B.apk`](beta/26-wave-2.0.3-test-B.apk): Test B: nothing blocked
- **Test 25** · Wave for TV 2.0.3 · [`25-wave-2.0.3-test-A.apk`](beta/25-wave-2.0.3-test-A.apk): Test A: cookie banner not blocked
- **Test 24** · Wave for TV 2.0.2 · [`24-wave-2.0.2.apk`](beta/24-wave-2.0.2.apk): The player opens only once the song has started
- **Test 23** · Wave for TV 2.0.1 · [`23-wave-2.0.1.apk`](beta/23-wave-2.0.1.apk): Fair shuffle waits for Tidal before jumping (progress stuck at 0:00 fix)
- **Test 22** · Wave for TV 1.3.0 · [`22-wave-1.3.0.apk`](beta/22-wave-1.3.0.apk): Player opens on a pick, ring to play/pause, ring in the cover colour
- **Test 21** · Wave for TV 1.2.2 · [`21-wave-1.2.2.apk`](beta/21-wave-1.2.2.apk): Recovers when the page's process dies; crash log
- **Test 20** · Wave for TV 1.2.1 · [`20-wave-1.2.1.apk`](beta/20-wave-1.2.1.apk): Player-bar analyzer hides while the full-screen player is open
- **Test 19** · Wave for TV 1.2.0 · [`19-wave-1.2.0.apk`](beta/19-wave-1.2.0.apk): Second, solid analyzer in the player bar
- **Test 18** · Wave for TV 1.1.4 · [`18-wave-1.1.4.apk`](beta/18-wave-1.1.4.apk): Analyzer over the cover, 30%, cover colours
- **Test 17** · Wave for TV 1.1.3 · [`17-wave-1.1.3.apk`](beta/17-wave-1.1.3.apk): Analyzer placed using Tidal's player layout
- **Test 16** · Wave for TV 1.1.2 · [`16-wave-1.1.2.apk`](beta/16-wave-1.1.2.apk): No full-screen button; tracking and cookie banner blocked
- **Test 15** · Wave for TV 1.1.1 · [`15-wave-1.1.1.apk`](beta/15-wave-1.1.1.apk): Analyzer fixes, sent with the first Wave Probe
- **Test 14** · Wave for TV 1.1.0 · [`14-wave-1.1.0.apk`](beta/14-wave-1.1.0.apk): Spectrum analyzer
- **Test 13** · Wave for TV 1.0.0 · [`13-wave-1.0.0.apk`](beta/13-wave-1.0.0.apk): 1.0.0 with the session's debug key
- **Test 12** · Wave for TV 0.11.2 · [`12-wave-0.11.2.apk`](beta/12-wave-0.11.2.apk): "N of X played" messages; autoplay no longer breaks the round
- **Test 11** · Wave for TV 0.11.1 · [`11-wave-0.11.1.apk`](beta/11-wave-0.11.1.apk): Fair shuffle rebuilt on Tidal's own play queue
- **Test 10** · Wave for TV 0.11 · [`10-wave-0.11.apk`](beta/10-wave-0.11.apk): Fair shuffle (built from 0.10.5)
- **Test 09** · Wave for TV 0.10.5 · [`09-wave-0.10.5.apk`](beta/09-wave-0.10.5.apk): Faster ring navigation
- **Test 08** · Wave for TV 0.10.4 · [`08-wave-0.10.4.apk`](beta/08-wave-0.10.4.apk): Holding a direction counts as one press
- **Test 07** · Wave for TV 0.10.3 · [`07-wave-0.10.3.apk`](beta/07-wave-0.10.3.apk): Fixes the ring not showing and OK doing nothing
- **Test 06** · Wave for TV 0.10.2 · [`06-wave-0.10.2.apk`](beta/06-wave-0.10.2.apk): The keyboard's Search key just closes the keyboard
- **Test 05** · Wave for TV 0.10.1 · [`05-wave-0.10.1.apk`](beta/05-wave-0.10.1.apk): The ring redraws when the page changes
- **Test 04** · Wave for TV 0.10 · [`04-wave-0.10.apk`](beta/04-wave-0.10.apk): Highlight ring
- **Test 03** · Wave for TV 0.9.1 · [`03-wave-0.9.1.apk`](beta/03-wave-0.9.1.apk): 0.9 signed with the session's debug key
- **Test 02** · Wave for TV 0.8 · [`02-wave-0.8-test.apk`](beta/02-wave-0.8-test.apk): Tidal's web player in a WebView: background playback fix
- **Test 01** · Wave for TV 0.3 · [`01-wave-0.3-test.apk`](beta/01-wave-0.3-test.apk): Plays through Tidal's official API with Widevine (the API only allowed previews; replaced by the web player)
