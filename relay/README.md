# Wave crash relay

A small Cloudflare Worker that turns Wave's crash reports into issues on this repository, so the
app never holds a GitHub token. Wave sends a report only when **Send crash reports
automatically** is on (Settings → Wave tab, off by default), the next time it opens after a crash.

## Setup

1. **GitHub token** (issues only): GitHub → Settings → Developer settings → Personal access tokens →
   Fine-grained tokens → Generate new token. Repository access: only `Trevor792221/Wave`.
   Permissions → Repository → **Issues: Read and write** (nothing else). Copy the token; it only
   goes into Cloudflare.
2. **Worker**: dash.cloudflare.com → Workers & Pages → Create → Worker (e.g. `wave-crash`) →
   Edit code → paste [`worker.js`](worker.js) → Deploy.
3. **Secret**: the Worker → Settings → Variables and Secrets → Add → type *Secret*, name
   `GITHUB_TOKEN`, value: the token. Deploy again.
4. **Label**: create a `crash` label on the repository (Issues → Labels), so reports can be found.
5. **Limits** (recommended): Storage & Databases → KV → Create a namespace (`wave-crash-limits`).
   Then the Worker → Settings → Bindings → Add → KV namespace: variable name `LIMITS`, namespace
   `wave-crash-limits` → Deploy. The relay then takes at most 5 reports a minute from one sender and
   30 a day in all (`PER_SENDER_PER_MINUTE`, `PER_DAY` in worker.js); over that it answers 429 and
   doesn't touch GitHub. Senders are counted by a hash of their address, which isn't stored.
6. Put the Worker's address (`https://wave-crash.<name>.workers.dev/report`) in
   `CrashReports.RELAY_URL` (app/src/main/java/com/wave/tv/CrashReports.java). Wave uses
   `https://wave-crash.trevorgray022.workers.dev/report`.

When the token expires, make a new one and replace the secret.

## What a report contains

The app's name and version, the Android version, the phone's maker and model, and the crash's
stack trace. Addresses lose their query strings and anything like an email address is masked.
The repository is public, so the issues are too.

Repeats of the same crash (same error and the same place in Wave's code) are added to the open
issue as comments instead of opening new ones.
