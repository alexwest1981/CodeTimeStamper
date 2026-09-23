# CodeTimeStamper

[![test](https://github.com/alexwest1981/CodeTimeStamper/actions/workflows/test.yml/badge.svg)](https://github.com/alexwest1981/CodeTimeStamper/actions/workflows/test.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

How much of the day did you actually spend writing code? One number per day,
measured inside the editor. No account, no server, no telemetry — the timer
writes timestamps to a file on your own machine and nothing else.

The timer starts when the editor opens, pauses after 10 minutes without
activity, and continues on your next keystroke. It runs up to the threshold: a
nine-minute silence counts, the tenth ends the session.

## Install

Works in VS Code, **Antigravity**, Cursor, Windsurf and VSCodium — one
extension, same API. (IntelliJ and other JetBrains IDEs need a separate plugin;
not written yet.)

**From a release** — download `codetimestamper.vsix` from
[Releases](https://github.com/alexwest1981/CodeTimeStamper/releases), then
either open *Extensions → ⋯ → Install from VSIX…* in the editor, or run the
line for your editor:

```bash
code --install-extension codetimestamper.vsix                  # VS Code
cursor --install-extension codetimestamper.vsix                # Cursor
~/.local/opt/antigravity/bin/antigravity-ide --install-extension codetimestamper.vsix   # Antigravity
```

> Antigravity: use the CLI script above, not `antigravity`. The app binary
> accepts `--install-extension`, prints nothing and exits 0 without installing.

**From source** — no dependencies and no build step, just plain JS:

```bash
git clone https://github.com/alexwest1981/CodeTimeStamper
cd CodeTimeStamper
npm test                # 18 checks
npm run package         # -> codetimestamper.vsix
```

Then restart the editor. The timer activates on startup, and a clock in the
status bar shows today's total — click it for the report.

## What it measures

Only timestamps and the editor's name. No workspace, no file names, no
keystrokes, no network. Everything lands in `~/.codetimestamper/`:

```
~/.codetimestamper/2026-09-23.jsonl        raw, one line per event
~/.codetimestamper/rapport/2026-09-23.md   finished daily report
```

Every editor appends to the same folder, so the daily total covers all of them
at once, broken down per editor:

```markdown
# CodeTimeStamper — tis 2026-09-23

**Total: 3 h 53 min**

| Editor | Tid |
| --- | --- |
| Google Antigravity | 1 h 55 min |
| Visual Studio Code | 1 h 28 min |
| Cursor | 30 min |
```

### What counts as activity

Typing, selecting, **scrolling**, switching editors, saving, terminal, debug.
Scrolling is deliberate: without it, ten minutes of reading code would look like
idle time. Signals from an unfocused window are ignored, so an agent or formatter
writing files in the background cannot keep the timer alive all night.

A session that never closed (the editor crashed) is not counted; it is listed in
the report as interrupted instead.

*Known ceiling:* a nine-minute silence is credited, so a day of many short
sessions over-reports by up to ten minutes per session. That is the definition of
"pauses after 10 minutes", not a bug. `idleMinutes` changes it.

## Reports

`CodeTimeStamper: Visa rapport` in the command palette (today / yesterday / last
7 days), a status bar clock showing the live total, and a CLI:

```bash
ln -s "$PWD/bin/codetimestamper.js" ~/.local/bin/codetimestamper   # once
codetimestamper              # today
codetimestamper 2026-09-22   # a date
codetimestamper --vecka      # last seven days
codetimestamper --dagar      # every stored day
```

A finished day's report is written automatically the next time the editor runs.

## Settings

| Setting | Default | |
| --- | --- | --- |
| `codetimestamper.idleMinutes` | `10` | minutes without activity before the timer pauses |
| `codetimestamper.enabled` | `true` | turn measuring off without uninstalling |

## Language

The command palette entries, settings and generated reports are currently in
Swedish, the author's language. Say so in an issue if you want English.

## How it is verified

Two layers, both plain `node` and `assert`:

```bash
node test/test.js               # 6 — the pure timer/report logic
node test/extension-harness.js  # 12 — extension.js against a stubbed host API
```

Activation in a real editor is measured too, not assumed: launching VS Code with
a temporary profile logs
`ExtensionService#_doActivateExtension … activationEvent: 'onStartupFinished'`.

MIT licensed.
