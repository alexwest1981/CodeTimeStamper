#!/usr/bin/env bash
# Startar en sandboxad IntelliJ med pluginen installerad och bevisar ur idea.log
# att plattformen laddar och startar den. Din riktiga profil rörs inte: config,
# system, logg och datamapp hamnar i /tmp.
#
# Kräver varken skärm eller Xvfb: plattformen initierar plugins huvudlöst med
# -Djava.awt.headless=true (mätt — pluginen initieras 6 s efter start utan
# DISPLAY). Inget fönster, ingen display, inget som syns.
set -uo pipefail
cd "$(dirname "$0")"
. ./ide.sh

SB="${SB:-/tmp/cts-jb-verify}"
WAIT="${WAIT:-120}"
ZIP=build/codetimestamper-jetbrains.zip

[ -f "$ZIP" ] || { echo "Bygg först: ./build.sh" >&2; exit 1; }

IDE=$(find_ide) || { ide_not_found ./verify.sh; exit 1; }

rm -rf "$SB"
mkdir -p "$SB/config/plugins" "$SB/system/log" "$SB/data"
unzip -q "$ZIP" -d "$SB/config/plugins/"

# Licensen, annars stannar starten i registreringsdialogen i stället för att
# initiera plugin-komponenterna. Glob över alla JetBrains-produkter — inte en
# hårdkodad sökväg — och Community-utgåvor behöver ingen alls.
LICENSE_FOUND=0
for cfg in "$HOME"/.config/JetBrains/*/; do
    for f in idea.key plugin_PCWMP.license; do
        [ -f "$cfg$f" ] && cp "$cfg$f" "$SB/config/" 2>/dev/null && LICENSE_FOUND=1
    done
done
[ "$LICENSE_FOUND" = 1 ] || echo "(hittade ingen licens — Community behöver ingen, Ultimate kan stanna i registreringsdialogen)"

cat > "$SB/idea.properties" <<EOF
idea.config.path=$SB/config
idea.system.path=$SB/system
idea.log.path=$SB/system/log
idea.plugins.path=$SB/config/plugins
EOF

printf -- '-Djava.awt.headless=true\n' > "$SB/headless.vmoptions"
export IDEA_PROPERTIES="$SB/idea.properties"
export IDEA_VM_OPTIONS="$SB/headless.vmoptions"
export CODETIMESTAMPER_DIR="$SB/data"
unset DISPLAY

LOG="$SB/system/log/idea.log"
echo "== startar $IDE huvudlöst (ingen skärm, inget fönster)"
setsid "$IDE/bin/idea.sh" > "$SB/stdout.log" 2>&1 &
PGID=$!

for i in $(seq 1 "$WAIT"); do
  grep -q "aktiv i " "$LOG" 2>/dev/null && { echo "== pluginen initierad efter ${i}s"; break; }
  kill -0 "$PGID" 2>/dev/null || { echo "== IDE:n avslutades efter ${i}s"; break; }
  sleep 1
done

echo
echo "== laddade egna plugins"
grep -h "Loaded custom plugins" "$LOG" 2>/dev/null | tail -2
echo
echo "== vad CodeTimeStamper loggade"
grep -h "CodeTimeStamper - " "$LOG" 2>/dev/null | tail -5
echo
echo "== plugin-fel (ska vara tomt) =="
grep -hiE "CodeTimeStamper.*(error|exception)|(error|exception).*CodeTimeStamper" "$LOG" 2>/dev/null | tail -10
echo
echo "== datamappen =="
ls -la "$SB/data" 2>/dev/null

echo
echo "== stänger"
kill -TERM -- "-$PGID" 2>/dev/null
for _ in $(seq 1 30); do kill -0 "$PGID" 2>/dev/null || break; sleep 1; done
kill -KILL -- "-$PGID" 2>/dev/null
sleep 1
pgrep -f "$SB" >/dev/null && echo "(något lever fortfarande)" || echo "nere"

# Datamappen är tom i en huvudlös körning, och det är rätt: ingen input = ingen
# tid. Skrivvägen bevisas av proven i build.sh, kopplingen av loggraden ovan.
