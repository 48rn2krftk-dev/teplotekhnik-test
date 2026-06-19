import type { AppSettings, HistoryEntry, SlotData } from "../types";
import { normalizePinnedScreens } from "../navigation";

const SETTINGS_KEY = "hotIdle.settings";
const SLOTS_KEY = "hotIdle.slots";
const HISTORY_KEY = "hotIdle.history";
const STATIONS_KEY = "hotIdle.stations";
const MAX_SLOTS = 3;
const MAX_HISTORY_ITEMS = 50;
const MAX_THU_STATIONS = 50;

function defaultLayoutMode(): AppSettings["layoutMode"] {
  return window.innerWidth > window.innerHeight ? "landscape" : "portrait";
}

export function getSettings(): AppSettings {
  const raw = localStorage.getItem(SETTINGS_KEY);

  if (!raw) {
    return {
      normFuelPerHour: null,
      theme: "system",
      layoutMode: defaultLayoutMode(),
      dateTimeInputMode: "friendly",
      pinnedScreenIds: normalizePinnedScreens(null),
    };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<AppSettings>;

    return {
      normFuelPerHour:
        typeof parsed.normFuelPerHour === "number"
          ? parsed.normFuelPerHour
          : null,
      theme:
        parsed.theme === "light" ||
        parsed.theme === "dark" ||
        parsed.theme === "system"
          ? parsed.theme
          : "system",
      layoutMode:
        parsed.layoutMode === "portrait" || parsed.layoutMode === "landscape"
          ? parsed.layoutMode
          : defaultLayoutMode(),
      dateTimeInputMode:
        parsed.dateTimeInputMode === "calendar" ||
        parsed.dateTimeInputMode === "asu"
          ? parsed.dateTimeInputMode
          : "friendly",
      pinnedScreenIds: normalizePinnedScreens(parsed.pinnedScreenIds),
    };
  } catch {
    return {
      normFuelPerHour: null,
      theme: "system",
      layoutMode: defaultLayoutMode(),
      dateTimeInputMode: "friendly",
      pinnedScreenIds: normalizePinnedScreens(null),
    };
  }
}

export function saveSettings(settings: AppSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  window.dispatchEvent(new Event("hotIdle.settingsChanged"));
}

export function subscribeSettingsChange(callback: () => void) {
  window.addEventListener("hotIdle.settingsChanged", callback);

  return () => {
    window.removeEventListener("hotIdle.settingsChanged", callback);
  };
}

function normalizeSlots(slots: Array<SlotData | null>): Array<SlotData | null> {
  const filledSlots = slots.filter((slot): slot is SlotData => slot !== null);
  const emptyCount = Math.max(0, MAX_SLOTS - filledSlots.length);

  return [...filledSlots, ...Array(emptyCount).fill(null)].slice(0, MAX_SLOTS);
}

export function getSlots(): Array<SlotData | null> {
  const raw = localStorage.getItem(SLOTS_KEY);

  if (!raw) {
    return [null, null, null];
  }

  try {
    const parsed = JSON.parse(raw);

    if (Array.isArray(parsed)) {
      return normalizeSlots(parsed);
    }

    return [null, null, null];
  } catch {
    return [null, null, null];
  }
}

export function saveSlot(index: number, data: SlotData) {
  const slots = getSlots();
  slots[index] = data;

  localStorage.setItem(SLOTS_KEY, JSON.stringify(normalizeSlots(slots)));
  window.dispatchEvent(new Event("hotIdle.slotsChanged"));
}

export function clearSlot(index: number) {
  const slots = getSlots();
  slots.splice(index, 1);
  slots.push(null);

  localStorage.setItem(SLOTS_KEY, JSON.stringify(normalizeSlots(slots)));
  window.dispatchEvent(new Event("hotIdle.slotsChanged"));
}

export function subscribeSlotsChange(callback: () => void) {
  window.addEventListener("hotIdle.slotsChanged", callback);

  return () => {
    window.removeEventListener("hotIdle.slotsChanged", callback);
  };
}

export function getHistory(): HistoryEntry[] {
  const raw = localStorage.getItem(HISTORY_KEY);

  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, MAX_HISTORY_ITEMS) : [];
  } catch {
    return [];
  }
}

export function addHistoryEntry(entry: HistoryEntry) {
  const history = [entry, ...getHistory()].slice(0, MAX_HISTORY_ITEMS);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  window.dispatchEvent(new Event("hotIdle.historyChanged"));
}

export function clearHistoryEntry(id: string) {
  const history = getHistory().filter((entry) => entry.id !== id);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  window.dispatchEvent(new Event("hotIdle.historyChanged"));
}

export function clearHistory() {
  localStorage.removeItem(HISTORY_KEY);
  window.dispatchEvent(new Event("hotIdle.historyChanged"));
}

export function subscribeHistoryChange(callback: () => void) {
  window.addEventListener("hotIdle.historyChanged", callback);

  return () => {
    window.removeEventListener("hotIdle.historyChanged", callback);
  };
}

export function getThuStations(): string[] {
  const raw =
    localStorage.getItem(STATIONS_KEY) ??
    localStorage.getItem("hotIdle.thuStations");

  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed
          .filter((station): station is string => typeof station === "string")
          .map((station) => station.trim())
          .filter(Boolean)
          .slice(0, MAX_THU_STATIONS)
      : [];
  } catch {
    return [];
  }
}

export function saveThuStation(station: string) {
  const normalized = station.trim();
  if (!normalized) return;

  const stations = [
    normalized,
    ...getThuStations().filter(
      (item) => item.toLowerCase() !== normalized.toLowerCase()
    ),
  ].slice(0, MAX_THU_STATIONS);

  localStorage.setItem(STATIONS_KEY, JSON.stringify(stations));
  window.dispatchEvent(new Event("hotIdle.thuStationsChanged"));
}

export function subscribeThuStationsChange(callback: () => void) {
  window.addEventListener("hotIdle.thuStationsChanged", callback);

  return () => {
    window.removeEventListener("hotIdle.thuStationsChanged", callback);
  };
}
