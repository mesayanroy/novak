import { SOURCES, TradingSession, decodeTradingStatusSpec } from "@novak/sdk";
import type { Observation, ObserveContext, SourceAdapter } from "./types.js";

export const RH_ASSETS_URL = "https://api.robinhood.com/rhj/assets";

const SESSION_KEY: Record<TradingSession, "market" | "extended" | "overnight"> = {
  [TradingSession.Market]: "market",
  [TradingSession.Extended]: "extended",
  [TradingSession.Overnight]: "overnight",
};

interface RhAsset {
  tokenSymbol: string;
  status: string;
  deployments: Array<{ contractAddress: string; chainId: number }>;
  tradingCapabilities?: Record<string, { whole?: string; fractional?: string }>;
}

export type FetchAssets = () => Promise<RhAsset[]>;

export const fetchRobinhoodAssets: FetchAssets = async () => {
  const res = await fetch(RH_ASSETS_URL, { headers: { "user-agent": "novak-resolver/0.1" } });
  if (!res.ok) throw new Error(`rhj/assets HTTP ${res.status}`);
  return ((await res.json()) as { assets: RhAsset[] }).assets;
};

/**
 * `rh.trading-status.v1` (specVersion 1): "Stock token S is NOT tradable in
 * session X when observed" — e.g. a halt or a closed session. Chainlink's 24/5
 * stock feeds simply hold the last price when trading stops; this turns
 * "trading is stopped" into an explicit, finalized fact a lending protocol
 * (StockLendingGuard) or market can act on.
 *
 * Source: Robinhood's public asset registry (`tradingCapabilities` per
 * session). A snapshot fact — create these events with a short observation
 * window (openTimestamp = the moment of interest, deadline a few minutes
 * later) so all resolvers observe the same state.
 */
export class TradingStatusAdapter implements SourceAdapter {
  readonly name = SOURCES.tradingStatus;

  constructor(private readonly fetchAssets: FetchAssets = fetchRobinhoodAssets) {}

  async observe(ctx: ObserveContext): Promise<Observation | null> {
    const spec = decodeTradingStatusSpec(ctx.spec.spec);
    let assets: RhAsset[];
    try {
      assets = await this.fetchAssets();
    } catch {
      return null; // source down — abstain
    }
    const asset = assets.find((a) => a.tokenSymbol === spec.symbol);
    if (!asset) return null;

    const session = asset.tradingCapabilities?.[SESSION_KEY[spec.session]];
    if (!session?.whole) return null;
    const tradable = session.whole === "TRADING_STATUS_TRADABLE";

    return {
      outcome: !tradable,
      // specVersion 1 doesn't encode occurredAt; use the spec's own time so
      // honest resolvers also produce identical evidence hashes.
      occurredAt: ctx.spec.openTimestamp,
      rawEvidence: {
        source: RH_ASSETS_URL,
        symbol: spec.symbol,
        session: SESSION_KEY[spec.session],
        whole: session.whole,
        assetStatus: asset.status,
        contractAddress: asset.deployments[0]?.contractAddress,
      },
    };
  }
}
