/* Phase 2.4: isolated React appearance, local persistence and mobile navigation. */
'use strict';
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const base = 'http://127.0.0.1:4174/';
const evidence = path.join(process.env.RUNNER_TEMP || root, 'asteria-phase-2-4-appearance-evidence');
const server = spawn(process.execPath, [
  path.join(root, 'node_modules/vite/bin/vite.js'), 'preview',
  '--config', path.join(root, 'vite.site.config.mjs')
], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
server.stdout.on('data', output => process.stdout.write(output));
server.stderr.on('data', output => process.stderr.write(output));

async function waitForPreview() {
  for (let i=0; i<80; i++) {
    if (server.exitCode !== null) throw new Error('Vite preview exited');
    try { if ((await fetch(base, {signal:AbortSignal.timeout(500)})).ok) return; }
    catch { /* still starting */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('Vite preview unavailable');
}

(async () => {
  let browser;
  try {
    fs.mkdirSync(evidence, { recursive:true });
    await waitForPreview();
    browser = await chromium.launch({
      headless:true,
      executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined,
      args:['--no-sandbox','--disable-dev-shm-usage']
    });
    const page = await browser.newPage({viewport:{width:1440,height:900}});
    const errors = [], remote = [];
    page.on('pageerror', err => errors.push(err.message));
    page.on('console', msg => {if(msg.type()==='error') errors.push(msg.text());});
    await page.route('**/*', route => {
      const address = new URL(route.request().url());
      if (address.hostname === '127.0.0.1') return route.continue();
      remote.push(address.origin);
      return route.abort();
    });
    await page.goto(base+'#/appearance', {waitUntil:'networkidle'});
    await page.getByRole('heading',{name:'Appearance',level:1}).waitFor();
    assert.equal(await page.getByTestId('site-appearance-backgrounds').getByRole('button').count(), 5);
    assert.equal(await page.getByTestId('site-header-login').count(),1);
    assert.equal(await page.getByTestId('site-header-account-menu').count(),0);
    assert.equal(await page.evaluate(()=>document.documentElement.dataset.asteriaBackground),'black');

    await page.getByTestId('site-background-forest').click();
    await page.getByTestId('site-body-font').selectOption('arial');
    await page.getByTestId('site-display-font').selectOption('baskerville');
    await page.getByTestId('site-text-size').selectOption('large');
    await page.getByTestId('site-crystal-colour').evaluate(el => {
      const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
      setter.call(el,'#d11a88');
      el.dispatchEvent(new Event('input',{bubbles:true}));
      el.dispatchEvent(new Event('change',{bubbles:true}));
    });
    const selected = await page.evaluate(() => ({
      ...document.documentElement.dataset,
      saved: JSON.parse(localStorage.getItem('asteria.react.appearance.v1'))
    }));
    assert.equal(selected.asteriaBackground,'forest');
    assert.equal(selected.asteriaBodyFont,'arial');
    assert.equal(selected.asteriaDisplayFont,'baskerville');
    assert.equal(selected.asteriaTextSize,'large');
    assert.equal(selected.saved.crystalColor,'#d11a88');
    const lighting = await page.evaluate(() => ({
      tone: getComputedStyle(document.documentElement).getPropertyValue('--ast-button-crystal-tone').trim(),
      logo: getComputedStyle(document.querySelector('[data-testid="site-brand"] feFlood')).floodColor
    }));
    assert.equal(lighting.tone,'#d11a88');
    assert.ok(lighting.logo==='rgb(209, 26, 136)'||lighting.logo==='#d11a88', 'Logo stars not linked to selected crystal');
    assert.equal(selected.saved.version,1);
    await page.reload({waitUntil:'networkidle'});
    assert.equal(await page.getByTestId('site-background-forest').getAttribute('aria-pressed'),'true');
    assert.equal(await page.getByTestId('site-text-size').inputValue(),'large');
    assert.equal(await page.getByTestId('site-crystal-colour').inputValue(),'#d11a88');
    await page.getByTestId('site-appearance-reset').click();
    assert.equal(await page.getByTestId('site-background-black').getAttribute('aria-pressed'),'true');
    assert.equal(await page.getByTestId('site-text-size').inputValue(),'normal');
    assert.equal(await page.getByTestId('site-crystal-colour').inputValue(),'#1f7dff');

    for (const width of [320,390,760,1024,1280,1440,1920]) {
      await page.setViewportSize({width,height:900});
      await page.goto(base+'#/appearance',{waitUntil:'networkidle'});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth <= window.innerWidth),true,'Overflow at '+width);
      if(width===390 || width===1440) {
        await page.screenshot({path:path.join(evidence,'phase2-4-appearance-'+width+'.png'),fullPage:true,animations:'disabled'});
      }
      if(width===390) {
        await page.getByTestId('site-mobile-menu').locator('summary').click();
        await page.getByTestId('site-mobile-appearance-link').click();
        assert.equal(await page.evaluate(()=>location.hash),'#/appearance');
      }
    }

    await page.goto(base+'#/account/settings',{waitUntil:'networkidle'});
    await page.getByRole('heading',{name:'Account Settings',level:1}).waitFor();
    assert.equal(await page.locator('main input, main form').count(),0);
    await page.getByRole('link',{name:'Customise website appearance'}).click();
    await page.getByRole('heading',{name:'Appearance',level:1}).waitFor();
    await page.getByTestId('site-footer-appearance').click();
    assert.equal(await page.evaluate(()=>location.hash),'#/appearance');
    assert.deepEqual(errors,[],'Browser errors: '+errors.join('; '));
    assert.deepEqual(remote,[],'Unexpected external calls');
    fs.writeFileSync(path.join(evidence,'summary.json'),JSON.stringify({phase:'2.4',productionChanged:false,viewports:[320,390,760,1024,1280,1440,1920],errors,remote},null,2));
    console.log('PASS: Phase 2.4 local appearance, persistence, reset, secure routes and mobile layouts');
  } catch (error) {
    console.error(error);
    process.exitCode=1;
  } finally {
    if(browser) await browser.close();
    server.kill('SIGTERM');
  }
})();
