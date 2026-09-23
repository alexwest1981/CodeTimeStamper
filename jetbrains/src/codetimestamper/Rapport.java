package codetimestamper;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoField;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Läser loggen och skriver dagsrapporten i markdown.
 *
 * Formatet är samma som report.js i VS Code-varianten — samma fil, samma
 * rapport, oavsett vilken editor man satt i. Proven jämför båda
 * implementationerna mot samma fixtur, så de inte kan glida ifrån varandra.
 *
 * Tiden för en körning tas från dess avslut om ett sådant finns, annars från
 * dess sista pulsslag. Ett pass som dör utan att stängas räknas alltså fram
 * till sista pulsslaget i stället för att kastas.
 */
public final class Rapport {

    /** En körning: samma starttid och editor = samma pass, även över filer. */
    public static final class Run {
        public final String ide;
        public final long start;
        public long end = -1;
        long lastBeat = 0;

        Run(String ide, long start) {
            this.ide = ide;
            this.start = start;
        }
    }

    public static final class Dag {
        public long totalMs;
        public final Map<String, Long> byIde = new LinkedHashMap<>();
        public final List<Run> sessions = new ArrayList<>();
        public final List<Run> orphans = new ArrayList<>();
        public int badLines;
    }

    private Rapport() {
    }

    public static Path rapportDir(Path dir) {
        return dir.resolve("rapport");
    }

    public static Path rapportFile(Path dir, String day) {
        return rapportDir(dir).resolve(day + ".md");
    }

    public static Dag las(Path dir, String day) {
        Dag r = new Dag();
        String raw;
        try {
            raw = new String(Files.readAllBytes(dir.resolve(day + ".jsonl")), StandardCharsets.UTF_8);
        } catch (IOException e) {
            return r; // ingen fil = ingen tid, inte ett fel
        }
        Map<String, Run> runs = new LinkedHashMap<>();
        for (String line : raw.split("\n")) {
            if (line.trim().isEmpty()) {
                continue;
            }
            String t = field(line, "t");
            String ide = field(line, "ide");
            if ("open".equals(t)) {
                run(runs, num(line, "ts"), ide);
            } else if ("seg".equals(t)) {
                long s = num(line, "start");
                long e = num(line, "end");
                if (e > s) {
                    run(runs, s, ide).end = e;
                }
            } else if ("beat".equals(t)) {
                Run x = run(runs, num(line, "start"), ide);
                long ts = num(line, "ts");
                if (ts > x.lastBeat) {
                    x.lastBeat = ts;
                }
            } else {
                r.badLines++;
            }
        }

        long dayEnd = midnightAfter(day);
        for (Run x : runs.values()) {
            long end = x.end > 0
                    ? x.end
                    : (x.lastBeat > 0 ? Math.min(x.lastBeat + Tracker.TICK_MS, dayEnd) : -1);
            // Utan både avslut och pulsslag finns ingen uppgift om längden alls.
            if (end <= x.start) {
                r.orphans.add(x);
                continue;
            }
            x.end = end;
            long ms = end - x.start;
            r.totalMs += ms;
            r.byIde.merge(x.ide, ms, Long::sum);
            r.sessions.add(x);
        }
        r.sessions.sort(Comparator.comparingLong(s -> s.start));
        return r;
    }

    public static String markdown(Path dir, String day) {
        Dag r = las(dir, day);
        List<String> p = new ArrayList<>();
        p.add("# CodeTimeStamper — " + veckodag(day) + " " + day + "\n");
        p.add("**Total: " + fmt(r.totalMs) + "**\n");
        List<String> ides = new ArrayList<>(r.byIde.keySet());
        ides.sort((a, b) -> Long.compare(r.byIde.get(b), r.byIde.get(a)));
        if (!ides.isEmpty()) {
            p.add("| Editor | Tid |");
            p.add("| --- | --- |");
            for (String ide : ides) {
                p.add("| " + ide + " | " + fmt(r.byIde.get(ide)) + " |");
            }
            p.add("");
        } else {
            p.add("_Ingen aktivitet registrerad._\n");
        }
        if (!r.sessions.isEmpty()) {
            p.add("| Start | Slut | Längd | Editor |");
            p.add("| --- | --- | --- | --- |");
            for (Run s : r.sessions) {
                p.add("| " + hm(s.start) + " | " + hm(s.end) + " | " + fmt(s.end - s.start) + " | " + s.ide + " |");
            }
            p.add("");
        }
        for (Run o : r.orphans) {
            p.add("> Kort avbrott (" + o.ide + ") vid " + hm(o.start)
                    + " — passet blev kortare än ett pulsslag och kunde inte räknas.");
        }
        if (r.badLines > 0) {
            p.add("\n> " + r.badLines + " oläsbar rad i loggen ignorerades.");
        }
        p.add("");
        return String.join("\n", p);
    }

    /** Skriver (om) en dags rapport. */
    public static void write(Path dir, String day) {
        try {
            Files.createDirectories(rapportDir(dir));
            Files.write(rapportFile(dir, day), markdown(dir, day).getBytes(StandardCharsets.UTF_8));
        } catch (IOException e) {
            System.err.println("[CodeTimeStamper] kunde inte skriva rapport för " + day + ": " + e);
        }
    }

    /**
     * Skriver rapport för varje avslutad dag som saknar en. Gör att en dag får
     * sin rapport även om IDE:n var stängd över midnatt — den dagens sista
     * skrivning skedde ju innan dagen var slut.
     */
    public static void writeMissing(Path dir, String today) {
        try (DirectoryStream<Path> ds = Files.newDirectoryStream(dir, "*.jsonl")) {
            for (Path f : ds) {
                String name = f.getFileName().toString();
                String day = name.substring(0, name.length() - ".jsonl".length());
                if (day.compareTo(today) >= 0 || Files.exists(rapportFile(dir, day))) {
                    continue;
                }
                write(dir, day);
            }
        } catch (IOException e) {
            // Ingen logg ännu är det normala första gången, inte ett fel.
        }
    }

    public static String fmt(long ms) {
        long min = Math.round(ms / 60000.0);
        long h = min / 60;
        return h > 0 ? h + " h " + (min % 60) + " min" : min + " min";
    }

    public static String hm(long ts) {
        java.time.LocalTime t = Instant.ofEpochMilli(ts).atZone(ZoneId.systemDefault()).toLocalTime();
        return String.format("%02d:%02d", t.getHour(), t.getMinute());
    }

    static long midnightAfter(String day) {
        return LocalDate.parse(day).plusDays(1).atStartOfDay(ZoneId.systemDefault())
                .toInstant().toEpochMilli();
    }

    private static String veckodag(String day) {
        String[] namn = {"mån", "tis", "ons", "tor", "fre", "lör", "sön"};
        return namn[LocalDate.parse(day).get(ChronoField.DAY_OF_WEEK) - 1];
    }

    private static Run run(Map<String, Run> runs, long start, String ide) {
        String key = start + "|" + ide;
        Run x = runs.get(key);
        if (x == null) {
            x = new Run(ide, start);
            runs.put(key, x);
        }
        return x;
    }

    /**
     * Plockar ut ett fält ur en rad utan json-bibliotek. Raderna skrivs bara av
     * den här pluginen och VS Code-varianten, så formatet är känt; fältordningen
     * antas inte.
     */
    static String field(String line, String key) {
        int i = line.indexOf("\"" + key + "\":");
        if (i < 0) {
            return null;
        }
        i += key.length() + 3;
        // Mellanslag efter kolon får inte avgöra om raden går att läsa: en
        // läsare som bara klarar en viss formatering ger tysta nollor.
        while (i < line.length() && (line.charAt(i) == ' ' || line.charAt(i) == '\t')) {
            i++;
        }
        if (i >= line.length()) {
            return null;
        }
        if (line.charAt(i) == '"') {
            int j = i + 1;
            while (j < line.length()) {
                char c = line.charAt(j);
                if (c == '\\') {
                    j += 2;
                    continue;
                }
                if (c == '"') {
                    return line.substring(i + 1, j).replace("\\\"", "\"");
                }
                j++;
            }
            return null;
        }
        int j = i;
        while (j < line.length() && (Character.isDigit(line.charAt(j)) || line.charAt(j) == '-')) {
            j++;
        }
        return line.substring(i, j);
    }

    static long num(String line, String key) {
        String v = field(line, key);
        if (v == null || v.isEmpty()) {
            return 0;
        }
        try {
            return Long.parseLong(v);
        } catch (NumberFormatException e) {
            return 0;
        }
    }
}
