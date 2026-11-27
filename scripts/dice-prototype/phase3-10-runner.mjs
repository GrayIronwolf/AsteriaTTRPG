import fs from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'vite';
import {chromium} from 'playwright';
const output=path.join(process.cwd(),'dice-phase3-10-evidence'),checks=[],errors=[];
const check=(name,pass,data={})=>{
 checks.push({name,pass,data});
 console.log((pass?'PASS':'FAIL')+' | '+name+' | '+JSON.stringify(data));
};
let server,browser;
try{
 server=await createServer({root:path.join(process.cwd(),'scripts','dice-prototype'),
  configFile:false,server:{host:'127.0.0.1',port:0},logLevel:'warn'});
 await server.listen();
 browser=await chromium.launch({channel:'chrome',headless:true,args:[
  '--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader',
  '--disable-dev-shm-usage','--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1250,height:950}});
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.httpServer.address().port+'/phase3-10.html');
 await page.getByRole('button',{name:'Effects & performance'}).click();
 await page.getByRole('combobox',{name:'Graphics quality'}).selectOption('balanced');
 await page.getByRole('combobox',{name:'Critical roll effects'}).selectOption('full');
 await page.getByRole('combobox',{name:'Elemental effects'}).selectOption('fire');
 await page.getByRole('combobox',{name:'Element effect intensity'}).selectOption('full');
 await page.getByRole('combobox',{name:'Sound pack'}).selectOption('metal');
 await page.getByRole('combobox',{name:'Impact volume'}).selectOption('low');
 await page.waitForFunction(()=>document.querySelector('[data-graphics-tier=balanced]'),null,{timeout:30000});
 check('Quality setting reaches real renderer',await page.locator('[data-graphics-tier=balanced]').count()===1);
 check('Controls are cosmetic: zero official rolls',await page.evaluate(()=>
  window.phase310Metrics.serverRollRequests)===0);
 await page.waitForFunction(()=>document.querySelector('[data-roll-state=ready]'),null,{timeout:95000});
 await page.click('#critical-success');
 await page.waitForFunction(()=>['settled','mismatch','unavailable'].includes(
  document.querySelector('[data-roll-state]')?.dataset.rollState),null,{timeout:130000});
 let state=await page.evaluate(()=>({
  status:document.querySelector('[data-roll-state]')?.dataset.rollState,
  value:document.querySelector('.asteria-advanced-dice-official strong')?.textContent,
  fx:document.querySelector('.asteria-dice-outcome-fx')?.dataset.criticalEffect,
  element:document.querySelector('.asteria-dice-outcome-fx')?.dataset.elementEffect,
  sparks:document.querySelectorAll('.asteria-dice-outcome-spark').length
 }));
 check('Natural 20 confirms face then shows full Fire success effect',
  state.status==='settled'&&state.value==='25'&&state.fx==='success'&&
  state.element==='fire'&&state.sparks>0,state);
 await page.screenshot({path:(await fs.mkdir(output,{recursive:true}),path.join(output,'critical-20.png')),fullPage:true});
 await page.getByRole('button',{name:'Clear tray'}).click();
 await page.waitForFunction(()=>document.querySelector('[data-roll-state=ready]'),null,{timeout:25000});
 await page.click('#critical-failure');
 await page.waitForFunction(()=>['settled','mismatch','unavailable'].includes(
  document.querySelector('[data-roll-state]')?.dataset.rollState),null,{timeout:130000});
 state=await page.evaluate(()=>({
  status:document.querySelector('[data-roll-state]')?.dataset.rollState,
  value:document.querySelector('.asteria-advanced-dice-official strong')?.textContent,
  fx:document.querySelector('.asteria-dice-outcome-fx')?.dataset.criticalEffect
 }));
 check('Natural 1 confirms face then shows failure effect',
  state.status==='settled'&&state.value==='6'&&state.fx==='failure',state);
 await page.getByRole('checkbox',{name:'Mute dice sounds'}).check();
 check('Mute persists in local device settings',
  await page.evaluate(()=>JSON.parse(localStorage.getItem('asteria:dice:presentation:v1')).muted)===true);
 const before=await page.evaluate(()=>window.phase310Metrics.serverRollRequests);
 await page.getByRole('combobox',{name:'Reduced motion'}).selectOption('on');
 await page.waitForFunction(()=>document.querySelector('[data-reduced-motion=true]')&&
  document.querySelector('[data-roll-state=paused]'),null,{timeout:25000});
 check('Reduced motion keeps official roll readable, hides GPU effects',
  await page.locator('.asteria-advanced-dice-official strong').textContent()==='6'&&
  await page.locator('.asteria-dice-outcome-fx').count()===0);
 check('Settings never request an extra roll',await page.evaluate(()=>
  window.phase310Metrics.serverRollRequests)===before);
 await page.getByRole('combobox',{name:'Graphics quality'}).selectOption('performance');
 check('Performance tier applies',await page.locator('[data-graphics-tier=performance]').count()===1);
 await page.setViewportSize({width:390,height:820});
 const size=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
 check('Mobile controls have no horizontal overflow',size.scroll<=size.width+1,size);
 await page.screenshot({path:path.join(output,'mobile-accessible.png'),fullPage:true});
 check('No browser errors',errors.length===0,{errors});
}catch(error){
 console.error('FATAL '+String(error?.stack||error));
 checks.push({name:'Browser fatal',pass:false,error:String(error)});
}finally{
 await browser?.close().catch(()=>{});await server?.close().catch(()=>{});
 await fs.mkdir(output,{recursive:true});
 await fs.writeFile(path.join(output,'report.json'),JSON.stringify(checks,null,2));
}
const failed=checks.filter(x=>!x.pass).length;
console.log('PHASE 3.10 BROWSER SUMMARY '+JSON.stringify({passed:checks.length-failed,failed}));
if(failed)process.exitCode=1;
