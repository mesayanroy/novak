import { BaseError, ContractFunctionRevertedError, type Abi, type Hex } from "viem";
import type { Clients } from "./chain.js";

export type SendResult = { ok: true; hash: Hex } | { ok: false; reason: string };

/**
 * Simulate first, then send and wait. Simulation turns the common benign
 * cases ("already submitted", "window still open", a race with another
 * keeper) into a cheap revert reason instead of a failed on-chain tx.
 */
export async function send(
  c: Clients,
  req: { address: Hex; abi: Abi; functionName: string; args: readonly unknown[]; value?: bigint },
): Promise<SendResult> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { request } = await c.publicClient.simulateContract({ account: c.account, ...(req as any) });
    // Gas headroom: another resolver's tx can land first and change which code
    // path ours takes (e.g. the observation that completes quorum also writes
    // the proposal). Unused gas isn't charged.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const estimate = await c.publicClient.estimateContractGas({ account: c.account, ...(req as any) });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hash = await c.walletClient.writeContract({ ...(request as any), gas: (estimate * 3n) / 2n + 100_000n });
    const receipt = await c.publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") return { ok: false, reason: `reverted on-chain (${hash})` };
    return { ok: true, hash };
  } catch (err) {
    return { ok: false, reason: revertReason(err) };
  }
}

export function revertReason(err: unknown): string {
  if (err instanceof BaseError) {
    const revert = err.walk((e) => e instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      return revert.reason ?? revert.data?.errorName ?? revert.shortMessage;
    }
    return err.shortMessage;
  }
  return (err as Error).message ?? String(err);
}
