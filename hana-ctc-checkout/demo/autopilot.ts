import { chromium, type Page } from "playwright";
import * as fs from "fs";
import * as path from "path";
import { createPublicClient, http, parseUnits, formatUnits, encodeFunctionData } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { injectWallet } from "./wallet";
import { cc3, sepolia } from "../lib/chains";
import { CreditRegistry, IUSDC, MockSPACE, SpaceCreditLine } from "../lib/contracts";

/**
 * Click-through autopilot for the demo video (hana-ctc-pivot.md §10 / planning/demo-video-script.md).
 * Drives a REAL browser against REAL running services with a REAL funded wallet — no extension,
 * no manual clicking. Screen-record this window; narrate over it.
 *
 * Requires already running (same as planning/demo-video-script.md's pre-recording checklist):
 *   pnpm worker:dev        (or pnpm start, from hana-ctc-worker)
 *   pnpm merchant:dev
 *   pnpm checkout:dev
 *   pnpm store:dev
 *
 * Usage:
 *   WHICH=excellent pnpm --filter @hana/checkout demo:autopilot
 *   PACE=4 WHICH=excellent pnpm --filter @hana/checkout demo:autopilot   (slower, more narration room)
 */

const WHICH = process.env.WHICH === "thin" ? "thin" : "excellent";
const PACE = Number(process.env.PACE ?? 3); // seconds paused between actions, tune to your narration speed

const cc3Public = createPublicClient({ chain: cc3, transport: http() });

function loadDemoWallet() {
  const walletsPath = path.resolve(__dirname, "..", "..", "hana-ctc-attestor", ".demo-wallets.json");
  const wallets = JSON.parse(fs.readFileSync(walletsPath, "utf8"));
  const pk = wallets[WHICH]?.privateKey as `0x${string}` | undefined;
  if (!pk) throw new Error(`No "${WHICH}" wallet in ${walletsPath}`);
  return pk;
}

async function beat(title: string) {
  console.log(`\n\x1b[36m>>> ${title}\x1b[0m`);
  await new Promise((r) => setTimeout(r, PACE * 1000));
}

async function screenshot(page: Page, name: string) {
  const dir = path.resolve(__dirname, ".captures");
  fs.mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, `${name}.png`) });
}

/** Waits for a button's busy-state label (e.g. "Paying...") to disappear — more reliable than
 *  guessing a fixed delay, and doesn't overshoot on a fast confirmation either. */
async function waitForBusyToClear(page: Page, busyText: string, timeoutMs = 30000) {
  await page
    .getByText(busyText, { exact: true })
    .waitFor({ state: "hidden", timeout: timeoutMs })
    .catch(() => {}); // never showed up (too fast to catch) — fine, nothing to wait out
}

async function main() {
  const pk = loadDemoWallet();
  const account = privateKeyToAccount(pk);
  console.log(`Autopilot driving the "${WHICH}" demo wallet: ${account.address}`);
  console.log(`Pace: ${PACE}s between actions. Start your screen recording now, then watch this window.\n`);

  // A dedicated, uniquely-named profile dir: identifies this exact browser instance's command
  // line unambiguously, so it (and only it) can ever be targeted for cleanup — never a real,
  // user-owned Chrome window.
  const userDataDir = path.resolve(__dirname, ".autopilot-chrome-profile");
  const browser = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: ["--window-size=1440,900", "--window-position=0,0"],
    viewport: null,
  });
  try {
    await runBeats(browser, pk, account);
  } catch (err) {
    // A crash here previously left the browser running and holding a lock on `userDataDir`,
    // blocking every subsequent run with "already in use by another instance" until someone
    // found and killed it by hand. Always close on failure — a successful run still leaves the
    // window open on purpose, for recording.
    console.error("\nAutopilot failed — closing the browser so the next run isn't blocked.");
    await browser.close().catch(() => {});
    throw err;
  }
}

async function runBeats(
  browser: Awaited<ReturnType<typeof chromium.launchPersistentContext>>,
  pk: `0x${string}`,
  account: ReturnType<typeof privateKeyToAccount>
) {
  const page = await browser.newPage();
  page.on("pageerror", (e) => console.error("  [page error]", e.message));

  await injectWallet(page, pk);

  // ---- Beat: opening state -------------------------------------------------
  await beat("BEAT 1 — Opening: this wallet's Hana credit profile");
  await page.goto("http://localhost:3001/", { waitUntil: "load" });
  await page.waitForTimeout(1500);
  await screenshot(page, "01-home");

  // ---- Beat: proof of the cross-chain import (already completed for real) --
  await beat("BEAT 2 — Proof this score came from a real cross-chain import (not seeded)");
  await page.goto("http://localhost:3001/link-history", { waitUntil: "load" });
  await page.waitForTimeout(1500);
  await screenshot(page, "02-link-history");

  await page.goto("http://localhost:3001/", { waitUntil: "load" });
  await page.waitForTimeout(1000);

  // ---- Beat: buy something on the demo store, pay in installments ----------
  await beat("BEAT 3 — Demo store: add items to cart");
  await page.goto("http://localhost:3003/", { waitUntil: "load" });
  await page.waitForTimeout(1000);
  await page.getByRole("button", { name: "Add to cart" }).first().click();
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: "Add to cart" }).nth(1).click();
  await screenshot(page, "03-cart-added");

  await beat("BEAT 4 — Open cart, check out through Hana");
  await page.getByRole("button", { name: /^Cart \(/ }).click();
  await page.waitForTimeout(500);
  await screenshot(page, "04-cart-open");
  await page.getByRole("button", { name: /pay with hana/i }).click();
  await page.waitForURL(/localhost:3001\/pay\//, { timeout: 20000 });
  await page.waitForTimeout(1500);
  await screenshot(page, "05-pay-page");

  await beat("BEAT 5 — Select a 4-installment plan and originate the real loan");
  await page.getByText("Pay in 4 installments").click();
  await page.waitForSelector("text=Payment plan started!", { timeout: 60000 });
  await page.waitForTimeout(1000);
  await screenshot(page, "06-loan-originated");

  // ---- Beat: merchant sees the bill as originated ---------------------------
  await beat("BEAT 6 — Merchant portal: the bill is now marked originated");
  const merchantPage = await browser.newPage();
  await merchantPage.goto("http://localhost:3002/bills", { waitUntil: "load" }).catch(() => {});
  await merchantPage.waitForTimeout(1500);
  await screenshot(merchantPage, "07-merchant-bills");

  // ---- Beat: fund iUSDC for a repayment (no UI faucet button exists on the
  // dashboard, so this is a direct, real, unscripted-on-screen transaction) --
  await beat("BEAT 7 — Fund iUSDC for the first repayment (off-screen faucet call)");
  try {
    const cc3ChainIdHex = `0x${cc3.id.toString(16)}`;
    const hash = await page.evaluate(
      async ({ to, data, chainId }) =>
        (window as any).__walletSendTransaction(JSON.stringify({ to, data, chainId })),
      {
        to: IUSDC.address,
        data: encodeFunctionData({ abi: IUSDC.abi as any, functionName: "faucet", args: [] }),
        chainId: cc3ChainIdHex,
      }
    );
    console.log(`  iUSDC faucet tx: ${hash}`);
    await cc3Public.waitForTransactionReceipt({ hash: hash as `0x${string}` });
  } catch (err: any) {
    console.log(`  (faucet skipped — likely already claimed today: ${err?.shortMessage ?? err?.message ?? err})`);
  }

  // ---- Beat: pay the first installment, watch the score tick up ------------
  await beat("BEAT 8 — Dashboard: pay the first installment, watch the score move");
  await page.goto("http://localhost:3001/dashboard", { waitUntil: "load" });
  await page.waitForTimeout(1500);
  await screenshot(page, "08-dashboard-before-pay");
  await page.getByRole("button", { name: "Pay" }).first().click();
  await waitForBusyToClear(page, "Paying..."); // approve (if needed) + makePayment, two real txs
  await page.waitForTimeout(1000); // let the score-delta refetch settle
  await screenshot(page, "09-dashboard-after-pay");

  // ---- Beat: the second reference application — SpaceCreditLine ------------
  await beat("BEAT 9 — Same wallet, same score, a completely different credit product: SpaceCreditLine");
  await page.goto("http://localhost:3001/credit-line", { waitUntil: "load" });
  await page.waitForTimeout(1500);
  await screenshot(page, "10-credit-line-before");

  const limit = (await cc3Public.readContract({
    address: CreditRegistry.address,
    abi: CreditRegistry.abi as any,
    functionName: "getCreditLimit",
    args: [account.address, MockSPACE.address],
  })) as bigint;
  const drawAmount = limit / 4n; // conservative draw, leaves plenty of headroom
  console.log(`  SPACE credit limit: ${formatUnits(limit, 18)} — drawing ${formatUnits(drawAmount, 18)}`);

  await beat("BEAT 10 — Open a credit line: draw SPACE, auto-staked, never custodied");
  await page.getByPlaceholder("Amount (SPACE)").fill(formatUnits(drawAmount, 18));
  await page.getByRole("button", { name: /open \/ draw/i }).click();
  await waitForBusyToClear(page, "Opening...");
  await page.waitForTimeout(1000);
  await screenshot(page, "11-credit-line-opened");

  await beat("BEAT 11 — Wait for real on-chain staking yield to accrue (live CC3 blocks)");
  await page.waitForTimeout(25000);
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(1000);
  await screenshot(page, "12-credit-line-yield-accrued");

  await beat("BEAT 12 — Claim yield & repay: the position pays itself down");
  await page.getByRole("button", { name: /claim yield & repay/i }).click();
  await waitForBusyToClear(page, "Claiming...");
  await page.waitForTimeout(1000);
  await screenshot(page, "13-credit-line-repaid");

  await beat("BEAT 13 — getCreditLimit() from an unrelated contract (cut to your terminal now)");
  console.log(
    "  Manual beat: run a cast call / hardhat console snippet against CreditRegistry.getCreditLimit\n" +
      "  directly, unrelated to this browser, to make the primitive claim visually undeniable."
  );

  console.log("\n\x1b[32m=== Autopilot run complete. Screenshots saved in demo/.captures/ ===\x1b[0m");
  console.log("Browser window left open — close it manually when you're done recording.");
}

main().catch((err) => {
  console.error("\nAutopilot failed:", err);
  process.exitCode = 1;
});
