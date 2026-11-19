/* Phase 1.2: real Chromium browser history, route + responsive navigation.
 * Run only on the isolated React/Vite preview; never on production hosting. */
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

server.stdout.on('data', data => process.stdout.write(data));
server.stderr.on('data', data => process.stderr.write(data));

async function awaitPreview() {
  for (let attempt = 0; attempt < 80; attempt++) {
    if (server.exitCode !== null) throw new Error('Vite preview exited before tests');
    try {
      const response = await fetch(base, { signal: AbortSignal.timeout(500) });
      if (response.ok) return;
    } catch { /* still starting */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('Vite preview unavailable at port 4174');
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
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', e => { if (e.type() === 'error') errors.push(e.text()); });
    page.on('requestfailed', req => {
      // A page.goto/reload intentionally cancels in-flight assets. Treat only
      // genuine network failures as regressions; ERR_ABORTED is not a 404.
      const reason = req.failure()?.errorText || '';
      if (reason !== 'net::ERR_ABORTED') errors.push(req.url() + ': ' + reason);
    });
    await page.route('**/*', r => new URL(r.request().url()).hostname === '127.0.0.1'
      ? r.continue() : r.abort());

    async function heading(name) {
      await page.getByRole('heading', { level: 1, name, exact: true }).waitFor();
    }
    const nav = () => page.getByRole('navigation', { name: 'Primary navigation' });

    await page.goto(base, { waitUntil: 'networkidle' });
    await heading('Asteria');
    assert.equal(await page.locator('main h1').count(), 1);
    assert.equal(await nav().getByRole('link').count(), 8);
    assert.equal(await nav().locator('[aria-current="page"]').count(), 1);

    for (const [label, title, hash] of [
      ['Asteria Handbook', 'Asteria Handbook', '#/compendium?group=rules&category=handbook'],
      ['Worlds & Lore', 'Worlds & Lore', '#/compendium?group=world'],
      ['Asteria Compendium', 'Asteria Compendium', '#/compendium'],
      ['Character Forge', 'Character Forge', '#/character-forge'],
      ['Campaign Forge', 'Campaign Forge', '#/campaign-forge'],
      ['Friends', 'Friends', '#/account/friends'],
      ['Account', 'Account', '#/account']
    ]) {
      await nav().getByRole('link', { name: label, exact: true }).click();
      await page.getByTestId('site-mega-browse').click();
      await heading(title);
      assert.equal(await page.evaluate(() => window.location.hash), hash, label);
      assert.equal(await nav().locator('[aria-current="page"]').count(), 1, label);
    }
    console.log('PASS: every header destination navigates away from Home with one active route.');

    await page.goBack();
    await heading('Friends');
    await page.goForward();
    await heading('Account');
    await page.reload({ waitUntil: 'networkidle' });
    await heading('Account');
    assert.equal(await page.evaluate(() => window.location.hash), '#/account');
    console.log('PASS: browser back, forward and refresh preserve route state.');

    const direct = [
      ['#/compendium/race/cavern-sprite?tab=Racial+Sheet', 'Definition unavailable'],
      ['#/join/123456789012', 'Campaign Invitation'],
      ['#/react/gm/sample-campaign', 'GM Dashboard'],
      ['#/react/character/sample-campaign/sample-character', 'Character Dashboard'],
      ['#/react/owned-character/sample-character', 'Character Dashboard'],
      ['#/react/presentation/sample-campaign', 'Player Presentation'],
      ['#/not-a-real-page', 'Page Not Found']
    ];
    for (const [hash, title] of direct) {
      await page.goto(base + hash, { waitUntil: 'networkidle' });
      if (hash.startsWith('#/compendium/')) {
        await page.getByTestId('site-compendium-entry-page').waitFor();
        await page.locator('main h1').first().waitFor();
      } else {
        await heading(title);
      }
      assert.equal(await page.evaluate(() => window.location.hash), hash, title);
    }
    await page.goto(base + '#secure-campaign-invite=sensitive-token', { waitUntil: 'networkidle' });
    await heading('Campaign Invitation');
    assert.equal((await page.locator('body').innerText()).includes('sensitive-token'), false);
    await page.goto(base + '?invite=sensitive-token', { waitUntil: 'networkidle' });
    await heading('Campaign Invitation');
    console.log('PASS: legacy Compendium, invitation, dashboard and unknown deep links are stable.');

    await page.goto(base, { waitUntil: 'networkidle' });
    await page.keyboard.press('Tab');
    await page.getByRole('link', { name: 'Skip to main content' }).focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'site-main');
    assert.equal(await page.evaluate(() => window.location.hash), '');

    for (const width of [320, 360, 390, 430, 768, 1024, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(base, { waitUntil: 'networkidle' });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      assert.equal(overflow, false, 'Horizontal overflow at ' + width);
      if (width <= 1279) {
        await page.getByTestId('site-mobile-menu').locator('summary').click();
        const mobileNav = page.getByRole('navigation', { name: 'Mobile navigation' });
        await mobileNav.getByRole('link', { name: 'Friends', exact: true }).click();
        await page.getByTestId('site-mega-browse').click();
        await heading('Friends');
        assert.equal(await page.getByTestId('site-mobile-menu').evaluate(el => el.open), false);
        await page.getByRole('link', { name: 'Return to Home' }).click();
        await heading('Asteria');
      } else {
        assert.equal(await page.getByTestId('site-brand').isVisible(), true);
        const row = await page.evaluate(() => {
          const links = Array.from(document.querySelectorAll('[data-testid="site-primary-navigation"] a'));
          const tops = links.map(link => Math.round(link.getBoundingClientRect().top));
          return { uniqueTops: new Set(tops).size, overflow: links.some(link => link.getBoundingClientRect().right > innerWidth) };
        });
        assert.equal(row.uniqueTops, 1, 'Desktop header wrapped at ' + width);
        assert.equal(row.overflow, false, 'Desktop link clipped at ' + width);
      }
    }
    assert.deepEqual(errors, [], 'Browser errors: ' + errors.join('; '));
    console.log('PASS: mobile menus, keyboard skip link, single-row desktop header and all widths.');
  } finally {
    if (browser) await browser.close();
    server.kill('SIGTERM');
  }
})().catch(error => { console.error(error); process.exitCode = 1; server.kill('SIGTERM'); });
