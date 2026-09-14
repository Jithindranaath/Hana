"use client";

import "@rainbow-me/rainbowkit/styles.css";
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { wagmiConfig } from "@/lib/wagmi";

const queryClient = new QueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        {/* RainbowKit ships its own blue. Point it at the Hana tokens so the connect button and
          its modal don't read as a second brand sitting inside the app. */}
      <RainbowKitProvider
        theme={darkTheme({
          accentColor: "#7C5CFF",
          accentColorForeground: "#FFFFFF",
          borderRadius: "small",
          fontStack: "system",
          overlayBlur: "small",
        })}
      >
        {children}
      </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
