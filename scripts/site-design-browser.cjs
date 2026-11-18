/* Phase 1.3: computed CSS verification on the standalone Vite preview.
 * This tests actual responsive layout and theme tokens, not just class names. */
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
server.stdout.on('data', chunk => process.stdout.write(chunk));
server.stderr.on('data', chunk => process.stderr.write(chunk));

async function awaitPreview() {
  for (let attempt = 0; attempt < 80; attempt++) {
    if (server.exitCode !== null) throw new Error('The preview exited before testing');
    try {
      const response = await fetch(base, { signal: AbortSignal.timeout(500) });
      if (response.ok) return;
    } catch { /* preview is starting */ }
    await new Promise(done => setTimeout(done, 250));
  }
  throw new Error('The Vite preview did not start on 4174');
}

(async () => {
  let browser;
  try {
    await awaitPreview();
    browser = await chromium.launch({
      headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined,
      args: ['--no-sandbox', '--disable-dev-shm-usage']
    });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('requestfailed', request => {
      const reason = request.failure()?.errorText || '';
      if (reason !== 'net::ERR_ABORTED') errors.push(request.url() + ': ' + reason);
    });
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1'
      ? route.continue() : route.abort());

    await page.goto(base, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Asteria', level: 1 }).waitFor();
    const palette = await page.evaluate(() => {
      const rootStyles = getComputedStyle(document.documentElement);
      return {
        headerToken: rootStyles.getPropertyValue('--ast-color-header').trim(),
        panelToken: rootStyles.getPropertyValue('--ast-color-panel').trim(),
        pageToken: rootStyles.getPropertyValue('--ast-color-page').trim(),
        bg: getComputedStyle(document.body).backgroundColor,
        header: getComputedStyle(document.querySelector('header')).backgroundColor,
        stylesheetUrls: Array.from(document.querySelectorAll('link[rel="stylesheet"]'), el => el.href)
      };
    });
    assert.equal(palette.headerToken, '#162839');
    assert.equal(palette.panelToken, '#060d15');
    assert.equal(palette.pageToken, '#000000');
    assert.equal(palette.bg, 'rgb(0, 0, 0)');
    assert.equal(palette.header, 'rgb(22, 40, 57)');
    assert.ok(!palette.stylesheetUrls.some(url => /css\/styles\.css|foundation\.css|asteria-page-template/i.test(url)));
    console.log('PASS: the preview uses one compiled token-based stylesheet, not legacy CSS.');

    const navButton = page.getByRole('navigation', { name: 'Primary navigation' })
      .getByRole('link', { name: 'Home', exact: true });
    const style = await navButton.evaluate(el => {
      const css = getComputedStyle(el);
      return { height: el.getBoundingClientRect().height, clip: css.clipPath, background: css.backgroundImage };
    });
    assert.ok(style.height >= 44, 'Primary nav target is smaller than 44px');
    assert.ok(style.clip.includes('polygon('), 'Asteria crystal spear ends were not applied');
    assert.ok(style.background.includes('linear-gradient'), 'Gunmetal bezel gradient was not applied');
    const heroLoaded = await page.getByTestId('site-hero-image').locator('img')
      .evaluate(img => img.complete && img.naturalWidth > 0);
    assert.equal(heroLoaded, true);
    console.log('PASS: modular crystal buttons and real Home artwork render.');

    for (const width of [320, 360, 390, 430, 768, 1024, 1280, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(base, { waitUntil: 'networkidle' });
      const metrics = await page.evaluate(() => {
        const desktop = document.querySelector('[data-testid="site-primary-navigation"]');
        const links = Array.from(desktop.querySelectorAll('a'));
        const brand = document.querySelector('[data-testid="site-brand"]');
        const menu = document.querySelector('[data-testid="site-mobile-menu"]');
        const rect = el => el.getBoundingClientRect();
        return {
          overflow: document.documentElement.scrollWidth > innerWidth,
          desktopVisible: getComputedStyle(desktop).display !== 'none',
          menuVisible: getComputedStyle(menu).display !== 'none',
          linkTops: [...new Set(links.map(el => Math.round(rect(el).top)))].length,
          linksBeyondWindow: links.some(el => rect(el).right > innerWidth),
          brandOverlap: links.length && rect(links[0]).left < rect(brand).right,
          linkShort: links.some(el => rect(el).height < 44)
        };
      });
      assert.equal(metrics.overflow, false, 'Horizontal overflow at ' + width);
      if (width <= 1150) {
        assert.equal(metrics.desktopVisible, false, 'Desktop navigation exposed at ' + width);
        assert.equal(metrics.menuVisible, true, 'Mobile navigation missing at ' + width);
        const menu = page.getByTestId('site-mobile-menu');
        await menu.locator('summary').click();
        const mobileLinks = await page.getByRole('navigation', { name: 'Mobile navigation' })
          .getByRole('link').all();
        assert.equal(mobileLinks.length, 8);
        for (const link of mobileLinks) {
          assert.ok((await link.boundingBox()).height >= 44, 'Undersized mobile menu target at ' + width);
        }
        await page.getByRole('navigation', { name: 'Mobile navigation' })
          .getByRole('link', { name: 'Character Forge', exact: true }).click();
        await page.getByRole('heading', { name: 'Character Forge', level: 1 }).waitFor();
      } else {
        assert.equal(metrics.desktopVisible, true, 'Desktop links missing at ' + width);
        assert.equal(metrics.menuVisible, false, 'Mobile menu exposed on desktop at ' + width);
        assert.equal(metrics.linkTops, 1, 'Header links wrapped to another row at ' + width);
        assert.equal(metrics.linksBeyondWindow, false, 'Header link clipped at ' + width);
        assert.equal(metrics.brandOverlap, false, 'Logo overlaps nav links at ' + width);
        assert.equal(metrics.linkShort, false, 'Undersized desktop nav target at ' + width);
      }
    }
    console.log('PASS: responsive header, logo, links and mobile targets verified at 320–1920px.');

    await page.goto(base + '#/compendium', { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Asteria Compendium', level: 1 }).waitFor();
    const panel = page.locator('main aside').first();
    assert.equal(await panel.count(), 1);
    const panelStyle = await panel.evaluate(el => getComputedStyle(el).backgroundColor);
    assert.equal(panelStyle, 'rgb(6, 13, 21)', 'Obsidian panel surface token not applied');

    const appearance = await page.evaluate(() => {
      document.documentElement.dataset.asteriaBackground = 'light-gray';
      const light = {
        page: getComputedStyle(document.body).backgroundColor,
        panel: getComputedStyle(document.querySelector('main aside')).backgroundColor,
        scheme: getComputedStyle(document.documentElement).colorScheme
      };
      document.documentElement.dataset.asteriaBackground = 'dark-blue';
      const blue = getComputedStyle(document.body).backgroundColor;
      document.documentElement.dataset.asteriaBackground = 'forest';
      const forest = getComputedStyle(document.body).backgroundColor;
      delete document.documentElement.dataset.asteriaBackground;
      return { light, blue, forest, restored: getComputedStyle(document.body).backgroundColor };
    });
    assert.equal(appearance.light.page, 'rgb(218, 223, 227)');
    assert.equal(appearance.light.panel, 'rgb(238, 241, 242)');
    assert.equal(appearance.light.scheme, 'light');
    assert.equal(appearance.blue, 'rgb(7, 21, 34)');
    assert.equal(appearance.forest, 'rgb(7, 24, 15)');
    assert.equal(appearance.restored, 'rgb(0, 0, 0)');
    console.log('PASS: appearance modes change tokens without importing theme override files.');

    await page.emulateMedia({ reducedMotion: 'reduce' });
    const motion = await page.getByRole('link', { name: 'Return to Home' })
      .evaluate(el => getComputedStyle(el).transitionDuration);
    assert.ok(motion === '1e-05s' || motion === '0.00001s' || motion === '0s',
      'Reduced-motion transition was not disabled: ' + motion);

    await page.getByRole('link', { name: 'Return to Home' }).click();
    await page.getByRole('heading', { name: 'Asteria', level: 1 }).waitFor();
    assert.deepEqual(errors, [], 'Browser errors: ' + errors.join('; '));
    console.log('PASS: scoped page panels, theme tokens, reduced motion and returning Home.');
  } finally {
    if (browser) await browser.close();
    server.kill('SIGTERM');
  }
})().catch(error => { console.error(error); process.exitCode = 1; server.kill('SIGTERM'); });
