import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calculateDriverRouteTaxation } from "../src/utils/driverRouteCalculations.ts";

describe("calculateDriverRouteTaxation", () => {
  it("credits economy using all three limits and rounds to tenths", () => {
    assert.deepEqual(calculateDriverRouteTaxation(1000, 800, false), {
      normFuel: 1000,
      actualFuel: 800,
      creditedResult: 88.9,
      resultType: "economy",
    });
  });

  it("credits a small economy in full", () => {
    assert.deepEqual(calculateDriverRouteTaxation(1000, 950, false), {
      normFuel: 1000,
      actualFuel: 950,
      creditedResult: 50,
      resultType: "economy",
    });
  });

  it("counts overrun in full", () => {
    assert.deepEqual(calculateDriverRouteTaxation(1000, 1125.5, false), {
      normFuel: 1000,
      actualFuel: 1125.5,
      creditedResult: -125.5,
      resultType: "overrun",
    });
  });

  it("sets norm equal to fact for a zero route", () => {
    assert.deepEqual(calculateDriverRouteTaxation(500, 735.4, true), {
      normFuel: 735.4,
      actualFuel: 735.4,
      creditedResult: 0,
      resultType: "zero",
    });
  });
});
