import { DistributionMarketView } from "@/components/distribution/DistributionMarketView";
import { shortHex } from "@/lib/utils";

export function generateMetadata({ params }: { params: { id: string } }) {
  return { title: `Distribution market ${shortHex(params.id)} — Novak` };
}

export default function DistributionMarketPage({ params }: { params: { id: string } }) {
  return <DistributionMarketView marketId={params.id as `0x${string}`} />;
}
