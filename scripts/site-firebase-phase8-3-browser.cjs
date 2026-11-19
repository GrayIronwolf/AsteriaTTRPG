'use strict';
/* Authenticated browser offline/online lifecycle on the real Firebase emulators. */
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),base='http://127.0.0.1:4174/';
const server=spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),
  'preview','--config',path.join(root,'vite.site.config.mjs')],
  {cwd:root,stdio:['ignore','pipe','pipe']});
server.stdout.on('data',x=>process.stdout.write(x));
server.stderr.on('data',x=>process.stderr.write(x));
async function ready(){
  for(let i=0;i<90;i++){
    if(server.exitCode!==null)throw Error('Preview exited early.');
    try{if((await fetch(base,{signal:AbortSignal.timeout(500)})).ok)return;}catch{}
    await new Promise(r=>setTimeout(r,300));
  }
  throw Error('Preview did not start.');
}
(async()=>{let browser;
try{
  await ready();
  browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  const context=await browser.newContext({viewport:{width:390,height:850}});
  const page=await context.newPage();
  await page.route('**/*',route=>{
    const url=new URL(route.request().url());
    return ['127.0.0.1','localhost'].includes(url.hostname)?route.continue():route.abort();
  });
  const stamp=Date.now().toString(36);
  await page.goto(base+'#/account/create',{waitUntil:'domcontentloaded'});
  await page.locator('#asteria-first-name').fill('Phase');
  await page.locator('#asteria-last-name').fill('Eight');
  await page.locator('#asteria-username').fill('Offline'+stamp.slice(-5));
  await page.locator('#asteria-email').fill('offline-'+stamp+'@example.test');
  await page.locator('#asteria-password').fill('ExamplePassword123!');
  await page.locator('#asteria-confirm').fill('ExamplePassword123!');
  await page.getByTestId('site-auth-submit').click();
  await page.getByTestId('site-header-profile').waitFor({timeout:30000});
  await context.setOffline(true);
  await page.getByTestId('site-connection-suspended').waitFor({timeout:12000});
  assert.equal(await page.locator('[data-testid=site-gm-session-start]').count(),0);
  assert.match(await page.getByRole('alert').first().innerText(),/private campaign and character/i);
  await context.setOffline(false);
  await page.getByTestId('site-connection-suspended').waitFor({state:'detached',timeout:12000});
  await page.getByTestId('site-header-profile').waitFor({timeout:12000});
  await context.setOffline(true);
  await page.getByTestId('site-connection-suspended').waitFor({timeout:12000});
  await page.getByTestId('site-connection-signout').click();
  await page.getByTestId('site-header-login').waitFor({timeout:12000});
  assert.equal(await page.getByTestId('site-connection-suspended').count(),0);
  console.log('PASS: Authenticated React offline suspension, fresh reconnection and offline sign-out.');
}catch(error){console.error(error.stack||error);process.exitCode=1;}
finally{await browser?.close();server.kill('SIGTERM');}
})();
