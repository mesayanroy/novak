"use client";

import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { parseAbiItem, type Address, type PublicClient } from "viem";
import { CommunityStatus, communityMarketAbi, type CommunityMarketInfo, type Hex } from "@novakoracle/sdk";
import { deployment, novakAddresses } from "./addresses";
import { useNovakClient } from "./novak";

/**
 * Community markets: user-created, creator-resolved prediction pools (sports,
 * challenges, anything Novak's resolvers don't cover). Separate from the event
 * layer — see derivatives/CommunityMarket.sol.
 */

export const COMMUNITY_CATEGORIES = ["Football", "Cricket", "Basketball", "Esports", "Tennis", "Friends", "Other"] as const;
export type CommunityCategory = (typeof COMMUNITY_CATEGORIES)[number];

/** Rules are stored as "[Category] free text" so the category travels on-chain with the market. */
export function parseRules(rules: string): { category: CommunityCategory; text: string } {
  const m = rules.match(/^\[([A-Za-z]+)\]\s*/);
  const cat = (COMMUNITY_CATEGORIES as readonly string[]).includes(m?.[1] ?? "") ? (m![1] as CommunityCategory) : "Other";
  return { category: cat, text: m ? rules.slice(m[0].length) : rules };
}

export interface CommunityView extends CommunityMarketInfo {
  category: CommunityCategory;
  rulesText: string;
  /** Pool share per outcome (0..1); equal shares when the pool is empty. */
  shares: number[];
  objectionEndsAt?: number;
}

const toView = (m: CommunityMarketInfo): CommunityView => {
  const total = Number(m.totalPool);
  const { category, text } = parseRules(m.rules);
  return {
    ...m,
    category,
    rulesText: text,
    shares: m.pools.map((p) => (total > 0 ? Number(p) / total : 1 / m.nOutcomes)),
    objectionEndsAt: m.proposedAt ? Number(m.proposedAt + m.objectionWindow) : undefined,
  };
};

export const communityEnabled = Boolean(novakAddresses.communityMarket);

/** Community markets, newest first. `live: true` keeps only those still taking stakes. */
export function useCommunityMarkets(opts: { live?: boolean } = {}) {
  const client = useNovakClient();
  const pc = usePublicClient();
  const live = Boolean(opts.live);
  return useQuery({
    queryKey: ["novak", "community", "list", novakAddresses.communityMarket, live],
    enabled: Boolean(client && pc && communityEnabled),
    refetchInterval: 20_000,
    queryFn: async (): Promise<CommunityView[]> => {
      const ids = await client!.listCommunityMarketIds();
      const cm = { address: novakAddresses.communityMarket!, abi: communityMarketAbi } as const;
      let keep = ids;
      if (live && ids.length) {
        const metas = await (pc as PublicClient).multicall({ allowFailure: false, contracts: ids.map((id) => ({ ...cm, functionName: "getMarket" as const, args: [id] as const })) });
        const now = BigInt(Math.floor(Date.now() / 1000));
        keep = ids.filter((_, i) => {
          const m = metas[i] as { status: number; closesAt: bigint };
          return Number(m.status) === CommunityStatus.Open && m.closesAt > now;
        });
      }
      const views = await Promise.all(keep.map(async (id) => toView(await client!.getCommunityMarket(id))));
      return views.reverse();
    },
  });
}

export function useCommunityMarket(id: Hex | undefined) {
  const client = useNovakClient();
  return useQuery({
    queryKey: ["novak", "community", id],
    enabled: Boolean(client && id && communityEnabled),
    refetchInterval: 8_000,
    queryFn: async () => toView(await client!.getCommunityMarket(id!)),
  });
}

export function useCommunityPosition(id: Hex | undefined, who: Address | undefined) {
  const pc = usePublicClient();
  return useQuery({
    queryKey: ["novak", "community", "pos", id, who],
    enabled: Boolean(pc && id && who && communityEnabled),
    refetchInterval: 8_000,
    queryFn: async () => {
      const cm = { address: novakAddresses.communityMarket!, abi: communityMarketAbi } as const;
      const [stakes, payout, objected, claimed] = await (pc as PublicClient).multicall({
        allowFailure: false,
        contracts: [
          { ...cm, functionName: "stakesOf", args: [id!, who!] },
          { ...cm, functionName: "payoutOf", args: [id!, who!] },
          { ...cm, functionName: "objected", args: [id!, who!] },
          { ...cm, functionName: "claimed", args: [id!, who!] },
        ],
      });
      return { stakes: [...(stakes as readonly bigint[])], payout: payout as bigint, objected: objected as boolean, claimed: claimed as boolean };
    },
  });
}

const stakedEvent = parseAbiItem("event Staked(bytes32 indexed marketId, address indexed player, uint8 indexed outcome, uint256 amount)");

/** Every stake on a market, newest first (from Staked logs). */
export function useCommunityActivity(id: Hex | undefined) {
  const pc = usePublicClient();
  return useQuery({
    queryKey: ["novak", "community", "activity", id],
    enabled: Boolean(pc && id && communityEnabled && deployment),
    refetchInterval: 15_000,
    queryFn: async () => {
      const logs = await (pc as PublicClient).getLogs({
        address: novakAddresses.communityMarket!,
        event: stakedEvent,
        args: { marketId: id! },
        fromBlock: BigInt(deployment!.startBlock),
        toBlock: "latest",
      });
      return logs
        .map((l) => ({ player: l.args.player as Address, outcome: Number(l.args.outcome), amount: l.args.amount as bigint, tx: l.transactionHash, block: l.blockNumber }))
        .reverse();
    },
  });
}
