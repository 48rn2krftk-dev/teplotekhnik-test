import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveTheme } from "../src/utils/theme.ts";

describe("resolveTheme", () => {
  it("keeps an explicitly selected theme", () => {
    assert.equal(resolveTheme("light", true), "light");
    assert.equal(resolveTheme("dark", false), "dark");
  });

  it("uses the device preference for the system theme", () => {
    assert.equal(resolveTheme("system", false), "light");
    assert.equal(resolveTheme("system", true), "dark");
  });
});
