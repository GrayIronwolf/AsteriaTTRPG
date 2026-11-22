/* Phase 1.2: read-only local browser audit of the recovered hybrid Asteria website.
 * All non-loopback requests are blocked, so tests cannot reach production Firebase.
 * Only the existing in-memory ?reactFixture=1 data is used for dashboard interactions.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');
require('./local-static-server.js');

const root = path.resolve('artifacts/phase-1-2-browser');
fs.mkdirSync(root, {recursive:true});
const base='http://127.0.0.1:8123/';
const results=[];
const failures=[];
let browser;

function save() {
  const report={
    branch:process.env.GITHUB_REF_NAME||'local',sha:process.env.GITHUB_SHA||'unknown',
    environment:'local 127.0.0.1 with all non-local network requests blocked',
    productionFirebaseAccess:false,checks:results
  };
  fs.writeFileSync(path.join(root,'results.json'),JSON.stringify(report,null,2)+'\n');
}
async function scenario(name, options, fn) {
  const context=await browser.newContext({
    viewport:{width:options.width||1440,height:options.height||900},
    reducedMotion:'reduce',serviceWorkers:'block'
  });
  const page=await context.newPage();
  page.setDefaultTimeout(12000);
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>{
    const u=new URL(route.request().url());
    if(u.hostname==='127.0.0.1' && u.protocol==='http:')return route.continue();
    return route.abort('blockedbyclient');
  });
  let status='pass',note='';
  try {
    await fn(page);
    assert.deepEqual(errors,[],'Uncaught browser errors: '+errors.join(' | '));
    console.log('PASS:',name);
  } catch(e) {
    status='fail';
    note=String(e.stack||e).slice(0,3500);
    failures.push(name);
    console.error('FAIL:',name,note);
    try {await page.screenshot({path:path.join(root,name+'-failure.png'),fullPage:true,timeout:5000});}
    catch(_){/* a failed page should not prevent reporting other scenarios */}
  } finally {
    results.push({name,status,detail:note,pageErrors:errors.slice(0,12)});
    await context.close();
    save();
  }
}
async function fixture(page) {
  await page.goto(base+'?reactFixture=1',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.AsteriaReactMigration?.available && window.AsteriaFirebase?.getUser?.()?.uid==='player-demo',{},{timeout:25000});
}
async function player(page) {
  await fixture(page);
  await page.evaluate(()=>window.AsteriaReactMigration.openCharacter('demo-campaign','kael'));
  await page.locator('.react-character-dashboard').waitFor({timeout:20000});
}
async function gm(page) {
  await fixture(page);
  await page.evaluate(()=>window.AsteriaReactMigration.openGM('demo-campaign'));
  await page.locator('.react-gm-dashboard').waitFor({timeout:20000});
}
async function metrics(page) {
  return page.evaluate(()=>({
    viewport:innerWidth,
    scrollWidth:document.documentElement.scrollWidth,
    visibleTabs:document.querySelectorAll('.react-workspace-main [role="tab"]').length,
    panels:document.querySelectorAll('.react-dashboard-freeform-grid [data-panel-id]').length,
    title:document.title
  }));
}
(async()=>{
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  await scenario('01-public-home',{width:1440},async p=>{
    await p.goto(base,{waitUntil:'domcontentloaded'});
    await p.locator('#home.show').waitFor();
    await p.locator('#aaaHomeCarousel').waitFor();
    const home=await p.locator('#home').innerText();
    assert.match(home,/Asteria/i);
    await p.screenshot({path:path.join(root,'01-public-home.png'),fullPage:true});
  });
  await scenario('02-handbook-navigation',{width:1440},async p=>{
    await p.goto(base,{waitUntil:'domcontentloaded'});
    await p.locator('#home.show').waitFor();
    await p.getByRole('button',{name:'Open Handbook',exact:true}).click();
    await p.locator('#workspace.show').waitFor();
    await p.screenshot({path:path.join(root,'02-handbook-navigation.png'),fullPage:true});
    await p.evaluate(()=>window.asteriaHardHome());
    await p.locator('#home.show').waitFor();
  });
  await scenario('03-player-dashboard',{width:1440},async p=>{
    await player(p);
    const nav=p.getByRole('tab',{name:'Inventory',exact:true});
    await nav.click();
    await p.locator('.react-inventory-workspace').waitFor();
    await p.screenshot({path:path.join(root,'03-player-inventory.png'),fullPage:true});
    await p.getByRole('tab',{name:'Dashboard',exact:true}).click();
    await p.locator('.react-dashboard-freeform-grid [data-panel-id]').first().waitFor();
    const m=await metrics(p);
    assert.ok(m.panels>=5,'Missing player dashboard panels: '+JSON.stringify(m));
    await p.screenshot({path:path.join(root,'03-player-dashboard.png'),fullPage:true});
    console.log('PLAYER METRICS',JSON.stringify(m));
  });
  await scenario('04-player-mobile',{width:390,height:844},async p=>{
    await player(p);
    await p.locator('.react-dashboard-freeform-grid [data-panel-id]').first().waitFor();
    const m=await metrics(p);
    await p.screenshot({path:path.join(root,'04-player-mobile.png'),fullPage:true});
    assert.ok(m.scrollWidth<=m.viewport,'Player dashboard horizontal overflow: '+JSON.stringify(m));
    assert.ok(m.panels>=5,'Player panels missing on mobile: '+JSON.stringify(m));
    console.log('PLAYER MOBILE METRICS',JSON.stringify(m));
  });
  await scenario('05-gm-dashboard',{width:1440},async p=>{
    await gm(p);
    await p.locator('.react-dashboard-freeform-grid [data-panel-id]').first().waitFor();
    const m=await metrics(p);
    assert.ok(m.panels>=3,'Missing GM dashboard panels: '+JSON.stringify(m));
    await p.screenshot({path:path.join(root,'05-gm-dashboard.png'),fullPage:true});
    console.log('GM METRICS',JSON.stringify(m));
  });
  await scenario('06-gm-layout-editor',{width:1440},async p=>{
    await gm(p);
    await p.getByRole('tab',{name:'Dashboard Settings',exact:true}).click();
    const open=p.getByRole('button',{name:'Customise Dashboard Layout',exact:true});
    await open.waitFor();
    await open.click();
    const dialog=p.getByRole('dialog',{name:'Dashboard visual grid editor'});
    await dialog.waitFor();
    const initial=dialog.locator('[data-grid-panel-id]');
    assert.ok(await initial.count()>0,'No editable grid tiles');
    await p.screenshot({path:path.join(root,'06-gm-layout-editor.png'),fullPage:true});
    const lock=dialog.locator('button[aria-label^="Lock "]').first();
    const label=await lock.getAttribute('aria-label');
    assert.ok(label,'No unlocked panel to exercise');
    await lock.click();
    await dialog.locator('button[aria-label="'+label.replace(/^Lock /,'Unlock ')+'"]').waitFor();
    await dialog.getByRole('button',{name:'Apply Changes',exact:true}).click();
    await dialog.waitFor({state:'hidden'});
    await open.click();
    await dialog.waitFor();
    await dialog.locator('button[aria-label="'+label.replace(/^Lock /,'Unlock ')+'"]').waitFor();
    await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
    await dialog.waitFor({state:'hidden'});
  });
  await scenario('07-gm-mobile',{width:390,height:844},async p=>{
    await gm(p);
    await p.locator('.react-dashboard-freeform-grid [data-panel-id]').first().waitFor();
    const m=await metrics(p);
    await p.screenshot({path:path.join(root,'07-gm-mobile.png'),fullPage:true});
    assert.ok(m.scrollWidth<=m.viewport,'GM dashboard horizontal overflow: '+JSON.stringify(m));
    console.log('GM MOBILE METRICS',JSON.stringify(m));
  });
  console.log('PHASE 1.2 RESULT:',results.filter(r=>r.status==='pass').length,'passed,',failures.length,'failed.');
  save();
  await browser.close();
  process.exitCode=failures.length?1:0;
})().catch(async err=>{
  console.error('PHASE 1.2 FATAL:',err);
  failures.push('harness');
  results.push({name:'harness',status:'fail',detail:String(err.stack||err)});
  save();
  try {await browser?.close();}catch(_){}
  process.exitCode=1;
});
