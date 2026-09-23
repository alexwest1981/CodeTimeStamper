#!/usr/bin/env bash
# Bygger JetBrains-pluginen med javac mot en IDE som redan ligger på disk.
# Ingen Gradle, ingen SDK-nedladdning: IDE:ns lib/*.jar ÄR SDK:n, och IDE:ns
# egen JBR ÄR rätt JDK (plattformens jar:ar är Java 25-bytekod, så en Java
# 21-javac kan inte ens läsa dem — "class file has wrong version 69.0").
#
# IDE:n hittas automatiskt; sätt IDEA_HOME för att peka ut en specifik.
set -euo pipefail
cd "$(dirname "$0")"
. ./ide.sh

OUT=build

IDE=$(find_ide) || { ide_not_found ./build.sh; exit 1; }

for tool in unzip zip; do
    command -v "$tool" >/dev/null || { echo "Saknar '$tool'." >&2; exit 1; }
done

JAVAC="$IDE/jbr/bin/javac"
JAVA="$IDE/jbr/bin/java"

# En källa till versionen: samma som VS Code-extensionen i repots rot.
# Läses med grep, inte med node — den som bara vill bygga pluginen ska inte
# behöva ha node installerat.
VERSION=$(grep -oE '"version"[[:space:]]*:[[:space:]]*"[^"]+"' ../package.json | head -1 | cut -d'"' -f4)
VERSION="${VERSION:-0.0.0}"

rm -rf "$OUT"
mkdir -p "$OUT/classes" "$OUT/test-classes" "$OUT/jar/META-INF" "$OUT/plugin/CodeTimeStamper/lib"

# --release 21: plattformens jar:ar läses som de är, men bytekoden blir 21 så
# pluginen också går på en IDE med JBR 21 (since-build 243 = 2024.3).
echo "== kompilerar mot $IDE"
echo "   $("$JAVAC" -version 2>&1 | cut -d' ' -f2), plugin-version $VERSION"
find src -name '*.java' > "$OUT/sources.txt"
"$JAVAC" -nowarn --release 21 -cp "$IDE/lib/*" -d "$OUT/classes" @"$OUT/sources.txt"

echo "== proven"
find test -name '*.java' > "$OUT/test-sources.txt"
"$JAVAC" -nowarn --release 21 -cp "$IDE/lib/*:$OUT/classes" -d "$OUT/test-classes" @"$OUT/test-sources.txt"
"$JAVA" -cp "$IDE/lib/*:$OUT/classes:$OUT/test-classes" codetimestamper.TrackerTest

echo "== paketerar"
sed "s|<version>.*</version>|<version>$VERSION</version>|" META-INF/plugin.xml > "$OUT/jar/META-INF/plugin.xml"
printf 'Manifest-Version: 1.0\n' > "$OUT/jar/META-INF/MANIFEST.MF"
cp -r "$OUT/classes/." "$OUT/jar/"
# jar-verktyget finns inte i JBR:en, men en JAR är bara en zip.
(cd "$OUT/jar" && rm -f ../plugin/CodeTimeStamper/lib/codetimestamper.jar \
  && zip -qr ../plugin/CodeTimeStamper/lib/codetimestamper.jar .)
(cd "$OUT/plugin" && rm -f ../codetimestamper-jetbrains.zip && zip -qr ../codetimestamper-jetbrains.zip .)

echo "== klart"
unzip -l "$OUT/codetimestamper-jetbrains.zip"
echo
echo "Installera: Settings → Plugins → ⚙ → Install Plugin from Disk… → jetbrains/$OUT/codetimestamper-jetbrains.zip"
