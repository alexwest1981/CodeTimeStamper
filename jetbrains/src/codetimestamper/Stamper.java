package codetimestamper;

import com.intellij.ide.ApplicationInitializedListenerJavaShim;
import com.intellij.ide.IdeEventQueue;
import com.intellij.openapi.Disposable;
import com.intellij.openapi.application.ApplicationManager;
import com.intellij.openapi.application.ApplicationNamesInfo;
import com.intellij.openapi.diagnostic.Logger;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * Den tunna kopplingen: plattformens aktivitetssignal in i den rena Trackern,
 * och dagens siffra ut till statusraden. Ingen logik bor här.
 *
 * ApplicationInitializedListenerJavaShim är plattformens egen Java-shim för den
 * koroutine-baserade lyssnaren — annars hade jag behövt Continuation i Java.
 *
 * addActivityListener (inte addIdleListener — den är deprecated i den här
 * builden, "Use IdleTracker and coroutines") ger riktig användarinput:
 * tangent och mus, inte filändringar. Därför behövs ingen fokus-spärr som i
 * VS Code-varianten, där en agent som skriver filer i bakgrunden annars håller
 * timern vid liv.
 */
public final class Stamper extends ApplicationInitializedListenerJavaShim implements Disposable {

    private static final Logger LOG = Logger.getInstance("CodeTimeStamper");
    private static final long TICK_SECONDS = Tracker.TICK_MS / 1000;

    private static final CopyOnWriteArrayList<Statusbar.Tid> WIDGETS = new CopyOnWriteArrayList<>();
    private static volatile Stamper instance;

    private final Tracker tracker;
    private final ScheduledExecutorService timer;
    private volatile String text = "";

    public Stamper() {
        this.tracker = new Tracker(
                ApplicationNamesInfo.getInstance().getFullProductName(),
                Tracker.IDLE_MS,
                Tracker.dataDir());
        this.timer = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "CodeTimeStamper");
            t.setDaemon(true);
            return t;
        });
        instance = this;
    }

    /** Statusraden anmäler sig när den monteras. */
    static void watch(Statusbar.Tid w) {
        WIDGETS.add(w);
        Stamper s = instance;
        if (s == null) {
            return;
        }
        // Statusraden kan monteras innan första beat:et har hunnit köra. Utan
        // det här står räknaren tom i upp till ett tick (30 s).
        if (s.text.isEmpty()) {
            s.updateText(System.currentTimeMillis());
        }
        w.set(s.text);
    }

    static void unwatch(Statusbar.Tid w) {
        WIDGETS.remove(w);
    }

    /**
     * Projektfönstrets namn in i trackern. Kallas när statusraden monteras, för
     * det är där ett projektfönster finns — ingen egen extension point behövs.
     * ponytail: hakar på widgeten i stället för ProjectManagerListener; byt om
     * namnet måste stämma även när räknaren är avstängd i statusraden.
     */
    static void projectOpened(String name) {
        Stamper s = instance;
        if (s == null) {
            return;
        }
        s.tracker.setProject(Settings.getInstance().getState().recordProject ? name : "");
    }

    @Override
    public void componentsInitialized() {
        ApplicationManager.getApplication().invokeLater(() -> {
            IdeEventQueue.getInstance().addActivityListener(
                    () -> tracker.touch(System.currentTimeMillis()), this);
            // Avslutade dagar som saknar rapport får sin fil här. Gör att en dag
            // får sin rapport även om IDE:n stod still över midnatt.
            Rapport.writeMissing(Tracker.dataDir(), Tracker.dayKey(System.currentTimeMillis()));
            timer.scheduleWithFixedDelay(this::beat, TICK_SECONDS, TICK_SECONDS, TimeUnit.SECONDS);
            // Stängningen fångas av JVM:ens shutdown hook i stället för av en
            // plattforms-EP: AppLifecycleListener har appClosing(), men ingen
            // extension point för den finns i den här builden (mätt, inte gissat).
            // ponytail: en SIGKILL fångas inte — då räddas passet av sista
            // pulsslaget i stället (se Rapport), taket är ett tick.
            Runtime.getRuntime().addShutdownHook(new Thread(this::finish, "CodeTimeStamper-close"));
            updateText(System.currentTimeMillis());
            // Loggraden är enda sättet att skilja "laddad men gör inget" från "kör".
            LOG.info("aktiv i " + ApplicationNamesInfo.getInstance().getFullProductName()
                    + ", skriver till " + Tracker.dataDir());
        });
    }

    private void beat() {
        Settings.Data s = Settings.getInstance().getState();
        long now = System.currentTimeMillis();
        if (!s.enabled) {
            tracker.close(now);
        } else {
            tracker.setIdleMs(Math.max(1, s.idleMinutes) * 60_000L);
            boolean wasOpen = tracker.isOpen();
            tracker.tick(now);
            // Ett pass tog slut i just det här ticket: skriv om dagens rapport så
            // att markdownfilen är aktuell utan att någon kör CLI:t.
            if (wasOpen && !tracker.isOpen()) {
                Rapport.write(Tracker.dataDir(), Tracker.dayKey(now));
            }
        }
        updateText(now);
    }

    private void updateText(long now) {
        String t = "Kodtid "
                + Rapport.fmt(Rapport.las(Tracker.dataDir(), Tracker.dayKey(now)).totalMs)
                + (tracker.isOpen() ? "" : " (pausad)");
        text = t;
        for (Statusbar.Tid w : WIDGETS) {
            w.set(t);
        }
    }

    /** Användaren stänger medvetet och var aktiv fram till dess — stäng vid nu. */
    private void finish() {
        long now = System.currentTimeMillis();
        tracker.close(now);
        Rapport.write(Tracker.dataDir(), Tracker.dayKey(now));
    }

    @Override
    public void dispose() {
        timer.shutdownNow();
        finish();
    }
}
