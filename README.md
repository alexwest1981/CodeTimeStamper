# CodeTimeStamper

[![test](https://github.com/alexwest1981/CodeTimeStamper/actions/workflows/test.yml/badge.svg)](https://github.com/alexwest1981/CodeTimeStamper/actions/workflows/test.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

How much of the day did you actually spend writing code? One number per day,
measured inside the editor. No account, no server, no telemetry — the timer
writes timestamps to a file on your own machine and nothing else.

The timer starts when the editor opens, pauses after 30 minutes without
activity, and continues on your next keystroke. It runs up to the threshold: a
twenty-nine-minute silence counts, the thirtieth ends the session.

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
release, then *Settings → Plugins → ⚙ → Install Plugin from Disk…*, pick the ZIP
and restart. **No build step** — the ZIP is self-contained. Declares IntelliJ
Platform 243 (2024.3) as its floor, measured on IntelliJ IDEA 2026.2.2. For the
build itself (contributors only) see
[`jetbrains/README.md`](jetbrains/README.md).

Nothing needs switching on in either half. In a JetBrains IDE the counter sits
in the status bar at the bottom (`Kodtid 2 h 15 min`), updates every 30 seconds
and opens today's report when clicked. If you prefer the file dialog's
equivalent — unzipping by hand — there is **no single path to paste**: on Linux
a plugin goes in `~/.local/share/JetBrains/<Product><Version>/`, on macOS and
Windows in `<config>/plugins/`, and `<Product><Version>` differs per IDE and
version. Your own IDE states the value it uses at startup:

```bash
grep -oP 'idea\.plugins\.path=\K.*' ~/.cache/JetBrains/*/log/idea.log | tail -1
```

The *Install Plugin from Disk…* dialog writes to exactly that directory for you,
which is why it is the recommended route.

## What it measures

Timestamps, the editor's name, and the **project folder's name** — the basename
only, never the path. No file names, no keystrokes, no network.
`codetimestamper.recordProject` (VS Code and forks) and `recordProject` in
`codetimestamper.xml` (JetBrains) turn the project name off, leaving timestamps
and the editor's name. Everything lands in `.codetimestamper/` in your home
directory:

| | |
| --- | --- |
| Linux | `~/.codetimestamper/` |
| macOS | `~/.codetimestamper/` |
| Windows | `%USERPROFILE%\.codetimestamper\` |

```
2026-09-23.jsonl        raw, one line per event
```

(Reports are not kept here — see *The folder you actually read* below.)

A line looks like this, and nothing else is ever written:

```json
{"ide":"VS Code","t":"seg","start":1789974000000,"end":1789979400000,"w":"Momento"}
{"ide":"VS Code","t":"beat","start":1789974000000,"ts":1789979700000}
```

`t` is `open`, `seg` or `beat`; `beat` is the 30-second heartbeat (see *What
counts as activity*), and it carries no project name — the name rides on the
session's own lines.

### The folder you actually read

The raw log is machine food, so it stays hidden. The reports are what you open,
and they live in a normal folder:

| | |
| --- | --- |
| Linux, macOS | `~/Documents/CodeTimeStamper/` |
| Windows | `%USERPROFILE%\Documents\CodeTimeStamper\` |

```
CodeTimeStamper.md      one file: today's sessions and the month so far
2026-09-23.md           a finished day, written the next time an editor runs
```

`CodeTimeStamper.md` is rewritten whenever a session ends, so it is current when
you open it — which projects got the time, and when. `CodeTimeStamper: Öppna
rapportmappen` opens the folder.

The log is never moved: reports are generated from it, so they can be rewritten
at any time, and moving it would strand the history of anyone who already has a
log. `CODETIMESTAMPER_OUT` points the readable folder somewhere else.

**Your data is the folder.** Delete `.codetimestamper/` and it is gone; there is
no account, no sync and no copy anywhere else. Uninstalling the extension leaves
the folder alone (deliberately — otherwise you would lose your history on an
upgrade); `CodeTimeStamper: Öppna datamappen` opens it for you.

Remote-SSH, dev containers and Codespaces are *not tested*. On a remote window
the extension host runs on the far side, so the folder ends up in that machine's
home directory rather than yours.

### One total, per editor and per project

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

| Projekt | Tid |
| --- | --- |
| Momento | 1 h 52 min |
| Systemarkitektur | 45 min |
| (okänt) | 1 h 16 min |
```

`(okänt)` is time logged with `recordProject` off, or by a version older than
0.1.3 when the project name did not exist yet.

Each editor measures itself, so the total is the **sum of measured editor time**.
Run two editors side by side and those overlapping minutes are counted twice —
the per-editor rows stay exact. Nothing can tell that the same person is at the
keyboard twice, and guessing would mean inspecting your windows.

### What counts as activity

Typing, selecting, **scrolling**, switching editors, saving, terminal, debug.
Scrolling is deliberate: without it, half an hour of reading code would look like
idle time. Signals from an unfocused window are ignored, so an agent or formatter
writing files in the background cannot keep the timer alive all night.

A session that never closed (the editor was killed) is counted up to its last
heartbeat: every 30 seconds while a session is open, a `beat` line records that
it was still alive. A crash therefore loses at most half a minute instead of the
whole session. A session killed within 30 seconds of its first keystroke has no
heartbeat yet — it is listed in the report as interrupted and not counted.

*Known ceiling:* every pause is credited up to the threshold, so a day of many
short sessions over-reports by up to 30 minutes per session. That is the
definition of "pauses after 30 minutes", not a bug — the wide threshold is what
keeps a detour into the browser inside the same session. `idleMinutes` changes it.

## Reports

Three ways in:

- `~/Documents/CodeTimeStamper/CodeTimeStamper.md` — today and the month so far,
  rewritten as sessions end. No command needed.
- `CodeTimeStamper: Visa rapport` in the command palette — today, yesterday, the
  last 7 days, this month or this year, opened as a Markdown preview.
- The status bar clock showing the live total; click it.

A single day lists its sessions with the project each one belonged to. The
week, month and year reports add up per editor, **per project** and per day
(per month for a year):

```markdown
# CodeTimeStamper — september 2026

**Total: 42 h 10 min** över 18 dagar med tid

| Editor | Tid |
| --- | --- |
| Google Antigravity | 30 h 4 min |
| IntelliJ IDEA | 12 h 6 min |

| Projekt | Tid |
| --- | --- |
| Momento | 22 h 40 min |
| Systemarkitektur | 19 h 30 min |

| Dag | Tid |
| --- | --- |
| 2026-09-23 | 3 h 53 min |
```

And a CLI that reads the same files:

```bash
ln -s "$PWD/bin/codetimestamper.js" ~/.local/bin/codetimestamper   # once, from the repo
```

```bash
codetimestamper                    # today
codetimestamper 2026-09-22         # a date
codetimestamper --vecka            # last seven days
codetimestamper --manad [2026-09]  # the whole month, day by day
codetimestamper --ar [2026]        # the whole year, month by month
codetimestamper --dagar            # every stored day
codetimestamper --json [date]      # raw JSON rather than Markdown
codetimestamper --help
```

Replace `~/.local/bin` with anything on your `PATH`; on Windows, run it with
`node bin\codetimestamper.js` instead — the symlink is a Unix thing.

## Settings

| Setting | Default | |
| --- | --- | --- |
| `codetimestamper.idleMinutes` | `30` | minutes without activity before the timer pauses |
| `codetimestamper.enabled` | `true` | turn measuring off without uninstalling |
| `codetimestamper.recordProject` | `true` | save the project folder's name, so reports can show where the time went. Off = timestamps and the editor's name only |

## Language

The command palette entries, settings and generated reports are currently in
Swedish, the author's language. Say so in an issue if you want English.

## How it is verified

Two layers, both plain `node` and `assert`, no test framework:

```bash
node test/test.js               # 9 — the pure timer/report logic + the shared fixture
node test/extension-harness.js  # 12 — extension.js against a stubbed host API
```

`npm test` runs both (23 checks). CI runs them on Node 20 and 22 and packages
the `.vsix`.

The JetBrains half has its own suite, run by its build script:

```bash
cd jetbrains && ./build.sh      # 23 tracker checks + 15 report checks
```

Its report generator is a second implementation of the same format, so
`test/fixture/` holds one log and one expected report and **both** languages
assert against it. Without that shared fixture the two halves could drift and
the daily total would mean different things depending on which editor you read
it in.

Activation in a real editor is measured too, not assumed: launching VS Code
against a temporary profile logs
`ExtensionService#_doActivateExtension … activationEvent: 'onStartupFinished'`,
and the run's output file is checked. For JetBrains, `jetbrains/verify.sh`
starts a sandboxed IDE and prints the log line its status bar widget writes when
the platform mounts it. "It packaged" and "it is installed" are not evidence
that it ran.

MIT licensed.
