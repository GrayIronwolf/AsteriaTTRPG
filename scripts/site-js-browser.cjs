/* Phase 1.4: verify one browser navigation owner and fail-closed services.
 * Runs against the isolated Vite preview, not the production Asteria website. */
'use strict';
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const base = 'http://127.0.0.1:4174/';
const server = spawn(process.execPath, [
  path.join(root, 'node_modules/vite/bin/vite.js'), 'preview',
  '--config', path.join(root, 'vite.site.config.mjs')
], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
server.stdout.on('data', b => process.stdout.write(b));
server.stderr.on('data', b => process.stderr.write(b));

async function awaitPreview() {
  for (let i = 0; i < 80; i++) {
    if (server.exitCode !== null) throw new Error('Vite preview ended unexpectedly');
    try {
      const response = await fetch(base, { signal: AbortSignal.timeout(500) });
      if (response.ok) return;
    } catch { /* preview startup */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('Vite preview unavailable');
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
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [], prohibited = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('requestfailed', req => {
      const reason = req.failure()?.errorText || '';
      if (reason !== 'net::ERR_ABORTED') errors.push(req.url() + ': ' + reason);
    });
    page.on('request', req => {
      if (/js\/app\.js|\/react-dist\/|firestore\.googleapis\.com|firebase.*\.googleapis\.com/i.test(req.url())) {
        prohibited.push(req.url());
      }
    });
    await page.route('**/*', route => {
      const address = new URL(route.request().url());
      return address.hostname === '127.0.0.1' ? route.continue() : route.abort();
    });

    // Instrument only the browser global subscription pair. This is test-only;
    // the actual React app does not publish window globals.
    await page.addInitScript(() => {
      const active = { hashchange: new Set(), popstate: new Set() };
      const additions = { hashchange: 0, popstate: 0 };
      const removals = { hashchange: 0, popstate: 0 };
      const add = window.addEventListener;
      const remove = window.removeEventListener;
      window.addEventListener = function(type, listener, options) {
        if (Object.hasOwn(active, type)) {
          active[type].add(listener);
          additions[type] += 1;
        }
        return add.call(this, type, listener, options);
      };
      window.removeEventListener = function(type, listener, options) {
        if (Object.hasOwn(active, type)) {
          active[type].delete(listener);
          removals[type] += 1;
        }
        return remove.call(this, type, listener, options);
      };
      window.__routingTestListeners = () => ({
        hashchange: active.hashchange.size,
        popstate: active.popstate.size,
        additions: { ...additions },
        removals: { ...removals }
      });
    });

    await page.goto(base, { waitUntil: 'networkidle' });
    const heading = name => page.getByRole('heading', { name, level: 1, exact: true });
    const nav = () => page.getByRole('navigation', { name: 'Primary navigation' });
    await heading('Asteria').waitFor();

    let counts = await page.evaluate(() => window.__routingTestListeners());
    assert.equal(counts.hashchange, 1, 'One hashchange listener after StrictMode mount');
    assert.equal(counts.popstate, 1, 'One popstate listener after StrictMode mount');
    assert.ok(counts.additions.hashchange >= 1);
    assert.ok(counts.removals.hashchange <= counts.additions.hashchange);
    assert.equal(await page.evaluate(() => typeof window.setView), 'undefined');
    assert.equal(await page.evaluate(() => typeof window.AsteriaFirebase), 'undefined');
    assert.equal(await page.evaluate(() => typeof window.AsteriaState), 'undefined');
    console.log('PASS: a single browser route subscriber and no legacy global state.');

    for (let cycle = 0; cycle < 4; cycle++) {
      await nav().getByRole('link', { name: 'Character Forge', exact: true }).click();
      await heading('Character Forge').waitFor();
      await nav().getByRole('link', { name: 'Friends', exact: true }).click();
      await heading('Friends').waitFor();
      await nav().getByRole('link', { name: 'Home', exact: true }).click();
      await heading('Asteria').waitFor();
      counts = await page.evaluate(() => window.__routingTestListeners());
      assert.equal(counts.hashchange, 1, 'Hash listener duplication after navigation cycle ' + cycle);
      assert.equal(counts.popstate, 1, 'History listener duplication after navigation cycle ' + cycle);
      assert.equal(await page.locator('main').count(), 1);
    }

    await page.goBack();
    await heading('Friends').waitFor();
    await page.goForward();
    await heading('Asteria').waitFor();
    await page.goto(base + '#/react/gm/private-campaign-id', { waitUntil: 'networkidle' });
    await heading('GM Dashboard').waitFor();
    const content = await page.locator('main').innerText();
    assert.equal(content.includes('private-campaign-id'), false, 'Private route identifier displayed');
    assert.match(content, /permissions must be verified/);
    assert.equal(await page.locator('main input, main form').count(), 0);
    await page.goto(base + '#/account/login', { waitUntil: 'networkidle' });
    await heading('Login').waitFor();
    assert.equal(await page.locator('main input, main form').count(), 0,
      'The placeholder must not collect credentials before auth migration');
    await page.goto(base + '#/compendium?group=rules&category=handbook', { waitUntil: 'networkidle' });
    await heading('Asteria Handbook').waitFor();
    await page.reload({ waitUntil: 'networkidle' });
    await heading('Asteria Handbook').waitFor();

    counts = await page.evaluate(() => window.__routingTestListeners());
    assert.equal(counts.hashchange, 1);
    assert.equal(counts.popstate, 1);
    assert.deepEqual(prohibited, [], 'Legacy/backend network requests unexpectedly started');
    assert.deepEqual(errors, [], 'Browser runtime errors: ' + errors.join('; '));
    console.log('PASS: navigation cycles, history, bookmark refresh and protected route placeholders.');
  } finally {
    if (browser) await browser.close();
    server.kill('SIGTERM');
  }
})().catch(error => { console.error(error); process.exitCode = 1; server.kill('SIGTERM'); });
