import fs from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'vite';
import {chromium} from 'playwright';
const output=path.join(process.cwd(),'dice-phase4-evidence');
const checks=[],errors=[];
const check=(name,passed,details={})=>{
 checks.push({name,passed,details});
 console.log((passed?'PASS':'FAIL')+' | '+name+' | '+JSON.stringify(details));
};
let server,browser;
try{
 server=await createServer({
  root:path.join(process.cwd(),'scripts','dice-prototype'),
  configFile:false,server:{host:'127.0.0.1',port:0},logLevel:'warn'
 });
 await server.listen();
 browser=await chromium.launch({channel:'chrome',headless:true,
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader',
   '--disable-dev-shm-usage','--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1200,height:850}});
 page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(()=>{
  localStorage.setItem('asteria:dice:presentation:v1',JSON.stringify({
   version:1,graphics:'performance',effects:'off',criticalEffects:'off',
   element:'none',soundPack:'auto',volume:'medium',muted:true,
   reducedMotion:'on'
  }));
 });
 await page.goto('http://127.0.0.1:'+server.httpServer.address().port+'/phase4.html');
 await page.locator('[data-dice-window-version="4"]').waitFor();
 check('Phase 4 replaces stacked panels with one full-window 3D stage',
  await page.locator('.asteria-dice-window-surface .asteria-advanced-dice-stage').count()===1 &&
  await page.locator('.asteria-advanced-dice-grid').count()===0);
 check('All side panels are closed by default',
  await page.locator('.asteria-dice-window-drawer').count()===0);
 await page.getByRole('button',{name:'Open dice selection'}).click();
 await page.getByRole('button',{name:'Add d6'}).click();
 const expression=await page.locator('.asteria-dice-window-expression span').textContent();
 check('Left tab adds dice without reloading the 3D stage',expression?.includes('1d20')&&
  expression?.includes('1d6'),{expression});
 await page.getByRole('textbox',{name:'Preset name'}).fill('Phase 4 quick roll');
 await page.getByRole('button',{name:'Save',exact:true}).click();
 await page.locator('.asteria-advanced-dice-presets li').filter({hasText:'Phase 4 quick roll'}).waitFor();
 check('Existing server-backed presets remain available',
  await page.locator('.asteria-advanced-dice-presets li').filter({hasText:'Phase 4 quick roll'}).count()===1);
 await page.getByRole('button',{name:'Close dice selection'}).click();
 await page.getByRole('button',{name:'Roll All'}).click();
 await page.waitForFunction(()=>window.phase4Metrics.serverRollRequests===1);
 await page.waitForFunction(()=>document.querySelector('.asteria-dice-window-result strong')?.textContent==='20');
 check('Roll All requests a server result and displays its total',
  await page.locator('.asteria-dice-window-result strong').textContent()==='20');
 await page.getByRole('button',{name:'Open roll history'}).click();
 check('History is in a separate drawer',
  await page.locator('#asteria-dice-history').count()===1 &&
  await page.locator('.asteria-dice-window-history-list li').count()===1);
 await page.getByRole('button',{name:'Close roll history'}).click();
 await page.getByRole('button',{name:'Open dice customisation settings'}).click();
 await page.getByRole('tab',{name:'Effects & performance'}).click();
 await page.getByRole('combobox',{name:'Graphics quality'}).selectOption('balanced');
 check('Effects and performance are inside Settings and remain device-local',
  await page.evaluate(()=>JSON.parse(localStorage.getItem('asteria:dice:presentation:v1')).graphics)==='balanced');
 await page.getByRole('tab',{name:'Camera & controls'}).click();
 await page.getByRole('combobox',{name:'Camera preset'}).selectOption('top-down');
 await page.getByRole('combobox',{name:'Grab and flick sensitivity'}).selectOption('gentle');
 check('Camera preset and interaction speed persist',
  await page.evaluate(()=>{
   const x=JSON.parse(localStorage.getItem('asteria:dice:window:v1'));
   return x.cameraPreset==='top-down'&&x.interactionSpeed==='gentle';
  }));
 await page.getByRole('tab',{name:'Dice towers'}).click();
 await page.getByRole('combobox',{name:'Experimental tower'}).selectOption('tower-castle');
 check('Opt-in experimental towers show warning',await page.getByText(
  'Tower physics are experimental',{exact:false}).count()>0);
 await page.getByRole('combobox',{name:'Experimental tower'}).selectOption('off');
 await page.getByRole('button',{name:'Close customisation settings'}).click();
 await page.getByRole('button',{name:'Enter immersive dice mode'}).click();
 check('Immersive mode expands the existing window',
  await page.locator('.asteria-advanced-dice--workspace.asteria-dice-immersive').count()===1);
 await page.getByRole('button',{name:'Exit immersive dice mode'}).click();
 await page.getByRole('button',{name:'Open dice selection'}).click();
 await page.getByRole('combobox',{name:'Sharing mode'}).selectOption('shareable');
 check('GM share control is manual and does not publish private rolls',
  await page.getByRole('button',{name:'Copy result for players'}).count()===1 &&
  await page.evaluate(()=>window.phase4Metrics.serverRollRequests)===1);
 await page.getByRole('button',{name:'Close dice selection'}).click();
 await fs.mkdir(output,{recursive:true});
 await page.screenshot({path:path.join(output,'desktop.png')});
 await page.setViewportSize({width:390,height:820});
 const mobile=await page.evaluate(()=>({
  viewport:innerWidth,scroll:document.documentElement.scrollWidth,
  panel:document.querySelector('.asteria-advanced-dice--workspace').getBoundingClientRect().width,
  stage:document.querySelector('.asteria-advanced-dice-stage').getBoundingClientRect().width
 }));
 check('Mobile Dice Window has no horizontal overflow',
  mobile.scroll<=mobile.viewport+1&&mobile.stage<=mobile.panel+1,mobile);
 await page.screenshot({path:path.join(output,'mobile.png')});
 check('No browser errors and no extra official rolls',errors.length===0&&
  await page.evaluate(()=>window.phase4Metrics.serverRollRequests)===1,{errors});
}catch(error){
 console.error('FATAL '+String(error?.stack||error));
 checks.push({name:'Browser acceptance',passed:false,error:String(error)});
}finally{
 await browser?.close().catch(()=>{});
 await server?.close().catch(()=>{});
 await fs.mkdir(output,{recursive:true});
 await fs.writeFile(path.join(output,'report.json'),JSON.stringify(checks,null,2));
}
const failed=checks.filter(item=>!item.passed).length;
console.log('PHASE 4 BROWSER SUMMARY '+JSON.stringify({passed:checks.length-failed,failed}));
if(failed)process.exitCode=1;
