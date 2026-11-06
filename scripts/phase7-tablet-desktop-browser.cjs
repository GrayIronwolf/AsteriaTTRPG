/* Opt-in headless browser verification of the tablet/desktop dashboard.
 * Fixture accounts are deterministic and do not authenticate to Firebase. */
const assert=require('node:assert/strict');
const path=require('node:path');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES
 ? path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
require('./local-static-server.js');
(async()=>{
 const browser=await chromium.launch({headless:true,
  ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{}),
  args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 const errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 const base='http://127.0.0.1:8123/?reactFixture=1';
 await page.goto(base,{waitUntil:'networkidle'});
 await page.waitForFunction(()=>window.AsteriaReactMigration?.available&&window.AsteriaFirebase?.getUser()?.uid==='player-demo');
 const widths=[768,900,1024,1280,1440,1920];
 async function check(role){
  const selector=role==='gm'?'.react-gm-dashboard':'.react-character-dashboard';
  for(const width of widths){
   await page.setViewportSize({width,height:900});
   await page.waitForTimeout(90);
   const result=await page.locator(selector).evaluate(dashboard=>{
    const nav=dashboard.querySelector('.react-workspace-main > .react-tabs');
    const selected=nav?.querySelector('[role="tab"][aria-selected="true"]');
    const n=nav?.getBoundingClientRect(),s=selected?.getBoundingClientRect();
    return {viewport:innerWidth,documentWidth:document.documentElement.scrollWidth,
      tabs:nav?.querySelectorAll('[role="tab"]').length||0,
      selectedVisible:!!(n&&s&&s.left>=n.left-2&&s.right<=n.right+2),
      sidebar:!!dashboard.querySelector('.react-workspace-sidebar'),
      panelCount:dashboard.querySelectorAll('.react-dashboard-freeform-grid > [data-panel-id]').length};
   });
   assert.ok(result.tabs>=5,role+' navigation at '+width);
   assert.equal(result.documentWidth<=width,true,role+' page overflow at '+width+': '+JSON.stringify(result));
   assert.equal(result.selectedVisible,true,role+' active tab clipped at '+width);
   if(role==='gm')assert.equal(result.sidebar,true,'GM party sidebar missing');
  }
  console.log('PASS '+role+' tablet/desktop dashboard, '+widths.join('/')+' px');
 }
 await page.evaluate(()=>window.AsteriaReactMigration.openCharacter('demo-campaign','kael'));
 await page.locator('.react-character-dashboard').waitFor();
 // Select a right-hand tab, then narrow the window without changing the tab.
 await page.getByRole('tab',{name:'Inventory',exact:true}).first().click();
 await check('player');
 await page.reload({waitUntil:'networkidle'});
 await page.waitForFunction(()=>window.AsteriaReactMigration?.available&&window.AsteriaFirebase?.getUser()?.uid==='player-demo');
 await page.evaluate(()=>window.AsteriaReactMigration.openGM('demo-campaign'));
 await page.locator('.react-gm-dashboard').waitFor();
 await page.getByRole('tab',{name:'World Systems',exact:true}).first().click();
 await check('gm');
 await page.getByRole('tab',{name:'Dashboard Settings',exact:true}).first().click();
 await page.getByRole('button',{name:'Open Visual Grid Editor'}).click();
 const editor=page.getByRole('dialog',{name:'Dashboard visual grid editor'});
 await editor.waitFor();
 const portal=await editor.evaluate(el=>({
   parent:el.parentElement?.tagName,
   viewportWidth:el.getBoundingClientRect().width,
   viewportHeight:el.getBoundingClientRect().height,
   layer:getComputedStyle(el).position
 }));
 assert.equal(portal.parent,'BODY','Grid editor must be portalled outside settings stacking context');
 assert.equal(portal.layer,'fixed');
 assert.ok(portal.viewportWidth>=1900);
 await editor.getByRole('button',{name:'Cancel layout changes'}).click();
 assert.equal(await editor.count(),0);
 console.log('PASS visual editor portal above desktop/tablet settings');
 assert.deepEqual(errors,[],'No browser runtime errors');
 await browser.close();
 process.exit(0);
})().catch(error=>{console.error(error);process.exit(1)});
