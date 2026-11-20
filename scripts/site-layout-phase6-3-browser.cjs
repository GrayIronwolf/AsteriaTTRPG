/* Phase 6.2: real two-account dashboard integration from Forge creation to campaign\n * invitation, membership, character approval, gameplay lifecycle and isolation.\n */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {spawn}=require('node:child_process');
const path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),base='http://127.0.0.1:4174/';
const server=spawn(process.execPath,[
 path.join(root,'node_modules/vite/bin/vite.js'),'preview',
 '--config',path.join(root,'vite.site.config.mjs')
],{cwd:root,stdio:['ignore','pipe','pipe']});
server.stdout.on('data',v=>process.stdout.write(v));
server.stderr.on('data',v=>process.stderr.write(v));
async function ready(){
 for(let i=0;i<100;i++){
  if(server.exitCode!==null)throw Error('Preview exited');
  try{if((await fetch(base,{signal:AbortSignal.timeout(600)})).ok)return;}catch{}
  await new Promise(resolve=>setTimeout(resolve,250));
 }
 throw Error('Preview not running');
}
async function account(page,email,username){
 await page.goto(base+'#/account/create',{waitUntil:'domcontentloaded'});
 await page.getByRole('heading',{name:'Create Account',level:1}).waitFor();
 await page.locator('#asteria-first-name').fill('Phase');
 await page.locator('#asteria-last-name').fill('Five');
 await page.locator('#asteria-username').fill(username);
 await page.locator('#asteria-email').fill(email);
 await page.locator('#asteria-password').fill('ExamplePassword123!');
 await page.locator('#asteria-confirm').fill('ExamplePassword123!');
 await page.getByTestId('site-auth-submit').click();
 await page.getByTestId('site-header-profile').waitFor({timeout:30000});
}
// Phase 4.1: Chromium-computed geometry of the approved frame art (not a
// replacement for genuine approved pre-migration pixel screenshots).
async function assertFrameAndPlaque(page,role){
 const root=page.getByTestId('site-'+role+'-layout-workspace');
 await root.waitFor({timeout:30000});
 const state=await root.evaluate(node=>{
   const tile=node.querySelector('[data-panel-id]');
   const title=tile?.querySelector('h3');
   const content=title?.nextElementSibling;
   if(!tile||!title||!content)return null;
   const frame=getComputedStyle(tile,'::before');
   return {
     family:tile.getAttribute('data-frame-family'),
     border:parseFloat(frame.borderTopWidth),
     art:frame.borderImageSource,
     plaque:getComputedStyle(title,'::after').backgroundImage,
     top:parseFloat(getComputedStyle(title).top),
     containerType:getComputedStyle(content).containerType,
     containerName:getComputedStyle(content).containerName
   };
 });
 assert.ok(state,'Expected visible '+role+' dashboard panel');
 assert.match(state.art,/panel-frame-(3x3|3x6|6x3|9x3)(?:-[A-Za-z0-9_-]+)?\.webp/);
 assert.match(state.plaque,/10006(?:-[A-Za-z0-9_-]+)?\.png/);
 assert.equal(state.containerType,'inline-size');
 assert.equal(state.containerName,'asteria-panel');
 const ratio={square:.333333,tall:.233333,wide:.833333,ultrawide:.833333}[state.family];
 assert.ok(Number.isFinite(ratio),'Unknown approved frame family: '+state.family);
 assert.ok(state.border>=9&&state.border<=18,'Nine-slice frame border width');
 assert.ok(Math.abs(state.top-state.border*ratio)<1,'Plaque rail parity: '+JSON.stringify(state));
}
async function assertSquareEditorCanvas(page){
 const actual=await page.getByTestId('site-layout-canvas').evaluate(node=>{
   const style=getComputedStyle(node);
   return {columns:style.gridTemplateColumns.split(/\s+/).map(Number.parseFloat),
     row:parseFloat(style.gridAutoRows),width:node.scrollWidth};
 });
 assert.equal(actual.columns.length,12,'Editor requires twelve square tracks');
 for(const width of actual.columns)
   assert.ok(Math.abs(width-48)<.5,'Track width should match original 48px cells');
 assert.ok(Math.abs(actual.row-48)<.5,'Original row height is 48px');
 assert.ok(actual.width>0);
}
async function captureLayoutEvidence(page,role,name){
 if(!process.env.RUNNER_TEMP)return;
 const root=page.getByTestId('site-'+role+'-layout-workspace');
 await root.waitFor({timeout:30000});
 const folder=path.join(process.env.RUNNER_TEMP,'asteria-phase-4-3-responsive-evidence');
 fs.mkdirSync(folder,{recursive:true});
 const geometry=await root.evaluate(node=>({
   viewport:{width:window.innerWidth,height:window.innerHeight},
   layoutViewport:node.querySelector('[data-dashboard-viewport]')?.dataset.dashboardViewport,
   panels:[...node.querySelectorAll('[data-panel-id]')].map(tile=>({
     id:tile.dataset.panelId,size:tile.dataset.panelSize,
     frame:tile.dataset.frameFamily,background:tile.dataset.panelBackground,
     column:tile.style.gridColumn,row:tile.style.gridRow
   }))
 }));
 fs.writeFileSync(path.join(folder,name+'.json'),JSON.stringify(geometry,null,2));
 await root.screenshot({path:path.join(folder,name+'.png'),animations:'disabled'});
}
// Save actual authenticated React screenshots and geometry, not fabricated
// pre-migration reference images. Final original-vs-React parity is separate.
async function captureResponsiveLayoutEvidence(page,role,name,width){
 const initial=page.viewportSize();
 await page.setViewportSize({width,height:width<=480?850:900});
 const waitForViewport=async()=>page.waitForFunction(role=>{
   const root=document.querySelector('[data-testid="site-'+role+'-layout-workspace"]');
   if(!root)return false;
   const width=root.getBoundingClientRect().width;
   const expected=width>900?'desktop':width>620?'tablet':'mobile';
   return root.querySelector('[data-dashboard-viewport]')?.dataset.dashboardViewport===expected;
 },role,{timeout:15000});
 try{
   const root=page.getByTestId('site-'+role+'-layout-workspace');
   await root.waitFor({timeout:30000});
   await waitForViewport();
   const actual=await root.evaluate(node=>{
     const width=node.getBoundingClientRect().width;
     const armour=node.querySelector('[data-panel-id="armour"] > div > div');
     return {
       expectedViewport:width>900?'desktop':width>620?'tablet':'mobile',
       layoutViewport:node.querySelector('[data-dashboard-viewport]')?.dataset.dashboardViewport,
       armourWidth:armour?.getBoundingClientRect().width,
       armourColumns:armour?getComputedStyle(armour).gridTemplateColumns.split(/\s+/).length:null,
       count:node.querySelectorAll('[data-panel-id]').length
     };
   });
   assert.equal(actual.layoutViewport,actual.expectedViewport,
     'Saved layout must follow workspace width: '+name);
   assert.ok(actual.count>0,'No visible panels for '+name);
   if(actual.armourWidth!==undefined&&actual.armourWidth<=520)
     assert.equal(actual.armourColumns,actual.armourWidth<=300?1:2,
       'Armour columns must match content width: '+name+' '+JSON.stringify(actual));
   await captureLayoutEvidence(page,role,name);
 }finally{
   await page.setViewportSize(initial);
   await waitForViewport();
 }
}
async function assertCrystalResources(page){
 const actual=await page.getByTestId('site-player-resources').evaluate(node=>{
   const button=node.querySelector('button[aria-label="Increase HP"]');
   if(!button)return null;
   const style=getComputedStyle(button);
   return {background:style.backgroundColor,border:style.borderTopWidth,
     art:getComputedStyle(button,'::before').backgroundImage};
 });
 assert.ok(actual,'HP increase button must exist');
 assert.ok(['rgba(0, 0, 0, 0)','transparent'].includes(actual.background));
 assert.equal(actual.border,'0px','Resource buttons must not have rectangular borders');
 assert.match(actual.art,/url\(/,'Icon frame artwork must render');
}
(async()=>{let browser;
try{
 await ready();
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const owner=await browser.newPage({viewport:{width:1440,height:900}});
 const player=await browser.newPage({viewport:{width:390,height:850}});
 for(const page of [owner,player]){
  await page.route('**/*',r=>{
   const hostname=new URL(r.request().url()).hostname;
   return ['localhost','127.0.0.1'].includes(hostname)?r.continue():r.abort();
  });
 }
 for(const page of [owner,player]){
   page.on('pageerror',error=>console.error('PHASE63 PAGEERROR',error.stack||error.message));
   page.on('console',message=>{if(message.type()==='error')console.error('PHASE63 CONSOLE ERROR',message.text());});
 }
 const suffix=Date.now().toString(36);
 await account(owner,'gm-'+suffix+'@example.test','GMFive'+suffix.slice(-5));
 await owner.goto(base+'#/campaign-forge',{waitUntil:'domcontentloaded'});
 await owner.getByTestId('site-campaign-create').waitFor({timeout:30000});
 await owner.getByTestId('site-campaign-create').click();
 const form=owner.getByTestId('site-campaign-form');
 await form.getByRole('textbox',{name:'Campaign Name'}).fill('Membership Test Campaign');
 await form.getByRole('spinbutton',{name:/Party Size/}).fill('4');
 await owner.getByTestId('site-campaign-save').click();
 await owner.getByRole('heading',{name:'Membership Test Campaign'}).waitFor({timeout:45000});
 await owner.getByRole('button',{name:'Manage Campaign'}).click();
 await owner.getByTestId('site-campaign-connections').waitFor();
 const ucn=(await owner.locator('main dd').nth(1).innerText()).trim();
 assert.match(ucn,/^\d{12}$/);
 await owner.getByTestId('site-secure-invite-issue').click();
 const linkInput=owner.getByRole('textbox',{name:'One-time invitation link'});
 await linkInput.waitFor({timeout:25000});
 const link=await linkInput.inputValue();
 assert.match(link,/#secure-campaign-invite=/);
 // This secret must never be sent to Firestore by the browser. It exists once
 // in the owner's UI and once in the intended recipient's ephemeral memory.
 await account(player,'player-'+suffix+'@example.test','PlayerFive'+suffix.slice(-5));
 // Open the invitation as a fresh document, matching a real shared link
 // from outside the app, rather than relying on an in-page hash navigation.
 await player.goto('about:blank');
 await player.goto(link,{waitUntil:'domcontentloaded'});
 await player.getByTestId('site-invitation-page').waitFor({timeout:30000});
 assert.equal((await player.evaluate(()=>window.location.hash)),'#/campaign-invitation',
  'Bearer token must be removed from browser URL before rendering');
 assert.equal((await player.locator('body').innerText()).includes(link.split('=')[1]),false);
 await player.getByTestId('site-invitation-preview').click();
 await player.waitForTimeout(1200);
 const previewError=player.getByRole('alert');
 if(await previewError.count())throw new Error(
   'Secure invitation preview failed: '+await previewError.first().innerText());
 console.log('SECURE PREVIEW visible content:',(await player.getByTestId('site-invitation-page').innerText()).slice(0,440));
 await player.getByText('Membership Test Campaign').waitFor({timeout:30000});
 await player.getByTestId('site-invitation-accept').click();
 await player.getByText(/Awaiting GM review|Invitation claimed/).first().waitFor({timeout:30000});
 // Permanent UCN is LOOKUP only; no automatic legacy join is performed.
 await owner.getByTestId('site-campaign-join-refresh').click();
 const applicant=owner.getByText('Applicant:');
 // Join queue displays opaque server-verified UID, not a guessed Account ID.
 await owner.getByRole('button',{name:'Approve',exact:true}).first().waitFor({timeout:30000});
 await owner.getByRole('button',{name:'Approve',exact:true}).first().click();
 await owner.getByText('No pending join requests.').waitFor({timeout:30000});
 await player.goto(base+'#/campaign-invitation',{waitUntil:'domcontentloaded'});
 await player.getByTestId('site-invitation-ucn').fill(ucn);
 await player.getByTestId('site-invitation-lookup').click();
 await player.getByText('Membership Test Campaign').waitFor({timeout:30000});
 await player.getByText(/Request status: approved/).waitFor({timeout:30000});
 assert.equal(await player.getByTestId('site-invitation-request').isDisabled(),true);
 // Create an owned source character through the migrated React Character Forge.
 await player.goto(base+'#/character-forge',{waitUntil:'domcontentloaded'});
 await player.getByTestId('site-forge-create').waitFor({timeout:30000});
 await player.getByTestId('site-forge-create').click();
 await player.getByTestId('site-forge-tab-race').click();
 await player.locator('button[aria-pressed]').first().click();
 await player.getByTestId('site-forge-tab-class').click();
 await player.getByRole('button',{name:/Barbarian/}).first().click();
 await player.getByTestId('site-forge-tab-magic').click();
 await player.getByRole('checkbox',{name:'Air Magic',exact:true}).check();
 await player.getByTestId('site-forge-tab-skills').click();
 for(let i=0;i<4;i++)await player.locator('main input[type=checkbox]').nth(i).check();
 await player.getByTestId('site-forge-tab-affinity-rolls').click();
 for(let i=0;i<5;i++)await player.locator('main input[type=number]').nth(i).fill('65');
 for(let i=0;i<5;i++)await player.getByRole('button',{name:'Confirm / Lock'}).first().click();
 await player.getByTestId('site-forge-tab-equipment').click();
 await player.locator('button[aria-pressed]').first().click();
 await player.getByTestId('site-forge-tab-review').click();
 await player.getByRole('textbox',{name:'Character Name'}).fill('Joined Forge Hero');
 await player.getByTestId('site-forge-save').click();
 await player.getByRole('heading',{name:'Joined Forge Hero'}).waitFor({timeout:30000});
 await player.getByTestId('site-forge-link-campaign').click();
 await player.getByTestId('site-invitation-ucn').fill(ucn);
 await player.getByTestId('site-invitation-lookup').click();
 await player.getByTestId('site-player-character-link').waitFor({timeout:30000});
 await player.getByTestId('site-character-link-select').selectOption({label:'Joined Forge Hero'});
 await player.getByTestId('site-character-link-status').click();
 await player.getByText(/Character status: none/).waitFor({timeout:30000});
 await player.getByTestId('site-character-link-request').click();
 await player.getByText(/Character status: pending/).waitFor({timeout:30000});
 await owner.getByTestId('site-gm-character-refresh').click();
 await owner.getByTestId('site-gm-character-approve').waitFor({timeout:30000});
 await owner.getByTestId('site-gm-character-approve').click();
 await owner.waitForTimeout(800);
 const gmError=owner.getByTestId('site-gm-character-links').getByRole('alert');
 if(await gmError.count())throw Error('GM character approval rejected: '+await gmError.first().innerText());
 console.log('GM CHARACTER REVIEW:',(await owner.getByTestId('site-gm-character-links').innerText()).slice(0,650));
 await owner.getByText('No pending character requests.').waitFor({timeout:30000});
 await player.getByTestId('site-character-link-status').click();
 await player.getByText(/Character status: approved/).waitFor({timeout:30000});
 const approvedLink=player.getByTestId('site-player-linked-dashboard');
 await approvedLink.waitFor({timeout:30000});
 const linkedRoute=await approvedLink.getAttribute('href');
 assert.match(linkedRoute,/^#\/react\/character\/[^/]+\/[^/]+$/);
 const [ownerCampaignId,linkedId]=linkedRoute.split('/').slice(-2);
 // The gameplay record comes from the server-owned original; Forge source
 // remains available for the owner after joining.
 await player.goto(base+'#/character-forge',{waitUntil:'domcontentloaded'});
 await player.getByRole('heading',{name:'Joined Forge Hero'}).waitFor({timeout:30000});

 // Phase 6.2: private, player and GM routes share the same server-approved IDs.
 await player.goto(base+'#/character-forge',{waitUntil:'domcontentloaded'});
 const privateButton=player.getByTestId('site-forge-open-dashboard');
 await privateButton.waitFor({timeout:30000});
 await privateButton.click();
 await player.getByTestId('site-player-dashboard').waitFor({timeout:30000});
 await player.getByRole('heading',{name:'Joined Forge Hero'}).waitFor({timeout:30000});
 await player.getByTestId('site-player-resources').waitFor({timeout:30000});
 await player.getByTestId('site-player-layout-manager').waitFor({timeout:30000});
 await assertFrameAndPlaque(player,'player');
 await assertCrystalResources(player);
 await captureResponsiveLayoutEvidence(player,'player','player-mobile',390);
 await captureResponsiveLayoutEvidence(player,'player','player-desktop',1440);
 await player.getByTestId('site-layout-open').click();
 try{await player.getByTestId('site-layout-editor').waitFor({timeout:6000});}
 catch(error){console.error('EDITOR PAGE DEBUG',await player.locator('body').innerText());
 console.error('EDITOR DOM', (await player.locator('html').innerHTML()).slice(0,10000));throw error;}
 await assertSquareEditorCanvas(player);
 await player.getByRole('button',{name:'Lock Skills',exact:true}).click();
 await player.getByTestId('site-layout-undo').click();
 await player.getByTestId('site-layout-redo').click();
 await player.getByTestId('site-layout-save').click();
 await player.getByTestId('site-layout-editor').waitFor({state:'detached',timeout:30000});
 await player.reload({waitUntil:'domcontentloaded'});
 await player.getByTestId('site-player-layout-manager').waitFor({timeout:30000});
 await player.getByTestId('site-layout-open').click();
 await player.getByRole('button',{name:'Unlock Skills'}).waitFor({timeout:30000});
 await player.getByRole('button',{name:'Close editor'}).click();
 const privateRoute=player.url();
 assert.match(privateRoute,/#\/react\/owned-character\//);
 const sourceId=decodeURIComponent(privateRoute.split('/').at(-1));
 await player.getByRole('button',{name:'Skills',exact:true}).click();
 await player.getByRole('heading',{name:'Skills'}).waitFor();
 await player.getByRole('button',{name:'Dashboard',exact:true}).click();
 await player.getByTestId('site-player-resources').waitFor();
 await player.getByRole('link',{name:'Character Forge'}).first().click();
 await player.getByRole('heading',{name:'Joined Forge Hero'}).waitFor({timeout:30000});
 await owner.goto(base+'#/react/owned-character/'+encodeURIComponent(sourceId),{waitUntil:'domcontentloaded'});
 const deniedOwner=owner.getByTestId('site-player-error');
 await deniedOwner.waitFor({timeout:30000});
 assert.equal(await owner.getByText('Joined Forge Hero').count(),0,
  'Another account must not see private owner-only character details');
 await player.goto(base+'#/react/character/'+encodeURIComponent(ownerCampaignId)+'/'+encodeURIComponent(linkedId),
  {waitUntil:'domcontentloaded'});
 await player.getByTestId('site-player-campaign').waitFor({timeout:30000});
 await player.getByRole('heading',{name:'Joined Forge Hero'}).waitFor({timeout:30000});
 await owner.goto(base+'#/react/gm/'+encodeURIComponent(ownerCampaignId),{waitUntil:'domcontentloaded'});
 await owner.getByTestId('site-gm-layout-manager').waitFor({timeout:30000});
 await assertFrameAndPlaque(owner,'gm');
 await captureResponsiveLayoutEvidence(owner,'gm','gm-desktop',1440);
 await captureResponsiveLayoutEvidence(owner,'gm','gm-mobile',390);
 await owner.getByTestId('site-layout-open').click();
 await assertSquareEditorCanvas(owner);
 await owner.getByRole('button',{name:'Lock Campaign Encounter'}).click();
 await owner.getByTestId('site-layout-save').click();
 await owner.getByTestId('site-layout-editor').waitFor({state:'detached',timeout:30000});
 await owner.reload({waitUntil:'domcontentloaded'});
 await owner.getByTestId('site-gm-layout-manager').waitFor({timeout:30000});
 await owner.getByTestId('site-layout-open').click();
 await owner.getByRole('button',{name:'Unlock Campaign Encounter'}).waitFor({timeout:30000});
 await owner.getByRole('button',{name:'Close editor'}).click();
 await owner.goto(base+'#/react/character/'+encodeURIComponent(ownerCampaignId)+'/'+encodeURIComponent(linkedId),
  {waitUntil:'domcontentloaded'});
 await owner.getByTestId('site-player-campaign').waitFor({timeout:30000});
 await owner.getByRole('heading',{name:'Joined Forge Hero'}).waitFor({timeout:30000});
 await owner.getByText(/GM Read-only/).waitFor({timeout:30000});
 await owner.getByTestId('site-player-layout-readonly').waitFor({timeout:30000});
 await assertFrameAndPlaque(owner,'player');
 await captureResponsiveLayoutEvidence(owner,'player','gm-readonly-desktop',1440);
 await captureResponsiveLayoutEvidence(owner,'player','gm-readonly-mobile',390);
 assert.equal(await owner.getByTestId('site-layout-open').count(),0,
   'GM cannot edit another character layout');
 assert.equal(await owner.locator('[data-panel-id="journal"]').count(),0,
   'GM cannot view private journal panel');
 await owner.getByTestId('site-player-dashboard').getByRole('button',{name:'Journal'}).count().then(n=>
  assert.equal(n,0,'GM must not see private journal tab'));

 await owner.goto(base+'#/campaign-forge',{waitUntil:'domcontentloaded'});
 await owner.getByRole('button',{name:'Manage Campaign'}).click();
 await owner.getByTestId('site-gm-character-refresh').click();
 await owner.getByRole('button',{name:'Deactivate'}).click();
 await owner.getByRole('button',{name:'Restore'}).waitFor({timeout:30000});
 await owner.getByRole('button',{name:'Restore'}).click();
 await owner.getByRole('button',{name:'Deactivate'}).waitFor({timeout:30000});
 await owner.getByRole('button',{name:'Unlink Character'}).click();
 await owner.getByText('No approved or inactive character links.').waitFor({timeout:30000});
 await player.reload({waitUntil:'domcontentloaded'});
 await player.getByTestId('site-player-error').waitFor({timeout:30000});
 await player.goto(base+'#/character-forge',{waitUntil:'domcontentloaded'});
 await player.getByRole('heading',{name:'Joined Forge Hero'}).waitFor({timeout:30000});
 await player.goto(base+'#/campaign-forge',{waitUntil:'domcontentloaded'});
 await player.getByTestId('site-campaign-forge-page').waitFor();
 // Only owners see the campaign management workspace: membership does NOT
 // grant permission to edit the owner settings.
 assert.equal(await player.getByText('Membership Test Campaign').count(),0);
 for(const page of [owner,player]){
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 }
 console.log('PASS: Phase 6.3 dashboard layouts and prior Forge acceptance; verified character Forge, campaign join, owner approval, link request, server character import, deactivation, restore, unlink, persistence and mobile access isolation.');
}catch(err){console.error(err);process.exitCode=1;}
finally{if(browser)await browser.close();server.kill('SIGTERM');}
})();
