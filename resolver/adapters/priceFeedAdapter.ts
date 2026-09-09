import type { Observation, SourceAdapter } from "./types.js";

/**
 * Example adapter for a price-threshold event (e.g. "ETH/USD > 5000 by
 * <deadline>"). Illustrates the adapter shape — it does not call a real price
 * API yet, and the threshold is read from an env var rather than decoded from
 * the event's on-chain `spec` bytes (decoding a real per-event threshold out
 * of `spec` needs the outcome/spec schema work tracked as a TODO in
 * docs/protocol-spec.md; hardcoding via env is a deliberate MVP shortcut so
 * the resolver <-> Registry submission path is exercisable end-to-end today).
 *
 * TODO: wire up a real HTTP price source (e.g. a CEX REST API or a
 * decentralized price oracle read) once a specific data source is chosen for
 * the demo. Keep the fetch + parse logic here, off-chain, per the "minimize
 * on-chain computation" principle — only the resulting boolean Observation
 * should ever reach a resolver submission transaction.
 */
export class PriceFeedAdapter implements SourceAdapter {
  readonly sourceId = "example.price-feed";

  async fetchObservation(eventId: `0x${string}`, _eventSpec: unknown): Promise<Observation> {
    const threshold = Number(process.env.PRICE_FEED_THRESHOLD ?? "5000");
    // Placeholder: replace with a real fetch() call to a price source.
    const placeholderPrice = Number(process.env.PRICE_FEED_MOCK_PRICE ?? "0");

    return {
      eventId,
      outcomeData: placeholderPrice > threshold,
      observedAt: Date.now(),
      rawEvidence: {
        source: "placeholder",
        price: placeholderPrice,
        threshold,
        note: "TODO: real price source",
      },
    };
  }
}
