"use client";

import { useState } from "react";
import { useAccount, usePublicClient } from "wagmi";
import {
  CHAINLINK_FEEDS_MAINNET,
  Comparator,
  CompositeOp,
  SOURCES,
  STOCK_TOKENS_MAINNET,
  encodeCorporateActionSpec,
  encodePriceAtSpec,
  sourceId,
  type Hex,
} from "@novak/sdk";
import { novakAddresses } from "@/lib/addresses";
import { useEvents, useNovakClient, type EventNode } from "@/lib/novak";
import { useTx } from "@/lib/useTx";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ConnectButton } from "@/components/ConnectButton";
import { shortHex } from "@/lib/utils";
import { RangeTemplate } from "@/components/distribution/RangeTemplate";

type Template = "range" | "price" | "corporate" | "combine";

const TICKERS = Object.keys(CHAINLINK_FEEDS_MAINNET).filter((t) => !t.includes("/"));
const HOUR = 3600;
const DAY = 24 * HOUR;

const toLocalInput = (unix: number) => {
  const d = new Date(unix * 1000);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};
const fromLocalInput = (s: string) => Math.floor(new Date(s).getTime() / 1000);

/**
 * Market templates. Each creates the underlying Novak event(s) AND the
 * market in one flow, with trading closing exactly when the event's
 * observation window opens (the Market can't check that itself — see
 * docs/protocol-spec.md "trading window").
 */
export function CreateMarketCard({ onCreated }: { onCreated?: (marketId: Hex) => void }) {
  const { address, isConnected } = useAccount();
  const client = useNovakClient();
  const publicClient = usePublicClient();
  const { data: events } = useEvents();
  const { run, pending, error } = useTx();
  const [template, setTemplate] = useState<Template>("price");
  const [created, setCreated] = useState<Hex | null>(null);

  // price template
  const nowSec = Math.floor(Date.now() / 1000);
  const [ticker, setTicker] = useState("NVDA");
  const [cmp, setCmp] = useState<Comparator>(Comparator.Gte);
  const [threshold, setThreshold] = useState("250");
  const [at, setAt] = useState(toLocalInput(nowSec + HOUR));
  // corporate template
  const [minBps, setMinBps] = useState("5000");
  const [winStart, setWinStart] = useState(toLocalInput(nowSec + HOUR));
  const [winEnd, setWinEnd] = useState(toLocalInput(nowSec + 7 * DAY));
  // combine template
  const [opA, setOpA] = useState<Hex | "">("");
  const [opB, setOpB] = useState<Hex | "">("");
  const [op, setOp] = useState<CompositeOp>(CompositeOp.And);
  const [windowH, setWindowH] = useState("48");

  if (!isConnected || !client || !address) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Create a market</CardTitle>
          <CardDescription>Connect a wallet on Robinhood Chain testnet to create markets.</CardDescription>
        </CardHeader>
        <CardContent>
          <ConnectButton />
        </CardContent>
      </Card>
    );
  }

  const createEventThenMarket = (
    label: string,
    event: { specVersion: number; source: string; openTimestamp: bigint; deadline: bigint; spec: Hex },
    question: string,
  ) =>
    run(label, async (wait) => {
      const evTx = await client.createEvent(
        {
          specVersion: event.specVersion,
          sourceId: sourceId(event.source),
          openTimestamp: event.openTimestamp,
          observationDeadline: event.deadline,
          disputeWindowSeconds: 600n,
          quorumThreshold: 2,
          spec: event.spec,
        },
        address,
      );
      await wait(evTx);
      const eventId = await client.getCreatedEventId(evTx);
      const mTx = await client.createMarket(eventId, event.openTimestamp, question, address);
      await wait(mTx);
      const marketId = await client.getCreatedMarketId(mTx);
      setCreated(marketId);
      onCreated?.(marketId);
    });

  const submitPrice = () => {
    const t = BigInt(fromLocalInput(at));
    const dollars = Number(threshold);
    createEventThenMarket(
      "Creating price event + market",
      {
        specVersion: 2,
        source: SOURCES.priceAt,
        openTimestamp: t,
        deadline: t + BigInt(DAY),
        spec: encodePriceAtSpec({
          feed: CHAINLINK_FEEDS_MAINNET[ticker] as Hex,
          threshold: BigInt(Math.round(dollars * 1e8)),
          comparator: cmp,
          at: t,
          maxStaleness: BigInt(3 * DAY), // tolerate a weekend's held price
        }),
      },
      `Will ${ticker} be ${cmp === Comparator.Gte ? "≥" : "≤"} $${dollars} at ${new Date(Number(t) * 1000).toLocaleString()}?`,
    );
  };

  const submitCorporate = () => {
    const s = BigInt(fromLocalInput(winStart));
    const e = BigInt(fromLocalInput(winEnd));
    const bps = Number(minBps);
    createEventThenMarket(
      "Creating corporate-action event + market",
      {
        specVersion: 2,
        source: SOURCES.corporateAction,
        openTimestamp: s,
        deadline: e + BigInt(DAY),
        spec: encodeCorporateActionSpec({ stockToken: STOCK_TOKENS_MAINNET.NVDA, windowStart: s, windowEnd: e, minChangeBps: bps }),
      },
      `Will NVDA have a ${bps >= 5000 ? "split-size" : `≥${bps / 100}%`} corporate action by ${new Date(Number(e) * 1000).toLocaleDateString()}?`,
    );
  };

  const eventsById = new Map((events ?? []).map((e) => [e.id, e]));
  const submitCombine = () =>
    run("Creating composite + market", async (wait) => {
      const a = eventsById.get(opA as Hex);
      const b = eventsById.get(opB as Hex);
      if (!a || !b) throw new Error("Pick two events");
      const opensAt = [a.opensAt, b.opensAt].filter((x): x is bigint => x !== undefined).reduce((m, x) => (x < m ? x : m));
      if (opensAt <= BigInt(Math.floor(Date.now() / 1000))) throw new Error("One of these events has already opened — trading would be closed");
      const cTx = await client.createComposite(
        { op, operands: [a.id, b.id], window: op === CompositeOp.Within || op === CompositeOp.Before ? BigInt(Number(windowH) * HOUR) : 0n },
        address,
      );
      await wait(cTx);
      const compositeId = await compositeIdFromTx(cTx);
      const opWord = { [CompositeOp.And]: "AND", [CompositeOp.Or]: "OR", [CompositeOp.Within]: `WITHIN ${windowH}h OF`, [CompositeOp.Before]: "BEFORE", [CompositeOp.Not]: "NOT" }[op];
      const mTx = await client.createMarket(compositeId, opensAt, `${a.title} ${opWord} ${b.title}?`.slice(0, 280), address);
      await wait(mTx);
      const marketId = await client.getCreatedMarketId(mTx);
      setCreated(marketId);
      onCreated?.(marketId);
    });

  async function compositeIdFromTx(hash: Hex): Promise<Hex> {
    const receipt = await publicClient!.waitForTransactionReceipt({ hash });
    const log = receipt.logs.find((l) => l.address.toLowerCase() === novakAddresses.eventComposer.toLowerCase());
    if (!log?.topics[1]) throw new Error("CompositeEventCreated log not found");
    return log.topics[1] as Hex;
  }

  const openEvents = (events ?? []).filter(
    (e: EventNode) => e.opensAt !== undefined && e.opensAt > BigInt(Math.floor(Date.now() / 1000)),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create a market</CardTitle>
        <CardDescription>
          Pick a template. Novak creates the event, and a USDG market whose trading closes when the event&apos;s
          observation window opens. Resolvers settle it automatically.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["price", "Stock price at a time"],
              ["corporate", "Corporate action"],
              ["combine", "Combine two events"],
              ["range", "Price range (distribution)"],
            ] as const
          ).map(([t, label]) => (
            <Button key={t} size="sm" variant={template === t ? "primary" : "secondary"} onClick={() => setTemplate(t)}>
              {label}
            </Button>
          ))}
        </div>

        {template === "price" && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-gray-600">
              Resolved from Chainlink&apos;s <strong>Robinhood {ticker} / USD</strong> feed on Robinhood Chain — the round in
              effect at the chosen time.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <select className="h-10 border border-gray-300 px-2 text-sm" value={ticker} onChange={(e) => setTicker(e.target.value)}>
                {TICKERS.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
              <select className="h-10 border border-gray-300 px-2 text-sm" value={cmp} onChange={(e) => setCmp(Number(e.target.value))}>
                <option value={Comparator.Gte}>≥</option>
                <option value={Comparator.Lte}>≤</option>
              </select>
              <span className="text-sm">$</span>
              <Input className="w-28" value={threshold} onChange={(e) => setThreshold(e.target.value)} aria-label="Threshold in USD" />
              <span className="text-sm">at</span>
              <Input type="datetime-local" className="w-56" value={at} onChange={(e) => setAt(e.target.value)} aria-label="Resolution time" />
            </div>
            <Button disabled={Boolean(pending)} onClick={submitPrice}>
              Create price market
            </Button>
          </div>
        )}

        {template === "corporate" && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-gray-600">
              Resolved from the NVDA stock token&apos;s ERC-8056 multiplier updates — the corporate-action signal Chainlink
              doesn&apos;t provide.
            </p>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span>Minimum change</span>
              <select className="h-10 border border-gray-300 px-2" value={minBps} onChange={(e) => setMinBps(e.target.value)}>
                <option value="5000">Split-size (≥50%)</option>
                <option value="100">≥1%</option>
                <option value="0">Any (incl. dividend reinvestment)</option>
              </select>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span>Effective between</span>
              <Input type="datetime-local" className="w-56" value={winStart} onChange={(e) => setWinStart(e.target.value)} />
              <span>and</span>
              <Input type="datetime-local" className="w-56" value={winEnd} onChange={(e) => setWinEnd(e.target.value)} />
            </div>
            <Button disabled={Boolean(pending)} onClick={submitCorporate}>
              Create corporate-action market
            </Button>
          </div>
        )}

        {template === "range" && <RangeTemplate />}

        {template === "combine" && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-gray-600">
              Compose two not-yet-open events into one settleable fact (canonical ID — anyone else building the same
              composite reuses it).
            </p>
            {openEvents.length < 2 ? (
              <p className="text-sm text-gray-500">Create at least two events that haven&apos;t opened yet first.</p>
            ) : (
              <>
                {[
                  [opA, setOpA],
                  [opB, setOpB],
                ].map(([val, set], i) => (
                  <select
                    key={i}
                    className="h-10 border border-gray-300 px-2 text-sm"
                    value={val as string}
                    onChange={(e) => (set as (v: Hex) => void)(e.target.value as Hex)}
                  >
                    <option value="">Event {i === 0 ? "A" : "B"}…</option>
                    {openEvents.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.title} ({shortHex(e.id)})
                      </option>
                    ))}
                  </select>
                ))}
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <select className="h-10 border border-gray-300 px-2" value={op} onChange={(e) => setOp(Number(e.target.value))}>
                    <option value={CompositeOp.And}>A AND B</option>
                    <option value={CompositeOp.Or}>A OR B</option>
                    <option value={CompositeOp.Within}>A WITHIN n hours of B</option>
                    <option value={CompositeOp.Before}>A BEFORE B</option>
                  </select>
                  {(op === CompositeOp.Within || op === CompositeOp.Before) && (
                    <>
                      <Input className="w-20" value={windowH} onChange={(e) => setWindowH(e.target.value)} />
                      <span>hours</span>
                    </>
                  )}
                </div>
                <Button disabled={Boolean(pending) || !opA || !opB || opA === opB} onClick={submitCombine}>
                  Create composite market
                </Button>
              </>
            )}
          </div>
        )}

        {pending && <p className="font-mono text-xs text-gray-500">{pending}… (2 transactions)</p>}
        {error && <p className="font-mono text-xs text-rose-700">{error}</p>}
        {created && (
          <p className="text-sm">
            Market created:{" "}
            <a className="underline" href={`/markets/${created}`}>
              {shortHex(created, 10, 8)}
            </a>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
