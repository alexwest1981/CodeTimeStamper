# CodeTimeStamper for JetBrains IDEs

The IntelliJ Platform half of CodeTimeStamper. It writes the **same**
`~/.codetimestamper/YYYY-MM-DD.jsonl` lines as the VS Code extension, so the
daily total covers IntelliJ, VS Code, Antigravity, Cursor and the rest in one
number — rendered by the extension, the CLI (`codetimestamper`) or the
automatically written daily report.

## Install

**You do not need to build anything.** Download `codetimestamper-jetbrains.zip`
from the [latest release](https://github.com/alexwest1981/CodeTimeStamper/releases),
then either

- *Settings → Plugins → ⚙ → Install Plugin from Disk…* → pick the ZIP → restart, or
- unzip it yourself, which is all that dialog does:

```bash
unzip -q codetimestamper-jetbrains.zip -d ~/.config/JetBrains/IntelliJIdea*/plugins/
```

Requires IntelliJ Platform **243 (2024.3) or newer** — that floor is what
`plugin.xml` declares (the APIs used are older than it); the build is *measured*
only on IntelliJ IDEA 2026.2.2 (IU-262.10315.125) with JBR 25. Works in any
JetBrains IDE, not just IDEA.

Not sure it loaded? *Help → Show Log in Files*, and look for:

```
INFO - AppStarter - Loaded custom plugins: CodeTimeStamper (0.1.1)
INFO - CodeTimeStamper - aktiv i IntelliJ IDEA, skriver till /home/you/.codetimestamper
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
./verify.sh
```

Starts a sandboxed IDE (config, system, log and data dir all under
`/tmp/cts-jb-verify`), waits for the plugin to say it is alive, prints the log
lines that prove it, then shuts the IDE down. Expected:

```
INFO - AppStarter - Loaded custom plugins: CodeTimeStamper (0.1.1)
INFO - CodeTimeStamper - aktiv i IntelliJ IDEA, skriver till /tmp/cts-jb-verify/data
```

**It needs no screen and no Xvfb.** The platform initialises plugins headlessly
with `-Djava.awt.headless=true`; measured, the plugin is up 4–6 s after launch
with no `DISPLAY` at all. Nothing is drawn, nothing is shown.

The data dir stays empty in that run, and that is correct: a headless session
with no input has no activity to count. The writing itself is covered by the unit
tests, the wiring by the log line.

## How it is hooked

| | |
| --- | --- |
| `ApplicationInitializedListenerJavaShim` | The platform's own Java shim for its coroutine-based initialisation listener. Subclass it, implement `componentsInitialized()`. |
| `IdeEventQueue.addActivityListener` | Real user input — keys and mouse. Not deprecated. **`addIdleListener` is** (`Use IdleTracker and coroutines`), so the idle threshold is the same explicit state machine the VS Code side uses, and the two editors cannot disagree about what "active" means. |
| JVM shutdown hook | Closes the open session on exit. `AppLifecycleListener.appClosing()` exists, but no extension point for it is declared in this build (searched, not assumed), and a shutdown hook is stdlib. A `kill -9` still leaves an interrupted session — the report flags it and does not count it. |
| `applicationService` + `@State` | `idleMinutes` and `enabled`, stored in `codetimestamper.xml` in the IDE config dir. No settings UI yet. |

## Tests

`./build.sh` runs them; CI runs them too, since the tracker has no platform
imports and needs no IDE jars:

```bash
javac -d build/classes-logic src/codetimestamper/Tracker.java test/codetimestamper/TrackerTest.java
java -cp build/classes-logic codetimestamper.TrackerTest
```
