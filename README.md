# Wave

A small Android TV app (~23 KB, no libraries) for playing Tidal through its web player.

Wave opens Tidal's web player full screen and makes it work with a TV remote. Playback, sign-in and Widevine DRM are all handled by Tidal's own site; Wave only grants the DRM permission to tidal.com pages.

## Remote controls

| Button | Action |
|---|---|
| D-pad | Move the pointer (hold to speed up; push past an edge to scroll) |
| OK | Click (hold for long-press) |
| Back | Go back a page; exits on the first page |
| Menu | Cycle page width (1280 / 1440 / 1600 / 1920 px) |
| Channel ▲▼ / Page ▲▼ | Scroll faster |
| Play/Pause, Next, Previous | Control playback (also works while Wave is in the background) |

Fast-forward and rewind buttons act as Next and Previous.

## Background playback

Music keeps playing when you leave the app or the screen turns off. Wave runs a small foreground service while playing and releases it 10 minutes after playback pauses.

## Building

Requires JDK 17+ and the Android SDK (platform 35).

```sh
./gradlew assembleRelease
```

The APK is written to `app/build/outputs/apk/release/wave-<version>.apk`. Release builds are signed with the local debug key, so they install directly. That is fine for personal use, but it is not a store signing setup.

## Versioning

Set `versionName` and `versionCode` in `app/build.gradle.kts`. When a change to `versionName` lands on `main`, the **Tag version** workflow creates the matching `v<versionName>` tag.
