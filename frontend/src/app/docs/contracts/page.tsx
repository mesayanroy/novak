import { MapPin } from "lucide-react";
import { deployments, explorerUrl, feedBySymbol, TESTNET_FAUCET_URL } from "@novak/sdk";
import { C, Callout, DataTable, DocHeader, H2, P } from "@/components/docs/DocPrimitives";

export const metadata = { title: "Deployed contracts — Novak Docs" };

const TESTNET = 46630;
const MAINNET_EXPLORER = "https://robinhoodchain.blockscout.com";

const ROLES: [key: string, name: string, role: string][] = [
  ["eventRegistry", "EventRegistry", "Event specs, observations, quorum, finalize / expire"],
  ["disputeManager", "DisputeManager", "Bonded Tier-1 / Tier-2 committees, VOID, pull payouts"],
  ["eventComposer", "EventComposer", "AND / OR / NOT / BEFORE / WITHIN composites"],
  ["eventBus", "EventBus", "The read API every consumer uses"],
  ["settlement", "Settlement", "Batch (availability, outcome) adapter for markets"],
  ["treasuryVault", "TreasuryVault", "Fee thirds, insurance reserve, dispute-bond sweep"],
  ["distributionMarket", "DistributionMarket", "LMSR range markets"],
  ["market", "Market", "USDG yes/no parimutuel markets"],
  ["stockLendingGuard", "StockLendingGuard", "canLiquidate() pause rules"],
  ["collateral", "MockUSDG", "Test collateral (6 decimals, free mint in the app)"],
  ["positionManager", "PositionManager", "Position bookkeeping helper"],
  ["subscriptionManager", "SubscriptionManager", "Stub — push delivery is deferred by design"],
];

function Addr({ address, base }: { address?: string; base?: string }) {
  if (!address) return <span className="text-gray-400">—</span>;
  return base ? (
    <a href={`${base}/address/${address}`} target="_blank" rel="noreferrer" className="break-all">
      {address}
    </a>
  ) : (
    <span className="break-all">{address}</span>
  );
}

export default function ContractsPage() {
  const dep = deployments[TESTNET] as unknown as Record<string, string | number | boolean> | undefined;
  const base = explorerUrl(TESTNET);

  return (
    <article>
      <DocHeader
        icon={MapPin}
        eyebrow="Start here · Deployed contracts"
        title="Live on Robinhood Chain testnet"
        lead={
          <>
            Every contract below is deployed on <strong className="text-ink">Robinhood Chain testnet (chain 46630)</strong> and
            source-verified on Blockscout. This table is generated from <C>deployments/46630.json</C> via the SDK — the same
            addresses the app and resolvers use.
          </>
        }
      />

      <H2>Networks</H2>
      <DataTable
        columns={["", "Robinhood Chain testnet", "Robinhood Chain mainnet"]}
        rows={[
          ["Used for", "All Novak contracts (writes)", "Data sources only (read-only)"],
          ["Chain ID", <C key="t">46630</C>, <C key="m">4663</C>],
          ["RPC", <C key="tr">https://rpc.testnet.chain.robinhood.com</C>, <C key="mr">https://rpc.mainnet.chain.robinhood.com</C>],
          ["Explorer", base ? <a key="te" href={base} target="_blank" rel="noreferrer">{base.replace("https://", "")}</a> : "—", <a key="me" href={MAINNET_EXPLORER} target="_blank" rel="noreferrer">robinhoodchain.blockscout.com</a>],
          ["Gas", "testnet ETH (free from the faucet)", "ETH"],
          ["Faucet", <a key="f" href={TESTNET_FAUCET_URL} target="_blank" rel="noreferrer">{TESTNET_FAUCET_URL.replace("https://", "")}</a>, "—"],
        ]}
      />

      <H2>Contracts</H2>
      {dep ? (
        <>
          <DataTable
            columns={["Contract", "Role", "Address"]}
            mono={[0, 2]}
            rows={ROLES.filter(([k]) => dep[k]).map(([k, name, role]) => [name, role, <Addr key={k} address={String(dep[k])} base={base} />])}
          />
          <P className="text-sm text-gray-500">
            Deployed {String(dep.deployedAt).slice(0, 10)} · first block {String(dep.startBlock)} (resolvers scan logs from here).
          </P>
        </>
      ) : (
        <Callout tone="warn">No deployment for chain 46630 in this build of the SDK.</Callout>
      )}

      <H2>Settings in effect</H2>
      <DataTable
        columns={["Setting", "Value", "Where"]}
        mono={[0, 1]}
        rows={[
          ["tradeFeeBps", "100 (1%)", "DistributionMarket"],
          ["feeBps", "100 (1%)", "Market"],
          ["Authorized resolvers", "2", "EventRegistry.getAuthorizedResolvers()"],
          ["Dispute / Tier-1 / Tier-2 bonds", "0.01 / 0.03 / 0.08 ETH", "DisputeManager"],
          ["Treasury of DisputeManager", "TreasuryVault", "DisputeManager.treasury()"],
        ]}
      />

      <H2>Sources the resolvers read (mainnet)</H2>
      <DataTable
        columns={["Source", "Example", "Address / endpoint"]}
        mono={[2]}
        rows={[
          ["Chainlink NVDA / USD", "price-at events, range markets", <Addr key="n" address={feedBySymbol("NVDA")?.address} base={MAINNET_EXPLORER} />],
          ["Chainlink TSLA / USD", "price-at events, range markets", <Addr key="t" address={feedBySymbol("TSLA")?.address} base={MAINNET_EXPLORER} />],
          ["Chainlink SGOV / USD", "tokenized-Treasury markets", <Addr key="s" address={feedBySymbol("SGOV")?.address} base={MAINNET_EXPLORER} />],
          ["ERC-8056 stock tokens", "corporate-action events", "UIMultiplierUpdated logs on each token"],
          ["Robinhood asset registry", "trading-status events", "api.robinhood.com/rhj/assets"],
          ["FRED DFEDTARU", "Fed-rate events", "fred.stlouisfed.org (public CSV)"],
        ]}
      />
      <P className="text-sm text-gray-500">
        The full list of 53 Chainlink feeds is in the SDK as <C>CHAINLINK_FEED_CATALOG</C> (regenerate with{" "}
        <C>pnpm --filter @novak/sdk gen:feeds</C>) and live on the <a href="/feeds">Feeds</a> page.
      </P>
    </article>
  );
}
