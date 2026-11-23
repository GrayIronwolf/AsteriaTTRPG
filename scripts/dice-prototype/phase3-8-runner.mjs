import fs from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'vite';
import {chromium} from 'playwright';
const out=path.join(process.cwd(),'dice-phase3-8-evidence'),checks=[],errors=[];
const check=(name,pass,detail={})=>{
 checks.push({name,pass,detail});console.log((pass?'PASS':'FAIL')+' | '+name+' | '+JSON.stringify(detail));
};
let server,browser;
try{
 server=await createServer({root:path.join(process.cwd(),'scripts','dice-prototype'),
  configFile:false,server:{host:'127.0.0.1',port:0},logLevel:'warn'});
 await server.listen();
 browser=await chromium.launch({channel:'chrome',headless:true,args:[
  '--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader',
  '--disable-dev-shm-usage','--no-sandbox'
 ]});
 const page=await browser.newPage({viewport:{width:1250,height:900}});
 page.on('pageerror',err=>errors.push(err.message));
 await page.goto('http://127.0.0.1:'+server.httpServer.address().port+'/phase3-8.html');
 await page.waitForFunction(()=>document.querySelector('[data-roll-state=ready]'),null,{timeout:100000});
 check('Shared engine renders physical Castle mesh and physical tray',await page.evaluate(()=>
  document.querySelectorAll('canvas').length===1&&
  document.querySelector('.asteria-advanced-dice-scene').dataset.trayShape==='hexagon'));
 check('Tower is visibly labelled experimental',await page.getByRole('note').count()===1);
 for(const sides of [4,6,8,10,12,20,100]){
  await page.getByRole('button',{name:'Test d'+sides,exact:true}).click();
  await page.waitForFunction(()=>['settled','mismatch','unavailable'].includes(
   document.querySelector('[data-roll-state]')?.getAttribute('data-roll-state')),
   null,{timeout:115000});
  const report=await page.evaluate(()=>{
   const scene=document.querySelector('.asteria-advanced-dice-scene');
   return {state:document.querySelector('[data-roll-state]').getAttribute('data-roll-state'),
    total:document.querySelector('.asteria-advanced-dice-official strong')?.textContent,
    towerSteps:scene.dataset.towerSteps||'',exited:scene.dataset.towerExited||'',
    physicalExit:scene.dataset.towerExitComplete||'',rest:scene.dataset.towerLastEnd||'',
    baffles:scene.dataset.towerBaffles||'',faceMatch:scene.dataset.towerFaceMatch||'',
    observed:scene.dataset.towerObserved||'',error:scene.dataset.towerError||'',
    engineError:scene.dataset.watcherError||''};
  });
  check('Castle d'+sides+' is physical, exits and preserves official outcome',
   report.state==='settled'&&report.physicalExit==='true'&&Number(report.exited)>=1&&
   Number(report.towerSteps)>=60&&Number(report.total)===sides+5,report);
  await page.getByRole('button',{name:'Clear tray'}).click();
  await page.waitForFunction(()=>document.querySelector('[data-roll-state=ready]'),null,{timeout:18000});
 }
 check('No extra server roll requested by tower preview or camera',
  await page.evaluate(()=>window.phase38Metrics.rollRequests)===7);
 await fs.mkdir(out,{recursive:true});
 await page.screenshot({path:path.join(out,'castle-desktop.png'),fullPage:true});
 await page.click('#resize');await page.waitForTimeout(400);
 const narrow=await page.evaluate(()=>{const el=document.querySelector('.asteria-advanced-dice');
  return {width:el.clientWidth,scroll:el.scrollWidth};});
 check('Resizable canvas retains tower without horizontal overflow',narrow.scroll<=narrow.width+1,narrow);
 await page.setViewportSize({width:390,height:800});
 const mobile=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
 check('Mobile viewport width',mobile.scroll<=mobile.width+1,mobile);
 await page.screenshot({path:path.join(out,'castle-mobile.png'),fullPage:true});
 await page.getByRole('checkbox',{name:'Animate in 3D'}).uncheck();
 check('Reduced mode pauses tower without altering server record',
  await page.locator('[data-roll-state=paused]').count()===1);
 check('Browser exceptions',errors.length===0,{errors});
}catch(error){
 console.error('FATAL '+String(error?.stack||error));
 checks.push({name:'Browser test fatal',pass:false,error:String(error)});
}finally{
 await browser?.close().catch(()=>{});await server?.close().catch(()=>{});
 await fs.mkdir(out,{recursive:true});await fs.writeFile(path.join(out,'report.json'),JSON.stringify(checks,null,2));
}
const failed=checks.filter(x=>!x.pass).length;
console.log('PHASE 3.8 CASTLE FEASIBILITY SUMMARY '+JSON.stringify({pass:checks.length-failed,failed}));
if(failed)process.exitCode=1;
