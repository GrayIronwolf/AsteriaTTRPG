/* Phase 3.2: real public entries, tabs, bookmarks, safe rendering and privacy. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),base='http://127.0.0.1:4174/';
const evidence=path.join(process.env.RUNNER_TEMP||root,'asteria-phase-3-2-entry-evidence');
const server=spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'preview','--config',path.join(root,'vite.site.config.mjs')],{cwd:root,stdio:['ignore','pipe','pipe']});
server.stdout.on('data',x=>process.stdout.write(x));
server.stderr.on('data',x=>process.stderr.write(x));
async function ready(){for(let i=0;i<90;i++){if(server.exitCode!==null)throw Error('Preview exited');
try{if((await fetch(base,{signal:AbortSignal.timeout(500)})).ok)return;}catch{/* warming */}
await new Promise(r=>setTimeout(r,250));}throw Error('Preview startup timeout');}
(async()=>{let browser;
try{
 fs.mkdirSync(evidence,{recursive:true});await ready();
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 const issues=[];
 page.on('pageerror',err=>issues.push(err.message));
 page.on('console',msg=>{if(msg.type()==='error')issues.push(msg.text());});
 await page.route('**/*',route=>{const u=new URL(route.request().url());
 if(u.hostname==='127.0.0.1'&&u.port==='4174')return route.continue();
 issues.push('External request '+u.origin);return route.abort();});
 await page.goto(base+'#/compendium/handbook/rule-of-cool',{waitUntil:'networkidle'});
 await page.getByRole('heading',{name:'Rule of Cool',level:1}).waitFor();
 await page.getByTestId('site-entry-tabs').waitFor();
 assert.ok(await page.getByTestId('site-entry-tab').count()>=5);
 assert.equal(await page.getByTestId('site-entry-id').count(),1);
 assert.ok((await page.getByTestId('site-entry-section').innerText()).trim().length > 10,
  'Expected real public Markdown in the initial section');
 const tabs=page.getByTestId('site-entry-tab');
 const link=await tabs.filter({hasText:'Core Rule'}).first().getAttribute('href');
 assert.ok(link.includes('tab=Core+Rule'),link);
 await tabs.filter({hasText:'Core Rule'}).first().click();
 await page.getByRole('heading',{name:'Core Rule',level:2}).waitFor();
 assert.equal(await page.evaluate(()=>location.hash),'#/compendium/handbook/rule-of-cool?tab=Core+Rule');
 await page.reload({waitUntil:'networkidle'});
 await page.getByRole('heading',{name:'Core Rule',level:2}).waitFor();
 await page.goBack({waitUntil:'networkidle'});
 await page.getByRole('heading',{name:'Rule of Cool',level:1}).waitFor();

 await page.goto(base+'#/compendium/race/aasimar?tab=Overview',{waitUntil:'networkidle'});
 await page.getByRole('heading',{name:'Aasimar',level:1}).waitFor();
 assert.equal(await page.getByTestId('site-entry-tabs').getByText('GM Notes').count(),0);
 assert.ok(!(await page.locator('main').innerText()).includes('GM-only information coming soon.'));
 await page.getByTestId('site-entry-tabs').getByRole('link',{name:'Racial Traits'}).click();
 await page.getByRole('heading',{name:'Racial Traits',level:2}).waitFor();
 assert.equal(await page.evaluate(()=>location.hash),'#/compendium/race/aasimar?tab=Racial+Traits');

 await page.goto(base+'#/compendium/talent/divine-aegis',{waitUntil:'networkidle'});
 await page.getByRole('heading',{name:'Multiple definitions share this address',level:1}).waitFor();
 assert.equal(await page.getByTestId('site-entry-tabs').count(),0);
 await page.goto(base+'#/compendium/race/invalid-private-definition',{waitUntil:'networkidle'});
 await page.getByRole('heading',{name:'Definition unavailable',level:1}).waitFor();
 assert.equal(await page.getByTestId('site-entry-section').count(),0);
 await page.goto(base+'#/compendium/race/%2e%2e',{waitUntil:'networkidle'});
 await page.getByRole('heading',{name:'Definition unavailable',level:1}).waitFor();
 await page.goto(base+'#/react/gm/private',{waitUntil:'networkidle'});
 await page.getByRole('heading',{name:'GM Dashboard',level:1}).waitFor();
 assert.equal(await page.locator('main form,main input').count(),0);

 for(const width of [320,390,760,1280,1440,1920]){
  await page.setViewportSize({width,height:900});
  await page.goto(base+'#/compendium/handbook/rule-of-cool?tab=Core+Rule',{waitUntil:'networkidle'});
  await page.getByRole('heading',{name:'Core Rule',level:2}).waitFor();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Overflow at '+width);
  if(width===390||width===1440)await page.screenshot({path:path.join(evidence,'entry-'+width+'.png'),fullPage:true,animations:'disabled'});
 }
 assert.deepEqual(issues,[],'Browser console/remote requests');
 fs.writeFileSync(path.join(evidence,'summary.json'),JSON.stringify({phase:'3.2',realPublicEntries:true,authenticatedRoutes:false,viewports:[320,390,760,1280,1440,1920],issues},null,2));
 console.log('PASS: public definition Markdown, section bookmarks, ambiguous and missing routes, privacy and responsive layout');
}catch(error){console.error(error);process.exitCode=1;}finally{if(browser)await browser.close();server.kill('SIGTERM');}})();
