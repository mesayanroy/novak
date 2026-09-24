import { NextResponse } from "next/server";
import { createPublicClient, http, parseAbi, type Address } from "viem";
import { robinhood } from "viem/chains";

/**
 * Corporate-action calendar data for every Robinhood Stock Token:
 *  - off-chain: Robinhood's public asset registry (api.robinhood.com/rhj/assets)
 *  - on-chain:  each token's ERC-8056 state on Robinhood Chain MAINNET
 *               (uiMultiplier / newUIMultiplier / effectiveAt / oraclePaused),
 *               read in one multicall.
 * Proxied server-side (no CORS on the Robinhood API) and cached 5 minutes.
 */
export const revalidate = 300;

const erc8056 = parseAbi([
  "function uiMultiplier() view returns (uint256)",
  "function newUIMultiplier() view returns (uint256)",
  "function effectiveAt() view returns (uint256)",
  "function oraclePaused() view returns (bool)",
]);

interface RhAsset {
  tokenSymbol: string;
  tokenName: string;
  status: string;
  currentMultiplier: string;
  pendingMultiplier: string;
  deployments: Array<{ contractAddress: Address; chainId: number }>;
  tradingCapabilities?: Record<string, { whole?: string }>;
}

export interface CalendarRow {
  symbol: string;
  name: string;
  address: Address;
  status: string;
  uiMultiplier: string | null;
  newUIMultiplier: string | null;
  effectiveAt: number | null;
  oraclePaused: boolean | null;
  pendingFromApi: string;
  tradable: Record<string, boolean>;
}

export async function GET() {
  const res = await fetch("https://api.robinhood.com/rhj/assets", {
    headers: { "user-agent": "novak-frontend/0.1" },
    next: { revalidate: 300 },
  });
  if (!res.ok) return NextResponse.json({ error: `rhj/assets HTTP ${res.status}` }, { status: 502 });
  const assets = ((await res.json()) as { assets: RhAsset[] }).assets.filter((a) => a.deployments?.[0]?.contractAddress);

  const client = createPublicClient({
    chain: robinhood,
    transport: http(process.env.RESOLVER_SOURCE_RPC_URL ?? robinhood.rpcUrls.default.http[0]),
  });
  const fns = ["uiMultiplier", "newUIMultiplier", "effectiveAt", "oraclePaused"] as const;
  const results = await client.multicall({
    allowFailure: true,
    contracts: assets.flatMap((a) =>
      fns.map((functionName) => ({ address: a.deployments[0].contractAddress, abi: erc8056, functionName })),
    ),
  });

  const rows: CalendarRow[] = assets.map((a, i) => {
    const r = results.slice(i * 4, i * 4 + 4).map((x) => (x.status === "success" ? x.result : null));
    return {
      symbol: a.tokenSymbol,
      name: a.tokenName,
      address: a.deployments[0].contractAddress,
      status: a.status,
      uiMultiplier: r[0] !== null ? String(r[0]) : null,
      newUIMultiplier: r[1] !== null ? String(r[1]) : null,
      effectiveAt: r[2] !== null ? Number(r[2]) : null,
      oraclePaused: r[3] as boolean | null,
      pendingFromApi: a.pendingMultiplier,
      tradable: Object.fromEntries(
        Object.entries(a.tradingCapabilities ?? {}).map(([k, v]) => [k, v.whole === "TRADING_STATUS_TRADABLE"]),
      ),
    };
  });

  return NextResponse.json({ fetchedAt: new Date().toISOString(), rows });
}
