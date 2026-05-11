import { describe, expect, it } from "vitest";

import { mapDexRecordToTokenPair } from "./tokenPair";

describe("mapDexRecordToTokenPair", () => {
  it("normalizes pairCreatedAt from milliseconds to seconds", () => {
    const mint = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
    const pair = {
      baseToken: { address: mint, name: "T", symbol: "T" },
      quoteToken: { address: mint, name: "Q", symbol: "Q" },
      pairCreatedAt: 1_735_689_600_000,
    };
    const out = mapDexRecordToTokenPair(pair, mint);
    expect(out.pairCreatedAt).toBe(1_735_689_600);
  });
});
