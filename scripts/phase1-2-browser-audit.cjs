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
  const consoleErrors=[];
  const failedLocalRequests=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text().slice(0,1400));});
  page.on('requestfailed',request=>{if(request.url().startsWith(base))failedLocalRequests.push({url:request.url(),reason:request.failure()?.errorText});});
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
    const diagnostic=await page.evaluate(()=>({
      hash:location.hash,
      reactAvailable:window.AsteriaReactMigration?.available,
      userId:window.AsteriaFirebase?.getUser?.()?.uid,
      rootText:document.querySelector('#asteriaReactRoot')?.textContent?.slice(0,700),
      dashboardVisible:document.querySelector('#reactDashboard')?.classList.contains('show')
    })).catch(error=>({diagnosticError:String(error)}));
    note=[String(e.stack||e).slice(0,2500),
      'Browser state: '+JSON.stringify(diagnostic),
      'Console errors: '+JSON.stringify(consoleErrors.slice(-12)),
      'Failed local requests: '+JSON.stringify(failedLocalRequests.slice(-12))].join('\n');
    failures.push(name);
    console.error('FAIL:',name,note);
    try {await page.screenshot({path:path.join(root,name+'-failure.png'),fullPage:true,timeout:5000});}
    catch(_){/* a failed page should not prevent reporting other scenarios */}
  } finally {
    results.push({name,status,detail:note,pageErrors:errors.slice(0,12),consoleErrors:consoleErrors.slice(-12),failedLocalRequests:failedLocalRequests.slice(-12)});
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
/** Verify the SAME approved source images used by header menu buttons.
 * Checking real Chromium computed pseudo-elements catches JSX classes that
 * exist in source but fail to receive the image skin after React mounts. */
async function checkMenuButtonSkin(page,role) {
  const values=await page.getByTestId('asteria-'+role+'-hybrid-menu')
    .locator('button.asteria-menu-button[data-asteria-button-size="standard"]')
    .first().evaluate(button=>{
      const base=getComputedStyle(button);
      const metal=getComputedStyle(button,'::before');
      return {
        height:Math.round(button.getBoundingClientRect().height),
        frame:metal.borderImageSource,
        crystal:base.getPropertyValue('--asteria-approved-crystal').trim(),
        colour:base.getPropertyValue('--button-crystal-color').trim(),
        width:Math.round(button.getBoundingClientRect().width)
      };
    });
  assert.match(values.frame,/button-standard-frame\.webp/,
    role+' menu has lost the approved metal frame: '+JSON.stringify(values));
  assert.match(values.crystal,/button-standard-crystal\.webp/,
    role+' menu has lost the approved crystal layer');
  assert.ok(values.height>=44&&values.width>60,
    role+' menu must retain an accessible button target: '+JSON.stringify(values));
  assert.ok(values.colour,role+' menu must use the existing dashboard crystal colour');
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
    await checkMenuButtonSkin(p,'player');
    await p.getByRole('button',{name:'Inventory',exact:true}).click();
    await p.getByRole('button',{name:'Open Inventory & Equipment',exact:true}).click();
    await p.locator('.react-inventory-workspace').waitFor();
    await p.screenshot({path:path.join(root,'03-player-inventory.png'),fullPage:true});
    await p.getByRole('button',{name:'Dashboard',exact:true}).click();
    await p.locator('.react-dashboard-freeform-grid [data-panel-id]').first().waitFor();
    const m=await metrics(p);
    assert.ok(m.panels>=5,'Missing player dashboard panels: '+JSON.stringify(m));
    await p.screenshot({path:path.join(root,'03-player-dashboard.png'),fullPage:true});
    console.log('PLAYER METRICS',JSON.stringify(m));
  });
  await scenario('04-player-mobile',{width:390,height:844},async p=>{
    await player(p);
    await checkMenuButtonSkin(p,'player');
    await p.locator('.react-dashboard-freeform-grid [data-panel-id]').first().waitFor();
    const m=await metrics(p);
    await p.screenshot({path:path.join(root,'04-player-mobile.png'),fullPage:true});
    assert.ok(m.scrollWidth<=m.viewport,'Player dashboard horizontal overflow: '+JSON.stringify(m));
    assert.ok(m.panels>=5,'Player panels missing on mobile: '+JSON.stringify(m));
    console.log('PLAYER MOBILE METRICS',JSON.stringify(m));
  });
  await scenario('05-gm-dashboard',{width:1440},async p=>{
    await gm(p);
    await checkMenuButtonSkin(p,'gm');
    await p.locator('.react-dashboard-freeform-grid [data-panel-id]').first().waitFor();
    const m=await metrics(p);
    assert.ok(m.panels>=3,'Missing GM dashboard panels: '+JSON.stringify(m));
    await p.screenshot({path:path.join(root,'05-gm-dashboard.png'),fullPage:true});
    console.log('GM METRICS',JSON.stringify(m));
  });
  await scenario('06-gm-layout-editor',{width:1440},async p=>{
    await gm(p);
    await p.getByRole('button',{name:'Settings',exact:true}).click();
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
  await scenario('08-gm-combat-command-centre',{width:1440},async p=>{
    await gm(p);
    await p.getByTestId('asteria-gm-hybrid-menu').getByRole('button',{name:'Combat',exact:true}).click();
    await p.getByTestId('asteria-dashboard-card-dropdown').getByRole('button',{name:'Open Combat Command Centre',exact:true}).click();
    await p.locator('[data-testid="site-gm-combat"]').waitFor();
    await p.locator('[data-testid="site-gm-combat-command-centre"]').waitFor();
    await p.getByText('Prepared Encounters',{exact:true}).first().waitFor();
    await p.screenshot({path:path.join(root,'08-gm-combat-command-centre.png'),fullPage:true});
    const panels=await p.locator('[data-combat-panel]').count();
    assert.equal(panels,13,'All 13 combat systems should appear in a new workspace');
    const appearance=await p.locator('[data-combat-panel="controls"]').evaluate(panel=>{
      const shell=getComputedStyle(panel),bar=getComputedStyle(panel.querySelector('header'));
      const colour=value=>value.replaceAll(' ','');
      return {
        display:shell.display,visibility:shell.visibility,
        width:Math.round(panel.getBoundingClientRect().width),
        height:Math.round(panel.getBoundingClientRect().height),
        background:colour(shell.backgroundColor),border:colour(shell.borderTopColor),
        borderWidth:shell.borderTopWidth,
        headerBackground:colour(bar.backgroundColor),
        headerBorderWidth:bar.borderBottomWidth
      };
    });
    assert.ok(appearance.width>=150&&appearance.height>=100,
      'Combat panel has no physical window bounds: '+JSON.stringify(appearance));
    assert.notEqual(appearance.background,'rgba(0,0,0,0)',
      'Combat window background is invisible: '+JSON.stringify(appearance));
    assert.notEqual(appearance.headerBackground,'rgba(0,0,0,0)',
      'Combat window header is invisible: '+JSON.stringify(appearance));
    assert.equal(appearance.borderWidth,'1px',
      'Combat window border is missing: '+JSON.stringify(appearance));
    assert.equal(appearance.headerBorderWidth,'1px',
      'Combat window header divider is missing: '+JSON.stringify(appearance));
    await p.getByRole('button',{name:'Encounter Builder',exact:true}).click();
    await p.getByRole('complementary',{name:'Combat Command Centre tools'}).getByRole('button',{name:/Encounter Setup/}).click();
    assert.equal(await p.locator('[data-combat-panel="setup"]').count(),0,
      'Panel library must hide the selected window without deleting gameplay');
    await p.getByRole('complementary',{name:'Combat Command Centre tools'}).getByRole('button',{name:/Encounter Setup/}).click();
    assert.equal(await p.locator('[data-combat-panel="setup"]').count(),1,
      'Panel library must restore the same original freeform window');
    await p.getByRole('button',{name:'Prepared Encounters',exact:true}).click();
    assert.equal(await p.locator('[data-combat-panel="prepared"]').count(),1,
      'Prepared encounter library must be inside the original freeform canvas');
    const modes=p.getByRole('group',{name:'Combat workspace quick layouts'});
    await modes.getByRole('button',{name:'Encounter Preparation'}).click();
    assert.equal(await p.locator('[data-combat-panel]').count(),7,
      'Preparation quick layout should show seven relevant systems');
    await modes.getByRole('button',{name:'Show all 13 panels'}).click();
    assert.equal(await p.locator('[data-combat-panel]').count(),13,
      'Show all panels must restore every combat system');
    await modes.getByRole('button',{name:'Reset layout'}).click();
    await p.getByRole('group',{name:'Confirm combat layout reset'})
      .getByRole('button',{name:'Cancel'}).click();
    assert.equal(await p.locator('[data-combat-panel]').count(),13,
      'Cancelling layout reset must preserve combat windows');
    const edit=p.locator('[data-testid="site-combat-layout-edit"]');
    await edit.waitFor();
    assert.ok(await edit.isEnabled(),'Desktop combat workspace edit not enabled');
    await edit.click();
    await p.locator('[data-testid="site-combat-layout-save"]').click();
    await edit.waitFor();
  });
  await scenario('09-gm-combat-mobile',{width:390,height:844},async p=>{
    await gm(p);
    await p.getByTestId('asteria-gm-hybrid-menu').getByRole('button',{name:'Combat',exact:true}).click();
    await p.getByTestId('asteria-dashboard-card-dropdown').getByRole('button',{name:'Open Combat Command Centre',exact:true}).click();
    const windows=p.locator('[data-combat-panel]');
    await windows.first().waitFor();
    assert.equal(await windows.count(),13,'Mobile combat windows disappeared');
    const layout=await p.locator('[data-testid="site-gm-combat-command-centre"]').evaluate(el=>({
      mode:el.querySelector('[data-layout-mode]')?.dataset.layoutMode,
      panels:[...el.querySelectorAll('[data-combat-panel]')].slice(0,3).map(w=>({
        position:getComputedStyle(w).position,width:Math.round(w.getBoundingClientRect().width)
      })),
      viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth
    }));
    assert.equal(layout.mode,'stacked','Mobile needs stacked windows');
    assert.ok(layout.panels.every(w=>w.position==='relative'&&w.width>140),
      'Mobile combat windows cannot be read: '+JSON.stringify(layout));
    assert.ok(layout.scrollWidth<=layout.viewport,
      'Combat workspace causes horizontal overflow: '+JSON.stringify(layout));
    await p.screenshot({path:path.join(root,'09-gm-combat-mobile.png'),fullPage:true});
  });
  console.log('PHASE 1.2 RESULT:',results.filter(r=>r.status==='pass').length,'passed,',failures.length,'failed.');
  save();
  await browser.close();
  // local-static-server.js opens a persistent HTTP listener; terminate once
  // the screenshots and structured results have been flushed to disk.
  process.exit(failures.length?1:0);
})().catch(async err=>{
  console.error('PHASE 1.2 FATAL:',err);
  failures.push('harness');
  results.push({name:'harness',status:'fail',detail:String(err.stack||err)});
  save();
  try {await browser?.close();}catch(_){}
  process.exit(1);
});
