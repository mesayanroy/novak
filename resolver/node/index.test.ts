import { describe, expect, it } from "vitest";
import { Comparator, TradingSession, encodeFedRateSpec, encodeTradingStatusSpec, type EventSpecInput } from "@novakoracle/sdk";
import { evaluateQuorum, evaluateEscalationQuorum } from "../consensus/quorum.js";
import { buildEvidence, hashEvidence, EvidenceStore } from "../evidence/evidence.js";
import { changeBps, decideCorporateAction, type MultiplierChange } from "../adapters/corporateAction.js";
import { TradingStatusAdapter } from "../adapters/tradingStatus.js";
import { FedRateAdapter, parseFredTargets } from "../adapters/fedRate.js";

describe("quorum", () => {
  it("reaches quorum when enough observations agree", () => {
    const result = evaluateQuorum([{ outcome: true }, { outcome: true }], 2);
    expect(result.reached).toBe(true);
    expect(result.agreedOutcomeData).toBe(true);
    expect(result.agreeingCount).toBe(2);
  });

  it("does not reach quorum below the threshold", () => {
    expect(evaluateQuorum([{ outcome: true }, { outcome: false }], 2).reached).toBe(false);
  });

  it("counts true/false votes independently", () => {
    const result = evaluateQuorum([{ outcome: true }, { outcome: false }, { outcome: false }], 2);
    expect(result.reached).toBe(true);
    expect(result.agreedOutcomeData).toBe(false);
  });
});

describe("escalation quorum (DisputeManager Tier-1/Tier-2 mirror)", () => {
  it("reaches 66% agreement against the committee size, not the vote count", () => {
    const votes = [
      { member: "0xA", outcome: true },
      { member: "0xB", outcome: true },
    ];
    expect(evaluateEscalationQuorum(votes, 3).reached).toBe(true);
  });

  it("does not reach quorum below 66% of committee size even with unanimous participants", () => {
    const votes = [
      { member: "0xA", outcome: true },
      { member: "0xB", outcome: true },
    ];
    expect(evaluateEscalationQuorum(votes, 7).reached).toBe(false);
  });
});

describe("evidence", () => {
  const obs = { outcome: true, occurredAt: 1_788_998_430n, rawEvidence: { answer: 22440881781n } };

  it("is deterministic and bigint-safe (two honest resolvers -> same hash)", () => {
    const a = buildEvidence("0xabc", "chainlink.price-at.v1", obs);
    const b = buildEvidence("0xabc", "chainlink.price-at.v1", { ...obs, rawEvidence: { answer: 22440881781n } });
    expect(hashEvidence(a)).toBe(hashEvidence(b));
  });

  it("stores and serves records by hash", () => {
    const store = new EvidenceStore();
    const hash = store.put(buildEvidence("0xabc", "x", obs));
    expect(store.get(hash)?.occurredAt).toBe("1788998430");
  });
});

describe("rh.corporate-action decision", () => {
  const ONE = 10n ** 18n;
  // The real NVDA dividend-reinvestment update seen on mainnet (block 58952659).
  const nvdaDividend: MultiplierChange = {
    oldMultiplier: ONE,
    newMultiplier: 1_000_775_159_164_630_595n,
    effectiveAt: 1_788_998_430n,
    scheduledAt: 1_788_997_800n,
    blockNumber: 58_952_659n,
    txHash: "0x01",
  };
  const window = { windowStart: 1_788_900_000n, windowEnd: 1_789_100_000n };

  it("computes change in bps", () => {
    expect(changeBps(ONE, 2n * ONE)).toBe(10_000n); // 2:1 split
    expect(changeBps(ONE, nvdaDividend.newMultiplier)).toBe(7n); // ~0.0775%
  });

  it("true with occurredAt = effectiveAt once a qualifying change took effect", () => {
    const d = decideCorporateAction([nvdaDividend], { ...window, minChangeBps: 0 }, 1_789_000_000n);
    expect(d).toMatchObject({ outcome: true, occurredAt: nvdaDividend.effectiveAt });
  });

  it("a dividend does not count as a split (minChangeBps filter)", () => {
    expect(decideCorporateAction([nvdaDividend], { ...window, minChangeBps: 5_000 }, 1_789_000_000n)).toBeNull();
    const after = decideCorporateAction([nvdaDividend], { ...window, minChangeBps: 5_000 }, window.windowEnd + 61n);
    expect(after).toMatchObject({ outcome: false, occurredAt: window.windowEnd });
  });

  it("abstains while a scheduled change hasn't taken effect yet", () => {
    expect(decideCorporateAction([nvdaDividend], { ...window, minChangeBps: 0 }, nvdaDividend.effectiveAt - 1n)).toBeNull();
  });

  it("a later schedule supersedes an earlier pending one", () => {
    const cancelled: MultiplierChange = { ...nvdaDividend, newMultiplier: 2n * ONE, effectiveAt: 1_789_050_000n };
    const replacement: MultiplierChange = {
      ...nvdaDividend,
      oldMultiplier: ONE,
      newMultiplier: ONE,
      effectiveAt: 1_789_060_000n,
      scheduledAt: 1_789_010_000n, // lands before `cancelled` took effect
    };
    const d = decideCorporateAction([cancelled, replacement], { ...window, minChangeBps: 5_000 }, window.windowEnd + 61n);
    expect(d).toMatchObject({ outcome: false });
  });
});

describe("rh.trading-status adapter", () => {
  const spec = (session: TradingSession): EventSpecInput => ({
    specVersion: 1,
    sourceId: "0x00",
    openTimestamp: 0n,
    observationDeadline: 0n,
    disputeWindowSeconds: 0n,
    quorumThreshold: 1,
    spec: encodeTradingStatusSpec({ symbol: "NVDA", session }),
  });
  const assets = async () => [
    {
      tokenSymbol: "NVDA",
      status: "ASSET_STATUS_ACTIVE",
      deployments: [{ contractAddress: "0xd060", chainId: 4663 }],
      tradingCapabilities: {
        market: { whole: "TRADING_STATUS_TRADABLE" },
        overnight: { whole: "TRADING_STATUS_UNTRADABLE" },
      },
    },
  ];

  it("reports NOT tradable as outcome=true", async () => {
    const a = new TradingStatusAdapter(assets);
    expect((await a.observe({ eventId: "0x1", spec: spec(TradingSession.Overnight), now: 5n }))?.outcome).toBe(true);
    expect((await a.observe({ eventId: "0x1", spec: spec(TradingSession.Market), now: 5n }))?.outcome).toBe(false);
  });

  it("abstains when the source is down or the session is unknown", async () => {
    const down = new TradingStatusAdapter(async () => {
      throw new Error("503");
    });
    expect(await down.observe({ eventId: "0x1", spec: spec(TradingSession.Market), now: 5n })).toBeNull();
    const a = new TradingStatusAdapter(assets);
    expect(await a.observe({ eventId: "0x1", spec: spec(TradingSession.Extended), now: 5n })).toBeNull();
  });
});

describe("macro.fomc fed-rate adapter", () => {
  const csv = ["observation_date,DFEDTARU", "2026-10-28,4.00", "2026-10-29,3.75", ""].join("\n");
  const day = (iso: string) => BigInt(Date.parse(iso + "T00:00:00Z") / 1000);
  const spec = (date: bigint, bps: number, comparator: Comparator): EventSpecInput => ({
    specVersion: 2,
    sourceId: "0x00",
    openTimestamp: 0n,
    observationDeadline: 0n,
    disputeWindowSeconds: 0n,
    quorumThreshold: 1,
    spec: encodeFedRateSpec({ date, upperBoundBps: bps, comparator }),
  });

  it("parses FRED's CSV into bps", () => {
    expect(parseFredTargets(csv).get("2026-10-29")).toBe(375);
  });

  it("resolves a 25bp cut (upper <= 375) on the day after the meeting, occurredAt = that day", async () => {
    const a = new FedRateAdapter(async () => csv);
    const d = day("2026-10-29");
    const obs = await a.observe({ eventId: "0x1", spec: spec(d, 375, Comparator.Lte), now: d + 3600n });
    expect(obs).toMatchObject({ outcome: true, occurredAt: d });
    const hold = await a.observe({ eventId: "0x1", spec: spec(day("2026-10-28"), 375, Comparator.Lte), now: d });
    expect(hold?.outcome).toBe(false);
  });

  it("abstains until the day is published, or when the source is down", async () => {
    const a = new FedRateAdapter(async () => csv);
    expect(await a.observe({ eventId: "0x1", spec: spec(day("2026-12-10"), 375, Comparator.Lte), now: 0n })).toBeNull();
    const down = new FedRateAdapter(async () => {
      throw new Error("503");
    });
    expect(await down.observe({ eventId: "0x1", spec: spec(day("2026-10-29"), 375, Comparator.Lte), now: 0n })).toBeNull();
  });
});

describe("evidence store persistence", () => {
  it("writes content-addressed records to disk and reloads them in a fresh store", async () => {
    const { mkdtempSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { EvidenceStore, buildEvidence, hashEvidence } = await import("../evidence/evidence.js");
    const dir = mkdtempSync(join(tmpdir(), "novak-evidence-"));
    try {
      const record = buildEvidence(`0x${"ab".repeat(32)}`, "chainlink.price-at.v1", {
        outcome: true,
        occurredAt: 1_788_998_430n,
        rawEvidence: { roundId: 42n, answer: 23_519_000_000n },
      });
      const a = new EvidenceStore(dir);
      const hash = a.put(record);
      expect(hash).toBe(hashEvidence(record).toLowerCase());

      const b = new EvidenceStore(dir); // simulated restart
      expect(b.has(hash)).toBe(true);
      expect(b.get(hash)).toEqual(record);
      expect(hashEvidence(b.get(hash)!)).toBe(hashEvidence(record)); // reload keeps the on-chain commitment
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("rpc provider order + redaction", () => {
  it("puts explicit URL, then Alchemy, then the public RPC; never logs the key", async () => {
    const { loadConfig } = await import("../lib/config.js");
    const { redactUrl } = await import("../lib/chain.js");
    const key = `0x${"11".repeat(32)}`;
    const cfg = loadConfig({ RESOLVER_PRIVATE_KEY: key, ALCHEMY_API_KEY: "secret123" } as NodeJS.ProcessEnv);
    expect(cfg.sourceRpcUrls).toEqual([
      "https://robinhood-mainnet.g.alchemy.com/v2/secret123",
      "https://rpc.mainnet.chain.robinhood.com",
    ]);
    expect(cfg.rpcUrls[0]).toBe("https://robinhood-testnet.g.alchemy.com/v2/secret123");
    expect(cfg.rpcUrls.at(-1)).toBe("https://rpc.testnet.chain.robinhood.com");
    expect(redactUrl(cfg.sourceRpcUrls[0])).not.toContain("secret123");

    const explicit = loadConfig({ RESOLVER_PRIVATE_KEY: key.slice(2), RESOLVER_SOURCE_RPC_URL: "https://my.node" } as NodeJS.ProcessEnv);
    expect(explicit.sourceRpcUrls).toEqual(["https://my.node", "https://rpc.mainnet.chain.robinhood.com"]);
    expect(explicit.privateKey).toBe(key); // 0x-less key accepted
  });
});

describe("commit-reveal committee seeding", () => {
  it("encodes the commitment exactly like DisputeManager (abi.encode(bytes32,uint8,address,bytes32))", async () => {
    const { seedCommitment } = await import("./voter.js");
    const commitment = seedCommitment(`0x${"ab".repeat(32)}`, 1, "0x0000000000000000000000000000000000001234", `0x${"cd".repeat(32)}`);
    // reference: cast keccak $(cast abi-encode "f(bytes32,uint8,address,bytes32)" ...)
    expect(commitment).toBe("0x77a137058bcb7c471be4961cf71457b959db81827a9f5918ea5ce35fc66e265c");
  });

  it("derives a salt that is stable per (event, tier) and differs across them", async () => {
    const { committeeSalt } = await import("./voter.js");
    const { privateKeyToAccount } = await import("viem/accounts");
    const c = {
      account: privateKeyToAccount(`0x${"11".repeat(32)}`),
      deployment: { chainId: 46630, disputeManager: "0x00000000000000000000000000000000000000d1" },
    } as never;
    const e = `0x${"ab".repeat(32)}` as const;
    const a = await committeeSalt(c, e, 1);
    expect(await committeeSalt(c, e, 1)).toBe(a); // reproducible after a restart
    expect(await committeeSalt(c, e, 2)).not.toBe(a);
    expect(await committeeSalt(c, `0x${"ac".repeat(32)}`, 1)).not.toBe(a);
  });
});
