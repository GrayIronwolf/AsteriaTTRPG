/* Milestone 1 closeout: 14 fixture-browser acceptance checks; no production network. 
 * Phase 1.2: read-only local browser audit of the recovered hybrid Asteria website.
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
// The fixture migrates a legacy Player grid: Weapons is now inside Armour.
const PLAYER_FIXTURE_IDS=['armour','quick','talents','spells','skills','conditions',
  'effects','specialDamage','rest','currency','quests','journal','party','activityLog'];
// Optional Combat tools start hidden and are opened through the existing library.
const COMBAT_INITIAL_IDS=['resources','controls','initiative','actor','map','queue',
  'prepared','enemyTracker'];
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
    panels:document.querySelectorAll('.react-dashboard-freeform-grid [data-panel-id], [data-testid="site-player-main-canvas"] [data-canvas-window]').length,
    title:document.title
  }));
}
(async()=>{
  browser=await chromium.launch({headless:true,args:['--no-sandbox'],
    ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{})});
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
    const canvas=p.getByTestId('site-player-main-canvas');
    await canvas.waitFor();
    const ids=await canvas.locator('[data-canvas-window]').evaluateAll(nodes=>
      nodes.map(node=>node.dataset.canvasWindow));
    assert.deepEqual([...ids].sort(),[...PLAYER_FIXTURE_IDS].sort(),
      'The migrated Player fixture must retain core panels and combine Weapons with Armour');
    assert.ok(ids.includes('activityLog')&&ids.includes('rest')&&ids.includes('currency'),
      'Player core windows or original Action Log disappeared');
    assert.equal(await p.locator('.react-character-dashboard .react-dashboard-freeform-grid').count(),0,
      'The Player grid editor must be replaced, not left beneath the canvas');
    const m=await metrics(p);
    assert.equal(m.panels,PLAYER_FIXTURE_IDS.length,'Missing Player canvas panels: '+JSON.stringify(m));
    await p.screenshot({path:path.join(root,'03-player-dashboard.png'),fullPage:true});
    console.log('PLAYER METRICS',JSON.stringify(m));
  });
  await scenario('04-player-mobile',{width:390,height:844},async p=>{
    await player(p);
    await checkMenuButtonSkin(p,'player');
    const canvas=p.getByTestId('site-player-main-canvas');
    await canvas.waitFor();
    assert.equal(await canvas.locator('[data-layout-mode="stacked"]').count(),1);
    const m=await metrics(p);
    await p.screenshot({path:path.join(root,'04-player-mobile.png'),fullPage:true});
    assert.ok(m.scrollWidth<=m.viewport,'Player dashboard horizontal overflow: '+JSON.stringify(m));
    assert.equal(m.panels,PLAYER_FIXTURE_IDS.length,'Player panels missing on mobile: '+JSON.stringify(m));
    console.log('PLAYER MOBILE METRICS',JSON.stringify(m));
  });
  await scenario('04b-player-canvas-window-management',{width:1440},async p=>{
    await player(p);
    const canvas=p.getByTestId('site-player-main-canvas');
    await canvas.waitFor();
    const plus=p.getByTestId('player-canvas-add-window');
    await plus.click();
    const library=p.getByRole('complementary',{name:'Player Dashboard Window Library'});
    await library.waitFor();
    await library.getByRole('button',{name:'Quick Views'}).click();
    const toggle=library.getByRole('button',{name:/Combat Overview/});
    assert.equal(await toggle.getAttribute('aria-pressed'),'false');
    await toggle.click();
    assert.equal(await canvas.locator('[data-canvas-window]').count(),PLAYER_FIXTURE_IDS.length+1,
      'Adding Player Combat Overview must mount a real canvas window');
    await toggle.click();
    assert.equal(await canvas.locator('[data-canvas-window]').count(),PLAYER_FIXTURE_IDS.length,
      'Removing an optional Player window must restore the original set');
    await library.getByRole('button',{name:'Close Dashboard Windows menu'}).click();
    assert.equal(await p.getByRole('button',{name:'Undo canvas change'}).isEnabled(),true);
    await p.getByRole('button',{name:'Undo canvas change'}).click();
    assert.equal(await canvas.locator('[data-canvas-window]').count(),PLAYER_FIXTURE_IDS.length+1);
    await p.getByRole('button',{name:'Redo canvas change'}).click();
    assert.equal(await canvas.locator('[data-canvas-window]').count(),PLAYER_FIXTURE_IDS.length);
    await p.screenshot({path:path.join(root,'04b-player-canvas-window-management.png'),fullPage:true});
  });
  await scenario('05-gm-dashboard-canvas',{width:1440},async p=>{
    await gm(p);
    await checkMenuButtonSkin(p,'gm');
    const canvas=p.getByTestId('site-gm-main-canvas');
    await canvas.waitFor();
    const windows=canvas.locator('[data-canvas-window]');
    const ids=await windows.evaluateAll(nodes=>nodes.map(el=>el.dataset.canvasWindow));
    const expected=['gmResources','combatOverview','requestsOverview','preparedOverview',
      'quickNotes','questTracker','calendarWeather','sessionOverview'];
    assert.deepEqual(ids,expected,'GM Main must start with the eight approved quick windows');
    assert.equal(await p.getByTestId('gm-player-resources-strip').count(),0,
      'GM Main must not keep the old fixed Resources strip');
    assert.equal(await p.locator('.react-gm-dashboard .react-dashboard-freeform-grid').count(),0,
      'GM Main must replace the legacy grid, not render it under a new canvas');
    assert.ok(await canvas.getByTestId('gm-combat-party-resources')
      .locator('[data-resource-character]').count()>=2,
      'Reuse live Resources cards within the GM Main window');
    await p.screenshot({path:path.join(root,'05-gm-dashboard.png'),fullPage:true});
  });
  await scenario('06-gm-canvas-window-management',{width:1440},async p=>{
    await gm(p);
    const canvas=p.getByTestId('site-gm-main-canvas');
    await canvas.waitFor();
    const plus=p.getByTestId('gm-canvas-add-window');
    await plus.click();
    const library=p.getByRole('complementary',{name:'GM Dashboard Window Library'});
    await library.waitFor();
    await library.getByRole('button',{name:'GM Controls & Rewards'}).click();
    const toggle=library.getByRole('button',{name:/XP Distribution/});
    assert.equal(await toggle.getAttribute('aria-pressed'),'false');
    await toggle.click();
    assert.equal(await canvas.locator('[data-canvas-window]').count(),9,
      'Adding XP Distribution must create a real canvas window');
    assert.equal(await toggle.getAttribute('aria-pressed'),'true');
    await toggle.click();
    assert.equal(await canvas.locator('[data-canvas-window]').count(),8,
      'Removing a GM window must hide it without deleting its data');
    await toggle.click();
    await library.getByRole('button',{name:'Close Dashboard Windows menu'}).click();
    await p.getByRole('button',{name:'Undo canvas change'}).click();
    assert.equal(await canvas.locator('[data-canvas-window]').count(),8,
      'Canvas undo should restore the previous GM window selection');
    await p.getByRole('button',{name:'Redo canvas change'}).click();
    assert.equal(await canvas.locator('[data-canvas-window]').count(),9,
      'Canvas redo should reapply the selected GM window');
    await p.screenshot({path:path.join(root,'06-gm-canvas-window-management.png'),fullPage:true});
  });
  await scenario('07-gm-mobile-canvas',{width:390,height:844},async p=>{
    await gm(p);
    const canvas=p.getByTestId('site-gm-main-canvas');
    await canvas.waitFor();
    assert.equal(await canvas.locator('[data-canvas-window]').count(),8);
    assert.equal(await canvas.locator('[data-layout-mode="stacked"]').count(),1);
    assert.equal(await p.getByTestId('gm-player-resources-strip').count(),0);
    const m=await metrics(p);
    await p.screenshot({path:path.join(root,'07-gm-mobile.png'),fullPage:true});
    assert.ok(m.scrollWidth<=m.viewport,
      'GM canvas must not cause horizontal overflow on mobile: '+JSON.stringify(m));
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
    const panels=await p.locator('[data-combat-panel]').evaluateAll(nodes=>nodes.map(node=>node.dataset.combatPanel));
    assert.deepEqual([...panels].sort(),[...COMBAT_INITIAL_IDS].sort(),
      'Combat must show the approved default windows, including GM resources and enemy tracking');
    const appearance=await p.locator('[data-combat-panel="controls"]').evaluate(panel=>{
      const shell=getComputedStyle(panel),bar=getComputedStyle(panel.querySelector('header'));
      const colour=value=>value.replaceAll(' ','');
      return {
        display:shell.display,visibility:shell.visibility,
        width:Math.round(panel.getBoundingClientRect().width),
        height:Math.round(panel.getBoundingClientRect().height),
        layoutWidth:parseFloat(shell.width),layoutHeight:parseFloat(shell.height),
        background:colour(shell.backgroundColor),border:colour(shell.borderTopColor),
        borderWidth:shell.borderTopWidth,
        headerBackground:colour(bar.backgroundColor),
        headerImage:bar.backgroundImage,
        headerBorderWidth:bar.borderBottomWidth
      };
    });
    assert.ok(appearance.width>0&&appearance.height>0&&
      appearance.layoutWidth>=150&&appearance.layoutHeight>=100,
      'Combat panel has no physical window bounds: '+JSON.stringify(appearance));
    assert.notEqual(appearance.background,'rgba(0,0,0,0)',
      'Combat window background is invisible: '+JSON.stringify(appearance));
    assert.ok(appearance.headerBackground!=='rgba(0,0,0,0)'||
      appearance.headerImage!=='none',
      'Combat window header has no visible fill or bezel gradient: '+JSON.stringify(appearance));
    assert.ok(parseFloat(appearance.borderWidth)>=1,
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
    const setupToggle=tools.getByRole('button',{name:/Encounter Setup/});
    assert.equal(await setupToggle.getAttribute('aria-pressed'),'false');
    await setupToggle.click();
    assert.equal(await p.locator('[data-combat-panel="setup"]').count(),1,
      'The optional Encounter Setup window must open from the library');
    await setupToggle.click();
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
      'Lock Canvas must be reachable in the top-right toolbar');
    const lockedHeader=p.getByTestId('combat-drag-header-controls');
    await lockedHeader.scrollIntoViewIfNeeded();
    const initialLocked=await p.locator('[data-combat-panel="controls"]').evaluate(el=>
      el.style.getPropertyValue('--combat-x'));
    const lockedDrag=await lockedHeader.boundingBox();
    await p.mouse.move(lockedDrag.x+35,lockedDrag.y+lockedDrag.height/2);
    await p.mouse.down();
    await p.mouse.move(lockedDrag.x+85,lockedDrag.y+lockedDrag.height/2,{steps:5});
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
    },{x:drag.x+35,y:drag.y+drag.height/2});
    await p.mouse.move(drag.x+35,drag.y+drag.height/2);
    await p.mouse.down();
    await p.mouse.move(drag.x+85,drag.y+drag.height/2,{steps:5});
    await p.mouse.up();
    console.log('COMBAT CANVAS DRAG HIT',JSON.stringify(hit));
    await p.locator('[data-combat-panel="controls"]').waitFor();
    const changed=await p.locator('[data-combat-panel="controls"]').evaluate(panel=>({
      x:panel.style.getPropertyValue('--combat-x'),
      y:panel.style.getPropertyValue('--combat-y')
    }));
    assert.notDeepEqual(changed,before,'Dragging title bar must move a panel without customisation mode: '+JSON.stringify({hit,before,changed}));
    // Keep both windows within the visible browser viewport. Off-viewport
    // synthetic mouse release is platform-dependent and is not a fair
    // acceptance test for window-to-window canvas overlap.
    await header.evaluate(el=>el.scrollIntoView({block:'center',inline:'nearest'}));
    await header.hover({position:{x:35,y:drag.height/2}});
    const second=await header.boundingBox();
    const nextHit=await p.evaluate(({x,y})=>({
      tag:document.elementFromPoint(x,y)?.tagName,
      panel:document.elementFromPoint(x,y)?.closest('[data-combat-panel]')?.dataset.combatPanel
    }),{x:second.x+35,y:second.y+second.height/2});
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
    const releaseY=second.y+second.height/2+dy;
    assert.ok(releaseY>0&&releaseY<(p.viewportSize()?.height||900)-10,
      'Canvas overlap test needs a visible release location: '+JSON.stringify({second,target,current,releaseY}));
    await header.hover({position:{x:35,y:drag.height/2}});
    await p.mouse.down();
    console.log('SECOND DRAG EVENTS',JSON.stringify(await p.evaluate(()=>
      window.__combatDragEvents)));
    assert.equal(await canvas.getAttribute('data-dragging-window'),'controls',
      'Direct header pointer must start a combat drag');
    // Aim directly at the initiative panel, rather than assuming its position.
    await p.mouse.move(second.x+35+dx,second.y+second.height/2+dy,{steps:20});
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
    // React commits the final layout on release. Read painted geometry only
    // after the browser has processed layout and one complete paint cycle.
    await p.evaluate(()=>new Promise(resolve=>
      requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    assert.equal(await canvas.getAttribute('data-dragging-window'),null,
      'Released drag must not leave a captured canvas gesture');
    const freeOverlap=await p.locator('[data-combat-panel="controls"]').evaluate(panel=>{
      const other=panel.parentElement.querySelector('[data-combat-panel="initiative"]');
      const a=panel.getBoundingClientRect(),b=other.getBoundingClientRect();
      return {x:panel.style.getPropertyValue('--combat-x'),
        y:panel.style.getPropertyValue('--combat-y'),
        dragged:{x:a.x,y:a.y,w:a.width,h:a.height},
        target:{x:b.x,y:b.y,w:b.width,h:b.height},
        computed:{left:getComputedStyle(panel).left,top:getComputedStyle(panel).top,
          transform:getComputedStyle(panel).transform,inlineTransform:panel.style.transform},
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
    assert.deepEqual((await windows.evaluateAll(nodes=>nodes.map(node=>node.dataset.combatPanel))).sort(),
      [...COMBAT_INITIAL_IDS].sort(),'Mobile combat windows or GM resources disappeared');
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
  await scenario('09b-gm-encounter-recovery-controls',{width:390,height:844},async p=>{
    await gm(p);
    await p.getByTestId('asteria-gm-hybrid-menu')
      .getByRole('button',{name:'Combat',exact:true}).click();
    await p.getByTestId('asteria-dashboard-card-dropdown')
      .getByRole('button',{name:'Open Combat Command Centre',exact:true}).click();
    const combat=p.getByTestId('site-gm-combat');
    await combat.getByTestId('site-combat-tools-toggle').click();
    const tools=combat.getByRole('complementary',{name:'Combat Command Centre tools'});
    await tools.getByRole('button',{name:'Encounter Builder',exact:true}).press('Enter');
    const setup=combat.locator('[data-combat-panel="setup"]');
    if(!await setup.count())await tools.getByRole('button',{name:/Encounter Setup/}).press('Enter');
    const history=combat.getByTestId('site-gm-encounter-history');
    if(!await history.count()){
      await tools.getByRole('button',{name:'Rewards & History',exact:true}).press('Enter');
      if(!await history.count())await tools.getByRole('button',{name:/Encounter Completion & History/}).press('Enter');
    }
    await combat.getByRole('button',{name:'Close Combat Tools menu'}).press('Enter');
    const creature=setup.getByRole('group',{name:'Custom Creature / NPC'});
    await creature.getByLabel('Name',{exact:true}).fill('Recovery test guard');
    await creature.getByRole('button',{name:'Add Custom Creature'}).click();
    const controls=combat.locator('[data-combat-panel="controls"]');
    await controls.getByRole('button',{name:'Start Combat',exact:true}).click();
    await controls.getByRole('button',{name:'Pause Combat',exact:true}).click();
    await controls.getByRole('button',{name:'Resume Combat',exact:true}).waitFor();
    assert.equal(await controls.getByRole('button',{name:'Advance Turn',exact:true}).isDisabled(),true);
    await controls.getByRole('button',{name:'Resume Combat',exact:true}).click();
    await combat.getByText('GM encounter snapshots',{exact:true}).click();
    await combat.getByLabel('Snapshot name',{exact:true}).fill('Before the guard acts');
    await combat.getByRole('button',{name:'Save Snapshot',exact:true}).click();
    await combat.getByText(/Before the guard acts ·/).waitFor();
    p.on('dialog',dialog=>dialog.accept());
    await controls.getByRole('button',{name:'End Combat',exact:true}).click();
    await history.getByLabel('Reason for reopening').fill('Continue the original encounter');
    await history.getByRole('button',{name:'Reopen Encounter',exact:true}).click();
    await controls.getByRole('button',{name:'Resume Combat',exact:true}).waitFor();
    assert.equal(await controls.getByRole('button',{name:'Advance Turn',exact:true}).isDisabled(),true);
    await history.getByText('Completion 1 · Reopened',{exact:true}).waitFor();
  });
  await scenario('10-gm-combat-camera-and-player-resources',{width:1440,height:900},async p=>{
    await gm(p);
    await p.getByTestId('asteria-gm-hybrid-menu')
      .getByRole('button',{name:'Combat',exact:true}).click();
    await p.getByTestId('asteria-dashboard-card-dropdown')
      .getByRole('button',{name:'Open Combat Command Centre',exact:true}).click();
    const canvas=p.locator('[aria-label="Combat freeform canvas"]');
    await canvas.waitFor();
    assert.equal(await p.getByTestId('gm-player-resources-strip').count(),0,
      'Combat must replace the fixed GM resources strip instead of duplicating it');
    const party=p.getByTestId('gm-combat-party-resources');
    await party.waitFor();
    const roster=party.locator('[data-resource-character]');
    assert.ok(await roster.count()>=2,'Live GM party cards must appear');
    assert.ok(await roster.first().locator('.react-party-card-portrait').count()===1,
      'Each resources card must include a portrait');
    assert.ok(await party.getByRole('button',{name:/Reorder/}).count()>=2,
      'Cards need independent three-line reorder handles');
    const originalIds=await roster.evaluateAll(nodes=>nodes.map(node=>node.dataset.resourceCharacter));
    await party.getByRole('button',{name:/Reorder/}).first().press('Alt+ArrowDown');
    const changedIds=await roster.evaluateAll(nodes=>nodes.map(node=>node.dataset.resourceCharacter));
    assert.notDeepEqual(changedIds,originalIds,
      'The card handle must reorder live character cards without dragging the window');
    const controls=p.getByTestId('combat-drag-header-controls');
    const positionBefore=await p.locator('[data-combat-panel="controls"]')
      .evaluate(el=>[el.style.getPropertyValue('--combat-x'),el.style.getPropertyValue('--combat-y')]);
    await controls.dblclick({position:{x:34,y:(await controls.boundingBox()).height/2}});
    const returnFocus=p.getByRole('button',{name:'Return from Encounter Controls'});
    await returnFocus.waitFor();
    await returnFocus.click();
    const positionAfter=await p.locator('[data-combat-panel="controls"]')
      .evaluate(el=>[el.style.getPropertyValue('--combat-x'),el.style.getPropertyValue('--combat-y')]);
    assert.deepEqual(positionAfter,positionBefore,
      'Double-click focus must not modify saved window coordinates');
    const canvasRect=await canvas.boundingBox();
    const beforeScroll=await p.evaluate(()=>window.scrollY);
    await p.mouse.move(canvasRect.x+canvasRect.width-18,canvasRect.y+canvasRect.height/2);
    await p.mouse.wheel(0,-120);
    assert.equal(await p.evaluate(()=>window.scrollY),beforeScroll,
      'Zooming inside the canvas must not move the website page');
    await p.getByTestId('site-combat-fit-all').click();
    await p.getByTestId('combat-drag-header-resources').dblclick();
    await p.getByRole('button',{name:'Return from GM Player Resources'}).waitFor();
    await party.locator('[data-resource-character]').first().dblclick({position:{x:80,y:40}});
    await p.getByTestId('gm-canvas-character-dashboard').waitFor();
    assert.ok(await p.getByTestId('gm-canvas-character-dashboard')
      .locator('.react-character-dashboard').count()===1,
      'Overlay must mount the real Player Dashboard, not a replacement preview');
    await p.getByRole('button',{name:'Close dialog'}).click();
    assert.equal(await p.getByTestId('gm-canvas-character-dashboard').count(),0,
      'Close should restore the workspace and remove the overlay');
    await p.reload({waitUntil:'domcontentloaded'});
    await p.waitForFunction(()=>window.AsteriaReactMigration?.available);
    await p.evaluate(()=>window.AsteriaReactMigration.openGM('demo-campaign'));
    await p.getByTestId('asteria-gm-hybrid-menu')
      .getByRole('button',{name:'Combat',exact:true}).click();
    await p.getByTestId('asteria-dashboard-card-dropdown')
      .getByRole('button',{name:'Open Combat Command Centre',exact:true}).click();
    const restoredIds=await p.getByTestId('gm-combat-party-resources')
      .locator('[data-resource-character]')
      .evaluateAll(nodes=>nodes.map(node=>node.dataset.resourceCharacter));
    assert.deepEqual(restoredIds,changedIds,
      'Reordered party resources must persist across a reload');
    await p.screenshot({path:path.join(root,'10-gm-combat-camera-and-player-resources.png'),fullPage:true});
  });

  // Milestone 1: browser viewport and canvas interaction evidence on the
  // CURRENT source tree. The fixture never connects to production Firebase.
  await scenario('11-player-viewport-and-low-zoom',{width:1440,height:900},async p=>{
    await player(p);
    const matrix=[];
    for(const width of [320,360,390,768,1280,1920]){
      await p.setViewportSize({width,height:900});
      await p.waitForTimeout(180);
      const reading=await p.getByTestId('site-player-main-canvas').evaluate(host=>{
        const surface=host.querySelector('[data-layout-mode]');
        return {
          viewport:innerWidth,hostWidth:Math.round(host.getBoundingClientRect().width),
          mode:surface?.dataset.layoutMode,
          windows:host.querySelectorAll('[data-canvas-window]').length,
          overflowPx:Math.max(0,document.documentElement.scrollWidth-innerWidth)
        };
      });
      matrix.push(reading);
      assert.equal(reading.windows,PLAYER_FIXTURE_IDS.length,'Missing Player windows at '+width+'px');
      assert.ok(reading.hostWidth>0,'Player canvas has zero width at '+width+'px');
      if(reading.hostWidth<700)assert.equal(reading.mode,'stacked',
        'Player canvas should stack in a narrow container at '+width+'px');
    }
    console.log('MILESTONE-1 PLAYER VIEWPORT MATRIX',JSON.stringify(matrix));
    await p.setViewportSize({width:1440,height:900});
    await p.waitForFunction(()=>document.querySelector(
      '[data-testid="site-player-main-canvas"] [data-layout-mode="freeform"]'));
    const canvas=p.getByTestId('site-player-main-canvas');
    const readout=p.locator('output[aria-label="Canvas zoom"]');
    assert.equal((await readout.textContent()).trim(),'50%',
      'New Player canvas should open at 50% zoom');
    for(let i=0;i<5;i++)await p.getByRole('button',{name:'Zoom out of canvas'}).click();
    assert.equal(await canvas.locator('[data-detail-level]').getAttribute('data-detail-level'),
      'preview','Adaptive low zoom must deliberately enter preview mode');
    assert.equal(await canvas.locator('[data-canvas-window="armour"] [data-combat-scroll]')
      .getAttribute('inert'),null,'Low zoom must retain interactive window content');
    assert.equal(await canvas.locator('[data-canvas-window="armour"] [data-combat-scroll]')
      .evaluate(el=>getComputedStyle(el).pointerEvents),'auto',
      'Low zoom must not disable pointer interaction');
    for(let i=0;i<5;i++)await p.getByRole('button',{name:'Zoom into canvas'}).click();
    assert.equal(await canvas.locator('[data-canvas-window="armour"] [data-combat-scroll]')
      .getAttribute('inert'),null,'Returning to readable zoom should restore interactions');
    await p.screenshot({path:path.join(root,'11-player-viewport-and-low-zoom.png'),fullPage:true});
  });
  await scenario('12-gm-viewport-matrix',{width:1440,height:900},async p=>{
    await gm(p);
    const matrix=[];
    for(const width of [320,360,390,768,1280,1920]){
      await p.setViewportSize({width,height:900});
      await p.waitForTimeout(180);
      const reading=await p.getByTestId('site-gm-main-canvas').evaluate(host=>{
        const surface=host.querySelector('[data-layout-mode]');
        return {
          viewport:innerWidth,hostWidth:Math.round(host.getBoundingClientRect().width),
          mode:surface?.dataset.layoutMode,
          windows:host.querySelectorAll('[data-canvas-window]').length,
          overflowPx:Math.max(0,document.documentElement.scrollWidth-innerWidth)
        };
      });
      matrix.push(reading);
      assert.equal(reading.windows,8,'Missing GM windows at '+width+'px');
      assert.ok(reading.hostWidth>0,'GM canvas has zero width at '+width+'px');
      if(reading.hostWidth<700)assert.equal(reading.mode,'stacked',
        'GM canvas should stack in a narrow container at '+width+'px');
    }
    console.log('MILESTONE-1 GM VIEWPORT MATRIX',JSON.stringify(matrix));
    await p.setViewportSize({width:390,height:844});
    await p.screenshot({path:path.join(root,'12-gm-viewport-matrix.png'),fullPage:true});
  });
  await scenario('13-gm-player-manager-legacy-gates',{width:1440,height:900},async p=>{
    await gm(p);
    await p.getByTestId('asteria-gm-hybrid-menu')
      .getByRole('button',{name:'Campaign',exact:true}).click();
    await p.getByTestId('asteria-dashboard-card-dropdown')
      .getByRole('button',{name:'Open Player Manager',exact:true}).click();
    const manager=p.getByTestId('gm-player-manager');
    await manager.waitFor();
    assert.match(await manager.innerText(),/Legacy Membership/,
      'Fixture campaign must not be portrayed as activated canonical membership');
    await manager.getByRole('button',{name:'Invitations',exact:true}).click();
    assert.match(await manager.innerText(),/legacy campaign uses its existing membership system/i,
      'Invitations should explain why a legacy campaign cannot use v2 controls');
    assert.equal(await manager.getByRole('button',{name:'Create secure invitation'}).count(),0,
      'Fixture must not expose disabled secure invitation mutation');
    await manager.getByRole('button',{name:'Roles & Access',exact:true}).click();
    assert.equal(await manager.getByRole('button',{name:'Remove',exact:true}).count(),0,
      'Fixture must not expose disabled canonical member removal');
    await p.screenshot({path:path.join(root,'13-gm-player-manager-legacy-gates.png'),fullPage:true});
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
