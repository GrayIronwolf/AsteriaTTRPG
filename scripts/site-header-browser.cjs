/* Phase 2.1: verify the actual React header and artwork in Chromium.
 * Only the standalone Vite preview is served; no production deployment.
 */
'use strict';
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const base = 'http://127.0.0.1:4174/';
const evidence = path.join(process.env.RUNNER_TEMP || root, 'asteria-phase-2-1-evidence');
const server = spawn(process.execPath, [
  path.join(root, 'node_modules/vite/bin/vite.js'),
  'preview', '--config', path.join(root, 'vite.site.config.mjs')
], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
server.stdout.on('data', data => process.stdout.write(data));
server.stderr.on('data', data => process.stderr.write(data));

async function awaitServer() {
  for (let i = 0; i < 80; i++) {
    if (server.exitCode !== null) throw new Error('Vite preview server exited unexpectedly');
    try {
      const response = await fetch(base, { signal: AbortSignal.timeout(500) });
      if (response.ok) return;
    } catch { /* booting */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('Vite preview not available');
}

(async () => {
  let browser;
  try {
    fs.mkdirSync(evidence, { recursive: true });
    await awaitServer();
    browser = await chromium.launch({
      headless: true,
      executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined,
      args: ['--no-sandbox', '--disable-dev-shm-usage']
    });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [], blocked = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('requestfailed', request => {
      const reason = request.failure()?.errorText || '';
      if (reason !== 'net::ERR_ABORTED') errors.push(request.url() + ': ' + reason);
    });
    await page.route('**/*', route => {
      const address = new URL(route.request().url());
      if (address.hostname === '127.0.0.1') return route.continue();
      blocked.push(address.origin);
      return route.abort();
    });

    await page.goto(base, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Asteria', level: 1 }).waitFor();
    const header = page.getByTestId('site-header');
    const brand = page.getByTestId('site-brand');
    const brandSvg = brand.locator('svg');
    assert.equal(await brandSvg.count(), 1);
    assert.equal(await brandSvg.locator('image').count(), 2,
      'Wordmark and recoloured star mask must share the same official PNG');
    assert.equal(await brandSvg.locator('clipPath path').count(), 4,
      'The two A stars and two line stars should remain clipped');
    const asset = await brandSvg.locator('image').first().getAttribute('href');
    assert.ok(asset, 'SVG brand does not reference the actual wordmark');
    const response = await page.request.get(new URL(asset, base).href);
    assert.equal(response.status(), 200, 'The official logo asset did not load');

    const headerBackground = await header.evaluate(node => getComputedStyle(node).backgroundColor);
    assert.equal(headerBackground, 'rgb(22, 40, 57)',
      'The header must use the approved solid blue-gray colour');
    const flood = brandSvg.locator('feFlood');
    assert.equal(await flood.count(), 1);
    const animation = await flood.evaluate(el => getComputedStyle(el).animationName);
    assert.match(animation, /starColourCycle/, 'The logo's star colouring animation is missing');
    assert.equal(await page.getByTestId('site-header-profile').count(), 0,
      'The guest preview must not falsely show an authenticated profile');
    assert.equal(await page.getByTestId('site-header-login').count(), 1);
    console.log('PASS: original wordmark, four star windows, animated colours, solid header and guest account.');

    const widths = [320, 360, 390, 430, 768, 1024, 1150, 1279, 1280, 1440, 1920];
    const report = [];
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(base, { waitUntil: 'networkidle' });
      await page.getByRole('heading', { name: 'Asteria', level: 1 }).waitFor();
      const metrics = await page.evaluate(() => {
        const rect = el => el.getBoundingClientRect();
        const root = document.documentElement;
        const header = document.querySelector('[data-testid="site-header"]');
        const logo = document.querySelector('[data-testid="site-brand"]');
        const desktop = document.querySelector('[data-testid="site-primary-navigation"]');
        const links = Array.from(desktop.querySelectorAll('a'));
        const account = document.querySelector('[data-testid="site-header-account-controls"]');
        const login = document.querySelector('[data-testid="site-header-login"]');
        const menu = document.querySelector('[data-testid="site-mobile-menu"]');
        const visible = el => getComputedStyle(el).display !== 'none';
        return {
          viewport: innerWidth,
          documentWidth: root.scrollWidth,
          headerHeight: Math.round(rect(header).height),
          logoWidth: Math.round(rect(logo).width),
          logoInsideHeader: rect(logo).top >= rect(header).top - 1 &&
            rect(logo).bottom <= rect(header).bottom + 1,
          loginHeight: Math.round(rect(login).height),
          navigationVisible: visible(desktop),
          menuVisible: visible(menu),
          activeCount: links.filter(el => el.getAttribute('aria-current') === 'page').length,
          linksOnSingleRow: new Set(links.map(el => Math.round(rect(el).top))).size === 1,
          logoClear: !links.length || rect(logo).right <= rect(links[0]).left + 1,
          accountClear: !links.length || rect(links[links.length - 1]).right <= rect(account).left + 1,
          linksInsideViewport: links.every(el => rect(el).right <= innerWidth + 1),
          accountInsideViewport: rect(account).right <= innerWidth + 1,
          menuInsideViewport: rect(menu).right <= innerWidth + 1
        };
      });
      assert.ok(metrics.documentWidth <= width, 'Horizontal overflow at ' + width + ': ' + JSON.stringify(metrics));
      assert.ok(metrics.logoWidth >= (width <= 380 ? 115 : 150), 'Logo has become too small at ' + width);
      assert.equal(metrics.logoInsideHeader, true, 'Logo clipped by header at ' + width);
      assert.ok(metrics.loginHeight >= 44, 'Guest Login tap target is undersized at ' + width);
      assert.equal(metrics.accountInsideViewport, true, 'Account area clipped at ' + width);
      assert.equal(metrics.menuInsideViewport, true, 'Menu control clipped at ' + width);
      if (width <= 1279) {
        assert.equal(metrics.navigationVisible, false, 'Desktop navigation still visible at ' + width);
        assert.equal(metrics.menuVisible, true, 'Compact menu missing at ' + width);
      } else {
        assert.equal(metrics.navigationVisible, true, 'Desktop navigation hidden at ' + width);
        assert.equal(metrics.menuVisible, false, 'Mobile menu shown on desktop at ' + width);
        assert.equal(metrics.activeCount, 1, 'One active desktop route is required');
        assert.equal(metrics.linksOnSingleRow, true, 'Header links wrapped at ' + width);
        assert.equal(metrics.logoClear, true, 'Logo overlaps navigation at ' + width);
        assert.equal(metrics.accountClear, true, 'Navigation overlaps the login/profile area at ' + width);
        assert.equal(metrics.linksInsideViewport, true, 'Header menu clipped at ' + width);
      }
      report.push(metrics);
      if (width === 390) {
        await page.screenshot({ path: path.join(evidence, 'phase2-1-mobile-header-390.png'), animations: 'disabled' });
        await page.getByTestId('site-mobile-menu').locator('summary').click();
        await page.getByRole('navigation', { name: 'Mobile navigation' })
          .getByRole('link', { name: 'Asteria Compendium' }).click();
        await page.getByRole('heading', { name: 'Asteria Compendium', level: 1 }).waitFor();
        assert.equal(await page.getByTestId('site-mobile-menu').evaluate(el => el.open), false);
      }
      if (width === 1280 || width === 1440) {
        await page.screenshot({
          path: path.join(evidence, 'phase2-1-desktop-header-' + width + '.png'),
          animations: 'disabled'
        });
      }
    }
    console.log('PASS: 11 viewport sizes preserve logo, account controls and non-overlapping navigation.');

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.getByRole('link', { name: 'Login', exact: true }).click();
    await page.getByRole('heading', { name: 'Login', exact: true, level: 1 }).waitFor();
    assert.equal(await page.evaluate(() => location.hash), '#/account/login');
    await brand.click();
    await page.getByRole('heading', { name: 'Asteria', level: 1 }).waitFor();
    assert.equal(await page.evaluate(() => location.hash), '#home',
      'Logo link must return to Home after deliberate navigation');

    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal(await flood.evaluate(el => getComputedStyle(el).animationName), 'none',
      'Logo colour animation must stop when reduced motion is requested');
    assert.deepEqual(blocked, [], 'Preview loaded resources outside its own host');
    assert.deepEqual(errors, [], 'Browser console/network errors: ' + errors.join('; '));

    fs.writeFileSync(path.join(evidence, 'phase2-1-header-layout.json'),
      JSON.stringify({
        phase: '2.1', context: 'Offline preview / not live production',
        guestOnly: true, authenticatedProfileVisualParity: 'deferred to Account migration',
        verified: report,
        starsReducedMotion: true, originalLogoAssetLoaded: true
      }, null, 2) + '\n');
    console.log('PASS: Home, login, reduced motion and evidence screenshots.');
  } finally {
    if (browser) await browser.close();
    server.kill('SIGTERM');
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
  server.kill('SIGTERM');
});
