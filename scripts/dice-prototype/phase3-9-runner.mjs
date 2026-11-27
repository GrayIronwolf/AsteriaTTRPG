import fs from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'vite';
import {chromium} from 'playwright';
const out=path.join(process.cwd(),'dice-phase3-9-evidence'),checks=[],errors=[];
const check=(name,pass,details={})=>{
 checks.push({name,pass,details});
 console.log((pass?'PASS':'FAIL')+' | '+name+' | '+JSON.stringify(details));
};
const families=['Dragon Tower','Wizard Tower','Dwarven Forge','Nature Tower','Celestial Tower'];
let server,browser;
try{
 server=await createServer({root:path.join(process.cwd(),'scripts','dice-prototype'),
  configFile:false,server:{host:'127.0.0.1',port:0},logLevel:'warn'});
 await server.listen();
 browser=await chromium.launch({channel:'chrome',headless:true,args:[
  '--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader',
  '--disable-dev-shm-usage','--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1250,height:1000}});
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.httpServer.address().port+'/phase3-9.html');
 await page.waitForFunction(()=>document.querySelector('[data-roll-state=ready]'),null,{timeout:100000});
 check('Six physical tower choices in local-only studio',
  await page.getByRole('group',{name:'Six experimental dice tower families'})
   .getByRole('button').count()===6);
 check('No appearance edit triggers a server dice roll',
  await page.evaluate(()=>window.phase39Metrics.officialRollRequests)===0);
 await fs.mkdir(out,{recursive:true});
 for(const family of families){
  await page.getByRole('button',{name:family,exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('[data-roll-state=ready]'),null,{timeout:80000});
  check('Active '+family+' uses a real visible 3D renderer',
   await page.locator('.asteria-advanced-dice-scene canvas').count()===1&&
   await page.getByRole('note').count()===1);
  for(const variation of ['standard','detailed','grand']){
   await page.getByRole('combobox',{name:'Tower variation'}).selectOption(variation);
   await page.waitForFunction(()=>document.querySelector('[data-roll-state=ready]'),null,{timeout:80000});
   await page.getByRole('combobox',{name:'Test dice type'}).selectOption('20');
   await page.click('#server-roll');
   await page.waitForFunction(()=>['settled','mismatch','unavailable'].includes(
    document.querySelector('[data-roll-state]')?.dataset.rollState),null,{timeout:180000});
   const state=await page.evaluate(()=>{
    const scene=document.querySelector('.asteria-advanced-dice-scene');
    return {result:document.querySelector('[data-roll-state]')?.dataset.rollState,
     total:document.querySelector('.asteria-advanced-dice-official strong')?.textContent,
     faceMatch:scene?.dataset.towerFaceMatch||'',exited:scene?.dataset.towerExited||'',
     exitComplete:scene?.dataset.towerExitComplete||'',
     steps:scene?.dataset.towerSteps||'',attempts:scene?.dataset.towerAttempts||'',
     error:scene?.dataset.watcherError||scene?.dataset.towerError||''};
   });
   check(family+' '+variation+' physical d20 exit and verified face',
    state.result==='settled'&&state.total==='25'&&state.faceMatch==='true'&&
    state.exitComplete==='true'&&Number(state.exited)>=1&&
    Number(state.steps)>=60,state);
   await page.getByRole('button',{name:'Clear tray'}).click();
   await page.waitForFunction(()=>document.querySelector('[data-roll-state=ready]'),null,{timeout:20000});
  }
  await page.screenshot({path:path.join(out,
   family.toLowerCase().replaceAll(' ','-')+'.png'),fullPage:true});
 }
 await page.getByRole('button',{name:'Advanced tower options'}).click();
 check('Advanced tower options include real materials, trim, motif and sound',
  await page.getByRole('combobox',{name:'Tower base material'}).count()===1&&
  await page.getByRole('combobox',{name:'Tower motif'}).count()===1&&
  await page.getByRole('combobox',{name:'Tower impact sound'}).count()===1);
 await page.getByRole('combobox',{name:'Tower accent material'}).selectOption('gold');
 await page.locator('input[aria-label="Tower glow colour"]').fill('#82aaff');
 check('Studio edits remain local and preserve last authoritative count',
  await page.evaluate(()=>window.phase39Metrics.officialRollRequests)===15);
 await page.click('#resize');await page.waitForTimeout(300);
 const narrow=await page.evaluate(()=>{
  const node=document.querySelector('.asteria-advanced-dice');
  return {width:node.clientWidth,scroll:node.scrollWidth};
 });
 check('Tower studio fits a resized dashboard workspace',narrow.scroll<=narrow.width+1,narrow);
 await page.setViewportSize({width:390,height:820});
 const mobile=await page.evaluate(()=>({screen:innerWidth,content:document.documentElement.scrollWidth}));
 check('Mobile has no horizontal overflow',mobile.content<=mobile.screen+1,mobile);
 await page.screenshot({path:path.join(out,'tower-studio-mobile.png'),fullPage:true});
 await page.getByRole('checkbox',{name:'Animate in 3D'}).uncheck();
 await page.waitForFunction(()=>document.querySelector('[data-roll-state=paused]'),null,{timeout:15000});
 check('Towers safely disable animation',await page.locator('[data-roll-state=paused]').count()===1);
 check('No uncaught browser exceptions',errors.length===0,{errors});
}catch(error){
 console.error('FATAL '+String(error?.stack||error));
 checks.push({name:'Browser fatal',pass:false,error:String(error)});
}finally{
 await browser?.close().catch(()=>{});await server?.close().catch(()=>{});
 await fs.mkdir(out,{recursive:true});
 await fs.writeFile(path.join(out,'report.json'),JSON.stringify(checks,null,2));
}
const failed=checks.filter(x=>!x.pass).length;
console.log('PHASE 3.9 TOWER BROWSER SUMMARY '+JSON.stringify({passed:checks.length-failed,failed}));
if(failed)process.exitCode=1;
