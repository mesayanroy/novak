"use client";

import "@rainbow-me/rainbowkit/styles.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RainbowKitProvider, darkTheme, lightTheme } from "@rainbow-me/rainbowkit";
import { WagmiProvider } from "wagmi";
import { useState, type ReactNode } from "react";
import { activeChain, wagmiConfig } from "@/lib/wagmi";
import { useIsDark } from "@/lib/theme";

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
const novakRainbowKitDark = darkTheme({
  accentColor: "#f3f1f8",
  accentColorForeground: "#0b0a10",
  borderRadius: "small",
  fontStack: "system",
});

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const dark = useIsDark();

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={dark ? novakRainbowKitDark : novakRainbowKitTheme} initialChain={activeChain} modalSize="wide">{children}</RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
