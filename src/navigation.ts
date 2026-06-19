import type { PinnedScreenId, ScreenId } from "./types";

export type ScreenIconName =
  | "clock"
  | "calculator"
  | "layers"
  | "fileText"
  | "route"
  | "link"
  | "settings"
  | "grid";

export type ScreenDefinition = {
  id: ScreenId;
  title: string;
  shortTitle: string;
  description: string;
  icon: ScreenIconName;
  pinnable: boolean;
};

export const MAX_PINNED_SCREENS = 4;

export const DEFAULT_PINNED_SCREENS: PinnedScreenId[] = [
  "thuLibrary",
  "mmLibrary",
  "quick",
];

export const screenDefinitions: ScreenDefinition[] = [
  {
    id: "thuLibrary",
    title: "Операции ТХУ-3",
    shortTitle: "ТХУ-3",
    description: "Создание и хранение операций прогрева, маневров и экипировки.",
    icon: "fileText",
    pinnable: true,
  },
  {
    id: "mmLibrary",
    title: "Маршруты машиниста",
    shortTitle: "ММ",
    description: "Маршруты, посекционное топливо и результаты таксировки.",
    icon: "route",
    pinnable: true,
  },
  {
    id: "chains",
    title: "Топливные цепочки",
    shortTitle: "Цепочки",
    description: "Сборка цепочек, поиск разрывов и варианты корректировки.",
    icon: "link",
    pinnable: true,
  },
  {
    id: "quick",
    title: "Расчёт горячего простоя",
    shortTitle: "Расчёт",
    description: "Быстрый расчёт расхода по времени или длительности.",
    icon: "calculator",
    pinnable: true,
  },
  {
    id: "summary",
    title: "Сложение прогревов",
    shortTitle: "Сумма",
    description: "Текущий инструмент суммирования нескольких прогревов.",
    icon: "layers",
    pinnable: true,
  },
  {
    id: "settings",
    title: "Настройки",
    shortTitle: "Настройки",
    description: "Норматив, оформление, быстрый доступ и сведения о приложении.",
    icon: "settings",
    pinnable: false,
  },
  {
    id: "all",
    title: "Все разделы",
    shortTitle: "Все",
    description: "Полный список доступных инструментов приложения.",
    icon: "grid",
    pinnable: false,
  },
];

export function getScreenDefinition(id: ScreenId): ScreenDefinition {
  return (
    screenDefinitions.find((screen) => screen.id === id) ??
    screenDefinitions[0]
  );
}

export function normalizePinnedScreens(
  value: unknown
): PinnedScreenId[] {
  if (!Array.isArray(value)) return DEFAULT_PINNED_SCREENS;

  const availableIds = new Set(
    screenDefinitions
      .filter((screen) => screen.pinnable)
      .map((screen) => screen.id)
  );
  const migratedValue = value.map((id) => (id === "byTime" ? "quick" : id));
  const normalized = migratedValue.filter(
    (id, index): id is PinnedScreenId =>
      typeof id === "string" &&
      availableIds.has(id as ScreenId) &&
      migratedValue.indexOf(id) === index
  );

  return normalized.length > 0
    ? normalized.slice(0, MAX_PINNED_SCREENS)
    : DEFAULT_PINNED_SCREENS;
}
