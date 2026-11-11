# Wave test builds and probes

Every test build and probe app made while building Wave, kept here and published on the
[Beta](https://github.com/Trevor792221/Wave/releases/tag/beta) and
[Probes](https://github.com/Trevor792221/Wave/releases/tag/probes) pages.

- [CHANGELOG.md](CHANGELOG.md): every test build and probe, newest first, with what changed in it.
- [`beta/`](beta): test builds of Wave for TV (`wave-…`) and Wave Mobile (`wave-mobile-…`), numbered in the order
  they were made. See [beta/NOTES.md](beta/NOTES.md) for what each one tested.
- [`probes/`](probes): Wave Probe versions. See [probes/NOTES.md](probes/NOTES.md). The probe's source is on `main` in
  `probes/wave-probe`.

These are signed with a local debug key (not the release key), and until Wave Mobile 1.0.8 they used the official
app ids, so they install over each other but not over an official release. A few builds marked *rebuilt* were
built again from the exact code they came from because the original file had been overwritten. Builds whose files
were lost and whose code wasn't kept anywhere aren't here (see the notes).

Pushing to this branch publishes the files (the **Publish test builds** workflow). Test builds made from `main`
are added by the **Beta and probes** workflow there.
