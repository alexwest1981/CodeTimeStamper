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
extension, same API. IntelliJ and other JetBrains IDEs have their own plugin in
this repo ([`jetbrains/`](jetbrains/)), which writes the same log so the totals
merge.

Requires VS Code **1.80 or newer**, or a fork based on it. Nothing else: no
Node, no compiler, no build step — the extension is plain JavaScript with zero
dependencies.

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
> If you would rather not touch a terminal, *Extensions → ⋯ → Install from
> VSIX…* works everywhere and is the same thing.

**From source** — no dependencies and no build step, just plain JS:

```bash
git clone https://github.com/alexwest1981/CodeTimeStamper
cd CodeTimeStamper
npm test                # 18 checks
npm run package         # -> codetimestamper.vsix
```

Then restart the editor. The timer activates on startup, and a clock in the
status bar shows today's total — click it for the report.

**JetBrains IDEs** — download `codetimestamper-jetbrains.zip` from the same
release and use *Settings → Plugins → ⚙ → Install Plugin from Disk…*, then
restart. Built and verified on IntelliJ IDEA 2026.2.2; see
[`jetbrains/README.md`](jetbrains/README.md) for the build (no Gradle, no SDK
download — the installed IDE is the SDK).

## What it measures

Only timestamps and the editor's name. No workspace, no file names, no
keystrokes, no network. Everything lands in `.codetimestamper/` in your home
directory:

| | |
| --- | --- |
| Linux | `~/.codetimestamper/` |
| macOS | `~/.codetimestamper/` |
| Windows | `%USERPROFILE%\.codetimestamper\` |

```
2026-09-23.jsonl        raw, one line per event
rapport/2026-09-23.md   finished daily report
```

**Your data is the folder.** Delete `.codetimestamper/` and it is gone; there is
no account, no sync and no copy anywhere else. Uninstalling the extension leaves
the folder alone (deliberately — otherwise you would lose your history on an
upgrade); `CodeTimeStamper: Öppna datamappen` opens it for you.

Remote-SSH, dev containers and Codespaces are *not tested*. On a remote window
the extension host runs on the far side, so the folder ends up in that machine's
home directory rather than yours.

### One total, per editor

Every editor appends to the same folder, so you get one daily total with a
breakdown:

```markdown
# CodeTimeStamper — tis 2026-09-23

**Total: 3 h 53 min**

| Editor | Tid |
| --- | --- |
| Google Antigravity | 1 h 55 min |
| Visual Studio Code | 1 h 28 min |
| Cursor | 30 min |
```

Each editor measures itself, so the total is the **sum of measured editor time**.
Run two editors side by side and those overlapping minutes are counted twice —
the per-editor rows stay exact. Nothing can tell that the same person is at the
keyboard twice, and guessing would mean inspecting your windows.

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

Three ways in:

- `CodeTimeStamper: Visa rapport` in the command palette — today, yesterday or
  the last 7 days, opened as a Markdown preview.
- The status bar clock showing the live total; click it.
- A finished day's report is written automatically the next time the editor runs.

And a CLI that reads the same files:

```bash
ln -s "$PWD/bin/codetimestamper.js" ~/.local/bin/codetimestamper   # once, from the repo
```

```bash
codetimestamper                 # today
codetimestamper 2026-09-22      # a date
codetimestamper --vecka         # last seven days
codetimestamper --dagar         # every stored day
codetimestamper --json [date]   # raw JSON rather than Markdown
codetimestamper --help
```

Replace `~/.local/bin` with anything on your `PATH`; on Windows, run it with
`node bin\codetimestamper.js` instead — the symlink is a Unix thing.

## Settings

| Setting | Default | |
| --- | --- | --- |
| `codetimestamper.idleMinutes` | `10` | minutes without activity before the timer pauses |
| `codetimestamper.enabled` | `true` | turn measuring off without uninstalling |

## Language

The command palette entries, settings and generated reports are currently in
Swedish, the author's language. Say so in an issue if you want English.

## How it is verified

Two layers, both plain `node` and `assert`, no test framework:

```bash
node test/test.js               # 6 — the pure timer/report logic
node test/extension-harness.js  # 12 — extension.js against a stubbed host API
```

`npm test` runs both. CI runs them on Node 20 and 22 and packages the `.vsix`.

Activation in a real editor is measured too, not assumed: launching VS Code
against a temporary profile logs
`ExtensionService#_doActivateExtension … activationEvent: 'onStartupFinished'`,
and the run's output file is checked. "It packaged" and "it is installed" are not
evidence that it ran.

MIT licensed.
