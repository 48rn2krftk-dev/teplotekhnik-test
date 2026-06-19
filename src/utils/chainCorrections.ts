import type {
  DriverRoute,
  FuelChainCorrection,
  LocomotiveSection,
  ThuOperation,
} from "../domain/documents";
import {
  analyzeChainLinks,
  calculateChainHotIdle,
  getChainDocumentEnd,
  getChainDocumentEndLocation,
  getChainDocumentStart,
  getChainDocumentSections,
  sectionKey,
  sortChainDocuments,
  type ChainLinkAnalysis,
  type ChainDocument,
} from "./chainAnalysis.ts";
import { durationMinutes } from "./documentTime.ts";
import { calculateDriverRouteTaxation } from "./driverRouteCalculations.ts";

function cloneSections(sections: LocomotiveSection[]): LocomotiveSection[] {
  return sections.map((section) => ({ ...section }));
}

export function cloneChainDocuments(
  items: ChainDocument[]
): ChainDocument[] {
  return items.map((item) =>
    item.type === "thu"
      ? {
          type: "thu",
          document: {
            ...item.document,
            sections: cloneSections(item.document.sections),
          },
        }
      : {
          type: "driverRoute",
          document: {
            ...item.document,
            sections: cloneSections(item.document.sections),
          },
        }
  );
}

export function applyChainCorrections(
  items: ChainDocument[],
  corrections: FuelChainCorrection[] = []
): ChainDocument[] {
  const corrected = cloneChainDocuments(items);

  for (const item of corrected) {
    const correction = corrections.find(
      (entry) =>
        entry.type === item.type && entry.documentId === item.document.id
    );
    if (!correction) continue;

    if (item.type === "thu") {
      item.document.operationStart =
        correction.operationStart ?? item.document.operationStart;
      item.document.operationEnd =
        correction.operationEnd ?? item.document.operationEnd;
    }

    item.document.sections = item.document.sections.map((section) => {
      const sectionCorrection = correction.sections.find(
        (entry) => entry.sectionKey === sectionKey(section)
      );
      return sectionCorrection
        ? {
            ...section,
            fuelAtStart: sectionCorrection.fuelAtStart,
            fuelAtEnd: sectionCorrection.fuelAtEnd,
          }
        : section;
    });

    if (item.type === "driverRoute") {
      const actualFuel = item.document.sections.reduce(
        (sum, section) => sum + section.fuelAtStart - section.fuelAtEnd,
        0
      );
      const taxation = calculateDriverRouteTaxation(
        item.document.normFuel ?? actualFuel,
        actualFuel,
        item.document.isZeroRoute
      );
      if (taxation) {
        item.document.normFuel = taxation.normFuel;
        item.document.actualFuel = taxation.actualFuel;
        item.document.creditedResult = taxation.creditedResult;
      }
    }
  }

  return corrected;
}

export type ChainCorrectionScenarioId =
  | "close-gaps"
  | "protect-routes"
  | "balanced";

export type ChainCorrectionScenario = {
  id: ChainCorrectionScenarioId;
  documents: ChainDocument[];
  corrections: FuelChainCorrection[];
  changedCount: number;
  validationError: string | null;
  isIdeal: boolean;
};

export type ChainSuggestedThu = {
  document: ThuOperation;
  updatedNext: ChainDocument | null;
  isOptimizedForRoute: boolean;
};

function documentKey(item: ChainDocument): string {
  return `${item.type}:${item.document.id}`;
}

function recalculateDriverRoute(item: ChainDocument): ChainDocument {
  if (item.type !== "driverRoute") return item;

  const actualFuel = item.document.sections.reduce(
    (sum, section) => sum + section.fuelAtStart - section.fuelAtEnd,
    0
  );
  const taxation = calculateDriverRouteTaxation(
    item.document.normFuel ?? actualFuel,
    actualFuel,
    item.document.isZeroRoute
  );

  return {
    ...item,
    document: {
      ...item.document,
      normFuel: taxation?.normFuel ?? item.document.normFuel,
      actualFuel,
      creditedResult: taxation?.creditedResult ?? item.document.creditedResult,
    },
  };
}

function calculateRouteBalance(items: ChainDocument[]): number {
  return items.reduce(
    (sum, item) =>
      item.type === "driverRoute" ? sum + item.document.creditedResult : sum,
    0
  );
}

function isHotIdleNotWorse(
  before: ReturnType<typeof calculateChainHotIdle>,
  after: ReturnType<typeof calculateChainHotIdle>
): boolean {
  const beforeMinutes = before?.minutes ?? 0;
  const beforeFuel = before?.fuelUsed ?? 0;
  const afterMinutes = after?.minutes ?? 0;
  const afterFuel = after?.fuelUsed ?? 0;

  return afterMinutes <= beforeMinutes + 0.000001 && afterFuel <= beforeFuel + 0.001;
}

function idealDriverRouteActualFuel(route: DriverRoute): number | null {
  if (route.isZeroRoute || route.normFuel === null || route.normFuel <= 0) {
    return null;
  }

  return route.normFuel * 0.9;
}

function createSuggestedThuId(previous: ChainDocument, next: ChainDocument) {
  return `suggested-thu-${previous.document.id}-${next.document.id}`;
}

function allocateFuelIncrease(
  sections: Array<{ key: string; previousFuel: number }>,
  increase: number,
  tankCapacity: number | null
): Map<string, number> | null {
  const targets = new Map(
    sections.map((section) => [section.key, section.previousFuel])
  );
  let remaining = increase;

  for (let index = 0; index < sections.length; index += 1) {
    const rest = sections.length - index;
    const share = remaining / rest;
    const section = sections[index];
    const current = targets.get(section.key) ?? section.previousFuel;
    const capacity =
      tankCapacity === null ? Number.POSITIVE_INFINITY : tankCapacity - current;
    const add = Math.min(share, capacity);

    if (add < -0.000001) return null;

    targets.set(section.key, current + add);
    remaining -= add;
  }

  return Math.abs(remaining) < 0.001 ? targets : null;
}

export function buildSuggestedThuForGap(
  link: ChainLinkAnalysis,
  tankCapacity: number | null
): ChainSuggestedThu | null {
  if (link.timeStatus !== "gap" || link.locationStatus !== "continuous") {
    return null;
  }

  const previousSections = new Map(
    getChainDocumentSections(link.previous).map((section) => [
      sectionKey(section),
      section,
    ])
  );
  const nextSections = getChainDocumentSections(link.next);
  const matchedSections = nextSections.flatMap((section) => {
    const previousSection = previousSections.get(sectionKey(section));
    return previousSection
      ? [{
          key: sectionKey(section),
          previous: previousSection,
          next: section,
        }]
      : [];
  });

  if (matchedSections.length === 0) return null;

  let targetStartByKey = new Map(
    matchedSections.map((section) => [
      section.key,
      link.next.type === "driverRoute"
        ? section.next.fuelAtStart
        : section.previous.fuelAtEnd,
    ])
  );
  let updatedNext: ChainDocument | null = null;
  let isOptimizedForRoute = false;

  if (link.next.type === "driverRoute") {
    const idealActual = idealDriverRouteActualFuel(link.next.document);
    const previousFuelTotal = matchedSections.reduce(
      (sum, section) => sum + section.previous.fuelAtEnd,
      0
    );
    const nextEndTotal = matchedSections.reduce(
      (sum, section) => sum + section.next.fuelAtEnd,
      0
    );

    if (idealActual !== null) {
      const targetStartTotal = nextEndTotal + idealActual;
      const increase = targetStartTotal - previousFuelTotal;
      const allocated =
        increase > 0.001
          ? allocateFuelIncrease(
              matchedSections.map((section) => ({
                key: section.key,
                previousFuel: section.previous.fuelAtEnd,
              })),
              increase,
              tankCapacity
            )
          : null;

      if (allocated) {
        targetStartByKey = allocated;
        const sections = link.next.document.sections.map((section) => ({
          ...section,
          fuelAtStart:
            targetStartByKey.get(sectionKey(section)) ?? section.fuelAtStart,
        }));
        const actualFuel = sections.reduce(
          (sum, section) => sum + section.fuelAtStart - section.fuelAtEnd,
          0
        );
        const taxation = calculateDriverRouteTaxation(
          link.next.document.normFuel ?? actualFuel,
          actualFuel,
          link.next.document.isZeroRoute
        );

        updatedNext = {
          type: "driverRoute",
          document: {
            ...link.next.document,
            sections,
            actualFuel,
            normFuel: taxation?.normFuel ?? link.next.document.normFuel,
            creditedResult:
              taxation?.creditedResult ?? link.next.document.creditedResult,
          },
        };
        isOptimizedForRoute = true;
      }
    }
  }

  const sections = matchedSections.map(({ key, previous }) => {
    const fuelAtStart = previous.fuelAtEnd;
    const fuelAtEnd = targetStartByKey.get(key) ?? fuelAtStart;

    return {
      id: `suggested-${previous.id}`,
      series: previous.series,
      locomotiveNumber: previous.locomotiveNumber,
      sectionNumber: previous.sectionNumber,
      fuelAtStart,
      fuelAtEnd,
      fuelAdded: fuelAtEnd > fuelAtStart ? fuelAtEnd - fuelAtStart : null,
    };
  });
  const hasFueling = sections.some(
    (section) => section.fuelAtEnd > section.fuelAtStart
  );

  return {
    document: {
      id: createSuggestedThuId(link.previous, link.next),
      documentNumber: "новая",
      driverName:
        link.next.type === "driverRoute" ? link.next.document.driverName : "",
      station: getChainDocumentEndLocation(link.previous) ?? undefined,
      shiftStart: getChainDocumentEnd(link.previous),
      shiftEnd: getChainDocumentStart(link.next),
      operationType: hasFueling ? "fueling" : "idle",
      operationStart: getChainDocumentEnd(link.previous),
      operationEnd: getChainDocumentStart(link.next),
      sections,
      createdAt: "",
      updatedAt: "",
    },
    updatedNext,
    isOptimizedForRoute,
  };
}

function updateFuelBoundary(
  item: ChainDocument,
  targetSectionKey: string,
  field: "fuelAtStart" | "fuelAtEnd",
  value: number
): ChainDocument {
  const sections = item.document.sections.map((section) => {
    if (sectionKey(section) !== targetSectionKey) return section;

    if (
      item.type === "thu" &&
      item.document.operationType === "fueling" &&
      section.fuelAdded !== null
    ) {
      return field === "fuelAtStart"
        ? {
            ...section,
            fuelAtStart: value,
            fuelAtEnd: value + section.fuelAdded,
          }
        : {
            ...section,
            fuelAtStart: value - section.fuelAdded,
            fuelAtEnd: value,
          };
    }

    return { ...section, [field]: value };
  });

  const updated =
    item.type === "thu"
      ? {
          ...item,
          document: { ...item.document, sections },
        }
      : {
          ...item,
          document: { ...item.document, sections },
        };

  return recalculateDriverRoute(updated);
}

function replaceDocument(
  items: ChainDocument[],
  updated: ChainDocument
): ChainDocument[] {
  return items.map((item) =>
    documentKey(item) === documentKey(updated) ? updated : item
  );
}

function findDocument(
  items: ChainDocument[],
  target: ChainDocument
): ChainDocument | null {
  return items.find((item) => documentKey(item) === documentKey(target)) ?? null;
}

function canSetThuTime(
  item: ChainDocument,
  field: "operationStart" | "operationEnd",
  value: string
): boolean {
  if (item.type !== "thu") return false;

  const start =
    field === "operationStart" ? value : item.document.operationStart;
  const end = field === "operationEnd" ? value : item.document.operationEnd;

  return (
    durationMinutes(start, end) > 0 &&
    new Date(start).getTime() >= new Date(item.document.shiftStart).getTime() &&
    new Date(end).getTime() <= new Date(item.document.shiftEnd).getTime()
  );
}

function setThuTime(
  item: ChainDocument,
  field: "operationStart" | "operationEnd",
  value: string
): ChainDocument {
  if (item.type !== "thu") return item;
  return {
    ...item,
    document: {
      ...item.document,
      [field]: value,
    },
  };
}

function closeTimeGap(
  items: ChainDocument[],
  previousSource: ChainDocument,
  nextSource: ChainDocument,
  preferRouteProtection: boolean
): ChainDocument[] {
  const previous = findDocument(items, previousSource);
  const next = findDocument(items, nextSource);
  if (!previous || !next) return items;

  const previousEnd = getChainDocumentEnd(previous);
  const nextStart = getChainDocumentStart(next);

  const previousCandidate =
    previous.type === "thu" &&
    canSetThuTime(previous, "operationEnd", nextStart);
  const nextCandidate =
    next.type === "thu" && canSetThuTime(next, "operationStart", previousEnd);

  if (
    previousCandidate &&
    (!preferRouteProtection || next.type === "driverRoute" || !nextCandidate)
  ) {
    return replaceDocument(
      items,
      setThuTime(previous, "operationEnd", nextStart)
    );
  }

  if (nextCandidate) {
    return replaceDocument(items, setThuTime(next, "operationStart", previousEnd));
  }

  return items;
}

function applySuggestedThu(
  items: ChainDocument[],
  suggestion: ChainSuggestedThu
): ChainDocument[] {
  const withUpdatedNext = suggestion.updatedNext
    ? replaceDocument(items, suggestion.updatedNext)
    : items;

  return sortChainDocuments([
    ...withUpdatedNext,
    { type: "thu", document: suggestion.document },
  ]);
}

function applyScenarioStrategy(
  sourceItems: ChainDocument[],
  strategy: ChainCorrectionScenarioId,
  tankCapacity: number | null
): ChainDocument[] {
  let items = sortChainDocuments(cloneChainDocuments(sourceItems));

  for (const link of analyzeChainLinks(items)) {
    if (link.timeStatus === "gap") {
      const suggestedThu = buildSuggestedThuForGap(link, tankCapacity);
      if (
        strategy === "close-gaps" &&
        suggestedThu?.isOptimizedForRoute === true &&
        suggestedThu.document.operationType === "fueling"
      ) {
        items = applySuggestedThu(items, suggestedThu);
        continue;
      }

      items = closeTimeGap(
        items,
        link.previous,
        link.next,
        strategy === "protect-routes"
      );
    }

    for (const gap of link.fuelGaps) {
      if (
        gap.status !== "gap" ||
        gap.previousFuel === null ||
        gap.nextFuel === null
      ) {
        continue;
      }

      const previous = findDocument(items, link.previous);
      const next = findDocument(items, link.next);
      if (!previous || !next) continue;

      if (strategy === "close-gaps") {
        const changePrevious = replaceDocument(
          items,
          updateFuelBoundary(
            previous,
            gap.sectionKey,
            "fuelAtEnd",
            gap.nextFuel
          )
        );
        const changeNext = replaceDocument(
          items,
          updateFuelBoundary(next, gap.sectionKey, "fuelAtStart", gap.previousFuel)
        );
        const previousHotIdle =
          calculateChainHotIdle(changePrevious)?.fuelUsed ?? Number.POSITIVE_INFINITY;
        const nextHotIdle =
          calculateChainHotIdle(changeNext)?.fuelUsed ?? Number.POSITIVE_INFINITY;

        items = nextHotIdle <= previousHotIdle ? changeNext : changePrevious;
        continue;
      }

      if (strategy === "balanced") {
        const midpoint = (gap.previousFuel + gap.nextFuel) / 2;
        items = replaceDocument(
          items,
          updateFuelBoundary(previous, gap.sectionKey, "fuelAtEnd", midpoint)
        );
        const nextAfterPreviousUpdate = findDocument(items, next);
        if (nextAfterPreviousUpdate) {
          items = replaceDocument(
            items,
            updateFuelBoundary(
              nextAfterPreviousUpdate,
              gap.sectionKey,
              "fuelAtStart",
              midpoint
            )
          );
        }
        continue;
      }

      if (
        strategy === "protect-routes" &&
        next.type === "driverRoute" &&
        previous.type !== "driverRoute"
      ) {
        items = replaceDocument(
          items,
          updateFuelBoundary(
            previous,
            gap.sectionKey,
            "fuelAtEnd",
            gap.nextFuel
          )
        );
        continue;
      }

      items = replaceDocument(
        items,
        updateFuelBoundary(next, gap.sectionKey, "fuelAtStart", gap.previousFuel)
      );
    }
  }

  return sortChainDocuments(items);
}

export function buildChainCorrectionScenarios(
  sourceItems: ChainDocument[],
  tankCapacity: number | null
): ChainCorrectionScenario[] {
  const originals = sortChainDocuments(cloneChainDocuments(sourceItems));
  const originalHotIdle = calculateChainHotIdle(originals);
  const originalRouteBalance = calculateRouteBalance(originals);
  const scenarios: ChainCorrectionScenarioId[] = [
    "close-gaps",
    "protect-routes",
    "balanced",
  ];

  const builtScenarios = scenarios.map((id) => {
    const documents = applyScenarioStrategy(originals, id, tankCapacity);
    const corrections = buildChainCorrections(originals, documents);
    const addedDocuments = documents.filter(
      (item) =>
        !originals.some((original) => documentKey(original) === documentKey(item))
    ).length;
    const validationError = validateCorrectedChain(documents, tankCapacity);
    const routeBalance = calculateRouteBalance(documents);
    const isIdeal =
      validationError === null &&
      isHotIdleNotWorse(originalHotIdle, calculateChainHotIdle(documents)) &&
      routeBalance >= originalRouteBalance - 0.001;

    return {
      id,
      documents,
      corrections,
      changedCount: corrections.reduce(
        (sum, correction) =>
          sum +
          correction.sections.length +
          (correction.operationStart || correction.operationEnd ? 1 : 0),
        0
      ) + addedDocuments,
      validationError,
      isIdeal,
    };
  });

  const idealScenario = builtScenarios
    .filter((scenario) => scenario.isIdeal && scenario.changedCount > 0)
    .sort((left, right) => {
      const routeDelta =
        calculateRouteBalance(right.documents) - calculateRouteBalance(left.documents);
      if (Math.abs(routeDelta) > 0.001) return routeDelta;

      const leftHotIdle = calculateChainHotIdle(left.documents)?.fuelUsed ?? 0;
      const rightHotIdle = calculateChainHotIdle(right.documents)?.fuelUsed ?? 0;
      return leftHotIdle - rightHotIdle;
    })[0];

  return idealScenario ? [idealScenario] : builtScenarios;
}

export function buildChainCorrections(
  original: ChainDocument[],
  corrected: ChainDocument[]
): FuelChainCorrection[] {
  return corrected.flatMap((item) => {
    const source = original.find(
      (entry) =>
        entry.type === item.type && entry.document.id === item.document.id
    );
    if (!source) return [];

    const sections = getChainDocumentSections(item).flatMap((section) => {
      const sourceSection = getChainDocumentSections(source).find(
        (entry) => sectionKey(entry) === sectionKey(section)
      );
      if (
        !sourceSection ||
        (sourceSection.fuelAtStart === section.fuelAtStart &&
          sourceSection.fuelAtEnd === section.fuelAtEnd)
      ) {
        return [];
      }
      return [
        {
          sectionKey: sectionKey(section),
          fuelAtStart: section.fuelAtStart,
          fuelAtEnd: section.fuelAtEnd,
        },
      ];
    });

    const timeChanged =
      item.type === "thu" &&
      source.type === "thu" &&
      (item.document.operationStart !== source.document.operationStart ||
        item.document.operationEnd !== source.document.operationEnd);

    if (!timeChanged && sections.length === 0) return [];

    return [
      {
        type: item.type,
        documentId: item.document.id,
        operationStart:
          item.type === "thu" ? item.document.operationStart : undefined,
        operationEnd:
          item.type === "thu" ? item.document.operationEnd : undefined,
        sections,
      },
    ];
  });
}

export function validateCorrectedChain(
  items: ChainDocument[],
  tankCapacity: number | null
): string | null {
  for (const item of items) {
    if (item.type === "thu") {
      if (
        durationMinutes(
          item.document.operationStart,
          item.document.operationEnd
        ) <= 0 ||
        new Date(item.document.operationStart).getTime() <
          new Date(item.document.shiftStart).getTime() ||
        new Date(item.document.operationEnd).getTime() >
          new Date(item.document.shiftEnd).getTime()
      ) {
        return "Время операции ТХУ-3 должно находиться внутри смены.";
      }
    }

    for (const section of item.document.sections) {
      if (section.fuelAtStart < 0 || section.fuelAtEnd < 0) {
        return "Количество топлива не может быть отрицательным.";
      }
      if (
        tankCapacity !== null &&
        (section.fuelAtStart > tankCapacity ||
          section.fuelAtEnd > tankCapacity)
      ) {
        return "Корректировка превышает заданный лимит бака.";
      }
      if (
        item.type !== "thu" ||
        item.document.operationType !== "fueling"
      ) {
        if (section.fuelAtEnd > section.fuelAtStart) {
          return "При сдаче топлива должно быть не больше, чем при приёмке.";
        }
      } else if (
        section.fuelAdded !== null &&
        Math.abs(
          section.fuelAtEnd -
            section.fuelAtStart -
            section.fuelAdded
        ) > 0.001
      ) {
        return "При корректировке экипировки количество набранного топлива должно сохраняться.";
      }
    }
  }

  return null;
}
