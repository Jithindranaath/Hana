import type { Page } from "playwright";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { cc3, sepolia } from "../lib/chains";

/**
 * Injects a minimal, real EIP-1193 provider into a Playwright page — no browser extension, no
 * MetaMask. Backed by a real private key; every `eth_sendTransaction` is a genuine, signed,
 * broadcast transaction on whichever chain the page currently thinks it's on.
 *
 * Deliberately targets wagmi's plain `injected()` connector, which `lib/wagmi.ts` already lists
 * first specifically because "it talks to whatever `window.ethereum` actually is" — this *is*
 * that test harness the comment anticipates. `isMetaMask` is left false on purpose: setting it
 * true would route RainbowKit through the `metaMaskWallet` connector instead, which the same
 * comment says hangs indefinitely against a non-extension provider like this one.
 */
export async function injectWallet(page: Page, privateKey: `0x${string}`): Promise<PrivateKeyAccount> {
  const account = privateKeyToAccount(privateKey);

  const cc3Client = createWalletClient({ account, chain: cc3, transport: http() });
  const sepoliaClient = createWalletClient({ account, chain: sepolia, transport: http() });
  const clients: Record<number, { sendTransaction: (typeof cc3Client)["sendTransaction"] }> = {
    [cc3.id]: cc3Client,
    [sepolia.id]: sepoliaClient,
  };

  await page.exposeFunction("__walletSendTransaction", async (txJson: string) => {
    const tx = JSON.parse(txJson);
    const chainId = parseInt(tx.chainId, 16);
    const client = clients[chainId];
    if (!client) throw new Error(`no signer configured for chainId ${chainId}`);
    const hash = await client.sendTransaction({
      to: tx.to,
      data: tx.data,
      value: tx.value ? BigInt(tx.value) : undefined,
    });
    console.log(`  [wallet:${chainId}] sent ${hash}`);
    return hash;
  });

  // Built as a plain string, not a serialized TS function: tsx/esbuild's dev transform wraps
  // functions with a `__name(...)` helper for stack-trace naming, which Playwright would then
  // stringify verbatim into the page — and `__name` doesn't exist in that context, so the whole
  // init script throws before `window.ethereum` is ever set. A hand-built string sidesteps that.
  const initChainIdHex = `0x${cc3.id.toString(16)}`;
  const initScript = `
    (function () {
      let currentChainId = ${JSON.stringify(initChainIdHex)};
      const address = ${JSON.stringify(account.address)};
      const listeners = {};
      function emit(event) {
        const args = Array.prototype.slice.call(arguments, 1);
        (listeners[event] || []).forEach(function (fn) { fn.apply(null, args); });
      }
      window.ethereum = {
        isMetaMask: false,
        selectedAddress: address,
        chainId: currentChainId,
        request: function (args) {
          const method = args.method;
          const params = args.params;
          switch (method) {
            case "eth_requestAccounts":
            case "eth_accounts":
              return Promise.resolve([address]);
            case "eth_chainId":
              return Promise.resolve(currentChainId);
            case "net_version":
              return Promise.resolve(String(parseInt(currentChainId, 16)));
            case "wallet_switchEthereumChain":
              currentChainId = params[0].chainId;
              emit("chainChanged", currentChainId);
              return Promise.resolve(null);
            case "wallet_addEthereumChain":
              return Promise.resolve(null);
            case "eth_sendTransaction": {
              const tx = params[0];
              return window.__walletSendTransaction(
                JSON.stringify(Object.assign({}, tx, { chainId: currentChainId }))
              );
            }
            default:
              return Promise.reject({ code: 4200, message: "Autopilot wallet: unsupported method " + method });
          }
        },
        on: function (event, cb) {
          (listeners[event] = listeners[event] || []).push(cb);
        },
        removeListener: function (event, cb) {
          listeners[event] = (listeners[event] || []).filter(function (f) { return f !== cb; });
        },
      };
    })();
  `;
  await page.addInitScript({ content: initScript });

  return account;
}
