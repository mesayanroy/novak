import { MarketDetail } from "@/components/markets/MarketDetail";
import { shortHex } from "@/lib/utils";

export function generateMetadata({ params }: { params: { id: string } }) {
  return { title: `Market ${shortHex(params.id)} — Novak` };
}

export default function MarketDetailPage({ params }: { params: { id: string } }) {
  return <MarketDetail marketId={params.id as `0x${string}`} />;
}
