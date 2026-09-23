#!/usr/bin/env bash
# Bygger JetBrains-pluginen med javac mot IDE:n som redan ligger på disk.
# Ingen Gradle, ingen SDK-nedladdning: ~/.local/opt/idea/lib/*.jar ÄR SDK:n,
# och IDE:ns egen JBR ÄR rätt JDK (plattformens jar:ar är Java 25-bytekod, så
# en Java 21-javac kan inte ens läsa dem — "class file has wrong version 69.0").
set -euo pipefail
cd "$(dirname "$0")"

IDE="${IDEA_HOME:-$HOME/.local/opt/idea}"
OUT=build

[ -x "$IDE/jbr/bin/javac" ] || { echo "Hittar ingen JBR i $IDE — sätt IDEA_HOME." >&2; exit 1; }
[ -d "$IDE/lib" ] || { echo "Hittar inget lib/ i $IDE — sätt IDEA_HOME." >&2; exit 1; }

JAVAC="$IDE/jbr/bin/javac"
JAVA="$IDE/jbr/bin/java"

# En källa till versionen: samma som VS Code-extensionen i repots rot.
VERSION=$(node -p "require('$PWD/../package.json').version" 2>/dev/null || echo 0.0.0)

rm -rf "$OUT"
mkdir -p "$OUT/classes" "$OUT/test-classes" "$OUT/jar/META-INF" "$OUT/plugin/CodeTimeStamper/lib"

# --release 21: plattformens jar:ar läses som de är, men bytekoden blir 21 så
# pluginen också går på en IDE med JBR 21 (since-build 243 = 2024.3).
echo "== kompilerar mot $(basename "$IDE") ($("$JAVAC" -version 2>&1 | cut -d' ' -f2)), version $VERSION"
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
