/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    // @wagmi/connectors' "Base Account" (Coinbase Smart Wallet) connector pulls in
    // @coinbase/cdp-sdk, whose x402 payment integration imports several @x402/evm/* submodules
    // that aren't installed (an optional peer we don't need). We don't use that connector —
    // RainbowKit's default list still works fine without it — so stub the whole package rather
    // than alias each broken submodule individually.
    config.resolve.alias["@coinbase/cdp-sdk"] = false;
    // @metamask/sdk's React Native transport and WalletConnect's pino logger both probe for
    // optional packages (`@react-native-async-storage/async-storage`, `pino-pretty`) that are
    // never installed or reached in a browser build — both libraries already handle the
    // module-not-found case at runtime. Stub them the same way to drop the harmless build
    // warnings instead of leaving noise that could hide a real one.
    config.resolve.alias["@react-native-async-storage/async-storage"] = false;
    config.resolve.alias["pino-pretty"] = false;
    return config;
  },
};

module.exports = nextConfig;
