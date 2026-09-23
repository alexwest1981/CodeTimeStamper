package codetimestamper;

import com.intellij.openapi.application.ApplicationManager;
import com.intellij.openapi.diagnostic.Logger;
import com.intellij.openapi.fileEditor.FileEditorManager;
import com.intellij.openapi.project.Project;
import com.intellij.openapi.vfs.LocalFileSystem;
import com.intellij.openapi.vfs.VirtualFile;
import com.intellij.openapi.wm.StatusBar;
import com.intellij.openapi.wm.StatusBarWidget;
import com.intellij.openapi.wm.StatusBarWidgetFactory;
import com.intellij.util.Consumer;
import java.awt.Component;
import java.awt.event.MouseEvent;
import java.nio.file.Path;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;

/**
 * Räknaren i IDE:ns statusrad.
 *
 * Registreras som statusBarWidgetFactory och dyker upp av sig själv:
 * plattformens isEnabledByDefault() är redan true, så ingen behöver leta upp
 * den i statusradens meny. Klick öppnar dagens rapport i editorn.
 *
 * Det här är också svaret på "var ser man siffran i IntelliJ?" — förut fanns
 * den bara i CLI:t.
 */
public final class Statusbar implements StatusBarWidgetFactory {

    static final String ID = "CodeTimeStamper";
    private static final Logger LOG = Logger.getInstance("CodeTimeStamper");

    @Override
    public @NotNull String getId() {
        return ID;
    }

    @Override
    public @NotNull String getDisplayName() {
        return "CodeTimeStamper";
    }

    @Override
    public boolean isAvailable(@NotNull Project project) {
        return true;
    }

    /**
     * Måste implementeras: statusBarWidgetFactory:s eget standardsvar kastar
     * AbstractMethodError (läst ur bytekoden med javap). Den koroutine-baserade
     * varianten delegerar hit, så en implementation räcker.
     */
    @Override
    public @NotNull StatusBarWidget createWidget(@NotNull Project project) {
        return new Tid(project);
    }

    /** Statusradens widget. Text, verktygstips och klick. */
    public static final class Tid implements StatusBarWidget, StatusBarWidget.TextPresentation {

        private final Project project;
        private volatile StatusBar bar;
        private volatile String text = "";

        Tid(Project project) {
            this.project = project;
        }

        @Override
        public @NotNull String ID() {
            return Statusbar.ID;
        }

        @Override
        public @NotNull WidgetPresentation getPresentation() {
            return this;
        }

        @Override
        public @NotNull String getText() {
            return text;
        }

        @Override
        public float getAlignment() {
            return Component.CENTER_ALIGNMENT;
        }

        @Override
        public @NotNull String getTooltipText() {
            return "CodeTimeStamper — aktiv kodtid idag, alla editorer. Klicka för dagens rapport.";
        }

        @Override
        public @Nullable Consumer<MouseEvent> getClickConsumer() {
            return e -> open();
        }

        @Override
        public void install(@NotNull StatusBar statusBar) {
            this.bar = statusBar;
            Stamper.projectOpened(project == null ? "" : project.getName());
            Stamper.watch(this);
            // Enda beviset för att räknaren verkligen monterades: en statusrad
            // finns bara i ett riktigt fönster, alltså kan raden inte skrivas i
            // en huvudlös körning. Det är därför den finns. Texten tas med, så
            // att det går att mäta vad räknaren visar utan att titta på skärmen.
            LOG.info("räknaren monterad i statusraden: \"" + getText() + "\"");
        }

        @Override
        public void dispose() {
            Stamper.unwatch(this);
        }

        /** Statusraden ritas på EDT, så uppdateringen läggs dit. */
        void set(String t) {
            if (t.equals(text)) {
                return;
            }
            text = t;
            StatusBar b = bar;
            if (b != null) {
                ApplicationManager.getApplication().invokeLater(() -> b.updateWidget(Statusbar.ID));
            }
        }

        private void open() {
            if (project == null || project.isDisposed()) {
                return;
            }
            Path dir = Tracker.dataDir();
            String day = Tracker.dayKey(System.currentTimeMillis());
            Rapport.write(dir, day); // färska siffror när man klickar
            VirtualFile vf = LocalFileSystem.getInstance()
                    .refreshAndFindFileByNioFile(Rapport.rapportFile(dir, day));
            if (vf == null) {
                LOG.warn("hittade inte rapportfilen för " + day);
                return;
            }
            FileEditorManager.getInstance(project).openFile(vf, true);
        }
    }
}
