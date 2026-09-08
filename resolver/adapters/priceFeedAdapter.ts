import type { Observation, SourceAdapter } from "./types.js";

/**
 * Example adapter stub for a price-feed style event (e.g. "ETH/USD > 5000 by
 * <deadline>"). Illustrates the adapter shape only — it does not call a real
 * price API yet.
 *
 * TODO: wire up a real HTTP price source (e.g. a CEX REST API or a decentralized
 * price oracle read) once a specific data source is chosen for the demo. Keep the
 * fetch + parse logic here, off-chain, per the "minimize on-chain computation"
 * principle — only the resulting Observation should ever reach a resolver
 * submission transaction.
 */
export class PriceFeedAdapter implements SourceAdapter {
  readonly sourceId = "example.price-feed";

  async fetchObservation(
    eventId: `0x${string}`,
    _eventSpec: unknown,
  ): Promise<Observation> {
    // Placeholder: replace with a real fetch() call to a price source.
    const placeholderPrice = 0;

    return {
      eventId,
      outcomeData: { price: placeholderPrice },
      observedAt: Date.now(),
      rawEvidence: { source: "placeholder", note: "TODO: real price source" },
    };
  }
}
