/* Opt-in browser regressions. Run after npm run build, with Playwright available. */
const assert=require('node:assert/strict');
const path=require('node:path');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES ? path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright') : 'playwright');
require('./local-static-server.js');
const base=`http://127.0.0.1:${process.argv[2]||8123}/`;
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{}),args:['--no-sandbox']});
 const errors=[];
 async function page({restoredSession=false,...options}={}){
  const p=await browser.newPage({viewport:{width:1440,height:1000},...options});
  p.setDefaultTimeout(20000);
  p.on('pageerror',e=>errors.push(e.message));
  await p.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  if(restoredSession) await p.route('**/js/auth-bridge.js*',async route=>{
   const response=await route.fetch();
   await route.fulfill({response,body:await response.text()+"\nwindow.AsteriaAuthBridge.setSession({uid:'player-demo',username:'Player',characters:[]},{uid:'player-demo',email:'player@example.com'});"});
  });
  return p;
 }
 const guest=await page();const requested=[];guest.on('request',r=>requested.push(r.url()));
 await guest.goto(base,{waitUntil:'networkidle'});
 await guest.waitForFunction(()=>window.AsteriaReactMigration?.available);
 assert.equal(requested.some(url=>url.includes('asteria-react-mountDashboard')||url.includes('react-dist/asteria-react.css')),false);
 await guest.getByRole('button',{name:'Open Handbook',exact:true}).click();
 await guest.getByText('Rule of Cool',{exact:true}).dblclick();
 assert.match(await guest.locator('#workspace').innerText(),/GM-approved/);
 await guest.evaluate(()=>{const b=document.createElement('button');b.id='dynamic-home';b.textContent='Home';document.body.appendChild(b);});
 await guest.locator('#dynamic-home').evaluate(el=>el.click());
 await guest.locator('#home.show').waitFor();
 await guest.evaluate(()=>{
  const host=document.createElement('div');host.id='dynamic-loading-test';
  host.innerHTML='<button id="dynamic-handbook" data-workspace-section="Asteria Handbook">Read Handbook</button><div id="dynamic-card" class="card" style="position:absolute">Added later</div>';
  document.getElementById('home').appendChild(host);
 });
 await guest.waitForFunction(()=>document.querySelector('#dynamic-card > .edge-light'));
 assert.equal(await guest.locator('#dynamic-card').evaluate(el=>getComputedStyle(el).getPropertyValue('--border-glow-position').trim()),'absolute');
 await guest.locator('#dynamic-handbook').evaluate(el=>el.click());
 await guest.getByText('Rule of Cool',{exact:true}).waitFor();
 assert.equal(requested.some(url=>url.includes('asteria-react-mountDashboard')||url.includes('react-dist/asteria-react.css')),false);
 console.log('PASS: Home/Handbook avoid dashboard runtime; dynamic Home, workspace controls and card decoration remain functional.');
 await guest.close();

 const restored=await page({restoredSession:true});
 await restored.goto(base,{waitUntil:'networkidle'});
 assert.equal(await restored.evaluate(()=>window.AsteriaAuthBridge.getSession().uid),'player-demo');
 await restored.locator('#home.show').waitFor();
 await restored.reload({waitUntil:'networkidle'});
 await restored.locator('#home.show').waitFor();
 await restored.evaluate(()=>window.AsteriaWorkspace.openDashboard('characters'));
 await restored.locator('#workspace.show .character-forge-hub').waitFor();
 await restored.evaluate(()=>window.AsteriaAuthBridge.setSession({username:'Updated'},{uid:'player-demo'}));
 await restored.locator('#workspace.show .character-forge-hub').waitFor();
 await restored.locator('#sidebarHomeButton').evaluate(el=>el.click());
 await restored.locator('#home.show').waitFor();
 assert.equal(await restored.evaluate(()=>window.location.hash),'');
 // The core shell also supports Home if the early guard is unavailable.
 await restored.evaluate(()=>{window.AsteriaWorkspace.openDashboard('characters');window.asteriaHardHome=null;window.goHome();});
 await restored.locator('#home.show').waitFor();
 console.log('PASS: restored login and reload stay on Home; profile sync preserves Forge; both Home routes return to Home.');
 await restored.close();

 for(const [hash,selector] of [['#/compendium','#compendiumLibrary.show'],['#/join/123456789012','#workspaceJoinCampaignCode']]){
  const saved=await page({restoredSession:true});
  await saved.goto(base+hash,{waitUntil:'networkidle'});
  await saved.locator(selector).waitFor();
  await saved.evaluate(()=>window.AsteriaAuthBridge.setSession({username:'Updated'},{uid:'player-demo'}));
  await saved.locator(selector).waitFor();
  assert.equal(await saved.evaluate(()=>window.location.hash),hash);
  if(hash.includes('/join/'))assert.equal(await saved.locator(selector).inputValue(),'123456789012');
  await saved.close();
 }
 console.log('PASS: restored login preserves Compendium bookmarks and campaign invitation codes.');

 const mobile=await page();
 await mobile.goto(base,{waitUntil:'networkidle'});
 for(const width of [320,360,390,430,768,900,1024,1440,1920]){
  await mobile.setViewportSize({width,height:900});
  const layout=await mobile.evaluate(()=>{
   const hero=document.querySelector('#home .public-hero');
   const rect=el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width,height:r.height};};
   return {overflow:document.documentElement.scrollWidth>innerWidth,text:rect(hero.querySelector('div')),buttons:[...document.querySelectorAll('#home button')].filter(el=>el.getClientRects().length).map(rect),label:rect(document.querySelector('#home .map-placeholder span'))};
  });
  assert.equal(layout.overflow,false,`Home overflow at ${width}px`);
  assert.ok(layout.text.width>=230,`Home text too narrow at ${width}px`);
  for(const button of layout.buttons){
   assert.ok(button.left>=0&&button.right<=width,`Home button outside ${width}px`);
   if(width<=900)assert.ok(button.height>=44,`Home tap target too short at ${width}px`);
  }
  assert.ok(layout.label.right<=width,`Map title outside ${width}px`);
 }
 console.log('PASS: readable Home, contained map title and comfortable phone controls across 320–1920px.');
 await mobile.close();

 const p=await page();const chunks=[];p.on('request',r=>{if(r.url().includes('mountDashboard'))chunks.push(r.url());});
 await p.goto(base+'?reactFixture=1',{waitUntil:'networkidle'});
 await p.waitForFunction(()=>window.AsteriaReactMigration?.available&&window.AsteriaFirebase?.getUser()?.uid==='player-demo');
 assert.equal(chunks.length,0);
 await p.evaluate(()=>window.AsteriaReactMigration.openCharacter('demo-campaign','kael'));
 await p.locator('.react-character-dashboard').waitFor();
 await p.getByRole('tab',{name:'Inventory',exact:true}).click();
 await p.locator('.react-inventory-workspace').waitFor();
 await p.evaluate(()=>window.AsteriaReactMigration.openGM('demo-campaign'));
 await p.locator('.react-gm-dashboard').waitFor();
 await p.evaluate(()=>window.AsteriaReactMigration.openCharacter('demo-campaign','kael'));
 await p.locator('.react-character-dashboard').waitFor();
 assert.equal(chunks.length,1);
 await p.setViewportSize({width:390,height:844});
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 console.log('PASS: first dashboard load, character/inventory/GM navigation, one runtime load, mobile sizing.');
 await p.close();

 const direct=await page({restoredSession:true});
 await direct.goto(base+'?reactFixture=1#/react/owned-character/kael',{waitUntil:'networkidle'});
 await direct.locator('.react-character-dashboard').waitFor();
 const characterRoute=await direct.evaluate(()=>window.location.hash);
 await direct.evaluate(()=>window.AsteriaAuthBridge.setSession({username:'Updated'},{uid:'player-demo'}));
 await direct.locator('.react-character-dashboard').waitFor();
 assert.equal(await direct.evaluate(()=>window.location.hash),characterRoute);
 console.log('PASS: direct owned-character bookmark.');await direct.close();

 const slow=await page();let release;
 const gate=new Promise(resolve=>{release=resolve;});
 await slow.route('**/react-dist/asteria-react-mountDashboard*.js',async r=>{await gate;await r.continue();});
 await slow.goto(base+'?reactFixture=1',{waitUntil:'networkidle'});
 await slow.waitForFunction(()=>window.AsteriaReactMigration?.available);
 await slow.evaluate(()=>window.AsteriaReactMigration.openCharacter('demo-campaign','kael'));
 await slow.locator('#asteriaReactRoot [role="status"]').waitFor();
 await slow.evaluate(()=>window.asteriaHardHome());release();
 await slow.waitForResponse(r=>r.url().includes('asteria-react-mountDashboard'));
 await slow.waitForTimeout(500);
 assert.equal(await slow.locator('#reactDashboard.show').count(),0);
 assert.equal(await slow.evaluate(()=>window.location.hash),'');
 console.log('PASS: Home navigation during a slow dashboard download stays on Home.');await slow.close();

 const fail=await page();let blocked=true;
 await fail.route('**/react-dist/asteria-react-mountDashboard*.js',r=>blocked?r.abort():r.continue());
 await fail.goto(base+'?reactFixture=1#/react/character/demo-campaign/kael',{waitUntil:'networkidle'});
 await fail.getByRole('button',{name:'Reload dashboard',exact:true}).waitFor();blocked=false;
 await fail.getByRole('button',{name:'Reload dashboard',exact:true}).click();
 await fail.locator('.react-character-dashboard').waitFor();
 console.log('PASS: failed dashboard download reports a recoverable error; reload succeeds.');await fail.close();
 if(process.env.ASTERIA_PREVIOUS_ENTRY){
  const previous=require('node:fs').readFileSync(process.env.ASTERIA_PREVIOUS_ENTRY,'utf8');
  const cached=await page();
  await cached.route('**/react-dist/asteria-react.js',r=>r.fulfill({status:200,contentType:'application/javascript',body:previous}));
  await cached.goto(base+'?reactFixture=1',{waitUntil:'networkidle'});
  await cached.waitForFunction(()=>window.AsteriaReactMigration?.available);
  assert.equal(await cached.evaluate(()=>!!document.querySelector('link[href$="/react-dist/asteria-react.css"]')),true);
  await cached.evaluate(()=>window.AsteriaReactMigration.openCharacter('demo-campaign','kael'));
  await cached.getByRole('tab',{name:'Inventory',exact:true}).click();
  await cached.locator('.react-inventory-workspace').waitFor();
  console.log('PASS: cached previous entry works with retained stable chunks and stylesheet compatibility.');
  await cached.close();
 }
 assert.deepEqual(errors,[]);
 await browser.close();console.log('PASS: no unexpected browser page errors.');process.exit(0);
})().catch(error=>{console.error(error);process.exit(1)});
