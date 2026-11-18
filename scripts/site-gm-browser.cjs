/* Real Auth/Firestore/Functions Phase 6.1 desktop and mobile test. */
'use strict';
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),base='http://127.0.0.1:4174/';
const server=spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'preview','--config',path.join(root,'vite.site.config.mjs')],{cwd:root,stdio:['ignore','pipe','pipe']});
server.stdout.on('data',v=>process.stdout.write(v));
server.stderr.on('data',v=>process.stderr.write(v));
async function ready(){
  for(let i=0;i<100;i++){
    if(server.exitCode!==null)throw Error('Preview exited early');
    try{if((await fetch(base,{signal:AbortSignal.timeout(600)})).ok)return;}catch{}
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  throw Error('Preview did not start');
}
async function register(page,email,username){
  await page.goto(base+'#/account/create',{waitUntil:'domcontentloaded'});
  await page.getByRole('heading',{name:'Create Account',level:1}).waitFor();
  await page.locator('#asteria-first-name').fill('Phase');
  await page.locator('#asteria-last-name').fill('Six');
  await page.locator('#asteria-username').fill(username);
  await page.locator('#asteria-email').fill(email);
  await page.locator('#asteria-password').fill('ExamplePassword123!');
  await page.locator('#asteria-confirm').fill('ExamplePassword123!');
  await page.getByTestId('site-auth-submit').click();
  await page.getByTestId('site-header-profile').waitFor({timeout:30000});
}
async function sessionStatus(page,value){
  await page.waitForFunction(expected=>{
    const status=document.querySelector('[data-testid="site-gm-session-status"]');
    return status?.textContent?.trim()===expected;
  },value,{timeout:25000});
}
(async()=>{let browser;
try{
  await ready();
  browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  const owner=await browser.newPage({viewport:{width:1440,height:900}});
  const player=await browser.newPage({viewport:{width:390,height:850}});
  for(const page of [owner,player])await page.route('**/*',route=>{
    const host=new URL(route.request().url()).hostname;
    return ['localhost','127.0.0.1'].includes(host)?route.continue():route.abort();
  });
  const suffix=Date.now().toString(36);
  await register(owner,'gm-six-'+suffix+'@example.test','GMSix'+suffix.slice(-5));
  await owner.goto(base+'#/campaign-forge',{waitUntil:'domcontentloaded'});
  await owner.getByTestId('site-campaign-create').waitFor({timeout:30000});
  await owner.getByTestId('site-campaign-create').click();
  const form=owner.getByTestId('site-campaign-form');
  await form.getByRole('textbox',{name:'Campaign Name'}).fill('Six Dashboard Campaign');
  await form.getByRole('spinbutton',{name:/Party Size/}).fill('4');
  await owner.getByTestId('site-campaign-save').click();
  await owner.getByRole('heading',{name:'Six Dashboard Campaign'}).waitFor({timeout:45000});
  await owner.getByTestId('site-campaign-gm-dashboard').click();
  await owner.getByTestId('site-gm-dashboard').waitFor({timeout:25000});
  await owner.getByRole('heading',{name:'Six Dashboard Campaign'}).waitFor({timeout:25000});
  await sessionStatus(owner,'IDLE');
  const deepLink=owner.url();
  assert.match(deepLink,/#\/react\/gm\//);
  await owner.getByTestId('site-gm-session-start').click();
  await sessionStatus(owner,'ACTIVE');
  await owner.getByTestId('site-gm-session-pause').click();
  await sessionStatus(owner,'PAUSED');
  await owner.getByTestId('site-gm-session-start').click();
  await sessionStatus(owner,'ACTIVE');
  owner.once('dialog',dialog=>dialog.accept());
  await owner.getByTestId('site-gm-session-end').click();
  await sessionStatus(owner,'ENDED');
  await owner.reload({waitUntil:'domcontentloaded'});
  await sessionStatus(owner,'ENDED');
  await owner.goto(base+'#/dashboard',{waitUntil:'domcontentloaded'});
  await owner.getByTestId('site-gm-open').waitFor({timeout:30000});
  await register(player,'player-six-'+suffix+'@example.test','PlayerSix'+suffix.slice(-5));
  await player.goto(deepLink,{waitUntil:'domcontentloaded'});
  const denied=player.getByTestId('site-gm-error');
  await denied.waitFor({timeout:30000});
  assert.match(await denied.innerText(),/GM access|permissions|permission/i);
  assert.equal(await player.getByTestId('site-gm-session-start').count(),0);
  for(const page of [owner,player])
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  console.log('PASS Phase 6.1: GM creation, routes, session lifecycle, refresh, owner list, player denial, responsive mobile');
}catch(error){console.error(error);process.exitCode=1;}
finally{if(browser)await browser.close();server.kill('SIGTERM');}
})();
