package codetimestamper;

import com.intellij.openapi.application.ApplicationManager;
import com.intellij.openapi.components.PersistentStateComponent;
import com.intellij.openapi.components.State;
import com.intellij.openapi.components.Storage;
import org.jetbrains.annotations.NotNull;

/**
 * Inställningar utan inställningssida: de bor i codetimestamper.xml i IDE:ns
 * konfigurationsmapp. En sida i Inställningar är ~40 rader UI — lägg till den om
 * någon annan än Alex ska kunna ändra tröskeln.
 */
@State(name = "CodeTimeStamper", storages = @Storage("codetimestamper.xml"))
public final class Settings implements PersistentStateComponent<Settings.Data> {

    public static final class Data {
        public int idleMinutes = 30;
        public boolean enabled = true;
        /** Spara projektmappens namn (bara namnet, aldrig sökvägen) i loggen. */
        public boolean recordProject = true;
    }

    private Data data = new Data();

    public static Settings getInstance() {
        return ApplicationManager.getApplication().getService(Settings.class);
    }

    @Override
    public Data getState() {
        return data;
    }

    @Override
    public void loadState(@NotNull Data state) {
        this.data = state;
    }
}
