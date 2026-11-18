/* Phase 1.1 browser regression: run after npm run site:build.
   Playwright is intentionally installed only in the CI/browser-test job. */
'use strict';
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const base = 'http://127.0.0.1:4174/';
const server = spawn(process.execPath, [
  path.join(root, 'node_modules/vite/bin/vite.js'),
  'preview',
  '--config',
  path.join(root, 'vite.site.config.mjs')
], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
server.stdout.on('data', chunk => process.stdout.write(chunk));
server.stderr.on('data', chunk => process.stderr.write(chunk));

async function awaitPreview() {
  for (let attempt = 0; attempt < 80; attempt++) {
    if (server.exitCode !== null) throw new Error('The Vite preview server exited early');
    try {
      const response = await fetch(base, { signal: AbortSignal.timeout(500) });
      if(response.ok) return;
    } catch { /* The preview server has not started yet. */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('Vite preview did not become available on port 4174');
}

(async () => {
  let browser;
  try {
    await awaitPreview();
    browser = await chromium.launch({
      headless: true,
      executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined,
      args: ['--no-sandbox', '--disable-dev-shm-usage']
    });
    const page = await browser.newPage({viewport:{width:1440,height:900}});
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if(message.type() === 'error') errors.push(message.text());
    });
    page.on('requestfailed', request => errors.push(`${request.url()}: ${request.failure()?.errorText}`));
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      return url.hostname === '127.0.0.1' ? route.continue() : route.abort();
    });

    await page.goto(base, { waitUntil: 'networkidle' });
    await page.getByRole('heading', {name:'Asteria',level:1}).waitFor();
    assert.equal(await page.getByRole('navigation',{name:'Primary navigation'}).count(),1);
    assert.equal(await page.getByRole('main').count(),1);
    assert.equal(await page.getByText('Phase 1.3 design-system preview.',{exact:false}).count(),1);
    assert.equal(await page.getByTestId('site-hero-image').locator('img').evaluate(img => img.complete && img.naturalWidth > 0),true);
    assert.equal(await page.getByTestId('site-brand').locator('img').evaluate(img => img.complete && img.naturalWidth > 0),true);
    assert.equal(await page.evaluate(() => typeof window.setView), 'undefined');

    for(const width of [320, 360, 390, 430, 768, 1024, 1440, 1920]) {
      await page.setViewportSize({width,height:900});
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      assert.equal(overflow,false,`Unexpected horizontal overflow at ${width}px`);
    }
    await page.getByRole('link',{name:'Home',exact:true}).click();
    assert.equal(await page.evaluate(() => window.location.hash),'#home');
    assert.deepEqual(errors,[],`Browser errors: ${errors.join('; ')}`);
    console.log('PASS: React app boots, images load, responsive widths are contained, Home works and no legacy globals load.');
  } finally {
    if(browser) await browser.close();
    server.kill('SIGTERM');
  }
})().catch(error => { console.error(error); process.exitCode = 1; server.kill('SIGTERM'); });
