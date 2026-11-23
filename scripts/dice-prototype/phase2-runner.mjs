import fs from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'vite';
import {chromium} from 'playwright';

const output=path.join(process.cwd(),'dice-phase2-evidence');
const results=[],errors=[];
const check=(name,okay,detail={})=>{
  results.push({name,passed:okay,detail});
  console.log((okay?'PASS':'FAIL')+' | '+name+' | '+JSON.stringify(detail));
};
let server,browser;
try{
  server=await createServer({root:path.join(process.cwd(),'scripts','dice-prototype'),
    configFile:false,server:{host:'127.0.0.1',port:0},logLevel:'warn'});
  await server.listen();
  browser=await chromium.launch({channel:'chrome',headless:true,
    args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader',
      '--disable-dev-shm-usage','--no-sandbox']});
  const page=await browser.newPage({viewport:{width:1260,height:850}});
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:'+server.httpServer.address().port+'/phase2.html');
  await page.waitForFunction(()=>document.querySelector('[data-roll-state=ready]'));
  check('Asteria tray mounts in real React panel',await page.locator('.asteria-advanced-dice-scene canvas').count()===1);
  await page.click('#fixture-roll');
  await page.waitForFunction(()=>document.querySelector('[data-roll-state=settled]'),null,{timeout:120000});
  let state=await page.evaluate(()=>({
    result:document.querySelector('.asteria-advanced-dice-official strong')?.textContent,
    status:document.querySelector('.asteria-advanced-dice-tray-status')?.textContent,
    serverActions:window.phase2Metrics.serverActions
  }));
  check('Confirmed roll animates to server total',state.result==='22'&&state.serverActions===1,state);
  await fs.mkdir(output,{recursive:true});
  await page.screenshot({path:path.join(output,'desktop.png')});
  await page.getByRole('button',{name:'Replay last roll'}).click();
  await page.waitForFunction(()=>document.querySelector('[data-roll-state=settled]'),null,{timeout:120000});
  const replayed=await page.evaluate(()=>window.phase2Metrics);
  check('Replay never creates another server roll',replayed.serverActions===1&&replayed.replays===1,replayed);
  await page.getByRole('combobox',{name:'Dice tray size'}).selectOption('compact');
  const compact=await page.locator('.asteria-advanced-dice-stage').evaluate(n=>n.clientHeight);
  await page.getByRole('combobox',{name:'Dice tray size'}).selectOption('expanded');
  const expanded=await page.locator('.asteria-advanced-dice-stage').evaluate(n=>n.clientHeight);
  check('Three tray sizes change the scene dimensions',expanded>compact+80,{compact,expanded});
  await page.click('#fixture-narrow');
  await page.waitForTimeout(500);
  state=await page.evaluate(()=>{
    const box=document.querySelector('.asteria-advanced-dice-stage').getBoundingClientRect();
    const panel=document.querySelector('#fixture-panel').getBoundingClientRect();
    const canvas=document.querySelector('.asteria-advanced-dice-scene canvas').getBoundingClientRect();
    return {panel:panel.width,stage:box.width,canvas:canvas.width,
      content:document.querySelector('#fixture-panel').scrollWidth};
  });
  check('Resizable dashboard window contains the 3D canvas',
    state.stage<=state.panel+1 && state.canvas<=state.stage+1&&
    state.content<=state.panel+1,state);
  await page.getByRole('button',{name:'Clear tray'}).click();
  await page.waitForFunction(()=>document.querySelector('[data-roll-state=ready]'));
  const clearing=await page.evaluate(()=>({
    official:document.querySelector('.asteria-advanced-dice-official')?.textContent||'',
    savedActions:window.phase2Metrics.serverActions,
    replays:window.phase2Metrics.replays
  }));
  check('Clear tray removes only visible roll',!clearing.official && clearing.savedActions===1,clearing);
  await page.getByRole('button',{name:'Replay last roll'}).click();
  await page.waitForFunction(()=>document.querySelector('[data-roll-state=settled]'),{timeout:120000});
  check('Replay after clear restores the existing result',
    await page.locator('.asteria-advanced-dice-official strong').textContent()==='22');
  await page.getByRole('checkbox',{name:'Animate in 3D'}).uncheck();
  await page.waitForFunction(()=>document.querySelector('[data-roll-state=paused]'));
  check('Disabling 3D frees WebGL and leaves numerical results',
    await page.locator('.asteria-advanced-dice-scene canvas').count()===0 &&
    await page.locator('.asteria-advanced-dice-official strong').textContent()==='22');
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:path.join(output,'mobile.png')});
  state=await page.evaluate(()=>({
    width:document.documentElement.scrollWidth,screen:window.innerWidth,
    stage:document.querySelector('.asteria-advanced-dice-stage').getBoundingClientRect().width
  }));
  check('Mobile 390px has no horizontal overflow',state.width<=state.screen+1,state);
  check('No browser exceptions',errors.length===0,{errors});
}catch(error){
  console.error('FATAL '+String(error?.stack||error));
  results.push({name:'browser run',passed:false,detail:String(error)});
}finally{
  await browser?.close().catch(()=>{});
  await server?.close().catch(()=>{});
  await fs.mkdir(output,{recursive:true});
  await fs.writeFile(path.join(output,'report.json'),JSON.stringify(results,null,2));
}
const failures=results.filter(item=>!item.passed).length;
console.log('PHASE 2 SUMMARY '+JSON.stringify({passed:results.length-failures,failed:failures}));
if(failures)process.exitCode=1;
