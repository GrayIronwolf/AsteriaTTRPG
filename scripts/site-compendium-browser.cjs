/* Phase 3.1 public-only catalogue browser regression. */
'use strict';
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const base='http://127.0.0.1:4174/';
const evidence=path.join(process.env.RUNNER_TEMP||root,'asteria-phase-3-1-compendium-evidence');
const child=spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'preview','--config',path.join(root,'vite.site.config.mjs')],
 {cwd:root,stdio:['ignore','pipe','pipe']});
child.stdout.on('data',data=>process.stdout.write(data));
child.stderr.on('data',data=>process.stderr.write(data));
async function ready(){for(let i=0;i<90;i++){if(child.exitCode!==null)throw Error('Preview exited');
 try{if((await fetch(base,{signal:AbortSignal.timeout(650)})).ok)return;}catch{/* starting */}
 await new Promise(done=>setTimeout(done,250));}throw Error('Preview did not start');}
(async()=>{let browser;
try{
 fs.mkdirSync(evidence,{recursive:true});
 await ready();
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',e=>{if(e.type()==='error')errors.push(e.text());});
 await page.route('**/*',route=>{
  const u=new URL(route.request().url());
  if(u.hostname==='127.0.0.1' && u.port==='4174')return route.continue();
  errors.push('external request '+u.origin);
  return route.abort();
 });
 await page.goto(base+'#/compendium?group=rules&category=handbook',{waitUntil:'networkidle'});
 await page.getByRole('heading',{name:'Asteria Handbook',level:1}).waitFor();
 await page.getByTestId('site-compendium-results').waitFor();
 assert.ok((await page.getByTestId('site-compendium-card').count())>=1);
 await page.getByTestId('site-compendium-search').fill('Rule of Cool');
 const filtered=page.getByTestId('site-compendium-card');
 assert.equal(await filtered.count(),1,'Canonical handbook search did not narrow correctly');
 assert.match(await filtered.first().innerText(),/Rule of Cool/);
 assert.equal(await filtered.first().getAttribute('href'),'#/compendium/handbook/rule-of-cool');
 await filtered.first().click();
 await page.getByRole('heading',{name:'Rule of Cool',level:1}).waitFor();
 await page.getByTestId('site-entry-tabs').waitFor();
 assert.equal(await page.getByTestId('site-entry-section').count(),1,'Public detail page should render a section');
 await page.goBack({waitUntil:'networkidle'});
 await page.getByRole('heading',{name:'Asteria Handbook',level:1}).waitFor();
 await page.goto(base+'#/compendium?group=characters&category=races',{waitUntil:'networkidle'});
 await page.getByTestId('site-compendium-results').waitFor();
 await page.getByTestId('site-compendium-card').first().waitFor();
  assert.ok(await page.getByTestId('site-compendium-card').count()>=1);
 assert.ok((await page.getByTestId('site-compendium-card').first().getAttribute('href')).startsWith('#/compendium/race/'));
 await page.getByTestId('site-compendium-domain').selectOption('item');
 await page.getByTestId('site-compendium-results').waitFor();
 assert.equal(await page.evaluate(()=>location.hash),'#/compendium?domain=item');
 await page.getByTestId('site-compendium-card').first().waitFor();
  assert.ok(await page.getByTestId('site-compendium-card').count()>=1);
 for(const width of [320,390,760,1280,1440,1920]){
  await page.setViewportSize({width,height:900});
  await page.getByTestId('site-compendium-results').waitFor();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Overflow at '+width);
  if(width===390||width===1440)await page.screenshot({path:path.join(evidence,'compendium-'+width+'.png'),fullPage:true,animations:'disabled'});
 }
 await page.goto(base+'#/react/gm/private-campaign',{waitUntil:'networkidle'});
 await page.getByRole('heading',{name:'GM Dashboard',level:1}).waitFor();
 assert.equal(await page.locator('main input, main form').count(),0);
 assert.deepEqual(errors,[],'Browser errors/remote requests');
 fs.writeFileSync(path.join(evidence,'summary.json'),JSON.stringify({phase:'3.1',publicCatalogueOnly:true,fullEntryRendering:false,privateBackend:false,errors},null,2));
 console.log('PASS: public Compendium catalogue, canonical links, search, filters, responsiveness and private-route isolation');
}catch(e){console.error(e);process.exitCode=1;}finally{if(browser)await browser.close();child.kill('SIGTERM');}})();
