import { chromium } from "playwright";
import { injectWallet } from "./wallet";

async function main() {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

  const account = await injectWallet(page, "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
  console.log("Injected wallet address:", account.address);

  await page.goto("http://localhost:3001/", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "demo/.scratch-loaded.png" });

  const bodyText = await page.textContent("body");
  console.log("Auto-connected (no 'Connect Wallet' text):", !bodyText?.includes("Connect Wallet"));
  console.log("Shows floor score 300:", bodyText?.includes("300"));
  console.log("CONSOLE_ERRORS:", JSON.stringify(errors, null, 2));
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
