/* Phase 5.3 real emulator: signed-in owner issues an HMAC token, a second
 * account reviews and claims it, and the GM approves its pending request.
 */
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
 await player.goto(base+'#/campaign-forge',{waitUntil:'domcontentloaded'});
 await player.getByTestId('site-campaign-forge-page').waitFor();
 // Only owners see the campaign management workspace: membership does NOT
 // grant permission to edit the owner settings.
 assert.equal(await player.getByText('Membership Test Campaign').count(),0);
 for(const page of [owner,player]){
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 }
 console.log('PASS: Phase 5.3 v2 campaign creation, secure one-time invitation, hash scrubbing, pending join and server approval.');
}catch(err){console.error(err);process.exitCode=1;}
finally{if(browser)await browser.close();server.kill('SIGTERM');}
})();
