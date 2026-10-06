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

```bash
npm i @novakoracle/sdk viem
```

Three ways in, from least to most code:

| You are… | Use | Code |
|---|---|---|
| A Solidity market or AMM | Inherit `NovakConsumer` | [`contracts/integrations/NovakConsumer.sol`](../contracts/integrations/NovakConsumer.sol) |
| A Conditional Tokens (Polymarket-style) venue | Make `NovakCTFAdapter` your condition's oracle | [`contracts/integrations/NovakCTFAdapter.sol`](../contracts/integrations/NovakCTFAdapter.sol) |
| An off-chain settlement service | `NovakClient.waitForOutcome` | [`sdk/`](../sdk/README.md) |

## 1. Reuse or create the event

**Reuse first.** An event is observed, disputed and finalized once. Every
market that reads it settles on the same answer, and you pay no extra resolver
work:

```ts
const from = BigInt(getDeployment(46630).startBlock);
// The exact same question (same source + spec bytes), undecided events first:
const [existing] = await novak.findMatchingEvents({ sourceId, spec, onlyOpen: true }, from);

// Range markets: which "NVDA ≥ X at T" boundaries already exist?
const rungs = await novak.findPriceLadder({ feed: CHAINLINK_FEEDS_MAINNET.NVDA, at: T }, from);
const { reuse, create } = planLadder(rungs, thresholds); // only create what's missing
```

In the app, every event page has a **Reuse this event** panel (ID, its ladder,
ready-to-paste code, one-click market). The Builder console warns you before
you create a duplicate.

To create a new one, these are the event types (`sourceId` = `keccak256(name)`):

| Source | Question | Encoder (`@novakoracle/sdk`) |
|---|---|---|
| `chainlink.price-at.v1` | NVDA / TSLA / SGOV (tokenized Treasury) ≥ or ≤ X at time T | `encodePriceAtSpec` |
| `rh.corporate-action.v1` | A stock token had a split- or dividend-sized multiplier change in a window | `encodeCorporateActionSpec` |
| `rh.trading-status.v1` | A stock token is not tradable in a given session | `encodeTradingStatusSpec` |
| `macro.fomc.v1` | The Fed funds target upper bound is ≥ or ≤ X bps on day D | `encodeFedRateSpec` |

```ts
import { NovakClient, getDeployment, robinhoodTestnet, SOURCES, sourceId,
  encodePriceAtSpec, CHAINLINK_FEEDS_MAINNET, Comparator } from "@novakoracle/sdk";

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

## 2a. Settle on-chain: inherit `NovakConsumer`

`NovakConsumer` holds **only** an `IEventBus` reference and gives you the
whole settlement surface:

```solidity
import { NovakConsumer } from "novak/contracts/integrations/NovakConsumer.sol";

contract MyMarket is NovakConsumer {
    bytes32 public immutable eventId;
    constructor(address bus, bytes32 id) NovakConsumer(bus) { eventId = id; }

    function deposit(bool yes) external payable whenNovakPending(eventId) { /* … */ }
    function resolve() external { _settleWithNovak(eventId); }   // calls exactly one hook

    function _onNovakResolved(bytes32, bool yes) internal override { /* pay winners */ }
    function _onNovakVoided(bytes32) internal override { /* refund everyone */ }
}
```

| Helper | Does |
|---|---|
| `novakResolution(id)` | `Pending` / `True` / `False` / `Voided` in one call |
| `whenNovakPending(id)` | modifier: no trading once the answer is known |
| `_settleWithNovak(id)` | routes to `_onNovakResolved` or `_onNovakVoided`; reverts while pending |
| `novakRange(boundaries)` | `(status, winningBucket)` for an ascending ladder; a voided or inconsistent ladder is `Voided` |
| `_novakOutcome(id)` | `(outcome, occurredAt)`: v2 payloads carry `occurredAt`, v1 falls back to `finalizedAt` |

Tested in `test/unit/NovakIntegrations.t.sol`, including the guard test that
the consumer holds only the Bus. If you'd rather not inherit anything, it
comes down to three reads (see
[`examples/integrations/ExternalPredictionMarket.sol`](../examples/integrations/ExternalPredictionMarket.sol)):

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

## 2b. Conditional Tokens venues: `NovakCTFAdapter`

Polymarket-style venues hold positions as Gnosis Conditional Tokens and
settle when the condition's oracle calls `reportPayouts`. Deploy
`NovakCTFAdapter(eventBus, conditionalTokens)` and it **is** that oracle,
answering from Novak:

```ts
await novak.ctfPrepareBinary(adapter, eventId, account);         // slot 0 = YES, slot 1 = NO
await novak.ctfPrepareRange(adapter, boundaryEventIds, account); // n boundaries ⇒ n+1 slots
// … trade the condition's outcome tokens exactly as today …
if (await novak.ctfCanResolve(adapter, questionId))
  await novak.ctfResolve(adapter, questionId, account);          // permissionless
```

- The `questionId` is deterministic per event (or per ladder), so two
  venues on the same Novak event share one condition.
- If Novak voids the event, every slot pays equally. That's the CTF's
  "invalid" outcome: everyone gets their collateral back.
- Disputes happen in Novak's committees *before* `resolve` can run. The
  venue never posts a bond.

## 2c. Settle off-chain

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

`@novakoracle/sdk` ships them: `getDeployment(46630)` for Robinhood Chain testnet.
Read `eventBus` for on-chain consumers and `treasuryVault` for fee sharing.
