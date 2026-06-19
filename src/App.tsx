import {
  Calculator,
  FileText,
  Grid2X2,
  Layers3,
  Link2,
  Route,
  Settings,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { uiText } from "./content";
import {
  getScreenDefinition,
  screenDefinitions,
  type ScreenIconName,
} from "./navigation";
import { AllSectionsScreen } from "./screens/AllSectionsScreen";
import { DriverRouteLibraryScreen } from "./screens/DriverRouteLibraryScreen";
import { FuelChainLibraryScreen } from "./screens/FuelChainLibraryScreen";
import { QuickScreen } from "./screens/QuickScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { SummaryScreen } from "./screens/SummaryScreen";
import { ThuLibraryScreen } from "./screens/ThuLibraryScreen";
import type { HistoryEntry, ScreenId } from "./types";
import {
  getSettings,
  subscribeSettingsChange,
} from "./utils/storage";
import { applyTheme } from "./utils/theme";

type ConnectionStatus = "checking" | "online" | "offline";

function ScreenIcon({
  name,
  size = 21,
}: {
  name: ScreenIconName;
  size?: number;
}) {
  const props = { size };

  if (name === "clock") return <Calculator {...props} />;
  if (name === "calculator") return <Calculator {...props} />;
  if (name === "layers") return <Layers3 {...props} />;
  if (name === "fileText") return <FileText {...props} />;
  if (name === "route") return <Route {...props} />;
  if (name === "link") return <Link2 {...props} />;
  if (name === "settings") return <Settings {...props} />;
  return <Grid2X2 {...props} />;
}

export default function App() {
  const [screen, setScreen] = useState<ScreenId>("thuLibrary");
  const [appSettings, setAppSettings] = useState(() => getSettings());
  const [restoredEntry, setRestoredEntry] = useState<HistoryEntry | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(
    () => (navigator.onLine ? "checking" : "offline")
  );
  const connectionStatusRef = useRef<ConnectionStatus>(
    navigator.onLine ? "checking" : "offline"
  );
  const [showConnectionLabel, setShowConnectionLabel] = useState(true);

  useEffect(() => {
    let stopWatchingSystemTheme = applyTheme(getSettings().theme);

    const unsubscribeSettings = subscribeSettingsChange(() => {
      stopWatchingSystemTheme();
      const nextSettings = getSettings();
      setAppSettings(nextSettings);
      stopWatchingSystemTheme = applyTheme(nextSettings.theme);
    });

    return () => {
      stopWatchingSystemTheme();
      unsubscribeSettings();
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    let activeController: AbortController | null = null;
    let labelTimeoutId = window.setTimeout(() => {
      setShowConnectionLabel(false);
    }, 2500);

    function updateConnectionStatus(status: ConnectionStatus) {
      if (status === connectionStatusRef.current) return;
      connectionStatusRef.current = status;
      setConnectionStatus(status);
      setShowConnectionLabel(true);
      window.clearTimeout(labelTimeoutId);
      labelTimeoutId = window.setTimeout(() => {
        setShowConnectionLabel(false);
      }, 2500);
    }

    async function checkConnection() {
      if (!navigator.onLine) {
        updateConnectionStatus("offline");
        return;
      }

      activeController?.abort();
      const controller = new AbortController();
      activeController = controller;
      const timeoutId = window.setTimeout(() => controller.abort(), 4000);

      try {
        const response = await fetch(
          `${import.meta.env.BASE_URL}manifest.webmanifest?online=${Date.now()}`,
          {
            method: "HEAD",
            cache: "no-store",
            signal: controller.signal,
          }
        );

        if (isMounted && activeController === controller) {
          updateConnectionStatus(response.ok ? "online" : "offline");
        }
      } catch {
        if (isMounted && activeController === controller) {
          updateConnectionStatus("offline");
        }
      } finally {
        window.clearTimeout(timeoutId);

        if (activeController === controller) {
          activeController = null;
        }
      }
    }

    function handleOffline() {
      activeController?.abort();
      updateConnectionStatus("offline");
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        void checkConnection();
      }
    }

    void checkConnection();

    const intervalId = window.setInterval(() => {
      void checkConnection();
    }, 15000);

    window.addEventListener("online", checkConnection);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("focus", checkConnection);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      isMounted = false;
      activeController?.abort();
      window.clearTimeout(labelTimeoutId);
      window.clearInterval(intervalId);
      window.removeEventListener("online", checkConnection);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("focus", checkConnection);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  function navigate(screenName: ScreenId) {
    setRestoredEntry(null);
    setScreen(screenName);
  }

  function openHistoryEntry(entry: HistoryEntry) {
    setRestoredEntry(entry);
    setScreen(entry.source.type === "summary" ? "summary" : "quick");
  }

  return (
    <div className={`app appLayout-${appSettings.layoutMode}`}>
      <header className="appHeader">
        <div>
          <p className="appEyebrow">{uiText.app.eyebrow}</p>
          <h1>{uiText.app.title}</h1>
        </div>

        <div className="headerActions">
          <div
            className={`connectionStatus ${connectionStatus} ${
              showConnectionLabel ? "expanded" : "compact"
            }`}
            role="status"
            aria-live="polite"
            title={
              connectionStatus === "checking"
                ? uiText.app.connection.checking
                : connectionStatus === "online"
                  ? uiText.app.connection.online
                  : uiText.app.connection.offline
            }
          >
            <span className="connectionDot" />
            {showConnectionLabel && (
              <span>
                {connectionStatus === "checking"
                  ? uiText.app.connection.checking
                  : connectionStatus === "online"
                    ? uiText.app.connection.online
                    : uiText.app.connection.offline}
              </span>
            )}
          </div>

          <button
            className={
              screen === "settings"
                ? "headerIconButton active"
                : "headerIconButton"
            }
            type="button"
            aria-label={uiText.app.navigation.settings}
            title={uiText.app.navigation.settings}
            onClick={() => navigate("settings")}
          >
            <Settings size={20} />
          </button>
        </div>
      </header>

      <main className="appMain">
        {screen === "quick" && (
          <QuickScreen
            key={restoredEntry?.id ?? "quick-new"}
            initialEntry={
              restoredEntry?.source.type === "quick" ||
              restoredEntry?.source.type === "byTime"
                ? restoredEntry
                : null
            }
          />
        )}
        {screen === "summary" && (
          <SummaryScreen
            key={restoredEntry?.id ?? "summary-new"}
            initialEntry={
              restoredEntry?.source.type === "summary" ? restoredEntry : null
            }
          />
        )}
        {screen === "settings" && (
          <SettingsScreen onOpenHistoryEntry={openHistoryEntry} />
        )}
        {screen === "thuLibrary" && (
          <ThuLibraryScreen />
        )}
        {screen === "mmLibrary" && (
          <DriverRouteLibraryScreen />
        )}
        {screen === "chains" && (
          <FuelChainLibraryScreen onOpenScreen={navigate} />
        )}
        {screen === "all" && (
          <AllSectionsScreen
            screens={screenDefinitions.filter(
              (item) => item.id !== "all" && item.id !== "settings"
            )}
            onOpenScreen={navigate}
            renderIcon={(icon) => <ScreenIcon name={icon} size={22} />}
          />
        )}
      </main>

      <nav
        className={`bottomNav appLayout-${appSettings.layoutMode}`}
        style={{
          gridTemplateColumns: `repeat(${appSettings.pinnedScreenIds.length + 1}, minmax(0, 1fr))`,
        }}
      >
        {appSettings.pinnedScreenIds.map((screenId) => {
          const definition = getScreenDefinition(screenId);

          return (
            <button
              className={screen === screenId ? "navButton active" : "navButton"}
              type="button"
              key={screenId}
              onClick={() => navigate(screenId)}
            >
              <ScreenIcon name={definition.icon} />
              <span>{definition.shortTitle}</span>
            </button>
          );
        })}

        <button
          className={screen === "all" ? "navButton active" : "navButton"}
          type="button"
          onClick={() => navigate("all")}
        >
          <Grid2X2 size={21} />
          <span>{uiText.app.navigation.all}</span>
        </button>
      </nav>
    </div>
  );
}
