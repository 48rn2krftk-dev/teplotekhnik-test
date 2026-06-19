import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type {
  DriverRoute,
  ThuOperation,
} from "../src/domain/documents.ts";
import {
  analyzeChainLinks,
  calculateChainHotIdle,
} from "../src/utils/chainAnalysis.ts";

const thu: ThuOperation = {
  id: "thu-1",
  documentNumber: "1",
  shiftStart: "2026-06-15T08:00",
  shiftEnd: "2026-06-15T20:00",
  operationType: "idle",
  operationStart: "2026-06-15T08:00",
  operationEnd: "2026-06-15T09:00",
  sections: [
    {
      id: "s1",
      series: "3ТЭ25К2М",
      locomotiveNumber: "100",
      sectionNumber: "1",
      fuelAtStart: 5000,
      fuelAtEnd: 4960,
      fuelAdded: null,
    },
  ],
  createdAt: "",
  updatedAt: "",
};

const route: DriverRoute = {
  id: "mm-1",
  routeNumber: "1",
  driverName: "",
  routeStart: "2026-06-15T10:00",
  routeEnd: "2026-06-15T18:00",
  sections: [
    {
      id: "s1",
      series: "3ТЭ25К2М",
      locomotiveNumber: "100",
      sectionNumber: "1",
      fuelAtStart: 4900,
      fuelAtEnd: 4500,
      fuelAdded: null,
    },
  ],
  isZeroRoute: false,
  normFuel: 420,
  actualFuel: 400,
  creditedResult: 20,
  createdAt: "",
  updatedAt: "",
};

describe("chain analysis", () => {
  it("detects time and fuel gaps between adjacent documents", () => {
    const [link] = analyzeChainLinks([
      { type: "driverRoute", document: route },
      { type: "thu", document: thu },
    ]);

    assert.equal(link.timeDifferenceMinutes, 60);
    assert.equal(link.timeStatus, "gap");
    assert.equal(link.fuelGaps[0].difference, -60);
    assert.equal(link.fuelGaps[0].status, "gap");
  });

  it("calculates hot idle only from THU idle operations", () => {
    assert.deepEqual(
      calculateChainHotIdle([
        { type: "thu", document: thu },
        { type: "driverRoute", document: route },
      ]),
      {
        minutes: 60,
        fuelUsed: 40,
        fuelPerHour: 40,
      }
    );
  });

  it("reports a section missing from an adjacent document", () => {
    const routeWithoutMatchingSection: DriverRoute = {
      ...route,
      sections: [
        {
          ...route.sections[0],
          sectionNumber: "2",
        },
      ],
    };
    const [link] = analyzeChainLinks([
      { type: "thu", document: thu },
      { type: "driverRoute", document: routeWithoutMatchingSection },
    ]);

    assert.equal(link.fuelGaps.length, 2);
    assert.ok(link.fuelGaps.every((gap) => gap.status === "missing"));
  });

  it("keeps the location continuous from THU through a route to the next THU", () => {
    const thuAtA: ThuOperation = {
      ...thu,
      station: "А",
      operationEnd: "2026-06-15T10:00",
      sections: [{ ...thu.sections[0], fuelAtEnd: 4900 }],
    };
    const routeAToB: DriverRoute = {
      ...route,
      departureStation: "А",
      arrivalStation: "Б",
      routeStart: "2026-06-15T10:00",
      sections: [{ ...route.sections[0], fuelAtStart: 4900 }],
    };
    const thuAtB: ThuOperation = {
      ...thu,
      id: "thu-2",
      station: "Б",
      operationStart: "2026-06-15T18:00",
      operationEnd: "2026-06-15T19:00",
      sections: [{ ...thu.sections[0], fuelAtStart: 4500 }],
    };
    const links = analyzeChainLinks([
      { type: "thu", document: thuAtA },
      { type: "driverRoute", document: routeAToB },
      { type: "thu", document: thuAtB },
    ]);

    assert.equal(links[0].locationStatus, "continuous");
    assert.equal(links[1].locationStatus, "continuous");
  });

  it("detects a location gap after a driver route", () => {
    const routeAToB: DriverRoute = {
      ...route,
      arrivalStation: "Б",
    };
    const thuAtWrongStation: ThuOperation = {
      ...thu,
      station: "В",
      operationStart: "2026-06-15T18:00",
      operationEnd: "2026-06-15T19:00",
    };
    const [link] = analyzeChainLinks([
      { type: "driverRoute", document: routeAToB },
      { type: "thu", document: thuAtWrongStation },
    ]);

    assert.equal(link.previousLocation, "Б");
    assert.equal(link.nextLocation, "В");
    assert.equal(link.locationStatus, "gap");
  });
});
