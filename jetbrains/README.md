# CodeTimeStamper for JetBrains IDEs

The IntelliJ Platform half of CodeTimeStamper. Writes the **same**
`~/.codetimestamper/YYYY-MM-DD.jsonl` lines as the VS Code extension, so the
daily total covers IntelliJ, VS Code, Antigravity, Cursor and the rest in one
number — and the CLI (`codetimestamper`) renders it.

Verified on IntelliJ IDEA 2026.2.2 (IU-262.10315.125) with JBR 25. Requires build
243 (2024.3) or newer.

## Build

No Gradle and no SDK download: the IDE already on disk **is** the SDK.

```bash
./build.sh                 # IDEA_HOME=~/.local/opt/idea by default
```

That compiles against `$IDEA_HOME/lib/*.jar`, runs the tests, and writes
`build/codetimestamper-jetbrains.zip`.

Two things are worth knowing, both measured rather than assumed:

- **Compile with the IDE's own JBR** (`$IDEA_HOME/jbr/bin/javac`). The platform
  jars are Java 25 bytecode; a Java 21 `javac` cannot even read them and fails
  with `class file has wrong version 69.0, should be 65.0`. `--release 21` is
  kept so the plugin also loads on an IDE running JBR 21.
- **`jar` is not in the JBR.** A JAR is a ZIP, so the build uses `zip` with a
  hand-written `META-INF/MANIFEST.MF`.

The version in `plugin.xml` is stamped from the repo's `package.json`, so the two
plugins cannot drift apart.

## Install

*Settings → Plugins → ⚙ → Install Plugin from Disk…* → pick the ZIP, then restart.

Or drop it in place, which is what that dialog does:

```bash
unzip -q build/codetimestamper-jetbrains.zip -d ~/.config/JetBrains/IntelliJIdea*/plugins/
```

## Verify without touching your own profile

```bash
./verify.sh                # runs on DISPLAY=:99, nothing on your screen
```

It starts a sandboxed IntelliJ (config, system, log and data dir all under
`/tmp/cts-jb-verify`), waits for the plugin to say it is alive, prints the two log
lines that prove it, then shuts the IDE down. Expected:

```
INFO - AppStarter - Loaded custom plugins: CodeTimeStamper (0.1.1)
INFO - CodeTimeStamper - aktiv i IntelliJ IDEA, skriver till /tmp/cts-jb-verify/data
```

The data dir stays empty in that run and that is correct: a headless session with
no input has no activity to count. The writing itself is covered by the unit
tests, and the wiring is the log line above.

## How it is hooked

| | |
| --- | --- |
| `ApplicationInitializedListenerJavaShim` | The platform's own Java shim for its coroutine-based initialisation listener. Subclass it, implement `componentsInitialized()`. |
| `IdeEventQueue.addActivityListener` | Real user input — keys and mouse. Not deprecated. **`addIdleListener` is** (`Use IdleTracker and coroutines`), so the idle threshold is the same explicit state machine the VS Code side uses, and the two editors cannot disagree about what "active" means. |
| JVM shutdown hook | Closes the open session on exit. `AppLifecycleListener.appClosing()` exists, but no extension point for it is declared in this build (searched, not assumed), and a shutdown hook is stdlib. A SIGKILL still leaves an interrupted session — the report flags it and it is not counted. |
| `applicationService` + `@State` | `idleMinutes` and `enabled`, stored in `codetimestamper.xml` in the IDE config dir. No settings UI yet. |

## Tests

`./build.sh` runs them; CI runs them too, since the tracker has no platform
imports and needs no IDE jars:

```bash
javac -d build/classes-logic src/codetimestamper/Tracker.java test/codetimestamper/TrackerTest.java
java -cp build/classes-logic codetimestamper.TrackerTest
```
