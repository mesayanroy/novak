import { describe, expect, it } from "vitest";
import { ladderFor, listedFeeds, nextClose, niceStep } from "./lister.js";

const at = (iso: string) => BigInt(Date.parse(iso) / 1000);
const iso = (t: bigint) => new Date(Number(t) * 1000).toISOString();

describe("market lister", () => {
  it("resolves equities at the next weekday 20:00 UTC, at least 3h ahead", () => {
    expect(iso(nextClose(at("2026-10-07T10:00:00Z"), true))).toBe("2026-10-07T20:00:00.000Z"); // Wed
    expect(iso(nextClose(at("2026-10-07T18:00:00Z"), true))).toBe("2026-10-08T20:00:00.000Z"); // < 3h lead
    expect(iso(nextClose(at("2026-10-09T19:00:00Z"), true))).toBe("2026-10-12T20:00:00.000Z"); // Fri → Mon
    expect(iso(nextClose(at("2026-10-09T19:00:00Z"), false))).toBe("2026-10-10T20:00:00.000Z"); // 24/7: Sat
  });

  it("picks readable steps near the target width", () => {
    expect(niceStep(235_19000000n, 100n)).toBe(250000000n); // ~1% of $235 → $2.50
    expect(niceStep(101_10000000n, 5n)).toBe(5000000n); // 0.05% of $101 → $0.05
    expect(niceStep(62_000_00000000n, 150n)).toBe(1000_00000000n); // 1.5% of $62k → $1,000
  });

  it("centres 5 ascending boundaries on spot", () => {
    const l = ladderFor(235_19000000n, { assetClass: "Equity", symbol: "NVDA" });
    expect(l).toEqual([230_00000000n, 232_50000000n, 235_00000000n, 237_50000000n, 240_00000000n]);
  });

  it("lists equities, bonds and major crypto but not stablecoins or wrapped duplicates", () => {
    const syms = listedFeeds([]).map((f) => f.symbol);
    expect(syms).toEqual(expect.arrayContaining(["NVDA", "TSLA", "SGOV", "SPY", "BTC", "ETH"]));
    for (const s of ["USDC", "USDT", "WBTC", "CBBTC", "USDG"]) expect(syms).not.toContain(s);
    expect(listedFeeds(["NVDA", "SGOV"]).map((f) => f.symbol).sort()).toEqual(["NVDA", "SGOV"]);
  });
});
