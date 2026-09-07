import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const artifactDir = process.env.MEDIA_WORKSPACE_ARTIFACT_DIR || '/tmp/media-workspace-browser-20260905';
await mkdir(artifactDir, {recursive: true});
const browser = await chromium.launch({headless: true});
try {
  const page = await browser.newPage();
  const errors = [];
  const outgoing = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (request.url().includes('overlay.invalid')) outgoing.push(request.url()); });
  const base = 'http://127.0.0.1:1438/tests/media-workspace/browser.fixture.html';
  await page.goto(`${base}?security`);
  await page.locator('iframe[title="sandbox test"]').waitFor();
  await page.waitForTimeout(200);
  if (await page.evaluate(() => window.pwned === true || getComputedStyle(document.body).display === 'none')) throw new Error('Overlay escaped parent boundary');
  const sandbox = await page.locator('iframe[title="sandbox test"]').getAttribute('sandbox');
  if (sandbox !== '' || outgoing.length) throw new Error(`Sandbox/network failure ${JSON.stringify(outgoing)}`);
  await page.locator('.code-textarea').first().fill('<img src="https://overlay.invalid/editor" onerror="parent.pwned=true"><script>parent.pwned=true</script>');
  await page.waitForTimeout(200);
  if (await page.evaluate(() => Boolean(window.pwned)) || outgoing.length) throw new Error('Editor preview escaped boundary');
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({width, height: 900});
    await page.goto(base);
    await page.getByText('bad.ssproj', {exact: true}).first().dblclick();
    await page.getByRole('alert').filter({hasText: 'ไฟล์โปรเจกต์ไม่ถูกต้อง'}).waitFor();
    await page.screenshot({path: `${artifactDir}/workspace-${width}.png`, fullPage: true});
  }
  await page.getByRole('button', {name: /สื่อดิบ/}).click();
  await page.getByText('video.mp4', {exact: true}).first().dblclick();
  const frame = page.locator('[data-testid="media-preview-frame"]').first();
  await frame.waitFor();
  if (errors.length) throw new Error(JSON.stringify(errors));
  const canvasToolbar = page.locator('.canvas-header-bar');
  const assertFrame = async (ratio, dimensions) => {
    await canvasToolbar.getByRole('button', {name: ratio, exact: false}).first().click();
    await page.waitForFunction((expected) => {
      const label = document.querySelector('[data-testid="media-preview-frame"]')?.getAttribute('aria-label') || '';
      return label.includes(expected);
    }, `${ratio} · ${dimensions}`);
    const frameLabel = await frame.getAttribute('aria-label');
    if (frameLabel !== `กรอบพรีวิว ${ratio} · ${dimensions}`) {
      throw new Error(`Preview frame label mismatch: ${frameLabel}`);
    }
  };
  await assertFrame('9:16', '1080×1920');
  await assertFrame('16:9', '1920×1080');
  await assertFrame('1:1', '1080×1080');
  await canvasToolbar.getByRole('button', {name: 'ต้นฉบับ', exact: false}).first().click();
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="media-preview-frame"]').length === 0);
  await assertFrame('9:16', '1080×1920');
  console.log(JSON.stringify({status: 'passed', viewports: [390, 768, 1440], checks: ['scriptless overlay isolation', 'no external overlay requests', 'editor preview isolation', 'invalid project error visible', '9:16/16:9/1:1/source preview frame transitions'], screenshots: artifactDir}));
} finally {
  await browser.close();
}
