import { describe, expect, it } from "vitest";

import { normalizeDexUnixSeconds } from "./unixSecondsNormalize";

describe("normalizeDexUnixSeconds", () => {
  it("returns null for invalid input", () => {
    expect(normalizeDexUnixSeconds(null)).toBeNull();
    expect(normalizeDexUnixSeconds(NaN)).toBeNull();
  });

  it("keeps plausible unix seconds", () => {
    expect(normalizeDexUnixSeconds(1_735_689_600)).toBe(1_735_689_600);
  });

  it("converts Dex-style milliseconds to seconds", () => {
    expect(normalizeDexUnixSeconds(1_735_689_600_000)).toBe(1_735_689_600);
  });

  it("handles double-scaled ms", () => {
    expect(normalizeDexUnixSeconds(1_735_689_600_000_000)).toBe(1_735_689_600);
  });
});
