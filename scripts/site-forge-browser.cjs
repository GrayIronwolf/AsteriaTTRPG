/* Phase 5.1: real Auth/Firestore emulator acceptance for private Character Forge. */
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
  if(server.exitCode!==null)throw Error('Forge preview exited');
  try{if((await fetch(base,{signal:AbortSignal.timeout(600)})).ok)return;}catch{}
  await new Promise(resolve=>setTimeout(resolve,250));
 }
 throw Error('Forge preview not running');
}
async function createAccount(page,email,username){
 await page.goto(base+'#/account/create',{waitUntil:'domcontentloaded'});
 await page.getByRole('heading',{name:'Create Account',level:1}).waitFor();
 await page.locator('#asteria-first-name').fill('Forge');
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
 await page.route('**/*',route=>{
  const host=new URL(route.request().url()).hostname;
  return ['localhost','127.0.0.1'].includes(host)?route.continue():route.abort();
 });
 const suffix=Date.now().toString(36);
 const email='forge-'+suffix+'@example.test';
 await createAccount(page,email,'ForgePlayer'+suffix.slice(-4));
 await page.goto(base+'#/character-forge',{waitUntil:'domcontentloaded'});
 await page.getByTestId('site-character-forge-page').waitFor({timeout:30000});
 await page.getByTestId('site-forge-create').waitFor({timeout:30000});
 await page.getByText('No saved characters were found').waitFor();
 await page.getByTestId('site-forge-create').click();
 await page.getByTestId('site-forge-tab-race').click();
 await page.locator('button[aria-pressed]').first().click();
 await page.getByTestId('site-forge-tab-class').click();
 await page.getByRole('button',{name:/Barbarian/}).first().click();
 await page.getByTestId('site-forge-tab-characteristics').click();
 assert.equal(await page.locator('main input[type=number]').count(),9);
 await page.getByTestId('site-forge-tab-magic').click();
 await page.getByRole('checkbox',{name:'Air Magic',exact:true}).check();
 await page.getByTestId('site-forge-tab-skills').click();
 for(let i=0;i<4;i++)await page.locator('main input[type=checkbox]').nth(i).check();
 await page.getByTestId('site-forge-tab-affinity-rolls').click();
 const rolls=page.locator('main input[type=number]');
 assert.equal(await rolls.count(),5);
 for(let i=0;i<5;i++){
  await rolls.nth(i).fill('65');
 }
 for(let i=0;i<5;i++)await page.getByRole('button',{name:'Confirm / Lock'}).first().click();
 await page.getByTestId('site-forge-tab-equipment').click();
 await page.locator('button[aria-pressed]').first().click();
 await page.getByTestId('site-forge-tab-review').click();
 await page.getByRole('textbox',{name:'Character Name'}).fill('Phase Five Hero');
 await page.getByTestId('site-forge-save').click();
 await page.getByTestId('site-forge-message').getByText(/saved to your private Character Forge/).waitFor({timeout:30000});
 await page.getByRole('heading',{name:'Phase Five Hero'}).waitFor();
 await page.getByRole('button',{name:'Edit Character'}).click();
 await page.getByTestId('site-forge-tab-review').click();
 await page.getByRole('textbox',{name:'Character Name'}).fill('Phase Five Revised Hero');
 await page.getByTestId('site-forge-save').click();
 await page.getByRole('heading',{name:'Phase Five Revised Hero'}).waitFor({timeout:30000});
 await page.reload({waitUntil:'domcontentloaded'});
 await page.getByRole('heading',{name:'Phase Five Revised Hero'}).waitFor({timeout:30000});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.setViewportSize({width:390,height:850});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.goto(base+'#/react/owned-character/forge-private',{waitUntil:'domcontentloaded'});
 await page.getByRole('heading',{name:'Character Dashboard',level:1}).waitFor();
 assert.equal(await page.locator('main form').count(),0);
 await page.goto(base+'#/character-forge');
 await page.getByTestId('site-header-account-menu').locator('summary').click();
 await page.getByTestId('site-header-logout').click();
 await page.getByTestId('site-header-login').waitFor();
 await page.goto(base+'#/character-forge',{waitUntil:'domcontentloaded'});
 await page.getByText('Sign in to forge and manage').waitFor();
 const second=await browser.newPage({viewport:{width:900,height:850}});
 await second.route('**/*',route=>{
  const host=new URL(route.request().url()).hostname;
  return ['localhost','127.0.0.1'].includes(host)?route.continue():route.abort();
 });
 await createAccount(second,'forge-second-'+suffix+'@example.test','ForgeGuest'+suffix.slice(-4));
 await second.goto(base+'#/character-forge',{waitUntil:'domcontentloaded'});
 await second.getByText('No saved characters were found').waitFor({timeout:30000});
 assert.equal(await second.getByText('Phase Five Revised Hero').count(),0,
  'Another account must not see the first account private character');
 console.log('PASS: Phase 5.1 real Firebase Auth/Firestore emulator creates, saves, edits, restores, isolates characters and protects dashboard.');
}catch(error){console.error(error);process.exitCode=1;}
finally{if(browser)await browser.close();server.kill('SIGTERM');}
})();
