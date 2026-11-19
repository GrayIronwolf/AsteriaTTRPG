/* Phase 10.1: offline guest comparison + authenticated React emulator baselines.
 * No live production sign-in or data. Evidence is never cutover authorization.
 */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const evidence=path.resolve(process.env.RUNNER_TEMP||root,'asteria-phase-10-1-baselines');
const modern='http://127.0.0.1:4174/',legacy='http://127.0.0.1:8123/';
const ports=new Set(['4174','9099','8080','5001','9199']);
const screens={desktop:{width:1440,height:900},mobile:{width:390,height:844}};
const servers=[];
const report={
 schemaVersion:1,phase:'10.1',generatedAt:new Date().toISOString(),
 environment:'isolated React/Vite and checked-in legacy static site; demo-asteria Firebase emulators',
 productionAccessed:false,deployed:false,cutoverApproved:false,
 legacyAuthenticated:'not-captured',screenshots:[],baselines:{guest:{},gm:{},player:{}},
 comparisons:{},
 outstanding:[
  'Authenticated legacy GM and player production baseline evidence is not accessible in offline CI',
  'Manually compare redacted legacy authenticated screenshots before final production cutover',
  'Phase 10.2 functional and Firebase security parity remains required',
  'Phase 10.3 visual, accessibility, mobile and performance verification remains required',
  'Phase 10.4 production entry, cache compatibility and rollback approval remains required'
 ]
};
function start(args){
 const child=spawn(process.execPath,args,{cwd:root,stdio:['ignore','pipe','pipe']});
 child.stdout.on('data',b=>process.stdout.write(b));
 child.stderr.on('data',b=>process.stderr.write(b));
 servers.push(child);return child;
}
async function ready(url,child){
 for(let i=0;i<100;i++){
  if(child.exitCode!==null)throw Error('Site server exited');
  try{if((await fetch(url,{signal:AbortSignal.timeout(600)})).ok)return;}catch{}
  await new Promise(r=>setTimeout(r,250));
 }
 throw Error('Site server did not start: '+url);
}
async function observe(page,allowed){
 const issues={runtimeErrors:0,blockedExternal:0,httpErrors:0};
 page.on('pageerror',()=>issues.runtimeErrors++);
 page.on('response',r=>{if(r.status()>=400&&!r.url().endsWith('/favicon.ico'))issues.httpErrors++;});
 await page.route('**/*',route=>{
  const url=new URL(route.request().url());
  if(['127.0.0.1','localhost'].includes(url.hostname)&&allowed.has(url.port))
   return route.continue();
  issues.blockedExternal++;return route.abort();
 });
 return issues;
}
async function metrics(page){
 return page.evaluate(()=>{
  const performanceNavigation=performance.getEntriesByType('navigation')[0];
  return {
   viewport:innerWidth,documentWidth:document.documentElement.scrollWidth,
   overflow:document.documentElement.scrollWidth>innerWidth,
   headers:document.querySelectorAll('header').length,
   mains:document.querySelectorAll('main').length,
   navigationLinks:document.querySelectorAll('nav a').length,
   brokenLoadedImages:[...document.images].filter(x=>x.complete&&x.naturalWidth===0).length,
   resourceCount:performance.getEntriesByType('resource').length,
   domReadyMs:performanceNavigation?Math.round(performanceNavigation.domContentLoadedEventEnd):null
  };
 });
}
async function capture(page,role,site,surface,size){
 await page.setViewportSize(screens[size]);
 await page.evaluate(()=>document.fonts?.ready).catch(()=>{});
 const name=[site,role,surface,size].join('-')+'.png';
 await page.screenshot({path:path.join(evidence,name),animations:'disabled',fullPage:false});
 const result=await metrics(page);
 report.baselines[role][site+'-'+surface+'-'+size]={file:name,...result};
 report.screenshots.push(name);
 if(site==='react'){
  assert.equal(result.overflow,false,'React viewport overflow: '+name);
  assert.equal(result.mains,1,'React main landmark duplicated: '+name);
 }
 return result;
}
async function account(page,email,username){
 await page.goto(modern+'#/account/create',{waitUntil:'domcontentloaded'});
 await page.getByRole('heading',{name:'Create Account',level:1}).waitFor();
 for(const [id,value] of [
  ['#asteria-first-name','Baseline'],['#asteria-last-name','Fixture'],
  ['#asteria-username',username],['#asteria-email',email],
  ['#asteria-password','ExamplePassword123!'],['#asteria-confirm','ExamplePassword123!']
 ])await page.locator(id).fill(value);
 await page.getByTestId('site-auth-submit').click();
 await page.getByTestId('site-header-profile').waitFor({timeout:40000});
}
async function forgeCharacter(page){
 await page.goto(modern+'#/character-forge',{waitUntil:'domcontentloaded'});
 await page.getByTestId('site-forge-create').waitFor({timeout:30000});
 await page.getByTestId('site-forge-create').click();
 await page.getByTestId('site-forge-tab-race').click();
 await page.locator('button[aria-pressed]').first().click();
 await page.getByTestId('site-forge-tab-class').click();
 await page.getByRole('button',{name:/Barbarian/}).first().click();
 await page.getByTestId('site-forge-tab-magic').click();
 await page.getByRole('checkbox',{name:'Air Magic',exact:true}).check();
 await page.getByTestId('site-forge-tab-skills').click();
 for(let i=0;i<4;i++)await page.locator('main input[type=checkbox]').nth(i).check();
 await page.getByTestId('site-forge-tab-affinity-rolls').click();
 for(let i=0;i<5;i++)await page.locator('main input[type=number]').nth(i).fill('65');
 for(let i=0;i<5;i++)await page.getByRole('button',{name:'Confirm / Lock'}).first().click();
 await page.getByTestId('site-forge-tab-equipment').click();
 await page.locator('button[aria-pressed]').first().click();
 await page.getByTestId('site-forge-tab-review').click();
 await page.getByRole('textbox',{name:'Character Name'}).fill('Baseline Character');
 await page.getByTestId('site-forge-save').click();
 await page.getByRole('heading',{name:'Baseline Character'}).waitFor({timeout:40000});
}
async function main(){
 let browser;
 try{
  fs.mkdirSync(evidence,{recursive:true});
  const site=start([path.join(root,'node_modules/vite/bin/vite.js'),'preview','--config',path.join(root,'vite.site.config.mjs')]);
  const staticSite=start([path.join(root,'scripts/local-static-server.js'),'8123']);
  await Promise.all([ready(modern,site),ready(legacy,staticSite)]);
  browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||undefined,
   args:['--no-sandbox','--disable-dev-shm-usage']});
  const old=await browser.newPage({viewport:screens.desktop});
  const oldErrors=await observe(old,new Set(['8123']));
  await old.goto(legacy,{waitUntil:'domcontentloaded'});
  await old.locator('#home').waitFor({state:'attached'});
  await old.locator('#globalNavigation').waitFor({state:'attached'});
  await old.waitForLoadState('load',{timeout:18000}).catch(()=>{});
  const oldDesktop=await capture(old,'guest','legacy','home','desktop');
  const oldMobile=await capture(old,'guest','legacy','home','mobile');
  assert.ok(await old.locator('#asteriaHeaderBrand').count());
  report.baselines.guest.legacyOffline={
   signedIn:false,legacyScripts:await old.locator('script[src]').count(),
   legacyStylesheets:await old.locator('link[rel=stylesheet]').count(),
   blockedExternalRequests:oldErrors.blockedExternal,
   observedJavaScriptErrors:oldErrors.runtimeErrors
  };

  const guest=await browser.newPage({viewport:screens.desktop});
  const guestErrors=await observe(guest,ports);
  await guest.goto(modern,{waitUntil:'domcontentloaded'});
  await guest.getByRole('heading',{name:'Asteria',level:1,exact:true}).waitFor();
  assert.equal(await guest.getByTestId('site-header-login').count(),1);
  const newDesktop=await capture(guest,'guest','react','home','desktop');
  const newMobile=await capture(guest,'guest','react','home','mobile');
  assert.equal(guestErrors.runtimeErrors,0,'Unexpected React guest runtime error');
  report.comparisons.guestHome={
   status:'compared-offline',identity:'guest',
   desktop:{legacyMain:oldDesktop.mains,reactMain:newDesktop.mains,
    legacyOverflow:oldDesktop.overflow,reactOverflow:newDesktop.overflow,
    legacyBrokenImages:oldDesktop.brokenLoadedImages,reactBrokenImages:newDesktop.brokenLoadedImages},
   mobile:{legacyOverflow:oldMobile.overflow,reactOverflow:newMobile.overflow},
   caveat:'Checked-in legacy entry captured offline. Not a production rendering or authenticated legacy baseline.'
  };

  const suffix=Date.now().toString(36);
  const gm=await browser.newPage({viewport:screens.desktop});
  await observe(gm,ports);
  await account(gm,'baseline-gm-'+suffix+'@example.test','GM10'+suffix.slice(-6));
  await gm.goto(modern,{waitUntil:'domcontentloaded'});
  await gm.getByRole('heading',{name:'Asteria',level:1,exact:true}).waitFor();
  await capture(gm,'gm','react','signed-in-home','desktop');
  await gm.goto(modern+'#/campaign-forge',{waitUntil:'domcontentloaded'});
  await gm.getByTestId('site-campaign-create').waitFor({timeout:30000});
  await gm.getByTestId('site-campaign-create').click();
  const form=gm.getByTestId('site-campaign-form');
  await form.getByRole('textbox',{name:'Campaign Name'}).fill('Baseline GM Campaign');
  await form.getByRole('spinbutton',{name:/Party Size/}).fill('4');
  await gm.getByTestId('site-campaign-save').click();
  await gm.getByRole('heading',{name:'Baseline GM Campaign'}).waitFor({timeout:45000});
  await capture(gm,'gm','react','campaign-forge','desktop');
  await gm.getByTestId('site-campaign-gm-dashboard').click();
  await gm.getByTestId('site-gm-dashboard').waitFor({timeout:30000});
  await gm.getByTestId('site-gm-session-status').waitFor({timeout:30000});
  const gmRoute=gm.url();
  assert.match(gmRoute,/#\/react\/gm\//);
  await capture(gm,'gm','react','dashboard','desktop');
  await capture(gm,'gm','react','dashboard','mobile');

  const player=await browser.newPage({viewport:screens.desktop});
  await observe(player,ports);
  await account(player,'baseline-player-'+suffix+'@example.test','Player10'+suffix.slice(-6));
  await player.goto(modern,{waitUntil:'domcontentloaded'});
  await player.getByRole('heading',{name:'Asteria',level:1,exact:true}).waitFor();
  await capture(player,'player','react','signed-in-home','desktop');
  await forgeCharacter(player);
  await capture(player,'player','react','character-forge','desktop');
  await player.getByTestId('site-forge-open-dashboard').click();
  await player.getByTestId('site-player-dashboard').waitFor({timeout:30000});
  await player.getByTestId('site-player-resources').waitFor({timeout:30000});
  const playerRoute=player.url();
  assert.match(playerRoute,/#\/react\/owned-character\//);
  await capture(player,'player','react','dashboard','desktop');
  await capture(player,'player','react','dashboard','mobile');

  // Access controls are tested without writing any account or token IDs into evidence.
  await player.goto(gmRoute,{waitUntil:'domcontentloaded'});
  await player.getByTestId('site-gm-error').waitFor({timeout:30000});
  assert.equal(await player.getByTestId('site-gm-session-start').count(),0);
  await gm.goto(playerRoute,{waitUntil:'domcontentloaded'});
  await gm.getByTestId('site-player-error').waitFor({timeout:30000});
  assert.equal(await gm.getByText('Baseline Character').count(),0);
  report.comparisons.gm={
   reactEmulator:'captured',legacyAuthenticated:'not-captured',
   scenarios:['sign in','create campaign','GM dashboard','mobile','unrelated player denied'],
   signoff:false
  };
  report.comparisons.player={
   reactEmulator:'captured',legacyAuthenticated:'not-captured',
   scenarios:['sign in','create character','owner dashboard','mobile','other account denied'],
   signoff:false
  };
  assert.equal(report.productionAccessed,false);
  console.log('PASS Phase 10.1: offline guest cross-entry comparison; separate authenticated GM/player emulator screenshots and cross-account denial.');
 } finally {
  try{
   fs.mkdirSync(evidence,{recursive:true});
   fs.writeFileSync(path.join(evidence,'phase-10-1-baselines.json'),JSON.stringify(report,null,2)+'\n');
  }catch(error){console.error('Baseline evidence write failed:',error);process.exitCode=1;}
  if(browser)await browser.close();
  for(const server of servers)server.kill('SIGTERM');
 }
}
main().catch(error=>{console.error('Phase 10.1 baseline capture failed:',error);process.exitCode=1;});
