/**
 * EIP-1193 provider injected into the recorded browser (via the driver's `initScripts`).
 *
 * Account and chain queries are answered here; every `eth_sendTransaction` is forwarded to the
 * local signer service, which holds the real demo-wallet key and broadcasts a genuinely signed
 * transaction. Nothing is stubbed or mocked — the key just never enters page context, so the
 * recording can't leak it.
 *
 * Targets wagmi's plain `injected()` connector, which `lib/wagmi.ts` lists first. `isMetaMask`
 * stays false on purpose: setting it true routes RainbowKit through the metaMaskWallet connector,
 * which hangs against a non-extension provider.
 */
(function () {
  var SIGNER = "http://localhost:8899";
  var ADDRESS = "__DEMO_ADDRESS__";
  var CC3 = "0x18e8f"; // 102031 — confirmed live via eth_chainId
  var chainId = CC3;
  var listeners = {};

  function emit(event, payload) {
    (listeners[event] || []).forEach(function (fn) {
      try { fn(payload); } catch (e) { /* a consumer throwing must not break the provider */ }
    });
  }

  var provider = {
    isMetaMask: false,
    isHanaDemoWallet: true,
    request: function (args) {
      var method = args.method;
      var params = args.params || [];
      switch (method) {
        case "eth_requestAccounts":
        case "eth_accounts":
          return Promise.resolve([ADDRESS]);
        case "eth_chainId":
          return Promise.resolve(chainId);
        case "net_version":
          return Promise.resolve(String(parseInt(chainId, 16)));
        case "wallet_switchEthereumChain":
          chainId = params[0].chainId;
          emit("chainChanged", chainId);
          return Promise.resolve(null);
        case "wallet_addEthereumChain":
          return Promise.resolve(null);
        case "eth_sendTransaction":
          var tx = Object.assign({}, params[0]);
          if (!tx.chainId) tx.chainId = chainId;
          return fetch(SIGNER + "/send", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(tx),
          })
            .then(function (r) { return r.json(); })
            .then(function (out) {
              if (out.error) throw new Error(out.error);
              return out.hash;
            });
        default:
          // Everything else is a read — hand it to the app's own RPC rather than guessing.
          return fetch(
            chainId === CC3
              ? "https://rpc.cc3-testnet.creditcoin.network"
              : "https://ethereum-sepolia-rpc.publicnode.com",
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method: method, params: params }),
            }
          )
            .then(function (r) { return r.json(); })
            .then(function (out) {
              if (out.error) throw new Error(out.error.message);
              return out.result;
            });
      }
    },
    on: function (event, fn) { (listeners[event] = listeners[event] || []).push(fn); },
    removeListener: function (event, fn) {
      listeners[event] = (listeners[event] || []).filter(function (x) { return x !== fn; });
    },
  };

  Object.defineProperty(window, "ethereum", { value: provider, writable: false, configurable: true });

  // EIP-6963 announcement, so a discovery-based connector finds it too.
  var info = {
    uuid: "6f1d2c40-9a3e-4f7b-8c21-hana-demo-0001",
    name: "Hana Demo Wallet",
    rdns: "network.hana.demo",
    icon: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=",
  };
  function announce() {
    window.dispatchEvent(
      new CustomEvent("eip6963:announceProvider", { detail: Object.freeze({ info: info, provider: provider }) })
    );
  }
  window.addEventListener("eip6963:requestProvider", announce);
  announce();
})();
