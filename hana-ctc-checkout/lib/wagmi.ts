import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import {
  injectedWallet,
  metaMaskWallet,
  rainbowWallet,
  walletConnectWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { http } from "wagmi";
import { cc3, sepolia } from "./chains";

/**
 * Single supported chain for the app itself is `cc3` (WORKFLOW.md 7.1) — `sepolia` is only ever
 * targeted transiently during the "link your history" onboarding step (7.3), which prompts a
 * network switch there and back.
 *
 * `injectedWallet` is listed first, ahead of the branded `metaMaskWallet` — the latter connects
 * via `@metamask/sdk`, which only works against a real extension/mobile app (it hangs
 * indefinitely against anything else, including test harnesses that inject a plain EIP-1193
 * provider). `injectedWallet` uses wagmi's plain `injected()` connector — it talks to whatever
 * `window.ethereum` actually is, which is also just a better default for any injected wallet
 * RainbowKit doesn't have a curated entry for (Rabby, Frame, etc.).
 */
export const wagmiConfig = getDefaultConfig({
  appName: "Hana Checkout",
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "00000000000000000000000000000000",
  chains: [cc3, sepolia],
  wallets: [
    {
      groupName: "Recommended",
      wallets: [injectedWallet, metaMaskWallet, rainbowWallet, walletConnectWallet],
    },
  ],
  transports: {
    [cc3.id]: http(),
    [sepolia.id]: http(),
  },
  ssr: true,
});

export const SUPPORTED_CHAIN_ID = cc3.id;
