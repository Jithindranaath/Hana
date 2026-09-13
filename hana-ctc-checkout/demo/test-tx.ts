import { chromium } from "playwright";
import * as fs from "fs";
import * as path from "path";
import { injectWallet } from "./wallet";

async function main() {
  const walletsPath = path.resolve(__dirname, "..", "..", "hana-ctc-attestor", ".demo-wallets.json");
  const wallets = JSON.parse(fs.readFileSync(walletsPath, "utf8"));
  const pk = wallets.excellent.privateKey as `0x${string}`;

  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

  const account = await injectWallet(page, pk);
  console.log("Wallet:", account.address);

  await page.goto("http://localhost:3001/credit-line", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  console.log("Clicking faucet button...");
  await page.getByRole("button", { name: /get testnet space/i }).click();
  await page.waitForTimeout(20000);

  await page.screenshot({ path: "demo/.scratch-faucet.png" });
  const bodyText = await page.textContent("body");
  console.log("Page text snippet around balance:", bodyText?.match(/Wallet balance:[^\n]*/)?.[0]);
  console.log("CONSOLE_ERRORS:", JSON.stringify(errors, null, 2));
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
