import { LayerDiagram } from "@/components/architecture/LayerDiagram";

export const metadata = { title: "Architecture — Novak Docs" };

export default function ArchitecturePage() {
  return (
    <article>
      <p className="font-mono text-xs uppercase tracking-wide text-gray-500">Architecture</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">The five layers</h1>

      <p className="mt-6 text-gray-700">
        Novak is five layers stacked strictly bottom-to-top. Each layer has one job, and a layer may
        only talk to the interface directly beneath it — it can never reach around that layer into the
        one below. Concretely: <code className="font-mono text-sm">derivatives/Market.sol</code> holds
        only a <code className="font-mono text-sm">Settlement</code> reference, and{" "}
        <code className="font-mono text-sm">Settlement.sol</code> holds only an{" "}
        <code className="font-mono text-sm">IEventBus</code> reference. No application contract ever
        imports the Registry, the Composer, or a resolver.
      </p>

      <div className="mt-8">
        <LayerDiagram detailed />
      </div>

      <h2 className="mt-10 text-xl font-semibold">Why this matters</h2>
      <p className="mt-3 text-gray-700">
        It's what lets the resolver network evolve — swap adapters, add resolvers, change quorum rules
        — without touching, or even redeploying, a single market built on top of it. The same principle
        holds on the TypeScript side: the frontend and SDK read event state through{" "}
        <code className="font-mono text-sm">eventBus</code> / <code className="font-mono text-sm">settlement</code> /{" "}
        <code className="font-mono text-sm">market</code> ABI calls only, never a resolver's internals.
      </p>
    </article>
  );
}
