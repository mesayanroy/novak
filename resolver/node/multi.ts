import { spawn, type ChildProcess } from "node:child_process";
import { createServer, request } from "node:http";
import { fileURLToPath } from "node:url";

/**
 * Runs several resolver nodes from ONE host (e.g. a single Render service):
 * each key gets its own child process — its own account, nonce, event index,
 * evidence store and crash domain — exactly as if it ran on a separate box.
 *
 *   RESOLVER_KEYS          comma-separated private keys (with or without 0x)
 *   RESOLVER_IDS           optional comma-separated names (default r1, r2, …)
 *   RESOLVER_KEEPER_INDEX  1-based index of the node that also runs keeper duties
 *                          (default 1; set 0 to disable)
 *   PORT                   public port (Render injects it); children use PORT+1…
 *
 * Public HTTP (one port):
 *   GET /health                 -> { nodes: [ each child's /health ] }
 *   GET /<id>/health            -> that child's /health
 *   GET /<id>/evidence/:hash    -> that child's evidence
 *   GET /evidence/:hash         -> the first child that has it
 *
 * Independent operators should still run their own single-key node
 * (`node dist/node/index.js`); this launcher is for hosting a team's nodes cheaply.
 */

const keys = (process.env.RESOLVER_KEYS ?? "")
  .split(",")
  .map((k) => k.trim())
  .filter(Boolean);
if (keys.length === 0) {
  console.error("RESOLVER_KEYS is empty — set comma-separated resolver private keys");
  process.exit(1);
}
const ids = (process.env.RESOLVER_IDS ?? "").split(",").map((s) => s.trim());
const keeperIndex = Number(process.env.RESOLVER_KEEPER_INDEX ?? 1);
const publicPort = Number(process.env.PORT ?? process.env.RESOLVER_HTTP_PORT ?? 8787);
const entry = fileURLToPath(new URL("./index.js", import.meta.url));

interface Node {
  id: string;
  port: number;
  child?: ChildProcess;
  restarts: number;
}

const nodes: Node[] = keys.map((_, i) => ({ id: ids[i] || `r${i + 1}`, port: publicPort + 1 + i, restarts: 0 }));

function start(i: number) {
  const n = nodes[i];
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.RESOLVER_KEYS;
  delete env.PORT;
  env.RESOLVER_PRIVATE_KEY = keys[i];
  env.RESOLVER_ID = n.id;
  env.RESOLVER_HTTP_PORT = String(n.port);
  env.RESOLVER_KEEPER = keeperIndex === i + 1 ? "true" : "false";
  // Only the keeper lists markets, even if RESOLVER_LISTER=true is set service-wide.
  if (keeperIndex !== i + 1) env.RESOLVER_LISTER = "false";
  const child = spawn(process.execPath, [entry], { env, stdio: "inherit" });
  n.child = child;
  child.on("exit", (code, signal) => {
    n.child = undefined;
    if (shuttingDown) return;
    n.restarts++;
    const delay = Math.min(60_000, 2_000 * 2 ** Math.min(n.restarts, 5));
    console.error(`[multi] ${n.id} exited (code=${code} signal=${signal}); restarting in ${delay / 1000}s`);
    setTimeout(() => start(i), delay);
  });
}

function fetchChild(port: number, path: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve) => {
    const req = request({ host: "127.0.0.1", port, path, method: "GET", timeout: 5_000 }, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve({ status: res.statusCode ?? 502, body }));
    });
    req.on("error", () => resolve({ status: 502, body: JSON.stringify({ error: "node not reachable" }) }));
    req.on("timeout", () => req.destroy());
    req.end();
  });
}

let shuttingDown = false;
nodes.forEach((_, i) => start(i));

createServer(async (req, res) => {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("content-type", "application/json");
  const url = (req.url ?? "/").split("?")[0];

  if (url === "/" || url === "/health") {
    const all = await Promise.all(
      nodes.map(async (n) => {
        const r = await fetchChild(n.port, "/health");
        try {
          return { id: n.id, restarts: n.restarts, ...JSON.parse(r.body) };
        } catch {
          return { id: n.id, restarts: n.restarts, error: "bad health response" };
        }
      }),
    );
    res.end(JSON.stringify({ nodes: all }, null, 2));
    return;
  }

  const ev = url.match(/^\/evidence\/(0x[0-9a-fA-F]{64})$/);
  if (ev) {
    for (const n of nodes) {
      const r = await fetchChild(n.port, url);
      if (r.status === 200) {
        res.end(r.body);
        return;
      }
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ error: "unknown evidence hash" }));
    return;
  }

  const m = url.match(/^\/([^/]+)(\/.*)$/);
  const n = m && nodes.find((x) => x.id === m[1]);
  if (n && m) {
    const r = await fetchChild(n.port, m[2]);
    res.statusCode = r.status;
    res.end(r.body);
    return;
  }
  res.statusCode = 404;
  res.end(JSON.stringify({ error: "not found" }));
}).listen(publicPort, () => console.log(`[multi] ${nodes.length} resolver nodes; public http on :${publicPort}`));

for (const sig of ["SIGTERM", "SIGINT"] as const) {
  process.on(sig, () => {
    shuttingDown = true;
    nodes.forEach((n) => n.child?.kill(sig));
    setTimeout(() => process.exit(0), 3_000);
  });
}
