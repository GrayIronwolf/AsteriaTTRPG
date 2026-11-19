/* Phase 1.5 integrated acceptance: screenshot + audit evidence.
 * Two separate localhost servers (future React Vite and legacy static).
 * This is deliberately NOT a production deployment or authenticated parity test.
 */
'use strict';

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const evidenceDir = path.join(process.env.RUNNER_TEMP || root, 'asteria-phase-1-5-evidence');
const previewBase = 'http://127.0.0.1:4174/';
const legacyBase = 'http://127.0.0.1:8123/';
const servers = [];

function launch(args) {
  const child = spawn(process.execPath, args, {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stdout.on('data', chunk => process.stdout.write(chunk));
  child.stderr.on('data', chunk => process.stderr.write(chunk));
  servers.push(child);
  return child;
}

async function ready(url, child) {
  for (let n = 0; n < 80; n++) {
    if (child.exitCode !== null) throw Error('A local test server exited early: ' + url);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(500) });
      if (response.ok) return;
    } catch { /* server is starting */ }
    await new Promise(done => setTimeout(done, 250));
  }
  throw Error('Could not reach local server: ' + url);
}

async function observe(page, allowedPort) {
  const issues = { pageErrors: [], browserErrors: [], blockedExternal: [], notFound: [] };
  page.on('pageerror', e => issues.pageErrors.push(e.message));
  page.on('console', e => {
    if (e.type() === 'error') issues.browserErrors.push(e.text());
  });
  page.on('response', response => {
    if (response.status() >= 400) issues.notFound.push(response.status() + ' ' + response.url());
  });
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1' && url.port === String(allowedPort)) {
      return route.continue();
    }
    issues.blockedExternal.push(url.origin);
    return route.abort();
  });
  return issues;
}

function readMetrics(page) {
  return page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    const images = [...document.images];
    return {
      viewport: { width: innerWidth, height: innerHeight },
      navigationDomContentLoadedMs: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
      navigationLoadMs: nav ? Math.round(nav.loadEventEnd) : null,
      resourceCount: performance.getEntriesByType('resource').length,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
      brokenImages: images.filter(image => image.complete && image.naturalWidth === 0).length,
      headerCount: document.querySelectorAll('header').length,
      mainCount: document.querySelectorAll('main').length
    };
  });
}

function assetInventory() {
  const dist = path.join(root, 'frontend-dist');
  const manifest = JSON.parse(fs.readFileSync(path.join(dist, '.vite/manifest.json'), 'utf8'));
  const entry = manifest['index.html'];
  assert.ok(entry?.isEntry, 'The separate Vite app must have one manifest entry');
  assert.ok(entry.css?.length, 'Vite should emit scoped CSS');
  const assets = [entry.file, ...entry.css].map(name => ({
    path: name,
    bytesUncompressed: fs.statSync(path.join(dist, name)).size
  }));
  return { manifestEntry: 'index.html', compiledAssets: assets };
}

async function screenshot(page, filename) {
  await page.screenshot({
    path: path.join(evidenceDir, filename),
    fullPage: false,
    animations: 'disabled'
  });
}

(async () => {
  let browser;
  const report = {
    phase: '1.5',
    generatedAt: new Date().toISOString(),
    repository: 'GrayIronwolf/AsteriaTTRPG',
    purpose: 'Preview foundation integration and offline legacy baseline',
    scope: 'GitHub Actions / local offline Chromium; NOT a live production benchmark',
    deploymentChanged: false,
    backendConnected: false,
    authenticatedParityTested: false,
    featureParity: 'not yet migrated: Account, Friends, Compendium content, Character/Campaign Forge, GM/Player dashboards',
    acceptance: {},
    snapshots: [],
    outstandingCutoverGates: [
      'Capture authenticated legacy production baseline with safe test accounts or emulators',
      'Migrate and security-test account and friend operations',
      'Migrate Compendium, Handbook, Forges and full dashboards',
      'Validate real-time gameplay and role permissions',
      'Perform production visual/performance parity before activating a new site entry'
    ]
  };

  try {
    fs.mkdirSync(evidenceDir, { recursive: true });
    const previewServer = launch([
      path.join(root, 'node_modules/vite/bin/vite.js'),
      'preview', '--config', path.join(root, 'vite.site.config.mjs')
    ]);
    const legacyServer = launch([path.join(root, 'scripts/local-static-server.js'), '8123']);
    await Promise.all([ready(previewBase, previewServer), ready(legacyBase, legacyServer)]);

    browser = await chromium.launch({
      headless: true,
      executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined,
      args: ['--no-sandbox', '--disable-dev-shm-usage']
    });
    report.assets = assetInventory();

    const preview = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const previewIssues = await observe(preview, 4174);

    await preview.goto(previewBase, { waitUntil: 'networkidle' });
    await preview.getByRole('heading', { name: 'Asteria', level: 1 }).waitFor();
    assert.equal(await preview.getByRole('navigation', { name: 'Primary navigation' }).getByRole('link').count(), 6);
    assert.equal(await preview.locator('main h1').count(), 1);
    assert.equal(await preview.getByTestId('site-hero-image').locator('img')
      .evaluate(image => image.complete && image.naturalWidth > 0), true);
    assert.equal(await preview.getByTestId('site-brand').locator('svg')
      .evaluate(svg => svg.getBoundingClientRect().width > 100 && svg.querySelectorAll('image').length === 2), true);
    report.previewHome = await readMetrics(preview);
    assert.equal(report.previewHome.horizontalOverflow, false);
    assert.equal(report.previewHome.brokenImages, 0);
    await screenshot(preview, 'preview-home-desktop-1440.png');
    report.snapshots.push('preview-home-desktop-1440.png');

    await preview.setViewportSize({ width: 390, height: 844 });
    await screenshot(preview, 'preview-home-mobile-390.png');
    report.snapshots.push('preview-home-mobile-390.png');
    await preview.getByTestId('site-mobile-menu').locator('summary').click();
    assert.equal(await preview.getByRole('navigation', { name: 'Mobile navigation' })
      .getByRole('link').count(), 7);
    assert.equal(await preview.getByTestId('site-mobile-appearance-link').count(), 1);
    await screenshot(preview, 'preview-mobile-navigation-390.png');
    report.snapshots.push('preview-mobile-navigation-390.png');
    await preview.getByRole('navigation', { name: 'Mobile navigation' })
      .getByRole('link', { name: 'Asteria Compendium', exact: true }).click();
    await preview.getByTestId('site-mega-browse').click();
    await preview.getByRole('heading', { name: 'Asteria Compendium', exact: true, level: 1 }).waitFor();
    assert.equal(await preview.getByTestId('site-mobile-menu').evaluate(el => el.open), false);

    await preview.setViewportSize({ width: 1440, height: 900 });
    await preview.goto(previewBase + '#/compendium?group=rules&category=handbook', { waitUntil: 'networkidle' });
    await preview.getByRole('heading', { name: 'Asteria Handbook', level: 1 }).waitFor();
    await screenshot(preview, 'preview-handbook-route-1440.png');
    report.snapshots.push('preview-handbook-route-1440.png');
    await preview.reload({ waitUntil: 'networkidle' });
    await preview.getByRole('heading', { name: 'Asteria Handbook', level: 1 }).waitFor();

    await preview.goto(previewBase + '#/react/gm/example-private-campaign', { waitUntil: 'networkidle' });
    await preview.getByRole('heading', { name: 'GM Dashboard', level: 1 }).waitFor();
    assert.equal((await preview.locator('main').innerText()).includes('example-private-campaign'), false);
    assert.equal(await preview.locator('main input, main form').count(), 0);
    await screenshot(preview, 'preview-restricted-gm-1440.png');
    report.snapshots.push('preview-restricted-gm-1440.png');

    await preview.setViewportSize({ width: 390, height: 844 });
    await preview.goto(previewBase + '#/account/login', { waitUntil: 'networkidle' });
    await preview.getByRole('heading', { name: 'Login', level: 1 }).waitFor();
    assert.equal(await preview.locator('main input, main form').count(), 0);
    await screenshot(preview, 'preview-account-placeholder-mobile-390.png');
    report.snapshots.push('preview-account-placeholder-mobile-390.png');

    await preview.setViewportSize({ width: 1440, height: 900 });
    await preview.goto(previewBase + '#/compendium', { waitUntil: 'networkidle' });
    await preview.evaluate(() => { document.documentElement.dataset.asteriaBackground = 'light-gray'; });
    await screenshot(preview, 'preview-light-gray-1440.png');
    report.snapshots.push('preview-light-gray-1440.png');
    await preview.evaluate(() => { delete document.documentElement.dataset.asteriaBackground; });

    // Browser history must remain stable after repeated direct-route changes.
    await preview.getByRole('link', { name: 'Return to Home' }).click();
    await preview.getByRole('heading', { name: 'Asteria', level: 1 }).waitFor();
    await preview.goBack();
    await preview.getByRole('heading', { name: 'Asteria Compendium', level: 1 }).waitFor();

    report.previewIssues = previewIssues;
    report.acceptance.previewVisualAndNavigation = true;
    report.acceptance.protectedRouteFailClosed = true;
    report.acceptance.noLegacyOrFirebaseNetwork = previewIssues.blockedExternal.length === 0 &&
      previewIssues.pageErrors.length === 0 && previewIssues.browserErrors.length === 0 &&
      previewIssues.notFound.length === 0;
    assert.equal(report.acceptance.noLegacyOrFirebaseNetwork, true,
      'Standalone preview made external requests or logged runtime/HTTP errors');

    // Screenshot the checked-in legacy website served offline from the same
    // repository. Block internet/auth calls; this is NOT a real signed-in user.
    const legacy = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const legacyIssues = await observe(legacy, 8123);
    await legacy.goto(legacyBase, { waitUntil: 'domcontentloaded' });
    await legacy.locator('#home').waitFor({ state: 'attached' });
    await legacy.locator('#globalNavigation').waitFor({ state: 'attached' });
    await legacy.waitForLoadState('load', { timeout: 18000 }).catch(() => {});
    const legacyBaseline = await legacy.evaluate(() => ({
      homePresent: !!document.getElementById('home'),
      homeVisible: getComputedStyle(document.getElementById('home')).display !== 'none',
      headerPresent: !!document.getElementById('asteriaHeaderBrand'),
      navigationPresent: !!document.getElementById('globalNavigation'),
      mainPresent: !!document.getElementById('mainContent'),
      legacyScriptCount: document.querySelectorAll('script[src]').length,
      linkedStylesheetCount: document.querySelectorAll('link[rel="stylesheet"]').length
    }));
    assert.equal(legacyBaseline.homePresent, true);
    assert.equal(legacyBaseline.headerPresent, true);
    assert.equal(legacyBaseline.navigationPresent, true);
    assert.equal(legacyBaseline.mainPresent, true);
    assert.ok(legacyBaseline.legacyScriptCount > 40,
      'The old site must remain the old site during the migration');
    assert.ok(legacyBaseline.linkedStylesheetCount >= 30);
    await screenshot(legacy, 'legacy-offline-home-desktop-1440.png');
    report.snapshots.push('legacy-offline-home-desktop-1440.png');
    await legacy.setViewportSize({ width: 390, height: 844 });
    await screenshot(legacy, 'legacy-offline-home-mobile-390.png');
    report.snapshots.push('legacy-offline-home-mobile-390.png');
    report.legacyOffline = {
      ...legacyBaseline,
      navigation: await readMetrics(legacy),
      blockedExternalOrigins: [...new Set(legacyIssues.blockedExternal)],
      javascriptErrorsObserved: legacyIssues.pageErrors.length,
      note: 'Offline guest baseline. External Firebase/network requests blocked. Errors are recorded, not misrepresented as authenticated behavior.'
    };
    report.acceptance.oldStaticWebsiteStillPresent = true;
    report.acceptance.previewAndLegacyAreSeparateDocuments = true;
    assert.notEqual(new URL(previewBase).host, new URL(legacyBase).host,
      'The preview and legacy website must use different origins');

    console.log('PASS: isolated preview, protected-route safety, offline legacy baseline and screenshot evidence.');
  } finally {
    try {
      fs.mkdirSync(evidenceDir, { recursive: true });
      fs.writeFileSync(path.join(evidenceDir, 'phase-1-5-acceptance.json'),
        JSON.stringify(report, null, 2) + '\n', 'utf8');
    } catch (error) {
      console.error('Unable to write acceptance report:', error);
      process.exitCode = 1;
    }
    if (browser) await browser.close();
    for (const child of servers) child.kill('SIGTERM');
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
  for (const child of servers) child.kill('SIGTERM');
});
