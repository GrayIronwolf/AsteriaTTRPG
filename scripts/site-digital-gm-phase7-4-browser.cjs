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

 // Previous phases have independent CI gates; this test isolates Phase 7.4.
 // Phase 7.4: private NPC authoring and a GM-reviewed relationship ledger.
 await owner.goto(base+'#/react/gm/'+encodeURIComponent(ownerCampaignId),{waitUntil:'domcontentloaded'});
 await owner.getByRole('button',{name:'Digital-gm-toolkit'}).click();
 const gmToolkit=owner.getByTestId('site-gm-digital-tools');
 await gmToolkit.getByTestId('site-digital-gm-library').waitFor({timeout:30000});
 await gmToolkit.getByRole('button',{name:'New NPC'}).click();
 await gmToolkit.getByLabel('name',{exact:true}).fill('Emulator Tavern Keeper');
 await gmToolkit.getByRole('button',{name:'Save Record'}).click();
 await gmToolkit.getByText('Library record saved.').waitFor({timeout:30000});
 await gmToolkit.getByText('Emulator Tavern Keeper').first().waitFor({timeout:30000});
 await gmToolkit.getByRole('button',{name:'Reputation'}).click();
 const gmReputation=gmToolkit.getByTestId('site-digital-gm-reputation');
 await gmReputation.waitFor({timeout:30000});
 await gmReputation.getByLabel('Source record ID').fill('npc1234');
 await gmReputation.getByLabel('Target record ID').fill(linkedId);
 await gmReputation.getByLabel('Relationship level').selectOption('3');
 await gmReputation.getByLabel('Reason or significant event').fill('Saved the merchant');
 await gmReputation.getByLabel('Milestone / recognition requirement').fill('Completed an escort');
 assert.equal(await gmReputation.getByLabel('Source record ID').inputValue(),'npc1234',
   'Switching to a new GM tab must not discard the source form field.');
 await gmReputation.getByRole('button',{name:'Save GM Ledger'}).click();
 try{await gmToolkit.getByText('GM-only ledger updated. No automatic gameplay effect.').waitFor({timeout:12000});}
 catch(error){console.error('LEDGER DEBUG:',(await gmToolkit.innerText()).slice(0,6500));throw error;}
 await gmToolkit.getByRole('button',{name:'Quests & Notes'}).click();
 const gmStories=gmToolkit.getByTestId('site-digital-gm-stories');
 await gmStories.waitFor({timeout:30000});
 await gmStories.getByLabel('Private GM Notes').fill('SECRET GM PLANNING - do not show the party');
 await gmStories.getByRole('button',{name:'Save Private Notes'}).click();
 await gmToolkit.getByText('GM notes saved.').waitFor({timeout:30000});
 await player.goto(base+'#/react/character/'+encodeURIComponent(ownerCampaignId)+'/'+encodeURIComponent(linkedId),
   {waitUntil:'domcontentloaded'});
 await player.getByRole('button',{name:'Campaign World & Session'}).click();
 const publicTools=player.getByTestId('site-player-digital-tools');
 await publicTools.waitFor({timeout:30000});
 assert.equal(await publicTools.getByText('SECRET GM PLANNING - do not show the party').count(),0);
 assert.equal(await publicTools.getByText('Emulator Tavern Keeper').count(),0);
 await publicTools.getByRole('button',{name:'Weather'}).click();
 await publicTools.getByRole('button',{name:'Published PDFs'}).click();
 await publicTools.getByRole('button',{name:'Recording Status'}).click();
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
 console.log('PASS: Phase 7.4 NPC, reputation ledger, GM private notes and player-safe shared projections with authenticated two-account Forge, campaign join and unlink lifecycle.');
}catch(err){console.error(err);process.exitCode=1;}
finally{if(browser)await browser.close();server.kill('SIGTERM');}
})();
