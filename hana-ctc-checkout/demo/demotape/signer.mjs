/**
 * Local signing service for the DemoTape recording.
 *
 * The recorded browser gets an EIP-1193 provider (wallet-init.js) that answers account/chain
 * queries in-page and forwards every `eth_sendTransaction` here. This process holds the real
 * demo-wallet key from `.demo-wallets.json` and broadcasts a genuinely signed transaction to CC3
 * or Sepolia — so nothing in the demo is simulated; the key simply never enters page context.
 *
 *   node demo/demotape/signer.mjs [excellent|thin]
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createWalletClient, createPublicClient, http as viemHttp } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WHICH = process.argv[2] === "thin" ? "thin" : "excellent";
const PORT = Number(process.env.SIGNER_PORT ?? 8899);

const CC3 = {
  id: 102031,
  name: "Creditcoin CC3 Testnet",
  nativeCurrency: { name: "CTC", symbol: "CTC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.cc3-testnet.creditcoin.network"] } },
};
const SEPOLIA = {
  id: 11155111,
  name: "Sepolia",
  nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com"] } },
};

const wallets = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "..", "..", "..", "hana-ctc-attestor", ".demo-wallets.json"), "utf8")
);
const account = privateKeyToAccount(wallets[WHICH].privateKey);

const chains = { [CC3.id]: CC3, [SEPOLIA.id]: SEPOLIA };
const clients = Object.fromEntries(
  Object.values(chains).map((chain) => [
    chain.id,
    {
      wallet: createWalletClient({ account, chain, transport: viemHttp() }),
      pub: createPublicClient({ chain, transport: viemHttp() }),
    },
  ])
);

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
}

const server = http.createServer((req, res) => {
  cors(res);
  if (req.method === "OPTIONS") return res.writeHead(204).end();
  if (req.url === "/address") {
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify({ address: account.address, which: WHICH }));
  }
  if (req.method !== "POST" || req.url !== "/send") return res.writeHead(404).end();

  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", async () => {
    try {
      const tx = JSON.parse(body);
      const chainId = parseInt(tx.chainId, 16);
      const c = clients[chainId];
      if (!c) throw new Error(`no signer configured for chainId ${chainId}`);
      const hash = await c.wallet.sendTransaction({
        to: tx.to,
        data: tx.data,
        value: tx.value ? BigInt(tx.value) : undefined,
      });
      console.log(`[signer:${chainId}] ${hash}`);
      // Wait for the receipt here so the page's promise resolves only once the transaction is
      // genuinely mined — the UI's own `waitForTransactionReceipt` then returns immediately and
      // the recorded take never sits on a spinner that already finished.
      await c.pub.waitForTransactionReceipt({ hash });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ hash }));
    } catch (err) {
      console.error("[signer] error:", err.shortMessage || err.message);
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: err.shortMessage || err.message }));
    }
  });
});

server.listen(PORT, () => {
  console.log(`[signer] ${WHICH} ${account.address} listening on :${PORT}`);
});
