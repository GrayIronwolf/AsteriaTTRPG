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
    const strip=p.getByTestId('gm-player-resources-strip');
    assert.equal(await strip.count(),1,'GM Player Resources strip missing');
    const placement=await p.locator('.react-workspace-main').evaluate(root=>{
      const header=root.querySelector('.react-workspace-header');
      const party=root.querySelector('[data-testid="gm-player-resources-strip"]');
      const menu=root.querySelector('[data-testid="asteria-gm-hybrid-menu"]');
      return {headerBottom:header.getBoundingClientRect().bottom,
        partyTop:party.getBoundingClientRect().top,
        partyWidth:party.getBoundingClientRect().width,
        menuTop:menu.getBoundingClientRect().top,
        search:!!root.querySelector('.asteria-gm-unified-search'),
        toolkit:!!root.querySelector('.react-gm-toolkit-quick')};
    });
    assert.ok(placement.partyTop>=placement.headerBottom-2,
      'Player Resources must be immediately below the campaign/session header');
    assert.ok(placement.menuTop>=placement.partyTop,
      'Player Resources must be above GM navigation');
    assert.ok(placement.partyWidth>600,'Player Resources must span the GM page');
    assert.equal(placement.search,false,'Remove redundant GM search launcher');
    assert.equal(placement.toolkit,false,'Remove redundant GM Toolkit quick panel');
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
    const drawerToggle=p.getByTestId('site-combat-tools-toggle');
    await drawerToggle.waitFor();
    assert.equal(await drawerToggle.getAttribute('aria-expanded'),'false',
      'The Combat Tools drawer should start closed');
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
    assert.equal(await p.locator('[aria-label="Combat workspace quick layouts"]').count(),0,
      'Removed quick layouts must not remain on the page');
    assert.equal(await p.getByText('Restore windows:',{exact:true}).count(),0,
      'No redundant restore-windows row should remain');
    assert.equal(await p.getByRole('button',{name:'Auto-arrange'}).count(),0,
      'No accidental auto-arrange action should remain');
    const canvas=p.locator('[aria-label="Combat freeform canvas"]');
    assert.ok(await canvas.evaluate(el=>el.getBoundingClientRect().width>1000),
      'Canvas should occupy the whole GM content width, not a sidebar grid');
    await drawerToggle.click();
    const tools=p.getByRole('complementary',{name:'Combat Command Centre tools'});
    await tools.waitFor({state:'visible'});
    await tools.getByRole('button',{name:'Encounter Builder',exact:true}).click();
    await tools.getByRole('button',{name:/Encounter Setup/}).click();
    assert.equal(await p.locator('[data-combat-panel="setup"]').count(),0,
      'Panel Library must hide a window without deleting its data');
    await tools.getByRole('button',{name:/Encounter Setup/}).click();
    assert.equal(await p.locator('[data-combat-panel="setup"]').count(),1,
      'Panel Library must restore a hidden window');
    await tools.getByRole('button',{name:'Prepared Encounters',exact:true}).click();
    assert.equal(await p.locator('[data-combat-panel="prepared"]').count(),1,
      'Prepared encounters must remain mounted');
    await p.getByRole('button',{name:'Close Combat Tools menu'}).click();
    assert.equal(await drawerToggle.getAttribute('aria-expanded'),'false');
    const lock=p.getByTestId('site-combat-canvas-lock');
    await lock.click();
    assert.equal(await lock.getAttribute('aria-pressed'),'true',
      'Lock Canvas must be reachable as a top-left icon');
    const lockedHeader=p.getByTestId('combat-drag-header-controls');
    await lockedHeader.scrollIntoViewIfNeeded();
    const initialLocked=await p.locator('[data-combat-panel="controls"]').evaluate(el=>
      el.style.getPropertyValue('--combat-x'));
    const lockedDrag=await lockedHeader.boundingBox();
    await p.mouse.move(lockedDrag.x+35,lockedDrag.y+20);
    await p.mouse.down();
    await p.mouse.move(lockedDrag.x+85,lockedDrag.y+20,{steps:5});
    await p.mouse.up();
    assert.equal(await p.locator('[data-combat-panel="controls"]').evaluate(el=>
      el.style.getPropertyValue('--combat-x')),initialLocked,
      'Locked canvas must block panel moves');
    await lock.click();
    assert.equal(await lock.getAttribute('aria-pressed'),'false');
    assert.equal(await canvas.getAttribute('data-layout-mode'),'freeform');
    assert.ok(await p.getByTestId('site-combat-fit-all').isEnabled());
    const before=await p.locator('[data-combat-panel="controls"]').evaluate(panel=>({
      x:panel.style.getPropertyValue('--combat-x'),
      y:panel.style.getPropertyValue('--combat-y')
    }));
    assert.equal(await lock.getAttribute('aria-pressed'),'false');
    const header=p.getByTestId('combat-drag-header-controls');
    await header.scrollIntoViewIfNeeded();
    const drag=await header.boundingBox();
    const hit=await p.evaluate(({x,y})=>{
      const el=document.elementFromPoint(x,y);
      return {tag:el?.tagName,classes:String(el?.className||''),text:el?.textContent?.slice(0,100)};
    },{x:drag.x+35,y:drag.y+20});
    await p.mouse.move(drag.x+35,drag.y+20);
    await p.mouse.down();
    await p.mouse.move(drag.x+85,drag.y+20,{steps:5});
    await p.mouse.up();
    console.log('COMBAT CANVAS DRAG HIT',JSON.stringify(hit));
    await p.locator('[data-combat-panel="controls"]').waitFor();
    const changed=await p.locator('[data-combat-panel="controls"]').evaluate(panel=>({
      x:panel.style.getPropertyValue('--combat-x'),
      y:panel.style.getPropertyValue('--combat-y')
    }));
    assert.notDeepEqual(changed,before,'Dragging title bar must move a panel without customisation mode: '+JSON.stringify({hit,before,changed}));
    await header.scrollIntoViewIfNeeded();
    await header.hover({position:{x:35,y:20}});
    const second=await header.boundingBox();
    const nextHit=await p.evaluate(({x,y})=>({
      tag:document.elementFromPoint(x,y)?.tagName,
      panel:document.elementFromPoint(x,y)?.closest('[data-combat-panel]')?.dataset.combatPanel
    }),{x:second.x+35,y:second.y+20});
    assert.equal(nextHit.panel,'controls',
      'The second drag must begin over Encounter Controls, not the canvas background');
    console.log('SECOND DRAG HIT',JSON.stringify(nextHit));
    await canvas.evaluate(node=>{
      window.__combatDragEvents=[];
      for(const type of ['pointerdown','pointerup','pointercancel','lostpointercapture']){
        node.addEventListener(type,event=>window.__combatDragEvents.push({
          type,button:event.button,buttons:event.buttons,isPrimary:event.isPrimary,
          target:event.target.tagName,
          panel:event.target.closest('[data-combat-panel]')?.dataset.combatPanel||'',
          active:node.dataset.draggingWindow||''
        }),true);
      }
    });
    const target=await p.locator('[data-combat-panel="initiative"]').boundingBox();
    const current=await p.locator('[data-combat-panel="controls"]').boundingBox();
    const dx=Math.round(target.x-current.x);
    const dy=Math.round(target.y-current.y);
    await header.hover({position:{x:35,y:20}});
    await p.mouse.down();
    console.log('SECOND DRAG EVENTS',JSON.stringify(await p.evaluate(()=>
      window.__combatDragEvents)));
    assert.equal(await canvas.getAttribute('data-dragging-window'),'controls',
      'Direct header pointer must start a combat drag');
    // Aim directly at the initiative panel, rather than assuming its position.
    await p.mouse.move(second.x+35+dx,second.y+20+dy,{steps:20});
    await p.waitForFunction(()=>document.querySelector('[data-combat-panel="controls"]')
      ?.style.transform.includes('translate3d('),null,{timeout:2500});
    const preview=await p.locator('[data-combat-panel="controls"]').evaluate(panel=>({
      transform:panel.style.transform,
      y:panel.style.getPropertyValue('--combat-y'),
      zIndex:getComputedStyle(panel).zIndex
    }));
    assert.ok(preview.transform.includes('translate3d('),
      'Free movement must use compositor transform instead of rerendering geometry');
    assert.equal(preview.y,changed.y,
      'Pointer movements must not persist panel geometry before release');
    assert.ok(Number(preview.zIndex)>1,'Active dragged window must rise above other panels');
    await p.mouse.up();
    const freeOverlap=await p.locator('[data-combat-panel="controls"]').evaluate(panel=>{
      const other=panel.parentElement.querySelector('[data-combat-panel="initiative"]');
      const a=panel.getBoundingClientRect(),b=other.getBoundingClientRect();
      return {x:panel.style.getPropertyValue('--combat-x'),
        y:panel.style.getPropertyValue('--combat-y'),
        dragged:{x:a.x,y:a.y,w:a.width,h:a.height},
        target:{x:b.x,y:b.y,w:b.width,h:b.height},
        overlapped:a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top};
    });
    console.log('FREE OVERLAP GEOMETRY',JSON.stringify({current,target,dx,dy,freeOverlap}));
    assert.notEqual(freeOverlap.y,changed.y,'Panel must save its crossing movement on release');
    assert.equal(freeOverlap.overlapped,true,
      'Default canvas must allow moving across and overlapping another window');
    await p.getByRole('button',{name:'Zoom into canvas'}).click();
    assert.notEqual((await p.locator('output[aria-label="Canvas zoom"]').innerText()).trim(),'100%',
      'Zoom must change directly on the canvas');
    await p.getByTestId('site-combat-fit-all').click();
    await p.reload({waitUntil:'domcontentloaded'});
    await p.waitForFunction(()=>window.AsteriaReactMigration?.available);
    await p.evaluate(()=>window.AsteriaReactMigration.openGM('demo-campaign'));
    await p.getByTestId('asteria-gm-hybrid-menu').getByRole('button',{name:'Combat',exact:true}).click();
    await p.getByTestId('asteria-dashboard-card-dropdown')
      .getByRole('button',{name:'Open Combat Command Centre',exact:true}).click();
    const restored=await p.locator('[data-combat-panel="controls"]').evaluate(panel=>({
      x:panel.style.getPropertyValue('--combat-x'),
      y:panel.style.getPropertyValue('--combat-y')
    }));
    assert.deepEqual(restored,{x:freeOverlap.x,y:freeOverlap.y},
      'The last overlapped canvas position must persist across reload');
    await p.screenshot({path:path.join(root,'08-gm-combat-command-centre.png'),fullPage:true});
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
