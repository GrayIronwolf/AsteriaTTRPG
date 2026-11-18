/* Phase 5.2: real Firebase Auth/Firestore/Functions browser acceptance.
 * Uses emulator only, never the public Asteria project.
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
server.stdout.on('data',x=>process.stdout.write(x));
server.stderr.on('data',x=>process.stderr.write(x));
async function ready(){
 for(let i=0;i<100;i++){
  if(server.exitCode!==null)throw Error('Vite preview exited');
  try{if((await fetch(base,{signal:AbortSignal.timeout(600)})).ok)return;}catch{}
  await new Promise(resolve=>setTimeout(resolve,250));
 }
 throw Error('Campaign Forge preview not running');
}
async function register(page,email,username){
 await page.goto(base+'#/account/create',{waitUntil:'domcontentloaded'});
 await page.getByRole('heading',{name:'Create Account',level:1}).waitFor();
 await page.locator('#asteria-first-name').fill('Campaign');
 await page.locator('#asteria-last-name').fill('Tester');
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
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 await page.route('**/*',r=>{
  const host=new URL(r.request().url()).hostname;
  return ['localhost','127.0.0.1'].includes(host)?r.continue():r.abort();
 });
 const unique=Date.now().toString(36);
 await register(page,'campaign-'+unique+'@example.test','CampOwner'+unique.slice(-4));
 await page.goto(base+'#/campaign-forge',{waitUntil:'domcontentloaded'});
 await page.getByTestId('site-campaign-create').waitFor({timeout:30000});
 await page.getByText('No owned campaigns were found.').waitFor();
 await page.getByTestId('site-campaign-create').click();
 const form=page.getByTestId('site-campaign-form');
 await form.getByRole('textbox',{name:'Campaign Name'}).fill('Cinders of Asteria');
 await form.getByRole('spinbutton',{name:/Party Size/}).fill('6');
 await form.getByRole('textbox',{name:'Campaign Description'}).fill('New story in Raemar');
 await form.getByRole('checkbox',{name:'Allow players to forge characters'}).uncheck();
 await page.getByTestId('site-campaign-save').click();
 await page.getByTestId('site-campaign-message').getByText(/created in Firebase/).waitFor({timeout:50000});
 await page.getByRole('heading',{name:'Cinders of Asteria'}).waitFor();
 let summary=await page.locator('main article').filter({hasText:'Cinders of Asteria'}).innerText();
 assert.match(summary,/Party capacity: 6/);
 assert.match(summary,/UCN: \d{12}/);
 await page.getByRole('button',{name:'Manage Campaign'}).first().click();
 const edit=page.getByTestId('site-campaign-form');
 await edit.getByRole('textbox',{name:'Campaign Name'}).fill('Cinders Revised');
 await edit.getByRole('textbox',{name:'Campaign Description'}).fill('The permanent campaign identity remains unchanged.');
 assert.equal(await edit.getByRole('checkbox',{name:'Allow players to forge characters'}).isChecked(),false);
 await edit.getByRole('checkbox',{name:'Shared Notes'}).check();
 await page.getByTestId('site-campaign-save').click();
 await page.getByRole('heading',{name:'Cinders Revised'}).waitFor({timeout:30000});
 await page.reload({waitUntil:'domcontentloaded'});
 await page.getByRole('heading',{name:'Cinders Revised'}).waitFor({timeout:30000});
 await page.getByRole('button',{name:'Manage Campaign'}).first().click();
 assert.equal(await page.getByRole('checkbox',{name:'Shared Notes'}).isChecked(),true);
 const ucn=(await page.locator('main dd').nth(1).innerText()).trim();
 assert.match(ucn,/^\d{12}$/);
 await page.getByRole('button',{name:'Back to Campaigns'}).click();
 for(const width of [390,1440]){
  await page.setViewportSize({width,height:850});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,
   'Horizontal overflow at '+width);
 }
 await page.goto(base+'#/join/'+ucn,{waitUntil:'domcontentloaded'});
 await page.getByRole('heading',{name:'Campaign Invitation'}).waitFor();
 assert.equal(await page.getByTestId('site-campaign-form').count(),0,
   'Phase 5.2 must not enable invitation redemption');
 await page.goto(base+'#/react/gm/private-campaign',{waitUntil:'domcontentloaded'});
 await page.getByRole('heading',{name:'GM Dashboard'}).waitFor();
 assert.equal(await page.getByTestId('site-campaign-form').count(),0,
   'Phase 5.2 must not enable GM Dashboard');
 const other=await browser.newPage({viewport:{width:960,height:850}});
 await other.route('**/*',r=>{
  const host=new URL(r.request().url()).hostname;
  return ['localhost','127.0.0.1'].includes(host)?r.continue():r.abort();
 });
 await register(other,'campaign-other-'+unique+'@example.test','OtherGM'+unique.slice(-4));
 await other.goto(base+'#/campaign-forge',{waitUntil:'domcontentloaded'});
 await other.getByText('No owned campaigns were found.').waitFor({timeout:30000});
 assert.equal(await other.getByText('Cinders Revised').count(),0,
  'Another account must not see an unrelated private campaign');
 await page.goto(base+'#/campaign-forge',{waitUntil:'domcontentloaded'});
 await page.getByRole('heading',{name:'Cinders Revised'}).waitFor();
 await page.getByTestId('site-header-account-menu').locator('summary').click();
 await page.getByTestId('site-header-logout').click();
 await page.goto(base+'#/campaign-forge',{waitUntil:'domcontentloaded'});
 await page.getByText('Sign in to create or manage a campaign.').waitFor();
 console.log('PASS: Phase 5.2 emulator campaign creation, UCN, settings, persistence, owner isolation, mobile and gated invitations.');
}catch(error){console.error(error);process.exitCode=1;}
finally{if(browser)await browser.close();server.kill('SIGTERM');}
})();
