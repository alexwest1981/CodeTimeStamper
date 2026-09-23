package codetimestamper;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

/**
 * Proven för rapporten.
 *
 * Det viktigaste provet är att samma logg ger exakt samma markdown som
 * VS Code-varianten ger för fixturen i test/fixture. Utan det kan de två
 * implementationerna glida ifrån varandra, och då betyder dagssumman olika
 * saker beroende på vilken editor man tittar i.
 *
 * Kört med TZ=Europe/Stockholm (build.sh sätter det): rapporten skriver
 * klockslag i lokal tid, så fixturen är bara entydig i en känd zon.
 */
public final class RapportTest {

    private static int n = 0;

    private static void check(boolean ok, String what) {
        if (!ok) {
            throw new AssertionError("FEL: " + what);
        }
        System.out.println("  ok  " + (++n) + ". " + what);
    }

    public static void main(String[] args) throws Exception {
        // Fixturen ligger i repots rot. Ett tomt Dag-objekt ser ut som "allt
        // noll" och skulle tysta fela, så första kontrollen är att den finns.
        Path fixture = Paths.get("..", "test", "fixture");
        check(Files.exists(fixture.resolve("2026-09-21.jsonl")),
                "fixturen hittad: " + fixture.toAbsolutePath().normalize());

        Rapport.Dag r = Rapport.las(fixture, "2026-09-21");
        Long vsc = r.byIde.get("VS Code");
        Long jb = r.byIde.get("IntelliJ IDEA");
        check(vsc != null && vsc == 90 * 60000L, "stängt pass räknas på längden");
        check(jb != null && jb == 90_000L,
                "kraschat pass räknas till sista pulsslaget + ett intervall, var "
                        + (jb == null ? "inget" : jb / 1000 + " s"));
        check(r.sessions.size() == 2, "två pass, inte tre: det avbrutna räknas inte");
        check(r.orphans.size() == 1 && "Antigravity IDE".equals(r.orphans.get(0).ide),
                "passet utan pulsslag rapporteras som kort avbrott");
        check(r.badLines == 1, "skräpraden räknas som oläsbar");
        check(r.totalMs == 90 * 60000L + 90_000L, "summan är de två passen");

        String expected = new String(
                Files.readAllBytes(fixture.resolve("2026-09-21.md")), StandardCharsets.UTF_8).trim();
        String got = Rapport.markdown(fixture, "2026-09-21").trim();
        check(got.equals(expected), "samma markdown som VS Code-varianten ger för samma logg");
        check(got.contains("| VS Code | 1 h 30 min |"), "editorerna listas var för sig");
        check(got.contains("Kort avbrott (Antigravity IDE) vid 13:00"), "avbrottet står i rapporten");

        // Avslutad dag utan rapport får sin fil; dagens dag ska inte skrivas i förväg.
        Path tmp = Files.createTempDirectory("cts-rapport-");
        try {
            Files.writeString(tmp.resolve("2026-09-20.jsonl"),
                    "{\"ide\":\"VS Code\",\"t\":\"open\",\"ts\":"
                            + Rapport.num("{\"ts\":0}", "ts") + "}\n", StandardCharsets.UTF_8);
            Rapport.writeMissing(tmp, "2026-09-23");
            check(Files.exists(Rapport.rapportFile(tmp, "2026-09-20")), "avslutad dag får sin rapport");
            check(!Files.exists(Rapport.rapportFile(tmp, "2026-09-23")), "dagens dag skrivs inte i förväg");
        } finally {
            try (var s = Files.walk(tmp)) {
                s.sorted(java.util.Comparator.reverseOrder()).forEach(p -> p.toFile().delete());
            }
        }

        System.out.println("\n" + n + " prov för rapporten, alla gröna.");
    }
}
