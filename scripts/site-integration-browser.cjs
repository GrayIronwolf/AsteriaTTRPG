/* Phase 2.5 combined integration: browser, assets, events and synthetic verified header.
 * Only the isolated React/Vite preview is tested. No real Firebase sign-in.
 * The ephemeral verified fixture is never included in a production bundle.
 */
'use strict';

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const evidence = path.join(process.env.RUNNER_TEMP || root, 'asteria-phase-2-5-integration-evidence');
const previewBase = 'http://127.0.0.1:4174/';
const fixtureBase = 'http://127.0.0.1:5174/__site-phase2-5-verified.html';
const fixtureHtml = path.join(root, 'frontend/__site-phase2-5-verified.html');
const fixtureEntry = path.join(root, 'frontend/__site-phase2-5-verified.jsx');
const children = [];

function startVite(mode) {
  const child = spawn(process.execPath, [
    path.join(root, 'node_modules/vite/bin/vite.js'), mode,
    '--config', path.join(root, 'vite.site.config.mjs')
  ], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', bytes => process.stdout.write(bytes));
  child.stderr.on('data', bytes => process.stderr.write(bytes));
  children.push(child);
  return child;
}

async function awaitReady(url, child) {
  for (let i=0; i<100; i++) {
    if (child.exitCode !== null) throw Error('Vite '+url+' exited before ready');
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(700) });
      if (response.ok) return;
    } catch { /* server starting */ }
    await new Promise(done => setTimeout(done, 250));
  }
  throw Error('Vite preview not ready: '+url);
}

function generateEphemeralVerifiedFixture() {
  const html = `<!doctype html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><title>Phase 2.5 verified header fixture</title></head><body><div id="phase-test-root"></div><script type="module" src="/__site-phase2-5-verified.jsx"></script></body></html>`;
  const jsx = `import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './src/app/App.jsx';
import { AppServicesProvider } from './src/app/AppServices.jsx';
import { AppearanceProvider } from './src/appearance/AppearanceProvider.jsx';
import './src/styles/tokens.css';
import './src/styles/reset.css';
import './src/styles/typography.css';
const syntheticVerifiedHeader = Object.freeze({
  status: 'authenticated', verified: true, username: 'Preview GM',
  avatarUrl: null, notificationCount: 3
});
// NO auth adapter, Firebase, credentials, or private data is provided.
createRoot(document.getElementById('phase-test-root')).render(
  <React.StrictMode><AppearanceProvider><AppServicesProvider>
    <App identity={syntheticVerifiedHeader} />
  </AppServicesProvider></AppearanceProvider></React.StrictMode>
);
`;
  fs.writeFileSync(fixtureHtml, html);
  fs.writeFileSync(fixtureEntry, jsx);
}

async function observe(page, port, faults) {
  page.on('pageerror', error => faults.push('pageerror: '+error.message));
  page.on('console', message => {
    if(message.type()==='error') faults.push('console: '+message.text());
  });
  page.on('response', response => {
    if(response.status() >= 400 && !response.url().endsWith('/favicon.ico')) {
      faults.push(response.status()+' '+response.url());
    }
  });
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1' && url.port === String(port)) return route.continue();
    faults.push('External request blocked: '+url.origin);
    return route.abort();
  });
}

async function auditListeners(page) {
  await page.addInitScript(() => {
    const active = { hashchange: new Set(), popstate: new Set(), keydown: new Set() };
    const add = EventTarget.prototype.addEventListener;
    const remove = EventTarget.prototype.removeEventListener;
    const monitored = (target, type) => {
      if (target === window && (type === 'hashchange' || type === 'popstate')) return true;
      return target === document && type === 'keydown';
    };
    EventTarget.prototype.addEventListener = function(type, handler, options) {
      if (handler && monitored(this, type)) active[type].add(handler);
      return add.call(this, type, handler, options);
    };
    EventTarget.prototype.removeEventListener = function(type, handler, options) {
      if (handler && monitored(this, type)) active[type].delete(handler);
      return remove.call(this, type, handler, options);
    };
    window.__asteriaPhase25Listeners = () =>
      Object.fromEntries(Object.entries(active).map(([type, handlers]) => [type, handlers.size]));
  });
}

(async () => {
  let browser;
  const errors = [];
  const report = {
    phase: '2.5',
    environment: 'isolated built React preview and ephemeral dev fixture',
    productionDeployed: false,
    syntheticVerifiedHeaderOnly: true,
    authenticatedFirebaseParityTested: false,
    viewportMetrics: [], listenerMetrics: {}, screenshots: []
  };
  try {
    fs.mkdirSync(evidence, { recursive: true });
    generateEphemeralVerifiedFixture();
    const previewServer = startVite('preview');
    const fixtureServer = startVite('dev');
    await Promise.all([
      awaitReady(previewBase, previewServer),
      awaitReady(fixtureBase, fixtureServer)
    ]);
    browser = await chromium.launch({
      headless:true, executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined,
      args:['--no-sandbox','--disable-dev-shm-usage']
    });

    // Real preview entry: always guest, and never force an old login/forge redirect.
    const page = await browser.newPage({viewport:{width:1440,height:900}});
    await auditListeners(page);
    await observe(page, 4174, errors);
    await page.addInitScript(() => localStorage.setItem('asteria.lastView', 'character-forge'));
    await page.goto(previewBase, {waitUntil:'networkidle'});
    await page.getByRole('heading',{name:'Asteria',exact:true,level:1}).waitFor();
    assert.equal(await page.evaluate(()=>location.hash),'', 'Guest startup must remain Home');
    assert.equal(await page.getByTestId('site-header-login').count(),1);
    assert.equal(await page.getByTestId('site-header-profile').count(),0);
    assert.equal(await page.locator('main h1').count(),1);
    report.listenerMetrics.initial = await page.evaluate(()=>window.__asteriaPhase25Listeners());
    assert.equal(report.listenerMetrics.initial.hashchange,1,'Duplicated route hashchange listeners');
    assert.equal(report.listenerMetrics.initial.popstate,1,'Duplicated route popstate listeners');
    assert.equal(await page.getByTestId('site-hero-image').locator('img').evaluate(img=>img.decode().then(()=>img.naturalWidth>0)),true);

    await page.getByTestId('site-primary-navigation').getByTestId('site-nav-handbook').click();
    await page.getByTestId('site-mega-menu').waitFor();
    assert.equal(await page.getByTestId('site-mega-cards').getByRole('link').count(),6);
    const card = page.getByTestId('site-menu-card-players-guide');
    assert.equal(await card.getAttribute('href'),'#/compendium?group=rules&category=handbook',
      'The Handbook card must retain its canonical destination');
    assert.equal(await page.evaluate(()=>document.body.style.overflow),'hidden');
    report.listenerMetrics.megaOpen=await page.evaluate(()=>window.__asteriaPhase25Listeners());
    assert.equal(report.listenerMetrics.megaOpen.keydown,1,'More than one Escape listener for modal');
    await card.click();
    await page.getByRole('heading',{name:'Asteria Handbook',level:1}).waitFor();
    await page.getByTestId('site-footer-appearance').click();
    await page.getByRole('heading',{name:'Appearance',level:1}).waitFor();
    assert.equal(await page.evaluate(()=>location.hash),'#/appearance');
    assert.equal(await page.getByTestId('site-mega-menu').count(),0);
    assert.equal(await page.evaluate(()=>document.body.style.overflow),'',
      'Body scroll lock not released after navigation');
    report.listenerMetrics.megaClosed=await page.evaluate(()=>window.__asteriaPhase25Listeners());
    assert.equal(report.listenerMetrics.megaClosed.keydown,0,'Escape handler leaked after menu close');

    await page.getByTestId('site-background-forest').click();
    await page.getByTestId('site-body-font').selectOption('arial');
    await page.getByTestId('site-display-font').selectOption('baskerville');
    await page.getByTestId('site-text-size').selectOption('large');
    await page.waitForFunction(() => document.documentElement.dataset.asteriaTextSize==='large');
    assert.equal(await page.evaluate(()=>document.documentElement.dataset.asteriaBackground),'forest');
    await page.getByTestId('site-brand').click();
    await page.getByRole('heading',{name:'Asteria',exact:true,level:1}).waitFor();
    assert.equal(await page.evaluate(()=>location.hash),'#home');
    assert.equal(await page.evaluate(()=>document.documentElement.dataset.asteriaBackground),'forest');
    await page.reload({waitUntil:'networkidle'});
    assert.equal(await page.evaluate(()=>document.documentElement.dataset.asteriaTextSize),'large');
    await page.getByTestId('site-footer-appearance').click();
    await page.getByRole('heading',{name:'Appearance',level:1}).waitFor();
    assert.equal(await page.getByTestId('site-background-forest').getAttribute('aria-pressed'),'true');
    await page.goBack({waitUntil:'networkidle'});
    await page.getByRole('heading',{name:'Asteria',exact:true,level:1}).waitFor();
    assert.equal(await page.evaluate(()=>location.hash),'#home');

    // Forge and Compendium navigation must function but never load private data.
    await page.getByTestId('site-home-forge-character').click();
    await page.getByRole('heading',{name:'Character Forge',level:1}).waitFor();
    assert.equal(await page.locator('main form, main input').count(),0);
    await page.goBack({waitUntil:'networkidle'});
    await page.getByRole('heading',{name:'Asteria',exact:true,level:1}).waitFor();
    await page.getByTestId('site-home-action-explore-world').click();
    await page.getByRole('heading',{name:'Worlds & Lore',level:1}).waitFor();
    assert.equal(await page.evaluate(()=>location.hash),'#/compendium?group=world');
    await page.goBack({waitUntil:'networkidle'});
    await page.getByRole('heading',{name:'Asteria',exact:true,level:1}).waitFor();

    // Same-session, persisted theme and responsive integration: not isolated screenshots.
    for(const width of [320,390,768,1024,1280,1440,1920]){
      await page.setViewportSize({width,height:900});
      const metric=await page.evaluate(()=>{
        const hero=document.querySelector('[data-testid="site-home-carousel"]');
        const header=document.querySelector('[data-testid="site-header"]');
        const brand=document.querySelector('[data-testid="site-brand"]');
        return {
          width:innerWidth, scrollWidth:document.documentElement.scrollWidth,
          headerInsideViewport:header.getBoundingClientRect().right<=innerWidth+1,
          brandInsideViewport:brand.getBoundingClientRect().right<=innerWidth+1,
          heroInsideViewport:hero.getBoundingClientRect().right<=innerWidth+1,
          primaryNavVisible:getComputedStyle(document.querySelector('[data-testid="site-primary-navigation"]')).display!=='none',
          imagesBroken:[...document.images].some(img=>img.complete && img.naturalWidth===0)
        };
      });
      assert.ok(metric.scrollWidth<=width,'Overflow at '+width+': '+JSON.stringify(metric));
      assert.equal(metric.headerInsideViewport,true,'Header clipped at '+width);
      assert.equal(metric.brandInsideViewport,true,'Wordmark clipped at '+width);
      assert.equal(metric.heroInsideViewport,true,'Home artwork clipped at '+width);
      assert.equal(metric.primaryNavVisible,width>=1280,'Wrong menu breakpoint at '+width);
      assert.equal(metric.imagesBroken,false,'Broken image at '+width);
      report.viewportMetrics.push(metric);
      if(width===390||width===1440){
        const image='phase2-5-integrated-home-'+width+'.png';
        await page.screenshot({path:path.join(evidence,image),fullPage:true,animations:'disabled'});
        report.screenshots.push(image);
      }
    }
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.getByTestId('site-carousel-next').click();
    assert.equal(await page.getByTestId('site-home-slide-logo').getAttribute('aria-hidden'),'false');
    assert.equal(await page.getByTestId('site-brand').locator('feFlood')
      .evaluate(node=>getComputedStyle(node).animationName),'none',
      'Reduced-motion user must not see the logo animation');

    // Test-only synthetic identity uses a separate HTML + entry generated at runtime.
    // It is never committed or bundled with the production preview.
    const signed=await browser.newPage({viewport:{width:1440,height:900}});
    const signedErrors=[];
    await observe(signed,5174,signedErrors);
    await signed.goto(fixtureBase,{waitUntil:'networkidle'});
    await signed.getByRole('heading',{name:'Asteria',exact:true,level:1}).waitFor();
    assert.equal(await signed.evaluate(()=>location.hash),'','Signed-in view must start on Home');
    assert.equal(await signed.getByTestId('site-header-login').count(),0);
    assert.equal(await signed.getByTestId('site-header-profile').count(),1);
    assert.equal(await signed.getByTestId('site-header-account-menu').count(),1);
    const signedShot='phase2-5-synthetic-verified-header-1440.png';
    await signed.screenshot({path:path.join(evidence,signedShot),animations:'disabled'});
    report.screenshots.push(signedShot);
    await signed.getByTestId('site-header-account-menu').locator('summary').click();
    await signed.getByRole('navigation',{name:'Account shortcuts'})
      .getByRole('link',{name:'Appearance'}).click();
    await signed.getByRole('heading',{name:'Appearance',level:1}).waitFor();
    assert.equal(await signed.getByTestId('site-header-account-menu').evaluate(el=>el.open),false);
    await signed.getByTestId('site-header-profile').click();
    await signed.getByRole('heading',{name:'My Profile',level:1}).waitFor();
    assert.equal(await signed.locator('main form, main input').count(),0,
      'Synthetic identity must not grant access to real account features');
    await signed.getByTestId('site-brand').click();
    await signed.getByRole('heading',{name:'Asteria',exact:true,level:1}).waitFor();
    assert.equal(await signed.evaluate(()=>location.hash),'#home');
    assert.equal(await signed.getByTestId('site-header-profile').count(),1);
    await signed.close();

    report.listenerMetrics.final=await page.evaluate(()=>window.__asteriaPhase25Listeners());
    assert.equal(report.listenerMetrics.final.hashchange,1);
    assert.equal(report.listenerMetrics.final.popstate,1);
    assert.equal(report.listenerMetrics.final.keydown,0);
    assert.deepEqual(errors,[],'Preview browser errors/requests');
    assert.deepEqual(signedErrors,[],'Verified fixture browser errors/requests');
    fs.writeFileSync(path.join(evidence,'integration-summary.json'),JSON.stringify(report,null,2)+'\n');
    console.log('PASS: Phase 2.5 integrated Home, nav, appearance, event lifetime, responsive art and synthetic signed-header boundary');
  } catch(error) {
    console.error(error);
    process.exitCode=1;
  } finally {
    if(browser) await browser.close();
    for(const child of children) child.kill('SIGTERM');
    fs.rmSync(fixtureHtml,{force:true});
    fs.rmSync(fixtureEntry,{force:true});
  }
})();
