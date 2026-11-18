/* Phase 4.1: real Auth/Firestore emulator browser acceptance, no production API.
 * CI builds an explicitly opt-in localhost Firebase emulator preview first.
 */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'), base='http://127.0.0.1:4174/';
const evidence=path.join(process.env.RUNNER_TEMP||root,'asteria-phase-4-1-auth-evidence');
const server=spawn(process.execPath,[
  path.join(root,'node_modules/vite/bin/vite.js'),'preview',
  '--config',path.join(root,'vite.site.config.mjs')
],{cwd:root,stdio:['ignore','pipe','pipe']});
server.stdout.on('data',x=>process.stdout.write(x));
server.stderr.on('data',x=>process.stderr.write(x));
async function ready(){
 for(let i=0;i<100;i++){
  if(server.exitCode!==null)throw Error('Vite preview exited');
  try{if((await fetch(base,{signal:AbortSignal.timeout(600)})).ok)return;}catch{/* waiting */}
  await new Promise(resolve=>setTimeout(resolve,250));
 }throw Error('Vite preview did not start');
}
async function within(page,width) {
 await page.setViewportSize({width,height:900});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),
  true,'Horizontal overflow at '+width);
}
(async()=>{let browser;
try{
 fs.mkdirSync(evidence,{recursive:true});
 await ready();
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 const errors=[];
 const authRequests=[];
 page.on('request',request => {
  const u=new URL(request.url());
  if(u.port==='9099')authRequests.push({method:request.method(),path:u.pathname});
 });
 page.on('pageerror',err=>errors.push('pageerror '+err.message));
 page.on('console',msg=>{
  if(msg.type()==='error'&&!msg.text().includes('127.0.0.1:5001'))errors.push('console '+msg.text());
 });
 await page.route('**/*',route=>{
  const url=new URL(route.request().url());
  if(['127.0.0.1','localhost'].includes(url.hostname))return route.continue();
  errors.push('external request '+url.origin);return route.abort();
 });
 const email='site-phase41-'+Date.now()+'@example.test';
 const username='PreviewPhase41';
 const password='ExamplePassword123!';
 await page.goto(base,{waitUntil:'domcontentloaded'});
 await page.getByRole('heading',{name:'Asteria',exact:true,level:1}).waitFor();
 assert.equal(await page.evaluate(()=>location.hash),'');
 assert.equal(await page.getByTestId('site-header-login').count(),1);
 await page.getByTestId('site-header-login').click();
 await page.getByTestId('site-auth-form').waitFor();
 assert.equal(await page.getByRole('heading',{name:'Login',exact:true,level:1}).count(),1);
 await page.getByRole('link',{name:'Create Account'}).last().click();
 await page.getByRole('heading',{name:'Create Account',level:1}).waitFor();
 await page.locator('#asteria-first-name').fill('Preview');
 await page.locator('#asteria-last-name').fill('Tester');
 await page.locator('#asteria-username').fill(username);
 await page.locator('#asteria-email').fill(email);
 await page.locator('#asteria-password').fill(password);
 await page.locator('#asteria-confirm').fill(password);
 await page.getByTestId('site-auth-submit').click();
 await page.getByTestId('site-auth-message').getByText(/Account created in Firebase Authentication/).waitFor({timeout:30000});
 assert.match(await page.getByTestId('site-auth-message').innerText(),/account profile was saved/i);
 await page.getByTestId('site-header-profile').waitFor();
 assert.equal(await page.getByTestId('site-header-login').count(),0);
 assert.equal(await page.getByTestId('site-header-account-menu').count(),1);
 await page.goto(base+'#/account/profile',{waitUntil:'domcontentloaded'});
 await page.getByRole('heading',{name:'My Profile',level:1}).waitFor();
 assert.equal(await page.locator('main form,main input').count(),0,
  'Account profile editing is deliberately deferred to Phase 4.2');
 await page.goto(base+'#/react/gm/private-campaign',{waitUntil:'domcontentloaded'});
 await page.getByRole('heading',{name:'GM Dashboard',level:1}).waitFor();
 assert.equal(await page.locator('main form,main input').count(),0,
  'Authentication alone must not unlock campaign data');

 await page.goto(base+'#home',{waitUntil:'domcontentloaded'});
 await page.reload({waitUntil:'domcontentloaded'});
 await page.getByRole('heading',{name:'Asteria',exact:true,level:1}).waitFor();
 await page.getByTestId('site-header-profile').waitFor();
 assert.equal(await page.evaluate(()=>location.hash),'#home',
  'Restored auth must not redirect Home into Character Forge');
 for(const width of [390,1440]){
  await within(page,width);
  await page.screenshot({path:path.join(evidence,'signed-in-home-'+width+'.png'),animations:'disabled'});
 }
 await page.getByTestId('site-header-account-menu').locator('summary').click();
 await page.getByTestId('site-header-logout').click();
 await page.getByTestId('site-header-login').waitFor();
 assert.equal(await page.getByTestId('site-header-profile').count(),0);
 await page.goto(base+'#/account/login',{waitUntil:'domcontentloaded'});
 await page.getByTestId('site-auth-form').waitFor();
 await page.locator('#asteria-email').fill(email);
 await page.locator('#asteria-password').fill('incorrect-password');
 await page.getByTestId('site-auth-submit').click();
 await page.getByTestId('site-auth-message').getByText(/Unable to sign in with those credentials/).waitFor();
 assert.equal(await page.getByTestId('site-header-profile').count(),0);
 await page.locator('#asteria-password').fill(password);
 await page.getByTestId('site-auth-submit').click();
 await page.getByText('Signed in to Asteria.').waitFor();
 await page.getByTestId('site-header-profile').waitFor();
 await page.goto(base+'#/account/login',{waitUntil:'domcontentloaded'});
 await page.getByRole('button',{name:'Logout'}).click();
 await page.getByTestId('site-header-login').waitFor();
 await page.getByRole('link',{name:'Forgot password?'}).click();
 await page.getByRole('heading',{name:'Reset Password',level:1}).waitFor();
 await page.locator('#asteria-email').fill(email);
 await page.evaluate(() => { window.__siteResetSubmitCount = 0;
  document.querySelector('[data-testid="site-auth-form"]')?.addEventListener('submit', () => { window.__siteResetSubmitCount++; }, true);
 });
 await page.getByTestId('site-auth-submit').click();
 try {
  await page.getByTestId('site-auth-message').waitFor({timeout:8000});
 } catch {
  const diagnostic=await page.evaluate(() => ({
    title:document.querySelector('#site-auth-title')?.textContent,
    submit:document.querySelector('[data-testid="site-auth-submit"]')?.textContent,
    disabled:document.querySelector('[data-testid="site-auth-submit"]')?.disabled,
    statuses:[...document.querySelectorAll('main [role="status"], main [role="alert"]')]
      .map(el=>el.textContent?.slice(0,200)),
    formPresent:!!document.querySelector('[data-testid="site-auth-form"]'),
    formValid:document.querySelector('[data-testid="site-auth-form"]')?.checkValidity(),
    submitCount:window.__siteResetSubmitCount,
    emailValue:document.querySelector('#asteria-email')?.value,
    emailValidation:document.querySelector('#asteria-email')?.validationMessage
  }));
  throw new Error('Password reset diagnostic: '+JSON.stringify({diagnostic,authRequests:authRequests.slice(-12),errors}));
 }
 const resetMessage = await page.getByTestId('site-auth-message').innerText();
 assert.match(resetMessage,/If an account exists for that address/,
   'Reset feedback did not confirm generic response: '+resetMessage);
 assert.equal(await page.getByTestId('site-header-profile').count(),0);
 for(const width of [320,760,1280,1920])await within(page,width);
 assert.deepEqual(errors,[],errors.join('; '));
 fs.writeFileSync(path.join(evidence,'summary.json'),JSON.stringify({
  phase:'4.1',mode:'demo-asteria local Auth/Firestore emulators',
  passwordStored:false,productionTouched:false,protectedFeatures:false,
  tested:['registration','verified owner profile','session restoration','logout','login','wrong password','password reset','GM route lock'],
  widths:[320,390,760,1280,1440,1920],errors
 },null,2));
 console.log('PASS: Phase 4.1 real Firebase emulators, register, login, logout, reset, reload and protected routes');
}catch(error){console.error(error);process.exitCode=1;}finally{
 if(browser)await browser.close();server.kill('SIGTERM');
}})();
