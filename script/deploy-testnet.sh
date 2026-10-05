#!/usr/bin/env bash
# Deploy Novak to Robinhood Chain TESTNET (46630) from the git-ignored .env,
# verify on Blockscout, export deployments/46630.json, regenerate the SDK, and
# PROVE every exported address has code on-chain (deployments/46630.json must
# only ever come from a real broadcast).
#
#   bash script/deploy-testnet.sh
#
# .env needs: DEPLOYER_PRIVATE_KEY, R1_PRIVATE_KEY (and optionally
# R2_PRIVATE_KEY / R3_PRIVATE_KEY; without them the deployer doubles as r2).
set -euo pipefail
cd "$(dirname "$0")/.."

FORGE="${FORGE:-$(command -v forge || echo ~/.foundry/bin/forge)}"
CAST="${CAST:-$(command -v cast || echo ~/.foundry/bin/cast)}"
set -a; source <(tr -d '\r' < .env); set +a
# Accept keys with or without the 0x prefix.
norm() { local k="${1:-}"; [[ -z "$k" ]] && return; [[ "$k" == 0x* ]] && echo "$k" || echo "0x$k"; }
DEPLOYER_PRIVATE_KEY=$(norm "${DEPLOYER_PRIVATE_KEY:-}"); R1_PRIVATE_KEY=$(norm "${R1_PRIVATE_KEY:-}")
R2_PRIVATE_KEY=$(norm "${R2_PRIVATE_KEY:-}"); R3_PRIVATE_KEY=$(norm "${R3_PRIVATE_KEY:-}")
export DEPLOYER_PRIVATE_KEY
RPC="${RPC_URL_ROBINHOOD_TESTNET:-https://rpc.testnet.chain.robinhood.com}"

[[ "$($CAST chain-id --rpc-url "$RPC")" == "46630" ]] || { echo "RPC is not Robinhood Chain testnet"; exit 1; }
[[ ${#DEPLOYER_PRIVATE_KEY} -eq 66 && ${#R1_PRIVATE_KEY} -eq 66 ]] || { echo "Fill DEPLOYER_PRIVATE_KEY and R1_PRIVATE_KEY in .env"; exit 1; }

DEPLOYER=$($CAST wallet address --private-key "$DEPLOYER_PRIVATE_KEY")
R1=$($CAST wallet address --private-key "$R1_PRIVATE_KEY")
R2=$DEPLOYER
[[ -n "${R2_PRIVATE_KEY:-}" ]] && R2=$($CAST wallet address --private-key "$R2_PRIVATE_KEY")
RESOLVERS="$R1,$R2"
[[ -n "${R3_PRIVATE_KEY:-}" ]] && RESOLVERS="$RESOLVERS,$($CAST wallet address --private-key "$R3_PRIVATE_KEY")"

echo "deployer  $DEPLOYER  ($($CAST balance "$DEPLOYER" --ether --rpc-url "$RPC") ETH)"
echo "resolvers $RESOLVERS"
if [[ -n "${EXPECT_DEPLOYER:-}" && "${DEPLOYER,,}" != "${EXPECT_DEPLOYER,,}" ]]; then echo "deployer key does not match $EXPECT_DEPLOYER"; exit 1; fi
if [[ -n "${EXPECT_R1:-}" && "${R1,,}" != "${EXPECT_R1,,}" ]]; then echo "r1 key does not match $EXPECT_R1"; exit 1; fi

RESOLVER_ADDRESSES="$RESOLVERS" "$FORGE" script script/Deploy.s.sol \
  --rpc-url "$RPC" --broadcast --slow \
  --verify --verifier blockscout --verifier-url https://explorer.testnet.chain.robinhood.com/api/ \
  || { echo "(if only verification failed, the deploy itself may have succeeded — continuing)"; }

node script/export-deployment.mjs 46630
pnpm --filter @novak/sdk gen && pnpm --filter @novak/sdk build

echo "--- on-chain code check"
node -e '
const d=require("./deployments/46630.json");
for (const [k,v] of Object.entries(d)) if (typeof v==="string" && v.startsWith("0x") && v.length===42) console.log(k+" "+v);
' | while read -r name addr; do
  size=$($CAST codesize "$addr" --rpc-url "$RPC")
  printf "%-20s %s  %s bytes\n" "$name" "$addr" "$size"
  [[ "$size" -gt 0 ]] || { echo "NO CODE at $name — deployment is not real"; exit 1; }
done
echo "OK: every address in deployments/46630.json has code on Robinhood Chain testnet"
