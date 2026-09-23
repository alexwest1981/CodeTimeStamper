#!/usr/bin/env bash
# Startar en sandboxad IntelliJ på Xvfb :99 med pluginen installerad, och läser
# idea.log för att bevisa att plattformen laddar och startar den.
# Din riktiga profil rörs inte: config, system, logg och datamapp ligger i /tmp.
set -uo pipefail
cd "$(dirname "$0")"

IDE="${IDEA_HOME:-$HOME/.local/opt/idea}"
REAL_CONFIG="${REAL_CONFIG:-$HOME/.config/JetBrains/IntelliJIdea2026.2}"
SB="${SB:-/tmp/cts-jb-verify}"
DISPLAY_NUM="${DISPLAY_NUM:-:99}"
WAIT="${WAIT:-150}"
ZIP=build/codetimestamper-jetbrains.zip

[ -f "$ZIP" ] || { echo "Bygg först: ./build.sh" >&2; exit 1; }

rm -rf "$SB"
mkdir -p "$SB/config/plugins" "$SB/system/log" "$SB/data"
# Licensen, annars stannar starten i registreringsdialogen.
[ -f "$REAL_CONFIG/idea.key" ] && cp "$REAL_CONFIG/idea.key" "$SB/config/"
[ -f "$REAL_CONFIG/plugin_PCWMP.license" ] && cp "$REAL_CONFIG/plugin_PCWMP.license" "$SB/config/"
unzip -q "$ZIP" -d "$SB/config/plugins/"

cat > "$SB/idea.properties" <<EOF
idea.config.path=$SB/config
idea.system.path=$SB/system
idea.log.path=$SB/system/log
idea.plugins.path=$SB/config/plugins
EOF

export DISPLAY="$DISPLAY_NUM"
export CODETIMESTAMPER_DIR="$SB/data"
export IDEA_PROPERTIES="$SB/idea.properties"

LOG="$SB/system/log/idea.log"
echo "== startar $(basename "$IDE") på $DISPLAY (inget fönster på din skärm)"
setsid "$IDE/bin/idea.sh" > "$SB/stdout.log" 2>&1 &
PGID=$!

for _ in $(seq 1 "$WAIT"); do
  grep -q "aktiv i " "$LOG" 2>/dev/null && break
  kill -0 "$PGID" 2>/dev/null || break
  sleep 1
done
echo "== väntade ${_} s på att pluginen skulle initieras"

echo
echo "== laddade egna plugins"
grep -h "Loaded custom plugins" "$LOG" 2>/dev/null | tail -2
echo
echo "== vad CodeTimeStamper loggade"
grep -h "CodeTimeStamper" "$LOG" 2>/dev/null | tail -5
echo
echo "== plugin-fel (ska vara tomt) =="
grep -hiE "CodeTimeStamper.*(error|exception)|(error|exception).*CodeTimeStamper" "$LOG" 2>/dev/null | tail -10
grep -hE "se\.alexwest\.codetimestamper" "$LOG" 2>/dev/null | grep -viE "loaded custom plugins|CodeTimeStamper is active|aktiv i" | tail -5
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
