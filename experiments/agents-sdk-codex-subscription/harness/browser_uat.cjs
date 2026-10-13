const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const SHARE_SELECTOR = '#results li, [id*="share"] li, [aria-label*="result"] li, [aria-label*="share"] li';

function shareTextToCents(value) {
  const dollars = value.match(/\$\s*([\d,]+(?:\.\d{1,2})?)/);
  if (dollars) return Math.round(Number(dollars[1].replace(/,/g, '')) * 100);
  const cents = value.match(/\b(\d+)\s*(?:¢|cents?)\b/i);
  if (cents) return Number(cents[1]);
  const amount = value.match(/(-?\d+(?:\.\d{1,2})?)\s*$/);
  return amount ? Math.round(Number(amount[1]) * 100) : NaN;
}

async function main() {
  const receiptPath = process.env.BROWSER_UAT_RECEIPT;
  const pageUrl = process.env.MINIAPP_URL;
  if (!receiptPath || !pageUrl) throw new Error('BROWSER_UAT_RECEIPT and MINIAPP_URL are required');
  const moduleDir = process.env.PLAYWRIGHT_MODULE_DIR;
  const playwright = moduleDir
    ? require(path.join(moduleDir, 'playwright'))
    : require('playwright');
  const { chromium } = playwright;
  const receipt = {
    schema: 'agents-sdk-miniapp-browser-uat.v1',
    result: 'FAIL',
    url: pageUrl,
    interactions: [],
    pageErrors: [],
    consoleErrors: [],
    blockedExternalRequests: [],
    screenshot: null,
  };
  let browser;
  let context;
  let page;
  try {
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext();
    const runId = process.env.BROWSER_UAT_ID || crypto.randomUUID();
    receipt.operationId = runId;
    const tracePath = path.join(path.dirname(receiptPath), `browser-uat-${runId}-trace.zip`);
    await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
    page = await context.newPage();
    page.setDefaultTimeout(5000);
    const allowedOrigin = new URL(pageUrl).origin;
    await page.route('**/*', route => {
      const requestUrl = new URL(route.request().url());
      if (requestUrl.origin === allowedOrigin) return route.continue();
      receipt.blockedExternalRequests.push(requestUrl.href);
      return route.abort();
    });
    page.on('pageerror', error => receipt.pageErrors.push(String(error)));
    page.on('console', message => {
      if (message.type() === 'error') receipt.consoleErrors.push(message.text());
    });
    await page.goto(pageUrl, { waitUntil: 'networkidle', timeout: 15000 });
    await page.getByLabel('Bill total in dollars').fill('10.01');
    await page.getByLabel('Number of people').fill('3');
    await page.locator('#split-form button[type="submit"]').click();
    const shareLabels = await page.locator(SHARE_SELECTOR).allTextContents();
    const shares = shareLabels.map(shareTextToCents);
    if (shares.length !== 3 || shares.reduce((sum, cents) => sum + cents, 0) !== 1001) {
      throw new Error(`Expected three shares totaling 1001 cents, got ${JSON.stringify(shares)}`);
    }
    receipt.interactions.push({ action: 'calculate', shares, reconciledTotalCents: 1001 });
    await page.getByRole('button', { name: 'Reset' }).click();
    if (await page.locator('#results').isVisible()) throw new Error('Reset left results visible');
    receipt.interactions.push({ action: 'reset', resultsHidden: true });
    await page.getByLabel('Bill total in dollars').fill('0.001');
    await page.getByLabel('Number of people').fill('3');
    await page.locator('#split-form button[type="submit"]').click();
    const customValidation = page.locator('[role="alert"]:visible').first();
    const customValidationVisible = await customValidation.isVisible().catch(() => false);
    const customMessage = customValidationVisible ? await customValidation.innerText() : '';
    const invalidAmountShares = await page.locator(SHARE_SELECTOR).count();
    if (!customValidationVisible || invalidAmountShares !== 0) {
      throw new Error(`Sub-cent amount was not rejected with an accessible error (alert=${customValidationVisible}, shares=${invalidAmountShares})`);
    }
    receipt.interactions.push({
      action: 'invalid_subcent_amount',
      validation: 'application',
      errorVisible: Boolean(customMessage),
    });
    const screenshotPath = path.join(path.dirname(receiptPath), `browser-uat-${runId}-screenshot.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    receipt.screenshot = screenshotPath;
    receipt.screenshotBytes = fs.statSync(screenshotPath).size;
    const appRoot = process.env.MINIAPP_WORKSPACE || '';
    const sourceFiles = fs.readdirSync(appRoot).filter(file =>
      ['.html', '.mjs', '.js', '.css'].includes(path.extname(file))
    ).sort();
    const sourceManifest = sourceFiles.map(file => [
      file,
      crypto.createHash('sha256').update(fs.readFileSync(path.join(appRoot, file))).digest('hex'),
    ]);
    receipt.sourceSha256 = crypto.createHash('sha256').update(JSON.stringify(sourceManifest)).digest('hex');
    receipt.sourceFiles = sourceFiles;
    receipt.trace = tracePath;
    receipt.result = 'PASS';
  } catch (error) {
    receipt.failure = String(error && error.stack ? error.stack : error);
    if (page) {
      const runId = process.env.BROWSER_UAT_ID || 'unknown';
      const screenshotPath = path.join(path.dirname(receiptPath), `browser-uat-${runId}-failure.png`);
      try {
        await page.screenshot({ path: screenshotPath, fullPage: true });
        receipt.failureScreenshot = screenshotPath;
      } catch { /* preserve the original browser failure */ }
    }
  } finally {
    if (context) {
      try {
        const runId = process.env.BROWSER_UAT_ID || 'unknown';
        await context.tracing.stop({ path: path.join(path.dirname(receiptPath), `browser-uat-${runId}-trace.zip`) });
      } catch { /* trace evidence may be absent when Chromium failed to start */ }
    }
    if (browser) await browser.close();
  }
  const unexpectedConsoleErrors = receipt.consoleErrors.filter(message =>
    !(message.includes('net::ERR_FAILED') && receipt.blockedExternalRequests.length > 0)
  );
  receipt.unexpectedConsoleErrors = unexpectedConsoleErrors;
  if (receipt.blockedExternalRequests.length) {
    receipt.result = 'FAIL';
    receipt.networkPolicyFailure = 'The isolated Mini App requested non-loopback resources.';
  }
  if (receipt.result !== 'PASS' || receipt.pageErrors.length || unexpectedConsoleErrors.length) process.exitCode = 1;
  fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
  const tempReceipt = `${receiptPath}.tmp`;
  const fd = fs.openSync(tempReceipt, 'w');
  try {
    fs.writeFileSync(fd, JSON.stringify(receipt, null, 2) + '\n');
    fs.fsyncSync(fd);
  } finally { fs.closeSync(fd); }
  fs.renameSync(tempReceipt, receiptPath);
  process.stdout.write(JSON.stringify(receipt) + '\n');
}

main().catch(error => {
  process.stderr.write(String(error && error.stack ? error.stack : error) + '\n');
  process.exitCode = 1;
});
