/* Phase 6.2: real two-account dashboard integration from Forge creation to campaign\n * invitation, membership, character approval, gameplay lifecycle and isolation.\n */
'use strict';
const assert=require('node:assert/strict');
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
 await player.getByTestId('site-layout-open').click();
 try{await player.getByTestId('site-layout-editor').waitFor({timeout:6000});}
 catch(error){console.error('EDITOR PAGE DEBUG',await player.locator('body').innerText());
 console.error('EDITOR DOM', (await player.locator('html').innerHTML()).slice(0,10000));throw error;}
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
 await owner.getByTestId('site-layout-open').click();
 await owner.getByRole('button',{name:'Lock Campaign Encounter'}).click();
 await owner.getByTestId('site-layout-save').click();
 await owner.getByTestId('site-layout-editor').waitFor({state:'detached',timeout:30000});
 await owner.reload({waitUntil:'domcontentloaded'});
 await owner.getByTestId('site-gm-layout-manager').waitFor({timeout:30000});
 await owner.getByTestId('site-layout-open').click();
 await owner.getByRole('button',{name:'Unlock Campaign Encounter'}).waitFor({timeout:30000});
 await owner.getByRole('button',{name:'Close editor'}).click();
 // Phase 6.4: same campaign and accounts, live Firestore/Storage/Functions.
 await owner.goto(base+'#/react/gm/'+encodeURIComponent(ownerCampaignId),{waitUntil:'domcontentloaded'});
 await owner.getByRole('button',{name:'Battle Maps',exact:true}).click();
 await owner.getByTestId('site-gm-campaign-maps').waitFor({timeout:30000});
 const gmMaps=owner.getByTestId('site-gm-campaign-maps');
 await gmMaps.getByRole('textbox',{name:'Map name'}).fill('Looping Frostwind Map');
 await gmMaps.locator('input[type="file"]').setInputFiles({
   name:'frostwind.png',mimeType:'image/png',
   buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGNUcEhgYGBgYmBgYGBgAAAI6gDEJfpPsQAAAABJRU5ErkJggg==','base64')
 });
 await gmMaps.getByRole('button',{name:'Upload GM Map'}).click();
 try{await gmMaps.getByText(/Map uploaded as GM-only/).waitFor({timeout:12000});}
 catch(error){console.error('MAP UPLOAD ERROR',await gmMaps.innerText());throw error;}
 assert.equal(await gmMaps.getByRole('combobox',{name:'Battle map'}).locator('option').count(),1);
 await gmMaps.getByRole('combobox',{name:'Visibility'}).selectOption('players');
 await gmMaps.getByRole('button',{name:'Save Map Settings'}).click();
 await gmMaps.getByText('Map settings saved.').waitFor({timeout:30000});
 await player.goto(base+'#/react/character/'+encodeURIComponent(ownerCampaignId)+'/'+encodeURIComponent(linkedId),
   {waitUntil:'domcontentloaded'});
 await player.getByRole('button',{name:'Battle Maps'}).click();
 await player.getByTestId('site-player-campaign-maps').waitFor({timeout:30000});
 await player.getByTestId('site-player-campaign-maps').getByRole('combobox',{name:'Battle map'}).locator('option').filter({hasText:'Looping Frostwind Map'}).waitFor({state:'attached',timeout:30000});
 assert.match(await player.getByTestId('site-player-campaign-maps').getByRole('combobox',{name:'Battle map'}).innerText(),/Looping Frostwind Map/);
 assert.equal(await player.locator('[data-testid="site-player-campaign-maps"] input[type="file"]').count(),0);
 await owner.getByRole('button',{name:'Player Display',exact:true}).click();
 await owner.getByTestId('site-gm-presentation').waitFor({timeout:30000});
 await owner.getByTestId('site-gm-presentation').getByRole('combobox',{name:'Scene'}).selectOption('battle-map');
 try{await owner.getByTestId('site-gm-presentation').getByRole('combobox',{name:'Published map'}).selectOption({label:'Looping Frostwind Map'},{timeout:7000});}
 catch(error){console.error('GM PRESENTATION OPTIONS',await owner.getByTestId('site-gm-presentation').innerText());console.error('GM MAP OPTIONS',await owner.getByTestId('site-gm-presentation').getByRole('combobox',{name:'Published map'}).innerText());throw error;}
 await owner.getByTestId('site-presentation-publish').click();
 await owner.getByText('Presentation updated.').waitFor({timeout:30000});
 await player.goto(base+'#/react/presentation/'+encodeURIComponent(ownerCampaignId),{waitUntil:'domcontentloaded'});
 await player.getByTestId('site-player-presentation').waitFor({timeout:30000});
 await player.getByTestId('site-media-map-canvas').waitFor({timeout:30000});
 await owner.goto(base+'#/react/gm/'+encodeURIComponent(ownerCampaignId),{waitUntil:'domcontentloaded'});
 await owner.getByRole('button',{name:'Player Display',exact:true}).click();
 await owner.getByRole('button',{name:'Blackout'}).click();
 await owner.getByText('Presentation updated.').waitFor({timeout:30000});
 await player.getByText('Display is blacked out.').waitFor({timeout:30000});
 // Restore the linked-character route before testing account revocation on refresh.
 await player.goto(base+'#/react/character/'+encodeURIComponent(ownerCampaignId)+'/'+encodeURIComponent(linkedId),
   {waitUntil:'domcontentloaded'});
 await player.getByTestId('site-player-campaign').waitFor({timeout:30000});
 await owner.goto(base+'#/react/character/'+encodeURIComponent(ownerCampaignId)+'/'+encodeURIComponent(linkedId),
  {waitUntil:'domcontentloaded'});
 await owner.getByTestId('site-player-campaign').waitFor({timeout:30000});
 await owner.getByRole('heading',{name:'Joined Forge Hero'}).waitFor({timeout:30000});
 await owner.getByText(/GM Read-only/).waitFor({timeout:30000});
 await owner.getByTestId('site-player-dashboard').getByRole('button',{name:'Journal'}).count().then(n=>
  assert.equal(n,0,'GM must not see private journal tab'));

 // Phase 7.1: canonical combat, initiative, AP and resources across two accounts.
 await owner.goto(base+'#/react/gm/'+encodeURIComponent(ownerCampaignId),{waitUntil:'domcontentloaded'});
 await owner.getByTestId('site-gm-session-start').click();
 await owner.getByTestId('site-gm-session-status').getByText('ACTIVE').waitFor({timeout:30000});
 await owner.getByRole('button',{name:'Gameplay Systems'}).click();
 const gmCombat=owner.getByTestId('site-gm-combat');
 await gmCombat.waitFor({timeout:30000});
 await gmCombat.getByRole('button',{name:'Add Linked Players'}).click();
 await gmCombat.getByText('Joined Forge Hero',{exact:true}).first().waitFor({timeout:30000});
 await gmCombat.locator('button:enabled').filter({hasText:/^Start Combat$/}).click();
 await gmCombat.getByText(/ACTIVE · Round 1/).waitFor({timeout:30000});
 await gmCombat.getByTestId('site-combat-initiative').getByText(/Current turn/).waitFor({timeout:30000});
 await gmCombat.locator('button:enabled').filter({hasText:/^Record 1 AP action$/}).click();
 await gmCombat.getByText('2 AP · Bonus available').waitFor({timeout:30000});
 await player.goto(base+'#/react/character/'+encodeURIComponent(ownerCampaignId)+'/'+encodeURIComponent(linkedId),
   {waitUntil:'domcontentloaded'});
 await player.getByRole('button',{name:'Combat',exact:true}).click();
 const playerCombat=player.getByTestId('site-player-combat');
 await playerCombat.waitFor({timeout:30000});
 await playerCombat.getByText('2 AP · Bonus available').waitFor({timeout:30000});
 await playerCombat.getByRole('button',{name:'Record 1 AP action'}).click();
 await playerCombat.getByText('1 AP · Bonus available').waitFor({timeout:30000});
 await playerCombat.getByRole('button',{name:'End Turn'}).click();
 await playerCombat.getByText('Turn complete').waitFor({timeout:30000});
 // Ensure GM received the new revision before advancing the server-owned turn.
 await gmCombat.getByText('Turn complete').waitFor({timeout:30000});
 await gmCombat.locator('button:enabled').filter({hasText:/^Next Turn$/}).click();
 try{await gmCombat.getByText(/ACTIVE · Round 2/).waitFor({timeout:30000});}
 catch(error){
   console.error('COMBAT NEXT TURN DIAGNOSTICS',await gmCombat.innerText());
   throw error;
 }
 owner.once('dialog',dialog=>dialog.accept());
 await gmCombat.locator('button:enabled').filter({hasText:/^End Combat$/}).click();
 await gmCombat.getByText(/ENDED/).waitFor({timeout:30000});
 // A non-GM may never manage the encounter.
 assert.equal(await playerCombat.getByRole('button',{name:'Start Combat'}).count(),0);
 // Phase 7.2: authenticated XP, progression, and Universal Check Requests.
 await owner.goto(base+'#/react/gm/'+encodeURIComponent(ownerCampaignId),{waitUntil:'domcontentloaded'});
 await owner.getByRole('button',{name:'Gameplay Systems'}).click();
 const gmProgress=owner.getByTestId('site-gm-progression');
 await gmProgress.waitFor({timeout:30000});
 await gmProgress.getByLabel('Linked character').selectOption(linkedId);
 await gmProgress.getByLabel('XP amount').fill('1000');
 await gmProgress.getByLabel('Reason').fill('Completed milestone adventure');
 await gmProgress.getByRole('button',{name:'Award XP'}).click();
 await gmProgress.getByText('XP awarded and progression synchronized.').waitFor({timeout:30000});
 await player.goto(base+'#/react/character/'+encodeURIComponent(ownerCampaignId)+'/'+encodeURIComponent(linkedId),
   {waitUntil:'domcontentloaded'});
 await player.getByRole('button',{name:'Progression',exact:true}).click();
 const playerProgress=player.getByTestId('site-player-progression');
 await playerProgress.getByText(/Level 1 · XP/).waitFor({timeout:30000});
 await playerProgress.getByText(/Characteristic Points: 3/).waitFor({timeout:30000});
 await playerProgress.getByLabel('Points to allocate').first().fill('1');
 await playerProgress.getByRole('button',{name:'Allocate CP'}).click();
 await playerProgress.getByText('Characteristic Points allocated.').waitFor({timeout:30000});
 await playerProgress.getByText(/Characteristic Points: 2/).waitFor({timeout:30000});
 // GM's characteristic request uses the same server-owned skill/condition modifier engine.
 await gmProgress.getByLabel('Type').selectOption('characteristic');
 await gmProgress.getByLabel('Governing characteristic').selectOption('agility');
 await gmProgress.getByRole('radio').first().check();
 await gmProgress.getByRole('button',{name:'Send Check Request'}).click();
 await gmProgress.getByText('Check request sent.').waitFor({timeout:30000});
 const popup=player.getByTestId('site-player-check-popup');
 await popup.waitFor({timeout:30000});
 await popup.getByRole('button',{name:'Roll Digital Dice'}).click();
 await popup.waitFor({state:'detached',timeout:30000});
 await gmProgress.getByRole('button',{name:'Acknowledge'}).first().click();
 await gmProgress.getByText('Result acknowledged.').waitFor({timeout:30000});
 // Reroll is a new attempt; physical d20 is a user-entered result, not local RNG.
 await gmProgress.getByRole('button',{name:'Request Reroll'}).first().click();
 await gmProgress.getByText('New roll requested.').waitFor({timeout:30000});
 await popup.waitFor({timeout:30000});
 await popup.getByLabel('First d20').fill('14');
 await popup.getByRole('button',{name:'Submit Physical Dice'}).click();
 await popup.waitFor({state:'detached',timeout:30000});
 // The GM receives result history without any client-side writes to check records.
 await gmProgress.getByText(/Earlier attempts \(1\)/).first().waitFor({timeout:30000});
 // Phase 7.3: shared GM party stash and treasure are the existing callable records.
 await owner.goto(base+'#/react/gm/'+encodeURIComponent(ownerCampaignId),{waitUntil:'domcontentloaded'});
 await owner.getByRole('button',{name:'PC Inventory'}).click();
 const gmEconomy=owner.getByTestId('site-gm-economy');
 await gmEconomy.waitFor({timeout:30000});
 await gmEconomy.getByLabel('Name').first().fill('Emulator Party Chest');
 await gmEconomy.getByRole('button',{name:'Create Container'}).click();
 await gmEconomy.getByText('Shared container created.').waitFor({timeout:30000});
 await gmEconomy.getByText('Emulator Party Chest').first().waitFor({timeout:30000});
 await player.goto(base+'#/react/character/'+encodeURIComponent(ownerCampaignId)+'/'+encodeURIComponent(linkedId),
   {waitUntil:'domcontentloaded'});
 await player.getByRole('button',{name:'Inventory & Trading'}).click();
 const playerEconomy=player.getByTestId('site-player-economy');
 await playerEconomy.waitFor({timeout:30000});
 await playerEconomy.getByRole('button',{name:'Party Loot'}).click();
 await playerEconomy.getByText('Emulator Party Chest').first().waitFor({timeout:30000});
 await gmEconomy.getByLabel('Title').fill('Emulator Coins');
 await gmEconomy.getByLabel('Total copper').fill('100');
 await gmEconomy.getByRole('checkbox',{name:'Keep hidden until GM reveals'}).uncheck();
 await gmEconomy.getByRole('button',{name:'Create Drop'}).click();
 await gmEconomy.getByText('Loot drop created.').waitFor({timeout:30000});
 await playerEconomy.getByText('Emulator Coins').first().waitFor({timeout:30000});
 await gmEconomy.getByText('Emulator Coins').first().waitFor({timeout:30000});
 const drop=gmEconomy.getByText('Emulator Coins').locator('xpath=..');
 await drop.getByRole('checkbox').first().check();
 await drop.getByRole('button',{name:'Split Currency'}).click();
 await gmEconomy.getByText('Currency distributed.').waitFor({timeout:30000});
 await playerEconomy.getByText('Emulator Coins').first().waitFor({timeout:30000});
 await owner.goto(base+'#/react/gm/'+encodeURIComponent(ownerCampaignId),{waitUntil:'domcontentloaded'});
 await owner.getByRole('button',{name:'PC Inventory'}).click();
 const gmReturn=owner.getByTestId('site-gm-economy');
 await gmReturn.getByRole('button',{name:'Shops'}).click();
 await gmReturn.getByLabel('Shop name').fill('Emulator Blacksmith');
 await gmReturn.getByRole('button',{name:'Create Merchant'}).click();
 await gmReturn.getByText('Merchant saved.').waitFor({timeout:30000});
 await gmReturn.getByText('Emulator Blacksmith').first().waitFor({timeout:30000});
 // Navigating back to the player route creates a fresh active workspace.
 // Scope interactions to its visible root instead of a stale transition tree.
 await player.goto(base+'#/react/character/'+encodeURIComponent(ownerCampaignId)+'/'+encodeURIComponent(linkedId),
   {waitUntil:'domcontentloaded'});
 await player.getByRole('button',{name:'Inventory & Trading'}).last().click();
 const activeEconomy=player.locator('[data-testid="site-player-economy"]:visible').last();
 await activeEconomy.waitFor({timeout:30000});
 await activeEconomy.getByRole('button',{name:'Shops'}).first().click();
 try{await activeEconomy.getByText('Emulator Blacksmith').first().waitFor({timeout:15000});}
 catch(error){console.error('PLAYER MERCHANT DEBUG:',(await activeEconomy.innerText()).slice(0,5500));throw error;}
 await activeEconomy.getByRole('button',{name:'Crafting'}).first().click();
 await activeEconomy.getByTestId('site-economy-crafting').waitFor();
 await activeEconomy.getByRole('button',{name:'Trades'}).first().click();
 await activeEconomy.getByTestId('site-economy-trades').waitFor();
 await owner.goto(base+'#/campaign-forge',{waitUntil:'domcontentloaded'});
 await owner.getByRole('button',{name:'Manage Campaign'}).click();
 await owner.getByTestId('site-gm-character-refresh').click();
 await owner.getByRole('button',{name:'Deactivate'}).click();
 await owner.getByRole('button',{name:'Restore'}).waitFor({timeout:30000});
 await owner.getByRole('button',{name:'Restore'}).click();
 await owner.getByRole('button',{name:'Deactivate'}).waitFor({timeout:30000});
 await owner.getByRole('button',{name:'Unlink Character'}).click();
 await owner.getByText('No approved or inactive character links.').waitFor({timeout:30000});
 await player.goto(base+'#/react/character/'+encodeURIComponent(ownerCampaignId)+'/'+encodeURIComponent(linkedId),{waitUntil:'domcontentloaded'});
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
 console.log('PASS: Phase 7.3 party stashes, visible loot, currency splits, shops, crafting and trade screens; Phase 7.2 progression, GM XP, CP, digital and physical check requests; Phase 6.4 published maps, authenticated shared media and projector plus Phase 6.3 dashboard layouts; verified character Forge, campaign join, owner approval, link request, server character import, deactivation, restore, unlink, persistence and mobile access isolation.');
}catch(err){console.error(err);process.exitCode=1;}
finally{if(browser)await browser.close();server.kill('SIGTERM');}
})();
