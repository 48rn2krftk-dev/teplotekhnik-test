import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatDurationInput,
  parseDurationToMinutes,
} from "../src/utils/duration.ts";

describe("parseDurationToMinutes", () => {
  it("supports two, three and four digit hour values", () => {
    assert.equal(parseDurationToMinutes("22:14"), 22 * 60 + 14);
    assert.equal(parseDurationToMinutes("234:14"), 234 * 60 + 14);
    assert.equal(parseDurationToMinutes("1635:59"), 1635 * 60 + 59);
  });

  it("supports compact duration values", () => {
    assert.equal(parseDurationToMinutes("2214"), 22 * 60 + 14);
    assert.equal(parseDurationToMinutes("23414"), 234 * 60 + 14);
    assert.equal(parseDurationToMinutes("163559"), 1635 * 60 + 59);
  });

  it("rejects zero and invalid minute values", () => {
    assert.equal(parseDurationToMinutes("00:00"), null);
    assert.equal(parseDurationToMinutes("22:60"), null);
    assert.equal(parseDurationToMinutes("1260"), null);
  });

  it("formats a duration without truncating large hour values", () => {
    assert.equal(formatDurationInput(1635 * 60 + 59), "1635:59");
  });
});
