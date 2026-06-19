import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatInputValue,
  getHeatingMinutes,
  parseDateTime,
} from "../src/utils/dateTime.ts";

function requiredDateTime(value: string) {
  const parsed = parseDateTime(value);
  assert.notEqual(parsed, null);
  return parsed;
}

describe("parseDateTime", () => {
  it("parses supported time formats", () => {
    assert.deepEqual(parseDateTime("7:35"), {
      type: "time",
      minutes: 7 * 60 + 35,
    });
    assert.deepEqual(parseDateTime("0735"), {
      type: "time",
      minutes: 7 * 60 + 35,
    });
  });

  it("parses supported date and time formats", () => {
    const dotted = requiredDateTime("12.05.26 15:06");
    const compact = requiredDateTime("120520261506");

    assert.equal(dotted.type, "datetime");
    assert.equal(compact.type, "datetime");

    if (dotted.type === "datetime" && compact.type === "datetime") {
      assert.equal(dotted.date.getFullYear(), 2026);
      assert.equal(dotted.date.getMonth(), 4);
      assert.equal(dotted.date.getDate(), 12);
      assert.equal(dotted.date.getHours(), 15);
      assert.equal(dotted.date.getMinutes(), 6);
      assert.equal(compact.date.getTime(), dotted.date.getTime());
    }
  });

  it("rejects invalid dates and times", () => {
    assert.equal(parseDateTime("29.02.2025 10:00"), null);
    assert.equal(parseDateTime("24:00"), null);
    assert.equal(parseDateTime("12:60"), null);
  });
});

describe("getHeatingMinutes", () => {
  it("calculates a period within one day", () => {
    assert.equal(
      getHeatingMinutes(
        requiredDateTime("07:35"),
        requiredDateTime("09:10"),
        false
      ),
      95
    );
  });

  it("requires confirmation when the end is not later than the start", () => {
    const start = requiredDateTime("10:00");
    const end = requiredDateTime("10:00");

    assert.equal(getHeatingMinutes(start, end, false), null);
    assert.equal(getHeatingMinutes(start, end, true), 24 * 60);
  });

  it("moves an earlier end time to the next day after confirmation", () => {
    assert.equal(
      getHeatingMinutes(
        requiredDateTime("23:30"),
        requiredDateTime("01:00"),
        true
      ),
      90
    );
  });

  it("supports a dated start and an end containing only time", () => {
    assert.equal(
      getHeatingMinutes(
        requiredDateTime("12.05.2026 23:30"),
        requiredDateTime("01:00"),
        true
      ),
      90
    );
  });
});

describe("formatInputValue", () => {
  it("formats time and combines it with a supplied date", () => {
    const validTime = requiredDateTime("0735");
    assert.equal(formatInputValue(validTime), "07:35");
    assert.equal(
      formatInputValue(validTime, new Date(2026, 4, 12)),
      "12.05.2026 07:35"
    );
  });
});
