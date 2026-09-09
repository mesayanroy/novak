"use client";

import { ConnectButton as RainbowConnectButton } from "@rainbow-me/rainbowkit";
import { Button } from "@/components/ui/button";
import { shortHex } from "@/lib/utils";

/**
 * Full custom render via RainbowKit's ConnectButton.Custom so the button
 * matches our own <Button> styling instead of RainbowKit's default pill —
 * keeps wallet connection out of the "generic crypto dashboard" look while
 * still using RainbowKit's connector list, chain handling, and modal.
 */
export function ConnectButton() {
  return (
    <RainbowConnectButton.Custom>
      {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted }) => {
        const ready = mounted;
        const connected = ready && account && chain;

        return (
          <div
            {...(!ready && {
              "aria-hidden": true,
              style: { opacity: 0, pointerEvents: "none", userSelect: "none" },
            })}
          >
            {(() => {
              if (!connected) {
                return (
                  <Button variant="primary" size="sm" onClick={openConnectModal}>
                    Connect Wallet
                  </Button>
                );
              }

              if (chain.unsupported) {
                return (
                  <Button variant="secondary" size="sm" onClick={openChainModal}>
                    Wrong network
                  </Button>
                );
              }

              return (
                <div className="flex items-center gap-2">
                  <Button variant="secondary" size="sm" onClick={openChainModal}>
                    {chain.name}
                  </Button>
                  <Button variant="secondary" size="sm" onClick={openAccountModal}>
                    <span className="font-mono">{shortHex(account.address)}</span>
                  </Button>
                </div>
              );
            })()}
          </div>
        );
      }}
    </RainbowConnectButton.Custom>
  );
}
