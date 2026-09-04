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
  await page.getByText('video.mp4', {exact: true}).first().dblclick();
  await page.getByRole('note').filter({hasText: 'Render ด้านล่าง'}).waitFor();
  if (errors.length) throw new Error(JSON.stringify(errors));
  console.log(JSON.stringify({status: 'passed', viewports: [390, 768, 1440], checks: ['scriptless overlay isolation', 'no external overlay requests', 'editor preview isolation', 'invalid project error visible'], screenshots: artifactDir}));
} finally {
  await browser.close();
}
