import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  durationMinutes,
  resolveEndDateTime,
  resolveTimeInsidePeriod,
} from "../src/utils/documentTime.ts";

describe("document time", () => {
  it("moves an earlier end time to the next day", () => {
    const result = resolveEndDateTime("2026-06-15T20:00", "06:00");
    assert.equal(result, "2026-06-16T06:00");
    assert.equal(durationMinutes("2026-06-15T20:00", result!), 600);
  });

  it("keeps a later end time on the same day", () => {
    assert.equal(
      resolveEndDateTime("2026-06-15T08:00", "18:00"),
      "2026-06-15T18:00"
    );
  });

  it("places operation times inside an overnight shift", () => {
    const start = resolveTimeInsidePeriod("2026-06-15T20:00", "23:00");
    const end = resolveTimeInsidePeriod(
      "2026-06-15T20:00",
      "01:30",
      start!
    );
    assert.equal(start, "2026-06-15T23:00");
    assert.equal(end, "2026-06-16T01:30");
  });

  it("exposes a twelve hour shift duration", () => {
    const end = resolveEndDateTime("2026-06-15T20:00", "08:00");
    assert.equal(durationMinutes("2026-06-15T20:00", end!), 720);
  });
});
