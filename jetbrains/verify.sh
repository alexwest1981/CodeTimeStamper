#!/usr/bin/env bash
# Startar en sandboxad IntelliJ med pluginen installerad och bevisar ur idea.log
# att plattformen laddar och startar den. Din riktiga profil rörs inte: config,
# system, logg och datamapp hamnar i /tmp.
#
# Två lägen:
#   ./verify.sh          huvudlöst — ingen skärm, inget fönster. Bevisar att
#                        pluginen laddas och skriver.
#   GUI=1 ./verify.sh    i ett riktigt (virtuellt) fönster på Xvfb. Bevisar att
#                        räknaren monteras i statusraden, och tar en bild av
#                        statusraden som bevis. Inget syns på din skärm.
#
# Statusraden finns bara i ett riktigt fönster, så GUI-läget är det enda som
# kan svara på "syns räknaren i IDE:n".
set -uo pipefail
cd "$(dirname "$0")"
. ./ide.sh

SB="${SB:-/tmp/cts-jb-verify}"
WAIT="${WAIT:-180}"
GUISPEC=":99"
XVFB="${XVFB:-$HOME/.local/opt/xvfb/usr/bin/Xvfb}"
ZIP=build/codetimestamper-jetbrains.zip

[ -f "$ZIP" ] || { echo "Bygg först: ./build.sh" >&2; exit 1; }

IDE=$(find_ide) || { ide_not_found ./verify.sh; exit 1; }

rm -rf "$SB"
mkdir -p "$SB/config/plugins" "$SB/system/log" "$SB/data" "$SB/projekt"
unzip -q "$ZIP" -d "$SB/config/plugins/"
echo "// tomt projekt, bara så att ett riktigt fönster med statusrad byggs" > "$SB/projekt/README.md"

# En avslutad dag i sandlådans logg: gör att rapportskrivningen går att bevisa
# utan aktivitet. Plockas upp av writeMissing vid start och ska ge
# $SB/data/rapport/2026-01-05.md.
printf '{"ide":"VS Code","t":"seg","start":%s,"end":%s,"w":"Sandlådan"}\n' \
    "$(date -d '2026-01-05 09:00' +%s)000" "$(date -d '2026-01-05 10:30' +%s)000" \
    > "$SB/data/2026-01-05.jsonl"

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

export IDEA_PROPERTIES="$SB/idea.properties"
export CODETIMESTAMPER_DIR="$SB/data"

if [ "${GUI:-0}" = 1 ]; then
    # En seedad dagslogg i sandlådan, så räknaren visar en riktig siffra i
    # beviset i stället för "0 min". Din egen logg rörs inte.
    T=$(date +%F)
    S=$(date -d "today 08:00" +%s)000
    M1=$(date -d "today 09:10" +%s)000
    M2=$(date -d "today 09:45" +%s)000
    printf '{"ide":"VS Code","t":"seg","start":%s,"end":%s}\n' "$S" "$M1" > "$SB/data/$T.jsonl"
    printf '{"ide":"IntelliJ IDEA","t":"seg","start":%s,"end":%s}\n' "$M1" "$M2" >> "$SB/data/$T.jsonl"
    echo "== sandlådan har en seedad logg: VS Code 08:00–09:10 + IntelliJ 09:10–09:45 = 1 h 45 min"
    if ! pgrep -f "Xvfb $GUISPEC" >/dev/null; then
        echo "== startar Xvfb på $GUISPEC (virtuell skärm, syns inte hos dig)"
        "$XVFB" "$GUISPEC" -screen 0 1600x1000x24 -nolisten tcp >/dev/null 2>&1 &
        STARTED_XVFB=$!
        sleep 2
    fi
    export DISPLAY="$GUISPEC"
    # JBR väljer Wayland om WAYLAND_DISPLAY finns kvar i miljön, och då hamnar
    # fönstret på den riktiga skärmen i stället för på :99. Mätt: försöket gav
    # svart skärmbild på :99 medan variabeln var satt.
    unset WAYLAND_DISPLAY
    export XDG_SESSION_TYPE=x11
    : > "$SB/gui.vmoptions"
    export IDEA_VM_OPTIONS="$SB/gui.vmoptions"
    echo "== startar $IDE i ett fönster på $DISPLAY, med projektet $SB/projekt"
    setsid "$IDE/bin/idea.sh" "$SB/projekt" > "$SB/stdout.log" 2>&1 &
    MODE="fönster"
else
    printf -- '-Djava.awt.headless=true\n' > "$SB/headless.vmoptions"
    export IDEA_VM_OPTIONS="$SB/headless.vmoptions"
    unset DISPLAY
    echo "== startar $IDE huvudlöst (ingen skärm, inget fönster)"
    setsid "$IDE/bin/idea.sh" > "$SB/stdout.log" 2>&1 &
    MODE="huvudlöst"
fi
PGID=$!

# I fönsterläget är den intressanta raden den från statusraden; den kommer efter
# att ramen och dess statusrad byggts.
if [ "${GUI:-0}" = 1 ]; then
    VANT="räknaren monterad i statusraden"
else
    VANT="aktiv i "
fi

LOG="$SB/system/log/idea.log"
FOUND=0
for i in $(seq 1 "$WAIT"); do
    if grep -q "$VANT" "$LOG" 2>/dev/null; then echo "== klart efter ${i}s ($MODE)"; FOUND=1; break; fi
    kill -0 "$PGID" 2>/dev/null || { echo "== IDE:n avslutades efter ${i}s"; break; }
    sleep 1
done
[ "$FOUND" = 1 ] || echo "== väntade ${WAIT}s utan att hitta \"$VANT\""

echo
echo "== laddade egna plugins"
grep -h "Loaded custom plugins" "$LOG" 2>/dev/null | tail -2
echo
echo "== vad CodeTimeStamper loggade"
grep -h "CodeTimeStamper - " "$LOG" 2>/dev/null | tail -5
echo
echo "== plugin-fel (ska vara tomt) ==="
grep -hiE "CodeTimeStamper.*(error|exception)|(error|exception).*CodeTimeStamper" "$LOG" 2>/dev/null | tail -10

if [ "${GUI:-0}" = 1 ] && [ "$FOUND" = 1 ]; then
    sleep 3
    BILD="$SB/skarm.png"
    if import -window root -display "$DISPLAY" "$BILD" 2>/dev/null; then
        # Klippet räknas ur bildens verkliga mått: en stående Xvfb kan ha en
        # annan upplösning än den här körningen bad om.
        MATT=$(identify -format "%wx%h" "$BILD")
        B=${MATT%x*}; H=${MATT#*x}
        if convert "$BILD" -crop "${B}x44+0+$((H - 44))" +repage "$SB/statusrad.png" 2>/dev/null; then
            echo
            echo "== bild av statusraden: $SB/statusrad.png"
            identify "$SB/statusrad.png"
        fi
    fi
fi

echo
echo "== datamappen (råloggen)"
ls -la "$SB/data" 2>/dev/null
echo
echo "== den läsbara mappen (rapporten)"
if [ -d "$SB/data/rapport" ]; then
    ls -la "$SB/data/rapport"
    echo "--- förväntat innehåll: 2026-01-05.md ur sandlådans seedade dag ---"
    head -12 "$SB/data/rapport/2026-01-05.md" 2>/dev/null
else
    echo "(ingen rapportmapp — skrivvägen är inte bevisad i den här körningen)"
fi

echo
echo "== stänger"
kill -TERM -- "-$PGID" 2>/dev/null
for _ in $(seq 1 30); do kill -0 "$PGID" 2>/dev/null || break; sleep 1; done
kill -KILL -- "-$PGID" 2>/dev/null
# Stäng Xvfb bara om den här körningen startade den — en stående :99 lämnas kvar.
[ -n "${STARTED_XVFB:-}" ] && kill "$STARTED_XVFB" 2>/dev/null
sleep 1
pgrep -f "$SB" >/dev/null && echo "(något lever fortfarande)" || echo "nere"

# Huvudlöst är datamappen tom, och det är rätt: ingen input = ingen tid.
# Skrivvägen bevisas av proven i build.sh, kopplingen av loggraden ovan.
