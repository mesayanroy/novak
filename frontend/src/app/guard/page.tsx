"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import type { PublicClient } from "viem";
import { STOCK_TOKENS_MAINNET, stockLendingGuardAbi, type Hex } from "@novakoracle/sdk";
import { EventStatusPill, CompositeStatusPill } from "@/components/StatusPill";
import { CodeBlock } from "@/components/CodeBlock";
import { deployment, novakAddresses } from "@/lib/addresses";
import { fmtTime, loadEventNode, type EventNode } from "@/lib/novak";
import { shortHex } from "@/lib/utils";

interface Rule {
  eventId: Hex;
  pauseFrom: bigint;
  pauseUntil: bigint;
  failClosed: boolean;
}

const INTEGRATION = `// In your lending protocol on Robinhood Chain:
IStockLendingGuard guard = IStockLendingGuard(NOVAK_GUARD);

function liquidate(address borrower, address stockToken) external {
    (bool allowed, bytes32 blockingEvent) = guard.canLiquidate(stockToken);
    require(allowed, "liquidations paused: corporate action / halt");
    // ... normal liquidation using the Chainlink price
}`;

/**
 * The second Event Bus consumer, live: StockLendingGuard answers "is it safe
 * to liquidate this stock token right now?" from finalized Novak events — the
 * same events markets settle on. It holds only an IEventBus reference.
 */
export default function GuardPage() {
  const pc = usePublicClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["novak", "guard"],
    enabled: Boolean(pc && deployment),
    refetchInterval: 10_000,
    queryFn: async () => {
      const client = pc as PublicClient;
      return Promise.all(
        Object.entries(STOCK_TOKENS_MAINNET).map(async ([symbol, token]) => {
          const [allowed, blocking] = await client.readContract({
            address: novakAddresses.stockLendingGuard,
            abi: stockLendingGuardAbi,
            functionName: "canLiquidate",
            args: [token],
          });
          const rules = (await client.readContract({
            address: novakAddresses.stockLendingGuard,
            abi: stockLendingGuardAbi,
            functionName: "getRiskRules",
            args: [token],
          })) as readonly Rule[];
          const events = await Promise.all(rules.map((r) => loadEventNode(client, r.eventId)));
          return { symbol, token, allowed, blocking: blocking as Hex, rules, events };
        }),
      );
    },
  });

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <p className="font-mono text-xs uppercase tracking-wider text-gray-500 font-semibold">Second consumer · StockLendingGuard.sol</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl text-ink">Lending guard</h1>
      <p className="mt-2 max-w-3xl text-sm text-gray-600 leading-relaxed">
        Liquidating stock-token collateral through a split, a dividend adjustment or a halt can wipe out healthy
        positions: the price discontinuity is real, but the token&apos;s <code>oraclePaused()</code> flag is advisory only.
        This guard pauses liquidations while a finalized Novak risk event is true — the <strong>same event</strong> a market
        can settle on. It reads only the EventBus; no oracle integration, no custom glue.
      </p>

      {!deployment && <p className="mt-6 text-sm text-gray-600">No deployment configured for this chain.</p>}
      {isLoading && <p className="mt-6 text-sm text-gray-500">Reading guard state…</p>}
      {error && <p className="mt-6 text-sm text-rose-700">{(error as Error).message}</p>}

      {data?.map((t) => (
        <section key={t.token} className="mt-8 border border-gray-300 bg-paper p-5 rounded-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-ink">
              {t.symbol} <span className="font-mono text-xs text-gray-500">{shortHex(t.token)}</span>
            </h2>
            <span
              className={`font-mono text-sm font-bold px-3 py-1 rounded-sm ${
                t.allowed ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-rose-50 text-rose-800 border border-rose-200"
              }`}
            >
              Liquidations {t.allowed ? "ALLOWED" : "PAUSED"}
            </span>
          </div>
          {!t.allowed && (
            <p className="mt-2 text-sm text-gray-700">
              Blocked by event <span className="font-mono">{shortHex(t.blocking, 10, 8)}</span>.
            </p>
          )}
          <h3 className="mt-5 font-mono text-xs uppercase tracking-wide text-gray-500">Risk rules</h3>
          {t.rules.length === 0 ? (
            <p className="mt-2 text-sm text-gray-500">No rules configured.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-2">
              {t.rules.map((r, i) => {
                const e: EventNode = t.events[i];
                return (
                  <li key={`${r.eventId}-${i}`} className="border border-gray-200 p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-ink">{e.title}</span>
                      {e.kind === "composite" ? (
                        <CompositeStatusPill status={e.compositeStatus ?? "Unresolved"} />
                      ) : (
                        e.status !== undefined && <EventStatusPill status={e.status} />
                      )}
                    </div>
                    <p className="mt-1 font-mono text-xs text-gray-500">
                      Pause window {fmtTime(r.pauseFrom)} → {fmtTime(r.pauseUntil)} · {r.failClosed ? "fail-closed (pauses while unresolved)" : "fail-open"}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ))}

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-ink">Integrate in three lines</h2>
        <div className="mt-3">
          <CodeBlock code={INTEGRATION} label="Solidity" />
        </div>
        <p className="mt-3 text-sm text-gray-600">
          Risk rules are set by the guard&apos;s risk admin. Events come from the same catalog as{" "}
          <Link href="/markets">markets</Link> and the <Link href="/calendar">calendar</Link>.
        </p>
      </section>
    </div>
  );
}
