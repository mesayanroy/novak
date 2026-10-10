import { CommunityMarketView } from "@/components/community/CommunityMarketView";
import { shortHex } from "@/lib/utils";

export function generateMetadata({ params }: { params: { id: string } }) {
  return { title: `Community market ${shortHex(params.id)} — Novak` };
}

export default function CommunityMarketPage({ params }: { params: { id: string } }) {
  return <CommunityMarketView marketId={params.id as `0x${string}`} />;
}
