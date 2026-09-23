#!/usr/bin/env bash
# Hittar en IntelliJ-plattform på den här maskinen. Källas av build.sh och
# verify.sh så att upptäckten inte kan glida isär mellan dem.
#
# IDEA_HOME vinner om den är satt. Annars letas en installation upp på de
# vanligaste platserna (manuell installation, Toolbox, /opt, snap, flatpak,
# macOS). Alla JetBrains-IDE:er har lib/ och jbr/, så vilken som helst duger —
# det behöver inte vara just IDEA.

# Skriver sökvägen till IDE:n på stdout, eller ger felkod 1.
find_ide() {
    local c candidates=() found n

    if [ -n "${IDEA_HOME:-}" ]; then
        if [ -x "$IDEA_HOME/jbr/bin/javac" ] && [ -d "$IDEA_HOME/lib" ]; then
            printf '%s\n' "$IDEA_HOME"
            return 0
        fi
        echo "IDEA_HOME=$IDEA_HOME pekar inte på en IDE (saknar lib/ eller jbr/bin/javac)." >&2
        return 1
    fi

    candidates=(
        "$HOME"/.local/opt/*idea* "$HOME"/.local/opt/*ntelliJ*
        "$HOME"/.local/share/JetBrains/Toolbox/apps/*/*/* "$HOME"/.local/share/JetBrains/Toolbox/apps/*/*/*/*
        /opt/*idea* /opt/*ntelliJ*
        /usr/share/*idea* /usr/share/idea* /usr/lib/*idea*
        /snap/*idea*/current
        /var/lib/flatpak/app/com.jetbrains.IntelliJ-IDEA-*/current/active/files/extra/*
        "$HOME"/.var/app/com.jetbrains.IntelliJ-IDEA-*/files/extra/*
        "/Applications/IntelliJ IDEA.app/Contents" /Applications/*IDEA*.app/Contents
    )

    found=$(for c in "${candidates[@]}"; do
        [ -x "$c/jbr/bin/javac" ] && [ -d "$c/lib" ] && echo "$c"
    done | sort -V)

    [ -n "$found" ] || return 1

    n=$(printf '%s\n' "$found" | wc -l)
    if [ "$n" -gt 1 ]; then
        {
            echo "Flera installationer hittade — använder den sista. Sätt IDEA_HOME för att välja:"
            printf '  %s\n' $found
        } >&2
    fi
    printf '%s\n' "$found" | tail -1
}

# Läsbar lista att klistra in i ett felmeddelande.
ide_search_paths() {
    cat <<'EOF'
    ~/.local/opt/*idea*                      (manuell installation)
    ~/.local/share/JetBrains/Toolbox/apps/…  (Toolbox)
    /opt, /usr/share, /usr/lib
    /snap/*idea*/current                     (snap)
    /var/lib/flatpak/app/com.jetbrains.*     (flatpak)
    ~/.var/app/com.jetbrains.*               (flatpak, användare)
    /Applications/IntelliJ IDEA.app          (macOS)
EOF
}

# Gemensamt felmeddelande när inget hittades.
ide_not_found() {
    {
        echo "Hittade ingen IntelliJ-plattform. Letade i:"
        ide_search_paths
        echo "Sätt IDEA_HOME till din installation, t.ex. IDEA_HOME=/opt/idea $1"
    } >&2
}
