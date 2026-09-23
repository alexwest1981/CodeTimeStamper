# CodeTimeStamper for JetBrains IDEs

The IntelliJ Platform half of CodeTimeStamper. It writes the **same**
`~/.codetimestamper/YYYY-MM-DD.jsonl` lines as the VS Code extension, so the
daily total covers IntelliJ, VS Code, Antigravity, Cursor and the rest in one
number — rendered by the extension, the CLI (`codetimestamper`) or the
automatically written daily report.

## Install

**You do not need to build anything.** Download `codetimestamper-jetbrains.zip`
from the [latest release](https://github.com/alexwest1981/CodeTimeStamper/releases),
then use *Settings → Plugins → ⚙ → Install Plugin from Disk…* → pick the ZIP →
restart. That dialog is the portable route, and it is all you need.

Unzipping by hand does exactly the same thing, but there is **no single
directory to paste**: the plugin root is whatever `idea.plugins.path` says. On
Linux that is `~/.local/share/JetBrains/<Product><Version>/` — the *data*
directory, not `~/.config/JetBrains/<Product><Version>/plugins` — and on macOS
and Windows it is `<config>/plugins/`. Your IDE prints the value it uses at
startup:

```bash
grep -oP 'idea\.plugins\.path=\K.*' ~/.cache/JetBrains/*/log/idea.log | tail -1
```

Extract the ZIP into that directory, so you end up with
`<plugins.path>/CodeTimeStamper/lib/codetimestamper.jar`.

## Where you see it

**Nothing to switch on.** The counter appears in the status bar at the bottom
(`Kodtid 2 h 15 min`), beside the memory indicator, in every window with a
project open. It refreshes every 30 seconds, shows ` (pausad)` while the timer
is paused, and opens today's report in an editor tab when clicked.

There is no tool window and no settings page — `idleMinutes` and `enabled` live
in `codetimestamper.xml` in the IDE config dir, and the file only appears once
you change something.

Requires IntelliJ Platform **243 (2024.3) or newer** — that floor is what
`plugin.xml` declares (the APIs used are older than it); the build is *measured*
only on IntelliJ IDEA 2026.2.2 (IU-262.10315.125) with JBR 25. Works in any
JetBrains IDE, not just IDEA.

Not sure it loaded? *Help → Show Log in Files*, and look for:

```
INFO - AppStarter - Loaded custom plugins: CodeTimeStamper (0.1.2)
INFO - CodeTimeStamper - aktiv i IntelliJ IDEA, skriver till /home/you/.codetimestamper
INFO - CodeTimeStamper - räknaren monterad i statusraden: "Kodtid 1 h 45 min"
```

## Building it yourself

Only needed if you change the code. No Gradle and no SDK download: the IDE
already on disk **is** the SDK.

```bash
./build.sh                       # finds your IDE automatically
IDEA_HOME=/opt/idea ./build.sh   # or point it at a specific one
```

Compiles against `$IDEA_HOME/lib/*.jar`, runs the tests, writes
`build/codetimestamper-jetbrains.zip`. The IDE is discovered in `~/.local/opt`,
Toolbox, `/opt`, `/usr/share`, snap, flatpak and `/Applications`; the version is
read from `../package.json` with `grep`, so **Node is not needed** — only the
IDE's own JBR, `zip` and `unzip`.

Three things that bite, all measured:

- **Compile with the IDE's own JBR** (`$IDEA_HOME/jbr/bin/javac`), not the system
  JDK. Platform jars are Java 25 bytecode, so a Java 21 `javac` cannot even read
  them and fails with `class file has wrong version 69.0, should be 65.0`.
  `--release 21` is kept so the plugin also loads on an IDE running JBR 21.
- **`jar` is not in the JBR.** A JAR is a ZIP, so the build uses `zip` with a
  hand-written `META-INF/MANIFEST.MF`.
- **The version in `plugin.xml` is stamped from `../package.json`**, so the two
  plugins cannot drift apart.

## Verifying it yourself

```bash
./verify.sh          # headless: proves the plugin loads and writes
GUI=1 ./verify.sh    # in a real (virtual) window: proves the counter mounts
```

Both start a sandboxed IDE (config, system, log and data dir all under
`/tmp/cts-jb-verify`) and your real profile is never touched.

The headless run needs no screen and no Xvfb: the platform initialises plugins
with `-Djava.awt.headless=true` — measured, the plugin is up 4–6 s after launch
with no `DISPLAY` at all. Expected:

```
INFO - AppStarter - Loaded custom plugins: CodeTimeStamper (0.1.2)
INFO - CodeTimeStamper - aktiv i IntelliJ IDEA, skriver till /tmp/cts-jb-verify/data
```

The data dir stays nearly empty there, and that is correct: a session with no
input has no activity to count. The writing itself is covered by the unit tests,
the wiring by the log line.

`GUI=1` is the only mode that can answer "does the counter show?". A status bar
only exists in a real frame, so it runs the IDE on a virtual X display
(`Xvfb :99`, nothing appears on your screen), opens a scratch project, seeds a
day of log data so the counter has a real number to show, and waits for:

```
INFO - CodeTimeStamper - räknaren monterad i statusraden: "Kodtid 1 h 45 min"
```

Two measured traps: `WAYLAND_DISPLAY` must be unset (JBR otherwise picks Wayland
and the window lands on your real screen instead of `:99`), and **an X server
with no window manager is not enough** — the platform then never builds the
status bar at all (measured: zero `IdeStatusBarImpl` lines in the log, and the
widget is never mounted). Run it on a session that has a compositor, or accept
the headless proof plus this log line from a normal session.

## How it is hooked

| | |
| --- | --- |
| `ApplicationInitializedListenerJavaShim` | The platform's own Java shim for its coroutine-based initialisation listener. Subclass it, implement `componentsInitialized()`. |
| `IdeEventQueue.addActivityListener` | Real user input — keys and mouse. Not deprecated. **`addIdleListener` is** (`Use IdleTracker and coroutines`), so the idle threshold is the same explicit state machine the VS Code side uses, and the two editors cannot disagree about what "active" means. |
| `statusBarWidgetFactory` | The counter in the status bar. `createWidget(Project)` **must** be implemented: the interface's own default throws `AbstractMethodError` (read out of the bytecode with `javap`), while the coroutine variant delegates to it, so one implementation covers both. `isEnabledByDefault()` already returns `true`, which is why the widget appears without anyone enabling it. |
| JVM shutdown hook | Closes the open session on exit. `AppLifecycleListener.appClosing()` exists, but no extension point for it is declared in this build (searched, not assumed), and a shutdown hook is stdlib. A `kill -9` is caught by the heartbeat instead: the session is counted up to its last `beat` line, at most 30 s short. |
| `applicationService` + `@State` | `idleMinutes` and `enabled`, stored in `codetimestamper.xml` in the IDE config dir. No settings UI. |
| `Rapport.java` | The daily markdown, written at startup for finished days and again whenever a session ends. A second implementation of `report.js`'s format, held in place by the shared fixture below. |

## Tests

`./build.sh` runs them; CI runs them too, since the tracker has no platform
imports and needs no IDE jars:

```bash
javac -d build/classes-logic src/codetimestamper/Tracker.java test/codetimestamper/TrackerTest.java
java -cp build/classes-logic codetimestamper.TrackerTest
```

`RapportTest` needs the same, plus `Rapport.java`, and it is the one that keeps
the two halves honest: `../test/fixture/2026-09-21.jsonl` is one day of log, and
`2026-09-21.md` is the report the JavaScript side produces from it. Both suites
assert against those files, so a change to the format on one side fails the
other.

Timestamps in the report are local time, so the fixture is only unambiguous in a
known zone: `build.sh` (and `npm test`) set `TZ=Europe/Stockholm`.
