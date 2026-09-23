package codetimestamper;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;

/** Körbart prov: java -cp build/classes:build/test-classes codetimestamper.TrackerTest */
public final class TrackerTest {

    private static int n = 0;

    public static void main(String[] args) throws Exception {
        Path dir = Files.createTempDirectory("cts-jb-");
        long min = 60_000L;

        try {
            // 1. midnattssplittring
            ZoneId z = ZoneId.systemDefault();
            long start = LocalDate.of(2026, 9, 22).atTime(23, 30).atZone(z).toInstant().toEpochMilli();
            long end = LocalDate.of(2026, 9, 23).atTime(0, 30).atZone(z).toInstant().toEpochMilli();
            List<long[]> parts = Tracker.splitDays(start, end);
            check(parts.size() == 2, "intervall över midnatt blir två dygn");
            check(parts.get(0)[1] - parts.get(0)[0] == 30 * min, "första dygnet får 30 min");
            check(parts.get(1)[1] - parts.get(1)[0] == 30 * min, "andra dygnet får 30 min");
            check(Tracker.dayKey(parts.get(0)[0]).equals("2026-09-22"), "dagnyckel dag 1");
            check(Tracker.dayKey(parts.get(1)[0]).equals("2026-09-23"), "dagnyckel dag 2");

            // 2. start, paus vid tröskeln, återstart
            long t0 = LocalDate.of(2026, 9, 22).atTime(9, 0).atZone(z).toInstant().toEpochMilli();
            Tracker t = new Tracker("IntelliJ IDEA", 10 * min, dir);
            t.touch(t0);
            check(t.isOpen(), "segmentet öppnas vid första aktiviteten");
            t.touch(t0 + 20 * min);
            t.tick(t0 + 29 * min);
            check(t.isOpen(), "nio tysta minuter avbryter inte");
            t.tick(t0 + 31 * min);
            check(!t.isOpen(), "elva tysta minuter stänger segmentet");

            String day1 = read(dir, "2026-09-22.jsonl");
            check(day1.contains("\"t\":\"open\""), "öppningsrad skriven");
            check(day1.contains("\"t\":\"seg\""), "stängningsrad skriven");
            long segMs = segLength(day1);
            check(segMs == 30 * min, "20 min aktivt + 10 min tröskel = 30 min, var " + segMs / min);
            check(day1.contains("\"ide\":\"IntelliJ IDEA\""), "IDE:ns namn med i raden");

            // 3. två editorer i samma mapp
            Tracker t2 = new Tracker("VS Code", 10 * min, dir);
            t2.touch(t0);
            t2.close(t0 + 12 * min);
            String both = read(dir, "2026-09-22.jsonl");
            check(both.contains("\"ide\":\"VS Code\""), "andra editorn hamnar i samma fil");
            check(both.split("\n").length == 4, "fyra rader totalt, var " + both.split("\n").length);

            // 4. krasch: öppet segment utan avslut
            Tracker t3 = new Tracker("KraschIDE", 10 * min, dir);
            t3.touch(t0);
            String day1b = read(dir, "2026-09-22.jsonl");
            check(day1b.endsWith("\"t\":\"open\",\"ts\":" + t0 + "}"), "kraschraden är öppen och sist");
            check(day1b.split("\n").length == 5, "kraschraden räknas inte som tid");

            // 5. stängning vid nu, och idempotent
            t3.close(t0 + 7 * min);
            int before = read(dir, "2026-09-22.jsonl").split("\n").length;
            t3.close(t0 + 9 * min);
            check(read(dir, "2026-09-22.jsonl").split("\n").length == before, "dubbel stängning rör inte filen");

            // 6. skräp i ide-namnet escapas
            Tracker t4 = new Tracker("IDE \"quoted\"", 10 * min, dir);
            t4.touch(t0);
            t4.close(t0 + min);
            check(read(dir, "2026-09-22.jsonl").contains("\\\"quoted\\\""), "citattecken escapas i JSON");

            System.out.println("\n" + n + " prov i JetBrains-logiken, alla gröna.");
        } finally {
            delete(dir);
        }
    }

    private static long segLength(String jsonl) {
        for (String line : jsonl.split("\n")) {
            if (line.contains("\"t\":\"seg\"") && line.contains("IntelliJ IDEA")) {
                long s = Long.parseLong(line.replaceAll(".*\"start\":(\\d+).*", "$1"));
                long e = Long.parseLong(line.replaceAll(".*\"end\":(\\d+).*", "$1"));
                return e - s;
            }
        }
        throw new AssertionError("hittade ingen seg-rad");
    }

    private static String read(Path dir, String name) throws Exception {
        return Files.readString(dir.resolve(name), StandardCharsets.UTF_8).trim();
    }

    private static void delete(Path dir) throws Exception {
        try (var walk = Files.walk(dir)) {
            walk.sorted(java.util.Comparator.reverseOrder()).forEach(p -> p.toFile().delete());
        }
    }

    private static void check(boolean ok, String what) {
        if (!ok) {
            throw new AssertionError("FEL: " + what);
        }
        System.out.println("  ok  " + (++n) + ". " + what);
    }
}
