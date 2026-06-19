import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_PINNED_SCREENS,
  MAX_PINNED_SCREENS,
  normalizePinnedScreens,
} from "../src/navigation.ts";

describe("normalizePinnedScreens", () => {
  it("uses defaults for missing or invalid values", () => {
    assert.deepEqual(normalizePinnedScreens(null), DEFAULT_PINNED_SCREENS);
    assert.deepEqual(normalizePinnedScreens("quick"), DEFAULT_PINNED_SCREENS);
    assert.deepEqual(normalizePinnedScreens([]), DEFAULT_PINNED_SCREENS);
  });

  it("removes unknown and duplicate screen identifiers", () => {
    assert.deepEqual(
      normalizePinnedScreens(["quick", "unknown", "quick", "settings"]),
      ["quick"]
    );
  });

  it("migrates the old time calculation shortcut", () => {
    assert.deepEqual(normalizePinnedScreens(["byTime", "quick"]), ["quick"]);
  });

  it("removes settings from the quick access panel", () => {
    assert.deepEqual(normalizePinnedScreens(["settings", "quick"]), ["quick"]);
  });

  it("keeps no more than the supported number of shortcuts", () => {
    const result = normalizePinnedScreens([
      "thuLibrary",
      "mmLibrary",
      "chains",
      "quick",
      "settings",
    ]);

    assert.equal(result.length, MAX_PINNED_SCREENS);
  });
});
