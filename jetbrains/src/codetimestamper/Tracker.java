package codetimestamper;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardOpenOption;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;

/**
 * Ren logik utan plattformsberoenden, så den kan köras med java i ett prov.
 *
 * Semantiken är medvetet identisk med VS Code-varianten (tracker.js): båda
 * skriver till samma dagssumma, och två editorer med olika definition av
 * "aktiv" hade gett en siffra som inte betyder något.
 *
 * Ett segment öppnas vid första aktiviteten, stängs vid senaste aktivitet +
 * tröskeln, delas vid lokal midnatt, och ett segment som öppnats utan att
 * stängas (krasch) lämnas som en öppen rad som rapporten flaggar som avbruten.
 */
public final class Tracker {

    public static final long IDLE_MS = 10 * 60 * 1000L;

    /** Hur ofta ett pulsslag skrivs. Samma tal som rapporten räknar med. */
    public static final long TICK_MS = 30_000L;

    private final String ide;
    private final Path dir;
    private long idleMs;
    private Long openAt = null;
    private long lastActivity = 0;
    /** Projektmappens namn (basename, aldrig sökvägen). Tomt = sparas inte. */
    private volatile String project = "";

    public Tracker(String ide, long idleMs, Path dir) {
        this.ide = ide;
        this.idleMs = idleMs;
        this.dir = dir;
    }

    /**
     * Sätts när ett projektfönster öppnas. Plattformens tracker är app-vid, så
     * den bär ett namn i taget — med flera IDE-fönster öppna blir det sista
     * fönstrets projekt. ponytail: app-vid tracker, en tracker per fönster om
     * namnet måste vara exakt rätt i varje.
     */
    public void setProject(String name) {
        this.project = name == null ? "" : name;
    }

    public static Path dataDir() {
        String override = System.getenv("CODETIMESTAMPER_DIR");
        if (override != null && !override.isEmpty()) {
            return Paths.get(override);
        }
        return Paths.get(System.getProperty("user.home"), ".codetimestamper");
    }

    public static String dayKey(long ts) {
        LocalDate d = Instant.ofEpochMilli(ts).atZone(ZoneId.systemDefault()).toLocalDate();
        return String.format("%04d-%02d-%02d", d.getYear(), d.getMonthValue(), d.getDayOfMonth());
    }

    /** Delar ett intervall vid lokal midnatt så att varje dag får sin egen tid. */
    public static List<long[]> splitDays(long start, long end) {
        List<long[]> out = new ArrayList<>();
        long s = start;
        while (s < end) {
            LocalDate d = Instant.ofEpochMilli(s).atZone(ZoneId.systemDefault()).toLocalDate();
            long midnight = d.plusDays(1).atStartOfDay(ZoneId.systemDefault()).toInstant().toEpochMilli();
            long e = Math.min(end, midnight);
            out.add(new long[]{s, e});
            s = e;
        }
        return out;
    }

    /** Varje aktivitetssignal från användaren. */
    public synchronized void touch(long now) {
        if (openAt == null) {
            openAt = now;
            append(now, "{\"ide\":" + json(ide) + ",\"t\":\"open\",\"ts\":" + now + wField() + "}");
        }
        lastActivity = now;
    }

    /** Projektfältet, eller tomt när inget projekt ska sparas. */
    private String wField() {
        String p = project;
        return p == null || p.isEmpty() ? "" : ",\"w\":" + json(p);
    }

    /**
     * Kallas med jämna mellanrum. Stänger vid senaste aktivitet + tröskeln, inte
     * vid nu — annars räknas de tio minuterna före pausen aldrig, trots att tysta
     * luckor under tröskeln inuti ett segment räknas.
     *
     * Är segmentet fortfarande öppet lämnas ett pulsslag: det gör att tiden inte
     * hänger på att stängningen lyckas. En IDE som dör utan att stängningskroken
     * körs lämnar ett pulsslag i stället för ingenting, och rapporten räknar
     * passet fram till dess i stället för att kasta det. Pulsslaget bär sin egen
     * starttid, så två fönster i samma IDE hålls isär.
     */
    public synchronized void tick(long now) {
        if (openAt == null) {
            return;
        }
        if (now - lastActivity >= idleMs) {
            close(lastActivity + idleMs);
        } else {
            append(openAt, "{\"ide\":" + json(ide) + ",\"t\":\"beat\",\"start\":" + openAt
                    + ",\"ts\":" + now + "}");
        }
    }

    public synchronized void close(long end) {
        if (openAt == null) {
            return;
        }
        if (end > openAt) {
            for (long[] part : splitDays(openAt, end)) {
                append(part[0], "{\"ide\":" + json(ide) + ",\"t\":\"seg\",\"start\":" + part[0]
                        + ",\"end\":" + part[1] + wField() + "}");
            }
        }
        openAt = null;
    }

    public synchronized boolean isOpen() {
        return openAt != null;
    }

    public synchronized void setIdleMs(long ms) {
        this.idleMs = ms;
    }

    public String ide() {
        return ide;
    }

    private void append(long dayTs, String line) {
        try {
            Files.createDirectories(dir);
            Files.writeString(dir.resolve(dayKey(dayTs) + ".jsonl"), line + "\n",
                    StandardCharsets.UTF_8,
                    StandardOpenOption.CREATE, StandardOpenOption.APPEND);
        } catch (IOException e) {
            // Att kasta in i IDE:ns händelsekö vore värre än en förlorad minut.
            System.err.println("[CodeTimeStamper] kunde inte skriva till " + dir + ": " + e);
        }
    }

    private static String json(String s) {
        StringBuilder b = new StringBuilder("\"");
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c == '"' || c == '\\') {
                b.append('\\');
            }
            b.append(c);
        }
        return b.append('"').toString();
    }
}
