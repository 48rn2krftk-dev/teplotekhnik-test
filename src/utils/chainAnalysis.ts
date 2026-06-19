import type {
  DriverRoute,
  LocomotiveSection,
  ThuOperation,
} from "../domain/documents";
import { calculateManual } from "./calculations.ts";
import { durationMinutes } from "./documentTime.ts";

export type ChainDocument =
  | {
      type: "thu";
      document: ThuOperation;
    }
  | {
      type: "driverRoute";
      document: DriverRoute;
    };

export type ChainFuelGap = {
  sectionKey: string;
  previousFuel: number | null;
  nextFuel: number | null;
  difference: number | null;
  status: "continuous" | "gap" | "missing";
};

export type ChainLinkAnalysis = {
  previous: ChainDocument;
  next: ChainDocument;
  timeDifferenceMinutes: number;
  timeStatus: "continuous" | "gap" | "overlap";
  previousLocation: string | null;
  nextLocation: string | null;
  locationStatus: "continuous" | "gap" | "missing";
  fuelGaps: ChainFuelGap[];
};

export function sectionKey(section: LocomotiveSection): string {
  return `${section.series.trim()}|${section.locomotiveNumber.trim()}|${section.sectionNumber.trim()}`;
}

export function getChainDocumentStart(item: ChainDocument): string {
  return item.type === "thu"
    ? item.document.operationStart
    : item.document.routeStart;
}

export function getChainDocumentEnd(item: ChainDocument): string {
  return item.type === "thu"
    ? item.document.operationEnd
    : item.document.routeEnd;
}

export function getChainDocumentSections(
  item: ChainDocument
): LocomotiveSection[] {
  return item.document.sections;
}

export function getChainDocumentStartLocation(
  item: ChainDocument
): string | null {
  const location =
    item.type === "thu"
      ? item.document.station
      : item.document.departureStation;

  return location?.trim() ? location.trim() : null;
}

export function getChainDocumentEndLocation(
  item: ChainDocument
): string | null {
  const location =
    item.type === "thu" ? item.document.station : item.document.arrivalStation;

  return location?.trim() ? location.trim() : null;
}

function normalizeLocation(value: string): string {
  return value.trim().toLocaleLowerCase("ru-RU").replace(/\s+/g, " ");
}

export function sortChainDocuments(
  items: ChainDocument[]
): ChainDocument[] {
  return [...items].sort(
    (left, right) =>
      new Date(getChainDocumentStart(left)).getTime() -
      new Date(getChainDocumentStart(right)).getTime()
  );
}

export function analyzeChainLinks(
  sourceItems: ChainDocument[]
): ChainLinkAnalysis[] {
  const items = sortChainDocuments(sourceItems);

  return items.slice(0, -1).map((previous, index) => {
    const next = items[index + 1];
    const previousEnd = new Date(getChainDocumentEnd(previous)).getTime();
    const nextStart = new Date(getChainDocumentStart(next)).getTime();
    const timeDifferenceMinutes = Math.round(
      (nextStart - previousEnd) / 60000
    );
    const previousLocation = getChainDocumentEndLocation(previous);
    const nextLocation = getChainDocumentStartLocation(next);
    const locationStatus =
      previousLocation === null || nextLocation === null
        ? "missing"
        : normalizeLocation(previousLocation) === normalizeLocation(nextLocation)
          ? "continuous"
          : "gap";
    const previousSections = new Map(
      getChainDocumentSections(previous).map((section) => [
        sectionKey(section),
        section,
      ])
    );
    const nextSections = new Map(
      getChainDocumentSections(next).map((section) => [
        sectionKey(section),
        section,
      ])
    );
    const keys = [...new Set([
      ...previousSections.keys(),
      ...nextSections.keys(),
    ])].sort();

    const fuelGaps = keys.map<ChainFuelGap>((key) => {
      const previousSection = previousSections.get(key);
      const nextSection = nextSections.get(key);

      if (!previousSection || !nextSection) {
        return {
          sectionKey: key,
          previousFuel: previousSection?.fuelAtEnd ?? null,
          nextFuel: nextSection?.fuelAtStart ?? null,
          difference: null,
          status: "missing",
        };
      }

      const difference =
        nextSection.fuelAtStart - previousSection.fuelAtEnd;

      return {
        sectionKey: key,
        previousFuel: previousSection.fuelAtEnd,
        nextFuel: nextSection.fuelAtStart,
        difference,
        status: Math.abs(difference) < 0.000001 ? "continuous" : "gap",
      };
    });

    return {
      previous,
      next,
      timeDifferenceMinutes,
      timeStatus:
        timeDifferenceMinutes === 0
          ? "continuous"
          : timeDifferenceMinutes > 0
            ? "gap"
            : "overlap",
      previousLocation,
      nextLocation,
      locationStatus,
      fuelGaps,
    };
  });
}

export function calculateChainHotIdle(items: ChainDocument[]) {
  const idleOperations = items.filter(
    (item): item is Extract<ChainDocument, { type: "thu" }> =>
      item.type === "thu" && item.document.operationType !== "fueling"
  );
  const minutes = idleOperations.reduce(
    (sum, item) =>
      sum +
      durationMinutes(
        item.document.operationStart,
        item.document.operationEnd
      ),
    0
  );
  const fuelUsed = idleOperations.reduce(
    (sum, item) =>
      sum +
      item.document.sections.reduce(
        (sectionSum, section) =>
          sectionSum + section.fuelAtStart - section.fuelAtEnd,
        0
      ),
    0
  );

  return minutes > 0 ? calculateManual(minutes, fuelUsed) : null;
}
