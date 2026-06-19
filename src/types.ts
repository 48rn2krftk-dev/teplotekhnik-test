export type CalculationResult = {
  minutes: number;
  fuelUsed: number;
  fuelPerHour: number;
};

export type SlotData = CalculationResult & {
  title: string;
  savedAt: string;
  source?: CalculationSource;
};

export type CalculationSource =
  | {
      type: "byTime";
      startTime: string;
      endTime: string;
      fuelStart: number;
      fuelEnd: number;
    }
  | {
      type: "quick";
      duration: string;
      fuelUsed: number;
    }
  | {
      type: "summary";
      fuelStart: number | null;
      items: Array<{
        title: string;
        minutes: number;
        fuelUsed: number;
      }>;
    };

export type HistoryEntry = CalculationResult & {
  id: string;
  title: string;
  createdAt: string;
  normFuelPerHour: number | null;
  source: CalculationSource;
};

export type AppSettings = {
  normFuelPerHour: number | null;
  theme: "system" | "light" | "dark";
  layoutMode: "portrait" | "landscape";
  dateTimeInputMode: "friendly" | "calendar" | "asu";
  pinnedScreenIds: PinnedScreenId[];
};

export type ScreenId =
  | "quick"
  | "summary"
  | "thuLibrary"
  | "mmLibrary"
  | "chains"
  | "settings"
  | "all";

export type PinnedScreenId = Exclude<ScreenId, "all">;
