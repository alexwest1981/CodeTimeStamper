# CodeTimeStamper

Aktiv kodtid per dag. Timern startar när editorn öppnas, pausar efter 10 minuter
utan aktivitet och fortsätter när du gör något igen. Timern går fram till
tröskeln: en tyst lucka på nio minuter räknas, den tionde avslutar passet.

## Vad som mäts

Bara tidsstämplar och vilken editor. Ingen arbetsyta, inga filnamn, inga
tangenttryck, ingen nätverkstrafik. Loggen ligger i `~/.codetimestamper/`:

```
~/.codetimestamper/2026-09-23.jsonl     rådata, en rad per händelse
~/.codetimestamper/rapport/2026-09-23.md  färdig dagsrapport
```

Alla editorer skriver till samma mapp, så dagssumman blir totalen över VS Code,
Antigravity, Cursor och resten — uppdelad per editor.

## Vad som räknas som aktivitet

Textändring, markering, **skrollning**, editorbyte, sparning, terminal, debug.
Skrollningen är medveten: annars skulle tio minuters kodläsning räknas som vila.
Signaler i ett ofokuserat fönster ignoreras, så en agent som skriver filer i
bakgrunden håller inte timern vid liv.

Ett kraschat segment (öppnat utan avslut) räknas inte utan listas i rapporten.

## Rapport

`CodeTimeStamper: Visa rapport` i kommandopaletten (idag / igår / 7 dagar), eller:

```
codetimestamper              dagens rapport
codetimestamper 2026-09-22   ett datum
codetimestamper --vecka      senaste sju dagarna
codetimestamper --dagar      alla sparade dagar
```

## Bygga och installera

```
npm test                                 # körbara prov, inga beroenden
npm run package                          # -> codetimestamper.vsix
code --install-extension codetimestamper.vsix
cursor --install-extension codetimestamper.vsix
~/.local/opt/antigravity/bin/antigravity-ide --install-extension codetimestamper.vsix
```

Antigravity: använd CLI-skriptet i `bin/`, inte appbinären. `~/.local/bin/antigravity`
är själva programmet och svarar `exit 0` utan att installera något.

Ren JS, inget byggsteg, inga beroenden. `idleMinutes` och `enabled` finns i
Inställningar.
