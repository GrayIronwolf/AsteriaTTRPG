/* Phase 2.2: real mouse, keyboard, search, mobile and routing regression. */
'use strict';
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const evidence = path.join(process.env.RUNNER_TEMP || root, 'asteria-phase-2-2-evidence');
const base = 'http://127.0.0.1:4174/';
const server = spawn(process.execPath, [
  path.join(root, 'node_modules/vite/bin/vite.js'), 'preview',
  '--config', path.join(root, 'vite.site.config.mjs')
], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
server.stdout.on('data', x => process.stdout.write(x));
server.stderr.on('data', x => process.stderr.write(x));

async function ready() {
  for (let i = 0; i < 80; i++) {
    if (server.exitCode !== null) throw Error('Preview server unexpectedly exited');
    try {
      const response = await fetch(base, { signal: AbortSignal.timeout(500) });
      if (response.ok) return;
    } catch { /* booting */ }
    await new Promise(done => setTimeout(done, 250));
  }
  throw Error('Preview server never started');
}

(async () => {
  let browser;
  const report = { phase: '2.2', environment: 'isolated React/Vite preview',
    productionCutover: false, menuCounts: {}, viewports: [], screenshots: [] };
  try {
    fs.mkdirSync(evidence, { recursive: true });
    await ready();
    browser = await chromium.launch({
      headless: true,
      executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined,
      args: ['--no-sandbox', '--disable-dev-shm-usage']
    });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === '127.0.0.1') return route.continue();
      return route.abort();
    });
    await page.goto(base, { waitUntil: 'networkidle' });
    const nav = page.getByRole('navigation', { name: 'Primary navigation' });
    const trigger = name => nav.getByRole('link', { name, exact: true });
    const panel = page.getByTestId('site-mega-menu');

    const menuData = [
      ['Asteria Handbook', 6], ['Worlds & Lore', 8],
      ['Asteria Compendium', 10], ['Character Forge', 2],
      ['Campaign Forge', 3], ['Friends', 2], ['Account', 4]
    ];
    for (const [name, expected] of menuData) {
      await trigger(name).click();
      await panel.waitFor({ state: 'visible' });
      assert.equal(await panel.getByRole('heading', { name, exact: true }).count(), 1);
      assert.equal(await page.getByTestId('site-mega-cards').getByRole('link').count(), expected, name);
      assert.equal(await trigger(name).getAttribute('aria-expanded'), 'true');
      assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden');
      report.menuCounts[name] = expected;
      await page.keyboard.press('Escape');
      await panel.waitFor({ state: 'detached' });
      assert.equal(await trigger(name).getAttribute('aria-expanded'), 'false');
      assert.equal(await page.evaluate(() => document.body.style.overflow), '');
      assert.equal(await trigger(name).evaluate(el => document.activeElement === el), true);
    }
    console.log('PASS: seven groups and all 35 cards, Escape, focus restoration and scroll cleanup.');

    await trigger('Asteria Compendium').click();
    await page.getByTestId('site-mega-search').fill('  construction  ');
    assert.equal(await page.getByTestId('site-mega-cards').getByRole('link').count(), 1);
    await page.getByTestId('site-menu-card-blueprints').click();
    await page.getByRole('heading', { name: 'Asteria Compendium', level: 1 }).waitFor();
    assert.equal(await page.evaluate(() => location.hash), '#/compendium?group=crafting&category=blueprints');
    assert.equal(await panel.count(), 0);
    await page.goBack();
    await page.getByRole('heading', { name: 'Asteria', level: 1 }).waitFor();
    await trigger('Asteria Compendium').click();
    assert.equal(await page.getByTestId('site-mega-search').inputValue(), '');
    await page.getByTestId('site-mega-search').fill('this-is-not-a-section');
    await panel.getByRole('status').waitFor();
    await page.getByRole('button', { name: 'Close navigation menu' }).click({ position: { x: 5, y: 5 } });
    assert.equal(await panel.count(), 0);
    console.log('PASS: searchable cards, filtered deep-link routing and backdrop dismissal.');

    await trigger('Campaign Forge').click();
    const forge = page.getByTestId('site-menu-card-forge-campaign');
    assert.equal(await forge.locator('img').count(), 1, 'Approved campaign book artwork absent');
    await forge.locator('img').scrollIntoViewIfNeeded();
    assert.equal(await forge.locator('img').evaluate(img => img.decode().then(() => img.naturalWidth > 0)), true);
    await forge.click();
    await page.getByRole('heading', { name: 'Campaign Forge', level: 1 }).waitFor();
    assert.equal(await page.evaluate(() => location.hash), '#/campaign-forge?mode=create');
    assert.equal(await page.locator('main form, main input').count(), 0,
      'Unmigrated campaign creation must not collect user data');

    const widths = [320, 360, 390, 430, 768, 1024, 1279, 1280, 1440, 1920];
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(base, { waitUntil: 'networkidle' });
      const isMobile = width <= 1279;
      if (isMobile) {
        await page.getByTestId('site-mobile-menu').locator('summary').click();
        await page.getByRole('navigation', { name: 'Mobile navigation' })
          .getByRole('link', { name: 'Worlds & Lore', exact: true }).click();
      } else {
        await trigger('Worlds & Lore').click();
      }
      await panel.waitFor({ state: 'visible' });
      const metrics = await panel.evaluate(el => {
        const rect = el.getBoundingClientRect();
        const cards = [...el.querySelectorAll('[data-testid^="site-menu-card-"]')];
        return {
          viewport: innerWidth,
          overflow: document.documentElement.scrollWidth > innerWidth,
          panelRight: rect.right,
          panelLeft: rect.left,
          cardMaxWidth: Math.max(...cards.map(card => card.getBoundingClientRect().width)),
          cardMinHeight: Math.min(...cards.map(card => card.getBoundingClientRect().height)),
          cardCount: cards.length
        };
      });
      assert.equal(metrics.overflow, false, 'Horizontal overflow at ' + width);
      assert.ok(metrics.panelLeft >= -1 && metrics.panelRight <= width + 1,
        'The menu panel clips past viewport at ' + width);
      assert.ok(metrics.cardMaxWidth <= 140, 'Cards too wide at ' + width);
      assert.ok(metrics.cardMinHeight >= 198, 'Cards too short at ' + width);
      assert.equal(metrics.cardCount, 8);
      report.viewports.push(metrics);
      if (width === 390 || width === 1440) {
        const filename = 'phase2-2-' + width + '-menu.png';
        await page.screenshot({ path: path.join(evidence, filename), animations: 'disabled' });
        report.screenshots.push(filename);
      }
      if (isMobile) {
        assert.equal(await page.getByTestId('site-mobile-menu').evaluate(el => el.open), false);
      }
      await page.getByTestId('site-mega-browse').click();
      await page.getByRole('heading', { name: 'Worlds & Lore', level: 1 }).waitFor();
    }
    console.log('PASS: 10 desktop and mobile widths, narrow tall cards, no overlap/overflow.');

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(base, { waitUntil: 'networkidle' });
    await trigger('Asteria Handbook').focus();
    await page.keyboard.press('Space');
    await panel.waitFor({ state: 'visible' });
    assert.equal(await page.getByTestId('site-mega-search').evaluate(el => document.activeElement === el), true);
    await page.keyboard.press('Shift+Tab');
    assert.equal(await page.getByRole('link', { name: 'Campaigns', exact: true }).evaluate(
      el => document.activeElement === el), true);
    await page.keyboard.press('Escape');
    await panel.waitFor({ state: 'detached' });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await trigger('Asteria Handbook').click();
    const motion = await page.getByTestId('site-menu-card-rules').evaluate(el => getComputedStyle(el).transitionDuration);
    assert.ok(['0s', '0.00001s', '1e-05s'].includes(motion), 'Reduced-motion styles not applied');
    await page.keyboard.press('Escape');
    assert.deepEqual(errors, [], 'JavaScript/browser errors: ' + errors.join('; '));

    fs.writeFileSync(path.join(evidence, 'phase2-2-mega-menu-report.json'), JSON.stringify({
      ...report, result: 'passed', authenticatedFeatureParity: 'deferred',
      fullCompendiumContent: 'deferred to later migration'
    }, null, 2) + '\n');
    console.log('PASS: keyboard menu activation, focus trap and reduced motion.');
  } finally {
    if (browser) await browser.close();
    server.kill('SIGTERM');
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
  server.kill('SIGTERM');
});
