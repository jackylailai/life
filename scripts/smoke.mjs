#!/usr/bin/env node
/**
 * Visual smoke test. Catches the silent blank-page failure mode where
 * render.js or script.js throws before the page becomes visible.
 *
 * Usage:
 *   node scripts/smoke.mjs                # tests the live Pages URL
 *   node scripts/smoke.mjs http://localhost:8080
 *
 * Requires Playwright (chromium). Install first:
 *   npm install --no-save playwright@1
 *   npx playwright install chromium
 */

import { chromium } from "playwright";

const DEFAULT_URL = "https://jackylailai.github.io/life/";
const baseUrl = (process.argv[2] || DEFAULT_URL).replace(/\/$/, "");

const targets = [
  { path: "/", heroSelector: "section.hero h1.display", label: "life log home" },
];

const MIN_OPACITY = 0.9;
const MIN_HERO_LENGTH = 4;

const browser = await chromium.launch();
const failures = [];

// First-party = same origin as baseUrl. Third-party CDN flakes (Google Fonts
// CORS, ORB-blocked scripts) are logged as warnings but don't fail the test.
const baseOrigin = new URL(baseUrl).origin;
const isFirstParty = (urlStr) => {
  try { return new URL(urlStr).origin === baseOrigin; } catch { return false; }
};

for (const { path, heroSelector, label } of targets) {
  const url = `${baseUrl}${path}?smoke=${Date.now()}`;
  const context = await browser.newContext();
  const page = await context.newPage();

  const pageErrors = [];
  const firstPartyConsoleErrors = [];
  const thirdPartyConsoleErrors = [];
  const firstPartyRequestFailures = [];
  const thirdPartyRequestFailures = [];

  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const loc = msg.location();
    const bucket = !loc.url || isFirstParty(loc.url)
      ? firstPartyConsoleErrors
      : thirdPartyConsoleErrors;
    bucket.push(`${msg.text()} (${loc.url || "<inline>"})`);
  });
  page.on("pageerror", (err) => pageErrors.push(err.message));
  page.on("requestfailed", (req) => {
    const line = `${req.method()} ${req.url()} — ${req.failure()?.errorText}`;
    (isFirstParty(req.url()) ? firstPartyRequestFailures : thirdPartyRequestFailures).push(line);
  });

  await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
  await page.waitForTimeout(1500);

  const snapshot = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return { found: false };
    const cs = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return {
      found: true,
      opacity: parseFloat(cs.opacity),
      visibility: cs.visibility,
      display: cs.display,
      text: (el.innerText || "").trim(),
      width: rect.width,
      height: rect.height,
      bodyHasIsLoading: document.body.classList.contains("is-loading"),
    };
  }, heroSelector);

  const reasons = [];
  if (!snapshot.found) reasons.push("hero element not found in DOM");
  else {
    if (snapshot.opacity < MIN_OPACITY)
      reasons.push(`hero opacity ${snapshot.opacity} < ${MIN_OPACITY} (page renders blank)`);
    if (snapshot.visibility !== "visible")
      reasons.push(`hero visibility=${snapshot.visibility}`);
    if (snapshot.display === "none")
      reasons.push("hero display:none");
    if (snapshot.text.length < MIN_HERO_LENGTH)
      reasons.push(`hero text "${snapshot.text}" too short (render.js may have failed)`);
    if (snapshot.width === 0 || snapshot.height === 0)
      reasons.push(`hero has zero dimensions (${snapshot.width}x${snapshot.height})`);
    if (snapshot.bodyHasIsLoading)
      reasons.push("body still has .is-loading class — render.js did not complete");
  }
  if (pageErrors.length) reasons.push(`uncaught page errors: ${pageErrors.join(" | ")}`);
  if (firstPartyConsoleErrors.length)
    reasons.push(`first-party console errors: ${firstPartyConsoleErrors.join(" | ")}`);
  if (firstPartyRequestFailures.length)
    reasons.push(`first-party failed requests: ${firstPartyRequestFailures.join(" | ")}`);

  const ok = reasons.length === 0;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}  ${url}`);
  console.log(`  snapshot: ${JSON.stringify(snapshot)}`);
  if (thirdPartyConsoleErrors.length)
    console.log(`  warn  third-party console errors (ignored): ${thirdPartyConsoleErrors.length}`);
  if (thirdPartyRequestFailures.length)
    console.log(`  warn  third-party request failures (ignored): ${thirdPartyRequestFailures.length}`);
  if (!ok) {
    for (const reason of reasons) console.log(`  - ${reason}`);
    failures.push({ url, label, reasons, snapshot });
  }

  await context.close();
}

await browser.close();

if (failures.length) {
  console.error(`\n${failures.length} page(s) failed smoke checks.`);
  process.exit(1);
}

console.log("\nAll smoke checks passed.");
