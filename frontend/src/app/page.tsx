import { ConnectWallet } from "@/components/ConnectWallet";
import { EventStatusCard } from "@/components/EventStatusCard";
import { CreateMarketCard } from "@/components/CreateMarketCard";

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="mb-10 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Novak</h1>
          <p className="text-sm text-slate-400">Neural Event Network — demo</p>
        </div>
        <ConnectWallet />
      </header>

      <div className="grid gap-6 sm:grid-cols-2">
        <EventStatusCard />
        <CreateMarketCard />
      </div>

      <p className="mt-10 text-xs text-slate-500">
        Reads and writes here go only through the EventBus / Market contracts —
        never a resolver directly. See docs/architecture.md.
      </p>
    </main>
  );
}
