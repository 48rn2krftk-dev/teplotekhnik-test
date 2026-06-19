import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  calculateByFuelDifference,
  calculateDeviation,
  calculateManual,
  parseFuel,
} from "../src/utils/calculations.ts";

describe("parseFuel", () => {
  it("accepts comma and dot decimal separators", () => {
    assert.equal(parseFuel("411,125"), 411.125);
    assert.equal(parseFuel("40.5"), 40.5);
  });

  it("rejects values outside the supported format", () => {
    assert.equal(parseFuel("-1"), null);
    assert.equal(parseFuel("10000"), null);
    assert.equal(parseFuel("1,2345"), null);
    assert.equal(parseFuel("1 000"), null);
  });
});

describe("fuel calculations", () => {
  it("calculates fuel difference and hourly consumption", () => {
    assert.deepEqual(calculateByFuelDifference(90, 411, 351), {
      minutes: 90,
      fuelUsed: 60,
      fuelPerHour: 40,
    });
  });

  it("rejects an end balance greater than the start balance", () => {
    assert.equal(calculateByFuelDifference(60, 50, 70), null);
  });

  it("calculates a manual result", () => {
    assert.deepEqual(calculateManual(120, 90), {
      minutes: 120,
      fuelUsed: 90,
      fuelPerHour: 45,
    });
  });

  it("calculates deviation from the norm", () => {
    assert.equal(calculateDeviation(72, 45), 60);
    assert.equal(calculateDeviation(45, 45), 0);
    assert.equal(calculateDeviation(45, null), null);
    assert.equal(calculateDeviation(45, 0), null);
  });
});
