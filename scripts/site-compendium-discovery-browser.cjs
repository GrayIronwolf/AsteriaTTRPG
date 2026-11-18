/* Phase 3.3: category tree, search, history, public-only data and layout. */
'use strict';
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const base='http://127.0.0.1:4174/';
const evidence=path.join(process.env.RUNNER_TEMP||root,'asteria-phase-3-3-discovery-evidence');
const server=spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'preview','--config',path.join(root,'vite.site.config.mjs')],{cwd:root,stdio:['ignore','pipe','pipe']});
server.stdout.on('data',x=>process.stdout.write(x));
server.stderr.on('data',x=>process.stderr.write(x));
async function ready(){for(let i=0;i<100;i++){if(server.exitCode!==null)throw Error('Preview exited');
try{if((await fetch(base,{signal:AbortSignal.timeout(500)})).ok)return;}catch{/* warming */}
await new Promise(r=>setTimeout(r,250));}throw Error('Preview startup timeout');}
(async()=>{let browser;
try{
  fs.mkdirSync(evidence,{recursive:true}); await ready();
  browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  const issues=[];
  page.on('pageerror',err=>issues.push(err.message));
  page.on('console',msg=>{if(msg.type()==='error')issues.push(msg.text());});
  await page.route('**/*',route=>{
    const u=new URL(route.request().url());
    if(u.hostname==='127.0.0.1'&&u.port==='4174')return route.continue();
    issues.push('External call '+u.origin);return route.abort();
  });
  await page.goto(base+'#/compendium?group=characters&category=races',{waitUntil:'networkidle'});
  await page.getByTestId('site-compendium-results').waitFor();
  await page.getByTestId('site-discovery-facets').waitFor();
  const rootCategory=page.getByTestId('site-discovery-facet').filter({hasText:'Beastkin Races'});
  assert.equal(await rootCategory.count(),1);
  assert.ok((await rootCategory.innerText()).includes('Beastkin Races'));
  await rootCategory.click();
  await page.getByTestId('site-discovery-trail').getByText('Beastkin Races').waitFor();
  assert.ok((await page.evaluate(()=>location.hash)).includes('path=Beastkin+Races'));
  const child=page.getByTestId('site-discovery-facet').filter({hasText:'Ursa Races'});
  assert.equal(await child.count(),1);
  await child.click();
  await page.getByTestId('site-discovery-trail').getByText('Ursa Races').waitFor();
  assert.ok((await page.evaluate(()=>location.hash)).includes('path=Ursa+Races'));
  assert.ok(await page.getByTestId('site-compendium-card').count()>=2);
  const rows=await page.getByTestId('site-compendium-card').allInnerTexts();
  assert.ok(rows.every(text=>text.includes('Ursa Races')),'Category descendants leaked across branches');
  await page.reload({waitUntil:'networkidle'});
  await page.getByTestId('site-discovery-trail').getByText('Ursa Races').waitFor();
  await page.goBack({waitUntil:'networkidle'});
  await page.getByTestId('site-discovery-trail').getByText('Beastkin Races').waitFor();
  await page.getByTestId('site-discovery-clear').click();
  await page.getByTestId('site-compendium-results').waitFor();
  assert.equal(await page.evaluate(()=>location.hash),'#/compendium');

  await page.goto(base+'#/compendium?group=rules&category=handbook',{waitUntil:'networkidle'});
  await page.getByTestId('site-compendium-search').fill('Rule of Cool');
  assert.equal(await page.getByTestId('site-compendium-card').count(),1,
    'Typing should preview metadata matches');
  await page.getByTestId('site-discovery-submit').click();
  await page.getByTestId('site-compendium-results').waitFor();
  assert.ok((await page.evaluate(()=>location.hash)).includes('q=Rule+of+Cool'));
  assert.ok(await page.getByTestId('site-compendium-card').count()>=1);
  await page.getByTestId('site-compendium-sort').selectOption('za');
  await page.getByTestId('site-compendium-results').waitFor();
  assert.ok((await page.evaluate(()=>location.hash)).includes('sort=za'));
  await page.reload({waitUntil:'networkidle'});
  assert.equal(await page.getByTestId('site-compendium-search').inputValue(),'Rule of Cool');
  assert.equal(await page.getByTestId('site-compendium-sort').inputValue(),'za');

  await page.goto(base+'#/compendium?domain=handbook&q=heroic',{waitUntil:'networkidle'});
  await page.getByTestId('site-compendium-results').waitFor();
  const one=page.getByTestId('site-compendium-card');
  assert.ok(await one.count()>=1);
  await one.first().click();
  await page.getByTestId('site-compendium-entry-page').waitFor();
  await page.getByTestId('site-entry-tabs').waitFor();

  for(const width of [320,390,760,1024,1280,1440,1920]){
    await page.setViewportSize({width,height:900});
    await page.goto(base+'#/compendium?group=characters&category=races&path=Beastkin+Races',{waitUntil:'networkidle'});
    await page.getByTestId('site-compendium-results').waitFor();
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Horizontal overflow at '+width);
    if(width===390||width===1440) await page.screenshot({path:path.join(evidence,'hierarchy-'+width+'.png'),fullPage:true,animations:'disabled'});
  }
  await page.goto(base+'#/react/gm/not-public',{waitUntil:'networkidle'});
  await page.getByRole('heading',{name:'GM Dashboard',level:1}).waitFor();
  assert.equal(await page.locator('main input,main form').count(),0);
  assert.deepEqual(issues,[],issues.join('\n'));
  fs.writeFileSync(path.join(evidence,'summary.json'),JSON.stringify({
    phase:'3.3',liveFirebase:false,privateContent:false,
    viewports:[320,390,760,1024,1280,1440,1920],issues
  },null,2));
  console.log('PASS: Phase 3.3 category hierarchy, bookmarks, search, sorting and privacy');
}catch(error){console.error(error);process.exitCode=1;}finally{if(browser)await browser.close();server.kill('SIGTERM');}})();
