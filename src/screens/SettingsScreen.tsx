import {
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  ExternalLink,
  Gift,
  GitFork,
  Mail,
  MessageCircle,
  Monitor,
  Moon,
  Send,
  SlidersHorizontal,
  Sun,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { links, uiText } from "../content";
import {
  MAX_PINNED_SCREENS,
  screenDefinitions,
} from "../navigation";
import type {
  AppSettings,
  HistoryEntry,
  PinnedScreenId,
} from "../types";
import { parseFuel } from "../utils/calculations";
import { formatNumber, formatTime } from "../utils/format";
import {
  clearHistory,
  clearHistoryEntry,
  getHistory,
  getSettings,
  saveSettings,
  subscribeHistoryChange,
} from "../utils/storage";

function formatHistoryDate(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function getHistoryType(entry: HistoryEntry): string {
  if (entry.source.type === "byTime") {
    return uiText.settings.historyType.byTime;
  }
  if (entry.source.type === "quick") {
    return uiText.settings.historyType.quick;
  }
  return uiText.settings.historyType.summary;
}

function HistorySource({ entry }: { entry: HistoryEntry }) {
  if (entry.source.type === "byTime") {
    return (
      <p className="historySource">
        {entry.source.startTime} → {entry.source.endTime}
        <br />
        {uiText.settings.balances}: {formatNumber(entry.source.fuelStart)} →{" "}
        {formatNumber(entry.source.fuelEnd)}{" "}
        {uiText.common.units.kilograms}
      </p>
    );
  }

  if (entry.source.type === "quick") {
    return (
      <p className="historySource">
        {uiText.settings.time}: {entry.source.duration}
        <br />
        {uiText.settings.fuel}: {formatNumber(entry.source.fuelUsed)}{" "}
        {uiText.common.units.kilograms}
      </p>
    );
  }

  return (
    <p className="historySource">
      {entry.source.fuelStart !== null &&
        entry.source.fuelStart !== undefined && (
          <>
            {uiText.settings.chainStart}:{" "}
            {formatNumber(entry.source.fuelStart)}{" "}
            {uiText.common.units.kilograms}
            <br />
          </>
        )}
      {entry.source.items
        .map(
          (item) =>
            `${item.title}: ${formatTime(item.minutes)}, ${formatNumber(item.fuelUsed)} ${uiText.common.units.kilograms}`
        )
        .join(" · ")}
    </p>
  );
}

type SettingsScreenProps = {
  onOpenHistoryEntry: (entry: HistoryEntry) => void;
};

export function SettingsScreen({
  onOpenHistoryEntry,
}: SettingsScreenProps) {
  const [settings, setSettings] = useState<AppSettings>(() => getSettings());
  const [settingsPage, setSettingsPage] = useState<"main" | "quickAccess">(
    "main"
  );
  const [normInput, setNormInput] = useState(() => {
    const norm = getSettings().normFuelPerHour;
    return norm === null ? "" : formatNumber(norm);
  });
  const [savedMessage, setSavedMessage] = useState("");
  const [quickAccessMessage, setQuickAccessMessage] = useState("");
  const [history, setHistory] = useState(() => getHistory());

  useEffect(() => {
    return subscribeHistoryChange(() => {
      setHistory(getHistory());
    });
  }, []);

  const parsedNorm = normInput.trim() === "" ? null : parseFuel(normInput);
  const normError = normInput.trim() !== "" && parsedNorm === null;

  function handleSaveNorm() {
    if (normError) return;

    const nextSettings: AppSettings = {
      ...settings,
      normFuelPerHour: parsedNorm,
    };

    setSettings(nextSettings);
    saveSettings(nextSettings);

    setSavedMessage(uiText.settings.normSaved);

    window.setTimeout(() => {
      setSavedMessage("");
    }, 1800);
  }

  function handleClearNorm() {
    const nextSettings: AppSettings = {
      ...settings,
      normFuelPerHour: null,
    };

    setSettings(nextSettings);
    saveSettings(nextSettings);
    setNormInput("");
    setSavedMessage(uiText.settings.normCleared);

    window.setTimeout(() => {
      setSavedMessage("");
    }, 1800);
  }

  function handleThemeChange(theme: AppSettings["theme"]) {
    const nextSettings: AppSettings = {
      ...settings,
      theme,
    };

    setSettings(nextSettings);
    saveSettings(nextSettings);
  }

  function handleLayoutModeChange(layoutMode: AppSettings["layoutMode"]) {
    const nextSettings: AppSettings = {
      ...settings,
      layoutMode,
    };

    setSettings(nextSettings);
    saveSettings(nextSettings);
  }

  function handleDateTimeInputModeChange(
    dateTimeInputMode: AppSettings["dateTimeInputMode"]
  ) {
    const nextSettings: AppSettings = {
      ...settings,
      dateTimeInputMode,
    };

    setSettings(nextSettings);
    saveSettings(nextSettings);
  }

  function togglePinnedScreen(screenId: PinnedScreenId) {
    const isPinned = settings.pinnedScreenIds.includes(screenId);

    if (isPinned && settings.pinnedScreenIds.length === 1) {
      setQuickAccessMessage(uiText.settings.quickAccessMinimum);
      return;
    }

    if (!isPinned && settings.pinnedScreenIds.length >= MAX_PINNED_SCREENS) {
      setQuickAccessMessage(uiText.settings.quickAccessLimit);
      return;
    }

    const pinnedScreenIds = isPinned
      ? settings.pinnedScreenIds.filter((id) => id !== screenId)
      : [...settings.pinnedScreenIds, screenId];
    const nextSettings = { ...settings, pinnedScreenIds };

    setSettings(nextSettings);
    saveSettings(nextSettings);
    setQuickAccessMessage("");
  }

  function movePinnedScreen(screenId: PinnedScreenId, direction: -1 | 1) {
    const currentIndex = settings.pinnedScreenIds.indexOf(screenId);
    const targetIndex = currentIndex + direction;

    if (
      currentIndex < 0 ||
      targetIndex < 0 ||
      targetIndex >= settings.pinnedScreenIds.length
    ) {
      return;
    }

    const pinnedScreenIds = [...settings.pinnedScreenIds];
    [pinnedScreenIds[currentIndex], pinnedScreenIds[targetIndex]] = [
      pinnedScreenIds[targetIndex],
      pinnedScreenIds[currentIndex],
    ];
    const nextSettings = { ...settings, pinnedScreenIds };

    setSettings(nextSettings);
    saveSettings(nextSettings);
  }

  if (settingsPage === "quickAccess") {
    return (
      <section className="screen">
        <div className="card">
          <button
            className="secondaryButton compact"
            type="button"
            onClick={() => setSettingsPage("main")}
          >
            <ArrowLeft size={18} />
            Назад
          </button>

          <div className="sectionTitle settingsNestedTitle">
            <h2>{uiText.settings.quickAccessTitle}</h2>
            <p>{uiText.settings.quickAccessDescription}</p>
          </div>

          <div className="quickAccessList">
            {screenDefinitions
              .filter((screen) => screen.pinnable)
              .map((screen) => {
                const screenId = screen.id as PinnedScreenId;
                const position = settings.pinnedScreenIds.indexOf(screenId);
                const isPinned = position >= 0;

                return (
                  <div className="quickAccessItem" key={screen.id}>
                    <label>
                      <input
                        type="checkbox"
                        checked={isPinned}
                        onChange={() => togglePinnedScreen(screenId)}
                      />
                      <span>
                        <b>{screen.title}</b>
                        <small>{screen.description}</small>
                      </span>
                    </label>

                    {isPinned && (
                      <div className="quickAccessOrder">
                        <button
                          type="button"
                          aria-label={`Поднять ${screen.title}`}
                          disabled={position === 0}
                          onClick={() => movePinnedScreen(screenId, -1)}
                        >
                          <ArrowUp size={17} />
                        </button>
                        <button
                          type="button"
                          aria-label={`Опустить ${screen.title}`}
                          disabled={
                            position === settings.pinnedScreenIds.length - 1
                          }
                          onClick={() => movePinnedScreen(screenId, 1)}
                        >
                          <ArrowDown size={17} />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
          </div>

          {quickAccessMessage && (
            <div className="warningBox">{quickAccessMessage}</div>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="screen">
      <div className="card">
        <div className="sectionTitle">
          <h2>{uiText.settings.title}</h2>
          <p>{uiText.settings.description}</p>
        </div>

        <label className="field">
          <span>{uiText.settings.normLabel}</span>
          <input
            value={normInput}
            onChange={(e) => setNormInput(e.target.value)}
            inputMode="decimal"
            placeholder={uiText.settings.normPlaceholder}
          />
        </label>

        {normError && (
          <div className="errorBox">
            {uiText.settings.normError}
          </div>
        )}

        <div className="buttonRow">
          <button
            className="primaryButton"
            type="button"
            onClick={handleSaveNorm}
            disabled={normError}
          >
            {uiText.settings.saveNorm}
          </button>

          <button
            className="secondaryButton compact"
            type="button"
            onClick={handleClearNorm}
          >
            {uiText.common.clear}
          </button>
        </div>

        {savedMessage && <div className="successBox">{savedMessage}</div>}
      </div>

      <div className="card">
        <div className="sectionTitle">
          <h2>{uiText.settings.appearanceTitle}</h2>
          <p>{uiText.settings.appearanceDescription}</p>
        </div>

        <div
          className="themeSelector"
          role="group"
          aria-label={uiText.settings.themeSelectorLabel}
        >
          <button
            className={
              settings.theme === "system"
                ? "themeButton active"
                : "themeButton"
            }
            type="button"
            aria-pressed={settings.theme === "system"}
            onClick={() => handleThemeChange("system")}
          >
            <Monitor size={18} />
            {uiText.settings.theme.system}
          </button>
          <button
            className={
              settings.theme === "light"
                ? "themeButton active"
                : "themeButton"
            }
            type="button"
            aria-pressed={settings.theme === "light"}
            onClick={() => handleThemeChange("light")}
          >
            <Sun size={18} />
            {uiText.settings.theme.light}
          </button>
          <button
            className={
              settings.theme === "dark"
                ? "themeButton active"
                : "themeButton"
            }
            type="button"
            aria-pressed={settings.theme === "dark"}
            onClick={() => handleThemeChange("dark")}
          >
            <Moon size={18} />
            {uiText.settings.theme.dark}
          </button>
        </div>

        <div className="settingsSubsection">
          <p className="settingsSubsectionTitle">
            {uiText.settings.layoutModeLabel}
          </p>

          <div
            className="themeSelector"
            role="group"
            aria-label={uiText.settings.layoutModeLabel}
          >
            <button
              className={
                settings.layoutMode === "portrait"
                  ? "themeButton active"
                  : "themeButton"
              }
              type="button"
              aria-pressed={settings.layoutMode === "portrait"}
              onClick={() => handleLayoutModeChange("portrait")}
            >
              {uiText.settings.layoutMode.portrait}
            </button>
            <button
              className={
                settings.layoutMode === "landscape"
                  ? "themeButton active"
                  : "themeButton"
              }
              type="button"
              aria-pressed={settings.layoutMode === "landscape"}
              onClick={() => handleLayoutModeChange("landscape")}
            >
              {uiText.settings.layoutMode.landscape}
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="sectionTitle">
          <h2>{uiText.settings.inputTitle}</h2>
          <p>{uiText.settings.inputDescription}</p>
        </div>

        <div
          className="themeSelector"
          role="group"
          aria-label={uiText.settings.dateTimeInputModeLabel}
        >
          <button
            className={
              settings.dateTimeInputMode === "friendly"
                ? "themeButton active"
                : "themeButton"
            }
            type="button"
            aria-pressed={settings.dateTimeInputMode === "friendly"}
            onClick={() => handleDateTimeInputModeChange("friendly")}
          >
            {uiText.settings.dateTimeInputMode.friendly}
          </button>
          <button
            className={
              settings.dateTimeInputMode === "calendar"
                ? "themeButton active"
                : "themeButton"
            }
            type="button"
            aria-pressed={settings.dateTimeInputMode === "calendar"}
            onClick={() => handleDateTimeInputModeChange("calendar")}
          >
            {uiText.settings.dateTimeInputMode.calendar}
          </button>
          <button
            className={
              settings.dateTimeInputMode === "asu"
                ? "themeButton active"
                : "themeButton"
            }
            type="button"
            aria-pressed={settings.dateTimeInputMode === "asu"}
            onClick={() => handleDateTimeInputModeChange("asu")}
          >
            {uiText.settings.dateTimeInputMode.asu}
          </button>
        </div>
      </div>

      <div className="card">
        <div className="sectionTitle">
          <h2>{uiText.settings.quickAccessTitle}</h2>
          <p>{uiText.settings.quickAccessDescription}</p>
        </div>

        <button
          className="sectionLink settingsOpenButton"
          type="button"
          onClick={() => setSettingsPage("quickAccess")}
        >
          <span className="sectionLinkIcon">
            <SlidersHorizontal size={21} />
          </span>
          <span>
            <b>Настроить кнопки</b>
            <small>Откроется отдельный экран без лишней прокрутки.</small>
          </span>
        </button>
      </div>

      <div className="card settingsHistoryCard">
        <div className="historyTitle">
          <div className="sectionTitle">
            <h2>{uiText.settings.historyTitle}</h2>
            <p>{uiText.settings.historyDescription}</p>
          </div>

          {history.length > 0 && (
            <button
              className="dangerButton"
              type="button"
              onClick={clearHistory}
            >
              {uiText.common.clearAll}
            </button>
          )}
        </div>

        {history.length === 0 ? (
          <p className="emptyHistory">{uiText.settings.emptyHistory}</p>
        ) : (
          <div className="historyList">
            {history.map((entry) => {
              const normFuel =
                entry.normFuelPerHour === null
                  ? null
                  : entry.normFuelPerHour * (entry.minutes / 60);

              return (
                <article
                  className="historyCard interactive"
                  key={entry.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onOpenHistoryEntry(entry)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onOpenHistoryEntry(entry);
                    }
                  }}
                >
                  <div className="historyHeader">
                    <div>
                      <b>{entry.title}</b>
                      <p>
                        {getHistoryType(entry)} ·{" "}
                        {formatHistoryDate(entry.createdAt)}
                      </p>
                    </div>

                    <button
                      className="iconDangerButton"
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        clearHistoryEntry(entry.id);
                      }}
                      aria-label={uiText.settings.deleteHistoryEntry(
                        entry.title
                      )}
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>

                  <HistorySource entry={entry} />

                  <div className="historyResult">
                    <span>{formatTime(entry.minutes)}</span>
                    <span>
                      {formatNumber(entry.fuelUsed)}{" "}
                      {uiText.common.units.kilograms}
                    </span>
                    <b>
                      {formatNumber(entry.fuelPerHour)}{" "}
                      {uiText.common.units.kilogramsPerHour}
                    </b>
                  </div>

                  {entry.normFuelPerHour !== null && normFuel !== null && (
                    <p className="historyNorm">
                      {uiText.settings.calculationNorm}:{" "}
                      {formatNumber(entry.normFuelPerHour)}{" "}
                      {uiText.common.units.kilogramsPerHour} ·{" "}
                      {formatNumber(normFuel)} {uiText.common.units.kilograms}{" "}
                      {uiText.settings.forPeriod}
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>

      <div className="card">
        <div className="sectionTitle">
          <h2>{uiText.settings.feedbackTitle}</h2>
          <p>{uiText.settings.feedbackDescription}</p>
        </div>

        <div className="contactLinks">
          <a className="contactLink" href={links.email}>
            <Mail size={21} />
            <span>
              <b>{uiText.settings.emailTitle}</b>
              <small>{uiText.settings.emailDescription}</small>
            </span>
            <ExternalLink size={18} />
          </a>

          <a
            className="contactLink"
            href={links.telegram}
            target="_blank"
            rel="noreferrer"
          >
            <Send size={21} />
            <span>
              <b>{uiText.settings.telegramTitle}</b>
              <small>{uiText.settings.telegramDescription}</small>
            </span>
            <ExternalLink size={18} />
          </a>

          <a
            className="contactLink"
            href={links.express}
            target="_blank"
            rel="noreferrer"
          >
            <MessageCircle size={21} />
            <span>
              <b>{uiText.settings.expressTitle}</b>
              <small>{uiText.settings.expressDescription}</small>
            </span>
            <ExternalLink size={18} />
          </a>
        </div>
      </div>

      <div className="card supportCard">
        <Gift className="supportIcon" size={26} />
        <div>
          <h2>{uiText.settings.supportTitle}</h2>
          <p>{uiText.settings.supportDescription}</p>
        </div>
        <a
          className="supportButton"
          href={links.support}
          target="_blank"
          rel="noreferrer"
        >
          {uiText.settings.supportButton}
          <ExternalLink size={18} />
        </a>
      </div>

      <div className="card">
        <div className="sectionTitle">
          <h2>{uiText.settings.aboutTitle}</h2>
          <p>{uiText.app.version}</p>
        </div>

        <a
          className="githubLink"
          href={links.github}
          target="_blank"
          rel="noreferrer"
        >
          <GitFork size={21} />
          <span>
            <b>{uiText.settings.githubTitle}</b>
            <small>{uiText.settings.developer}</small>
          </span>
          <ExternalLink size={18} />
        </a>

        <p className="installHint">
          {uiText.settings.installHint}
        </p>
      </div>
    </section>
  );
}
