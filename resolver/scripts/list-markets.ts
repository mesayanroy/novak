import { loadConfig } from "../lib/config.js";
import { chainNow, makeClients } from "../lib/chain.js";
import { ListerDuty, listedFeeds, listerConfig } from "../node/lister.js";
import { makeLog } from "../node/log.js";

/**
 * One-shot market listing (the same thing the keeper node does continuously):
 *   RESOLVER_PRIVATE_KEY=<funded key> pnpm --filter novak-resolver list-markets
 * Lists every due feed in one pass (RESOLVER_LIST_SYMBOLS narrows it).
 */
async function main() {
  const config = loadConfig();
  const c = makeClients(config);
  const log = makeLog(config.resolverId);
  const cfg = { ...listerConfig(), enabled: true, intervalMs: 0, maxPerPass: Number(process.env.RESOLVER_LIST_MAX_PER_PASS ?? 100) };
  log.info(`listing up to ${cfg.maxPerPass} of ${listedFeeds(cfg.symbols).length} feeds from ${c.account.address}`);
  const lister = new ListerDuty(c, cfg, log, config.logChunk);
  await lister.tick(await chainNow(c.publicClient));
  log.info(`done: ${lister.listed} feed(s) listed`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
