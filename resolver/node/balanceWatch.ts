import { formatEther } from "viem";
import { disputeManagerAbi } from "@novakoracle/sdk";
import type { Clients } from "../lib/chain.js";
import type { Log } from "./log.js";

/** Gas headroom on top of the bonds (Robinhood Chain testnet gas is cheap; this is generous). */
const GAS_RESERVE_WEI = 500_000_000_000_000n; // 0.0005 ETH
const REPEAT_MS = 6 * 3600 * 1000;

/**
 * Low-balance alert. A resolver that can't pay a committee bond can't vote in
 * a dispute, and one that can't pay gas can't observe — so warn BEFORE that
 * happens. Threshold: RESOLVER_MIN_BALANCE_WEI, or by default enough for two
 * Tier-1 votes plus gas, read from the deployment's own bond (so it adapts to
 * any bond unit). Alerts on crossing below (then every 6h while low) via the
 * log and, if set, a Slack/Discord-compatible webhook. Exposed in /health.
 */
export class BalanceWatch {
  balanceWei = 0n;
  minBalanceWei = 0n;
  low = false;
  private lastAlertAt = 0;

  constructor(
    private readonly c: Clients,
    private readonly log: Log,
    private readonly resolverId: string,
    private readonly configuredMin: bigint,
    private readonly webhookUrl?: string,
  ) {}

  private async threshold(): Promise<bigint> {
    if (this.configuredMin > 0n) return this.configuredMin;
    if (this.minBalanceWei > 0n) return this.minBalanceWei;
    const dm = this.c.deployment.disputeManager;
    const tier1 = dm
      ? ((await this.c.publicClient.readContract({ address: dm, abi: disputeManagerAbi, functionName: "TIER1_BOND" })) as bigint)
      : 0n;
    return tier1 * 2n + GAS_RESERVE_WEI;
  }

  async tick(): Promise<void> {
    this.minBalanceWei = await this.threshold();
    this.balanceWei = await this.c.publicClient.getBalance({ address: this.c.account.address });
    const wasLow = this.low;
    this.low = this.balanceWei < this.minBalanceWei;
    if (!this.low) {
      if (wasLow) this.log.info(`balance recovered: ${formatEther(this.balanceWei)} ETH`);
      return;
    }
    const now = Date.now();
    if (wasLow && now - this.lastAlertAt < REPEAT_MS) return;
    this.lastAlertAt = now;
    const msg =
      `Novak resolver ${this.resolverId} (${this.c.account.address}) is low on ETH: ` +
      `${formatEther(this.balanceWei)} < ${formatEther(this.minBalanceWei)} ETH. ` +
      `It may be unable to post committee bonds or pay gas. Top up: https://faucet.testnet.chain.robinhood.com`;
    this.log.warn(msg);
    if (this.webhookUrl) {
      try {
        // `text` for Slack, `content` for Discord — both ignore the other field.
        await fetch(this.webhookUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: msg, content: msg }) });
      } catch (err) {
        this.log.warn(`low-balance webhook failed: ${(err as Error).message}`);
      }
    }
  }

  status() {
    return { balanceWei: this.balanceWei.toString(), minBalanceWei: this.minBalanceWei.toString(), lowBalance: this.low };
  }
}
