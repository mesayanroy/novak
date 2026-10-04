# Integrate Novak into your prediction market

Novak is a **resolution and dispute layer**. Your market keeps its own
trading (order book, AMM, parimutuel). It hands the "what actually happened?"
question to Novak and reads back a final answer:
- Independent resolvers observe the source (Chainlink stock and bond feeds on
  Robinhood Chain, ERC-8056 corporate actions, Robinhood's asset registry,
  the Fed funds rate) and must agree.
- Anyone can dispute, which escalates to bonded Tier-1 and Tier-2 committees.
  A committee needs 66% agreement to decide, and it is never a token vote.
- If an event can never be resolved, it is **Voided**, never left hanging.

You never run an oracle, a quorum or a dispute process. You never trust a
single reporter.

## 1. Pick or create the event

Reuse an existing event ID (anyone's markets can settle on the same event), or
create one. These are the event types (`sourceId` = `keccak256(name)`):

| Source | Question | Encoder (`@novak/sdk`) |
|---|---|---|
| `chainlink.price-at.v1` | NVDA / TSLA / SGOV (tokenized Treasury) ≥ or ≤ X at time T | `encodePriceAtSpec` |
| `rh.corporate-action.v1` | A stock token had a split- or dividend-sized multiplier change in a window | `encodeCorporateActionSpec` |
| `rh.trading-status.v1` | A stock token is not tradable in a given session | `encodeTradingStatusSpec` |
| `macro.fomc.v1` | The Fed funds target upper bound is ≥ or ≤ X bps on day D | `encodeFedRateSpec` |

```ts
import { NovakClient, getDeployment, robinhoodTestnet, SOURCES, sourceId,
  encodePriceAtSpec, CHAINLINK_FEEDS_MAINNET, Comparator } from "@novak/sdk";

const novak = new NovakClient(publicClient, walletClient, getDeployment(robinhoodTestnet.id));
const T = 1_791_000_000n; // when the question is decided
const tx = await novak.createEvent({
  specVersion: 2, // outcome carries occurredAt, so BEFORE/WITHIN compose correctly
  sourceId: sourceId(SOURCES.priceAt),
  openTimestamp: T, observationDeadline: T + 86_400n,
  disputeWindowSeconds: 3_600n, quorumThreshold: 2,
  spec: encodePriceAtSpec({ feed: CHAINLINK_FEEDS_MAINNET.NVDA, threshold: 250_0000_0000n,
    comparator: Comparator.Gte, at: T, maxStaleness: 3n * 86_400n }),
}, account);
const eventId = await novak.getCreatedEventId(tx);
```

For a combined question ("NVDA ≥ $250 AND the Fed cut WITHIN 48h"), use
`createComposite`. Its ID is canonical, so every venue that builds the same
combination shares one answer.

For a **range question** ("where will NVDA be at T?"), create a ladder with
`buildPriceLadderSpecs` + `createEvents` (one transaction). Bucket *k* wins
when exactly *k* boundaries resolve YES. Novak's own `DistributionMarket`
works this way.

## 2a. Settle on-chain: three reads from the Event Bus

Hold **only** an `IEventBus` reference. Full example:
[`examples/integrations/ExternalPredictionMarket.sol`](../examples/integrations/ExternalPredictionMarket.sol)
(tested in `test/unit/ExternalPredictionMarket.t.sol`).

```solidity
IEventBus.Availability a = novak.getAvailability(eventId);
require(a != IEventBus.Availability.Pending, "not final yet");
if (a == IEventBus.Availability.Voided) { refundEveryone(); return; }
bool yes = abi.decode(novak.readOutcome(eventId).outcomeData, (bool));
```

Rules:
- **Stop trading when the event becomes decided.** Check
  `getAvailability(eventId) == Pending` in your trade path, and close trading
  no later than the event's `openTimestamp`.
- **Always handle `Voided`** (refund, or redeem at 1/N for range markets).
- The outcome's first ABI word is the bool in every spec version, so
  `abi.decode(outcomeData, (bool))` is always valid.

## 2b. Settle off-chain (Polymarket-style venues)

```ts
const result = await novak.waitForOutcome(eventId, { intervalMs: 15_000 });
if (result.voided) await refundMarket(marketId);
else await settleMarket(marketId, result.outcome);
```

`waitForOutcome` is a pull loop over the same Bus reads; there's no push
delivery to trust. Evidence for every observation is public. Each resolver
serves the JSON behind its on-chain `evidenceHash` at `/evidence/:hash`, so
your users can verify a resolution themselves.

## 3. Share fees with the layer (optional)

To pay the people who keep resolution honest, push a fee into the
**TreasuryVault**, tagged with the event IDs you settled on:

```solidity
usdg.approve(address(vault), fee);
ITreasuryVault(vault).depositFees(eventIds, fee);
```

Once each event is decided, its fees split into thirds:
- ⅓ to resolvers who reported the final outcome;
- ⅓ to committee members who voted the final outcome (or the insurance
  reserve, if the event was never disputed);
- ⅓ to the treasury.

Novak's own `Market` and `DistributionMarket` do exactly this.

## Addresses

`@novak/sdk` ships them: `getDeployment(46630)` for Robinhood Chain testnet.
Read `eventBus` for on-chain consumers and `treasuryVault` for fee sharing.
