"use client";

import "@rainbow-me/rainbowkit/styles.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RainbowKitProvider, lightTheme } from "@rainbow-me/rainbowkit";
import { WagmiProvider } from "wagmi";
import { useState, type ReactNode } from "react";
import { wagmiConfig } from "@/lib/wagmi";

// RainbowKit always has an "accent" concept (the Connect button, selected
// states in the wallet modal) — pinned to pure black/white here so it never
// introduces the blue RainbowKit ships by default. No other color knob is
// exposed to the modal.
const novakRainbowKitTheme = lightTheme({
  accentColor: "#0A0908",
  accentColorForeground: "#FDFDFC",
  borderRadius: "small",
  fontStack: "system",
});

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={novakRainbowKitTheme}>{children}</RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
