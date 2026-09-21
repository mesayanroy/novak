"use client";

import { useState } from "react";
import { ConnectButton as RainbowConnectButton } from "@rainbow-me/rainbowkit";
import { Button } from "@/components/ui/button";
import { shortHex } from "@/lib/utils";
import { Wallet, ChevronDown, ExternalLink, Zap, ShieldCheck, CheckCircle2 } from "lucide-react";

export function ConnectButton() {
  const [showPopover, setShowPopover] = useState(false);

  return (
    <RainbowConnectButton.Custom>
      {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted }) => {
        const ready = mounted;
        const connected = ready && account && chain;

        return (
          <div
            className="relative"
            {...(!ready && {
              "aria-hidden": true,
              style: { opacity: 0, pointerEvents: "none", userSelect: "none" },
            })}
          >
            {(() => {
              if (!connected) {
                return (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={openConnectModal}
                    className="gap-2 font-mono text-xs uppercase tracking-wider"
                  >
                    <Wallet className="h-3.5 w-3.5" />
                    Connect Wallet
                  </Button>
                );
              }

              if (chain.unsupported) {
                return (
                  <Button variant="secondary" size="sm" onClick={openChainModal} className="gap-2 text-rose-700 bg-rose-50 border-rose-200">
                    Wrong network
                  </Button>
                );
              }

              return (
                <div className="flex items-center gap-2 font-mono">
                  {/* Network Selector Pill */}
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={openChainModal}
                    className="gap-1.5 text-xs text-gray-700 hover:text-ink font-semibold border-gray-300"
                  >
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                    {chain.name}
                  </Button>

                  {/* Account Address & Balance Trigger */}
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={openAccountModal}
                    className="gap-2 border-ink text-ink font-semibold bg-paper hover:bg-gray-100"
                  >
                    <span className="font-mono">{shortHex(account.address)}</span>
                    {account.displayBalance && (
                      <span className="text-gray-500 font-normal">({account.displayBalance})</span>
                    )}
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
