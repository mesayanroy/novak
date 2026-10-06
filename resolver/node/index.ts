import { eventRegistryAbi } from "@novakoracle/sdk";
import { buildAdapters } from "../adapters/index.js";
import { EvidenceStore } from "../evidence/evidence.js";
import { loadConfig } from "../lib/config.js";
import { chainNow, makeClients, redactUrl } from "../lib/chain.js";
import { BalanceWatch } from "./balanceWatch.js";
import { EventIndex } from "./discovery.js";
import { EvidenceBackfill } from "./evidenceBackfill.js";
import { KeeperDuty } from "./keeper.js";
import { makeLog } from "./log.js";
import { ResolverDuty } from "./resolve.js";
import { RewardsDuty } from "./rewards.js";
import { startServer } from "./server.js";
import { VoterDuty } from "./voter.js";

/**
 * Resolver daemon. Every poll interval:
 *   1. discover new events/composites from on-chain logs (node/discovery.ts)
 *   2. resolver duty: observe + submit for events it has an adapter for
 *   3. voter duty: vote in dispute committees it was drawn into
 *   4. keeper duty (RESOLVER_KEEPER=true on ONE node): poke finalize/expire/
 *      escalations/tryResolve/settle/withdraw
 *
 * Writes to the chain Novak is deployed on (NOVAK_CHAIN_ID: 46630 Robinhood
 * testnet, or 31337 anvil); reads source data from Robinhood Chain MAINNET
 * (RESOLVER_SOURCE_RPC_URL). Run 3 of these with different keys for a
 * 2-of-3 quorum — see resolver/README.md.
 */
async function main(): Promise<void> {
  const config = loadConfig();
  const c = makeClients(config);
  const log = makeLog(config.resolverId);

  const authorized = await c.publicClient.readContract({
    address: c.deployment.eventRegistry,
    abi: eventRegistryAbi,
    functionName: "isAuthorizedResolver",
    args: [c.account.address],
  });
  log.info(
    `starting ${c.account.address} on chain ${config.chainId} (registry ${c.deployment.eventRegistry}); ` +
      `authorized=${authorized} keeper=${config.keeper} voter=${config.voter} ` +
      `rpc=[${config.rpcUrls.map(redactUrl).join(" → ")}] source=[${config.sourceRpcUrls.map(redactUrl).join(" → ")}]`,
  );
  if (!authorized) log.warn("not an authorized resolver — observations will be rejected (keeper duties still work)");

  const index = new EventIndex(c.publicClient, c.deployment, config.logChunk);
  const adapters = buildAdapters(c.sourceClient);
  // RESOLVER_EVIDENCE_DIR persists evidence across restarts (shared safely: records are content-addressed).
  const evidence = new EvidenceStore(process.env.RESOLVER_EVIDENCE_DIR || undefined);
  const resolver = new ResolverDuty(c, index, adapters, evidence, log);
  const voter = new VoterDuty(c, index, adapters, resolver, log);
  const keeper = new KeeperDuty(c, index, resolver, log);
  const rewards = new RewardsDuty(c, index, log);
  const balance = new BalanceWatch(c, log, config.resolverId, config.minBalanceWei, config.alertWebhookUrl);
  const backfill = new EvidenceBackfill(c, index, adapters, evidence, resolver, log, config.logChunk);

  let lastLoopAt = 0;
  let lastError: string | undefined;
  if (config.httpPort) {
    startServer(config.httpPort, evidence, () => ({
      resolverId: config.resolverId,
      address: c.account.address,
      chainId: config.chainId,
      authorized,
      keeper: config.keeper,
      lastLoopAt: lastLoopAt ? new Date(lastLoopAt).toISOString() : null,
      scannedToBlock: index.scannedTo,
      events: index.primitives.size,
      composites: index.composites.size,
      submissions: resolver.submissions,
      votes: voter.votes,
      keeperActions: keeper.actions,
      rewardClaims: rewards.claims,
      evidenceRecords: evidence.size,
      ...balance.status(),
      lastError,
    }));
    log.info(`http on :${config.httpPort} (/health, /evidence/:hash)`);
  }

  let running = false;
  const loop = async () => {
    if (running) return; // a slow tick (cold log scans) must not overlap the next
    running = true;
    try {
      await index.sync();
      const now = await chainNow(c.publicClient);
      if (authorized && !backfill.done) await backfill.run(now).catch((e) => log.warn(`evidence backfill: ${(e as Error).message}`));
      if (authorized) await resolver.tick(now);
      if (authorized && config.voter) await voter.tick(now);
      if (config.keeper) await keeper.tick(now);
      await rewards.tick();
      await balance.tick().catch((e) => log.warn(`balance check: ${(e as Error).message}`));
      lastLoopAt = Date.now();
      lastError = undefined;
    } catch (err) {
      lastError = (err as Error).message;
      log.warn(`loop error: ${lastError}`);
    } finally {
      running = false;
    }
  };

  await loop();
  if (process.env.RESOLVER_ONCE === "true") return;
  setInterval(loop, config.pollIntervalMs);
}

main().catch((err) => {
  console.error("[resolver] fatal error", err);
  process.exit(1);
});
