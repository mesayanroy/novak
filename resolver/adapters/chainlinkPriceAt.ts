import { parseAbi, type PublicClient } from "viem";
import { Comparator, SOURCES, decodePriceAtSpec } from "@novakoracle/sdk";
import type { Observation, ObserveContext, SourceAdapter } from "./types.js";

const aggregatorAbi = parseAbi([
  "function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
  "function getRoundData(uint80 roundId) view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
  "function description() view returns (string)",
]);

/** A round is only safe to rely on once the source chain is this far past `at`. */
const SETTLE_GRACE_SECONDS = 60n;
const PHASE_SHIFT = 64n;
const AGG_MASK = (1n << PHASE_SHIFT) - 1n;

interface Round {
  roundId: bigint;
  answer: bigint;
  updatedAt: bigint;
}

/**
 * `chainlink.price-at.v1` (specVersion 2): "Chainlink feed F compared to
 * threshold X, as of time T". Reads the Chainlink "Robinhood <TICKER> / USD"
 * feeds on Robinhood Chain MAINNET — Chainlink is a DATA SOURCE here; Novak
 * adds finality, disputes and composition on top.
 *
 * Deterministic: finds the latest round with updatedAt <= T by binary search
 * over the proxy's current phase (round timestamps are monotonic), so every
 * resolver lands on the same round. occurredAt = T.
 *
 * Abstains when: T hasn't passed on the source chain yet; the round at T is
 * older than `maxStaleness` (stock feeds hold the last price off-hours with
 * no heartbeat — a "price at Saturday noon" is really Friday's close, and the
 * spec decides whether that's acceptable); or T predates the current phase.
 */
export class ChainlinkPriceAtAdapter implements SourceAdapter {
  readonly name = SOURCES.priceAt;

  constructor(private readonly source: PublicClient) {}

  async observe(ctx: ObserveContext): Promise<Observation | null> {
    const spec = decodePriceAtSpec(ctx.spec.spec);
    const sourceNow = (await this.source.getBlock()).timestamp;
    if (sourceNow < spec.at + SETTLE_GRACE_SECONDS) return null;

    const round = await this.roundAt(spec.feed, spec.at);
    if (!round) return null;
    if (spec.at - round.updatedAt > spec.maxStaleness) return null;

    const outcome =
      spec.comparator === Comparator.Gte ? round.answer >= spec.threshold : round.answer <= spec.threshold;

    return {
      outcome,
      occurredAt: spec.at,
      rawEvidence: {
        source: "chainlink",
        chain: "robinhood-mainnet",
        feed: spec.feed,
        roundId: round.roundId,
        answer: round.answer,
        updatedAt: round.updatedAt,
        threshold: spec.threshold,
        comparator: spec.comparator === Comparator.Gte ? ">=" : "<=",
        at: spec.at,
      },
    };
  }

  private async roundAt(feed: `0x${string}`, at: bigint): Promise<Round | null> {
    const [latestId, latestAnswer, , latestUpdatedAt] = await this.source.readContract({
      address: feed,
      abi: aggregatorAbi,
      functionName: "latestRoundData",
    });
    if (latestUpdatedAt <= at) return { roundId: latestId, answer: latestAnswer, updatedAt: latestUpdatedAt };

    const phase = latestId >> PHASE_SHIFT;
    let lo = 1n;
    let hi = (latestId & AGG_MASK) - 1n;
    let best: Round | null = null;
    while (lo <= hi) {
      const mid = (lo + hi) / 2n;
      const r = await this.getRound(feed, (phase << PHASE_SHIFT) | mid);
      if (!r) return null; // gap in history — abstain rather than guess
      if (r.updatedAt <= at) {
        best = r;
        lo = mid + 1n;
      } else {
        hi = mid - 1n;
      }
    }
    return best;
  }

  private async getRound(feed: `0x${string}`, roundId: bigint): Promise<Round | null> {
    try {
      const [id, answer, , updatedAt] = await this.source.readContract({
        address: feed,
        abi: aggregatorAbi,
        functionName: "getRoundData",
        args: [roundId],
      });
      return { roundId: id, answer, updatedAt };
    } catch {
      return null;
    }
  }
}
