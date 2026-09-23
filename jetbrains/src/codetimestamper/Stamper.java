package codetimestamper;

import com.intellij.ide.ApplicationInitializedListenerJavaShim;
import com.intellij.ide.IdeEventQueue;
import com.intellij.openapi.Disposable;
import com.intellij.openapi.application.ApplicationManager;
import com.intellij.openapi.application.ApplicationNamesInfo;
import com.intellij.openapi.diagnostic.Logger;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * Den tunna kopplingen: plattformens aktivitetssignal in i den rena Trackern.
 * Ingen logik bor här.
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
    private static final long TICK_SECONDS = 30;

    private final Tracker tracker;
    private final ScheduledExecutorService timer;

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
    }

    @Override
    public void componentsInitialized() {
        ApplicationManager.getApplication().invokeLater(() -> {
            IdeEventQueue.getInstance().addActivityListener(
                    () -> tracker.touch(System.currentTimeMillis()), this);
            timer.scheduleWithFixedDelay(this::beat, TICK_SECONDS, TICK_SECONDS, TimeUnit.SECONDS);
            // Stängningen fångas av JVM:ens shutdown hook i stället för av en
            // plattforms-EP: AppLifecycleListener har appClosing(), men ingen
            // extension point för den finns i den här builden (mätt, inte gissat).
            // ponytail: en SIGKILL fångas inte — då blir segmentet en avbruten rad,
            // vilket är samma tak som VS Code-varianten har.
            Runtime.getRuntime().addShutdownHook(new Thread(this::finish, "CodeTimeStamper-close"));
            // Loggraden är enda sättet att skilja "laddad men gör inget" från "kör".
            LOG.info("aktiv i " + ApplicationNamesInfo.getInstance().getFullProductName()
                    + ", skriver till " + Tracker.dataDir());
        });
    }

    private void beat() {
        Settings.Data s = Settings.getInstance().getState();
        if (!s.enabled) {
            tracker.close(System.currentTimeMillis());
            return;
        }
        tracker.setIdleMs(Math.max(1, s.idleMinutes) * 60_000L);
        tracker.tick(System.currentTimeMillis());
    }

    /** Användaren stänger medvetet och var aktiv fram till dess — stäng vid nu. */
    private void finish() {
        tracker.close(System.currentTimeMillis());
    }

    @Override
    public void dispose() {
        timer.shutdownNow();
        finish();
    }
}
