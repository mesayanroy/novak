import { createServer } from "node:http";
import type { Hex } from "viem";
import type { EvidenceStore } from "../evidence/evidence.js";
import { toJson } from "../lib/chain.js";

/**
 * Tiny public status surface for a hosted resolver:
 *   GET /health          -> identity, chain, last loop, counters
 *   GET /evidence/:hash  -> the exact evidence JSON behind an on-chain evidenceHash
 * CORS is open so the frontend can link and fetch evidence directly.
 */
export function startServer(port: number, evidence: EvidenceStore, health: () => Record<string, unknown>) {
  const server = createServer((req, res) => {
    res.setHeader("access-control-allow-origin", "*");
    res.setHeader("content-type", "application/json");
    const url = req.url ?? "/";
    if (url === "/health" || url === "/") {
      res.end(toJson(health()));
      return;
    }
    const m = url.match(/^\/evidence\/(0x[0-9a-fA-F]{64})$/);
    if (m) {
      const record = evidence.get(m[1] as Hex);
      res.statusCode = record ? 200 : 404;
      res.end(toJson(record ?? { error: "unknown evidence hash" }));
      return;
    }
    res.statusCode = 404;
    res.end(toJson({ error: "not found" }));
  });
  server.listen(port);
  return server;
}
