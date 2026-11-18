/* Phase 2.3: four-image React Home, two Forge cards and cinematic behavior.
 * Test only the isolated Vite preview, never authenticated live production. */
'use strict';

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const base = 'http://127.0.0.1:4174/';
const evidence = path.join(process.env.RUNNER_TEMP || root, 'asteria-phase-2-3-home-evidence');
const server = spawn(process.execPath, [
  path.join(root, 'node_modules/vite/bin/vite.js'),
  'preview', '--config', path.join(root, 'vite.site.config.mjs')
], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
server.stdout.on('data', bytes => process.stdout.write(bytes));
server.stderr.on('data', bytes => process.stderr.write(bytes));

async function waitForPreview() {
  for (let i = 0; i < 80; i++) {
    if (server.exitCode !== null) throw new Error('Vite preview server exited early');
    try {
      const res = await fetch(base, { signal: AbortSignal.timeout(500) });
      if (res.ok) return;
    } catch { /* Starting */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('The isolated React preview never became ready');
}

(async () => {
  let browser;
  const report = {
    phase: '2.3', environment: 'isolated React/Vite preview',
    deployed: false, authenticatedGameplayTested: false, slides: 4,
    slideIntervalMs: 15000, forgeCardCount: 2, viewportMetrics: [], screenshots: []
  };
  try {
    fs.mkdirSync(evidence, { recursive: true });
    await waitForPreview();
    browser = await chromium.launch({
      headless: true,
      executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined,
      args: ['--no-sandbox', '--disable-dev-shm-usage']
    });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    const externalRequests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
    page.on('response', res => {
      if (res.status() >= 400) errors.push(String(res.status()) + ' ' + res.url());
    });
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === '127.0.0.1') return route.continue();
      externalRequests.push(url.href);
      return route.abort();
    });

    await page.goto(base, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Asteria', level: 1, exact: true }).waitFor();
    const carousel = page.getByTestId('site-home-carousel');
    assert.equal(await carousel.getAttribute('aria-roledescription'), 'carousel');
    assert.equal(await carousel.locator('img').count(), 4);
    const initial = page.getByTestId('site-hero-image');
    assert.equal(await initial.getAttribute('aria-hidden'), 'false');
    assert.equal(await initial.locator('img').evaluate(img => img.complete && img.naturalWidth > 0), true);
    assert.equal(await carousel.locator('[aria-hidden="false"]').count(), 1);
    assert.equal(await carousel.getByRole('button', { name: /Show image/ }).count(), 4);
    assert.equal(await page.getByRole('main').count(), 1);
    assert.equal(await page.locator('main h1').count(), 1);
    assert.equal(await page.locator('main aside').count(), 0, 'Old decorative preview panels should be gone');
    assert.equal(await page.getByTestId('site-home-forge-cards').getByRole('link').count(), 2);
    console.log('PASS: four approved slides, single Home heading and two Forge cards.');

    await page.getByTestId('site-carousel-next').click();
    assert.equal(await page.getByTestId('site-home-slide-logo').getAttribute('aria-hidden'), 'false');
    assert.equal(await carousel.locator('[aria-hidden="false"]').count(), 1);
    assert.equal(await carousel.locator('[aria-live="polite"]').innerText(), 'Image 2 of 4');
    await page.getByTestId('site-carousel-dot-3').click();
    assert.equal(await page.getByTestId('site-home-slide-varkhyn').getAttribute('aria-hidden'), 'false');
    assert.equal(await page.getByTestId('site-carousel-prev').getAttribute('aria-label'), 'Previous image');
    await page.getByTestId('site-carousel-next').click();
    assert.equal(await initial.getAttribute('aria-hidden'), 'false', 'Carousel should wrap after the fourth image');
    await page.getByTestId('site-carousel-prev').focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.getByTestId('site-home-slide-logo').getAttribute('aria-hidden'), 'false',
      'Arrow key should advance from the first to the second image');
    console.log('PASS: arrow buttons, dots, keyboard, announcements and wraparound.');

    await page.getByTestId('site-home-action-explore-world').click();
    await page.getByRole('heading', { name: 'Worlds & Lore', level: 1 }).waitFor();
    assert.equal(await page.evaluate(() => location.hash), '#/compendium?group=world');
    await page.goBack();
    await page.getByRole('heading', { name: 'Asteria', level: 1 }).waitFor();
    await page.getByTestId('site-home-action-open-handbook').click();
    await page.getByRole('heading', { name: 'Asteria Handbook', level: 1 }).waitFor();
    assert.equal(await page.evaluate(() => location.hash), '#/compendium?group=rules&category=handbook');
    await page.goBack();
    await page.getByRole('heading', { name: 'Asteria', level: 1 }).waitFor();

    for (const [id, heading, hash] of [
      ['character', 'Character Forge', '#/character-forge?mode=create'],
      ['campaign', 'Campaign Forge', '#/campaign-forge?mode=create']
    ]) {
      const card = page.getByTestId('site-home-forge-' + id);
      await card.scrollIntoViewIfNeeded();
      assert.equal(await card.locator('img').count(), 1);
      assert.equal(await card.locator('img').evaluate(img => img.decode().then(() => img.naturalWidth > 0)), true);
      await card.click();
      await page.getByRole('heading', { name: heading, level: 1 }).waitFor();
      assert.equal(await page.evaluate(() => location.hash), hash);
      assert.equal(await page.locator('main input, main form').count(), 0,
        'Forge preview must not collect credentials or campaign/character data');
      await page.goBack();
      await page.getByRole('heading', { name: 'Asteria', level: 1 }).waitFor();
    }
    console.log('PASS: Explore/Handbook CTAs and both Forge links preserve fail-closed routing.');

    for (const width of [320, 360, 390, 430, 768, 1024, 1280, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(base, { waitUntil: 'networkidle' });
      await page.getByRole('heading', { name: 'Asteria', level: 1 }).waitFor();
      const metrics = await page.evaluate(() => {
        const root = document.getElementById('home');
        const hero = document.querySelector('[data-testid="site-home-carousel"]');
        const cards = [...document.querySelectorAll('[data-testid^="site-home-forge-"]')];
        const dots = [...hero.querySelectorAll('[data-testid^="site-carousel-dot-"]')];
        const controls = [...hero.querySelectorAll('button')];
        const rect = item => item.getBoundingClientRect();
        return {
          viewport: innerWidth,
          horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
          homeWidth: Math.round(rect(root).width),
          heroWidth: Math.round(rect(hero).width),
          carouselButtonsAtLeast44: controls.every(btn => rect(btn).height >= 44 && rect(btn).width >= 44),
          dotsCount: dots.length,
          forgeCount: cards.length,
          forgeSideBySide: Math.abs(rect(cards[0]).top - rect(cards[1]).top) <= 2,
          cardEdgesInsideViewport: cards.every(card => rect(card).left >= -1 && rect(card).right <= innerWidth + 1)
        };
      });
      assert.equal(metrics.horizontalOverflow, false, 'Horizontal overflow at ' + width);
      assert.equal(metrics.heroWidth, width, 'Hero should fill its viewport at ' + width);
      assert.equal(metrics.carouselButtonsAtLeast44, true, 'Carousel controls too small at ' + width);
      assert.equal(metrics.dotsCount, 4);
      assert.equal(metrics.forgeCount, 2);
      assert.equal(metrics.cardEdgesInsideViewport, true, 'Forge cards clip past viewport at ' + width);
      assert.equal(metrics.forgeSideBySide, width > 760, 'Forge cards have incorrect columns at ' + width);
      report.viewportMetrics.push(metrics);
      if (width === 390 || width === 1440) {
        const file = 'phase2-3-home-' + width + '.png';
        await page.screenshot({ path: path.join(evidence, file), fullPage: true, animations: 'disabled' });
        report.screenshots.push(file);
      }
    }
    console.log('PASS: 320–1920px layouts, full-bleed hero, 44px controls and responsive Forge cards.');

    // Virtual time keeps CI fast while proving carousel auto-advance.
    const autoPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await autoPage.clock.install();
    await autoPage.goto(base, { waitUntil: 'networkidle' });
    const auto = autoPage.getByTestId('site-home-carousel');
    await auto.waitFor({ state: 'visible' });
    assert.equal(await autoPage.getByTestId('site-hero-image').getAttribute('aria-hidden'), 'false');
    await autoPage.clock.fastForward(15200);
    assert.equal(await autoPage.getByTestId('site-home-slide-logo').getAttribute('aria-hidden'), 'false',
      'Carousel did not advance after 15 seconds');
    await autoPage.close();

    // Reduced-motion users must never have forced auto rotation.
    const reduced = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    await reduced.clock.install();
    await reduced.goto(base, { waitUntil: 'networkidle' });
    await reduced.getByTestId('site-home-carousel').waitFor();
    await reduced.clock.fastForward(30000);
    assert.equal(await reduced.getByTestId('site-hero-image').getAttribute('aria-hidden'), 'false');
    assert.equal(await reduced.getByTestId('site-carousel-progress').evaluate(el =>
      getComputedStyle(el).animationName), 'none');
    await reduced.close();
    console.log('PASS: 15s autoplay and reduced-motion pause under virtual browser time.');

    assert.deepEqual(externalRequests, [], 'Unexpected requests to backend/external services');
    assert.deepEqual(errors, [], 'Browser JS/HTTP errors: ' + errors.join('; '));
    fs.writeFileSync(path.join(evidence, 'phase2-3-home-report.json'), JSON.stringify({
      ...report, conclusion: 'passed',
      profileAwareMyCharactersButton: 'deferred to authenticated Account migration',
      compendiumAndForgeData: 'unmigrated preview routes'
    }, null, 2) + '\n');
  } finally {
    if (browser) await browser.close();
    server.kill('SIGTERM');
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
  server.kill('SIGTERM');
});
