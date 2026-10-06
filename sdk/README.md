# @novakoracle/sdk

TypeScript SDK for **Novak**, the dispute-layer oracle for prediction markets and range (LMSR) AMMs on **Robinhood Chain**.

Novak resolves a real-world fact once:

- independent resolvers reach an N-of-M quorum;
- the result can be challenged through bonded Tier-1 and Tier-2 committees;
- if the challenge doesn't converge, the event is VOIDED, never guessed.

The final answer then sits on-chain for any market to read. Use this SDK to:

- **reuse** events that already exist, or create new ones;
- read final outcomes through the Event Bus;
- trade and settle range markets;
- settle Polymarket-style Conditional Tokens.

```bash
npm i @novakoracle/sdk viem
```

`viem` (≥ 2.56) is a peer dependency.

## Read an outcome

```ts
import { createPublicClient, http } from "viem";
import { NovakClient, getDeployment, robinhoodTestnet } from "@novakoracle/sdk";

const publicClient = createPublicClient({ chain: robinhoodTestnet, transport: http() });
const novak = new NovakClient(publicClient, undefined, getDeployment(robinhoodTestnet.id));

const r = await novak.waitForOutcome(eventId);  // polls the Event Bus
if (r.voided) refundEveryone();                  // Novak will never decide it
else settle(r.outcome);                          // true / false, after disputes
```

## Reuse before you create

An event is paid for, observed and disputed only once. Point your market at an event that already exists:

```ts
import { CHAINLINK_FEEDS_MAINNET, planLadder, getDeployment } from "@novakoracle/sdk";

const { startBlock } = getDeployment(46630);

// Exact question already asked?
const [best] = await novak.findMatchingEvents({ sourceId, spec, onlyOpen: true }, BigInt(startBlock));

// Range market: which "NVDA ≥ X at T" boundaries already exist?
const rungs = await novak.findPriceLadder({ feed: CHAINLINK_FEEDS_MAINNET.NVDA, at: T }, BigInt(startBlock));
const { reuse, create } = planLadder(rungs, [180e8, 190e8, 200e8, 210e8].map(BigInt));
// create only what's missing: novak.createEvents(buildPriceLadderSpecs({ ..., thresholds: create }))
```

## Settle a Conditional Tokens (Polymarket-style) market

Deploy `NovakCTFAdapter(eventBus, conditionalTokens)` from [`contracts/integrations`](../contracts/integrations), then:

```ts
await novak.ctfPrepareBinary(adapter, eventId, account);         // slot 0 = YES, slot 1 = NO
await novak.ctfPrepareRange(adapter, boundaryEventIds, account); // n boundaries ⇒ n+1 slots
// … the venue trades outcome tokens as usual …
if (await novak.ctfCanResolve(adapter, questionId)) await novak.ctfResolve(adapter, questionId, account);
// Voided ⇒ every slot pays equally (CTF "invalid" = refund)
```

## Settle in Solidity

Inherit `NovakConsumer` from [`contracts/integrations/NovakConsumer.sol`](../contracts/integrations/NovakConsumer.sol). Your contract holds only the Event Bus:

```solidity
contract MyMarket is NovakConsumer {
    constructor(address bus, bytes32 id) NovakConsumer(bus) { eventId = id; }
    function deposit() external payable whenNovakPending(eventId) { /* … */ }
    function resolve() external { _settleWithNovak(eventId); }
    function _onNovakResolved(bytes32, bool yes) internal override { /* pay winners */ }
    function _onNovakVoided(bytes32) internal override { /* refund */ }
}
```

For range markets, `novakRange(boundaries)` returns `(status, winningBucket)`.

## What's in the box

| Area | Exports |
|---|---|
| Client | `NovakClient`: events, composites (AND/OR/NOT/BEFORE/WITHIN), Event Bus reads, `waitForOutcome`, binary markets, range markets (`distributionBuy/Sell/Quote/Prices/Redeem`), vault claims, lending guard, CTF adapter, reuse lookups |
| Specs | `SOURCES`, `sourceId`, `encodePriceAtSpec`, `buildPriceLadderSpecs`, `ladderBucketLabels`, corporate-action / trading-status / Fed-rate encoders |
| Outcomes | `decodeOutcome`, `encodeOutcomeV2` (`abi.encode(bool, uint64 occurredAt)`), … |
| Reuse | `matchesEvent`, `rankMatches`, `selectPriceLadder`, `planLadder` |
| ABIs | `eventBusAbi`, `distributionMarketAbi`, `novakCtfAdapterAbi`, … (generated from the contracts) |
| Chains | `robinhoodTestnet`, `getDeployment(chainId)`, `explorerUrl`, `CHAINLINK_FEEDS_MAINNET` |

Deployed today on Robinhood Chain **testnet (46630)**. Resolvers read live sources (Chainlink stock feeds, ERC-8056 stock tokens) from Robinhood Chain mainnet.

MIT licensed.
